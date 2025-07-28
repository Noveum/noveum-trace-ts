/**
 * Trace implementation for the Noveum Trace SDK
 */

import type {
  ITrace,
  ISpan,
  ITransport,
} from './interfaces.js';
import type {
  Attributes,
  SpanOptions,
  TraceEvent,
  TraceLevel,
  TraceOptions,
  SerializedTrace,
} from './types.js';
import {
  generateTraceId,
  sanitizeAttributes,
  getCurrentTimestamp,
} from '../utils/index.js';
import { Span } from './span.js';

/**
 * Implementation of a trace - represents a complete tracing session
 */
export class Trace implements ITrace {
  private readonly _traceId: string;
  private readonly _name: string;
  private readonly _level: TraceLevel;
  private readonly _startTime: Date;
  private readonly _transport?: ITransport;

  private _endTime?: Date;
  private _attributes: Attributes = {};
  private _events: TraceEvent[] = [];
  private _spans: ISpan[] = [];
  private _isFinished = false;
  private _activeSpan?: ISpan;

  constructor(
    name: string,
    options: TraceOptions = {},
    transport?: ITransport
  ) {
    this._traceId = generateTraceId();
    this._name = name;
    this._level = options.level ?? TraceLevel.INFO;
    this._startTime = options.startTime ?? new Date();
    this._transport = transport;

    if (options.attributes) {
      this._attributes = sanitizeAttributes(options.attributes);
    }
  }

  get traceId(): string {
    return this._traceId;
  }

  get name(): string {
    return this._name;
  }

