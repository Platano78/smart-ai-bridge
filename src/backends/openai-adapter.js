/**
 * @fileoverview OpenAIAdapter - OpenAI GPT backend adapter
 * @module backends/openai-adapter
 *
 * Adapter for OpenAI GPT-4.1 (premium reasoning)
 * 128K context window
 */

import { BackendAdapter } from './backend-adapter.js';

class OpenAIAdapter extends BackendAdapter {
  constructor(config = {}) {
    super({
      name: 'openai_chatgpt',
      type: 'openai',
      url: config.url || 'https://api.openai.com/v1/chat/completions',
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
      maxTokens: config.maxTokens || 128000,
      timeout: config.timeout || 120000,
      streaming: false,
      ...config
    });

    this.model = config.model || 'gpt-4.1-2025-04-14';
  }

  async makeRequest(prompt, options = {}) {
    if (!this.config.apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const body = {
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature || 0.7
    };

    const response = await fetch(this.config.url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI error: ${response.status} - ${error}`);
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

export { OpenAIAdapter };
