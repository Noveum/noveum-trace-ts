/**
 * Auto-Instrumentation System Types
 *
 * Defines interfaces and types for the instrumentation registry that can
 * automatically patch and trace popular libraries like OpenAI, Anthropic, etc.
 */

import type { Attributes } from '../core/types.js';

/**
 * Supported library types for auto-instrumentation
 */
export type InstrumentationTarget = 'openai' | 'anthropic' | 'langchain' | 'llamaindex' | 'custom';

/**
 * Configuration options for individual instrumentation modules
 */
export interface InstrumentationConfig {
  /** Whether this instrumentation is enabled */
  enabled?: boolean;

  /** Custom attributes to add to all spans created by this instrumentation */
  attributes?: Attributes;

  /** Methods/endpoints to exclude from instrumentation */
  ignoredMethods?: string[];

  /** Custom span naming function */
  spanNameFormatter?: (methodName: string, args: any[]) => string;

  /** Whether to capture request/response data */
  capturePayloads?: boolean;

  /** Maximum size of captured payloads in bytes */
  maxPayloadSize?: number;

  /** Whether to capture function arguments */
  captureArguments?: boolean;

  /** Whether to capture return values */
  captureResults?: boolean;

  /** Whether to estimate costs for LLM calls */
  estimateCosts?: boolean;

  /** Whether to count tokens for LLM calls */
  countTokens?: boolean;
}

/**
 * Default configuration for instrumentation modules
 */
export const DEFAULT_INSTRUMENTATION_CONFIG: Required<InstrumentationConfig> = {
  enabled: true,
  attributes: {},
  ignoredMethods: [],
  spanNameFormatter: (methodName: string) => methodName,
  capturePayloads: true,
  maxPayloadSize: 10000, // 10KB
  captureArguments: true,
  captureResults: true,
  estimateCosts: false,
  countTokens: false,
};

/**
 * Information about an instrumented method
 */
export interface InstrumentedMethod {
  /** Original method reference */
  original: Function;

  /** Instrumented method reference */
  instrumented: Function;

  /** Configuration used for this instrumentation */
  config: InstrumentationConfig;

  /** Timestamp when instrumentation was applied */
  instrumentedAt: Date;
}

/**
 * State of an instrumented library
 */
export interface InstrumentedLibrary {
  /** Library target type */
  target: InstrumentationTarget;

  /** Library instance that was instrumented */
  instance: any;

  /** Map of instrumented methods */
  methods: Map<string, InstrumentedMethod>;

  /** Configuration used for this library */
  config: InstrumentationConfig;

  /** Whether the library is currently instrumented */
  isInstrumented: boolean;

  /** Timestamp when instrumentation was applied */
  instrumentedAt?: Date;

  /** Library version if detectable */
  version?: string;
}

/**
 * Base interface for instrumentation modules
 */
export interface IInstrumentation {
  /** Target library type */
  readonly target: InstrumentationTarget;

  /** Human-readable name */
  readonly name: string;

  /** Version of this instrumentation module */
  readonly version: string;

  /** Whether this instrumentation is currently enabled */
  readonly isEnabled: boolean;

  /**
   * Apply instrumentation to a library instance
   * @param instance - Library instance to instrument
   * @param config - Configuration options
   * @returns Promise that resolves when instrumentation is complete
   */
  instrument(instance: any, config?: InstrumentationConfig): Promise<void>;

  /**
   * Remove instrumentation from a library instance
   * @param instance - Library instance to uninstrument
   * @returns Promise that resolves when uninstrumentation is complete
   */
  uninstrument(instance: any): Promise<void>;

  /**
   * Check if a library instance is supported for instrumentation
   * @param instance - Library instance to check
   * @returns Whether the instance can be instrumented
   */
  isSupported(instance: any): boolean;

  /**
   * Get the version of the instrumented library
   * @param instance - Library instance
   * @returns Library version string or undefined
   */
  getLibraryVersion(instance: any): string | undefined;

