/**
 * Noveum Trace SDK - Decorators Module
 *
 * This module provides a comprehensive set of decorators for automatic tracing
 * that match the Python SDK's decorator functionality.
 */

// Base decorator
export { trace, simpleTrace, createTraceDecorator, type TraceOptions } from './base.js';

// LLM decorator
export {
  traceLLM,
  simpleLLMTrace,
  createLLMDecorator,
  updateCostRates,
  getCostRates,
  type TraceLLMOptions,
  type LLMMetadata,
} from './llm.js';

// Agent decorator
export {
  traceAgent,
  simpleAgentTrace,
  createAgentDecorator,
  tracePlanning,
  traceReasoning,
  traceAction,
  traceObservation,
  traceReflection,
  traceDecision,
  type TraceAgentOptions,
  type AgentMetadata,
  type AgentStepType,
  type AgentStatus,
} from './agent.js';

// Retrieval decorator
export {
  traceRetrieval,
  simpleRetrievalTrace,
  createRetrievalDecorator,
  traceSemanticSearch,
  traceKeywordSearch,
  traceHybridSearch,
  traceVectorSearch,
  traceSimilaritySearch,
  traceDocumentLookup,
  type TraceRetrievalOptions,
  type RetrievalMetadata,
  type RetrievalType,
  type VectorDatabaseType,
} from './retrieval.js';

// Tool decorator
export {
  traceTool,
  simpleToolTrace,
  createToolDecorator,
  traceAPICall,
  traceDatabaseQuery,
  traceFileOperation,
  traceWebScraping,
  traceEmailSend,
  traceNotification,
  traceWebhook,
  tracePayment,
  type TraceToolOptions,
  type ToolMetadata,
  type ToolType,
  type ToolProtocol,
  type ToolAuthType,
} from './tool.js';

/**
 * Decorator utilities
 */
export const decoratorUtils = {
  /**
   * Check if a function has been decorated with tracing
   */
  isTraced(fn: Function): boolean {
    return (fn as any).__traced === true || (fn as any).__traceDecorator === true;
  },

  /**
   * Get decorator metadata from a decorated function
   */
  getDecoratorMetadata(fn: Function): Record<string, any> | undefined {
    return (fn as any).__traceMetadata || (fn as any).__decoratorMetadata;
  },

  /**
   * Mark a function as traced (used internally)
   */
  markAsTraced(fn: Function, metadata: Record<string, any> = {}): void {
    (fn as any).__traced = true;
    (fn as any).__traceMetadata = metadata;
  },
};

// Simple decorators for backward compatibility
export { span, timed, setGlobalClient } from './simple.js';

// All decorators are available as named exports above
