/**
 * LLM-specific trace decorator with token counting and cost estimation
 */

import type { Attributes } from '../core/types.js';
import { trace, TraceOptions } from './base.js';

/**
 * LLM operation metadata
 */
export interface LLMMetadata {
  /** Model name or identifier */
  model?: string;
  /** Number of input/prompt tokens */
  inputTokens?: number;
  /** Number of output/completion tokens */
  outputTokens?: number;
  /** Total tokens used */
  totalTokens?: number;
  /** Estimated cost in USD */
  estimatedCost?: number;
  /** Provider (openai, anthropic, etc.) */
  provider?: string;
  /** Temperature setting */
  temperature?: number;
  /** Max tokens setting */
  maxTokens?: number;
  /** Other model parameters */
  parameters?: Record<string, any>;
}

/**
 * Options for the LLM trace decorator
 */
export interface TraceLLMOptions extends Omit<TraceOptions, 'attributes'> {
  /** LLM-specific metadata */
  llmMetadata?: Partial<LLMMetadata>;
  /** Additional attributes */
  attributes?: Attributes;
  /** Whether to automatically extract token info from result */
  autoExtractTokens?: boolean;
  /** Whether to estimate costs */
  estimateCosts?: boolean;
}

/**
 * Token extraction function type
 */
type TokenExtractor = (result: any) => Partial<LLMMetadata>;

/**
 * Cost calculation function type
 */
type CostCalculator = (metadata: LLMMetadata) => number;

/**
 * Default cost rates per 1K tokens (USD)
 */
const DEFAULT_COST_RATES: Record<string, { input: number; output: number }> = {
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4-32k': { input: 0.06, output: 0.12 },
  'gpt-3.5-turbo': { input: 0.0015, output: 0.002 },
  'gpt-3.5-turbo-16k': { input: 0.003, output: 0.004 },
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
};

/**
 * Default token extractor for common LLM response formats
 */
const defaultTokenExtractor: TokenExtractor = (result: any): Partial<LLMMetadata> => {
  if (result && typeof result === 'object') {
    // OpenAI format
    if (result.usage) {
      return {
        inputTokens: result.usage.prompt_tokens,
        outputTokens: result.usage.completion_tokens,
        totalTokens: result.usage.total_tokens,
      };
    }

    // Anthropic format
    if (result.usage) {
      return {
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens,
        totalTokens: (result.usage.input_tokens || 0) + (result.usage.output_tokens || 0),
      };
    }

    // Generic format
    if (result.tokens || result.token_count) {
      const tokens = result.tokens || result.token_count;
      return {
        totalTokens: tokens,
      };
    }
  }

  return {};
};

/**
 * Default cost calculator
 */
const defaultCostCalculator: CostCalculator = (metadata: LLMMetadata): number => {
  if (!metadata.model || !metadata.inputTokens || !metadata.outputTokens) {
    return 0;
  }

  const rates = DEFAULT_COST_RATES[metadata.model];
  if (!rates) {
    return 0;
  }

  const inputCost = (metadata.inputTokens / 1000) * rates.input;
  const outputCost = (metadata.outputTokens / 1000) * rates.output;

  return Math.round((inputCost + outputCost) * 10000) / 10000; // Round to 4 decimal places
};

/**
 * LLM trace decorator for tracing Large Language Model operations
 *
 * @param options - Configuration options for the LLM decorator
 * @returns Decorator function
 *
 * @example
 * class OpenAIService {
 *   @traceLLM({
 *     name: 'chat-completion',
 *     llmMetadata: { model: 'gpt-4', provider: 'openai' }
 *   })
 *   async createChatCompletion(messages: any[]) {
 *     // LLM API call
 *     return await openai.chat.completions.create({
 *       model: 'gpt-4',
 *       messages
 *     });
 *   }
 * }
 */
