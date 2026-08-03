/**
 * @fileoverview NvidiaAdapter - NVIDIA NIM API adapters
 * @module backends/nvidia-adapter
 *
 * Adapters for NVIDIA cloud backends:
 * - NVIDIA DeepSeek (reasoning)
 * - GLM-5.2 (coding) — the lane formerly served Qwen3 Coder 480B, which NVIDIA
 *   retired on 2026-06-11
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

    // config.model (from backends.json) is authoritative — the literal is only a
    // default for callers that construct the adapter directly. Hardcoding here
    // previously made backends.json inert, so a retired model could not be fixed
    // from config.
    this.model = config.model || 'deepseek-ai/deepseek-v4-pro';
    this.fallbackModel = config.fallbackModel || null;

    // Whether this.model's NIM endpoint accepts extra_body.chat_template_kwargs.thinking.
    // Only the terminus family did; deepseek-v4-pro rejects it with HTTP 400. Resolved
    // from config so a future model that supports it needs no code change.
    this.supportsThinkingParam = config.supportsThinkingParam ?? this.model.includes('terminus');
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

      if ((isTimeout || isServerError) && this.fallbackModel) {
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

    // extra_body.chat_template_kwargs.thinking is only accepted by the terminus-family
    // NIM endpoint; deepseek-v4-pro rejects unknown params with HTTP 400. this.model's
    // capability is config-resolved (supportsThinkingParam); the fallback model has no
    // config binding of its own, so it keeps the substring heuristic.
    const supportsThinking = model === this.model ? this.supportsThinkingParam : isTerminus;
    if (supportsThinking && options.thinking !== false) {
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
 * NVIDIA GLM adapter (code-specialist lane). Canonical key is `nvidia_glm`;
 * `nvidia_qwen` and `qwen3` remain as back-compat aliases (see
 * FRIENDLY_NAME_MAP / ADAPTER_CLASSES in backend-registry.js) since the lane
 * served Qwen3 Coder 480B until NVIDIA retired it on 2026-06-11.
 */
class NvidiaGlmAdapter extends BackendAdapter {
  constructor(config = {}) {
    super({
      name: 'nvidia_glm',
      type: 'nvidia',
      url: NVIDIA_BASE_URL,
      apiKey: config.apiKey || process.env.NVIDIA_API_KEY,
      maxTokens: config.maxTokens || 32768,
      timeout: config.timeout || 60000,
      streaming: false,
      ...config
    });

    this.model = config.model || 'z-ai/glm-5.2';
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
  NvidiaGlmAdapter
};
