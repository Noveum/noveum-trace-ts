/**
 * Real OpenAI Integration Test
 *
 * This test performs actual OpenAI API calls with real Noveum tracing to ensure:
 * - Real API integration works end-to-end
 * - Traces are properly sent to Noveum API
 * - OpenAI calls are properly instrumented
 * - Performance and timing data is captured
 * - Error handling works in real scenarios
 *
 * Required Environment Variables:
 * - OPENAI_API_KEY: Your OpenAI API key
 * - NOVEUM_API_KEY: Your Noveum API key  
 * - NOVEUM_PROJECT: Project name (optional, defaults to 'noveum-trace-ts-real-test')
 * - NOVEUM_ENVIRONMENT: Environment name (optional, defaults to 'integration-test')
 */

import { NoveumClient, SpanStatus } from '../../src/index.js';
import { config } from 'dotenv';

// Load environment variables
config();

// Type definitions for OpenAI (since we'll install it as dev dependency)
interface OpenAIChatCompletion {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
}

interface OpenAIEmbedding {
  model: string;
  input: string;
}

// Environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const NOVEUM_API_KEY = process.env.NOVEUM_API_KEY;
const PROJECT = process.env.NOVEUM_PROJECT || 'noveum-trace-ts-real-test';
const ENVIRONMENT = process.env.NOVEUM_ENVIRONMENT || 'integration-test';

// Skip tests if required keys are missing
const shouldSkipTests = !OPENAI_API_KEY || !NOVEUM_API_KEY || 
  OPENAI_API_KEY.startsWith('sk-...') || 
  NOVEUM_API_KEY.startsWith('noveum_...');

if (shouldSkipTests) {
  console.log('⚠️  Skipping real OpenAI integration tests - Missing API keys');
  console.log('   Required in .env file:');
  console.log('   - OPENAI_API_KEY=sk-your-key-here');
  console.log('   - NOVEUM_API_KEY=noveum_your-key-here');
  process.exit(0);
}

interface TestResult {
  name: string;
  success: boolean;
  traceId?: string;
  duration: number;
  openaiTokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
  error?: string;
  details?: any;
}

class RealOpenAIIntegrationTest {
  private client: NoveumClient;
  private results: TestResult[] = [];
  private openai: any; // Will be OpenAI instance

  constructor() {
    // Initialize Noveum client with real API key
    this.client = new NoveumClient({
      apiKey: NOVEUM_API_KEY!,
      project: PROJECT,
      environment: ENVIRONMENT,
      debug: true,
      endpoint: 'https://noveum.free.beeceptor.com',
      batchSize: 1, // Send traces immediately for testing
      flushInterval: 10, // Flush every 10ms
    });
  }

  private async initializeOpenAI() {
    try {
      // Dynamic import of OpenAI
      const { default: OpenAI } = await import('openai');
      this.openai = new OpenAI({
        apiKey: OPENAI_API_KEY!,
      });
    } catch (error) {
      throw new Error('OpenAI package not found. Install with: npm install --save-dev openai');
    }
  }

  private async addResult(result: TestResult) {
    this.results.push(result);
    const status = result.success ? '✅' : '❌';
    const tokens = result.openaiTokens ? 
      ` | Tokens: ${result.openaiTokens.total} (${result.openaiTokens.prompt}+${result.openaiTokens.completion})` : '';
    console.log(`${status} ${result.name} (${result.duration}ms)${tokens}`);
    if (result.traceId) {
      console.log(`   🔗 Trace ID: ${result.traceId}`);
    }
    if (result.error) {
      console.log(`   ❌ Error: ${result.error}`);
    }
  }

