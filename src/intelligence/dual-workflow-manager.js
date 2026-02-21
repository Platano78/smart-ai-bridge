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
 * Model capability tiers (for deciding if self-reflection is viable)
 */
const ModelTier = {
  LARGE: 'large',     // 14B+ params - can self-reflect
  MEDIUM: 'medium',   // 7-13B params - limited self-reflection
  SMALL: 'small'      // <7B params - no self-reflection (hallucination risk)
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
      // Check model size for self-reflection viability
      const singleBackend = 'local';
      const modelTier = await this._detectModelTier(singleBackend);

      if (modelTier === ModelTier.LARGE) {
        mode = WorkflowMode.SINGLE_REFLECTION;
        reasoning = `Single ${modelTier} model (${singleBackend}) - self-reflection enabled`;
      } else if (modelTier === ModelTier.MEDIUM) {
        mode = WorkflowMode.SINGLE_REFLECTION;
        reasoning = `Single ${modelTier} model (${singleBackend}) - limited self-reflection`;
      } else {
        mode = WorkflowMode.PASS_THROUGH;
        reasoning = `Single ${modelTier} model (${singleBackend}) - pass-through only (too small for reflection)`;
      }
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
   * Detect model tier based on model ID
   * @private
   */
  async _detectModelTier(backendName) {
    try {
      const adapter = this.backendRegistry?.getAdapter?.(backendName);
      const modelId = adapter?.modelId || adapter?.detectedModel || '';
      const modelLower = modelId.toLowerCase();

      // Check for known large models (14B+)
      if (modelLower.includes('14b') || modelLower.includes('32b') ||
          modelLower.includes('70b') || modelLower.includes('deepseek-r1') ||
          modelLower.includes('qwen3') || modelLower.includes('codestral')) {
        return ModelTier.LARGE;
      }

      // Check for medium models (7-13B)
      if (modelLower.includes('7b') || modelLower.includes('8b') ||
          modelLower.includes('13b') || modelLower.includes('seed-coder')) {
        return ModelTier.MEDIUM;
      }

      // Default to small for unknown or small models
      return ModelTier.SMALL;
    } catch (error) {
      console.error(`[DualWorkflow] Model tier detection failed: ${error.message}`);
      return ModelTier.MEDIUM; // Safe default
    }
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
        // Router-aware dual mode: use 'local' backend with specific model selection
        if (role === 'generator' || role === 'fixer') {
          return { backend: 'local', routerModel: 'agents-seed-coder' }; // Coding model
        } else if (role === 'reviewer') {
          return { backend: 'local', routerModel: 'agents-qwen3-14b' }; // Reasoning model
        }
        break;

      case WorkflowMode.SINGLE_REFLECTION:
        // Single mode: same backend for all roles, no specific model
        if (this.availableBackends.has('local')) return { backend: 'local', routerModel: null };
        break;

      case WorkflowMode.CLOUD_FALLBACK:
        // Cloud fallback: route based on role
        if (role === 'reviewer') {
          return { backend: 'nvidia_deepseek', routerModel: null }; // Reasoning model for review
        }
        return { backend: 'nvidia_qwen', routerModel: null }; // Coding model for generation
    }

    // Default fallback
    return { backend: this._getFirstHealthyBackend(), routerModel: null };
  }

  /**
   * Get first healthy backend from priority list
   * @private
   */
  _getFirstHealthyBackend() {
    const priority = [
      'local', 'local', 'local',
      'nvidia_qwen', 'nvidia_deepseek', 'gemini', 'groq_llama'
    ];

    for (const backend of priority) {
      const health = this.healthMonitor?.getBackendHealth?.(backend);
      if (health?.healthy) return backend;
    }

    return 'nvidia_qwen'; // Ultimate fallback
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
        'nvidia_qwen', 'nvidia_deepseek', 'groq_llama', 'gemini'
      ],
      [WorkflowMode.SINGLE_REFLECTION]: [
        ...Array.from(this.availableBackends),
        'nvidia_qwen', 'nvidia_deepseek', 'groq_llama', 'gemini'
      ],
      [WorkflowMode.PASS_THROUGH]: [
        ...Array.from(this.availableBackends),
        'groq_llama', 'nvidia_qwen', 'gemini'
      ],
      [WorkflowMode.CLOUD_FALLBACK]: [
        'nvidia_qwen', 'nvidia_deepseek', 'groq_llama', 'gemini'
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

export { DualWorkflowManager, WorkflowMode, ModelTier };
