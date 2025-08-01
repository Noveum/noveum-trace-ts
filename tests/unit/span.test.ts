import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StandaloneSpan as Span } from '../../src/core/span-standalone.js';
import { SpanStatus, SpanKind } from '../../src/core/types.js';
import type { SpanOptions } from '../../src/core/types.js';

interface ExtendedSpanOptions extends SpanOptions {
  trace_id: string;
  client?: any;
  enabled?: boolean;
}

describe('Span', () => {
  let span: Span;
  const mockClient = {
    _addFinishedSpan: vi.fn(),
  };

  beforeEach(() => {
    mockClient._addFinishedSpan.mockClear(); // Reset the mock between tests
    const options: ExtendedSpanOptions = {
      trace_id: 'test-trace-id',
      client: mockClient as any,
    };
    span = new Span('test-span-id', 'test-span', options);
  });

  describe('constructor', () => {
    it('should create a span with required properties', () => {
      expect(span.spanId).toBe('test-span-id');
      expect(span.name).toBe('test-span');
      expect(span.traceId).toBe('test-trace-id');
      expect(span.isFinished).toBe(false);
      expect(span.startTime).toBeInstanceOf(Date);
    });

    it('should set optional properties', () => {
      const options: ExtendedSpanOptions = {
        trace_id: 'test-trace-id',
        parent_span_id: 'parent-span-id',
        kind: SpanKind.CLIENT,
        attributes: { 'test.key': 'test.value' },
        client: mockClient as any,
      };
      
      const spanWithOptions = new Span('span-id', 'span-name', options);
      
      expect(spanWithOptions.parentSpanId).toBe('parent-span-id');
      expect(spanWithOptions.kind).toBe(SpanKind.CLIENT);
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
      
      const serialized = span.serialize();
      expect(serialized.attributes).toEqual(expect.objectContaining(attributes));
    });

    it('should merge with existing attributes', () => {
      span.setAttribute('existing.key', 'existing.value');
      span.setAttributes({ 'new.key': 'new.value' });
      
      const serialized = span.serialize();
      expect(serialized.attributes).toEqual({
        'existing.key': 'existing.value',
        'new.key': 'new.value',
      });
    });
  });

  describe('setAttribute', () => {
    it('should set a single attribute', () => {
      span.setAttribute('test.key', 'test.value');
      
      const serialized = span.serialize();
      expect(serialized.attributes['test.key']).toBe('test.value');
    });

    it('should handle different attribute types', () => {
      span.setAttribute('string.key', 'string.value');
      span.setAttribute('number.key', 42);
      span.setAttribute('boolean.key', true);
      span.setAttribute('array.key', ['a', 'b', 'c']);
      
      const serialized = span.serialize();
      expect(serialized.attributes['string.key']).toBe('string.value');
      expect(serialized.attributes['number.key']).toBe(42);
      expect(serialized.attributes['boolean.key']).toBe(true);
      expect(serialized.attributes['array.key']).toEqual(['a', 'b', 'c']);
    });
  });

  describe('addEvent', () => {
    it('should add an event', () => {
      span.addEvent('test.event', { 'event.key': 'event.value' });
      
      const serialized = span.serialize();
      expect(serialized.events).toHaveLength(1);
      expect(serialized.events[0].name).toBe('test.event');
      expect(serialized.events[0].attributes).toEqual({ 'event.key': 'event.value' });
      expect(typeof serialized.events[0].timestamp).toBe('string');
    });

    it('should add event without attributes', () => {
      span.addEvent('simple.event');
      
      const serialized = span.serialize();
      expect(serialized.events).toHaveLength(1);
      expect(serialized.events[0].name).toBe('simple.event');
      expect(serialized.events[0].attributes).toEqual({});
    });
  });

  describe('setStatus', () => {
    it('should set span status', () => {
      span.setStatus(SpanStatus.ERROR, 'Something went wrong');
      
      const serialized = span.serialize();
      expect(serialized.status).toBe('error');
      expect(serialized.status_message).toBe('Something went wrong');
    });

    it('should set status without message', () => {
      span.setStatus(SpanStatus.OK);
      
      const serialized = span.serialize();
      expect(serialized.status).toBe('ok');
      expect(serialized.status_message).toBe(null);
    });
  });

  describe('finish', () => {
    it('should finish the span', async () => {
      expect(span.isFinished).toBe(false);
      expect(span.endTime).toBeUndefined();
      
      await span.finish();
      
      expect(span.isFinished).toBe(true);
      expect(span.endTime).toBeInstanceOf(Date);
      // StandaloneSpan doesn't call _addFinishedSpan - spans are sent with traces
    });

    it('should not finish twice', async () => {
      await span.finish();
      const firstEndTime = span.endTime;
      
      await span.finish();
      
      expect(span.endTime).toBe(firstEndTime);
      // StandaloneSpan doesn't call _addFinishedSpan
    });

    it('should finish with custom end time', async () => {
      const customEndTime = new Date('2023-01-01T00:00:00Z');
      await span.finish(customEndTime);
      
      expect(span.endTime).toBe(customEndTime);
    });
  });

  describe('serialize', () => {
    it('should serialize span data', () => {
      span.setAttribute('test.key', 'test.value');
      span.addEvent('test.event');
      span.setStatus(SpanStatus.OK);
      
      const serialized = span.serialize();
      
      expect(serialized).toEqual({
        span_id: 'test-span-id',
        trace_id: 'test-trace-id',
        name: 'test-span',
        start_time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}\+00:00$/),
        end_time: null,
        duration_ms: 0,
        status: 'ok',
        status_message: null,
        parent_span_id: null,
        attributes: { 'test.key': 'test.value' },
        events: expect.arrayContaining([
          expect.objectContaining({
            name: 'test.event',
            timestamp: expect.any(String),
            attributes: {},
          }),
        ]),
        links: [],
      });
    });

    it('should serialize finished span', async () => {
      // Add a small delay to ensure duration > 0
      await new Promise(resolve => setTimeout(resolve, 1));
      await span.finish();
      
      const serialized = span.serialize();
      expect(serialized.end_time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}\+00:00$/);
      expect(serialized.duration_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('error handling', () => {
    it('should handle client errors gracefully', async () => {
      const errorClient = {
        _addFinishedSpan: vi.fn().mockImplementation(() => {
          throw new Error('Client error');
        }),
      };
      
      const errorSpan = new Span('error-span-id', 'error-span', {
        traceId: 'error-trace-id',
        client: errorClient as any,
      });
      
      // Should not throw even if client throws
      await expect(errorSpan.finish()).resolves.not.toThrow();
      expect(errorSpan.isFinished).toBe(true);
    });
  });
});

