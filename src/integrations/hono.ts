/**
 * Hono integration for the Noveum Trace SDK
 */

// Note: Hono types are optional - this integration will work when Hono is installed
type Context = any;
type Next = any;
type MiddlewareHandler = any;
import type { INoveumClient, ISpan } from '../core/interfaces.js';
import type { HonoIntegrationOptions } from '../core/types.js';
import { SpanKind, SpanStatus } from '../core/types.js';
import { getGlobalContextManager } from '../context/context-manager.js';
import { extractErrorInfo } from '../utils/index.js';

/**
 * Extended Hono Context with tracing information
 */
export interface TracedContext {
  req: {
    url: string;
    method: string;
    routePath?: string;
    header: (name?: string) => any;
    text?: () => Promise<string>;
  };
  res?: {
    status: number;
    headers: Map<string, string>;
    text?: string;
  };
  trace?: {
    span: ISpan;
    traceId: string;
    spanId: string;
  };
}

/**
 * Options for Hono tracing middleware
 */
export interface HonoTracingOptions extends HonoIntegrationOptions {
  /**
   * Custom span name generator
   */
  getSpanName?: (c: Context) => string;

  /**
   * Custom attribute extractor
   */
  getAttributes?: (c: Context) => Record<string, any>;

  /**
   * Filter function to determine if request should be traced
   */
  shouldTrace?: (c: Context) => boolean;

  /**
   * Error handler for tracing errors
   */
  onError?: (error: Error, c: Context) => void;
}

/**
 * Create Hono middleware for automatic request tracing
 */
export function noveumTrace(
  client: INoveumClient,
  options: HonoTracingOptions = {}
): MiddlewareHandler {
  const {
    enabled = true,
    ignoreRoutes = [],
    captureHeaders = false,
    getSpanName = defaultGetSpanName,
    getAttributes = defaultGetAttributes,
    shouldTrace = defaultShouldTrace,
    onError = defaultOnError,
  } = options;

  if (!enabled) {
    return (_c: any, next: any) => next();
  }

  const ignoreSet = new Set(ignoreRoutes);

  return async (c: TracedContext, next: Next) => {
    try {
      const path = new URL(c.req.url).pathname;

      // Check if this route should be ignored
      if (ignoreSet.has(path) || !shouldTrace(c)) {
        return next();
      }

      const spanName = getSpanName(c);
      const span = await client.startSpan(spanName, {
        kind: SpanKind.SERVER,
        attributes: {
          'http.method': c.req.method,
          'http.url': c.req.url,
          'http.route': c.req.routePath || path,
          'http.user_agent': c.req.header('User-Agent') || '',
          'hono.route_path': c.req.routePath || '',
        },
      });

      // Add custom attributes
      const customAttributes = getAttributes(c);
      if (customAttributes && Object.keys(customAttributes).length > 0) {
        span.setAttributes(customAttributes);
      }

      // Capture headers if enabled
      if (captureHeaders) {
        const headers: Record<string, string> = {};
        Object.entries(c.req.header()).forEach(([key, value]) => {
          if (typeof value === 'string') {
            headers[`http.request.header.${key.toLowerCase()}`] = value;
          }
        });
        span.setAttributes(headers);
      }

      // Attach trace info to context
      c.trace = {
        span,
        traceId: span.traceId,
        spanId: span.spanId,
      };

      let responseFinished = false;

      try {
        // Run the request in the span context
        await getGlobalContextManager().withSpanAsync(span, async () => {
          await next();
        });

        // Capture response information
        const res = c.res;
        if (res) {
          span.setAttributes({
            'http.status_code': res.status,
          });

          // Capture response headers if enabled
          if (captureHeaders) {
            const responseHeaders: Record<string, string> = {};
            res.headers.forEach((value, key) => {
              responseHeaders[`http.response.header.${key.toLowerCase()}`] = value;
            });
            span.setAttributes(responseHeaders);
          }

          // Set span status based on HTTP status
          if (res.status >= 400) {
            span.setStatus(SpanStatus.ERROR, `HTTP ${res.status}`);
          } else {
            span.setStatus(SpanStatus.OK);
          }
        }

        responseFinished = true;
        await span.finish();
      } catch (error) {
        const errorInfo = extractErrorInfo(error);

        span.addEvent('error', {
          'error.type': errorInfo.name,
          'error.message': errorInfo.message || '',
          'error.stack': errorInfo.stack || '',
        });

        span.setStatus(SpanStatus.ERROR, errorInfo.message);

        if (!responseFinished) {
          await span.finish();
        }

        // Call onError handler if provided
        if (onError) {
          onError(error as Error, c as TracedContext);
        }

        // Re-throw error to let the framework handle it properly
        throw error;
      }
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)), c);
      throw error;
    }
  };
}

