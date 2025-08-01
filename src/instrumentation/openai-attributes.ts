/**
 * OpenAI Span Attributes Extraction and Validation
 *
 * Provides comprehensive extraction of 80+ span attributes including model metadata,
 * request parameters, token estimation, message analysis, vision content detection,
 * and function calling detection with type-safe validation patterns.
 */

import type { SDKVersionInfo, NormalizedResponse } from './openai-compat.js';
import { getModelInfo } from '../llm/model-registry.js';
import { estimate_token_count } from '../llm/token-counting.js';
import { estimate_cost_from_tokens } from '../llm/cost-estimation.js';

/**
 * Comprehensive span attributes interface
 */
export interface SpanAttributes {
  // Provider and Operation Info
  'llm.provider': string;
  'llm.operation': string;
  'llm.system': string;

  // Model Information
  'llm.model': string;
  'llm.model.name': string;
  'llm.model.provider': string;
  'llm.model.version'?: string;
  'llm.model.max_tokens'?: number;
  'llm.model.context_window'?: number;
  'llm.model.supports_vision'?: boolean;
  'llm.model.supports_audio'?: boolean;
  'llm.model.supports_function_calling'?: boolean;
  'llm.model.training_cutoff'?: string;

  // SDK Version Information
  'llm.sdk.name': string;
  'llm.sdk.version': string;
  'llm.sdk.major_version': number;
  'llm.sdk.is_legacy': boolean;
  'llm.sdk.compatibility_layer_enabled': boolean;

  // Request Parameters
  'llm.request.model': string;
  'llm.request.temperature'?: number;
  'llm.request.max_tokens'?: number;
  'llm.request.max_completion_tokens'?: number;
  'llm.request.top_p'?: number;
  'llm.request.frequency_penalty'?: number;
  'llm.request.presence_penalty'?: number;
  'llm.request.stop'?: string | string[];
  'llm.request.logprobs'?: boolean;
  'llm.request.top_logprobs'?: number;
  'llm.request.stream'?: boolean;
  'llm.request.seed'?: number;
  'llm.request.user'?: string;

  // Message Analysis
  'llm.messages.count': number;
  'llm.messages.system_count': number;
  'llm.messages.user_count': number;
  'llm.messages.assistant_count': number;
  'llm.messages.function_count': number;
  'llm.messages.tool_count': number;
  'llm.messages.total_length': number;
  'llm.messages.has_images': boolean;
  'llm.messages.has_audio': boolean;
  'llm.messages.image_count': number;
  'llm.messages.audio_count': number;

  // Vision Content Detection
  'llm.vision.enabled': boolean;
  'llm.vision.image_count': number;
  'llm.vision.image_urls': string[];
  'llm.vision.image_types': string[];
  'llm.vision.image_sizes': string[];
  'llm.vision.detail_level'?: string;

  // Function/Tool Calling
  'llm.function_calling.enabled': boolean;
  'llm.function_calling.tool_choice'?: string;
  'llm.function_calling.tools_count': number;
  'llm.function_calling.tool_names': string[];
  'llm.function_calling.parallel_tool_calls'?: boolean;

  // Response Information
  'llm.response.id'?: string;
  'llm.response.object'?: string;
  'llm.response.created'?: number;
  'llm.response.model'?: string;
  'llm.response.choices_count'?: number;
  'llm.response.finish_reason'?: string;
  'llm.response.finish_reasons'?: string[];
  'llm.response.has_function_calls'?: boolean;
  'llm.response.function_calls_count'?: number;
  'llm.response.has_tool_calls'?: boolean;
  'llm.response.tool_calls_count'?: number;

  // Token Usage and Estimation
  'llm.usage.prompt_tokens'?: number;
  'llm.usage.completion_tokens'?: number;
  'llm.usage.total_tokens'?: number;
  'llm.usage.prompt_tokens_estimated'?: number;
  'llm.usage.completion_tokens_estimated'?: number;
  'llm.usage.total_tokens_estimated'?: number;
  'llm.usage.prompt_characters'?: number;
  'llm.usage.completion_characters'?: number;
  'llm.usage.total_characters'?: number;

