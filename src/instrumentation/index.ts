/**
 * Auto-Instrumentation System
 *
 * Provides automatic instrumentation for popular LLM libraries with
 * convenient setup functions and comprehensive tracing capabilities.
 */

// Export core types and interfaces
export type {
  InstrumentationTarget,
  InstrumentationConfig,
  InstrumentationRegistryConfig,
  InstrumentedLibrary,
  InstrumentationEvents,
  InstrumentationContext,
  IInstrumentation,
  MethodHooks,
} from './types.js';

export {
  DEFAULT_INSTRUMENTATION_CONFIG,
  DEFAULT_REGISTRY_CONFIG,
  InstrumentationError,
  UnsupportedLibraryError,
  InstrumentationConflictError,
} from './types.js';

// Export core classes
export { BaseInstrumentation } from './base.js';
export {
  InstrumentationRegistry,
  getGlobalInstrumentationRegistry,
  setGlobalInstrumentationRegistry,
  createInstrumentationRegistry,
} from './registry.js';

// Export specific instrumentation implementations
export { OpenAIInstrumentation } from './openai.js';
export { AnthropicInstrumentation } from './anthropic.js';

// Convenience functions for easy setup
import { getGlobalInstrumentationRegistry } from './registry.js';
import { OpenAIInstrumentation } from './openai.js';
import { AnthropicInstrumentation } from './anthropic.js';
import type { InstrumentationConfig } from './types.js';

/**
 * Automatically instrument an OpenAI SDK instance
 * @param openaiClient - OpenAI client instance to instrument
 * @param config - Optional configuration for instrumentation
 * @returns Promise that resolves when instrumentation is complete
 *
 * @example
 * import OpenAI from 'openai';
 * import { autoTraceOpenAI } from '@noveum/traces';
 *
 * const client = new OpenAI({ apiKey: 'your-key' });
 * await autoTraceOpenAI(client, { estimateCosts: true });
 *
 * // Now all OpenAI calls will be automatically traced
 * const response = await client.chat.completions.create({
 *   model: 'gpt-4',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 */
export async function autoTraceOpenAI(
  openaiClient: any,
  config?: InstrumentationConfig
): Promise<void> {
  const registry = getGlobalInstrumentationRegistry();

  // Register OpenAI instrumentation if not already registered
  if (!registry.getInstrumentations().has('openai')) {
    const openaiInstrumentation = new OpenAIInstrumentation(config);
    registry.register(openaiInstrumentation);
  }

  // Instrument the client
  await registry.instrument(openaiClient, 'openai', config);
}

/**
 * Automatically instrument an Anthropic SDK instance
 * @param anthropicClient - Anthropic client instance to instrument
 * @param config - Optional configuration for instrumentation
 * @returns Promise that resolves when instrumentation is complete
 *
 * @example
 * import Anthropic from '@anthropic-ai/sdk';
 * import { autoTraceAnthropic } from '@noveum/traces';
 *
 * const client = new Anthropic({ apiKey: 'your-key' });
 * await autoTraceAnthropic(client, { estimateCosts: true });
 *
 * // Now all Anthropic calls will be automatically traced
 * const response = await client.messages.create({
 *   model: 'claude-3-sonnet-20240229',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 */
export async function autoTraceAnthropic(
  anthropicClient: any,
  config?: InstrumentationConfig
): Promise<void> {
  const registry = getGlobalInstrumentationRegistry();

  // Register Anthropic instrumentation if not already registered
  if (!registry.getInstrumentations().has('anthropic')) {
    const anthropicInstrumentation = new AnthropicInstrumentation(config);
    registry.register(anthropicInstrumentation);
  }

  // Instrument the client
  await registry.instrument(anthropicClient, 'anthropic', config);
}

