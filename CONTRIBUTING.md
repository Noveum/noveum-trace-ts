# Contributing to Noveum Trace TypeScript SDK

Thank you for your interest in contributing to the Noveum Trace TypeScript SDK! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Code Style](#code-style)
- [Submitting Changes](#submitting-changes)
- [Release Process](#release-process)

## Code of Conduct

This project adheres to a code of conduct that we expect all contributors to follow. Please be respectful and constructive in all interactions.

## Getting Started

### Prerequisites

- Node.js 18.x or higher
- npm or yarn
- Git

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:

```bash
git clone https://github.com/YOUR_USERNAME/noveum-trace-ts.git
cd noveum-trace-ts
```

3. Add the upstream repository:

```bash
git remote add upstream https://github.com/Noveum/noveum-trace-ts.git
```

## Development Setup

1. Install dependencies:

```bash
npm install
```

2. Build the project:

```bash
npm run build
```

3. Run tests:

```bash
npm test
```

4. Start development mode:

```bash
npm run dev
```

## Project Structure

```
src/
├── core/           # Core SDK functionality
│   ├── client.ts   # Main client implementation
│   ├── span.ts     # Span implementation
│   ├── trace.ts    # Trace implementation
│   ├── types.ts    # Type definitions
│   └── interfaces.ts # Interface definitions
├── context/        # Context management
├── decorators/     # TypeScript decorators
├── integrations/   # Framework integrations
│   ├── express.ts  # Express.js integration
│   ├── nextjs.ts   # Next.js integration
│   └── hono.ts     # Hono integration
├── transport/      # Transport layer
├── utils/          # Utility functions
└── index.ts        # Main entry point

test/               # Test files
examples/           # Usage examples
docs/               # Documentation
```

## Development Workflow

### Branching Strategy

- `main` - Stable release branch
- `develop` - Development branch
- `feature/*` - Feature branches
- `bugfix/*` - Bug fix branches
- `hotfix/*` - Hotfix branches

### Making Changes

1. Create a feature branch:

```bash
git checkout -b feature/your-feature-name
```

2. Make your changes following the code style guidelines

3. Add tests for new functionality

4. Ensure all tests pass:

```bash
npm test
```

5. Build and check for type errors:

```bash
npm run build
npm run typecheck
```

6. Lint your code:

```bash
npm run lint
npm run format
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run tests with UI
npm run test:ui
```

### Writing Tests

- Use Vitest for testing
- Place test files in the `test/` directory
- Use descriptive test names
- Test both success and error cases
- Mock external dependencies

Example test structure:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NoveumClient } from '../src/core/client.js';

describe('NoveumClient', () => {
  let client: NoveumClient;

  beforeEach(() => {
    client = new NoveumClient({
      apiKey: 'test-key',
      project: 'test-project',
    });
  });

  afterEach(async () => {
    await client.shutdown();
  });

  it('should create a new trace', async () => {
    const trace = await client.startTrace('test-trace');
    expect(trace.name).toBe('test-trace');
  });
});
```

### Integration Tests

Create integration tests for framework integrations:

```typescript
// test/integrations/express.test.ts
import request from 'supertest';
import express from 'express';
import { noveumMiddleware } from '../../src/integrations/express.js';

describe('Express Integration', () => {
  it('should trace HTTP requests', async () => {
    const app = express();
    app.use(noveumMiddleware(client));

    const response = await request(app).get('/test').expect(200);

    // Assert tracing behavior
  });
});
```

## Code Style

### TypeScript Guidelines

- Use TypeScript strict mode
- Prefer interfaces over types for object shapes
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Use `readonly` for immutable data
- Prefer `const` over `let`

### Formatting

We use Prettier for code formatting:

```bash
npm run format
```

### Linting

We use ESLint for code linting:

```bash
npm run lint
npm run lint:fix
```

### Import Style

- Use relative imports for local modules
- Use `.js` extensions in imports (for ESM compatibility)
- Group imports: external packages, then local modules

```typescript
// External packages
import { v4 as uuidv4 } from 'uuid';

// Local modules
import type { ISpan } from './interfaces.js';
import { generateSpanId } from '../utils/index.js';
```

## Submitting Changes

### Pull Request Process

1. Ensure your branch is up to date:

```bash
git checkout main
git pull upstream main
git checkout your-feature-branch
git rebase main
```

2. Push your changes:

```bash
git push origin your-feature-branch
```

3. Create a pull request on GitHub

4. Fill out the pull request template

5. Wait for review and address feedback

### Pull Request Guidelines

- Write clear, descriptive commit messages
- Keep pull requests focused and small
- Include tests for new functionality
- Update documentation as needed
- Ensure CI passes

### Commit Message Format

Use conventional commits:

```
type(scope): description

[optional body]

[optional footer]
```

Types:

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Test changes
- `chore`: Build/tooling changes

Examples:

```
feat(core): add span context propagation
fix(express): handle async middleware errors
docs(api): update trace interface documentation
```

## Documentation

### API Documentation

- Update `docs/API.md` for API changes
- Use JSDoc comments for public APIs
- Include code examples

### README Updates

Update the main README.md for:

- New features
- Breaking changes
- Installation instructions

### Examples

Add examples for new features:

- Create files in `examples/` directory
- Include comprehensive comments
- Test examples to ensure they work

## Performance Considerations

### Benchmarking

Run performance tests:

```bash
npm run benchmark
```

### Memory Usage

- Avoid memory leaks
- Clean up resources properly
- Use weak references where appropriate

### Bundle Size

Keep the bundle size minimal:

- Avoid unnecessary dependencies
- Use tree-shaking friendly exports
- Consider code splitting for integrations

## Release Process

### Versioning

We use semantic versioning (SemVer):

- MAJOR: Breaking changes
- MINOR: New features (backward compatible)
- PATCH: Bug fixes (backward compatible)

### Changesets

We use changesets for release management:

```bash
# Add a changeset
npx changeset

# Version packages
npx changeset version

# Publish
npx changeset publish
```

### Release Checklist

- [ ] All tests pass
- [ ] Documentation updated
- [ ] Changelog updated
- [ ] Version bumped
- [ ] Git tag created
- [ ] NPM package published

## Getting Help

### Communication Channels

- GitHub Issues: Bug reports and feature requests
- GitHub Discussions: Questions and general discussion
- Discord: Real-time chat (link in README)

### Debugging

Enable debug mode:

```typescript
const client = new NoveumClient({
  // ... config
  debug: true,
});
```

Use console transport for local development:

```typescript
import { ConsoleTransport } from '@noveum/trace';

const client = new NoveumClient({
  transport: new ConsoleTransport(),
});
```

## Recognition

Contributors will be recognized in:

- CONTRIBUTORS.md file
- Release notes
- GitHub contributors page

Thank you for contributing to Noveum Trace TypeScript SDK!
