/**
 * Core type definitions for the Noveum Trace SDK
 */

/**
 * Span status enumeration
 */
export enum SpanStatus {
  UNSET = 'UNSET',
  OK = 'OK',
  ERROR = 'ERROR',
}

/**
 * Span kind enumeration
 */
export enum SpanKind {
  INTERNAL = 'INTERNAL',
  SERVER = 'SERVER',
  CLIENT = 'CLIENT',
  PRODUCER = 'PRODUCER',
  CONSUMER = 'CONSUMER',
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
 * Event structure
 */
export interface TraceEvent {
  name: string;
  timestamp: string;
  attributes: Attributes | undefined;
}

/**
 * Span context information
 */
export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  traceFlags: number;
  traceState?: string;
}

/**
 * Trace options for creation
 */
export interface TraceOptions {
  traceId?: string;
  attributes?: Attributes;
  startTime?: Date;
  parentTraceId?: string;
  level?: TraceLevel;
}

/**
 * Span options for creation
 */
export interface SpanOptions {
  traceId?: string;
  kind?: SpanKind;
  attributes?: Attributes;
  parentSpanId?: string;
  startTime?: Date;
  links?: SpanLink[];
  enabled?: boolean;
}

/**
 * Span link structure
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
  attributes: Attributes | undefined;
}

/**
 * Serialized span data for transport
 */
export interface SerializedSpan {
  traceId: string;
  spanId: string;
  parentSpanId: string | undefined;
  name: string;
  kind: SpanKind;
  startTime: string;
  endTime: string | undefined;
  status: SpanStatus;
  statusMessage: string | undefined;
  attributes: Attributes;
  events: SerializedEvent[];
  links: SpanLink[];
}

/**
 * Serialized trace data for transport
 */
export interface SerializedTrace {
  traceId: string;
  name: string;
  startTime: string;
  endTime: string | undefined;
  status: SpanStatus;
  attributes: Attributes;
  events: TraceEvent[];
  spans: SerializedSpan[];
}

/**
 * Batch of traces for transport
 */
export interface TraceBatch {
  traces: SerializedSpan[] | SerializedTrace[];
  metadata: {
    project: string;
    environment: string;
    timestamp: string;
    sdkVersion: string;
  };
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
