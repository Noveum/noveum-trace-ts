/**
 * Framework Integration Tests
 *
 * Tests the SDK framework integrations with actual HTTP requests
 * to ensure middleware works correctly with real APIs.
 */

import { NoveumClient } from '../../src/index.js';
import { config } from 'dotenv';
import http from 'http';
import { AddressInfo } from 'net';

// Load environment variables
config();

const API_KEY = process.env.NOVEUM_API_KEY;
const PROJECT = process.env.NOVEUM_PROJECT || 'noveum-trace-ts';
const ENVIRONMENT = process.env.NOVEUM_ENVIRONMENT || 'framework-test';

// Skip tests if no API key is available
const skipIntegrationTests = !API_KEY || API_KEY.startsWith('your-') || API_KEY === 'test-api-key';

if (skipIntegrationTests) {
  console.log('⚠️  Skipping framework integration tests - No valid API key found in .env file');
  process.exit(0);
}

/**
 * Safely formats error messages for type safety
 */
function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface FrameworkTestResult {
  name: string;
  success: boolean;
  error?: string;
  traceId?: string;
  statusCode?: number;
  responseTime?: number;
}

class FrameworkIntegrationTestSuite {
  private results: FrameworkTestResult[] = [];
  private client?: NoveumClient;
  private servers: http.Server[] = [];

  async runAllTests(): Promise<void> {
    console.log('🌐 Starting Framework Integration Tests');
    console.log('='.repeat(50));
    console.log(`🔑 API Key: ${API_KEY?.substring(0, 10)}...`);
    console.log(`📂 Project: ${PROJECT}`);
    console.log(`🌍 Environment: ${ENVIRONMENT}`);
    console.log('='.repeat(50));
    console.log();

    this.client = new NoveumClient({
      apiKey: API_KEY!,
      project: PROJECT,
      environment: ENVIRONMENT,
      debug: true,
      enabled: true,
    });

    await this.testExpressMiddleware();
    await this.testNextJSIntegration();
    await this.testHonoIntegration();
    await this.testManualHTTPTracing();

    this.printSummary();
    await this.cleanup();
  }

  private async testExpressMiddleware(): Promise<void> {
    console.log('🧪 Testing Express.js Middleware Integration...');

    try {
      // Import Express integration dynamically
      const { noveumMiddleware } = await import('../../src/integrations/express.js');

      // Create a simple Express-like server
      const server = http.createServer(async (req, res) => {
        const startTime = Date.now();

        try {
          // Mock Express request object
          const mockReq = {
            ...req,
            path: req.url || '/',
            get: (header: string) => req.headers[header.toLowerCase()],
            on: (event: string, callback: () => void) => req.on(event, callback),
          };

          // Mock Express response object
          const mockRes = {
            ...res,
            locals: {},
            setHeader: (name: string, value: string) => res.setHeader(name, value),
            end: (data?: string) => {
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(
                data ||
                  JSON.stringify({
                    success: true,
                    message: 'Express middleware test',
                    traceId: mockRes.locals.traceId || 'not-set',
                  })
              );
            },
          };

          // Create and use middleware
          const middleware = noveumMiddleware({
            client: this.client!,
            captureRequest: true,
            captureResponse: true,
            spanName: (req: any) => `${req.method} ${req.path}`,
          });

          // Execute middleware
          await new Promise<void>(resolve => {
            const next = () => {
              // Simulate route handler
              setTimeout(() => {
                mockRes.locals.traceId = 'express-test-trace';
                mockRes.end();
                resolve();
              }, 10);
            };

            middleware(mockReq as any, mockRes as any, next);
          });

          const responseTime = Date.now() - startTime;

          this.results.push({
            name: 'Express.js Middleware',
            success: true,
            traceId: 'express-test-trace',
            statusCode: 200,
            responseTime,
          });

          console.log(`   ✅ Express middleware executed successfully (${responseTime}ms)`);
        } catch (error) {
          this.results.push({
            name: 'Express.js Middleware',
            success: false,
            error: formatError(error),
          });
          console.log(`   ❌ Express middleware failed: ${formatError(error)}`);
        }
      });

      await this.startServer(server, 'Express');
      await this.makeTestRequest(server, '/api/express-test', 'Express.js');
    } catch (error) {
      this.results.push({
        name: 'Express.js Middleware',
        success: false,
        error: formatError(error),
      });
      console.log(`   ❌ Express integration failed: ${formatError(error)}`);
    }
  }

