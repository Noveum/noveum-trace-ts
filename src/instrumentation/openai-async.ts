/**
 * OpenAI Async and Streaming Integration
 *
 * Provides comprehensive async and streaming support for OpenAI SDK instrumentation,
 * with full context propagation, chunk-level metadata, and concurrent safety.
 */

import type { ISpan, ITrace } from '../core/interfaces.js';
import { getGlobalContextManager } from '../context/context-manager.js';
import {
  extractSpanAttributes,
  type ValidationConfig,
  DEFAULT_VALIDATION_CONFIG,
} from './openai-attributes.js';
import { detectSDKVersion, normalizeResponse, type SDKVersionInfo } from './openai-compat.js';
import { DiagnosticError, categorizeError } from './openai-errors.js';
import { extract_streaming_metadata } from '../llm/metadata.js';
import { SpanStatus } from '../core/types.js';

/**
 * Streaming trace context with chunk-level tracking
 */
export interface StreamingTraceContext {
  trace: ITrace;
  span: ISpan;
  startTime: number;
  chunks: Array<{
    timestamp: number;
    data: any;
    content?: string;
    tokens?: number;
  }>;
  metadata: {
    model?: string;
    operation: string;
    sdk_version?: SDKVersionInfo;
    request_params?: any;
  };
  config: ValidationConfig;
}

/**
 * Async operation context for concurrent safety
 */
export interface AsyncOperationContext {
  operationId: string;
  startTime: number;
  endTime?: number;
  isStreaming: boolean;
  contextManager: any;
  activeContexts: Map<string, any>;
}

/**
 * Enhanced async OpenAI instrumentation with streaming support
 */
export class AsyncOpenAIInstrumentation {
  private readonly streamingContexts = new Map<string, StreamingTraceContext>();
  private readonly asyncOperations = new Map<string, AsyncOperationContext>();
  private readonly operationTimeouts = new Map<string, NodeJS.Timeout>();
  private readonly contextManager = getGlobalContextManager();

  // Default cleanup timeout: 5 minutes (300,000ms)
  private readonly defaultCleanupTimeoutMs = 300000;

  // Maximum chunks to keep in memory per streaming operation
  private readonly MAX_CHUNKS_IN_MEMORY = 1000;

  /**
   * Schedule cleanup of operation context after timeout to prevent memory leaks
   */
  private scheduleCleanup(
    operationId: string,
    timeoutMs: number = this.defaultCleanupTimeoutMs
  ): void {
    const timeout = setTimeout(() => {
      this.streamingContexts.delete(operationId);
      this.asyncOperations.delete(operationId);
      this.operationTimeouts.delete(operationId);

      if (process.env.NODE_ENV !== 'test') {
        console.warn(
          `[OpenAI Instrumentation] Cleaned up stale operation ${operationId} after ${timeoutMs}ms timeout`
        );
      }
    }, timeoutMs);

    this.operationTimeouts.set(operationId, timeout);
  }

  /**
   * Clear cleanup timeout when operation completes successfully
   */
  private clearCleanupTimeout(operationId: string): void {
    const timeout = this.operationTimeouts.get(operationId);
    if (timeout) {
      clearTimeout(timeout);
      this.operationTimeouts.delete(operationId);
    }
  }

