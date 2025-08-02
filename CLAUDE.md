# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Building the project

```bash
npm run build        # Build the project using tsup
npm run dev          # Build in watch mode for development (--watch)
npm run build:docs   # Generate TypeDoc documentation
```

### Running tests

```bash
npm test                   # Run all unit tests using Vitest
npm run test:watch        # Run tests in watch mode
npm run test:coverage     # Run tests with coverage report
npm run test:e2e          # Run end-to-end tests
npm run test:e2e:watch    # Run e2e tests in watch mode
npm run test:integration  # Run integration tests (requires NOVEUM_API_KEY)
npm run test:all          # Run all tests (unit + e2e + integration)
```

### Code quality and formatting

```bash
npm run lint             # Run ESLint and auto-fix issues
npm run lint:check      # Run ESLint without fixing
npm run format          # Format code with Prettier
npm run format:check    # Check code formatting without fixing
npm run check-types     # Run TypeScript type checking
```

### CI/CD and automation

The project includes comprehensive GitHub Actions workflows:

- **CI/CD Pipeline** (`.github/workflows/ci.yml`) - Runs on push/PR to main/develop
  - Code quality checks (lint, format, typecheck)
  - Unit tests across Node.js 18, 20, 22
  - Build verification and package testing
  - Integration tests (if NOVEUM_API_KEY available)
  - Security audits and dependency checks
  - Bundle size analysis and performance tests
  - Documentation generation and validation

- **Release Automation** (`.github/workflows/release.yml`) - Runs on releases
  - Automated changelog generation
  - GitHub release creation
  - npm package publishing
  - Docker image building and deployment
  - Documentation deployment to GitHub Pages

- **Documentation Updates** (`.github/workflows/docs-update.yml`) - Runs on main branch changes
  - Automatic CLAUDE.md statistics updates
  - API documentation generation with TypeDoc
  - Example validation and README completeness checks
  - Scripts documentation synchronization

### Release and maintenance

```bash
npm run release        # Create release with automatic version bump using standard-version
```

### Environment setup

1. Copy `.env.example` to `.env` and configure API keys for testing:

   ```bash
   # Required for tracing functionality
   NOVEUM_API_KEY=your_noveum_api_key_here

   # Optional: For OpenAI integration tests
   OPENAI_API_KEY=your_openai_api_key_here

   # Other provider keys as needed for testing
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   ```

2. Run integration tests to verify setup:
   ```bash
   npm run test:integration
   ```

## Important Implementation Details

### Core Architecture

The Noveum Trace TypeScript SDK follows a modular architecture designed for performance, extensibility, and ease of use:

#### Client Management (`src/core/client.ts`)

- **NoveumClient**: Central client class managing configuration, HTTP transport, and lifecycle
- **Configuration system**: Both new Python-compatible config (`src/types/config.ts`) and legacy options
- **Batch processing**: Intelligent batching with configurable size and flush intervals via `BatchProcessor`
- **Error handling**: Robust retry logic with exponential backoff
- **Resource management**: Automatic cleanup and graceful shutdown

#### Tracing Core (`src/core/`)

- **Trace Management**: Full trace lifecycle with attributes, events, and relationships
- **Span Operations**: Comprehensive span creation, modification, and completion
- **Context Propagation**: Advanced context management for span relationships
- **Standalone Support**: Self-contained trace/span operations for edge cases

#### Transport Layer (`src/transport/`)

- **HTTP Transport** (`http-transport.ts`): Robust HTTP client with retry logic and error handling
- **Batch Processor** (`batch-processor.ts`): Efficient batching system with configurable thresholds
- **Batch Serialization**: Efficient JSON serialization with Python-compatible timestamps
- **Network Resilience**: Configurable timeouts, retries, and backoff strategies

#### Integration Framework (`src/integrations/`)

- **Express.js** (`express.ts`): Complete middleware with request/response tracing
- **Next.js** (`nextjs.ts`): App Router support with `withNoveumTracing` wrapper
- **Hono** (`hono.ts`): Modern framework integration with middleware and handler wrapping
- **Framework Agnostic**: Manual tracing support for any TypeScript/JavaScript application

#### Developer Experience (`src/decorators/`)

- **Comprehensive Decorators**: `@trace`, `@traceLLM`, `@traceAgent`, `@traceRetrieval`, `@traceTool` for automatic instrumentation
- **Specialized Decorators**: Domain-specific decorators matching Python SDK functionality
- **Base Decorator** (`base.ts`): Core decorator functionality with flexible options
- **Type Safety**: Full TypeScript support with excellent IntelliSense
- **Debug Support**: Comprehensive logging and error reporting

#### LLM Utilities (`src/llm/`)

- **Cost Estimation** (`cost-estimation.ts`): Token-based cost calculation for LLM providers
- **Model Registry** (`model-registry.ts`): Comprehensive model metadata and capabilities
- **Token Counting** (`token-counting.ts`): Accurate token counting using tiktoken
- **Data Sanitization** (`sanitization.ts`): PII detection and redaction for LLM data
- **Validation** (`validation.ts`): LLM request/response validation and normalization

#### Auto-Instrumentation (`src/instrumentation/`)

- **Provider Support**: OpenAI and Anthropic auto-instrumentation
- **Registry System** (`registry.ts`): Extensible instrumentation registry
- **Base Classes** (`base.ts`): Common instrumentation patterns
- **Type Definitions** (`types.ts`): Instrumentation interfaces and types

### Key Design Decisions

#### Performance Optimizations

- **Async-First Design**: All operations are non-blocking with Promise-based APIs
- **Lazy Serialization**: Data is only serialized when actually sending to reduce CPU overhead
- **Memory Management**: Automatic cleanup of finished traces and spans to prevent memory leaks
- **Batch Processing**: Intelligent batching with dedicated `BatchProcessor` reduces network calls

