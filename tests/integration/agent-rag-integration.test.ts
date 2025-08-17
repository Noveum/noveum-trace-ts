/**
 * Agent + RAG Integration Test
 *
 * Simulates a realistic multi-phase agent workflow with RAG and LLM calls:
 * - user intent analysis
 * - embedding generation (OpenAI-like)
 * - vector search (RAG)
 * - reranking
 * - context assembly
 * - LLM generation (OpenAI-like)
 * - tool use
 * - post-processing
 *
 * Sends a single comprehensive trace with many spans to the Noveum API.
 */

import { NoveumClient, SpanStatus, formatPythonCompatibleTimestamp, generateTraceId } from '../../src/index.js';
import { config } from 'dotenv';

// Load environment variables
config();

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const API_KEY = process.env.NOVEUM_API_KEY;
const PROJECT = process.env.NOVEUM_PROJECT || 'noveum-trace-ts-agent-rag';
const ENVIRONMENT = process.env.NOVEUM_ENVIRONMENT || 'integration-test';
const ENDPOINT = process.env.NOVEUM_ENDPOINT || 'https://api.noveum.ai/api';

export class AgentRagIntegrationTestSuite {
  private client?: NoveumClient;

  async runAllTests(): Promise<void> {
    // Skip if no API key
    if (!API_KEY || API_KEY.startsWith('your-') || API_KEY === 'test-api-key') {
      console.log('⚠️  Skipping Agent+RAG integration test - No valid API key found');
      return;
    }

    console.log('🤖 Starting Agent + RAG Integration Test');
    console.log('='.repeat(60));
    console.log(`📡 API Endpoint: ${ENDPOINT}`);
    console.log(
      `🔑 API Key: ${API_KEY.substring(0, 8)}...${API_KEY.substring(API_KEY.length - 4)}`
    );
    console.log(`📂 Project: ${PROJECT}`);
    console.log(`🌍 Environment: ${ENVIRONMENT}`);
    console.log('='.repeat(60));
    console.log();

    await this.testAgentRagEndToEnd();
    await this.cleanup();
  }

  private async runTest(name: string, testFn: () => Promise<void>): Promise<void> {
    const start = Date.now();
    try {
      console.log(`🧪 ${name}...`);
      await testFn();
      console.log(`   ✅ Passed (${Date.now() - start}ms)`);
    } catch (error) {
      console.log(`   ❌ Failed (${Date.now() - start}ms): ${formatError(error)}`);
      throw error;
    }
  }

  private async testAgentRagEndToEnd(): Promise<void> {
    await this.runTest('Agent + RAG End-to-End Trace', async () => {
      this.client = new NoveumClient({
        apiKey: API_KEY!,
        project: PROJECT,
        environment: ENVIRONMENT,
        endpoint: ENDPOINT,
        debug: true,
        batchSize: 100, // aggregate spans into single batch
        flushInterval: 60000, // avoid timer during test
        timeout: 30000,
      });

      // Create a single trace for the entire agent workflow
      const trace = await this.client.createTrace('agent-rag-workflow', {
        attributes: {
          'workflow.type': 'agent-rag',
          'workflow.phases': 8,
        },
      });

      // Phase 1: user intent analysis
      const intentSpan = await trace.startSpan('intent-analysis', {
        attributes: {
          'agent.phase': 'intent',
          'input.length': 128,
        },
      });
      intentSpan.addEvent('intent.detected', { intent: 'answer_question' });
      await sleep(20);
      await intentSpan.finish();

      // Phase 2: embedding generation (OpenAI-like)
      const embedSpan = await trace.startSpan('embedding-generation', {
        attributes: {
          'llm.provider': 'openai',
          'llm.api': 'embeddings',
          'llm.model': 'text-embedding-3-small',
          'llm.tokens.input': 256,
        },
      });
      embedSpan.addEvent('openai.request', {
        model: 'text-embedding-3-small',
        input_size: 256,
      });
      // Generic LLM call marker for UI/analytics
      embedSpan.addEvent('llm_call', {
        provider: 'openai',
        api: 'embeddings',
        model: 'text-embedding-3-small',
        'llm.tokens.input': 256,
      });
      await sleep(30);
      embedSpan.addEvent('openai.response', { vector_dim: 1536 });
      await embedSpan.finish();

      // Phase 3: vector search (RAG)
      const searchSpan = await trace.startSpan('vector-search', {
        attributes: {
          'rag.engine': 'vectordb',
          'rag.top_k': 5,
        },
      });
      searchSpan.addEvent('rag.query', { similarity: 'cosine', top_k: 5 });
      await sleep(25);
      searchSpan.addEvent('rag.results', { results: 5 });
      await searchSpan.finish();

      // Phase 4: reranking
      const rerankSpan = await trace.startSpan('rerank', {
        attributes: { 'rerank.model': 'bge-reranker-base', candidates: 5 },
      });
      await sleep(15);
      await rerankSpan.finish();

      // Phase 5: context assembly
      const ctxSpan = await trace.startSpan('context-assembly', {
        attributes: { 'context.chunks': 3 },
      });
      await sleep(10);
      await ctxSpan.finish();

      // Phase 6: LLM generation (OpenAI-like chat)
      const genSpan = await trace.startSpan('llm-generation', {
        attributes: {
          'llm.provider': 'openai',
          'llm.api': 'chat.completions',
          'llm.model': 'gpt-4o-mini',
          'llm.tokens.input': 320,
        },
      });
      genSpan.addEvent('openai.request', { model: 'gpt-4o-mini', messages: 6 });
      // Generic LLM call marker for UI/analytics
      genSpan.addEvent('llm_call', {
        provider: 'openai',
        api: 'chat.completions',
        model: 'gpt-4o-mini',
        messages: 6,
        'llm.tokens.input': 320,
      });
      await sleep(40);
      genSpan.addEvent('openai.response', { 'llm.tokens.output': 96 });
      await genSpan.finish();

      // Phase 7: tool use (e.g., calculator)
      const toolSpan = await trace.startSpan('tool-use:calculator', {
        attributes: { 'tool.name': 'calculator', query: '2+2*5' },
      });
      await sleep(8);
      // Generic tool call marker for UI/analytics
      toolSpan.addEvent('tool_call', { name: 'calculator', query: '2+2*5' });
      toolSpan.addEvent('tool.result', { value: 12 });
      await toolSpan.finish();

      // Phase 8: post-processing
      const postSpan = await trace.startSpan('post-processing', {
        attributes: { steps: 2 },
      });
      await sleep(12);
      await postSpan.finish();

      // Ensure send
      await this.client.flush();

      console.log(`     📤 Submitted agent+rag trace: ${trace.traceId}`);

      // Validation: Since the HTTP transport already validates successful submission (200 status),
      // we don't need additional API validation that can be flaky due to indexing delays
    });
  }

  async cleanup(): Promise<void> {
    if (this.client) {
      await this.client.shutdown();
    }
  }
}

export async function runAgentRagIntegrationTests(): Promise<void> {
  const suite = new AgentRagIntegrationTestSuite();
  await suite.runAllTests();
}

// Local CLI mode
if (import.meta.url === `file://${process.argv[1]}`) {
  runAgentRagIntegrationTests().catch(err => {
    console.error('Agent+RAG integration test failed:', formatError(err));
    process.exit(1);
  });
}

// Small sleep helper
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
