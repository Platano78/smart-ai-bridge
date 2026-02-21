/**
 * Smart AI Bridge v2.0.0 - Multi-AI Router
 *
 * Extracted from monolithic smart-ai-bridge-v1.1.0.js
 * 4-tier routing with learning engine integration:
 *   Tier 1: Forced backend (explicit selection)
 *   Tier 2: Learning engine recommendation (>0.7 confidence)
 *   Tier 3: Rule-based routing (complexity/taskType heuristics)
 *   Tier 4: Health-based fallback chain
 */

import { ConcurrentRequestManager } from './utils/concurrent-request-manager.js';

export class MultiAIRouter {
  /**
   * @param {import('./backends/backend-registry.js').BackendRegistry} backendRegistry
   * @param {Object} [options]
   * @param {Object} [options.learningEngine] - Optional CompoundLearningEngine
   */
  constructor(backendRegistry, options = {}) {
    this.registry = backendRegistry;
    // Legacy compatibility for handlers that still access `router.backends`.
    this.backends = backendRegistry;
    this.requestManager = new ConcurrentRequestManager();
    this.learningEngine = options.learningEngine || null;
    this._lastRoutingContext = null;

    // Legacy placeholders retained for health/debug handlers.
    this.localDetector = options.localDetector || null;
    this.circuitBreakers = options.circuitBreakers || new Map();

    console.error('[Router] MultiAIRouter initialized');
  }

  /**
   * Route request to appropriate backend with 4-tier priority
   * @param {string} prompt - The prompt
   * @param {Object} [options] - Routing options
   * @returns {Promise<string>} Backend name
   */
  async routeRequest(prompt, options = {}) {
    this._lastRoutingContext = this.createRoutingContext(prompt, options);

    // Tier 1: Honor explicit backend selection
    const forcedBackend = options.forceBackend || options.backend;
    if (forcedBackend && forcedBackend !== 'auto') {
      this._lastRoutingContext.source = 'forced';
      this._lastRoutingContext.decision = forcedBackend;
      this._lastRoutingContext.confidence = 1.0;
      this._lastRoutingContext.reasoning = 'Explicit backend selection';
      return forcedBackend;
    }

    const context = this._extractContext(prompt, options);

    // Tier 2: Learning engine recommendation (if available and confident)
    if (this.learningEngine) {
      const recommendation = this.learningEngine.getRecommendation(context);
      if (recommendation && recommendation.confidence > 0.7) {
        console.error(`[Router] Learning recommendation: ${recommendation.backend} (confidence: ${recommendation.confidence.toFixed(2)})`);
        const backends = await this.registry.checkHealth();
        if (backends[recommendation.backend]?.healthy) {
          this._lastRoutingContext.source = 'learning';
          this._lastRoutingContext.decision = recommendation.backend;
          this._lastRoutingContext.confidence = recommendation.confidence;
          this._lastRoutingContext.reasoning = 'Learning engine recommendation';
          return recommendation.backend;
        }
      }
    }

    // Tier 3: Rule-based routing
    const ruleBackend = await this._applyRuleBasedRouting(context);
    if (ruleBackend) {
      console.error(`[Router] Rule-based routing: ${ruleBackend} (${context.complexity}/${context.taskType})`);
      this._lastRoutingContext.source = 'rules';
      this._lastRoutingContext.decision = ruleBackend;
      this._lastRoutingContext.confidence = 0.75;
      this._lastRoutingContext.reasoning = 'Rule-based routing';
      return ruleBackend;
    }

    // Tier 4: Health-based fallback
    const fallbackChain = this.registry.getFallbackChain();
    const selected = fallbackChain[0] || 'local';
    this._lastRoutingContext.source = 'fallback';
    this._lastRoutingContext.decision = selected;
    this._lastRoutingContext.confidence = 0.4;
    this._lastRoutingContext.reasoning = 'Fallback chain first healthy backend';
    return selected;
  }

  /**
   * Extract context from prompt for routing decisions
   * @private
   */
  _extractContext(prompt, options) {
    let complexity = 'simple';
    if (prompt.length > 2000 || (options.max_tokens && options.max_tokens > 4000)) {
      complexity = 'complex';
    } else if (prompt.length > 500 || (options.max_tokens && options.max_tokens > 1000)) {
      complexity = 'moderate';
    }

    let taskType = 'general';
    const lower = prompt.toLowerCase();
    if (lower.includes('code') || lower.includes('function') || lower.includes('class') || lower.includes('implement')) {
      taskType = 'code';
    } else if (lower.includes('analyze') || lower.includes('review') || lower.includes('understand')) {
      taskType = 'analysis';
    } else if (lower.includes('write') || lower.includes('create') || lower.includes('generate')) {
      taskType = 'generation';
    }

    return {
      complexity,
      taskType,
      promptLength: prompt.length,
      maxTokens: options.max_tokens || 2048
    };
  }

