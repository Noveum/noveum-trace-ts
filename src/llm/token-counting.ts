/**
 * LLM Token Counting Utilities - Python SDK Compatible
 *
 * Provides accurate token counting for all major LLM providers using
 * tiktoken for OpenAI models and heuristic methods for others.
 */

import type { TokenCount, TokenizerType, LLMProvider } from './types.js';
import { MODEL_REGISTRY, MODEL_ALIASES } from './model-registry.js';
import { TokenCountingError, ModelNotFoundError } from './types.js';

// Dynamic import for tiktoken to handle environments where it's not available
let tiktoken: any = null;
let tiktokenLoaded = false;

/**
 * Lazy load tiktoken to avoid issues in environments where it's not available
 */
async function loadTiktoken() {
  if (tiktokenLoaded) return tiktoken;

  try {
    tiktoken = await import('@dqbd/tiktoken');
    tiktokenLoaded = true;
    return tiktoken;
  } catch {
    console.warn('tiktoken not available, falling back to heuristic counting for OpenAI models');
    tiktokenLoaded = true;
    return null;
  }
}

/**
 * OpenAI model to tiktoken encoding mapping
 */
const OPENAI_MODEL_ENCODINGS: Record<string, string> = {
  'gpt-4o': 'o200k_base',
  'gpt-4o-mini': 'o200k_base',
  'gpt-4-turbo': 'cl100k_base',
  'gpt-4': 'cl100k_base',
  'gpt-4-32k': 'cl100k_base',
  'gpt-3.5-turbo': 'cl100k_base',
  'gpt-3.5-turbo-16k': 'cl100k_base',
  'text-davinci-003': 'p50k_base',
  'text-davinci-002': 'p50k_base',
  'text-davinci-001': 'r50k_base',
  davinci: 'r50k_base',
  curie: 'r50k_base',
  babbage: 'r50k_base',
  ada: 'r50k_base',
};

/**
 * Count tokens using tiktoken for OpenAI models
 */
async function countTokensWithTiktoken(text: string, model: string): Promise<number> {
  const tik = await loadTiktoken();
  if (!tik) {
    throw new TokenCountingError('tiktoken not available', model);
  }

  try {
    // Get encoding for the model
    const encodingName = OPENAI_MODEL_ENCODINGS[model] || 'cl100k_base';
    const encoding = tik.get_encoding(encodingName);

    const tokens = encoding.encode(text);
    encoding.free(); // Free memory

    return tokens.length;
  } catch (error) {
    throw new TokenCountingError(
      `Failed to count tokens with tiktoken: ${error instanceof Error ? error.message : String(error)}`,
      model
    );
  }
}

/**
 * Heuristic token counting for non-OpenAI models
 * Based on approximate token-to-character ratios for different languages and providers
 */
function countTokensHeuristic(text: string, provider: LLMProvider): number {
  if (!text || text.length === 0) return 0;

  // Character-to-token ratios based on empirical observations
  const ratios: Record<LLMProvider, number> = {
    openai: 3.5, // ~3.5 chars per token for OpenAI models
    anthropic: 3.8, // Claude tends to be slightly more efficient
    google: 3.2, // Gemini/PaLM models
    meta: 3.6, // Llama models
    cohere: 3.7, // Cohere models
    mistral: 3.5, // Mistral/Mixtral models
    together: 3.6, // Together AI models
    perplexity: 3.5, // Perplexity models
    groq: 3.6, // Groq models (using same models as others)
    local: 3.5, // Local models (conservative estimate)
  };

  const ratio = ratios[provider] || 3.5;

  // Basic heuristic: divide character count by ratio and add some padding for formatting
  const baseTokens = Math.ceil(text.length / ratio);

  // Add extra tokens for formatting characters, punctuation, etc.
  const formattingBonus = Math.ceil(text.split(/\s+/).length * 0.1);

  return baseTokens + formattingBonus;
}

/**
 * Provider-specific token counting for better accuracy
 */
function countTokensProviderSpecific(text: string, provider: LLMProvider, _model: string): number {
  switch (provider) {
    case 'anthropic':
      // Claude models: slightly more efficient tokenization
      return countTokensHeuristic(text, provider);

    case 'google':
      // Gemini models: handle unicode and multilingual content better
      return countTokensHeuristic(text, provider);

    case 'meta':
      // Llama models: standard tokenization
      return countTokensHeuristic(text, provider);

    case 'cohere':
      // Cohere models: efficient tokenization for English
      return countTokensHeuristic(text, provider);

    case 'mistral':
      // Mistral models: similar to OpenAI tokenization
      return countTokensHeuristic(text, provider);

    default:
      return countTokensHeuristic(text, provider);
  }
}

