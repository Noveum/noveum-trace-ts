/**
 * Core type definitions for the Noveum Trace SDK
 */

/**
 * Span status enumeration (Python SDK compatible)
 */
export enum SpanStatus {
  UNSET = 'unset',
  OK = 'ok',
  ERROR = 'error',
  TIMEOUT = 'timeout',
  CANCELLED = 'cancelled',
}

/**
 * Span kind enumeration (Python SDK compatible)
 */
export enum SpanKind {
  INTERNAL = 'internal',
  SERVER = 'server',
  CLIENT = 'client',
  PRODUCER = 'producer',
  CONSUMER = 'consumer',
}

/**
 * Trace level enumeration
 */
export enum TraceLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

/**
 * Attribute value types
 */
export type AttributeValue = string | number | boolean | string[] | number[] | boolean[];

/**
 * Attributes map
 */
export type Attributes = Record<string, AttributeValue>;

/**
 * Event structure (Python SDK compatible)
 */
export interface TraceEvent {
  name: string;
  timestamp: string;
  attributes: Attributes | undefined;
}

/**
 * Span context information (Python SDK compatible)
 */
export interface SpanContext {
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  trace_flags: number;
  trace_state?: string;
}

/**
 * Trace options for creation (Python SDK compatible)
 */
export interface TraceOptions {
  trace_id?: string;
  attributes?: Attributes;
  start_time?: Date;
  parent_trace_id?: string;
  level?: TraceLevel;
}

/**
 * Span options for creation (Python SDK compatible)
 */
export interface SpanOptions {
  trace_id?: string;
  kind?: SpanKind;
  attributes?: Attributes;
  parent_span_id?: string;
  start_time?: Date;
  links?: SpanLink[];
  enabled?: boolean;
}

/**
 * Span link structure (Python SDK compatible)
 */
export interface SpanLink {
  context: SpanContext;
  attributes?: Attributes;
}

/**
 * Configuration for the Noveum client
 */
export interface NoveumClientOptions {
  /**
   * API key for authentication
   */
  apiKey: string;

  /**
   * Project identifier
   */
  project?: string;

  /**
   * Environment name (e.g., 'production', 'staging', 'development')
   */
  environment?: string;

  /**
   * API endpoint URL
   */
  endpoint?: string;

  /**
   * Whether tracing is enabled
   */
  enabled?: boolean;

  /**
   * Batch size for sending traces
   */
  batchSize?: number;

  /**
   * Flush interval in milliseconds
   */
  flushInterval?: number;

  /**
   * Request timeout in milliseconds
   */
  timeout?: number;

  /**
   * Number of retry attempts for failed requests
   */
  retryAttempts?: number;

  /**
   * Delay between retry attempts in milliseconds
   */
  retryDelay?: number;

  /**
   * Enable debug logging
   */
  debug?: boolean;

  /**
   * Sampling configuration
   */
  sampling?: SamplingConfig;
}

/**
 * Transport layer configuration
 */
export interface TransportOptions {
  /**
   * Batch size for sending traces
   */
  batchSize?: number;

  /**
   * Flush interval in milliseconds
   */
  flushInterval?: number;

  /**
   * Maximum number of retries for failed requests
   */
  maxRetries?: number;

  /**
   * Request timeout in milliseconds
   */
  timeout?: number;

  /**
   * Custom headers for requests
   */
  headers?: Record<string, string>;
}

/**
 * Tracing configuration
 */
export interface TracingOptions {
  /**
   * Sample rate (0.0 to 1.0)
   */
  sampleRate?: number;

  /**
   * Maximum number of spans per trace
   */
  maxSpansPerTrace?: number;

  /**
   * Maximum number of attributes per span
   */
  maxAttributesPerSpan?: number;

  /**
   * Maximum number of events per span
   */
  maxEventsPerSpan?: number;

  /**
   * Enable automatic instrumentation
   */
  autoInstrumentation?: boolean;
}

/**
 * Integration configuration
 */
export interface IntegrationOptions {
  /**
   * Express integration options
   */
  express?: ExpressIntegrationOptions;

  /**
   * Next.js integration options
   */
  nextjs?: NextjsIntegrationOptions;

  /**
   * Hono integration options
   */
  hono?: HonoIntegrationOptions;

  /**
   * Fastify integration options
   */
  fastify?: FastifyIntegrationOptions;
}

/**
 * Express integration options
 */
export interface ExpressIntegrationOptions {
  enabled?: boolean;
  ignoreRoutes?: string[];
  captureHeaders?: boolean;
  captureBody?: boolean;
}

/**
 * Next.js integration options
 */
export interface NextjsIntegrationOptions {
  enabled?: boolean;
  traceApiRoutes?: boolean;
  tracePages?: boolean;
  traceServerComponents?: boolean;
}

/**
 * Hono integration options
 */
export interface HonoIntegrationOptions {
  enabled?: boolean;
  ignoreRoutes?: string[];
  captureHeaders?: boolean;
}

/**
 * Fastify integration options
 */
export interface FastifyIntegrationOptions {
  enabled?: boolean;
  ignoreRoutes?: string[];
  captureHeaders?: boolean;
}

/**
 * Serialized event for transport
 */
export interface SerializedEvent {
  name: string;
  timestamp: string;
  attributes?: Attributes;
}

/**
 * API-compatible trace format (snake_case)
 *
 * This interface represents the external API format for traces that will be sent
 * over HTTP to the Noveum backend. Key differences from SerializedTrace:
 * - Uses optional fields (?) instead of nullable fields (| null) for better JSON compatibility
 * - Uses string for status field instead of SpanStatus enum for API flexibility
 * - Uses Record<string, any> for metadata.tags instead of Record<string, string>
 */
