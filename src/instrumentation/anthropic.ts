/**
 * Anthropic SDK Instrumentation
 *
 * Provides automatic instrumentation for the Anthropic SDK, capturing
 * API calls, responses, token usage, and costs.
 */

import { BaseInstrumentation } from './base.js';
import type { InstrumentationTarget, InstrumentationContext } from './types.js';

// LLM utilities for cost estimation and token counting
import { extract_llm_metadata } from '../llm/index.js';

/**
 * Anthropic SDK instrumentation class
 */
export class AnthropicInstrumentation extends BaseInstrumentation {
  readonly target: InstrumentationTarget = 'anthropic';
  readonly name = 'Anthropic SDK Instrumentation';
  readonly version = '1.0.0';

  /**
   * Check if an instance is a supported Anthropic client
   */
  isSupported(instance: any): boolean {
    if (!instance || typeof instance !== 'object') {
      return false;
    }

    // Check for Anthropic SDK patterns
    return (
      // Modern Anthropic SDK
      (instance.messages && typeof instance.messages.create === 'function') ||
      (instance.completions && typeof instance.completions.create === 'function') ||
      // Legacy patterns
      (instance.complete && typeof instance.complete === 'function') ||
      // Constructor name check
      instance.constructor?.name === 'Anthropic' ||
      instance.constructor?.name === 'AnthropicClient' ||
      // Package detection
      instance._client?.constructor?.name === 'Anthropic'
    );
  }