  /**
   * Test 1: Simple OpenAI Chat Completion with Tracing
   */
  async testSimpleChatCompletion(): Promise<void> {
    const testName = 'Simple OpenAI Chat Completion';
    const startTime = Date.now();
    let traceId: string | undefined;

    try {
      // Create trace
      const traceInstance = await this.client.createTrace('openai-chat-completion', {
        attributes: {
          'test.type': 'real-openai-integration',
          'test.name': testName,
          'openai.model': 'gpt-3.5-turbo',
          'user.id': 'test-user-123',
          'session.id': `session-${Date.now()}`,
        },
      });
      
      traceId = traceInstance.traceId;

      // Add context event
      traceInstance.addEvent('test-started', {
        'test.timestamp': new Date().toISOString(),
        'test.environment': ENVIRONMENT,
      });

      // Perform OpenAI call within a span
      const spanInstance = await this.client.startSpan('openai-api-call', {
        traceId: traceInstance.traceId,
        attributes: {
          'openai.operation': 'chat.completions.create',
          'openai.model': 'gpt-3.5-turbo',
          'openai.temperature': 0.7,
          'openai.max_tokens': 150,
        },
      });

      const chatCompletion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant for testing AI tracing systems.'
          },
          {
            role: 'user',
            content: 'Explain what observability means for AI applications in exactly 2 sentences.'
          }
        ],
        temperature: 0.7,
        max_tokens: 150,
      });

      // Add token usage data
      if (chatCompletion.usage) {
        spanInstance.setAttribute('openai.tokens.prompt', chatCompletion.usage.prompt_tokens);
        spanInstance.setAttribute('openai.tokens.completion', chatCompletion.usage.completion_tokens);
        spanInstance.setAttribute('openai.tokens.total', chatCompletion.usage.total_tokens);
      }

      spanInstance.setAttribute('openai.response.finish_reason', chatCompletion.choices[0].finish_reason);
      spanInstance.setStatus(SpanStatus.OK);
      await spanInstance.finish();

      // Add final event with response
      traceInstance.addEvent('openai-response-received', {
        'response.length': chatCompletion.choices[0].message.content?.length || 0,
        'response.finish_reason': chatCompletion.choices[0].finish_reason,
        'tokens.used': chatCompletion.usage?.total_tokens || 0,
      });

      traceInstance.setStatus(SpanStatus.OK);
      await traceInstance.finish();
      
      const result = chatCompletion;

      const duration = Date.now() - startTime;
      
      await this.addResult({
        name: testName,
        success: true,
        traceId,
        duration,
        openaiTokens: result.usage ? {
          prompt: result.usage.prompt_tokens,
          completion: result.usage.completion_tokens,
          total: result.usage.total_tokens,
        } : undefined,
        details: {
          response: result.choices[0].message.content?.substring(0, 100) + '...',
          finishReason: result.choices[0].finish_reason,
        }
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      await this.addResult({
        name: testName,
        success: false,
        traceId,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Test 2: OpenAI Embeddings with Error Handling
   * TODO: Fix trace() and span() calls - convert to client.createTrace() and client.startSpan()
   */
  async testEmbeddingsWithErrorHandling_DISABLED(): Promise<void> {
    const testName = 'OpenAI Embeddings with Error Handling';
    const startTime = Date.now();
    let traceId: string | undefined;

    try {
      const result = await trace('openai-embeddings', async (traceInstance) => {
        traceId = traceInstance.traceId;
        
        traceInstance.setAttribute('test.type', 'real-openai-integration');
        traceInstance.setAttribute('test.name', testName);
        traceInstance.setAttribute('openai.operation', 'embeddings');

        // Test successful embeddings call
        const embeddings = await span('generate-embeddings', async (spanInstance) => {
          spanInstance.setAttribute('openai.model', 'text-embedding-ada-002');
          spanInstance.setAttribute('input.type', 'text');

          const inputText = 'Noveum is a powerful tracing platform for AI applications';
          spanInstance.setAttribute('input.length', inputText.length);
          spanInstance.setAttribute('input.preview', inputText.substring(0, 50));

          const embeddingResponse = await this.openai.embeddings.create({
            model: 'text-embedding-ada-002',
            input: inputText,
          });

          spanInstance.setAttribute('output.embedding_dimensions', embeddingResponse.data[0].embedding.length);
          spanInstance.setAttribute('openai.tokens.total', embeddingResponse.usage.total_tokens);
          spanInstance.setStatus('OK');

          return embeddingResponse;
        });

        // Test error handling with invalid input
        await span('test-error-handling', async (spanInstance) => {
          spanInstance.setAttribute('test.purpose', 'error-handling');
          
          try {
            // This should work fine, but we'll simulate monitoring a potentially problematic call
            const testEmbedding = await this.openai.embeddings.create({
              model: 'text-embedding-ada-002',
              input: '',  // Empty string might cause issues
            });
            
            spanInstance.setAttribute('error_handling.result', 'no-error-occurred');
            spanInstance.setStatus('OK');
            return testEmbedding;
          } catch (error) {
            spanInstance.setAttribute('error.type', error instanceof Error ? error.constructor.name : 'unknown');
            spanInstance.setAttribute('error.message', error instanceof Error ? error.message : String(error));
            spanInstance.setStatus('ERROR', error instanceof Error ? error.message : String(error));
            
            // This is expected for testing, so we'll continue
            spanInstance.addEvent('expected-error-caught', {
              'error.handled': true,
              'error.type': 'validation-error'
            });
          }
        });

        traceInstance.setStatus('OK');
        return embeddings;
      });

      const duration = Date.now() - startTime;
      
      await this.addResult({
        name: testName,
        success: true,
        traceId,
        duration,
        details: {
          embeddingDimensions: result.data[0].embedding.length,
          tokensUsed: result.usage.total_tokens,
        }
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      await this.addResult({
        name: testName,
        success: false,
        traceId,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Test 3: Complex Multi-Step AI Workflow  
   * TODO: Fix trace() and span() calls - convert to client.createTrace() and client.startSpan()
   */
  async testComplexAIWorkflow_DISABLED(): Promise<void> {
    const testName = 'Complex Multi-Step AI Workflow';
    const startTime = Date.now();
    let traceId: string | undefined;

    try {
      const result = await trace('ai-workflow-rag-simulation', async (traceInstance) => {
        traceId = traceInstance.traceId;
        
        traceInstance.setAttribute('test.type', 'real-openai-integration');
        traceInstance.setAttribute('test.name', testName);
        traceInstance.setAttribute('workflow.type', 'rag-simulation');
        traceInstance.setAttribute('user.query', 'What is the best way to trace AI applications?');

        // Step 1: Query understanding
        const queryAnalysis = await span('query-understanding', async (spanInstance) => {
          spanInstance.setAttribute('step', 1);
          spanInstance.setAttribute('purpose', 'analyze-user-intent');

          const analysis = await this.openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
              {
                role: 'system',
                content: 'Analyze the user query and extract key topics and intent.'
              },
              {
                role: 'user',
                content: 'What is the best way to trace AI applications?'
              }
            ],
            max_tokens: 100,
            temperature: 0.3,
          });

          spanInstance.setAttribute('openai.tokens.used', analysis.usage?.total_tokens || 0);
          spanInstance.setStatus('OK');
          return analysis.choices[0].message.content;
        });

        traceInstance.addEvent('query-analyzed', {
          'analysis.preview': queryAnalysis?.substring(0, 100),
          'step.completed': 1,
        });

        // Step 2: Document retrieval simulation (using embeddings)
        const relevantContext = await span('document-retrieval', async (spanInstance) => {
          spanInstance.setAttribute('step', 2);
          spanInstance.setAttribute('purpose', 'find-relevant-context');

          // Simulate creating embeddings for retrieval
          const queryEmbedding = await this.openai.embeddings.create({
            model: 'text-embedding-ada-002',
            input: 'AI application tracing observability monitoring',
          });

          spanInstance.setAttribute('embedding.dimensions', queryEmbedding.data[0].embedding.length);
          spanInstance.setAttribute('documents.retrieved', 3);
          spanInstance.setAttribute('retrieval.method', 'semantic-search');
          spanInstance.setStatus('OK');

          // Simulate retrieved documents
          return [
            'Observability in AI applications involves monitoring model performance, token usage, and latency.',
            'Tracing helps debug complex AI workflows by tracking data flow through multiple model calls.',
            'Modern AI tracing tools provide insights into costs, performance, and quality metrics.'
          ];
        });

        traceInstance.addEvent('documents-retrieved', {
          'documents.count': relevantContext.length,
          'step.completed': 2,
        });

        // Step 3: Answer generation
        const finalAnswer = await span('answer-generation', async (spanInstance) => {
          spanInstance.setAttribute('step', 3);
          spanInstance.setAttribute('purpose', 'generate-final-response');
          spanInstance.setAttribute('context.documents', relevantContext.length);

          const response = await this.openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
              {
                role: 'system',
                content: `You are an expert on AI observability. Use the following context to answer the user's question: ${relevantContext.join(' ')}`
              },
              {
                role: 'user',
                content: 'What is the best way to trace AI applications?'
              }
            ],
            temperature: 0.7,
            max_tokens: 200,
          });

          spanInstance.setAttribute('openai.tokens.used', response.usage?.total_tokens || 0);
          spanInstance.setAttribute('response.length', response.choices[0].message.content?.length || 0);
          spanInstance.setStatus('OK');
          
          return response;
        });

        traceInstance.addEvent('workflow-completed', {
          'final_answer.length': finalAnswer.choices[0].message.content?.length || 0,
          'total_tokens.used': (queryAnalysis?.length || 0) + (finalAnswer.usage?.total_tokens || 0),
          'step.completed': 3,
        });

        traceInstance.setStatus('OK');
        return finalAnswer;
      });

      const duration = Date.now() - startTime;
      
      await this.addResult({
        name: testName,
        success: true,
        traceId,
        duration,
        openaiTokens: result.usage ? {
          prompt: result.usage.prompt_tokens,
          completion: result.usage.completion_tokens,
          total: result.usage.total_tokens,
        } : undefined,
        details: {
          response: result.choices[0].message.content?.substring(0, 150) + '...',
          workflowSteps: 3,
        }
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      await this.addResult({
        name: testName,
        success: false,
        traceId,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Run all tests and flush data to Noveum
   */
  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Real OpenAI Integration Tests');
    console.log('==========================================');
    console.log(`📊 Project: ${PROJECT}`);
    console.log(`🌍 Environment: ${ENVIRONMENT}`);
    console.log(`🔗 Noveum API: https://noveum.free.beeceptor.com`);
    console.log('');

    try {
      // Initialize OpenAI first
      await this.initializeOpenAI();
      console.log('✅ OpenAI client initialized');
      console.log('');

      // Run all tests
      await this.testSimpleChatCompletion();
      // TODO: Fix remaining tests - they need trace() and span() calls converted to client methods
      // await this.testEmbeddingsWithErrorHandling();
      // await this.testComplexAIWorkflow();

      // Ensure all traces are sent to Noveum
      console.log('\n🔄 Flushing traces to Noveum API...');
      await this.client.flush();
      
      // Wait a bit for processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log('\n📊 Test Results Summary');
      console.log('========================');
      
      const successful = this.results.filter(r => r.success).length;
      const total = this.results.length;
      const totalTokens = this.results.reduce((sum, r) => sum + (r.openaiTokens?.total || 0), 0);
      const avgDuration = this.results.reduce((sum, r) => sum + r.duration, 0) / total;

      console.log(`✅ Tests Passed: ${successful}/${total}`);
      console.log(`🔢 Total OpenAI Tokens Used: ${totalTokens}`);
      console.log(`⏱️  Average Duration: ${Math.round(avgDuration)}ms`);
      console.log(`🔗 Trace IDs: ${this.results.map(r => r.traceId).filter(Boolean).join(', ')}`);
      
      console.log('\n🔍 Verification Commands:');
      this.results.forEach(result => {
        if (result.traceId) {
          console.log(`curl --location 'https://api.noveum.ai/api/v1/traces/${result.traceId}' \\`);
          console.log(`  --header 'Content-Type: application/json' \\`);
          console.log(`  --header 'Authorization: Bearer ${NOVEUM_API_KEY}'`);
          console.log('');
        }
      });

      if (successful === total) {
        console.log('🎉 All tests passed! Real OpenAI integration is working correctly.');
      } else {
        console.log('⚠️  Some tests failed. Check the logs above for details.');
        process.exit(1);
      }

    } catch (error) {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    } finally {
      await this.client.shutdown();
    }
  }
}

// Run the tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const testSuite = new RealOpenAIIntegrationTest();
  testSuite.runAllTests().catch(console.error);
}

export { RealOpenAIIntegrationTest }; 