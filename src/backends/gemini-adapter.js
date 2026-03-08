/**
 * @fileoverview GeminiAdapter - Google Gemini backend adapter
 * @module backends/gemini-adapter
 *
 * Adapter for Google Gemini 3 Pro Preview
 * Includes proactive rate limiting with circuit breaker
 *
 * Smart AI Bridge v2.0.0
 */

import { BackendAdapter } from './backend-adapter.js';
import { GeminiRateLimiter } from '../utils/gemini-rate-limiter.js';

class GeminiAdapter extends BackendAdapter {
  constructor(config = {}) {
    super({
      name: 'gemini',
      type: 'gemini',
      url: config.url || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent',
      apiKey: config.apiKey || process.env.GEMINI_API_KEY,
      maxTokens: config.maxTokens || 32768,
      timeout: config.timeout || 60000,
      streaming: false,
      ...config
    });

    this.model = 'gemini-3-pro-preview';

    // Initialize rate limiter
    this.rateLimiter = new GeminiRateLimiter({
      rpmLimit: config.rpmLimit || 15,      // Free tier default
      rpdLimit: config.rpdLimit || 1500,    // Free tier default
      tpmLimit: config.tpmLimit || 1000000, // Free tier default
      threshold: config.rateThreshold || 0.8, // Open circuit at 80%
      enabled: config.enableRateLimiting !== false // Enabled by default
    });
  }

  async makeAPICall(body, errorPrefix = 'Gemini error') {
    const url = this.config.url;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.config.apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout)
    });

    if (!response.ok) {
      const error = await response.text();
      if (response.status === 429 || error.includes('quota')) {
        console.error('[GeminiAdapter] API rate limit hit');
        this.rateLimiter.metrics.limitReachedCount++;
      }
      throw new Error(`${errorPrefix}: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async checkHealth() {
    const startTime = Date.now();
    try {
      const body = this.getHealthCheckBody();
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.config.apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.getHealthCheckTimeout())
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

  async makeRequest(prompt, options = {}) {
    if (!this.config.apiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    // PROACTIVE RATE LIMITING: Check before making request
    const estimatedTokens = Math.ceil(prompt.length / 4); // Rough estimate
    const limitCheck = this.rateLimiter.checkLimit(estimatedTokens);

    if (!limitCheck.allowed) {
      // Sync with BackendAdapter circuit breaker
      this.circuitOpen = true;
      this.circuitOpenedAt = Date.now();

      console.error('[GeminiAdapter] Request blocked by rate limiter:', limitCheck.reason);
      console.error('[GeminiAdapter] Usage:', limitCheck.usage);

      throw new Error(`Gemini rate limit: ${limitCheck.reason}`);
    }

    const body = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        maxOutputTokens: options.maxTokens || this.config.maxTokens,
        temperature: options.temperature || 0.7
      }
    };

    const data = await this.makeAPICall(body, 'Gemini error');

    // Record successful request with actual token usage
    const tokensUsed = data.usageMetadata?.totalTokenCount || estimatedTokens;
    this.rateLimiter.recordRequest(tokensUsed);

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

  getHealthCheckBody() {
    return {
      contents: [{ parts: [{ text: 'ping' }] }],
      generationConfig: { maxOutputTokens: 5 }
    };
  }

  /**
   * Get rate limiter status
   * @returns {Object} Rate limiter metrics and usage
   */
  getRateLimiterStatus() {
    return {
      usage: this.rateLimiter.getUsage(),
      metrics: this.rateLimiter.getMetrics(),
      limits: this.rateLimiter.limits,
      enabled: this.rateLimiter.enabled
    };
  }

  /**
   * Override getMetrics to include rate limiter info
   * @returns {Object} Backend metrics including rate limiting
   */
  getMetrics() {
    const baseMetrics = super.getMetrics();

    return {
      ...baseMetrics,
      rateLimiter: this.getRateLimiterStatus()
    };
  }
}

export { GeminiAdapter };