  /**
   * Instrument async OpenAI method with comprehensive tracing
   */
  async instrumentAsyncMethod<T>(
    instance: any,
    methodName: string,
    originalMethod: Function,
    args: any[],
    context?: { trace?: ITrace; config?: ValidationConfig }
  ): Promise<T> {
    const operationId = this.generateOperationId();
    const startTime = Date.now();
    const isStreaming = this.isStreamingOperation(args);

    // Create async operation context
    const asyncContext: AsyncOperationContext = {
      operationId,
      startTime,
      isStreaming,
      contextManager: this.contextManager,
      activeContexts: new Map(),
    };

    this.asyncOperations.set(operationId, asyncContext);

    // Schedule cleanup timeout to prevent memory leaks
    this.scheduleCleanup(operationId);

    try {
      // Detect SDK version and create span context
      const sdkVersion = detectSDKVersion(instance);
      const activeTrace = context?.trace || this.contextManager.getActiveTrace();

      if (!activeTrace) {
        throw new Error('No active trace found for OpenAI instrumentation');
      }

      const span = await activeTrace.startSpan(`openai.${methodName}`, {
        attributes: {
          'llm.provider': 'openai',
          'llm.operation': methodName,
          'llm.sdk.version': sdkVersion.fullVersion,
          'llm.sdk.is_legacy': sdkVersion.isLegacy,
          'llm.async.operation_id': operationId,
          'llm.async.is_streaming': isStreaming,
        },
      });

      // Extract initial span attributes
      try {
        const extractionResult = await extractSpanAttributes(
          methodName,
          args[0],
          undefined,
          undefined,
          {
            sdk_version: sdkVersion,
            start_time: startTime,
          },
          context?.config || DEFAULT_VALIDATION_CONFIG
        );

        span.setAttributes(extractionResult.attributes);

        if (extractionResult.warnings.length > 0) {
          span.addEvent('attribute_extraction_warnings', {
            warnings: extractionResult.warnings.join(', '),
          });
        }
      } catch (extractionError) {
        span.addEvent('attribute_extraction_error', {
          error: extractionError instanceof Error ? extractionError.message : 'Unknown error',
        });
      }

      // Handle streaming vs non-streaming operations
      if (isStreaming) {
        return await this.handleStreamingOperation(
          span,
          activeTrace,
          originalMethod,
          instance,
          args,
          {
            operationId,
            startTime,
            methodName,
            sdkVersion,
            config: context?.config || DEFAULT_VALIDATION_CONFIG,
          }
        );
      } else {
        return await this.handleNonStreamingOperation(span, originalMethod, instance, args, {
          operationId,
          startTime,
          methodName,
          sdkVersion,
          config: context?.config || DEFAULT_VALIDATION_CONFIG,
        });
      }
    } catch (error) {
      // Handle errors with diagnostic information
      const diagnosticError = new DiagnosticError(error, {
        operation: methodName,
        sdk_version: detectSDKVersion(instance),
        config: context?.config,
      });

      // Log structured error information
      console.error('OpenAI async operation failed:', diagnosticError.toStructuredLog());

      throw diagnosticError;
    } finally {
      asyncContext.endTime = Date.now();
      this.clearCleanupTimeout(operationId);
      this.asyncOperations.delete(operationId);
    }
  }

  /**
   * Handle streaming OpenAI operations with chunk-level tracing
   */
  private async handleStreamingOperation<T>(
    span: ISpan,
    trace: ITrace,
    originalMethod: Function,
    instance: any,
    args: any[],
    context: {
      operationId: string;
      startTime: number;
      methodName: string;
      sdkVersion: SDKVersionInfo;
      config: ValidationConfig;
    }
  ): Promise<T> {
    const streamingContext: StreamingTraceContext = {
      trace,
      span,
      startTime: context.startTime,
      chunks: [],
      metadata: {
        operation: context.methodName,
        sdk_version: context.sdkVersion,
        request_params: args[0],
      },
      config: context.config,
    };

    this.streamingContexts.set(context.operationId, streamingContext);

    try {
      // Execute the original streaming method
      const result = await this.contextManager.withSpanAsync(span, async () => {
        return await originalMethod.apply(instance, args);
      });

      // Handle different types of streaming responses
      if (this.isAsyncIterable(result)) {
        return (await this.instrumentAsyncIterable(result, streamingContext)) as T;
      } else if (this.isNodeStream(result)) {
        return (await this.instrumentNodeStream(result, streamingContext)) as T;
      } else {
        // Handle direct streaming response
        return (await this.instrumentDirectStream(result, streamingContext)) as T;
      }
    } finally {
      this.clearCleanupTimeout(context.operationId);
      this.streamingContexts.delete(context.operationId);
    }
  }

