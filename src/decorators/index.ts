/**
 * TypeScript decorators for automatic tracing
 */

import type { ISpan, ITrace } from '../core/interfaces.js';
import type { SpanOptions, TraceOptions, Attributes } from '../core/types.js';
import { getGlobalContextManager } from '../context/context-manager.js';

/**
 * Global client instance for decorators
 */
let globalClient: any; // Will be set by the main client

/**
 * Set the global client for decorators to use
 */
export function setGlobalClient(client: any): void {
  globalClient = client;
}

/**
 * Get the global client
 */
function getGlobalClient(): any {
  if (!globalClient) {
    throw new Error('Global client not set. Make sure to initialize NoveumClient before using decorators.');
  }
  return globalClient;
}

/**
 * Trace decorator - creates a new trace for the decorated method
 */
export function trace(nameOrOptions?: string | TraceOptions, options?: TraceOptions) {
  return function <T extends (...args: any[]) => any>(
    target: any,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<T>
  ): TypedPropertyDescriptor<T> {
    const originalMethod = descriptor.value;
    if (!originalMethod) {
      throw new Error('Trace decorator can only be applied to methods');
    }

    // Determine trace name and options
    let traceName: string;
    let traceOptions: TraceOptions = {};

    if (typeof nameOrOptions === 'string') {
      traceName = nameOrOptions;
      traceOptions = options || {};
    } else if (nameOrOptions) {
      traceName = `${target.constructor.name}.${String(propertyKey)}`;
      traceOptions = nameOrOptions;
    } else {
      traceName = `${target.constructor.name}.${String(propertyKey)}`;
    }

    descriptor.value = async function (this: any, ...args: any[]) {
      const client = getGlobalClient();
      const trace = await client.startTrace(traceName, traceOptions);

      try {
        const result = await client.withTrace(trace, async () => {
          return await originalMethod.apply(this, args);
        });

        await trace.finish();
        return result;
      } catch (error) {
        await trace.finish();
        throw error;
      }
    } as T;

    return descriptor;
  };
}

/**
 * Span decorator - creates a new span for the decorated method
 */
export function span(nameOrOptions?: string | SpanOptions, options?: SpanOptions) {
  return function <T extends (...args: any[]) => any>(
    target: any,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<T>
  ): TypedPropertyDescriptor<T> {
    const originalMethod = descriptor.value;
    if (!originalMethod) {
      throw new Error('Span decorator can only be applied to methods');
    }

    // Determine span name and options
    let spanName: string;
    let spanOptions: SpanOptions = {};

    if (typeof nameOrOptions === 'string') {
      spanName = nameOrOptions;
      spanOptions = options || {};
    } else if (nameOrOptions) {
      spanName = `${target.constructor.name}.${String(propertyKey)}`;
      spanOptions = nameOrOptions;
    } else {
      spanName = `${target.constructor.name}.${String(propertyKey)}`;
    }

    descriptor.value = async function (this: any, ...args: any[]) {
      const client = getGlobalClient();
      const span = await client.startSpan(spanName, spanOptions);

      try {
        const result = await client.withSpan(span, async () => {
          return await originalMethod.apply(this, args);
        });

        await span.finish();
        return result;
      } catch (error) {
        await span.finish();
        throw error;
      }
    } as T;

    return descriptor;
  };
}

/**
 * Auto-span decorator - automatically creates spans with method parameters as attributes
 */
export function autoSpan(options: {
  name?: string;
  captureArgs?: boolean;
  captureResult?: boolean;
  ignoreArgs?: string[];
  spanOptions?: SpanOptions;
} = {}) {
  return function <T extends (...args: any[]) => any>(
    target: any,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<T>
  ): TypedPropertyDescriptor<T> {
    const originalMethod = descriptor.value;
    if (!originalMethod) {
      throw new Error('AutoSpan decorator can only be applied to methods');
    }

    const spanName = options.name || `${target.constructor.name}.${String(propertyKey)}`;
    const captureArgs = options.captureArgs ?? true;
    const captureResult = options.captureResult ?? false;
    const ignoreArgs = new Set(options.ignoreArgs || []);

    descriptor.value = async function (this: any, ...args: any[]) {
      const client = getGlobalClient();
      const span = await client.startSpan(spanName, options.spanOptions);

      // Capture method arguments as attributes
      if (captureArgs) {
        const paramNames = getParameterNames(originalMethod);
        const attributes: Attributes = {};

        paramNames.forEach((paramName, index) => {
          if (!ignoreArgs.has(paramName) && index < args.length) {
            const value = args[index];
            if (isSerializable(value)) {
              attributes[`arg.${paramName}`] = value;
            }
          }
        });

        span.setAttributes(attributes);
      }

      try {
        const result = await client.withSpan(span, async () => {
          return await originalMethod.apply(this, args);
        });

        // Capture result as attribute
        if (captureResult && isSerializable(result)) {
          span.setAttribute('result', result);
        }

        await span.finish();
        return result;
      } catch (error) {
        await span.finish();
        throw error;
      }
    } as T;

    return descriptor;
  };
}

/**
 * Timed decorator - measures execution time and adds it as span attribute
 */