  get level(): TraceLevel {
    return this._level;
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

  get spans(): readonly ISpan[] {
    return [...this._spans];
  }

  get attributes(): Readonly<Attributes> {
    return { ...this._attributes };
  }

  get events(): readonly TraceEvent[] {
    return [...this._events];
  }

  get activeSpan(): ISpan | undefined {
    return this._activeSpan;
  }

  async startSpan(name: string, options: SpanOptions = {}): Promise<ISpan> {
    if (this._isFinished) {
      throw new Error('Cannot start span on a finished trace');
    }

    // If no parent span ID is specified and we have an active span, use it as parent
    if (!options.parentSpanId && this._activeSpan && !this._activeSpan.isFinished) {
      options.parentSpanId = this._activeSpan.spanId;
    }

    const span = new Span(this, name, options);
    this._spans.push(span);
    this._activeSpan = span;

    return span;
  }

  setAttributes(attributes: Attributes): void {
    if (this._isFinished) {
      console.warn('Cannot set attributes on a finished trace');
      return;
    }

    const sanitized = sanitizeAttributes(attributes);
    this._attributes = { ...this._attributes, ...sanitized };
  }

  setAttribute(key: string, value: Attributes[string]): void {
    if (this._isFinished) {
      console.warn('Cannot set attribute on a finished trace');
      return;
    }

    const sanitized = sanitizeAttributes({ [key]: value });
    if (sanitized[key] !== undefined) {
      this._attributes[key] = sanitized[key];
    }
  }

  addEvent(name: string, attributes?: Attributes): void {
    if (this._isFinished) {
      console.warn('Cannot add event to a finished trace');
      return;
    }

    const event: TraceEvent = {
      name,
      timestamp: new Date(),
      attributes: attributes ? sanitizeAttributes(attributes) : undefined,
    };

    this._events.push(event);
  }

  async finish(endTime?: Date): Promise<void> {
    if (this._isFinished) {
      console.warn('Trace is already finished');
      return;
    }

    this._endTime = endTime ?? new Date();

    // Finish any unfinished spans
    const unfinishedSpans = this._spans.filter(span => !span.isFinished);
    if (unfinishedSpans.length > 0) {
      console.warn(`Finishing trace with ${unfinishedSpans.length} unfinished spans`);
      
      // Finish all unfinished spans
      await Promise.all(
        unfinishedSpans.map(span => span.finish(this._endTime))
      );
    }

    this._isFinished = true;

    // Calculate total duration and add as attribute
    const duration = this._endTime.getTime() - this._startTime.getTime();
    this.setAttribute('duration_ms', duration);
    this.setAttribute('span_count', this._spans.length);

    // Send the trace data if transport is available
    if (this._transport) {
      try {
        await this._sendToTransport();
      } catch (error) {
        console.error('Failed to send trace data:', error);
      }
    }
  }

  serialize(): SerializedTrace {
    return {
      traceId: this._traceId,
      name: this._name,
      startTime: this._startTime.toISOString(),
      endTime: this._endTime?.toISOString(),
      level: this._level,
      attributes: { ...this._attributes },
      events: this._events.map(event => ({
        ...event,
        timestamp: event.timestamp,
      })),
      spans: this._spans.map(span => span.serialize()),
    };
  }

  /**
   * Get the root span (span with no parent)
   */
  getRootSpan(): ISpan | undefined {
    return this._spans.find(span => span.parentSpanId === undefined);
  }

  /**
   * Get all child spans of a given span
   */
  getChildSpans(parentSpanId: string): ISpan[] {
    return this._spans.filter(span => span.parentSpanId === parentSpanId);
  }

  /**
   * Get span by ID
   */
  getSpan(spanId: string): ISpan | undefined {
    return this._spans.find(span => span.spanId === spanId);
  }

  /**
   * Get the duration of the trace in milliseconds
   */
  getDuration(): number | undefined {
    if (!this._endTime) {
      return undefined;
    }
    return this._endTime.getTime() - this._startTime.getTime();
  }

  /**
   * Get trace statistics
   */
  getStats(): {
    spanCount: number;
    finishedSpanCount: number;
    errorSpanCount: number;
    duration?: number;
  } {
    const finishedSpans = this._spans.filter(span => span.isFinished);
    const errorSpans = this._spans.filter(span => span.status === 'ERROR');

    return {
      spanCount: this._spans.length,
      finishedSpanCount: finishedSpans.length,
      errorSpanCount: errorSpans.length,
      duration: this.getDuration(),
    };
  }

  /**
   * Run a function within the context of this trace
   */
  async withTrace<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      // Add error event to trace
      this.addEvent('error', {
        'error.type': error instanceof Error ? error.name : 'Unknown',
        'error.message': error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Run a synchronous function within the context of this trace
   */
  withTraceSync<T>(fn: () => T): T {
    try {
      return fn();
    } catch (error) {
      // Add error event to trace
      this.addEvent('error', {
        'error.type': error instanceof Error ? error.name : 'Unknown',
        'error.message': error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create a child trace (for distributed tracing scenarios)
   */
  createChildTrace(name: string, options: Omit<TraceOptions, 'parentTraceId'> = {}): Trace {
    return new Trace(name, {
      ...options,
      parentTraceId: this._traceId,
    }, this._transport);
  }

  private async _sendToTransport(): Promise<void> {
    if (!this._transport) {
      return;
    }

    const batch = {
      traces: [this.serialize()],
      metadata: {
        project: 'default', // This should come from client configuration
        environment: 'development', // This should come from client configuration
        timestamp: getCurrentTimestamp(),
        sdkVersion: '0.1.0', // This should come from package.json
      },
    };

    await this._transport.send(batch);
  }

  /**
   * Get a string representation of the trace for debugging
   */
  toString(): string {
    const duration = this.getDuration();
    const durationStr = duration !== undefined ? `${duration}ms` : 'ongoing';
    const stats = this.getStats();
    
    return `Trace(${this._name}, ${this._traceId}, ${stats.spanCount} spans, ${durationStr})`;
  }

  /**
   * Export trace data in a format suitable for external tools
   */
  export(): {
    trace: SerializedTrace;
    stats: {
      spanCount: number;
      finishedSpanCount: number;
      errorSpanCount: number;
      duration: number | null;
    };
  } {
    return {
      trace: this.serialize(),
      stats: this.getStats(),
    };
  }
}