  /**
   * Get the version of the Anthropic SDK
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
          const pkg = require('@anthropic-ai/sdk/package.json');
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
   * Get methods that should be instrumented for Anthropic SDK
   */
  protected override getMethodsToInstrument(instance: any): string[] {
    const methods: string[] = [];

    // Modern Anthropic SDK methods
    if (instance.messages?.create) {
      methods.push('messages.create');
    }
    if (instance.completions?.create) {
      methods.push('completions.create');
    }

    // Legacy methods
    if (instance.complete) {
      methods.push('complete');
    }
    if (instance.createMessage) {
      methods.push('createMessage');
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
   * Extract Anthropic-specific metadata from method call
   */
  private extractAnthropicMetadata(context: InstrumentationContext): Record<string, any> {
    const metadata: Record<string, any> = {
      'llm.provider': 'anthropic',
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
        if (params.top_k !== undefined) {
          metadata['llm.request.top_k'] = params.top_k;
        }
        if (params.stream !== undefined) {
          metadata['llm.request.stream'] = params.stream;
        }

        // Extract messages for new API
        if (params.messages && Array.isArray(params.messages)) {
          metadata['llm.request.messages_count'] = params.messages.length;

          // Count tokens if enabled (simplified for now due to async issues)
          if (context.config.countTokens && params.model) {
            // Note: Token counting implementation would need async handling
            metadata['llm.request.token_counting_enabled'] = true;
          }
        }

        // Extract prompt for legacy API
        if (params.prompt) {
          if (typeof params.prompt === 'string') {
            if (context.config.countTokens && params.model) {
              // Note: Token counting implementation would need async handling
              metadata['llm.request.token_counting_enabled'] = true;
            }
          }
        }

        // Extract system prompt
        if (params.system) {
          metadata['llm.request.has_system_prompt'] = true;
        }

        // Extract stop sequences
        if (params.stop_sequences && Array.isArray(params.stop_sequences)) {
          metadata['llm.request.stop_sequences_count'] = params.stop_sequences.length;
        }
      }
    }

    return metadata;
  }

  /**
   * Extract response metadata from Anthropic API response
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
      metadata['llm.usage.input_tokens'] = response.usage.input_tokens;
      metadata['llm.usage.output_tokens'] = response.usage.output_tokens;

      // Calculate total tokens
      const totalTokens = (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0);
      metadata['llm.usage.total_tokens'] = totalTokens;

      // Estimate costs if enabled (simplified for now due to async issues)
      if (context.config.estimateCosts) {
        try {
          const model = this.extractModelFromContext(context);
          if (model) {
            // Note: Cost estimation implementation would need async handling
            metadata['llm.usage.cost_estimation_enabled'] = true;
          }
        } catch (error) {
          console.warn('Failed to estimate cost:', error);
        }
      }
    }

    // Extract model information
    if (response.model) {
      metadata['llm.response.model'] = response.model;
    }

    // Extract response details for messages API
    if (response.content && Array.isArray(response.content)) {
      metadata['llm.response.content_blocks_count'] = response.content.length;

      // Get content types
      const contentTypes = response.content.map((block: any) => block.type).filter(Boolean);
      if (contentTypes.length > 0) {
        metadata['llm.response.content_types'] = contentTypes;
      }
    }

    // Extract completion for legacy API
    if (response.completion && typeof response.completion === 'string') {
      metadata['llm.response.has_completion'] = true;
    }

    // Extract stop reason
    if (response.stop_reason) {
      metadata['llm.response.stop_reason'] = response.stop_reason;
    }

    // Extract other response fields
    if (response.id) {
      metadata['llm.response.id'] = response.id;
    }
    if (response.type) {
      metadata['llm.response.type'] = response.type;
    }
    if (response.role) {
      metadata['llm.response.role'] = response.role;
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
    if (methodName.includes('messages') || methodName.includes('Message')) {
      return 'message';
    } else if (methodName.includes('completion') || methodName.includes('complete')) {
      return 'completion';
    }
    return 'unknown';
  }

  /**
   * Hook called before Anthropic method execution
   */
  protected override beforeMethodCall(context: InstrumentationContext): void {
    try {
      // Extract and add Anthropic-specific metadata
      const anthropicMetadata = this.extractAnthropicMetadata(context);
      Object.assign(context.attributes, anthropicMetadata);
    } catch (error) {
      console.warn('Failed to extract Anthropic metadata in beforeMethodCall:', error);
    }
  }

  /**
   * Hook called after successful Anthropic method execution
   */
  protected override afterMethodCall(context: InstrumentationContext, result: any): void {
    try {
      // Extract response metadata
      const responseMetadata = this.extractResponseMetadata(result, context);
      Object.assign(context.attributes, responseMetadata);

      // Extract LLM metadata using utility function
      try {
        const llmMetadata = extract_llm_metadata(result, 'anthropic');
        Object.assign(context.attributes, llmMetadata);
      } catch (error) {
        console.warn('Failed to extract LLM metadata:', error);
      }
    } catch (error) {
      console.warn('Failed to extract response metadata in afterMethodCall:', error);
    }
  }

  /**
   * Hook called when Anthropic method execution throws an error
   */
  protected override onMethodError(context: InstrumentationContext, error: Error): void {
    try {
      // Add error-specific attributes
      context.attributes['llm.error.type'] = error.name;
      context.attributes['llm.error.message'] = error.message;

      // Extract Anthropic-specific error information
      if ((error as any).status) {
        context.attributes['llm.error.status_code'] = (error as any).status;
      }
      if ((error as any).error) {
        const errorDetails = (error as any).error;
        if (errorDetails.type) {
          context.attributes['llm.error.anthropic_type'] = errorDetails.type;
        }
        if (errorDetails.message) {
          context.attributes['llm.error.anthropic_message'] = errorDetails.message;
        }
      }

      // Handle rate limiting errors
      if (error.message?.includes('rate limit') || error.message?.includes('429')) {
        context.attributes['llm.error.rate_limited'] = true;
      }

      // Handle quota/billing errors
      if (error.message?.includes('quota') || error.message?.includes('billing')) {
        context.attributes['llm.error.quota_exceeded'] = true;
      }
    } catch (extractError) {
      console.warn('Failed to extract error metadata in onMethodError:', extractError);
    }
  }
}
