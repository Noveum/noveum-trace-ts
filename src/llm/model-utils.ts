/**
 * LLM Model Utilities - Python SDK Compatible
 *
 * Provides utility functions for model lookup, normalization, provider detection,
 * and model management that match the Python SDK's implementation exactly.
 */

import type { ModelInfo, LLMProvider } from './types.js';
import {
  MODEL_REGISTRY,
  MODEL_ALIASES,
  getSupportedProviders,
  getAllModelNames,
  hasModel,
  getModelCount,
} from './model-registry.js';

/**
 * Get complete model information for a given model name - matches Python SDK API exactly
 */
export function get_model_info(model: string): ModelInfo | null {
  if (!model) return null;

  const normalizedModel = normalize_model_name(model);
  return MODEL_REGISTRY[normalizedModel] || null;
}

/**
 * Normalize model name with comprehensive alias resolution - matches Python SDK API exactly
 */
export function normalize_model_name(model: string): string {
  if (!model) return model;

  // Step 1: Direct registry lookup
  if (model in MODEL_REGISTRY) {
    return model;
  }

  // Step 2: Direct alias lookup
  if (model in MODEL_ALIASES) {
    return MODEL_ALIASES[model] || model;
  }

  // Step 3: Case-insensitive registry lookup
  const lowerModel = model.toLowerCase();
  for (const [key] of Object.entries(MODEL_REGISTRY)) {
    if (key.toLowerCase() === lowerModel) {
      return key;
    }
  }

  // Step 4: Case-insensitive alias lookup
  for (const [alias, canonical] of Object.entries(MODEL_ALIASES)) {
    if (alias.toLowerCase() === lowerModel) {
      return canonical || model;
    }
  }

  // Step 5: Provider-specific normalization
  const providerNormalized = normalizeProviderSpecific(model);
  if (providerNormalized !== model && providerNormalized in MODEL_REGISTRY) {
    return providerNormalized;
  }

  // Step 6: Fuzzy matching for common variations
  const fuzzyMatch = performFuzzyMatching(model);
  if (fuzzyMatch && fuzzyMatch !== model && fuzzyMatch in MODEL_REGISTRY) {
    return fuzzyMatch;
  }

  // Return original if no normalization possible
  return model;
}

/**
 * Detect LLM provider from model name - matches Python SDK API exactly
 */
export function detect_llm_provider(model: string): LLMProvider | null {
  if (!model) return null;

  // First try to get model info directly
  const modelInfo = get_model_info(model);
  if (modelInfo) {
    return modelInfo.provider;
  }

  // Provider detection based on model name patterns
  const lowerModel = model.toLowerCase();

  // OpenAI patterns
  if (
    lowerModel.includes('gpt') ||
    lowerModel.includes('davinci') ||
    lowerModel.includes('curie') ||
    lowerModel.includes('babbage') ||
    lowerModel.includes('ada') ||
    lowerModel.includes('text-') ||
    lowerModel.includes('code-') ||
    lowerModel.includes('edit-')
  ) {
    return 'openai';
  }

  // Anthropic patterns
  if (lowerModel.includes('claude') || lowerModel.includes('anthropic')) {
    return 'anthropic';
  }

  // Google patterns
  if (
    lowerModel.includes('gemini') ||
    lowerModel.includes('palm') ||
    lowerModel.includes('bison') ||
    lowerModel.includes('gecko') ||
    lowerModel.includes('google')
  ) {
    return 'google';
  }

  // Meta patterns
  if (
    lowerModel.includes('llama') ||
    lowerModel.includes('meta') ||
    lowerModel.includes('code-llama')
  ) {
    return 'meta';
  }

  // Cohere patterns
  if (lowerModel.includes('command') || lowerModel.includes('cohere')) {
    return 'cohere';
  }

  // Mistral patterns
  if (lowerModel.includes('mistral') || lowerModel.includes('mixtral')) {
    return 'mistral';
  }

  // Together AI patterns
  if (
    lowerModel.includes('together') ||
    lowerModel.includes('qwen') ||
    lowerModel.includes('deepseek') ||
    lowerModel.startsWith('yi-')
  ) {
    return 'together';
  }

  // Perplexity patterns
  if (lowerModel.includes('pplx') || lowerModel.includes('perplexity')) {
    return 'perplexity';
  }

  // Groq patterns (they host other models, so check for Groq-specific indicators)
  if (
    lowerModel.includes('groq') ||
    lowerModel.includes('-groq') ||
    lowerModel.includes('versatile') ||
    lowerModel.includes('instant')
  ) {
    return 'groq';
  }

  return null;
}

