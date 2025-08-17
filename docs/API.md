# Noveum Trace TypeScript SDK - API Reference

## Table of Contents

- [Client](#client)
- [Tracing](#tracing)
- [Spans](#spans)
- [Context Management](#context-management)
- [Decorators](#decorators)
- [Integrations](#integrations)
- [Transport](#transport)
- [Sampling](#sampling)
- [Configuration](#configuration)
- [Error Handling](#error-handling)

## Client

### NoveumClient

The main client class for interacting with the Noveum tracing service.

#### Constructor

```typescript
new NoveumClient(options?: NoveumClientOptions)
```

#### Methods

##### `startTrace(name: string, options?: TraceOptions): Promise<ITrace>`

Creates a new trace.

**Parameters:**

- `name` - Name of the trace
- `options` - Optional trace configuration

**Returns:** Promise that resolves to a new trace instance

**Example:**

```typescript
const trace = await client.startTrace('user-query', {
  level: TraceLevel.INFO,
  attributes: { 'user.id': '123' },
});
```

##### `startSpan(name: string, options?: SpanOptions): Promise<ISpan>`

Creates a new span. If no active trace exists, creates one automatically.

**Parameters:**

- `name` - Name of the span
- `options` - Optional span configuration

**Returns:** Promise that resolves to a new span instance

**Example:**

```typescript
const span = await client.startSpan('llm-call', {
  kind: SpanKind.CLIENT,
  attributes: { model: 'gpt-4' },
});
```

##### `trace<T>(name: string, fn: () => Promise<T>, options?: TraceOptions): Promise<T>`

Convenience method to run a function within a new trace.

**Example:**

```typescript
const result = await client.trace('process-query', async () => {
  // Your code here
  return processQuery();
});
```

##### `span<T>(name: string, fn: () => Promise<T>, options?: SpanOptions): Promise<T>`

Convenience method to run a function within a new span.

##### `flush(): Promise<void>`

Flushes all pending trace data to the transport.

##### `shutdown(): Promise<void>`

Gracefully shuts down the client, flushing all data and cleaning up resources.

## Tracing

### ITrace Interface

Represents a complete tracing session.

#### Properties

- `traceId: string` - Unique identifier for the trace
- `name: string` - Name of the trace
- `startTime: Date` - When the trace started
- `endTime?: Date` - When the trace ended (if finished)
- `isFinished: boolean` - Whether the trace has been finished
- `spans: readonly ISpan[]` - All spans in this trace

#### Methods

##### `startSpan(name: string, options?: SpanOptions): Promise<ISpan>`

Creates a new span within this trace.

##### `setAttributes(attributes: Attributes): void`

Sets multiple attributes on the trace.

##### `setAttribute(key: string, value: AttributeValue): void`

Sets a single attribute on the trace.

##### `addEvent(name: string, attributes?: Attributes): void`

Adds an event to the trace.

##### `finish(endTime?: Date): Promise<void>`

Finishes the trace and all unfinished spans.

## Spans

### ISpan Interface

Represents a single operation within a trace.

#### Properties

- `spanId: string` - Unique identifier for the span
- `traceId: string` - ID of the trace this span belongs to
- `parentSpanId?: string` - ID of the parent span (if any)
- `name: string` - Name of the span
- `startTime: Date` - When the span started
- `endTime?: Date` - When the span ended (if finished)
- `isFinished: boolean` - Whether the span has been finished

#### Methods

##### `setAttributes(attributes: Attributes): void`

Sets multiple attributes on the span.

##### `setAttribute(key: string, value: AttributeValue): void`

Sets a single attribute on the span.

##### `addEvent(name: string, attributes?: Attributes): void`

Adds an event to the span.

##### `setStatus(status: SpanStatus, message?: string): void`

Sets the status of the span.

**Status values:**

- `SpanStatus.UNSET` - Default status
- `SpanStatus.OK` - Operation completed successfully
- `SpanStatus.ERROR` - Operation failed

##### `recordException(exception: Error | string): void`

Records an exception in the span and automatically sets status to ERROR.

##### `finish(endTime?: Date): Promise<void>`

Finishes the span.

## Context Management

The SDK uses AsyncLocalStorage to maintain context across async operations.

### Functions

##### `getCurrentSpan(): ISpan | undefined`

Gets the currently active span.

##### `getCurrentTrace(): ITrace | undefined`

Gets the currently active trace.

##### `setCurrentSpan(span: ISpan): void`

Sets the active span.

##### `setCurrentTrace(trace: ITrace): void`

Sets the active trace.

## Decorators

TypeScript decorators for automatic tracing.

### @trace

Creates a new trace for the decorated method.

```typescript
class Service {
  @trace('user-service-operation')
  async processUser(userId: string) {
    // Method is automatically traced
  }
}
```

### @span

Creates a new span for the decorated method.

```typescript
class Service {
  @span('database-query')
  async queryDatabase(query: string) {
    // Method is automatically spanned
  }
}
```

### @autoSpan

Automatically captures method parameters and return values.

```typescript
class Service {
  @autoSpan({
    captureArgs: true,
    captureResult: true,
    ignoreArgs: ['password'],
  })
  async authenticate(username: string, password: string) {
    // Arguments (except password) and result are captured
  }
}
```

### @timed

Measures execution time.

```typescript
class Service {
  @timed({ unit: 'ms' })
  async expensiveOperation() {
    // Execution time is automatically recorded
  }
}
```

### @retry

Adds retry logic with tracing.

```typescript
class Service {
  @retry({
    maxAttempts: 3,
    delay: 1000,
    backoff: 2,
  })
  async unreliableOperation() {
    // Retries are automatically traced
  }
}
```

## Integrations

### Express.js

#### Middleware

```typescript
import { noveumMiddleware } from '@noveum/trace/integrations/express';

app.use(
  noveumMiddleware(client, {
    captureHeaders: true,
    captureBody: false,
    ignoreRoutes: ['/health'],
  })
);
```

#### Utility Functions

- `getCurrentSpan(req)` - Get current span from request
- `addSpanAttributes(req, attributes)` - Add attributes to current span
- `addSpanEvent(req, name, attributes)` - Add event to current span

### Next.js

#### App Router

```typescript
import { withNoveumTrace } from '@noveum/trace/integrations/nextjs';

export const POST = withNoveumTrace(async request => {
  // Your API route logic
  return Response.json({ message: 'Hello' });
}, client);
```

#### Pages API

```typescript
import { withNoveumTracePages } from '@noveum/trace/integrations/nextjs';

export default withNoveumTracePages(async (req, res) => {
  // Your API route logic
  res.json({ message: 'Hello' });
}, client);
```

### Hono

```typescript
import { noveumTrace } from '@noveum/trace/integrations/hono';

const app = new Hono();
app.use('*', noveumTrace(client));
```

## Transport

### HTTP Transport

Sends trace data to the Noveum API.

```typescript
import { HttpTransport } from '@noveum/trace';

const transport = new HttpTransport(
  {
    batchSize: 100,
    flushInterval: 5000,
    maxRetries: 3,
  },
  {
    apiKey: 'your-api-key',
    endpoint: 'https://api.noveum.ai/api',
  }
);
```

### Mock Transport

For testing and development.

```typescript
import { MockTransport } from '@noveum/trace';

const transport = new MockTransport();
```

### Console Transport

Logs trace data to console.

```typescript
import { ConsoleTransport } from '@noveum/trace';

const transport = new ConsoleTransport();
```

## Sampling

Control which traces are collected.

### Probability Sampler

```typescript
import { ProbabilitySampler } from '@noveum/trace';

const sampler = new ProbabilitySampler(0.1); // Sample 10% of traces
```

### Rate Limiting Sampler

```typescript
import { RateLimitingSampler } from '@noveum/trace';

const sampler = new RateLimitingSampler(100); // Max 100 traces per second
```

### Attribute Sampler

```typescript
import { AttributeSampler } from '@noveum/trace';

const sampler = new AttributeSampler([
  {
    namePattern: 'important-*',
    sample: true,
  },
  {
    attributeConditions: [{ key: 'user.tier', operator: 'equals', value: 'premium' }],
    sample: true,
  },
]);
```

### Custom Samplers

The SDK allows you to implement custom sampling logic by creating a class that implements the `ISampler` interface.

#### ISampler Interface

```typescript
interface ISampler {
  /**
   * Make a sampling decision for a trace
   * @param traceId - Trace ID
   * @param name - Trace name (optional)
   */
  shouldSample(traceId: string, name?: string): boolean;
}
```

#### Example: Custom Rate-Based Sampler

```typescript
import { ISampler } from '@noveum/trace';

class CustomRateSampler implements ISampler {
  private rate: number;

  constructor(rate: number) {
    this.rate = Math.max(0, Math.min(1, rate)); // Clamp between 0 and 1
  }

  shouldSample(traceId: string, name?: string): boolean {
    // Sample based on trace ID hash for deterministic sampling
    const hash = this.hashTraceId(traceId);
    return hash < this.rate;
  }

  private hashTraceId(traceId: string): number {
    let hash = 0;
    for (let i = 0; i < traceId.length; i++) {
      hash = ((hash << 5) - hash + traceId.charCodeAt(i)) & 0xffffffff;
    }
    return Math.abs(hash) / 0xffffffff;
  }
}

// Usage
const sampler = new CustomRateSampler(0.1); // 10% sampling rate
const client = new NoveumClient({
  apiKey: 'your-api-key',
  sampler: sampler,
});
```

#### Example: Name-Based Conditional Sampler

```typescript
class ConditionalSampler implements ISampler {
  private defaultRate: number;
  private patterns: Map<RegExp, number>;

  constructor(defaultRate: number) {
    this.defaultRate = defaultRate;
    this.patterns = new Map();
  }

  addPattern(pattern: string, rate: number): void {
    this.patterns.set(new RegExp(pattern), rate);
  }

  shouldSample(traceId: string, name?: string): boolean {
    // Check name-based patterns first
    if (name) {
      for (const [pattern, rate] of this.patterns) {
        if (pattern.test(name)) {
          return Math.random() < rate;
        }
      }
    }

    // Fall back to default rate
    return Math.random() < this.defaultRate;
  }
}

// Usage
const sampler = new ConditionalSampler(0.01); // 1% default rate
sampler.addPattern('^error-', 1.0); // 100% for error traces
sampler.addPattern('^debug-', 0.001); // 0.1% for debug traces

const client = new NoveumClient({
  apiKey: 'your-api-key',
  sampler: sampler,
});
```

#### Migration from v0.x

If you have existing custom samplers from v0.x, update the parameter order:

```typescript
// ❌ v0.x (deprecated)
class OldSampler implements ISampler {
  shouldSample(name: string, traceId: string): boolean {
    return Math.random() < 0.5;
  }
}

// ✅ v1.x (current)
class NewSampler implements ISampler {
  shouldSample(traceId: string, name?: string): boolean {
    return Math.random() < 0.5;
  }
}
```

## Configuration

### Environment Variables

- `
