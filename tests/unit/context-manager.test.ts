/**
 * Tests for the enhanced context management system
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ContextManager,
  TraceContext,
  ContextualSpan,
  ContextualTrace,
  getGlobalContextManager,
  getCurrentContext,
  getCurrentSpan,
  getCurrentTrace,
  setCurrentSpan,
  setCurrentTrace,
  withContext,
  withContextAsync,
  traceContext,
  createContextualSpan,
  createContextualTrace,
} from '../../src/context/context-manager.js';
import type { ITrace, ISpan } from '../../src/core/interfaces.js';
import type { Attributes } from '../../src/core/types.js';

// Mock span implementation
class MockSpan implements ISpan {
  public spanId: string;
  public traceId: string;
  public parentSpanId: string | undefined;
  public name: string;
  public startTime: Date;
  public endTime: Date | undefined;
  public isFinished: boolean = false;
  public status: any = 'ok';
  private _attributes: Attributes = {};

  constructor(spanId: string, traceId: string, name: string, parentSpanId?: string) {
    this.spanId = spanId;
    this.traceId = traceId;
    this.name = name;
    this.parentSpanId = parentSpanId;
    this.startTime = new Date();
  }

  setAttributes(attributes: Attributes): void {
    Object.assign(this._attributes, attributes);
  }

  setAttribute(key: string, value: Attributes[string]): void {
    this._attributes[key] = value;
  }

  addEvent(name: string, attributes?: Attributes): void {
    // Mock implementation
  }

  setStatus(status: any, message?: string): void {
    this.status = status;
  }

  public recordException(exception: Error | string): void {
    // no-op for tests
  }

  async finish(endTime?: Date): Promise<void> {
    this.endTime = endTime || new Date();
    this.isFinished = true;
  }

  serialize(): any {
    return {
      spanId: this.spanId,
      traceId: this.traceId,
      parentSpanId: this.parentSpanId,
      name: this.name,
      startTime: this.startTime.toISOString(),
      endTime: this.endTime?.toISOString(),
      status: this.status,
      attributes: this._attributes,
    };
  }
}

// Mock trace implementation
class MockTrace implements ITrace {
  public traceId: string;
  public name: string;
  public startTime: Date;
  public endTime: Date | undefined;
  public isFinished: boolean = false;
  public spans: ISpan[] = [];
  private _status: any = 'ok';
  private _attributes: Attributes = {};

  constructor(traceId: string, name: string) {
    this.traceId = traceId;
    this.name = name;
    this.startTime = new Date();
  }

  async startSpan(name: string, options?: any): Promise<ISpan> {
    const span = new MockSpan(`span-${this.spans.length + 1}`, this.traceId, name);
    this.spans.push(span);
    return span;
  }

  setAttributes(attributes: Attributes): void {
    Object.assign(this._attributes, attributes);
  }

  setAttribute(key: string, value: Attributes[string]): void {
    this._attributes[key] = value;
  }

  addEvent(name: string, attributes?: Attributes): void {
    // Mock implementation
  }

  setStatus(status: any): void {
    this._status = status;
  }

  getStatus(): any {
    return this._status;
  }

  async finish(endTime?: Date): Promise<void> {
    this.endTime = endTime || new Date();
    this.isFinished = true;
  }

  serialize(): any {
    return {
      traceId: this.traceId,
      name: this.name,
      startTime: this.startTime.toISOString(),
      endTime: this.endTime?.toISOString(),
      status: this._status,
      spans: this.spans.map(span => span.serialize()),
      attributes: this._attributes,
    };
  }
}

describe('TraceContext', () => {
  it('should create an empty context', () => {
    const context = new TraceContext();
    expect(context.activeTrace).toBeUndefined();
    expect(context.activeSpan).toBeUndefined();
    expect(context.spanStack).toEqual([]);
    expect(context.attributes).toEqual({});
  });

  it('should create context with initial values', () => {
    const trace = new MockTrace('trace-1', 'test-trace');
    const span = new MockSpan('span-1', 'trace-1', 'test-span');
    const attributes = { key: 'value' };

    const context = new TraceContext(trace, span, [span], attributes);

    expect(context.activeTrace).toBe(trace);
    expect(context.activeSpan).toBe(span);
    expect(context.spanStack).toEqual([span]);
    expect(context.attributes).toEqual(attributes);
  });

  it('should copy context with overrides', () => {
    const trace1 = new MockTrace('trace-1', 'test-trace-1');
    const trace2 = new MockTrace('trace-2', 'test-trace-2');
    const span1 = new MockSpan('span-1', 'trace-1', 'test-span-1');
    const span2 = new MockSpan('span-2', 'trace-2', 'test-span-2');

    const context1 = new TraceContext(trace1, span1, [span1], { key1: 'value1' });
    const context2 = context1.copy({ 
      activeTrace: trace2, 
      attributes: { key2: 'value2' } 
    });

    expect(context2.activeTrace).toBe(trace2);
    expect(context2.activeSpan).toBe(span1); // Not overridden
    expect(context2.attributes).toEqual({ key1: 'value1', key2: 'value2' });
    expect(context1.activeTrace).toBe(trace1); // Original unchanged
  });

  it('should manage attributes', () => {
    const context = new TraceContext();
    
    context.setAttribute('key1', 'value1');
    expect(context.getAttribute('key1')).toBe('value1');
    
    context.setAttributes({ key2: 'value2', key3: 'value3' });
    expect(context.attributes).toEqual({ 
      key1: 'value1', 
      key2: 'value2', 
      key3: 'value3' 
    });
  });

  it('should clear context', () => {
    const trace = new MockTrace('trace-1', 'test-trace');
    const span = new MockSpan('span-1', 'trace-1', 'test-span');
    const context = new TraceContext(trace, span, [span], { key: 'value' });

    context.clear();

    expect(context.activeTrace).toBeUndefined();
    expect(context.activeSpan).toBeUndefined();
    expect(context.spanStack).toEqual([]);
    expect(context.attributes).toEqual({});
  });
});

describe('ContextManager', () => {
  let contextManager: ContextManager;

  beforeEach(() => {
    contextManager = new ContextManager();
  });

  it('should get empty context initially', () => {
    const context = contextManager.getCurrentContext();
    expect(context.activeTrace).toBeUndefined();
    expect(context.activeSpan).toBeUndefined();
    expect(context.spanStack).toEqual([]);
  });

  it('should set and get active trace', () => {
    const trace = new MockTrace('trace-1', 'test-trace');
    
    contextManager.setActiveTrace(trace);
    expect(contextManager.getActiveTrace()).toBe(trace);
    expect(contextManager.getCurrentContext().activeTrace).toBe(trace);
  });

  it('should set and get active span', () => {
    const span = new MockSpan('span-1', 'trace-1', 'test-span');
    
    contextManager.setActiveSpan(span);
    expect(contextManager.getActiveSpan()).toBe(span);
    expect(contextManager.getCurrentContext().activeSpan).toBe(span);
  });

  it('should run function with trace context', () => {
    const trace = new MockTrace('trace-1', 'test-trace');
    let capturedTrace: ITrace | undefined;

    contextManager.withTrace(trace, () => {
      capturedTrace = contextManager.getActiveTrace();
    });

    expect(capturedTrace).toBe(trace);
    expect(contextManager.getActiveTrace()).toBeUndefined(); // Context restored
  });

  it('should run async function with trace context', async () => {
    const trace = new MockTrace('trace-1', 'test-trace');
    let capturedTrace: ITrace | undefined;

    await contextManager.withTraceAsync(trace, async () => {
      capturedTrace = contextManager.getActiveTrace();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(contextManager.getActiveTrace()).toBe(trace); // Still active
    });

    expect(capturedTrace).toBe(trace);
    expect(contextManager.getActiveTrace()).toBeUndefined(); // Context restored
  });

  it('should run function with span context', () => {
    const span = new MockSpan('span-1', 'trace-1', 'test-span');
    let capturedSpan: ISpan | undefined;

    contextManager.withSpan(span, () => {
      capturedSpan = contextManager.getActiveSpan();
    });

    expect(capturedSpan).toBe(span);
    expect(contextManager.getActiveSpan()).toBeUndefined(); // Context restored
  });

  it('should manage span stack', () => {
    const span1 = new MockSpan('span-1', 'trace-1', 'span-1');
    const span2 = new MockSpan('span-2', 'trace-1', 'span-2');

    contextManager.withSpan(span1, () => {
      expect(contextManager.getSpanStack()).toEqual([span1]);
      
      contextManager.withSpan(span2, () => {
        expect(contextManager.getSpanStack()).toEqual([span1, span2]);
        expect(contextManager.getParentSpan()).toBe(span1);
      });
      
      expect(contextManager.getSpanStack()).toEqual([span1]);
    });
  });

  it('should attach and detach trace with tokens', () => {
    const trace1 = new MockTrace('trace-1', 'test-trace-1');
    const trace2 = new MockTrace('trace-2', 'test-trace-2');

    contextManager.setActiveTrace(trace1);
    const token = contextManager.attachTrace(trace2);

    expect(contextManager.getActiveTrace()).toBe(trace2);

    contextManager.detachTrace(token);
    expect(contextManager.getActiveTrace()).toBe(trace1);
  });

  it('should attach and detach span with tokens', () => {
    const span1 = new MockSpan('span-1', 'trace-1', 'span-1');
    const span2 = new MockSpan('span-2', 'trace-1', 'span-2');

    contextManager.setActiveSpan(span1);
    const token = contextManager.attachSpan(span2);

    expect(contextManager.getActiveSpan()).toBe(span2);
    expect(contextManager.getSpanStack()).toEqual([span1, span2]);

    contextManager.detachSpan(token);
    expect(contextManager.getActiveSpan()).toBe(span1);
    expect(contextManager.getSpanStack()).toEqual([span1]);
  });
});

describe('ContextualSpan', () => {
  let contextManager: ContextManager;

  beforeEach(() => {
    contextManager = new ContextManager();
  });

  it('should auto-attach to context on creation', () => {
    const span = new MockSpan('span-1', 'trace-1', 'test-span');
    const contextualSpan = new ContextualSpan(span, contextManager);

    expect(contextManager.getActiveSpan()).toBe(span);
  });

  it('should auto-detach from context on finish', async () => {
    const span = new MockSpan('span-1', 'trace-1', 'test-span');
    const contextualSpan = new ContextualSpan(span, contextManager);

    expect(contextManager.getActiveSpan()).toBe(span);

    await contextualSpan.finish();

    expect(contextManager.getActiveSpan()).toBeUndefined();
    expect(span.isFinished).toBe(true);
  });

  it('should delegate methods to wrapped span', () => {
    const span = new MockSpan('span-1', 'trace-1', 'test-span');
    const contextualSpan = new ContextualSpan(span, contextManager);

    expect(contextualSpan.spanId).toBe(span.spanId);
    expect(contextualSpan.name).toBe(span.name);

    contextualSpan.setAttribute('key', 'value');
    contextualSpan.setStatus('error');

    expect(span.status).toBe('error');
  });
});

describe('ContextualTrace', () => {
  let contextManager: ContextManager;

  beforeEach(() => {
    contextManager = new ContextManager();
  });

  it('should auto-attach to context on creation', () => {
    const trace = new MockTrace('trace-1', 'test-trace');
    const contextualTrace = new ContextualTrace(trace, contextManager);

    expect(contextManager.getActiveTrace()).toBe(trace);
  });

  it('should auto-detach from context on finish', async () => {
    const trace = new MockTrace('trace-1', 'test-trace');
    const contextualTrace = new ContextualTrace(trace, contextManager);

    expect(contextManager.getActiveTrace()).toBe(trace);

    await contextualTrace.finish();

    expect(contextManager.getActiveTrace()).toBeUndefined();
    expect(trace.isFinished).toBe(true);
  });

  it('should create contextual spans when starting spans', async () => {
    const trace = new MockTrace('trace-1', 'test-trace');
    const contextualTrace = new ContextualTrace(trace, contextManager);

    const span = await contextualTrace.startSpan('test-span');

    expect(span).toBeInstanceOf(ContextualSpan);
    expect(contextManager.getActiveSpan()?.name).toBe('test-span');
  });
});

describe('Global functions', () => {
  beforeEach(() => {
    // Clear global context
    getGlobalContextManager().clear();
  });

  it('should get and set current trace globally', () => {
    const trace = new MockTrace('trace-1', 'test-trace');
    
    setCurrentTrace(trace);
    expect(getCurrentTrace()).toBe(trace);
  });

  it('should get and set current span globally', () => {
    const span = new MockSpan('span-1', 'trace-1', 'test-span');
    
    setCurrentSpan(span);
    expect(getCurrentSpan()).toBe(span);
  });

  it('should get current context globally', () => {
    const trace = new MockTrace('trace-1', 'test-trace');
    const span = new MockSpan('span-1', 'trace-1', 'test-span');
    
    setCurrentTrace(trace);
    setCurrentSpan(span);
    
    const context = getCurrentContext();
    expect(context.activeTrace).toBe(trace);
    expect(context.activeSpan).toBe(span);
  });

  it('should run function with context', () => {
    const trace = new MockTrace('trace-1', 'test-trace');
    const context = new TraceContext(trace);
    
    let capturedTrace: ITrace | undefined;
    
    withContext(context, () => {
      capturedTrace = getCurrentTrace();
    });

    expect(capturedTrace).toBe(trace);
    expect(getCurrentTrace()).toBeUndefined(); // Global context unchanged
  });

  it('should run async function with context', async () => {
    const trace = new MockTrace('trace-1', 'test-trace');
    const context = new TraceContext(trace);
    
    let capturedTrace: ITrace | undefined;
    
    await withContextAsync(context, async () => {
      capturedTrace = getCurrentTrace();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(getCurrentTrace()).toBe(trace); // Still active
    });

    expect(capturedTrace).toBe(trace);
    expect(getCurrentTrace()).toBeUndefined(); // Global context unchanged
  });

  it('should create contextual wrappers', () => {
    const trace = new MockTrace('trace-1', 'test-trace');
    const span = new MockSpan('span-1', 'trace-1', 'test-span');

    const contextualTrace = createContextualTrace(trace);
    const contextualSpan = createContextualSpan(span);

    expect(contextualTrace).toBeInstanceOf(ContextualTrace);
    expect(contextualSpan).toBeInstanceOf(ContextualSpan);
  });
});

describe('traceContext generator', () => {
  beforeEach(() => {
    // Clear global context
    getGlobalContextManager().clear();
  });

  it('should yield context with provided values', () => {
    const trace = new MockTrace('trace-1', 'test-trace');
    const span = new MockSpan('span-1', 'trace-1', 'test-span');
    const attributes = { key: 'value' };

    const generator = traceContext(trace, span, attributes);
    const result = generator.next();

    expect(result.done).toBe(false);
    if (!result.done) {
      expect(result.value).toBeInstanceOf(TraceContext);
      expect(result.value.activeTrace).toBe(trace);
      expect(result.value.activeSpan).toBe(span);
      expect(result.value.attributes).toEqual(attributes);
    }
  });

  it('should yield context merging with current context', () => {
    const existingTrace = new MockTrace('existing-trace', 'existing');
    setCurrentTrace(existingTrace);
    getCurrentContext().setAttribute('existing', 'value');

    const newSpan = new MockSpan('span-1', 'trace-1', 'test-span');
    const newAttributes = { new: 'attribute' };

    const generator = traceContext(undefined, newSpan, newAttributes);
    const result = generator.next();

    if (!result.done) {
      expect(result.value.activeTrace).toBe(existingTrace); // Preserved
      expect(result.value.activeSpan).toBe(newSpan); // New
      expect(result.value.attributes).toEqual({ 
        existing: 'value',
        new: 'attribute'
      });
    }
  });
}); 