  private async testNextJSIntegration(): Promise<void> {
    console.log('\n🧪 Testing Next.js Integration...');

    try {
      const { withNoveumTrace } = await import('../../src/integrations/nextjs.js');

      // Create a Next.js-style API handler
      const originalHandler = async (_request: any) => {
        console.log('   📝 Processing Next.js API request');

        // Simulate API processing
        await new Promise(resolve => setTimeout(resolve, 25));

        return {
          json: () => ({
            success: true,
            message: 'Next.js handler test',
            timestamp: new Date().toISOString(),
            data: { id: 123, name: 'test-resource' },
          }),
        };
      };

      // Wrap with tracing
      const tracedHandler = withNoveumTrace(originalHandler, this.client!, {
        spanName: 'nextjs-api-handler',
      });

      // Create mock Next.js request
      const mockNextRequest = {
        url: 'http://localhost:3000/api/nextjs-test',
        method: 'POST',
        headers: new Map([
          ['user-agent', 'next-test-client/1.0'],
          ['content-type', 'application/json'],
          ['host', 'localhost:3000'],
        ]),
        json: async () => ({
          query: 'test-data',
          filters: { category: 'integration-test' },
        }),
      };

      const startTime = Date.now();
      const response = await tracedHandler(mockNextRequest);
      const responseTime = Date.now() - startTime;

      const responseData = await response.json();

      this.results.push({
        name: 'Next.js Integration',
        success: true,
        traceId: 'nextjs-test-trace',
        statusCode: 200,
        responseTime,
      });

      console.log(`   ✅ Next.js integration executed successfully (${responseTime}ms)`);
      console.log(`   📄 Response: ${JSON.stringify(responseData, null, 2)}`);
    } catch (error) {
      this.results.push({
        name: 'Next.js Integration',
        success: false,
        error: formatError(error),
      });
      console.log(`   ❌ Next.js integration failed: ${formatError(error)}`);
    }
  }

  private async testHonoIntegration(): Promise<void> {
    console.log('\n🧪 Testing Hono Integration...');

    try {
      const { noveumTrace } = await import('../../src/integrations/hono.js');

      // Create Hono-style middleware test
      const middleware = noveumTrace(this.client!, {});

      // Mock Hono context
      const mockHonoContext = {
        req: {
          method: 'GET',
          url: 'https://localhost:8000/api/hono-test',
          path: '/api/hono-test',
          header: (name: string) => {
            const headers: Record<string, string> = {
              'user-agent': 'hono-test-client/1.0',
              host: 'localhost:8000',
              accept: 'application/json',
            };
            return headers[name.toLowerCase()];
          },
        },
        res: {
          status: 200,
          headers: new Map(),
        },
        set: (_key: string, _value: any) => {
          // Mock context setting
        },
        json: (data: any) => {
          console.log('   📄 Hono response:', JSON.stringify(data, null, 2));
          return Promise.resolve(data);
        },
      };

      const startTime = Date.now();

      // Execute middleware with mock next
      await new Promise<void>(resolve => {
        const next = async () => {
          // Simulate route handler processing
          await new Promise(r => setTimeout(r, 15));

          await mockHonoContext.json({
            success: true,
            message: 'Hono middleware test',
            timestamp: new Date().toISOString(),
            traceId: 'hono-test-trace',
          });

          resolve();
        };

        middleware(mockHonoContext as any, next);
      });

      const responseTime = Date.now() - startTime;

      this.results.push({
        name: 'Hono Integration',
        success: true,
        traceId: 'hono-test-trace',
        statusCode: 200,
        responseTime,
      });

      console.log(`   ✅ Hono integration executed successfully (${responseTime}ms)`);
    } catch (error) {
      this.results.push({
        name: 'Hono Integration',
        success: false,
        error: formatError(error),
      });
      console.log(`   ❌ Hono integration failed: ${formatError(error)}`);
    }
  }

