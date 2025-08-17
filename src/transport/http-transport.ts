/**
 * HTTP transport implementation for the Noveum Trace SDK
 *
 * Rewritten to match Python SDK's endpoint usage and payload format exactly.
 * Integrates with BatchProcessor for efficient batching.
 */

import type { ITransport } from '../core/interfaces.js';
import type { TraceBatch } from '../core/types.js';
import { TransportError } from '../core/types.js';
import { withTimeout, getSdkVersion } from '../utils/index.js';

/**
 * HTTP transport configuration
 */
export interface HttpTransportConfig {
  /** API key for authentication */
  apiKey: string;
  /** Base endpoint URL (will be combined with /v1/traces) */
  endpoint: string;
  /** Enable gzip compression (default: false) */
  enableCompression?: boolean;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Custom headers to include with requests */
  headers?: Record<string, string>;
  /** Enable debug logging (default: false) */
  debug?: boolean;
}

/**
 * HTTP transport implementation matching Python SDK behavior
 */
export class HttpTransport implements ITransport {
  private readonly _config: Required<HttpTransportConfig>;
  private readonly _userAgent: string;
  private _isShutdown = false;

  constructor(config: HttpTransportConfig) {
    // Validate required configuration
    if (!config.apiKey) {
      throw new Error('API key is required for HTTP transport');
    }
    if (!config.endpoint) {
      throw new Error('Endpoint is required for HTTP transport');
    }

    this._config = {
      apiKey: config.apiKey,
      endpoint: this._normalizeEndpoint(config.endpoint),
      enableCompression: config.enableCompression ?? false,
      timeout: config.timeout ?? 30000,
      maxRetries: config.maxRetries ?? 3,
      headers: config.headers ?? {},
      debug: config.debug ?? false,
    };

    // User-Agent matching Python SDK format
    this._userAgent = `@noveum/trace/${getSdkVersion()}`;

    this._debugLog('HttpTransport initialized', {
      endpoint: this._config.endpoint,
      compression: this._config.enableCompression,
      timeout: this._config.timeout,
    });
  }

  /**
   * Send a batch of traces to the server
   */
  async send(batch: TraceBatch): Promise<void> {
    if (this._isShutdown) {
      throw new TransportError('Transport has been shut down');
    }

    if (!batch.traces || batch.traces.length === 0) {
      this._debugLog('Skipping empty batch');
      return;
    }

    this._debugLog(`Sending batch with ${batch.traces.length} traces`, {
      timestamp: batch.timestamp,
      traceIds: batch.traces.map(t => t.trace_id).slice(0, 3), // Log first 3 IDs
    });

    await this._sendBatchWithRetry(batch);
  }

  /**
   * Flush any pending data (no-op since we don't buffer)
   */
  async flush(): Promise<void> {
    if (this._isShutdown) {
      return;
    }

    this._debugLog('Flush called (no-op)');
    // No-op since we send immediately and don't buffer
  }

  /**
   * Shutdown the transport
   */
  async shutdown(): Promise<void> {
    if (this._isShutdown) {
      return;
    }

    this._debugLog('Shutting down HTTP transport');
    this._isShutdown = true;
  }

  /**
   * Get transport statistics
   */
  getStats(): {
    isShutdown: boolean;
    config: {
      endpoint: string;
      compression: boolean;
      timeout: number;
      maxRetries: number;
    };
  } {
    return {
      isShutdown: this._isShutdown,
      config: {
        endpoint: this._config.endpoint,
        compression: this._config.enableCompression,
        timeout: this._config.timeout,
        maxRetries: this._config.maxRetries,
      },
    };
  }

