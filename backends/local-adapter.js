/**
 * @fileoverview LocalAdapter - Qwen2.5-Coder-7B via vLLM
 * @module backends/local-adapter
 *
 * Wraps Smart AI Bridge's existing local backend implementation.
 * Created for Smart AI Bridge v1.3.0
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
      url: process.env.VLLM_ENDPOINT || 'http://127.0.0.1:4141',
      maxTokens: config.maxTokens || 65536,
      timeout: config.timeout || 120000,
      streaming: false,
      ...config
    });

    this.model = config.model || 'Qwen/Qwen2.5-Coder-7B-Instruct';
  }

  /**
   * Make request to local vLLM endpoint
   * @param {string} prompt - The prompt to send
   * @param {Object} [options] - Request options
   * @returns {Promise<Object>}
   */
  async makeRequest(prompt, options = {}) {
    const requestBody = {
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: options.maxTokens || this.config.maxTokens,
      temperature: options.temperature || 0.7,
      stream: false
    };

    try {
      const response = await fetch(`${this.config.url}/v1/chat/completions`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.config.timeout)
      });

      if (!response.ok) {
        throw new Error(`Local backend error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return this.parseResponse(data);
    } catch (error) {
      throw new Error(`Local backend request failed: ${error.message}`);
    }
  }

  /**
   * Check health of local backend
   * @returns {Promise<Object>}
   */
  async checkHealth() {
    const startTime = Date.now();
    try {
      const response = await fetch(`${this.config.url}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      const healthy = response.ok;
      const latency = Date.now() - startTime;

      this.lastHealth = {
        healthy,
        latency,
        checkedAt: new Date()
      };

      return this.lastHealth;
    } catch (error) {
      this.lastHealth = {
        healthy: false,
        latency: Date.now() - startTime,
        error: error.message,
        checkedAt: new Date()
      };
      return this.lastHealth;
    }
  }
}

export { LocalAdapter };
