/**
 * @fileoverview GroqAdapter - Groq Llama backend adapter
 * @module backends/groq-adapter
 *
 * Adapter for Groq Llama 3.3 70B
 * Ultra-fast inference (500+ tokens/second)
 */

import { BackendAdapter } from './backend-adapter.js';

class GroqAdapter extends BackendAdapter {
  constructor(config = {}) {
    super({
      name: 'groq_llama',
      type: 'groq',
      url: config.url || 'https://api.groq.com/openai/v1/chat/completions',
      apiKey: config.apiKey || process.env.GROQ_API_KEY,
      maxTokens: config.maxTokens || 32768,
      timeout: config.timeout || 30000, // Groq is fast
      streaming: false,
      ...config
    });

    this.model = config.model || 'llama-3.3-70b-versatile';
  }

  async makeRequest(prompt, options = {}) {
    if (!this.config.apiKey) {
      throw new Error('GROQ_API_KEY not configured');
    }

    const body = {
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: options.maxTokens || this.config.maxTokens,
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
      throw new Error(`Groq error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return this.parseResponse(data);
  }

  async checkHealth() {
    const startTime = Date.now();

    try {
      // Lightweight health probe: minimal token usage (1-2 tokens)
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: 'ok' }], // 1 token instead of "ping" (4 tokens)
          max_tokens: 1, // Minimal response
          temperature: 0
        }),
        signal: AbortSignal.timeout(3000) // Quick 3s timeout for health checks
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

export { GroqAdapter };
