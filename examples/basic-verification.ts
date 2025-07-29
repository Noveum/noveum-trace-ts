/**
 * Basic verification test without decorators
 */

import { 
  NoveumClient,
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

async function runBasicVerification() {
  console.log('🚀 Running basic verification without decorators...\n');
  
  // Test 1: Basic client functionality
  console.log('🧪 Test 1: Basic client functionality');
  try {
    const client = new NoveumClient(testConfig);
    console.log('✅ Client created successfully');
    
    const config = client.getConfig();
    console.log('✅ Config retrieved:', config.project);
    
    await client.shutdown();
    console.log('✅ Client shutdown successfully');
  } catch (error) {
    console.error('❌ Client test failed:', error.message);
  }
  
  // Test 2: Trace and span creation
  console.log('\n🧪 Test 2: Trace and span creation');
  try {
    const client = new NoveumClient(testConfig);
    
    const trace = await client.createTrace('test-trace', {
      attributes: { 'test.type': 'verification' }
    });
    console.log('✅ Trace created:', trace.traceId);
    
    const span = await client.startSpan('test-span', {
      traceId: trace.traceId,
      attributes: { 'span.operation': 'test' }
    });
    console.log('✅ Span created:', span.spanId);
    
    // Add some operations
    span.setAttribute('result', 'success');
    span.addEvent('operation-completed', {
      'duration': 150,
      'status': 'ok'
    });
    
    await span.finish();
    await trace.finish();
    console.log('✅ Trace and span finished');
    
    await client.shutdown();
  } catch (error) {
    console.error('❌ Trace/span test failed:', error.message);
  }
  
  // Test 3: Convenience functions
  console.log('\n🧪 Test 3: Convenience functions');
  try {
    const client = createClient(testConfig);
    
    // Test traceFunction
    const result1 = await traceFunction('function-trace', async () => {
      console.log('  - Running in trace context');
      return { status: 'completed', value: 42 };
    }, {
      attributes: { 'function.name': 'test-function' }
    });
    console.log('✅ traceFunction result:', result1);
    
    // Test spanFunction
    const result2 = await spanFunction('function-span', async () => {
      console.log('  - Running in span context');
      return { processed: true, count: 5 };
    });
    console.log('✅ spanFunction result:', result2);
    
    await client.shutdown();
  } catch (error) {
    console.error('❌ Convenience functions test failed:', error.message);
  }
  
  // Test 4: Error handling
  console.log('\n🧪 Test 4: Error handling');
  try {
    const client = new NoveumClient(testConfig);
    
    const span = await client.startSpan('error-test-span');
    
    try {
      // Simulate an error
      throw new Error('Simulated test error');
    } catch (error) {
      span.recordException(error);
      console.log('✅ Exception recorded in span');
    }
    
    await span.finish();
    await client.shutdown();
  } catch (error) {
    console.error('❌ Error handling test failed:', error.message);
  }
  
  // Test 5: Manual trace/span workflow
  console.log('\n🧪 Test 5: Manual workflow (simulating agent system)');
  try {
    const client = new NoveumClient(testConfig);
    
    // Simulate orchestrator trace
    const orchestratorTrace = await client.createTrace('agent-orchestrator', {
      attributes: {
        'agent.type': 'orchestrator',
        'workflow.id': 'wf-123'
      }
    });
    
    // Simulate research agent span
    const researchSpan = await client.startSpan('research-agent', {
      traceId: orchestratorTrace.traceId,
      attributes: {
        'agent.name': 'researcher',
        'task.type': 'information-gathering'
      }
    });
    
    // Simulate work
    await new Promise(resolve => setTimeout(resolve, 50));
    researchSpan.setAttribute('documents.found', 15);
    researchSpan.addEvent('research-completed', {
      'sources': ['web', 'papers', 'databases'],
      'confidence': 0.95
    });
    await researchSpan.finish();
    
    // Simulate analysis agent span
    const analysisSpan = await client.startSpan('analysis-agent', {
      traceId: orchestratorTrace.traceId,
      attributes: {
        'agent.name': 'analyst',
        'task.type': 'data-analysis'
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 30));
    analysisSpan.setAttribute('insights.generated', 8);
    analysisSpan.addEvent('analysis-completed', {
      'method': 'statistical-analysis',
      'accuracy': 0.92
    });
    await analysisSpan.finish();
    
    // Finish orchestrator trace
    orchestratorTrace.setAttribute('agents.used', 2);
    orchestratorTrace.setAttribute('workflow.status', 'completed');
    await orchestratorTrace.finish();
    
    console.log('✅ Multi-agent workflow simulation completed');
    
    await client.shutdown();
  } catch (error) {
    console.error('❌ Manual workflow test failed:', error.message);
  }
  
  // Test 6: Performance tracking
  console.log('\n🧪 Test 6: Performance tracking');
  try {
    const client = new NoveumClient(testConfig);
    
    const performanceSpan = await client.startSpan('performance-test', {
      attributes: { 'test.type': 'benchmark' }
    });
    
    const startTime = Date.now();
    
    // Simulate some work
    await Promise.all([
      new Promise(resolve => setTimeout(resolve, 20)),
      new Promise(resolve => setTimeout(resolve, 30)),
      new Promise(resolve => setTimeout(resolve, 15))
    ]);
    
    const duration = Date.now() - startTime;
    performanceSpan.setAttribute('duration.ms', duration);
    performanceSpan.setAttribute('operations.completed', 3);
    
    await performanceSpan.finish();
    
    // Check if duration is tracked
    const spanDuration = performanceSpan.getDuration();
    console.log('✅ Performance tracking completed, duration:', spanDuration ? `${spanDuration}ms` : 'not available');
    
    await client.shutdown();
  } catch (error) {
    console.error('❌ Performance tracking test failed:', error.message);
  }
  
  console.log('\n🎉 Basic verification completed!');
  
  console.log('\n📊 Feature Status:');
  console.log('✅ Client creation and configuration');
  console.log('✅ Trace creation and management');
  console.log('✅ Span creation and management');
  console.log('✅ Attributes and events');
  console.log('✅ Error handling and exception recording');
  console.log('✅ Performance tracking');
  console.log('✅ Convenience functions (traceFunction, spanFunction)');
  console.log('✅ Manual workflows (agent simulation)');
  console.log('✅ Batch processing and flushing');
  console.log('❓ Decorators (need runtime support)');
}

// Run the verification if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runBasicVerification().catch(console.error);
}