  /**
   * Check if the transport is healthy
   */
  async healthCheck(): Promise<boolean> {
    if (this._isShutdown) {
      return false;
    }

    try {
      // Use the base endpoint for health check
      const healthEndpoint = this._config.endpoint.replace('/v1/traces', '/health');

      const response = await withTimeout(
        fetch(healthEndpoint, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this._config.apiKey}`,
            ...(typeof (globalThis as any).window === 'undefined'
              ? { 'User-Agent': this._userAgent }
              : {}),
            ...this._config.headers,
          },
        }),
        5000 // 5 second timeout for health check
      );

      const isHealthy = response.ok;
      this._debugLog(`Health check result: ${isHealthy ? 'healthy' : 'unhealthy'}`, {
        status: response.status,
        endpoint: healthEndpoint,
      });

      return isHealthy;
    } catch (error) {
      this._debugLog('Health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Send batch with retry logic
   */
  private async _sendBatchWithRetry(batch: TraceBatch): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this._config.maxRetries; attempt++) {
      try {
        await this._sendBatchRequest(batch);
        return; // Success
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this._config.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
          this._debugLog(`Retry attempt ${attempt + 1}/${this._config.maxRetries}`, {
            error: lastError.message,
            batchSize: batch.traces.length,
            delayMs: delay,
          });

          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries exhausted
    if (lastError) {
      throw lastError;
    }
  }

  /**
   * Send the actual HTTP request
   */
  private async _sendBatchRequest(batch: TraceBatch): Promise<void> {
    // Prepare request body - this should match Python SDK format exactly
    const payload = this._formatPayload(batch);
    const requestBody = JSON.stringify(payload);

    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this._config.apiKey}`,
      ...(typeof (globalThis as any).window === 'undefined'
        ? { 'User-Agent': this._userAgent }
        : {}),
      ...this._config.headers,
    };

    // Add compression if enabled
    let body: string | Uint8Array = requestBody;
    if (this._config.enableCompression) {
      // Note: Using gzip compression with native Web API
      // In Node.js, this would use the 'zlib' module, but for web compatibility we use CompressionStream
      if (typeof CompressionStream !== 'undefined') {
        try {
          const stream = new CompressionStream('gzip');
          const writer = stream.writable.getWriter();
          const reader = stream.readable.getReader();

          await writer.write(new TextEncoder().encode(requestBody));
          await writer.close();

          const chunks: Uint8Array[] = [];
          let done = false;
          while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            if (value) {
              chunks.push(value);
            }
          }

          body = this._concatArrays(chunks);
          headers['Content-Encoding'] = 'gzip';
          headers['Content-Length'] = body.length.toString();
        } catch (error) {
          this._debugLog('Compression failed, sending uncompressed', { error });
          // Fall back to uncompressed
        }
      } else {
        this._debugLog('CompressionStream not available, sending uncompressed');
      }
    }

    const requestOptions: RequestInit = {
      method: 'POST',
      headers,
      body,
    };

    this._debugLog('Sending HTTP request', {
      endpoint: this._config.endpoint,
      bodySize: typeof body === 'string' ? body.length : body.length,
      compressed: headers['Content-Encoding'] === 'gzip',
    });

    const response = await withTimeout(
      fetch(this._config.endpoint, requestOptions),
      this._config.timeout
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new TransportError(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
    }

    // Handle successful response
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      try {
        const responseData = await response.json();
        this._handleSuccessResponse(responseData);
      } catch (error) {
        this._debugLog('Failed to parse JSON response', { error });
        // Continue - successful HTTP status is what matters for tracing
      }
    }

    this._debugLog('Batch sent successfully', {
      status: response.status,
      traces: batch.traces.length,
    });
  }

  /**
   * Format payload to match Python SDK format exactly
   */
  private _formatPayload(batch: TraceBatch): any {
    // The payload should match the Python SDK's batch format exactly
    // This is a TraceBatch object with traces array and timestamp
    return {
      traces: batch.traces,
      timestamp: batch.timestamp, // Already in seconds (Python format)
    };
  }

  /**
   * Handle successful response from server
   */
  private _handleSuccessResponse(response: any): void {
    if (response?.warnings?.length > 0) {
      console.warn('[Noveum] Server warnings:', response.warnings);
    }

    if (response?.errors?.length > 0) {
      console.error('[Noveum] Server errors:', response.errors);
    }

    this._debugLog('Response processed', {
      warnings: response?.warnings?.length || 0,
      errors: response?.errors?.length || 0,
    });
  }

