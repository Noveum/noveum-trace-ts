import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NoveumClient } from '../src/core/client.js';
import type { NoveumClientOptions } from '../src/core/types.js';

// Mock Express types for testing
interface MockRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: any;
}

interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  send: (body: any) => MockResponse;
  json: (body: any) => MockResponse;
  status: (code: number) => MockResponse;
}

interface MockNext {
  (): void;
}

describe('Framework Integrations', () => {
  let client: NoveumClient;
  const mockOptions: Partial<NoveumClientOptions> = {
    apiKey: 'test-api-key',
    project: 'test-project',
    environment: 'test',
    enabled: true,
  };

  beforeEach(() => {
    client = new NoveumClient(mockOptions);
  });

  afterEach(async () => {
    await client.shutdown();
  });

  describe('Express Integration', () => {
    it('should create middleware function', async () => {
      // Import the Express integration
      const { noveumMiddleware } = await import('../src/integrations/express.js');
      
      const middleware = noveumMiddleware({ client });
      expect(typeof middleware).toBe('function');
    });

    it('should trace HTTP requests', async () => {
      const { noveumMiddleware } = await import('../src/integrations/express.js');
      
      const middleware = noveumMiddleware({ client });
      
      const mockReq: MockRequest = {
        method: 'GET',
        url: '/api/test',
        headers: { 'user-agent': 'test-agent' },
      };
      
      const mockRes: MockResponse = {
        statusCode: 200,
        headers: {},
        send: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        status: vi.fn().mockReturnThis(),
      };
      
      const mockNext: MockNext = vi.fn();
      
      await new Promise<void>((resolve) => {
        middleware(mockReq as any, mockRes as any, () => {
          mockNext();
          resolve();
        });
      });
      
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle errors in middleware', async () => {
      const { noveumMiddleware } = await import('../src/integrations/express.js');
      
      const middleware = noveumMiddleware({ client });
      
      const mockReq: MockRequest = {
        method: 'GET',
        url: '/api/error',
        headers: {},
      };
      
      const mockRes: MockResponse = {
        statusCode: 500,
        headers: {},
        send: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        status: vi.fn().mockReturnThis(),
      };
      
      const mockNext: MockNext = vi.fn(() => {
        throw new Error('Test error');
      });
      
      await new Promise<void>((resolve) => {
        try {
          middleware(mockReq as any, mockRes as any, mockNext);
        } catch (error) {
          // Error should be handled by middleware
        }
        resolve();
      });
    });
  });

  describe('Next.js Integration', () => {
    it('should create middleware for App Router', async () => {
      const { withNoveumTracing } = await import('../src/integrations/nextjs.js');
      
      const handler = withNoveumTracing(
        async () => new Response('Hello World'),
        { client }
      );
      
      expect(typeof handler).toBe('function');
    });

    it('should trace API routes', async () => {
      const { withNoveumTracing } = await import('../src/integrations/nextjs.js');
      
      const mockHandler = vi.fn().mockResolvedValue(new Response('Success'));
      const tracedHandler = withNoveumTracing(mockHandler, { client });
      
      const mockRequest = new Request('https://example.com/api/test');
      const response = await tracedHandler(mockRequest);
      
      expect(mockHandler).toHaveBeenCalledWith(mockRequest);
      expect(response).toBeInstanceOf(Response);
    });

    it('should handle Pages API routes', async () => {
      const { withNoveumPagesTracing } = await import('../src/integrations/nextjs.js');
      
      const mockHandler = vi.fn().mockImplementation((req, res) => {
        res.status(200).json({ success: true });
      });
      
      const tracedHandler = withNoveumPagesTracing(mockHandler, { client });
      
      const mockReq = {
        method: 'GET',
        url: '/api/test',
        headers: {},
      };
      
      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
      };
      
      await tracedHandler(mockReq as any, mockRes as any);
      
      expect(mockHandler).toHaveBeenCalledWith(mockReq, mockRes);
    });
  });

  describe('Hono Integration', () => {
    it('should create middleware function', async () => {
      const { noveumMiddleware } = await import('../src/integrations/hono.js');
      
      const middleware = noveumMiddleware({ client });
      expect(typeof middleware).toBe('function');
    });

    it('should trace Hono requests', async () => {
      const { noveumMiddleware } = await import('../src/integrations/hono.js');
      
      const middleware = noveumMiddleware({ client });
      
      const mockContext = {
        req: {
          method: 'GET',
          url: 'https://example.com/api/test',
          header: vi.fn().mockReturnValue('test-agent'),
          routePath: '/api/test',
        },
        res: {
          status: 200,
          headers: new Map(),
        },
      };
      
      const mockNext = vi.fn().mockResolvedValue(undefined);
      
      await middleware(mockContext as any, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle Hono errors', async () => {
      const { noveumMiddleware } = await import('../src/integrations/hono.js');
      
      const middleware = noveumMiddleware({ client });
      
      const mockContext = {
        req: {
          method: 'GET',
          url: 'https://example.com/api/error',
          header: vi.fn().mockReturnValue('test-agent'),
          routePath: '/api/error',
        },
        res: {
          status: 500,
          headers: new Map(),
        },
      };
      
      const mockNext = vi.fn().mockRejectedValue(new Error('Hono error'));
      
      await expect(middleware(mockContext as any, mockNext)).resolves.not.toThrow();
    });

    it('should create traced handler', async () => {
      const { traced } = await import('../src/integrations/hono.js');
      
      const mockHandler = vi.fn().mockResolvedValue(new Response('Success'));
      const tracedHandler = traced(mockHandler, 'test-operation', { client });
      
      const mockContext = {
        req: {
          method: 'GET',
          url: 'https://example.com/api/test',
          header: vi.fn(),
          routePath: '/api/test',
        },
      };
      
      const result = await tracedHandler(mockContext as any);
      
      expect(mockHandler).toHaveBeenCalledWith(mockContext);
      expect(result).toBeInstanceOf(Response);
    });
  });

  describe('Integration Error Handling', () => {
    it('should handle disabled client gracefully', async () => {
      const disabledClient = new NoveumClient({
        ...mockOptions,
        enabled: false,
      });

      const { noveumMiddleware } = await import('../src/integrations/express.js');
      const middleware = noveumMiddleware({ client: disabledClient });
      
      const mockReq = { method: 'GET', url: '/test', headers: {} };
      const mockRes = { statusCode: 200, headers: {} };
      const mockNext = vi.fn();
      
      await new Promise<void>((resolve) => {
        middleware(mockReq as any, mockRes as any, () => {
          mockNext();
          resolve();
        });
      });
      
      expect(mockNext).toHaveBeenCalled();
      await disabledClient.shutdown();
    });

    it('should handle missing client', async () => {
      const { noveumMiddleware } = await import('../src/integrations/express.js');
      
      // Should not throw when client is undefined
      expect(() => noveumMiddleware({})).not.toThrow();
    });
  });
});

