/**
 * Context management for the Noveum Trace SDK
 * Handles tracking of active spans and traces across async operations
 * Matches Python SDK's context management functionality
 */

import { AsyncLocalStorage } from 'async_hooks';
import type { IContextManager, ITrace, ISpan } from '../core/interfaces.js';
import type { Attributes } from '../core/types.js';

/**
 * Browser polyfill for AsyncLocalStorage
 */
class BrowserAsyncLocalStorage<T> {
  private _store: T | undefined;

  run<R>(store: T, callback: () => R): R {
    const previousStore = this._store;
    this._store = store;
    try {
      return callback();
    } finally {
      this._store = previousStore;
    }
  }

  getStore(): T | undefined {
    return this._store;
  }
}

/**
 * Get AsyncLocalStorage implementation based on environment
 */
function getAsyncLocalStorage<T>(): AsyncLocalStorage<T> | BrowserAsyncLocalStorage<T> {
  if (typeof AsyncLocalStorage !== 'undefined') {
    return new AsyncLocalStorage<T>();
  }
  return new BrowserAsyncLocalStorage<T>();
}

/**
 * Enhanced TraceContext class to hold trace, span, and attributes
 */
export class TraceContext {
  public activeTrace: ITrace | undefined;
  public activeSpan: ISpan | undefined;
  public spanStack: ISpan[];
  public attributes: Attributes;

  constructor(
    activeTrace?: ITrace,
    activeSpan?: ISpan,
    spanStack?: ISpan[],
    attributes?: Attributes
  ) {
    this.activeTrace = activeTrace;
    this.activeSpan = activeSpan;
    this.spanStack = spanStack || [];
    this.attributes = attributes || {};
  }

  /**
   * Create a copy of this context with optional overrides
   */
  copy(overrides?: Partial<TraceContext>): TraceContext {
    return new TraceContext(
      overrides?.activeTrace ?? this.activeTrace,
      overrides?.activeSpan ?? this.activeSpan,
      overrides?.spanStack ? [...overrides.spanStack] : [...this.spanStack],
      overrides?.attributes
        ? { ...this.attributes, ...overrides.attributes }
        : { ...this.attributes }
    );
  }

  /**
   * Set multiple attributes on the context
   */
  setAttributes(attributes: Attributes): void {
    Object.assign(this.attributes, attributes);
  }

  /**
   * Set a single attribute on the context
   */
  setAttribute(key: string, value: Attributes[string]): void {
    this.attributes[key] = value;
  }

  /**
   * Get an attribute from the context
   */
  getAttribute(key: string): Attributes[string] | undefined {
    return this.attributes[key];
  }

  /**
   * Clear all context
   */
  clear(): void {
    this.activeTrace = undefined;
    this.activeSpan = undefined;
    this.spanStack = [];
    this.attributes = {};
  }
}

/**
 * Context token for attach/detach operations (Python SDK style)
 */
export interface ContextToken {
  readonly id: string;
  readonly previousContext: TraceContext;
}

/**
 * Context manager implementation using AsyncLocalStorage with Python SDK compatibility
 */
export class ContextManager implements IContextManager {
  private readonly _asyncLocalStorage:
    | AsyncLocalStorage<TraceContext>
    | BrowserAsyncLocalStorage<TraceContext>;
  private _fallbackContext: TraceContext = new TraceContext();
  private _tokenCounter = 0;

  constructor() {
    this._asyncLocalStorage = getAsyncLocalStorage<TraceContext>();
  }

  /**
   * Get the current context (matches Python SDK's get_current_context)
   */
  getCurrentContext(): TraceContext {
    const store = this._asyncLocalStorage.getStore();
    if (store) {
      return store;
    }
    return this._fallbackContext;
  }

  getActiveSpan(): ISpan | undefined {
    const context = this.getCurrentContext();
    return context.activeSpan;
  }

  setActiveSpan(span: ISpan): void {
    const context = this.getCurrentContext();
    context.activeSpan = span;

    // Add to span stack if not already there
    if (!context.spanStack.includes(span)) {
      context.spanStack.push(span);
    }

    // Also set the trace if not already set
    if (!context.activeTrace && span.traceId) {
      // We can't directly get the trace from span, so we'll need to handle this differently
      // For now, we'll just update the span
    }
  }

  withSpan<T>(span: ISpan, fn: () => T): T {
    const context = this.getCurrentContext();
    const newContext = context.copy({
      activeSpan: span,
      spanStack: [...context.spanStack, span],
    });

    return this._asyncLocalStorage.run(newContext, fn);
  }

  async withSpanAsync<T>(span: ISpan, fn: () => Promise<T>): Promise<T> {
    const context = this.getCurrentContext();
    const newContext = context.copy({
      activeSpan: span,
      spanStack: [...context.spanStack, span],
    });

    return this._asyncLocalStorage.run(newContext, fn);
  }

