/**
 * Next.js Application Example with Noveum Trace Integration
 * 
 * This example demonstrates how to integrate Noveum Trace with Next.js
 * for both App Router and Pages API routes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { initializeClient } from '@noveum/trace';
import { 
  withNoveumTracing, 
  withNoveumPagesTracing,
  noveumMiddleware 
} from '@noveum/trace/integrations/nextjs';

// Initialize Noveum client
const client = initializeClient({
  apiKey: process.env.NOVEUM_API_KEY || 'your-api-key',
  project: 'nextjs-example',
  environment: process.env.NODE_ENV || 'development',
  endpoint: 'https://api.noveum.ai/api/v1/traces',
});

/**
 * App Router Examples (app directory)
 */

// app/api/users/route.ts
export const GET = withNoveumTracing(
  async (request: NextRequest) => {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');

    // Simulate database query
    await new Promise(resolve => setTimeout(resolve, 100));

    const users = Array.from({ length: limit }, (_, i) => ({
      id: (page - 1) * limit + i + 1,
      name: `User ${(page - 1) * limit + i + 1}`,
      email: `user${(page - 1) * limit + i + 1}@example.com`,
    }));

    return NextResponse.json({
      users,
      pagination: {
        page,
        limit,
        total: 100,
        pages: Math.ceil(100 / limit),
      },
    });
  },
  {
    client,
    spanName: 'get-users',
    captureRequest: true,
    captureResponse: true,
    attributes: {
      'api.version': 'v1',
      'api.type': 'rest',
    },
  }
);

// app/api/users/[id]/route.ts
export const getUserById = withNoveumTracing(
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    const userId = params.id;

    // Simulate user lookup
    await new Promise(resolve => setTimeout(resolve, 50));

    if (userId === '404') {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const user = {
      id: userId,
      name: `User ${userId}`,
      email: `user${userId}@example.com`,
      profile: {
        bio: `This is user ${userId}'s bio`,
        joinedAt: new Date().toISOString(),
      },
    };

    return NextResponse.json(user);
  },
  {
    client,
    spanName: 'get-user-by-id',
    captureRequest: true,
    getAttributes: (request, context) => ({
      'user.id': context?.params?.id,
      'request.path': new URL(request.url).pathname,
    }),
  }
);

// app/api/users/route.ts (POST)
export const POST = withNoveumTracing(
  async (request: NextRequest) => {
    const body = await request.json();

    // Validate input
    if (!body.name || !body.email) {
      return NextResponse.json(
        { error: 'Name and email are required' },
        { status: 400 }
      );
    }

    // Simulate user creation
    await new Promise(resolve => setTimeout(resolve, 150));

    const newUser = {
      id: Math.random().toString(36).substr(2, 9),
      name: body.name,
      email: body.email,
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json(newUser, { status: 201 });
  },
  {
    client,
    spanName: 'create-user',
    captureRequest: true,
    captureResponse: true,
    attributes: {
      'operation.type': 'create',
      'api.version': 'v1',
    },
  }
);

/**
 * Pages API Examples (pages/api directory)
 */

// pages/api/health.ts
export const healthCheck = withNoveumPagesTracing(
  async (req, res) => {
    const startTime = Date.now();

    // Simulate health checks
    await new Promise(resolve => setTimeout(resolve, 25));

    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      responseTime: Date.now() - startTime,
      version: process.env.npm_package_version || '1.0.0',
    };

    res.status(200).json(healthData);
  },
  {
    client,
    spanName: 'health-check',
    attributes: {
      'health.check': true,
      'api.type': 'health',
    },
  }
);

// pages/api/products/[id].ts
export const getProduct = withNoveumPagesTracing(
  async (req, res) => {
    const { id } = req.query;

    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Simulate product lookup
    await new Promise(resolve => setTimeout(resolve, 75));

    if (id === '404') {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = {
      id,
      name: `Product ${id}`,
      price: Math.floor(Math.random() * 1000) + 10,
      category: 'Electronics',
      inStock: Math.random() > 0.2,
    };

    res.status(200).json(product);
  },
  {
    client,
    spanName: 'get-product',
    captureRequest: true,
    getAttributes: (req) => ({
      'product.id': req.query.id,
      'request.method': req.method,
    }),
  }
);

// pages/api/search.ts
export const searchProducts = withNoveumPagesTracing(
  async (req, res) => {
    const { q: query, category, minPrice, maxPrice } = req.query;

    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Simulate search
    await new Promise(resolve => setTimeout(resolve, 200));

    const results = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      name: `${query} Product ${i + 1}`,
      price: Math.floor(Math.random() * 500) + 50,
      category: category || 'General',
      relevance: Math.random(),
    }));

    res.status(200).json({
      query,
      results,
      total: results.length,
      filters: {
        category,
        minPrice,
        maxPrice,
      },
    });
  },
  {
    client,
    spanName: 'search-products',
    captureRequest: true,
    getAttributes: (req) => ({
      'search.query': req.query.q,
      'search.category': req.query.category,
      'search.has_price_filter': !!(req.query.minPrice || req.query.maxPrice),
    }),
  }
);

/**
 * Middleware Example (middleware.ts)
 */
