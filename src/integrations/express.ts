/**
 * Express.js integration for the Noveum Trace SDK
 */

// Note: Express types are optional - this integration will work when Express is installed
// Using any for Express framework types to avoid requiring @types/express dependency
type Request = any;
type Response = any;
type NextFunction = any;
type RequestHandler = any;

import type { INoveumClient, ISpan } from '../core/interfaces.js';
import type { ExpressIntegrationOptions } from '../core/types.js';
import { SpanKind, SpanStatus } from '../core/types.js';
import { getGlobalContextManager } from '../context/context-manager.js';
import { extractErrorInfo } from '../utils/index.js';

/**
 * Extended Request interface with tracing information
 */
export interface TracedRequest {
  method: string;
  url: string;
  path: string;
  route?: {
    path: string;
  };
  headers: Record<string, string | string[] | undefined>;
  body?: unknown; // Improved from any
  ip: string;
  connection: {
    remoteAddress?: string;
  };
  socket?: {
    remoteAddress?: string;
  };
  get: (name: string) => string | undefined;
  on: (event: string, listener: (...args: unknown[]) => void) => void; // Improved from any[]
  trace?: {
    span: ISpan;
    traceId: string;
    spanId: string;
  };
}

/**
 * Express middleware options
 */
export interface ExpressMiddlewareOptions extends ExpressIntegrationOptions {
  /**
   * Custom span name generator
   */
  getSpanName?: (req: Request) => string;

  /**
   * Custom attribute extractor
   */
  getAttributes?: (req: Request, res: Response) => Record<string, any>;

  /**
   * Filter function to determine if request should be traced
   */
  shouldTrace?: (req: Request) => boolean;

  /**
   * Error handler for tracing errors
   */
  onError?: (error: Error, req: Request) => void;
}

/**
 * Create Express middleware for automatic request tracing
 */
export function noveumMiddleware(
  client: INoveumClient,
  options: ExpressMiddlewareOptions = {}
): RequestHandler {
  const {
    enabled = true,
    ignoreRoutes = [],
    captureHeaders = false,
    captureBody = false,
    getSpanName = defaultGetSpanName,
    getAttributes = defaultGetAttributes,
    shouldTrace = defaultShouldTrace,
    onError = defaultOnError,
  } = options;

  if (!enabled) {
    return (_req: unknown, _res: unknown, next: NextFunction) => next();
  }

  const ignoreSet = new Set(ignoreRoutes);

  return async (req: TracedRequest, res: Response, next: NextFunction) => {
    try {
      // Check if this route should be ignored
      if (ignoreSet.has(req.path) || !shouldTrace(req)) {
        return next();
      }

      const spanName = getSpanName(req);
      const span = await client.startSpan(spanName, {
        kind: SpanKind.SERVER,
        attributes: {
          'http.method': req.method,
          'http.url': req.url,
          'http.route': req.route?.path || req.path,
          'http.user_agent': req.get('User-Agent') || '',
          'http.remote_addr':
            req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '',
        },
      });

      // Add custom attributes
      const customAttributes = getAttributes(req, res);
      if (customAttributes && Object.keys(customAttributes).length > 0) {
        span.setAttributes(customAttributes);
      }

      // Capture headers if enabled
      if (captureHeaders) {
        const headers: Record<string, string> = {};
        Object.entries(req.headers).forEach(([key, value]) => {
          if (typeof value === 'string') {
            headers[`http.request.header.${key}`] = value;
          } else if (Array.isArray(value)) {
            headers[`http.request.header.${key}`] = value.join(', ');
          }
        });
        span.setAttributes(headers);
      }

      // Capture body if enabled (be careful with large bodies)
      if (captureBody && req.body) {
        try {
          const bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

          if (bodyStr.length <= 1000) {
            // Limit body size
            span.setAttribute('http.request.body', bodyStr);
          } else {
            span.setAttribute('http.request.body_size', bodyStr.length);
          }
        } catch {
          span.setAttribute('http.request.body_error', 'Failed to serialize body');
        }
      }

      // Attach trace info to request
      req.trace = {
        span,
        traceId: span.traceId,
        spanId: span.spanId,
      };

      // Intercept response to capture status and headers
      const originalSend = res.send;
      let responseIntercepted = false;

      res.send = function (body: any) {
        if (responseIntercepted) return originalSend.call(this, body);
        responseIntercepted = true;

        // Only set attributes if span is not finished
        if (!span.isFinished) {
          span.setAttributes({
            'http.status_code': res.statusCode,
            'http.status_text': res.statusMessage || '',
          });

          // Set span status based on HTTP status
          if (res.statusCode >= 400) {
            span.setStatus(SpanStatus.ERROR, `HTTP ${res.statusCode}`);
          } else {
            span.setStatus(SpanStatus.OK);
          }

          // Capture response headers if enabled
          if (captureHeaders) {
            const responseHeaders: Record<string, string> = {};
            Object.entries(res.getHeaders()).forEach(([key, value]) => {
              if (typeof value === 'string') {
                responseHeaders[`http.response.header.${key}`] = value;
              } else if (typeof value === 'number') {
                responseHeaders[`http.response.header.${key}`] = String(value);
              }
            });
            span.setAttributes(responseHeaders);
          }

          // Capture response body if enabled and small enough
          if (captureBody && body && res.statusCode < 400) {
            try {
              const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
              if (bodyStr.length <= 1000) {
                span.setAttribute('http.response.body', bodyStr);
              } else {
                span.setAttribute('http.response.body_size', bodyStr.length);
              }
            } catch {
              span.setAttribute('http.response.body_error', 'Failed to serialize body');
            }
          }
        }

        span.finish().catch(error => onError(error, req));
      };

      // Handle connection close/error
      req.on('close', () => {
        if (!responseIntercepted && !span.isFinished) {
          span.addEvent('request.aborted');
          span.setStatus(SpanStatus.ERROR, 'Request aborted');
          span.finish().catch(error => onError(error, req));
        }
      });

      // Run the request in the span context
      await getGlobalContextManager().withSpanAsync(span, async () => {
        next();
      });
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)), req);
      next(error);
    }
  };
}

