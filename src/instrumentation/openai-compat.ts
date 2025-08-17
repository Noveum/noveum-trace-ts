/**
 * OpenAI SDK Multi-Version Compatibility Layer
 *
 * Provides transparent support for both OpenAI v1.x and v0.x (legacy) clients
 * by detecting SDK versions and normalizing API differences.
 */

import type { ISpan, ITrace } from '../core/interfaces.js';
import { extract_llm_metadata, estimate_cost_from_tokens } from '../llm/index.js';
import { SpanStatus } from '../core/types.js';

/**
 * Detected OpenAI SDK version information
 */
export interface SDKVersionInfo {
  majorVersion: number;
  fullVersion: string;
  isLegacy: boolean; // v0.x
  isModern: boolean; // v1.x+
}

/**
 * Normalized OpenAI client interface that works across versions
 */
export interface NormalizedOpenAIClient {
  version: SDKVersionInfo;
  createChatCompletion: (params: any) => Promise<any>;
  createCompletion: (params: any) => Promise<any>;
  createEmbedding: (params: any) => Promise<any>;
  createImage: (params: any) => Promise<any>;
  createModeration: (params: any) => Promise<any>;
}

/**
 * Normalized response format that works across versions
 */
export interface NormalizedResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message?: {
      role: string;
      content: string;
      function_call?: any;
      tool_calls?: any[];
    };
    text?: string;
    finish_reason: string;
    logprobs?: any;
  }>;
  usage?:
    | {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      }
    | undefined;
  data?: any[]; // For embeddings, images, etc.
  results?: any[]; // For moderation
}

/**
 * Configuration options for the compatibility layer
 */
export interface CompatibilityConfig {
  enablePatching: boolean;
  preserveOriginalMethods: boolean;
  enableVersionWarnings: boolean;
  fallbackToLegacy: boolean;
}

/**
 * Default compatibility configuration
 */
export const DEFAULT_COMPAT_CONFIG: CompatibilityConfig = {
  enablePatching: true,
  preserveOriginalMethods: true,
  enableVersionWarnings: false,
  fallbackToLegacy: true,
};

/**
 * Detects the version of an OpenAI SDK instance
 */
export function detectSDKVersion(instance: any): SDKVersionInfo {
  try {
    // Check for version property
    let version: string | undefined;

    if (instance._client?.constructor?.version) {
      version = instance._client.constructor.version;
    } else if (instance.constructor?.version) {
      version = instance.constructor.version;
    } else if (instance._version) {
      version = instance._version;
    } else if (instance.version) {
      version = instance.version;
    }

    // Try to get version from package.json
    if (!version && typeof require !== 'undefined') {
      try {
        const pkg = require('openai/package.json');
        version = pkg.version;
      } catch {
        // Ignore require errors
      }
    }

    // Feature detection fallback
    if (!version) {
      if (instance.chat?.completions?.create || instance.constructor?.name === 'OpenAI') {
        version = '1.0.0'; // Assume modern if has new API structure
      } else if (instance.createChatCompletion || instance.ChatCompletion) {
        version = '0.28.0'; // Assume legacy if has old API structure
      } else {
        version = '1.0.0'; // Default to modern
      }
    }

    // Ensure version is a string before parsing
    const versionString = version || '1.0.0';
    const majorVersion = parseInt(versionString.split('.')[0]!, 10);
    const isLegacy = majorVersion === 0;
    const isModern = majorVersion >= 1;

    return {
      majorVersion,
      fullVersion: versionString,
      isLegacy,
      isModern,
    };
  } catch {
    // Default to modern version
    return {
      majorVersion: 1,
      fullVersion: '1.0.0',
      isLegacy: false,
      isModern: true,
    };
  }
}

/**
 * Normalizes responses from different SDK versions into a consistent format
 */
export function normalizeResponse(response: any, sdkVersion: SDKVersionInfo): NormalizedResponse {
  // Modern SDK (v1.x+) uses Pydantic objects
  if (sdkVersion.isModern) {
    if (response?.choices) {
      return {
        id: response.id || '',
        object: response.object || '',
        created: response.created || 0,
        model: response.model || '',
        choices: response.choices.map((choice: any) => ({
          index: choice.index || 0,
          message: choice.message
            ? {
                role: choice.message.role || '',
                content: choice.message.content || '',
                function_call: choice.message.function_call,
                tool_calls: choice.message.tool_calls,
              }
            : undefined,
          text: choice.text,
          finish_reason: choice.finish_reason || '',
          logprobs: choice.logprobs,
        })),
        usage: response.usage
          ? {
              prompt_tokens: response.usage.prompt_tokens || 0,
              completion_tokens: response.usage.completion_tokens || 0,
              total_tokens: response.usage.total_tokens || 0,
            }
          : undefined,
        data: response.data,
        results: response.results,
      };
    }
  }

  // Legacy SDK (v0.x) uses dictionary format - already normalized
  if (sdkVersion.isLegacy && typeof response === 'object') {
    return {
      id: response.id || '',
      object: response.object || '',
      created: response.created || 0,
      model: response.model || '',
      choices: response.choices || [],
      usage: response.usage,
      data: response.data,
      results: response.results,
    };
  }

  // Fallback for unknown formats
  return response as NormalizedResponse;
}

