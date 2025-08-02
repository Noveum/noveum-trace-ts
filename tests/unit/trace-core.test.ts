import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Trace } from '../../src/core/trace.js';
import { SpanStatus, TraceLevel } from '../../src/core/types.js';
import type { ITransport } from '../../src/core/interfaces.js';

describe('Trace (from trace.ts)', () => {
  let trace: Trace;
  let mockTransport: ITransport;

  beforeEach(() => {
    mockTransport = {
      send: vi.fn().mockResolvedValue(undefined),
    };
    trace = new Trace('test-trace');
  });

  describe('constructor', () => {
    it('should create a trace with required properties', () => {
      expect(trace.name).toBe('test-trace');
      expect(trace.traceId).toBeDefined();
      expect(trace.level).toBe(TraceLevel.INFO);
      expect(trace.isFinished).toBe(false);
      expect(trace.startTime).toBeInstanceOf(Date);
      expect(trace.spans).toEqual([]);
    });

    it('should create a trace with optional properties', () => {
      const customTrace = new Trace(
        'custom-trace',
        {
          level: TraceLevel.DEBUG,
          attributes: { 'test.key': 'test.value' },
          start_time: new Date('2023-01-01T00:00:00Z'),
        },
        mockTransport
      );

      expect(customTrace.level).toBe(TraceLevel.DEBUG);
      expect(customTrace.attributes).toEqual({ 'test.key': 'test.value' });
      expect(customTrace.startTime).toEqual(new Date('2023-01-01T00:00:00Z'));
    });
  });

  describe('status management', () => {
    it('should set and get trace status', () => {
      expect(trace.getStatus()).toBe(SpanStatus.OK);
      
      trace.setStatus(SpanStatus.ERROR);
      expect(trace.getStatus()).toBe(SpanStatus.ERROR);
    });
  });

  describe('startSpan', () => {
    it('should create a new span', async () => {
      const span = await trace.startSpan('test-span');

      expect(span.name).toBe('test-span');
      expect(span.traceId).toBe(trace.traceId);
      expect(trace.spans).toHaveLength(1);
      expect(trace.activeSpan).toBe(span);
    });

    it('should automatically set parent span', async () => {
      const parentSpan = await trace.startSpan('parent-span');
      const childSpan = await trace.startSpan('child-span');

      expect(childSpan.parentSpanId).toBe(parentSpan.spanId);
    });

    it('should not set parent if active span is finished', async () => {
      const parentSpan = await trace.startSpan('parent-span');
      await parentSpan.finish();
      const childSpan = await trace.startSpan('child-span');

      expect(childSpan.parentSpanId).toBeUndefined();
    });

    it('should throw if trace is finished', async () => {
      await trace.finish();

      await expect(trace.startSpan('test-span')).rejects.toThrow(
        'Cannot start span on a finished trace'
      );
    });
  });

  describe('setAttributes', () => {
    it('should set multiple attributes', () => {
      const attributes = {
        'service.name': 'test-service',
        'service.version': '1.0.0',
      };

      trace.setAttributes(attributes);
      expect(trace.attributes).toEqual(attributes);
    });

    it('should merge with existing attributes', () => {
      trace.setAttribute('existing.key', 'existing.value');
      trace.setAttributes({ 'new.key': 'new.value' });

      expect(trace.attributes).toEqual({
        'existing.key': 'existing.value',
        'new.key': 'new.value',
      });
    });

    it('should not set attributes on finished trace', async () => {
      await trace.finish();
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      trace.setAttributes({ 'test.key': 'test.value' });
      
      // After finish, trace should have duration_ms and span_count but not the new attribute
      expect(trace.attributes['duration_ms']).toBeDefined();
      expect(trace.attributes['span_count']).toBe(0);
      expect(trace.attributes['test.key']).toBeUndefined();
      consoleSpy.mockRestore();
    });
  });

  describe('setAttribute', () => {
    it('should set a single attribute', () => {
      trace.setAttribute('test.key', 'test.value');
      expect(trace.attributes['test.key']).toBe('test.value');
    });

    it('should handle different attribute types', () => {
      trace.setAttribute('string.key', 'string.value');
      trace.setAttribute('number.key', 42);
      trace.setAttribute('boolean.key', true);

      expect(trace.attributes['string.key']).toBe('string.value');
      expect(trace.attributes['number.key']).toBe(42);
      expect(trace.attributes['boolean.key']).toBe(true);
    });
  });

  describe('addEvent', () => {
    it('should add an event with attributes', () => {
      trace.addEvent('test.event', { 'event.key': 'event.value' });

      expect(trace.events).toHaveLength(1);
      expect(trace.events[0].name).toBe('test.event');
      expect(trace.events[0].attributes).toEqual({ 'event.key': 'event.value' });
      expect(trace.events[0].timestamp).toBeDefined();
    });

    it('should add event without attributes', () => {
      trace.addEvent('simple.event');

      expect(trace.events).toHaveLength(1);
      expect(trace.events[0].name).toBe('simple.event');
      expect(trace.events[0].attributes).toBeUndefined();
    });

    it('should not add event to finished trace', async () => {
      await trace.finish();
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      trace.addEvent('test.event');
      
      expect(trace.events).toHaveLength(0);
      consoleSpy.mockRestore();
    });
  });

  describe('finish', () => {
    it('should finish the trace', async () => {
      expect(trace.isFinished).toBe(false);
      expect(trace.endTime).toBeUndefined();

      await trace.finish();

      expect(trace.isFinished).toBe(true);
      expect(trace.endTime).toBeInstanceOf(Date);
      expect(trace.attributes['duration_ms']).toBeDefined();
      expect(trace.attributes['span_count']).toBe(0);
    });

    it('should finish unfinished spans', async () => {
      const span1 = await trace.startSpan('span1');
      const span2 = await trace.startSpan('span2');
      await span1.finish();

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await trace.finish();

      expect(span2.isFinished).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Finishing trace with 1 unfinished spans'
      );
      consoleSpy.mockRestore();
    });

    it('should not finish twice', async () => {
      await trace.finish();
      const firstEndTime = trace.endTime;

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await trace.finish();

      expect(trace.endTime).toBe(firstEndTime);
      consoleSpy.mockRestore();
    });

    it('should send to transport if available', async () => {
      const traceWithTransport = new Trace('test-trace', {}, mockTransport);
      await traceWithTransport.finish();

      expect(mockTransport.send).toHaveBeenCalledWith(
        expect.objectContaining({
          traces: expect.arrayContaining([
            expect.objectContaining({
              trace_id: traceWithTransport.traceId,
              name: 'test-trace',
            }),
          ]),
          timestamp: expect.any(Number),
        })
      );
    });

    it('should handle transport errors gracefully', async () => {
      const errorTransport: ITransport = {
        send: vi.fn().mockRejectedValue(new Error('Transport error')),
      };
      const traceWithErrorTransport = new Trace('test-trace', {}, errorTransport);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await traceWithErrorTransport.finish();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to send trace data:',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });

  describe('serialize', () => {
    it('should serialize trace data', async () => {
      trace.setAttribute('test.key', 'test.value');
      trace.addEvent('test.event');
      const span = await trace.startSpan('test-span');
      await span.finish();

      const serialized = trace.serialize();

      expect(serialized).toMatchObject({
        trace_id: trace.traceId,
        name: 'test-trace',
        start_time: trace.startTime.toISOString(),
        end_time: null,
        status: SpanStatus.OK,
        attributes: { 'test.key': 'test.value' },
        spans: expect.arrayContaining([
          expect.objectContaining({
            name: 'test-span',
            span_id: span.spanId,
          }),
        ]),
      });
    });

    it('should serialize finished trace', async () => {
      await trace.finish();

      const serialized = trace.serialize();
      expect(serialized.end_time).toBe(trace.endTime!.toISOString());
    });
  });

  describe('span querying', () => {
    it('should get root span', async () => {
      const rootSpan = await trace.startSpan('root-span');
      const childSpan = await trace.startSpan('child-span');

      expect(trace.getRootSpan()).toBe(rootSpan);
    });

    it('should get child spans', async () => {
      const parentSpan = await trace.startSpan('parent-span');
      // Explicitly set parentSpanId to create child spans
      const child1 = await trace.startSpan('child1', { parent_span_id: parentSpan.spanId });
      const child2 = await trace.startSpan('child2', { parent_span_id: parentSpan.spanId });
      await trace.startSpan('child3', { parent_span_id: 'different-parent' });

      const children = trace.getChildSpans(parentSpan.spanId);
      expect(children).toHaveLength(2);
      expect(children).toContain(child1);
      expect(children).toContain(child2);
    });

    it('should get span by ID', async () => {
      const span = await trace.startSpan('test-span');

      expect(trace.getSpan(span.spanId)).toBe(span);
      expect(trace.getSpan('non-existent')).toBeUndefined();
    });
  });

  describe('getDuration', () => {
    it('should return undefined for unfinished trace', () => {
      expect(trace.getDuration()).toBeUndefined();
    });

    it('should return duration for finished trace', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      await trace.finish();

      const duration = trace.getDuration();
      expect(duration).toBeGreaterThan(0);
      expect(duration).toBeLessThan(100);
    });
  });

  describe('getStats', () => {
    it('should return trace statistics', async () => {
      const span1 = await trace.startSpan('span1');
      const span2 = await trace.startSpan('span2');
      await span1.finish();
      span2.setStatus(SpanStatus.ERROR);

      const stats = trace.getStats();

      expect(stats).toEqual({
        spanCount: 2,
        finishedSpanCount: 1,
        errorSpanCount: 1,
      });
    });

    it('should include duration when trace is finished', async () => {
      // Add a small delay to ensure duration > 0
      await new Promise(resolve => setTimeout(resolve, 1));
      await trace.finish();
      const stats = trace.getStats();

      expect(stats.duration).toBeDefined();
      expect(stats.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('withTrace', () => {
    it('should execute async function', async () => {
      const result = await trace.withTrace(async () => {
        return 'success';
      });

      expect(result).toBe('success');
    });

    it('should add error event on exception', async () => {
      const error = new Error('Test error');

      await expect(
        trace.withTrace(async () => {
          throw error;
        })
      ).rejects.toThrow('Test error');

      expect(trace.events).toHaveLength(1);
      expect(trace.events[0].name).toBe('error');
      expect(trace.events[0].attributes).toMatchObject({
        'error.type': 'Error',
        'error.message': 'Test error',
      });
    });
  });

  describe('withTraceSync', () => {
    it('should execute sync function', () => {
      const result = trace.withTraceSync(() => {
        return 'success';
      });

      expect(result).toBe('success');
    });

    it('should add error event on exception', () => {
      const error = new Error('Test error');

      expect(() =>
        trace.withTraceSync(() => {
          throw error;
        })
      ).toThrow('Test error');

      expect(trace.events).toHaveLength(1);
      expect(trace.events[0].name).toBe('error');
    });
  });

  describe('createChildTrace', () => {
    it('should create a child trace', () => {
      const childTrace = trace.createChildTrace('child-trace', {
        level: TraceLevel.DEBUG,
      });

      expect(childTrace.name).toBe('child-trace');
      expect(childTrace.level).toBe(TraceLevel.DEBUG);
      // Note: parentTraceId is not exposed in the interface, but it's set internally
    });
  });

  describe('toString', () => {
    it('should return string representation of ongoing trace', () => {
      const str = trace.toString();
      expect(str).toContain('test-trace');
      expect(str).toContain(trace.traceId);
      expect(str).toContain('0 spans');
      expect(str).toContain('ongoing');
    });

    it('should return string representation of finished trace', async () => {
      await trace.startSpan('span1');
      await trace.finish();
      const str = trace.toString();
      
      expect(str).toContain('test-trace');
      expect(str).toContain(trace.traceId);
      expect(str).toContain('1 spans');
      expect(str).toMatch(/\d+ms/);
    });
  });

  describe('export', () => {
    it('should export trace data and stats', async () => {
      trace.setAttribute('test.key', 'test.value');
      const span = await trace.startSpan('test-span');
      await span.finish();
      await trace.finish();

      const exported = trace.export();

      expect(exported.trace).toMatchObject({
        trace_id: trace.traceId,
        name: 'test-trace',
        attributes: expect.objectContaining({ 'test.key': 'test.value' }),
      });
      expect(exported.stats).toMatchObject({
        spanCount: 1,
        finishedSpanCount: 1,
        errorSpanCount: 0,
        duration: expect.any(Number),
      });
    });

    it('should handle unfinished trace export', () => {
      const exported = trace.export();

      expect(exported.trace.endTime).toBeUndefined();
      expect(exported.stats.duration).toBeNull();
    });
  });
});