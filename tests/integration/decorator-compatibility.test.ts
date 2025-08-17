/**
 * Decorator Compatibility Test Suite
 * 
 * Comprehensive tests to verify the decorator system works correctly 
 * and produces traces compatible with the Python SDK.
 */

import { describe, test, expect, beforeEach, beforeAll, afterEach } from 'vitest';
import { NoveumClient } from '../../src/core/client.js';
import { MockTransport } from '../../src/transport/http-transport.js';
import { getGlobalContextManager, setGlobalContextManager } from '../../src/context/context-manager.js';
import { 
  trace, 
  traceLLM, 
  traceAgent, 
  traceRetrieval, 
  traceTool,
  decoratorUtils,
  type TraceOptions,
  type TraceLLMOptions,
  type TraceAgentOptions,
  type TraceRetrievalOptions,
  type TraceToolOptions
} from '../../src/decorators/index.js';
import type { SerializedTrace } from '../../src/core/types.js';

describe('Decorator Compatibility Tests', () => {
  let client: NoveumClient;
  let mockTransport: MockTransport;

  beforeAll(() => {
    // Set up global context manager
    const contextManager = getGlobalContextManager();
    setGlobalContextManager(contextManager);
  });

  beforeEach(() => {
    // Create mock transport that captures traces
    mockTransport = new MockTransport();

    client = new NoveumClient({
      apiKey: 'test-key',
      project: 'decorator-test',
      environment: 'test',
      debug: false,
    });
  });

  afterEach(() => {
    // Clean up any active traces
    client.shutdown();
  });

  // Helper function to get captured traces
  function getCapturedTraces(): SerializedTrace[] {
    return mockTransport.sentBatches.flatMap(batch => batch.traces);
  }

  describe('Base @trace Decorator', () => {
    test('should work with class methods', async () => {
      class TestService {
        @trace({ name: 'test-method' })
        async processData(data: string): Promise<string> {
          return `processed: ${data}`;
        }

        @trace()
        syncMethod(value: number): number {
          return value * 2;
        }
      }

      const service = new TestService();
      
      // Create a trace context
      const traceContext = await client.createTrace('test-class-methods');
      
      const result1 = await service.processData('test-data');
      const result2 = service.syncMethod(5);

      traceContext.finish();
      await client.flush();

      expect(result1).toBe('processed: test-data');
      expect(result2).toBe(10);
      
      const capturedTraces = getCapturedTraces();
      expect(capturedTraces).toHaveLength(1);
      
      const capturedTrace = capturedTraces[0];
      expect(capturedTrace.spans).toHaveLength(2);
      
      // Check span names and structure
      const spans = capturedTrace.spans;
      expect(spans.some(s => s.name === 'test-method')).toBe(true);
      expect(spans.some(s => s.name === 'TestService.syncMethod')).toBe(true);
    });

    test('should work with standalone functions', async () => {
      const processItem = trace({ 
        name: 'process-item',
        attributes: { 'function.type': 'standalone' }
      })(async function(item: any) {
        return { processed: item, timestamp: Date.now() };
      });

      const calculateSum = trace()(function(a: number, b: number) {
        return a + b;
      });

      // Create a trace context
      const traceContext = await client.createTrace('test-standalone-functions');
      
      const result1 = await processItem({ id: 1, name: 'test' });
      const result2 = calculateSum(3, 7);

      traceContext.finish();
      await client.flush();

      expect(result1).toMatchObject({ processed: { id: 1, name: 'test' } });
      expect(result2).toBe(10);
      
      const capturedTraces = getCapturedTraces();
      expect(capturedTraces).toHaveLength(1);
      
      const capturedTrace = capturedTraces[0];
      expect(capturedTrace.spans).toHaveLength(2);
      
      // Check span attributes
      const processSpan = capturedTrace.spans.find(s => s.name === 'process-item');
      expect(processSpan?.attributes['function.type']).toBe('standalone');
    });

    test('should handle errors correctly', async () => {
      class ErrorService {
        @trace({ name: 'error-method' })
        async failingMethod(): Promise<never> {
          throw new Error('Test error message');
        }
      }

      const service = new ErrorService();
      const traceContext = await client.createTrace('test-error-handling');

      try {
        await service.failingMethod();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Test error message');
      }

      traceContext.finish();
      await client.flush();

      const capturedTraces = getCapturedTraces();
      expect(capturedTraces).toHaveLength(1);
      
      const capturedTrace = capturedTraces[0];
      const errorSpan = capturedTrace.spans.find(s => s.name === 'error-method');
      
      expect(errorSpan?.status).toBe('error');
      expect(errorSpan?.events).toHaveLength(1);
      expect(errorSpan?.events[0].name).toBe('exception');
    });

    test('should verify decorator utilities', () => {
      class TestService {
        @trace({ name: 'tracked-method' })
        trackedMethod() {
          return 'result';
        }

        normalMethod() {
          return 'normal';
        }
      }

      const service = new TestService();
      const trackedMethod = service.trackedMethod;
      const normalMethod = service.normalMethod;

      expect(decoratorUtils.isTraced(trackedMethod)).toBe(true);
      expect(decoratorUtils.isTraced(normalMethod)).toBe(false);
      
      const metadata = decoratorUtils.getDecoratorMetadata(trackedMethod);
      expect(metadata).toBeDefined();
    });
  });

  describe('@traceLLM Decorator', () => {
    test('should capture LLM-specific metadata', async () => {
      class LLMService {
        @traceLLM({
          name: 'llm-completion',
          llmMetadata: {
            model: 'gpt-4',
            provider: 'openai',
            temperature: 0.7,
            maxTokens: 150
          },
          autoExtractTokens: true,
          estimateCosts: true
        })
        async generateCompletion(prompt: string): Promise<any> {
          // Simulate LLM response with usage info
          return {
            content: 'Generated response',
            usage: {
              prompt_tokens: 50,
              completion_tokens: 25,
              total_tokens: 75
            }
          };
        }
      }

      const service = new LLMService();
      const traceContext = await client.createTrace('test-llm-decorator');
      
      const result = await service.generateCompletion('Test prompt');
      
      traceContext.finish();
      await client.flush();

      expect(result.content).toBe('Generated response');
      
      const capturedTraces = getCapturedTraces();
      expect(capturedTraces).toHaveLength(1);
      
      const capturedTrace = capturedTraces[0];
      const llmSpan = capturedTrace.spans.find(s => s.name === 'llm-completion');
      
      expect(llmSpan?.attributes['llm.model']).toBe('gpt-4');
      expect(llmSpan?.attributes['llm.provider']).toBe('openai');
      expect(llmSpan?.attributes['llm.temperature']).toBe(0.7);
      expect(llmSpan?.attributes['llm.max_tokens']).toBe(150);
      expect(llmSpan?.attributes['llm.input_tokens']).toBe(50);
      expect(llmSpan?.attributes['llm.output_tokens']).toBe(25);
      expect(llmSpan?.attributes['llm.total_tokens']).toBe(75);
      expect(llmSpan?.attributes['llm.estimated_cost']).toBeGreaterThan(0);
    });

    test('should work with standalone functions', async () => {
      const askLLM = traceLLM({
        name: 'standalone-llm',
        llmMetadata: {
          model: 'claude-3-sonnet',
          provider: 'anthropic'
        }
      })(async function(question: string) {
        return {
          answer: 'AI response',
          usage: {
            input_tokens: 30,
            output_tokens: 20,
            total_tokens: 50
          }
        };
      });

      const traceContext = await client.createTrace('test-standalone-llm');
      
      const result = await askLLM('What is AI?');
      
      traceContext.finish();
      await client.flush();

      expect(result.answer).toBe('AI response');
      
      const capturedTraces = getCapturedTraces();
      expect(capturedTraces).toHaveLength(1);
      
      const capturedTrace = capturedTraces[0];
      const llmSpan = capturedTrace.spans.find(s => s.name === 'standalone-llm');
      
      expect(llmSpan?.attributes['llm.model']).toBe('claude-3-sonnet');
      expect(llmSpan?.attributes['llm.provider']).toBe('anthropic');
    });
  });

  describe('@traceAgent Decorator', () => {
    test('should capture agent workflow metadata', async () => {
      class AIAgent {
        @traceAgent({
          name: 'agent-reasoning',
          agentMetadata: {
            agentType: 'reasoning',
            agentId: 'reasoner-1',
            toolsUsed: ['analysis', 'planning']
          }
        })
        async performReasoning(task: string): Promise<any> {
          return {
            reasoning_steps: ['analyze', 'synthesize', 'conclude'],
            confidence: 0.85,
            result: 'Reasoning complete'
          };
        }

        @traceAgent({
          name: 'agent-action',
          agentMetadata: {
            agentType: 'action',
            agentId: 'executor-1'
          }
        })
        async executeAction(action: string): Promise<string> {
          return `Executed: ${action}`;
        }
      }

      const agent = new AIAgent();
      const traceContext = await client.createTrace('test-agent-decorator');
      
      const reasoning = await agent.performReasoning('Analyze market trends');
      const action = await agent.executeAction('Buy stocks');
      
      traceContext.finish();
      await client.flush();

      expect(reasoning.result).toBe('Reasoning complete');
      expect(action).toBe('Executed: Buy stocks');
      
      const capturedTraces = getCapturedTraces();
      expect(capturedTraces).toHaveLength(1);
      
      const capturedTrace = capturedTraces[0];
      expect(capturedTrace.spans).toHaveLength(2);
      
      const reasoningSpan = capturedTrace.spans.find(s => s.name === 'agent-reasoning');
      expect(reasoningSpan?.attributes['agent.type']).toBe('reasoning');
      expect(reasoningSpan?.attributes['agent.id']).toBe('reasoner-1');
      
      const actionSpan = capturedTrace.spans.find(s => s.name === 'agent-action');
      expect(actionSpan?.attributes['agent.type']).toBe('action');
      expect(actionSpan?.attributes['agent.id']).toBe('executor-1');
    });
  });

  describe('@traceRetrieval Decorator', () => {
    test('should capture retrieval operation metadata', async () => {
      class RetrievalService {
        @traceRetrieval({
          name: 'vector-search',
          retrievalMetadata: {
            retrievalType: 'vector_search',
            indexName: 'documents',
            topK: 10,
            similarityThreshold: 0.8
          }
        })
        async searchDocuments(query: string): Promise<any[]> {
          return [
            { id: '1', content: 'Document 1', score: 0.95 },
            { id: '2', content: 'Document 2', score: 0.87 }
          ];
        }

        @traceRetrieval({
          name: 'keyword-search',
          retrievalMetadata: {
            retrievalType: 'keyword_search'
          }
        })
        async keywordSearch(keywords: string[]): Promise<any[]> {
          return [
            { id: '3', content: 'Keyword match 1', relevance: 0.9 }
          ];
        }
      }

      const service = new RetrievalService();
      const traceContext = await client.createTrace('test-retrieval-decorator');
      
      const vectorResults = await service.searchDocuments('AI applications');
      const keywordResults = await service.keywordSearch(['machine', 'learning']);
      
      traceContext.finish();
      await client.flush();

      expect(vectorResults).toHaveLength(2);
      expect(keywordResults).toHaveLength(1);
      
      const capturedTraces = getCapturedTraces();
      expect(capturedTraces).toHaveLength(1);
      
      const capturedTrace = capturedTraces[0];
      expect(capturedTrace.spans).toHaveLength(2);
      
      const vectorSpan = capturedTrace.spans.find(s => s.name === 'vector-search');
      expect(vectorSpan?.attributes['retrieval.type']).toBe('vector_search');
      expect(vectorSpan?.attributes['retrieval.top_k']).toBe(10);
      expect(vectorSpan?.attributes['retrieval.similarity_threshold']).toBe(0.8);
      
      const keywordSpan = capturedTrace.spans.find(s => s.name === 'keyword-search');
      expect(keywordSpan?.attributes['retrieval.type']).toBe('keyword_search');
    });
  });

  describe('@traceTool Decorator', () => {
    test('should capture tool execution metadata', async () => {
      class ToolService {
        @traceTool({
          name: 'api-call',
          toolMetadata: {
            toolType: 'api_call',
            toolName: 'weather-api',
            protocol: 'https',
            authType: 'api_key',
            timeout: 5000
          }
        })
        async callWeatherAPI(location: string): Promise<any> {
          return {
            location,
            temperature: 22,
            humidity: 60,
            status: 'success'
          };
        }

        @traceTool({
          name: 'database-query',
          toolMetadata: {
            toolType: 'database_query',
            toolName: 'user-database'
          }
        })
        async queryUsers(filters: any): Promise<any[]> {
          return [
            { id: 1, name: 'John Doe' },
            { id: 2, name: 'Jane Smith' }
          ];
        }
      }

      const service = new ToolService();
      const traceContext = await client.createTrace('test-tool-decorator');
      
      const weatherData = await service.callWeatherAPI('New York');
      const users = await service.queryUsers({ active: true });
      
      traceContext.finish();
      await client.flush();

      expect(weatherData.status).toBe('success');
      expect(users).toHaveLength(2);
      
      const capturedTraces = getCapturedTraces();
      expect(capturedTraces).toHaveLength(1);
      
      const capturedTrace = capturedTraces[0];
      expect(capturedTrace.spans).toHaveLength(2);
      
      const apiSpan = capturedTrace.spans.find(s => s.name === 'api-call');
      expect(apiSpan?.attributes['tool.type']).toBe('api_call');
      expect(apiSpan?.attributes['tool.name']).toBe('weather-api');
      expect(apiSpan?.attributes['tool.protocol']).toBe('https');
      expect(apiSpan?.attributes['tool.auth_type']).toBe('api_key');
      expect(apiSpan?.attributes['tool.timeout']).toBe(5000);
      
      const dbSpan = capturedTrace.spans.find(s => s.name === 'database-query');
      expect(dbSpan?.attributes['tool.type']).toBe('database_query');
      expect(dbSpan?.attributes['tool.name']).toBe('user-database');
    });
  });

  describe('Async Function Support', () => {
    test('should handle async functions correctly', async () => {
      const asyncOperation = trace({ name: 'async-operation' })(
        async function(delay: number): Promise<string> {
          await new Promise(resolve => setTimeout(resolve, delay));
          return 'async-result';
        }
      );

      const traceContext = await client.createTrace('test-async-functions');
      
      const result = await asyncOperation(10);
      
      traceContext.finish();
      await client.flush();

      expect(result).toBe('async-result');
      
      const capturedTraces = getCapturedTraces();
      expect(capturedTraces).toHaveLength(1);
      
      const capturedTrace = capturedTraces[0];
      const span = capturedTrace.spans.find(s => s.name === 'async-operation');
      expect(span?.duration_ms).toBeGreaterThanOrEqual(10);
    });

    test('should handle Promise chains correctly', async () => {
      class AsyncService {
        @trace({ name: 'step-1' })
        async step1(): Promise<string> {
          return 'step1-complete';
        }

        @trace({ name: 'step-2' })
        async step2(input: string): Promise<string> {
          return `${input} -> step2-complete`;
        }

        @trace({ name: 'orchestrator' })
        async orchestrate(): Promise<string> {
          const result1 = await this.step1();
          const result2 = await this.step2(result1);
          return result2;
        }
      }

      const service = new AsyncService();
      const traceContext = await client.createTrace('test-promise-chains');
      
      const result = await service.orchestrate();
      
      traceContext.finish();
      await client.flush();

      expect(result).toBe('step1-complete -> step2-complete');
      
      const capturedTraces = getCapturedTraces();
      expect(capturedTraces).toHaveLength(1);
      
      const capturedTrace = capturedTraces[0];
      expect(capturedTrace.spans).toHaveLength(3);
      
      // Verify all spans exist
      const spanNames = capturedTrace.spans.map(s => s.name).sort();
      expect(spanNames).toEqual(['orchestrator', 'step-1', 'step-2']);
    });
  });

  describe('Error Handling Across Decorators', () => {
    test('should handle errors in LLM operations', async () => {
      class LLMService {
        @traceLLM({
          name: 'failing-llm',
          llmMetadata: {
            model: 'gpt-4',
            provider: 'openai'
          }
        })
        async failingLLMCall(): Promise<never> {
          throw new Error('API rate limit exceeded');
        }
      }

      const service = new LLMService();
      const traceContext = await client.createTrace('test-llm-errors');

      try {
        await service.failingLLMCall();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect((error as Error).message).toBe('API rate limit exceeded');
      }

      traceContext.finish();
      await client.flush();

      const capturedTraces = getCapturedTraces();
      expect(capturedTraces).toHaveLength(1);
      
      const capturedTrace = capturedTraces[0];
      const errorSpan = capturedTrace.spans.find(s => s.name === 'failing-llm');
      
      expect(errorSpan?.status).toBe('error');
      expect(errorSpan?.attributes['llm.model']).toBe('gpt-4');
      expect(errorSpan?.events).toHaveLength(1);
      expect(errorSpan?.events[0].name).toBe('exception');
    });

    test('should handle errors in agent operations', async () => {
      const failingAgent = traceAgent({
        name: 'failing-agent',
        agentMetadata: {
          agentType: 'decision',
          agentId: 'decision-1'
        }
      })(async function(): Promise<never> {
        throw new Error('Decision logic failed');
      });

      const traceContext = await client.createTrace('test-agent-errors');

      try {
        await failingAgent();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect((error as Error).message).toBe('Decision logic failed');
      }

      traceContext.finish();
      await client.flush();

      const capturedTraces = getCapturedTraces();
      expect(capturedTraces).toHaveLength(1);
      
      const capturedTrace = capturedTraces[0];
      const errorSpan = capturedTrace.spans.find(s => s.name === 'failing-agent');
      
      expect(errorSpan?.status).toBe('error');
      expect(errorSpan?.attributes['agent.type']).toBe('decision');
    });
  });

  describe('Python SDK Compatibility', () => {
    test('should produce Python SDK compatible spans', async () => {
      class CompatibilityTest {
        @trace({ name: 'python-compatible-span' })
        async testMethod(): Promise<string> {
          return 'compatibility-test';
        }
      }

      const service = new CompatibilityTest();
      const traceContext = await client.createTrace('python-compatibility-test');
      
      await service.testMethod();
      
      traceContext.finish();
      await client.flush();

      const capturedTraces = getCapturedTraces();
      expect(capturedTraces).toHaveLength(1);
      
      const capturedTrace = capturedTraces[0];
      
      // Verify Python SDK compatibility
      expect(capturedTrace).toHaveProperty('trace_id');
      expect(capturedTrace).toHaveProperty('spans');
      expect(capturedTrace).toHaveProperty('span_count');
      expect(capturedTrace).toHaveProperty('error_count');
      expect(capturedTrace).toHaveProperty('sdk');
      
      const span = capturedTrace.spans[0];
      expect(span).toHaveProperty('span_id');
      expect(span).toHaveProperty('trace_id');
      expect(span).toHaveProperty('parent_span_id');
      expect(span).toHaveProperty('name');
      expect(span).toHaveProperty('start_time');
      expect(span).toHaveProperty('end_time');
      expect(span).toHaveProperty('duration_ms');
      expect(span).toHaveProperty('status');
      expect(span).toHaveProperty('attributes');
      expect(span).toHaveProperty('events');
      expect(span).toHaveProperty('links');
      
      // Verify field naming is snake_case
      expect(span).not.toHaveProperty('spanId');
      expect(span).not.toHaveProperty('traceId');
      expect(span).not.toHaveProperty('startTime');
      expect(span).not.toHaveProperty('endTime');
    });

    test('should maintain correct parent-child relationships', async () => {
      class HierarchyTest {
        @trace({ name: 'parent-operation' })
        async parentOperation(): Promise<string> {
          const child1 = await this.childOperation1();
          const child2 = await this.childOperation2();
          return `${child1} + ${child2}`;
        }

        @trace({ name: 'child-operation-1' })
        async childOperation1(): Promise<string> {
          return 'child1-result';
        }

        @trace({ name: 'child-operation-2' })
        async childOperation2(): Promise<string> {
          return 'child2-result';
        }
      }

      const service = new HierarchyTest();
      const traceContext = await client.createTrace('hierarchy-test');
      
      const result = await service.parentOperation();
      
      traceContext.finish();
      await client.flush();

      expect(result).toBe('child1-result + child2-result');
      
      const capturedTraces = getCapturedTraces();
      expect(capturedTraces).toHaveLength(1);
      
      const capturedTrace = capturedTraces[0];
      expect(capturedTrace.spans).toHaveLength(3);
      
      // Find spans
      const parentSpan = capturedTrace.spans.find(s => s.name === 'parent-operation');
      const child1Span = capturedTrace.spans.find(s => s.name === 'child-operation-1');
      const child2Span = capturedTrace.spans.find(s => s.name === 'child-operation-2');
      
      expect(parentSpan).toBeDefined();
      expect(child1Span).toBeDefined();
      expect(child2Span).toBeDefined();
      
      // Verify parent-child relationships
      expect(child1Span?.parent_span_id).toBe(parentSpan?.span_id);
      expect(child2Span?.parent_span_id).toBe(parentSpan?.span_id);
    });
  });

  describe('Performance and Memory', () => {
    test('should handle multiple decorated calls efficiently', async () => {
      const simpleOperation = trace({ name: 'simple-op' })(
        function(x: number): number {
          return x * 2;
        }
      );

      const traceContext = await client.createTrace('performance-test');
      
      const startTime = Date.now();
      const results = [];
      
      // Execute many operations
      for (let i = 0; i < 100; i++) {
        results.push(simpleOperation(i));
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      traceContext.finish();
      await client.flush();

      expect(results).toHaveLength(100);
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
      
      const capturedTraces = getCapturedTraces();
      expect(capturedTraces).toHaveLength(1);
      
      const capturedTrace = capturedTraces[0];
      expect(capturedTrace.spans).toHaveLength(100);
    });

    test('should not leak memory with many decorated functions', async () => {
      // Create many decorated functions
      const decoratedFunctions = [];
      
      for (let i = 0; i < 50; i++) {
        const fn = trace({ name: `operation-${i}` })(
          function(x: number): number {
            return x + i;
          }
        );
        decoratedFunctions.push(fn);
      }

      const traceContext = await client.createTrace('memory-test');
      
      // Execute all functions
      const results = decoratedFunctions.map((fn, i) => fn(i));
      
      traceContext.finish();
      await client.flush();

      expect(results).toHaveLength(50);
      
      const capturedTraces = getCapturedTraces();
      expect(capturedTraces).toHaveLength(1);
      
      // Verify all spans were created
      const capturedTrace = capturedTraces[0];
      expect(capturedTrace.spans).toHaveLength(50);
    });
  });
}); 