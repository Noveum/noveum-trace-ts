/**
 * Express.js Server Example with Noveum Trace Integration
 * 
 * This example demonstrates how to integrate Noveum Trace with an Express.js server
 * for automatic HTTP request tracing and custom business logic tracing.
 */

import express from 'express';
import { initializeClient, span, trace } from '@noveum/trace';
import { noveumMiddleware, noveumErrorMiddleware } from '@noveum/trace/integrations/express';

// Initialize Noveum client
const client = initializeClient({
  apiKey: process.env.NOVEUM_API_KEY || 'your-api-key',
  project: 'express-example',
  environment: process.env.NODE_ENV || 'development',
  endpoint: 'https://api.noveum.ai/api/v1/traces',
});

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Add Noveum tracing middleware
app.use(noveumMiddleware({
  client,
  captureRequest: true,
  captureResponse: true,
  ignoreRoutes: ['/health', '/metrics'],
  getSpanName: (req) => `${req.method} ${req.route?.path || req.path}`,
  getAttributes: (req) => ({
    'http.user_agent': req.get('User-Agent') || '',
    'http.remote_addr': req.ip,
    'express.route': req.route?.path,
  }),
}));

/**
 * Simulated database service with tracing
 */
class DatabaseService {
  @span('db-find-user', { captureArgs: true, captureReturn: true })
  async findUser(id: string) {
    // Simulate database query
    await new Promise(resolve => setTimeout(resolve, 50));
    
    if (id === '404') {
      return null;
    }
    
    return {
      id,
      name: `User ${id}`,
      email: `user${id}@example.com`,
      createdAt: new Date(),
    };
  }

  @span('db-create-user', { captureArgs: true })
  async createUser(userData: { name: string; email: string }) {
    // Simulate database insert
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return {
      id: Math.random().toString(36).substr(2, 9),
      ...userData,
      createdAt: new Date(),
    };
  }

  @span('db-update-user', { captureArgs: true })
  async updateUser(id: string, updates: Partial<{ name: string; email: string }>) {
    // Simulate database update
    await new Promise(resolve => setTimeout(resolve, 75));
    
    if (id === '404') {
      throw new Error('User not found');
    }
    
    return {
      id,
      name: updates.name || `User ${id}`,
      email: updates.email || `user${id}@example.com`,
      updatedAt: new Date(),
    };
  }
}

/**
 * Business logic service with tracing
 */
class UserService {
  constructor(private db: DatabaseService) {}

  @trace('user-service-get-user')
  async getUser(id: string) {
    const user = await this.db.findUser(id);
    
    if (!user) {
      throw new Error(`User with id ${id} not found`);
    }
    
    // Add some business logic
    await this.logUserAccess(id);
    
    return user;
  }

  @trace('user-service-create-user')
  async createUser(userData: { name: string; email: string }) {
    // Validate input
    await this.validateUserData(userData);
    
    // Create user
    const user = await this.db.createUser(userData);
    
    // Send welcome email (simulated)
    await this.sendWelcomeEmail(user);
    
    return user;
  }

  @span('validate-user-data')
  private async validateUserData(userData: { name: string; email: string }) {
    if (!userData.name || userData.name.length < 2) {
      throw new Error('Name must be at least 2 characters long');
    }
    
    if (!userData.email || !userData.email.includes('@')) {
      throw new Error('Valid email is required');
    }
    
    // Simulate validation delay
    await new Promise(resolve => setTimeout(resolve, 25));
  }

  @span('send-welcome-email')
  private async sendWelcomeEmail(user: any) {
    // Simulate email sending
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log(`Welcome email sent to ${user.email}`);
  }

  @span('log-user-access')
  private async logUserAccess(userId: string) {
    // Simulate logging
    await new Promise(resolve => setTimeout(resolve, 10));
    console.log(`User ${userId} accessed`);
  }
}

// Initialize services
const dbService = new DatabaseService();
const userService = new UserService(dbService);

/**
 * Routes
 */

// Health check endpoint (not traced due to ignoreRoutes)
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Get user by ID
app.get('/users/:id', async (req, res) => {
  try {
    const user = await userService.getUser(req.params.id);
    res.json(user);
  } catch (error) {
    res.status(404).json({ 
      error: error instanceof Error ? error.message : 'User not found' 
    });
  }
});

// Create new user
app.post('/users', async (req, res) => {
  try {
    const user = await userService.createUser(req.body);
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ 
      error: error instanceof Error ? error.message : 'Invalid user data' 
    });
  }
});

