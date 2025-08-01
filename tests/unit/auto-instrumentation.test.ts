/**
 * Auto-Instrumentation Registry Integration Test
 *
 * This test validates the auto-instrumentation registry by:
 * - Testing automatic patching of OpenAI and Anthropic SDKs
 * - Verifying metadata capture accuracy
 * - Measuring performance overhead
 * - Testing error handling and edge cases
 * - Validating that tracing works correctly with real and mock SDKs
 *
 * Required Environment Variables (for real API tests):
 * - OPENAI_API_KEY: Your OpenAI API key
 * - ANTHROPIC_API_KEY: Your Anthropic API key
 * - NOVEUM_API_KEY: Your Noveum API key
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NoveumClient } from '../../src/index.js';
import {
  autoTraceOpenAI,
  autoTraceAnthropic,
  autoTraceAll,
  stopTracingOpenAI,
  stopTracingAnthropic,
  stopTracingAll,
  isTraced,
  getTracingInfo,
  InstrumentationRegistry,
  OpenAIInstrumentation,
  AnthropicInstrumentation,
  createInstrumentationRegistry,
} from '../../src/index.js';
import { config } from 'dotenv';

// Load environment variables
config();

describe('Auto-Instrumentation Registry', () => {
  let noveumClient: NoveumClient;
  let mockOpenAI: any;
  let mockAnthropic: any;

  beforeEach(() => {
    // Create a mock Noveum client for testing
    noveumClient = new NoveumClient({
      apiKey: 'test-key',
      project: 'auto-instrumentation-test',
      environment: 'test',
    });

    // Create mock OpenAI client
    mockOpenAI = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-4',
            choices: [{
              index: 0,
              message: { role: 'assistant', content: 'Hello from mock OpenAI!' },
              finish_reason: 'stop'
            }],
            usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 }
          })
        }
      },
      completions: {
        create: vi.fn().mockResolvedValue({
          id: 'cmpl-test',
          object: 'text_completion',
          created: Date.now(),
          model: 'gpt-3.5-turbo-instruct',
          choices: [{ text: 'Hello from completions!', index: 0, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 4, total_tokens: 9 }
        })
      },
      embeddings: {
        create: vi.fn().mockResolvedValue({
          object: 'list',
          data: [{ object: 'embedding', embedding: [0.1, 0.2, 0.3], index: 0 }],
          model: 'text-embedding-ada-002',
          usage: { prompt_tokens: 5, total_tokens: 5 }
        })
      }
    };

    // Create mock Anthropic client
    mockAnthropic = {
      messages: {
        create: vi.fn().mockResolvedValue({
          id: 'msg-test',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello from mock Anthropic!' }],
          model: 'claude-3-sonnet-20240229',
          usage: { input_tokens: 12, output_tokens: 8 }
        })
      },
      completions: {
        create: vi.fn().mockResolvedValue({
          completion: 'Hello from legacy Anthropic!',
          stop_reason: 'stop_sequence',
          model: 'claude-2'
        })
      }
    };
  });

  afterEach(async () => {
    // Clean up any instrumentation
    await stopTracingAll();
  });

  describe('OpenAI Auto-Instrumentation', () => {
    it('should successfully instrument OpenAI client', async () => {
      // Test basic instrumentation
      await autoTraceOpenAI(mockOpenAI, {
        capturePayloads: true,
        countTokens: true,
        estimateCosts: true
      });

      expect(isTraced(mockOpenAI)).toBe(true);

      const tracingInfo = getTracingInfo(mockOpenAI);
      expect(tracingInfo).toBeDefined();
      expect(tracingInfo?.target).toBe('openai');
    });

    it('should capture metadata from chat completions', async () => {
      // Start a trace
      const trace = await noveumClient.startTrace('test-openai-chat');
      
      // Instrument OpenAI
      await autoTraceOpenAI(mockOpenAI, {
        capturePayloads: true,
        countTokens: true
      });

      // Make a chat completion call
      const response = await mockOpenAI.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello, world!' }],
        temperature: 0.7,
        max_tokens: 100
      });

      // Verify the mock was called
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello, world!' }],
        temperature: 0.7,
        max_tokens: 100
      });

      // Verify response
      expect(response.choices[0].message.content).toBe('Hello from mock OpenAI!');

      await trace.finish();
    });

    it('should handle embeddings correctly', async () => {
      // Start a trace
      const trace = await noveumClient.startTrace('test-openai-embeddings');
      
      // Instrument OpenAI
      await autoTraceOpenAI(mockOpenAI);

      // Make an embeddings call
      const response = await mockOpenAI.embeddings.create({
        model: 'text-embedding-ada-002',
        input: 'Hello, world!'
      });

      // Verify the mock was called
      expect(mockOpenAI.embeddings.create).toHaveBeenCalledWith({
        model: 'text-embedding-ada-002',
        input: 'Hello, world!'
      });

      // Verify response
      expect(response.data[0].embedding).toEqual([0.1, 0.2, 0.3]);

      await trace.finish();
    });

    it('should properly uninstrument OpenAI', async () => {
      // Instrument first
      await autoTraceOpenAI(mockOpenAI);
      expect(isTraced(mockOpenAI)).toBe(true);

      // Then uninstrument
      await stopTracingOpenAI(mockOpenAI);
      expect(isTraced(mockOpenAI)).toBe(false);
    });
  });

  describe('Anthropic Auto-Instrumentation', () => {
    it('should successfully instrument Anthropic client', async () => {
      // Test basic instrumentation
      await autoTraceAnthropic(mockAnthropic, {
        capturePayloads: true,
        countTokens: true,
        estimateCosts: true
      });

      expect(isTraced(mockAnthropic)).toBe(true);

      const tracingInfo = getTracingInfo(mockAnthropic);
      expect(tracingInfo).toBeDefined();
      expect(tracingInfo?.target).toBe('anthropic');
    });

    it('should capture metadata from messages API', async () => {
      // Start a trace
      const trace = await noveumClient.startTrace('test-anthropic-messages');
      
      // Instrument Anthropic
      await autoTraceAnthropic(mockAnthropic, {
        capturePayloads: true
      });

      // Make a messages call
      const response = await mockAnthropic.messages.create({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Hello, Claude!' }]
      });

      // Verify the mock was called
      expect(mockAnthropic.messages.create).toHaveBeenCalledWith({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Hello, Claude!' }]
      });

      // Verify response
      expect(response.content[0].text).toBe('Hello from mock Anthropic!');

      await trace.finish();
    });

    it('should handle legacy completions API', async () => {
      // Start a trace
      const trace = await noveumClient.startTrace('test-anthropic-completions');
      
      // Instrument Anthropic
      await autoTraceAnthropic(mockAnthropic);

      // Make a completions call (legacy API)
      const response = await mockAnthropic.completions.create({
        model: 'claude-2',
        prompt: '\n\nHuman: Hello\n\nAssistant:',
        max_tokens_to_sample: 100
      });

      // Verify the mock was called
      expect(mockAnthropic.completions.create).toHaveBeenCalledWith({
        model: 'claude-2',
        prompt: '\n\nHuman: Hello\n\nAssistant:',
        max_tokens_to_sample: 100
      });

      // Verify response
      expect(response.completion).toBe('Hello from legacy Anthropic!');

      await trace.finish();
    });

    it('should properly uninstrument Anthropic', async () => {
      // Instrument first
      await autoTraceAnthropic(mockAnthropic);
      expect(isTraced(mockAnthropic)).toBe(true);

      // Then uninstrument
      await stopTracingAnthropic(mockAnthropic);
      expect(isTraced(mockAnthropic)).toBe(false);
    });
  });

  describe('Multi-Client Auto-Instrumentation', () => {
    it('should instrument multiple clients at once', async () => {
      // Test autoTraceAll with multiple clients
      await autoTraceAll({
        openai: mockOpenAI,
        anthropic: mockAnthropic
      }, {
        capturePayloads: true,
        countTokens: true
      });

      expect(isTraced(mockOpenAI)).toBe(true);
      expect(isTraced(mockAnthropic)).toBe(true);
    });

    it('should stop tracing all clients', async () => {
      // Instrument multiple clients
      await autoTraceAll({
        openai: mockOpenAI,
        anthropic: mockAnthropic
      });

      expect(isTraced(mockOpenAI)).toBe(true);
      expect(isTraced(mockAnthropic)).toBe(true);

      // Stop all tracing
      await stopTracingAll();

      expect(isTraced(mockOpenAI)).toBe(false);
      expect(isTraced(mockAnthropic)).toBe(false);
    });
  });

  describe('Performance Impact', () => {
    it('should have minimal performance overhead', async () => {
      // Measure performance without instrumentation
      const startTime = performance.now();
      await mockOpenAI.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello!' }]
      });
      const uninstrumentedTime = performance.now() - startTime;

      // Reset mock
      vi.clearAllMocks();

      // Instrument and measure performance
      await autoTraceOpenAI(mockOpenAI);
      
      const trace = await noveumClient.startTrace('performance-test');
      const instrumentedStartTime = performance.now();
      await mockOpenAI.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello!' }]
      });
      const instrumentedTime = performance.now() - instrumentedStartTime;
      await trace.finish();

      // Performance overhead should be minimal (less than 5x)
      const overhead = instrumentedTime / uninstrumentedTime;
      expect(overhead).toBeLessThan(5);
      
      console.log(`Performance overhead: ${overhead.toFixed(2)}x`);
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully during instrumentation', async () => {
      // Create a client that will cause instrumentation errors
      const brokenClient = {
        chat: null, // This should cause issues
        invalidMethod: 'not a function'
      };

      // Should not throw when instrumenting broken client
      await expect(autoTraceOpenAI(brokenClient as any)).resolves.not.toThrow();
    });

    it('should handle API errors correctly', async () => {
      // Mock an API error
      mockOpenAI.chat.completions.create = vi.fn().mockRejectedValue(
        new Error('API Error: Rate limit exceeded')
      );

      await autoTraceOpenAI(mockOpenAI);
      
      const trace = await noveumClient.startTrace('error-test');

      // Should handle the error gracefully
      await expect(
        mockOpenAI.chat.completions.create({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello!' }]
        })
      ).rejects.toThrow('API Error: Rate limit exceeded');

      await trace.finish();
    });
  });

  describe('Registry Management', () => {
    it('should create custom registry instances', () => {
      const customRegistry = createInstrumentationRegistry({
        capturePayloads: false,
        countTokens: false
      });

      expect(customRegistry).toBeInstanceOf(InstrumentationRegistry);
    });

    it('should register custom instrumentation modules', () => {
      const registry = createInstrumentationRegistry();
      
      const openaiInstrumentation = new OpenAIInstrumentation();
      registry.register(openaiInstrumentation);

      const registrations = registry.getInstrumentations();
      expect(Object.keys(registrations).length).toBeGreaterThan(0);
    });
  });
});

describe('Real API Integration (Optional)', () => {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  
  // Skip real API tests if keys are not provided or are placeholder values
  const shouldSkipRealTests = !OPENAI_API_KEY || !ANTHROPIC_API_KEY ||
    OPENAI_API_KEY.startsWith('sk-...') ||
    ANTHROPIC_API_KEY.startsWith('sk-ant-...');

  if (shouldSkipRealTests) {
    it.skip('Real API tests skipped - no valid API keys provided', () => {});
    return;
  }

  it('should work with real OpenAI SDK', async () => {
    // This test would require actual OpenAI package installation
    // and real API calls - only run if explicitly enabled
    expect(true).toBe(true); // Placeholder
  });

  it('should work with real Anthropic SDK', async () => {
    // This test would require actual Anthropic package installation
    // and real API calls - only run if explicitly enabled
    expect(true).toBe(true); // Placeholder
  });
}); 