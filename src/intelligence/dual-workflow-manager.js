/**
 * SAB Dual Workflow Manager
 *
 * Manages intelligent workflow modes based on available backends:
 * - DUAL_ITERATIVE: dual1 (generate) + dual2 (review) loop
 * - SELF_REFLECTION: Single model with multi-turn review
 * - PASS_THROUGH: Direct generation, no review loop
 * - CLOUD_FALLBACK: Use cloud backends when local unavailable
 *
 * Integrates with health monitoring and learning engine for optimal routing.
 */

import { CAPABILITIES, getBackendCapabilities } from '../utils/capability-matcher.js';

/**
 * Workflow modes
 */
const WorkflowMode = {
  DUAL_ITERATIVE: 'dual_iterative',      // Best: dual1 + dual2 loop
  SINGLE_REFLECTION: 'single_reflection', // Good: single model self-review
  PASS_THROUGH: 'pass_through',           // Basic: no review loop
  CLOUD_FALLBACK: 'cloud_fallback'        // Emergency: use cloud backends
};

/**
 * Dual Workflow Manager
 */
class DualWorkflowManager {
  constructor(options = {}) {
    this.healthMonitor = options.healthMonitor;
    this.backendRegistry = options.backendRegistry;
    this.learningEngine = options.learningEngine;

    // Configuration
    this.config = {
      maxIterations: options.maxIterations || 3,
      qualityThreshold: options.qualityThreshold || 0.7,
      timeoutMs: options.timeoutMs || 60000,
      enableLearning: options.enableLearning !== false,
      ...options
    };

    // Current state
    this.currentMode = null;
    this.availableBackends = new Set();
    this.lastModeCheck = 0;
    this.modeCacheTTL = 30000; // 30 seconds

    // Metrics
    this.metrics = {
      iterationsRun: 0,
      successfulLoops: 0,
      fallbacksTriggered: 0,
      modeChanges: []
    };

    console.error('[DualWorkflow] Manager initialized');
  }

  /**
   * Detect current workflow mode based on available backends
   * @returns {Object} { mode, backends, reasoning }
   */
  async detectMode() {
    const now = Date.now();

    // Check if local backend (port 8081 router) has multiple models loaded
    // Do this BEFORE cache check to detect capability changes
    const localAdapter = this.backendRegistry?.getAdapter?.('local');
    const localModelInfo = localAdapter?.getModelInfo?.() || {};
    const routerMultiModel = localModelInfo.multiModelCapable === true;

    // Invalidate cache if multiModelCapable state changed
    if (this._lastMultiModelState !== routerMultiModel) {
      this._lastMultiModelState = routerMultiModel;
      this.lastModeCheck = 0; // Force re-detection
      if (routerMultiModel) {
        console.error('[DualWorkflow] Router multi-model capability detected - refreshing mode');
      }
    }

    // Use cached mode if recent
    if (this.currentMode && (now - this.lastModeCheck) < this.modeCacheTTL) {
      return {
        mode: this.currentMode,
        cached: true,
        backends: Array.from(this.availableBackends)
      };
    }

    // Check backend health
    const localHealth = this.healthMonitor?.getBackendHealth?.('local');

    // Determine available backends
    this.availableBackends.clear();

    const localAlive = localHealth?.healthy === true;

    if (localAlive) this.availableBackends.add('local');

    // Determine mode
    let mode, reasoning;

    if (localAlive && routerMultiModel) {
      // NEW: Router-aware dual mode - 8081 has 2+ models loaded
      mode = WorkflowMode.DUAL_ITERATIVE;
      const loadedModels = localModelInfo.loadedModels?.map(m => m.id).join(', ') || 'unknown';
      reasoning = `Router multi-model mode: ${loadedModels} - router-aware dual iterate enabled`;
      console.error(`[DualWorkflow] 🚀 Router-aware dual mode activated with models: ${loadedModels}`);
    } else if (localAlive) {
      // One local model: self-reflection, uniformly.
      //
      // This used to be gated on a "tier" guessed from the model's NAME (a `70b`
      // or `qwen3` substring meant large enough to self-review). No server
      // reports a model's size, so that guess had no basis and it silently
      // demoted every model whose name it did not recognise to pass-through.
      // Lanes are treated uniformly instead: the reflection loop is offered, and
      // its own quality threshold decides whether the review was worth anything.
      mode = WorkflowMode.SINGLE_REFLECTION;
      reasoning = 'Single local model - self-reflection enabled';
    } else {
      // No local backends - fallback to cloud
      mode = WorkflowMode.CLOUD_FALLBACK;
      reasoning = 'No local backends available - using cloud fallback';
    }

    // Track mode changes
    if (this.currentMode !== mode) {
      this.metrics.modeChanges.push({
        from: this.currentMode,
        to: mode,
        timestamp: now,
        reasoning
      });
      console.error(`[DualWorkflow] Mode changed: ${this.currentMode} → ${mode}`);
    }

    this.currentMode = mode;
    this.lastModeCheck = now;

    return {
      mode,
      cached: false,
      backends: Array.from(this.availableBackends),
      reasoning
    };
  }

