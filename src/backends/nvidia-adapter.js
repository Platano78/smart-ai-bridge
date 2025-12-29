/**
 * @fileoverview NvidiaAdapter - NVIDIA NIM API adapters
 * @module backends/nvidia-adapter
 *
 * Adapters for NVIDIA cloud backends:
 * - DeepSeek V3.2 (reasoning)
 * - Qwen3 Coder 480B (coding)
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
  // NVIDIA cloud models (480B-685B params) are slower than local inference
  // Realistic: ~30-50ms per token including queue time + cold start
  // For 8000 tokens: 8000 * 40 = 320s = ~5.3 min
  const baseMs = maxTokens * 40;
  // Thinking mode (DeepSeek V3.2) adds reasoning overhead
  const withThinking = thinking ? baseMs * 1.5 : baseMs;
  // min 60s, max 10min (NVIDIA large models can queue)
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
      timeout: config.timeout || 120000, // Longer timeout for reasoning model
      streaming: true,
      ...config
    });

    // Primary: DeepSeek V3.2, Fallback: V3.1-terminus
    this.model = 'deepseek-ai/deepseek-v3.2';
    this.fallbackModel = 'deepseek-ai/deepseek-v3.1-terminus';
  }

  async makeRequest(prompt, options = {}) {
    if (!this.config.apiKey) {
      throw new Error('NVIDIA_API_KEY not configured');
    }

    // Try V3.2 first, fallback to V3.1-terminus on timeout
    try {
      return await this._executeRequest(prompt, this.model, options);
    } catch (error) {
      if (error.name === 'TimeoutError' || error.message.includes('timeout') || error.message.includes('aborted')) {
        console.error(`⚠️ DeepSeek V3.2 timed out, falling back to V3.1-terminus...`);
        return await this._executeRequest(prompt, this.fallbackModel, options, true);
      }
      throw error;
    }
  }

  async _executeRequest(prompt, model, options = {}, isFallback = false) {
    // V3.1-terminus uses different params (from NVIDIA docs)
    const isTerminus = model.includes('terminus');

    const body = {
      model: model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: options.maxTokens || this.config.maxTokens,
      temperature: isTerminus ? 0.2 : (options.temperature || 1),
      top_p: isTerminus ? 0.7 : 0.95,
      stream: false
    };

    // Add thinking mode (both V3.2 and V3.1-terminus support it)
    if (options.thinking !== false) {
      body.extra_body = { chat_template_kwargs: { thinking: true } };
    }

    // Dynamic timeout - shorter for fallback since V3.1-terminus is faster
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

    // Add metadata about which model was used
    result.metadata = result.metadata || {};
    result.metadata.model = model;
    result.metadata.wasFallback = isFallback;

    return result;
  }

  async checkHealth() {
    const startTime = Date.now();

    try {
      // DeepSeek V3.2 is a reasoning model - needs longer timeout (10s)
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5
        }),
        signal: AbortSignal.timeout(10000)
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

    // Qwen3 Coder 480B - coding-optimized model (not the base qwen3-235b)
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
      top_p: options.top_p || 0.8,  // NVIDIA recommended for Qwen3 Coder
      stream: false
    };

    // Dynamic timeout: options > env var > dynamic calculation
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
      // Qwen3 Coder 480B is a large model - needs longer timeout (8s)
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


/**
 * NVIDIA MiniMax M2 Adapter
 * Reasoning model with <think> blocks
 */
class NvidiaMiniMaxAdapter extends BackendAdapter {
  constructor(config = {}) {
    super({
      name: 'nvidia_minimax',
      type: 'nvidia',
      url: NVIDIA_BASE_URL,
      apiKey: config.apiKey || process.env.NVIDIA_API_KEY,
      maxTokens: config.maxTokens || 8192,
      timeout: config.timeout || 120000, // Longer timeout for reasoning
      streaming: true,
      ...config
    });

    this.model = 'minimaxai/minimax-m2';
  }

  async makeRequest(prompt, options = {}) {
    if (!this.config.apiKey) {
      throw new Error('NVIDIA_API_KEY not configured for MiniMax');
    }

    const body = {
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: options.maxTokens || this.config.maxTokens,
      temperature: options.temperature ?? 0.7,
      top_p: 0.95,
      stream: false
    };

    // Dynamic timeout for reasoning model
    const requestedTokens = options.maxTokens || this.config.maxTokens;
    const timeout = options.timeout
      || (process.env.NVIDIA_TIMEOUT ? parseInt(process.env.NVIDIA_TIMEOUT) : null)
      || calculateDynamicTimeout(requestedTokens, true); // Always use thinking multiplier

    const response = await fetch(this.config.url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`NVIDIA MiniMax error: ${response.status} - ${error}`);
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
        signal: AbortSignal.timeout(5000) // Slightly longer for reasoning model
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
 * NVIDIA Nemotron 3 Nano Adapter - 1M context window
 * Model: nemotron-3-nano-30b-a3b (Hybrid Mamba-Transformer MoE)
 */
class NvidiaNemotronAdapter extends BackendAdapter {
  constructor(config = {}) {
    super({
      name: 'nvidia_nemotron',
      type: 'nvidia',
      url: NVIDIA_BASE_URL,
      apiKey: config.apiKey || process.env.NVIDIA_API_KEY,
      maxTokens: config.maxTokens || 32768, // Can go much higher with 1M context
      timeout: config.timeout || 180000, // 3 min for large context
      streaming: true,
      ...config
    });

    this.model = 'nvidia/nemotron-3-nano-30b-a3b';
  }

  async makeRequest(prompt, options = {}) {
    if (!this.config.apiKey) {
      throw new Error('NVIDIA_API_KEY not configured for Nemotron');
    }

    const body = {
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: options.maxTokens || this.config.maxTokens,
      temperature: options.temperature ?? 0.7,
      top_p: 0.95,
      stream: false
    };

    // Dynamic timeout for large context
    const requestedTokens = options.maxTokens || this.config.maxTokens;
    const timeout = options.timeout
      || (process.env.NVIDIA_TIMEOUT ? parseInt(process.env.NVIDIA_TIMEOUT) : null)
      || calculateDynamicTimeout(requestedTokens, true);

    const response = await fetch(this.config.url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`NVIDIA Nemotron error: ${response.status} - ${error}`);
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
        signal: AbortSignal.timeout(5000)
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
  NvidiaQwenAdapter,
  NvidiaMiniMaxAdapter,
  NvidiaNemotronAdapter
};