export const middleware = noveumMiddleware({
  client,
  matcher: [
    '/api/:path*',
    '/dashboard/:path*',
  ],
  skipPaths: [
    '/api/health',
    '/api/metrics',
  ],
  getSpanName: (request) => {
    const url = new URL(request.url);
    return `middleware ${url.pathname}`;
  },
  getAttributes: (request) => ({
    'middleware.pathname': new URL(request.url).pathname,
    'middleware.method': request.method,
    'middleware.user_agent': request.headers.get('user-agent') || '',
  }),
});

/**
 * Server-Side Rendering Example
 */

// pages/users/[id].tsx
import { GetServerSideProps } from 'next';
import { trace, span } from '@noveum/trace';

interface User {
  id: string;
  name: string;
  email: string;
  posts: Array<{ id: string; title: string; content: string }>;
}

interface UserPageProps {
  user: User | null;
  error?: string;
}

export const getServerSideProps: GetServerSideProps<UserPageProps> = async (context) => {
  const { id } = context.params!;

  return await trace('ssr-get-user-page', async (traceInstance) => {
    traceInstance.setAttribute('page.type', 'user-detail');
    traceInstance.setAttribute('user.id', id as string);

    try {
      // Fetch user data
      const user = await span('fetch-user-data', async (spanInstance) => {
        spanInstance.setAttribute('user.id', id as string);
        
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (id === '404') {
          return null;
        }

        return {
          id: id as string,
          name: `User ${id}`,
          email: `user${id}@example.com`,
          posts: [],
        };
      });

      if (!user) {
        return {
          props: {
            user: null,
            error: 'User not found',
          },
        };
      }

      // Fetch user posts
      const posts = await span('fetch-user-posts', async (spanInstance) => {
        spanInstance.setAttribute('user.id', id as string);
        
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 75));
        
        return Array.from({ length: 3 }, (_, i) => ({
          id: `post-${i + 1}`,
          title: `Post ${i + 1} by ${user.name}`,
          content: `This is the content of post ${i + 1}`,
        }));
      });

      user.posts = posts;

      traceInstance.addEvent('user-page-data-loaded', {
        'user.id': user.id,
        'posts.count': posts.length,
      });

      return {
        props: {
          user,
        },
      };

    } catch (error) {
      traceInstance.setStatus('ERROR', error instanceof Error ? error.message : 'Unknown error');
      
      return {
        props: {
          user: null,
          error: 'Failed to load user data',
        },
      };
    }
  });
};

/**
 * API Route with Complex Business Logic
 */

// pages/api/analytics/report.ts
export const generateReport = withNoveumPagesTracing(
  async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { startDate, endDate, metrics } = req.body;

    const report = await trace('generate-analytics-report', async (traceInstance) => {
      traceInstance.setAttribute('report.start_date', startDate);
      traceInstance.setAttribute('report.end_date', endDate);
      traceInstance.setAttribute('report.metrics', metrics.join(','));

      const reportData: any = {};

      // Generate each metric
      for (const metric of metrics) {
        reportData[metric] = await span(`generate-${metric}-metric`, async (spanInstance) => {
          spanInstance.setAttribute('metric.name', metric);
          
          // Simulate metric calculation
          const delay = Math.floor(Math.random() * 200) + 100;
          await new Promise(resolve => setTimeout(resolve, delay));
          
          const value = Math.floor(Math.random() * 10000);
          
          spanInstance.setAttribute('metric.value', value);
          spanInstance.setAttribute('metric.calculation_time_ms', delay);
          
          return {
            value,
            trend: Math.random() > 0.5 ? 'up' : 'down',
            change: (Math.random() * 20 - 10).toFixed(2) + '%',
          };
        });
      }

      traceInstance.addEvent('report-generated', {
        'report.metrics_count': metrics.length,
        'report.total_data_points': Object.keys(reportData).length,
      });

      return {
        id: Math.random().toString(36).substr(2, 9),
        startDate,
        endDate,
        generatedAt: new Date().toISOString(),
        data: reportData,
      };
    });

    res.status(200).json(report);
  },
  {
    client,
    spanName: 'analytics-report',
    captureRequest: true,
    captureResponse: true,
    attributes: {
      'api.type': 'analytics',
      'operation.type': 'report_generation',
    },
  }
);

/**
 * Error Handling Example
 */

// pages/api/error-test.ts
export const errorTest = withNoveumPagesTracing(
  async (req, res) => {
    const { type } = req.query;

    switch (type) {
      case 'timeout':
        await new Promise(resolve => setTimeout(resolve, 5000));
        break;
      
      case 'validation':
        throw new Error('Validation failed: Invalid input data');
      
      case 'database':
        throw new Error('Database connection timeout');
      
      case 'external':
        // Simulate external API failure
        await new Promise((_, reject) => 
          setTimeout(() => reject(new Error('External API unavailable')), 100)
        );
        break;
      
      default:
        throw new Error('Unknown error type');
    }

    res.status(200).json({ success: true });
  },
  {
    client,
    spanName: 'error-test',
    attributes: {
      'test.type': 'error_simulation',
    },
    onError: (error, req) => {
      console.error(`Error in error-test API: ${error.message}`);
      return {
        'error.simulated': true,
        'error.type': req.query.type,
      };
    },
  }
);

export {
  client,
  GET,
  POST,
  getUserById,
  healthCheck,
  getProduct,
  searchProducts,
  generateReport,
  errorTest,
};

