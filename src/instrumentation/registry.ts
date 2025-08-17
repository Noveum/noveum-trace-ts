/**
 * Auto-Instrumentation Registry
 *
 * Central registry for managing instrumentation modules that can automatically
 * patch and trace popular libraries like OpenAI, Anthropic, etc.
 */

import type {
  IInstrumentation,
  InstrumentationTarget,
  InstrumentationConfig,
  InstrumentationRegistryConfig,
  InstrumentedLibrary,
  InstrumentationEvents,
} from './types.js';

import { DEFAULT_REGISTRY_CONFIG } from './types.js';

/**
 * Event emitter for instrumentation events
 */
class InstrumentationEventEmitter {
  private listeners: Map<keyof InstrumentationEvents, Array<Function>> = new Map();

  on<K extends keyof InstrumentationEvents>(event: K, listener: InstrumentationEvents[K]): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener as any);
  }

  emit<K extends keyof InstrumentationEvents>(
    event: K,
    ...args: Parameters<InstrumentationEvents[K]>
  ): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(listener => (listener as any)(...args));
    }
  }

  off<K extends keyof InstrumentationEvents>(event: K, listener?: InstrumentationEvents[K]): void {
    if (!listener) {
      this.listeners.delete(event);
    } else {
      const listeners = this.listeners.get(event);
      if (listeners) {
        const index = listeners.indexOf(listener as any);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      }
    }
  }
}

/**
 * Central registry for managing auto-instrumentation modules
 */
export class InstrumentationRegistry {
  private readonly _config: Required<InstrumentationRegistryConfig>;
  private readonly _instrumentations = new Map<InstrumentationTarget, IInstrumentation>();
  private readonly _instrumentedLibraries = new Map<any, InstrumentedLibrary>();
  private readonly _events = new InstrumentationEventEmitter();
  private _isEnabled = true;

  constructor(config: InstrumentationRegistryConfig = {}) {
    this._config = { ...DEFAULT_REGISTRY_CONFIG, ...config };
    this._isEnabled = this._config.enabled;
  }

  /**
   * Register an instrumentation module
   * @param instrumentation - Instrumentation module to register
   */
  register(instrumentation: IInstrumentation): void {
    if (!this._isEnabled) {
      return;
    }

    if (this._instrumentations.size >= this._config.maxInstrumentations) {
      throw new Error(
        `Maximum number of instrumentations (${this._config.maxInstrumentations}) reached`
      );
    }

    if (this._instrumentations.has(instrumentation.target)) {
      throw new Error(`Instrumentation for ${instrumentation.target} is already registered`);
    }

    this._instrumentations.set(instrumentation.target, instrumentation);
    this._log(`Registered instrumentation for ${instrumentation.target}`);
    this._events.emit('registered', instrumentation);
  }

  /**
   * Unregister an instrumentation module
   * @param target - Target library type to unregister
   */
  unregister(target: InstrumentationTarget): void {
    const instrumentation = this._instrumentations.get(target);
    if (!instrumentation) {
      return;
    }

    // Uninstrument all libraries using this instrumentation
    for (const [instance, library] of this._instrumentedLibraries) {
      if (library.target === target) {
        void this.uninstrument(instance);
      }
    }

    this._instrumentations.delete(target);
    this._log(`Unregistered instrumentation for ${target}`);
    this._events.emit('unregistered', target);
  }