  /**
   * Normalize endpoint to ensure it uses /v1/traces while preserving existing paths
   */
  private _normalizeEndpoint(endpoint: string): string {
    // Remove trailing slash
    let normalized = endpoint.replace(/\/$/, '');

    // Ensure it ends with /v1/traces
    if (!normalized.endsWith('/v1/traces')) {
      // Preserve the existing path and append /v1/traces
      normalized = `${normalized}/v1/traces`;
    }

    return normalized;
  }

  /**
   * Concatenate Uint8Array chunks
   */
  private _concatArrays(arrays: Uint8Array[]): Uint8Array {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;

    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }

    return result;
  }

  /**
   * Debug logging helper
   */
  private _debugLog(message: string, extra?: any): void {
    if (this._config.debug) {
      const timestamp = new Date().toISOString();
      if (extra) {
        console.log(`${timestamp} [HttpTransport] ${message}`, extra);
      } else {
        console.log(`${timestamp} [HttpTransport] ${message}`);
      }
    }
  }
}

/**
 * Mock transport for testing and development
 */
export class MockTransport implements ITransport {
  private readonly _sentBatches: TraceBatch[] = [];
  private _isShutdown = false;

  get sentBatches(): readonly TraceBatch[] {
    return [...this._sentBatches];
  }

  async send(batch: TraceBatch): Promise<void> {
    if (this._isShutdown) {
      throw new Error('Transport has been shut down');
    }

    this._sentBatches.push(batch);
    console.log('[MockTransport] Received batch:', {
      traceCount: batch.traces.length,
      timestamp: batch.timestamp,
    });
  }

  async flush(): Promise<void> {
    console.log('[MockTransport] Flush called');
  }

  async shutdown(): Promise<void> {
    this._isShutdown = true;
    console.log('[MockTransport] Shut down');
  }

  clear(): void {
    this._sentBatches.length = 0;
  }

  getStats() {
    return {
      sentBatches: this._sentBatches.length,
      isShutdown: this._isShutdown,
    };
  }
}

/**
 * Console transport for debugging
 */
export class ConsoleTransport implements ITransport {
  private _isShutdown = false;

  async send(batch: TraceBatch): Promise<void> {
    if (this._isShutdown) {
      throw new Error('Transport has been shut down');
    }

    console.log('=== Noveum Trace Batch ===');
    console.log('Timestamp:', new Date(batch.timestamp * 1000).toISOString());
    console.log('Traces:');

    batch.traces.forEach((trace, index) => {
      console.log(`  Trace ${index + 1}:`, {
        id: trace.trace_id,
        name: trace.name,
        duration: trace.duration_ms,
        spanCount: 'spans' in trace ? trace.spans.length : 'N/A',
        status: trace.status,
        attributes: trace.attributes,
      });

      if ('spans' in trace) {
        trace.spans.forEach((span: any, spanIndex: number) => {
          console.log(`    Span ${spanIndex + 1}:`, {
            id: span.span_id,
            name: span.name,
            status: span.status,
            duration: span.duration_ms,
            attributes: span.attributes,
          });
        });
      }
    });

    console.log('=========================');
  }

  async flush(): Promise<void> {
    console.log('[ConsoleTransport] Flush called');
  }

  async shutdown(): Promise<void> {
    this._isShutdown = true;
    console.log('[ConsoleTransport] Shut down');
  }
}

/**
 * Factory function to create transports
 */
export function createTransport(
  type: 'http' | 'mock' | 'console',
  config?: HttpTransportConfig
): ITransport {
  switch (type) {
    case 'http':
      if (!config) {
        throw new Error('HTTP config is required for HTTP transport');
      }
      return new HttpTransport(config);

    case 'mock':
      return new MockTransport();

    case 'console':
      return new ConsoleTransport();

    default:
      throw new Error(`Unknown transport type: ${type}`);
  }
}
