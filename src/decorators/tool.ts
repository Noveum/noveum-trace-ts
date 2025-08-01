/**
 * Tool-specific trace decorator for external tool calls and API integrations
 */

import type { Attributes } from '../core/types.js';
import { trace, TraceOptions } from './base.js';

/**
 * Tool operation types
 */
export type ToolType =
  | 'api_call'
  | 'database_query'
  | 'file_operation'
  | 'web_scraping'
  | 'email_send'
  | 'notification'
  | 'computation'
  | 'data_processing'
  | 'authentication'
  | 'payment'
  | 'analytics'
  | 'search'
  | 'transformation'
  | 'validation'
  | 'integration'
  | 'webhook'
  | 'custom';

/**
 * Tool protocol types
 */
export type ToolProtocol =
  | 'http'
  | 'https'
  | 'grpc'
  | 'websocket'
  | 'graphql'
  | 'rest'
  | 'soap'
  | 'ftp'
  | 'ssh'
  | 'tcp'
  | 'udp'
  | 'custom';

/**
 * Tool authentication types
 */
export type ToolAuthType =
  | 'none'
  | 'api_key'
  | 'bearer_token'
  | 'basic_auth'
  | 'oauth1'
  | 'oauth2'
  | 'jwt'
  | 'custom';

/**
 * Tool operation metadata
 */
export interface ToolMetadata {
  /** Tool name or identifier */
  toolName?: string;
  /** Tool type/category */
  toolType?: ToolType;
  /** Tool version */
  toolVersion?: string;
  /** API endpoint or service URL */
  endpoint?: string;
  /** HTTP method for API calls */
  method?: string;
  /** Protocol used */
  protocol?: ToolProtocol;
  /** Authentication type */
  authType?: ToolAuthType;
  /** Request size in bytes */
  requestSize?: number;
  /** Response size in bytes */
  responseSize?: number;
  /** HTTP status code */
  statusCode?: number;
  /** Response time in milliseconds */
  responseTime?: number;
  /** Number of retries attempted */
  retryCount?: number;
  /** Whether request was successful */
  success?: boolean;
  /** Error code if failed */
  errorCode?: string;
  /** Error message if failed */
  errorMessage?: string;
  /** Rate limit information */
  rateLimit?: {
    limit?: number;
    remaining?: number;
    resetTime?: number;
  };
  /** Request headers (filtered for security) */
  requestHeaders?: Record<string, string>;
  /** Response headers (filtered) */
  responseHeaders?: Record<string, string>;
  /** Parameters sent to tool */
  parameters?: Record<string, any>;
  /** Tool execution context */
  context?: Record<string, any>;
  /** Tool dependencies */
  dependencies?: string[];
  /** Cache information */
  cache?: {
    hit?: boolean;
    key?: string;
    ttl?: number;
  };
}

/**
 * Options for the Tool trace decorator
 */
export interface TraceToolOptions extends Omit<TraceOptions, 'attributes'> {
  /** Tool-specific metadata */
  toolMetadata?: Partial<ToolMetadata>;
  /** Additional attributes */
  attributes?: Attributes;
  /** Whether to capture request data */
  captureRequest?: boolean;
  /** Whether to capture response data */
  captureResponse?: boolean;
  /** Whether to capture headers */
  captureHeaders?: boolean;
  /** Maximum length for captured data */
  maxCaptureLength?: number;
  /** Headers to exclude from capture (for security) */
  excludeHeaders?: string[];
  /** Parameters to exclude from capture (for security) */
  excludeParams?: string[];
  /** Whether to track performance metrics */
  trackPerformance?: boolean;
}

/**
 * Performance tracker for tool operations
 */
class ToolPerformanceTracker {
  private startTime: number;
  private networkStartTime?: number;
  private processingStartTime?: number;

  constructor() {
    this.startTime = Date.now();
  }

  markNetworkStart(): void {
    this.networkStartTime = Date.now();
  }

  markNetworkEnd(): number {
    if (this.networkStartTime) {
      return Date.now() - this.networkStartTime;
    }
    return 0;
  }

  markProcessingStart(): void {
    this.processingStartTime = Date.now();
  }

  markProcessingEnd(): number {
    if (this.processingStartTime) {
      return Date.now() - this.processingStartTime;
    }
    return 0;
  }

  getTotalTime(): number {
    return Date.now() - this.startTime;
  }
}

/**
 * Utility function to safely filter headers
 */
function filterHeaders(
  headers: Record<string, string>,
  excludeList: string[]
): Record<string, string> {
  const filtered: Record<string, string> = {};
  const excludeSet = new Set(excludeList.map(h => h.toLowerCase()));

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (
      !excludeSet.has(lowerKey) &&
      !lowerKey.includes('auth') &&
      !lowerKey.includes('token') &&
      !lowerKey.includes('key')
    ) {
      filtered[key] = value;
    }
  }

  return filtered;
}

