import { beforeAll, afterAll, vi } from 'vitest';

// Store original console methods
const originalConsole = {
  warn: console.warn,
  error: console.error,
};

beforeAll(() => {
  // Mock console methods to suppress output during tests
  console.warn = vi.fn();
  console.error = vi.fn();
});

afterAll(() => {
  // Restore original console methods
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
});