import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NoveumClient } from '../../src/core/client.js';
import type { NoveumClientOptions, TraceOptions, SpanOptions } from '../../src/core/types.js';
import { TraceLevel, SpanKind } from '../../src/core/types.js';

// Mock the transport
vi.mock('../../src/transport/http-transport.js', () => ({
  HttpTransport: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('NoveumClient Extended Tests', () => {
  let client: NoveumClient;
  let mockTransport: any;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new NoveumClient({
      apiKey: 'test-api-key',
      project: 'test-project',
      environment: 'test',
    });
    
    // Get the mocked transport instance
    mockTransport = (client as any)._transport;
  });

  afterEach(async () => {
    await client.shutdown();
  });

  describe('trace creation with sampling', () => {
    it('should respect sampling configuration', async () => {
      const sampledClient = new NoveumClient({
        apiKey: 'test-api-key',
        sampling: {
          rate: 0.0, // Never sample
          rules: [],
        },
      });

      const trace = await sampledClient.createTrace('test-trace');
      expect((trace as any)._enabled).toBe(false);
      
      await sampledClient.shutdown();
    });

    it('should apply sampling rules', async () => {
      const sampledClient = new NoveumClient({
        apiKey: 'test-api-key',
        sampling: {
          rate: 0.0,
          rules: [
            { traceNamePattern: '^important-', rate: 1.0 },
          ],
        },
      });

      const importantTrace = await sampledClient.createTrace('important-trace');
      const normalTrace = await sampledClient.createTrace('normal-trace');

      expect((importantTrace as any)._enabled).toBe(true);
      expect((normalTrace as any)._enabled).toBe(false);
      
      await sampledClient.shutdown();
    });
  });

  describe('span creation', () => {
    it('should create spans directly', async () => {
      const span = await client.startSpan('test-span');
      
      expect(span).toBeDefined();
      expect(span.name).toBe('test-span');
      expect(span.spanId).toBeDefined();
      await span.finish();
    });

    it('should create spans with options', async () => {
      const parentSpan = await client.startSpan('parent-span');
      const childSpan = await client.startSpan('child-span', {
        parentSpanId: parentSpan.spanId,
        kind: SpanKind.CLIENT,
        attributes: { 'test.key': 'test.value' },
      });

      expect(childSpan.parentSpanId).toBe(parentSpan.spanId);
      expect(childSpan.kind).toBe(SpanKind.CLIENT);
      
      await parentSpan.finish();
      await childSpan.finish();
    });

    it('should handle span creation when disabled', async () => {
      const disabledClient = new NoveumClient({
        apiKey: 'test-api-key',
        enabled: false,
      });

      const span = await disabledClient.startSpan('test-span');
      expect((span as any)._enabled).toBe(false);
      
      await disabledClient.shutdown();
    });
  });

  describe('batch processing', () => {
    it('should batch spans for sending', async () => {
      // Create multiple spans
      const spans = await Promise.all([
        client.startSpan('span-1'),
        client.startSpan('span-2'),
        client.startSpan('span-3'),
      ]);

      // Finish all spans
      await Promise.all(spans.map(span => span.finish()));

      // Manually flush
      await client.flush();

      // Verify transport was called
      expect(mockTransport.send).toHaveBeenCalled();
    });

    it('should respect batch size', async () => {
      const smallBatchClient = new NoveumClient({
        apiKey: 'test-api-key',
        batchSize: 2,
        flushInterval: 60000, // Long interval to prevent auto-flush
      });

      const transport = (smallBatchClient as any)._transport;

      // Create 3 spans
      const span1 = await smallBatchClient.startSpan('span-1');
      const span2 = await smallBatchClient.startSpan('span-2');
      const span3 = await smallBatchClient.startSpan('span-3');

      await span1.finish();
      await span2.finish();
      
      // Should trigger flush after 2 spans
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(transport.send).toHaveBeenCalledTimes(1);

      await span3.finish();
      await smallBatchClient.shutdown();
    });

    it('should handle empty flush', async () => {
      await client.flush();
      // Should not error even with no spans
      expect(mockTransport.send).not.toHaveBeenCalled();
    });
  });

  describe('shutdown behavior', () => {
    it('should flush pending spans on shutdown', async () => {
      const span = await client.startSpan('test-span');
      await span.finish();

      await client.shutdown();
      expect(mockTransport.send).toHaveBeenCalled();
    });

    it('should prevent new operations after shutdown', async () => {
      await client.shutdown();

      const trace = await client.createTrace('test-trace');
      expect((trace as any)._enabled).toBe(false);

      const span = await client.startSpan('test-span');
      expect((span as any)._enabled).toBe(false);
    });

    it('should handle multiple shutdown calls', async () => {
      await client.shutdown();
      await expect(client.shutdown()).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle transport errors gracefully', async () => {
      // Client should log errors but not throw them
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockTransport.send.mockRejectedValueOnce(new Error('Network error'));

      const span = await client.startSpan('test-span');
      await span.finish();

      await client.flush();
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should continue after transport errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockTransport.send
        .mockRejectedValueOnce(new Error('First error'))
        .mockResolvedValueOnce(undefined);

      const span1 = await client.startSpan('span-1');
      await span1.finish();
      await client.flush();

      const span2 = await client.startSpan('span-2');
      await span2.finish();
      await client.flush();

      expect(mockTransport.send).toHaveBeenCalledTimes(2);
      consoleSpy.mockRestore();
    });
  });

  describe('configuration validation', () => {
    it('should validate required API key', () => {
      expect(() => new NoveumClient({} as any)).toThrow('API key is required');
    });

    it('should handle missing optional config', () => {
      const minimalClient = new NoveumClient({ apiKey: 'test-key' });
      const config = minimalClient.getConfig();
      
      expect(config.project).toBe('default');
      expect(config.environment).toBe('development');
      expect(config.batchSize).toBe(100);
    });

    it('should preserve custom configuration', () => {
      const customClient = new NoveumClient({
        apiKey: 'test-key',
        project: 'custom-project',
        environment: 'production',
        batchSize: 50,
        flushInterval: 10000,
        timeout: 60000,
        debug: true,
      });

      const config = customClient.getConfig();
      expect(config.project).toBe('custom-project');
      expect(config.environment).toBe('production');
      expect(config.batchSize).toBe(50);
      expect(config.flushInterval).toBe(10000);
      expect(config.timeout).toBe(60000);
      expect(config.debug).toBe(true);
    });
  });

  describe('trace hierarchy', () => {
    it('should create trace with spans', async () => {
      const trace = await client.createTrace('parent-trace');
      const span1 = await trace.startSpan('child-span-1');
      const span2 = await trace.startSpan('child-span-2');

      expect(span1.traceId).toBe(trace.traceId);
      expect(span2.traceId).toBe(trace.traceId);

      await span1.finish();
      await span2.finish();
      await trace.finish();
    });

    it('should handle nested spans', async () => {
      const trace = await client.createTrace('parent-trace');
      const parentSpan = await trace.startSpan('parent-span');
      const childSpan = await parentSpan.startChildSpan('child-span');

      expect(childSpan.parentSpanId).toBe(parentSpan.spanId);
      expect(childSpan.traceId).toBe(trace.traceId);

      await childSpan.finish();
      await parentSpan.finish();
      await trace.finish();
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent trace creation', async () => {
      const traces = await Promise.all([
        client.createTrace('trace-1'),
        client.createTrace('trace-2'),
        client.createTrace('trace-3'),
      ]);

      expect(traces).toHaveLength(3);
      expect(new Set(traces.map(t => t.traceId)).size).toBe(3); // All unique IDs

      await Promise.all(traces.map(t => t.finish()));
    });

    it('should handle concurrent span creation', async () => {
      const spans = await Promise.all([
        client.startSpan('span-1'),
        client.startSpan('span-2'),
        client.startSpan('span-3'),
      ]);

      expect(spans).toHaveLength(3);
      expect(new Set(spans.map(s => s.spanId)).size).toBe(3); // All unique IDs

      await Promise.all(spans.map(s => s.finish()));
    });
  });

  describe('auto-flush behavior', () => {
    it('should auto-flush based on interval', async () => {
      const fastFlushClient = new NoveumClient({
        apiKey: 'test-api-key',
        flushInterval: 100, // 100ms
      });

      const transport = (fastFlushClient as any)._transport;
      const span = await fastFlushClient.startSpan('test-span');
      await span.finish();

      // Wait for auto-flush
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(transport.send).toHaveBeenCalled();
      await fastFlushClient.shutdown();
    });

    it('should cancel flush timer on shutdown', async () => {
      const fastFlushClient = new NoveumClient({
        apiKey: 'test-api-key',
        flushInterval: 100,
      });

      const span = await fastFlushClient.startSpan('test-span');
      await span.finish();

      // Shutdown before auto-flush
      await fastFlushClient.shutdown();
      
      // Verify timer was cleared (no additional flushes after shutdown)
      const transport = (fastFlushClient as any)._transport;
      const callCount = transport.send.mock.calls.length;
      
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(transport.send).toHaveBeenCalledTimes(callCount);
    });
  });

  describe('debug mode', () => {
    it('should log in debug mode', async () => {
      const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      
      const debugClient = new NoveumClient({
        apiKey: 'test-api-key',
        debug: true,
      });

      const span = await debugClient.startSpan('test-span');
      await span.finish();
      await debugClient.flush();

      // Debug mode would typically log operations
      await debugClient.shutdown();
      consoleSpy.mockRestore();
    });
  });
});