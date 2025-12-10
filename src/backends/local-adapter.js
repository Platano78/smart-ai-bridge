/**
 * @fileoverview LocalAdapter - Local backend adapter with autodiscovery
 * @module backends/local-adapter
 *
 * Adapter for local llama-server inference with DYNAMIC model detection
 * Automatically discovers running model from /v1/models endpoint
 *
 * Ported autodiscovery from v1 EnhancedAIRouter
 */

import { BackendAdapter } from './backend-adapter.js';
import { LocalServiceDetector } from '../utils/local-service-detector.js';
import { inferCapabilitiesFromModelId, isOrchestratorModel } from '../utils/capability-matcher.js';
import {
  discoverModelOnPort,
  discoverAllModels,
  discoverSubagentCapableModels,
  findBestLocalModel,
  getModelSummary,
  clearCache as clearDiscoveryCache
} from '../utils/model-discovery.js';

class LocalAdapter extends BackendAdapter {
  /**
   * Create a LocalAdapter with autodiscovery support
   * @param {Object} [config] - Configuration overrides
   */
  constructor(config = {}) {
    super({
      name: 'local',
      type: 'local',
      url: null, // Will be set dynamically by autodiscovery
      maxTokens: config.maxTokens || 65536,
      timeout: config.timeout || 120000,
      streaming: false,
      ...config
    });

    // Model will be discovered dynamically from /v1/models
    this.model = config.model || null;
    this.modelId = null;  // The actual model ID from server
    this.detector = new LocalServiceDetector({
      ports: [8081, 8001, 8000, 1234, 5000],
      cacheTTL: 300000 // 5 minutes like v1
    });

    // Track initialization state
    this.initialized = false;
    this.initializing = false;

    // Start autodiscovery in background (like v1)
    this.initializeEndpoint();
  }

  /**
   * Initialize endpoint via autodiscovery (async, non-blocking like v1)
   * Also fetches model info dynamically from /v1/models
   */
  async initializeEndpoint() {
    if (this.initialized || this.initializing) return;

    this.initializing = true;

    try {
      console.error('🔍 LocalAdapter: Starting endpoint autodiscovery...');
      const endpoint = await this.detector.discover();

      if (endpoint) {
        this.config.url = endpoint;
        console.error(`✅ LocalAdapter: Endpoint discovered: ${endpoint}`);

        // Fetch model info dynamically
        await this.fetchModelInfo();
      } else {
        // Fallback to default (like v1)
        this.config.url = 'http://127.0.0.1:8001/v1/chat/completions';
        console.error(`⚠️ LocalAdapter: Using fallback endpoint: ${this.config.url}`);
      }
    } catch (error) {
      console.error(`❌ LocalAdapter: Autodiscovery failed: ${error.message}`);
      // Fallback to default (like v1)
      this.config.url = 'http://127.0.0.1:8001/v1/chat/completions';
    } finally {
      this.initializing = false;
      this.initialized = true;
    }
  }

  /**
   * Fetch model info from /v1/models endpoint
   * Sets this.model and this.modelId dynamically
   */
  async fetchModelInfo() {
    try {
      const modelsUrl = this.config.url.replace('/chat/completions', '/models');
      const response = await fetch(modelsUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        const data = await response.json();
        if (data.data && data.data.length > 0) {
          const modelInfo = data.data[0];
          this.modelId = modelInfo.id;
          this.model = modelInfo.id; // Use the actual model ID for requests
          console.error(`✅ LocalAdapter: Model detected: ${this.modelId}`);
        }
      }
    } catch (error) {
      console.error(`⚠️ LocalAdapter: Could not fetch model info: ${error.message}`);
      // Keep model as null, will use whatever server defaults to
    }
  }

