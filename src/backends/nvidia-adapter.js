/**
 * @fileoverview NvidiaAdapter - NVIDIA NIM API adapters
 * @module backends/nvidia-adapter
 *
 * Adapters for NVIDIA cloud backends:
 * - DeepSeek V3.1 Terminus (reasoning)
 * - Qwen3 Coder 480B (coding)
 */

import { BackendAdapter } from './backend-adapter.js';

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

/**
 * DeepSeek V3.1 Terminus adapter
 */
class NvidiaDeepSeekAdapter extends BackendAdapter {
  constructor(config = {}) {
    super({
      name: 'nvidia_deepseek',
      type: 'nvidia',
      url: NVIDIA_BASE_URL,
      apiKey: config.apiKey || process.env.NVIDIA_API_KEY,
      maxTokens: config.maxTokens || 8192,
      timeout: config.timeout || 60000,
      streaming: true,
      ...config
    });

    this.model = 'deepseek-ai/deepseek-r1';
  }

  async makeRequest(prompt, options = {}) {
    if (!this.config.apiKey) {
      throw new Error('NVIDIA_API_KEY not configured');
    }

    const body = {
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: options.maxTokens || this.config.maxTokens,
      temperature: options.temperature || 0.6,
      stream: false
    };

    // Add thinking mode if requested
    if (options.thinking) {
      body.reasoning = true;
    }

    const response = await fetch(this.config.url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`NVIDIA DeepSeek error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return this.parseResponse(data);
  }

  async checkHealth() {
    const startTime = Date.now();

    try {
      // Quick connectivity check (3s timeout for cloud)
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5
        }),
        signal: AbortSignal.timeout(3000)
      });

      this.lastHealth = {
        healthy: response.ok,
        latency: Date.now() - startTime,
        checkedAt: new Date(),
        error: response.ok ? null : `Status ${response.status}`
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

/**
 * Qwen3 Coder 480B adapter
 */
class NvidiaQwenAdapter extends BackendAdapter {
  constructor(config = {}) {
    super({
      name: 'nvidia_qwen',
      type: 'nvidia',
      url: NVIDIA_BASE_URL,
      apiKey: config.apiKey || process.env.NVIDIA_API_KEY,
      maxTokens: config.maxTokens || 32768,
      timeout: config.timeout || 60000,
      streaming: false,
      ...config
    });

    this.model = 'qwen/qwen3-235b-a22b';
  }

  async makeRequest(prompt, options = {}) {
    if (!this.config.apiKey) {
      throw new Error('NVIDIA_API_KEY not configured');
    }

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
      const error = await response.text();
      throw new Error(`NVIDIA Qwen error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return this.parseResponse(data);
  }

  async checkHealth() {
    const startTime = Date.now();

    try {
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5
        }),
        signal: AbortSignal.timeout(3000)
      });

      this.lastHealth = {
        healthy: response.ok,
        latency: Date.now() - startTime,
        checkedAt: new Date(),
        error: response.ok ? null : `Status ${response.status}`
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

export {
  NvidiaDeepSeekAdapter,
  NvidiaQwenAdapter
};
