/**
 * Noveum Trace TypeScript SDK
 *
 * A high-performance TypeScript SDK for tracing LLM, RAG, and agent applications
 * with comprehensive observability features.
 */

// Core exports
export { NoveumClient, initializeClient, getGlobalClient } from './core/client.js';
export { StandaloneSpan as Span } from './core/span-standalone.js';
export { StandaloneTrace as Trace } from './core/trace-standalone.js';

// Type exports
export type {
  // Core interfaces
  INoveumClient,
  ISpan,
  ITrace,
  ITransport,
  IContextManager,
  ISampler,
  IInstrumentation,
  IConfigValidator,
  IIdGenerator,
} from './core/interfaces.js';

export type {
  // Configuration types
  NoveumClientOptions,
  TransportOptions,
  TracingOptions,
  IntegrationOptions,
  ExpressIntegrationOptions,
  NextjsIntegrationOptions,
  HonoIntegrationOptions,
  FastifyIntegrationOptions,

  // Core types
  AttributeValue,
  Attributes,
  TraceEvent,
  SpanContext,
  SpanOptions,
  SpanLink,
  TraceOptions,
  SerializedSpan,
  SerializedTrace,
  TraceBatch,

  // Error types
  NoveumError,
  ConfigurationError,
  TransportError,
  InstrumentationError,
} from './core/types.js';

// Enum exports
export { SpanStatus, SpanKind, TraceLevel } from './core/types.js';

// Sampling
export { Sampler, AlwaysSampler, NeverSampler, RateSampler } from './core/sampler.js';

// Types
export type { SamplingConfig, SamplingRule } from './core/types.js';

// Context management exports
export {
  ContextManager,
  getGlobalContextManager,
  setGlobalContextManager,
  withCleanContext,
  getCurrentSpan,
  getCurrentTrace,
  setCurrentSpan,
  setCurrentTrace,
} from './context/context-manager.js';

// Transport exports
export {
  HttpTransport,
  MockTransport,
  ConsoleTransport,
  createTransport,
} from './transport/http-transport.js';

export type { HttpTransportConfig } from './transport/http-transport.js';

// Decorator exports
export {
  trace,
  traceLLM,
  traceAgent,
  traceRetrieval,
  traceTool,
  createTraceDecorator,
  createLLMDecorator,
  createAgentDecorator,
  createRetrievalDecorator,
  createToolDecorator,
  decoratorUtils,
  type TraceLLMOptions,
  type TraceAgentOptions,
  type TraceRetrievalOptions,
  type TraceToolOptions,
} from './decorators/index.js';

// Utility exports
export {
  generateTraceId,
  generateSpanId,
  getCurrentTimestamp,
  formatPythonCompatibleTimestamp,
  validateTimestampFormatting,
  isValidAttributeValue,
  sanitizeAttributes,
  deepMerge,
  isPlainObject,
  truncateString,
  safeStringify,
  debounce,
  throttle,
  sleep,
  retry as retryUtil,
  getEnvVar,
  isNode,
  isBrowser,
  getSdkVersion,
  withTimeout,
  normalizeUrl,
  extractErrorInfo,
} from './utils/index.js';

// Instrumentation exports
export {
  // Types and interfaces
  type InstrumentationTarget,
  type InstrumentationConfig,
  type InstrumentationRegistryConfig,
  type InstrumentedLibrary,
  type InstrumentationEvents,
  type InstrumentationContext,
  type MethodHooks,
  DEFAULT_INSTRUMENTATION_CONFIG,
  DEFAULT_REGISTRY_CONFIG,
  UnsupportedLibraryError,
  InstrumentationConflictError,

  // Core classes
  BaseInstrumentation,
  InstrumentationRegistry,
  getGlobalInstrumentationRegistry,
  setGlobalInstrumentationRegistry,

  // Specific instrumentation implementations
  OpenAIInstrumentation,
  AnthropicInstrumentation,

  // Convenience setup functions
  autoTraceOpenAI,
  autoTraceAnthropic,
  autoTraceAll,
  stopTracingOpenAI,
  stopTracingAnthropic,
  stopTracingAll,

  // Registry management functions
  isTraced,
  getTracingInfo,
  getRegistryStats,
  configureInstrumentation,
  enableInstrumentation,
  disableInstrumentation,
  isInstrumentationEnabled,
} from './instrumentation/index.js';