/**
 * Get all supported models, optionally filtered by provider - matches Python SDK API exactly
 */
export function get_supported_models(provider?: LLMProvider): string[] {
  if (provider) {
    return Object.entries(MODEL_REGISTRY)
      .filter(([_, model]) => model.provider === provider)
      .map(([key]) => key)
      .sort();
  }

  return getAllModelNames().sort();
}

/**
 * Get all supported providers - matches Python SDK API exactly
 */
export function get_supported_providers(): LLMProvider[] {
  return getSupportedProviders().sort();
}

/**
 * Check if a model is supported (exists in registry) - matches Python SDK API exactly
 */
export function is_model_supported(model: string): boolean {
  return hasModel(model);
}

/**
 * Get model count in registry - matches Python SDK API exactly
 */
export function get_model_count(): number {
  return getModelCount();
}

/**
 * Get models by capability (vision, audio, function calling) - matches Python SDK API exactly
 */
export function get_models_by_capability(
  supports_vision?: boolean,
  supports_audio?: boolean,
  supports_function_calling?: boolean
): string[] {
  return Object.entries(MODEL_REGISTRY)
    .filter(([_, model]) => {
      if (supports_vision !== undefined && model.supports_vision !== supports_vision) {
        return false;
      }
      if (supports_audio !== undefined && model.supports_audio !== supports_audio) {
        return false;
      }
      if (
        supports_function_calling !== undefined &&
        model.supports_function_calling !== supports_function_calling
      ) {
        return false;
      }
      return true;
    })
    .map(([key]) => key)
    .sort();
}

/**
 * Get models by context window size - matches Python SDK API exactly
 */
export function get_models_by_context_window(
  min_context_window?: number,
  max_context_window?: number
): string[] {
  return Object.entries(MODEL_REGISTRY)
    .filter(([_, model]) => {
      if (min_context_window !== undefined && model.context_window < min_context_window) {
        return false;
      }
      if (max_context_window !== undefined && model.context_window > max_context_window) {
        return false;
      }
      return true;
    })
    .map(([key]) => key)
    .sort();
}

/**
 * Get models by training cutoff date - matches Python SDK API exactly
 */
export function get_models_by_training_cutoff(after_date?: string, before_date?: string): string[] {
  return Object.entries(MODEL_REGISTRY)
    .filter(([_, model]) => {
      const cutoffDate = new Date(model.training_cutoff);

      if (after_date && cutoffDate <= new Date(after_date)) {
        return false;
      }
      if (before_date && cutoffDate >= new Date(before_date)) {
        return false;
      }
      return true;
    })
    .map(([key]) => key)
    .sort();
}

/**
 * Get cheapest models for input/output token counts - matches Python SDK API exactly
 */
export function get_cheapest_models(
  input_tokens: number = 1000,
  output_tokens: number = 1000,
  providers?: LLMProvider[],
  limit: number = 10
): Array<{ model: string; cost_per_1k_tokens: number; total_cost: number }> {
  const modelsToCheck = providers
    ? Object.entries(MODEL_REGISTRY).filter(([_, model]) => providers.includes(model.provider))
    : Object.entries(MODEL_REGISTRY);

  const modelCosts = modelsToCheck.map(([modelName, model]) => {
    const inputCost = (input_tokens * model.input_cost_per_1m) / 1_000_000;
    const outputCost = (output_tokens * model.output_cost_per_1m) / 1_000_000;
    const totalCost = inputCost + outputCost;
    const costPer1k = (totalCost * 1000) / (input_tokens + output_tokens);

    return {
      model: modelName,
      cost_per_1k_tokens: Math.round(costPer1k * 1_000_000) / 1_000_000,
      total_cost: Math.round(totalCost * 1_000_000) / 1_000_000,
    };
  });

  return modelCosts.sort((a, b) => a.total_cost - b.total_cost).slice(0, limit);
}

/**
 * Get model aliases for a given model - matches Python SDK API exactly
 */
export function get_model_aliases(model: string): string[] {
  const normalizedModel = normalize_model_name(model);
  const modelInfo = MODEL_REGISTRY[normalizedModel];

  if (!modelInfo || !modelInfo.aliases) {
    return [];
  }

  return [...modelInfo.aliases];
}

