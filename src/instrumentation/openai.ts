/**
 * OpenAI SDK Instrumentation
 *
 * Provides automatic instrumentation for the OpenAI SDK, capturing
 * API calls, responses, token usage, and costs.
 */

import { BaseInstrumentation } from './base.js';
import type { InstrumentationTarget, InstrumentationContext } from './types.js';

// LLM utilities for token counting and metadata extraction
import { estimate_token_count, extract_llm_metadata } from '../llm/index.js';

/**
 * OpenAI SDK instrumentation class
 */
export class OpenAIInstrumentation extends BaseInstrumentation {
  readonly target: InstrumentationTarget = 'openai';
  readonly name = 'OpenAI SDK Instrumentation';
  readonly version = '1.0.0';

  /**
   * Check if an instance is a supported OpenAI client
   */
  isSupported(instance: any): boolean {
    if (!instance || typeof instance !== 'object') {
      return false;
    }

    // Check for OpenAI SDK patterns
    return (
      // Modern OpenAI SDK (v4+)
      (instance.chat &&
        instance.chat.completions &&
        typeof instance.chat.completions.create === 'function') ||
      (instance.completions && typeof instance.completions.create === 'function') ||
      // Legacy OpenAI SDK patterns
      (instance.createChatCompletion && typeof instance.createChatCompletion === 'function') ||
      (instance.createCompletion && typeof instance.createCompletion === 'function') ||
      // Constructor name check
      instance.constructor?.name === 'OpenAI' ||
      // Package detection
      instance._client?.constructor?.name === 'OpenAI'
    );
  }