export function traceLLM(options: TraceLLMOptions = {}): any {
  const {
    llmMetadata = {},
    autoExtractTokens = true,
    estimateCosts = true,
    attributes = {},
    ...traceOptions
  } = options;

  // Build attributes from LLM metadata
  const llmAttributes: Attributes = {
    ...attributes,
    'llm.operation_type': 'inference',
    'decorator.type': 'traceLLM',
  };

  // Add known LLM metadata to attributes
  if (llmMetadata.model) llmAttributes['llm.model'] = llmMetadata.model;
  if (llmMetadata.provider) llmAttributes['llm.provider'] = llmMetadata.provider;
  if (llmMetadata.temperature !== undefined)
    llmAttributes['llm.temperature'] = llmMetadata.temperature;
  if (llmMetadata.maxTokens !== undefined) llmAttributes['llm.max_tokens'] = llmMetadata.maxTokens;
  if (llmMetadata.parameters) {
    Object.entries(llmMetadata.parameters).forEach(([key, value]) => {
      llmAttributes[`llm.parameter.${key}`] = value;
    });
  }

  // Create enhanced trace decorator
  return trace({
    ...traceOptions,
    attributes: llmAttributes,
  })(function decorator(
    target: any,
    _propertyKey?: string | symbol,
    descriptor?: PropertyDescriptor
  ) {
    // Get the original method/function
    const original = descriptor?.value || target;

    // Create wrapper that extracts LLM metadata
    const wrapper = async function (this: any, ...args: any[]) {
      const startTime = Date.now();

      try {
        // Call original function
        const result = await Promise.resolve(original.apply(this, args));

        // Extract token information if enabled
        if (autoExtractTokens && result) {
          const extractedMetadata = defaultTokenExtractor(result);
          const finalMetadata: LLMMetadata = {
            ...llmMetadata,
            ...extractedMetadata,
          };

          // Calculate costs if enabled
          if (estimateCosts && finalMetadata.inputTokens && finalMetadata.outputTokens) {
            finalMetadata.estimatedCost = defaultCostCalculator(finalMetadata);
          }

          // Add extracted metadata to current span
          const currentSpan = require('../context/context-manager.js').getCurrentSpan();
          if (currentSpan) {
            // Add token metrics
            if (finalMetadata.inputTokens) {
              currentSpan.setAttribute('llm.usage.input_tokens', finalMetadata.inputTokens);
            }
            if (finalMetadata.outputTokens) {
              currentSpan.setAttribute('llm.usage.output_tokens', finalMetadata.outputTokens);
            }
            if (finalMetadata.totalTokens) {
              currentSpan.setAttribute('llm.usage.total_tokens', finalMetadata.totalTokens);
            }
            if (finalMetadata.estimatedCost !== undefined) {
              currentSpan.setAttribute('llm.usage.estimated_cost_usd', finalMetadata.estimatedCost);
            }

            // Add performance metrics
            const endTime = Date.now();
            const duration = endTime - startTime;
            currentSpan.setAttribute('llm.response_time_ms', duration);

            if (finalMetadata.totalTokens && duration > 0) {
              const tokensPerSecond =
                Math.round((finalMetadata.totalTokens / duration) * 1000 * 100) / 100;
              currentSpan.setAttribute('llm.tokens_per_second', tokensPerSecond);
            }
          }
        }

        return result;
      } catch (error) {
        // Add error-specific LLM attributes
        const currentSpan = require('../context/context-manager.js').getCurrentSpan();
        if (currentSpan) {
          currentSpan.setAttribute('llm.error', true);
          if (error instanceof Error) {
            currentSpan.setAttribute('llm.error_type', error.constructor.name);
          }
        }
        throw error;
      }
    };

    // Apply the wrapper based on decoration type
    if (descriptor) {
      descriptor.value = wrapper;
      return descriptor;
    } else {
      return wrapper;
    }
  });
}

/**
 * Simple LLM trace decorator without options
 */
export const simpleLLMTrace = traceLLM();

/**
 * Create a reusable LLM decorator with preset options
 *
 * @param defaultOptions - Default options for the LLM decorator
 * @returns LLM decorator factory
 *
 * @example
 * const traceOpenAI = createLLMDecorator({
 *   llmMetadata: { provider: 'openai' },
 *   autoExtractTokens: true,
 *   estimateCosts: true
 * });
 *
 * class OpenAIService {
 *   @traceOpenAI({ llmMetadata: { model: 'gpt-4' } })
 *   async chat(messages: any[]) {
 *     // implementation
 *   }
 * }
 */
export function createLLMDecorator(defaultOptions: TraceLLMOptions) {
  return function (options: Partial<TraceLLMOptions> = {}) {
    return traceLLM({
      ...defaultOptions,
      ...options,
      llmMetadata: {
        ...defaultOptions.llmMetadata,
        ...options.llmMetadata,
      },
      attributes: {
        ...defaultOptions.attributes,
        ...options.attributes,
      },
    });
  };
}

/**
 * Update cost rates for specific models
 *
 * @param model - Model name
 * @param rates - Input and output cost rates per 1K tokens
 */
export function updateCostRates(model: string, rates: { input: number; output: number }) {
  DEFAULT_COST_RATES[model] = rates;
}

/**
 * Get current cost rates
 */
export function getCostRates(): Record<string, { input: number; output: number }> {
  return { ...DEFAULT_COST_RATES };
}
