/**
 * @fileoverview CouncilConfigManager - Singleton for council configuration management
 * @module config/council-config-manager
 * 
 * Implements in-memory config with async file persistence (Gemini pattern)
 * - API updates memory directly (instant)
 * - File writes are async for persistence
 * - No reliance on fs.watch for primary updates
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Config file path
const CONFIG_PATH = path.resolve(__dirname, '../../config/council-config.json');

// Base allow-list of valid backends (extended dynamically from registry)
const VALID_BACKENDS = [
  'local',
  'nvidia_deepseek',
  'nvidia_glm',
  'gemini',
  'openai_chatgpt',
  'groq_llama'
];

// Dynamic registry reference (set at startup)
let _backendRegistry = null;

/**
 * Set the backend registry for dynamic backend discovery
 * @param {object} registry - BackendRegistry instance
 */
function setBackendRegistry(registry) {
  _backendRegistry = registry;
  console.error('[CouncilConfig] Backend registry linked for dynamic validation');
}

/**
 * Get effective backends: base list merged with registered backends
 */
function getEffectiveBackends() {
  const base = new Set(VALID_BACKENDS);
  if (_backendRegistry) {
    try {
      const stats = _backendRegistry.getStats();
      if (stats?.backends) {
        stats.backends.forEach(b => base.add(b.name));
      }
    } catch (e) {
      console.error('[CouncilConfig] Failed to read registry:', e.message);
    }
  }
  return [...base];
}

/**
 * Get effective backends that are actually convenable right now — i.e. known AND
 * not disabled. council-handler.js requires ≥2 of these to run; validateConfig uses
 * this (not getEffectiveBackends) for that runtime-minimum check so a config isn't
 * accepted with a second backend that exists but is switched off.
 */
function getActiveBackends() {
  if (!_backendRegistry) {
    // No registry wired (e.g. registry not yet linked) — enabled/disabled state is
    // unknowable, so fall back to name-validity only rather than guessing.
    return getEffectiveBackends();
  }
  try {
    const stats = _backendRegistry.getStats();
    const enabledNames = new Set((stats?.backends || []).filter(b => b.enabled).map(b => b.name));
    // Base allow-list names not present in the live registry can't be confirmed
    // enabled either, so they're excluded from "active" even though they remain
    // valid backend names via getEffectiveBackends().
    return getEffectiveBackends().filter(name => enabledNames.has(name));
  } catch (e) {
    console.error('[CouncilConfig] Failed to read registry for active backends:', e.message);
    return getEffectiveBackends();
  }
}

// Valid topics
const VALID_TOPICS = [
  'coding',
  'reasoning',
  'architecture',
  'general',
  'creative',
  'security',
  'performance'
];

// Valid strategies with clear semantics
// parallel: All backends respond simultaneously, Claude synthesizes (fastest)
// sequential: Each backend sees previous responses, builds on them (deep reasoning)
// debate: Multiple rounds of back-and-forth discussion (thorough analysis)
// fallback: Try backends in priority order until success (reliability)
const VALID_STRATEGIES = ['parallel', 'sequential', 'debate', 'fallback'];

/**
 * Singleton config manager
 */
class CouncilConfigManager {
  constructor() {
    if (CouncilConfigManager.instance) {
      return CouncilConfigManager.instance;
    }
    
    this.config = null;
    this.configHistory = [];
    this.maxHistorySize = 10;
    this.lastModified = null;
    
    // Load initial config
    this.loadConfig();
    
    CouncilConfigManager.instance = this;
  }

