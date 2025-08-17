/**
 * Python SDK Compatibility Test Suite
 * 
 * Comprehensive tests to verify exact payload compatibility with the Python SDK.
 * Uses actual Python SDK output examples as test fixtures.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { NoveumClient } from '../../src/core/client.js';
import { StandaloneTrace } from '../../src/core/trace-standalone.js';
import { StandaloneSpan } from '../../src/core/span-standalone.js';
import { MockTransport } from '../../src/transport/http-transport.js';
import type { SerializedTrace, TraceBatch } from '../../src/core/types.js';
import { SpanStatus } from '../../src/core/types.js';
import fs from 'fs';
import path from 'path';

// Load Python SDK example for reference
let pythonExample;
let pythonTrace;

try {
  const fixturePath = path.join(__dirname, '../../example_trace.json');
  pythonExample = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
  pythonTrace = pythonExample.data;
} catch (error) {
  console.warn('Could not load Python example fixture, using mock data for compatibility tests');
  // Provide a minimal mock structure for tests that need it
  pythonExample = { 
    data: {
      trace_id: 'mock-trace-id',
      name: 'mock-trace',
      start_time: '2024-01-01T00:00:00.000Z',
      end_time: '2024-01-01T00:00:01.000Z',
      status: 'ok',
      spans: []
    } 
  };
  pythonTrace = pythonExample.data;
}

describe('Python SDK Compatibility Tests', () => {
  let client: NoveumClient;
  let mockTransport: MockTransport;

  beforeEach(() => {
    mockTransport = new MockTransport();
    client = new NoveumClient({
      apiKey: 'test-key',
      project: 'test-project',
      environment: 'development',
      debug: false,
    });
  });

  describe('Trace Serialization Format', () => {
    test('should match Python SDK trace structure exactly', () => {
      const trace = new StandaloneTrace('test-trace-id', 'test.operation', {
        client,
        attributes: { 'test.attribute': 'value' },
        metadata: {
          user_id: 'user-123',
          session_id: 'session-456',
          request_id: 'req-789',
          tags: { environment: 'test' },
          custom_attributes: { custom: 'data' },
        },
      });

      trace.finish();
      const serialized = trace.serialize();

      // Verify required top-level fields exist
      expect(serialized).toHaveProperty('trace_id');
      expect(serialized).toHaveProperty('name');
      expect(serialized).toHaveProperty('start_time');
      expect(serialized).toHaveProperty('end_time');
      expect(serialized).toHaveProperty('duration_ms');
      expect(serialized).toHaveProperty('status');
      expect(serialized).toHaveProperty('status_message');
      expect(serialized).toHaveProperty('span_count');
      expect(serialized).toHaveProperty('error_count');
      expect(serialized).toHaveProperty('project');
      expect(serialized).toHaveProperty('environment');
      expect(serialized).toHaveProperty('sdk');
      expect(serialized).toHaveProperty('attributes');
      expect(serialized).toHaveProperty('metadata');
      expect(serialized).toHaveProperty('spans');

      // Verify field types match Python SDK
      expect(typeof serialized.trace_id).toBe('string');
      expect(typeof serialized.name).toBe('string');
      expect(typeof serialized.start_time).toBe('string');
      expect(typeof serialized.end_time).toBe('string');
      expect(typeof serialized.duration_ms).toBe('number');
      expect(typeof serialized.status).toBe('string');
      expect(typeof serialized.span_count).toBe('number');
      expect(typeof serialized.error_count).toBe('number');
      expect(typeof serialized.project).toBe('string');
      expect(typeof serialized.environment).toBe('string');
      expect(typeof serialized.sdk).toBe('object');
      expect(typeof serialized.attributes).toBe('object');
      expect(typeof serialized.metadata).toBe('object');
      expect(Array.isArray(serialized.spans)).toBe(true);
    });

    test('should use correct field names (snake_case)', () => {
      const trace = new StandaloneTrace('test-trace-id', 'test.operation', { client });
      const serialized = trace.serialize();

      // Verify no camelCase fields exist
      expect(serialized).not.toHaveProperty('traceId');
      expect(serialized).not.toHaveProperty('startTime');
      expect(serialized).not.toHaveProperty('endTime');
      expect(serialized).not.toHaveProperty('durationMs');
      expect(serialized).not.toHaveProperty('statusMessage');
      expect(serialized).not.toHaveProperty('spanCount');
      expect(serialized).not.toHaveProperty('errorCount');

      // Verify snake_case fields exist
      expect(serialized).toHaveProperty('trace_id');
      expect(serialized).toHaveProperty('start_time');
      expect(serialized).toHaveProperty('end_time');
      expect(serialized).toHaveProperty('duration_ms');
      expect(serialized).toHaveProperty('status_message');
      expect(serialized).toHaveProperty('span_count');
      expect(serialized).toHaveProperty('error_count');
    });

    test('should format timestamps with microsecond precision like Python SDK', () => {
      const trace = new StandaloneTrace('test-trace-id', 'test.operation', { client });
      const serialized = trace.serialize();

      // Check timestamp format matches Python SDK pattern
      const timestampRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}\+00:00$/;
      expect(serialized.start_time).toMatch(timestampRegex);
      
      if (serialized.end_time) {
        expect(serialized.end_time).toMatch(timestampRegex);
      }

      // Compare with Python example format
      expect(serialized.start_time).toMatch(/\d{6}\+00:00$/); // microseconds + timezone
    });

    test('should have correct SDK information structure', () => {
      const trace = new StandaloneTrace('test-trace-id', 'test.operation', { client });
      const serialized = trace.serialize();

      expect(serialized.sdk).toMatchObject({
        name: '@noveum/trace',
        version: expect.any(String),
      });

      // Should be different from Python SDK
      expect(serialized.sdk.name).not.toBe('noveum-trace-python');
    });

    test('should have correct metadata structure', () => {
      const trace = new StandaloneTrace('test-trace-id', 'test.operation', {
        client,
        metadata: {
          user_id: 'test-user',
          session_id: 'test-session',
          request_id: 'test-request',
          tags: { env: 'test' },
          custom_attributes: { custom: 'value' },
        },
      });
      const serialized = trace.serialize();

      expect(serialized.metadata).toMatchObject({
        user_id: 'test-user',
        session_id: 'test-session',
        request_id: 'test-request',
        tags: { env: 'test' },
        custom_attributes: { custom: 'value' },
      });

      // Structure should match Python SDK exactly
      expect(Object.keys(serialized.metadata).sort()).toEqual([
        'custom_attributes',
        'request_id',
        'session_id',
        'tags',
        'user_id'
      ]);
    });
  });

  describe('StandaloneSpan Direct Testing', () => {
    test('should serialize standalone span with correct structure', () => {
      const span = new StandaloneSpan('test-span-id', 'test.span', { trace_id: 'test-trace-id' });
      span.finish();
      const serialized = span.serialize();

      // Verify required span fields exist
      expect(serialized).toHaveProperty('span_id');
      expect(serialized).toHaveProperty('trace_id');
      expect(serialized).toHaveProperty('parent_span_id');
      expect(serialized).toHaveProperty('name');
      expect(serialized).toHaveProperty('start_time');
      expect(serialized).toHaveProperty('end_time');
      expect(serialized).toHaveProperty('duration_ms');
      expect(serialized).toHaveProperty('status');
      expect(serialized).toHaveProperty('status_message');
      expect(serialized).toHaveProperty('attributes');
      expect(serialized).toHaveProperty('events');
      expect(serialized).toHaveProperty('links');

      // Verify field types
      expect(typeof serialized.span_id).toBe('string');
      expect(typeof serialized.trace_id).toBe('string');
      expect(typeof serialized.name).toBe('string');
      expect(typeof serialized.start_time).toBe('string');
      expect(typeof serialized.duration_ms).toBe('number');
      expect(typeof serialized.status).toBe('string');
      expect(typeof serialized.attributes).toBe('object');
      expect(Array.isArray(serialized.events)).toBe(true);
      expect(Array.isArray(serialized.links)).toBe(true);
    });

    test('should use correct field names (snake_case) for spans', () => {
      const span = new StandaloneSpan('test-span-id', 'test.span', { trace_id: 'test-trace-id' });
      const serialized = span.serialize();

      // Verify no camelCase fields exist
      expect(serialized).not.toHaveProperty('spanId');
      expect(serialized).not.toHaveProperty('traceId');
      expect(serialized).not.toHaveProperty('parentSpanId');
      expect(serialized).not.toHaveProperty('startTime');
      expect(serialized).not.toHaveProperty('endTime');
      expect(serialized).not.toHaveProperty('durationMs');
      expect(serialized).not.toHaveProperty('statusMessage');

      // Verify snake_case fields exist
      expect(serialized).toHaveProperty('span_id');
      expect(serialized).toHaveProperty('trace_id');
      expect(serialized).toHaveProperty('parent_span_id');
      expect(serialized).toHaveProperty('start_time');
      expect(serialized).toHaveProperty('end_time');
      expect(serialized).toHaveProperty('duration_ms');
      expect(serialized).toHaveProperty('status_message');
    });

    test('should handle parent-child relationships correctly', () => {
      const parentSpan = new StandaloneSpan('parent-span-id', 'parent.span', { trace_id: 'test-trace-id' });
      const childSpan = new StandaloneSpan('child-span-id', 'child.span', {
        trace_id: 'test-trace-id',
        parent_span_id: 'parent-span-id'
      });

      const parentSerialized = parentSpan.serialize();
      const childSerialized = childSpan.serialize();

      // Parent span should have null parent_span_id
      expect(parentSerialized.parent_span_id).toBeNull();

      // Child span should reference parent
      expect(childSerialized.parent_span_id).toBe('parent-span-id');
      expect(childSerialized.trace_id).toBe(parentSerialized.trace_id);
    });
  });

  describe('Status Enum Conversion', () => {
    test('should convert status enums to lowercase strings like Python SDK', () => {
      const trace = new StandaloneTrace('test-trace-id', 'test.operation', { client });
      
      // Test trace status
      trace.setStatus(SpanStatus.OK);
      const traceSerialized = trace.serialize();
      expect(traceSerialized.status).toBe('ok');

      // Test span status
      const span = new StandaloneSpan('test-span-id', 'test.span', { trace_id: 'test-trace-id' });
      span.setStatus(SpanStatus.ERROR, 'Test error');
      const spanSerialized = span.serialize();
      
      expect(spanSerialized.status).toBe('error');
      expect(spanSerialized.status_message).toBe('Test error');

      // Should not be uppercase
      expect(spanSerialized.status).not.toBe('ERROR');
      expect(spanSerialized.status).not.toBe('OK');
    });

    test('should support all status values from Python SDK', () => {
      const statuses = [SpanStatus.UNSET, SpanStatus.OK, SpanStatus.ERROR, SpanStatus.TIMEOUT, SpanStatus.CANCELLED];
      const statusStrings = ['unset', 'ok', 'error', 'timeout', 'cancelled'];

      for (let i = 0; i < statuses.length; i++) {
        const status = statuses[i];
        const expectedString = statusStrings[i];
        const span = new StandaloneSpan(`test-span-${i}`, `test.${expectedString}`, { trace_id: 'test-trace-id' });
        span.setStatus(status);

        const serialized = span.serialize();
        expect(serialized.status).toBe(expectedString);
      }
    });
  });

  describe('HTTP Batch Payload Format', () => {
    test('should create batch payload matching Python SDK format', () => {
      const trace1 = new StandaloneTrace('trace-1', 'operation1', { client });
      const trace2 = new StandaloneTrace('trace-2', 'operation2', { client });

      trace1.finish();
      trace2.finish();

      const batch: TraceBatch = {
        traces: [trace1.serialize(), trace2.serialize()],
        timestamp: Date.now() / 1000, // Unix timestamp in seconds
      };

      // Verify batch structure
      expect(batch).toHaveProperty('traces');
      expect(batch).toHaveProperty('timestamp');
      expect(Array.isArray(batch.traces)).toBe(true);
      expect(typeof batch.timestamp).toBe('number');
      expect(batch.traces).toHaveLength(2);

      // Verify timestamp is in seconds (not milliseconds)
      expect(batch.timestamp).toBeLessThan(Date.now()); // Should be smaller than milliseconds
      expect(batch.timestamp.toString().length).toBeLessThanOrEqual(10); // Unix timestamp length
    });

    test('should match Python SDK batch structure exactly', () => {
      const trace = new StandaloneTrace('test-trace', 'test.operation', {
        client,
        metadata: {
          user_id: null,
          session_id: null,
          request_id: null,
          tags: {},
          custom_attributes: {},
        },
      });

      trace.finish();

      const batch: TraceBatch = {
        traces: [trace.serialize()],
        timestamp: Date.now() / 1000,
      };

      // Should be ready for HTTP transport exactly as Python SDK sends it
      const payload = JSON.stringify(batch);
      const parsed = JSON.parse(payload);

      expect(parsed.traces[0]).toMatchObject({
        trace_id: expect.any(String),
        name: 'test.operation',
        start_time: expect.stringMatching(/\d{6}\+00:00$/),
        status: 'unset', // Default status
        span_count: expect.any(Number),
        error_count: expect.any(Number),
        sdk: {
          name: '@noveum/trace',
          version: expect.any(String),
        },
        metadata: {
          user_id: null,
          session_id: null,
          request_id: null,
          tags: {},
          custom_attributes: {},
        },
        spans: expect.any(Array),
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle null and undefined values like Python SDK', () => {
      const trace = new StandaloneTrace('test-trace', 'test.operation', {
        client,
        metadata: {
          user_id: null,
          session_id: null,
          request_id: null,
          tags: {},
          custom_attributes: {},
        },
      });

      trace.setStatus(SpanStatus.OK);
      trace.finish();

      const serialized = trace.serialize();

      expect(serialized.metadata.user_id).toBeNull();
      expect(serialized.metadata.session_id).toBeNull();
      expect(serialized.metadata.request_id).toBeNull();
      expect(serialized.status_message).toBeNull();
    });

    test('should handle empty spans array correctly', () => {
      const trace = new StandaloneTrace('empty-trace', 'empty.operation', { client });
      trace.finish();

      const serialized = trace.serialize();

      expect(serialized.spans).toEqual([]);
      expect(serialized.span_count).toBe(0);
      expect(serialized.error_count).toBe(0);
    });

    test('should handle very large attribute values', () => {
      const largeText = 'This is a sample text for testing the noveum-trace SDK. It contains multiple sentences!';
      const span = new StandaloneSpan('large-span', 'large.span', {
        trace_id: 'large-trace',
        attributes: {
          'large.text': largeText,
          'large.number': 9999999,
          'large.array': JSON.stringify(['item1', 'item2', 'item3']),
        }
      });

      span.finish();
      const serialized = span.serialize();

      expect(serialized.attributes['large.text']).toBe(largeText);
      expect(serialized.attributes['large.number']).toBe(9999999);
      expect(typeof serialized.attributes['large.array']).toBe('string');
    });
  });

  describe('Duration and Timing Accuracy', () => {
    test('should calculate duration_ms accurately like Python SDK', async () => {
      const trace = new StandaloneTrace('timing-trace', 'timing.operation', { client });

      // Wait a small amount to ensure measurable duration
      await new Promise(resolve => setTimeout(resolve, 10));

      trace.finish();
      const serialized = trace.serialize();

      expect(serialized.duration_ms).toBeGreaterThan(0);

      // Duration should be reasonable (less than 1 second for this test)
      expect(serialized.duration_ms).toBeLessThan(1000);
    });
  });

  describe('Schema Validation Against Python SDK', () => {
    test('should have all required fields that Python SDK has', () => {
      const trace = new StandaloneTrace('schema-trace', 'schema.operation', { client });
      trace.finish();

      const serialized = trace.serialize();

      // Check all fields from Python SDK example exist
      const requiredTraceFields = [
        'trace_id', 'name', 'start_time', 'end_time', 'duration_ms',
        'status', 'status_message', 'span_count', 'error_count',
        'project', 'environment', 'sdk', 'attributes', 'metadata', 'spans'
      ];

      for (const field of requiredTraceFields) {
        expect(serialized).toHaveProperty(field);
      }

      // Test span fields using StandaloneSpan directly
      const span = new StandaloneSpan('test-span', 'test.span', { trace_id: 'test-trace' });
      span.finish();
      const spanSerialized = span.serialize();

      const requiredSpanFields = [
        'span_id', 'trace_id', 'parent_span_id', 'name', 'start_time',
        'end_time', 'duration_ms', 'status', 'status_message',
        'attributes', 'events', 'links'
      ];

      for (const field of requiredSpanFields) {
        expect(spanSerialized).toHaveProperty(field);
      }
    });

    test('should not have any extra fields that Python SDK doesn\'t have', () => {
      const trace = new StandaloneTrace('clean-trace', 'clean.operation', { client });
      trace.finish();

      const serialized = trace.serialize();

      // Define allowed fields based on Python SDK
      const allowedTraceFields = new Set([
        'trace_id', 'name', 'start_time', 'end_time', 'duration_ms',
        'status', 'status_message', 'span_count', 'error_count',
        'project', 'environment', 'sdk', 'attributes', 'metadata', 'spans'
      ]);

      for (const field of Object.keys(serialized)) {
        expect(allowedTraceFields.has(field)).toBe(true);
      }
    });
  });

  describe('Comparison with Python SDK Example', () => {
    test('should match Python SDK structure from example_trace.json', () => {
      const trace = new StandaloneTrace('test-trace-id', 'test.operation', {
        client,
        attributes: {
          'test.attribute': 'value',
        },
        metadata: {
          user_id: null,
          session_id: null,
          request_id: null,
          tags: {},
          custom_attributes: {},
        },
      });

      trace.finish();
      const serialized = trace.serialize();

      // Compare structure with Python example
      expect(serialized).toMatchObject({
        trace_id: expect.any(String),
        name: expect.any(String),
        start_time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}\+00:00$/),
        end_time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}\+00:00$/),
        duration_ms: expect.any(Number),
        status: expect.any(String),
        status_message: null,
        span_count: expect.any(Number),
        error_count: expect.any(Number),
        project: expect.any(String),
        environment: expect.any(String),
        sdk: {
          name: '@noveum/trace',
          version: expect.any(String),
        },
        attributes: expect.any(Object),
        metadata: {
          user_id: null,
          session_id: null,
          request_id: null,
          tags: {},
          custom_attributes: {},
        },
        spans: expect.any(Array),
      });

      // Verify it matches the same top-level structure as Python example
      const pythonKeys = Object.keys(pythonTrace).sort();
      const tsKeys = Object.keys(serialized).sort();
      expect(tsKeys).toEqual(pythonKeys);
    });
  });
}); 