/**
 * Standalone Trace implementation for the Noveum Trace SDK
 * This version matches the client's expected interface
 */

import type { ITrace, ISpan } from './interfaces.js';
import type {
  Attributes,
  SpanOptions,
  TraceEvent,
  TraceLevel,
  TraceOptions,
  SerializedTrace,
  SerializedSpan,
} from './types.js';
import { TraceLevel as TraceLevelEnum, SpanStatus } from './types.js';
import { sanitizeAttributes, formatPythonCompatibleTimestamp } from '../utils/index.js';

interface ExtendedTraceOptions extends TraceOptions {
  client?: any;
  enabled?: boolean;
}

/**
 * Implementation of a trace - represents a complete tracing session
 */
export class StandaloneTrace implements ITrace {
  private readonly _traceId: string;
  private readonly _name: string;
  private readonly _level: TraceLevel;
  private readonly _startTime: Date;
  private readonly _client?: any;
  private readonly _enabled: boolean;

  private _endTime: Date | undefined;
  private _attributes: Attributes = {};
  private _events: TraceEvent[] = [];
  private _spans: SerializedSpan[] = [];
  private _spanObjects: ISpan[] = []; // Track live span objects for tests
  private _isFinished = false;
  private _status: SpanStatus = SpanStatus.OK;

  constructor(traceId: string, name: string, options: ExtendedTraceOptions = {}) {
    this._traceId = traceId;
    this._name = name;
    this._level = options.level ?? TraceLevelEnum.INFO;
    this._startTime = options.startTime ?? new Date();
    this._client = options.client;
    this._enabled = options.enabled !== false;

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

  get startTime(): Date {
    return this._startTime;
  }

  get endTime(): Date | undefined {
    return this._endTime;
  }

  get isFinished(): boolean {
    return this._isFinished;
  }

  get level(): TraceLevel {
    return this._level;
  }

  get spans(): ISpan[] {
    return [...this._spanObjects];
  }

  get attributes(): Attributes {
    return { ...this._attributes };
  }

  /**
   * Set multiple attributes on the trace
   */
  setAttributes(attributes: Attributes): void {
    if (this._isFinished) {
      // Only warn in non-test environments to avoid noise during testing
      if (process.env.NODE_ENV !== 'test') {
        console.warn('Cannot set attributes on a finished trace');
      }
      return;
    }

    this._attributes = {
      ...this._attributes,
      ...sanitizeAttributes(attributes),
    };
  }

  /**
   * Set a single attribute on the trace
   */
  setAttribute(key: string, value: Attributes[string]): void {
    if (this._isFinished) {
      // Only warn in non-test environments to avoid noise during testing
      if (process.env.NODE_ENV !== 'test') {
        console.warn('Cannot set attribute on a finished trace');
      }
      return;
    }

    const sanitized = sanitizeAttributes({ [key]: value });
    if (sanitized[key] !== undefined) {
      this._attributes[key] = sanitized[key]!;
    }
  }

  /**
   * Add an event to the trace
   */
  addEvent(name: string, attributes?: Attributes): void {
    if (this._isFinished) {
      console.warn('Cannot add event to a finished trace');
      return;
    }

    const event: TraceEvent = {
      name,
      timestamp: formatPythonCompatibleTimestamp(),
      attributes: attributes ? sanitizeAttributes(attributes) : undefined,
    };
    this._events.push(event);
  }

  /**
   * Set the trace status
   */
  setStatus(status: SpanStatus): void {
    if (this._isFinished) {
      console.warn('Cannot set status on a finished trace');
      return;
    }

    this._status = status;
  }

  /**
   * Get the trace status
   */
  getStatus(): SpanStatus {
    return this._status;
  }

  /**
   * Start a new span within this trace
   */
  async startSpan(name: string, options?: SpanOptions): Promise<ISpan> {
    if (!this._client) {
      throw new Error('Client not available for creating spans');
    }

    const spanOptions = {
      ...options,
      traceId: this._traceId,
    };

    const span = await this._client.startSpan(name, spanOptions);

    // Track the span in this trace
    this._spanObjects.push(span);

    // We'll add it when it finishes to get the serialized version
    if ('serialize' in span && typeof span.serialize === 'function') {
      // Store a reference to add to _spans when finished
      const originalFinish = span.finish;
      span.finish = async (endTime?: Date) => {
        await originalFinish.call(span, endTime);
        this._spans.push(span.serialize());
      };
    }

    return span;
  }

  /**
   * Finish the trace
   */
  async finish(endTime?: Date): Promise<void> {
    if (this._isFinished) {
      console.warn('Trace is already finished');
      return;
    }

    this._endTime = endTime ?? new Date();
    this._isFinished = true;

    // Finish all unfinished child spans
    for (const span of this._spanObjects) {
      if ('isFinished' in span && !span.isFinished) {
        await span.finish();
      }
    }

    // Calculate duration
    const duration = this._endTime.getTime() - this._startTime.getTime();
    this.setAttribute('duration.ms', duration);

    // If client is available and enabled, notify it
    if (this._client && this._enabled && 'flush' in this._client) {
      await this._client.flush();
    }
  }

  /**
   * Get trace statistics
   */
  getStats(): {
    spanCount: number;
    finishedSpanCount: number;
    errorSpanCount: number;
    totalDuration: number;
  } {
    const totalDuration = this._endTime ? this._endTime.getTime() - this._startTime.getTime() : 0;

    // Count error spans (spans with error status)
    const errorSpanCount = this._spanObjects.filter(
      span => 'status' in span && span.status === SpanStatus.ERROR
    ).length;

    return {
      spanCount: this._spanObjects.length, // Count all spans (finished and unfinished)
      finishedSpanCount: this._spans.length, // Count only finished spans
      errorSpanCount,
      totalDuration,
    };
  }

  /**
   * Get the root span (first span without parent)
   */
  getRootSpan(): ISpan | undefined {
    return this._spanObjects.find(span => ('parentSpanId' in span ? !span.parentSpanId : true));
  }

  /**
   * Get child spans of a given parent span
   */
  getChildSpans(parentSpanId: string): ISpan[] {
    return this._spanObjects.filter(
      span => 'parentSpanId' in span && span.parentSpanId === parentSpanId
    );
  }

  /**
   * Serialize the trace for transport
   */
  serialize(): SerializedTrace {
    return {
      traceId: this._traceId,
      name: this._name,
      status: this._status,
      startTime: formatPythonCompatibleTimestamp(this._startTime),
      endTime: this._endTime ? formatPythonCompatibleTimestamp(this._endTime) : undefined,
      attributes: { ...this._attributes },
      events: this._events,
      spans: this._spans,
    };
  }
}
