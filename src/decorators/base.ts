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

      descriptor.value = async function (this: any, ...args: any[]) {
        return executeWithSpan(spanName, options, () => originalMethod.apply(this, args));
      };

      return descriptor;
    }

    // Handle standalone function decoration
    if (typeof target === 'function') {
      const originalFunction = target;
      const functionName = target.name || 'anonymous';
      const spanName = options.name || functionName;

      return async function (this: any, ...args: any[]) {
        return executeWithSpan(spanName, options, () => originalFunction.apply(this, args));
      };
    }

    throw new Error('trace decorator can only be applied to methods or functions');
  };
}

/**
 * Execute a function within a span context
 */
async function executeWithSpan<T>(
  spanName: string,
  options: TraceOptions,
  fn: () => T | Promise<T>
): Promise<T> {
  const contextManager = getGlobalContextManager();
  const currentTrace = getCurrentTrace();
  let span: ISpan | undefined;

  try {
    // Create a new trace if none exists and createTrace is enabled
    if (!currentTrace && options.createTrace) {
      // This would need to be implemented with a global client instance
      // For now, we'll work with existing traces only
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

    // Create a new span using the context manager
    if (currentTrace) {
      span = await currentTrace.startSpan(spanName, spanOptions);
    } else {
      throw new Error('No active trace found. Please start a trace first.');
    }

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
    // Ensure span is finished
    if (span && !span.isFinished) {
      void span.finish();
    }
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
