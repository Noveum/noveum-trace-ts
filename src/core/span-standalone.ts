/**
 * Standalone Span implementation for the Noveum Trace SDK
 * This version doesn't require a trace object
 */

import type { ISpan } from './interfaces.js';
import type {
  Attributes,
  SpanOptions,
  TraceEvent,
  SerializedSpan,
  SerializedEvent,
  SpanLink,
} from './types.js';
import { SpanKind, SpanStatus } from './types.js';
import { sanitizeAttributes, extractErrorInfo, generateSpanId } from '../utils/index.js';

interface ExtendedSpanOptions extends SpanOptions {
  traceId: string;
  client?: any;
  enabled?: boolean;
}

/**
 * Implementation of a span - represents a single operation within a trace
 */
export class StandaloneSpan implements ISpan {
  private readonly _spanId: string;
  private readonly _traceId: string;
  private readonly _parentSpanId: string | undefined;
  private readonly _name: string;
  private readonly _kind: SpanKind;
  private readonly _startTime: Date;
  private readonly _links: SpanLink[];
  private readonly _client?: any;
  private readonly _enabled: boolean;

  private _endTime: Date | undefined;
  private _status: SpanStatus = SpanStatus.UNSET;
  private _statusMessage: string | undefined;
  private _attributes: Attributes = {};
  private _events: TraceEvent[] = [];
  private _isFinished = false;

  constructor(spanId: string, name: string, options: ExtendedSpanOptions) {
    this._spanId = spanId;
    this._traceId = options.traceId;
    this._parentSpanId = options.parentSpanId;
    this._name = name;
    this._kind = options.kind ?? SpanKind.INTERNAL;
    this._startTime = options.startTime ?? new Date();
    this._links = options.links ?? [];
    this._client = options.client;
    this._enabled = options.enabled !== false;

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

  get startTime(): Date {
    return this._startTime;
  }

  get endTime(): Date | undefined {
    return this._endTime;
  }

  get isFinished(): boolean {
    return this._isFinished;
  }

  get kind(): SpanKind {
    return this._kind;
  }

  get status(): SpanStatus {
    return this._status;
  }

  get statusMessage(): string | undefined {
    return this._statusMessage;
  }

  get attributes(): Attributes {
    return { ...this._attributes };
  }

  get events(): TraceEvent[] {
    return [...this._events];
  }

  /**
   * Set multiple attributes on the span
   */
  setAttributes(attributes: Attributes): void {
    if (this._isFinished) {
      console.warn('Cannot set attributes on a finished span');
      return;
    }

    this._attributes = {
      ...this._attributes,
      ...sanitizeAttributes(attributes),
    };
  }

  /**
   * Set a single attribute on the span
   */
  setAttribute(key: string, value: Attributes[string]): void {
    if (this._isFinished) {
      console.warn('Cannot set attribute on a finished span');
      return;
    }

    const sanitized = sanitizeAttributes({ [key]: value });
    if (sanitized[key] !== undefined) {
      this._attributes[key] = sanitized[key]!;
    }
  }

  /**
   * Add an event to the span
   */
  addEvent(name: string, attributes?: Attributes): void {
    if (this._isFinished) {
      console.warn('Cannot add event to a finished span');
      return;
    }

    const event: TraceEvent = {
      name,
      timestamp: new Date().toISOString(),
      attributes: attributes ? sanitizeAttributes(attributes) : {},
    };
    this._events.push(event);
  }

  /**
   * Set the status of the span
   */
  setStatus(status: SpanStatus, message?: string): void {
    if (this._isFinished) {
      console.warn('Cannot set status on a finished span');
      return;
    }

    this._status = status;
    this._statusMessage = message;

    // Automatically set error attribute if status is ERROR
    if (status === SpanStatus.ERROR && message) {
      this.setAttribute('error', true);
      this.setAttribute('error.message', message);
    }
  }

  /**
   * Record an exception on the span
   */
  recordException(error: Error | unknown): void {
    const errorInfo = extractErrorInfo(error);

    this.setStatus(SpanStatus.ERROR, errorInfo.message);
    const eventAttributes: Attributes = {
      'exception.type': errorInfo.name,
      'exception.message': errorInfo.message,
    };
    if (errorInfo.stack) {
      eventAttributes['exception.stacktrace'] = errorInfo.stack;
    }
    this.addEvent('exception', eventAttributes);
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
   * Create a child span
   */
  async startChildSpan(
    name: string,
    options?: Partial<ExtendedSpanOptions>
  ): Promise<StandaloneSpan> {
    const childOptions: ExtendedSpanOptions = {
      ...options,
      traceId: this._traceId,
      parentSpanId: this._spanId,
      client: this._client,
      enabled: this._enabled,
    };

    const childSpan = new StandaloneSpan(generateSpanId(), name, childOptions);

    return childSpan;
  }

  /**
   * Run a function within this span's context
   */
  async withSpan<T>(fn: () => T | Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      this.recordException(error);
      throw error;
    } finally {
      await this.finish();
    }
  }

  /**
   * Finish the span
   */
  async finish(endTime?: Date): Promise<void> {
    if (this._isFinished) {
      console.warn('Span is already finished');
      return;
    }

    this._endTime = endTime ?? new Date();

    // Set status to OK if not already set to an error status
    if (this._status === SpanStatus.UNSET) {
      this._status = SpanStatus.OK;
    }

    // Calculate duration before marking as finished
    const duration = this._endTime.getTime() - this._startTime.getTime();
    this.setAttribute('duration.ms', duration);

    // Now mark as finished
    this._isFinished = true;

    // Notify client that this span has finished
    if (this._client && this._enabled && '_addFinishedSpan' in this._client) {
      try {
        this._client._addFinishedSpan(this);
      } catch (error) {
        if (this._client && this._client._config && this._client._config.debug) {
          console.error('[Noveum] Error notifying client of finished span:', error);
        }
        // Continue execution - don't let client errors break span finishing
      }
    }
  }

  /**
   * Check if this span is a root span (has no parent)
   */
  isRootSpan(): boolean {
    return !this._parentSpanId;
  }

  /**
   * Serialize the span for transport
   */
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
      events: this._events.map(
        event =>
          ({
            name: event.name,
            timestamp: event.timestamp,
            attributes: event.attributes,
          }) as SerializedEvent
      ),
      links: this._links,
    };
  }
}