/**
 * Automatically instrument multiple LLM clients
 * @param clients - Object mapping client types to instances
 * @param config - Optional configuration for instrumentation
 * @returns Promise that resolves when all instrumentations are complete
 *
 * @example
 * import OpenAI from 'openai';
 * import Anthropic from '@anthropic-ai/sdk';
 * import { autoTraceAll } from '@noveum/traces';
 *
 * const openai = new OpenAI({ apiKey: 'openai-key' });
 * const anthropic = new Anthropic({ apiKey: 'anthropic-key' });
 *
 * await autoTraceAll({
 *   openai,
 *   anthropic,
 * }, { estimateCosts: true });
 */
export async function autoTraceAll(
  clients: {
    openai?: any;
    anthropic?: any;
  },
  config?: InstrumentationConfig
): Promise<void> {
  const promises: Promise<void>[] = [];

  if (clients.openai) {
    promises.push(autoTraceOpenAI(clients.openai, config));
  }

  if (clients.anthropic) {
    promises.push(autoTraceAnthropic(clients.anthropic, config));
  }

  await Promise.all(promises);
}

/**
 * Remove instrumentation from an OpenAI client
 * @param openaiClient - OpenAI client instance to uninstrument
 * @returns Promise that resolves when uninstrumentation is complete
 */
export async function stopTracingOpenAI(openaiClient: any): Promise<void> {
  const registry = getGlobalInstrumentationRegistry();
  await registry.uninstrument(openaiClient);
}

/**
 * Remove instrumentation from an Anthropic client
 * @param anthropicClient - Anthropic client instance to uninstrument
 * @returns Promise that resolves when uninstrumentation is complete
 */
export async function stopTracingAnthropic(anthropicClient: any): Promise<void> {
  const registry = getGlobalInstrumentationRegistry();
  await registry.uninstrument(anthropicClient);
}

/**
 * Remove instrumentation from all LLM clients
 * @returns Promise that resolves when all uninstrumentations are complete
 */
export async function stopTracingAll(): Promise<void> {
  const registry = getGlobalInstrumentationRegistry();
  await registry.uninstrumentAll();
}

/**
 * Check if a client instance is currently instrumented
 * @param client - Client instance to check
 * @returns Whether the client is instrumented
 */
export function isTraced(client: any): boolean {
  const registry = getGlobalInstrumentationRegistry();
  return registry.isInstrumented(client);
}

/**
 * Get instrumentation information for a client
 * @param client - Client instance to get info for
 * @returns Instrumentation information or undefined if not instrumented
 */
export function getTracingInfo(client: any) {
  const registry = getGlobalInstrumentationRegistry();
  return registry.getInstrumentationInfo(client);
}

/**
 * Get registry statistics
 * @returns Current instrumentation registry statistics
 */
export function getRegistryStats() {
  const registry = getGlobalInstrumentationRegistry();
  return registry.getStats();
}

/**
 * Configure the global instrumentation registry
 * @param config - Registry configuration options
 */
export function configureInstrumentation(config: Partial<InstrumentationConfig>): void {
  const registry = getGlobalInstrumentationRegistry();
  registry.updateConfig(config);
}

/**
 * Enable automatic instrumentation
 */
export function enableInstrumentation(): void {
  const registry = getGlobalInstrumentationRegistry();
  registry.enable();
}

/**
 * Disable automatic instrumentation
 */
export function disableInstrumentation(): void {
  const registry = getGlobalInstrumentationRegistry();
  registry.disable();
}

/**
 * Check if automatic instrumentation is enabled
 * @returns Whether instrumentation is enabled
 */
export function isInstrumentationEnabled(): boolean {
  const registry = getGlobalInstrumentationRegistry();
  return registry.isEnabled();
}

/**
 * Advanced: Register a custom instrumentation module
 * @param instrumentation - Custom instrumentation implementation
 */
export function registerInstrumentation(instrumentation: any): void {
  const registry = getGlobalInstrumentationRegistry();
  registry.register(instrumentation);
}

/**
 * Advanced: Unregister an instrumentation module
 * @param target - Target library type to unregister
 */
export function unregisterInstrumentation(target: string): void {
  const registry = getGlobalInstrumentationRegistry();
  registry.unregister(target as any);
}
