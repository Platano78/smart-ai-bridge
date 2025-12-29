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
 * @returns {number} Timeout in milliseconds
 */
function calculateDynamicTimeout(maxTokens, thinking = false) {
  // ~15ms per token (NVIDIA generates ~50-100 t/s)
  // Thinking mode adds 2x multiplier for reasoning overhead
  const baseMs = maxTokens * 15;
  const withThinking = thinking ? baseMs * 2 : baseMs;
  // min 30s, max 5min
  return Math.min(Math.max(30000, withThinking), 300000);
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

    this.model = 'deepseek-ai/deepseek-v3.2';
  }

  async makeRequest(prompt, options = {}) {
    if (!this.config.apiKey) {
      throw new Error('NVIDIA_API_KEY not configured');
    }

    const body = {
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: options.maxTokens || this.config.maxTokens,
      temperature: options.temperature || 1,
      top_p: 0.95,
      stream: false
    };

    // Add thinking mode if requested (V3.2 format)
    if (options.thinking) {
      body.extra_body = { chat_template_kwargs: { thinking: true } };
    }

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
      throw new Error(`NVIDIA DeepSeek error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return this.parseResponse(data);
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