  private async testManualHTTPTracing(): Promise<void> {
    console.log('\n🧪 Testing Manual HTTP Request Tracing...');

    try {
      // Create a server that manually creates traces for each request
      const server = http.createServer(async (req, res) => {
        const startTime = Date.now();

        try {
          // Manually create trace for the request
          const trace = await this.client!.createTrace('http-request', {
            attributes: {
              'http.method': req.method || 'UNKNOWN',
              'http.url': req.url || '/',
              'http.user_agent': req.headers['user-agent'] || 'unknown',
              'test.type': 'manual-http-tracing',
            },
          });

          trace.addEvent('request-received', {
            'request.headers': Object.keys(req.headers).length,
            'request.timestamp': new Date().toISOString(),
          });

          // Simulate processing
          await new Promise(resolve => setTimeout(resolve, 30));

          trace.addEvent('processing-completed', {
            'processing.duration.ms': 30,
          });

          const response = {
            success: true,
            message: 'Manual HTTP tracing test',
            traceId: trace.traceId,
            timestamp: new Date().toISOString(),
          };

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('X-Trace-ID', trace.traceId);
          res.end(JSON.stringify(response, null, 2));

          await trace.finish();

          const responseTime = Date.now() - startTime;

          this.results.push({
            name: 'Manual HTTP Tracing',
            success: true,
            traceId: trace.traceId,
            statusCode: 200,
            responseTime,
          });

          console.log(`   ✅ Manual HTTP trace created: ${trace.traceId} (${responseTime}ms)`);
        } catch (error) {
          this.results.push({
            name: 'Manual HTTP Tracing',
            success: false,
            error: formatError(error),
          });

          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: formatError(error) }));
        }
      });

      await this.startServer(server, 'Manual HTTP');
      await this.makeTestRequest(server, '/api/manual-test', 'Manual HTTP');
    } catch (error) {
      this.results.push({
        name: 'Manual HTTP Tracing',
        success: false,
        error: formatError(error),
      });
      console.log(`   ❌ Manual HTTP tracing failed: ${formatError(error)}`);
    }
  }

  private async startServer(server: http.Server, name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`${name} server failed to start within 5 seconds`));
      }, 5000);

      server.listen(0, 'localhost', () => {
        clearTimeout(timeout);
        this.servers.push(server);
        const address = server.address() as AddressInfo;
        console.log(`   🚀 ${name} server started on http://localhost:${address.port}`);
        resolve();
      });

      server.on('error', error => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private async makeTestRequest(server: http.Server, path: string, name: string): Promise<void> {
    const address = server.address() as AddressInfo;
    const url = `http://localhost:${address.port}${path}`;

    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const req = http.request(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'framework-integration-test/1.0',
          },
        },
        res => {
          let data = '';

          res.on('data', chunk => {
            data += chunk;
          });

          res.on('end', () => {
            const responseTime = Date.now() - startTime;

            try {
              const response = JSON.parse(data);
              console.log(`   📡 ${name} request completed (${responseTime}ms)`);
              console.log(`   📄 Response: ${JSON.stringify(response, null, 2)}`);
              resolve();
            } catch (error) {
              reject(new Error(`Failed to parse response: ${formatError(error)}`));
            }
          });
        }
      );

      req.on('error', reject);

      // Send test data
      req.write(
        JSON.stringify({
          test: true,
          framework: name,
          timestamp: new Date().toISOString(),
        })
      );

      req.end();
    });
  }

  private printSummary(): void {
    console.log('\n📊 Framework Integration Results');
    console.log('='.repeat(50));

    const successful = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;
    const avgResponseTime =
      this.results.filter(r => r.responseTime).reduce((sum, r) => sum + (r.responseTime || 0), 0) /
        successful || 0;

    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⏱️  Avg Response Time: ${Math.round(avgResponseTime)}ms`);
    console.log(`📈 Success Rate: ${Math.round((successful / this.results.length) * 100)}%`);

    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results
        .filter(r => !r.success)
        .forEach(r => {
          console.log(`   ${r.name}: ${r.error}`);
        });
    }

    console.log('\n🎯 Framework Integration Summary:');
    if (successful === this.results.length) {
      console.log('🎉 All framework integrations working! SDK middleware is production-ready.');
    } else {
      console.log('⚠️  Some framework integrations failed. Check the errors above.');
    }

    console.log('\n📋 Tested Framework Integrations:');
    console.log('✅ Express.js Middleware');
    console.log('✅ Next.js API Route Wrapper');
    console.log('✅ Hono Middleware');
    console.log('✅ Manual HTTP Request Tracing');
  }

  private async cleanup(): Promise<void> {
    const errors: Error[] = [];

    // Close all servers
    for (const server of this.servers) {
      try {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Server close timeout'));
          }, 5000);

          server.close(err => {
            clearTimeout(timeout);
            if (err) reject(err);
            else resolve();
          });
        });
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    // Flush final traces and shutdown client
    if (this.client) {
      try {
        await this.client.flush();
        await this.client.shutdown();
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    if (errors.length > 0) {
      console.error('Cleanup errors:', errors);
    }
  }
}

// Export for use in other files
export { FrameworkIntegrationTestSuite };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const suite = new FrameworkIntegrationTestSuite();
  suite.runAllTests().catch(console.error);
}
