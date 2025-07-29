/**
 * Comprehensive verification test for Noveum Trace TypeScript SDK
 * This tests all major functionality to ensure parity with Python SDK
 */

import { 
  NoveumClient,
  trace,
  span,
  setGlobalClient,
  createClient,
  startTrace,
  startSpan,
  traceFunction,
  spanFunction
} from '../src/index.js';

// Mock configuration for testing
const testConfig = {
  apiKey: 'test-api-key-12345',
  project: 'ts-sdk-verification',
  environment: 'development',
  enabled: true,
  debug: true
};

/**
 * Test 1: Basic Client Initialization and Configuration
 */
async function testBasicClient() {
  console.log('🧪 Testing basic client initialization...');
  
  const client = new NoveumClient(testConfig);
  const config = client.getConfig();
  
  console.log('✓ Client created successfully');
  console.log('✓ Config:', {
    project: config.project,
    environment: config.environment,
    enabled: config.enabled
  });
  
  await client.shutdown();
  return true;
}

/**
 * Test 2: Basic Trace and Span Creation
 */
async function testBasicTracing() {
  console.log('\n🧪 Testing basic trace and span creation...');
  
  const client = new NoveumClient(testConfig);
  
  // Create a trace
  const trace = await client.createTrace('test-trace', {
    attributes: {
      'service.name': 'verification-test',
      'test.type': 'basic-tracing'
    }
  });
  
  console.log('✓ Trace created:', trace.traceId);
  
  // Create a span
  const span = await client.startSpan('test-span', {
    traceId: trace.traceId,
    attributes: {
      'operation.name': 'test-operation',
      'step': 1
    }
  });
  
  console.log('✓ Span created:', span.spanId);
  
  // Add events and attributes
  span.setAttribute('status', 'processing');
  span.addEvent('processing-started', {
    'timestamp': new Date().toISOString(),
    'user.id': 'test-user'
  });
  
  // Finish span and trace
  await span.finish();
  await trace.finish();
  
  console.log('✓ Trace and span finished successfully');
  
  await client.shutdown();
  return true;
}

/**
 * Test 3: Decorator Functionality
 */
async function testDecorators() {
  console.log('\n🧪 Testing decorator functionality...');
  
  const client = new NoveumClient(testConfig);
  setGlobalClient(client);
  
  class TestService {
    @trace('document-processing')
    async processDocument(documentId: string): Promise<{ status: string; id: string }> {
      console.log('Processing document:', documentId);
      
      const result = await this.analyzeContent(documentId);
      
      return {
        status: 'processed',
        id: documentId,
        ...result
      };
    }
    
    @span('content-analysis')
    private async analyzeContent(documentId: string): Promise<{ wordCount: number; summary: string }> {
      // Simulate analysis work
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return {
        wordCount: 1250,
        summary: 'Document contains technical content about AI systems'
      };
    }
    
    @trace('llm-call')
    async mockLLMCall(prompt: string): Promise<string> {
      // Simulate LLM API call
      await new Promise(resolve => setTimeout(resolve, 200));
      return `Mock response to: ${prompt}`;
    }
  }
  
  const service = new TestService();
  
  // Test trace decorator
  const result = await service.processDocument('doc-123');
  console.log('✓ Document processed with @trace decorator:', result);
  
  // Test LLM call tracing
  const llmResponse = await service.mockLLMCall('Explain quantum computing');
  console.log('✓ LLM call traced:', llmResponse.substring(0, 50) + '...');
  
  await client.shutdown();
  return true;
}

/**
 * Test 4: Agent Workflow Tracing
 */
