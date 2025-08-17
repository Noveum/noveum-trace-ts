/**
 * Auto-Instrumentation Validation Script
 * 
 * This standalone script validates that the auto-instrumentation registry
 * works correctly by testing core functionality without external dependencies.
 */

import { NoveumClient } from '../src/index.js';
import {
  autoTraceOpenAI,
  autoTraceAnthropic,
  stopTracingOpenAI,
  stopTracingAnthropic,
  isTraced,
  getTracingInfo,
  InstrumentationRegistry,
  OpenAIInstrumentation,
  AnthropicInstrumentation,
  createInstrumentationRegistry,
} from '../src/index.js';

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function success(message: string) {
  log(`✅ ${message}`, colors.green);
}

function error(message: string) {
  log(`❌ ${message}`, colors.red);
}

function info(message: string) {
  log(`ℹ️  ${message}`, colors.blue);
}

function warning(message: string) {
  log(`⚠️  ${message}`, colors.yellow);
}

// Mock OpenAI client structure
function createMockOpenAI() {
  return {
    chat: {
      completions: {
        create: async (params: any) => {
          // Simulate a delay to test performance
          await new Promise(resolve => setTimeout(resolve, 10));
          return {
            id: 'chatcmpl-test',
            object: 'chat.completion',
            created: Date.now(),
            model: params.model,
            choices: [{
              index: 0,
              message: { role: 'assistant', content: 'Hello from mock OpenAI!' },
              finish_reason: 'stop'
            }],
            usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 }
          };
        }
      }
    },
    completions: {
      create: async (params: any) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return {
          id: 'cmpl-test',
          object: 'text_completion',
          created: Date.now(),
          model: params.model,
          choices: [{ text: 'Hello from completions!', index: 0, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 4, total_tokens: 9 }
        };
      }
    },
    embeddings: {
      create: async (params: any) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return {
          object: 'list',
          data: [{ object: 'embedding', embedding: [0.1, 0.2, 0.3], index: 0 }],
          model: params.model,
          usage: { prompt_tokens: 5, total_tokens: 5 }
        };
      }
    }
  };
}

// Mock Anthropic client structure
function createMockAnthropic() {
  return {
    messages: {
      create: async (params: any) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return {
          id: 'msg-test',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello from mock Anthropic!' }],
          model: params.model,
          usage: { input_tokens: 12, output_tokens: 8 }
        };
      }
    },
    completions: {
      create: async (params: any) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return {
          completion: 'Hello from legacy Anthropic!',
          stop_reason: 'stop_sequence',
          model: params.model
        };
      }
    }
  };
}

async function validateBasicInstrumentation() {
  info('Testing Basic Instrumentation...');
  
  try {
    const mockOpenAI = createMockOpenAI();
    const mockAnthropic = createMockAnthropic();

    // Test OpenAI instrumentation
    await autoTraceOpenAI(mockOpenAI, {
      capturePayloads: true,
      countTokens: true,
      estimateCosts: true
    });

    if (isTraced(mockOpenAI)) {
      success('OpenAI client successfully instrumented');
    } else {
      error('OpenAI client instrumentation failed');
      return false;
    }

    // Test Anthropic instrumentation
    await autoTraceAnthropic(mockAnthropic, {
      capturePayloads: true,
      countTokens: true
    });

    if (isTraced(mockAnthropic)) {
      success('Anthropic client successfully instrumented');
    } else {
      error('Anthropic client instrumentation failed');
      return false;
    }

    // Test uninstrumentation
    await stopTracingOpenAI(mockOpenAI);
    await stopTracingAnthropic(mockAnthropic);

    if (!isTraced(mockOpenAI) && !isTraced(mockAnthropic)) {
      success('Both clients successfully uninstrumented');
    } else {
      error('Uninstrumentation failed');
      return false;
    }

    return true;
  } catch (err) {
    error(`Basic instrumentation test failed: ${err}`);
    return false;
  }
}

async function validateMetadataCapture() {
  info('Testing Metadata Capture...');
  
  try {
    const client = new NoveumClient({
      apiKey: 'test-key',
      project: 'validation-test',
      environment: 'test'
    });

    const mockOpenAI = createMockOpenAI();
    
    // Start tracing
    const trace = await client.startTrace('metadata-test');
    
    // Instrument OpenAI
    await autoTraceOpenAI(mockOpenAI, {
      capturePayloads: true,
      countTokens: true
    });

    // Make test calls
    const chatResponse = await mockOpenAI.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Test message' }],
      temperature: 0.7,
      max_tokens: 100
    });

    const embedResponse = await mockOpenAI.embeddings.create({
      model: 'text-embedding-ada-002',
      input: 'Test input'
    });

    // Verify responses
    if (chatResponse.choices[0].message.content === 'Hello from mock OpenAI!' &&
        embedResponse.data[0].embedding.length === 3) {
      success('API calls executed successfully with expected responses');
    } else {
      error('API call responses were not as expected');
      return false;
    }

    // Clean up
    await trace.finish();
    await stopTracingOpenAI(mockOpenAI);

    return true;
  } catch (err) {
    error(`Metadata capture test failed: ${err}`);
    return false;
  }
}

