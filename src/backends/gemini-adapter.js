/**
 * @fileoverview GeminiAdapter - Google Gemini backend adapter
 * @module backends/gemini-adapter
 *
 * Adapter for Google Gemini 2.5 Flash
 * Uses the Gemini Enhanced MCP server for integration
 */

import { BackendAdapter } from './backend-adapter.js';

class GeminiAdapter extends BackendAdapter {
  constructor(config = {}) {
    super({
      name: 'gemini',
      type: 'gemini',
      url: config.url || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      apiKey: config.apiKey || process.env.GEMINI_API_KEY,
      maxTokens: config.maxTokens || 32768,
      timeout: config.timeout || 60000,
      streaming: false,
      ...config
    });

    this.model = 'gemini-2.5-flash';
  }

  async makeRequest(prompt, options = {}) {
    if (!this.config.apiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const url = `${this.config.url}?key=${this.config.apiKey}`;

    const body = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        maxOutputTokens: options.maxTokens || this.config.maxTokens,
        temperature: options.temperature || 0.7
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return this.parseGeminiResponse(data);
  }

  /**
   * Parse Gemini-specific response format
   * @private
   */
  parseGeminiResponse(response) {
    const content = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const tokens = response.usageMetadata?.totalTokenCount || 0;

    return {
      content,
      tokens,
      backend: this.name,
      success: true,
      metadata: {
        model: this.model,
        finishReason: response.candidates?.[0]?.finishReason,
        safetyRatings: response.candidates?.[0]?.safetyRatings
      }
    };
  }

  async checkHealth() {
    const startTime = Date.now();

    try {
      const url = `${this.config.url}?key=${this.config.apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'ping' }] }],
          generationConfig: { maxOutputTokens: 5 }
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

export { GeminiAdapter };