/**
 * Wrapper function for noveumTrace that matches test expectations
 */
export function noveumMiddleware(
  options: { client: INoveumClient } & HonoTracingOptions = {} as any
): MiddlewareHandler {
  const { client, ...traceOptions } = options;
  return noveumTrace(client, traceOptions);
}

/**
 * Get current span from Hono context
 */
export function getCurrentSpan(c: TracedContext): ISpan | undefined {
  return c.trace?.span;
}

/**
 * Get current trace ID from Hono context
 */
export function getCurrentTraceId(c: TracedContext): string | undefined {
  return c.trace?.traceId;
}

/**
 * Add attributes to the current request span
 */
export function addSpanAttributes(c: TracedContext, attributes: Record<string, any>): void {
  const span = c.trace?.span;
  if (span && !span.isFinished) {
    span.setAttributes(attributes);
  }
}

/**
 * Add an event to the current request span
 */
export function addSpanEvent(
  c: TracedContext,
  name: string,
  attributes?: Record<string, any>
): void {
  const span = c.trace?.span;
  if (span && !span.isFinished) {
    span.addEvent(name, attributes);
  }
}

/**
 * Decorator for tracing Hono handlers
 */
export function traced(client: INoveumClient, spanName?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    if (!descriptor || !descriptor.value) {
      throw new Error('traced decorator can only be applied to methods');
    }

    const originalMethod = descriptor.value;

    descriptor.value = async function (c: TracedContext) {
      const currentSpan = c.trace?.span;

      if (!currentSpan) {
        return originalMethod.call(this, c);
      }

      const childSpanName = spanName || `${target.constructor.name}.${propertyKey}`;

      // Create child span for the handler
      const childSpan = await client.startSpan(childSpanName, {
        parent_span_id: currentSpan.spanId,
      });

      const result = await getGlobalContextManager().withSpanAsync(childSpan, async () => {
        return originalMethod.call(this, c);
      });

      await childSpan.finish();
      return result;
    };

    return descriptor;
  };
}

/**
 * Function to create a traced handler (for test compatibility)
 */
export function createTracedHonoHandler(
  handler: (c: TracedContext) => Promise<any>,
  spanName: string,
  options: { client: INoveumClient } & HonoTracingOptions = {} as any
) {
  const { client } = options;

  return async function (c: TracedContext) {
    if (!client) {
      return handler(c);
    }

    const contextManager = getGlobalContextManager();

    try {
      const span = await client.startSpan(spanName || `${c.req.method} ${c.req.url}`, {
        kind: SpanKind.SERVER,
        attributes: {
          'http.method': c.req.method,
          'http.url': c.req.url,
          'http.route': c.req.routePath || c.req.url || 'unknown',
        },
      });

      return contextManager.withSpanAsync(span, async () => {
        try {
          const result = await handler(c);

          if (c.res?.status) {
            span.setAttribute('http.status_code', c.res.status);

            if (c.res.status >= 400) {
              span.setStatus(SpanStatus.ERROR);
            }
          }

          return result;
        } catch (error) {
          const errorInfo = extractErrorInfo(error);
          span.setStatus(SpanStatus.ERROR, errorInfo.message);
          span.addEvent('exception', {
            'exception.type': errorInfo.name,
            'exception.message': errorInfo.message,
            'exception.stacktrace': errorInfo.stack || '',
          });
          throw error;
        } finally {
          await span.finish();
        }
      });
    } catch {
      // If tracing fails, still call the handler
      return handler(c);
    }
  };
}