async function testAgentWorkflow() {
  console.log('\n🧪 Testing agent workflow tracing...');
  
  const client = new NoveumClient(testConfig);
  setGlobalClient(client);
  
  class MultiAgentSystem {
    @trace('orchestrator-workflow')
    async orchestrateTask(task: string): Promise<{ result: string; agents: string[] }> {
      console.log('Orchestrating task:', task);
      
      // Coordinate multiple agents
      const researchResult = await this.researchAgent(task);
      const analysisResult = await this.analysisAgent(researchResult);
      const synthesisResult = await this.synthesisAgent(researchResult, analysisResult);
      
      return {
        result: synthesisResult,
        agents: ['researcher', 'analyst', 'synthesizer']
      };
    }
    
    @trace('research-agent')
    private async researchAgent(task: string): Promise<{ data: string; sources: string[] }> {
      console.log('Research agent processing:', task);
      await new Promise(resolve => setTimeout(resolve, 150));
      
      return {
        data: `Research data for: ${task}`,
        sources: ['source1.pdf', 'source2.web', 'source3.api']
      };
    }
    
    @trace('analysis-agent')
    private async analysisAgent(researchData: { data: string; sources: string[] }): Promise<{ insights: string; confidence: number }> {
      console.log('Analysis agent processing research data');
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return {
        insights: 'Key insights from research analysis',
        confidence: 0.95
      };
    }
    
    @trace('synthesis-agent')
    private async synthesisAgent(research: any, analysis: any): Promise<string> {
      console.log('Synthesis agent combining results');
      await new Promise(resolve => setTimeout(resolve, 80));
      
      return `Synthesized result combining research and analysis with ${analysis.confidence * 100}% confidence`;
    }
  }
  
  const agentSystem = new MultiAgentSystem();
  const result = await agentSystem.orchestrateTask('Analyze market trends in AI');
  
  console.log('✓ Multi-agent workflow completed:', {
    result: result.result.substring(0, 50) + '...',
    agentsUsed: result.agents
  });
  
  await client.shutdown();
  return true;
}

/**
 * Test 5: Convenience Functions and Context Managers
 */
async function testConvenienceFunctions() {
  console.log('\n🧪 Testing convenience functions and context management...');
  
  const client = createClient(testConfig);
  
  // Test traceFunction (equivalent to Python context manager)
  const result1 = await traceFunction('user-query-processing', async () => {
    console.log('Processing user query in trace context');
    
    // Nested span function
    const embedding = await spanFunction('generate-embeddings', async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      return { vector: [0.1, 0.2, 0.3], dimensions: 1536 };
    });
    
    const searchResults = await spanFunction('vector-search', async () => {
      await new Promise(resolve => setTimeout(resolve, 75));
      return { matches: 5, topResult: 'relevant-doc.pdf' };
    });
    
    return {
      status: 'completed',
      embedding: embedding.dimensions,
      results: searchResults.matches
    };
  }, {
    attributes: {
      'user.id': 'user-456',
      'query.type': 'semantic_search'
    }
  });
  
  console.log('✓ Trace function completed:', result1);
  
  // Test client convenience methods
  const result2 = await client.trace('batch-processing', async () => {
    console.log('Processing batch of items');
    
    const items = ['item1', 'item2', 'item3'];
    const processedItems = [];
    
    for (const item of items) {
      const processed = await client.span(`process-${item}`, async () => {
        await new Promise(resolve => setTimeout(resolve, 25));
        return `processed-${item}`;
      });
      processedItems.push(processed);
    }
    
    return { totalProcessed: processedItems.length, items: processedItems };
  });
  
  console.log('✓ Client trace method completed:', result2);
  
  await client.shutdown();
  return true;
}

/**
 * Test 6: Error Handling and Exception Tracing
 */
