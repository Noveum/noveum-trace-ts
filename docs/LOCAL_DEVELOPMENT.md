# Local Development Guide

This guide covers everything you need to know for developing, testing, and contributing to the Noveum Trace TypeScript SDK.

## 📋 Prerequisites

- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 8.0.0 or higher
- **Git**: For version control and hooks

## 🚀 Quick Start

1. **Clone the repository**

   ```bash
   git clone https://github.com/Noveum/noveum-trace-ts.git
   cd noveum-trace-ts
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Build the project**

   ```bash
   npm run build
   ```

4. **Run tests**
   ```bash
   npm test
   ```

## 🛠️ Available Scripts

### Building

```bash
npm run build         # Build for production
npm run build:watch   # Build in watch mode
npm run dev          # Alias for build:watch
npm run clean        # Clean build artifacts
```

### Testing

```bash
npm test                      # Run unit tests
npm run test:watch           # Run tests in watch mode
npm run test:coverage        # Run tests with coverage
npm run test:ui             # Run tests with UI
npm run test:integration    # Run all integration tests
npm run test:smoke          # Quick smoke tests
npm run test:health         # Health check tests
```

### Code Quality

```bash
npm run lint            # Lint TypeScript files
npm run lint:fix        # Auto-fix linting issues
npm run format          # Format code with Prettier
npm run format:check    # Check code formatting
npm run typecheck       # TypeScript type checking
```

### Documentation

```bash
npm run docs           # Generate API documentation
```

### Release Management

```bash
npm run commit         # Interactive commit with Commitizen
npm run release        # Create new release
npm run release:dry    # Preview release changes
npm run release:major  # Force major version bump
npm run release:minor  # Force minor version bump
npm run release:patch  # Force patch version bump
```

## Release

npm run release:patch (or :minor, :major) to update version + CHANGELOG.md + tag.

` npm run release:patch`

`git push --follow-tags origin main && npm publish`

npm publish (public scope handled by publishConfig).

## 🏗️ Project Structure

```
src/
├── core/                 # Core tracing functionality
│   ├── client.ts         # Main client implementation
│   ├── trace.ts          # Trace management
│   ├── span.ts           # Span implementation
│   └── types.ts          # Type definitions
├── integrations/         # Framework integrations
│   ├── express.ts        # Express.js middleware
│   ├── nextjs.ts         # Next.js integration
│   └── hono.ts           # Hono framework support
├── decorators/           # Decorator implementations
├── transport/            # HTTP transport layer
├── context/              # Context management
└── utils/                # Utility functions

tests/
├── integration/          # Integration tests
│   ├── api-integration.test.ts      # API tests
│   └── framework-integration.test.ts # Framework tests
└── unit/                 # Unit tests

docs/                     # Documentation
examples/                 # Usage examples
```

## 🔧 Development Workflow

### 1. Code Changes

- Make changes in the `src/` directory
- Follow existing code patterns and conventions
- Ensure TypeScript strict mode compliance

### 2. Testing

```bash
# Run unit tests
npm test

# Run integration tests (requires API key)
npm run test:integration

# Run specific test file
npx vitest run tests/integration/api-integration.test.ts
```

### 3. Code Quality

The project uses automated code quality tools:

- **ESLint**: TypeScript linting
- **Prettier**: Code formatting
- **TypeScript**: Strict type checking
- **Husky**: Git hooks for automation

### 4. Commits

Use conventional commits with Commitizen:

```bash
npm run commit
```

This will prompt you through creating a properly formatted commit message.

## 🧪 Testing

### Unit Tests

Located in `test/` directory, covering core functionality:

```bash
npm test                    # All unit tests
npm run test:watch         # Watch mode
npm run test:coverage      # With coverage report
```

### Integration Tests

Located in `tests/integration/`, requiring API configuration:

1. **API Integration Tests**

   ```bash
   npm run test:integration:api
   ```

2. **Framework Integration Tests**

   ```bash
   npm run test:integration:framework
   ```

3. **Environment Setup**
   Create `.env` file:
   ```bash
   NOVEUM_API_KEY=your-api-key-here
   NOVEUM_PROJECT=your-project-name
   NOVEUM_API_URL=https://api.noveum.ai
   ```

### Test Categories

- **Unit Tests**: Core functionality, no external dependencies
- **Integration Tests**: Real API calls and framework testing
- **Smoke Tests**: Quick validation of basic functionality
- **Health Tests**: System health and connectivity checks

## 🔍 Debugging

### Debug Mode

Enable debug logging:

```typescript
import { NoveumClient } from '@noveum/trace';

