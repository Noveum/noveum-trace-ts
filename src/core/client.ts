/**
 * Core client implementation for Noveum Trace SDK
 */

import type { NoveumClientOptions, TraceOptions, SpanOptions, TraceBatch } from './types.js';
import { StandaloneTrace as Trace } from './trace-standalone.js';
import { StandaloneSpan as Span } from './span-standalone.js';
import { HttpTransport } from '../transport/http-transport.js';
import { getGlobalContextManager } from '../context/context-manager.js';
import { Sampler } from './sampler.js';
import { generateSpanId, getSdkVersion, formatPythonCompatibleTimestamp } from '../utils/index.js';

/**
 * Default client configuration
 */
const DEFAULT_OPTIONS: Required<Omit<NoveumClientOptions, 'apiKey'>> = {
  project: 'default',
  environment: 'development',
  endpoint: 'https://api.noveum.ai/api/v1/traces',
  enabled: true,
  batchSize: 100,
  flushInterval: 5000,
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000,
  debug: false,
  sampling: {
    rate: 1.0,
    rules: [],
  },
};

/**
 * Main client for Noveum Trace SDK
 */
export class NoveumClient {
  private readonly _config: Required<NoveumClientOptions>;
  private readonly _transport: HttpTransport;
  // private readonly _contextManager: ContextManager;
  private readonly _sampler: Sampler;
  private readonly _pendingSpans: Span[] = [];
  private readonly _pendingTraces: any[] = [];
  private _flushTimer: NodeJS.Timeout | undefined;
  private _isShutdown = false;

  constructor(options: Partial<NoveumClientOptions> & { apiKey: string }) {
    if (!options.apiKey) {
      throw new Error('API key is required');
    }

    this._config = {
      ...DEFAULT_OPTIONS,
      ...options,
      apiKey: options.apiKey,
    };

    this._transport = new HttpTransport({
      endpoint: this._config.endpoint,
      apiKey: this._config.apiKey,
      timeout: this._config.timeout,
      maxRetries: this._config.retryAttempts,
    });

    // this._contextManager = new ContextManager();
    this._sampler = new Sampler(this._config.sampling);

    if (this._config.enabled) {
      this._startFlushTimer();
    }
  }

  /**
   * Get client configuration
   */
  getConfig(): Required<NoveumClientOptions> {
    return { ...this._config };
  }

  /**
   * Alias for createTrace for backward compatibility
   */
  async startTrace(name: string, options: TraceOptions = {}): Promise<Trace> {
    return this.createTrace(name, options);
  }

  /**
   * Create a new trace
   */
  async createTrace(name: string, options: TraceOptions = {}): Promise<Trace> {
    if (!this._config.enabled || this._isShutdown) {
      return this._createNoOpTrace(name);
    }

    const traceId = options.trace_id || this._generateId();

    // Check sampling
    if (!this._sampler.shouldSample(traceId, name)) {
      return this._createNoOpTrace(name);
    }

    const trace = new Trace(traceId, name, {
      ...options,
      client: this,
    });

    // Set as active trace in context
    getGlobalContextManager().setActiveTrace(trace);

    if (this._config.debug) {
      console.log(`[Noveum] Created trace: ${name} (${traceId})`);
    }

    return trace;
  }

  /**
   * Start a new span
   */
  async startSpan(name: string, options: SpanOptions = {}): Promise<Span> {
    if (!this._config.enabled || this._isShutdown) {
      const activeTraceId = (getGlobalContextManager().getActiveTrace() as Trace | undefined)
        ?.traceId;
      return this._createNoOpSpan(name, options.trace_id || activeTraceId || this._generateId());
    }

    const spanId = this._generateId();
    const activeTrace = getGlobalContextManager().getActiveTrace() as Trace | undefined;
    const traceId = options.trace_id || activeTrace?.traceId || this._generateId();

    // Check sampling
    if (!this._sampler.shouldSample(traceId, name)) {
      return this._createNoOpSpan(name, traceId);
    }

    const span = new Span(spanId, name, {
      ...options,
      trace_id: traceId,
      client: this,
    });

    // Set as active span in context
    getGlobalContextManager().setActiveSpan(span);

    if (this._config.debug) {
      console.log(`[Noveum] Started span: ${name} (${spanId})`);
    }

    return span;
  }