  /**
   * Pick a loaded router model for a role.
   *
   * Capabilities come from the adapter (operator-declared config, else what the
   * server reported) — never from the model id. When no loaded model claims the
   * capability, which is the normal case for an operator who declared nothing,
   * any loaded model other than `excludeId` will do: the point of the dual loop
   * is that the two roles run on DIFFERENT models, and that is achievable
   * without knowing anything semantic about either.
   *
   * @param {string} capability - A CAPABILITIES value
   * @param {string|null} [excludeId] - Model the other role already took
   * @returns {string|null} Model id, or null to use whatever is already loaded
   */
  _pickLoadedModel(capability, excludeId = null) {
    const loaded = this.backendRegistry?.getAdapter?.('local')?.getModelInfo?.()?.loadedModels || [];
    const capable = loaded.filter(m => (m.capabilities || []).includes(capability));
    const pool = capable.length > 0 ? capable : loaded;
    const distinct = pool.find(m => m.id !== excludeId);
    return (distinct || pool[0])?.id || null;
  }

  /**
   * Get the optimal backend for a specific role
   * @param {string} role - 'generator' | 'reviewer' | 'fixer'
   * @param {Object} context - Task context for smart routing
   * @returns {Object} { backend: string, routerModel: string|null }
   */
  async getBackendForRole(role, context = {}) {
    const { mode } = await this.detectMode();

    switch (mode) {
      case WorkflowMode.DUAL_ITERATIVE:
        // Router-aware dual mode: pick the two models from what the router
        // actually has loaded, by capability. Model ids are the caller's own
        // router config, so nothing may be hardcoded here.
        if (role === 'generator' || role === 'fixer') {
          return { backend: 'local', routerModel: this._pickLoadedModel(CAPABILITIES.CODE_SPECIALIZED) };
        } else if (role === 'reviewer') {
          // Recompute the generator's choice (stateless, deterministic) so the
          // reviewer can steer away from it.
          const generatorModel = this._pickLoadedModel(CAPABILITIES.CODE_SPECIALIZED);
          return { backend: 'local', routerModel: this._pickLoadedModel(CAPABILITIES.DEEP_REASONING, generatorModel) };
        }
        break;

      case WorkflowMode.SINGLE_REFLECTION:
        // Single mode: same backend for all roles, no specific model
        if (this.availableBackends.has('local')) return { backend: 'local', routerModel: null };
        break;

      case WorkflowMode.CLOUD_FALLBACK:
        // Emergency mode: local is down, so this MUST resolve to whatever the
        // operator actually configured, never to a name that may not exist.
        return { backend: this._pickCloudBackend(role), routerModel: null };
    }

    // Default fallback
    return { backend: this._getFirstHealthyBackend(), routerModel: null };
  }

