import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Span } from '../../src/core/span.js';
import { Trace } from '../../src/core/trace.js';
import { SpanStatus, SpanKind, TraceLevel } from '../../src/core/types.js';
import type { ITrace } from '../../src/core/interfaces.js';

describe('Span (from trace.ts)', () => {
  let mockTrace: ITrace;
  let span: Span;

  beforeEach(() => {
    mockTrace = new Trace('test-trace', {}, undefined, { project: 'test-project', environment: 'test' });
    span = new Span(mockTrace, 'test-span');
  });

  describe('constructor', () => {
    it('should create a span with required properties', () => {
      expect(span.name).toBe('test-span');
      expect(span.traceId).toBe(mockTrace.traceId);
      expect(span.spanId).toBeDefined();
      expect(span.isFinished).toBe(false);
      expect(span.startTime).toBeInstanceOf(Date);
      expect(span.kind).toBe(SpanKind.INTERNAL);
      expect(span.status).toBe(SpanStatus.UNSET);
    });

    it('should create a span with optional properties', () => {
      const parentSpan = new Span(mockTrace, 'parent-span');
      const childSpan = new Span(mockTrace, 'child-span', {
        parent_span_id: parentSpan.spanId,
        kind: SpanKind.CLIENT,
        attributes: { 'test.key': 'test.value' },
        start_time: new Date('2023-01-01T00:00:00Z'),
      });

      expect(childSpan.parentSpanId).toBe(parentSpan.spanId);
      expect(childSpan.kind).toBe(SpanKind.CLIENT);
      expect(childSpan.attributes).toEqual({ 'test.key': 'test.value' });
      expect(childSpan.startTime).toEqual(new Date('2023-01-01T00:00:00Z'));
    });
  });

  describe('setAttributes', () => {
    it('should set multiple attributes', () => {
      const attributes = {
        'http.method': 'GET',
        'http.status_code': 200,
        'http.url': 'https://example.com',
      };

      span.setAttributes(attributes);
      expect(span.attributes).toEqual(attributes);
    });

    it('should merge with existing attributes', () => {
      span.setAttribute('existing.key', 'existing.value');
      span.setAttributes({ 'new.key': 'new.value' });

      expect(span.attributes).toEqual({
        'existing.key': 'existing.value',
        'new.key': 'new.value',
      });
    });

    it('should not set attributes on finished span', async () => {
      await span.finish();
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      span.setAttributes({ 'test.key': 'test.value' });
      
      // Attributes should contain duration_ms from finish() but not the new attribute
      expect(span.attributes['duration_ms']).toBeDefined();
      expect(span.attributes['test.key']).toBeUndefined();
      consoleSpy.mockRestore();
    });
  });

  describe('setAttribute', () => {
    it('should set a single attribute', () => {
      span.setAttribute('test.key', 'test.value');
      expect(span.attributes['test.key']).toBe('test.value');
    });

    it('should handle different attribute types', () => {
      span.setAttribute('string.key', 'string.value');
      span.setAttribute('number.key', 42);
      span.setAttribute('boolean.key', true);
      span.setAttribute('array.key', ['a', 'b', 'c']);

      expect(span.attributes['string.key']).toBe('string.value');
      expect(span.attributes['number.key']).toBe(42);
      expect(span.attributes['boolean.key']).toBe(true);
      expect(span.attributes['array.key']).toEqual(['a', 'b', 'c']);
    });

    it('should not set attribute on finished span', async () => {
      await span.finish();
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      span.setAttribute('test.key', 'test.value');
      
      expect(span.attributes['test.key']).toBeUndefined();
      consoleSpy.mockRestore();
    });
  });

  describe('addEvent', () => {
    it('should add an event with attributes', () => {
      span.addEvent('test.event', { 'event.key': 'event.value' });

      expect(span.events).toHaveLength(1);
      expect(span.events[0].name).toBe('test.event');
      expect(span.events[0].attributes).toEqual({ 'event.key': 'event.value' });
      expect(span.events[0].timestamp).toBeDefined();
    });

    it('should add event without attributes', () => {
      span.addEvent('simple.event');

      expect(span.events).toHaveLength(1);
      expect(span.events[0].name).toBe('simple.event');
      expect(span.events[0].attributes).toBeUndefined();
    });

    it('should not add event to finished span', async () => {
      await span.finish();
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      span.addEvent('test.event');
      
      expect(span.events).toHaveLength(0);
      consoleSpy.mockRestore();
    });
  });

  describe('setStatus', () => {
    it('should set span status with message', () => {
      span.setStatus(SpanStatus.ERROR, 'Something went wrong');

      expect(span.status).toBe(SpanStatus.ERROR);
      expect(span.statusMessage).toBe('Something went wrong');
    });

    it('should set status without message', () => {
      span.setStatus(SpanStatus.OK);

      expect(span.status).toBe(SpanStatus.OK);
      expect(span.statusMessage).toBeUndefined();
    });

    it('should not set status on finished span', async () => {
      await span.finish();
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      span.setStatus(SpanStatus.ERROR);
      
      expect(span.status).toBe(SpanStatus.OK); // Default status after finish
      consoleSpy.mockRestore();
    });
  });

  describe('recordException', () => {
    it('should record exception from Error object', () => {
      const error = new Error('Test error');
      span.recordException(error);

      expect(span.events).toHaveLength(1);
      expect(span.events[0].name).toBe('exception');
      expect(span.events[0].attributes).toMatchObject({
        'exception.type': 'Error',
        'exception.message': 'Test error',
        'exception.stacktrace': expect.any(String),
      });
      expect(span.status).toBe(SpanStatus.ERROR);
      expect(span.statusMessage).toBe('Test error');
    });

    it('should record exception from string', () => {
      span.recordException('String error');

      expect(span.events).toHaveLength(1);
      expect(span.events[0].name).toBe('exception');
      expect(span.events[0].attributes).toMatchObject({
        'exception.type': 'Exception',
        'exception.message': 'String error',
        'exception.stacktrace': '',
      });
      expect(span.status).toBe(SpanStatus.ERROR);
    });

    it('should not override existing error status', () => {
      span.setStatus(SpanStatus.ERROR, 'Original error');
      span.recordException(new Error('New error'));

      expect(span.status).toBe(SpanStatus.ERROR);
      expect(span.statusMessage).toBe('Original error');
    });
  });

  describe('finish', () => {
    it('should finish the span', async () => {
      expect(span.isFinished).toBe(false);
      expect(span.endTime).toBeUndefined();

      await span.finish();

      expect(span.isFinished).toBe(true);
      expect(span.endTime).toBeInstanceOf(Date);
      expect(span.status).toBe(SpanStatus.OK);
      expect(span.attributes['duration_ms']).toBeDefined();
      expect(typeof span.attributes['duration_ms']).toBe('number');
    });

    it('should not finish twice', async () => {
      await span.finish();
      const firstEndTime = span.endTime;

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await span.finish();

      expect(span.endTime).toBe(firstEndTime);
      consoleSpy.mockRestore();
    });

    it('should finish with custom end time', async () => {
      const customEndTime = new Date('2023-01-01T00:00:00Z');
      await span.finish(customEndTime);

      expect(span.endTime).toBe(customEndTime);
    });

    it('should preserve error status when finishing', async () => {
      span.setStatus(SpanStatus.ERROR);
      await span.finish();

      expect(span.status).toBe(SpanStatus.ERROR);
    });
  });

  describe('serialize', () => {
    it('should serialize span data', () => {
      span.setAttribute('test.key', 'test.value');
      span.addEvent('test.event');
      span.setStatus(SpanStatus.OK);

      const serialized = span.serialize();

      expect(serialized).toMatchObject({
        span_id: span.spanId,
        trace_id: span.traceId,
        name: 'test-span',
        start_time: span.startTime.toISOString(),
        end_time: null,
        status: SpanStatus.OK,
        status_message: null,
        parent_span_id: null,
        attributes: { 'test.key': 'test.value' },
        events: expect.arrayContaining([
          expect.objectContaining({
            name: 'test.event',
            timestamp: expect.any(String),
          }),
        ]),
        links: [],
      });
    });

    it('should serialize finished span', async () => {
      await span.finish();

      const serialized = span.serialize();
      expect(serialized.end_time).toBe(span.endTime!.toISOString());
      expect(serialized.duration_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('startChildSpan', () => {
    it('should create a child span', async () => {
      const childSpan = await span.startChildSpan('child-span');

      expect(childSpan.parentSpanId).toBe(span.spanId);
      expect(childSpan.traceId).toBe(span.traceId);
      expect(childSpan.name).toBe('child-span');
    });

    it('should create child span with options', async () => {
      const childSpan = await span.startChildSpan('child-span', {
        kind: SpanKind.SERVER,
        attributes: { 'child.key': 'child.value' },
      });

      expect(childSpan.kind).toBe(SpanKind.SERVER);
      expect(childSpan.attributes).toEqual({ 'child.key': 'child.value' });
    });
  });

  describe('withSpan', () => {
    it('should execute async function and set OK status', async () => {
      const result = await span.withSpan(async () => {
        return 'success';
      });

      expect(result).toBe('success');
      expect(span.status).toBe(SpanStatus.OK);
    });

    it('should record exception on error', async () => {
      const error = new Error('Test error');

      await expect(
        span.withSpan(async () => {
          throw error;
        })
      ).rejects.toThrow('Test error');

      expect(span.events).toHaveLength(1);
      expect(span.events[0].name).toBe('exception');
      expect(span.status).toBe(SpanStatus.ERROR);
    });
  });

  describe('withSpanSync', () => {
    it('should execute sync function and set OK status', () => {
      const result = span.withSpanSync(() => {
        return 'success';
      });

      expect(result).toBe('success');
      expect(span.status).toBe(SpanStatus.OK);
    });

    it('should record exception on error', () => {
      const error = new Error('Test error');

      expect(() =>
        span.withSpanSync(() => {
          throw error;
        })
      ).toThrow('Test error');

      expect(span.events).toHaveLength(1);
      expect(span.events[0].name).toBe('exception');
      expect(span.status).toBe(SpanStatus.ERROR);
    });
  });

  describe('getDuration', () => {
    it('should return undefined for unfinished span', () => {
      expect(span.getDuration()).toBeUndefined();
    });

    it('should return duration for finished span', async () => {
      const start = span.startTime;
      await new Promise(resolve => setTimeout(resolve, 10));
      await span.finish();

      const duration = span.getDuration();
      expect(duration).toBeGreaterThan(0);
      expect(duration).toBeLessThan(100);
    });
  });

  describe('isRootSpan', () => {
    it('should return true for root span', () => {
      expect(span.isRootSpan()).toBe(true);
    });

    it('should return false for child span', async () => {
      const childSpan = await span.startChildSpan('child');
      expect(childSpan.isRootSpan()).toBe(false);
    });
  });

  describe('toString', () => {
    it('should return string representation of ongoing span', () => {
      const str = span.toString();
      expect(str).toContain('test-span');
      expect(str).toContain(span.spanId);
      expect(str).toContain('unset');
      expect(str).toContain('ongoing');
    });

    it('should return string representation of finished span', async () => {
      await span.finish();
      const str = span.toString();
      expect(str).toContain('test-span');
      expect(str).toContain(span.spanId);
      expect(str).toContain('ok');
      expect(str).toMatch(/\d+ms/);
    });
  });
});