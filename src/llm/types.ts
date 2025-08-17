/**
 * LLM Utilities Types - Python SDK Compatible
 *
 * This module defines TypeScript interfaces that match the Python SDK's
 * ModelInfo dataclass and related structures exactly.
 */

/**
 * LLM Provider types - matches Python SDK exactly
 */
export type LLMProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'meta'
  | 'cohere'
  | 'mistral'
  | 'together'
  | 'perplexity'
  | 'groq'
  | 'local';

/**
 * Tokenizer types used for token counting
 */
export type TokenizerType = 'tiktoken' | 'anthropic' | 'google' | 'meta' | 'custom' | 'heuristic';

/**
 * ModelInfo interface - matches Python SDK's ModelInfo dataclass exactly
 * All field names use snake_case to maintain Python compatibility
 */
export interface ModelInfo {
  /** Model provider (OpenAI, Anthropic, etc.) */
  provider: LLMProvider;

  /** Official model name/identifier */
  name: string;

  /** Maximum context window size in tokens */
  context_window: number;

  /** Maximum output tokens (may be subset of context window) */
  max_output_tokens: number;

  /** Input cost per 1 million tokens in USD */
  input_cost_per_1m: number;

  /** Output cost per 1 million tokens in USD */
  output_cost_per_1m: number;

  /** Whether the model supports vision/image inputs */
  supports_vision: boolean;

  /** Whether the model supports audio inputs */
  supports_audio: boolean;

  /** Whether the model supports function calling */
  supports_function_calling: boolean;

  /** Training data cutoff date (ISO string) */
  training_cutoff: string;

  /** Tokenizer type for token counting */
  tokenizer_type: TokenizerType;

  /** Alternative names/aliases for this model */
  aliases?: string[];
}

/**
 * Token count result with detailed breakdown
 */
export interface TokenCount {
  /** Total token count */
  total: number;

  /** Input/prompt tokens */
  input?: number;

  /** Output/completion tokens */
  output?: number;

  /** Model used for counting */
  model: string;

  /** Tokenizer used */
  tokenizer: TokenizerType;
}

/**
 * Cost estimation result with detailed breakdown
 */
export interface CostEstimate {
  /** Input cost in USD */
  input_cost: number;

  /** Output cost in USD */
  output_cost: number;

  /** Total cost in USD */
  total_cost: number;

  /** Currency (always USD) */
  currency: 'USD';

  /** Input tokens counted */
  input_tokens: number;

  /** Output tokens counted */
  output_tokens: number;

  /** Model used for calculation */
  model: string;

  /** Rate information used */
  rates: {
    input_rate_per_1m: number;
    output_rate_per_1m: number;
  };
}

/**
 * Cost estimation result that can include errors
 */
export type CostEstimateResult =
  | (CostEstimate & { model_name: string })
  | (CostEstimate & { model_name: string; error: string });

/**
 * LLM metadata extracted from responses
 */
export interface LLMMetadata {
  /** Model used for the request */
  model: string;

  /** Provider name */
  provider: LLMProvider;

  /** Token usage breakdown */
  tokens?:
    | {
        input: number;
        output: number;
        total: number;
      }
    | undefined;

  /** Finish reason from API */
  finish_reason?: string | undefined;

  /** Provider-specific metadata */
  provider_metadata?: Record<string, any> | undefined;

  /** Request parameters used */
  request_params?:
    | {
        temperature?: number;
        max_tokens?: number;
        top_p?: number;
        frequency_penalty?: number;
        presence_penalty?: number;
        [key: string]: any;
      }
    | undefined;
}

/**
 * Model validation result
 */
export interface ModelValidation {
  /** Whether the model/configuration is valid */
  is_valid: boolean;

  /** Validation error messages */
  errors: string[];

  /** Validation warnings */
  warnings: string[];

  /** Model info if found */
  model_info?: ModelInfo | undefined;
}

/**
 * PII detection and sanitization options
 */
export interface PIISanitizationOptions {
  /** Whether to remove email addresses */
  remove_emails?: boolean;

  /** Whether to remove phone numbers */
  remove_phone_numbers?: boolean;

  /** Whether to remove addresses */
  remove_addresses?: boolean;

  /** Whether to remove names (person names) */
  remove_names?: boolean;

  /** Whether to remove credit card numbers */
  remove_credit_cards?: boolean;

  /** Whether to remove SSNs */
  remove_ssns?: boolean;

  /** Custom regex patterns to remove */
  custom_patterns?: RegExp[];

  /** Replacement text for redacted content */
  replacement_text?: string;
}

/**
 * PII sanitization result
 */
export interface PIISanitizationResult {
  /** Sanitized content */
  sanitized_content: string;

  /** Whether any PII was found and removed */
  pii_found: boolean;

  /** Types of PII detected */
  pii_types: string[];

  /** Number of PII instances removed */
  removals_count: number;
}

/**
 * Token counting function type
 */
export type TokenCountingFunction = (text: string, model?: string) => number;

/**
 * Error types for LLM utilities
 */
export class LLMUtilityError extends Error {
  constructor(
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'LLMUtilityError';
  }
}

export class ModelNotFoundError extends LLMUtilityError {
  constructor(model: string) {
    super(`Model '${model}' not found in registry`);
    this.code = 'MODEL_NOT_FOUND';
  }
}

export class TokenCountingError extends LLMUtilityError {
  constructor(
    message: string,
    public model?: string
  ) {
    super(message);
    this.code = 'TOKEN_COUNTING_ERROR';
  }
}

export class CostEstimationError extends LLMUtilityError {
  constructor(
    message: string,
    public model?: string
  ) {
    super(message);
    this.code = 'COST_ESTIMATION_ERROR';
  }
}
