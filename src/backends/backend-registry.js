/**
 * @fileoverview BackendRegistry - Config-driven backend management
 * @module backends/backend-registry
 *
 * Central registry for all AI backends with:
 * - Config-driven registration
 * - Dynamic adapter loading
 * - Hot-reload capability
 * - Fallback chain management
 */

import { LocalAdapter } from './local-adapter.js';
import { NvidiaDeepSeekAdapter, NvidiaQwenAdapter } from './nvidia-adapter.js';
import { GeminiAdapter } from './gemini-adapter.js';
import { OpenAIAdapter } from './openai-adapter.js';
import { GroqAdapter } from './groq-adapter.js';

/**
 * Adapter class mapping by type
 */
const ADAPTER_CLASSES = {
  'local': LocalAdapter,
  'nvidia_deepseek': NvidiaDeepSeekAdapter,
  'nvidia_qwen': NvidiaQwenAdapter,
  'gemini': GeminiAdapter,
  'openai': OpenAIAdapter,
  'groq': GroqAdapter
};

/**
 * Default backend configurations
 */
const DEFAULT_BACKENDS = {
  local: {
    type: 'local',
    enabled: true,
    priority: 1,
    description: 'Local Qwen2.5-Coder-7B-Instruct (128K context)',
    config: {}
  },
  nvidia_deepseek: {
    type: 'nvidia_deepseek',
    enabled: true,
    priority: 2,
    description: 'NVIDIA DeepSeek V3.1 Terminus (reasoning)',
    config: {}
  },
  nvidia_qwen: {
    type: 'nvidia_qwen',
    enabled: true,
    priority: 3,
    description: 'NVIDIA Qwen3 Coder 480B (coding)',
    config: {}
  },
  gemini: {
    type: 'gemini',
    enabled: true,
    priority: 4,
    description: 'Google Gemini 2.5 Flash (32K context)',
    config: {}
  },
  openai_chatgpt: {
    type: 'openai',
    enabled: true,
    priority: 5,
    description: 'OpenAI GPT-4.1 (premium reasoning, 128K context)',
    config: {}
  },
  groq_llama: {
    type: 'groq',
    enabled: true,
    priority: 6,
    description: 'Groq Llama 3.3 70B (ultra-fast 500+ t/s)',
    config: {}
  }
};

class BackendRegistry {
  /**
   * Create a BackendRegistry
   * @param {Object} [config] - Registry configuration
   */
  constructor(config = {}) {
    /** @type {Map<string, Object>} */
    this.backends = new Map();

    /** @type {Map<string, Object>} */
    this.adapters = new Map();

    /** @type {Object} */
    this.config = {
      autoInitialize: true,
      ...config
    };

    /** @type {string[]} */
    this.fallbackChain = [];

    if (this.config.autoInitialize) {
      this.initializeDefaults();
    }
  }

  /**
   * Initialize default backends
   * @private
   */
  initializeDefaults() {
    for (const [name, backendConfig] of Object.entries(DEFAULT_BACKENDS)) {
      this.register(name, backendConfig);
    }

    console.error(`[BackendRegistry] Initialized ${this.backends.size} backends`);
  }

  /**
   * Register a backend
   * @param {string} name - Backend name
   * @param {Object} backendConfig - Backend configuration
   */
  register(name, backendConfig) {
    const { type, enabled = true, priority = 99, config = {} } = backendConfig;

    this.backends.set(name, {
      name,
      type,
      enabled,
      priority,
      config,
      description: backendConfig.description || `Backend: ${name}`
    });

    // Create adapter if enabled
    if (enabled) {
      this.createAdapter(name);
    }

    // Update fallback chain
    this.updateFallbackChain();
  }

  /**
   * Create adapter instance for backend
   * @private
   */
  createAdapter(name) {
    const backend = this.backends.get(name);
    if (!backend) return null;

    const AdapterClass = ADAPTER_CLASSES[backend.type];
    if (!AdapterClass) {
      console.error(`[BackendRegistry] Unknown adapter type: ${backend.type}`);
      return null;
    }

    try {
      const adapter = new AdapterClass(backend.config);
      this.adapters.set(name, adapter);
      return adapter;
    } catch (error) {
      console.error(`[BackendRegistry] Failed to create adapter ${name}:`, error.message);
      return null;
    }
  }

  /**
   * Update fallback chain based on priorities
   * @private
   */
  updateFallbackChain() {
    const enabled = Array.from(this.backends.values())
      .filter(b => b.enabled)
      .sort((a, b) => a.priority - b.priority);

    this.fallbackChain = enabled.map(b => b.name);
  }

  /**
   * Get adapter by name
   * @param {string} name - Backend name
   * @returns {Object|null}
   */
  getAdapter(name) {
    return this.adapters.get(name) || null;
  }

