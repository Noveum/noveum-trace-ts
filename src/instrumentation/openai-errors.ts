/**
 * OpenAI Structured Error Handling and Diagnostics
 *
 * Provides comprehensive error categorization, actionable guidance, and diagnostic
 * information for OpenAI SDK integrations with privacy-safe structured logging.
 */

import type { SDKVersionInfo } from './openai-compat.js';
import { getSdkVersion } from '../utils/index.js';

/**
 * Standardized error categories for OpenAI operations
 */
export enum ErrorCategory {
  MODEL_AVAILABILITY = 'model_availability',
  AUTHENTICATION = 'authentication',
  RATE_LIMIT = 'rate_limit',
  AUTHORIZATION = 'authorization',
  SERVER_ERROR = 'server_error',
  PROXY_DETECTION = 'proxy_detection',
  VALIDATION = 'validation',
  NETWORK = 'network',
  TIMEOUT = 'timeout',
  QUOTA_EXCEEDED = 'quota_exceeded',
  UNKNOWN = 'unknown',
}

/**
 * Severity levels for error handling
 */
export enum ErrorSeverity {
  LOW = 'low', // Minor issues, fallback available
  MEDIUM = 'medium', // Significant issues, may impact functionality
  HIGH = 'high', // Major issues, likely to cause failures
  CRITICAL = 'critical', // Critical issues, immediate attention required
}

/**
 * Retry strategy recommendations
 */
export enum RetryStrategy {
  NO_RETRY = 'no_retry',
  IMMEDIATE = 'immediate',
  BACKOFF = 'backoff',
  LINEAR = 'linear',
  EXPONENTIAL = 'exponential',
}

/**
 * Structured error information
 */
export interface StructuredError {
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  actionable_guidance: string;
  retry_strategy: RetryStrategy;
  retry_after?: number; // seconds
  max_retries?: number;
  metadata: {
    original_error?: string;
    error_code?: string;
    status_code?: number;
    provider: string;
    sdk_version?: string;
    operation?: string;
    model?: string;
    timestamp: string;
  };
  diagnostic_info?: DiagnosticInfo;
}

/**
 * Environment and integration diagnostic information
 */
export interface DiagnosticInfo {
  environment: {
    node_version: string;
    platform: string;
    arch: string;
    memory_usage?: NodeJS.MemoryUsage;
  };
  sdk: {
    name: string;
    version: string;
    compatibility_layer?: {
      enabled: boolean;
      detected_version?: string;
      is_legacy?: boolean;
    };
  };
  configuration: {
    endpoint?: string; // Sanitized (no API keys)
    timeout?: number;
    max_retries?: number;
    models_available?: string[];
  };
  network: {
    proxy_detected?: boolean;
    dns_resolution?: boolean;
    connectivity?: boolean;
  };
  timestamp: string;
}

/**
 * Privacy-safe logging configuration
 */
export interface LoggingConfig {
  include_request_bodies: boolean;
  include_response_bodies: boolean;
  include_headers: boolean;
  redact_api_keys: boolean;
  redact_personal_data: boolean;
  max_log_length: number;
}

/**
 * Default privacy-safe logging configuration
 */
export const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
  include_request_bodies: false,
  include_response_bodies: false,
  include_headers: false,
  redact_api_keys: true,
  redact_personal_data: true,
  max_log_length: 1000,
};

/**
 * Error pattern matchers for categorization
 */
