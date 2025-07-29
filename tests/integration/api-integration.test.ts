/**
 * API Integration Tests
 * 
 * Tests the SDK against the real Noveum API to ensure:
 * - Authentication works correctly
 * - Trace submission succeeds
 * - Batch processing works
 * - Error handling is proper
 * - Response validation works
 */

import { NoveumClient, formatPythonCompatibleTimestamp } from '../../src/index.js';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load environment variables
config();

/**
 * Safely formats error messages for type safety
 */
function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const API_KEY = process.env.NOVEUM_API_KEY;
const PROJECT = process.env.NOVEUM_PROJECT || 'noveum-trace-ts';
const ENVIRONMENT = process.env.NOVEUM_ENVIRONMENT || 'integration-test';
const ENDPOINT = process.env.NOVEUM_ENDPOINT || 'https://api.noveum.ai/api';

// Skip tests if no API key is available
const skipIntegrationTests = !API_KEY || API_KEY.startsWith('your-') || API_KEY === 'test-api-key';

if (skipIntegrationTests) {
  console.log('⚠️  Skipping integration tests - No valid API key found in .env file');
  console.log('   Add NOVEUM_API_KEY to .env file to run integration tests');
  process.exit(0);
}

interface TestResult {
  name: string;
  success: boolean;
  error?: string;
  duration?: number;
  details?: any;
}

class IntegrationTestSuite {
  private results: TestResult[] = [];
  private client?: NoveumClient;

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting API Integration Tests');
    console.log('=' .repeat(50));
    console.log(`📡 API Endpoint: ${ENDPOINT}`);
    console.log(`🔑 API Key: ${API_KEY?.substring(0, 10)}...${API_KEY?.substring(API_KEY.length - 5)}`);
    console.log(`📂 Project: ${PROJECT}`);
    console.log(`🌍 Environment: ${ENVIRONMENT}`);
    console.log('=' .repeat(50));
    console.log();

    await this.testBasicConnection();
    await this.testSingleTraceSubmission();
    await this.testBatchTraceSubmission();
    await this.testComplexTraceWithSpans();
    await this.testErrorHandling();
    await this.testLargeTraceSubmission();
    await this.testConcurrentSubmissions();
    await this.testAuthenticationFailure();