  /**
   * Get backend configuration
   * @param {string} name - Backend name
   * @returns {Object|null}
   */
  getBackend(name) {
    return this.backends.get(name) || null;
  }

  /**
   * Get all enabled backend names
   * @returns {string[]}
   */
  getEnabledBackends() {
    return Array.from(this.backends.values())
      .filter(b => b.enabled)
      .map(b => b.name);
  }

  /**
   * Get fallback chain
   * @returns {string[]}
   */
  getFallbackChain() {
    return [...this.fallbackChain];
  }

  /**
   * Enable/disable backend
   * @param {string} name - Backend name
   * @param {boolean} enabled - Enable state
   */
  setEnabled(name, enabled) {
    const backend = this.backends.get(name);
    if (!backend) return;

    backend.enabled = enabled;

    if (enabled && !this.adapters.has(name)) {
      this.createAdapter(name);
    } else if (!enabled && this.adapters.has(name)) {
      this.adapters.delete(name);
    }

    this.updateFallbackChain();
  }

  /**
   * Update backend priority
   * @param {string} name - Backend name
   * @param {number} priority - New priority
   */
  setPriority(name, priority) {
    const backend = this.backends.get(name);
    if (!backend) return;

    backend.priority = priority;
    this.updateFallbackChain();
  }

  /**
   * Get next available backend in fallback chain
   * @param {string[]} [exclude=[]] - Backends to exclude
   * @returns {string|null}
   */
  getNextAvailable(exclude = []) {
    for (const name of this.fallbackChain) {
      if (!exclude.includes(name)) {
        const adapter = this.adapters.get(name);
        if (adapter && !adapter.circuitOpen) {
          return name;
        }
      }
    }
    return null;
  }

  /**
   * Make request with automatic fallback
   * @param {string} prompt - Prompt to send
   * @param {string} [preferredBackend] - Preferred backend
   * @param {Object} [options] - Request options
   * @returns {Promise<Object>}
   */
  async makeRequestWithFallback(prompt, preferredBackend = null, options = {}) {
    const attempted = [];
    let lastError = null;

    // Try preferred backend first
    if (preferredBackend) {
      const adapter = this.adapters.get(preferredBackend);
      if (adapter && !adapter.circuitOpen) {
        try {
          const result = await adapter.execute(prompt, options);
          return {
            ...result,
            fallbackChain: attempted,
            backend: preferredBackend
          };
        } catch (error) {
          lastError = error;
          attempted.push(preferredBackend);
        }
      }
    }

    // Fallback through chain
    for (const name of this.fallbackChain) {
      if (attempted.includes(name)) continue;

      const adapter = this.adapters.get(name);
      if (!adapter || adapter.circuitOpen) continue;

      try {
        const result = await adapter.execute(prompt, options);
        return {
          ...result,
          fallbackChain: attempted,
          backend: name
        };
      } catch (error) {
        lastError = error;
        attempted.push(name);
      }
    }

    throw new Error(`All backends failed. Last error: ${lastError?.message}`);
  }

  /**
   * Check health of all backends
   * @returns {Promise<Object>}
   */
  async checkHealth() {
    const results = {};

    for (const [name, adapter] of this.adapters) {
      try {
        results[name] = await adapter.checkHealth();
      } catch (error) {
        results[name] = {
          healthy: false,
          error: error.message
        };
      }
    }

    return results;
  }

  /**
   * Get registry statistics
   * @returns {Object}
   */
  getStats() {
    const total = this.backends.size;
    const enabled = this.getEnabledBackends().length;
    const healthy = Array.from(this.adapters.values())
      .filter(a => a.lastHealth?.healthy).length;

    return {
      totalBackends: total,
      enabledBackends: enabled,
      healthyBackends: healthy,
      fallbackChain: this.fallbackChain,
      backends: Array.from(this.backends.values()).map(b => ({
        name: b.name,
        type: b.type,
        enabled: b.enabled,
        priority: b.priority,
        description: b.description
      }))
    };
  }

  /**
   * Load configuration from JSON
   * @param {Object} config - Configuration object
   */
  loadConfig(config) {
    // Clear existing
    this.backends.clear();
    this.adapters.clear();

    // Load new
    for (const [name, backendConfig] of Object.entries(config.backends || {})) {
      this.register(name, backendConfig);
    }

    console.error(`[BackendRegistry] Loaded ${this.backends.size} backends from config`);
  }

  /**
   * Export current configuration
   * @returns {Object}
   */
  exportConfig() {
    const backends = {};

    for (const [name, backend] of this.backends) {
      backends[name] = {
        type: backend.type,
        enabled: backend.enabled,
        priority: backend.priority,
        description: backend.description,
        config: backend.config
      };
    }

    return { backends };
  }
}

export {
  BackendRegistry,
  ADAPTER_CLASSES,
  DEFAULT_BACKENDS
};
