/**
 * Core interfaces for the Noveum Trace SDK
 */

import type {
  Attributes,
  SpanOptions,
  TraceOptions,
  SerializedSpan,
  SerializedTrace,
  SpanStatus,
  TraceBatch,
} from './types.js';

/**
 * Interface for a span - represents a single operation within a trace
 */
export interface ISpan {
  /**
   * Unique identifier for this span
   */
  readonly spanId: string;

  /**
   * Trace ID this span belongs to
   */
  readonly traceId: string;

  /**
   * Parent span ID if this is a child span
   */
  readonly parentSpanId: string | undefined;

  /**
   * Name of the operation this span represents
   */
  readonly name: string;

  /**
   * Start time of the span
   */
  readonly startTime: Date;

  /**
   * End time of the span (undefined if not finished)
   */
  readonly endTime: Date | undefined;

  /**
   * Whether the span has been finished
   */
  readonly isFinished: boolean;

  /**
   * Status of the span
   */
  readonly status: SpanStatus;

  /**
   * Set multiple attributes on the span
   * @param attributes - Key-value pairs to set as attributes
   */
  setAttributes(attributes: Attributes): void;

  /**
   * Set a single attribute on the span
   * @param key - Attribute key
   * @param value - Attribute value
   */
  setAttribute(key: string, value: Attributes[string]): void;

  /**
   * Add an event to the span
   * @param name - Event name
   * @param attributes - Optional event attributes
   */
  addEvent(name: string, attributes?: Attributes): void;

  /**
   * Set the status of the span
   * @param status - Span status
   * @param message - Optional status message
   */
  setStatus(status: SpanStatus, message?: string): void;

  /**
   * Finish the span
   * @param endTime - Optional end time (defaults to current time)
   */
  finish(endTime?: Date): Promise<void>;

  /**
   * Serialize the span for transport
   */
  serialize(): SerializedSpan;
}

/**
 * Interface for a trace - represents a complete tracing session
 */
export interface ITrace {
  /**
   * Unique identifier for this trace
   */
  readonly traceId: string;

  /**
   * Name of the trace
   */
  readonly name: string;

  /**
   * Start time of the trace
   */
  readonly startTime: Date;

  /**
   * End time of the trace (set when finished)
   */
  endTime: Date | undefined;

  /**
   * Whether the trace has been finished
   */
  readonly isFinished: boolean;

  /**
   * All spans in this trace
   */
  readonly spans: ISpan[];

  /**
   * Start a new span within this trace
   * @param name - Span name
   * @param options - Span options
   */
  startSpan(name: string, options?: SpanOptions): Promise<ISpan>;

  /**
   * Set multiple attributes on the trace
   * @param attributes - Key-value pairs to set as attributes
   */
  setAttributes(attributes: Attributes): void;

  /**
   * Set a single attribute on the trace
   * @param key - Attribute key
   * @param value - Attribute value
   */
  setAttribute(key: string, value: Attributes[string]): void;

  /**
   * Add an event to the trace
   * @param name - Event name
   * @param attributes - Optional event attributes
   */
  addEvent(name: string, attributes?: Attributes): void;

  /**
   * Set the trace status
   * @param status - Status value
   */
  setStatus(status: SpanStatus): void;

  /**
   * Get the trace status
   */
  getStatus(): SpanStatus;

  /**
   * Finish the trace
   * @param endTime - Optional end time (defaults to current time)
   */
  finish(endTime?: Date): Promise<void>;

  /**
   * Serialize the trace for transport
   */
  serialize(): SerializedTrace;
}

/**
 * Interface for the transport layer
 */
export interface ITransport {
  /**
   * Send a batch of traces
   * @param batch - Batch of traces to send
   */
  send(batch: TraceBatch): Promise<void>;

  /**
   * Flush any pending data
   */
  flush(): Promise<void>;

  /**
   * Shutdown the transport
   */
  shutdown(): Promise<void>;
}

/**
 * Interface for context management
 */
export interface IContextManager {
  /**
   * Get the current active span
   */
  getActiveSpan(): ISpan | undefined;

  /**
   * Set the active span
   * @param span - Span to set as active
   */
  setActiveSpan(span: ISpan): void;

  /**
   * Run a function with a specific span as active
   * @param span - Span to set as active
   * @param fn - Function to run
   */
  withSpan<T>(span: ISpan, fn: () => T): T;

  /**
   * Run an async function with a specific span as active
   * @param span - Span to set as active
   * @param fn - Async function to run
   */
  withSpanAsync<T>(span: ISpan, fn: () => Promise<T>): Promise<T>;

  /**
   * Get the current active trace
   */
  getActiveTrace(): ITrace | undefined;

  /**
   * Set the active trace
   * @param trace - Trace to set as active
   */
  setActiveTrace(trace: ITrace): void;

  /**
   * Run a function with a specific trace as active
   * @param trace - Trace to set as active
   * @param fn - Function to run
   */
  withTrace<T>(trace: ITrace, fn: () => T): T;

  /**
   * Run an async function with a specific trace as active
   * @param trace - Trace to set as active
   * @param fn - Async function to run
   */
  withTraceAsync<T>(trace: ITrace, fn: () => Promise<T>): Promise<T>;
}

/**
 * Interface for the main Noveum client
 */
export interface INoveumClient {
  /**
   * Start a new trace
   * @param name - Trace name
   * @param options - Trace options
   */
  startTrace(name: string, options?: TraceOptions): Promise<ITrace>;

  /**
   * Start a new span (will create a trace if none is active)
   * @param name - Span name
   * @param options - Span options
   */
  startSpan(name: string, options?: SpanOptions): Promise<ISpan>;

  /**
   * Get the current active trace
   */
  getActiveTrace(): ITrace | undefined;

  /**
   * Get the current active span
   */
  getActiveSpan(): ISpan | undefined;

  /**
   * Flush all pending data
   */
  flush(): Promise<void>;

  /**
   * Shutdown the client
   */
  shutdown(): Promise<void>;
}

/**
 * Interface for sampling decisions
 */
export interface ISampler {
  /**
   * Make a sampling decision for a trace
   * @param traceId - Trace ID
   * @param name - Trace name (optional)
   */
  shouldSample(traceId: string, name?: string): boolean;
}

/**
 * Interface for instrumentation plugins
 */
export interface IInstrumentation {
  /**
   * Name of the instrumentation
   */
  readonly name: string;

  /**
   * Version of the instrumentation
   */
  readonly version: string;

  /**
   * Enable the instrumentation
   */
  enable(): void;

  /**
   * Disable the instrumentation
   */
  disable(): void;

  /**
   * Check if the instrumentation is enabled
   */
  isEnabled(): boolean;
}

/**
 * Interface for configuration validation
 */
export interface IConfigValidator {
  /**
   * Validate configuration options
   * @param config - Configuration to validate
   */
  validate(config: unknown): void;
}

/**
 * Interface for ID generation
 */
export interface IIdGenerator {
  /**
   * Generate a new trace ID
   */
  generateTraceId(): string;

  /**
   * Generate a new span ID
   */
  generateSpanId(): string;
}
