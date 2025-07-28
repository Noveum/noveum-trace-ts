/**
 * Context management for the Noveum Trace SDK
 * Handles tracking of active spans and traces across async operations
 */

import { AsyncLocalStorage } from 'async_hooks';
import type { IContextManager, ITrace, ISpan } from '../core/interfaces.js';

/**
 * Context data structure
 */
interface TraceContext {
  activeTrace?: ITrace;
  activeSpan?: ISpan;
  spanStack: ISpan[];
}

/**
 * Context manager implementation using AsyncLocalStorage
 */
export class ContextManager implements IContextManager {
  private readonly _asyncLocalStorage: AsyncLocalStorage<TraceContext>;
  private _fallbackContext: TraceContext = { spanStack: [] };

  constructor() {
    this._asyncLocalStorage = new AsyncLocalStorage<TraceContext>();
  }

  getActiveSpan(): ISpan | undefined {
    const context = this._getContext();
    return context.activeSpan;
  }

  setActiveSpan(span: ISpan): void {
    const context = this._getContext();
    context.activeSpan = span;
    
    // Also set the trace if not already set
    if (!context.activeTrace && span.traceId) {
      // We can't directly get the trace from span, so we'll need to handle this differently
      // For now, we'll just update the span
    }
  }

  withSpan<T>(span: ISpan, fn: () => T): T {
    const context = this._getContext();
    const newContext: TraceContext = {
      ...context,
      activeSpan: span,
      spanStack: [...context.spanStack, span],
    };

    if (this._asyncLocalStorage.getStore()) {
      return this._asyncLocalStorage.run(newContext, fn);
    } else {
      // Fallback for environments without AsyncLocalStorage
      const previousContext = this._fallbackContext;
      this._fallbackContext = newContext;
      try {
        return fn();
      } finally {
        this._fallbackContext = previousContext;
      }
    }
  }

  async withSpanAsync<T>(span: ISpan, fn: () => Promise<T>): Promise<T> {
    const context = this._getContext();
    const newContext: TraceContext = {
      ...context,
      activeSpan: span,
      spanStack: [...context.spanStack, span],
    };

    if (this._asyncLocalStorage.getStore()) {
      return this._asyncLocalStorage.run(newContext, fn);
    } else {
      // Fallback for environments without AsyncLocalStorage
      const previousContext = this._fallbackContext;
      this._fallbackContext = newContext;
      try {
        return await fn();
      } finally {
        this._fallbackContext = previousContext;
      }
    }
  }

  getActiveTrace(): ITrace | undefined {
    const context = this._getContext();
    return context.activeTrace;
  }

  setActiveTrace(trace: ITrace): void {
    const context = this._getContext();
    context.activeTrace = trace;
  }

  withTrace<T>(trace: ITrace, fn: () => T): T {
    const context = this._getContext();
    const newContext: TraceContext = {
      ...context,
      activeTrace: trace,
      spanStack: [], // Reset span stack for new trace
    };

    if (this._asyncLocalStorage.getStore()) {
      return this._asyncLocalStorage.run(newContext, fn);
    } else {
      // Fallback for environments without AsyncLocalStorage
      const previousContext = this._fallbackContext;
      this._fallbackContext = newContext;
      try {
        return fn();
      } finally {
        this._fallbackContext = previousContext;
      }
    }
  }

  async withTraceAsync<T>(trace: ITrace, fn: () => Promise<T>): Promise<T> {
    const context = this._getContext();
    const newContext: TraceContext = {
      ...context,
      activeTrace: trace,
      spanStack: [], // Reset span stack for new trace
    };

    if (this._asyncLocalStorage.getStore()) {
      return this._asyncLocalStorage.run(newContext, fn);
    } else {
      // Fallback for environments without AsyncLocalStorage
      const previousContext = this._fallbackContext;
      this._fallbackContext = newContext;
      try {
        return await fn();
      } finally {
        this._fallbackContext = previousContext;
      }
    }
  }

  /**
   * Get the parent span (previous span in the stack)
   */
  getParentSpan(): ISpan | undefined {
    const context = this._getContext();
    const stack = context.spanStack;
    return stack.length > 1 ? stack[stack.length - 2] : undefined;
  }

  /**
   * Get the span stack
   */
  getSpanStack(): readonly ISpan[] {
    const context = this._getContext();
    return [...context.spanStack];
  }

  /**
   * Pop the current span from the stack
   */
  popSpan(): ISpan | undefined {
    const context = this._getContext();
    const poppedSpan = context.spanStack.pop();
    
    // Update active span to the new top of stack
    context.activeSpan = context.spanStack[context.spanStack.length - 1];
    
    return poppedSpan;
  }

  /**
   * Clear all context
   */
  clear(): void {
    const context = this._getContext();
    context.activeTrace = undefined;
    context.activeSpan = undefined;
    context.spanStack = [];
  }

  /**
   * Get current context or create a new one
   */
  private _getContext(): TraceContext {
    const store = this._asyncLocalStorage.getStore();
    if (store) {
      return store;
    }

    // Return fallback context for environments without AsyncLocalStorage
    return this._fallbackContext;
  }

  /**
   * Check if AsyncLocalStorage is available
   */
  isAsyncLocalStorageAvailable(): boolean {
    try {
      return typeof AsyncLocalStorage !== 'undefined';
    } catch {
      return false;
    }
  }

  /**
   * Get context information for debugging
   */
  getContextInfo(): {
    hasActiveTrace: boolean;
    hasActiveSpan: boolean;
    spanStackDepth: number;
    isUsingAsyncLocalStorage: boolean;
  } {
    const context = this._getContext();
    
    return {
      hasActiveTrace: !!context.activeTrace,
      hasActiveSpan: !!context.activeSpan,
      spanStackDepth: context.spanStack.length,
      isUsingAsyncLocalStorage: !!this._asyncLocalStorage.getStore(),
    };
  }
}

/**
 * Global context manager instance
 */
let globalContextManager: ContextManager | undefined;

/**
 * Get the global context manager instance
 */
export function getGlobalContextManager(): ContextManager {
  if (!globalContextManager) {
    globalContextManager = new ContextManager();
  }
  return globalContextManager;
}

/**
 * Set a custom global context manager
 */
export function setGlobalContextManager(contextManager: ContextManager): void {
  globalContextManager = contextManager;
}

/**
 * Utility functions for working with context
 */

/**
 * Run a function with a clean context (no active trace or span)
 */
export async function withCleanContext<T>(fn: () => Promise<T>): Promise<T> {
  const contextManager = getGlobalContextManager();
  const emptyContext: TraceContext = { spanStack: [] };
  
  return contextManager['_asyncLocalStorage'].run(emptyContext, fn);
}

/**
 * Get the current active span from global context
 */
export function getCurrentSpan(): ISpan | undefined {
  return getGlobalContextManager().getActiveSpan();
}

/**
 * Get the current active trace from global context
 */
export function getCurrentTrace(): ITrace | undefined {
  return getGlobalContextManager().getActiveTrace();
}

/**
 * Set the current active span in global context
 */
export function setCurrentSpan(span: ISpan): void {
  getGlobalContextManager().setActiveSpan(span);
}

/**
 * Set the current active trace in global context
 */
export function setCurrentTrace(trace: ITrace): void {
  getGlobalContextManager().setActiveTrace(trace);
}

