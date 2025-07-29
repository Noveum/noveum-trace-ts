/**
 * Next.js integration for the Noveum Trace SDK
 */

// Note: Next.js types are optional - this integration will work when Next.js is installed
type NextRequest = any;
type NextResponse = any;
type NextApiRequest = any;
type NextApiResponse = any;

import type { INoveumClient, ISpan } from '../core/interfaces.js';
import type { NextjsIntegrationOptions } from '../core/types.js';
import { SpanKind, SpanStatus } from '../core/types.js';
import { getGlobalContextManager } from '../context/context-manager.js';
import { extractErrorInfo } from '../utils/index.js';

/**
 * Next.js App Router API route handler type
 */
type AppRouteHandler = (request: NextRequest) => Promise<NextResponse> | NextResponse;

/**
 * Next.js Pages API route handler type
 */
type PagesApiHandler = (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void;

/**
 * Extended NextRequest with tracing information
 */
export interface TracedNextRequest {
  method: string;
  url: string;
  headers: {
    get: (name: string) => string | null;
  };
  nextUrl: {
    pathname: string;
  };
  trace?: {
    span: ISpan;
    traceId: string;
    spanId: string;
  };
}

/**
 * Extended NextApiRequest with tracing information
 */
export interface TracedNextApiRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  trace?: {
    span: ISpan;
    traceId: string;
    spanId: string;
  };
}

/**
 * Options for Next.js tracing
 */
export interface NextjsTracingOptions extends NextjsIntegrationOptions {
  /**
   * Custom span name generator for App Router
   */
  getSpanName?: (request: NextRequest) => string;

  /**
   * Custom span name generator for Pages API
   */
  getPagesSpanName?: (req: NextApiRequest) => string;

  /**
   * Custom attribute extractor for App Router
   */
  getAttributes?: (request: NextRequest) => Record<string, any>;

  /**
   * Custom attribute extractor for Pages API
   */
  getPagesAttributes?: (req: NextApiRequest, res: NextApiResponse) => Record<string, any>;

  /**
   * Filter function for App Router
   */
  shouldTrace?: (request: NextRequest) => boolean;

  /**
   * Filter function for Pages API
   */
  shouldTracePages?: (req: NextApiRequest) => boolean;

  /**
   * Error handler
   */
  onError?: (error: Error) => void;
}

/**
 * Wrap Next.js App Router API route handler with tracing
 */
