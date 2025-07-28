/**
 * Hono Framework Example with Noveum Trace Integration
 * 
 * This example demonstrates how to integrate Noveum Trace with Hono
 * for modern web API development with automatic tracing.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { initializeClient, trace, span } from '@noveum/trace';
import { noveumMiddleware, traced, createTracedApp } from '@noveum/trace/integrations/hono';

// Initialize Noveum client
const client = initializeClient({
  apiKey: process.env.NOVEUM_API_KEY || 'your-api-key',
  project: 'hono-example',
  environment: process.env.NODE_ENV || 'development',
  endpoint: 'https://api.noveum.ai/api/v1/traces',
});

// Create Hono app with tracing
const app = createTracedApp({
  client,
  appName: 'hono-api-server',
});

// Alternative: Create regular Hono app and add middleware
// const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', cors({
  origin: ['http://localhost:3000', 'https://yourdomain.com'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Add Noveum tracing middleware
app.use('*', noveumMiddleware({
  client,
  captureRequest: true,
  captureResponse: true,
  ignoreRoutes: ['/health', '/metrics'],
  getSpanName: (c) => {
    const method = c.req.method;
    const path = c.req.routePath || new URL(c.req.url).pathname;
    return `${method} ${path}`;
  },
  getAttributes: (c) => ({
    'http.user_agent': c.req.header('User-Agent') || '',
    'http.remote_addr': c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP') || '',
    'hono.route': c.req.routePath,
  }),
}));

/**
 * Simulated services with tracing
 */
class TaskService {
  private tasks: Array<{
    id: string;
    title: string;
    description: string;
    completed: boolean;
    createdAt: Date;
    updatedAt: Date;
  }> = [];

  constructor() {
    // Initialize with some sample tasks
    this.tasks = [
      {
        id: '1',
        title: 'Setup Noveum Trace',
        description: 'Integrate Noveum Trace SDK with Hono application',
        completed: true,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
      {
        id: '2',
        title: 'Write API documentation',
        description: 'Document all API endpoints and their usage',
        completed: false,
        createdAt: new Date('2024-01-02'),
        updatedAt: new Date('2024-01-02'),
      },
    ];
  }

  @span('task-service-get-all')
  async getAllTasks() {
    // Simulate database query
    await new Promise(resolve => setTimeout(resolve, 50));
    return [...this.tasks];
  }

  @span('task-service-get-by-id', { captureArgs: true })
  async getTaskById(id: string) {
    // Simulate database query
    await new Promise(resolve => setTimeout(resolve, 25));
    return this.tasks.find(task => task.id === id) || null;
  }

  @span('task-service-create', { captureArgs: true })
  async createTask(taskData: { title: string; description: string }) {
    // Simulate database insert
    await new Promise(resolve => setTimeout(resolve, 75));
    
    const newTask = {
      id: Math.random().toString(36).substr(2, 9),
      title: taskData.title,
      description: taskData.description,
      completed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.tasks.push(newTask);
    return newTask;
  }

  @span('task-service-update', { captureArgs: true })
  async updateTask(id: string, updates: Partial<{ title: string; description: string; completed: boolean }>) {
    // Simulate database update
    await new Promise(resolve => setTimeout(resolve, 60));
    
    const taskIndex = this.tasks.findIndex(task => task.id === id);
    if (taskIndex === -1) {
      throw new Error(`Task with id ${id} not found`);
    }
    
    this.tasks[taskIndex] = {
      ...this.tasks[taskIndex],
      ...updates,
      updatedAt: new Date(),
    };
    
    return this.tasks[taskIndex];
  }

  @span('task-service-delete', { captureArgs: true })
  async deleteTask(id: string) {
    // Simulate database delete
    await new Promise(resolve => setTimeout(resolve, 40));
    
    const taskIndex = this.tasks.findIndex(task => task.id === id);
    if (taskIndex === -1) {
      throw new Error(`Task with id ${id} not found`);
    }
    
    const deletedTask = this.tasks.splice(taskIndex, 1)[0];
    return deletedTask;
  }

  @span('task-service-search', { captureArgs: true })
  async searchTasks(query: string) {
    // Simulate search operation
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const lowercaseQuery = query.toLowerCase();
    return this.tasks.filter(task => 
      task.title.toLowerCase().includes(lowercaseQuery) ||
      task.description.toLowerCase().includes(lowercaseQuery)
    );
  }
}

const taskService = new TaskService();

/**
 * Routes
 */

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
  });
});

