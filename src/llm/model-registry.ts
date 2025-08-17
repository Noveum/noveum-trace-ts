/**
 * LLM Model Registry - Python SDK Compatible
 *
 * Comprehensive registry of 50+ LLM models with up-to-date metadata,
 * pricing, and capabilities. All field names use snake_case to match
 * the Python SDK exactly.
 */

import type { ModelInfo, LLMProvider } from './types.js';

/**
 * Complete model registry with metadata for all major LLM providers
 * Updated as of January 2025 with latest model specs and pricing
 */
export const MODEL_REGISTRY: Record<string, ModelInfo> = {
  // === OpenAI Models ===
  'gpt-4o': {
    provider: 'openai',
    name: 'gpt-4o',
    context_window: 128000,
    max_output_tokens: 4096,
    input_cost_per_1m: 2500,
    output_cost_per_1m: 10000,
    supports_vision: true,
    supports_audio: false,
    supports_function_calling: true,
    training_cutoff: '2024-04-01',
    tokenizer_type: 'tiktoken',
    aliases: ['gpt-4-omni'],
  },

  'gpt-4o-mini': {
    provider: 'openai',
    name: 'gpt-4o-mini',
    context_window: 128000,
    max_output_tokens: 16384,
    input_cost_per_1m: 150,
    output_cost_per_1m: 600,
    supports_vision: true,
    supports_audio: false,
    supports_function_calling: true,
    training_cutoff: '2024-07-01',
    tokenizer_type: 'tiktoken',
    aliases: ['gpt-4o-2024-07-18'],
  },

  'gpt-4-turbo': {
    provider: 'openai',
    name: 'gpt-4-turbo',
    context_window: 128000,
    max_output_tokens: 4096,
    input_cost_per_1m: 10000,
    output_cost_per_1m: 30000,
    supports_vision: true,
    supports_audio: false,
    supports_function_calling: true,
    training_cutoff: '2024-04-01',
    tokenizer_type: 'tiktoken',
    aliases: ['gpt-4-turbo-2024-04-09', 'gpt-4-turbo-preview'],
  },

  'gpt-4': {
    provider: 'openai',
    name: 'gpt-4',
    context_window: 8192,
    max_output_tokens: 4096,
    input_cost_per_1m: 30000,
    output_cost_per_1m: 60000,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: true,
    training_cutoff: '2023-09-01',
    tokenizer_type: 'tiktoken',
  },

  'gpt-4-32k': {
    provider: 'openai',
    name: 'gpt-4-32k',
    context_window: 32768,
    max_output_tokens: 4096,
    input_cost_per_1m: 60000,
    output_cost_per_1m: 120000,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: true,
    training_cutoff: '2023-09-01',
    tokenizer_type: 'tiktoken',
  },

  'gpt-3.5-turbo': {
    provider: 'openai',
    name: 'gpt-3.5-turbo',
    context_window: 16385,
    max_output_tokens: 4096,
    input_cost_per_1m: 500,
    output_cost_per_1m: 1500,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: true,
    training_cutoff: '2023-09-01',
    tokenizer_type: 'tiktoken',
    aliases: ['gpt-3.5-turbo-0125'],
  },

  'gpt-3.5-turbo-16k': {
    provider: 'openai',
    name: 'gpt-3.5-turbo-16k',
    context_window: 16385,
    max_output_tokens: 4096,
    input_cost_per_1m: 3000,
    output_cost_per_1m: 4000,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: true,
    training_cutoff: '2023-09-01',
    tokenizer_type: 'tiktoken',
  },

  'text-davinci-003': {
    provider: 'openai',
    name: 'text-davinci-003',
    context_window: 4097,
    max_output_tokens: 4097,
    input_cost_per_1m: 20000,
    output_cost_per_1m: 20000,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: false,
    training_cutoff: '2021-06-01',
    tokenizer_type: 'tiktoken',
  },

  // === OpenAI Reasoning Models (o1/o3 Series) ===
  'o1-preview': {
    provider: 'openai',
    name: 'o1-preview',
    context_window: 128000,
    max_output_tokens: 32768,
    input_cost_per_1m: 15000,
    output_cost_per_1m: 60000,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: false,
    training_cutoff: '2023-10-01',
    tokenizer_type: 'tiktoken',
    aliases: ['o1-preview-2024-09-12'],
  },

  o1: {
    provider: 'openai',
    name: 'o1',
    context_window: 200000,
    max_output_tokens: 100000,
    input_cost_per_1m: 15000,
    output_cost_per_1m: 60000,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: true,
    training_cutoff: '2023-10-01',
    tokenizer_type: 'tiktoken',
    aliases: ['o1-2024-12-17'],
  },

  'o1-pro': {
    provider: 'openai',
    name: 'o1-pro',
    context_window: 200000,
    max_output_tokens: 100000,
    input_cost_per_1m: 0, // ChatGPT Pro subscription only
    output_cost_per_1m: 0, // ChatGPT Pro subscription only
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: true,
    training_cutoff: '2023-10-01',
    tokenizer_type: 'tiktoken',
  },

  'o1-mini': {
    provider: 'openai',
    name: 'o1-mini',
    context_window: 128000,
    max_output_tokens: 65536,
    input_cost_per_1m: 3000,
    output_cost_per_1m: 12000,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: false,
    training_cutoff: '2023-10-01',
    tokenizer_type: 'tiktoken',
    aliases: ['o1-mini-2024-09-12'],
  },

  o3: {
    provider: 'openai',
    name: 'o3',
    context_window: 200000,
    max_output_tokens: 100000,
    input_cost_per_1m: 10000,
    output_cost_per_1m: 40000,
    supports_vision: true,
    supports_audio: false,
    supports_function_calling: true,
    training_cutoff: '2024-05-31',
    tokenizer_type: 'tiktoken',
    aliases: ['o3-2025-04-16'],
  },

  'o3-mini': {
    provider: 'openai',
    name: 'o3-mini',
    context_window: 200000,
    max_output_tokens: 100000,
    input_cost_per_1m: 1000,
    output_cost_per_1m: 4000,
    supports_vision: true,
    supports_audio: false,
    supports_function_calling: true,
    training_cutoff: '2024-05-31',
    tokenizer_type: 'tiktoken',
  },

  // === Anthropic Models ===
  'claude-3-5-sonnet': {
    provider: 'anthropic',
    name: 'claude-3-5-sonnet-20241022',
    context_window: 200000,
    max_output_tokens: 8192,
    input_cost_per_1m: 3000,
    output_cost_per_1m: 15000,
    supports_vision: true,
    supports_audio: false,
    supports_function_calling: true,
    training_cutoff: '2024-04-01',
    tokenizer_type: 'anthropic',
    aliases: ['claude-3-5-sonnet-20241022', 'claude-3.5-sonnet'],
  },

  'claude-3-5-haiku': {
    provider: 'anthropic',
    name: 'claude-3-5-haiku-20241022',
    context_window: 200000,
    max_output_tokens: 8192,
    input_cost_per_1m: 1000,
    output_cost_per_1m: 5000,
    supports_vision: true,
    supports_audio: false,
    supports_function_calling: true,
    training_cutoff: '2024-07-01',
    tokenizer_type: 'anthropic',
    aliases: ['claude-3-5-haiku-20241022', 'claude-3.5-haiku'],
  },

  'claude-3-opus': {
    provider: 'anthropic',
    name: 'claude-3-opus-20240229',
    context_window: 200000,
    max_output_tokens: 4096,
    input_cost_per_1m: 15000,
    output_cost_per_1m: 75000,
    supports_vision: true,
    supports_audio: false,
    supports_function_calling: true,
    training_cutoff: '2023-08-01',
    tokenizer_type: 'anthropic',
    aliases: ['claude-3-opus-20240229'],
  },

  'claude-3-sonnet': {
    provider: 'anthropic',
    name: 'claude-3-sonnet-20240229',
    context_window: 200000,
    max_output_tokens: 4096,
    input_cost_per_1m: 3000,
    output_cost_per_1m: 15000,
    supports_vision: true,
    supports_audio: false,
    supports_function_calling: true,
    training_cutoff: '2023-08-01',
    tokenizer_type: 'anthropic',
    aliases: ['claude-3-sonnet-20240229'],
  },

  'claude-3-haiku': {
    provider: 'anthropic',
    name: 'claude-3-haiku-20240307',
    context_window: 200000,
    max_output_tokens: 4096,
    input_cost_per_1m: 250,
    output_cost_per_1m: 1250,
    supports_vision: true,
    supports_audio: false,
    supports_function_calling: true,
    training_cutoff: '2023-08-01',
    tokenizer_type: 'anthropic',
    aliases: ['claude-3-haiku-20240307'],
  },

  'claude-2.1': {
    provider: 'anthropic',
    name: 'claude-2.1',
    context_window: 200000,
    max_output_tokens: 4096,
    input_cost_per_1m: 8000,
    output_cost_per_1m: 24000,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: false,
    training_cutoff: '2023-04-01',
    tokenizer_type: 'anthropic',
  },

  'claude-2': {
    provider: 'anthropic',
    name: 'claude-2',
    context_window: 100000,
    max_output_tokens: 4096,
    input_cost_per_1m: 8000,
    output_cost_per_1m: 24000,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: false,
    training_cutoff: '2023-04-01',
    tokenizer_type: 'anthropic',
  },

  'claude-instant-1.2': {
    provider: 'anthropic',
    name: 'claude-instant-1.2',
    context_window: 100000,
    max_output_tokens: 4096,
    input_cost_per_1m: 800,
    output_cost_per_1m: 2400,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: false,
    training_cutoff: '2023-04-01',
    tokenizer_type: 'anthropic',
  },

  // === Google Models ===
  'gemini-1.5-pro': {
    provider: 'google',
    name: 'gemini-1.5-pro',
    context_window: 2097152,
    max_output_tokens: 8192,
    input_cost_per_1m: 1250,
    output_cost_per_1m: 5000,
    supports_vision: true,
    supports_audio: true,
    supports_function_calling: true,
    training_cutoff: '2024-04-01',
    tokenizer_type: 'google',
    aliases: ['gemini-1.5-pro-latest'],
  },

  'gemini-1.5-flash': {
    provider: 'google',
    name: 'gemini-1.5-flash',
    context_window: 1048576,
    max_output_tokens: 8192,
    input_cost_per_1m: 75,
    output_cost_per_1m: 300,
    supports_vision: true,
    supports_audio: true,
    supports_function_calling: true,
    training_cutoff: '2024-04-01',
    tokenizer_type: 'google',
    aliases: ['gemini-1.5-flash-latest'],
  },

  'gemini-1.0-pro': {
    provider: 'google',
    name: 'gemini-1.0-pro',
    context_window: 32768,
    max_output_tokens: 8192,
    input_cost_per_1m: 500,
    output_cost_per_1m: 1500,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: true,
    training_cutoff: '2023-08-01',
    tokenizer_type: 'google',
    aliases: ['gemini-pro'],
  },

  'gemini-1.0-pro-vision': {
    provider: 'google',
    name: 'gemini-1.0-pro-vision',
    context_window: 16384,
    max_output_tokens: 2048,
    input_cost_per_1m: 250,
    output_cost_per_1m: 500,
    supports_vision: true,
    supports_audio: false,
    supports_function_calling: false,
    training_cutoff: '2023-08-01',
    tokenizer_type: 'google',
    aliases: ['gemini-pro-vision'],
  },

  'text-bison-001': {
    provider: 'google',
    name: 'text-bison-001',
    context_window: 8192,
    max_output_tokens: 1024,
    input_cost_per_1m: 250,
    output_cost_per_1m: 500,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: false,
    training_cutoff: '2023-06-01',
    tokenizer_type: 'google',
  },

  // === Meta/Llama Models ===
  'llama-3.1-405b': {
    provider: 'meta',
    name: 'llama-3.1-405b-instruct',
    context_window: 131072,
    max_output_tokens: 4096,
    input_cost_per_1m: 5000,
    output_cost_per_1m: 15000,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: true,
    training_cutoff: '2024-07-01',
    tokenizer_type: 'meta',
    aliases: ['llama-3.1-405b-instruct'],
  },

  'llama-3.1-70b': {
    provider: 'meta',
    name: 'llama-3.1-70b-instruct',
    context_window: 131072,
    max_output_tokens: 4096,
    input_cost_per_1m: 880,
    output_cost_per_1m: 880,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: true,
    training_cutoff: '2024-07-01',
    tokenizer_type: 'meta',
    aliases: ['llama-3.1-70b-instruct'],
  },

  'llama-3.1-8b': {
    provider: 'meta',
    name: 'llama-3.1-8b-instruct',
    context_window: 131072,
    max_output_tokens: 4096,
    input_cost_per_1m: 180,
    output_cost_per_1m: 180,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: true,
    training_cutoff: '2024-07-01',
    tokenizer_type: 'meta',
    aliases: ['llama-3.1-8b-instruct'],
  },

  'llama-3-70b': {
    provider: 'meta',
    name: 'llama-3-70b-instruct',
    context_window: 8192,
    max_output_tokens: 4096,
    input_cost_per_1m: 880,
    output_cost_per_1m: 880,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: false,
    training_cutoff: '2024-03-01',
    tokenizer_type: 'meta',
    aliases: ['llama-3-70b-instruct'],
  },

  'llama-3-8b': {
    provider: 'meta',
    name: 'llama-3-8b-instruct',
    context_window: 8192,
    max_output_tokens: 4096,
    input_cost_per_1m: 180,
    output_cost_per_1m: 180,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: false,
    training_cutoff: '2024-03-01',
    tokenizer_type: 'meta',
    aliases: ['llama-3-8b-instruct'],
  },

  'llama-2-70b': {
    provider: 'meta',
    name: 'llama-2-70b-chat',
    context_window: 4096,
    max_output_tokens: 4096,
    input_cost_per_1m: 700,
    output_cost_per_1m: 800,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: false,
    training_cutoff: '2023-07-01',
    tokenizer_type: 'meta',
    aliases: ['llama-2-70b-chat'],
  },

  'llama-2-13b': {
    provider: 'meta',
    name: 'llama-2-13b-chat',
    context_window: 4096,
    max_output_tokens: 4096,
    input_cost_per_1m: 270,
    output_cost_per_1m: 270,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: false,
    training_cutoff: '2023-07-01',
    tokenizer_type: 'meta',
    aliases: ['llama-2-13b-chat'],
  },

  'llama-2-7b': {
    provider: 'meta',
    name: 'llama-2-7b-chat',
    context_window: 4096,
    max_output_tokens: 4096,
    input_cost_per_1m: 200,
    output_cost_per_1m: 200,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: false,
    training_cutoff: '2023-07-01',
    tokenizer_type: 'meta',
    aliases: ['llama-2-7b-chat'],
  },

  // === Cohere Models ===
  'command-r-plus': {
    provider: 'cohere',
    name: 'command-r-plus',
    context_window: 128000,
    max_output_tokens: 4096,
    input_cost_per_1m: 3000,
    output_cost_per_1m: 15000,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: true,
    training_cutoff: '2024-04-01',
    tokenizer_type: 'custom',
  },

  'command-r': {
    provider: 'cohere',
    name: 'command-r',
    context_window: 128000,
    max_output_tokens: 4096,
    input_cost_per_1m: 500,
    output_cost_per_1m: 1500,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: true,
    training_cutoff: '2024-04-01',
    tokenizer_type: 'custom',
  },

  command: {
    provider: 'cohere',
    name: 'command',
    context_window: 4096,
    max_output_tokens: 4096,
    input_cost_per_1m: 1000,
    output_cost_per_1m: 2000,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: false,
    training_cutoff: '2023-08-01',
    tokenizer_type: 'custom',
  },

  'command-light': {
    provider: 'cohere',
    name: 'command-light',
    context_window: 4096,
    max_output_tokens: 4096,
    input_cost_per_1m: 300,
    output_cost_per_1m: 600,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: false,
    training_cutoff: '2023-08-01',
    tokenizer_type: 'custom',
  },

  // === Mistral Models ===
  'mistral-large': {
    provider: 'mistral',
    name: 'mistral-large-latest',
    context_window: 128000,
    max_output_tokens: 4096,
    input_cost_per_1m: 2000,
    output_cost_per_1m: 6000,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: true,
    training_cutoff: '2024-04-01',
    tokenizer_type: 'custom',
    aliases: ['mistral-large-latest', 'mistral-large-2407'],
  },

  'mistral-small': {
    provider: 'mistral',
    name: 'mistral-small-latest',
    context_window: 128000,
    max_output_tokens: 4096,
    input_cost_per_1m: 200,
    output_cost_per_1m: 600,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: true,
    training_cutoff: '2024-04-01',
    tokenizer_type: 'custom',
    aliases: ['mistral-small-latest', 'mistral-small-2402'],
  },

  'mixtral-8x7b': {
    provider: 'mistral',
    name: 'mixtral-8x7b-instruct',
    context_window: 32768,
    max_output_tokens: 4096,
    input_cost_per_1m: 270,
    output_cost_per_1m: 270,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: false,
    training_cutoff: '2023-12-01',
    tokenizer_type: 'custom',
    aliases: ['mixtral-8x7b-instruct-v0.1'],
  },

  'mixtral-8x22b': {
    provider: 'mistral',
    name: 'mixtral-8x22b-instruct',
    context_window: 64000,
    max_output_tokens: 4096,
    input_cost_per_1m: 900,
    output_cost_per_1m: 900,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: true,
    training_cutoff: '2024-04-01',
    tokenizer_type: 'custom',
    aliases: ['mixtral-8x22b-instruct-v0.1'],
  },

  'mistral-7b': {
    provider: 'mistral',
    name: 'mistral-7b-instruct',
    context_window: 32768,
    max_output_tokens: 4096,
    input_cost_per_1m: 150,
    output_cost_per_1m: 150,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: false,
    training_cutoff: '2023-10-01',
    tokenizer_type: 'custom',
    aliases: ['mistral-7b-instruct-v0.2'],
  },

  // === Together AI Models ===
  'qwen-2-72b': {
    provider: 'together',
    name: 'qwen-2-72b-instruct',
    context_window: 32768,
    max_output_tokens: 4096,
    input_cost_per_1m: 900,
    output_cost_per_1m: 900,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: false,
    training_cutoff: '2024-06-01',
    tokenizer_type: 'custom',
  },

  'deepseek-coder-33b': {
    provider: 'together',
    name: 'deepseek-coder-33b-instruct',
    context_window: 16384,
    max_output_tokens: 4096,
    input_cost_per_1m: 800,
    output_cost_per_1m: 800,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: false,
    training_cutoff: '2024-01-01',
    tokenizer_type: 'custom',
  },

  'yi-34b': {
    provider: 'together',
    name: 'yi-34b-chat',
    context_window: 4096,
    max_output_tokens: 4096,
    input_cost_per_1m: 800,
    output_cost_per_1m: 800,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: false,
    training_cutoff: '2023-11-01',
    tokenizer_type: 'custom',
  },

  // === Perplexity Models ===
  'pplx-7b-online': {
    provider: 'perplexity',
    name: 'pplx-7b-online',
    context_window: 4096,
    max_output_tokens: 4096,
    input_cost_per_1m: 200,
    output_cost_per_1m: 200,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: false,
    training_cutoff: '2024-01-01',
    tokenizer_type: 'custom',
  },

  'pplx-70b-online': {
    provider: 'perplexity',
    name: 'pplx-70b-online',
    context_window: 4096,
    max_output_tokens: 4096,
    input_cost_per_1m: 1000,
    output_cost_per_1m: 1000,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: false,
    training_cutoff: '2024-01-01',
    tokenizer_type: 'custom',
  },

  // === Groq Models ===
  'llama-3.1-70b-groq': {
    provider: 'groq',
    name: 'llama-3.1-70b-versatile',
    context_window: 131072,
    max_output_tokens: 4096,
    input_cost_per_1m: 590,
    output_cost_per_1m: 790,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: true,
    training_cutoff: '2024-07-01',
    tokenizer_type: 'meta',
    aliases: ['llama-3.1-70b-versatile'],
  },

  'llama-3.1-8b-groq': {
    provider: 'groq',
    name: 'llama-3.1-8b-instant',
    context_window: 131072,
    max_output_tokens: 4096,
    input_cost_per_1m: 50,
    output_cost_per_1m: 80,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: true,
    training_cutoff: '2024-07-01',
    tokenizer_type: 'meta',
    aliases: ['llama-3.1-8b-instant'],
  },

  'mixtral-8x7b-groq': {
    provider: 'groq',
    name: 'mixtral-8x7b-32768',
    context_window: 32768,
    max_output_tokens: 4096,
    input_cost_per_1m: 240,
    output_cost_per_1m: 240,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: false,
    training_cutoff: '2023-12-01',
    tokenizer_type: 'custom',
    aliases: ['mixtral-8x7b-32768'],
  },

  'gemma-7b-groq': {
    provider: 'groq',
    name: 'gemma-7b-it',
    context_window: 8192,
    max_output_tokens: 4096,
    input_cost_per_1m: 70,
    output_cost_per_1m: 70,
    supports_vision: false,
    supports_audio: false,
    supports_function_calling: false,
    training_cutoff: '2024-02-01',
    tokenizer_type: 'google',
    aliases: ['gemma-7b-it'],
  },
};