  /**
   * Apply rule-based routing heuristics
   * @private
   */
  async _applyRuleBasedRouting(context) {
    const backends = await this.registry.checkHealth();

    // Complex tasks -> prefer nvidia_qwen (480B model)
    if (context.complexity === 'complex' && backends.nvidia_qwen?.healthy) {
      return 'nvidia_qwen';
    }

    // Code tasks -> prefer nvidia_deepseek (specialized coder)
    if (context.taskType === 'code' && backends.nvidia_deepseek?.healthy) {
      return 'nvidia_deepseek';
    }

    return null;
  }

  /**
   * Make request to backend with automatic fallback and outcome recording
   * @param {string} prompt - The prompt
   * @param {string} backend - Backend name
   * @param {Object} [options] - Request options
   * @returns {Promise<Object>}
   */
  async makeRequest(prompt, backend, options = {}) {
    const startTime = Date.now();
    const context = this._extractContext(prompt, options);

    try {
      const result = await this.registry.makeRequestWithFallback(
        prompt,
        backend,
        options
      );

      const latency = Date.now() - startTime;

      // Record successful outcome if learning engine available
      if (this.learningEngine) {
        this.learningEngine.recordOutcome({
          backend: result.backend,
          context,
          success: true,
          latency,
          source: options.backend ? 'forced' : 'routed'
        });
      }

      return {
        success: true,
        backend: result.backend,
        response: result.content,
        content: result.content,
        tokens: result.tokens,
        latency: result.latency,
        fallbackChain: result.fallbackChain || []
      };
    } catch (error) {
      const latency = Date.now() - startTime;

      // Record failed outcome
      if (this.learningEngine) {
        this.learningEngine.recordOutcome({
          backend,
          context,
          success: false,
          latency,
          error: error.message,
          source: options.backend ? 'forced' : 'routed'
        });
      }

      throw error;
    }
  }

  /**
   * Check if a specific backend is healthy
   * @param {string} backendName
   * @returns {Promise<boolean>}
   */
  async isBackendHealthy(backendName) {
    const health = await this.registry.checkHealth();
    return health[backendName]?.healthy === true;
  }

  // Backward-compatible alias used by multiple handlers.
  async isBackendAvailable(backendName) {
    return this.isBackendHealthy(backendName);
  }

  /**
   * Get all available healthy backends
   * @returns {Promise<string[]>}
   */
  async getHealthyBackends() {
    const health = await this.registry.checkHealth();
    return Object.entries(health)
      .filter(([, info]) => info.healthy === true)
      .map(([name]) => name);
  }

  // Backward-compatible alias used by some handlers.
  async route(prompt, options = {}) {
    return this.routeRequest(prompt, options);
  }

  // Backward-compatible direct fallback call used by handlers.
  async makeRequestWithFallback(prompt, backend, options = {}) {
    return this.registry.makeRequestWithFallback(prompt, backend, options);
  }

  createRoutingContext(prompt, options = {}) {
    const context = this._extractContext(prompt, options);
    return {
      ...context,
      source: 'unknown',
      decision: null,
      confidence: null,
      reasoning: null,
      timestamp: Date.now()
    };
  }

  async recordRoutingOutcome(outcome) {
    if (!this.learningEngine?.recordOutcome) return;
    await this.learningEngine.recordOutcome(outcome);
  }

  calculateDynamicTokenLimit(prompt, backend) {
    const lower = (prompt || '').toLowerCase();
    if (lower.includes('unity') || lower.includes('monobehaviour') || lower.includes('gameobject')) {
      return 16384;
    }
    if (lower.includes('implement') || lower.includes('generate') || prompt.length > 2000) {
      return backend === 'local' ? 16384 : 8192;
    }
    return 2048;
  }

  detectLanguage(content = '') {
    if (content.includes('import React') || content.includes('useState')) return 'javascript';
    if (content.includes('def ') || content.includes('import ')) return 'python';
    if (content.includes('public class') || content.includes('private ')) return 'java';
    if (content.includes('#include') || content.includes('std::')) return 'cpp';
    if (content.includes('interface ') || content.includes(': string')) return 'typescript';
    return 'unknown';
  }

  // Legacy no-op hook retained for HealthHandler compatibility.
  async initializeLocalEndpoint() {
    return false;
  }

  // Legacy health signal consumed by AskHandler metadata.
  orchestratorHealthy() {
    return false;
  }
}
