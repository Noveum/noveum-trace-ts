/**
 * LLM Metadata Extraction Utilities - Python SDK Compatible
 *
 * Provides utilities to extract metadata from LLM responses across all major providers,
 * supporting all response formats and matching the Python SDK's implementation exactly.
 */

import type { LLMMetadata, LLMProvider } from './types.js';
import { detect_llm_provider } from './model-utils.js';

/**
 * Extract LLM metadata from response - matches Python SDK API exactly
 */
export function extract_llm_metadata(
  response: any,
  model?: string,
  provider?: LLMProvider
): LLMMetadata {
  // Detect provider if not provided
  const detectedProvider = provider || (model ? detect_llm_provider(model) : null);

  if (!detectedProvider) {
    return {
      model: model || 'unknown',
      provider: 'local',
      tokens: undefined,
      finish_reason: undefined,
      provider_metadata: response,
      request_params: undefined,
    };
  }

  // Extract metadata based on provider
  switch (detectedProvider) {
    case 'openai':
      return extractOpenAIMetadata(response, model);
    case 'anthropic':
      return extractAnthropicMetadata(response, model);
    case 'google':
      return extractGoogleMetadata(response, model);
    case 'meta':
      return extractMetaMetadata(response, model);
    case 'cohere':
      return extractCohereMetadata(response, model);
    case 'mistral':
      return extractMistralMetadata(response, model);
    case 'together':
      return extractTogetherMetadata(response, model);
    case 'perplexity':
      return extractPerplexityMetadata(response, model);
    case 'groq':
      return extractGroqMetadata(response, model);
    default:
      return extractGenericMetadata(response, model, detectedProvider);
  }
}

/**
 * Extract metadata from OpenAI responses
 */
function extractOpenAIMetadata(response: any, model?: string): LLMMetadata {
  const metadata: LLMMetadata = {
    model: model || response?.model || 'unknown',
    provider: 'openai',
  };

  // Extract token usage
  if (response?.usage) {
    metadata.tokens = {
      input: response.usage.prompt_tokens || 0,
      output: response.usage.completion_tokens || 0,
      total: response.usage.total_tokens || 0,
    };
  }

  // Extract finish reason
  if (response?.choices?.[0]?.finish_reason) {
    metadata.finish_reason = response.choices[0].finish_reason;
  }

  // Extract request parameters (if present)
  if (response?.request_params || response?.params) {
    metadata.request_params = response.request_params || response.params;
  }

  // Provider-specific metadata
  metadata.provider_metadata = {
    id: response?.id,
    object: response?.object,
    created: response?.created,
    system_fingerprint: response?.system_fingerprint,
    choices: response?.choices?.map((choice: any) => ({
      index: choice.index,
      finish_reason: choice.finish_reason,
      logprobs: choice.logprobs,
    })),
  };

  return metadata;
}

/**
 * Extract metadata from Anthropic Claude responses
 */
function extractAnthropicMetadata(response: any, model?: string): LLMMetadata {
  const metadata: LLMMetadata = {
    model: model || response?.model || 'unknown',
    provider: 'anthropic',
  };

  // Extract token usage
  if (response?.usage) {
    metadata.tokens = {
      input: response.usage.input_tokens || 0,
      output: response.usage.output_tokens || 0,
      total: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0),
    };
  }

  // Extract finish reason
  if (response?.stop_reason) {
    metadata.finish_reason = response.stop_reason;
  }

  // Provider-specific metadata
  metadata.provider_metadata = {
    id: response?.id,
    type: response?.type,
    role: response?.role,
    stop_reason: response?.stop_reason,
    stop_sequence: response?.stop_sequence,
  };

  return metadata;
}

/**
 * Extract metadata from Google Gemini/PaLM responses
 */
function extractGoogleMetadata(response: any, model?: string): LLMMetadata {
  const metadata: LLMMetadata = {
    model: model || response?.model || 'unknown',
    provider: 'google',
  };

  // Extract token usage
  if (response?.usageMetadata) {
    metadata.tokens = {
      input: response.usageMetadata.promptTokenCount || 0,
      output: response.usageMetadata.candidatesTokenCount || 0,
      total: response.usageMetadata.totalTokenCount || 0,
    };
  } else if (response?.usage) {
    metadata.tokens = {
      input: response.usage.prompt_tokens || 0,
      output: response.usage.completion_tokens || 0,
      total: response.usage.total_tokens || 0,
    };
  }

  // Extract finish reason
  if (response?.candidates?.[0]?.finishReason) {
    metadata.finish_reason = response.candidates[0].finishReason;
  }

  // Provider-specific metadata
  metadata.provider_metadata = {
    candidates: response?.candidates?.map((candidate: any) => ({
      finishReason: candidate.finishReason,
      index: candidate.index,
      safetyRatings: candidate.safetyRatings,
    })),
    promptFeedback: response?.promptFeedback,
    usageMetadata: response?.usageMetadata,
  };

  return metadata;
}

