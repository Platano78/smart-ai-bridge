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
import { NvidiaDeepSeekAdapter, NvidiaQwenAdapter, NvidiaMiniMaxAdapter, NvidiaNemotronAdapter } from './nvidia-adapter.js';
import { GeminiAdapter } from './gemini-adapter.js';
import { OpenAIAdapter } from './openai-adapter.js';
import { GroqAdapter } from './groq-adapter.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

// Custom backends config file path
const CUSTOM_BACKENDS_PATH = './data/backends-custom.json';

/**
 * Adapter class mapping by type
 */
const ADAPTER_CLASSES = {
  'local': LocalAdapter,
  'nvidia_deepseek': NvidiaDeepSeekAdapter,
  'nvidia_qwen': NvidiaQwenAdapter,
  'nvidia_minimax': NvidiaMiniMaxAdapter,
  'nvidia_nemotron': NvidiaNemotronAdapter,
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
    description: 'NVIDIA DeepSeek V3.2 (reasoning)',
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
  },
  nvidia_minimax: {
    type: 'nvidia_minimax',
    enabled: true,
    priority: 7,
    description: 'NVIDIA MiniMax M2 (reasoning with think blocks)',
    config: {}
  },
  nvidia_nemotron: {
    type: 'nvidia_nemotron',
    enabled: true,
    priority: 8,
    description: 'NVIDIA Nemotron 3 Nano (1M context, Hybrid MoE)',
    capabilities: ['large_context', 'deep_reasoning', 'code_specialized'],
    context_limit: 1000000,
    config: {
      maxTokens: 32768,
      timeout: 180000
    }
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
    // Load hardcoded defaults first
    for (const [name, backendConfig] of Object.entries(DEFAULT_BACKENDS)) {
      this.register(name, backendConfig);
    }

    // Then load custom backends from disk (these override/extend defaults)
    this.loadCustomBackends();

    console.error(`[BackendRegistry] Initialized ${this.backends.size} backends`);
  }

  /**
   * Load custom backends from disk
   */
  loadCustomBackends() {
    try {
      if (existsSync(CUSTOM_BACKENDS_PATH)) {
        const data = readFileSync(CUSTOM_BACKENDS_PATH, 'utf-8');
        const custom = JSON.parse(data);
        
        for (const [name, backendConfig] of Object.entries(custom.backends || {})) {
          // If backend exists, update it; otherwise add it
          if (this.backends.has(name)) {
            // Update existing backend with custom config
            const existing = this.backends.get(name);
            Object.assign(existing, backendConfig);
            console.error(`[BackendRegistry] Updated backend from custom config: ${name}`);
          } else {
            this.register(name, backendConfig);
            console.error(`[BackendRegistry] Loaded custom backend: ${name}`);
          }
        }
      }
    } catch (error) {
      console.error(`[BackendRegistry] Error loading custom backends: ${error.message}`);
    }
  }

  /**
   * Save current backends to custom config file
   * Only saves backends that differ from defaults or are new
   */
  saveConfig() {
    try {
      const customBackends = {};
      
      for (const [name, backend] of this.backends) {
        // Always save non-default backends
        if (!DEFAULT_BACKENDS[name]) {
          customBackends[name] = {
            type: backend.type,
            enabled: backend.enabled,
            priority: backend.priority,
            description: backend.description,
            config: backend.config
          };
        }
      }

      // Ensure directory exists
      const dir = dirname(CUSTOM_BACKENDS_PATH);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(
        CUSTOM_BACKENDS_PATH,
        JSON.stringify({ backends: customBackends }, null, 2),
        'utf-8'
      );

      console.error(`[BackendRegistry] Saved ${Object.keys(customBackends).length} custom backends to disk`);
      return true;
    } catch (error) {
      console.error(`[BackendRegistry] Error saving config: ${error.message}`);
      return false;
    }
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
      backends: Array.from(this.backends.values()).map(b => {
        const adapter = this.adapters.get(b.name);
        return {
          name: b.name,
          type: b.type,
          enabled: b.enabled,
          priority: b.priority,
          description: b.description,
          healthy: adapter?.lastHealth?.healthy ?? null
        };
      })
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


  /**
   * Add a new backend dynamically
   * @param {Object} config - Backend configuration
   * @returns {Object} Result with success status
   */
  addBackend(config) {
    const { name, type, url, apiKey, model, maxTokens, timeout, priority, description } = config;

    // Validate required fields
    if (!name || !type) {
      return { success: false, error: 'Name and type are required' };
    }

    // Check if backend already exists
    if (this.backends.has(name)) {
      return { success: false, error: `Backend '${name}' already exists` };
    }

    // Validate type exists in ADAPTER_CLASSES
    if (!ADAPTER_CLASSES[type]) {
      // Allow custom type for OpenAI-compatible endpoints
      console.error(`[BackendRegistry] Using openai adapter for custom type: ${type}`);
    }

    const backendConfig = {
      type: ADAPTER_CLASSES[type] ? type : 'openai', // Default to openai for custom
      enabled: true,
      priority: priority || this.backends.size + 1,
      description: description || `Custom backend: ${name}`,
      config: {
        url: url || undefined,
        apiKey: apiKey || undefined,
        model: model || undefined,
        maxTokens: maxTokens || 4096,
        timeout: timeout || 30000
      }
    };

    // Register the backend
    this.register(name, backendConfig);

    // Persist to disk
    this.saveConfig();

    return {
      success: true,
      message: `Backend '${name}' added successfully`,
      backend: this.backends.get(name)
    };
  }

  /**
   * Remove a backend
   * @param {string} name - Backend name
   * @returns {Object} Result with success status
   */
  removeBackend(name) {
    if (!this.backends.has(name)) {
      return { success: false, error: `Backend '${name}' not found` };
    }

    // Remove adapter and backend
    this.adapters.delete(name);
    this.backends.delete(name);
    this.updateFallbackChain();

    // Persist to disk
    this.saveConfig();

    return {
      success: true,
      message: `Backend '${name}' removed successfully`
    };
  }

  /**
   * Update a backend configuration
   * @param {string} name - Backend name
   * @param {Object} updates - Configuration updates
   * @returns {Object} Result with success status
   */
  updateBackend(name, updates) {
    const backend = this.backends.get(name);
    if (!backend) {
      return { success: false, error: `Backend '${name}' not found` };
    }

    // Apply updates
    if (updates.enabled !== undefined) {
      this.setEnabled(name, updates.enabled);
    }
    if (updates.priority !== undefined) {
      this.setPriority(name, updates.priority);
    }
    if (updates.description !== undefined) {
      backend.description = updates.description;
    }
    if (updates.config) {
      backend.config = { ...backend.config, ...updates.config };
      // Recreate adapter with new config if enabled
      if (backend.enabled) {
        this.adapters.delete(name);
        this.createAdapter(name);
      }
    }

    // Persist to disk
    this.saveConfig();

    return {
      success: true,
      message: `Backend '${name}' updated successfully`,
      backend: this.backends.get(name)
    };
  }

  /**
   * Get list of available adapter types
   * @returns {string[]}
   */
  getAvailableTypes() {
    return Object.keys(ADAPTER_CLASSES);
  }
}

export {
  BackendRegistry,
  ADAPTER_CLASSES,
  DEFAULT_BACKENDS
};