  /**
   * Add a finished span to the pending queue
   */
  _addFinishedSpan(span: Span): void {
    if (this._isShutdown) {
      return;
    }

    this._pendingSpans.push(span);

    if (this._pendingSpans.length >= this._config.batchSize) {
      this._flushPendingSpans().catch(error => {
        if (this._config.debug) {
          console.error('[Noveum] Error flushing spans:', error);
        }
      });
    }
  }

  /**
   * Add a finished trace to the pending queue
   */
  _addFinishedTrace(trace: any): void {
    if (this._isShutdown) {
      return;
    }

    this._pendingTraces.push(trace);

    if (this._pendingTraces.length >= this._config.batchSize) {
      this._flushPendingTraces().catch(error => {
        if (this._config.debug) {
          console.error('[Noveum] Error flushing traces:', error);
        }
      });
    }
  }

  /**
   * Flush all pending spans and traces
   */
  async flush(): Promise<void> {
    if (this._pendingSpans.length === 0 && this._pendingTraces.length === 0) {
      return;
    }

    await Promise.all([this._flushPendingSpans(), this._flushPendingTraces()]);
  }

  /**
   * Get the active span
   */
  getActiveSpan(): Span | undefined {
    return getGlobalContextManager().getActiveSpan() as Span | undefined;
  }

  /**
   * Get the active trace
   */
  getActiveTrace(): Trace | undefined {
    return getGlobalContextManager().getActiveTrace() as Trace | undefined;
  }

  /**
   * Run a function with a span in context
   */
  async withSpan<T>(span: Span, fn: () => T | Promise<T>): Promise<T> {
    return getGlobalContextManager().withSpanAsync(span, async () => {
      const result = fn();
      return result instanceof Promise ? await result : result;
    });
  }

  /**
   * Run a function with a trace in context
   */
  async withTrace<T>(trace: Trace, fn: () => T | Promise<T>): Promise<T> {
    return getGlobalContextManager().withTraceAsync(trace, async () => {
      const result = fn();
      return result instanceof Promise ? await result : result;
    });
  }