/**
 * Extract metadata from Meta Llama responses
 */
function extractMetaMetadata(response: any, model?: string): LLMMetadata {
  const metadata: LLMMetadata = {
    model: model || response?.model || 'unknown',
    provider: 'meta',
  };

  // Extract token usage (format varies by deployment)
  if (response?.usage) {
    metadata.tokens = {
      input: response.usage.prompt_tokens || response.usage.input_tokens || 0,
      output: response.usage.completion_tokens || response.usage.output_tokens || 0,
      total: response.usage.total_tokens || 0,
    };
  }

  // Extract finish reason
  if (response?.finish_reason || response?.choices?.[0]?.finish_reason) {
    metadata.finish_reason = response.finish_reason || response.choices[0].finish_reason;
  }

  // Provider-specific metadata
  metadata.provider_metadata = {
    generation_id: response?.generation_id,
    choices: response?.choices,
    finish_reason: response?.finish_reason,
  };

  return metadata;
}

/**
 * Extract metadata from Cohere responses
 */
function extractCohereMetadata(response: any, model?: string): LLMMetadata {
  const metadata: LLMMetadata = {
    model: model || response?.model || 'unknown',
    provider: 'cohere',
  };

  // Extract token usage
  if (response?.meta?.tokens) {
    metadata.tokens = {
      input: response.meta.tokens.input_tokens || 0,
      output: response.meta.tokens.output_tokens || 0,
      total: (response.meta.tokens.input_tokens || 0) + (response.meta.tokens.output_tokens || 0),
    };
  } else if (response?.meta?.billed_units) {
    metadata.tokens = {
      input: response.meta.billed_units.input_tokens || 0,
      output: response.meta.billed_units.output_tokens || 0,
      total:
        (response.meta.billed_units.input_tokens || 0) +
        (response.meta.billed_units.output_tokens || 0),
    };
  }

  // Extract finish reason
  if (response?.finish_reason) {
    metadata.finish_reason = response.finish_reason;
  }

  // Provider-specific metadata
  metadata.provider_metadata = {
    id: response?.id,
    generation_id: response?.generation_id,
    meta: response?.meta,
    finish_reason: response?.finish_reason,
  };

  return metadata;
}

/**
 * Extract metadata from Mistral responses
 */
function extractMistralMetadata(response: any, model?: string): LLMMetadata {
  const metadata: LLMMetadata = {
    model: model || response?.model || 'unknown',
    provider: 'mistral',
  };

  // Extract token usage
  if (response?.usage) {
    metadata.tokens = {
      input: response.usage.prompt_tokens || 0,
      output: response.usage.completion_tokens || 0,
      total: response.usage.total_tokens || 0,
    };
  }

  // Extract finish reason
  if (response?.choices?.[0]?.finish_reason) {
    metadata.finish_reason = response.choices[0].finish_reason;
  }

  // Provider-specific metadata
  metadata.provider_metadata = {
    id: response?.id,
    object: response?.object,
    created: response?.created,
    choices: response?.choices,
  };

  return metadata;
}

/**
 * Extract metadata from Together AI responses
 */
function extractTogetherMetadata(response: any, model?: string): LLMMetadata {
  const metadata: LLMMetadata = {
    model: model || response?.model || 'unknown',
    provider: 'together',
  };

  // Extract token usage
  if (response?.usage) {
    metadata.tokens = {
      input: response.usage.prompt_tokens || 0,
      output: response.usage.completion_tokens || 0,
      total: response.usage.total_tokens || 0,
    };
  }

  // Extract finish reason
  if (response?.choices?.[0]?.finish_reason) {
    metadata.finish_reason = response.choices[0].finish_reason;
  }

  // Provider-specific metadata
  metadata.provider_metadata = {
    id: response?.id,
    choices: response?.choices,
    created: response?.created,
  };

  return metadata;
}

/**
 * Extract metadata from Perplexity responses
 */
function extractPerplexityMetadata(response: any, model?: string): LLMMetadata {
  const metadata: LLMMetadata = {
    model: model || response?.model || 'unknown',
    provider: 'perplexity',
  };

  // Extract token usage
  if (response?.usage) {
    metadata.tokens = {
      input: response.usage.prompt_tokens || 0,
      output: response.usage.completion_tokens || 0,
      total: response.usage.total_tokens || 0,
    };
  }

  // Extract finish reason
  if (response?.choices?.[0]?.finish_reason) {
    metadata.finish_reason = response.choices[0].finish_reason;
  }

  // Provider-specific metadata
  metadata.provider_metadata = {
    id: response?.id,
    choices: response?.choices,
    citations: response?.citations,
  };

  return metadata;
}