  /**
   * Instrument a library instance
   * @param instance - Library instance to instrument
   * @param target - Target library type (auto-detected if not provided)
   * @param config - Configuration options
   */
  async instrument(
    instance: any,
    target?: InstrumentationTarget,
    config?: InstrumentationConfig
  ): Promise<void> {
    if (!this._isEnabled) {
      return;
    }

    // Auto-detect target if not provided
    if (!target) {
      target = this._detectTarget(instance);
      if (!target) {
        throw new Error('Could not auto-detect library type and no target specified');
      }
    }

    // Check if already instrumented
    if (this._instrumentedLibraries.has(instance)) {
      throw new Error('Library instance is already instrumented');
    }

    // Get instrumentation module
    const instrumentation = this._instrumentations.get(target);
    if (!instrumentation) {
      throw new Error(`No instrumentation registered for ${target}`);
    }

    // Check if library is supported
    if (!instrumentation.isSupported(instance)) {
      const version = instrumentation.getLibraryVersion(instance);
      throw new Error(
        `Library ${target}${version ? ` (version ${version})` : ''} is not supported`
      );
    }

    try {
      // Merge configuration
      const finalConfig: InstrumentationConfig = {
        ...this._config.defaultConfig,
        ...config,
        attributes: {
          ...this._config.globalAttributes,
          ...this._config.defaultConfig.attributes,
          ...config?.attributes,
        },
      };

      // Apply instrumentation
      await instrumentation.instrument(instance, finalConfig);

      // Track instrumented library
      const libraryVersion = instrumentation.getLibraryVersion(instance);
      const instrumentedLibrary: InstrumentedLibrary = {
        target,
        instance,
        methods: new Map(),
        config: finalConfig,
        isInstrumented: true,
        instrumentedAt: new Date(),
        ...(libraryVersion && { version: libraryVersion }),
      };

      this._instrumentedLibraries.set(instance, instrumentedLibrary);
      this._log(`Instrumented ${target} library`);
      this._events.emit('instrumented', target, instance);
    } catch (error) {
      this._log(`Failed to instrument ${target}: ${error}`);
      this._events.emit('error', target, error as Error);
      throw error;
    }
  }

  /**
   * Remove instrumentation from a library instance
   * @param instance - Library instance to uninstrument
   */
  async uninstrument(instance: any): Promise<void> {
    const library = this._instrumentedLibraries.get(instance);
    if (!library) {
      return; // Not instrumented, nothing to do
    }

    const instrumentation = this._instrumentations.get(library.target);
    if (!instrumentation) {
      // Instrumentation module was unregistered, just remove from tracking
      this._instrumentedLibraries.delete(instance);
      return;
    }

    try {
      await instrumentation.uninstrument(instance);
      this._instrumentedLibraries.delete(instance);
      this._log(`Uninstrumented ${library.target} library`);
      this._events.emit('uninstrumented', library.target, instance);
    } catch (error) {
      this._log(`Failed to uninstrument ${library.target}: ${error}`);
      this._events.emit('error', library.target, error as Error);
      throw error;
    }
  }

  /**
   * Remove instrumentation from all library instances
   */
  async uninstrumentAll(): Promise<void> {
    const instances = Array.from(this._instrumentedLibraries.keys());

    for (const instance of instances) {
      try {
        await this.uninstrument(instance);
      } catch (error) {
        // Continue with other instances even if one fails
        this._log(`Failed to uninstrument instance: ${error}`);
      }
    }
  }

  /**
   * Check if a library instance is instrumented
   * @param instance - Library instance to check
   * @returns Whether the instance is instrumented
   */
  isInstrumented(instance: any): boolean {
    return this._instrumentedLibraries.has(instance);
  }

  /**
   * Get instrumentation information for a library instance
   * @param instance - Library instance
   * @returns Instrumentation information or undefined
   */
  getInstrumentationInfo(instance: any): InstrumentedLibrary | undefined {
    return this._instrumentedLibraries.get(instance);
  }

  /**
   * Get all registered instrumentation modules
   * @returns Map of registered instrumentations
   */
  getInstrumentations(): ReadonlyMap<InstrumentationTarget, IInstrumentation> {
    return this._instrumentations;
  }

  /**
   * Get all instrumented library instances
   * @returns Map of instrumented libraries
   */
  getInstrumentedLibraries(): ReadonlyMap<any, InstrumentedLibrary> {
    return this._instrumentedLibraries;
  }

  /**
   * Get registry configuration
   * @returns Current configuration
   */
  getConfig(): Required<InstrumentationRegistryConfig> {
    return { ...this._config };
  }