  /**
   * Pick a usable (enabled + resolvable-key) non-local backend for a role,
   * preferring one whose declared/reported capabilities suit the role but
   * never requiring a specific name — the repo ships no model ids and
   * expects operators to configure their own lanes, so assuming e.g.
   * nvidia_glm/nvidia_deepseek exist is unsafe. Degrades to any usable
   * backend, and to null (never throws) if nothing is usable at all.
   * @private
   * @param {string} role - 'generator' | 'reviewer' | 'fixer'
   * @returns {string|null}
   */
  _pickCloudBackend(role) {
    const chain = this.backendRegistry?.getFallbackChain?.() || [];
    const usable = new Set(this.backendRegistry?.getUsableBackends?.() || chain);
    const candidates = (chain.length > 0 ? chain : [...usable])
      .filter(b => b !== 'local' && usable.has(b));

    if (candidates.length === 0) return null;

    const wantCap = role === 'reviewer' ? CAPABILITIES.DEEP_REASONING : CAPABILITIES.CODE_SPECIALIZED;
    const preferred = candidates.find(b => getBackendCapabilities(b).includes(wantCap));
    return preferred || candidates[0];
  }

  /**
   * Get first healthy, usable backend from the registry's own priority
   * order. Never a hardcoded name: an operator who configured only one
   * cloud lane (e.g. just Groq) must still get it back here rather than an
   * unconfigured 'nvidia_glm' that will fail at request time.
   * @private
   * @returns {string|null}
   */
  _getFirstHealthyBackend() {
    const chain = this.backendRegistry?.getFallbackChain?.() || [];
    const usable = new Set(this.backendRegistry?.getUsableBackends?.() || chain);
    const candidates = (chain.length > 0 ? chain : [...usable]).filter(b => usable.has(b));

    for (const backend of candidates) {
      const health = this.healthMonitor?.getBackendHealth?.(backend);
      if (health?.healthy) return backend;
    }

    // No health data yet (nothing probed) — degrade to any usable backend
    // rather than a name that may not be configured.
    return candidates[0] || null;
  }

  /**
   * Build the optimal fallback chain based on current state
   * @returns {string[]} Ordered list of backends to try
   */
  async getFallbackChain() {
    const { mode } = await this.detectMode();

    const chains = {
      [WorkflowMode.DUAL_ITERATIVE]: [
        'local', 'local', 'local',
        'nvidia_glm', 'nvidia_deepseek', 'groq_llama', 'gemini'
      ],
      [WorkflowMode.SINGLE_REFLECTION]: [
        ...Array.from(this.availableBackends),
        'nvidia_glm', 'nvidia_deepseek', 'groq_llama', 'gemini'
      ],
      [WorkflowMode.PASS_THROUGH]: [
        ...Array.from(this.availableBackends),
        'groq_llama', 'nvidia_glm', 'gemini'
      ],
      [WorkflowMode.CLOUD_FALLBACK]: [
        'nvidia_glm', 'nvidia_deepseek', 'groq_llama', 'gemini'
      ]
    };

    return chains[mode] || chains[WorkflowMode.CLOUD_FALLBACK];
  }

  /**
   * Check if iterative workflow is available
   * @returns {boolean}
   */
  async canRunIterative() {
    const { mode } = await this.detectMode();
    return mode === WorkflowMode.DUAL_ITERATIVE || mode === WorkflowMode.SINGLE_REFLECTION;
  }

  /**
   * Get current status for health endpoint
   * @returns {Object}
   */
  getStatus() {
    return {
      currentMode: this.currentMode,
      availableBackends: Array.from(this.availableBackends),
      lastModeCheck: this.lastModeCheck,
      metrics: this.metrics,
      config: {
        maxIterations: this.config.maxIterations,
        qualityThreshold: this.config.qualityThreshold
      }
    };
  }

  /**
   * Force mode refresh (invalidate cache)
   */
  invalidateCache() {
    this.lastModeCheck = 0;
    this.currentMode = null;
  }
}

export { DualWorkflowManager, WorkflowMode };
