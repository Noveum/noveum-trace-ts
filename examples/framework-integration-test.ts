/**
 * Framework Integration Test for Noveum Trace TypeScript SDK
 * Tests Express, Next.js, and Hono integrations
 */

import { NoveumClient } from '../src/index.js';

// Mock HTTP request/response objects for testing
interface MockRequest {
  method: string;
  url: string;
  path: string;
  headers: Record<string, string>;
  get: (name: string) => string | undefined;
  on: (event: string, callback: () => void) => void;
}

interface MockResponse {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (data?: string) => void;
  finished: boolean;
}

function createMockRequest(options: Partial<MockRequest> = {}): MockRequest {
  return {
    method: 'GET',
    url: '/api/test',
    path: '/api/test',
    headers: {
      'user-agent': 'test-client/1.0',
      'host': 'localhost:3000'
    },
    get: (name: string) => {
      return {
        'host': 'localhost:3000',
        'user-agent': 'test-client/1.0'
      }[name.toLowerCase()];
    },
    on: () => {},
    ...options
  };
}

function createMockResponse(): MockResponse {
  return {
    statusCode: 200,
    finished: false,
    setHeader: () => {},
    end: function(data?: string) {
      this.finished = true;
      if (data) console.log('Response:', data);
    }
  };
}

async function testExpressIntegration() {
  console.log('🧪 Testing Express.js Integration');
  
  try {
    // Import Express integration
    const { noveumMiddleware } = await import('../src/integrations/express.js');
    
    const client = new NoveumClient({
      apiKey: 'test-api-key',
      project: 'express-test',
      environment: 'test',
      debug: true
    });
    
    // Create middleware
    const middleware = noveumMiddleware(client, {
      captureHeaders: true,
      captureBody: true,
      getSpanName: (req: any) => `${req.method} ${req.path}`
    });
    
    console.log('✅ Express middleware created');
    
    // Simulate middleware usage
    const req = createMockRequest({
      method: 'POST',
      path: '/api/users',
      url: '/api/users'
    });
    const res = createMockResponse();
    
    // Test middleware execution
    await new Promise<void>((resolve) => {
      const next = () => {
        console.log('✅ Express middleware executed successfully');
        resolve();
      };
      
      middleware(req as any, res as any, next);
    });
    
    await client.shutdown();
    return true;
    
  } catch (error) {
    console.error('❌ Express integration failed:', error.message);
    return false;
  }
}

async function testNextJSIntegration() {
  console.log('\n🧪 Testing Next.js Integration');
  
  try {
    // Import Next.js integration
    const { withNoveumTracing } = await import('../src/integrations/nextjs.js');
    
    const client = new NoveumClient({
      apiKey: 'test-api-key',
      project: 'nextjs-test',
      environment: 'test',
      debug: true
    });
    
    // Create a mock API handler
    const originalHandler = async (request: any) => {
      console.log('Processing Next.js API request:', request.url);
      return new Promise(resolve => {
        setTimeout(() => {
          resolve({
            json: () => ({ message: 'Success', data: { id: 123 } })
          });
        }, 50);
      });
    };
    
    // Wrap with tracing
    const tracedHandler = withNoveumTracing(originalHandler, {
      client,
      getSpanName: () => 'nextjs-api-handler'
    });
    
    console.log('✅ Next.js handler wrapped with tracing');
    
    // Simulate request
    const mockNextRequest = {
      url: '/api/data',
      method: 'GET',
      headers: new Map([
        ['user-agent', 'next-client/1.0'],
        ['host', 'localhost:3000']
      ]),
      json: async () => ({ query: 'test' })
    };
    
    const response = await tracedHandler(mockNextRequest);
    console.log('✅ Next.js traced handler executed successfully');
    
    await client.shutdown();
    return true;
    
  } catch (error) {
    console.error('❌ Next.js integration failed:', error.message);
    return false;
  }
}

async function testHonoIntegration() {
  console.log('\n🧪 Testing Hono Integration');
  
  try {
    // Import Hono integration
    const { noveumMiddleware } = await import('../src/integrations/hono.js');
    
    const client = new NoveumClient({
      apiKey: 'test-api-key',
      project: 'hono-test',
      environment: 'test',
      debug: true
    });
    
    // Create Hono middleware
    const middleware = noveumMiddleware({ client });
    
    console.log('✅ Hono middleware created');
    
    // Mock Hono context
    const mockHonoContext = {
      req: {
        method: 'GET',
        url: 'https://localhost:8000/api/health',
        path: '/api/health',
        header: (name: string) => {
          const headers: Record<string, string> = {
            'user-agent': 'hono-client/1.0',
            'host': 'localhost:8000'
          };
          return headers[name.toLowerCase()];
        }
      },
      res: {
        status: 200,
        headers: new Map()
      },
      set: () => {},
      json: (data: any) => {
        console.log('Hono response:', data);
        return Promise.resolve(data);
      }
    };
    
    // Test middleware execution
    await new Promise<void>((resolve) => {
      const next = async () => {
        console.log('✅ Hono middleware executed successfully');
        resolve();
      };
      
      middleware(mockHonoContext as any, next);
    });
    
    await client.shutdown();
    return true;
    
  } catch (error) {
    console.error('❌ Hono integration failed:', error.message);
    return false;
  }
}

async function runFrameworkIntegrationTests() {
  console.log('🚀 Running Framework Integration Tests\n');
  
  const results = {
    express: await testExpressIntegration(),
    nextjs: await testNextJSIntegration(),
    hono: await testHonoIntegration()
  };
  
  console.log('\n📊 Framework Integration Results:');
  console.log('=' .repeat(40));
  console.log(`Express.js: ${results.express ? '✅ Working' : '❌ Failed'}`);
  console.log(`Next.js:    ${results.nextjs ? '✅ Working' : '❌ Failed'}`);
  console.log(`Hono:       ${results.hono ? '✅ Working' : '❌ Failed'}`);
  
  const successful = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;
  
  console.log(`\nOverall: ${successful}/${total} integrations working (${Math.round(successful/total*100)}%)`);
  
  if (successful === total) {
    console.log('🎉 All framework integrations are working!');
  }
  
  return results;
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runFrameworkIntegrationTests().catch(console.error);
}

export { runFrameworkIntegrationTests };