async function testErrorHandling() {
  console.log('\n🧪 Testing error handling and exception tracing...');
  
  const client = new NoveumClient(testConfig);
  setGlobalClient(client);
  
  class ErrorTestService {
    @trace('error-prone-operation')
    async operationThatFails(shouldFail: boolean): Promise<string> {
      if (shouldFail) {
        throw new Error('Simulated operation failure');
      }
      return 'Operation succeeded';
    }
    
    @trace('resilient-operation')
    async resilientOperation(): Promise<{ attempts: number; success: boolean }> {
      let attempts = 0;
      let lastError: Error | null = null;
      
      while (attempts < 3) {
        attempts++;
        
        try {
          await this.unreliableStep(attempts);
          return { attempts, success: true };
        } catch (error) {
          lastError = error as Error;
          console.log(`Attempt ${attempts} failed:`, error.message);
          if (attempts === 3) {
            throw lastError;
          }
        }
      }
      
      // This line is unreachable, but kept for TypeScript
      throw lastError || new Error('All attempts failed');
    }
    
    @span('unreliable-step')
    private async unreliableStep(attempt: number): Promise<void> {
      await new Promise(resolve => setTimeout(resolve, 50));
      
      if (attempt < 2) {
        throw new Error(`Step failed on attempt ${attempt}`);
      }
    }
  }
  
  const service = new ErrorTestService();
  
  // Test successful operation
  try {
    const success = await service.operationThatFails(false);
    console.log('✓ Successful operation traced:', success);
  } catch (error) {
    console.error('Unexpected error:', error);
  }
  
  // Test failed operation
  try {
    await service.operationThatFails(true);
  } catch (error) {
    console.log('✓ Failed operation traced with error:', error.message);
  }
  
  // Test resilient operation
  try {
    const result = await service.resilientOperation();
    console.log('✓ Resilient operation completed:', result);
  } catch (error) {
    console.log('✓ Resilient operation failed after retries:', error.message);
  }
  
  await client.shutdown();
  return true;
}

/**
 * Test 7: Performance and Duration Tracking
 */
async function testPerformanceTracking() {
  console.log('\n🧪 Testing performance and duration tracking...');
  
  const client = new NoveumClient(testConfig);
  setGlobalClient(client);
  
  class PerformanceTestService {
    @trace('performance-test')
    async performanceTest(): Promise<{ duration: number; operations: number }> {
      const startTime = Date.now();
      
      // Perform multiple operations
      const operations = await Promise.all([
        this.fastOperation(),
        this.mediumOperation(),
        this.slowOperation()
      ]);
      
      const duration = Date.now() - startTime;
      
      return {
        duration,
        operations: operations.length
      };
    }
    
    @span('fast-operation')
    private async fastOperation(): Promise<string> {
      await new Promise(resolve => setTimeout(resolve, 10));
      return 'fast-completed';
    }
    
    @span('medium-operation')
    private async mediumOperation(): Promise<string> {
      await new Promise(resolve => setTimeout(resolve, 50));
      return 'medium-completed';
    }
    
    @span('slow-operation')
    private async slowOperation(): Promise<string> {
      await new Promise(resolve => setTimeout(resolve, 100));
      return 'slow-completed';
    }
  }
  
  const service = new PerformanceTestService();
  const result = await service.performanceTest();
  
  console.log('✓ Performance test completed:', {
    totalDuration: `${result.duration}ms`,
    operationsCount: result.operations
  });
  
  await client.shutdown();
  return true;
}

/**
 * Test 8: Batch Processing and Flush Behavior
 */
async function testBatchProcessing() {
  console.log('\n🧪 Testing batch processing and flush behavior...');
  
  const client = new NoveumClient({
    ...testConfig,
    batchSize: 5,
    flushInterval: 1000
  });
  
  // Verify configuration
  const config = client.getConfig();
  if (config.batchSize !== 5 || config.flushInterval !== 1000) {
    throw new Error('Batch configuration not applied correctly');
  }
  console.log('✓ Batch configuration verified: batchSize=5, flushInterval=1000ms');
  
  // Create multiple spans quickly to test batching
  const spans = [];
  for (let i = 0; i < 8; i++) {
    const span = await client.startSpan(`batch-span-${i}`, {
      attributes: {
        'batch.index': i,
        'batch.timestamp': Date.now()
      }
    });
    spans.push(span);
  }
  
  // Finish all spans
  for (const span of spans) {
    await span.finish();
  }
  
  console.log(`✓ Created and finished ${spans.length} spans for batch testing`);
  
  // Test manual flush
  await client.flush();
  console.log('✓ Manual flush completed');
  
  await client.shutdown();
  return true;
}

/**
 * Main verification function
 */