/**
 * Utility function to safely filter parameters
 */
function filterParameters(params: Record<string, any>, excludeList: string[]): Record<string, any> {
  const filtered: Record<string, any> = {};
  const excludeSet = new Set(excludeList.map(p => p.toLowerCase()));

  for (const [key, value] of Object.entries(params)) {
    const lowerKey = key.toLowerCase();
    if (
      !excludeSet.has(lowerKey) &&
      !lowerKey.includes('password') &&
      !lowerKey.includes('secret') &&
      !lowerKey.includes('token')
    ) {
      filtered[key] = value;
    }
  }

  return filtered;
}

/**
 * Utility function to safely capture data
 */
function safeCapture(data: any, maxLength: number): string {
  try {
    const serialized = typeof data === 'string' ? data : JSON.stringify(data);
    return serialized.length > maxLength
      ? `${serialized.substring(0, maxLength - 3)}...`
      : serialized;
  } catch {
    return String(data).substring(0, maxLength);
  }
}

/**
 * Utility function to extract response metadata
 */
function extractResponseMetadata(response: any): Partial<ToolMetadata> {
  const metadata: Partial<ToolMetadata> = {};

  if (response) {
    // HTTP Response-like object
    if (response.status !== undefined) {
      metadata.statusCode = response.status;
    }
    if (response.headers) {
      metadata.responseHeaders = filterHeaders(response.headers, []);
    }

    // Check for rate limit headers
    const rateLimitHeaders = ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset'];
    if (response.headers && rateLimitHeaders.some(h => response.headers[h])) {
      const limit = response.headers['x-ratelimit-limit']
        ? parseInt(response.headers['x-ratelimit-limit'])
        : undefined;
      const remaining = response.headers['x-ratelimit-remaining']
        ? parseInt(response.headers['x-ratelimit-remaining'])
        : undefined;
      const resetTime = response.headers['x-ratelimit-reset']
        ? parseInt(response.headers['x-ratelimit-reset'])
        : undefined;

      metadata.rateLimit = {};
      if (limit !== undefined && !isNaN(limit)) metadata.rateLimit.limit = limit;
      if (remaining !== undefined && !isNaN(remaining)) metadata.rateLimit.remaining = remaining;
      if (resetTime !== undefined && !isNaN(resetTime)) metadata.rateLimit.resetTime = resetTime;
    }

    // Estimate response size
    if (response.data || response.body) {
      try {
        const content = JSON.stringify(response.data || response.body);
        metadata.responseSize = new Blob([content]).size;
      } catch {
        // Fallback estimation
        metadata.responseSize = String(response.data || response.body || '').length;
      }
    }
  }

  return metadata;
}

/**
 * Tool trace decorator for tracing external tool calls and API integrations
 *
 * @param options - Configuration options for the tool decorator
 * @returns Decorator function
 *
 * @example
 * class APIService {
 *   @traceTool({
 *     name: 'openai-api-call',
 *     toolMetadata: {
 *       toolName: 'OpenAI API',
 *       toolType: 'api_call',
 *       protocol: 'https',
 *       authType: 'bearer_token'
 *     }
 *   })
 *   async callOpenAI(prompt: string) {
 *     // OpenAI API call implementation
 *     const response = await fetch('https://api.openai.com/v1/chat/completions', {
 *       method: 'POST',
 *       headers: { 'Authorization': `Bearer ${this.apiKey}` },
 *       body: JSON.stringify({ model: 'gpt-4', messages: [{ role: 'user', content: prompt }] })
 *     });
 *     return await response.json();
 *   }
 *
 *   @traceTool({
 *     toolMetadata: { toolType: 'database_query' },
 *     captureRequest: true
 *   })
 *   async queryDatabase(sql: string) {
 *     // Database query implementation
 *     return await this.db.query(sql);
 *   }
 * }
 */
