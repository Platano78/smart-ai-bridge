/**
 * @fileoverview OpenAIAdapter - OpenAI GPT backend adapter
 * @module backends/openai-adapter
 *
 * Adapter for OpenAI GPT-5.2 (premium reasoning)
 * 128K context window
 *
 * Smart AI Bridge v2.0.0
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

    this.model = config.model || 'gpt-5.2';
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
      const errorDetails = {
        statusCode: response.status,
        message: error,
        url: this.config.url,
        model: this.model,
        suggestions: this.getErrorSuggestions(response.status)
      };

      let enhancedError = `Backend Error: ${response.status} - ${error}\n\n`;
      enhancedError += `Possible causes:\n`;
      enhancedError += errorDetails.suggestions.map(s => `- ${s}`).join('\n');

      throw new Error(enhancedError);
    }

    const data = await response.json();
    return this.parseResponse(data);
  }

  getErrorSuggestions(statusCode) {
    const suggestions = [];

    if (statusCode === 404) {
      suggestions.push(`Verify URL ends with /v1/chat/completions (current: ${this.config.url})`);
      suggestions.push(`Check if model "${this.model}" is available at this endpoint`);
      suggestions.push('Use "Browse Models" feature to see available models');
    }

    if (statusCode === 401 || statusCode === 403) {
      suggestions.push('Check if API key is valid and not expired');
      suggestions.push('Verify API key has access to this model');
      suggestions.push('Ensure environment variable is set correctly if using $ENV_VAR syntax');
    }

    if (statusCode === 429) {
      suggestions.push('Rate limit exceeded - wait a moment and try again');
      suggestions.push('Consider increasing retry delay or reducing request frequency');
    }

    if (statusCode >= 500) {
      suggestions.push('API server may be experiencing issues');
      suggestions.push('Try again in a few minutes');
      suggestions.push('Check API status page if available');
    }

    if (suggestions.length === 0) {
      suggestions.push('Check the error message above for details');
      suggestions.push('Verify all configuration settings are correct');
    }

    return suggestions;
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
