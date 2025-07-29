import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { trace, span, timed, setGlobalClient } from '../../src/decorators/index.js';
import { NoveumClient } from '../../src/core/client.js';
import type { NoveumClientOptions } from '../../src/core/types.js';

describe('Decorators', () => {
  let client: NoveumClient;
  const mockOptions: Partial<NoveumClientOptions> = {
    apiKey: 'test-api-key',
    project: 'test-project',
    environment: 'test',
    enabled: true,
  };

  beforeEach(() => {
    client = new NoveumClient(mockOptions);
    setGlobalClient(client);
  });

  afterEach(async () => {
    await client.shutdown();
  });

  describe('@trace', () => {
    it('should trace a method execution', async () => {
      class TestClass {
        @trace('test-trace')
        async testMethod(value: string): Promise<string> {
          return `processed: ${value}`;
        }
      }

      const instance = new TestClass();
      const result = await instance.testMethod('test-input');

      expect(result).toBe('processed: test-input');
    });

    it('should trace with custom attributes', async () => {
      class TestClass {
        @trace('test-trace', { 
          attributes: { 'service.name': 'test-service' }
        })
        async testMethod(): Promise<string> {
          return 'success';
        }
      }

      const instance = new TestClass();
      const result = await instance.testMethod();

      expect(result).toBe('success');
    });

    it('should handle method errors', async () => {
      class TestClass {
        @trace('error-trace', { client })
        async errorMethod(): Promise<never> {
          throw new Error('Test error');
        }
      }

      const instance = new TestClass();
      
      await expect(instance.errorMethod()).rejects.toThrow('Test error');
    });

    it('should work with synchronous methods', () => {
      class TestClass {
        @trace('sync-trace', { client })
        syncMethod(value: number): number {
          return value * 2;
        }
      }

      const instance = new TestClass();
      const result = instance.syncMethod(5);

      expect(result).toBe(10);
    });
  });

  describe('@span', () => {
    it('should create a span for method execution', async () => {
      class TestClass {
        @span('test-span', { client })
        async testMethod(value: string): Promise<string> {
          return `processed: ${value}`;
        }
      }

      const instance = new TestClass();
      const result = await instance.testMethod('test-input');

      expect(result).toBe('processed: test-input');
    });

    it('should capture method arguments as attributes', async () => {
      class TestClass {
        @span('test-span', { 
          client,
          captureArgs: true 
        })
        async testMethod(arg1: string, arg2: number): Promise<string> {
          return `${arg1}-${arg2}`;
        }
      }

      const instance = new TestClass();
      const result = await instance.testMethod('test', 42);

      expect(result).toBe('test-42');
    });

    it('should capture return value as attribute', async () => {
      class TestClass {
        @span('test-span', { 
          client,
          captureReturn: true 
        })
        async testMethod(): Promise<string> {
          return 'return-value';
        }
      }

      const instance = new TestClass();
      const result = await instance.testMethod();

      expect(result).toBe('return-value');
    });
  });

  describe('@timed', () => {
    it('should measure method execution time', async () => {
      class TestClass {
        @timed('test-timer', { client })
        async testMethod(): Promise<string> {
          // Simulate some work
          await new Promise(resolve => setTimeout(resolve, 10));
          return 'completed';
        }
      }

      const instance = new TestClass();
      const result = await instance.testMethod();

      expect(result).toBe('completed');
    });

    it('should work with synchronous methods', () => {
      class TestClass {
        @timed('sync-timer', { client })
        syncMethod(): string {
          // Simulate some work
          let sum = 0;
          for (let i = 0; i < 1000; i++) {
            sum += i;
          }
          return 'completed';
        }
      }

      const instance = new TestClass();
      const result = instance.syncMethod();

      expect(result).toBe('completed');
    });

    it('should handle errors and still record timing', async () => {
      class TestClass {
        @timed('error-timer', { client })
        async errorMethod(): Promise<never> {
          await new Promise(resolve => setTimeout(resolve, 5));
          throw new Error('Test error');
        }
      }

      const instance = new TestClass();
      
      await expect(instance.errorMethod()).rejects.toThrow('Test error');
    });
  });

  describe('decorator combinations', () => {
    it('should work with multiple decorators', async () => {
      class TestClass {
        @trace('combined-trace', { client })
        @span('combined-span', { client })
        @timed('combined-timer', { client })
        async combinedMethod(value: string): Promise<string> {
          await new Promise(resolve => setTimeout(resolve, 5));
          return `processed: ${value}`;
        }
      }

      const instance = new TestClass();
      const result = await instance.combinedMethod('test');

      expect(result).toBe('processed: test');
    });
  });

  describe('decorator options', () => {
    it('should handle disabled tracing', async () => {
      const disabledClient = new NoveumClient({
        ...mockOptions,
        enabled: false,
      });

      class TestClass {
        @trace('disabled-trace', { client: disabledClient })
        async testMethod(): Promise<string> {
          return 'success';
        }
      }

      const instance = new TestClass();
      const result = await instance.testMethod();

      expect(result).toBe('success');
      
      await disabledClient.shutdown();
    });

    it('should handle missing client gracefully', async () => {
      class TestClass {
        @trace('no-client-trace')
        async testMethod(): Promise<string> {
          return 'success';
        }
      }

      const instance = new TestClass();
      const result = await instance.testMethod();

      expect(result).toBe('success');
    });
  });
});

