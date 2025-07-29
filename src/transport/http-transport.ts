/**
 * HTTP transport implementation for the Noveum Trace SDK
 */

import type { ITransport } from '../core/interfaces.js';
import type { TraceBatch, TransportOptions } from '../core/types.js';
import { TransportError } from '../core/types.js';
import { retry, withTimeout, getSdkVersion } from '../utils/index.js';

/**
 * HTTP transport configuration
 */
export interface HttpTransportConfig {
  apiKey: string;
  endpoint: string;
}

/**
 * HTTP transport implementation
 */
export class HttpTransport implements ITransport {
  private readonly _config: Required<TransportOptions>;
  private readonly _httpConfig: HttpTransportConfig;
  private readonly _pendingBatches: TraceBatch[] = [];
  private readonly _userAgent: string;

  private _isShutdown = false;
  private _flushPromise: Promise<void> | undefined = undefined;

  constructor(config: TransportOptions, httpConfig: HttpTransportConfig) {
    this._config = {
      batchSize: config.batchSize ?? 100,
      flushInterval: config.flushInterval ?? 5000,
      maxRetries: config.maxRetries ?? 3,
      timeout: config.timeout ?? 30000,
      headers: config.headers ?? {},
    };

    this._httpConfig = httpConfig;
    this._userAgent = `noveum-trace-typescript/${getSdkVersion()}`;
  }

  async send(batch: TraceBatch): Promise<void> {
    if (this._isShutdown) {
      throw new Error('Transport has been shut down');
    }

    // Add batch to pending queue
    this._pendingBatches.push(batch);

    // If we have enough batches or this is a forced flush, send immediately
    if (this._pendingBatches.length >= this._config.batchSize) {
      await this._flushBatches();
    }
  }

  async flush(): Promise<void> {
    if (this._isShutdown) {
      return;
    }

    // Wait for any ongoing flush to complete
    if (this._flushPromise) {
      await this._flushPromise;
    }

    // Flush any remaining batches
    if (this._pendingBatches.length > 0) {
      await this._flushBatches();
    }
  }

  async shutdown(): Promise<void> {
    if (this._isShutdown) {
      return;
    }

    this._isShutdown = true;

    // Flush any remaining data
    await this.flush();
  }

  private async _flushBatches(): Promise<void> {
    if (this._pendingBatches.length === 0) {
      return;
    }

    // Prevent concurrent flushes
    if (this._flushPromise) {
      return this._flushPromise;
    }

    this._flushPromise = this._doFlush();

    if (this._flushPromise) {
      try {
        await this._flushPromise;
      } finally {
        this._flushPromise = undefined;
      }
    }
  }

  private async _doFlush(): Promise<void> {
    const batchesToSend = this._pendingBatches.splice(0);

    if (batchesToSend.length === 0) {
      return;
    }

    // Combine all batches into a single request
    const combinedBatch = this._combineBatches(batchesToSend);

    try {
      await this._sendBatch(combinedBatch);
    } catch (error) {
      // Log error but don't throw to avoid breaking the application
      console.error('Failed to send trace batch:', error);

      // Optionally, you could implement a dead letter queue here
      // to store failed batches for later retry
    }
  }

  private _combineBatches(batches: TraceBatch[]): TraceBatch {
    if (batches.length === 1) {
      const firstBatch = batches[0];
      if (!firstBatch) {
        throw new Error('No batches to combine');
      }
      return firstBatch;
    }

    const firstBatch = batches[0];
    if (!firstBatch) {
      throw new Error('No batches to combine');
    }

    // Determine if we're dealing with spans or traces based on the first batch
    const firstTrace = firstBatch.traces[0];
    if (!firstTrace) {
      throw new Error('No traces in first batch');
    }

    // All batches should contain the same type (spans or traces)
    // @ts-expect-error - Complex union type issue with flatMap, functionally correct
    const allTraces = batches.flatMap(batch => batch.traces);

    return {
      traces: allTraces as any,
      metadata: {
        ...firstBatch.metadata,
        timestamp: new Date().toISOString(),
      },
    };
  }

  private async _sendBatch(batch: TraceBatch): Promise<void> {
    const requestBody = JSON.stringify(batch);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': this._userAgent,
      Authorization: `Bearer ${this._httpConfig.apiKey}`,
      ...this._config.headers,
    };