/**
 * Normalizes error objects from different SDK versions
 */
export function normalizeError(error: any, sdkVersion: SDKVersionInfo): Error {
  if (sdkVersion.isModern) {
    // Map v1.x error types to consistent format
    if (error.constructor?.name === 'APITimeoutError') {
      const normalizedError = new Error(error.message);
      normalizedError.name = 'TimeoutError';
      return normalizedError;
    } else if (error.constructor?.name === 'BadRequestError') {
      const normalizedError = new Error(error.message);
      normalizedError.name = 'InvalidRequestError';
      return normalizedError;
    } else if (error.constructor?.name === 'AuthenticationError') {
      const normalizedError = new Error(error.message);
      normalizedError.name = 'AuthenticationError';
      return normalizedError;
    } else if (error.constructor?.name === 'PermissionDeniedError') {
      const normalizedError = new Error(error.message);
      normalizedError.name = 'PermissionError';
      return normalizedError;
    }
  }

  // Legacy errors or unknown errors - return as-is
  return error;
}

/**
 * Creates a normalized client adapter for any OpenAI SDK version
 */
export function createNormalizedClient(
  instance: any,
  _config: CompatibilityConfig = DEFAULT_COMPAT_CONFIG
): NormalizedOpenAIClient {
  const version = detectSDKVersion(instance);

  const adapter: NormalizedOpenAIClient = {
    version,
    createChatCompletion: async (params: any) => {
      try {
        let response: any;

        if (version.isModern) {
          // Modern SDK (v1.x+)
          if (instance.chat?.completions?.create) {
            response = await instance.chat.completions.create(params);
          } else {
            throw new Error('Chat completions not available in modern client');
          }
        } else {
          // Legacy SDK (v0.x)
          if (instance.createChatCompletion) {
            response = await instance.createChatCompletion(params);
          } else if (instance.ChatCompletion?.create) {
            response = await instance.ChatCompletion.create(params);
          } else {
            throw new Error('Chat completions not available in legacy client');
          }
        }

        return normalizeResponse(response, version);
      } catch (error) {
        throw normalizeError(error, version);
      }
    },

    createCompletion: async (params: any) => {
      try {
        let response: any;

        if (version.isModern) {
          // Modern SDK (v1.x+)
          if (instance.completions?.create) {
            response = await instance.completions.create(params);
          } else {
            throw new Error('Completions not available in modern client');
          }
        } else {
          // Legacy SDK (v0.x)
          if (instance.createCompletion) {
            response = await instance.createCompletion(params);
          } else if (instance.Completion?.create) {
            response = await instance.Completion.create(params);
          } else {
            throw new Error('Completions not available in legacy client');
          }
        }

        return normalizeResponse(response, version);
      } catch (error) {
        throw normalizeError(error, version);
      }
    },

    createEmbedding: async (params: any) => {
      try {
        let response: any;

        if (version.isModern) {
          // Modern SDK (v1.x+)
          if (instance.embeddings?.create) {
            response = await instance.embeddings.create(params);
          } else {
            throw new Error('Embeddings not available in modern client');
          }
        } else {
          // Legacy SDK (v0.x)
          if (instance.createEmbedding) {
            response = await instance.createEmbedding(params);
          } else if (instance.Embedding?.create) {
            response = await instance.Embedding.create(params);
          } else {
            throw new Error('Embeddings not available in legacy client');
          }
        }

        return normalizeResponse(response, version);
      } catch (error) {
        throw normalizeError(error, version);
      }
    },

    createImage: async (params: any) => {
      try {
        let response: any;

        if (version.isModern) {
          // Modern SDK (v1.x+)
          if (instance.images?.generate) {
            response = await instance.images.generate(params);
          } else {
            throw new Error('Image generation not available in modern client');
          }
        } else {
          // Legacy SDK (v0.x)
          if (instance.createImage) {
            response = await instance.createImage(params);
          } else if (instance.Image?.create) {
            response = await instance.Image.create(params);
          } else {
            throw new Error('Image generation not available in legacy client');
          }
        }

        return normalizeResponse(response, version);
      } catch (error) {
        throw normalizeError(error, version);
      }
    },

    createModeration: async (params: any) => {
      try {
        let response: any;

        if (version.isModern) {
          // Modern SDK (v1.x+)
          if (instance.moderations?.create) {
            response = await instance.moderations.create(params);
          } else {
            throw new Error('Moderation not available in modern client');
          }
        } else {
          // Legacy SDK (v0.x)
          if (instance.createModeration) {
            response = await instance.createModeration(params);
          } else if (instance.Moderation?.create) {
            response = await instance.Moderation.create(params);
          } else {
            throw new Error('Moderation not available in legacy client');
          }
        }

        return normalizeResponse(response, version);
      } catch (error) {
        throw normalizeError(error, version);
      }
    },
  };

  return adapter;
}

