# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Building the project
```bash
npm run build        # Build the project using tsup
npm run build:watch  # Build in watch mode for development
npm run dev         # Alias for build:watch
```

### Running tests
```bash
npm test                   # Run all tests using Vitest
npm run test:watch        # Run tests in watch mode
npm run test:coverage     # Run tests with coverage report
npm run test:ui          # Run tests with Vitest UI

# Integration tests (require NOVEUM_API_KEY in .env)
npm run test:integration       # Run complete integration test suite
npm run test:integration:api   # Run API integration tests only
npm run test:integration:framework  # Run framework integration tests only
npm run test:smoke            # Quick smoke test
npm run test:health           # Health check test
```

### Code quality and formatting
```bash
npm run lint             # Run ESLint on source files
npm run lint:fix        # Run ESLint and auto-fix issues
npm run format          # Format code with Prettier
npm run format:check    # Check code formatting
npm run typecheck       # Run TypeScript type checking
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
  - Validates release readiness
  - Builds and tests package
  - Publishes to NPM
  - Creates GitHub releases
  - Post-release notifications

- **PR Validation** (`.github/workflows/pr-validation.yml`) - Runs on PRs
  - Validates PR title/description format
  - Code quality and test coverage analysis
  - Breaking changes detection
  - Performance impact assessment
  - Security review

- **Maintenance** (`.github/workflows/maintenance.yml`) - Weekly health checks
  - Dependency health monitoring
  - Code quality metrics
  - Performance benchmarking
  - Integration health checks
  - Documentation completeness

- **Documentation Updates** (`.github/workflows/docs-update.yml`) - Auto-updates docs
  - Updates CLAUDE.md statistics
  - Generates API documentation
  - Validates examples and README

### Documentation and release
```bash
npm run docs         # Generate typedoc documentation
npm run clean        # Clean build artifacts (dist folder)
npm run release      # Publish with changeset
npm run version      # Version with changeset
```

## High-level Architecture

### Core Concepts
The SDK is built around three main concepts:

1. **Client (`NoveumClient`)**: Main entry point that manages configuration, batching, and transport
   - Located in `src/core/client.ts`
   - Handles API authentication, batching logic, and flush intervals
   - Creates traces and spans with sampling support
   - Global client instance accessible via `initializeClient()` or `getGlobalClient()`

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
   - Global context accessible via helper functions

2. **Transport Layer**
   - Abstract transport interface with HTTP implementation
   - Located in `src/transport/http-transport.ts`
   - Handles batching, retries, and error handling
   - Configurable timeout and retry logic

3. **Decorator Support**
   - TypeScript decorators in `src/decorators/index.ts`
   - Enable automatic tracing via `@trace`, `@span`, `@autoSpan`
   - Support method timing and retry logic

4. **Framework Integrations**
   - Express.js middleware in `src/integrations/express.ts`
   - Next.js App Router wrapper in `src/integrations/nextjs.ts`
   - Hono middleware and wrapper in `src/integrations/hono.ts`
   - Each provides automatic request tracing

5. **Sampling System**
   - Rate-based sampling in `src/core/sampler.ts`
   - Configurable rules based on trace name patterns
   - Reduces overhead in production environments

6. **Integration Tests**
   - Comprehensive API testing in `tests/integration/api-integration.test.ts`
   - Framework middleware testing in `tests/integration/framework-integration.test.ts`
   - Real API validation against api.noveum.ai
   - Tests authentication, batch processing, error handling, concurrent submissions
   - Framework integrations tested with actual HTTP requests

7. **GitHub Actions CI/CD**
   - Complete CI/CD pipeline in `.github/workflows/ci.yml`
   - Release automation in `.github/workflows/release.yml`
   - PR validation in `.github/workflows/pr-validation.yml`
   - Maintenance and health checks in `.github/workflows/maintenance.yml`
   - Automated documentation updates in `.github/workflows/docs-update.yml`
   - Dependabot configuration for dependency updates

### Important Implementation Details

- **TypeScript Configuration**: Strict mode enabled with all strict checks, ES2022 target
- **Module System**: ESM with CommonJS compatibility, uses `.js` extensions in imports
- **Build Tool**: tsup for building both ESM and CJS outputs with TypeScript declarations
- **Testing**: Vitest for unit tests, located in `test/` directory
- **Async Patterns**: Heavy use of async/await for all tracing operations
- **Error Handling**: Non-blocking - tracing failures don't affect application flow
- **Performance**: Batching and sampling to minimize overhead

### Key Files to Understand

1. `src/index.ts` - Main exports and convenience functions
2. `src/core/client.ts` - Client implementation with batching logic
3. `src/core/span.ts` & `src/core/trace.ts` - Core tracing primitives
4. `src/core/types.ts` - TypeScript type definitions
5. `src/decorators/index.ts` - Decorator implementations
6. `src/integrations/*` - Framework-specific integrations