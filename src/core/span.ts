/**
 * Span implementation for the Noveum Trace SDK
 */

import type { ISpan, ITrace } from './interfaces.js';
import type { Attributes, SpanOptions, TraceEvent, SerializedSpan, SpanLink } from './types.js';
import { SpanKind, SpanStatus } from './types.js';
import { generateSpanId, sanitizeAttributes, extractErrorInfo } from '../utils/index.js';

/**
 * Implementation of a span - represents a single operation within a trace
 */
export class Span implements ISpan {
  private readonly _spanId: string;
  private readonly _traceId: string;
  private readonly _parentSpanId: string | undefined;
  private readonly _name: string;
  private readonly _kind: SpanKind;
  private readonly _startTime: Date;
  private readonly _links: SpanLink[];
  private readonly _trace: ITrace;

  private _endTime?: Date;
  private _status: SpanStatus = SpanStatus.UNSET;
  private _statusMessage: string | undefined;
  private _attributes: Attributes = {};
  private _events: TraceEvent[] = [];
  private _isFinished = false;

  constructor(trace: ITrace, name: string, options: SpanOptions = {}) {
    this._trace = trace;
    this._spanId = generateSpanId();
    this._traceId = trace.traceId;
    this._parentSpanId = options.parentSpanId;
    this._name = name;
    this._kind = options.kind ?? SpanKind.INTERNAL;
    this._startTime = options.startTime ?? new Date();
    this._links = options.links ?? [];

    if (options.attributes) {
      this._attributes = sanitizeAttributes(options.attributes);
    }
  }

  get spanId(): string {
    return this._spanId;
  }

  get traceId(): string {
    return this._traceId;
  }

  get parentSpanId(): string | undefined {
    return this._parentSpanId;
  }

  get name(): string {
    return this._name;
  }

  get kind(): SpanKind {
    return this._kind;
  }

  get startTime(): Date {
    return this._startTime;
  }

  get endTime(): Date | undefined {
    return this._endTime;
  }

  get isFinished(): boolean {
    return this._isFinished;
  }

  get status(): SpanStatus {
    return this._status;
  }

  get statusMessage(): string | undefined {
    return this._statusMessage;
  }

  get attributes(): Readonly<Attributes> {
    return { ...this._attributes };
  }

  get events(): readonly TraceEvent[] {
    return [...this._events];
  }

  setAttributes(attributes: Attributes): void {
    if (this._isFinished) {
      console.warn('Cannot set attributes on a finished span');
      return;
    }

    const sanitized = sanitizeAttributes(attributes);
    this._attributes = { ...this._attributes, ...sanitized };
  }

  setAttribute(key: string, value: Attributes[string]): void {
    if (this._isFinished) {
      console.warn('Cannot set attribute on a finished span');
      return;
    }

    const sanitized = sanitizeAttributes({ [key]: value });
    if (sanitized[key] !== undefined) {
      this._attributes[key] = sanitized[key];
    }
  }

  addEvent(name: string, attributes?: Attributes): void {
    if (this._isFinished) {
      console.warn('Cannot add event to a finished span');
      return;
    }

    const event: TraceEvent = {
      name,
      timestamp: new Date().toISOString(),
      attributes: attributes ? sanitizeAttributes(attributes) : undefined,
    };

    this._events.push(event);
  }

  setStatus(status: SpanStatus, message?: string): void {
    if (this._isFinished) {
      console.warn('Cannot set status on a finished span');
      return;
    }

    this._status = status;
    this._statusMessage = message;
  }

  recordException(exception: Error | string): void {
    if (this._isFinished) {
      console.warn('Cannot record exception on a finished span');
      return;
    }

    const errorInfo =
      typeof exception === 'string'
        ? { message: exception, name: 'Exception' }
        : extractErrorInfo(exception);

    this.addEvent('exception', {
      'exception.type': errorInfo.name,
      'exception.message': errorInfo.message,
      'exception.stacktrace': errorInfo.stack,
    });

    // Automatically set span status to ERROR
    if (this._status === SpanStatus.UNSET) {
      this.setStatus(SpanStatus.ERROR, errorInfo.message);
    }
  }

  async finish(endTime?: Date): Promise<void> {
    if (this._isFinished) {
      console.warn('Span is already finished');
      return;
    }

    this._endTime = endTime ?? new Date();
    this._isFinished = true;

    // If status is still UNSET, set it to OK
    if (this._status === SpanStatus.UNSET) {
      this._status = SpanStatus.OK;
    }

    // Calculate duration and add as attribute
    const duration = this._endTime.getTime() - this._startTime.getTime();
    this.setAttribute('duration_ms', duration);

    // Notify the trace that this span has finished
    // This allows the trace to potentially flush or perform cleanup
    try {
      await this._notifyTraceSpanFinished();
    } catch (error) {
      console.warn('Error notifying trace of span completion:', error);
    }
  }

  serialize(): SerializedSpan {
    return {
      traceId: this._traceId,
      spanId: this._spanId,
      parentSpanId: this._parentSpanId,
      name: this._name,
      kind: this._kind,
      startTime: this._startTime.toISOString(),
      endTime: this._endTime?.toISOString(),
      status: this._status,
      statusMessage: this._statusMessage,
      attributes: { ...this._attributes },
      events: this._events.map(event => ({
        ...event,
        timestamp: event.timestamp,
      })),
      links: [...this._links],
    };
  }

  /**
   * Create a child span
   */
  async startChildSpan(
    name: string,
    options: Omit<SpanOptions, 'parentSpanId'> = {}
  ): Promise<ISpan> {
    return this._trace.startSpan(name, {
      ...options,
      parentSpanId: this._spanId,
    });
  }

  /**
   * Run a function within the context of this span
   */
  async withSpan<T>(fn: () => Promise<T>): Promise<T> {
    try {
      const result = await fn();

      // If the function completed successfully and status is still UNSET, set to OK
      if (this._status === SpanStatus.UNSET) {
        this.setStatus(SpanStatus.OK);
      }

      return result;
    } catch (error) {
      // Record the exception and set error status
      this.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Run a synchronous function within the context of this span
   */
  withSpanSync<T>(fn: () => T): T {
    try {
      const result = fn();

      // If the function completed successfully and status is still UNSET, set to OK
      if (this._status === SpanStatus.UNSET) {
        this.setStatus(SpanStatus.OK);
      }

      return result;
    } catch (error) {
      // Record the exception and set error status
      this.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private async _notifyTraceSpanFinished(): Promise<void> {
    // This method can be used to notify the parent trace
    // that this span has finished, allowing for cleanup or flushing
    // The implementation depends on the trace's internal structure
  }

  /**
   * Get the duration of the span in milliseconds
   */
  getDuration(): number | undefined {
    if (!this._endTime) {
      return undefined;
    }
    return this._endTime.getTime() - this._startTime.getTime();
  }

  /**
   * Check if this span is a root span (has no parent)
   */
  isRootSpan(): boolean {
    return this._parentSpanId === undefined;
  }

  /**
   * Get a string representation of the span for debugging
   */
  toString(): string {
    const duration = this.getDuration();
    const durationStr = duration !== undefined ? `${duration}ms` : 'ongoing';

    return `Span(${this._name}, ${this._spanId}, ${this._status}, ${durationStr})`;
  }
}