export const ERROR_PATTERNS: Array<{
  pattern: RegExp | string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  retry_strategy: RetryStrategy;
  actionable_guidance: string;
}> = [
  // Authentication Errors
  {
    pattern: /invalid.*api.*key|unauthorized|401/i,
    category: ErrorCategory.AUTHENTICATION,
    severity: ErrorSeverity.HIGH,
    retry_strategy: RetryStrategy.NO_RETRY,
    actionable_guidance:
      'Check your API key is correct and properly configured. Verify it has not expired or been revoked.',
  },
  {
    pattern: /authentication.*failed|invalid.*token/i,
    category: ErrorCategory.AUTHENTICATION,
    severity: ErrorSeverity.HIGH,
    retry_strategy: RetryStrategy.NO_RETRY,
    actionable_guidance: 'Verify your authentication credentials are valid and properly formatted.',
  },

  // Rate Limiting
  {
    pattern: /rate.*limit|too.*many.*requests|429/i,
    category: ErrorCategory.RATE_LIMIT,
    severity: ErrorSeverity.MEDIUM,
    retry_strategy: RetryStrategy.EXPONENTIAL,
    actionable_guidance:
      'You are being rate limited. Wait before retrying or consider upgrading your plan for higher limits.',
  },
  {
    pattern: /quota.*exceeded|usage.*limit/i,
    category: ErrorCategory.QUOTA_EXCEEDED,
    severity: ErrorSeverity.HIGH,
    retry_strategy: RetryStrategy.NO_RETRY,
    actionable_guidance: 'Your usage quota has been exceeded. Check your billing and usage limits.',
  },

  // Authorization/Permissions
  {
    pattern: /forbidden|insufficient.*permission|403/i,
    category: ErrorCategory.AUTHORIZATION,
    severity: ErrorSeverity.HIGH,
    retry_strategy: RetryStrategy.NO_RETRY,
    actionable_guidance:
      'You do not have permission to access this resource. Check your account permissions and subscription level.',
  },

  // Model Availability
  {
    pattern: /model.*not.*found|model.*unavailable|invalid.*model/i,
    category: ErrorCategory.MODEL_AVAILABILITY,
    severity: ErrorSeverity.HIGH,
    retry_strategy: RetryStrategy.NO_RETRY,
    actionable_guidance:
      'The requested model is not available. Check the model name and your access permissions for this model.',
  },
  {
    pattern: /model.*overloaded|model.*busy|503.*service.*unavailable/i,
    category: ErrorCategory.MODEL_AVAILABILITY,
    severity: ErrorSeverity.MEDIUM,
    retry_strategy: RetryStrategy.BACKOFF,
    actionable_guidance:
      'The model is temporarily overloaded. Try again in a few moments or use a different model.',
  },

  // Network and Proxy Issues
  {
    pattern: /connect.*timeout|connection.*refused|network.*error/i,
    category: ErrorCategory.NETWORK,
    severity: ErrorSeverity.MEDIUM,
    retry_strategy: RetryStrategy.LINEAR,
    actionable_guidance:
      'Network connectivity issue detected. Check your internet connection and proxy settings.',
  },
  {
    pattern: /proxy.*error|tunnel.*connection|407/i,
    category: ErrorCategory.PROXY_DETECTION,
    severity: ErrorSeverity.MEDIUM,
    retry_strategy: RetryStrategy.NO_RETRY,
    actionable_guidance:
      'Proxy configuration issue detected. Check your proxy settings and authentication.',
  },

  // Timeout Issues
  {
    pattern: /timeout|timed.*out|408/i,
    category: ErrorCategory.TIMEOUT,
    severity: ErrorSeverity.MEDIUM,
    retry_strategy: RetryStrategy.LINEAR,
    actionable_guidance:
      'Request timed out. Consider increasing timeout limits or breaking large requests into smaller chunks.',
  },

  // Server Errors
  {
    pattern: /internal.*server.*error|500|502|503|504/i,
    category: ErrorCategory.SERVER_ERROR,
    severity: ErrorSeverity.HIGH,
    retry_strategy: RetryStrategy.EXPONENTIAL,
    actionable_guidance:
      'Server error occurred. This is typically a temporary issue - please try again in a few moments.',
  },

  // Validation Errors
  {
    pattern: /invalid.*request|bad.*request|validation.*error|400/i,
    category: ErrorCategory.VALIDATION,
    severity: ErrorSeverity.MEDIUM,
    retry_strategy: RetryStrategy.NO_RETRY,
    actionable_guidance: 'Request validation failed. Check your request parameters and format.',
  },
];

/**
 * Categorizes an error based on patterns and context
 */
export function categorizeError(
  error: Error | any,
  context?: {
    operation?: string;
    model?: string;
    sdk_version?: SDKVersionInfo;
  }
): StructuredError {
  const errorMessage = error?.message || error?.toString() || 'Unknown error';
  const statusCode = error?.status || error?.statusCode || error?.code;

  // Find matching pattern
  let matchedPattern = ERROR_PATTERNS.find(pattern => {
    if (typeof pattern.pattern === 'string') {
      return errorMessage.toLowerCase().includes(pattern.pattern.toLowerCase());
    } else {
      return (
        pattern.pattern.test(errorMessage) ||
        (statusCode && pattern.pattern.test(statusCode.toString()))
      );
    }
  });

  // Default to unknown if no pattern matches
  if (!matchedPattern) {
    matchedPattern = {
      pattern: '',
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      retry_strategy: RetryStrategy.LINEAR,
      actionable_guidance: 'An unexpected error occurred. Check the error details and try again.',
    };
  }

  const metadata: StructuredError['metadata'] = {
    provider: 'openai',
    timestamp: new Date().toISOString(),
  };

  // Conditionally add optional properties
  if (sanitizeErrorMessage(errorMessage)) {
    metadata.original_error = sanitizeErrorMessage(errorMessage);
  }
  if (error?.code || error?.type) {
    metadata.error_code = error?.code || error?.type;
  }
  if (statusCode) {
    metadata.status_code = statusCode;
  }
  if (context?.sdk_version?.fullVersion) {
    metadata.sdk_version = context.sdk_version.fullVersion;
  }
  if (context?.operation) {
    metadata.operation = context.operation;
  }
  if (context?.model) {
    metadata.model = context.model;
  }

  const result: StructuredError = {
    category: matchedPattern.category,
    severity: matchedPattern.severity,
    message: errorMessage,
    actionable_guidance: matchedPattern.actionable_guidance,
    retry_strategy: matchedPattern.retry_strategy,
    metadata,
  };

  // Conditionally add optional retry properties
  const retryAfter = calculateRetryAfter(matchedPattern.category, statusCode);
  if (retryAfter !== undefined) {
    result.retry_after = retryAfter;
  }

  const maxRetries = getMaxRetries(matchedPattern.category);
  if (maxRetries !== undefined) {
    result.max_retries = maxRetries;
  }

  return result;
}