export function withNoveumTrace(
  handler: AppRouteHandler,
  client: INoveumClient,
  options: NextjsTracingOptions = {}
): AppRouteHandler {
  const {
    enabled = true,
    traceApiRoutes = true,
    getSpanName = defaultGetSpanName,
    getAttributes = defaultGetAttributes,
    shouldTrace = defaultShouldTrace,
    onError = defaultOnError,
  } = options;

  if (!enabled || !traceApiRoutes) {
    return handler;
  }

  return async (request: TracedNextRequest) => {
    try {
      if (!shouldTrace(request)) {
        return handler(request);
      }

      const spanName = getSpanName(request);
      const span = await client.startSpan(spanName, {
        kind: SpanKind.SERVER,
        attributes: {
          'http.method': request.method,
          'http.url': request.url,
          'http.user_agent': request.headers.get('User-Agent') || '',
          'nextjs.route_type': 'app_router',
          'nextjs.pathname': new URL(request.url).pathname,
        },
      });

      // Add custom attributes
      const customAttributes = getAttributes(request);
      if (customAttributes && Object.keys(customAttributes).length > 0) {
        span.setAttributes(customAttributes);
      }

      // Attach trace info to request
      request.trace = {
        span,
        traceId: span.traceId,
        spanId: span.spanId,
      };

      let response: NextResponse;

      try {
        response = await getGlobalContextManager().withSpanAsync(span, async () => {
          return await handler(request);
        });

        // Capture response information
        span.setAttributes({
          'http.status_code': response.status,
          'http.status_text': response.statusText,
        });

        if (response.status >= 400) {
          span.setStatus(SpanStatus.ERROR, `HTTP ${response.status}`);
        } else {
          span.setStatus(SpanStatus.OK);
        }
      } catch (error) {
        const errorInfo = extractErrorInfo(error);

        span.addEvent('error', {
          'error.type': errorInfo.name,
          'error.message': errorInfo.message || '',
          'error.stack': errorInfo.stack || '',
        });

        span.setStatus(SpanStatus.ERROR, errorInfo.message);
        throw error;
      } finally {
        await span.finish();
      }

      return response;
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  };
}

/**
 * Wrap Next.js Pages API route handler with tracing
 */
export function withNoveumTracePages(
  handler: PagesApiHandler,
  client: INoveumClient,
  options: NextjsTracingOptions = {}
): PagesApiHandler {
  const {
    enabled = true,
    traceApiRoutes = true,
    getPagesSpanName = defaultGetPagesSpanName,
    getPagesAttributes = defaultGetPagesAttributes,
    shouldTracePages = defaultShouldTracePages,
    onError = defaultOnError,
  } = options;

  if (!enabled || !traceApiRoutes) {
    return handler;
  }

  return async (req: TracedNextApiRequest, res: NextApiResponse) => {
    try {
      if (!shouldTracePages(req)) {
        return handler(req, res);
      }

      const spanName = getPagesSpanName(req);
      const span = await client.startSpan(spanName, {
        kind: SpanKind.SERVER,
        attributes: {
          'http.method': req.method || 'GET',
          'http.url': req.url || '',
          'http.user_agent': req.headers['user-agent'] || '',
          'nextjs.route_type': 'pages_api',
          'nextjs.pathname': req.url || '',
        },
      });

      // Add custom attributes
      const customAttributes = getPagesAttributes(req, res);
      if (customAttributes && Object.keys(customAttributes).length > 0) {
        span.setAttributes(customAttributes);
      }

      // Attach trace info to request
      req.trace = {
        span,
        traceId: span.traceId,
        spanId: span.spanId,
      };

      // Intercept response to capture status
      const originalEnd = res.end;
      let responseIntercepted = false;

      res.end = function (chunk: any, encoding: any) {
        if (!responseIntercepted) {
          responseIntercepted = true;

          span.setAttributes({
            'http.status_code': res.statusCode,
            'http.status_message': res.statusMessage || '',
          });

          if (res.statusCode >= 400) {
            span.setStatus(SpanStatus.ERROR, `HTTP ${res.statusCode}`);
          } else {
            span.setStatus(SpanStatus.OK);
          }

          span.finish().catch(onError);
        }

        return originalEnd.call(this, chunk, encoding);
      };

      try {
        await getGlobalContextManager().withSpanAsync(span, async () => {
          return handler(req, res);
        });
      } catch (error) {
        const errorInfo = extractErrorInfo(error);

        span.addEvent('error', {
          'error.type': errorInfo.name,
          'error.message': errorInfo.message || '',
          'error.stack': errorInfo.stack || '',
        });

        span.setStatus(SpanStatus.ERROR, errorInfo.message);

        if (!responseIntercepted) {
          span.finish().catch(onError);
        }

        throw error;
      }
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  };
}

/**
 * Middleware for Next.js App Router
 */
export function createNoveumMiddleware(client: INoveumClient, options: NextjsTracingOptions = {}) {
  return async (request: NextRequest) => {
    const { enabled = true, shouldTrace = defaultShouldTrace } = options;

    if (!enabled || !shouldTrace(request)) {
      return;
    }

    // This middleware can be used to set up tracing context
    // for the entire request lifecycle
    const span = await client.startSpan(`middleware ${request.nextUrl.pathname}`, {
      kind: SpanKind.SERVER,
      attributes: {
        'http.method': request.method,
        'http.url': request.url,
        'nextjs.middleware': true,
      },
    });

    // Store span in headers for downstream handlers
    // Note: NextResponse would be imported from 'next/server' in a real Next.js app
    const response = {
      headers: new Map(),
      set(key: string, value: string) {
        this.headers.set(key, value);
      },
    } as any;
    response.headers.set('x-trace-id', span.traceId);
    response.headers.set('x-span-id', span.spanId);

    await span.finish();
    return response;
  };
}

/**
 * Get current span from Next.js request
 */
export function getCurrentSpan(req: TracedNextRequest | TracedNextApiRequest): ISpan | undefined {
  return req.trace?.span;
}

/**
 * Get current trace ID from Next.js request
 */
export function getCurrentTraceId(
  req: TracedNextRequest | TracedNextApiRequest
): string | undefined {
  return req.trace?.traceId;
}

/**
 * Add attributes to the current request span
 */
export function addSpanAttributes(
  req: TracedNextRequest | TracedNextApiRequest,
  attributes: Record<string, any>
): void {
  const span = req.trace?.span;
  if (span && !span.isFinished) {
    span.setAttributes(attributes);
  }
}

/**
 * Add an event to the current request span
 */
export function addSpanEvent(
  req: TracedNextRequest | TracedNextApiRequest,
  name: string,
  attributes?: Record<string, any>
): void {
  const span = req.trace?.span;
  if (span && !span.isFinished) {
    span.addEvent(name, attributes);
  }
}

/**
 * Higher-order component for tracing React Server Components
 * Note: This is a placeholder implementation. In practice, you might need to use
 * React's experimental features or implement this differently based on your specific needs.
 */
export function withTracing<P extends object>(Component: any, _spanName?: string) {
  return async function TracedComponent(props: P) {
    // For now, we'll just render the component
    // In a full implementation, you'd want to create a span around the rendering
    return Component(props);
  };
}

/**
 * Default implementations
 */

function defaultGetSpanName(request: NextRequest): string {
  const url = new URL(request.url);
  return `${request.method} ${url.pathname}`;
}

function defaultGetPagesSpanName(req: NextApiRequest): string {
  return `${req.method || 'GET'} ${req.url || '/'}`;
}

function defaultGetAttributes(request: NextRequest): Record<string, any> {
  const url = new URL(request.url);
  return {
    'http.scheme': url.protocol.replace(':', ''),
    'http.host': url.host,
    'http.target': url.pathname + url.search,
  };
}

function defaultGetPagesAttributes(
  req: NextApiRequest,
  _res: NextApiResponse
): Record<string, any> {
  return {
    'http.scheme': 'http', // Default, might need to detect HTTPS
    'http.host': req.headers.host || '',
    'http.target': req.url || '',
  };
}

function defaultShouldTrace(request: NextRequest): boolean {
  const url = new URL(request.url);
  const pathname = url.pathname.toLowerCase();

  // Skip Next.js internal routes and static assets
  return (
    !pathname.startsWith('/_next/') &&
    !pathname.startsWith('/api/_') &&
    !pathname.includes('/favicon.ico') &&
    !pathname.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)
  );
}

function defaultShouldTracePages(req: NextApiRequest): boolean {
  const url = req.url?.toLowerCase() || '';

  // Skip internal routes and health checks
  return !url.startsWith('/_') && !url.includes('/health') && !url.includes('/metrics');
}

function defaultOnError(error: Error): void {
  console.error('Tracing error in Next.js integration:', error);
}

/**
 * Utility to create a traced API route for App Router
 */
export function createTracedRoute(
  client: INoveumClient,
  handlers: {
    GET?: AppRouteHandler;
    POST?: AppRouteHandler;
    PUT?: AppRouteHandler;
    DELETE?: AppRouteHandler;
    PATCH?: AppRouteHandler;
    HEAD?: AppRouteHandler;
    OPTIONS?: AppRouteHandler;
  },
  options?: NextjsTracingOptions
) {
  const tracedHandlers: any = {};

  Object.entries(handlers).forEach(([method, handler]) => {
    if (handler) {
      tracedHandlers[method] = withNoveumTrace(handler, client, options);
    }
  });

  return tracedHandlers;
}

/**
 * Utility to create a traced API route for Pages API
 */
export function createTracedPagesRoute(
  client: INoveumClient,
  handler: PagesApiHandler,
  options?: NextjsTracingOptions
): PagesApiHandler {
  return withNoveumTracePages(handler, client, options);
}

/**
 * Wrapper function for withNoveumTrace that matches test expectations
 */
export function withNoveumTracing(
  handler: AppRouteHandler,
  options: { client: INoveumClient } & NextjsTracingOptions = {} as any
): AppRouteHandler {
  const { client, ...traceOptions } = options;
  return withNoveumTrace(handler, client, traceOptions);
}

/**
 * Wrapper function for withNoveumTracePages that matches test expectations
 */
export function withNoveumPagesTracing(
  handler: PagesApiHandler,
  options: { client: INoveumClient } & NextjsTracingOptions = {} as any
): PagesApiHandler {
  const { client, ...traceOptions } = options;
  return withNoveumTracePages(handler, client, traceOptions);
}