  /**
   * Handle non-streaming OpenAI operations
   */
  private async handleNonStreamingOperation<T>(
    span: ISpan,
    originalMethod: Function,
    instance: any,
    args: any[],
    context: {
      operationId: string;
      startTime: number;
      methodName: string;
      sdkVersion: SDKVersionInfo;
      config: ValidationConfig;
    }
  ): Promise<T> {
    try {
      // Execute the original method in span context
      const result = await this.contextManager.withSpanAsync(span, async () => {
        return await originalMethod.apply(instance, args);
      });

      const endTime = Date.now();

      // Extract response attributes
      try {
        const normalizedResponse = normalizeResponse(result, context.sdkVersion);
        const extractionResult = await extractSpanAttributes(
          context.methodName,
          args[0],
          normalizedResponse,
          undefined,
          {
            sdk_version: context.sdkVersion,
            start_time: context.startTime,
            end_time: endTime,
          },
          context.config
        );

        span.setAttributes(extractionResult.attributes);

        // Add performance metrics
        span.setAttributes({
          'llm.latency.total': endTime - context.startTime,
        });

        if (extractionResult.warnings.length > 0) {
          span.addEvent('response_extraction_warnings', {
            warnings: extractionResult.warnings.join(', '),
          });
        }
      } catch (extractionError) {
        span.addEvent('response_extraction_error', {
          error: extractionError instanceof Error ? extractionError.message : 'Unknown error',
        });
      }

      span.setStatus(SpanStatus.OK);
      await span.finish();

      return result;
    } catch (error) {
      // Handle and categorize errors
      const structuredError = categorizeError(error, {
        operation: context.methodName,
        sdk_version: context.sdkVersion,
      });

      span.addEvent('error', {
        'error.type': structuredError.category,
        'error.message': structuredError.message,
        'error.guidance': structuredError.actionable_guidance,
      });

      span.setStatus(SpanStatus.ERROR, structuredError.message);
      await span.finish();

      throw error;
    }
  }