// Get all tasks
app.get('/tasks', traced(async (c) => {
  const tasks = await taskService.getAllTasks();
  
  return c.json({
    tasks,
    total: tasks.length,
    timestamp: new Date().toISOString(),
  });
}, 'get-all-tasks', { client }));

// Get task by ID
app.get('/tasks/:id', traced(async (c) => {
  const id = c.req.param('id');
  const task = await taskService.getTaskById(id);
  
  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }
  
  return c.json(task);
}, 'get-task-by-id', { 
  client,
  attributes: {
    'operation.type': 'read',
    'resource.type': 'task',
  },
}));

// Create new task
app.post('/tasks', traced(async (c) => {
  const body = await c.req.json();
  
  // Validate input
  if (!body.title || !body.description) {
    return c.json({ 
      error: 'Title and description are required' 
    }, 400);
  }
  
  const task = await taskService.createTask(body);
  
  return c.json(task, 201);
}, 'create-task', { 
  client,
  captureArgs: true,
  attributes: {
    'operation.type': 'create',
    'resource.type': 'task',
  },
}));

// Update task
app.put('/tasks/:id', traced(async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  
  try {
    const task = await taskService.updateTask(id, body);
    return c.json(task);
  } catch (error) {
    return c.json({ 
      error: error instanceof Error ? error.message : 'Task not found' 
    }, 404);
  }
}, 'update-task', { 
  client,
  captureArgs: true,
  attributes: {
    'operation.type': 'update',
    'resource.type': 'task',
  },
}));

// Delete task
app.delete('/tasks/:id', traced(async (c) => {
  const id = c.req.param('id');
  
  try {
    await taskService.deleteTask(id);
    return c.json({ message: 'Task deleted successfully' });
  } catch (error) {
    return c.json({ 
      error: error instanceof Error ? error.message : 'Task not found' 
    }, 404);
  }
}, 'delete-task', { 
  client,
  attributes: {
    'operation.type': 'delete',
    'resource.type': 'task',
  },
}));

// Search tasks
app.get('/search', traced(async (c) => {
  const query = c.req.query('q');
  
  if (!query) {
    return c.json({ error: 'Query parameter "q" is required' }, 400);
  }
  
  const tasks = await taskService.searchTasks(query);
  
  return c.json({
    query,
    tasks,
    total: tasks.length,
    timestamp: new Date().toISOString(),
  });
}, 'search-tasks', { 
  client,
  attributes: {
    'operation.type': 'search',
    'resource.type': 'task',
  },
}));

// Bulk operations
app.post('/tasks/bulk', traced(async (c) => {
  const body = await c.req.json();
  const { operation, taskIds, updates } = body;
  
  const result = await trace('bulk-task-operation', async (traceInstance) => {
    traceInstance.setAttribute('bulk.operation', operation);
    traceInstance.setAttribute('bulk.task_count', taskIds.length);
    
    const results = [];
    
    for (const taskId of taskIds) {
      const operationResult = await span(`bulk-${operation}-task`, async (spanInstance) => {
        spanInstance.setAttribute('task.id', taskId);
        spanInstance.setAttribute('bulk.operation', operation);
        
        try {
          let result;
          
          switch (operation) {
            case 'update':
              result = await taskService.updateTask(taskId, updates);
              break;
            case 'delete':
              result = await taskService.deleteTask(taskId);
              break;
            default:
              throw new Error(`Unsupported operation: ${operation}`);
          }
          
          spanInstance.setAttribute('operation.success', true);
          return { taskId, success: true, result };
          
        } catch (error) {
          spanInstance.setAttribute('operation.success', false);
          spanInstance.setAttribute('error.message', error instanceof Error ? error.message : 'Unknown error');
          return { 
            taskId, 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          };
        }
      });
      
      results.push(operationResult);
    }
    
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;
    
    traceInstance.addEvent('bulk-operation-completed', {
      'bulk.total_tasks': results.length,
      'bulk.successful_operations': successCount,
      'bulk.failed_operations': failureCount,
    });
    
    return {
      operation,
      total: results.length,
      successful: successCount,
      failed: failureCount,
      results,
    };
  });
  
  return c.json(result);
}, 'bulk-task-operations', { 
  client,
  captureArgs: true,
  attributes: {
    'operation.type': 'bulk',
    'resource.type': 'task',
  },
}));

