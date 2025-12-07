/**
 * @fileoverview LocalAdapter - Local Qwen backend adapter with autodiscovery
 * @module backends/local-adapter
 *
 * Adapter for local Qwen2.5-Coder-7B-Instruct inference
 * 128K+ token context, FP8 quantized for RTX 5080
 *
 * Ported autodiscovery from v1 EnhancedAIRouter
 */

import { BackendAdapter } from './backend-adapter.js';
import { LocalServiceDetector } from '../utils/local-service-detector.js';

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

    this.model = config.model || 'Qwen/Qwen2.5-Coder-7B-Instruct';
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
   */
  async initializeEndpoint() {
    if (this.initialized || this.initializing) return;

    this.initializing = true;

    try {
      console.error('🔍 LocalAdapter: Starting endpoint autodiscovery...');
      const endpoint = await this.detector.discover();

      if (endpoint) {
        this.config.url = endpoint;
        this.initialized = true;
        console.error(`✅ LocalAdapter: Endpoint discovered: ${endpoint}`);
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
   */
  async forceRediscovery() {
    console.error('🔄 LocalAdapter: Force rediscovery requested');
    this.detector.clearCache();
    this.initialized = false;
    this.config.url = null;
    await this.initializeEndpoint();
  }

  /**
   * Make request to local Qwen instance
   * @param {string} prompt - Prompt to send
   * @param {Object} [options] - Request options
   * @returns {Promise<Object>}
   */
  async makeRequest(prompt, options = {}) {
    await this.ensureInitialized();

    const body = {
      model: this.model,
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

      this.lastHealth = {
        healthy,
        latency,
        checkedAt: new Date(),
        url: this.config.url,
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
        error: error.message
      };

      // Schedule rediscovery on failure
      console.error('⚠️ LocalAdapter: Health check error, scheduling rediscovery...');
      setImmediate(() => this.forceRediscovery());

      return this.lastHealth;
    }
  }
}

export { LocalAdapter };