  getActiveTrace(): ITrace | undefined {
    const context = this.getCurrentContext();
    return context.activeTrace;
  }

  setActiveTrace(trace: ITrace): void {
    const context = this.getCurrentContext();
    context.activeTrace = trace;
  }

  withTrace<T>(trace: ITrace, fn: () => T): T {
    const context = this.getCurrentContext();
    const newContext = context.copy({
      activeTrace: trace,
      spanStack: [], // Reset span stack for new trace
    });

    return this._asyncLocalStorage.run(newContext, fn);
  }

  async withTraceAsync<T>(trace: ITrace, fn: () => Promise<T>): Promise<T> {
    const context = this.getCurrentContext();
    const newContext = context.copy({
      activeTrace: trace,
      spanStack: [], // Reset span stack for new trace
    });

    return this._asyncLocalStorage.run(newContext, fn);
  }

  /**
   * Attach trace to context and return token for later detach (Python SDK style)
   */
  attachTrace(trace: ITrace): ContextToken {
    const currentContext = this.getCurrentContext();
    const token: ContextToken = {
      id: `token_${++this._tokenCounter}`,
      previousContext: currentContext.copy(),
    };

    currentContext.activeTrace = trace;
    currentContext.spanStack = []; // Reset span stack for new trace

    return token;
  }

  /**
   * Detach trace using token (Python SDK style)
   */
  detachTrace(token: ContextToken): void {
    const currentContext = this.getCurrentContext();
    currentContext.activeTrace = token.previousContext.activeTrace;
    currentContext.activeSpan = token.previousContext.activeSpan;
    currentContext.spanStack = [...token.previousContext.spanStack];
    currentContext.attributes = { ...token.previousContext.attributes };
  }

  /**
   * Attach span to context and return token for later detach (Python SDK style)
   */
  attachSpan(span: ISpan): ContextToken {
    const currentContext = this.getCurrentContext();
    const token: ContextToken = {
      id: `token_${++this._tokenCounter}`,
      previousContext: currentContext.copy(),
    };

    currentContext.activeSpan = span;
    currentContext.spanStack = [...currentContext.spanStack, span];

    return token;
  }

  /**
   * Detach span using token (Python SDK style)
   */
  detachSpan(token: ContextToken): void {
    const currentContext = this.getCurrentContext();
    currentContext.activeTrace = token.previousContext.activeTrace;
    currentContext.activeSpan = token.previousContext.activeSpan;
    currentContext.spanStack = [...token.previousContext.spanStack];
    currentContext.attributes = { ...token.previousContext.attributes };
  }

  /**
   * Get the parent span (previous span in the stack)
   */
  getParentSpan(): ISpan | undefined {
    const context = this.getCurrentContext();
    const stack = context.spanStack;
    return stack.length > 1 ? stack[stack.length - 2] : undefined;
  }

  /**
   * Get the span stack
   */
  getSpanStack(): readonly ISpan[] {
    const context = this.getCurrentContext();
    return [...context.spanStack];
  }

  /**
   * Pop the current span from the stack
   */
  popSpan(): ISpan | undefined {
    const context = this.getCurrentContext();
    const poppedSpan = context.spanStack.pop();

    // Update active span to the new top of stack
    context.activeSpan = context.spanStack[context.spanStack.length - 1] ?? undefined;

    return poppedSpan;
  }

  /**
   * Clear all context
   */
  clear(): void {
    const context = this.getCurrentContext();
    context.clear();
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
    contextAttributes: Attributes;
  } {
    const context = this.getCurrentContext();

    return {
      hasActiveTrace: !!context.activeTrace,
      hasActiveSpan: !!context.activeSpan,
      spanStackDepth: context.spanStack.length,
      isUsingAsyncLocalStorage: !!this._asyncLocalStorage.getStore(),
      contextAttributes: { ...context.attributes },
    };
  }
}

/**
 * Contextual wrapper for spans that auto-manage context
 */
export class ContextualSpan implements ISpan {
  private readonly _span: ISpan;
  private readonly _contextManager: ContextManager;
  private _token: ContextToken | undefined;

  constructor(span: ISpan, contextManager: ContextManager) {
    this._span = span;
    this._contextManager = contextManager;
    // Automatically attach this span to context
    this._token = this._contextManager.attachSpan(span);
  }

  // Delegate all ISpan methods to the wrapped span
  get spanId(): string {
    return this._span.spanId;
  }
  get traceId(): string {
    return this._span.traceId;
  }
  get parentSpanId(): string | undefined {
    return this._span.parentSpanId;
  }
  get name(): string {
    return this._span.name;
  }
  get startTime(): Date {
    return this._span.startTime;
  }
  get endTime(): Date | undefined {
    return this._span.endTime;
  }
  get isFinished(): boolean {
    return this._span.isFinished;
  }
  get status(): any {
    return this._span.status;
  }

