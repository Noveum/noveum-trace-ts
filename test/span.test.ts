import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Span } from '../src/core/span.js';
import { SpanStatus, SpanKind } from '../src/core/types.js';
import type { SpanOptions } from '../src/core/types.js';

describe('Span', () => {
  let span: Span;
  const mockClient = {
    _addFinishedSpan: vi.fn(),
  };

  beforeEach(() => {
    const options: SpanOptions = {
      traceId: 'test-trace-id',
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
      const options: SpanOptions = {
        traceId: 'test-trace-id',
        parentSpanId: 'parent-span-id',
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
      expect(serialized.events[0].timestamp).toBeInstanceOf(Date);
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
      expect(serialized.status).toBe(SpanStatus.ERROR);
      expect(serialized.statusMessage).toBe('Something went wrong');
    });

    it('should set status without message', () => {
      span.setStatus(SpanStatus.OK);
      
      const serialized = span.serialize();
      expect(serialized.status).toBe(SpanStatus.OK);
      expect(serialized.statusMessage).toBeUndefined();
    });
  });

  describe('finish', () => {
    it('should finish the span', async () => {
      expect(span.isFinished).toBe(false);
      expect(span.endTime).toBeUndefined();
      
      await span.finish();
      
      expect(span.isFinished).toBe(true);
      expect(span.endTime).toBeInstanceOf(Date);
      expect(mockClient._addFinishedSpan).toHaveBeenCalledWith(span);
    });

    it('should not finish twice', async () => {
      await span.finish();
      const firstEndTime = span.endTime;
      
      await span.finish();
      
      expect(span.endTime).toBe(firstEndTime);
      expect(mockClient._addFinishedSpan).toHaveBeenCalledTimes(1);
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
        spanId: 'test-span-id',
        traceId: 'test-trace-id',
        name: 'test-span',
        startTime: span.startTime.toISOString(),
        endTime: undefined,
        status: SpanStatus.OK,
        statusMessage: undefined,
        kind: SpanKind.INTERNAL,
        parentSpanId: undefined,
        attributes: { 'test.key': 'test.value' },
        events: expect.arrayContaining([
          expect.objectContaining({
            name: 'test.event',
            timestamp: expect.any(Date),
            attributes: {},
          }),
        ]),
      });
    });

    it('should serialize finished span', async () => {
      await span.finish();
      
      const serialized = span.serialize();
      expect(serialized.endTime).toBe(span.endTime!.toISOString());
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