  /**
   * Trace a function (create trace, run function, finish trace)
   */
  async trace<T>(name: string, fn: () => T | Promise<T>, options?: TraceOptions): Promise<T> {
    const trace = await this.createTrace(name, options);
    try {
      const result = await fn();
      return result;
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
   * Span a function (create span, run function, finish span)
   */
  async span<T>(name: string, fn: () => T | Promise<T>, options?: SpanOptions): Promise<T> {
    const span = await this.startSpan(name, options);
    try {
      const result = await fn();
      return result;
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
   * Shutdown the client
   */
  async shutdown(): Promise<void> {
    if (this._isShutdown) {
      return;
    }

    this._isShutdown = true;

    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = undefined;
    }

    // Flush any remaining spans
    await this.flush();

    if (this._config.debug) {
      console.log('[Noveum] Client shutdown completed');
    }
  }

  /**
   * Create client from environment variables
   */
  static fromEnvironment(overrides: Partial<NoveumClientOptions> = {}): NoveumClient {
    const envOptions: Partial<NoveumClientOptions> = {};

    if (process.env.NOVEUM_API_KEY) {
      envOptions.apiKey = process.env.NOVEUM_API_KEY;
    }
    if (process.env.NOVEUM_PROJECT) {
      envOptions.project = process.env.NOVEUM_PROJECT;
    }
    if (process.env.NOVEUM_ENVIRONMENT) {
      envOptions.environment = process.env.NOVEUM_ENVIRONMENT;
    }
    if (process.env.NOVEUM_ENDPOINT) {
      envOptions.endpoint = process.env.NOVEUM_ENDPOINT;
    }

    return new NoveumClient({
      ...envOptions,
      ...overrides,
    } as Partial<NoveumClientOptions> & { apiKey: string });
  }

  /**
   * Start the flush timer
   */
  private _startFlushTimer(): void {
    this._flushTimer = setInterval(() => {
      if (this._pendingSpans.length > 0) {
        this._flushPendingSpans().catch(error => {
          if (this._config.debug) {
            console.error('[Noveum] Error in flush timer:', error);
          }
        });
      }
    }, this._config.flushInterval);
  }

  /**
   * Flush pending spans to the transport (group by trace)
   */
  private async _flushPendingSpans(): Promise<void> {
    if (this._pendingSpans.length === 0) {
      return;
    }

    const spansToFlush = this._pendingSpans.splice(0);

    if (this._config.debug) {
      console.log(`[Noveum] Flushing ${spansToFlush.length} spans`);
    }

    // Group spans by trace ID and convert to traces
    const traceMap = new Map<string, Span[]>();
    for (const s of spansToFlush) {
      const tId = s.traceId;
      if (!traceMap.has(tId)) traceMap.set(tId, []);
      traceMap.get(tId)!.push(s);
    }

    // Convert span groups to trace format
    const traces = Array.from(traceMap.entries()).map(([traceId, spanGroup]) => {
      const serializedSpans = spanGroup.map(s => s.serialize());
      const hasError = serializedSpans.some(s => s.status === 'error');
      const errorCount = serializedSpans.filter(s => s.status === 'error').length;

      const rootSpan = spanGroup.find(s => (s as any).isRootSpan?.()) || spanGroup[0];

      // Compute overall start/end from Date objects with defensive defaults
      const startDate = spanGroup.reduce(
        (min, s) => (s.startTime < min ? s.startTime : min),
        spanGroup[0]?.startTime || new Date()
      );
      const endDate = spanGroup.reduce(
        (max, s) => {
          const candidate = s.endTime ?? s.startTime;
          return candidate > max ? candidate : max;
        },
        spanGroup[0]?.endTime ?? spanGroup[0]?.startTime ?? new Date()
      );

      const durationMs = Math.max(0, endDate.getTime() - startDate.getTime());

      return {
        trace_id: traceId,
        name: rootSpan ? rootSpan.name : 'trace',
        start_time: formatPythonCompatibleTimestamp(startDate),
        end_time: formatPythonCompatibleTimestamp(endDate),
        duration_ms: durationMs,
        status: hasError ? 'error' : 'ok',
        status_message: null,
        span_count: serializedSpans.length,
        error_count: errorCount,
        attributes: (rootSpan as any)?.attributes || {},
        metadata: {
          user_id: null,
          session_id: null,
          request_id: null,
          tags: {},
          custom_attributes: {},
        },
        spans: serializedSpans,
        sdk: {
          name: 'noveum-trace-ts',
          version: getSdkVersion(),
        },
        project: this._config.project,
        environment: this._config.environment,
        updated_at: formatPythonCompatibleTimestamp(new Date()),
      };
    });

    const batch: TraceBatch = {
      traces,
      timestamp: Math.floor(Date.now() / 1000),
    };

    try {
      await this._transport.send(batch);
    } catch (error) {
      console.error('[Noveum] Failed to send batch:', error);
      // Don't re-throw to allow graceful error handling
    }
  }

  /**
   * Flush pending traces to the transport
   */
  private async _flushPendingTraces(): Promise<void> {
    if (this._pendingTraces.length === 0) {
      return;
    }

    const tracesToFlush = this._pendingTraces.splice(0);

    if (this._config.debug) {
      console.log(`[Noveum] Flushing ${tracesToFlush.length} traces`);
    }

    const batch: TraceBatch = {
      traces: tracesToFlush.map(trace => trace.serialize()),
      timestamp: Math.floor(Date.now() / 1000),
    };

    try {
      await this._transport.send(batch);
    } catch (error) {
      console.error('[Noveum] Failed to send batch:', error);
      // Don't re-throw to allow graceful error handling
    }
  }

  /**
   * Create a no-op trace for disabled/sampled out cases
   */
  private _createNoOpTrace(name: string): Trace {
    return new Trace(this._generateId(), name, {
      client: this,
      enabled: false,
    });
  }

  /**
   * Create a no-op span for disabled/sampled out cases
   */
  private _createNoOpSpan(name: string, traceId: string): Span {
    return new Span(this._generateId(), name, {
      trace_id: traceId,
      client: this,
      enabled: false,
    });
  }

  /**
   * Generate a unique ID
   */
  private _generateId(): string {
    return generateSpanId();
  }
}

/**
 * Global client instance
 */
let globalClient: NoveumClient | undefined;

/**
 * Initialize the global client
 */
export function initializeClient(
  options: Partial<NoveumClientOptions> & { apiKey: string }
): NoveumClient {
  globalClient = new NoveumClient(options);
  return globalClient;
}

/**
 * Get the global client instance
 */
export function getGlobalClient(): NoveumClient {
  if (!globalClient) {
    throw new Error('Noveum client not initialized. Call initializeClient() first.');
  }
  return globalClient;
}

/**
 * Reset the global client instance (for testing)
 */
export function resetGlobalClient(): void {
  globalClient = undefined;
}