/**
 * Patches an OpenAI instance to provide normalized methods while preserving originals
 */
export function patchOpenAIInstance(
  instance: any,
  config: CompatibilityConfig = DEFAULT_COMPAT_CONFIG
): void {
  if (!config.enablePatching) {
    return;
  }

  const adapter = createNormalizedClient(instance, config);

  // Store original methods if preservation is enabled
  if (config.preserveOriginalMethods) {
    instance._original = {
      createChatCompletion: instance.createChatCompletion?.bind(instance),
      createCompletion: instance.createCompletion?.bind(instance),
      createEmbedding: instance.createEmbedding?.bind(instance),
      createImage: instance.createImage?.bind(instance),
      createModeration: instance.createModeration?.bind(instance),
    };
  }

  // Add normalized methods
  instance.createChatCompletion = adapter.createChatCompletion;
  instance.createCompletion = adapter.createCompletion;
  instance.createEmbedding = adapter.createEmbedding;
  instance.createImage = adapter.createImage;
  instance.createModeration = adapter.createModeration;

  // Add version info
  instance._compatibility = {
    version: adapter.version,
    isPatched: true,
    config,
  };
}

/**
 * Removes patches from an OpenAI instance, restoring original methods
 */
export function unpatchOpenAIInstance(instance: any): void {
  if (!instance._compatibility?.isPatched) {
    return;
  }

  // Restore original methods if they were preserved
  if (instance._original) {
    Object.keys(instance._original).forEach(key => {
      if (instance._original[key]) {
        instance[key] = instance._original[key];
      } else {
        delete instance[key];
      }
    });
    delete instance._original;
  }

  // Remove compatibility info
  delete instance._compatibility;
}

/**
 * Helper function to create spans with normalized OpenAI data
 */
export async function createOpenAISpan(
  trace: ITrace,
  operationName: string,
  params: any,
  versionInfo: SDKVersionInfo
): Promise<ISpan> {
  const span = await trace.startSpan(`openai.${operationName}`, {
    attributes: {
      'llm.provider': 'openai',
      'llm.operation': operationName,
      'llm.model': params.model || 'unknown',
      'llm.sdk_version': versionInfo.fullVersion,
      'llm.sdk_major_version': versionInfo.majorVersion,
      'llm.sdk_is_legacy': versionInfo.isLegacy,
      'llm.request.temperature': params.temperature || undefined,
      'llm.request.max_tokens': params.max_tokens || params.max_completion_tokens || undefined,
      'llm.request.top_p': params.top_p || undefined,
      'llm.request.frequency_penalty': params.frequency_penalty || undefined,
      'llm.request.presence_penalty': params.presence_penalty || undefined,
      'llm.request.stream': params.stream || false,
    },
  });

  return span;
}

/**
 * Helper function to finish spans with normalized response data
 */
export function finishOpenAISpan(
  span: ISpan,
  response: NormalizedResponse,
  _versionInfo: SDKVersionInfo
): void {
  try {
    // Extract LLM metadata - handled in instrumentation layer
    extract_llm_metadata(response, 'openai');

    // Set span attributes
    span.setAttributes({
      'llm.response.id': response.id,
      'llm.response.model': response.model,
      'llm.response.choices_count': response.choices?.length || 0,
      'llm.response.finish_reason': response.choices?.[0]?.finish_reason || 'unknown',
      'llm.usage.prompt_tokens': response.usage?.prompt_tokens || 0,
      'llm.usage.completion_tokens': response.usage?.completion_tokens || 0,
      'llm.usage.total_tokens': response.usage?.total_tokens || 0,
    });

    // Add cost estimation if available
    if (response.usage && response.model) {
      try {
        const cost = estimate_cost_from_tokens(
          response.usage.prompt_tokens,
          response.usage.completion_tokens,
          response.model
        );

        span.setAttributes({
          'llm.cost.input': cost.input_cost,
          'llm.cost.output': cost.output_cost,
          'llm.cost.total': cost.total_cost,
          'llm.cost.currency': cost.currency,
        });
      } catch {
        // Ignore cost calculation errors
      }
    }

    span.setStatus(SpanStatus.OK);
  } catch (error) {
    span.setStatus(SpanStatus.ERROR, error instanceof Error ? error.message : 'Unknown error');
  }
}