  /**
   * Instrument AsyncIterable streams (modern OpenAI SDK)
   */
  private async instrumentAsyncIterable<T>(
    iterable: AsyncIterable<any>,
    context: StreamingTraceContext
  ): Promise<T> {
    const chunks: any[] = [];
    let firstChunkTime: number | undefined;
    let lastChunkTime: number;
    let totalContent = '';
    let chunkCount = 0;

    try {
      // Create reference to class methods for use in async iterator
      const extractChunkContent = this.extractChunkContent.bind(this);
      const maxChunksInMemory = this.MAX_CHUNKS_IN_MEMORY;

      // Create instrumented async iterable
      const instrumentedIterable = {
        async *[Symbol.asyncIterator](): AsyncIterator<any> {
          for await (const chunk of iterable) {
            const chunkTime = Date.now();

            if (!firstChunkTime) {
              firstChunkTime = chunkTime;
              context.span.addEvent('first_chunk_received', {
                'llm.streaming.first_chunk_latency': chunkTime - context.startTime,
              });
            }

            lastChunkTime = chunkTime;
            chunkCount++;

            // Extract chunk metadata
            try {
              const chunkMetadata = extract_streaming_metadata(
                chunk,
                context.metadata.request_params?.model,
                'openai'
              );

              // Extract content from chunk
              const content = extractChunkContent(chunk);
              if (content) {
                totalContent += content;
              }

              // Store chunk information
              const chunkData: any = {
                timestamp: chunkTime,
                data: chunk,
              };
              if (content !== undefined) chunkData.content = content;
              if (chunkMetadata.tokens?.output !== undefined)
                chunkData.tokens = chunkMetadata.tokens.output;

              context.chunks.push(chunkData);

              // Prevent memory leak by limiting chunks in memory
              if (context.chunks.length > maxChunksInMemory) {
                context.chunks.shift(); // Remove oldest chunk
              }

              // Add chunk event to span
              const eventAttrs: any = {
                'llm.streaming.chunk_index': chunkCount,
                'llm.streaming.chunk_content_length': content?.length || 0,
                'llm.streaming.chunk_tokens': chunkMetadata.tokens?.output || 0,
              };
              if (chunkMetadata.finish_reason !== undefined) {
                eventAttrs['llm.streaming.finish_reason'] = chunkMetadata.finish_reason;
              }
              context.span.addEvent('stream_chunk', eventAttrs);
            } catch (chunkError) {
              context.span.addEvent('chunk_processing_error', {
                'error.message': chunkError instanceof Error ? chunkError.message : 'Unknown error',
                'llm.streaming.chunk_index': chunkCount,
              });
            }

            chunks.push(chunk);
            yield chunk;
          }
        },
      };

      // Finalize streaming metrics
      const streamingMetrics: any = {
        chunk_count: chunkCount,
        last_chunk_time: lastChunkTime!,
        total_content: totalContent,
      };
      if (firstChunkTime !== undefined) streamingMetrics.first_chunk_time = firstChunkTime;

      await this.finalizeStreamingMetrics(context, streamingMetrics);

      return instrumentedIterable as T;
    } catch (error) {
      context.span.addEvent('streaming_error', {
        'error.type': error instanceof Error ? error.name : 'Unknown',
        'error.message': error instanceof Error ? error.message : 'Unknown error',
      });

      context.span.setStatus(SpanStatus.ERROR, 'Streaming operation failed');
      await context.span.finish();

      throw error;
    }
  }

  /**
   * Instrument Node.js streams (legacy support)
   */
  private async instrumentNodeStream<T>(stream: any, context: StreamingTraceContext): Promise<T> {
    return new Promise((resolve, reject) => {
      const chunks: any[] = [];
      let firstChunkTime: number | undefined;
      let chunkCount = 0;

      stream.on('data', (chunk: any) => {
        const chunkTime = Date.now();

        if (!firstChunkTime) {
          firstChunkTime = chunkTime;
        }

        chunkCount++;
        chunks.push(chunk);

        context.span.addEvent('stream_chunk', {
          'llm.streaming.chunk_index': chunkCount,
          'llm.streaming.chunk_size': chunk?.length || 0,
        });
      });

      stream.on('end', async () => {
        try {
          const streamingMetrics: any = {
            chunk_count: chunkCount,
            last_chunk_time: Date.now(),
            total_content: chunks.join(''),
          };
          if (firstChunkTime !== undefined) streamingMetrics.first_chunk_time = firstChunkTime;

          await this.finalizeStreamingMetrics(context, streamingMetrics);

          resolve(stream as T);
        } catch (error) {
          reject(error);
        }
      });

      stream.on('error', (error: Error) => {
        context.span.addEvent('streaming_error', {
          'error.message': error.message,
        });

        context.span.setStatus(SpanStatus.ERROR, error.message);
        reject(error);
      });
    });
  }

  /**
   * Instrument direct streaming responses
   */
  private async instrumentDirectStream<T>(
    response: any,
    context: StreamingTraceContext
  ): Promise<T> {
    // For direct responses that are already streamed/completed
    await this.finalizeStreamingMetrics(context, {
      chunk_count: 1,
      first_chunk_time: Date.now(),
      last_chunk_time: Date.now(),
      total_content: response?.choices?.[0]?.message?.content || '',
    });

    return response as T;
  }