  setAttributes(attributes: Attributes): void {
    this._span.setAttributes(attributes);
  }

  setAttribute(key: string, value: Attributes[string]): void {
    this._span.setAttribute(key, value);
  }

  addEvent(name: string, attributes?: Attributes): void {
    this._span.addEvent(name, attributes);
  }

  setStatus(status: any, message?: string): void {
    this._span.setStatus(status, message);
  }

  async finish(endTime?: Date): Promise<void> {
    try {
      await this._span.finish(endTime);
    } finally {
      // Automatically detach from context when finished
      if (this._token) {
        this._contextManager.detachSpan(this._token);
        this._token = undefined;
      }
    }
  }

  serialize(): any {
    return this._span.serialize();
  }
}

/**
 * Contextual wrapper for traces that auto-manage context
 */
export class ContextualTrace implements ITrace {
  private readonly _trace: ITrace;
  private readonly _contextManager: ContextManager;
  private _token: ContextToken | undefined;

  constructor(trace: ITrace, contextManager: ContextManager) {
    this._trace = trace;
    this._contextManager = contextManager;
    // Automatically attach this trace to context
    this._token = this._contextManager.attachTrace(trace);
  }

  // Delegate all ITrace methods to the wrapped trace
  get traceId(): string {
    return this._trace.traceId;
  }
  get name(): string {
    return this._trace.name;
  }
  get startTime(): Date {
    return this._trace.startTime;
  }
  get endTime(): Date | undefined {
    return this._trace.endTime;
  }
  get isFinished(): boolean {
    return this._trace.isFinished;
  }
  get spans(): ISpan[] {
    return this._trace.spans;
  }

  async startSpan(name: string, options?: any): Promise<ISpan> {
    const span = await this._trace.startSpan(name, options);
    // Return a contextual span that auto-manages context
    return new ContextualSpan(span, this._contextManager);
  }

  setAttributes(attributes: Attributes): void {
    this._trace.setAttributes(attributes);
  }

  setAttribute(key: string, value: Attributes[string]): void {
    this._trace.setAttribute(key, value);
  }

  addEvent(name: string, attributes?: Attributes): void {
    this._trace.addEvent(name, attributes);
  }

  setStatus(status: any): void {
    this._trace.setStatus(status);
  }

  getStatus(): any {
    return this._trace.getStatus();
  }

  async finish(endTime?: Date): Promise<void> {
    try {
      await this._trace.finish(endTime);
    } finally {
      // Automatically detach from context when finished
      if (this._token) {
        this._contextManager.detachTrace(this._token);
        this._token = undefined;
      }
    }
  }

  serialize(): any {
    return this._trace.serialize();
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
 * Context manager function using generators (Python SDK style)
 */
export function* traceContext(
  trace?: ITrace,
  span?: ISpan,
  attributes?: Attributes
): Generator<TraceContext, void, unknown> {
  const contextManager = getGlobalContextManager();
  const currentContext = contextManager.getCurrentContext();

  // Create new context with provided values
  const newContext = currentContext.copy({
    activeTrace: trace ?? currentContext.activeTrace,
    activeSpan: span ?? currentContext.activeSpan,
    attributes: attributes
      ? { ...currentContext.attributes, ...attributes }
      : currentContext.attributes,
  });

  // Use AsyncLocalStorage to run with new context
  yield* (function* () {
    yield newContext;
  })();
}

/**
 * Utility functions for working with context
 */

/**
 * Run a function with a clean context (no active trace or span)
 */
export async function withCleanContext<T>(fn: () => Promise<T>): Promise<T> {
  const contextManager = getGlobalContextManager();
  const emptyContext = new TraceContext();

  return contextManager['_asyncLocalStorage'].run(emptyContext, fn);
}

/**
 * Get the current context from global context manager
 */
export function getCurrentContext(): TraceContext {
  return getGlobalContextManager().getCurrentContext();
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

/**
 * Run a function with a specific context
 */
export function withContext<T>(context: TraceContext, fn: () => T): T {
  const contextManager = getGlobalContextManager();
  return contextManager['_asyncLocalStorage'].run(context, fn);
}

/**
 * Run an async function with a specific context
 */
export async function withContextAsync<T>(context: TraceContext, fn: () => Promise<T>): Promise<T> {
  const contextManager = getGlobalContextManager();
  return contextManager['_asyncLocalStorage'].run(context, fn);
}

/**
 * Create a contextual span that auto-manages context
 */
export function createContextualSpan(span: ISpan): ContextualSpan {
  return new ContextualSpan(span, getGlobalContextManager());
}

/**
 * Create a contextual trace that auto-manages context
 */
export function createContextualTrace(trace: ITrace): ContextualTrace {
  return new ContextualTrace(trace, getGlobalContextManager());
}