/**
 * Calculates appropriate retry delay based on error category
 */
function calculateRetryAfter(category: ErrorCategory, _statusCode?: number): number | undefined {
  switch (category) {
    case ErrorCategory.RATE_LIMIT:
      return 60; // 1 minute base delay
    case ErrorCategory.MODEL_AVAILABILITY:
      return 30; // 30 seconds for model issues
    case ErrorCategory.SERVER_ERROR:
      return 10; // 10 seconds for server errors
    case ErrorCategory.NETWORK:
    case ErrorCategory.TIMEOUT:
      return 5; // 5 seconds for network issues
    default:
      return undefined; // No retry recommended
  }
}

/**
 * Gets maximum retry attempts based on error category
 */
function getMaxRetries(category: ErrorCategory): number | undefined {
  switch (category) {
    case ErrorCategory.RATE_LIMIT:
      return 3;
    case ErrorCategory.MODEL_AVAILABILITY:
      return 2;
    case ErrorCategory.SERVER_ERROR:
      return 3;
    case ErrorCategory.NETWORK:
    case ErrorCategory.TIMEOUT:
      return 2;
    case ErrorCategory.AUTHENTICATION:
    case ErrorCategory.AUTHORIZATION:
    case ErrorCategory.VALIDATION:
    case ErrorCategory.QUOTA_EXCEEDED:
      return 0; // No retries for these categories
    default:
      return 1;
  }
}

/**
 * Sanitizes error messages to remove sensitive information
 */
function sanitizeErrorMessage(message: string): string {
  // Remove API keys
  let sanitized = message.replace(/sk-[a-zA-Z0-9]{20,}/g, 'sk-***');

  // Remove bearer tokens
  sanitized = sanitized.replace(/bearer\s+[a-zA-Z0-9_-]+/gi, 'bearer ***');

  // Remove email addresses
  sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '***@***.***');

  // Remove IP addresses
  sanitized = sanitized.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '***.***.***.***');

  // Remove potential URLs with auth info
  sanitized = sanitized.replace(/(https?:\/\/)[^@\s]+@[^/\s]+/g, '$1***:***@***');

  return sanitized;
}

/**
 * Gathers comprehensive diagnostic information
 */
