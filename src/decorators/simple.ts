/**
 * Simple decorators for backward compatibility and testing
 */

import { NoveumClient } from '../core/client.js';

let globalClient: NoveumClient | undefined;

/**
 * Safely serialize a value to string, handling objects and circular references
 */
function safeSerialize(value: any): string {
  if (value === null || value === undefined) {
    return String(value);
  }

  try {
    if (typeof value === 'object') {
      const seen = new WeakSet();
      return JSON.stringify(value, (_key, val) => {
        if (typeof val === 'object' && val !== null) {
          if (seen.has(val)) return '[Circular]';
          seen.add(val);
          // Collapse non-plain objects to avoid huge payloads
          if (!(val.constructor === Object || Array.isArray(val))) return '[Object]';
        }
        return val;
      });
    }
    return String(value);
  } catch (e) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('[Noveum] Error serializing value:', e instanceof Error ? e.message : e);
    }
    return '[Unserializable]';
  }
}

/**
 * Set the global client for decorators
 */
export function setGlobalClient(client: NoveumClient): void {
  globalClient = client;
}

/**
 * Get the global client
 */
function getClient(): NoveumClient {
  if (!globalClient) {
    throw new Error('Global client not set. Call setGlobalClient first.');
  }
  return globalClient;
}

interface SimpleDecoratorOptions {
  client?: NoveumClient;
  captureArgs?: boolean;
  captureReturn?: boolean;
  /**
   * Whether to warn about synchronous method limitations (default: true)
   * Set to false to suppress warnings in environments where sync limitations are acceptable
   */
  warnOnSyncMethods?: boolean;
  /**
   * Whether to enforce async-only usage (default: false)
   * When true, throws an error if applied to synchronous methods
   */
  requireAsync?: boolean;
}

/**
 * Simple trace decorator
 *
 * @param name - Name of the trace
 * @param options - Configuration options
 *
 * ⚠️  WARNING: When applied to synchronous methods, this decorator has reliability limitations.
 * Consider using async methods or setting requireAsync: true to prevent sync usage.
 */
export function trace(name: string, options: SimpleDecoratorOptions = {}) {
  const { warnOnSyncMethods = true, requireAsync = false } = options;

  return function (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const isAsync = originalMethod.constructor.name === 'AsyncFunction';

    if (!isAsync && requireAsync) {
      throw new Error(
        `Trace decorator with requireAsync=true cannot be applied to synchronous method '${_propertyKey}'. ` +
          `Convert the method to async or set requireAsync=false to allow synchronous tracing with limitations.`
      );
    }

    if (isAsync) {
      descriptor.value = async function (...args: any[]) {
        const client = options.client || getClient();
        const trace = await client.createTrace(name);

        try {
          const result = await originalMethod.apply(this, args);
          return result;
        } catch (error) {
          trace.addEvent('method_error', {
            'error.type': error instanceof Error ? error.constructor.name : 'Unknown',
            'error.message': error instanceof Error ? error.message : String(error),
          });
          throw error;
        } finally {
          await trace.finish();
        }
      };
    } else {
      // Warn about synchronous method limitations
      if (warnOnSyncMethods && process.env.NODE_ENV !== 'test') {
        console.warn(
          `[Noveum Trace] WARNING: Applying trace decorator to synchronous method '${_propertyKey}'. ` +
            `This has reliability limitations. Consider making the method async or review documentation for details.`
        );
      }

      // Keep synchronous methods synchronous with fire-and-forget tracing
      descriptor.value = function (...args: any[]) {
        const client = options.client || getClient();

        // For sync methods, we can't properly await the trace lifecycle
        // This is a documented limitation of the decorator pattern with sync methods
        const tracePromise = client.createTrace(name);

        try {
          const result = originalMethod.apply(this, args);

          // Fire and forget the trace finish - errors are logged but not thrown
          tracePromise
            .then(trace => trace.finish())
            .catch(error => {
              if (process.env.NODE_ENV !== 'test') {
                console.error(
                  `[Noveum Trace] Error finishing trace for sync method '${_propertyKey}':`,
                  error
                );
              }
            });

          return result;
        } catch (error) {
          // Fire and forget trace finish with error recording
          tracePromise
            .then(trace => {
              trace.addEvent('method_error', {
                'error.type': error instanceof Error ? error.constructor.name : 'Unknown',
                'error.message': error instanceof Error ? error.message : String(error),
              });
              return trace.finish();
            })
            .catch(traceError => {
              if (process.env.NODE_ENV !== 'test') {
                console.error(
                  `[Noveum Trace] Error finishing trace for sync method '${_propertyKey}':`,
                  traceError
                );
              }
            });

          throw error;
        }
      };
    }

    return descriptor;
  };
}

