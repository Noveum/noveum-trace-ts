/**
 * Agent-specific trace decorator for AI agent workflow tracing
 */

import type { Attributes } from '../core/types.js';
import { trace, TraceOptions } from './base.js';

/**
 * Agent workflow step types
 */
export type AgentStepType =
  | 'planning'
  | 'reasoning'
  | 'action'
  | 'observation'
  | 'reflection'
  | 'decision'
  | 'tool_use'
  | 'memory_retrieval'
  | 'memory_storage'
  | 'goal_setting'
  | 'strategy_formation'
  | 'execution'
  | 'evaluation'
  | 'learning';

/**
 * Agent status types
 */
export type AgentStatus =
  | 'active'
  | 'waiting'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'cancelled';

/**
 * Agent workflow metadata
 */
export interface AgentMetadata {
  /** Agent identifier or name */
  agentId?: string;
  /** Agent type or class */
  agentType?: string;
  /** Current workflow step type */
  stepType?: AgentStepType;
  /** Agent status */
  status?: AgentStatus;
  /** Current goal or objective */
  goal?: string;
  /** Current task or sub-task */
  task?: string;
  /** Step number in workflow */
  stepNumber?: number;
  /** Total expected steps */
  totalSteps?: number;
  /** Agent confidence score (0-1) */
  confidence?: number;
  /** Input to the agent step */
  input?: string;
  /** Output from the agent step */
  output?: string;
  /** Reasoning or rationale */
  reasoning?: string;
  /** Tools used in this step */
  toolsUsed?: string[];
  /** Memory accessed */
  memoryAccessed?: string[];
  /** Errors encountered */
  errors?: string[];
  /** Performance metrics */
  metrics?: Record<string, number>;
  /** Additional context */
  context?: Record<string, any>;
}

/**
 * Options for the Agent trace decorator
 */
export interface TraceAgentOptions extends Omit<TraceOptions, 'attributes'> {
  /** Agent-specific metadata */
  agentMetadata?: Partial<AgentMetadata>;
  /** Additional attributes */
  attributes?: Attributes;
  /** Whether to automatically capture input/output */
  captureInputOutput?: boolean;
  /** Whether to track performance metrics */
  trackMetrics?: boolean;
  /** Maximum length for captured strings */
  maxCaptureLength?: number;
}

/**
 * Performance tracker for agent operations
 */
class AgentPerformanceTracker {
  private startTime: number;
  private memoryUsage: number;

  constructor() {
    this.startTime = Date.now();
    this.memoryUsage = this.getCurrentMemoryUsage();
  }

  private getCurrentMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed;
    }
    return 0;
  }

  getMetrics(): Record<string, number> {
    const endTime = Date.now();
    const duration = endTime - this.startTime;
    const currentMemory = this.getCurrentMemoryUsage();
    const memoryDelta = currentMemory - this.memoryUsage;

    return {
      duration_ms: duration,
      memory_used_bytes: this.memoryUsage,
      memory_delta_bytes: memoryDelta,
      timestamp: endTime,
    };
  }
}

/**
 * Utility function to safely truncate strings
 */