  // Cost Information
  'llm.cost.input_cost'?: number;
  'llm.cost.output_cost'?: number;
  'llm.cost.total_cost'?: number;
  'llm.cost.currency'?: string;
  'llm.cost.input_rate_per_1m'?: number;
  'llm.cost.output_rate_per_1m'?: number;

  // Content Analysis
  'llm.content.input_text_length': number;
  'llm.content.output_text_length': number;
  'llm.content.languages_detected': string[];
  'llm.content.has_code_blocks': boolean;
  'llm.content.code_languages': string[];
  'llm.content.has_structured_data': boolean;
  'llm.content.structured_formats': string[];

  // Performance Metrics
  'llm.latency.first_token'?: number;
  'llm.latency.total'?: number;
  'llm.latency.tokens_per_second'?: number;
  'llm.streaming.enabled': boolean;
  'llm.streaming.chunk_count'?: number;
  'llm.streaming.first_chunk_time'?: number;
  'llm.streaming.last_chunk_time'?: number;

  // Error Information (if applicable)
  'llm.error.type'?: string;
  'llm.error.message'?: string;
  'llm.error.code'?: string;
  'llm.error.status_code'?: number;

  // Additional Metadata
  'llm.request_id'?: string;
  'llm.trace_id'?: string;
  'llm.environment'?: string;
  'llm.timestamp'?: string;
}

/**
 * Validation configuration for attribute extraction
 */
export interface ValidationConfig {
  strict_mode: boolean;
  require_model_info: boolean;
  estimate_tokens: boolean;
  calculate_costs: boolean;
  analyze_content: boolean;
  detect_vision: boolean;
  detect_functions: boolean;
  sanitize_content: boolean;
  max_content_length: number;
  max_array_size: number;
}

/**
 * Default validation configuration
 */
export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  strict_mode: false,
  require_model_info: true,
  estimate_tokens: true,
  calculate_costs: true,
  analyze_content: true,
  detect_vision: true,
  detect_functions: true,
  sanitize_content: true,
  max_content_length: 10000,
  max_array_size: 100,
};

/**
 * Extraction result with validation info
 */
export interface ExtractionResult {
  attributes: Partial<SpanAttributes>;
  warnings: string[];
  errors: string[];
  metadata: {
    extraction_time: number;
    attributes_extracted: number;
    validation_passed: boolean;
    content_analyzed: boolean;
  };
}

/**
 * Extracts comprehensive span attributes from OpenAI request/response
 */