  /**
   * Ensure endpoint is initialized before making requests
   */
  async ensureInitialized() {
    if (this.initialized) return;

    // Wait for initialization if in progress
    while (this.initializing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // If still not initialized, try again
    if (!this.initialized) {
      await this.initializeEndpoint();
    }
  }

  /**
   * Force re-discovery of endpoint (cache invalidation)
   * Also refreshes model info
   */
  async forceRediscovery() {
    console.error('🔄 LocalAdapter: Force rediscovery requested');
    this.detector.clearCache();
    this.initialized = false;
    this.config.url = null;
    this.model = null;
    this.modelId = null;
    await this.initializeEndpoint();
  }

  /**
   * Get current model info
   * @returns {Object} Model info including id and display name
   */
  getModelInfo() {
    return {
      id: this.modelId,
      model: this.model,
      endpoint: this.config.url,
      initialized: this.initialized,
      capabilities: this.getModelCapabilities()
    };
  }

  /**
   * Get capabilities based on currently detected model
   * Uses capability-matcher to infer from model ID
   * @returns {string[]} List of capability strings
   */
  getModelCapabilities() {
    return inferCapabilitiesFromModelId(this.modelId);
  }

  /**
   * Check if local model supports a specific capability
   * @param {string} capability - Required capability
   * @returns {boolean}
   */
  hasCapability(capability) {
    return this.getModelCapabilities().includes(capability);
  }

  /**
   * Check if this is an orchestrator model (not suitable for subagent work)
   * @returns {boolean}
   */
  isOrchestrator() {
    return isOrchestratorModel(this.modelId, this.config.url);
  }

  /**
   * Make request to local llama-server instance
   * @param {string} prompt - Prompt to send
   * @param {Object} [options] - Request options
   * @returns {Promise<Object>}
   */
  async makeRequest(prompt, options = {}) {
    await this.ensureInitialized();

    const body = {
      model: this.model || undefined, // Let server use default if not set
      messages: [{ role: 'user', content: prompt }],
      max_tokens: options.maxTokens || this.config.maxTokens,
      temperature: options.temperature || 0.7,
      stream: false
    };

    const response = await fetch(this.config.url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout)
    });

