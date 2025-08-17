/**
 * Core trace decorator implementation for automatic span creation
 */

import type { ISpan } from '../core/interfaces.js';
import type { Attributes, SpanOptions } from '../core/types.js';
import { SpanStatus } from '../core/types.js';
import {
  getGlobalContextManager,
  getCurrentTrace,
  getCurrentSpan,
  withContextAsync,
} from '../context/context-manager.js';
import { getGlobalClient } from '../core/client.js';

/**
 * Options for the trace decorator
 */
export interface TraceOptions {
  /** Name of the span (defaults to function/method name) */
  name?: string;
  /** Additional attributes to add to the span */
  attributes?: Attributes;
  /** Whether to create a new trace if none exists */
  createTrace?: boolean;
  /** Span options */
  spanOptions?: Partial<SpanOptions>;
}

/**
 * Type guard to check if we're dealing with a method descriptor
 */
function isMethodDescriptor(descriptor: any): descriptor is PropertyDescriptor {
  return descriptor && typeof descriptor.value === 'function';
}

/**
 * Check if a function is async
 */
function isAsyncFunction(fn: Function): boolean {
  return fn.constructor.name === 'AsyncFunction' || fn.toString().trim().startsWith('async');
}

/**
 * Core trace decorator that creates spans for function/method execution
 *
 * @param options - Configuration options for the decorator
 * @returns Decorator function
 *
 * @example
 * // Class method
 * class MyService {
 *   @trace({ name: 'process-data' })
 *   async processData(data: any) {
 *     // method implementation
 *   }
 * }
 *
 * // Standalone function
 * const processItem = trace({ name: 'process-item' })(
 *   async function(item: any) {
 *     // function implementation
 *   }
 * );
 */
export function trace(options: TraceOptions = {}): any {
  return function decorator(
    target: any,
    propertyKey?: string | symbol,
    descriptor?: PropertyDescriptor
  ) {
    // Handle class method decoration
    if (propertyKey && descriptor && isMethodDescriptor(descriptor)) {
      const originalMethod = descriptor.value;
      const methodName = String(propertyKey);
      const spanName = options.name || `${target.constructor.name}.${methodName}`;

      // Detect if the original method is async
      const isAsync = isAsyncFunction(originalMethod);

      if (isAsync) {
        descriptor.value = async function (this: any, ...args: any[]) {
          return executeWithSpanAsync(spanName, options, () => originalMethod.apply(this, args));
        };
      } else {
        descriptor.value = function (this: any, ...args: any[]) {
          return executeWithSpanSync(spanName, options, () => originalMethod.apply(this, args));
        };
      }

      return descriptor;
    }

    // Handle standalone function decoration
    if (typeof target === 'function') {
      const originalFunction = target;
      const functionName = target.name || 'anonymous';
      const spanName = options.name || functionName;

      // Detect if the original function is async
      const isAsync = isAsyncFunction(originalFunction);

      if (isAsync) {
        return async function (this: any, ...args: any[]) {
          return executeWithSpanAsync(spanName, options, () => originalFunction.apply(this, args));
        };
      } else {
        return function (this: any, ...args: any[]) {
          return executeWithSpanSync(spanName, options, () => originalFunction.apply(this, args));
        };
      }
    }

    throw new Error('trace decorator can only be applied to methods or functions');
  };
}

/**
 * Execute a function within a span context (async version)
 */
