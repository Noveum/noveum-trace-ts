/**
 * TypeScript decorators for automatic tracing
 */

import type { SpanOptions, TraceOptions, Attributes } from '../core/types.js';

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
    throw new Error(
      'Global client not set. Make sure to initialize NoveumClient before using decorators.'
    );
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
    if (!descriptor || typeof descriptor.value !== 'function') {
      throw new Error('Trace decorator can only be applied to methods');
    }

    const originalMethod = descriptor.value;

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

    descriptor.value = function (this: any, ...args: any[]) {
      const client = getGlobalClient();

      try {
        const result = originalMethod.apply(this, args);

        // Check if the result is a Promise (async method)
        if (result && typeof result.then === 'function') {
          // Async method
          return (async () => {
            const trace = await client.startTrace(traceName, traceOptions);

            try {
              const resolvedResult = await result;
              await trace.finish();
              return resolvedResult;
            } catch (error) {
              await trace.finish();
              throw error;
            }
          })();
        } else {
          // Sync method
          client
            .startTrace(traceName, traceOptions)
            .then((trace: any) => {
              trace.finish();
            })
            .catch(() => {
              // Ignore trace creation errors for sync methods
            });

          return result;
        }
      } catch (error) {
        // For sync errors, create trace to record the error
        client
          .startTrace(traceName, traceOptions)
          .then((trace: any) => {
            trace.finish();
          })
          .catch(() => {});
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
    if (!descriptor || typeof descriptor.value !== 'function') {
      throw new Error('Span decorator can only be applied to methods');
    }

    const originalMethod = descriptor.value;

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

    descriptor.value = function (this: any, ...args: any[]) {
      const client = getGlobalClient();

      try {
        const result = originalMethod.apply(this, args);

        // Check if the result is a Promise (async method)
        if (result && typeof result.then === 'function') {
          // Async method
          return (async () => {
            const span = await client.startSpan(spanName, spanOptions);

            try {
              const resolvedResult = await result;
              await span.finish();
              return resolvedResult;
            } catch (error) {
              await span.finish();
              throw error;
            }
          })();
        } else {
          // Sync method
          client
            .startSpan(spanName, spanOptions)
            .then((span: any) => {
              span.finish();
            })
            .catch(() => {
              // Ignore span creation errors for sync methods
            });

          return result;
        }
      } catch (error) {
        // For sync errors, create span to record the error
        client
          .startSpan(spanName, spanOptions)
          .then((span: any) => {
            span.finish();
          })
          .catch(() => {});
        throw error;
      }
    } as T;

    return descriptor;
  };
}

/**
 * Auto-span decorator - automatically creates spans with method parameters as attributes
 */
export function autoSpan(
  options: {
    name?: string;
    captureArgs?: boolean;
    captureResult?: boolean;
    ignoreArgs?: string[];
    spanOptions?: SpanOptions;
  } = {}
) {
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

    // Create a wrapper that handles both sync and async methods
    descriptor.value = function (this: any, ...args: any[]) {
      const client = getGlobalClient();

      try {
        // Call the original method first
        const result = originalMethod.apply(this, args);

        // Check if the result is a Promise (async method)
        if (result && typeof result.then === 'function') {
          // Async method - handle with promises
          return (async () => {
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
              const resolvedResult = await result;

              // Capture result as attribute
              if (captureResult && isSerializable(resolvedResult)) {
                span.setAttribute('result', resolvedResult);
              }
              await span.finish();
              return resolvedResult;
            } catch (error) {
              await span.finish();
              throw error;
            }
          })();
        } else {
          // Sync method - handle synchronously (span creation will be async but don't wait)
          client
            .startSpan(spanName, options.spanOptions)
            .then((span: any) => {
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

              // Capture result as attribute
              if (captureResult && isSerializable(result)) {
                span.setAttribute('result', result);
              }

              span.finish();
            })
            .catch(() => {
              // Ignore span creation errors for sync methods
            });

          return result;
        }
      } catch (error) {
        // For sync errors, create span to record the error
        client
          .startSpan(spanName, options.spanOptions)
          .then((span: any) => {
            span.finish();
          })
          .catch(() => {});
        throw error;
      }
    } as T;

    return descriptor;
  };
}

/**
 * Timed decorator - measures execution time and adds it as span attribute
 */
export function timed(
  options: {
    name?: string;
    unit?: 'ms' | 's';
    spanOptions?: SpanOptions;
  } = {}
) {
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

    descriptor.value = function (this: any, ...args: any[]) {
      const client = getGlobalClient();
      const startTime = performance.now();

      try {
        const result = originalMethod.apply(this, args);

        // Check if the result is a Promise (async method)
        if (result && typeof result.then === 'function') {
          // Async method
          return (async () => {
            const span = await client.startSpan(spanName, options.spanOptions);

            try {
              const resolvedResult = await result;

              const endTime = performance.now();
              const duration = endTime - startTime;
              const durationValue = unit === 's' ? duration / 1000 : duration;

              span.setAttribute(`duration_${unit}`, durationValue);
              await span.finish();
              return resolvedResult;
            } catch (error) {
              const endTime = performance.now();
              const duration = endTime - startTime;
              const durationValue = unit === 's' ? duration / 1000 : duration;

              span.setAttribute(`duration_${unit}`, durationValue);
              await span.finish();
              throw error;
            }
          })();
        } else {
          // Sync method
          const endTime = performance.now();
          const duration = endTime - startTime;
          const durationValue = unit === 's' ? duration / 1000 : duration;

          // Create span asynchronously but don't wait
          client
            .startSpan(spanName, options.spanOptions)
            .then((span: any) => {
              span.setAttribute(`duration_${unit}`, durationValue);
              span.finish();
            })
            .catch(() => {
              // Ignore span creation errors for sync methods
            });

          return result;
        }
      } catch (error) {
        const endTime = performance.now();
        const duration = endTime - startTime;
        const durationValue = unit === 's' ? duration / 1000 : duration;

        // Create span for error recording
        client
          .startSpan(spanName, options.spanOptions)
          .then((span: any) => {
            span.setAttribute(`duration_${unit}`, durationValue);
            span.finish();
          })
          .catch(() => {});

        throw error;
      }
    } as T;

    return descriptor;
  };
}

/**
 * Retry decorator - adds retry logic with tracing
 */
export function retry(
  options: {
    maxAttempts?: number;
    delay?: number;
    backoff?: number;
    spanOptions?: SpanOptions;
  } = {}
) {
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
      span.setAttribute(
        'retry.final_error',
        lastError instanceof Error ? lastError.message : String(lastError)
      );
      await span.finish();
      throw lastError;
    } as T;

    return descriptor;
  };
}

/**
 * Class decorator to automatically trace all methods
 */
export function traceClass(
  options: {
    prefix?: string;
    excludeMethods?: string[];
    spanOptions?: SpanOptions;
  } = {}
) {
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

  const params = match[1];
  if (!params) return [];

  return params
    .split(',')
    .map(param => {
      const trimmed = param.trim();
      return trimmed.split(/\s+/)[0] || '';
    })
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
    return (
      value.length <= 10 &&
      value.every(item => {
        const itemType = typeof item;
        return itemType === 'string' || itemType === 'number' || itemType === 'boolean';
      })
    );
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
