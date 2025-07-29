# Getting Started with Noveum Trace TypeScript SDK

This guide will help you get up and running with the Noveum Trace TypeScript SDK in just a few minutes.

## Prerequisites

- Node.js 16+ or compatible runtime (Deno, Bun, etc.)
- TypeScript 4.5+ (optional but recommended)
- A Noveum.ai account and API key

## Step 1: Get Your API Key

1. Sign up at [noveum.ai](https://noveum.ai)
2. Create a new project
3. Copy your API key from the project settings

## Step 2: Installation

Install the SDK using your preferred package manager:

```bash
# npm
npm install @noveum/trace

# yarn
yarn add @noveum/trace

# pnpm
pnpm add @noveum/trace
```

## Step 3: Basic Setup

Create a simple tracing setup:

```typescript
// trace-setup.ts
import { initializeClient } from '@noveum/trace';

// Initialize the client
export const client = initializeClient({
  apiKey: process.env.NOVEUM_API_KEY || 'your-api-key',
  project: 'my-first-project',
  environment: 'development',
});

console.log('✅ Noveum Trace initialized');
```

## Step 4: Your First Trace

Create your first trace to verify everything is working:

```typescript
// first-trace.ts
import { trace, span } from '@noveum/trace';
import './trace-setup'; // Initialize the client

async function myFirstTrace() {
  console.log('🚀 Creating your first trace...');

  const result = await trace('my-first-trace', async traceInstance => {
    // Add some context
    traceInstance.setAttribute('user.id', 'demo-user');
    traceInstance.setAttribute('operation.type', 'demo');

    // Create a span for a sub-operation
    const data = await span('fetch-data', async spanInstance => {
      spanInstance.setAttribute('data.source', 'demo');

      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 100));

      return { message: 'Hello from Noveum Trace!' };
    });

    // Add an event
    traceInstance.addEvent('data-processed', {
      'data.size': JSON.stringify(data).length,
    });

    return data;
  });

  console.log('✅ Trace completed:', result);
  return result;
}

// Run the example
myFirstTrace()
  .then(() => console.log('🎉 Success! Check your Noveum dashboard.'))
  .catch(console.error);
```

## Step 5: Framework Integration

### Express.js

```typescript
import express from 'express';
import { noveumMiddleware } from '@noveum/trace/integrations/express';
import { client } from './trace-setup';

const app = express();

// Add Noveum tracing middleware
app.use(
  noveumMiddleware({
    client,
    captureRequest: true,
    captureResponse: true,
  })
);

app.get('/api/hello', async (req, res) => {
  // This request is automatically traced
  res.json({ message: 'Hello World!' });
});

app.listen(3000, () => {
  console.log('🚀 Server running on http://localhost:3000');
});
```

### Next.js

```typescript
// app/api/hello/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withNoveumTracing } from '@noveum/trace/integrations/nextjs';
import { client } from '../../../trace-setup';

export const GET = withNoveumTracing(
  async (request: NextRequest) => {
    return NextResponse.json({ message: 'Hello from Next.js!' });
  },
  {
    client,
    spanName: 'hello-api',
    captureRequest: true,
  }
);
```

## Step 6: Using Decorators

Enable decorators in your TypeScript configuration:

```json
// tsconfig.json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

Then use decorators in your classes:

```typescript
import { trace, span } from '@noveum/trace';

class UserService {
  @trace('user-service-operation')
  async getUser(id: string) {
    return await this.fetchUserFromDB(id);
  }

  @span('database-query', { captureArgs: true })
  private async fetchUserFromDB(id: string) {
    // Simulate database query
    await new Promise(resolve => setTimeout(resolve, 50));
    return { id, name: `User ${id}`, email: `user${id}@example.com` };
  }
}

// Usage
const userService = new UserService();
const user = await userService.getUser('123');
```

## Step 7: Environment Configuration

Set up environment variables for different environments:

```bash
# .env.development
NOVEUM_API_KEY=your-development-api-key
NOVEUM_PROJECT=my-project
NOVEUM_ENVIRONMENT=development

# .env.production
NOVEUM_API_KEY=your-production-api-key
NOVEUM_PROJECT=my-project
NOVEUM_ENVIRONMENT=production
```

Update your client initialization:

```typescript
import { initializeClient } from '@noveum/trace';

export const client = initializeClient({
  apiKey: process.env.NOVEUM_API_KEY!,
  project: process.env.NOVEUM_PROJECT || 'default',
  environment: process.env.NOVEUM_ENVIRONMENT || 'development',

  // Enable debug mode in development
  debug: process.env.NODE_ENV === 'development',

  // Configure sampling for production
  sampling: {
    rate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  },
});
```

## Step 8: Error Handling

Add proper error handling to your traces:

```typescript
import { trace, span } from '@noveum/trace';

async function riskyOperation() {
  return await trace('risky-operation', async traceInstance => {
    try {
      const result = await span('dangerous-task', async spanInstance => {
        // Simulate an operation that might fail
        if (Math.random() > 0.7) {
          throw new Error('Something went wrong!');
        }

        spanInstance.setAttribute('task.result', 'success');
        return { success: true };
      });

      traceInstance.setStatus('OK');
      return result;
    } catch (error) {
      // Handle the error and add context
      traceInstance.setStatus('ERROR', error.message);
      traceInstance.addEvent('error-occurred', {
        'error.type': error.constructor.name,
        'error.message': error.message,
      });

      throw error; // Re-throw if needed
    }
  });
}
```

## Step 9: Verify Your Setup

Check that everything is working:

1. **Run your application** with tracing enabled
2. **Generate some traces** by using your application
3. **Check the Noveum dashboard** at [noveum.ai](https://noveum.ai)
4. **Look for your traces** in the project dashboard

## Next Steps

Now that you have basic tracing set up, explore these advanced features:

- **[Sampling Configuration](./SAMPLING.md)** - Optimize performance with smart sampling
- **[Custom Attributes](./ATTRIBUTES.md)** - Add rich context to your traces
- **[Framework Guides](./FRAMEWORKS.md)** - Deep dive into framework-specific features
- **[Performance Tuning](./PERFORMANCE.md)** - Optimize for production workloads
- **[Troubleshooting](./TROUBLESHOOTING.md)** - Common issues and solutions

## Common Issues

### API Key Not Working

- Verify your API key is correct
- Check that you're using the right project
- Ensure the API key has the necessary permissions

### Traces Not Appearing

- Check your network connection
- Verify the endpoint URL is correct
- Enable debug mode to see detailed logs
- Check for any error messages in the console

### TypeScript Errors

- Ensure you have the latest version of the SDK
- Check your TypeScript configuration
- Verify all required dependencies are installed

## Getting Help

If you run into any issues:

- **📖 Check the [Documentation](https://docs.noveum.ai)**
- **💬 Join our [Discord Community](https://discord.gg/noveum)**
- **🐛 Report issues on [GitHub](https://github.com/Noveum/noveum-trace-ts/issues)**
- **📧 Email us at support@noveum.ai**

Welcome to Noveum Trace! 🎉