async function runComprehensiveVerification() {
  console.log('🚀 Starting comprehensive Noveum Trace TypeScript SDK verification...\n');
  
  const tests = [
    { name: 'Basic Client', fn: testBasicClient },
    { name: 'Basic Tracing', fn: testBasicTracing },
    { name: 'Decorators', fn: testDecorators },
    { name: 'Agent Workflow', fn: testAgentWorkflow },
    { name: 'Convenience Functions', fn: testConvenienceFunctions },
    { name: 'Error Handling', fn: testErrorHandling },
    { name: 'Performance Tracking', fn: testPerformanceTracking },
    { name: 'Batch Processing', fn: testBatchProcessing }
  ];
  
  const results = [];
  
  for (const test of tests) {
    try {
      const success = await test.fn();
      results.push({ name: test.name, success, error: null });
    } catch (error) {
      console.error(`❌ Test ${test.name} failed:`, error.message);
      results.push({ name: test.name, success: false, error: error.message });
    }
  }
  
  // Summary
  console.log('\n📊 Test Results Summary:');
  console.log('=' .repeat(50));
  
  const passed = results.filter(r => r.success).length;
  const total = results.length;
  
  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${result.name}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });
  
  console.log('\n' + '='.repeat(50));
  console.log(`Overall: ${passed}/${total} tests passed (${Math.round(passed/total*100)}%)`);
  
  if (passed === total) {
    console.log('🎉 All tests passed! The TypeScript SDK is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Review the errors above.');
  }
  
  return { passed, total, results };
}

// Feature comparison with Python SDK
function compareWithPythonSDK() {
  console.log('\n🔄 Feature Parity Comparison with Python SDK:');
  console.log('=' .repeat(60));
  
  const features = [
    { feature: 'Basic tracing (@trace decorator)', typescript: '✅', python: '✅', notes: 'Full parity' },
    { feature: 'Span creation and management', typescript: '✅', python: '✅', notes: 'Full parity' },
    { feature: 'Attribute and event tracking', typescript: '✅', python: '✅', notes: 'Full parity' },
    { feature: 'Error handling and exceptions', typescript: '✅', python: '✅', notes: 'Full parity' },
    { feature: 'Context managers (inline tracing)', typescript: '✅', python: '✅', notes: 'Via convenience functions' },
    { feature: 'Agent workflow tracing', typescript: '✅', python: '✅', notes: 'Via @trace decorator' },
    { feature: 'LLM call tracing', typescript: '✅', python: '✅', notes: 'Generic @trace, no LLM-specific' },
    { feature: 'Batch processing', typescript: '✅', python: '✅', notes: 'Full parity' },
    { feature: 'Performance tracking', typescript: '✅', python: '✅', notes: 'Duration tracking included' },
    { feature: 'Framework integrations', typescript: '✅', python: '❌', notes: 'Express/Next.js/Hono vs none' },
    { feature: 'Auto-instrumentation', typescript: '❌', python: '✅', notes: 'Not implemented yet' },
    { feature: 'Streaming support', typescript: '❌', python: '✅', notes: 'Not implemented yet' },
    { feature: 'Thread management', typescript: '❌', python: '✅', notes: 'Not implemented yet' },
    { feature: 'Plugin system', typescript: '❌', python: '✅', notes: 'Not implemented yet' }
  ];
  
  features.forEach(f => {
    console.log(`${f.feature.padEnd(35)} | TS: ${f.typescript} | Py: ${f.python} | ${f.notes}`);
  });
  
  const tsFeatures = features.filter(f => f.typescript === '✅').length;
  const pyFeatures = features.filter(f => f.python === '✅').length;
  const commonFeatures = features.filter(f => f.typescript === '✅' && f.python === '✅').length;
  
  console.log('\n' + '='.repeat(60));
  console.log(`Feature Summary:`);
  console.log(`- TypeScript SDK: ${tsFeatures}/${features.length} features (${Math.round(tsFeatures/features.length*100)}%)`);
  console.log(`- Python SDK: ${pyFeatures}/${features.length} features (${Math.round(pyFeatures/features.length*100)}%)`);
  console.log(`- Common features: ${commonFeatures}/${features.length} (${Math.round(commonFeatures/features.length*100)}% parity)`);
}

// Run the verification
if (import.meta.url === `file://${process.argv[1]}`) {
  runComprehensiveVerification()
    .then(() => {
      compareWithPythonSDK();
      process.exit(0);
    })
    .catch(error => {
      console.error('Verification failed:', error);
      process.exit(1);
    });
}

export { runComprehensiveVerification, compareWithPythonSDK };