/**
 * Simple span decorator
 */
export function span(name: string, options: SimpleDecoratorOptions = {}) {
  return function (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const client = options.client || getClient();
      const span = await client.startSpan(name);

      if (options.captureArgs) {
        args.forEach((arg, index) => {
          span.setAttribute(`arg${index}`, safeSerialize(arg));
        });
      }

      try {
        const result = await originalMethod.apply(this, args);

        if (options.captureReturn) {
          span.setAttribute('return', safeSerialize(result));
        }

        return result;
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        await span.finish();
      }
    };

    return descriptor;
  };
}

/**
 * Simple timed decorator
 *
 * @param name - Name of the span
 * @param options - Configuration options
 *
 * ⚠️  WARNING: When applied to synchronous methods, this decorator has reliability limitations.
 */
export function timed(name: string, options: SimpleDecoratorOptions = {}) {
  const { warnOnSyncMethods = true, requireAsync = false } = options;

  return function (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const isAsync = originalMethod.constructor.name === 'AsyncFunction';

    if (!isAsync && requireAsync) {
      throw new Error(
        `Timed decorator with requireAsync=true cannot be applied to synchronous method '${_propertyKey}'. ` +
          `Convert the method to async or set requireAsync=false to allow synchronous timing with limitations.`
      );
    }

    if (isAsync) {
      descriptor.value = async function (...args: any[]) {
        const client = options.client || getClient();
        const span = await client.startSpan(name);
        const startTime = Date.now();

        try {
          const result = await originalMethod.apply(this, args);
          const duration = Date.now() - startTime;
          span.setAttribute('duration_ms', duration);
          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          span.setAttribute('duration_ms', duration);
          span.addEvent('method_error', {
            'error.type': error instanceof Error ? error.constructor.name : 'Unknown',
            'error.message': error instanceof Error ? error.message : String(error),
          });
          throw error;
        } finally {
          await span.finish();
        }
      };
    } else {
      // Warn about synchronous method limitations
      if (warnOnSyncMethods && process.env.NODE_ENV !== 'test') {
        console.warn(
          `[Noveum Trace] WARNING: Applying timed decorator to synchronous method '${_propertyKey}'. ` +
            `This has reliability limitations. Consider making the method async or review documentation for details.`
        );
      }

      // Keep synchronous methods synchronous with fire-and-forget timing
      descriptor.value = function (...args: any[]) {
        const client = options.client || getClient();
        const startTime = Date.now();

        // For sync methods, we can't properly await the span lifecycle
        const spanPromise = client.startSpan(name);

        try {
          const result = originalMethod.apply(this, args);
          const duration = Date.now() - startTime;

          // Fire and forget the span finish - errors are logged but not thrown
          spanPromise
            .then(span => {
              span.setAttribute('duration_ms', duration);
              return span.finish();
            })
            .catch(error => {
              if (process.env.NODE_ENV !== 'test') {
                console.error(
                  `[Noveum Trace] Error finishing span for sync method '${_propertyKey}':`,
                  error
                );
              }
            });

          return result;
        } catch (error) {
          const duration = Date.now() - startTime;

          // Fire and forget span finish with error recording
          spanPromise
            .then(span => {
              span.setAttribute('duration_ms', duration);
              span.addEvent('method_error', {
                'error.type': error instanceof Error ? error.constructor.name : 'Unknown',
                'error.message': error instanceof Error ? error.message : String(error),
              });
              return span.finish();
            })
            .catch(spanError => {
              if (process.env.NODE_ENV !== 'test') {
                console.error(
                  `[Noveum Trace] Error finishing span for sync method '${_propertyKey}':`,
                  spanError
                );
              }
            });

          throw error;
        }
      };
    }

    return descriptor;
  };
}
