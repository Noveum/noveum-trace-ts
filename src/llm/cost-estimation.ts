/**
 * LLM Cost Estimation Utilities - Python SDK Compatible
 *
 * Provides accurate cost estimation for all major LLM providers using
 * up-to-date pricing information and token counting.
 */

import type { CostEstimate, CostEstimateResult, ModelInfo } from './types.js';
import { MODEL_REGISTRY } from './model-registry.js';
import { CostEstimationError, ModelNotFoundError } from './types.js';
import { estimate_token_count, estimate_token_count_io } from './token-counting.js';

/**
 * Estimate cost for a single text input - matches Python SDK API exactly
 */
export async function estimate_cost(
  inputText: string,
  model: string,
  outputText: string = ''
): Promise<CostEstimate> {
  // Get model info
  const modelInfo = getModelInfo(model);
  if (!modelInfo) {
    throw new ModelNotFoundError(model);
  }

  try {
    // Count tokens for input and output
    const tokenCount = await estimate_token_count_io(inputText, outputText, model);

    // Calculate costs
    const inputCost = ((tokenCount.input || 0) * modelInfo.input_cost_per_1m) / 1_000_000;
    const outputCost = ((tokenCount.output || 0) * modelInfo.output_cost_per_1m) / 1_000_000;
    const totalCost = inputCost + outputCost;

    return {
      input_cost: Math.round(inputCost * 1_000_000) / 1_000_000, // Round to 6 decimal places
      output_cost: Math.round(outputCost * 1_000_000) / 1_000_000,
      total_cost: Math.round(totalCost * 1_000_000) / 1_000_000,
      currency: 'USD',
      input_tokens: tokenCount.input || 0,
      output_tokens: tokenCount.output || 0,
      model: tokenCount.model,
      rates: {
        input_rate_per_1m: modelInfo.input_cost_per_1m,
        output_rate_per_1m: modelInfo.output_cost_per_1m,
      },
    };
  } catch (error) {
    if (error instanceof ModelNotFoundError) {
      throw error;
    }

    throw new CostEstimationError(
      `Failed to estimate cost: ${error instanceof Error ? error.message : String(error)}`,
      model
    );
  }
}

/**
 * Estimate cost using pre-calculated token counts
 */
export function estimate_cost_from_tokens(
  inputTokens: number,
  outputTokens: number,
  model: string
): CostEstimate {
  const modelInfo = getModelInfo(model);
  if (!modelInfo) {
    throw new ModelNotFoundError(model);
  }

  try {
    // Calculate costs
    const inputCost = (inputTokens * modelInfo.input_cost_per_1m) / 1_000_000;
    const outputCost = (outputTokens * modelInfo.output_cost_per_1m) / 1_000_000;
    const totalCost = inputCost + outputCost;

    return {
      input_cost: Math.round(inputCost * 1_000_000) / 1_000_000,
      output_cost: Math.round(outputCost * 1_000_000) / 1_000_000,
      total_cost: Math.round(totalCost * 1_000_000) / 1_000_000,
      currency: 'USD',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      model: modelInfo.name,
      rates: {
        input_rate_per_1m: modelInfo.input_cost_per_1m,
        output_rate_per_1m: modelInfo.output_cost_per_1m,
      },
    };
  } catch (error) {
    throw new CostEstimationError(
      `Failed to estimate cost from tokens: ${error instanceof Error ? error.message : String(error)}`,
      model
    );
  }
}

/**
 * Estimate cost for multiple requests
 */
export async function estimate_cost_batch(
  requests: Array<{ inputText: string; outputText?: string; model: string }>
): Promise<CostEstimate[]> {
  const results = await Promise.all(
    requests.map(req => estimate_cost(req.inputText, req.model, req.outputText || ''))
  );

  return results;
}

/**
 * Get cost breakdown for a model (per token costs)
 */
export function get_model_pricing(model: string): {
  input_cost_per_token: number;
  output_cost_per_token: number;
  input_cost_per_1k: number;
  output_cost_per_1k: number;
  input_cost_per_1m: number;
  output_cost_per_1m: number;
  currency: string;
} {
  const modelInfo = getModelInfo(model);
  if (!modelInfo) {
    throw new ModelNotFoundError(model);
  }

  return {
    input_cost_per_token: modelInfo.input_cost_per_1m / 1_000_000,
    output_cost_per_token: modelInfo.output_cost_per_1m / 1_000_000,
    input_cost_per_1k: modelInfo.input_cost_per_1m / 1_000,
    output_cost_per_1k: modelInfo.output_cost_per_1m / 1_000,
    input_cost_per_1m: modelInfo.input_cost_per_1m,
    output_cost_per_1m: modelInfo.output_cost_per_1m,
    currency: 'USD',
  };
}

/**
 * Compare costs across multiple models for the same input
 */
export async function compare_model_costs(
  inputText: string,
  models: string[],
  outputText: string = ''
): Promise<CostEstimateResult[]> {
  const results = await Promise.all(
    models.map(async model => {
      try {
        const estimate = await estimate_cost(inputText, model, outputText);
        return { ...estimate, model_name: model };
      } catch (error) {
        // Return a failed estimate for models that error
        return {
          input_cost: 0,
          output_cost: 0,
          total_cost: 0,
          currency: 'USD' as const,
          input_tokens: 0,
          output_tokens: 0,
          model,
          model_name: model,
          rates: { input_rate_per_1m: 0, output_rate_per_1m: 0 },
          error: error instanceof Error ? error.message : String(error),
        };
      }
    })
  );

  // Sort by total cost (ascending)
  return results.sort((a, b) => a.total_cost - b.total_cost);
}