async function executeWithSpanAsync<T>(
  spanName: string,
  options: TraceOptions,
  fn: () => T | Promise<T>
): Promise<T> {
  const contextManager = getGlobalContextManager();
  const currentTrace = getCurrentTrace();
  let span: ISpan | undefined;

  try {
    // Require an active trace; if allowed, create one on the fly
    if (!currentTrace) {
      if (options.createTrace) {
        const client = getGlobalClient();
        // Create a temporary trace and re-enter once it exists
        return await client.trace(options.name || spanName, async () =>
          executeWithSpanAsync(spanName, { ...options, createTrace: false }, fn)
        );
      }
      throw new Error('No active trace found. Please start a trace first.');
    }

    // Get current span to use as parent
    const parentSpan = getCurrentSpan();

    // Create span options
    const spanOptions: SpanOptions = {
      ...options.spanOptions,
      attributes: {
        ...options.attributes,
        'function.name': spanName,
        'decorator.type': 'trace',
      },
      ...(parentSpan ? { parent_span_id: parentSpan.spanId } : {}),
    };

    // Create a new span using the context manager (currentTrace is verified above)
    span = await currentTrace.startSpan(spanName, spanOptions);

    // Execute the function within the span context
    const result = await withContextAsync(
      contextManager.getCurrentContext().copy({ activeSpan: span }),
      async () => {
        try {
          const result = await Promise.resolve(fn());

          // Mark span as successful
          span!.setStatus(SpanStatus.OK);
          return result;
        } catch (error) {
          // Mark span as error and re-throw
          span!.setStatus(SpanStatus.ERROR, error instanceof Error ? error.message : String(error));
          span!.addEvent('exception', {
            'exception.type': error instanceof Error ? error.constructor.name : 'Unknown',
            'exception.message': error instanceof Error ? error.message : String(error),
            'exception.stacktrace': error instanceof Error ? error.stack || '' : '',
          });
          throw error;
        }
      }
    );

    return result;
  } finally {
    // Ensure span is finished deterministically
    if (span && !span.isFinished) {
      await span.finish();
    }
  }
}

/**
 * Execute a function within a span context (sync version)
 * Note: For sync functions, span creation and finishing happen in the background
 */
function executeWithSpanSync<T>(spanName: string, options: TraceOptions, fn: () => T): T {
  const currentTrace = getCurrentTrace();

  try {
    // Require an active trace; if createTrace is enabled but no trace exists,
    // we cannot handle this synchronously since trace creation is async
    if (!currentTrace) {
      if (options.createTrace) {
        throw new Error(
          'Cannot create new trace synchronously. Use async function or start a trace first.'
        );
      }
      throw new Error('No active trace found. Please start a trace first.');
    }

    // Get current span to use as parent
    const parentSpan = getCurrentSpan();

    // Create span options
    const spanOptions: SpanOptions = {
      ...options.spanOptions,
      attributes: {
        ...options.attributes,
        'function.name': spanName,
        'decorator.type': 'trace',
      },
      ...(parentSpan ? { parent_span_id: parentSpan.spanId } : {}),
    };

    // For sync execution, we create a lightweight span that handles async operations in background
    // This is a compromise - we execute the function immediately but handle span lifecycle async
    let result: T;

    // Execute the function first, then handle span creation/finishing in background
    try {
      result = fn();
    } catch (error) {
      // Even if function fails, we want to create a span to record the error
      // Handle span creation in background
      currentTrace
        .startSpan(spanName, spanOptions)
        .then(createdSpan => {
          createdSpan.setStatus(
            SpanStatus.ERROR,
            error instanceof Error ? error.message : String(error)
          );
          createdSpan.addEvent('exception', {
            'exception.type': error instanceof Error ? error.constructor.name : 'Unknown',
            'exception.message': error instanceof Error ? error.message : String(error),
            'exception.stacktrace': error instanceof Error ? error.stack || '' : '',
          });
          createdSpan.finish().catch(finishError => {
            console.error('Failed to finish span after error:', finishError);
          });
        })
        .catch(spanError => {
          console.error('Failed to create span for error tracking:', spanError);
        });

      throw error;
    }

    // Handle successful execution - create and finish span in background
    currentTrace
      .startSpan(spanName, spanOptions)
      .then(createdSpan => {
        createdSpan.setStatus(SpanStatus.OK);
        createdSpan.finish().catch(finishError => {
          console.error('Failed to finish span:', finishError);
        });
      })
      .catch(spanError => {
        console.error('Failed to create span:', spanError);
      });

    return result;
  } catch (error) {
    // This catch handles trace-level errors (like no active trace)
    throw error;
  }
}

/**
 * Simple trace decorator without options (for convenience)
 *
 * @example
 * @simpleTrace
 * async function myFunction() {
 *   // implementation
 * }
 */
export const simpleTrace = trace();

/**
 * Trace decorator factory for creating reusable decorators with preset options
 *
 * @param defaultOptions - Default options to apply
 * @returns Decorator factory function
 */
export function createTraceDecorator(defaultOptions: TraceOptions) {
  return function (options: Partial<TraceOptions> = {}) {
    return trace({
      ...defaultOptions,
      ...options,
      attributes: {
        ...defaultOptions.attributes,
        ...options.attributes,
      },
    });
  };
}
