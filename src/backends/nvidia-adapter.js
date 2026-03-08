/**
 * @fileoverview NvidiaAdapter - NVIDIA NIM API adapters
 * @module backends/nvidia-adapter
 *
 * Adapters for NVIDIA cloud backends:
 * - NVIDIA DeepSeek (reasoning)
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
 * NVIDIA DeepSeek adapter (reasoning model)
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
      return await this._executeWithModel(prompt, this.model, options);
    } catch (error) {
      const isTimeout = error.name === 'TimeoutError' || error.message.includes('timeout') || error.message.includes('aborted');
      const isServerError = error.message.includes('500') || error.message.includes('502') || error.message.includes('503');

      if (isTimeout || isServerError) {
        const reason = isTimeout ? 'timed out' : 'server error';
        console.error(`[SAB] NVIDIA DeepSeek ${reason}, falling back to ${this.fallbackModel}...`);
        return await this._executeWithModel(prompt, this.fallbackModel, options, true);
      }
      throw error;
    }
  }

  async _executeWithModel(prompt, model, options = {}, isFallback = false) {
    const isTerminus = model.includes('terminus');

    const body = {
      model,
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

    // Temporarily override timeout for this call
    const origTimeout = this.config.timeout;
    this.config.timeout = timeout;
    try {
      const data = await this.makeAPICall(body, `NVIDIA DeepSeek error (${model})`);
      const result = this.parseResponse(data);
      result.metadata = result.metadata || {};
      result.metadata.model = model;
      result.metadata.wasFallback = isFallback;
      return result;
    } finally {
      this.config.timeout = origTimeout;
    }
  }

  getHealthCheckBody() {
    return {
      model: this.model,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 5
    };
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

    const originalTimeout = this.config.timeout;
    this.config.timeout = timeout;
    try {
      const data = await this.makeAPICall(body, 'NVIDIA Qwen error');
      return this.parseResponse(data);
    } finally {
      this.config.timeout = originalTimeout;
    }
  }

  getHealthCheckBody() {
    return {
      model: this.model,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 5
    };
  }
}

export {
  NvidiaDeepSeekAdapter,
  NvidiaQwenAdapter
};