export async function extractSpanAttributes(
  operation: string,
  request: any,
  response?: NormalizedResponse,
  error?: Error,
  context?: {
    sdk_version?: SDKVersionInfo;
    start_time?: number;
    end_time?: number;
    streaming_metadata?: any;
  },
  config: ValidationConfig = DEFAULT_VALIDATION_CONFIG
): Promise<ExtractionResult> {
  const startTime = Date.now();
  const attributes: Partial<SpanAttributes> = {};
  const warnings: string[] = [];
  const errors: string[] = [];

  try {
    // Core provider and operation info
    extractProviderInfo(attributes, operation);

    // Model information
    if (request?.model) {
      await extractModelInfo(attributes, request.model, warnings);
    } else if (config.require_model_info) {
      errors.push('Model information is required but not provided');
    }

    // SDK version information
    if (context?.sdk_version) {
      extractSDKInfo(attributes, context.sdk_version);
    }

    // Request parameters
    extractRequestParameters(attributes, request, warnings);

    // Message analysis
    if (request?.messages) {
      await extractMessageAnalysis(attributes, request.messages, config, warnings);
    }

    // Vision content detection
    if (config.detect_vision && request?.messages) {
      extractVisionContent(attributes, request.messages, warnings);
    }

    // Function/tool calling detection
    if (config.detect_functions) {
      extractFunctionCalling(attributes, request, response, warnings);
    }

    // Response information
    if (response) {
      extractResponseInfo(attributes, response, warnings);
    }

    // Token usage and estimation
    if (response?.usage || config.estimate_tokens) {
      await extractTokenUsage(attributes, request, response, config, warnings);
    }

    // Cost calculation
    if (config.calculate_costs && attributes['llm.model']) {
      await extractCostInfo(attributes, warnings);
    }

    // Content analysis
    if (config.analyze_content) {
      extractContentAnalysis(attributes, request, response, config, warnings);
    }

    // Performance metrics
    if (context?.start_time !== undefined && context?.end_time !== undefined) {
      extractPerformanceMetrics(
        attributes,
        {
          start_time: context.start_time,
          end_time: context.end_time,
          streaming_metadata: context.streaming_metadata,
        },
        warnings
      );
    }

    // Streaming metadata
    if (context?.streaming_metadata) {
      extractStreamingInfo(attributes, context.streaming_metadata, warnings);
    }

    // Error information
    if (error) {
      extractErrorInfo(attributes, error, warnings);
    }

    // Additional metadata
    extractAdditionalMetadata(attributes, request, context);
  } catch (extractionError) {
    errors.push(
      `Extraction failed: ${extractionError instanceof Error ? extractionError.message : 'Unknown error'}`
    );
  }

  const extractionTime = Date.now() - startTime;

  return {
    attributes,
    warnings,
    errors,
    metadata: {
      extraction_time: extractionTime,
      attributes_extracted: Object.keys(attributes).length,
      validation_passed: errors.length === 0,
      content_analyzed: config.analyze_content,
    },
  };
}

/**
 * Extracts core provider and operation information
 */
function extractProviderInfo(attributes: Partial<SpanAttributes>, operation: string): void {
  attributes['llm.provider'] = 'openai';
  attributes['llm.operation'] = operation;
  attributes['llm.system'] = 'openai';
}

/**
 * Extracts model information from registry
 */