    const requestOptions: RequestInit = {
      method: 'POST',
      headers,
      body: requestBody,
    };

    await retry(
      async () => {
        const response = await withTimeout(
          fetch(this._httpConfig.endpoint, requestOptions),
          this._config.timeout
        );

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new TransportError(
            `HTTP ${response.status}: ${response.statusText} - ${errorText}`
          );
        }

        // Optionally parse and validate response
        try {
          const responseData = await response.json();
          this._handleSuccessResponse(responseData);
        } catch (error) {
          // Response might not be JSON, which is okay for some APIs
          console.debug('Response is not JSON:', error);
        }
      },
      {
        maxRetries: this._config.maxRetries,
        baseDelay: 1000,
        maxDelay: 30000,
        backoffFactor: 2,
      }
    );
  }

  private _handleSuccessResponse(response: any): void {
    // Handle successful response
    // This could include processing any feedback from the server
    if (response?.warnings?.length > 0) {
      console.warn('Server warnings:', response.warnings);
    }
  }

  /**
   * Get transport statistics
   */
  getStats(): {
    pendingBatches: number;
    isShutdown: boolean;
    config: Required<TransportOptions>;
  } {
    return {
      pendingBatches: this._pendingBatches.length,
      isShutdown: this._isShutdown,
      config: { ...this._config },
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
      const response = await withTimeout(
        fetch(this._httpConfig.endpoint.replace('/traces', '/health'), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this._httpConfig.apiKey}`,
            'User-Agent': this._userAgent,
          },
        }),
        5000 // 5 second timeout for health check
      );

      return response.ok;
    } catch (error) {
      console.debug('Health check failed:', error);
      return false;
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
    console.log('Mock transport received batch:', {
      traceCount: batch.traces.length,
      metadata: batch.metadata,
    });
  }

  async flush(): Promise<void> {
    console.log('Mock transport flush called');
  }

  async shutdown(): Promise<void> {
    this._isShutdown = true;
    console.log('Mock transport shut down');
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
    console.log('Metadata:', batch.metadata);
    console.log('Traces:');

    batch.traces.forEach((trace, index) => {
      // Type guard to check if this is a SerializedTrace (has spans property)
      if ('spans' in trace) {
        console.log(`  Trace ${index + 1}:`, {
          id: trace.traceId,
          name: trace.name,
          duration: trace.endTime
            ? new Date(trace.endTime).getTime() - new Date(trace.startTime).getTime()
            : 'ongoing',
          spanCount: trace.spans.length,
          attributes: trace.attributes,
        });

        trace.spans.forEach((span: any, spanIndex: number) => {
          console.log(`    Span ${spanIndex + 1}:`, {
            id: span.spanId,
            name: span.name,
            status: span.status,
            duration: span.endTime
              ? new Date(span.endTime).getTime() - new Date(span.startTime).getTime()
              : 'ongoing',
            attributes: span.attributes,
          });
        });
      } else {
        // This is a SerializedSpan
        console.log(`  Span ${index + 1}:`, {
          id: trace.spanId,
          name: trace.name,
          status: trace.status,
          duration: trace.endTime
            ? new Date(trace.endTime).getTime() - new Date(trace.startTime).getTime()
            : 'ongoing',
          attributes: trace.attributes,
        });
      }
    });

    console.log('=========================');
  }

  async flush(): Promise<void> {
    console.log('Console transport flush called');
  }

  async shutdown(): Promise<void> {
    this._isShutdown = true;
    console.log('Console transport shut down');
  }
}

/**
 * Factory function to create transports
 */
export function createTransport(
  type: 'http' | 'mock' | 'console',
  config?: TransportOptions,
  httpConfig?: HttpTransportConfig
): ITransport {
  switch (type) {
    case 'http':
      if (!httpConfig) {
        throw new Error('HTTP config is required for HTTP transport');
      }
      return new HttpTransport(config || {}, httpConfig);

    case 'mock':
      return new MockTransport();

    case 'console':
      return new ConsoleTransport();

    default:
      throw new Error(`Unknown transport type: ${type}`);
  }
}