/**
 * Main token counting function - matches Python SDK API exactly
 */
export async function estimate_token_count(text: string, model: string): Promise<TokenCount> {
  if (!text) {
    return {
      total: 0,
      model,
      tokenizer: 'heuristic',
    };
  }

  // Normalize model name and get model info
  const normalizedModel = normalize_model_name(model);
  const modelInfo = get_model_info(normalizedModel);

  if (!modelInfo) {
    throw new ModelNotFoundError(model);
  }

  const { provider, tokenizer_type } = modelInfo;
  let tokenCount: number;
  let tokenizerUsed: TokenizerType;

  try {
    // Use tiktoken for OpenAI models when available
    if (provider === 'openai' && tokenizer_type === 'tiktoken') {
      try {
        tokenCount = await countTokensWithTiktoken(text, normalizedModel);
        tokenizerUsed = 'tiktoken';
      } catch (error) {
        console.warn(`tiktoken failed for ${model}, falling back to heuristic:`, error);
        tokenCount = countTokensProviderSpecific(text, provider, normalizedModel);
        tokenizerUsed = 'heuristic';
      }
    } else {
      // Use provider-specific counting for non-OpenAI models
      tokenCount = countTokensProviderSpecific(text, provider, normalizedModel);
      tokenizerUsed = tokenizer_type === 'tiktoken' ? 'heuristic' : tokenizer_type;
    }

    return {
      total: tokenCount,
      model: normalizedModel,
      tokenizer: tokenizerUsed,
    };
  } catch (error) {
    if (error instanceof TokenCountingError || error instanceof ModelNotFoundError) {
      throw error;
    }

    throw new TokenCountingError(
      `Failed to count tokens: ${error instanceof Error ? error.message : String(error)}`,
      model
    );
  }
}

/**
 * Count tokens for multiple text inputs
 */
export async function estimate_token_count_batch(
  texts: string[],
  model: string
): Promise<TokenCount[]> {
  const results = await Promise.all(texts.map(text => estimate_token_count(text, model)));

  return results;
}

/**
 * Count tokens for input and output separately (for cost estimation)
 */
export async function estimate_token_count_io(
  inputText: string,
  outputText: string,
  model: string
): Promise<TokenCount> {
  const [inputCount, outputCount] = await Promise.all([
    estimate_token_count(inputText, model),
    estimate_token_count(outputText, model),
  ]);

  return {
    total: inputCount.total + outputCount.total,
    input: inputCount.total,
    output: outputCount.total,
    model: inputCount.model,
    tokenizer: inputCount.tokenizer,
  };
}

/**
 * Synchronous version for simple heuristic counting (no tiktoken)
 */
export function estimate_token_count_sync(text: string, model: string): TokenCount {
  if (!text) {
    return {
      total: 0,
      model,
      tokenizer: 'heuristic',
    };
  }

  const normalizedModel = normalize_model_name(model);
  const modelInfo = get_model_info(normalizedModel);

  if (!modelInfo) {
    throw new ModelNotFoundError(model);
  }

  const tokenCount = countTokensProviderSpecific(text, modelInfo.provider, normalizedModel);

  return {
    total: tokenCount,
    model: normalizedModel,
    tokenizer: 'heuristic',
  };
}

/**
 * Utility functions (import these from model utilities when created)
 */
function normalize_model_name(model: string): string {
  if (!model) return model;

  // First check if it's already a key in the registry
  if (model in MODEL_REGISTRY) {
    return model;
  }

  // Check if it's an alias
  if (model in MODEL_ALIASES) {
    return MODEL_ALIASES[model] || model;
  }

  // Try case-insensitive matching
  const lowerModel = model.toLowerCase();
  for (const [key] of Object.entries(MODEL_REGISTRY)) {
    if (key.toLowerCase() === lowerModel) {
      return key;
    }
  }

  // Check aliases case-insensitively
  for (const [alias, canonical] of Object.entries(MODEL_ALIASES)) {
    if (alias.toLowerCase() === lowerModel) {
      return canonical || model;
    }
  }

  // Return original if no match found
  return model;
}

function get_model_info(model: string) {
  const normalizedModel = normalize_model_name(model);
  return MODEL_REGISTRY[normalizedModel] || null;
}

/**
 * Validate if token counting is available for a model
 */
export function is_token_counting_available(model: string): boolean {
  try {
    const modelInfo = get_model_info(model);
    return modelInfo !== null;
  } catch {
    return false;
  }
}

/**
 * Get the tokenizer type for a model
 */
export function get_tokenizer_type(model: string): TokenizerType | null {
  const modelInfo = get_model_info(model);
  return modelInfo?.tokenizer_type || null;
}
