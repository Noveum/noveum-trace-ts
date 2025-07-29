import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NoveumClient, initializeClient, getGlobalClient, resetGlobalClient } from '../../src/core/client.js';
import type { NoveumClientOptions } from '../../src/core/types.js';

describe('NoveumClient', () => {
  let client: NoveumClient;
  const mockOptions: Partial<NoveumClientOptions> = {
    apiKey: 'test-api-key',
    project: 'test-project',
    environment: 'test',
    endpoint: 'https://test.noveum.ai/api/v1/traces',
    enabled: true,
  };

  beforeEach(() => {
    client = new NoveumClient(mockOptions);
  });

  afterEach(async () => {
    await client.shutdown();
    resetGlobalClient();
  });

  describe('constructor', () => {
    it('should create a client with default options', () => {
      const config = client.getConfig();
      expect(config.apiKey).toBe('test-api-key');
      expect(config.project).toBe('test-project');
      expect(config.environment).toBe('test');
      expect(config.endpoint).toBe('https://test.noveum.ai/api/v1/traces');
    });

    it('should throw error when API key is missing', () => {
      expect(() => new NoveumClient({})).toThrow('API key is required');
    });

    it('should merge options with defaults', () => {
      const config = client.getConfig();
      expect(config.batchSize).toBe(100);
      expect(config.flushInterval).toBe(5000);
      expect(config.timeout).toBe(30000);
    });
  });

  describe('createTrace', () => {
    it('should create a new trace', async () => {
      const trace = await client.createTrace('test-trace');
      
      expect(trace).toBeDefined();
      expect(trace.name).toBe('test-trace');
      expect(trace.traceId).toBeDefined();
      expect(trace.isFinished).toBe(false);
    });

    it('should create trace with custom options', async () => {
      const customTraceId = 'custom-trace-id';
      const trace = await client.createTrace('test-trace', {
        traceId: customTraceId,
        attributes: { 'test.key': 'test.value' },
      });
      
      expect(trace.traceId).toBe(customTraceId);
    });

    it('should return no-op trace when disabled', async () => {
      const disabledClient = new NoveumClient({
        ...mockOptions,
        enabled: false,
      });
      
      const trace = await disabledClient.createTrace('test-trace');
      expect(trace).toBeDefined();
      expect(trace.name).toBe('test-trace');
      
      await disabledClient.shutdown();
    });
  });

  describe('startSpan', () => {
    it('should create a new span', async () => {
      const span = await client.startSpan('test-span');
      
      expect(span).toBeDefined();
      expect(span.name).toBe('test-span');
      expect(span.spanId).toBeDefined();
      expect(span.traceId).toBeDefined();
      expect(span.isFinished).toBe(false);
    });

    it('should create span with custom options', async () => {
      const customTraceId = 'custom-trace-id';
      const span = await client.startSpan('test-span', {
        traceId: customTraceId,
        attributes: { 'span.key': 'span.value' },
      });
      
      expect(span.traceId).toBe(customTraceId);
    });
  });

  describe('flush', () => {
    it('should flush without error when no spans', async () => {
      await expect(client.flush()).resolves.not.toThrow();
    });

    it('should handle flush errors gracefully', async () => {
      // Create a span to have something to flush
      const span = await client.startSpan('test-span');
      await span.finish();
      
      // Mock transport to throw error
      const originalSend = (client as any)._transport.send;
      (client as any)._transport.send = vi.fn().mockRejectedValue(new Error('Network error'));
      
      await expect(client.flush()).rejects.toThrow('Network error');
      
      // Restore original method
      (client as any)._transport.send = originalSend;
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      await expect(client.shutdown()).resolves.not.toThrow();
    });

    it('should not throw on multiple shutdowns', async () => {
      await client.shutdown();
      await expect(client.shutdown()).resolves.not.toThrow();
    });
  });

  describe('fromEnvironment', () => {
    it('should create client from environment variables', () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        NOVEUM_API_KEY: 'env-api-key',
        NOVEUM_PROJECT: 'env-project',
        NOVEUM_ENVIRONMENT: 'env-environment',
      };

      const envClient = NoveumClient.fromEnvironment();
      const config = envClient.getConfig();
      
      expect(config.apiKey).toBe('env-api-key');
      expect(config.project).toBe('env-project');
      expect(config.environment).toBe('env-environment');
      
      process.env = originalEnv;
      envClient.shutdown();
    });

    it('should override environment with provided options', () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        NOVEUM_API_KEY: 'env-api-key',
        NOVEUM_PROJECT: 'env-project',
      };

      const envClient = NoveumClient.fromEnvironment({
        project: 'override-project',
      });
      const config = envClient.getConfig();
      
      expect(config.apiKey).toBe('env-api-key');
      expect(config.project).toBe('override-project');
      
      process.env = originalEnv;
      envClient.shutdown();
    });
  });
});

describe('Global Client', () => {
  afterEach(async () => {
    // Clean up global client if it exists
    try {
      const globalClient = getGlobalClient();
      await globalClient.shutdown();
    } catch {
      // Ignore if no global client
    }
  });

  describe('initializeClient', () => {
    it('should initialize global client', () => {
      const client = initializeClient({
        apiKey: 'test-api-key',
        project: 'test-project',
      });
      
      expect(client).toBeDefined();
      expect(getGlobalClient()).toBe(client);
    });
  });

  describe('getGlobalClient', () => {
    beforeEach(() => {
      resetGlobalClient();
    });

    it('should throw error when not initialized', () => {
      expect(() => getGlobalClient()).toThrow(
        'Noveum client not initialized. Call initializeClient() first.'
      );
    });

    it('should return initialized client', () => {
      const client = initializeClient({
        apiKey: 'test-api-key',
        project: 'test-project',
      });
      
      expect(getGlobalClient()).toBe(client);
    });
  });
});

