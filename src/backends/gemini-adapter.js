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

      // Check if it's a rate limit error from API
      if (response.status === 429 || error.includes('quota')) {
        console.error('[GeminiAdapter] API rate limit hit (should have been prevented by limiter)');
        this.rateLimiter.metrics.limitReachedCount++;
      }

      throw new Error(`Gemini error: ${response.status} - ${error}`);
    }

    const data = await response.json();

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

  async checkHealth() {
    const startTime = Date.now();

    try {
      // Check rate limiter first
      const limitCheck = this.rateLimiter.checkLimit(10); // Health check uses ~10 tokens

      if (!limitCheck.allowed) {
        this.lastHealth = {
          healthy: false,
          latency: 0,
          checkedAt: new Date(),
          error: `Rate limited: ${limitCheck.reason}`,
          rateLimiter: limitCheck.usage
        };
        return this.lastHealth;
      }

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

      // Record health check request
      if (response.ok) {
        this.rateLimiter.recordRequest(10);
      }

      this.lastHealth = {
        healthy: response.ok,
        latency: Date.now() - startTime,
        checkedAt: new Date(),
        error: response.ok ? null : `Status ${response.status}`,
        rateLimiter: this.rateLimiter.getUsage()
      };

      return this.lastHealth;
    } catch (error) {
      this.lastHealth = {
        healthy: false,
        latency: Date.now() - startTime,
        checkedAt: new Date(),
        error: error.message,
        rateLimiter: this.rateLimiter.getUsage()
      };
      return this.lastHealth;
    }
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
