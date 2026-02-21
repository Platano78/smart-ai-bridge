/**
 * @fileoverview NvidiaAdapter - NVIDIA NIM API adapters
 * @module backends/nvidia-adapter
 *
 * Adapters for NVIDIA cloud backends:
 * - DeepSeek V3.2 (reasoning)
 * - Qwen3 Coder 480B (coding)
 *
 * Smart AI Bridge v2.0.0
 */

import { BackendAdapter } from './backend-adapter.js';

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

/**
 * Calculate dynamic timeout based on requested max_tokens
 * @param {number} maxTokens - Maximum tokens to generate
 * @param {boolean} thinking - Whether thinking/reasoning mode is enabled
 * @returns {number} Timeout in milliseconds
 */
function calculateDynamicTimeout(maxTokens, thinking = false) {
  const baseMs = maxTokens * 40;
  const withThinking = thinking ? baseMs * 1.5 : baseMs;
  return Math.min(Math.max(60000, withThinking), 600000);
}

/**
 * DeepSeek V3.2 adapter (reasoning model)
 */
class NvidiaDeepSeekAdapter extends BackendAdapter {
  constructor(config = {}) {
    super({
      name: 'nvidia_deepseek',
      type: 'nvidia',
      url: NVIDIA_BASE_URL,
      apiKey: config.apiKey || process.env.NVIDIA_API_KEY,
      maxTokens: config.maxTokens || 8192,
      timeout: config.timeout || 120000,
      streaming: true,
      ...config
    });

    this.model = 'deepseek-ai/deepseek-v3.1-terminus';
    this.fallbackModel = 'deepseek-ai/deepseek-v3.2';
  }

  async makeRequest(prompt, options = {}) {
    if (!this.config.apiKey) {
      throw new Error('NVIDIA_API_KEY not configured');
    }

    try {
      return await this._executeRequest(prompt, this.model, options);
    } catch (error) {
      const isTimeout = error.name === 'TimeoutError' || error.message.includes('timeout') || error.message.includes('aborted');
      const isServerError = error.message.includes('500') || error.message.includes('502') || error.message.includes('503') || error.message.includes('Internal Server Error');

      if (isTimeout || isServerError) {
        const reason = isTimeout ? 'timed out' : 'server error';
        console.error(`[SAB] DeepSeek V3.2 ${reason}, falling back to V3.1-terminus...`);
        return await this._executeRequest(prompt, this.fallbackModel, options, true);
      }
      throw error;
    }
  }

  async _executeRequest(prompt, model, options = {}, isFallback = false) {
    const isTerminus = model.includes('terminus');

    const body = {
      model: model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: options.maxTokens || this.config.maxTokens,
      temperature: isTerminus ? 0.2 : (options.temperature || 1),
      top_p: isTerminus ? 0.7 : 0.95,
      stream: false
    };

    if (options.thinking !== false) {
      body.extra_body = { chat_template_kwargs: { thinking: true } };
    }

    const requestedTokens = options.maxTokens || this.config.maxTokens;
    const baseTimeout = isFallback ? 60000 : calculateDynamicTimeout(requestedTokens, options.thinking);
    const timeout = options.timeout
      || (process.env.NVIDIA_TIMEOUT ? parseInt(process.env.NVIDIA_TIMEOUT) : null)
      || baseTimeout;

    const response = await fetch(this.config.url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`NVIDIA DeepSeek error (${model}): ${response.status} - ${error}`);
    }

    const data = await response.json();
    const result = this.parseResponse(data);

    result.metadata = result.metadata || {};
    result.metadata.model = model;
    result.metadata.wasFallback = isFallback;

    return result;
  }

  async checkHealth() {
    const startTime = Date.now();

    for (const model of [this.model, this.fallbackModel]) {
      try {
        const response = await fetch(this.config.url, {
          method: 'POST',
          headers: this.buildHeaders(),
          body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 5
          }),
          signal: AbortSignal.timeout(10000)
        });

        if (response.ok) {
          this.lastHealth = {
            healthy: true,
            latency: Date.now() - startTime,
            checkedAt: new Date(),
            error: null,
            activeModel: model
          };
          return this.lastHealth;
        }
      } catch (error) {
        continue;
      }
    }

    this.lastHealth = {
      healthy: false,
      latency: Date.now() - startTime,
      checkedAt: new Date(),
      error: 'Both V3.2 and V3.1-terminus unavailable'
    };
    return this.lastHealth;
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

    this.model = 'qwen/qwen3-coder-480b-a35b-instruct';
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
      top_p: options.top_p || 0.8,
      stream: false
    };

    const requestedTokens = options.maxTokens || this.config.maxTokens;
    const timeout = options.timeout
      || (process.env.NVIDIA_TIMEOUT ? parseInt(process.env.NVIDIA_TIMEOUT) : null)
      || calculateDynamicTimeout(requestedTokens, options.thinking);

    const response = await fetch(this.config.url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout)
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
        signal: AbortSignal.timeout(8000)
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