export interface ApiTrace {
  trace_id: string;
  name: string;
  start_time: string;
  end_time?: string;
  duration_ms?: number;
  status: string;
  status_message?: string;
  span_count: number;
  error_count: number;
  attributes: Record<string, any>;
  metadata: {
    user_id?: string;
    session_id?: string;
    request_id?: string;
    tags: Record<string, any>;
    custom_attributes: Record<string, any>;
  };
  spans: ApiSpan[];
  sdk: {
    name: string;
    version: string;
  };
  project: string;
  environment: string;
}

/**
 * API-compatible span format (snake_case)
 *
 * This interface represents the external API format for spans. Key differences from SerializedSpan:
 * - Uses optional fields (?) instead of nullable fields (| null) for better JSON compatibility
 * - Uses string for status field instead of SpanStatus enum for API flexibility
 */
export interface ApiSpan {
  span_id: string;
  trace_id: string;
  parent_span_id?: string;
  name: string;
  start_time: string;
  end_time?: string;
  duration_ms?: number;
  status: string;
  status_message?: string;
  attributes: Record<string, any>;
  events: ApiEvent[];
  links: ApiLink[];
}

/**
 * API-compatible event format (snake_case)
 *
 * This interface represents the external API format for events.
 * Uses Record<string, any> for attributes instead of optional Attributes type.
 */
export interface ApiEvent {
  name: string;
  timestamp: string;
  attributes: Record<string, any>;
}

/**
 * API-compatible link format (snake_case)
 *
 * This interface represents the external API format for links.
 * Same structure as SerializedLink but with Record<string, any> for attributes.
 */
export interface ApiLink {
  trace_id: string;
  span_id: string;
  attributes?: Record<string, any>;
}

/**
 * API batch format
 */
export interface ApiBatch {
  traces: ApiTrace[];
  timestamp: number;
}

/**
 * Serialized link for transport (Python SDK compatible format)
 *
 * This interface represents the internal serialization format for span links,
 * designed for compatibility with the Python SDK. Uses nullable fields and
 * strict typing for internal consistency.
 */
export interface SerializedLink {
  trace_id: string;
  span_id: string;
  attributes?: Attributes;
}

/**
 * Serialized span data for transport (Python SDK compatible format)
 *
 * This interface represents the internal serialization format for spans,
 * designed for compatibility with the Python SDK. Key characteristics:
 * - Uses nullable fields (| null) for precise null handling
 * - Uses string literal types for status for Python SDK compatibility
 * - Uses strict Attributes type for internal consistency
 */
export interface SerializedSpan {
  span_id: string;
  trace_id: string;
  parent_span_id: string | null;
  name: string;
  start_time: string;
  end_time: string | null;
  duration_ms: number;
  status: 'ok' | 'error' | 'unset' | 'timeout' | 'cancelled';
  status_message: string | null;
  attributes: Attributes;
  events: SerializedEvent[];
  links: SerializedLink[];
}

/**
 * Serialized trace data for transport (Python SDK compatible format)
 *
 * This interface represents the internal serialization format for traces,
 * designed for compatibility with the Python SDK. Key characteristics:
 * - Uses nullable fields (| null) for precise null handling
 * - Uses string literal types for status for Python SDK compatibility
 * - Uses Record<string, string> for tags (stricter than API format)
 * - Used internally before conversion to ApiTrace for HTTP transport
 */
export interface SerializedTrace {
  trace_id: string;
  name: string;
  start_time: string;
  end_time: string | null;
  duration_ms: number;
  status: 'ok' | 'error' | 'unset' | 'timeout' | 'cancelled';
  status_message: string | null;
  span_count: number;
  error_count: number;
  attributes: Attributes;
  metadata: {
    user_id: string | null;
    session_id: string | null;
    request_id: string | null;
    tags: Record<string, string>;
    custom_attributes: Record<string, any>;
  };
  spans: SerializedSpan[];
  sdk: {
    name: string;
    version: string;
  };
  project: string;
  environment: string;
}

/**
 * Batch of traces for transport
 */
export interface TraceBatch {
  traces: SerializedTrace[];
  timestamp: number; // Unix timestamp in seconds (Python format)
}

/**
 * Error types for the SDK
 */
export class NoveumError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'NoveumError';
  }
}

export class ConfigurationError extends NoveumError {
  constructor(message: string) {
    super(message, 'CONFIGURATION_ERROR');
    this.name = 'ConfigurationError';
  }
}

export class TransportError extends NoveumError {
  constructor(message: string) {
    super(message, 'TRANSPORT_ERROR');
    this.name = 'TransportError';
  }
}

export class InstrumentationError extends NoveumError {
  constructor(message: string) {
    super(message, 'INSTRUMENTATION_ERROR');
    this.name = 'InstrumentationError';
  }
}

/**
 * Sampling rule for conditional sampling
 */
export interface SamplingRule {
  /**
   * Sampling rate (0.0 to 1.0)
   */
  rate: number;

  /**
   * Optional pattern to match trace names
   */
  traceNamePattern?: string;

  /**
   * Optional pattern to match trace IDs
   */
  traceIdPattern?: string;

  /**
   * Optional attributes to match
   */
  attributes?: Attributes;
}

/**
 * Sampling configuration
 */
export interface SamplingConfig {
  /**
   * Default sampling rate (0.0 to 1.0)
   */
  rate: number;

  /**
   * Optional sampling rules
   */
  rules?: SamplingRule[];
}
