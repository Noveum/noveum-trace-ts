/**
 * Integration Test Runner
 * 
 * Runs comprehensive integration tests to validate the SDK works correctly
 * with the real Noveum API and framework integrations.
 */

import { runIntegrationTests } from './api-integration.test.js';
import { FrameworkIntegrationTestSuite } from './framework-integration.test.js';
import { config } from 'dotenv';

// Load environment variables
config();

const API_KEY = process.env.NOVEUM_API_KEY;
const PROJECT = process.env.NOVEUM_PROJECT || 'noveum-trace-ts';
const ENVIRONMENT = process.env.NOVEUM_ENVIRONMENT || 'integration-test';

async function runAllIntegrationTests() {
  console.log('🎯 Noveum Trace TypeScript SDK - Complete Integration Test Suite');
  console.log('=' .repeat(70));
  console.log(`📅 Test Run: ${new Date().toISOString()}`);
  console.log(`🔑 API Key: ${API_KEY ? `${API_KEY.substring(0, 10)}...${API_KEY.substring(API_KEY.length - 5)}` : 'Not provided'}`);
  console.log(`📂 Project: ${PROJECT}`);
  console.log(`🌍 Environment: ${ENVIRONMENT}`);
  console.log('=' .repeat(70));

  // Check if we can run integration tests
  const skipTests = !API_KEY || API_KEY.startsWith('your-') || API_KEY === 'test-api-key';
  
  if (skipTests) {
    console.log('⚠️  SKIPPING INTEGRATION TESTS');
    console.log('   Reason: No valid API key found in .env file');
    console.log('   To run integration tests:');
    console.log('   1. Add your Noveum API key to .env file as NOVEUM_API_KEY');
    console.log('   2. Ensure the API key has proper permissions');
    console.log('   3. Re-run this test suite');
    console.log('');
    console.log('💡 You can still run unit tests with: npm test');
    return;
  }

  const startTime = Date.now();
  let allTestsPassed = true;

  try {
    // Run API Integration Tests
    console.log('\n🚀 Phase 1: API Integration Tests');
    console.log('-' .repeat(50));
    await runIntegrationTests();

    // Run Framework Integration Tests  
    console.log('\n🌐 Phase 2: Framework Integration Tests');
    console.log('-' .repeat(50));
    const frameworkSuite = new FrameworkIntegrationTestSuite();
    await frameworkSuite.runAllTests();

    console.log('\n✅ All integration test phases completed successfully!');

  } catch (error) {
    console.error('\n💥 Integration tests failed:', error.message);
    allTestsPassed = false;
  }

  const totalDuration = Date.now() - startTime;
  
  console.log('\n🎉 Integration Test Suite Complete');
  console.log('=' .repeat(70));
  console.log(`⏱️  Total Duration: ${totalDuration}ms (${Math.round(totalDuration / 1000)}s)`);
  console.log(`📊 Overall Result: ${allTestsPassed ? '✅ PASSED' : '❌ FAILED'}`);
  
  if (allTestsPassed) {
    console.log('\n🎯 SDK Validation Summary:');
    console.log('✅ API Authentication & Connectivity');
    console.log('✅ Trace Submission & Serialization');
    console.log('✅ Batch Processing & Performance');
    console.log('✅ Error Handling & Recovery');
    console.log('✅ Framework Middleware Integration');
    console.log('✅ Real-world HTTP Request Tracing');
    console.log('✅ Python SDK Compatibility');
    console.log('');
    console.log('🚀 The TypeScript SDK is ready for production use!');
  } else {
    console.log('\n⚠️  Some tests failed. Review the errors above and fix issues before production use.');
    process.exit(1);
  }
}

// Health check function for CI/CD
export async function healthCheck(): Promise<boolean> {
  try {
    const { NoveumClient } = await import('../../src/index.js');
    
    // Quick health check - just verify client can be created
    const client = new NoveumClient({
      apiKey: API_KEY || 'test-key',
      project: PROJECT,
      environment: 'health-check',
      enabled: false // Don't actually send data
    });

    const config = client.getConfig();
    await client.shutdown();
    
    return config.project === PROJECT;
  } catch (error) {
    console.error('Health check failed:', error.message);
    return false;
  }
}

// Quick smoke test for basic functionality
export async function smokeTest(): Promise<boolean> {
  try {
    console.log('💨 Running smoke test...');
    
    const { NoveumClient, formatPythonCompatibleTimestamp } = await import('../../src/index.js');
    
    const client = new NoveumClient({
      apiKey: 'smoke-test-key',
      project: 'smoke-test',
      environment: 'test',
      enabled: false // Don't send to API
    });

    // Test trace creation
    const trace = await client.createTrace('smoke-test-trace', {
      attributes: {
        'test.type': 'smoke',
        'test.timestamp': formatPythonCompatibleTimestamp()
      }
    });

    // Test span creation
    const span = await client.startSpan('smoke-test-span', {
      traceId: trace.traceId
    });

    // Test operations
    span.setAttribute('test.success', true);
    span.addEvent('smoke-test-event', { result: 'success' });
    
    await span.finish();
    await trace.finish();
    
    // Test serialization
    const serialized = trace.serialize();
    if (!serialized.traceId || !serialized.status || !serialized.spans) {
      throw new Error('Serialization failed - missing required fields');
    }

    await client.shutdown();
    
    console.log('✅ Smoke test passed');
    return true;
  } catch (error) {
    console.error('💨 Smoke test failed:', error.message);
    return false;
  }
}

// Export functions for use in other contexts
export { runAllIntegrationTests };

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  
  switch (command) {
    case 'health':
      healthCheck().then(passed => {
        console.log(passed ? '✅ Health check passed' : '❌ Health check failed');
        process.exit(passed ? 0 : 1);
      });
      break;
      
    case 'smoke':
      smokeTest().then(passed => {
        process.exit(passed ? 0 : 1);
      });
      break;
      
    default:
      runAllIntegrationTests().catch(error => {
        console.error('Test runner failed:', error);
        process.exit(1);
      });
  }
}