/**
 * Error handling middleware for tracing
 */
export function noveumErrorMiddleware(
  options: { onError?: (error: Error, req: Request) => void } = {}
): any {
  const { onError = defaultOnError } = options;

  return (error: unknown, req: TracedRequest, _res: Response, next: NextFunction) => {
    const span = req.trace?.span;

    if (span && !span.isFinished) {
      const errorInfo = extractErrorInfo(error);

      span.addEvent('error', {
        'error.type': errorInfo.name,
        'error.message': errorInfo.message || '',
        'error.stack': errorInfo.stack || '',
      });

      span.setStatus(SpanStatus.ERROR, errorInfo.message);
      span.finish().catch(err => onError(err, req));
    }

    next(error);
  };
}

/**
 * Get current span from Express request
 */
export function getCurrentSpan(req: TracedRequest): ISpan | undefined {
  return req.trace?.span;
}

/**
 * Get current trace ID from Express request
 */
export function getCurrentTraceId(req: TracedRequest): string | undefined {
  return req.trace?.traceId;
}

/**
 * Add attributes to the current request span
 */
export function addSpanAttributes(req: TracedRequest, attributes: Record<string, any>): void {
  const span = req.trace?.span;
  if (span && !span.isFinished) {
    span.setAttributes(attributes);
  }
}

/**
 * Add an event to the current request span
 */
export function addSpanEvent(
  req: TracedRequest,
  name: string,
  attributes?: Record<string, any>
): void {
  const span = req.trace?.span;
  if (span && !span.isFinished) {
    span.addEvent(name, attributes);
  }
}

/**
 * Default implementations
 */

function defaultGetSpanName(req: Request): string {
  const route = req.route?.path || req.path;
  return `${req.method} ${route}`;
}

function defaultGetAttributes(req: Request, _res: Response): Record<string, any> {
  return {
    'http.scheme': req.protocol,
    'http.host': req.get('Host'),
    'http.target': req.originalUrl,
  };
}

function defaultShouldTrace(req: Request): boolean {
  // Skip health checks and static assets by default
  const path = (req.path || req.url || '').toLowerCase();
  if (!path) return true;

  return (
    !path.includes('/health') &&
    !path.includes('/metrics') &&
    !path.includes('/favicon.ico') &&
    !path.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)
  );
}

function defaultOnError(error: Error, _req: Request): void {
  console.error('Tracing error in Express middleware:', error);
}

/**
 * Utility function to create a traced Express app
 */
export function createTracedApp(client: INoveumClient, options?: ExpressMiddlewareOptions) {
  const express = require('express');
  const app = express();

  // Add tracing middleware early in the stack
  app.use(noveumMiddleware(client, options));

  // Add error handling middleware
  app.use(noveumErrorMiddleware(options));

  return app;
}

/**
 * Higher-order function to wrap Express route handlers with tracing
 */
export function traced(client: INoveumClient, spanName?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (req: TracedRequest, res: Response, next: NextFunction) {
      const currentSpan = req.trace?.span;

      if (!currentSpan) {
        return originalMethod.call(this, req, res, next);
      }

      const childSpanName = spanName || `${target.constructor.name}.${propertyKey}`;

      // Create child span for the handler
      const childSpan = await client.startSpan(childSpanName, {
        parentSpanId: currentSpan.spanId,
      });

      const result = await getGlobalContextManager().withSpanAsync(childSpan, async () => {
        return originalMethod.call(this, req, res, next);
      });

      await childSpan.finish();
      return result;
    };

    return descriptor;
  };
}
