/**
 * Basic Usage Example for Noveum Trace TypeScript SDK
 * 
 * This example demonstrates the core functionality of the Noveum Trace SDK
 * including creating traces, spans, and using decorators.
 */

import { 
  NoveumClient, 
  initializeClient, 
  startTrace, 
  startSpan,
  trace,
  span,
  timed 
} from '@noveum/trace';

// Initialize the client
const client = initializeClient({
  apiKey: process.env.NOVEUM_API_KEY || 'your-api-key',
  project: 'my-project',
  environment: 'development',
  endpoint: 'https://api.noveum.ai/api/v1/traces',
});

/**
 * Example 1: Manual trace and span creation
 */
async function manualTracingExample() {
  console.log('🔍 Manual Tracing Example');
  
  // Create a trace
  const trace = await client.createTrace('user-registration', {
    attributes: {
      'user.type': 'premium',
      'registration.source': 'web',
    },
  });

  try {
    // Create spans within the trace
    const validationSpan = await client.startSpan('validate-user-data', {
      traceId: trace.traceId,
      attributes: {
        'validation.fields': ['email', 'password', 'name'],
      },
    });

    // Simulate validation work
    await new Promise(resolve => setTimeout(resolve, 100));
    validationSpan.setAttribute('validation.result', 'success');
    await validationSpan.finish();

    const dbSpan = await client.startSpan('save-user-to-database', {
      traceId: trace.traceId,
      attributes: {
        'db.operation': 'INSERT',
        'db.table': 'users',
      },
    });

    // Simulate database work
    await new Promise(resolve => setTimeout(resolve, 200));
    dbSpan.setAttribute('db.rows_affected', 1);
    await dbSpan.finish();

    // Add events to the trace
    trace.addEvent('user-created', {
      'user.id': '12345',
      'user.email': 'user@example.com',
    });

  } catch (error) {
    trace.setAttribute('error', true);
    trace.addEvent('error', {
      'error.message': error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    await trace.finish();
  }
}

/**
 * Example 2: Using convenience functions
 */
async function convenienceFunctionsExample() {
  console.log('🚀 Convenience Functions Example');
  
  // Using the trace function
  const result = await trace('process-payment', async (traceInstance) => {
    traceInstance.setAttribute('payment.amount', 99.99);
    traceInstance.setAttribute('payment.currency', 'USD');
    
    // Nested span
    return await span('validate-payment-method', async (spanInstance) => {
      spanInstance.setAttribute('payment.method', 'credit_card');
      
      // Simulate payment processing
      await new Promise(resolve => setTimeout(resolve, 150));
      
      spanInstance.addEvent('payment-validated');
      return { success: true, transactionId: 'txn_12345' };
    });
  });
  
  console.log('Payment result:', result);
}

/**
 * Example 3: Using decorators
 */
class UserService {
  @trace('user-service-operation')
  async createUser(userData: { name: string; email: string }) {
    console.log('📝 Creating user with decorators');
    
    // This method is automatically traced
    await this.validateUserData(userData);
    const user = await this.saveUser(userData);
    await this.sendWelcomeEmail(user);
    
    return user;
  }

  @span('validate-user-data', { captureArgs: true })
  private async validateUserData(userData: { name: string; email: string }) {
    // This creates a span automatically
    await new Promise(resolve => setTimeout(resolve, 50));
    
    if (!userData.email.includes('@')) {
      throw new Error('Invalid email format');
    }
    
    return true;
  }

  @span('save-user', { captureReturn: true })
  private async saveUser(userData: { name: string; email: string }) {
    // Simulate database save
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return {
      id: Math.random().toString(36).substr(2, 9),
      ...userData,
      createdAt: new Date(),
    };
  }

  @timed('send-welcome-email')
  private async sendWelcomeEmail(user: any) {
    // This measures execution time
    await new Promise(resolve => setTimeout(resolve, 75));
    console.log(`Welcome email sent to ${user.email}`);
  }
}

/**
 * Example 4: Error handling and status tracking
 */
async function errorHandlingExample() {
  console.log('❌ Error Handling Example');
  
  const trace = await client.createTrace('risky-operation');
  
  try {
    const span = await client.startSpan('might-fail', {
      traceId: trace.traceId,
    });
    
    try {
      // Simulate an operation that might fail
      const shouldFail = Math.random() > 0.5;
      
      if (shouldFail) {
        throw new Error('Operation failed randomly');
      }
      
      span.setStatus('OK');
      span.setAttribute('operation.result', 'success');
      
    } catch (error) {
      span.setStatus('ERROR', error instanceof Error ? error.message : 'Unknown error');
      span.addEvent('error', {
        'error.type': error instanceof Error ? error.constructor.name : 'Unknown',
        'error.message': error instanceof Error ? error.message : 'Unknown error',
      });
      throw error; // Re-throw to be caught by outer try-catch
      
    } finally {
      await span.finish();
    }
    
  } catch (error) {
    trace.setStatus('ERROR', 'Operation failed');
    trace.addEvent('operation-failed', {
      'error.message': error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    await trace.finish();
  }
}

/**
 * Example 5: Sampling and configuration
 */
async function samplingExample() {
  console.log('🎯 Sampling Example');
  
  // Create a client with custom sampling
  const sampledClient = new NoveumClient({
    apiKey: process.env.NOVEUM_API_KEY || 'your-api-key',
    project: 'sampled-project',
    environment: 'production',
    sampling: {
      rate: 0.1, // Sample 10% of traces
      rules: [
        {
          rate: 1.0, // Always sample error traces
          traceNamePattern: '.*error.*',
        },
        {
          rate: 0.01, // Sample 1% of health check traces
          traceNamePattern: 'health-check',
        },
      ],
    },
  });

  // These traces will be sampled according to the rules above
  for (let i = 0; i < 5; i++) {
    const trace = await sampledClient.createTrace(`operation-${i}`);
    await trace.finish();
  }

  await sampledClient.shutdown();
}

/**
 * Example 6: Batch processing and flushing
 */
async function batchProcessingExample() {
  console.log('📦 Batch Processing Example');
  
  const batchClient = new NoveumClient({
    apiKey: process.env.NOVEUM_API_KEY || 'your-api-key',
    project: 'batch-project',
    batchSize: 5, // Send traces in batches of 5
    flushInterval: 2000, // Flush every 2 seconds
  });

  // Create multiple traces quickly
  const traces = [];
  for (let i = 0; i < 10; i++) {
    const trace = await batchClient.createTrace(`batch-operation-${i}`);
    trace.setAttribute('batch.index', i);
    traces.push(trace);
  }

  // Finish all traces
  for (const trace of traces) {
    await trace.finish();
  }

  // Manually flush remaining traces
  await batchClient.flush();
  await batchClient.shutdown();
}

/**
 * Main execution function
 */
async function main() {
  console.log('🎉 Noveum Trace TypeScript SDK Examples\n');

  try {
    await manualTracingExample();
    console.log('✅ Manual tracing completed\n');

    await convenienceFunctionsExample();
    console.log('✅ Convenience functions completed\n');

    const userService = new UserService();
    await userService.createUser({
      name: 'John Doe',
      email: 'john@example.com',
    });
    console.log('✅ Decorator example completed\n');

    await errorHandlingExample();
    console.log('✅ Error handling completed\n');

    await samplingExample();
    console.log('✅ Sampling example completed\n');

    await batchProcessingExample();
    console.log('✅ Batch processing completed\n');

  } catch (error) {
    console.error('❌ Example failed:', error);
  } finally {
    // Always shutdown the client
    await client.shutdown();
    console.log('🔚 Client shutdown completed');
  }
}

// Run the examples
if (require.main === module) {
  main().catch(console.error);
}

export {
  manualTracingExample,
  convenienceFunctionsExample,
  UserService,
  errorHandlingExample,
  samplingExample,
  batchProcessingExample,
};

