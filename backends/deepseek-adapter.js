/**
 * @fileoverview DeepSeekAdapter - NVIDIA DeepSeek V3.1 Terminus
 * @module backends/deepseek-adapter
 *
 * Wraps Smart AI Bridge's existing NVIDIA DeepSeek backend.
 * Created for Smart AI Bridge v1.3.0
 */

import { BackendAdapter } from './backend-adapter.js';

class DeepSeekAdapter extends BackendAdapter {
  /**
   * Create a DeepSeekAdapter
   * @param {Object} [config] - Configuration overrides
   */
  constructor(config = {}) {
    super({
      name: 'deepseek',
      type: 'deepseek',
      url: 'https://integrate.api.nvidia.com/v1',
      apiKey: process.env.NVIDIA_API_KEY,
      maxTokens: config.maxTokens || 8192,
      timeout: config.timeout || 60000,
      streaming: true,
      ...config
    });

    this.model = config.model || 'deepseek/deepseek-r1';
  }

  /**
   * Make request to NVIDIA DeepSeek
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
      stream: options.stream || false
    };

    try {
      const response = await fetch(`${this.config.url}/chat/completions`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.config.timeout)
      });

      if (!response.ok) {
        throw new Error(`DeepSeek backend error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return this.parseResponse(data);
    } catch (error) {
      throw new Error(`DeepSeek backend request failed: ${error.message}`);
    }
  }

  /**
   * Check health of NVIDIA DeepSeek backend
   * @returns {Promise<Object>}
   */
  async checkHealth() {
    const startTime = Date.now();
    try {
      const response = await fetch(`${this.config.url}/models`, {
        method: 'GET',
        headers: this.buildHeaders(),
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

export { DeepSeekAdapter };