/**
 * Search models by name pattern - matches Python SDK API exactly
 */
export function search_models(pattern: string, case_sensitive: boolean = false): string[] {
  if (!pattern) return [];

  const searchPattern = case_sensitive ? pattern : pattern.toLowerCase();

  return Object.keys(MODEL_REGISTRY)
    .filter(modelName => {
      const searchTarget = case_sensitive ? modelName : modelName.toLowerCase();
      return searchTarget.includes(searchPattern);
    })
    .sort();
}

/**
 * Get model summary statistics - matches Python SDK API exactly
 */
export function get_model_stats(): {
  total_models: number;
  providers: Record<LLMProvider, number>;
  capabilities: {
    vision_models: number;
    audio_models: number;
    function_calling_models: number;
  };
  context_windows: {
    min: number;
    max: number;
    average: number;
  };
} {
  const models = Object.values(MODEL_REGISTRY);

  // Provider counts
  const providers = {} as Record<LLMProvider, number>;
  models.forEach(model => {
    providers[model.provider] = (providers[model.provider] || 0) + 1;
  });

  // Capability counts
  const visionModels = models.filter(m => m.supports_vision).length;
  const audioModels = models.filter(m => m.supports_audio).length;
  const functionCallingModels = models.filter(m => m.supports_function_calling).length;

  // Context window stats
  const contextWindows = models.map(m => m.context_window);
  const minContext = Math.min(...contextWindows);
  const maxContext = Math.max(...contextWindows);
  const avgContext = Math.round(contextWindows.reduce((a, b) => a + b, 0) / contextWindows.length);

  return {
    total_models: models.length,
    providers,
    capabilities: {
      vision_models: visionModels,
      audio_models: audioModels,
      function_calling_models: functionCallingModels,
    },
    context_windows: {
      min: minContext,
      max: maxContext,
      average: avgContext,
    },
  };
}

/**
 * Provider-specific model name normalization
 */
function normalizeProviderSpecific(model: string): string {
  const lower = model.toLowerCase();

  // OpenAI normalizations
  if (lower.includes('gpt')) {
    // Handle common variations
    if (lower === 'gpt4' || lower === 'gpt-4') return 'gpt-4';
    if (lower === 'gpt4o' || lower === 'gpt-4o') return 'gpt-4o';
    if (lower === 'gpt4-turbo' || lower === 'gpt4turbo') return 'gpt-4-turbo';
    if (lower === 'gpt35' || lower === 'gpt-35' || lower === 'gpt3.5') return 'gpt-3.5-turbo';
  }

  // Anthropic normalizations
  if (lower.includes('claude')) {
    if (lower === 'claude3.5' || lower === 'claude-3.5' || lower === 'claude35')
      return 'claude-3-5-sonnet';
    if (lower === 'claude3' || lower === 'claude-3') return 'claude-3-sonnet';
    if (lower === 'claude2' || lower === 'claude-2') return 'claude-2';
  }

  // Google normalizations
  if (lower.includes('gemini')) {
    if (lower === 'gemini15' || lower === 'gemini-15' || lower === 'gemini1.5')
      return 'gemini-1.5-pro';
    if (lower === 'gemini10' || lower === 'gemini-10' || lower === 'gemini1.0')
      return 'gemini-1.0-pro';
  }

  return model;
}

/**
 * Fuzzy matching for model names with common typos and variations
 */
function performFuzzyMatching(model: string): string {
  const lower = model.toLowerCase();

  // Common typos and variations
  const fuzzyMappings: Record<string, string> = {
    gpt4o: 'gpt-4o',
    'gpt-4-omni': 'gpt-4o',
    chatgpt: 'gpt-3.5-turbo',
    claude35: 'claude-3-5-sonnet',
    'claude3.5': 'claude-3-5-sonnet',
    'claude-3.5-sonnet': 'claude-3-5-sonnet',
    gemini15: 'gemini-1.5-pro',
    'gemini1.5': 'gemini-1.5-pro',
    'llama3.1': 'llama-3.1-70b',
    llama31: 'llama-3.1-70b',
    mistral8x7b: 'mixtral-8x7b',
    mixtral8x7b: 'mixtral-8x7b',
  };

  return fuzzyMappings[lower] || model;
}