// Statistics endpoint
app.get('/stats', traced(async (c) => {
  const stats = await trace('calculate-task-statistics', async (traceInstance) => {
    const tasks = await taskService.getAllTasks();
    
    const completed = tasks.filter(task => task.completed).length;
    const pending = tasks.length - completed;
    const completionRate = tasks.length > 0 ? (completed / tasks.length) * 100 : 0;
    
    // Calculate average task age
    const now = new Date();
    const averageAge = tasks.length > 0 
      ? tasks.reduce((sum, task) => sum + (now.getTime() - task.createdAt.getTime()), 0) / tasks.length
      : 0;
    
    traceInstance.addEvent('statistics-calculated', {
      'stats.total_tasks': tasks.length,
      'stats.completed_tasks': completed,
      'stats.completion_rate': completionRate,
    });
    
    return {
      total: tasks.length,
      completed,
      pending,
      completionRate: Math.round(completionRate * 100) / 100,
      averageAgeMs: Math.round(averageAge),
      averageAgeDays: Math.round(averageAge / (1000 * 60 * 60 * 24) * 100) / 100,
    };
  });
  
  return c.json(stats);
}, 'get-task-statistics', { client }));

// Simulate slow operation
app.get('/slow', traced(async (c) => {
  const delay = parseInt(c.req.query('delay') || '1000');
  
  await trace('slow-operation', async (traceInstance) => {
    traceInstance.setAttribute('delay.ms', delay);
    traceInstance.setAttribute('operation.type', 'simulated_delay');
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    traceInstance.addEvent('delay-completed', {
      'delay.actual_ms': delay,
    });
  });
  
  return c.json({
    message: `Operation completed after ${delay}ms`,
    timestamp: new Date().toISOString(),
  });
}, 'slow-operation', { client }));

// Error simulation
app.get('/error', traced(async (c) => {
  const errorType = c.req.query('type') || 'generic';
  
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
      
      case 'network':
        throw new Error('Network error occurred');
      
      default:
        throw new Error('Generic error occurred');
    }
  });
}, 'error-simulation', { client }));

// 404 handler
app.notFound((c) => {
  return c.json({
    error: 'Not Found',
    message: 'The requested resource was not found',
    path: new URL(c.req.url).pathname,
    timestamp: new Date().toISOString(),
  }, 404);
});

// Error handler
app.onError((error, c) => {
  console.error('Unhandled error:', error);
  
  return c.json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred',
    timestamp: new Date().toISOString(),
  }, 500);
});

/**
 * Server startup
 */
const port = parseInt(process.env.PORT || '3000');

console.log(`🚀 Hono server starting on port ${port}`);
console.log(`📊 Noveum tracing enabled for project: ${client.getConfig().project}`);
console.log(`\nTry these endpoints:`);
console.log(`  GET  http://localhost:${port}/health`);
console.log(`  GET  http://localhost:${port}/tasks`);
console.log(`  POST http://localhost:${port}/tasks`);
console.log(`  GET  http://localhost:${port}/search?q=setup`);
console.log(`  GET  http://localhost:${port}/stats`);
console.log(`  GET  http://localhost:${port}/slow?delay=2000`);
console.log(`  GET  http://localhost:${port}/error?type=timeout`);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 Received SIGTERM, shutting down gracefully...');
  
  try {
    await client.flush();
    await client.shutdown();
    console.log('📊 Noveum client shutdown completed');
  } catch (error) {
    console.error('❌ Error during Noveum client shutdown:', error);
  }
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🔄 Received SIGINT, shutting down gracefully...');
  
  try {
    await client.flush();
    await client.shutdown();
    console.log('📊 Noveum client shutdown completed');
  } catch (error) {
    console.error('❌ Error during Noveum client shutdown:', error);
  }
  
  process.exit(0);
});

export default {
  port,
  fetch: app.fetch,
};

export { app, client, taskService };