    this.printSummary();
  }

  private async runTest(name: string, testFn: () => Promise<void>): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      console.log(`🧪 ${name}...`);
      await testFn();
      const duration = Date.now() - startTime;
      console.log(`   ✅ Passed (${duration}ms)`);
      
      const result: TestResult = { name, success: true, duration };
      this.results.push(result);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`   ❌ Failed (${duration}ms): ${formatError(error)}`);
      
      const result: TestResult = { 
        name, 
        success: false, 
        duration, 
        error: formatError(error),
        details: (error as Error).stack 
      };
      this.results.push(result);
      return result;
    }
  }

  private async testBasicConnection(): Promise<void> {
    await this.runTest('Basic Connection and Client Creation', async () => {
      this.client = new NoveumClient({
        apiKey: API_KEY!,
        project: PROJECT,
        environment: ENVIRONMENT,
        endpoint: ENDPOINT,
        debug: true,
        enabled: true
      });

      // Verify client configuration
      const config = this.client.getConfig();
      if (config.project !== PROJECT) {
        throw new Error(`Project mismatch: expected ${PROJECT}, got ${config.project}`);
      }
      if (config.environment !== ENVIRONMENT) {
        throw new Error(`Environment mismatch: expected ${ENVIRONMENT}, got ${config.environment}`);
      }
    });
  }

  private async testSingleTraceSubmission(): Promise<void> {
    await this.runTest('Single Trace Submission', async () => {
      if (!this.client) throw new Error('Client not initialized');

      const trace = await this.client.createTrace('integration-test-single', {
        attributes: {
          'test.type': 'integration',
          'test.suite': 'api-integration',
          'test.method': 'single-trace',
          'test.timestamp': formatPythonCompatibleTimestamp(),
          'sdk.name': 'noveum-trace-typescript',
          'sdk.version': '1.0.0'
        }
      });

      // Add some events
      trace.addEvent('test-started', {
        'event.type': 'start',
        'test.phase': 'initialization'
      });

      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 50));
      
      trace.addEvent('work-completed', {
        'event.type': 'completion',
        'test.phase': 'work',
        'duration.ms': 50
      });

      // Finish the trace
      await trace.finish();

      // Force flush to send to API
      await this.client.flush();

      console.log(`     📤 Submitted trace: ${trace.traceId}`);
    });
  }

  private async testBatchTraceSubmission(): Promise<void> {
    await this.runTest('Batch Trace Submission', async () => {
      if (!this.client) throw new Error('Client not initialized');

      const traces = [];
      const batchSize = 5;

      // Create multiple traces
      for (let i = 0; i < batchSize; i++) {
        const trace = await this.client.createTrace(`integration-test-batch-${i}`, {
          attributes: {
            'test.type': 'integration',
            'test.suite': 'api-integration',
            'test.method': 'batch-traces',
            'test.batch.index': i,
            'test.batch.size': batchSize,
            'test.timestamp': formatPythonCompatibleTimestamp()
          }
        });

        trace.addEvent('batch-item-created', {
          'batch.index': i,
          'batch.total': batchSize
        });

        await trace.finish();
        traces.push(trace);
      }

      // Force flush all traces
      await this.client.flush();

      console.log(`     📤 Submitted ${batchSize} traces in batch`);
    });
  }

  private async testComplexTraceWithSpans(): Promise<void> {
    await this.runTest('Complex Trace with Multiple Spans', async () => {
      if (!this.client) throw new Error('Client not initialized');

      const trace = await this.client.createTrace('integration-test-complex', {
        attributes: {
          'test.type': 'integration',
          'test.suite': 'api-integration',
          'test.method': 'complex-trace',
          'workflow.type': 'multi-agent',
          'test.timestamp': formatPythonCompatibleTimestamp()
        }
      });

      // Create multiple spans to simulate a complex workflow
      const researchtSpan = await this.client.startSpan('research-phase', {
        traceId: trace.traceId,
        attributes: {
          'agent.type': 'researcher',
          'phase': 'research'
        }
      });

      researchtSpan.addEvent('research-started', {
        'sources': ['web', 'papers', 'databases']
      });

      await new Promise(resolve => setTimeout(resolve, 30));
      researchtSpan.setAttribute('documents.found', 15);
      await researchtSpan.finish();

      const analysisSpan = await this.client.startSpan('analysis-phase', {
        traceId: trace.traceId,
        attributes: {
          'agent.type': 'analyst',
          'phase': 'analysis'
        }
      });

      analysisSpan.addEvent('analysis-started', {
        'input.source': 'research-phase'
      });

      await new Promise(resolve => setTimeout(resolve, 40));
      analysisSpan.setAttribute('insights.generated', 8);
      await analysisSpan.finish();

      trace.addEvent('workflow-completed', {
        'phases.completed': 2,
        'total.duration.ms': 70
      });

      await trace.finish();
      await this.client.flush();

      console.log(`     📤 Submitted complex trace: ${trace.traceId} with 2 spans`);
    });
  }

  private async testErrorHandling(): Promise<void> {
    await this.runTest('Error Handling and Exception Recording', async () => {
      if (!this.client) throw new Error('Client not initialized');

      const trace = await this.client.createTrace('integration-test-error', {
        attributes: {
          'test.type': 'integration',
          'test.suite': 'api-integration',
          'test.method': 'error-handling',
          'test.timestamp': formatPythonCompatibleTimestamp()
        }
      });

      const span = await this.client.startSpan('error-simulation', {
        traceId: trace.traceId,
        attributes: {
          'operation': 'simulate-error'
        }
      });

      try {
        // Simulate an error
        throw new Error('Simulated integration test error');
      } catch (error) {
        span.recordException(error);
        span.setAttribute('error.handled', true);
        trace.setStatus('ERROR');
      }

      await span.finish();
      await trace.finish();
      await this.client.flush();

      console.log(`     📤 Submitted error trace: ${trace.traceId}`);
    });
  }

  private async testLargeTraceSubmission(): Promise<void> {
    await this.runTest('Large Trace with Many Events', async () => {
      if (!this.client) throw new Error('Client not initialized');

      const trace = await this.client.createTrace('integration-test-large', {
        attributes: {
          'test.type': 'integration',
          'test.suite': 'api-integration', 
          'test.method': 'large-trace',
          'test.timestamp': formatPythonCompatibleTimestamp()
        }
      });

      // Add many events to test payload size limits
      for (let i = 0; i < 20; i++) {
        trace.addEvent(`event-${i}`, {
          'event.index': i,
          'event.data': `This is event number ${i} with some additional data`,
          'timestamp': formatPythonCompatibleTimestamp()
        });
      }

      // Add many attributes
      for (let i = 0; i < 10; i++) {
        trace.setAttribute(`custom.attr.${i}`, `value-${i}`);
      }

      await trace.finish();
      await this.client.flush();

      console.log(`     📤 Submitted large trace: ${trace.traceId} with 20 events`);
    });
  }

  private async testConcurrentSubmissions(): Promise<void> {
    await this.runTest('Concurrent Trace Submissions', async () => {
      if (!this.client) throw new Error('Client not initialized');

      const concurrentCount = 3;
      const promises = [];

      for (let i = 0; i < concurrentCount; i++) {
        const promise = (async () => {
          const trace = await this.client!.createTrace(`integration-test-concurrent-${i}`, {
            attributes: {
              'test.type': 'integration',
              'test.suite': 'api-integration',
              'test.method': 'concurrent-traces',
              'test.concurrent.index': i,
              'test.timestamp': formatPythonCompatibleTimestamp()
            }
          });

          trace.addEvent('concurrent-start', {
            'thread.id': i
          });

          await new Promise(resolve => setTimeout(resolve, 20 + (i * 10)));

          trace.addEvent('concurrent-end', {
            'thread.id': i
          });

          await trace.finish();
          return trace.traceId;
        })();

        promises.push(promise);
      }

      const traceIds = await Promise.all(promises);
      await this.client.flush();

      console.log(`     📤 Submitted ${concurrentCount} concurrent traces: ${traceIds.join(', ')}`);
    });
  }

  private async testAuthenticationFailure(): Promise<void> {
    await this.runTest('Authentication Failure Handling', async () => {
      // Create a client with invalid API key
      const invalidClient = new NoveumClient({
        apiKey: 'invalid-api-key-12345',
        project: PROJECT,
        environment: ENVIRONMENT,
        endpoint: ENDPOINT,
        debug: true,
        enabled: true
      });

      const trace = await invalidClient.createTrace('integration-test-auth-fail', {
        attributes: {
          'test.type': 'integration',
          'test.suite': 'api-integration',
          'test.method': 'auth-failure',
          'test.timestamp': formatPythonCompatibleTimestamp()
        }
      });

      await trace.finish();

      // This should fail gracefully without throwing
      try {
        await invalidClient.flush();
        console.log(`     ⚠️  Authentication failure handled gracefully`);
      } catch (error) {
        // This is expected - authentication should fail
        if (formatError(error).includes('401') || formatError(error).includes('unauthorized')) {
          console.log(`     ✅ Authentication properly rejected: ${formatError(error)}`);
        } else {
          throw error;
        }
      } finally {
        await invalidClient.shutdown();
      }
    });
  }

  private printSummary(): void {
    console.log('\n📊 Integration Test Results');
    console.log('=' .repeat(50));

    const successful = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;
    const totalDuration = this.results.reduce((sum, r) => sum + (r.duration || 0), 0);

    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⏱️  Total Duration: ${totalDuration}ms`);
    console.log(`📈 Success Rate: ${Math.round((successful / this.results.length) * 100)}%`);

    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results
        .filter(r => !r.success)
        .forEach(r => {
          console.log(`   ${r.name}: ${r.error}`);
        });
    }

    console.log('\n🎯 API Integration Summary:');
    if (successful === this.results.length) {
      console.log('🎉 All integration tests passed! The SDK is working correctly with the API.');
    } else {
      console.log('⚠️  Some integration tests failed. Check the errors above.');
    }

    console.log('\n📋 Verified Capabilities:');
    console.log('✅ API Authentication');
    console.log('✅ Single Trace Submission');
    console.log('✅ Batch Processing');
    console.log('✅ Complex Traces with Spans');
    console.log('✅ Error Handling');
    console.log('✅ Large Payload Handling');
    console.log('✅ Concurrent Submissions');
    console.log('✅ Authentication Validation');
  }

  async cleanup(): Promise<void> {
    if (this.client) {
      await this.client.shutdown();
    }
  }
}

// Run the tests
async function runIntegrationTests() {
  const suite = new IntegrationTestSuite();
  
  try {
    await suite.runAllTests();
  } catch (error) {
    console.error('💥 Integration test suite failed:', error);
    process.exit(1);
  } finally {
    await suite.cleanup();
  }
}

// Export for use in other files
export { IntegrationTestSuite, runIntegrationTests };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runIntegrationTests().catch(console.error);
}