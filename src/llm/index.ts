/**
 * LLM Utilities - Comprehensive Index
 *
 * This module provides a centralized export point for all LLM utilities,
 * matching the Python SDK's comprehensive LLM functionality.
 */

// Re-export all types
export type {
  LLMProvider,
  TokenizerType,
  ModelInfo,
  TokenCount,
  CostEstimate,
  LLMMetadata,
  PIISanitizationOptions,
  PIISanitizationResult,
  LLMUtilityError,
  ModelNotFoundError,
  TokenCountingError,
  CostEstimationError,
} from './types.js';

// Core cost estimation functions
export {
  estimate_cost,
  estimate_cost_from_tokens,
  get_model_pricing,
  estimate_streaming_cost,
  get_most_cost_effective_model,
  is_cost_estimation_available,
} from './cost-estimation.js';

// Token counting functions
export {
  estimate_token_count,
  estimate_token_count_sync,
  is_token_counting_available,
  get_tokenizer_type,
} from './token-counting.js';

// Model utilities
export {
  get_model_info,
  normalize_model_name,
  detect_llm_provider,
  get_supported_models,
  get_supported_providers,
  is_model_supported,
  get_model_count,
  get_models_by_capability,
  get_models_by_context_window,
  get_models_by_training_cutoff,
  get_cheapest_models,
  get_model_aliases,
  search_models,
  get_model_stats,
} from './model-utils.js';

// Model registry
export {
  MODEL_REGISTRY,
  MODEL_ALIASES,
  getModelsByProvider,
  getSupportedProviders,
  getAllModelNames,
  hasModel,
  getModelCount,
} from './model-registry.js';

// Model validation functions
export {
  validate_model_compatibility,
  validate_input_size,
  validate_streaming_compatibility,
  validate_use_case,
  validate_cost_constraints,
  validate_model_availability,
  validate_model_comprehensive,
  validate_models_batch,
} from './validation.js';

// PII sanitization functions
export {
  sanitize_llm_content_simple,
  sanitize_llm_content,
  sanitize_llm_content_preserving_format,
  contains_pii,
  analyze_pii_content,
  validate_pii_options,
  get_supported_pii_types,
} from './sanitization.js';

// LLM metadata extraction functions
export {
  extract_llm_metadata,
  extract_streaming_metadata,
  merge_llm_metadata,
  validate_llm_metadata,
  get_supported_metadata_fields,
} from './metadata.js';