/**
 * Model name aliases mapping for flexible model lookup
 */
export const MODEL_ALIASES: Record<string, string> = {};

// Build aliases mapping from registry
Object.entries(MODEL_REGISTRY).forEach(([key, model]) => {
  if (model.aliases) {
    model.aliases.forEach(alias => {
      MODEL_ALIASES[alias] = key;
    });
  }
});

/**
 * Get all models for a specific provider
 */
export function getModelsByProvider(provider: LLMProvider): Record<string, ModelInfo> {
  return Object.fromEntries(
    Object.entries(MODEL_REGISTRY).filter(([_, model]) => model.provider === provider)
  );
}

/**
 * Get all supported providers
 */
export function getSupportedProviders(): LLMProvider[] {
  return Array.from(new Set(Object.values(MODEL_REGISTRY).map(model => model.provider)));
}

/**
 * Get all model names/IDs
 */
export function getAllModelNames(): string[] {
  return Object.keys(MODEL_REGISTRY);
}

/**
 * Check if a model exists in the registry
 */
export function hasModel(modelName: string): boolean {
  return modelName in MODEL_REGISTRY || modelName in MODEL_ALIASES;
}

/**
 * Get count of models in registry
 */
export function getModelCount(): number {
  return Object.keys(MODEL_REGISTRY).length;
}

