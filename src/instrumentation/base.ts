/**
 * Base Instrumentation Class
 *
 * Provides common functionality for all instrumentation modules,
 * including method patching utilities and span creation.
 */

import type { ISpan } from '../core/interfaces.js';
import { SpanKind } from '../core/types.js';
import { getGlobalContextManager } from '../context/context-manager.js';
import type {
  IInstrumentation,
  InstrumentationTarget,
  InstrumentationConfig,
  InstrumentationContext,
  InstrumentedMethod,
  MethodHooks,
} from './types.js';

import { DEFAULT_INSTRUMENTATION_CONFIG } from './types.js';

/**
 * Abstract base class for instrumentation modules
 */
export abstract class BaseInstrumentation implements IInstrumentation {
  abstract readonly target: InstrumentationTarget;
  abstract readonly name: string;
  abstract readonly version: string;

  protected _config: Required<InstrumentationConfig>;
  protected _isEnabled = true;
  protected readonly _instrumentedMethods = new Map<any, Map<string, InstrumentedMethod>>();

  constructor(config: InstrumentationConfig = {}) {
    this._config = { ...DEFAULT_INSTRUMENTATION_CONFIG, ...config };
  }

  /**
   * Whether this instrumentation is currently enabled
   */
  get isEnabled(): boolean {
    return this._isEnabled && this._config.enabled;
  }

  /**
   * Apply instrumentation to a library instance
   */
  async instrument(instance: any, config?: InstrumentationConfig): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    if (!this.isSupported(instance)) {
      throw new Error(`Instance is not supported by ${this.name} instrumentation`);
    }

    if (this._instrumentedMethods.has(instance)) {
      throw new Error(`Instance is already instrumented by ${this.name}`);
    }

    // Merge configuration
    const finalConfig = { ...this._config, ...config };

    // Apply patches
    const instrumentedMethods = new Map<string, InstrumentedMethod>();
    const methodsToInstrument = this.getMethodsToInstrument(instance);

    for (const methodName of methodsToInstrument) {
      if (finalConfig.ignoredMethods.includes(methodName)) {
        continue;
      }

      try {
        const instrumentedMethod = await this.instrumentMethod(instance, methodName, finalConfig);

        if (instrumentedMethod) {
          instrumentedMethods.set(methodName, instrumentedMethod);
        }
      } catch (error) {
        // Rollback any successful instrumentations
        await this.rollbackInstrumentation(instance, instrumentedMethods);
        throw new Error(`Failed to instrument method ${methodName}: ${error}`);
      }
    }

