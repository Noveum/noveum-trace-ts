/**
 * Core functionality tests for the Noveum Trace SDK
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NoveumClient } from '../src/core/client.js';
import { MockTransport } from '../src/transport/http-transport.js';
import { SpanStatus, TraceLevel } from '../src/core/types.js';

describe('NoveumClient', () => {
  let client: NoveumClient;
  let mockTransport: MockTransport;

  beforeEach(() => {
    mockTransport = new MockTransport();
    client = new NoveumClient({
      apiKey: 'test-key',
      project: 'test-project',
      transport: {
        batchSize: 1, // Immediate flushing for tests
      },
    });
  });

  afterEach(async () => {
    await client.shutdown();
  });

  describe('Trace Management', () => {
    it('should create a new trace', async () => {
      const trace = await client.startTrace('test-trace');
      
      expect(trace.name).toBe('test-trace');
      expect(trace.traceId).toBeDefined();
      expect(trace.isFinished).toBe(false);
      expect(trace.spans).toHaveLength(0);
    });

    it('should create a trace with options', async () => {
      const trace = await client.startTrace('test-trace', {
        level: TraceLevel.DEBUG,
        attributes: { 'test.key': 'test.value' },
      });
      
      expect(trace.level).toBe(TraceLevel.DEBUG);
      expect(trace.attributes['test.key']).toBe('test.value');
    });

    it('should finish a trace', async () => {
      const trace = await client.startTrace('test-trace');
      await trace.finish();
      
      expect(trace.isFinished).toBe(true);
      expect(trace.endTime).toBeDefined();
    });
  });

  describe('Span Management', () => {
    it('should create a new span', async () => {
      const span = await client.startSpan('test-span');
      
      expect(span.name).toBe('test-span');
      expect(span.spanId).toBeDefined();
      expect(span.traceId).toBeDefined();
      expect(span.isFinished).toBe(false);
    });

    it('should create a span with options', async () => {
      const span = await client.startSpan('test-span', {
        kind: 'CLIENT',
        attributes: { 'span.key': 'span.value' },
      });
      
      expect(span.kind).toBe('CLIENT');
      expect(span.attributes['span.key']).toBe('span.value');
    });

    it('should create child spans', async () => {
      const trace = await client.startTrace('test-trace');
      const parentSpan = await trace.startSpan('parent-span');
      const childSpan = await trace.startSpan('child-span', {
        parentSpanId: parentSpan.spanId,
      });
      
      expect(childSpan.parentSpanId).toBe(parentSpan.spanId);
      expect(childSpan.traceId).toBe(parentSpan.traceId);
    });

    it('should finish a span', async () => {
      const span = await client.startSpan('test-span');
      await span.finish();
      
      expect(span.isFinished).toBe(true);
      expect(span.endTime).toBeDefined();
      expect(span.status).toBe(SpanStatus.OK);
    });

    it('should set span attributes', async () => {
      const span = await client.startSpan('test-span');
      
      span.setAttribute('key1', 'value1');
      span.setAttributes({ key2: 'value2', key3: 123 });
      
      expect(span.attributes.key1).toBe('value1');
      expect(span.attributes.key2).toBe('value2');
      expect(span.attributes.key3).toBe(123);
    });

    it('should add span events', async () => {
      const span = await client.startSpan('test-span');
      
      span.addEvent('test-event');
      span.addEvent('test-event-with-attrs', { attr1: 'value1' });
      
      expect(span.events).toHaveLength(2);
      expect(span.events[0].name).toBe('test-event');
      expect(span.events[1].attributes?.attr1).toBe('value1');
    });

    it('should set span status', async () => {
      const span = await client.startSpan('test-span');
      
      span.setStatus(SpanStatus.ERROR, 'Something went wrong');
      
      expect(span.status).toBe(SpanStatus.ERROR);
      expect(span.statusMessage).toBe('Something went wrong');
    });
  });

  describe('Context Management', () => {
    it('should track active trace', async () => {
      const trace = await client.startTrace('test-trace');
      
      expect(client.getActiveTrace()).toBe(trace);
    });

    it('should track active span', async () => {
      const span = await client.startSpan('test-span');
      
      expect(client.getActiveSpan()).toBe(span);
    });

    it('should run function with trace context', async () => {
      const trace = await client.startTrace('test-trace');
      
      const result = await client.withTrace(trace, async () => {
        expect(client.getActiveTrace()).toBe(trace);
        return 'test-result';
      });
      
      expect(result).toBe('test-result');
    });

    it('should run function with span context', async () => {
      const span = await client.startSpan('test-span');
      
      const result = await client.withSpan(span, async () => {
        expect(client.getActiveSpan()).toBe(span);
        return 'test-result';
      });
      
      expect(result).toBe('test-result');
    });
  });

  describe('Convenience Methods', () => {
    it('should trace a function', async () => {
      const result = await client.trace('test-function', async () => {
        const activeTrace = client.getActiveTrace();
        expect(activeTrace?.name).toBe('test-function');
        return 'function-result';
      });
      
      expect(result).toBe('function-result');
    });

    it('should span a function', async () => {
      const result = await client.span('test-span', async () => {
        const activeSpan = client.getActiveSpan();
        expect(activeSpan?.name).toBe('test-span');
        return 'span-result';
      });
      
      expect(result).toBe('span-result');
    });
  });

  describe('Error Handling', () => {
    it('should handle errors in traced functions', async () => {
      await expect(
        client.trace('error-trace', async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');
    });

    it('should handle errors in spanned functions', async () => {
      await expect(
        client.span('error-span', async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');
    });

    it('should record exceptions in spans', async () => {
      const span = await client.startSpan('test-span');
      
      span.recordException(new Error('Test exception'));
      
      expect(span.events).toHaveLength(1);
      expect(span.events[0].name).toBe('exception');
      expect(span.status).toBe(SpanStatus.ERROR);
    });
  });

  describe('Serialization', () => {
    it('should serialize spans', async () => {
      const span = await client.startSpan('test-span');
      span.setAttribute('test.key', 'test.value');
      span.addEvent('test-event');
      await span.finish();
      
      const serialized = span.serialize();
      
      expect(serialized.name).toBe('test-span');
      expect(serialized.attributes['test.key']).toBe('test.value');
      expect(serialized.events).toHaveLength(1);
      expect(serialized.startTime).toBeDefined();
      expect(serialized.endTime).toBeDefined();
    });

    it('should serialize traces', async () => {
      const trace = await client.startTrace('test-trace');
      trace.setAttribute('trace.key', 'trace.value');
      
      const span = await trace.startSpan('test-span');
      await span.finish();
      await trace.finish();
      
      const serialized = trace.serialize();
      
      expect(serialized.name).toBe('test-trace');
      expect(serialized.attributes['trace.key']).toBe('trace.value');
      expect(serialized.spans).toHaveLength(1);
      expect(serialized.startTime).toBeDefined();
      expect(serialized.endTime).toBeDefined();
    });
  });
});

describe('Span', () => {
  let client: NoveumClient;

  beforeEach(() => {
    client = new NoveumClient({
      apiKey: 'test-key',
      project: 'test-project',
    });
  });

  afterEach(async () => {
    await client.shutdown();
  });

  it('should calculate duration', async () => {
    const span = await client.startSpan('test-span');
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 10));
    
    await span.finish();
    
    const duration = span.getDuration();
    expect(duration).toBeGreaterThan(0);
  });

  it('should detect root spans', async () => {
    const trace = await client.startTrace('test-trace');
    const rootSpan = await trace.startSpan('root-span');
    const childSpan = await trace.startSpan('child-span', {
      parentSpanId: rootSpan.spanId,
    });
    
    expect(rootSpan.isRootSpan()).toBe(true);
    expect(childSpan.isRootSpan()).toBe(false);
  });

  it('should create child spans', async () => {
    const parentSpan = await client.startSpan('parent-span');
    const childSpan = await parentSpan.startChildSpan('child-span');
    
    expect(childSpan.parentSpanId).toBe(parentSpan.spanId);
    expect(childSpan.traceId).toBe(parentSpan.traceId);
  });

  it('should run functions with span context', async () => {
    const span = await client.startSpan('test-span');
    
    const result = await span.withSpan(async () => {
      return 'span-context-result';
    });
    
    expect(result).toBe('span-context-result');
    expect(span.status).toBe(SpanStatus.OK);
  });

  it('should handle errors in span context', async () => {
    const span = await client.startSpan('test-span');
    
    await expect(
      span.withSpan(async () => {
        throw new Error('Span context error');
      })
    ).rejects.toThrow('Span context error');
    
    expect(span.status).toBe(SpanStatus.ERROR);
    expect(span.events).toHaveLength(1);
    expect(span.events[0].name).toBe('exception');
  });
});

describe('Trace', () => {
  let client: NoveumClient;

  beforeEach(() => {
    client = new NoveumClient({
      apiKey: 'test-key',
      project: 'test-project',
    });
  });

  afterEach(async () => {
    await client.shutdown();
  });

  it('should get trace statistics', async () => {
    const trace = await client.startTrace('test-trace');
    
    const span1 = await trace.startSpan('span1');
    const span2 = await trace.startSpan('span2');
    
    await span1.finish();
    // Leave span2 unfinished
    
    const stats = trace.getStats();
    
    expect(stats.spanCount).toBe(2);
    expect(stats.finishedSpanCount).toBe(1);
    expect(stats.errorSpanCount).toBe(0);
  });

  it('should get root span', async () => {
    const trace = await client.startTrace('test-trace');
    
    const rootSpan = await trace.startSpan('root-span');
    const childSpan = await trace.startSpan('child-span', {
      parentSpanId: rootSpan.spanId,
    });
    
    expect(trace.getRootSpan()).toBe(rootSpan);
  });

  it('should get child spans', async () => {
    const trace = await client.startTrace('test-trace');
    
    const parentSpan = await trace.startSpan('parent-span');
    const child1 = await trace.startSpan('child1', {
      parentSpanId: parentSpan.spanId,
    });
    const child2 = await trace.startSpan('child2', {
      parentSpanId: parentSpan.spanId,
    });
    
    const children = trace.getChildSpans(parentSpan.spanId);
    
    expect(children).toHaveLength(2);
    expect(children).toContain(child1);
    expect(children).toContain(child2);
  });

  it('should finish unfinished spans when trace finishes', async () => {
    const trace = await client.startTrace('test-trace');
    
    const span1 = await trace.startSpan('span1');
    const span2 = await trace.startSpan('span2');
    
    // Don't finish spans manually
    await trace.finish();
    
    expect(span1.isFinished).toBe(true);
    expect(span2.isFinished).toBe(true);
    expect(trace.isFinished).toBe(true);
  });
});