function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.substring(0, maxLength - 3)}...`;
}

/**
 * Utility function to safely serialize objects
 */
function safeSerialize(obj: any, maxLength: number): string {
  try {
    const serialized = typeof obj === 'string' ? obj : JSON.stringify(obj);
    return truncateString(serialized, maxLength);
  } catch {
    return truncateString(String(obj), maxLength);
  }
}

/**
 * Agent trace decorator for tracing AI agent workflow steps
 *
 * @param options - Configuration options for the agent decorator
 * @returns Decorator function
 *
 * @example
 * class AIAgent {
 *   @traceAgent({
 *     name: 'planning-step',
 *     agentMetadata: {
 *       agentId: 'agent-1',
 *       stepType: 'planning',
 *       agentType: 'ReasoningAgent'
 *     }
 *   })
 *   async planNextAction(context: any) {
 *     // Agent planning logic
 *     return { action: 'search', params: { query: 'user intent' } };
 *   }
 *
 *   @traceAgent({
 *     agentMetadata: { stepType: 'action' },
 *     captureInputOutput: true
 *   })
 *   async executeAction(action: any) {
 *     // Action execution logic
 *     return await this.performAction(action);
 *   }
 * }
 */
export function traceAgent(options: TraceAgentOptions = {}): any {
  const {
    agentMetadata = {},
    captureInputOutput = true,
    trackMetrics = true,
    maxCaptureLength = 1000,
    attributes = {},
    ...traceOptions
  } = options;

  // Build attributes from agent metadata
  const agentAttributes: Attributes = {
    ...attributes,
    'agent.operation_type': 'workflow_step',
    'decorator.type': 'traceAgent',
  };

  // Add known agent metadata to attributes
  if (agentMetadata.agentId) agentAttributes['agent.id'] = agentMetadata.agentId;
  if (agentMetadata.agentType) agentAttributes['agent.type'] = agentMetadata.agentType;
  if (agentMetadata.stepType) agentAttributes['agent.step_type'] = agentMetadata.stepType;
  if (agentMetadata.status) agentAttributes['agent.status'] = agentMetadata.status;
  if (agentMetadata.goal) agentAttributes['agent.goal'] = agentMetadata.goal;
  if (agentMetadata.task) agentAttributes['agent.task'] = agentMetadata.task;
  if (agentMetadata.stepNumber !== undefined)
    agentAttributes['agent.step_number'] = agentMetadata.stepNumber;
  if (agentMetadata.totalSteps !== undefined)
    agentAttributes['agent.total_steps'] = agentMetadata.totalSteps;
  if (agentMetadata.confidence !== undefined)
    agentAttributes['agent.confidence'] = agentMetadata.confidence;

  // Create enhanced trace decorator
  return trace({
    ...traceOptions,
    attributes: agentAttributes,
  })(function decorator(
    target: any,
    _propertyKey?: string | symbol,
    descriptor?: PropertyDescriptor
  ) {
    // Get the original method/function
    const original = descriptor?.value || target;

    // Create wrapper that captures agent workflow data
    const wrapper = async function (this: any, ...args: any[]) {
      const tracker = trackMetrics ? new AgentPerformanceTracker() : null;

      try {
        // Capture input if enabled
        if (captureInputOutput && args.length > 0) {
          const currentSpan = require('../context/context-manager.js').getCurrentSpan();
          if (currentSpan) {
            const inputData = args.length === 1 ? args[0] : args;
            currentSpan.setAttribute('agent.input', safeSerialize(inputData, maxCaptureLength));
            currentSpan.setAttribute('agent.input_size', args.length);
          }
        }

        // Call original function
        const result = await Promise.resolve(original.apply(this, args));

        // Capture output and additional metadata
        const currentSpan = require('../context/context-manager.js').getCurrentSpan();
        if (currentSpan) {
          // Capture output if enabled
          if (captureInputOutput && result !== undefined) {
            currentSpan.setAttribute('agent.output', safeSerialize(result, maxCaptureLength));
            currentSpan.setAttribute('agent.output_type', typeof result);
          }

          // Add runtime metadata from result if it's an object
          if (result && typeof result === 'object') {
            // Check for common agent result patterns
            if (result.reasoning) {
              currentSpan.setAttribute(
                'agent.reasoning',
                truncateString(String(result.reasoning), maxCaptureLength)
              );
            }
            if (result.confidence !== undefined) {
              currentSpan.setAttribute('agent.confidence', result.confidence);
            }
            if (result.toolsUsed && Array.isArray(result.toolsUsed)) {
              currentSpan.setAttribute('agent.tools_used', result.toolsUsed.join(','));
              currentSpan.setAttribute('agent.tools_count', result.toolsUsed.length);
            }
            if (result.memoryAccessed && Array.isArray(result.memoryAccessed)) {
              currentSpan.setAttribute('agent.memory_accessed', result.memoryAccessed.join(','));
              currentSpan.setAttribute('agent.memory_access_count', result.memoryAccessed.length);
            }
            if (result.status) {
              currentSpan.setAttribute('agent.result_status', result.status);
            }
            if (result.nextSteps && Array.isArray(result.nextSteps)) {
              currentSpan.setAttribute('agent.next_steps', result.nextSteps.join(','));
              currentSpan.setAttribute('agent.next_steps_count', result.nextSteps.length);
            }
          }

          // Add performance metrics
          if (tracker) {
            const metrics = tracker.getMetrics();
            Object.entries(metrics).forEach(([key, value]) => {
              currentSpan.setAttribute(`agent.metrics.${key}`, value);
            });
          }

          // Add workflow progress if available
          if (agentMetadata.stepNumber !== undefined && agentMetadata.totalSteps !== undefined) {
            const progress = Math.round(
              (agentMetadata.stepNumber / agentMetadata.totalSteps) * 100
            );
            currentSpan.setAttribute('agent.progress_percent', progress);
          }

          // Mark as successful agent step
          currentSpan.setAttribute('agent.success', true);
        }

        return result;
      } catch (error) {
        // Add error-specific agent attributes
        const currentSpan = require('../context/context-manager.js').getCurrentSpan();
        if (currentSpan) {
          currentSpan.setAttribute('agent.success', false);
          currentSpan.setAttribute('agent.error', true);
          if (error instanceof Error) {
            currentSpan.setAttribute('agent.error_type', error.constructor.name);
            currentSpan.setAttribute(
              'agent.error_message',
              truncateString(error.message, maxCaptureLength)
            );
          }

          // Add performance metrics even on error
          if (tracker) {
            const metrics = tracker.getMetrics();
            Object.entries(metrics).forEach(([key, value]) => {
              currentSpan.setAttribute(`agent.metrics.${key}`, value);
            });
          }
        }
        throw error;
      }
    };

    // Apply the wrapper based on decoration type
    if (descriptor) {
      descriptor.value = wrapper;
      return descriptor;
    } else {
      return wrapper;
    }
  });
}

/**
 * Simple agent trace decorator without options
 */
export const simpleAgentTrace = traceAgent();

/**
 * Create a reusable agent decorator with preset options
 *
 * @param defaultOptions - Default options for the agent decorator
 * @returns Agent decorator factory
 *
 * @example
 * const tracePlanningAgent = createAgentDecorator({
 *   agentMetadata: {
 *     agentType: 'PlanningAgent',
 *     stepType: 'planning'
 *   },
 *   captureInputOutput: true,
 *   trackMetrics: true
 * });
 *
 * class PlanningAgent {
 *   @tracePlanningAgent({ agentMetadata: { agentId: 'planner-1' } })
 *   async createPlan(requirements: any) {
 *     // implementation
 *   }
 * }
 */
export function createAgentDecorator(defaultOptions: TraceAgentOptions) {
  return function (options: Partial<TraceAgentOptions> = {}) {
    return traceAgent({
      ...defaultOptions,
      ...options,
      agentMetadata: {
        ...defaultOptions.agentMetadata,
        ...options.agentMetadata,
      },
      attributes: {
        ...defaultOptions.attributes,
        ...options.attributes,
      },
    });
  };
}

/**
 * Predefined agent decorators for common workflow steps
 */
export const tracePlanning = createAgentDecorator({
  agentMetadata: { stepType: 'planning' },
  name: 'agent-planning',
});

export const traceReasoning = createAgentDecorator({
  agentMetadata: { stepType: 'reasoning' },
  name: 'agent-reasoning',
});

export const traceAction = createAgentDecorator({
  agentMetadata: { stepType: 'action' },
  name: 'agent-action',
});

export const traceObservation = createAgentDecorator({
  agentMetadata: { stepType: 'observation' },
  name: 'agent-observation',
});

export const traceReflection = createAgentDecorator({
  agentMetadata: { stepType: 'reflection' },
  name: 'agent-reflection',
});

export const traceDecision = createAgentDecorator({
  agentMetadata: { stepType: 'decision' },
  name: 'agent-decision',
});