  /**
   * Finalize streaming metrics and complete span
   */
  private async finalizeStreamingMetrics(
    context: StreamingTraceContext,
    metrics: {
      chunk_count: number;
      first_chunk_time?: number;
      last_chunk_time: number;
      total_content: string;
    }
  ): Promise<void> {
    const endTime = Date.now();
    const totalLatency = endTime - context.startTime;
    const firstTokenLatency = metrics.first_chunk_time
      ? metrics.first_chunk_time - context.startTime
      : undefined;

    // Set streaming attributes
    const streamingAttributes: any = {
      'llm.streaming.enabled': true,
      'llm.streaming.chunk_count': metrics.chunk_count,
      'llm.latency.total': totalLatency,
      'llm.content.output_text_length': metrics.total_content.length,
    };

    if (firstTokenLatency) {
      streamingAttributes['llm.latency.first_token'] = firstTokenLatency;
    }

    if (metrics.chunk_count > 0 && totalLatency > 0) {
      streamingAttributes['llm.latency.chunks_per_second'] =
        metrics.chunk_count / (totalLatency / 1000);
    }

    context.span.setAttributes(streamingAttributes);

    // Extract final response attributes if available
    try {
      const extractionContext: any = {
        start_time: context.startTime,
        end_time: endTime,
        streaming_metadata: {
          chunk_count: metrics.chunk_count,
          first_chunk_time: metrics.first_chunk_time,
          last_chunk_time: metrics.last_chunk_time,
        },
      };
      if (context.metadata.sdk_version !== undefined) {
        extractionContext.sdk_version = context.metadata.sdk_version;
      }

      const extractionResult = await extractSpanAttributes(
        context.metadata.operation,
        context.metadata.request_params,
        undefined,
        undefined,
        extractionContext,
        context.config
      );

      context.span.setAttributes(extractionResult.attributes);
    } catch (extractionError) {
      context.span.addEvent('final_extraction_error', {
        error: extractionError instanceof Error ? extractionError.message : 'Unknown error',
      });
    }

    context.span.setStatus(SpanStatus.OK);
    await context.span.finish();
  }

  /**
   * Utility methods
   */
  private generateOperationId(): string {
    return `openai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private isStreamingOperation(args: any[]): boolean {
    return args?.[0]?.stream === true;
  }

  private isAsyncIterable(obj: any): boolean {
    return obj && typeof obj[Symbol.asyncIterator] === 'function';
  }

  private isNodeStream(obj: any): boolean {
    return obj && typeof obj.on === 'function' && typeof obj.pipe === 'function';
  }

  private extractChunkContent(chunk: any): string | undefined {
    // Extract content from different chunk formats
    if (chunk?.choices?.[0]?.delta?.content) {
      return chunk.choices[0].delta.content;
    }
    if (chunk?.choices?.[0]?.text) {
      return chunk.choices[0].text;
    }
    if (chunk?.content) {
      return chunk.content;
    }
    return undefined;
  }

  /**
   * Get active streaming contexts (for debugging/monitoring)
   */
  getActiveStreamingContexts(): Array<{
    operationId: string;
    startTime: number;
    chunkCount: number;
  }> {
    return Array.from(this.streamingContexts.entries()).map(([operationId, context]) => ({
      operationId,
      startTime: context.startTime,
      chunkCount: context.chunks.length,
    }));
  }

  /**
   * Get active async operations (for debugging/monitoring)
   */
  getActiveAsyncOperations(): Array<{
    operationId: string;
    startTime: number;
    isStreaming: boolean;
  }> {
    return Array.from(this.asyncOperations.values()).map(context => ({
      operationId: context.operationId,
      startTime: context.startTime,
      isStreaming: context.isStreaming,
    }));
  }

  /**
   * Clean up resources (should be called on shutdown)
   */
  cleanup(): void {
    // Clear all pending timeouts
    for (const timeout of this.operationTimeouts.values()) {
      clearTimeout(timeout);
    }

    this.streamingContexts.clear();
    this.asyncOperations.clear();
    this.operationTimeouts.clear();
  }
}