/**
 * Create and configure a new Noveum client
 */
export function createClient(
  options: Partial<import('./core/types.js').NoveumClientOptions> & { apiKey: string }
): import('./core/client.js').NoveumClient {
  const { NoveumClient } = require('./core/client.js');
  const client = new NoveumClient(options);

  // Set as global client for decorators
  const { setGlobalClient } = require('./decorators/index.js');
  setGlobalClient(client);

  return client;
}

/**
 * Default client instance (lazy-initialized)
 */
let defaultClient: import('./core/client.js').NoveumClient | undefined;

/**
 * Get the default client instance
 */
export function getDefaultClient(): import('./core/client.js').NoveumClient {
  if (!defaultClient) {
    // Try to create client from environment variables
    const apiKey = process.env.NOVEUM_API_KEY || 'default-api-key';
    const project = process.env.NOVEUM_PROJECT || 'default-project';
    const environment = process.env.NOVEUM_ENVIRONMENT || 'development';

    defaultClient = createClient({
      apiKey,
      project,
      environment,
      enabled: true,
    });
  }
  return defaultClient;
}

/**
 * Set a custom default client
 */
export function setDefaultClient(client: import('./core/client.js').NoveumClient): void {
  defaultClient = client;
  const { setGlobalClient } = require('./decorators/index.js');
  setGlobalClient(client);
}

/**
 * Convenience functions using the default client
 */

/**
 * Start a new trace using the default client
 */
export async function startTrace(
  name: string,
  options?: import('./core/types.js').TraceOptions
): Promise<import('./core/trace-standalone.js').StandaloneTrace> {
  return getDefaultClient().createTrace(name, options);
}

/**
 * Start a new span using the default client
 */
export async function startSpan(
  name: string,
  options?: import('./core/types.js').SpanOptions
): Promise<import('./core/span-standalone.js').StandaloneSpan> {
  return getDefaultClient().startSpan(name, options);
}

/**
 * Create and run a function within a new trace using the default client
 */
export async function traceFunction<T>(
  name: string,
  fn: () => Promise<T>,
  options?: import('./core/types.js').TraceOptions
): Promise<T> {
  const trace = await getDefaultClient().createTrace(name, options);
  try {
    return await fn();
  } catch (error) {
    trace.addEvent('error', {
      'error.type': error instanceof Error ? error.constructor.name : 'Error',
      'error.message': error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    await trace.finish();
  }
}

/**
 * Create and run a function within a new span using the default client
 */
export async function spanFunction<T>(
  name: string,
  fn: () => Promise<T>,
  options?: import('./core/types.js').SpanOptions
): Promise<T> {
  const span = await getDefaultClient().startSpan(name, options);
  try {
    return await fn();
  } catch (error) {
    span.addEvent('error', {
      'error.type': error instanceof Error ? error.constructor.name : 'Error',
      'error.message': error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    await span.finish();
  }
}

/**
 * Flush all pending data using the default client
 */
export async function flush(): Promise<void> {
  if (defaultClient) {
    await defaultClient.flush();
  }
}

/**
 * Shutdown the default client
 */
export async function shutdown(): Promise<void> {
  if (defaultClient) {
    await defaultClient.shutdown();
    defaultClient = undefined;
  }
}
/**
 * SDK version
 */
export const VERSION = '0.1.0';

/**
 * SDK metadata
 */
export const SDK_INFO = {
  name: '@noveum/trace',
  version: VERSION,
  description: 'TypeScript SDK for tracing LLM, RAG, and agent applications',
  homepage: 'https://github.com/Noveum/noveum-trace-ts',
} as const;
