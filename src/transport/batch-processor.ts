/**
 * Batch Processor for the Noveum Trace SDK
 *
 * Efficiently collects and sends traces in batches, matching Python SDK's behavior.
 *
 * Features:
 * - Queue management for pending traces
 * - Configurable batch size and timeout
 * - Background processing using setInterval
 * - Error handling and retry logic
 * - Queue size limits and overflow handling
 * - Debug logging for batch operations
 * - Clean shutdown capability
 */

import type { SerializedTrace, TraceBatch } from '../core/types.js';
import type { ITransport } from '../core/interfaces.js';

/**
 * Configuration options for the batch processor
 */
export interface BatchProcessorConfig {
  /** Maximum number of traces in a batch (default: 100) */
  batchSize?: number;
  /** Maximum time to wait before flushing a batch in milliseconds (default: 5000) */
  flushInterval?: number;
  /** Maximum number of traces to hold in queue before dropping (default: 10000) */
  maxQueueSize?: number;
  /** Maximum number of retry attempts for failed batches (default: 3) */
  maxRetries?: number;
  /** Enable debug logging (default: false) */
  debug?: boolean;
  /** Prefix for debug messages (default: "[BatchProcessor]") */
  debugPrefix?: string;
}

/**
 * Statistics about batch processor operations
 */
export interface BatchProcessorStats {
  /** Current number of traces in queue */
  queueSize: number;
  /** Total number of batches sent successfully */
  batchesSent: number;
  /** Total number of batches that failed */
  batchesFailed: number;
  /** Total number of traces processed successfully */
  tracesProcessed: number;
  /** Total number of traces dropped due to queue overflow */
  tracesDropped: number;
  /** Total number of retry attempts made */
  retryAttempts: number;
  /** Whether processor is currently shutting down */
  isShuttingDown: boolean;
  /** Timestamp of last successful flush */
  lastFlushTime: number | null;
}

/**
 * Represents a batch with metadata for processing
 */
interface PendingBatch {
  traces: any[]; // Raw trace objects (will be serialized when needed)
  createdAt: number;
  retryCount: number;
  id: string;
}

/**
 * BatchProcessor efficiently collects and sends traces in batches
 */
export class BatchProcessor {
  private readonly _config: Required<BatchProcessorConfig>;
  private readonly _transport: ITransport;
  private readonly _pendingTraces: any[] = [];
  private readonly _stats: BatchProcessorStats;

  private _flushTimer: NodeJS.Timeout | null = null;
  private _isShuttingDown = false;
  private _flushPromise: Promise<void> | null = null;
  private _batchIdCounter = 0;

  constructor(transport: ITransport, config: BatchProcessorConfig = {}) {
    this._transport = transport;
    this._config = {
      batchSize: config.batchSize ?? 100,
      flushInterval: config.flushInterval ?? 5000,
      maxQueueSize: config.maxQueueSize ?? 10000,
      maxRetries: config.maxRetries ?? 3,
      debug: config.debug ?? false,
      debugPrefix: config.debugPrefix ?? '[BatchProcessor]',
    };

    this._stats = {
      queueSize: 0,
      batchesSent: 0,
      batchesFailed: 0,
      tracesProcessed: 0,
      tracesDropped: 0,
      retryAttempts: 0,
      isShuttingDown: false,
      lastFlushTime: null,
    };

    this._startBackgroundProcessing();
    this._debugLog('BatchProcessor initialized', { config: this._config });
  }

  /**
   * Add a trace to the processing queue
   */
  addTrace(trace: any): boolean {
    if (this._isShuttingDown) {
      this._debugLog('Rejecting trace - processor is shutting down');
      return false;
    }

    // Check queue size limit
    if (this._pendingTraces.length >= this._config.maxQueueSize) {
      this._stats.tracesDropped++;
      this._debugLog(`Queue overflow - dropping trace (queue size: ${this._pendingTraces.length})`);
      return false;
    }

    this._pendingTraces.push(trace);
    this._stats.queueSize = this._pendingTraces.length;

    this._debugLog(`Added trace to queue (queue size: ${this._pendingTraces.length})`);

    // Trigger immediate flush if batch size reached
    if (this._pendingTraces.length >= this._config.batchSize) {
      this._debugLog('Batch size reached, triggering immediate flush');
      this._triggerFlush();
    }

    return true;
  }

  /**
   * Flush current batch of traces
   */
  async flushBatch(): Promise<void> {
    if (this._pendingTraces.length === 0) {
      this._debugLog('No traces to flush');
      return;
    }

    // Wait for any ongoing flush to complete
    if (this._flushPromise) {
      this._debugLog('Waiting for ongoing flush to complete');
      await this._flushPromise;
    }

    // Check again after waiting
    if (this._pendingTraces.length === 0) {
      return;
    }

    this._flushPromise = this._doFlush();
    try {
      await this._flushPromise;
    } finally {
      this._flushPromise = null;
    }
  }

  /**
   * Immediately flush all pending traces, bypassing timers
   */
  async flushImmediately(): Promise<void> {
    this._debugLog('Immediate flush requested');

    // Cancel any pending timer
    this._cancelFlushTimer();

    // Flush all pending traces
    await this.flushBatch();
  }