const client = new NoveumClient({
  apiKey: 'your-key',
  project: 'your-project',
  debug: true, // Enable debug mode
});
```

### Development Server

For framework integration testing:

```bash
# Express example
node examples/express-server.js

# Next.js example
cd examples && npm run dev

# Hono example
node examples/hono-app.js
```

## 📦 Build System

The project uses **tsup** for building:

- **Dual Module Support**: ESM and CommonJS
- **TypeScript Declarations**: Automatic `.d.ts` generation
- **Tree Shaking**: Optimized builds
- **Watch Mode**: Development builds

### Build Configuration

See `tsup.config.ts` for build settings.

## 🔄 Git Hooks

### Pre-commit Hook

Automatically runs on `git commit`:

1. **lint-staged**: Auto-fix and format changed files
2. **TypeScript**: Type checking
3. **Tests**: Unit test suite

### Commit Message Hook

Validates commit messages against conventional commit format.

### Manual Hook Setup

```bash
npm run prepare  # Install Husky hooks
```

## 🚀 Release Process

### Automated Releases

1. Make changes with conventional commits
2. Run tests and ensure quality
3. Create release:
   ```bash
   npm run release
   ```

### Manual Version Control

```bash
npm run release:patch   # Bug fixes
npm run release:minor   # New features
npm run release:major   # Breaking changes
```

### Release Checklist

- [ ] All tests passing
- [ ] Code quality checks pass
- [ ] Integration tests validated
- [ ] Documentation updated
- [ ] CHANGELOG.md updated automatically
- [ ] Version bumped in package.json

## 🌐 Framework Integration Testing

### Express.js

```bash
cd examples
node express-server.js
curl http://localhost:3000/test
```

### Next.js

```bash
cd examples/nextjs
npm install
npm run dev
# Visit http://localhost:3000/api/test
```

### Hono

```bash
cd examples
node hono-app.js
curl http://localhost:8000/test
```

## 🔐 Environment Variables

Create `.env` file for development:

```bash
# Required for integration tests
NOVEUM_API_KEY=your-api-key
NOVEUM_PROJECT=your-project-name

# Optional
NOVEUM_API_URL=https://api.noveum.ai
DEBUG=true
NODE_ENV=development
```

## 📊 Performance Monitoring

### Bundle Analysis

```bash
npm run build
# Check dist/ for bundle sizes
```

### Memory Profiling

```typescript
// Enable memory debugging
const client = new NoveumClient({
  debug: true,
  sampling: { rate: 1.0 }, // 100% sampling for testing
});
```

## 🔧 Troubleshooting

### Common Issues

1. **TypeScript Errors**

   ```bash
   npm run typecheck
   ```

2. **Linting Issues**

   ```bash
   npm run lint:fix
   ```

3. **Test Failures**

   ```bash
   npm test -- --reporter=verbose
   ```

4. **Build Issues**
   ```bash
   npm run clean && npm run build
   ```

### Integration Test Issues

1. **API Key Missing**
   - Ensure `.env` file exists with `NOVEUM_API_KEY`

2. **Network Issues**
   - Check `NOVEUM_API_URL` configuration
   - Verify network connectivity

3. **Framework Integration**
   - Check framework versions in examples
   - Verify peer dependencies

## 📚 Additional Resources

- **API Documentation**: Run `npm run docs` to generate
- **Examples**: See `examples/` directory
- **Contributing**: See `CONTRIBUTING.md`
- **Architecture**: See `CLAUDE.md`

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/your-feature`
3. Make changes with conventional commits
4. Run tests: `npm test`
5. Run integration tests: `npm run test:integration`
6. Submit pull request

### Code Style Guidelines

- Use TypeScript strict mode
- Follow existing naming conventions
- Add JSDoc comments for public APIs
- Maintain test coverage above 80%
- Use conventional commit messages

## 📞 Support

- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions
- **Documentation**: `/docs` directory
- **Examples**: `/examples` directory

---

**Happy coding! 🎉**

For more detailed information, see the main [README.md](../README.md) and [API documentation](./API.md).