export function traceTool(options: TraceToolOptions = {}): any {
  const {
    toolMetadata = {},
    captureRequest = true,
    captureResponse = true,
    captureHeaders = false,
    maxCaptureLength = 2000,
    excludeHeaders = ['authorization', 'cookie', 'x-api-key'],
    excludeParams = ['password', 'secret', 'token', 'key'],
    trackPerformance = true,
    attributes = {},
    ...traceOptions
  } = options;

  // Build attributes from tool metadata
  const toolAttributes: Attributes = {
    ...attributes,
    'tool.operation_type': 'external_call',
    'decorator.type': 'traceTool',
  };

  // Add known tool metadata to attributes
  if (toolMetadata.toolName) toolAttributes['tool.name'] = toolMetadata.toolName;
  if (toolMetadata.toolType) toolAttributes['tool.type'] = toolMetadata.toolType;
  if (toolMetadata.toolVersion) toolAttributes['tool.version'] = toolMetadata.toolVersion;
  if (toolMetadata.endpoint) toolAttributes['tool.endpoint'] = toolMetadata.endpoint;
  if (toolMetadata.method) toolAttributes['tool.method'] = toolMetadata.method;
  if (toolMetadata.protocol) toolAttributes['tool.protocol'] = toolMetadata.protocol;
  if (toolMetadata.authType) toolAttributes['tool.auth_type'] = toolMetadata.authType;

  // Create enhanced trace decorator
  return trace({
    ...traceOptions,
    attributes: toolAttributes,
  })(function decorator(
    target: any,
    _propertyKey?: string | symbol,
    descriptor?: PropertyDescriptor
  ) {
    // Get the original method/function
    const original = descriptor?.value || target;

    // Create wrapper that captures tool operation data
    const wrapper = async function (this: any, ...args: any[]) {
      const tracker = trackPerformance ? new ToolPerformanceTracker() : null;

      try {
        // Capture request data if enabled
        if (captureRequest && args.length > 0) {
          const currentSpan = require('../context/context-manager.js').getCurrentSpan();
          if (currentSpan) {
            // Capture input parameters
            const requestData = args.length === 1 ? args[0] : args;
            const filteredParams =
              typeof requestData === 'object' && requestData !== null
                ? filterParameters(requestData, excludeParams)
                : requestData;

            currentSpan.setAttribute('tool.request', safeCapture(filteredParams, maxCaptureLength));
            currentSpan.setAttribute('tool.request_size', JSON.stringify(args).length);
            currentSpan.setAttribute('tool.parameter_count', args.length);

            // Estimate request size
            try {
              const requestSize = new Blob([JSON.stringify(args)]).size;
              currentSpan.setAttribute('tool.request_size_bytes', requestSize);
            } catch {
              // Fallback
              currentSpan.setAttribute('tool.request_size_bytes', JSON.stringify(args).length);
            }
          }
        }

        // Mark network start if tracking performance
        if (tracker) {
          tracker.markNetworkStart();
        }

        // Call original function
        const result = await Promise.resolve(original.apply(this, args));

        // Mark network end and processing start
        if (tracker) {
          tracker.markNetworkEnd();
          tracker.markProcessingStart();
        }

        // Capture response and metadata
        const currentSpan = require('../context/context-manager.js').getCurrentSpan();
        if (currentSpan) {
          // Extract response metadata
          const responseMetadata = extractResponseMetadata(result);

          // Add response metadata to span
          if (responseMetadata.statusCode !== undefined) {
            currentSpan.setAttribute('tool.status_code', responseMetadata.statusCode);
            currentSpan.setAttribute(
              'tool.success',
              responseMetadata.statusCode >= 200 && responseMetadata.statusCode < 300
            );
          } else {
            currentSpan.setAttribute('tool.success', true);
          }

          if (responseMetadata.responseSize !== undefined) {
            currentSpan.setAttribute('tool.response_size_bytes', responseMetadata.responseSize);
          }

          // Add rate limit information if available
          if (responseMetadata.rateLimit) {
            if (responseMetadata.rateLimit.limit !== undefined) {
              currentSpan.setAttribute('tool.rate_limit.limit', responseMetadata.rateLimit.limit);
            }
            if (responseMetadata.rateLimit.remaining !== undefined) {
              currentSpan.setAttribute(
                'tool.rate_limit.remaining',
                responseMetadata.rateLimit.remaining
              );
            }
            if (responseMetadata.rateLimit.resetTime !== undefined) {
              currentSpan.setAttribute(
                'tool.rate_limit.reset_time',
                responseMetadata.rateLimit.resetTime
              );
            }
          }

          // Capture response data if enabled
          if (captureResponse && result !== undefined) {
            currentSpan.setAttribute('tool.response', safeCapture(result, maxCaptureLength));
            currentSpan.setAttribute('tool.response_type', typeof result);

            // Add response statistics
            if (Array.isArray(result)) {
              currentSpan.setAttribute('tool.response_array_length', result.length);
            } else if (typeof result === 'object' && result !== null) {
              currentSpan.setAttribute('tool.response_object_keys', Object.keys(result).length);
            }
          }

          // Capture headers if enabled
          if (captureHeaders && responseMetadata.responseHeaders) {
            const filteredHeaders = filterHeaders(responseMetadata.responseHeaders, excludeHeaders);
            if (Object.keys(filteredHeaders).length > 0) {
              currentSpan.setAttribute('tool.response_headers', JSON.stringify(filteredHeaders));
            }
          }

          // Add performance metrics
          if (tracker) {
            const processingTime = tracker.markProcessingEnd();
            const totalTime = tracker.getTotalTime();

            currentSpan.setAttribute('tool.total_time_ms', totalTime);
            if (processingTime > 0) {
              currentSpan.setAttribute('tool.processing_time_ms', processingTime);
            }

            // Calculate efficiency metrics
            if (responseMetadata.responseSize && totalTime > 0) {
              const throughput = Math.round((responseMetadata.responseSize / totalTime) * 1000); // bytes per second
              currentSpan.setAttribute('tool.throughput_bytes_per_second', throughput);
            }
          }

          // Add tool-specific result metadata
          if (result && typeof result === 'object') {
            if (result.cache !== undefined) {
              currentSpan.setAttribute('tool.cache_hit', result.cache);
            }
            if (result.version) {
              currentSpan.setAttribute('tool.api_version', result.version);
            }
            if (result.requestId || result.request_id) {
              currentSpan.setAttribute('tool.request_id', result.requestId || result.request_id);
            }
          }
        }

        return result;
      } catch (error) {
        // Add error-specific tool attributes
        const currentSpan = require('../context/context-manager.js').getCurrentSpan();
        if (currentSpan) {
          currentSpan.setAttribute('tool.success', false);
          currentSpan.setAttribute('tool.error', true);

          if (error instanceof Error) {
            currentSpan.setAttribute('tool.error_type', error.constructor.name);
            currentSpan.setAttribute(
              'tool.error_message',
              error.message.length > maxCaptureLength
                ? `${error.message.substring(0, maxCaptureLength - 3)}...`
                : error.message
            );
          }

          // Extract HTTP error details if available
          if (error && typeof error === 'object') {
            const errorObj = error as any;
            if (errorObj.status || errorObj.statusCode) {
              currentSpan.setAttribute(
                'tool.error_status_code',
                errorObj.status || errorObj.statusCode
              );
            }
            if (errorObj.code) {
              currentSpan.setAttribute('tool.error_code', errorObj.code);
            }
          }

          // Add performance metrics even on error
          if (tracker) {
            const totalTime = tracker.getTotalTime();
            currentSpan.setAttribute('tool.total_time_ms', totalTime);
          }
        }
        throw error;
      }
    };

    // Apply the wrapper based on decoration type
    if (descriptor) {
      descriptor.value = wrapper;
      return descriptor;
    } else {
      return wrapper;
    }
  });
}

