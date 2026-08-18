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
import { detectLanguage as _detectLanguage } from './utils/language-detector.js';
import { CAPABILITIES, getBackendCapabilities } from './utils/capability-matcher.js';

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
   * Apply rule-based routing heuristics.
   *
   * Expresses INTENT (prefer a deep-reasoning lane for complex tasks, prefer
   * a code-specialized lane for code tasks) against declared/known
   * CAPABILITY, never a backend NAME — an operator without 'nvidia_glm' or
   * 'nvidia_deepseek' configured used to get a tier that could never fire,
   * silently, with no indication why. Candidates are healthy AND usable
   * (enabled + reachable), walked in the registry's own priority order, so
   * the first capability match is also the operator's preferred lane among
   * ties. Returns null when nothing matches, exactly as before.
   * @private
   */
  async _applyRuleBasedRouting(context) {
    const backends = await this.registry.checkHealth();
    const usable = new Set(this.registry.getUsableBackends?.() || Object.keys(backends));
    const chain = (this.registry.getFallbackChain?.() || Object.keys(backends))
      .filter(name => usable.has(name) && backends[name]?.healthy);

    const pickByCapability = (capability) => {
      for (const name of chain) {
        const caps = this.registry.getBackend?.(name)?.capabilities || getBackendCapabilities(name);
        if (caps?.includes(capability)) return name;
      }
      return null;
    };

    // Complex tasks -> prefer a deep-reasoning-capable lane
    if (context.complexity === 'complex') {
      const pick = pickByCapability(CAPABILITIES.DEEP_REASONING);
      if (pick) return pick;
    }

    // Code tasks -> prefer a code-specialized lane
    if (context.taskType === 'code') {
      const pick = pickByCapability(CAPABILITIES.CODE_SPECIALIZED);
      if (pick) return pick;
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

  /**
   * Dynamic output-token budget for a generation-shaped prompt.
   *
   * The 'local' vs everything-else split this replaced hardcoded two
   * numbers by NAME — any non-local lane got the smaller one regardless of
   * what it could actually handle. This is the router, not a handler (no
   * capacityFor/estimateBackendSpeed here), but the registry's own
   * CONFIGURED `context_limit` is synchronously available and real — this
   * method's one caller (AskHandler#calculateDynamicTokens) calls it
   * synchronously, so it cannot become async without touching that
   * out-of-scope file. Capped at 16384 (the old ceiling) so an unusually
   * large context doesn't turn into an unusually large output ask; a
   * backend with no configured limit gets the single flat default the old
   * code already used for "not local".
   * @private
   */
  calculateDynamicTokenLimit(prompt, backend) {
    const lower = (prompt || '').toLowerCase();
    if (lower.includes('unity') || lower.includes('monobehaviour') || lower.includes('gameobject')) {
      return 16384;
    }
    if (lower.includes('implement') || lower.includes('generate') || prompt.length > 2000) {
      const configuredLimit = this.registry.getBackend?.(backend)?.context_limit;
      if (typeof configuredLimit === 'number' && configuredLimit > 0) {
        return Math.min(configuredLimit, 16384);
      }
      return 8192;
    }
    return 2048;
  }

  detectLanguage(input = '') {
    return _detectLanguage(input);
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