    if (!response.ok) {
      // If local fails, try rediscovery once
      if (!options._retried) {
        console.error('⚠️ LocalAdapter: Request failed, attempting rediscovery...');
        await this.forceRediscovery();
        return this.makeRequest(prompt, { ...options, _retried: true });
      }
      throw new Error(`Local backend error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return this.parseResponse(data);
  }

  /**
   * Check health of local backend
   * Also refreshes model info from /v1/models
   * @returns {Promise<Object>}
   */
  async checkHealth() {
    await this.ensureInitialized();

    const startTime = Date.now();

    try {
      // Use /v1/models for health check (like v1)
      const modelsUrl = this.config.url.replace('/chat/completions', '/models');

      const response = await fetch(modelsUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'MKG-v2-Health-Check/2.0.0'
        },
        signal: AbortSignal.timeout(3000)
      });

      const latency = Date.now() - startTime;
      const healthy = response.ok;

      // Update model info from response if healthy
      if (healthy) {
        try {
          const data = await response.json();
          if (data.data && data.data.length > 0) {
            const modelInfo = data.data[0];
            this.modelId = modelInfo.id;
            this.model = modelInfo.id;
          }
        } catch (e) {
          // Ignore parse errors, just use existing model info
        }
      }

      this.lastHealth = {
        healthy,
        latency,
        checkedAt: new Date(),
        url: this.config.url,
        model: this.modelId, // Include current model in health info
        error: healthy ? null : `Status ${response.status}`
      };

      // If unhealthy, try rediscovery
      if (!healthy) {
        console.error('⚠️ LocalAdapter: Health check failed, scheduling rediscovery...');
        setImmediate(() => this.forceRediscovery());
      }

      return this.lastHealth;
    } catch (error) {
      this.lastHealth = {
        healthy: false,
        latency: Date.now() - startTime,
        checkedAt: new Date(),
        url: this.config.url,
        model: this.modelId,
        error: error.message
      };

      // Schedule rediscovery on failure
      console.error('⚠️ LocalAdapter: Health check error, scheduling rediscovery...');
      setImmediate(() => this.forceRediscovery());

      return this.lastHealth;
    }
  }

  // ============================================================
  // NEW: Dynamic Model Discovery Methods (replaces hardcoded patterns)
  // ============================================================

  /**
   * Discover all running local models across all ports
   * Uses actual /props endpoint data instead of hardcoded patterns
   * @param {number[]} [ports] - Ports to scan
   * @returns {Promise<Object[]>} Array of discovered models with capabilities
   */
  async discoverAllModels(ports) {
    return discoverAllModels(ports);
  }

  /**
   * Discover models suitable for subagent work (excludes orchestrators)
   * @param {number[]} [ports] - Ports to scan
   * @returns {Promise<Object[]>}
   */
  async discoverSubagentCapableModels(ports) {
    return discoverSubagentCapableModels(ports);
  }

  /**
   * Find the best local model for a given task
   * @param {string[]} requiredCapabilities - Required capabilities
   * @param {Object} [options] - Options including contextSize
   * @returns {Promise<{model: Object|null, score: number, reason: string}>}
   */
  async findBestLocalModel(requiredCapabilities, options = {}) {
    return findBestLocalModel(requiredCapabilities, options);
  }

  /**
   * Get a summary of all discovered models for logging/debugging
   * @param {number[]} [ports] - Ports to scan
   * @returns {Promise<string>}
   */
  async getModelSummary(ports) {
    return getModelSummary(ports);
  }

  /**
   * Discover model on a specific port with full metadata
   * @param {number} port - Port to check
   * @returns {Promise<Object|null>} Model info with capabilities, or null
   */
  async discoverModelOnPort(port) {
    return discoverModelOnPort(port);
  }

  /**
   * Force refresh of all model discovery caches
   * Call this when you swap models and want immediate re-detection
   */
  clearDiscoveryCache() {
    clearDiscoveryCache();
    console.error('🔄 LocalAdapter: Discovery cache cleared');
  }

  /**
   * Get extended model info including live-discovered capabilities
   * Enhances getModelInfo with discovery data
   * @returns {Promise<Object>}
   */
  async getExtendedModelInfo() {
    await this.ensureInitialized();

    // Get port from current endpoint
    const portMatch = this.config.url?.match(/:(\d+)/);
    const port = portMatch ? parseInt(portMatch[1], 10) : 8081;

    // Get live discovery data for current model
    const liveModel = await discoverModelOnPort(port);

    return {
      // Basic info from this adapter
      id: this.modelId,
      model: this.model,
      endpoint: this.config.url,
      initialized: this.initialized,

      // Live discovery data (actual metadata from server)
      live: liveModel ? {
        nParams: liveModel.nParams,
        nCtxTrain: liveModel.nCtxTrain,
        nCtx: liveModel.nCtx,
        slots: liveModel.slots,
        capabilities: liveModel.capabilities,
        isOrchestrator: liveModel.isOrchestrator
      } : null,

      // Legacy pattern-based capabilities (for comparison)
      legacyCapabilities: this.getModelCapabilities()
    };
  }

  /**
   * Parse response from local llama-server
   * Override to include dynamically detected model ID
   * @protected
   * @param {Object} response - Raw response from llama-server
   * @returns {Object} Parsed response with metadata
   */
  parseResponse(response) {
    const content = response.choices?.[0]?.message?.content ||
                   response.content ||
                   response.text ||
                   '';

    const tokens = response.usage?.total_tokens ||
                  response.usage?.completion_tokens ||
                  0;

    return {
      content,
      tokens,
      backend: this.name,
      success: true,
      metadata: {
        // Use our detected modelId, fall back to response.model
        model: this.modelId || response.model || 'local',
        detectedModel: this.modelId,
        endpoint: this.config.url,
        finishReason: response.choices?.[0]?.finish_reason
      }
    };
  }
}

export { LocalAdapter };