async function validatePerformance() {
  info('Testing Performance Impact...');
  
  try {
    const mockOpenAI = createMockOpenAI();
    const iterations = 50;

    // Measure uninstrumented performance
    const uninstrumentedStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await mockOpenAI.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: `Test message ${i}` }]
      });
    }
    const uninstrumentedTime = performance.now() - uninstrumentedStart;

    // Instrument and measure instrumented performance
    await autoTraceOpenAI(mockOpenAI, {
      capturePayloads: true,
      countTokens: false // Disable expensive operations for fair comparison
    });

    const instrumentedStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await mockOpenAI.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: `Test message ${i}` }]
      });
    }
    const instrumentedTime = performance.now() - instrumentedStart;

    const overhead = instrumentedTime / uninstrumentedTime;
    
    info(`Uninstrumented: ${uninstrumentedTime.toFixed(2)}ms`);
    info(`Instrumented: ${instrumentedTime.toFixed(2)}ms`);
    info(`Overhead: ${overhead.toFixed(2)}x`);

    if (overhead < 3.0) {
      success(`Performance overhead is acceptable: ${overhead.toFixed(2)}x`);
    } else {
      warning(`Performance overhead is high: ${overhead.toFixed(2)}x`);
    }

    // Clean up
    await stopTracingOpenAI(mockOpenAI);

    return true;
  } catch (err) {
    error(`Performance test failed: ${err}`);
    return false;
  }
}

async function validateRegistryManagement() {
  info('Testing Registry Management...');
  
  try {
    // Test custom registry creation
    const customRegistry = createInstrumentationRegistry({
      capturePayloads: false,
      countTokens: false
    });

    if (customRegistry instanceof InstrumentationRegistry) {
      success('Custom registry created successfully');
    } else {
      error('Custom registry creation failed');
      return false;
    }

    // Test custom instrumentation registration
    const openaiInstrumentation = new OpenAIInstrumentation();
    customRegistry.register(openaiInstrumentation);

    const registrations = customRegistry.getInstrumentations();
    if (registrations.size > 0) {
      success('Custom instrumentation registered successfully');
    } else {
      error('Custom instrumentation registration failed');
      return false;
    }

    return true;
  } catch (err) {
    error(`Registry management test failed: ${err}`);
    return false;
  }
}

async function validateErrorHandling() {
  info('Testing Error Handling...');
  
  try {
    // Test with broken client
    const brokenClient = {
      chat: null,
      invalidProperty: 'not a function'
    };

    // Should throw when instrumenting broken client (this is expected behavior)
    try {
      await autoTraceOpenAI(brokenClient as any);
      error('Expected error was not thrown for broken client');
      return false;
    } catch (err) {
      if (err instanceof Error && err.message.includes('is not supported')) {
        success('Correctly rejected broken client instrumentation');
      } else {
        error(`Unexpected error for broken client: ${err}`);
        return false;
      }
    }

    // Test API error handling
    const mockOpenAI = createMockOpenAI();
    
    // Override with error function
    mockOpenAI.chat.completions.create = async () => {
      throw new Error('API Error: Rate limit exceeded');
    };

    await autoTraceOpenAI(mockOpenAI);

    try {
      await mockOpenAI.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }]
      });
      error('Expected API error was not thrown');
      return false;
    } catch (err) {
      if (err instanceof Error && err.message.includes('Rate limit exceeded')) {
        success('API errors are properly propagated');
      } else {
        error(`Unexpected error type: ${err}`);
        return false;
      }
    }

    await stopTracingOpenAI(mockOpenAI);

    return true;
  } catch (err) {
    error(`Error handling test failed: ${err}`);
    return false;
  }
}

async function runValidation() {
  log('\n' + '='.repeat(60), colors.bold);
  log('🔍 AUTO-INSTRUMENTATION REGISTRY VALIDATION', colors.bold);
  log('='.repeat(60), colors.bold);
  log('');

  const tests = [
    { name: 'Basic Instrumentation', fn: validateBasicInstrumentation },
    { name: 'Metadata Capture', fn: validateMetadataCapture },
    { name: 'Performance Impact', fn: validatePerformance },
    { name: 'Registry Management', fn: validateRegistryManagement },
    { name: 'Error Handling', fn: validateErrorHandling }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    log(`\n📋 ${test.name}`, colors.bold);
    log('-'.repeat(30));
    
    try {
      const result = await test.fn();
      if (result) {
        passed++;
        success(`${test.name} PASSED`);
      } else {
        failed++;
        error(`${test.name} FAILED`);
      }
    } catch (err) {
      failed++;
      error(`${test.name} FAILED: ${err}`);
    }
  }

  log('\n' + '='.repeat(60), colors.bold);
  log('📊 VALIDATION RESULTS', colors.bold);
  log('='.repeat(60), colors.bold);
  log(`✅ Passed: ${passed}`, colors.green);
  log(`❌ Failed: ${failed}`, colors.red);
  log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`, colors.blue);
  
  if (failed === 0) {
    log('\n🎉 ALL TESTS PASSED! Auto-instrumentation registry is working correctly.', colors.green);
    return true;
  } else {
    log(`\n💥 ${failed} TEST(S) FAILED. Please review the issues above.`, colors.red);
    return false;
  }
}

// Run validation if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runValidation()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(err => {
      error(`Validation script failed: ${err}`);
      process.exit(1);
    });
}

export { runValidation }; 