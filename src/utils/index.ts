/**
 * Utility functions for the Noveum Trace SDK
 */

import { v4 as uuidv4 } from 'uuid';
import type { Attributes, AttributeValue } from '../core/types.js';

/**
 * Generate a random trace ID
 */
export function generateTraceId(): string {
  return uuidv4().replace(/-/g, '');
}

/**
 * Generate a random span ID
 */
export function generateSpanId(): string {
  return uuidv4().replace(/-/g, '').substring(0, 16);
}

// getCurrentTimestamp function moved below after formatPythonCompatibleTimestamp

/**
 * Format timestamp to match Python SDK format exactly
 * Python uses: "2025-07-29T18:18:34.786583+00:00" (microsecond precision, with +00:00 timezone)
 * JavaScript native: "2025-07-28T15:40:05.753Z" (millisecond precision, with Z suffix)
 *
 * This implementation ensures exact compatibility with Python's datetime.isoformat(timespec='microseconds')
 */
export function formatPythonCompatibleTimestamp(date: Date = new Date()): string {
  // Handle invalid dates
  if (isNaN(date.getTime())) {
    throw new Error('Invalid date provided to formatPythonCompatibleTimestamp');
  }

  // Extract UTC components explicitly to ensure correct handling of edge cases
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  const second = String(date.getUTCSeconds()).padStart(2, '0');

  // JavaScript only provides millisecond precision, so we pad to microseconds
  const milliseconds = String(date.getUTCMilliseconds()).padStart(3, '0');
  const microseconds = `${milliseconds}000`; // Pad to 6 digits for microsecond precision

  // Format exactly as Python does: YYYY-MM-DDTHH:MM:SS.ffffff+00:00
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${microseconds}+00:00`;
}

/**
 * Legacy function that uses the more robust implementation above
 * @deprecated Use formatPythonCompatibleTimestamp instead
 */
export function getCurrentTimestamp(): string {
  return formatPythonCompatibleTimestamp();
}

/**
 * Test function to validate timestamp formatting compatibility
 * This ensures our formatting matches Python SDK expectations exactly
 */
export function validateTimestampFormatting(): {
  success: boolean;
  results: Array<{ test: string; expected: string; actual: string; passed: boolean }>;
} {
  const testCases = [
    {
      test: 'Current date',
      date: new Date('2025-01-19T19:31:03.123Z'),
      expected: '2025-01-19T19:31:03.123000+00:00',
    },
    {
      test: 'Zero milliseconds',
      date: new Date('2025-01-19T19:31:03.000Z'),
      expected: '2025-01-19T19:31:03.000000+00:00',
    },
    {
      test: 'Date before 1970',
      date: new Date('1969-12-31T23:59:59.999Z'),
      expected: '1969-12-31T23:59:59.999000+00:00',
    },
    {
      test: 'Leap year date',
      date: new Date('2024-02-29T12:00:00.456Z'),
      expected: '2024-02-29T12:00:00.456000+00:00',
    },
    {
      test: 'Single digit month/day',
      date: new Date('2025-01-01T01:01:01.001Z'),
      expected: '2025-01-01T01:01:01.001000+00:00',
    },
  ];

  const results = testCases.map(({ test, date, expected }) => {
    const actual = formatPythonCompatibleTimestamp(date);
    return {
      test,
      expected,
      actual,
      passed: actual === expected,
    };
  });

  const allPassed = results.every(result => result.passed);

  return {
    success: allPassed,
    results,
  };
}

/**
 * Validate attribute value
 */
export function isValidAttributeValue(value: unknown): value is AttributeValue {
  if (value === null || value === undefined) {
    return false;
  }

  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(item => {
      const itemType = typeof item;
      return itemType === 'string' || itemType === 'number' || itemType === 'boolean';
    });
  }

  return false;
}

/**
 * Sanitize attributes by removing invalid values
 */
export function sanitizeAttributes(attributes: Record<string, unknown>): Attributes {
  const sanitized: Attributes = {};

  for (const [key, value] of Object.entries(attributes)) {
    if (isValidAttributeValue(value)) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Deep merge two objects
 */
export function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (
      sourceValue &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[Extract<keyof T, string>];
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[Extract<keyof T, string>];
    }
  }

  return result;
}

/**
 * Check if a value is a plain object
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof RegExp)
  );
}

/**
 * Truncate a string to a maximum length
 */
export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return `${str.substring(0, maxLength - 3)}...`;
}

/**
 * Safe JSON stringify with circular reference handling
 */
export function safeStringify(obj: unknown, maxDepth = 10): string {
  const seen = new WeakSet();
  let depth = 0;

  return JSON.stringify(obj, (_key, value) => {
    if (depth >= maxDepth) {
      return '[Max Depth Reached]';
    }

    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular Reference]';
      }
      seen.add(value);
      depth++;
    }

    return value;
  });
}

/**
 * Create a debounced function
 */
export function debounce<T extends (...args: unknown[]) => void>(
  func: T,
  wait: number
): T & { cancel: () => void } {
  let timeout: NodeJS.Timeout | undefined;

  const debounced = ((...args: Parameters<T>) => {
    const later = () => {
      timeout = undefined;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  }) as T & { cancel: () => void };

  debounced.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = undefined;
    }
  };

  return debounced;
}

/**
 * Create a throttled function
 */
export function throttle<T extends (...args: unknown[]) => void>(
  func: T,
  limit: number
): T & { cancel: () => void } {
  let inThrottle = false;
  let timeout: NodeJS.Timeout | undefined;

  const throttled = ((...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      timeout = setTimeout(() => {
        inThrottle = false;
        timeout = undefined;
      }, limit);
    }
  }) as T & { cancel: () => void };

  throttled.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = undefined;
    }
    inThrottle = false;
  };

  return throttled;
}

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
  } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 30000, backoffFactor = 2 } = options;

  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries) {
        throw lastError;
      }

      const delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt), maxDelay);
      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * Get environment variable with optional default
 */
export function getEnvVar(name: string, defaultValue?: string): string | undefined {
  return process.env[name] ?? defaultValue;
}

/**
 * Check if running in Node.js environment
 */
export function isNode(): boolean {
  return typeof process !== 'undefined' && process.versions?.node !== undefined;
}

/**
 * Check if running in browser environment
 */
export function isBrowser(): boolean {
  return typeof globalThis !== 'undefined' && 'window' in globalThis && 'document' in globalThis;
}

/**
 * Get SDK version from build-time injected constant
 */
export function getSdkVersion(): string {
  // Provided at build time by tsup; fallback to '1.0.0' if undefined
  return typeof __SDK_VERSION__ !== 'undefined' ? __SDK_VERSION__ : '1.0.0';
}

/**
 * Create a promise that resolves after a timeout
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

/**
 * Normalize URL by removing query parameters and fragments
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return url;
  }
}

/**
 * Extract error information safely
 */
export function extractErrorInfo(error: unknown): {
  message: string;
  name: string;
  stack?: string;
} {
  if (error instanceof Error) {
    const result: { message: string; name: string; stack?: string } = {
      message: error.message,
      name: error.name,
    };

    if (error.stack) {
      result.stack = error.stack;
    }

    return result;
  }

  return {
    message: String(error),
    name: 'Unknown',
  };
}

// Migration utilities
export {
  migrateTrace,
  migrateSpan,
  migrateTraces,
  validateMigratedTrace,
  generateMigrationReport,
  type MigrationOptions,
  type MigrationReport,
} from './migration.js';

// PII Redaction utilities
export {
  redactPII,
  redactEmails,
  redactPhoneNumbers,
  redactCreditCards,
  redactSSN,
  redactIPAddresses,
  detectPIITypes,
  PIIType,
  type PIIRedactionOptions,
  type PIIDetectionResult,
  type PIIDetection,
} from './pii-redaction.js';
