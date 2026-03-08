/**
 * @fileoverview GroqAdapter - Groq Llama backend adapter
 * @module backends/groq-adapter
 *
 * Adapter for Groq Llama 3.3 70B
 * Ultra-fast inference (500+ tokens/second)
 *
 * Smart AI Bridge v2.0.0
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

    const data = await this.makeAPICall(body, 'Groq error');
    return this.parseResponse(data);
  }

  getHealthCheckBody() {
    return {
      model: this.model,
      messages: [{ role: 'user', content: 'ok' }],
      max_tokens: 1,
      temperature: 0
    };
  }

  getHealthCheckTimeout() {
    return 3000;
  }
}

export { GroqAdapter };
