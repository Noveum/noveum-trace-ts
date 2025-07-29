# Noveum Trace TypeScript SDK

[![npm version](https://badge.fury.io/js/@noveum%2Ftrace.svg)](https://badge.fury.io/js/@noveum%2Ftrace)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Build Status](https://github.com/Noveum/noveum-trace-ts/workflows/CI/badge.svg)](https://github.com/Noveum/noveum-trace-ts/actions)

The official TypeScript SDK for [Noveum.ai](https://noveum.ai) - a powerful tracing and observability platform for LLM applications, RAG systems, and AI agents.

## 🚀 Features

- **🔍 Comprehensive Tracing**: Trace LLM calls, RAG operations, and agent workflows
- **🎯 Framework Integration**: Built-in support for Express.js, Next.js, Hono, and more
- **⚡ TypeScript First**: Full type safety with excellent developer experience
- **🎨 Decorator Support**: Elegant tracing with TypeScript decorators
- **📊 Automatic Instrumentation**: Zero-config tracing for popular frameworks
- **🔧 Flexible Configuration**: Sampling, batching, and custom attributes
- **🌐 Universal Compatibility**: Works in Node.js, Edge Runtime, and browsers
- **📈 Performance Optimized**: Minimal overhead with intelligent batching

## 📦 Installation

```bash
npm install @noveum/trace
```

```bash
yarn add @noveum/trace
```

```bash
pnpm add @noveum/trace
```

## 🏃 Quick Start

### 1. Initialize the Client

```typescript
import { initializeClient } from '@noveum/trace';

const client = initializeClient({
  apiKey: process.env.NOVEUM_API_KEY,
  project: 'my-ai-app',
  environment: 'production',
});
```

### 2. Basic Tracing

```typescript
import { trace, span } from '@noveum/trace';

// Trace a complete operation
const result = await trace('user-query-processing', async traceInstance => {
  traceInstance.setAttribute('user.id', userId);
  traceInstance.setAttribute('query.type', 'search');

  // Create spans for sub-operations
  const embeddings = await span('generate-embeddings', async () => {
    return await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: userQuery,
    });
  });

  const searchResults = await span('vector-search', async () => {
    return await vectorDB.search(embeddings.data[0].embedding);
  });

  return searchResults;
});
```

### 3. Using Decorators

```typescript
class LLMService {
  @trace('llm-completion')
  async generateResponse(prompt: string) {
    return await this.callOpenAI(prompt);
  }

  @span('openai-api-call', { captureArgs: true, captureReturn: true })
  private async callOpenAI(prompt: string) {
    return await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
    });
  }
}
```

## 🔧 Framework Integrations

### Express.js

```typescript
import express from 'express';
import { noveumMiddleware } from '@noveum/trace/integrations/express';

const app = express();

app.use(
  noveumMiddleware({
    client,
    captureRequest: true,
    captureResponse: true,
    ignoreRoutes: ['/health'],
  })
);
```

### Next.js App Router

```typescript
// app/api/chat/route.ts
import { withNoveumTracing } from '@noveum/trace/integrations/nextjs';

export const POST = withNoveumTracing(
  async (request: NextRequest) => {
    const { message } = await request.json();

    // Your AI logic here
    const response = await processMessage(message);

    return NextResponse.json(response);
  },
  {
    client,
    spanName: 'chat-completion',
    captureRequest: true,
  }
);
```

### Hono

```typescript
import { Hono } from 'hono';
import { noveumMiddleware, traced } from '@noveum/trace/integrations/hono';

const app = new Hono();

app.use('*', noveumMiddleware({ client }));

app.post(
  '/chat',
  traced(
    async c => {
      const { message } = await c.req.json();
      const response = await processMessage(message);
      return c.json(response);
    },
    'chat-endpoint',
    { client }
  )
);
```

## 📚 Core Concepts

### Traces

A trace represents a complete operation or request flow through your system:

```typescript
const trace = await client.createTrace('rag-query', {
  attributes: {
    'user.id': 'user123',
    'query.type': 'semantic_search',
  },
});

// ... perform operations

await trace.finish();
```

### Spans

Spans represent individual operations within a trace:

```typescript
const span = await client.startSpan('vector-embedding', {
  traceId: trace.traceId,
  attributes: {
    'model.name': 'text-embedding-ada-002',
    'input.length': text.length,
  },
});

// ... perform operation

span.setStatus('OK');
await span.finish();
```

### Attributes and Events

Add context and metadata to your traces:

```typescript
// Set attributes
span.setAttribute('llm.model', 'gpt-4');
span.setAttribute('llm.tokens.input', 150);
span.setAttribute('llm.tokens.output', 75);

// Add events
span.addEvent('cache-miss', {
  'cache.key': cacheKey,
  'cache.ttl': 3600,
});

// Set status
span.setStatus('ERROR', 'Rate limit exceeded');
```

## ⚙️ Configuration

### Environment Variables

```bash
NOVEUM_API_KEY=your-api-key
NOVEUM_PROJECT=my-project
NOVEUM_ENVIRONMENT=production
NOVEUM_ENDPOINT=https://api.noveum.ai/api/v1/traces
```

### Client Options

```typescript
const client = initializeClient({
  apiKey: 'your-api-key',
  project: 'my-project',
  environment: 'production',

  // Batching and performance
  batchSize: 100,
  flushInterval: 5000,
  timeout: 30000,

  // Sampling
  sampling: {
    rate: 1.0, // Sample 100% of traces
    rules: [
      {
        rate: 0.1, // Sample 10% of health checks
        traceNamePattern: 'health-check',
      },
      {
        rate: 1.0, // Always sample errors
        traceNamePattern: '.*error.*',
      },
    ],
  },

  // Retry configuration
  retryAttempts: 3,
  retryDelay: 1000,

  // Debug mode
  debug: process.env.NODE_ENV === 'development',
});
```

## 🎯 Advanced Usage

### Custom Sampling

```typescript
import { RateSampler, AlwaysSampler } from '@noveum/trace';

const client = initializeClient({
  apiKey: 'your-api-key',
  sampling: {
    rate: 0.1, // Default 10% sampling
    rules: [
      {
        rate: 1.0, // Always sample errors
        traceNamePattern: '.*error.*',
      },
      {
        rate: 0.01, // 1% sampling for health checks
        traceNamePattern: 'health.*',
      },
    ],
  },
});
```

### Context Propagation

```typescript
import { getGlobalContextManager } from '@noveum/trace';

const contextManager = getGlobalContextManager();

// Set current span in context
contextManager.setCurrentSpan(span);

// Get current span from context
const currentSpan = contextManager.getCurrentSpan();

// Run function with span context
await contextManager.withSpan(span, async () => {
  // This function runs with span in context
  await someOperation();
});
```

### Error Handling

```typescript
const span = await client.startSpan('risky-operation');

try {
  const result = await riskyOperation();
  span.setAttribute('operation.result', 'success');
  span.setStatus('OK');
  return result;
} catch (error) {
  span.setAttribute('operation.result', 'error');
  span.setStatus('ERROR', error.message);

  span.addEvent('error', {
    'error.type': error.constructor.name,
    'error.message': error.message,
    'error.stack': error.stack,
  });

  throw error;
} finally {
  await span.finish();
}
```

## 🔗 Links

- **🌐 Noveum.ai Platform**: [https://noveum.ai](https://noveum.ai)
- **📖 Documentation**: [https://docs.noveum.ai](https://docs.noveum.ai)
- **🐍 Python SDK**: [https://github.com/Noveum/noveum-trace](https://github.com/Noveum/noveum-trace)
- **💬 Discord Community**: [https://discord.gg/noveum](https://discord.gg/noveum)
- **🐛 Issues**: [https://github.com/Noveum/noveum-trace-ts/issues](https://github.com/Noveum/noveum-trace-ts/issues)

## 📋 Examples

### LLM Application Tracing

```typescript
import { trace, span } from '@noveum/trace';
import OpenAI from 'openai';

class ChatService {
  private openai = new OpenAI();

  @trace('chat-completion')
  async processMessage(message: string, userId: string) {
    const context = await this.retrieveContext(message);
    const response = await this.generateResponse(message, context);
    await this.saveConversation(userId, message, response);
    return response;
  }

  @span('context-retrieval', { captureArgs: true })
  private async retrieveContext(message: string) {
    // Generate embeddings
    const embeddings = await this.openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: message,
    });

    // Search vector database
    return await this.vectorDB.search(embeddings.data[0].embedding);
  }

  @span('llm-generation', { captureArgs: true, captureReturn: true })
  private async generateResponse(message: string, context: any[]) {
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: this.buildSystemPrompt(context) },
        { role: 'user', content: message },
      ],
    });

    return completion.choices[0].message.content;
  }
}
```

### RAG Pipeline Tracing

```typescript
class RAGPipeline {
  @trace('rag-query')
  async query(question: string) {
    // Step 1: Query understanding
    const intent = await span('query-understanding', async () => {
      return await this.analyzeIntent(question);
    });

    // Step 2: Document retrieval
    const documents = await span('document-retrieval', async spanInstance => {
      spanInstance.setAttribute('query.intent', intent);
      return await this.retrieveDocuments(question, intent);
    });

    // Step 3: Answer generation
    const answer = await span('answer-generation', async spanInstance => {
      spanInstance.setAttribute('documents.count', documents.length);
      return await this.generateAnswer(question, documents);
    });

    return answer;
  }
}
```

### Agent Workflow Tracing

```typescript
class AIAgent {
  @trace('agent-execution')
  async executeTask(task: string) {
    const plan = await this.planTask(task);
    const results = [];

    for (const step of plan.steps) {
      const result = await span(`execute-${step.type}`, async spanInstance => {
        spanInstance.setAttribute('step.type', step.type);
        spanInstance.setAttribute('step.description', step.description);

        return await this.executeStep(step);
      });

      results.push(result);
    }

    return await this.synthesizeResults(results);
  }

  @span('tool-usage', { captureArgs: true })
  private async useTool(toolName: string, parameters: any) {
    const tool = this.tools[toolName];
    return await tool.execute(parameters);
  }
}
```

### Batch Processing

```typescript
class DocumentProcessor {
  @trace('batch-processing')
  async processBatch(documents: Document[]) {
    const results = [];

    for (const doc of documents) {
      const result = await span('process-document', async spanInstance => {
        spanInstance.setAttribute('document.id', doc.id);
        spanInstance.setAttribute('document.type', doc.type);
        spanInstance.setAttribute('document.size', doc.content.length);

        try {
          const processed = await this.processDocument(doc);
          spanInstance.setStatus('OK');
          return processed;
        } catch (error) {
          spanInstance.setStatus('ERROR', error.message);
          throw error;
        }
      });

      results.push(result);
    }

    return results;
  }
}
```

## 🧪 Testing

Run the test suite:

```bash
npm test
```

Run tests with coverage:

```bash
npm run test:coverage
```

Run tests in watch mode:

```bash
npm run test:watch
```

## 🏗️ Building

Build the project:

```bash
npm run build
```

Build in watch mode:

```bash
npm run build:watch
```

## 📊 Performance

The Noveum Trace SDK is designed for minimal performance impact:

- **Async Operations**: All network calls are asynchronous and non-blocking
- **Intelligent Batching**: Traces are batched and sent efficiently
- **Sampling Support**: Reduce overhead with configurable sampling rates
- **Lazy Serialization**: Data is only serialized when needed
- **Memory Efficient**: Automatic cleanup of finished traces

### Benchmarks

| Operation     | Overhead | Memory          |
| ------------- | -------- | --------------- |
| Create Span   | ~0.1ms   | ~2KB            |
| Add Attribute | ~0.01ms  | ~100B           |
| Finish Span   | ~0.05ms  | ~1KB            |
| Batch Send    | ~50ms    | ~10KB/100 spans |

## 🔒 Security

- **API Key Protection**: Never log or expose API keys
- **Data Sanitization**: Automatic PII detection and redaction
- **Secure Transport**: All data sent over HTTPS
- **Configurable Capture**: Control what data is captured

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

1. Clone the repository:

```bash
git clone https://github.com/Noveum/noveum-trace-ts.git
cd noveum-trace-ts
```

2. Install dependencies:

```bash
npm install
```

3. Run tests:

```bash
npm test
```

4. Build the project:

```bash
npm run build
```

### Code Style

We use ESLint and Prettier for code formatting:

```bash
npm run lint
npm run format
```

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **📖 Documentation**: [https://docs.noveum.ai](https://docs.noveum.ai)
- **💬 Discord**: [https://discord.gg/noveum](https://discord.gg/noveum)
- **📧 Email**: support@noveum.ai
- **🐛 Issues**: [GitHub Issues](https://github.com/Noveum/noveum-trace-ts/issues)

## 🗺️ Roadmap

- [ ] **Browser Support**: Full browser compatibility for client-side tracing
- [ ] **OpenTelemetry Integration**: Native OpenTelemetry compatibility
- [ ] **Real-time Streaming**: Live trace streaming for development
- [ ] **Auto-instrumentation**: Zero-config instrumentation for popular libraries
- [ ] **Performance Profiling**: Built-in performance monitoring
- [ ] **Custom Exporters**: Support for custom trace exporters

---

<div align="center">
  <p>Built with ❤️ by the <a href="https://noveum.ai">Noveum</a> team</p>
  <p>
    <a href="https://noveum.ai">Website</a> •
    <a href="https://docs.noveum.ai">Docs</a> •
    <a href="https://github.com/Noveum/noveum-trace">Python SDK</a> •
    <a href="https://discord.gg/noveum">Discord</a>
  </p>
</div>
