/**
 * Sampling functionality for the Noveum Trace SDK
 */

import type { SamplingConfig, SamplingRule } from './types.js';

/**
 * Sampler class for determining whether to sample traces
 */
export class Sampler {
  private readonly _config: SamplingConfig;

  constructor(config: SamplingConfig) {
    this._config = config;
  }

  /**
   * Determine if a trace should be sampled
   */
  shouldSample(traceId: string, name?: string): boolean {
    // Check rules first (they take precedence)
    if (this._config.rules && this._config.rules.length > 0) {
      for (const rule of this._config.rules) {
        if (this._matchesRule(rule, traceId, name)) {
          return Math.random() < rule.rate;
        }
      }
    }

    // Fall back to global rate
    return Math.random() < this._config.rate;
  }

  /**
   * Check if a trace matches a sampling rule
   */
  private _matchesRule(rule: SamplingRule, traceId: string, name?: string): boolean {
    if (rule.traceNamePattern && name) {
      const regex = new RegExp(rule.traceNamePattern);
      if (!regex.test(name)) {
        return false;
      }
    }

    if (rule.traceIdPattern) {
      const regex = new RegExp(rule.traceIdPattern);
      if (!regex.test(traceId)) {
        return false;
      }
    }

    return true;
  }
}

/**
 * Always sample - samples 100% of traces
 */
export class AlwaysSampler extends Sampler {
  constructor() {
    super({ rate: 1.0 });
  }
}

/**
 * Never sample - samples 0% of traces
 */
export class NeverSampler extends Sampler {
  constructor() {
    super({ rate: 0.0 });
  }
}

/**
 * Rate-based sampler - samples a percentage of traces
 */
export class RateSampler extends Sampler {
  constructor(rate: number) {
    super({ rate: Math.max(0, Math.min(1, rate)) });
  }
}