    this._instrumentedMethods.set(instance, instrumentedMethods);
  }

  /**
   * Remove instrumentation from a library instance
   */
  async uninstrument(instance: any): Promise<void> {
    const instrumentedMethods = this._instrumentedMethods.get(instance);
    if (!instrumentedMethods) {
      return; // Not instrumented
    }

    await this.rollbackInstrumentation(instance, instrumentedMethods);
    this._instrumentedMethods.delete(instance);
  }

  /**
   * Check if a library instance is supported for instrumentation
   */
  abstract isSupported(instance: any): boolean;

  /**
   * Get the version of the instrumented library
   */
  abstract getLibraryVersion(instance: any): string | undefined;

  /**
   * Get methods that should be instrumented for this library
   */
  protected abstract getMethodsToInstrument(instance: any): string[];

  /**
   * Get instrumentation configuration
   */
  getConfig(): InstrumentationConfig {
    return { ...this._config };
  }

  /**
   * Update instrumentation configuration
   */
  updateConfig(config: Partial<InstrumentationConfig>): void {
    Object.assign(this._config, config);
  }

  /**
   * Enable this instrumentation
   */
  enable(): void {
    this._isEnabled = true;
  }

  /**
   * Disable this instrumentation
   */
  disable(): void {
    this._isEnabled = false;
  }

  /**
   * Create hooks for a specific method
   */
  protected createMethodHooks(
    _instance: any,
    _methodName: string,
    _config: InstrumentationConfig
  ): MethodHooks {
    return {
      before: (context: InstrumentationContext) => {
        this.beforeMethodCall(context);
      },
      after: (context: InstrumentationContext, result: any) => {
        this.afterMethodCall(context, result);
      },
      error: (context: InstrumentationContext, error: Error) => {
        this.onMethodError(context, error);
      },
      finally: (context: InstrumentationContext) => {
        this.finallyMethodCall(context);
      },
    };
  }

  /**
   * Instrument a specific method
   */
  protected async instrumentMethod(
    instance: any,
    methodName: string,
    config: InstrumentationConfig
  ): Promise<InstrumentedMethod | undefined> {
    const target = this.getMethodTarget(instance, methodName);
    if (!target || typeof target[methodName] !== 'function') {
      return undefined;
    }

    const originalMethod = target[methodName];
    const hooks = this.createMethodHooks(instance, methodName, config);

    const instrumentedMethod = this.createInstrumentedMethod(
      originalMethod,
      methodName,
      config,
      hooks
    );

    // Replace the original method
    target[methodName] = instrumentedMethod;

    return {
      original: originalMethod,
      instrumented: instrumentedMethod,
      config,
      instrumentedAt: new Date(),
    };
  }

  /**
   * Create an instrumented version of a method
   */
  protected createInstrumentedMethod(
    originalMethod: Function,
    methodName: string,
    config: InstrumentationConfig,
    hooks: MethodHooks
  ): Function {
    const self = this;

    return async function instrumentedFunction(this: any, ...args: any[]) {
      const context: InstrumentationContext = {
        methodName,
        arguments: args,
        instance: this,
        target: self.target,
        config,
        startTime: new Date(),
        attributes: { ...config.attributes },
      };

      let span: ISpan | undefined;
      let result: any;
      let error: Error | undefined;

      try {
        // Before hook
        await hooks.before?.(context);

        // Create span if tracing is enabled
        span = await self.createSpan(context);

        // Call original method
        result = await originalMethod.apply(this, args);

        // After hook
        await hooks.after?.(context, result);

        return result;
      } catch (err) {
        error = err as Error;

        // Error hook
        await hooks.error?.(context, error);

        // Add error to span
        if (span) {
          const { SpanStatus } = await import('../core/types.js');
          span.setStatus(SpanStatus.ERROR, error.message);

          // Record exception if the span implementation supports it
          if ('recordException' in span && typeof (span as any).recordException === 'function') {
            (span as any).recordException(error);
          } else {
            // Fallback: add error as event
            span.addEvent('exception', {
              'exception.type': error.name,
              'exception.message': error.message,
              'exception.stacktrace': error.stack || '',
            });
          }
        }

        throw error;
      } finally {
        try {
          // Finally hook
          await hooks.finally?.(context);

          // Finish span
          if (span) {
            await self.finishSpan(span, context, result, error);
          }
        } catch (finallyError) {
          // Don't let finally errors interfere with the original result
          console.warn('Error in instrumentation finally hook:', finallyError);
        }
      }
    };
  }

  /**
   * Create a span for an instrumented method call
   */
  protected async createSpan(context: InstrumentationContext): Promise<ISpan | undefined> {
    try {
      const contextManager = getGlobalContextManager();
      const parentTrace = contextManager.getActiveTrace();

      if (!parentTrace) {
        return undefined; // No active trace
      }

      const spanName = context.config.spanNameFormatter
        ? context.config.spanNameFormatter(context.methodName, context.arguments)
        : context.methodName;

      const span = await parentTrace.startSpan(spanName, {
        kind: SpanKind.CLIENT,
        attributes: {
          ...context.attributes,
          'instrumentation.name': this.name,
          'instrumentation.version': this.version,
          'instrumentation.target': this.target,
          'method.name': context.methodName,
        },
      });

      // Set as active span
      contextManager.setActiveSpan(span);

      // Capture arguments if enabled
      if (context.config.captureArguments) {
        span.setAttributes({
          'method.arguments': this.sanitizeData(context.arguments, context.config),
        });
      }

      return span;
    } catch (error) {
      console.warn('Failed to create span for instrumented method:', error);
      return undefined;
    }
  }

  /**
   * Finish a span with result and error information
   */
  protected async finishSpan(
    span: ISpan,
    context: InstrumentationContext,
    result?: any,
    error?: Error
  ): Promise<void> {
    try {
      // Capture result if enabled
      if (context.config.captureResults && result !== undefined && !error) {
        span.setAttributes({
          'method.result': this.sanitizeData(result, context.config),
        });
      }

      // Set duration
      const duration = Date.now() - context.startTime.getTime();
      span.setAttributes({
        'method.duration_ms': duration,
      });

      await span.finish();
    } catch (finishError) {
      console.warn('Failed to finish span:', finishError);
    }
  }

  /**
   * Get the target object that contains the method to instrument
   */
  protected getMethodTarget(instance: any, _methodName: string): any {
    // Default implementation looks directly on the instance
    return instance;
  }

  /**
   * Rollback instrumentation on an instance
   */
  protected async rollbackInstrumentation(
    instance: any,
    instrumentedMethods: Map<string, InstrumentedMethod>
  ): Promise<void> {
    for (const [methodName, methodInfo] of instrumentedMethods) {
      try {
        const target = this.getMethodTarget(instance, methodName);
        if (target) {
          target[methodName] = methodInfo.original;
        }
      } catch (error) {
        console.warn(`Failed to restore method ${methodName}:`, error);
      }
    }
  }

  /**
   * Sanitize data for span attributes according to configuration
   */
  protected sanitizeData(data: any, config: InstrumentationConfig): any {
    if (!config.capturePayloads) {
      return '[REDACTED]';
    }

    try {
      const serialized = JSON.stringify(data);
      if (serialized.length > (config.maxPayloadSize || 1000)) {
        return `[TRUNCATED - ${serialized.length} bytes]`;
      }
      return JSON.parse(serialized); // Deep clone
    } catch {
      return '[NON_SERIALIZABLE]';
    }
  }

  /**
   * Hook called before method execution
   */
  protected beforeMethodCall(_context: InstrumentationContext): void {
    // Override in subclasses for custom behavior
  }

  /**
   * Hook called after successful method execution
   */
  protected afterMethodCall(_context: InstrumentationContext, _result: any): void {
    // Override in subclasses for custom behavior
  }

  /**
   * Hook called when method execution throws an error
   */
  protected onMethodError(_context: InstrumentationContext, _error: Error): void {
    // Override in subclasses for custom behavior
  }

  /**
   * Hook called regardless of success or failure
   */
  protected finallyMethodCall(_context: InstrumentationContext): void {
    // Override in subclasses for custom behavior
  }
}