/**
 * Estimate cost for streaming responses (incremental)
 */
export function estimate_streaming_cost(
  inputTokens: number,
  currentOutputTokens: number,
  model: string
): CostEstimate {
  return estimate_cost_from_tokens(inputTokens, currentOutputTokens, model);
}

/**
 * Calculate cost savings between two models
 */
export async function calculate_cost_savings(
  inputText: string,
  expensiveModel: string,
  cheaperModel: string,
  outputText: string = ''
): Promise<{
  expensive_cost: CostEstimate;
  cheaper_cost: CostEstimate;
  absolute_savings: number;
  percentage_savings: number;
  cost_ratio: number;
}> {
  const [expensiveCost, cheaperCost] = await Promise.all([
    estimate_cost(inputText, expensiveModel, outputText),
    estimate_cost(inputText, cheaperModel, outputText),
  ]);

  const absoluteSavings = expensiveCost.total_cost - cheaperCost.total_cost;
  const percentageSavings =
    expensiveCost.total_cost > 0 ? (absoluteSavings / expensiveCost.total_cost) * 100 : 0;
  const costRatio =
    cheaperCost.total_cost > 0 ? expensiveCost.total_cost / cheaperCost.total_cost : 0;

  return {
    expensive_cost: expensiveCost,
    cheaper_cost: cheaperCost,
    absolute_savings: Math.round(absoluteSavings * 1_000_000) / 1_000_000,
    percentage_savings: Math.round(percentageSavings * 100) / 100,
    cost_ratio: Math.round(costRatio * 100) / 100,
  };
}

/**
 * Estimate cost for a conversation (multiple messages)
 */
export async function estimate_conversation_cost(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  model: string
): Promise<CostEstimate & { message_costs: CostEstimate[] }> {
  // For conversation cost, we need to account for the fact that each message
  // includes the full conversation history as context
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const messageCosts: CostEstimate[] = [];
  let cumulativeContext = '';

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (!message || !message.content) continue;

    if (message.role === 'user' || message.role === 'system') {
      // Add message to cumulative context
      cumulativeContext += `${message.content} `;

      // Calculate tokens for the cumulative context (this is what the LLM actually processes)
      const tokenCount = await estimate_token_count(cumulativeContext, model);
      const incrementalTokens = i === 0 ? tokenCount.total : tokenCount.total - totalInputTokens;
      totalInputTokens = tokenCount.total;

      const cost = estimate_cost_from_tokens(incrementalTokens, 0, model);
      messageCosts.push(cost);
    } else {
      // Assistant messages are output tokens
      const tokenCount = await estimate_token_count(message.content, model);
      totalOutputTokens += tokenCount.total;

      // Add assistant message to cumulative context for future messages
      cumulativeContext += `${message.content} `;

      const cost = estimate_cost_from_tokens(0, tokenCount.total, model);
      messageCosts.push(cost);
    }
  }

  const totalCost = estimate_cost_from_tokens(totalInputTokens, totalOutputTokens, model);

  return {
    ...totalCost,
    message_costs: messageCosts,
  };
}

/**
 * Get the most cost-effective model for a given input length
 */
export function get_most_cost_effective_model(
  inputTokens: number,
  outputTokens: number,
  providers: string[] = []
): { model: string; cost: CostEstimate } | null {
  let bestModel: string | null = null;
  let lowestCost = Infinity;
  let bestEstimate: CostEstimate | null = null;

  const modelsToCheck =
    providers.length > 0
      ? Object.entries(MODEL_REGISTRY).filter(([_, info]) => providers.includes(info.provider))
      : Object.entries(MODEL_REGISTRY);

  for (const [modelName] of modelsToCheck) {
    try {
      const estimate = estimate_cost_from_tokens(inputTokens, outputTokens, modelName);

      if (estimate.total_cost < lowestCost) {
        lowestCost = estimate.total_cost;
        bestModel = modelName;
        bestEstimate = estimate;
      }
    } catch {
      // Skip models that error
      continue;
    }
  }

  if (bestModel && bestEstimate) {
    return { model: bestModel, cost: bestEstimate };
  }

  return null;
}

/**
 * Utility function to get model info with normalization
 */
function getModelInfo(model: string): ModelInfo | null {
  // Normalize model name first
  const normalizedModel = normalizeModelName(model);
  return MODEL_REGISTRY[normalizedModel] || null;
}

/**
 * Normalize model name (same logic as token counting)
 */
function normalizeModelName(model: string): string {
  if (!model) return model;

  // First check if it's already a key in the registry
  if (model in MODEL_REGISTRY) {
    return model;
  }

  // Try case-insensitive matching
  const lowerModel = model.toLowerCase();
  for (const [key] of Object.entries(MODEL_REGISTRY)) {
    if (key.toLowerCase() === lowerModel) {
      return key;
    }
  }

  // Return original if no match found
  return model;
}

/**
 * Check if cost estimation is available for a model
 */
export function is_cost_estimation_available(model: string): boolean {
  return getModelInfo(model) !== null;
}