/**
 * Simple tool trace decorator without options
 */
export const simpleToolTrace = traceTool();

/**
 * Create a reusable tool decorator with preset options
 *
 * @param defaultOptions - Default options for the tool decorator
 * @returns Tool decorator factory
 *
 * @example
 * const traceOpenAITool = createToolDecorator({
 *   toolMetadata: {
 *     toolName: 'OpenAI API',
 *     toolType: 'api_call',
 *     protocol: 'https',
 *     authType: 'bearer_token'
 *   },
 *   captureResponse: true,
 *   trackPerformance: true
 * });
 *
 * class OpenAIService {
 *   @traceOpenAITool({ toolMetadata: { method: 'POST' } })
 *   async createCompletion(prompt: string) {
 *     // implementation
 *   }
 * }
 */
export function createToolDecorator(defaultOptions: TraceToolOptions) {
  return function (options: Partial<TraceToolOptions> = {}) {
    return traceTool({
      ...defaultOptions,
      ...options,
      toolMetadata: {
        ...defaultOptions.toolMetadata,
        ...options.toolMetadata,
      },
      attributes: {
        ...defaultOptions.attributes,
        ...options.attributes,
      },
      excludeHeaders: [...(defaultOptions.excludeHeaders || []), ...(options.excludeHeaders || [])],
      excludeParams: [...(defaultOptions.excludeParams || []), ...(options.excludeParams || [])],
    });
  };
}

/**
 * Predefined tool decorators for common tool types
 */
export const traceAPICall = createToolDecorator({
  toolMetadata: { toolType: 'api_call' },
  name: 'api-call',
});

export const traceDatabaseQuery = createToolDecorator({
  toolMetadata: { toolType: 'database_query' },
  name: 'database-query',
});

export const traceFileOperation = createToolDecorator({
  toolMetadata: { toolType: 'file_operation' },
  name: 'file-operation',
});

export const traceWebScraping = createToolDecorator({
  toolMetadata: { toolType: 'web_scraping' },
  name: 'web-scraping',
});

export const traceEmailSend = createToolDecorator({
  toolMetadata: { toolType: 'email_send' },
  name: 'email-send',
});

export const traceNotification = createToolDecorator({
  toolMetadata: { toolType: 'notification' },
  name: 'notification',
});

export const traceWebhook = createToolDecorator({
  toolMetadata: { toolType: 'webhook' },
  name: 'webhook',
});

export const tracePayment = createToolDecorator({
  toolMetadata: { toolType: 'payment' },
  name: 'payment',
});