  /**
   * Get the version of the OpenAI SDK
   */
  getLibraryVersion(instance: any): string | undefined {
    try {
      // Try to get version from various locations
      if (instance.version) return instance.version;
      if (instance._version) return instance._version;
      if (instance.constructor?.version) return instance.constructor.version;

      // Check package.json if available
      if (typeof require !== 'undefined') {
        try {
          const pkg = require('openai/package.json');
          return pkg.version;
        } catch {
          // Ignore require errors
        }
      }

      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Get methods that should be instrumented for OpenAI SDK
   */
  protected getMethodsToInstrument(instance: any): string[] {
    const methods: string[] = [];

    // Modern OpenAI SDK (v4+) methods
    if (instance.chat?.completions?.create) {
      methods.push('chat.completions.create');
    }
    if (instance.completions?.create) {
      methods.push('completions.create');
    }
    if (instance.embeddings?.create) {
      methods.push('embeddings.create');
    }
    if (instance.images?.generate) {
      methods.push('images.generate');
    }
    if (instance.images?.edit) {
      methods.push('images.edit');
    }
    if (instance.images?.createVariation) {
      methods.push('images.createVariation');
    }
    if (instance.audio?.transcriptions?.create) {
      methods.push('audio.transcriptions.create');
    }
    if (instance.audio?.translations?.create) {
      methods.push('audio.translations.create');
    }
    if (instance.audio?.speech?.create) {
      methods.push('audio.speech.create');
    }
    if (instance.moderations?.create) {
      methods.push('moderations.create');
    }

    // Legacy methods (v3 and earlier)
    if (instance.createChatCompletion) {
      methods.push('createChatCompletion');
    }
    if (instance.createCompletion) {
      methods.push('createCompletion');
    }
    if (instance.createEmbedding) {
      methods.push('createEmbedding');
    }

    return methods;
  }

  /**
   * Get the target object that contains the method to instrument
   */
  protected override getMethodTarget(instance: any, methodName: string): any {
    const path = methodName.split('.');
    let target = instance;

    // Navigate to the correct nested object
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (key && target[key]) {
        target = target[key];
      } else {
        return null; // Path doesn't exist
      }
    }

    return target;
  }

  /**
   * Extract OpenAI-specific metadata from method call
   */
  private extractOpenAIMetadata(context: InstrumentationContext): Record<string, any> {
    const metadata: Record<string, any> = {
      'llm.provider': 'openai',
      'llm.request.type': this.getRequestType(context.methodName),
    };

    if (context.arguments.length > 0) {
      const params = context.arguments[0];

      if (params && typeof params === 'object') {
        // Extract common parameters
        if (params.model) {
          metadata['llm.request.model'] = params.model;
        }
        if (params.max_tokens !== undefined) {
          metadata['llm.request.max_tokens'] = params.max_tokens;
        }
        if (params.temperature !== undefined) {
          metadata['llm.request.temperature'] = params.temperature;
        }
        if (params.top_p !== undefined) {
          metadata['llm.request.top_p'] = params.top_p;
        }
        if (params.stream !== undefined) {
          metadata['llm.request.stream'] = params.stream;
        }

        // Extract messages for chat completions
        if (params.messages && Array.isArray(params.messages)) {
          metadata['llm.request.messages_count'] = params.messages.length;

          // Count tokens if enabled
          if (context.config.countTokens && params.model) {
            try {
              const totalTokens = 0;
              for (const msg of params.messages) {
                if (msg.content && typeof msg.content === 'string') {
                  // Token counting temporarily disabled to fix build
                  // TODO: Implement proper async token counting
                  // const tokenCount = await estimate_token_count(msg.content, params.model);
                  // totalTokens += typeof tokenCount === 'object' ? tokenCount.token_count : tokenCount;
                }
              }
              metadata['llm.usage.prompt_tokens'] = totalTokens;
            } catch (error) {
              console.warn('Failed to estimate token count:', error);
            }
          }
        }

        // Extract prompt for legacy completions
        if (params.prompt) {
          if (typeof params.prompt === 'string') {
            if (context.config.countTokens && params.model) {
              try {
                metadata['llm.usage.prompt_tokens'] = estimate_token_count(
                  params.prompt,
                  params.model
                );
              } catch (error) {
                console.warn('Failed to estimate token count:', error);
              }
            }
          } else if (Array.isArray(params.prompt)) {
            metadata['llm.request.prompts_count'] = params.prompt.length;
          }
        }
      }
    }

    return metadata;
  }

  /**
   * Extract response metadata from OpenAI API response
   */
  private extractResponseMetadata(
    response: any,
    context: InstrumentationContext
  ): Record<string, any> {
    const metadata: Record<string, any> = {};

    if (!response || typeof response !== 'object') {
      return metadata;
    }

    // Extract usage information
    if (response.usage) {
      metadata['llm.usage.prompt_tokens'] = response.usage.prompt_tokens;
      metadata['llm.usage.completion_tokens'] = response.usage.completion_tokens;
      metadata['llm.usage.total_tokens'] = response.usage.total_tokens;

      // Estimate costs if enabled
      if (context.config.estimateCosts) {
        // Cost estimation is handled asynchronously in the instrumentation layer
        // to avoid blocking the response metadata extraction
        const model = this.extractModelFromContext(context);
        if (model) {
          metadata['llm.usage.estimated_model'] = model;
        }
      }
    }

    // Extract model information
    if (response.model) {
      metadata['llm.response.model'] = response.model;
    }

    // Extract response details
    if (response.choices && Array.isArray(response.choices)) {
      metadata['llm.response.choices_count'] = response.choices.length;

      // Get finish reasons
      const finishReasons = response.choices
        .map((choice: any) => choice.finish_reason)
        .filter(Boolean);
      if (finishReasons.length > 0) {
        metadata['llm.response.finish_reasons'] = finishReasons;
      }
    }

    // Extract other response fields
    if (response.id) {
      metadata['llm.response.id'] = response.id;
    }
    if (response.object) {
      metadata['llm.response.object'] = response.object;
    }
    if (response.created) {
      metadata['llm.response.created'] = response.created;
    }

    return metadata;
  }

  /**
   * Extract model name from context
   */
  private extractModelFromContext(context: InstrumentationContext): string | undefined {
    if (context.arguments.length > 0) {
      const params = context.arguments[0];
      if (params && typeof params === 'object' && params.model) {
        return params.model;
      }
    }
    return undefined;
  }

  /**
   * Get request type based on method name
   */
  private getRequestType(methodName: string): string {
    if (methodName.includes('chat') || methodName.includes('ChatCompletion')) {
      return 'chat';
    } else if (methodName.includes('completion')) {
      return 'completion';
    } else if (methodName.includes('embedding')) {
      return 'embedding';
    } else if (methodName.includes('image')) {
      return 'image';
    } else if (methodName.includes('audio')) {
      return 'audio';
    } else if (methodName.includes('moderation')) {
      return 'moderation';
    }
    return 'unknown';
  }

  /**
   * Hook called before OpenAI method execution
   */
  protected override beforeMethodCall(context: InstrumentationContext): void {
    try {
      // Extract and add OpenAI-specific metadata
      const openaiMetadata = this.extractOpenAIMetadata(context);
      Object.assign(context.attributes, openaiMetadata);
    } catch (error) {
      console.warn('Failed to extract OpenAI metadata in beforeMethodCall:', error);
    }
  }

  /**
   * Hook called after successful OpenAI method execution
   */
  protected override afterMethodCall(context: InstrumentationContext, result: any): void {
    try {
      // Extract response metadata
      const responseMetadata = this.extractResponseMetadata(result, context);
      Object.assign(context.attributes, responseMetadata);

      // Extract LLM metadata using utility function
      try {
        const model = this.extractModelFromContext(context);
        const llmMetadata = extract_llm_metadata(result, model, 'openai');
        Object.assign(context.attributes, llmMetadata);
      } catch (error) {
        console.warn('Failed to extract LLM metadata:', error);
      }
    } catch (error) {
      console.warn('Failed to extract response metadata in afterMethodCall:', error);
    }
  }

  /**
   * Hook called when OpenAI method execution throws an error
   */
  protected override onMethodError(context: InstrumentationContext, error: Error): void {
    try {
      // Add error-specific attributes
      context.attributes['llm.error.type'] = error.name;
      context.attributes['llm.error.message'] = error.message;

      // Extract OpenAI-specific error information
      if ((error as any).status) {
        context.attributes['llm.error.status_code'] = (error as any).status;
      }
      if ((error as any).code) {
        context.attributes['llm.error.code'] = (error as any).code;
      }
      if ((error as any).type) {
        context.attributes['llm.error.openai_type'] = (error as any).type;
      }
    } catch (extractError) {
      console.warn('Failed to extract error metadata in onMethodError:', extractError);
    }
  }
}
