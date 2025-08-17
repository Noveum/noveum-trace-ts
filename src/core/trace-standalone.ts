/**
 * Standalone Trace implementation for the Noveum Trace SDK
 * This version matches the Python SDK's trace structure and serialization format
 */

import type { ITrace, ISpan } from './interfaces.js';
import type {
  Attributes,
  SpanOptions,
  TraceEvent,
  TraceLevel,
  TraceOptions,
  SerializedTrace,
} from './types.js';
import { TraceLevel as TraceLevelEnum, SpanStatus } from './types.js';
import {
  sanitizeAttributes,
  formatPythonCompatibleTimestamp,
  getSdkVersion,
} from '../utils/index.js';
import { StandaloneSpan } from './span-standalone.js';

interface ExtendedTraceOptions extends TraceOptions {
  client?: any;
  enabled?: boolean;
  metadata?: {
    user_id?: string | null;
    session_id?: string | null;
    request_id?: string | null;
    tags?: Record<string, string>;
    custom_attributes?: Record<string, any>;
  };
}

/**
 * Implementation of a trace - represents a complete tracing session
 * Stores actual StandaloneSpan objects and serializes to match Python SDK format
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
  private _spans: StandaloneSpan[] = []; // Store actual span objects instead of serialized spans
  private _isFinished = false;
  private _status: SpanStatus = SpanStatus.OK;
  private _statusMessage: string | null = null;

  // Metadata structure matching Python SDK
  private _metadata: {
    user_id: string | null;
    session_id: string | null;
    request_id: string | null;
    tags: Record<string, string>;
    custom_attributes: Record<string, any>;
  } = {
    user_id: null,
    session_id: null,
    request_id: null,
    tags: {},
    custom_attributes: {},
  };

  constructor(traceId: string, name: string, options: ExtendedTraceOptions = {}) {
    this._traceId = traceId;
    this._name = name;
    this._level = options.level ?? TraceLevelEnum.INFO;
    this._startTime = options.start_time ?? new Date();
    this._client = options.client;
    this._enabled = options.enabled !== false;

    if (options.attributes) {
      this._attributes = sanitizeAttributes(options.attributes);
    }

    // Initialize metadata from options if provided
    if (options.metadata) {
      this._metadata = {
        ...this._metadata,
        ...options.metadata,
      };
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
    return [...this._spans];
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
   * Set metadata for the trace
   */
  setMetadata(metadata: Partial<typeof this._metadata>): void {
    if (this._isFinished) {
      console.warn('Cannot set metadata on a finished trace');
      return;
    }

    this._metadata = {
      ...this._metadata,
      ...metadata,
    };
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
      trace_id: this._traceId,
    };

    const span = await this._client.startSpan(name, spanOptions);

    // Store the actual span object
    if (span instanceof StandaloneSpan) {
      this._spans.push(span);
    }

    return span;
  }

  /**
   * Add a finished span to this trace
   * This method is called by spans when they finish
   */
  addFinishedSpan(span: StandaloneSpan): void {
    if (!this._spans.includes(span)) {
      this._spans.push(span);
    }
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
    for (const span of this._spans) {
      if (!span.isFinished) {
        await span.finish();
      }
    }

    // Calculate duration and add it using setAttribute safely
    const duration = this._endTime.getTime() - this._startTime.getTime();
    const wasFinished = this._isFinished;
    this._isFinished = false;
    this.setAttribute('duration.ms', duration);
    this._isFinished = wasFinished;

    // If client is available and enabled, add this trace to pending queue
    // Use trace-based operation instead of span-based
    if (this._client && this._enabled && '_addFinishedTrace' in this._client) {
      (this._client as any)._addFinishedTrace(this);
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
    const errorSpanCount = this._spans.filter(span => span.status === SpanStatus.ERROR).length;

    const finishedSpanCount = this._spans.filter(span => span.isFinished).length;

    return {
      spanCount: this._spans.length,
      finishedSpanCount,
      errorSpanCount,
      totalDuration,
    };
  }

  /**
   * Get the root span (first span without parent)
   */
  getRootSpan(): ISpan | undefined {
    return this._spans.find(span => !span.parentSpanId);
  }

  /**
   * Get child spans of a given parent span
   */
  getChildSpans(parentSpanId: string): ISpan[] {
    return this._spans.filter(span => span.parentSpanId === parentSpanId);
  }

  /**
   * Serialize the trace for transport (Python SDK compatible format)
   * This method creates the serialization on-demand rather than storing it
   */
  serialize(): SerializedTrace {
    const endTime = this._endTime || new Date();
    const duration = endTime.getTime() - this._startTime.getTime();

    // Serialize all spans on-demand
    const serializedSpans = this._spans.map(span => span.serialize());

    // Calculate error count from serialized spans
    const errorCount = serializedSpans.filter(span => span.status === SpanStatus.ERROR).length;

    // Status is already in Python SDK format (enum values are strings)
    const status = this._status;

    return {
      trace_id: this._traceId,
      name: this._name,
      start_time: formatPythonCompatibleTimestamp(this._startTime),
      end_time: this._endTime ? formatPythonCompatibleTimestamp(this._endTime) : null,
      duration_ms: duration,
      status,
      status_message: this._statusMessage,
      span_count: serializedSpans.length,
      error_count: errorCount,
      attributes: {
        ...this._attributes,
      },
      metadata: {
        ...this._metadata,
      },
      spans: serializedSpans,
      sdk: {
        name: '@noveum/trace',
        version: getSdkVersion(),
      },
      project: this._client?.getConfig()?.project || 'default',
      environment: this._client?.getConfig()?.environment || 'development',
    };
  }
}