export function timed(options: {
  name?: string;
  unit?: 'ms' | 's';
  spanOptions?: SpanOptions;
} = {}) {
  return function <T extends (...args: any[]) => any>(
    target: any,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<T>
  ): TypedPropertyDescriptor<T> {
    const originalMethod = descriptor.value;
    if (!originalMethod) {
      throw new Error('Timed decorator can only be applied to methods');
    }

    const spanName = options.name || `${target.constructor.name}.${String(propertyKey)}`;
    const unit = options.unit || 'ms';

    descriptor.value = async function (this: any, ...args: any[]) {
      const client = getGlobalClient();
      const span = await client.startSpan(spanName, options.spanOptions);

      const startTime = performance.now();

      try {
        const result = await client.withSpan(span, async () => {
          return await originalMethod.apply(this, args);
        });

        const endTime = performance.now();
        const duration = endTime - startTime;
        const durationValue = unit === 's' ? duration / 1000 : duration;

        span.setAttribute(`duration_${unit}`, durationValue);
        await span.finish();
        return result;
      } catch (error) {
        const endTime = performance.now();
        const duration = endTime - startTime;
        const durationValue = unit === 's' ? duration / 1000 : duration;

        span.setAttribute(`duration_${unit}`, durationValue);
        await span.finish();
        throw error;
      }
    } as T;

    return descriptor;
  };
}

/**
 * Retry decorator - adds retry logic with tracing
 */
export function retry(options: {
  maxAttempts?: number;
  delay?: number;
  backoff?: number;
  spanOptions?: SpanOptions;
} = {}) {
  return function <T extends (...args: any[]) => any>(
    target: any,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<T>
  ): TypedPropertyDescriptor<T> {
    const originalMethod = descriptor.value;
    if (!originalMethod) {
      throw new Error('Retry decorator can only be applied to methods');
    }

    const maxAttempts = options.maxAttempts || 3;
    const baseDelay = options.delay || 1000;
    const backoff = options.backoff || 2;

    descriptor.value = async function (this: any, ...args: any[]) {
      const client = getGlobalClient();
      const span = await client.startSpan(
        `${target.constructor.name}.${String(propertyKey)}`,
        options.spanOptions
      );

      span.setAttribute('retry.max_attempts', maxAttempts);

      let lastError: any;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        span.setAttribute('retry.attempt', attempt);

        try {
          const result = await client.withSpan(span, async () => {
            return await originalMethod.apply(this, args);
          });

          span.setAttribute('retry.success', true);
          await span.finish();
          return result;
        } catch (error) {
          lastError = error;
          span.addEvent('retry.attempt_failed', {
            attempt,
            error: error instanceof Error ? error.message : String(error),
          });

          if (attempt < maxAttempts) {
            const delay = baseDelay * Math.pow(backoff, attempt - 1);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      span.setAttribute('retry.success', false);
      span.setAttribute('retry.final_error', lastError instanceof Error ? lastError.message : String(lastError));
      await span.finish();
      throw lastError;
    } as T;

    return descriptor;
  };
}

/**
 * Class decorator to automatically trace all methods
 */
export function traceClass(options: {
  prefix?: string;
  excludeMethods?: string[];
  spanOptions?: SpanOptions;
} = {}) {
  return function <T extends { new (...args: any[]): {} }>(constructor: T) {
    const prefix = options.prefix || constructor.name;
    const excludeMethods = new Set(options.excludeMethods || ['constructor']);

    // Get all method names from prototype
    const prototype = constructor.prototype;
    const methodNames = Object.getOwnPropertyNames(prototype).filter(
      name => typeof prototype[name] === 'function' && !excludeMethods.has(name)
    );

    // Apply span decorator to each method
    methodNames.forEach(methodName => {
      const originalMethod = prototype[methodName];
      const spanName = `${prefix}.${methodName}`;

      prototype[methodName] = async function (...args: any[]) {
        const client = getGlobalClient();
        const span = await client.startSpan(spanName, options.spanOptions);

        try {
          const result = await client.withSpan(span, async () => {
            return await originalMethod.apply(this, args);
          });

          await span.finish();
          return result;
        } catch (error) {
          await span.finish();
          throw error;
        }
      };
    });

    return constructor;
  };
}

/**
 * Utility functions
 */

/**
 * Extract parameter names from a function
 */
function getParameterNames(func: Function): string[] {
  const funcStr = func.toString();
  const match = funcStr.match(/\(([^)]*)\)/);
  if (!match) return [];

  return match[1]
    .split(',')
    .map(param => param.trim().split(/\s+/)[0])
    .filter(param => param && param !== '...');
}

/**
 * Check if a value can be serialized as an attribute
 */
function isSerializable(value: any): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') {
    return true;
  }

  if (Array.isArray(value)) {
    return value.length <= 10 && value.every(item => {
      const itemType = typeof item;
      return itemType === 'string' || itemType === 'number' || itemType === 'boolean';
    });
  }

  return false;
}

/**
 * Manual tracing functions for non-decorator usage
 */

/**
 * Create a traced function wrapper
 */
export function traced<T extends (...args: any[]) => any>(
  name: string,
  fn: T,
  options?: SpanOptions
): T {
  return (async (...args: any[]) => {
    const client = getGlobalClient();
    const span = await client.startSpan(name, options);

    try {
      const result = await client.withSpan(span, async () => {
        return await fn(...args);
      });

      await span.finish();
      return result;
    } catch (error) {
      await span.finish();
      throw error;
    }
  }) as T;
}

/**
 * Create a traced async function
 */
export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>,
  options?: SpanOptions
): Promise<T> {
  const client = getGlobalClient();
  const span = await client.startSpan(name, options);

  try {
    const result = await client.withSpan(span, fn);
    await span.finish();
    return result;
  } catch (error) {
    await span.finish();
    throw error;
  }
}

