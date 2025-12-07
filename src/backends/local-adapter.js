/**
 * @fileoverview LocalAdapter - Local Qwen backend adapter
 * @module backends/local-adapter
 *
 * Adapter for local Qwen2.5-Coder-7B-Instruct inference
 * 128K+ token context, FP8 quantized for RTX 5080
 */

import { BackendAdapter } from './backend-adapter.js';

class LocalAdapter extends BackendAdapter {
  /**
   * Create a LocalAdapter
   * @param {Object} [config] - Configuration overrides
   */
  constructor(config = {}) {
    super({
      name: 'local',
      type: 'local',
      url: config.url || process.env.QWEN_LOCAL_URL || 'http://localhost:8001/v1/chat/completions',
      maxTokens: config.maxTokens || 65536,
      timeout: config.timeout || 120000,
      streaming: false,
      ...config
    });

    this.model = config.model || 'Qwen/Qwen2.5-Coder-7B-Instruct';
  }

  /**
   * Make request to local Qwen instance
   * @param {string} prompt - Prompt to send
   * @param {Object} [options] - Request options
   * @returns {Promise<Object>}
   */
  async makeRequest(prompt, options = {}) {
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
    const startTime = Date.now();

    try {
      // Quick inference test
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: 'Say "healthy"' }],
          max_tokens: 10
        }),
        signal: AbortSignal.timeout(10000)
      });

      const latency = Date.now() - startTime;
      const healthy = response.ok;

      this.lastHealth = {
        healthy,
        latency,
        checkedAt: new Date(),
        error: healthy ? null : `Status ${response.status}`
      };

      return this.lastHealth;
    } catch (error) {
      this.lastHealth = {
        healthy: false,
        latency: Date.now() - startTime,
        checkedAt: new Date(),
        error: error.message
      };
      return this.lastHealth;
    }
  }
}

export { LocalAdapter };
