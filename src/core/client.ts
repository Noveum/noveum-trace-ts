/**
 * Core client implementation for Noveum Trace SDK
 */

import type { 
  NoveumClientOptions, 
  TraceOptions, 
  SpanOptions,
  TraceBatch,
  SamplingConfig,
} from './types.js';
import { Trace } from './trace.js';
import { Span } from './span.js';
import { HttpTransport } from '../transport/http-transport.js';
import { ContextManager } from '../context/context-manager.js';
import { RateSampler } from './sampler.js';

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
  private readonly _contextManager: ContextManager;
  private readonly _sampler: RateSampler;
  private readonly _pendingSpans: Span[] = [];
  private _flushTimer?: NodeJS.Timeout;
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
      retryAttempts: this._config.retryAttempts,
      retryDelay: this._config.retryDelay,
    });

    this._contextManager = new ContextManager();
    this._sampler = new RateSampler(this._config.sampling);

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
   * Create a new trace
   */
  async createTrace(name: string, options: TraceOptions = {}): Promise<Trace> {
    if (!this._config.enabled || this._isShutdown) {
      return this._createNoOpTrace(name);
    }

    const traceId = options.traceId || this._generateId();
    
    // Check sampling
    if (!this._sampler.shouldSample(name, traceId)) {
      return this._createNoOpTrace(name);
    }

    const trace = new Trace(traceId, name, {
      ...options,
      client: this,
    });

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
      return this._createNoOpSpan(name, options.traceId || this._generateId());
    }

    const spanId = this._generateId();
    const traceId = options.traceId || this._generateId();
    
    // Check sampling
    if (!this._sampler.shouldSample(name, traceId)) {
      return this._createNoOpSpan(name, traceId);
    }

    const span = new Span(spanId, name, {
      ...options,
      traceId,
      client: this,
    });

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
   * Flush all pending spans
   */
  async flush(): Promise<void> {
    if (this._pendingSpans.length === 0) {
      return;
    }

    await this._flushPendingSpans();
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
   * Flush pending spans to the transport
   */
  private async _flushPendingSpans(): Promise<void> {
    if (this._pendingSpans.length === 0) {
      return;
    }

    const spansToFlush = this._pendingSpans.splice(0);
    
    if (this._config.debug) {
      console.log(`[Noveum] Flushing ${spansToFlush.length} spans`);
    }

    const batch: TraceBatch = {
      traces: spansToFlush.map(span => span.serialize()),
    };

    try {
      await this._transport.send(batch);
    } catch (error) {
      if (this._config.debug) {
        console.error('[Noveum] Failed to send batch:', error);
      }
      throw error;
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
      traceId,
      client: this,
      enabled: false,
    });
  }

  /**
   * Generate a unique ID
   */
  private _generateId(): string {
    return Math.random().toString(36).substr(2, 16);
  }
}

/**
 * Global client instance
 */
let globalClient: NoveumClient | undefined;

/**
 * Initialize the global client
 */
export function initializeClient(options: Partial<NoveumClientOptions> & { apiKey: string }): NoveumClient {
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