/**
 * Extract metadata from Groq responses
 */
function extractGroqMetadata(response: any, model?: string): LLMMetadata {
  const metadata: LLMMetadata = {
    model: model || response?.model || 'unknown',
    provider: 'groq',
  };

  // Extract token usage
  if (response?.usage) {
    metadata.tokens = {
      input: response.usage.prompt_tokens || 0,
      output: response.usage.completion_tokens || 0,
      total: response.usage.total_tokens || 0,
    };
  }

  // Extract finish reason
  if (response?.choices?.[0]?.finish_reason) {
    metadata.finish_reason = response.choices[0].finish_reason;
  }

  // Provider-specific metadata
  metadata.provider_metadata = {
    id: response?.id,
    object: response?.object,
    created: response?.created,
    system_fingerprint: response?.system_fingerprint,
    x_groq: response?.['x-groq'],
  };

  return metadata;
}

/**
 * Extract metadata from generic/unknown provider responses
 */
function extractGenericMetadata(
  response: any,
  model?: string,
  provider?: LLMProvider
): LLMMetadata {
  const metadata: LLMMetadata = {
    model: model || response?.model || 'unknown',
    provider: provider || 'local',
  };

  // Try to extract token usage from common fields
  if (response?.usage) {
    metadata.tokens = {
      input: response.usage.prompt_tokens || response.usage.input_tokens || 0,
      output: response.usage.completion_tokens || response.usage.output_tokens || 0,
      total: response.usage.total_tokens || 0,
    };
  }

  // Try to extract finish reason from common fields
  if (response?.finish_reason || response?.choices?.[0]?.finish_reason) {
    metadata.finish_reason = response.finish_reason || response.choices[0].finish_reason;
  }

  // Store entire response as provider metadata
  metadata.provider_metadata = response;

  return metadata;
}

/**
 * Extract metadata from streaming response chunks - matches Python SDK API exactly
 */
export function extract_streaming_metadata(
  chunk: any,
  model?: string,
  provider?: LLMProvider
): Partial<LLMMetadata> {
  const detectedProvider = provider || (model ? detect_llm_provider(model) : null);

  if (!detectedProvider) {
    return {
      model: model || 'unknown',
      provider: 'local',
      provider_metadata: chunk,
    };
  }

  switch (detectedProvider) {
    case 'openai':
      return extractOpenAIStreamingMetadata(chunk, model);
    case 'anthropic':
      return extractAnthropicStreamingMetadata(chunk, model);
    case 'google':
      return extractGoogleStreamingMetadata(chunk, model);
    default:
      return extractGenericStreamingMetadata(chunk, model, detectedProvider);
  }
}

/**
 * Extract metadata from OpenAI streaming chunks
 */
function extractOpenAIStreamingMetadata(chunk: any, model?: string): Partial<LLMMetadata> {
  const metadata: Partial<LLMMetadata> = {
    model: model || chunk?.model || 'unknown',
    provider: 'openai',
  };

  // Final chunk often contains usage information
  if (chunk?.usage) {
    metadata.tokens = {
      input: chunk.usage.prompt_tokens || 0,
      output: chunk.usage.completion_tokens || 0,
      total: chunk.usage.total_tokens || 0,
    };
  }

  // Extract finish reason from choices
  if (chunk?.choices?.[0]?.finish_reason) {
    metadata.finish_reason = chunk.choices[0].finish_reason;
  }

  metadata.provider_metadata = {
    id: chunk?.id,
    object: chunk?.object,
    created: chunk?.created,
    system_fingerprint: chunk?.system_fingerprint,
  };

  return metadata;
}

/**
 * Extract metadata from Anthropic streaming chunks
 */
function extractAnthropicStreamingMetadata(chunk: any, model?: string): Partial<LLMMetadata> {
  const metadata: Partial<LLMMetadata> = {
    model: model || chunk?.model || 'unknown',
    provider: 'anthropic',
  };

  // Message end events contain usage information
  if (chunk?.type === 'message_stop' && chunk?.usage) {
    metadata.tokens = {
      input: chunk.usage.input_tokens || 0,
      output: chunk.usage.output_tokens || 0,
      total: (chunk.usage.input_tokens || 0) + (chunk.usage.output_tokens || 0),
    };
  }

  if (chunk?.delta?.stop_reason || chunk?.stop_reason) {
    metadata.finish_reason = chunk.delta?.stop_reason || chunk.stop_reason;
  }

  metadata.provider_metadata = {
    type: chunk?.type,
    index: chunk?.index,
    delta: chunk?.delta,
  };

  return metadata;
}

/**
 * Extract metadata from Google streaming chunks
 */
