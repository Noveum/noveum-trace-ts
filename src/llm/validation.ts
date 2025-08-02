/**
 * LLM Model Validation Utilities - Python SDK Compatible
 *
 * Provides validation functions to check model compatibility with features,
 * context limits, and capabilities, matching the Python SDK's implementation exactly.
 */

import type { ModelValidation, ModelInfo, LLMProvider } from './types.js';
import { get_model_info } from './model-utils.js';

/**
 * Validate model compatibility with requested features - matches Python SDK API exactly
 */
export function validate_model_compatibility(
  model: string,
  options: {
    requires_vision?: boolean;
    requires_audio?: boolean;
    requires_function_calling?: boolean;
    min_context_window?: number;
    max_context_window?: number;
    min_output_tokens?: number;
    allowed_providers?: LLMProvider[];
    required_training_cutoff?: string; // ISO date string
    custom_validators?: Array<(modelInfo: ModelInfo) => { valid: boolean; error?: string }>;
  } = {}
): ModelValidation {
  const modelInfo = get_model_info(model);

  // Basic model existence check
  if (!modelInfo) {
    return {
      is_valid: false,
      errors: [`Model '${model}' not found in registry`],
      warnings: [],
      model_info: undefined,
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // Provider validation
  if (options.allowed_providers && !options.allowed_providers.includes(modelInfo.provider)) {
    errors.push(
      `Model '${model}' provider '${modelInfo.provider}' is not in allowed providers: ${options.allowed_providers.join(', ')}`
    );
  }

  // Capability validation
  if (options.requires_vision && !modelInfo.supports_vision) {
    errors.push(`Model '${model}' does not support vision capabilities`);
  }

  if (options.requires_audio && !modelInfo.supports_audio) {
    errors.push(`Model '${model}' does not support audio capabilities`);
  }

  if (options.requires_function_calling && !modelInfo.supports_function_calling) {
    errors.push(`Model '${model}' does not support function calling`);
  }

  // Context window validation
  if (options.min_context_window && modelInfo.context_window < options.min_context_window) {
    errors.push(
      `Model '${model}' context window (${modelInfo.context_window}) is below minimum required (${options.min_context_window})`
    );
  }

  if (options.max_context_window && modelInfo.context_window > options.max_context_window) {
    warnings.push(
      `Model '${model}' context window (${modelInfo.context_window}) exceeds maximum recommended (${options.max_context_window})`
    );
  }

  // Output tokens validation
  if (options.min_output_tokens && modelInfo.max_output_tokens < options.min_output_tokens) {
    errors.push(
      `Model '${model}' max output tokens (${modelInfo.max_output_tokens}) is below minimum required (${options.min_output_tokens})`
    );
  }

  // Training cutoff validation
  if (options.required_training_cutoff) {
    const requiredDate = new Date(options.required_training_cutoff);
    const modelCutoff = new Date(modelInfo.training_cutoff);

    if (modelCutoff < requiredDate) {
      warnings.push(
        `Model '${model}' training cutoff (${modelInfo.training_cutoff}) is before required date (${options.required_training_cutoff})`
      );
    }
  }

  // Custom validators
  if (options.custom_validators) {
    for (const validator of options.custom_validators) {
      try {
        const result = validator(modelInfo);
        if (!result.valid && result.error) {
          errors.push(result.error);
        }
      } catch (error) {
        errors.push(
          `Custom validator failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  return {
    is_valid: errors.length === 0,
    errors,
    warnings,
    model_info: modelInfo,
  };
}

/**
 * Validate that a model can handle a specific input size - matches Python SDK API exactly
 */
export function validate_input_size(
  model: string,
  input_tokens: number,
  output_tokens: number = 0
): ModelValidation {
  const modelInfo = get_model_info(model);

  if (!modelInfo) {
    return {
      is_valid: false,
      errors: [`Model '${model}' not found in registry`],
      warnings: [],
      model_info: undefined,
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const totalTokens = input_tokens + output_tokens;

  // Context window validation
  if (totalTokens > modelInfo.context_window) {
    errors.push(
      `Total tokens (${totalTokens}) exceeds model context window (${modelInfo.context_window})`
    );
  }

  // Output tokens validation
  if (output_tokens > modelInfo.max_output_tokens) {
    errors.push(
      `Output tokens (${output_tokens}) exceeds model max output tokens (${modelInfo.max_output_tokens})`
    );
  }

  // Warnings for high usage
  const contextUsage = (totalTokens / modelInfo.context_window) * 100;
  if (contextUsage > 90) {
    warnings.push(`High context usage: ${Math.round(contextUsage)}% of available context window`);
  } else if (contextUsage > 75) {
    warnings.push(
      `Moderate context usage: ${Math.round(contextUsage)}% of available context window`
    );
  }

  const outputUsage = (output_tokens / modelInfo.max_output_tokens) * 100;
  if (outputUsage > 90) {
    warnings.push(`High output token usage: ${Math.round(outputUsage)}% of max output tokens`);
  }

  return {
    is_valid: errors.length === 0,
    errors,
    warnings,
    model_info: modelInfo,
  };
}

/**
 * Validate model for streaming use cases - matches Python SDK API exactly
 */
export function validate_streaming_compatibility(
  model: string,
  max_concurrent_streams?: number
): ModelValidation {
  const modelInfo = get_model_info(model);

  if (!modelInfo) {
    return {
      is_valid: false,
      errors: [`Model '${model}' not found in registry`],
      warnings: [],
      model_info: undefined,
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // Provider-specific streaming limitations
  switch (modelInfo.provider) {
    case 'openai':
      // OpenAI generally supports streaming well
      if (max_concurrent_streams && max_concurrent_streams > 50) {
        warnings.push('OpenAI recommends limiting concurrent streams to avoid rate limits');
      }
      break;

    case 'anthropic':
      // Claude supports streaming
      if (max_concurrent_streams && max_concurrent_streams > 25) {
        warnings.push('Anthropic recommends limiting concurrent streams for optimal performance');
      }
      break;

    case 'google':
      // Gemini streaming support varies
      if (modelInfo.name.includes('vision')) {
        warnings.push('Vision models may have limited streaming support');
      }
      break;

    case 'meta':
    case 'mistral':
    case 'cohere':
      // These providers may have varying streaming support
      warnings.push(`Streaming support for ${modelInfo.provider} models may vary by deployment`);
      break;

    default:
      warnings.push(`Streaming compatibility not verified for provider: ${modelInfo.provider}`);
  }

  // Context window considerations for streaming
  if (modelInfo.context_window < 8192) {
    warnings.push('Small context window may limit streaming conversation length');
  }

  return {
    is_valid: errors.length === 0,
    errors,
    warnings,
    model_info: modelInfo,
  };
}

/**
 * Validate model for specific use case patterns - matches Python SDK API exactly
 */
export function validate_use_case(
  model: string,
  use_case:
    | 'chat'
    | 'completion'
    | 'code'
    | 'analysis'
    | 'creative'
    | 'reasoning'
    | 'vision'
    | 'audio'
    | 'function_calling'
): ModelValidation {
  const modelInfo = get_model_info(model);

  if (!modelInfo) {
    return {
      is_valid: false,
      errors: [`Model '${model}' not found in registry`],
      warnings: [],
      model_info: undefined,
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  switch (use_case) {
    case 'vision':
      if (!modelInfo.supports_vision) {
        errors.push(
          `Model '${model}' does not support vision capabilities required for vision use case`
        );
      }
      break;

    case 'audio':
      if (!modelInfo.supports_audio) {
        errors.push(
          `Model '${model}' does not support audio capabilities required for audio use case`
        );
      }
      break;

    case 'function_calling':
      if (!modelInfo.supports_function_calling) {
        errors.push(
          `Model '${model}' does not support function calling required for function calling use case`
        );
      }
      break;

    case 'code':
      // Recommend models with good coding capabilities
      if (
        !modelInfo.name.includes('code') &&
        modelInfo.provider !== 'openai' &&
        modelInfo.provider !== 'anthropic'
      ) {
        warnings.push(`Model '${model}' may not be optimized for code generation tasks`);
      }
      break;

    case 'reasoning':
      // Larger models generally better for complex reasoning
      if (
        modelInfo.name.includes('mini') ||
        modelInfo.name.includes('light') ||
        modelInfo.name.includes('7b')
      ) {
        warnings.push(
          `Model '${model}' may have limited reasoning capabilities due to smaller size`
        );
      }
      break;

    case 'creative':
      // Creative tasks generally work well with most models
      if (modelInfo.max_output_tokens < 2048) {
        warnings.push(
          `Model '${model}' has limited output tokens which may restrict creative writing tasks`
        );
      }
      break;

    case 'analysis':
      // Analysis tasks benefit from larger context windows
      if (modelInfo.context_window < 32768) {
        warnings.push(
          `Model '${model}' has limited context window which may restrict analysis of large documents`
        );
      }
      break;

    case 'chat':
    case 'completion':
      // Most models support basic chat/completion
      break;
  }

  return {
    is_valid: errors.length === 0,
    errors,
    warnings,
    model_info: modelInfo,
  };
}

/**
 * Validate cost constraints for model usage - matches Python SDK API exactly
 */
export function validate_cost_constraints(
  model: string,
  constraints: {
    max_cost_per_1k_tokens?: number;
    max_input_cost_per_1m?: number;
    max_output_cost_per_1m?: number;
    budget_per_day?: number;
    estimated_daily_tokens?: number;
  }
): ModelValidation {
  const modelInfo = get_model_info(model);

  if (!modelInfo) {
    return {
      is_valid: false,
      errors: [`Model '${model}' not found in registry`],
      warnings: [],
      model_info: undefined,
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // Per-token cost validation
  if (constraints.max_cost_per_1k_tokens) {
    const avgCostPer1k = (modelInfo.input_cost_per_1m + modelInfo.output_cost_per_1m) / 2000;
    if (avgCostPer1k > constraints.max_cost_per_1k_tokens) {
      errors.push(
        `Model average cost per 1k tokens ($${avgCostPer1k.toFixed(6)}) exceeds budget ($${constraints.max_cost_per_1k_tokens})`
      );
    }
  }

  // Input cost validation
  if (
    constraints.max_input_cost_per_1m &&
    modelInfo.input_cost_per_1m > constraints.max_input_cost_per_1m
  ) {
    errors.push(
      `Model input cost per 1M tokens ($${modelInfo.input_cost_per_1m}) exceeds budget ($${constraints.max_input_cost_per_1m})`
    );
  }

  // Output cost validation
  if (
    constraints.max_output_cost_per_1m &&
    modelInfo.output_cost_per_1m > constraints.max_output_cost_per_1m
  ) {
    errors.push(
      `Model output cost per 1M tokens ($${modelInfo.output_cost_per_1m}) exceeds budget ($${constraints.max_output_cost_per_1m})`
    );
  }

  // Daily budget validation
  if (constraints.budget_per_day && constraints.estimated_daily_tokens) {
    const estimatedDailyCost =
      (constraints.estimated_daily_tokens *
        (modelInfo.input_cost_per_1m + modelInfo.output_cost_per_1m)) /
      2_000_000;
    if (estimatedDailyCost > constraints.budget_per_day) {
      errors.push(
        `Estimated daily cost ($${estimatedDailyCost.toFixed(2)}) exceeds budget ($${constraints.budget_per_day})`
      );
    } else if (estimatedDailyCost > constraints.budget_per_day * 0.8) {
      warnings.push(
        `Estimated daily cost ($${estimatedDailyCost.toFixed(2)}) is close to budget limit ($${constraints.budget_per_day})`
      );
    }
  }

  return {
    is_valid: errors.length === 0,
    errors,
    warnings,
    model_info: modelInfo,
  };
}

/**
 * Validate model availability and status - matches Python SDK API exactly
 */
export function validate_model_availability(
  model: string,
  check_deprecation: boolean = true
): ModelValidation {
  const modelInfo = get_model_info(model);

  if (!modelInfo) {
    return {
      is_valid: false,
      errors: [`Model '${model}' not found in registry`],
      warnings: [],
      model_info: undefined,
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for deprecated models
  if (check_deprecation) {
    const cutoffDate = new Date(modelInfo.training_cutoff);
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    if (cutoffDate < twoYearsAgo) {
      warnings.push(
        `Model '${model}' training cutoff (${modelInfo.training_cutoff}) is over 2 years old and may be deprecated`
      );
    }

    // Specific deprecated model warnings
    const deprecatedPatterns = ['davinci', 'curie', 'babbage', 'ada', 'text-', 'code-davinci'];
    if (deprecatedPatterns.some(pattern => modelInfo.name.includes(pattern))) {
      warnings.push(`Model '${model}' appears to be from a deprecated model family`);
    }
  }

  // Provider-specific availability checks
  switch (modelInfo.provider) {
    case 'openai':
      // Check for legacy models
      if (modelInfo.name.includes('davinci') || modelInfo.name.includes('curie')) {
        warnings.push('Legacy OpenAI models may have limited availability');
      }
      break;

    case 'google':
      // Check for beta models
      if (modelInfo.name.includes('beta') || modelInfo.name.includes('preview')) {
        warnings.push('Beta/Preview models may have limited availability or be subject to changes');
      }
      break;
  }

  return {
    is_valid: errors.length === 0,
    errors,
    warnings,
    model_info: modelInfo,
  };
}

/**
 * Comprehensive model validation combining all checks - matches Python SDK API exactly
 */
export function validate_model_comprehensive(
  model: string,
  options: {
    // Feature requirements
    requires_vision?: boolean;
    requires_audio?: boolean;
    requires_function_calling?: boolean;

    // Size constraints
    min_context_window?: number;
    max_context_window?: number;
    min_output_tokens?: number;

    // Usage constraints
    input_tokens?: number;
    output_tokens?: number;
    max_concurrent_streams?: number;

    // Provider constraints
    allowed_providers?: LLMProvider[];
    required_training_cutoff?: string;

    // Cost constraints
    max_cost_per_1k_tokens?: number;
    budget_per_day?: number;
    estimated_daily_tokens?: number;

    // Use case
    use_case?:
      | 'chat'
      | 'completion'
      | 'code'
      | 'analysis'
      | 'creative'
      | 'reasoning'
      | 'vision'
      | 'audio'
      | 'function_calling';

    // Validation options
    check_availability?: boolean;
    check_streaming?: boolean;
    custom_validators?: Array<(modelInfo: ModelInfo) => { valid: boolean; error?: string }>;
  } = {}
): ModelValidation {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  // Basic compatibility validation
  const compatibilityOptions: Parameters<typeof validate_model_compatibility>[1] = {};
  if (options.requires_vision !== undefined)
    compatibilityOptions.requires_vision = options.requires_vision;
  if (options.requires_audio !== undefined)
    compatibilityOptions.requires_audio = options.requires_audio;
  if (options.requires_function_calling !== undefined)
    compatibilityOptions.requires_function_calling = options.requires_function_calling;
  if (options.min_context_window !== undefined)
    compatibilityOptions.min_context_window = options.min_context_window;
  if (options.max_context_window !== undefined)
    compatibilityOptions.max_context_window = options.max_context_window;
  if (options.min_output_tokens !== undefined)
    compatibilityOptions.min_output_tokens = options.min_output_tokens;
  if (options.allowed_providers !== undefined)
    compatibilityOptions.allowed_providers = options.allowed_providers;
  if (options.required_training_cutoff !== undefined)
    compatibilityOptions.required_training_cutoff = options.required_training_cutoff;
  if (options.custom_validators !== undefined)
    compatibilityOptions.custom_validators = options.custom_validators;

  const compatibilityResult = validate_model_compatibility(model, compatibilityOptions);

  allErrors.push(...compatibilityResult.errors);
  allWarnings.push(...compatibilityResult.warnings);
  const modelInfo: ModelInfo | undefined = compatibilityResult.model_info;

  // Input size validation
  if (options.input_tokens !== undefined) {
    const sizeResult = validate_input_size(model, options.input_tokens, options.output_tokens || 0);
    allErrors.push(...sizeResult.errors);
    allWarnings.push(...sizeResult.warnings);
  }

  // Streaming validation
  if (options.check_streaming) {
    const streamingResult = validate_streaming_compatibility(model, options.max_concurrent_streams);
    allErrors.push(...streamingResult.errors);
    allWarnings.push(...streamingResult.warnings);
  }

  // Use case validation
  if (options.use_case) {
    const useCaseResult = validate_use_case(model, options.use_case);
    allErrors.push(...useCaseResult.errors);
    allWarnings.push(...useCaseResult.warnings);
  }

  // Cost validation
  if (options.max_cost_per_1k_tokens || options.budget_per_day) {
    const costOptions: Parameters<typeof validate_cost_constraints>[1] = {};
    if (options.max_cost_per_1k_tokens !== undefined)
      costOptions.max_cost_per_1k_tokens = options.max_cost_per_1k_tokens;
    if (options.budget_per_day !== undefined) costOptions.budget_per_day = options.budget_per_day;
    if (options.estimated_daily_tokens !== undefined)
      costOptions.estimated_daily_tokens = options.estimated_daily_tokens;

    const costResult = validate_cost_constraints(model, costOptions);
    allErrors.push(...costResult.errors);
    allWarnings.push(...costResult.warnings);
  }

  // Availability validation
  if (options.check_availability) {
    const availabilityResult = validate_model_availability(model, true);
    allErrors.push(...availabilityResult.errors);
    allWarnings.push(...availabilityResult.warnings);
  }

  return {
    is_valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    model_info: modelInfo,
  };
}

/**
 * Get validation summary for multiple models - matches Python SDK API exactly
 */
export function validate_models_batch(
  models: string[],
  validation_options: Parameters<typeof validate_model_comprehensive>[1] = {}
): Array<{ model: string; validation: ModelValidation }> {
  return models.map(model => ({
    model,
    validation: validate_model_comprehensive(model, validation_options),
  }));
}
