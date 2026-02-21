/**
 * @fileoverview BackendRegistry - Config-driven backend management
 * @module backends/backend-registry
 *
 * Central registry for all AI backends with:
 * - Config-driven registration
 * - Dynamic adapter loading
 * - Hot-reload capability
 * - Fallback chain management
 *
 * Smart AI Bridge v2.0.0
 */

import { LocalAdapter } from './local-adapter.js';
import { NvidiaDeepSeekAdapter, NvidiaQwenAdapter } from './nvidia-adapter.js';
import { GeminiAdapter } from './gemini-adapter.js';
import { OpenAIAdapter } from './openai-adapter.js';
import { GroqAdapter } from './groq-adapter.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Get directory of current module for resolving config paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Config file paths - backends.json is the SINGLE SOURCE OF TRUTH
const BACKENDS_CONFIG_PATH = join(__dirname, '../config/backends.json');
const CUSTOM_BACKENDS_PATH = join(__dirname, '../../data/backends-custom.json');

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
 * Load backends from the main config file (single source of truth)
 * @returns {Object} Backend configurations
 */
function loadBackendsFromConfig() {
  try {
    if (existsSync(BACKENDS_CONFIG_PATH)) {
      const data = readFileSync(BACKENDS_CONFIG_PATH, 'utf-8');
      const config = JSON.parse(data);
      return config.backends || {};
    }
  } catch (error) {
    console.error(`[BackendRegistry] Error loading backends.json: ${error.message}`);
  }

  // Fallback to minimal config if file doesn't exist
  console.error('[BackendRegistry] backends.json not found, using minimal fallback');
  return {
    local: {
      type: 'local',
      enabled: true,
      priority: 1,
      description: 'Local model via router (autodiscovery)',
      config: {}
    }
  };
}

/**
 * Resolve API key from environment variable if needed
 * @param {string} apiKey - API key value or environment variable reference
 * @returns {string|undefined} - Resolved API key value
 */
function resolveApiKey(apiKey) {
  if (!apiKey) return undefined;

  if (apiKey.startsWith('$')) {
    const varName = apiKey.substring(1);
    const resolved = process.env[varName];

    if (!resolved) {
      console.warn(`[BackendRegistry] Environment variable ${varName} not found, using literal value`);
    }

    return resolved || apiKey;
  }

  return apiKey;
}

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
   * Initialize backends from config file (single source of truth)
   * @private
   */
  initializeDefaults() {
    const backendsConfig = loadBackendsFromConfig();
    for (const [name, backendConfig] of Object.entries(backendsConfig)) {
      this.register(name, backendConfig);
    }

    // Load custom backends from disk (these override/extend main config)
    this.loadCustomBackends();

    console.error(`[BackendRegistry] Initialized ${this.backends.size} backends from backends.json`);
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
          if (this.backends.has(name)) {
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
   * Save current backends to the main config file (single source of truth)
   */
  saveConfig() {
    try {
      let existingConfig = { version: "2.0.0", description: "Smart AI Bridge Backend Configuration" };
      try {
        if (existsSync(BACKENDS_CONFIG_PATH)) {
          existingConfig = JSON.parse(readFileSync(BACKENDS_CONFIG_PATH, 'utf-8'));
        }
      } catch (e) {
        console.error(`[BackendRegistry] Error reading existing config: ${e.message}`);
      }

      const backends = {};
      for (const [name, backend] of this.backends) {
        backends[name] = {
          type: backend.type,
          enabled: backend.enabled,
          priority: backend.priority,
          description: backend.description,
          ...(backend.capabilities && { capabilities: backend.capabilities }),
          ...(backend.context_limit && { context_limit: backend.context_limit }),
          ...(backend.strengths && { strengths: backend.strengths }),
          ...(backend.excludeFromSubagent && { excludeFromSubagent: backend.excludeFromSubagent }),
          ...(backend.ports && { ports: backend.ports }),
          config: backend.config || {}
        };
      }

      existingConfig.backends = backends;

      const dir = dirname(BACKENDS_CONFIG_PATH);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(
        BACKENDS_CONFIG_PATH,
        JSON.stringify(existingConfig, null, 2),
        'utf-8'
      );

      console.error(`[BackendRegistry] Saved ${Object.keys(backends).length} backends to backends.json`);
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

    const resolvedConfig = { ...config };
    if (resolvedConfig.apiKey) {
      resolvedConfig.apiKey = resolveApiKey(resolvedConfig.apiKey);
    }

    this.backends.set(name, {
      name,
      type,
      enabled,
      priority,
      config: resolvedConfig,
      description: backendConfig.description || `Backend: ${name}`,
      ...(backendConfig.capabilities && { capabilities: backendConfig.capabilities }),
      ...(backendConfig.context_limit && { context_limit: backendConfig.context_limit }),
      ...(backendConfig.strengths && { strengths: backendConfig.strengths }),
      ...(backendConfig.excludeFromSubagent && { excludeFromSubagent: backendConfig.excludeFromSubagent }),
      ...(backendConfig.ports && { ports: backendConfig.ports })
    });

    if (enabled) {
      this.createAdapter(name);
    }

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
   * Get total number of registered backends
   * @returns {number}
   */
  getBackendCount() {
    return this.backends.size;
  }

  /**
   * Get all backends as name->config object
   * @returns {Object}
   */
  getAllBackends() {
    return Object.fromEntries(this.backends.entries());
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
          icon: b.icon || null,
          model: b.config?.model || null,
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
    this.backends.clear();
    this.adapters.clear();

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
    const { name, type, url, apiKey, model, maxTokens, timeout, priority, description, icon } = config;

    if (!name || !type) {
      return { success: false, error: 'Name and type are required' };
    }

    if (this.backends.has(name)) {
      return { success: false, error: `Backend '${name}' already exists` };
    }

    if (!ADAPTER_CLASSES[type]) {
      console.error(`[BackendRegistry] Using openai adapter for custom type: ${type}`);
    }

    const backendConfig = {
      type: ADAPTER_CLASSES[type] ? type : 'openai',
      enabled: true,
      priority: priority || this.backends.size + 1,
      description: description || `Custom backend: ${name}`,
      icon: icon || undefined,
      config: {
        url: url || undefined,
        apiKey: resolveApiKey(apiKey) || undefined,
        model: model || undefined,
        maxTokens: maxTokens || 4096,
        timeout: timeout || 30000
      }
    };

    this.register(name, backendConfig);
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

    this.adapters.delete(name);
    this.backends.delete(name);
    this.updateFallbackChain();
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

    if (updates.enabled !== undefined) {
      this.setEnabled(name, updates.enabled);
    }
    if (updates.priority !== undefined) {
      this.setPriority(name, updates.priority);
    }
    if (updates.description !== undefined) {
      backend.description = updates.description;
    }
    if (updates.icon !== undefined) {
      backend.icon = updates.icon;
    }
    if (updates.config) {
      backend.config = { ...backend.config, ...updates.config };
      if (backend.enabled) {
        this.adapters.delete(name);
        this.createAdapter(name);
      }
    }

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
  loadBackendsFromConfig,
  BACKENDS_CONFIG_PATH
};