export function gatherDiagnosticInfo(sdkVersion?: SDKVersionInfo, config?: any): DiagnosticInfo {
  const memoryUsage = typeof process !== 'undefined' ? process.memoryUsage() : undefined;

  // Build environment info
  const environment: DiagnosticInfo['environment'] = {
    node_version: typeof process !== 'undefined' ? process.version : 'unknown',
    platform: typeof process !== 'undefined' ? process.platform : 'unknown',
    arch: typeof process !== 'undefined' ? process.arch : 'unknown',
  };
  if (memoryUsage) {
    environment.memory_usage = memoryUsage;
  }

  // Build SDK info
  const sdk: DiagnosticInfo['sdk'] = {
    name: '@noveum/trace',
    version: getSdkVersion(),
  };
  if (sdkVersion) {
    sdk.compatibility_layer = {
      enabled: true,
      detected_version: sdkVersion.fullVersion,
      is_legacy: sdkVersion.isLegacy,
    };
  }

  // Build configuration info
  const configuration: DiagnosticInfo['configuration'] = {};
  if (config?.endpoint) {
    configuration.endpoint = sanitizeUrl(config.endpoint);
  }
  if (config?.timeout) {
    configuration.timeout = config.timeout;
  }
  if (config?.maxRetries || config?.retryAttempts) {
    configuration.max_retries = config.maxRetries || config.retryAttempts;
  }
  if (config?.modelsAvailable) {
    configuration.models_available = config.modelsAvailable;
  }

  return {
    environment,
    sdk,
    configuration,
    network: {
      proxy_detected: detectProxy(),
      dns_resolution: true, // Could implement actual DNS check
      connectivity: true, // Could implement actual connectivity check
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Sanitizes URLs to remove sensitive information
 */
function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Keep protocol and hostname, remove auth and query params
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
  } catch {
    return 'invalid-url';
  }
}

/**
 * Detects if a proxy is being used
 */
function detectProxy(): boolean {
  if (typeof process === 'undefined') return false;

  const proxyVars = [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'http_proxy',
    'https_proxy',
    'ALL_PROXY',
    'all_proxy',
  ];

  return proxyVars.some(varName => !!process.env[varName]);
}

/**
 * Creates privacy-safe structured logs
 */
export function createStructuredLog(
  structuredError: StructuredError,
  config: LoggingConfig = DEFAULT_LOGGING_CONFIG
): Record<string, any> {
  const log: Record<string, any> = {
    level: mapSeverityToLogLevel(structuredError.severity),
    category: structuredError.category,
    message: config.redact_personal_data
      ? sanitizeErrorMessage(structuredError.message)
      : structuredError.message,
    actionable_guidance: structuredError.actionable_guidance,
    retry_strategy: structuredError.retry_strategy,
    retry_after: structuredError.retry_after,
    max_retries: structuredError.max_retries,
    metadata: {
      ...structuredError.metadata,
      original_error: config.redact_personal_data
        ? sanitizeErrorMessage(structuredError.metadata.original_error || '')
        : structuredError.metadata.original_error,
    },
    timestamp: structuredError.metadata.timestamp,
  };

  // Add diagnostic info if available
  if (structuredError.diagnostic_info) {
    log.diagnostic_info = structuredError.diagnostic_info;
  }

  // Truncate if needed
  const logString = JSON.stringify(log);
  if (logString.length > config.max_log_length) {
    log._truncated = true;
    log._original_length = logString.length;
    // Truncate the message field
    if (log.message && log.message.length > 100) {
      log.message = `${log.message.substring(0, 100)}... [truncated]`;
    }
  }

  return log;
}

/**
 * Maps error severity to standard log levels
 */
function mapSeverityToLogLevel(severity: ErrorSeverity): string {
  switch (severity) {
    case ErrorSeverity.LOW:
      return 'info';
    case ErrorSeverity.MEDIUM:
      return 'warn';
    case ErrorSeverity.HIGH:
      return 'error';
    case ErrorSeverity.CRITICAL:
      return 'fatal';
    default:
      return 'error';
  }
}

/**
 * Enhanced error wrapper with diagnostic capabilities
 */
export class DiagnosticError extends Error {
  public readonly structured: StructuredError;
  public readonly diagnostic: DiagnosticInfo;

  constructor(
    originalError: Error | any,
    context?: {
      operation?: string;
      model?: string;
      sdk_version?: SDKVersionInfo;
      config?: any;
    }
  ) {
    const structured = categorizeError(originalError, context);
    super(structured.message);

    this.name = 'DiagnosticError';
    this.structured = structured;
    this.diagnostic = gatherDiagnosticInfo(context?.sdk_version, context?.config);

    // Attach diagnostic info to structured error
    this.structured.diagnostic_info = this.diagnostic;
  }

  /**
   * Get privacy-safe structured log representation
   */
  toStructuredLog(config?: LoggingConfig): Record<string, any> {
    return createStructuredLog(this.structured, config);
  }

  /**
   * Get human-readable error summary
   */
  toSummary(): string {
    return `${this.structured.category.toUpperCase()}: ${this.structured.message}\n\nGuidance: ${this.structured.actionable_guidance}`;
  }

  /**
   * Check if error should be retried
   */
  shouldRetry(attemptNumber: number = 0): boolean {
    return (
      this.structured.retry_strategy !== RetryStrategy.NO_RETRY &&
      (this.structured.max_retries === undefined || attemptNumber < this.structured.max_retries)
    );
  }

  /**
   * Get next retry delay in milliseconds
   */
  getRetryDelay(attemptNumber: number = 0): number {
    const baseDelay = (this.structured.retry_after || 1) * 1000; // Convert to ms

    switch (this.structured.retry_strategy) {
      case RetryStrategy.IMMEDIATE:
        return 0;
      case RetryStrategy.LINEAR:
        return baseDelay * (attemptNumber + 1);
      case RetryStrategy.EXPONENTIAL:
        return baseDelay * Math.pow(2, attemptNumber);
      case RetryStrategy.BACKOFF:
        return baseDelay + Math.random() * 1000; // Add jitter
      default:
        return baseDelay;
    }
  }
}