function extractGoogleStreamingMetadata(chunk: any, model?: string): Partial<LLMMetadata> {
  const metadata: Partial<LLMMetadata> = {
    model: model || chunk?.model || 'unknown',
    provider: 'google',
  };

  // Usage metadata might be in final chunks
  if (chunk?.usageMetadata) {
    metadata.tokens = {
      input: chunk.usageMetadata.promptTokenCount || 0,
      output: chunk.usageMetadata.candidatesTokenCount || 0,
      total: chunk.usageMetadata.totalTokenCount || 0,
    };
  }

  if (chunk?.candidates?.[0]?.finishReason) {
    metadata.finish_reason = chunk.candidates[0].finishReason;
  }

  metadata.provider_metadata = {
    candidates: chunk?.candidates,
    usageMetadata: chunk?.usageMetadata,
  };

  return metadata;
}

/**
 * Extract metadata from generic streaming chunks
 */
function extractGenericStreamingMetadata(
  chunk: any,
  model?: string,
  provider?: LLMProvider
): Partial<LLMMetadata> {
  return {
    model: model || chunk?.model || 'unknown',
    provider: provider || 'local',
    provider_metadata: chunk,
  };
}

/**
 * Merge multiple metadata objects (useful for streaming) - matches Python SDK API exactly
 */
export function merge_llm_metadata(metadataList: Array<Partial<LLMMetadata>>): LLMMetadata {
  if (metadataList.length === 0) {
    return {
      model: 'unknown',
      provider: 'local',
      tokens: undefined,
      finish_reason: undefined,
      provider_metadata: {},
      request_params: undefined,
    };
  }

  const merged: LLMMetadata = {
    model: 'unknown',
    provider: 'local',
    tokens: undefined,
    finish_reason: undefined,
    provider_metadata: {},
    request_params: undefined,
  };

  // Merge properties from all metadata objects
  for (const metadata of metadataList) {
    if (metadata.model && metadata.model !== 'unknown') {
      merged.model = metadata.model;
    }

    if (metadata.provider && metadata.provider !== 'local') {
      merged.provider = metadata.provider;
    }

    if (metadata.tokens) {
      merged.tokens = metadata.tokens;
    }

    if (metadata.finish_reason) {
      merged.finish_reason = metadata.finish_reason;
    }

    if (metadata.request_params) {
      merged.request_params = { ...merged.request_params, ...metadata.request_params };
    }

    if (metadata.provider_metadata) {
      merged.provider_metadata = { ...merged.provider_metadata, ...metadata.provider_metadata };
    }
  }

  return merged;
}

/**
 * Validate extracted metadata - matches Python SDK API exactly
 */
export function validate_llm_metadata(metadata: LLMMetadata): {
  is_valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  if (!metadata.model) {
    errors.push('Missing model field');
  }

  if (!metadata.provider) {
    errors.push('Missing provider field');
  }

  // Validate token information if present
  if (metadata.tokens) {
    if (metadata.tokens.input < 0) {
      errors.push('Input tokens cannot be negative');
    }

    if (metadata.tokens.output < 0) {
      errors.push('Output tokens cannot be negative');
    }

    if (metadata.tokens.total < 0) {
      errors.push('Total tokens cannot be negative');
    }

    const calculatedTotal = metadata.tokens.input + metadata.tokens.output;
    if (metadata.tokens.total !== calculatedTotal) {
      warnings.push(
        `Total tokens (${metadata.tokens.total}) doesn't match sum of input + output (${calculatedTotal})`
      );
    }
  }

  // Validate finish reason
  const validFinishReasons = [
    'stop',
    'length',
    'content_filter',
    'tool_calls',
    'function_call',
    'end_turn',
    'max_tokens',
    'stop_sequence',
    'timeout',
    'cancelled',
  ];

  if (metadata.finish_reason && !validFinishReasons.includes(metadata.finish_reason)) {
    warnings.push(`Unknown finish reason: ${metadata.finish_reason}`);
  }

  return {
    is_valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get supported metadata fields for a provider - matches Python SDK API exactly
 */
export function get_supported_metadata_fields(provider: LLMProvider): string[] {
  const commonFields = ['model', 'provider', 'tokens', 'finish_reason', 'provider_metadata'];

  switch (provider) {
    case 'openai':
      return [...commonFields, 'request_params', 'system_fingerprint', 'choices'];
    case 'anthropic':
      return [...commonFields, 'stop_reason', 'stop_sequence', 'role'];
    case 'google':
      return [...commonFields, 'candidates', 'safety_ratings', 'prompt_feedback'];
    case 'cohere':
      return [...commonFields, 'generation_id', 'billed_units', 'meta'];
    default:
      return commonFields;
  }
}