  /**
   * Get current processor statistics
   */
  getStats(): BatchProcessorStats {
    return {
      ...this._stats,
      queueSize: this._pendingTraces.length,
      isShuttingDown: this._isShuttingDown,
    };
  }

  /**
   * Shutdown the processor gracefully
   */
  async shutdown(): Promise<void> {
    if (this._isShuttingDown) {
      return;
    }

    this._debugLog('Shutting down batch processor');
    this._isShuttingDown = true;
    this._stats.isShuttingDown = true;

    // Cancel background processing
    this._cancelFlushTimer();

    // Flush any remaining traces
    try {
      await this.flushImmediately();
      this._debugLog('Shutdown complete - all traces flushed');
    } catch (error) {
      this._debugLog('Error during shutdown flush', { error });
      throw error;
    }
  }

  /**
   * Start background processing timer
   */
  private _startBackgroundProcessing(): void {
    this._scheduleNextFlush();
  }

  /**
   * Schedule the next flush operation
   */
  private _scheduleNextFlush(): void {
    if (this._isShuttingDown) {
      return;
    }

    this._flushTimer = setTimeout(() => {
      this._triggerFlush();
    }, this._config.flushInterval);
  }

  /**
   * Cancel the current flush timer
   */
  private _cancelFlushTimer(): void {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
  }

  /**
   * Trigger a flush operation (non-blocking)
   */
  private _triggerFlush(): void {
    // Don't await - let it run in background
    this.flushBatch()
      .then(() => {
        // Schedule next flush after successful completion
        this._scheduleNextFlush();
      })
      .catch(error => {
        this._debugLog('Background flush failed', { error });
        // Still schedule next flush even after failure
        this._scheduleNextFlush();
      });
  }

  /**
   * Perform the actual flush operation
   */
  private async _doFlush(): Promise<void> {
    if (this._pendingTraces.length === 0) {
      return;
    }

    const tracesToFlush = this._pendingTraces.splice(0);
    this._stats.queueSize = 0;

    const batchId = this._generateBatchId();
    this._debugLog(`Flushing batch ${batchId} with ${tracesToFlush.length} traces`);

    const batch = this._createPendingBatch(tracesToFlush, batchId);
    await this._sendBatchWithRetry(batch);
  }

  /**
   * Create a pending batch for processing
   */
  private _createPendingBatch(traces: any[], id: string): PendingBatch {
    return {
      traces,
      createdAt: Date.now(),
      retryCount: 0,
      id,
    };
  }

  /**
   * Send a batch with retry logic
   */
  private async _sendBatchWithRetry(pendingBatch: PendingBatch): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this._config.maxRetries; attempt++) {
      try {
        const batch = this._serializeBatch(pendingBatch);
        await this._transport.send(batch);

        // Success
        this._stats.batchesSent++;
        this._stats.tracesProcessed += pendingBatch.traces.length;
        this._stats.lastFlushTime = Date.now();

        this._debugLog(`Batch ${pendingBatch.id} sent successfully (attempt ${attempt + 1})`);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this._config.maxRetries) {
          this._stats.retryAttempts++;
          pendingBatch.retryCount++;

          const delay = this._calculateRetryDelay(attempt);
          this._debugLog(
            `Batch ${pendingBatch.id} failed, retrying in ${delay}ms (attempt ${attempt + 1}/${this._config.maxRetries + 1})`,
            { error: lastError.message }
          );

          await this._sleep(delay);
        } else {
          this._stats.batchesFailed++;
          this._debugLog(
            `Batch ${pendingBatch.id} failed after ${attempt + 1} attempts, giving up`,
            { error: lastError.message }
          );
        }
      }
    }

    // All retries exhausted
    if (lastError) {
      throw lastError;
    }
  }

  /**
   * Serialize a pending batch to TraceBatch format
   */
  private _serializeBatch(pendingBatch: PendingBatch): TraceBatch {
    const serializedTraces: SerializedTrace[] = pendingBatch.traces.map(trace => {
      // Call serialize method if available, otherwise assume already serialized
      return typeof trace.serialize === 'function' ? trace.serialize() : trace;
    });

    return {
      traces: serializedTraces,
      timestamp: Date.now() / 1000, // Unix timestamp in seconds (Python format)
    };
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private _calculateRetryDelay(attempt: number): number {
    // Exponential backoff: 1s, 2s, 4s, 8s, etc. with jitter
    const baseDelay = Math.pow(2, attempt) * 1000;
    const jitter = Math.random() * 1000; // Add up to 1s jitter
    return Math.min(baseDelay + jitter, 30000); // Cap at 30s
  }

  /**
   * Generate a unique batch ID
   */
  private _generateBatchId(): string {
    return `batch-${Date.now()}-${++this._batchIdCounter}`;
  }

  /**
   * Sleep for specified milliseconds
   */
  private _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Debug logging helper
   */
  private _debugLog(message: string, extra?: any): void {
    if (this._config.debug) {
      const timestamp = new Date().toISOString();
      if (extra) {
        console.log(`${timestamp} ${this._config.debugPrefix} ${message}`, extra);
      } else {
        console.log(`${timestamp} ${this._config.debugPrefix} ${message}`);
      }
    }
  }
}
