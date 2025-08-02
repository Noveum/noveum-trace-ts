/**
 * Simple decorators for backward compatibility and testing
 */

import { NoveumClient } from '../core/client.js';

let globalClient: NoveumClient | undefined;

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
}

/**
 * Simple trace decorator
 */
export function trace(name: string, options: SimpleDecoratorOptions = {}) {
  return function (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const isAsync = originalMethod.constructor.name === 'AsyncFunction';

    if (isAsync) {
      descriptor.value = async function (...args: any[]) {
        const client = options.client || getClient();
        const trace = await client.createTrace(name);

        try {
          const result = await originalMethod.apply(this, args);
          return result;
        } catch (error) {
          throw error;
        } finally {
          await trace.finish();
        }
      };
    } else {
      // Keep synchronous methods synchronous
      descriptor.value = function (...args: any[]) {
        const client = options.client || getClient();
        // For sync methods, we can't properly await the trace lifecycle
        // This is a limitation of the decorator pattern with sync methods
        const tracePromise = client.createTrace(name);

        try {
          const result = originalMethod.apply(this, args);
          // Fire and forget the trace finish
          tracePromise.then(trace => trace.finish()).catch(() => {});
          return result;
        } catch (error) {
          tracePromise.then(trace => trace.finish()).catch(() => {});
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
          span.setAttribute(`arg${index}`, String(arg));
        });
      }

      try {
        const result = await originalMethod.apply(this, args);

        if (options.captureReturn) {
          span.setAttribute('return', String(result));
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
 */
export function timed(name: string, options: SimpleDecoratorOptions = {}) {
  return function (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const isAsync = originalMethod.constructor.name === 'AsyncFunction';

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
          span.recordException(error as Error);
          throw error;
        } finally {
          await span.finish();
        }
      };
    } else {
      // Keep synchronous methods synchronous
      descriptor.value = function (...args: any[]) {
        const client = options.client || getClient();
        const startTime = Date.now();

        // For sync methods, we can't properly await the span lifecycle
        const spanPromise = client.startSpan(name);

        try {
          const result = originalMethod.apply(this, args);
          const duration = Date.now() - startTime;
          // Fire and forget
          spanPromise
            .then(span => {
              span.setAttribute('duration_ms', duration);
              return span.finish();
            })
            .catch(() => {});
          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          spanPromise
            .then(span => {
              span.setAttribute('duration_ms', duration);
              span.recordException(error as Error);
              return span.finish();
            })
            .catch(() => {});
          throw error;
        }
      };
    }

    return descriptor;
  };
}