// Alias for backwards compatibility with tests
export const tracedHandler = createTracedHonoHandler;

/**
 * Middleware to add timing information
 */
export function timingMiddleware(): MiddlewareHandler {
  return async (c: TracedContext, next: Next) => {
    const start = performance.now();

    await next();

    const duration = performance.now() - start;
    const span = c.trace?.span;

    if (span && !span.isFinished) {
      span.setAttribute('http.duration_ms', duration);
    }
  };
}

/**
 * Middleware to capture request/response body
 */
export function bodyCapturingMiddleware(
  options: {
    captureRequest?: boolean;
    captureResponse?: boolean;
    maxBodySize?: number;
  } = {}
): MiddlewareHandler {
  const { captureRequest = false, captureResponse = false, maxBodySize = 1000 } = options;

  return async (c: TracedContext, next: Next) => {
    const span = c.trace?.span;

    if (!span || span.isFinished) {
      return next();
    }

    // Capture request body
    if (captureRequest) {
      try {
        const contentType = c.req.header('Content-Type') || '';

        if (contentType.includes('application/json') || contentType.includes('text/')) {
          if (c.req.text) {
            const body = await c.req.text();

            if (body.length <= maxBodySize) {
              span.setAttribute('http.request.body', body);
            } else {
              span.setAttribute('http.request.body_size', body.length);
            }
          }
        }
      } catch {
        span.setAttribute('http.request.body_error', 'Failed to capture body');
      }
    }

    await next();

    // Capture response body
    if (captureResponse && c.res && c.res.text) {
      try {
        const responseText = c.res.text;

        if (responseText.length <= maxBodySize) {
          span.setAttribute('http.response.body', responseText);
        } else {
          span.setAttribute('http.response.body_size', responseText.length);
        }
      } catch {
        span.setAttribute('http.response.body_error', 'Failed to capture body');
      }
    }
  };
}

/**
 * Default implementations
 */

function defaultGetSpanName(c: Context): string {
  const path = new URL(c.req.url).pathname;
  const route = c.req.routePath || path;
  return `${c.req.method} ${route}`;
}

function defaultGetAttributes(_c: TracedContext): Record<string, any> {
  return {
    'http.scheme': 'http', // Default scheme
    'http.host': 'localhost', // Default host
  };
}

function defaultShouldTrace(_c: TracedContext): boolean {
  return true; // Trace all requests by default
}

function defaultOnError(error: Error, _c: TracedContext): void {
  console.error('Tracing error in Hono middleware:', error);
}

/**
 * Utility to create a traced Hono app
 */
export function createTracedApp(client: INoveumClient, options?: HonoTracingOptions) {
  const { Hono } = require('hono');
  const app = new Hono();

  // Add tracing middleware
  app.use('*', noveumTrace(client, options));

  // Add timing middleware
  app.use('*', timingMiddleware());

  return app;
}

/**
 * Plugin for Hono that adds tracing capabilities
 */
export function createNoveumPlugin(client: INoveumClient, options?: HonoTracingOptions) {
  return {
    middleware: noveumTrace(client, options),
    timingMiddleware: timingMiddleware(),
    bodyCapturingMiddleware,
    traced,
    createTracedHandler: (handler: any, spanName?: string) =>
      createTracedHonoHandler(handler, spanName || 'hono-handler', { client }),
    getCurrentSpan,
    getCurrentTraceId,
    addSpanAttributes,
    addSpanEvent,
  };
}