// Update user
app.put('/users/:id', async (req, res) => {
  try {
    const user = await dbService.updateUser(req.params.id, req.body);
    res.json(user);
  } catch (error) {
    res.status(404).json({ 
      error: error instanceof Error ? error.message : 'User not found' 
    });
  }
});

// Simulate a slow endpoint
app.get('/slow', async (req, res) => {
  const delay = parseInt(req.query.delay as string) || 1000;
  
  await trace('slow-operation', async (traceInstance) => {
    traceInstance.setAttribute('delay.ms', delay);
    traceInstance.setAttribute('operation.type', 'simulated_slow');
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    traceInstance.addEvent('operation-completed', {
      'completion.time': new Date().toISOString(),
    });
  });
  
  res.json({ 
    message: `Completed after ${delay}ms`,
    timestamp: new Date().toISOString() 
  });
});

// Simulate an error endpoint
app.get('/error', async (req, res) => {
  const errorType = req.query.type as string || 'generic';
  
  await trace('error-simulation', async (traceInstance) => {
    traceInstance.setAttribute('error.type', errorType);
    
    switch (errorType) {
      case 'timeout':
        await new Promise(resolve => setTimeout(resolve, 100));
        throw new Error('Operation timed out');
      
      case 'validation':
        throw new Error('Validation failed');
      
      case 'database':
        throw new Error('Database connection failed');
      
      default:
        throw new Error('Generic error occurred');
    }
  });
});

// Complex endpoint with multiple operations
app.post('/complex-operation', async (req, res) => {
  const { steps = 3, delay = 100 } = req.body;
  
  const result = await trace('complex-operation', async (traceInstance) => {
    traceInstance.setAttribute('operation.steps', steps);
    traceInstance.setAttribute('operation.delay_per_step', delay);
    
    const results = [];
    
    for (let i = 1; i <= steps; i++) {
      const stepResult = await span(`step-${i}`, async (spanInstance) => {
        spanInstance.setAttribute('step.number', i);
        spanInstance.setAttribute('step.total', steps);
        
        // Simulate work
        await new Promise(resolve => setTimeout(resolve, delay));
        
        const result = {
          step: i,
          result: `Step ${i} completed`,
          timestamp: new Date().toISOString(),
        };
        
        spanInstance.addEvent('step-completed', {
          'step.result': result.result,
        });
        
        return result;
      });
      
      results.push(stepResult);
    }
    
    traceInstance.addEvent('all-steps-completed', {
      'total.steps': steps,
      'total.duration_ms': steps * delay,
    });
    
    return results;
  });
  
  res.json({
    success: true,
    results: result,
    summary: {
      totalSteps: steps,
      totalTime: steps * delay,
    },
  });
});

// Add error handling middleware (should be last)
app.use(noveumErrorMiddleware({
  client,
  captureStackTrace: true,
}));

// Global error handler
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined,
  });
});

/**
 * Server startup and shutdown
 */
const server = app.listen(port, () => {
  console.log(`🚀 Express server running on port ${port}`);
  console.log(`📊 Noveum tracing enabled for project: ${client.getConfig().project}`);
  console.log(`\nTry these endpoints:`);
  console.log(`  GET  http://localhost:${port}/health`);
  console.log(`  GET  http://localhost:${port}/users/123`);
  console.log(`  POST http://localhost:${port}/users`);
  console.log(`  GET  http://localhost:${port}/slow?delay=2000`);
  console.log(`  GET  http://localhost:${port}/error?type=timeout`);
  console.log(`  POST http://localhost:${port}/complex-operation`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 Received SIGTERM, shutting down gracefully...');
  
  server.close(async () => {
    console.log('📡 HTTP server closed');
    
    try {
      await client.flush();
      await client.shutdown();
      console.log('📊 Noveum client shutdown completed');
    } catch (error) {
      console.error('❌ Error during Noveum client shutdown:', error);
    }
    
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('🔄 Received SIGINT, shutting down gracefully...');
  
  server.close(async () => {
    console.log('📡 HTTP server closed');
    
    try {
      await client.flush();
      await client.shutdown();
      console.log('📊 Noveum client shutdown completed');
    } catch (error) {
      console.error('❌ Error during Noveum client shutdown:', error);
    }
    
    process.exit(0);
  });
});

export { app, server, client, userService, dbService };