  /**
   * Get instrumentation configuration for this module
   * @returns Current configuration
   */
  getConfig(): InstrumentationConfig;

  /**
   * Update instrumentation configuration
   * @param config - New configuration options
   */
  updateConfig(config: Partial<InstrumentationConfig>): void;
}

/**
 * Registry configuration options
 */
export interface InstrumentationRegistryConfig {
  /** Whether the registry is enabled globally */
  enabled?: boolean;

  /** Default configuration for all instrumentation modules */
  defaultConfig?: InstrumentationConfig;

  /** Global attributes to add to all instrumented spans */
  globalAttributes?: Attributes;

  /** Whether to automatically detect and instrument known libraries */
  autoDetect?: boolean;

  /** Maximum number of instrumentation modules allowed */
  maxInstrumentations?: number;

  /** Whether to log instrumentation activities */
  enableLogging?: boolean;
}

/**
 * Default registry configuration
 */
export const DEFAULT_REGISTRY_CONFIG: Required<InstrumentationRegistryConfig> = {
  enabled: true,
  defaultConfig: DEFAULT_INSTRUMENTATION_CONFIG,
  globalAttributes: {},
  autoDetect: false,
  maxInstrumentations: 50,
  enableLogging: false,
};

/**
 * Registry events for monitoring instrumentation activities
 */
export interface InstrumentationEvents {
  /** Emitted when a library is successfully instrumented */
  instrumented: (target: InstrumentationTarget, instance: any) => void;

  /** Emitted when a library is successfully uninstrumented */
  uninstrumented: (target: InstrumentationTarget, instance: any) => void;

  /** Emitted when instrumentation fails */
  error: (target: InstrumentationTarget, error: Error) => void;

  /** Emitted when an instrumentation module is registered */
  registered: (instrumentation: IInstrumentation) => void;

  /** Emitted when an instrumentation module is unregistered */
  unregistered: (target: InstrumentationTarget) => void;
}

/**
 * Context information for instrumented method calls
 */
export interface InstrumentationContext {
  /** Method name being called */
  methodName: string;

  /** Arguments passed to the method */
  arguments: any[];

  /** Library instance the method was called on */
  instance: any;

  /** Instrumentation target type */
  target: InstrumentationTarget;

  /** Configuration used for this call */
  config: InstrumentationConfig;

  /** Timestamp when the call started */
  startTime: Date;

  /** Additional context attributes */
  attributes: Attributes;
}

/**
 * Error types for instrumentation system
 */
export class InstrumentationError extends Error {
  public readonly target?: InstrumentationTarget;
  public override readonly cause?: Error;

  override readonly name = 'InstrumentationError';

  constructor(message: string, target?: InstrumentationTarget, cause?: Error) {
    super(message);
    if (target !== undefined) {
      this.target = target;
    }
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export class UnsupportedLibraryError extends Error {
  constructor(target: InstrumentationTarget, version?: string) {
    super(
      `Library ${target}${version ? ` (version ${version})` : ''} is not supported for instrumentation`
    );
    this.name = 'UnsupportedLibraryError';
  }
}

export class InstrumentationConflictError extends Error {
  constructor(target: InstrumentationTarget) {
    super(`Instrumentation conflict: ${target} is already instrumented`);
    this.name = 'InstrumentationConflictError';
  }
}

/**
 * Hook types for method instrumentation
 */
export interface MethodHooks {
  /** Called before the original method */
  before?: (context: InstrumentationContext) => void | Promise<void>;

  /** Called after the original method completes successfully */
  after?: (context: InstrumentationContext, result: any) => void | Promise<void>;

  /** Called if the original method throws an error */
  error?: (context: InstrumentationContext, error: Error) => void | Promise<void>;

  /** Called regardless of success or failure */
  finally?: (context: InstrumentationContext) => void | Promise<void>;
}