#### Python SDK Compatibility

- **API Parity**: 100% compatible API surface with the Python SDK
- **Configuration System**: New Python-compatible config structure in `src/types/config.ts`
- **Data Format**: Identical JSON output format for cross-language compatibility
- **Timestamp Format**: Python-compatible microsecond precision timestamps (no Z suffix)
- **Decorator Compatibility**: Matching decorator functionality (`@traceLLM`, `@traceAgent`, etc.)

#### Error Handling Strategy

- **Graceful Degradation**: Tracing failures never affect application functionality
- **Comprehensive Logging**: Detailed error information in debug mode
- **Retry Logic**: Configurable retry attempts with exponential backoff
- **Fallback Behavior**: Safe defaults when configuration or network issues occur

#### Sampling and Performance

- **Rate-Based Sampling**: Configurable sampling rates with per-trace-name rules
- **Custom Samplers**: Extensible sampler interface for complex sampling logic
- **Production Ready**: Minimal overhead suitable for high-throughput production environments

## High-level Architecture

### Core Concepts

The SDK is built around three main concepts:

1. **Client (`NoveumClient`)**: Main entry point that manages configuration, batching, and transport
   - Located in `src/core/client.ts`
   - Handles API authentication, batching logic, and flush intervals
   - Creates traces and spans with sampling support
   - Global client instance accessible via `initializeNoveum()` or `getDefaultClient()`

2. **Trace**: Represents a complete operation flow through a system
   - Located in `src/core/trace.ts`
   - Contains metadata and spans
   - Can have parent-child relationships with other traces

3. **Span**: Represents individual operations within a trace
   - Located in `src/core/span.ts`
   - Supports attributes, events, and status tracking
   - Can have parent-child relationships forming a trace tree

### Key Architectural Patterns

1. **Context Propagation**
   - Managed by `ContextManager` in `src/context/context-manager.ts`
   - Maintains current trace/span context across async operations
   - Global context accessible via `getGlobalContextManager()` and helper functions
   - Contextual wrappers: `ContextualSpan`, `ContextualTrace`

2. **Transport Layer**
   - Abstract transport interface with HTTP implementation
   - Located in `src/transport/http-transport.ts` and `src/transport/batch-processor.ts`
   - Dedicated `BatchProcessor` handles intelligent batching
   - Configurable timeout and retry logic with exponential backoff

3. **Decorator Support**
   - Comprehensive decorator system in `src/decorators/`
   - Base decorator (`base.ts`) and specialized decorators (`llm.ts`, `agent.ts`, `retrieval.ts`, `tool.ts`)
   - Enable automatic tracing via `@trace`, `@traceLLM`, `@traceAgent`, `@traceRetrieval`, `@traceTool`
   - Python SDK compatible decorator functionality

4. **Framework Integrations**
   - Express.js middleware in `src/integrations/express.ts`
   - Next.js App Router wrapper in `src/integrations/nextjs.ts`
   - Hono middleware and wrapper in `src/integrations/hono.ts`
   - Each provides automatic request tracing with configurable options

5. **Sampling System**
   - Rate-based sampling in `src/core/sampler.ts`
   - Configurable rules based on trace name patterns
   - Reduces overhead in production environments
   - Both legacy and new configuration formats supported

6. **Testing Infrastructure**
   - **Unit Tests** (`tests/unit/`): Core functionality testing with high coverage thresholds
   - **Integration Tests** (`tests/integration/`): API validation, framework testing, Python compatibility
   - **E2E Tests** (`tests/e2e/`): End-to-end framework and mock api testing
   - **Real API Tests**: Validation against actual Noveum API and OpenAI integration
   - **Auto-instrumentation Testing**: Validation of automatic instrumentation features

7. **GitHub Actions CI/CD**
   - Complete CI/CD pipeline in `.github/workflows/ci.yml`
   - Release automation in `.github/workflows/release.yml`
   - PR validation in `.github/workflows/pr-validation.yml`
   - Maintenance and health checks in `.github/workflows/maintenance.yml`
   - Automated documentation updates in `.github/workflows/docs-update.yml`

### Important Implementation Details

- **TypeScript Configuration**: Strict mode enabled with all strict checks, ES2022 target, experimental decorators
- **Module System**: ESM with CommonJS compatibility, uses `.js` extensions in imports
- **Build Tool**: tsup for building both ESM and CJS outputs with TypeScript declarations
- **Testing**: Vitest for unit/e2e tests with comprehensive coverage, located in `tests/` directory
- **Package Structure**: Modular exports for integrations (`@noveum/trace/integrations/express`)
- **Async Patterns**: Heavy use of async/await for all tracing operations
- **Error Handling**: Non-blocking - tracing failures don't affect application flow
- **Performance**: Advanced batching via `BatchProcessor` and sampling to minimize overhead

### Key Files to Understand

1. `src/index.ts` - Main exports, default client, and convenience functions
2. `src/core/client.ts` - Client implementation with batching logic
3. `src/core/span.ts` & `src/core/trace.ts` - Core tracing primitives
4. `src/core/types.ts` - Core TypeScript type definitions
5. `src/types/config.ts` - Python-compatible configuration system
6. `src/decorators/` - Comprehensive decorator implementations
7. `src/integrations/` - Framework-specific integrations
8. `src/transport/batch-processor.ts` - Advanced batching system
9. `src/llm/` - LLM utilities for cost estimation, token counting, and sanitization
10. `src/instrumentation/` - Auto-instrumentation for popular providers

# important-instruction-reminders

Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (\*.md) or README files. Only create documentation files if explicitly requested by the User.
