import { describe, it, expect } from 'vitest';
import { 
  generateTraceId, 
  generateSpanId, 
  sanitizeAttributes, 
  getCurrentTimestamp,
  getSdkVersion,
  extractErrorInfo
} from '../../src/utils/index.js';

describe('Utils', () => {
  describe('generateTraceId', () => {
    it('should generate a valid trace ID', () => {
      const traceId = generateTraceId();
      expect(traceId).toBeDefined();
      expect(typeof traceId).toBe('string');
      expect(traceId).toHaveLength(32); // 128-bit hex string
      expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    });

    it('should generate unique trace IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateTraceId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('generateSpanId', () => {
    it('should generate a valid span ID', () => {
      const spanId = generateSpanId();
      expect(spanId).toBeDefined();
      expect(typeof spanId).toBe('string');
      expect(spanId).toHaveLength(16); // 64-bit hex string
      expect(spanId).toMatch(/^[0-9a-f]{16}$/);
    });

    it('should generate unique span IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateSpanId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('sanitizeAttributes', () => {
    it('should pass through valid attributes', () => {
      const input = {
        'string.key': 'string value',
        'number.key': 42,
        'boolean.key': true,
        'array.key': ['a', 'b', 'c'],
      };
      
      const result = sanitizeAttributes(input);
      expect(result).toEqual(input);
    });

    it('should handle null and undefined values', () => {
      const input = {
        'null.key': null,
        'undefined.key': undefined,
        'valid.key': 'valid',
      };
      
      const result = sanitizeAttributes(input);
      // null and undefined are filtered out by sanitizeAttributes
      expect(result).toEqual({
        'valid.key': 'valid',
      });
    });

    it('should filter out invalid objects', () => {
      const input = {
        'object.key': { nested: 'value' },
        'date.key': new Date('2023-01-01'),
        'valid.key': 'valid',
      };
      
      const result = sanitizeAttributes(input);
      // Objects and dates are filtered out by sanitizeAttributes
      expect(result['object.key']).toBeUndefined();
      expect(result['date.key']).toBeUndefined();
      expect(result['valid.key']).toBe('valid');
    });

    it('should filter out functions', () => {
      const input = {
        'function.key': () => 'test',
        'valid.key': 'valid',
      };
      
      const result = sanitizeAttributes(input);
      expect(result['function.key']).toBeUndefined();
      expect(result['valid.key']).toBe('valid');
    });

    it('should handle valid arrays', () => {
      const validArray = [1, 'string', true];
      const invalidArray = [1, 'string', true, null, undefined, {}];
      const input = {
        'valid.array': validArray,
        'invalid.array': invalidArray,
      };
      
      const result = sanitizeAttributes(input);
      expect(result['valid.array']).toEqual(validArray);
      expect(result['invalid.array']).toBeUndefined();
    });

    it('should handle empty objects', () => {
      const result = sanitizeAttributes({});
      expect(result).toEqual({});
    });

    it('should handle very long strings', () => {
      const longString = 'a'.repeat(10000);
      const input = { 'long.key': longString };
      
      const result = sanitizeAttributes(input);
      expect(typeof result['long.key']).toBe('string');
    });
  });

  describe('getCurrentTimestamp', () => {
    it('should return a valid ISO timestamp', () => {
      const timestamp = getCurrentTimestamp();
      expect(typeof timestamp).toBe('string');
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}\+00:00$/);
    });

    it('should return current time', () => {
      const before = Date.now();
      const timestamp = getCurrentTimestamp();
      const after = Date.now();
      
      const timestampMs = new Date(timestamp).getTime();
      expect(timestampMs).toBeGreaterThanOrEqual(before);
      expect(timestampMs).toBeLessThanOrEqual(after);
    });

    it('should include +00:00 timezone suffix', () => {
      const timestamp = getCurrentTimestamp();
      expect(timestamp).toMatch(/\+00:00$/);
    });
  });

  describe('getSdkVersion', () => {
    it('should return a version string', () => {
      const version = getSdkVersion();
      expect(typeof version).toBe('string');
      expect(version).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('should be consistent', () => {
      const version1 = getSdkVersion();
      const version2 = getSdkVersion();
      expect(version1).toBe(version2);
    });
  });

  describe('extractErrorInfo', () => {
    it('should extract info from Error objects', () => {
      const error = new Error('Test error message');
      const info = extractErrorInfo(error);
      
      expect(info.name).toBe('Error');
      expect(info.message).toBe('Test error message');
      expect(info.stack).toBeDefined();
      expect(typeof info.stack).toBe('string');
    });

    it('should handle custom error types', () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }
      
      const error = new CustomError('Custom error message');
      const info = extractErrorInfo(error);
      
      expect(info.name).toBe('CustomError');
      expect(info.message).toBe('Custom error message');
    });

    it('should handle errors without stack traces', () => {
      const error = new Error('Test error');
      delete (error as any).stack;
      
      const info = extractErrorInfo(error);
      expect(info.name).toBe('Error');
      expect(info.message).toBe('Test error');
      expect(info.stack).toBeUndefined();
    });

    it('should handle errors with empty messages', () => {
      const error = new Error();
      const info = extractErrorInfo(error);
      
      expect(info.name).toBe('Error');
      expect(info.message).toBe('');
    });

    it('should handle TypeError', () => {
      const error = new TypeError('Type error message');
      const info = extractErrorInfo(error);
      
      expect(info.name).toBe('TypeError');
      expect(info.message).toBe('Type error message');
    });

    it('should handle RangeError', () => {
      const error = new RangeError('Range error message');
      const info = extractErrorInfo(error);
      
      expect(info.name).toBe('RangeError');
      expect(info.message).toBe('Range error message');
    });
  });
});