async function extractModelInfo(
  attributes: Partial<SpanAttributes>,
  modelName: string,
  warnings: string[]
): Promise<void> {
  try {
    const modelInfo = getModelInfo(modelName);

    if (modelInfo) {
      attributes['llm.model'] = modelName;
      attributes['llm.model.name'] = modelInfo.name;
      attributes['llm.model.provider'] = modelInfo.provider;
      attributes['llm.model.max_tokens'] = modelInfo.max_output_tokens;
      attributes['llm.model.context_window'] = modelInfo.context_window;
      attributes['llm.model.supports_vision'] = modelInfo.supports_vision;
      attributes['llm.model.supports_audio'] = modelInfo.supports_audio;
      attributes['llm.model.supports_function_calling'] = modelInfo.supports_function_calling;
      attributes['llm.model.training_cutoff'] = modelInfo.training_cutoff;
    } else {
      attributes['llm.model'] = modelName;
      attributes['llm.model.name'] = modelName;
      attributes['llm.model.provider'] = 'openai';
      warnings.push(`Model '${modelName}' not found in registry, using default values`);
    }
  } catch (error) {
    warnings.push(
      `Failed to extract model info: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Extracts SDK version information
 */
function extractSDKInfo(attributes: Partial<SpanAttributes>, sdkVersion: SDKVersionInfo): void {
  attributes['llm.sdk.name'] = 'openai';
  attributes['llm.sdk.version'] = sdkVersion.fullVersion;
  attributes['llm.sdk.major_version'] = sdkVersion.majorVersion;
  attributes['llm.sdk.is_legacy'] = sdkVersion.isLegacy;
  attributes['llm.sdk.compatibility_layer_enabled'] = true;
}

/**
 * Extracts request parameters
 */
function extractRequestParameters(
  attributes: Partial<SpanAttributes>,
  request: any,
  warnings: string[]
): void {
  if (!request) return;

  try {
    // Core request parameters
    if (request.model) attributes['llm.request.model'] = request.model;
    if (typeof request.temperature === 'number')
      attributes['llm.request.temperature'] = request.temperature;
    if (typeof request.max_tokens === 'number')
      attributes['llm.request.max_tokens'] = request.max_tokens;
    if (typeof request.max_completion_tokens === 'number')
      attributes['llm.request.max_completion_tokens'] = request.max_completion_tokens;
    if (typeof request.top_p === 'number') attributes['llm.request.top_p'] = request.top_p;
    if (typeof request.frequency_penalty === 'number')
      attributes['llm.request.frequency_penalty'] = request.frequency_penalty;
    if (typeof request.presence_penalty === 'number')
      attributes['llm.request.presence_penalty'] = request.presence_penalty;
    if (request.stop)
      attributes['llm.request.stop'] = Array.isArray(request.stop)
        ? request.stop.join(',')
        : request.stop;
    if (typeof request.logprobs === 'boolean')
      attributes['llm.request.logprobs'] = request.logprobs;
    if (typeof request.top_logprobs === 'number')
      attributes['llm.request.top_logprobs'] = request.top_logprobs;
    if (typeof request.stream === 'boolean') attributes['llm.request.stream'] = request.stream;
    if (typeof request.seed === 'number') attributes['llm.request.seed'] = request.seed;
    if (request.user) attributes['llm.request.user'] = request.user;
  } catch (error) {
    warnings.push(
      `Failed to extract request parameters: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Extracts message analysis information
 */
async function extractMessageAnalysis(
  attributes: Partial<SpanAttributes>,
  messages: any[],
  _config: ValidationConfig,
  warnings: string[]
): Promise<void> {
  if (!Array.isArray(messages)) return;

  try {
    let systemCount = 0;
    let userCount = 0;
    let assistantCount = 0;
    let functionCount = 0;
    let toolCount = 0;
    let totalLength = 0;
    let hasImages = false;
    let hasAudio = false;
    let imageCount = 0;
    let audioCount = 0;

    for (const message of messages) {
      if (!message || typeof message !== 'object') continue;

      // Count by role
      switch (message.role) {
        case 'system':
          systemCount++;
          break;
        case 'user':
          userCount++;
          break;
        case 'assistant':
          assistantCount++;
          break;
        case 'function':
          functionCount++;
          break;
        case 'tool':
          toolCount++;
          break;
      }

      // Analyze content
      if (message.content) {
        if (typeof message.content === 'string') {
          totalLength += message.content.length;
        } else if (Array.isArray(message.content)) {
          // Multi-modal content analysis
          for (const content of message.content) {
            if (content.type === 'text' && content.text) {
              totalLength += content.text.length;
            } else if (content.type === 'image_url') {
              hasImages = true;
              imageCount++;
            } else if (content.type === 'audio') {
              hasAudio = true;
              audioCount++;
            }
          }
        }
      }
    }

    attributes['llm.messages.count'] = messages.length;
    attributes['llm.messages.system_count'] = systemCount;
    attributes['llm.messages.user_count'] = userCount;
    attributes['llm.messages.assistant_count'] = assistantCount;
    attributes['llm.messages.function_count'] = functionCount;
    attributes['llm.messages.tool_count'] = toolCount;
    attributes['llm.messages.total_length'] = totalLength;
    attributes['llm.messages.has_images'] = hasImages;
    attributes['llm.messages.has_audio'] = hasAudio;
    attributes['llm.messages.image_count'] = imageCount;
    attributes['llm.messages.audio_count'] = audioCount;
  } catch (error) {
    warnings.push(
      `Failed to analyze messages: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Extracts vision content information
 */
function extractVisionContent(
  attributes: Partial<SpanAttributes>,
  messages: any[],
  warnings: string[]
): void {
  if (!Array.isArray(messages)) return;

  try {
    let visionEnabled = false;
    let imageCount = 0;
    const imageUrls: string[] = [];
    const imageTypes: string[] = [];
    const imageSizes: string[] = [];
    let detailLevel: string | undefined;

    for (const message of messages) {
      if (!message?.content || !Array.isArray(message.content)) continue;

      for (const content of message.content) {
        if (content.type === 'image_url' && content.image_url) {
          visionEnabled = true;
          imageCount++;

          if (content.image_url.url) {
            imageUrls.push(content.image_url.url);
          }

          if (content.image_url.detail) {
            detailLevel = content.image_url.detail;
          }

          // Extract image type from URL if possible
          const url = content.image_url.url;
          if (url) {
            const match = url.match(/data:image\/(\w+);base64/);
            if (match) {
              imageTypes.push(match[1]);
            } else if (url.includes('.')) {
              const ext = url.split('.').pop()?.toLowerCase();
              if (ext && ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
                imageTypes.push(ext);
              }
            }
          }
        }
      }
    }

    attributes['llm.vision.enabled'] = visionEnabled;
    attributes['llm.vision.image_count'] = imageCount;
    attributes['llm.vision.image_urls'] = imageUrls.slice(0, 10); // Limit for privacy
    attributes['llm.vision.image_types'] = [...new Set(imageTypes)];
    attributes['llm.vision.image_sizes'] = imageSizes;
    if (detailLevel) {
      attributes['llm.vision.detail_level'] = detailLevel;
    }
  } catch (error) {
    warnings.push(
      `Failed to extract vision content: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Extracts function/tool calling information
 */
function extractFunctionCalling(
  attributes: Partial<SpanAttributes>,
  request: any,
  response: NormalizedResponse | undefined,
  warnings: string[]
): void {
  try {
    let functionCallingEnabled = false;
    let toolsCount = 0;
    const toolNames: string[] = [];
    let toolChoice: string | undefined;
    let parallelToolCalls: boolean | undefined;
    let hasResponseFunctionCalls = false;
    let functionCallsCount = 0;
    let hasResponseToolCalls = false;
    let toolCallsCount = 0;

    // Analyze request
    if (request) {
      if (request.functions && Array.isArray(request.functions)) {
        functionCallingEnabled = true;
        toolsCount = request.functions.length;
        request.functions.forEach((func: any) => {
          if (func.name) toolNames.push(func.name);
        });
      }

      if (request.tools && Array.isArray(request.tools)) {
        functionCallingEnabled = true;
        toolsCount = request.tools.length;
        request.tools.forEach((tool: any) => {
          if (tool.function?.name) toolNames.push(tool.function.name);
        });
      }

      if (request.function_call) {
        toolChoice = typeof request.function_call === 'string' ? request.function_call : 'auto';
      }

      if (request.tool_choice) {
        toolChoice = typeof request.tool_choice === 'string' ? request.tool_choice : 'auto';
      }

      if (typeof request.parallel_tool_calls === 'boolean') {
        parallelToolCalls = request.parallel_tool_calls;
      }
    }

    // Analyze response
    if (response?.choices) {
      for (const choice of response.choices) {
        if (choice.message?.function_call) {
          hasResponseFunctionCalls = true;
          functionCallsCount++;
        }

        if (choice.message?.tool_calls && Array.isArray(choice.message.tool_calls)) {
          hasResponseToolCalls = true;
          toolCallsCount += choice.message.tool_calls.length;
        }
      }
    }

    attributes['llm.function_calling.enabled'] = functionCallingEnabled;
    attributes['llm.function_calling.tools_count'] = toolsCount;
    attributes['llm.function_calling.tool_names'] = toolNames;
    if (toolChoice) {
      attributes['llm.function_calling.tool_choice'] = toolChoice;
    }
    if (parallelToolCalls !== undefined) {
      attributes['llm.function_calling.parallel_tool_calls'] = parallelToolCalls;
    }
    if (hasResponseFunctionCalls) {
      attributes['llm.response.has_function_calls'] = true;
      attributes['llm.response.function_calls_count'] = functionCallsCount;
    }
    if (hasResponseToolCalls) {
      attributes['llm.response.has_tool_calls'] = true;
      attributes['llm.response.tool_calls_count'] = toolCallsCount;
    }
  } catch (error) {
    warnings.push(
      `Failed to extract function calling info: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Extracts response information
 */
function extractResponseInfo(
  attributes: Partial<SpanAttributes>,
  response: NormalizedResponse,
  warnings: string[]
): void {
  try {
    if (response.id) attributes['llm.response.id'] = response.id;
    if (response.object) attributes['llm.response.object'] = response.object;
    if (response.created) attributes['llm.response.created'] = response.created;
    if (response.model) attributes['llm.response.model'] = response.model;

    if (response.choices) {
      attributes['llm.response.choices_count'] = response.choices.length;

      const finishReasons = response.choices
        .map(choice => choice.finish_reason)
        .filter((reason): reason is string => typeof reason === 'string' && reason.length > 0);

      if (finishReasons.length > 0) {
        const firstReason = finishReasons[0];
        if (firstReason) {
          attributes['llm.response.finish_reason'] = firstReason;
        }
        attributes['llm.response.finish_reasons'] = finishReasons;
      }
    }
  } catch (error) {
    warnings.push(
      `Failed to extract response info: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Extracts token usage and estimation
 */
async function extractTokenUsage(
  attributes: Partial<SpanAttributes>,
  request: any,
  response: NormalizedResponse | undefined,
  _config: ValidationConfig,
  warnings: string[]
): Promise<void> {
  try {
    // Extract actual usage from response
    if (response?.usage) {
      if (response.usage.prompt_tokens) {
        attributes['llm.usage.prompt_tokens'] = response.usage.prompt_tokens;
      }
      if (response.usage.completion_tokens) {
        attributes['llm.usage.completion_tokens'] = response.usage.completion_tokens;
      }
      if (response.usage.total_tokens) {
        attributes['llm.usage.total_tokens'] = response.usage.total_tokens;
      }
    }

    // Estimate tokens if requested and model available
    if (_config.estimate_tokens && request?.model) {
      try {
        // Estimate prompt tokens
        let promptText = '';
        if (request.messages && Array.isArray(request.messages)) {
          promptText = request.messages
            .map((msg: any) => {
              if (typeof msg.content === 'string') {
                return msg.content;
              } else if (Array.isArray(msg.content)) {
                return msg.content
                  .filter((c: any) => c.type === 'text' && c.text)
                  .map((c: any) => c.text)
                  .join(' ');
              }
              return '';
            })
            .join(' ');
        }

        if (promptText) {
          const promptTokens = await estimate_token_count(promptText, request.model);
          attributes['llm.usage.prompt_tokens_estimated'] = promptTokens.total;
          attributes['llm.usage.prompt_characters'] = promptText.length;
        }

        // Estimate completion tokens
        if (response?.choices?.[0]?.message?.content) {
          const completionText = response.choices[0].message.content;
          const completionTokens = await estimate_token_count(completionText, request.model);
          attributes['llm.usage.completion_tokens_estimated'] = completionTokens.total;
          attributes['llm.usage.completion_characters'] = completionText.length;

          const totalEstimated =
            (attributes['llm.usage.prompt_tokens_estimated'] || 0) + completionTokens.total;
          attributes['llm.usage.total_tokens_estimated'] = totalEstimated;
          attributes['llm.usage.total_characters'] =
            (attributes['llm.usage.prompt_characters'] || 0) + completionText.length;
        }
      } catch (error) {
        warnings.push(
          `Token estimation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  } catch (error) {
    warnings.push(
      `Failed to extract token usage: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Extracts cost information
 */
async function extractCostInfo(
  attributes: Partial<SpanAttributes>,
  warnings: string[]
): Promise<void> {
  try {
    const promptTokens =
      attributes['llm.usage.prompt_tokens'] || attributes['llm.usage.prompt_tokens_estimated'];
    const completionTokens =
      attributes['llm.usage.completion_tokens'] ||
      attributes['llm.usage.completion_tokens_estimated'];
    const model = attributes['llm.model'] as string;

    if (promptTokens && completionTokens && model) {
      const costInfo = estimate_cost_from_tokens(promptTokens, completionTokens, model);

      attributes['llm.cost.input_cost'] = costInfo.input_cost;
      attributes['llm.cost.output_cost'] = costInfo.output_cost;
      attributes['llm.cost.total_cost'] = costInfo.total_cost;
      attributes['llm.cost.currency'] = costInfo.currency;
      attributes['llm.cost.input_rate_per_1m'] = costInfo.rates.input_rate_per_1m;
      attributes['llm.cost.output_rate_per_1m'] = costInfo.rates.output_rate_per_1m;
    }
  } catch (error) {
    warnings.push(
      `Cost calculation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Extracts content analysis information
 */
function extractContentAnalysis(
  attributes: Partial<SpanAttributes>,
  request: any,
  response: NormalizedResponse | undefined,
  _config: ValidationConfig,
  warnings: string[]
): void {
  try {
    let inputTextLength = 0;
    let outputTextLength = 0;
    const languagesDetected: string[] = [];
    let hasCodeBlocks = false;
    const codeLanguages: string[] = [];
    let hasStructuredData = false;
    const structuredFormats: string[] = [];

    // Analyze input content
    if (request?.messages && Array.isArray(request.messages)) {
      for (const message of request.messages) {
        if (typeof message.content === 'string') {
          inputTextLength += message.content.length;

          // Detect code blocks
          if (message.content.includes('```')) {
            hasCodeBlocks = true;
            const codeBlockMatches = message.content.match(/```(\w+)?/g);
            if (codeBlockMatches) {
              codeBlockMatches.forEach((match: string) => {
                const lang = match.replace('```', '');
                if (lang && !codeLanguages.includes(lang)) {
                  codeLanguages.push(lang);
                }
              });
            }
          }

          // Detect structured data
          if (message.content.includes('{') && message.content.includes('}')) {
            hasStructuredData = true;
            structuredFormats.push('json');
          }
          if (message.content.includes('<') && message.content.includes('>')) {
            hasStructuredData = true;
            structuredFormats.push('xml');
          }
        }
      }
    }

    // Analyze output content
    if (response?.choices?.[0]?.message?.content) {
      const content = response.choices[0].message.content;
      outputTextLength = content.length;

      // Additional analysis on output content
      if (content.includes('```')) {
        hasCodeBlocks = true;
      }
      if (content.includes('{') && content.includes('}')) {
        hasStructuredData = true;
        if (!structuredFormats.includes('json')) {
          structuredFormats.push('json');
        }
      }
    }

    attributes['llm.content.input_text_length'] = inputTextLength;
    attributes['llm.content.output_text_length'] = outputTextLength;
    attributes['llm.content.languages_detected'] = languagesDetected;
    attributes['llm.content.has_code_blocks'] = hasCodeBlocks;
    attributes['llm.content.code_languages'] = codeLanguages;
    attributes['llm.content.has_structured_data'] = hasStructuredData;
    attributes['llm.content.structured_formats'] = [...new Set(structuredFormats)];
  } catch (error) {
    warnings.push(
      `Content analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Extracts performance metrics
 */
function extractPerformanceMetrics(
  attributes: Partial<SpanAttributes>,
  context: { start_time: number; end_time: number; streaming_metadata?: any },
  warnings: string[]
): void {
  try {
    const totalLatency = context.end_time - context.start_time;
    attributes['llm.latency.total'] = totalLatency;

    if (context.streaming_metadata) {
      if (context.streaming_metadata.first_chunk_time) {
        attributes['llm.latency.first_token'] =
          context.streaming_metadata.first_chunk_time - context.start_time;
      }

      const completionTokens =
        attributes['llm.usage.completion_tokens'] ||
        attributes['llm.usage.completion_tokens_estimated'];
      if (completionTokens && totalLatency > 0) {
        attributes['llm.latency.tokens_per_second'] = completionTokens / (totalLatency / 1000);
      }
    }
  } catch (error) {
    warnings.push(
      `Performance metrics extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Extracts streaming information
 */
function extractStreamingInfo(
  attributes: Partial<SpanAttributes>,
  streamingMetadata: any,
  warnings: string[]
): void {
  try {
    attributes['llm.streaming.enabled'] = true;

    if (streamingMetadata.chunk_count) {
      attributes['llm.streaming.chunk_count'] = streamingMetadata.chunk_count;
    }
    if (streamingMetadata.first_chunk_time) {
      attributes['llm.streaming.first_chunk_time'] = streamingMetadata.first_chunk_time;
    }
    if (streamingMetadata.last_chunk_time) {
      attributes['llm.streaming.last_chunk_time'] = streamingMetadata.last_chunk_time;
    }
  } catch (error) {
    warnings.push(
      `Streaming info extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Extracts error information
 */
function extractErrorInfo(
  attributes: Partial<SpanAttributes>,
  error: Error,
  warnings: string[]
): void {
  try {
    attributes['llm.error.type'] = error.name;
    attributes['llm.error.message'] = error.message;

    if ((error as any).code) {
      attributes['llm.error.code'] = (error as any).code;
    }
    if ((error as any).status || (error as any).statusCode) {
      attributes['llm.error.status_code'] = (error as any).status || (error as any).statusCode;
    }
  } catch (extractionError) {
    warnings.push(
      `Error info extraction failed: ${extractionError instanceof Error ? extractionError.message : 'Unknown error'}`
    );
  }
}

/**
 * Extracts additional metadata
 */
function extractAdditionalMetadata(
  attributes: Partial<SpanAttributes>,
  request: any,
  _context?: { sdk_version?: SDKVersionInfo; start_time?: number }
): void {
  if (request?.user) {
    attributes['llm.request_id'] = request.user;
  }

  attributes['llm.timestamp'] = new Date().toISOString();

  if (process.env.NODE_ENV) {
    attributes['llm.environment'] = process.env.NODE_ENV;
  }
}

/**
 * Validates extracted attributes for completeness and correctness
 */
export function validateAttributes(
  attributes: Partial<SpanAttributes>,
  config: ValidationConfig
): { isValid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required attributes check
  if (!attributes['llm.provider']) {
    errors.push('llm.provider is required');
  }
  if (!attributes['llm.operation']) {
    errors.push('llm.operation is required');
  }
  if (config.require_model_info && !attributes['llm.model']) {
    errors.push('llm.model is required when require_model_info is true');
  }

  // Consistency checks
  if (attributes['llm.usage.total_tokens']) {
    const prompt = attributes['llm.usage.prompt_tokens'] || 0;
    const completion = attributes['llm.usage.completion_tokens'] || 0;
    if (attributes['llm.usage.total_tokens'] !== prompt + completion) {
      warnings.push('Total tokens does not equal sum of prompt and completion tokens');
    }
  }

  // Range validations
  if (attributes['llm.request.temperature'] !== undefined) {
    const temp = attributes['llm.request.temperature'];
    if (temp < 0 || temp > 2) {
      warnings.push('Temperature should be between 0 and 2');
    }
  }

  if (attributes['llm.request.top_p'] !== undefined) {
    const topP = attributes['llm.request.top_p'];
    if (topP < 0 || topP > 1) {
      warnings.push('top_p should be between 0 and 1');
    }
  }

  // Array size validations
  const arrayFields = [
    'llm.vision.image_urls',
    'llm.vision.image_types',
    'llm.function_calling.tool_names',
    'llm.content.languages_detected',
    'llm.content.code_languages',
    'llm.content.structured_formats',
  ];

  arrayFields.forEach(field => {
    const value = (attributes as any)[field];
    if (Array.isArray(value) && value.length > config.max_array_size) {
      warnings.push(
        `${field} array size (${value.length}) exceeds limit (${config.max_array_size})`
      );
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