  /**
   * Update registry configuration
   * @param config - New configuration options
   */
  updateConfig(config: Partial<InstrumentationRegistryConfig>): void {
    Object.assign(this._config, config);
    if (config.enabled !== undefined) {
      this._isEnabled = config.enabled;
    }
  }

  /**
   * Enable the registry
   */
  enable(): void {
    this._isEnabled = true;
    this._config.enabled = true;
  }

  /**
   * Disable the registry (prevents new instrumentations)
   */
  disable(): void {
    this._isEnabled = false;
    this._config.enabled = false;
  }

  /**
   * Check if the registry is enabled
   * @returns Whether the registry is enabled
   */
  isEnabled(): boolean {
    return this._isEnabled;
  }

  /**
   * Subscribe to instrumentation events
   * @param event - Event type to listen for
   * @param listener - Event listener function
   */
  on<K extends keyof InstrumentationEvents>(event: K, listener: InstrumentationEvents[K]): void {
    this._events.on(event, listener);
  }

  /**
   * Unsubscribe from instrumentation events
   * @param event - Event type to stop listening for
   * @param listener - Optional specific listener to remove
   */
  off<K extends keyof InstrumentationEvents>(event: K, listener?: InstrumentationEvents[K]): void {
    this._events.off(event, listener);
  }

  /**
   * Get registry statistics
   * @returns Statistics about the registry
   */
  getStats(): {
    registeredInstrumentations: number;
    instrumentedLibraries: number;
    isEnabled: boolean;
    targets: InstrumentationTarget[];
  } {
    return {
      registeredInstrumentations: this._instrumentations.size,
      instrumentedLibraries: this._instrumentedLibraries.size,
      isEnabled: this._isEnabled,
      targets: Array.from(this._instrumentations.keys()),
    };
  }

  /**
   * Auto-detect the target library type from an instance
   * @param instance - Library instance to analyze
   * @returns Detected target type or undefined
   */
  private _detectTarget(instance: any): InstrumentationTarget | undefined {
    // Try each registered instrumentation to see if it supports this instance
    for (const [target, instrumentation] of this._instrumentations) {
      if (instrumentation.isSupported(instance)) {
        return target;
      }
    }

    // Fallback heuristics based on common patterns
    if (instance && typeof instance === 'object') {
      // Check constructor name
      const constructorName = instance.constructor?.name?.toLowerCase();
      if (constructorName?.includes('openai')) return 'openai';
      if (constructorName?.includes('anthropic')) return 'anthropic';

      // Check for common properties/methods
      if (instance.chat?.completions || instance.completions) return 'openai';
      if (instance.messages?.create || instance.completions?.create) return 'anthropic';
    }

    return undefined;
  }

  /**
   * Log a message if logging is enabled
   * @param message - Message to log
   */
  private _log(message: string): void {
    if (this._config.enableLogging) {
      console.log(`[InstrumentationRegistry] ${message}`);
    }
  }
}

/**
 * Global registry instance
 */
let globalRegistry: InstrumentationRegistry | undefined;

/**
 * Get the global instrumentation registry
 * @returns Global registry instance
 */
export function getGlobalInstrumentationRegistry(): InstrumentationRegistry {
  if (!globalRegistry) {
    globalRegistry = new InstrumentationRegistry();
  }
  return globalRegistry;
}

/**
 * Set the global instrumentation registry
 * @param registry - Registry instance to set as global
 */
export function setGlobalInstrumentationRegistry(registry: InstrumentationRegistry): void {
  globalRegistry = registry;
}

/**
 * Create a new instrumentation registry with optional configuration
 * @param config - Optional configuration for the registry
 * @returns New InstrumentationRegistry instance
 */
export function createInstrumentationRegistry(
  config?: Partial<InstrumentationRegistryConfig>
): InstrumentationRegistry {
  return new InstrumentationRegistry(config);
}
