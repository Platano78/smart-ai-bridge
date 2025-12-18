/**
 * @fileoverview BackendAdapter - Abstract base class for AI backends
 * @module backends/backend-adapter
 *
 * Provides unified interface for all AI backend implementations
 * New backends extend this class and implement required methods
 */

/**
 * @typedef {Object} BackendConfig
 * @property {string} name - Backend identifier
 * @property {string} type - Backend type (local, cloud, nvidia, etc.)
 * @property {string} url - Backend API URL
 * @property {string} [apiKey] - API key if required
 * @property {number} [maxTokens] - Maximum token limit
 * @property {number} [timeout] - Request timeout in ms
 * @property {boolean} [streaming] - Whether streaming is supported
 * @property {Object} [headers] - Additional headers
 */

/**
 * @typedef {Object} BackendHealth
 * @property {boolean} healthy - Whether backend is healthy
 * @property {number} latency - Response latency in ms
 * @property {string} [error] - Error message if unhealthy
 * @property {Date} checkedAt - When health was checked
 */

/**
 * @typedef {Object} RequestOptions
 * @property {number} [maxTokens] - Maximum tokens for response
 * @property {number} [temperature] - Temperature for generation
 * @property {boolean} [thinking] - Enable thinking mode
 * @property {boolean} [stream] - Enable streaming
 * @property {string} [model] - Model override
 */

/**
 * @typedef {Object} BackendResponse
 * @property {string} content - Response content
 * @property {string} backend - Backend that processed request
 * @property {number} tokens - Token count
 * @property {number} latency - Response latency in ms
 * @property {boolean} success - Whether request succeeded
 * @property {Object} [metadata] - Additional metadata
 */

/**
 * Abstract base class for AI backend adapters
 * @abstract
 */
class BackendAdapter {
  /**
   * Create a new BackendAdapter
   * @param {BackendConfig} config - Backend configuration
   */
  constructor(config) {
    if (new.target === BackendAdapter) {
      throw new Error('BackendAdapter is abstract and cannot be instantiated directly');
    }

    /** @type {BackendConfig} */
    this.config = {
      timeout: 30000,
      maxTokens: 4096,
      streaming: false,
      ...config
    };

    /** @type {BackendHealth|null} */
    this.lastHealth = null;

    /** @type {Object} */
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalLatency: 0,
      averageLatency: 0
    };

    /** @type {boolean} */
    this.circuitOpen = false;

    /** @type {number} */
    this.consecutiveFailures = 0;

    /** @type {number} */
    this.circuitOpenThreshold = 5;

    /** @type {number} */
    this.circuitResetTimeout = 30000;

    /** @type {number|null} */
    this.circuitOpenedAt = null;
  }

  /**
   * Get backend name
   * @returns {string}
   */
  get name() {
    return this.config.name;
  }

  /**
   * Get backend type
   * @returns {string}
   */
  get type() {
    return this.config.type;
  }

  /**
   * Make a request to the backend
   * @abstract
   * @param {string} prompt - The prompt to send
   * @param {RequestOptions} [options] - Request options
   * @returns {Promise<BackendResponse>}
   */
  async makeRequest(prompt, options = {}) {
    throw new Error('makeRequest must be implemented by subclass');
  }

  /**
   * Check backend health
   * @abstract
   * @returns {Promise<BackendHealth>}
   */
  async checkHealth() {
    throw new Error('checkHealth must be implemented by subclass');
  }

  /**
   * Get backend configuration
   * @returns {BackendConfig}
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Check if backend is available (healthy and circuit closed)
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    // Check circuit breaker
    if (this.circuitOpen) {
      // Check if we should try to reset
      if (Date.now() - this.circuitOpenedAt > this.circuitResetTimeout) {
        this.circuitOpen = false;
        this.consecutiveFailures = 0;
        console.log(`[${this.name}] Circuit breaker reset, attempting recovery`);
      } else {
        return false;
      }
    }

    try {
      const health = await this.checkHealth();
      return health.healthy;
    } catch (error) {
      return false;
    }
  }

  /**
   * Execute request with circuit breaker protection
   * @param {string} prompt - The prompt to send
   * @param {RequestOptions} [options] - Request options
   * @returns {Promise<BackendResponse>}
   */
  async execute(prompt, options = {}) {
    // Check circuit breaker
    if (this.circuitOpen) {
      if (Date.now() - this.circuitOpenedAt > this.circuitResetTimeout) {
        this.circuitOpen = false;
        this.consecutiveFailures = 0;
        console.log(`[${this.name}] Circuit breaker reset, attempting request`);
      } else {
        throw new Error(`Circuit breaker open for ${this.name}`);
      }
    }

    const startTime = Date.now();
    this.metrics.totalRequests++;

    try {
      const response = await this.makeRequest(prompt, options);
      const latency = Date.now() - startTime;

      // Update metrics on success
      this.metrics.successfulRequests++;
      this.metrics.totalLatency += latency;
      this.metrics.averageLatency = this.metrics.totalLatency / this.metrics.successfulRequests;
      this.consecutiveFailures = 0;

      return {
        ...response,
        latency,
        backend: this.name,
        success: true
      };
    } catch (error) {
      this.metrics.failedRequests++;
      this.consecutiveFailures++;

      // Open circuit breaker if threshold exceeded
      if (this.consecutiveFailures >= this.circuitOpenThreshold) {
        this.circuitOpen = true;
        this.circuitOpenedAt = Date.now();
        console.error(`[${this.name}] Circuit breaker opened after ${this.consecutiveFailures} failures`);
      }

      throw error;
    }
  }

  /**
   * Get backend metrics
   * @returns {Object}
   */
  getMetrics() {
    return {
      ...this.metrics,
      circuitOpen: this.circuitOpen,
      consecutiveFailures: this.consecutiveFailures,
      lastHealth: this.lastHealth
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalLatency: 0,
      averageLatency: 0
    };
  }

  /**
   * Force close circuit breaker (for testing/recovery)
   */
  closeCircuit() {
    this.circuitOpen = false;
    this.consecutiveFailures = 0;
    this.circuitOpenedAt = null;
  }

  /**
   * Force open circuit breaker (for maintenance)
   */
  openCircuit() {
    this.circuitOpen = true;
    this.circuitOpenedAt = Date.now();
  }

  /**
   * Build request headers
   * @protected
   * @returns {Object}
   */
  buildHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      ...this.config.headers
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }

  /**
   * Build request body
   * @protected
   * @param {string} prompt - The prompt
   * @param {RequestOptions} options - Request options
   * @returns {Object}
   */
  buildRequestBody(prompt, options) {
    return {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: options.maxTokens || this.config.maxTokens,
      temperature: options.temperature || 0.7,
      stream: options.stream || this.config.streaming
    };
  }

  /**
   * Parse response from backend
   * @protected
   * @param {Object} response - Raw response
   * @returns {BackendResponse}
   */
  parseResponse(response) {
    // Default implementation - subclasses may override
    // Handle reasoning models that return reasoning_content instead of/with content
    const message = response.choices?.[0]?.message;
    const content = message?.content ||
                   message?.reasoning_content ||
                   response.content ||
                   response.text ||
                   '';

    const tokens = response.usage?.total_tokens ||
                  response.usage?.completion_tokens ||
                  0;

    return {
      content,
      tokens,
      backend: this.name,
      success: true,
      metadata: {
        model: response.model,
        finishReason: response.choices?.[0]?.finish_reason
      }
    };
  }
}

export { BackendAdapter };