// === Dynamic Registry Management ===

/**
 * Validate a model info object for required fields and valid values
 */
export function validateModelInfo(modelInfo: ModelInfo): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Required fields
  if (!modelInfo.provider) errors.push('provider is required');
  if (!modelInfo.name) errors.push('name is required');
  if (typeof modelInfo.context_window !== 'number' || modelInfo.context_window <= 0) {
    errors.push('context_window must be a positive number');
  }
  if (typeof modelInfo.max_output_tokens !== 'number' || modelInfo.max_output_tokens <= 0) {
    errors.push('max_output_tokens must be a positive number');
  }
  if (typeof modelInfo.input_cost_per_1m !== 'number' || modelInfo.input_cost_per_1m < 0) {
    errors.push('input_cost_per_1m must be a non-negative number');
  }
  if (typeof modelInfo.output_cost_per_1m !== 'number' || modelInfo.output_cost_per_1m < 0) {
    errors.push('output_cost_per_1m must be a non-negative number');
  }

  // Boolean fields
  if (typeof modelInfo.supports_vision !== 'boolean') {
    errors.push('supports_vision must be a boolean');
  }
  if (typeof modelInfo.supports_audio !== 'boolean') {
    errors.push('supports_audio must be a boolean');
  }
  if (typeof modelInfo.supports_function_calling !== 'boolean') {
    errors.push('supports_function_calling must be a boolean');
  }

  // Optional fields validation
  if (modelInfo.training_cutoff && typeof modelInfo.training_cutoff !== 'string') {
    errors.push('training_cutoff must be a string');
  }
  if (modelInfo.tokenizer_type && typeof modelInfo.tokenizer_type !== 'string') {
    errors.push('tokenizer_type must be a string');
  }
  if (modelInfo.aliases && !Array.isArray(modelInfo.aliases)) {
    errors.push('aliases must be an array');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Dynamically register a new model to the registry
 */
export function registerModel(
  modelId: string,
  modelInfo: ModelInfo
): { success: boolean; error?: string } {
  // Validate the model info
  const validation = validateModelInfo(modelInfo);
  if (!validation.valid) {
    return { success: false, error: `Validation failed: ${validation.errors.join(', ')}` };
  }

  // Check if model already exists
  if (hasModel(modelId)) {
    return { success: false, error: `Model '${modelId}' already exists` };
  }

  // Add to registry
  (MODEL_REGISTRY as any)[modelId] = modelInfo;

  // Update aliases mapping
  if (modelInfo.aliases) {
    modelInfo.aliases.forEach(alias => {
      (MODEL_ALIASES as any)[alias] = modelId;
    });
  }

  return { success: true };
}

/**
 * Update an existing model's information
 */
export function updateModel(
  modelId: string,
  updates: Partial<ModelInfo>
): { success: boolean; error?: string } {
  if (!hasModel(modelId)) {
    return { success: false, error: `Model '${modelId}' not found` };
  }

  // Resolve alias to actual model ID
  const actualModelId = MODEL_ALIASES[modelId] || modelId;
  const currentModel = MODEL_REGISTRY[actualModelId];

  if (!currentModel) {
    return { success: false, error: `Model '${actualModelId}' not found in registry` };
  }

  // Create updated model info
  const updatedModel = { ...currentModel, ...updates };

  // Validate the updated model
  const validation = validateModelInfo(updatedModel);
  if (!validation.valid) {
    return { success: false, error: `Validation failed: ${validation.errors.join(', ')}` };
  }

  // Update the registry
  (MODEL_REGISTRY as any)[actualModelId] = updatedModel;

  // Update aliases if they changed
  if (updates.aliases) {
    // Remove old aliases
    if (currentModel.aliases) {
      currentModel.aliases.forEach(alias => {
        delete (MODEL_ALIASES as any)[alias];
      });
    }
    // Add new aliases
    updates.aliases.forEach(alias => {
      (MODEL_ALIASES as any)[alias] = actualModelId;
    });
  }

  return { success: true };
}

/**
 * Remove a model from the registry
 */
export function unregisterModel(modelId: string): { success: boolean; error?: string } {
  if (!hasModel(modelId)) {
    return { success: false, error: `Model '${modelId}' not found` };
  }

  // Resolve alias to actual model ID
  const actualModelId = MODEL_ALIASES[modelId] || modelId;
  const model = MODEL_REGISTRY[actualModelId];

  if (!model) {
    return { success: false, error: `Model '${actualModelId}' not found in registry` };
  }

  // Remove aliases
  if (model.aliases) {
    model.aliases.forEach(alias => {
      delete (MODEL_ALIASES as any)[alias];
    });
  }

  // Remove from registry
  delete (MODEL_REGISTRY as any)[actualModelId];

  return { success: true };
}

/**
 * Get model info by ID or alias
 */
export function getModelInfo(modelId: string): ModelInfo | null {
  if (!hasModel(modelId)) {
    return null;
  }

  const actualModelId = MODEL_ALIASES[modelId] || modelId;
  return MODEL_REGISTRY[actualModelId] || null;
}

/**
 * Query models with filters
 */
export function queryModels(filters: {
  provider?: LLMProvider;
  supportsVision?: boolean;
  supportsAudio?: boolean;
  supportsFunctionCalling?: boolean;
  maxInputCost?: number;
  maxOutputCost?: number;
  minContextWindow?: number;
}): Record<string, ModelInfo> {
  const results: Record<string, ModelInfo> = {};

  Object.entries(MODEL_REGISTRY).forEach(([modelId, model]) => {
    let matches = true;

    if (filters.provider && model.provider !== filters.provider) matches = false;
    if (filters.supportsVision !== undefined && model.supports_vision !== filters.supportsVision)
      matches = false;
    if (filters.supportsAudio !== undefined && model.supports_audio !== filters.supportsAudio)
      matches = false;
    if (
      filters.supportsFunctionCalling !== undefined &&
      model.supports_function_calling !== filters.supportsFunctionCalling
    )
      matches = false;
    if (filters.maxInputCost !== undefined && model.input_cost_per_1m > filters.maxInputCost)
      matches = false;
    if (filters.maxOutputCost !== undefined && model.output_cost_per_1m > filters.maxOutputCost)
      matches = false;
    if (filters.minContextWindow !== undefined && model.context_window < filters.minContextWindow)
      matches = false;

    if (matches) {
      results[modelId] = model;
    }
  });

  return results;
}

/**
 * Export registry data for backup or transfer
 */
export function exportRegistry(): {
  models: Record<string, ModelInfo>;
  aliases: Record<string, string>;
} {
  return {
    models: { ...MODEL_REGISTRY },
    aliases: { ...MODEL_ALIASES },
  };
}

/**
 * Import registry data (replaces current registry)
 */
export function importRegistry(data: {
  models: Record<string, ModelInfo>;
  aliases: Record<string, string>;
}): { success: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate all models first
  Object.entries(data.models).forEach(([modelId, model]) => {
    const validation = validateModelInfo(model);
    if (!validation.valid) {
      errors.push(`Model '${modelId}': ${validation.errors.join(', ')}`);
    }
  });

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // Clear current registry
  Object.keys(MODEL_REGISTRY).forEach(key => {
    delete (MODEL_REGISTRY as any)[key];
  });
  Object.keys(MODEL_ALIASES).forEach(key => {
    delete (MODEL_ALIASES as any)[key];
  });

  // Import new data
  Object.entries(data.models).forEach(([modelId, model]) => {
    (MODEL_REGISTRY as any)[modelId] = model;
  });
  Object.entries(data.aliases).forEach(([alias, modelId]) => {
    (MODEL_ALIASES as any)[alias] = modelId;
  });

  return { success: true, errors: [] };
}

/**
 * Get models sorted by cost efficiency (output tokens per dollar)
 */
export function getModelsByCostEfficiency(
  provider?: LLMProvider
): Array<{ modelId: string; model: ModelInfo; efficiency: number }> {
  const modelsToCheck = provider ? getModelsByProvider(provider) : MODEL_REGISTRY;

  return Object.entries(modelsToCheck)
    .map(([modelId, model]) => ({
      modelId,
      model,
      efficiency: model.output_cost_per_1m > 0 ? 1000000 / model.output_cost_per_1m : Infinity,
    }))
    .sort((a, b) => b.efficiency - a.efficiency);
}

/**
 * Find models that support specific capabilities
 */
export function findCapableModels(requirements: {
  vision?: boolean;
  audio?: boolean;
  functionCalling?: boolean;
  minContextWindow?: number;
  maxCostPerMillion?: number;
}): Record<string, ModelInfo> {
  const filters: Parameters<typeof queryModels>[0] = {};

  if (requirements.vision !== undefined) filters.supportsVision = requirements.vision;
  if (requirements.audio !== undefined) filters.supportsAudio = requirements.audio;
  if (requirements.functionCalling !== undefined)
    filters.supportsFunctionCalling = requirements.functionCalling;
  if (requirements.minContextWindow !== undefined)
    filters.minContextWindow = requirements.minContextWindow;
  if (requirements.maxCostPerMillion !== undefined)
    filters.maxInputCost = requirements.maxCostPerMillion;

  return queryModels(filters);
}