  /**
   * Load config from file (sync, only used at startup)
   */
  loadConfig() {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
        this.config = JSON.parse(content);
        this.lastModified = new Date();
        console.error('[CouncilConfig] Loaded config from file');
      } else {
        // Create default config
        this.config = this.getDefaultConfig();
        this.saveConfigAsync();
        console.error('[CouncilConfig] Created default config');
      }
    } catch (error) {
      console.error('[CouncilConfig] Failed to load config:', error.message);
      this.config = this.getDefaultConfig();
    }
  }

  /**
   * Get default configuration
   */
  getDefaultConfig() {
    return {
      version: 1,
      topics: {
        coding: { strategy: 'parallel', backends: ['nvidia_glm', 'nvidia_deepseek'] },
        architecture: { strategy: 'debate', backends: ['nvidia_deepseek', 'nvidia_glm', 'gemini'] },
        general: { strategy: 'parallel', backends: ['gemini', 'groq_llama', 'nvidia_glm'] },
        creative: { strategy: 'parallel', backends: ['gemini', 'nvidia_glm', 'groq_llama'] },
        security: { strategy: 'debate', backends: ['nvidia_deepseek', 'nvidia_glm', 'gemini'] },
        performance: { strategy: 'parallel', backends: ['nvidia_deepseek', 'nvidia_glm'] }
      },
      defaults: ['local', 'gemini'],
      availableBackends: VALID_BACKENDS
    };
  }

  /**
   * Get current config
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Get backends for a specific topic
   */
  getBackendsForTopic(topic) {
    const topicConfig = this.config.topics[topic];
    if (topicConfig) {
      return [...topicConfig.backends];
    }
    return [...this.config.defaults];
  }

  /**
   * Get strategy for a specific topic
   */
  getStrategyForTopic(topic) {
    const topicConfig = this.config.topics[topic];
    return topicConfig?.strategy || 'parallel';
  }

  /**
   * Get all valid backend names
   */
  getAvailableBackends() {
    return getEffectiveBackends();
  }

  /**
   * Get all valid topics
   */
  getValidTopics() {
    return [...VALID_TOPICS];
  }

  /**
   * Validate a config object
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validateConfig(newConfig) {
    const errors = [];
    const effectiveBackends = getEffectiveBackends();
    // council-handler.js's runtime contract: a topic/default can't convene with fewer
    // than 2 available backends. Validating only "at least one" here lets a config
    // pass that will always fail at request time — check the real minimum too.
    const activeBackends = getActiveBackends();
    const RUNTIME_MIN_BACKENDS = 2;

    // Check version
    if (typeof newConfig.version !== 'number') {
      errors.push('Config must have a numeric version');
    }

    // Check topics
    if (!newConfig.topics || typeof newConfig.topics !== 'object') {
      errors.push('Config must have topics object');
    } else {
      for (const [topic, config] of Object.entries(newConfig.topics)) {
        // Validate topic name
        if (!VALID_TOPICS.includes(topic)) {
          errors.push(`Invalid topic: ${topic}. Must be one of: ${VALID_TOPICS.join(', ')}`);
          continue;
        }

        // Validate strategy
        if (!config.strategy || !VALID_STRATEGIES.includes(config.strategy)) {
          errors.push(`Invalid strategy for ${topic}: ${config.strategy}. Must be one of: ${VALID_STRATEGIES.join(', ')}`);
        }

        // Validate backends array
        if (!Array.isArray(config.backends) || config.backends.length === 0) {
          errors.push(`Topic ${topic} must have at least one backend`);
        } else {
          for (const backend of config.backends) {
            if (!effectiveBackends.includes(backend)) {
              errors.push(`Invalid backend '${backend}' in topic ${topic}. Must be one of: ${effectiveBackends.join(', ')}`);
            }
          }

          // Runtime-convenability check: council-handler.js needs ≥2 AVAILABLE
          // (enabled) backends to run a topic, not just ≥1 named in config.
          const availableCount = config.backends.filter(b => activeBackends.includes(b)).length;
          if (availableCount < RUNTIME_MIN_BACKENDS) {
            const disabled = config.backends.filter(b => effectiveBackends.includes(b) && !activeBackends.includes(b));
            errors.push(
              `Topic ${topic} has only ${availableCount} available backend(s) but council needs ≥${RUNTIME_MIN_BACKENDS} to convene` +
              (disabled.length ? ` (disabled: ${disabled.join(', ')})` : '') +
              `. Available backends: ${activeBackends.join(', ') || 'none'}.`
            );
          }
        }
      }
    }

    // Check defaults
    if (!Array.isArray(newConfig.defaults) || newConfig.defaults.length === 0) {
      errors.push('Config must have at least one default backend');
    } else {
      for (const backend of newConfig.defaults) {
        if (!effectiveBackends.includes(backend)) {
          errors.push(`Invalid default backend: ${backend}`);
        }
      }

      const availableDefaults = newConfig.defaults.filter(b => activeBackends.includes(b)).length;
      if (availableDefaults < RUNTIME_MIN_BACKENDS) {
        const disabledDefaults = newConfig.defaults.filter(b => effectiveBackends.includes(b) && !activeBackends.includes(b));
        errors.push(
          `defaults has only ${availableDefaults} available backend(s) but council needs ≥${RUNTIME_MIN_BACKENDS} to convene` +
          (disabledDefaults.length ? ` (disabled: ${disabledDefaults.join(', ')})` : '') +
          `. Available backends: ${activeBackends.join(', ') || 'none'}.`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Update configuration (in-memory first, then persist async)
   * @param {Object} newConfig - New configuration
   * @param {string} [user='system'] - User making the change
   * @returns {{ success: boolean, errors?: string[] }}
   */
  updateConfig(newConfig, user = 'system') {
    // Validate first
    const validation = this.validateConfig(newConfig);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    // Save to history for rollback
    this.configHistory.push({
      config: { ...this.config },
      timestamp: new Date().toISOString(),
      user
    });

    // Trim history
    if (this.configHistory.length > this.maxHistorySize) {
      this.configHistory.shift();
    }

    // Update in-memory (instant)
    this.config = { ...newConfig };
    this.lastModified = new Date();

    // Persist async (non-blocking)
    this.saveConfigAsync();

    console.error(`[CouncilConfig] Config updated by ${user}`);
    return { success: true };
  }

  /**
   * Update a single topic's config
   */
  updateTopic(topic, backends, strategy = 'consensus', user = 'system') {
    if (!VALID_TOPICS.includes(topic)) {
      return { success: false, errors: [`Invalid topic: ${topic}`] };
    }

    const newConfig = { ...this.config };
    newConfig.topics = { ...newConfig.topics };
    newConfig.topics[topic] = { strategy, backends };

    return this.updateConfig(newConfig, user);
  }

  /**
   * Save config to file asynchronously
   */
  async saveConfigAsync() {
    try {
      // Atomic write: temp file then rename
      const tempPath = CONFIG_PATH + '.tmp';
      const content = JSON.stringify(this.config, null, 2);
      
      await fs.promises.writeFile(tempPath, content, 'utf-8');
      await fs.promises.rename(tempPath, CONFIG_PATH);
      
      console.error('[CouncilConfig] Config persisted to disk');
    } catch (error) {
      console.error('[CouncilConfig] Failed to persist config:', error.message);
    }
  }

  /**
   * Rollback to previous config
   */
  rollback() {
    if (this.configHistory.length === 0) {
      return { success: false, error: 'No history available for rollback' };
    }

    const previous = this.configHistory.pop();
    this.config = previous.config;
    this.lastModified = new Date();
    this.saveConfigAsync();

    console.error(`[CouncilConfig] Rolled back to config from ${previous.timestamp}`);
    return { success: true, rolledBackTo: previous.timestamp };
  }

  /**
   * Get config history
   */
  getHistory() {
    return this.configHistory.map(h => ({
      timestamp: h.timestamp,
      user: h.user
    }));
  }

  /**
   * Get config metadata
   */
  getMetadata() {
    return {
      version: this.config.version,
      lastModified: this.lastModified?.toISOString(),
      historyCount: this.configHistory.length,
      topicCount: Object.keys(this.config.topics).length
    };
  }
}

// Singleton instance
const configManager = new CouncilConfigManager();

export {
  CouncilConfigManager,
  configManager,
  VALID_BACKENDS,
  VALID_TOPICS,
  VALID_STRATEGIES,
  setBackendRegistry,
  getEffectiveBackends,
  getActiveBackends
};
