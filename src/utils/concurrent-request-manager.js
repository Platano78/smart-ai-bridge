/**
 * @fileoverview ConcurrentRequestManager - Priority-based request pool
 * @module utils/concurrent-request-manager
 *
 * RTX 5080 optimized with 250 concurrent request capacity
 */

/**
 * @typedef {Object} RequestMetrics
 * @property {number} totalRequests - Total requests processed
 * @property {number} completedRequests - Successfully completed requests
 * @property {number} averageResponseTime - Average response time in ms
 * @property {number} peakConcurrency - Maximum concurrent requests observed
 * @property {number} queueWaitTime - Average queue wait time in ms
 * @property {number} throughputPerSecond - Requests per second
 */

/**
 * @typedef {Object} Request
 * @property {Promise} promise - The request promise
 * @property {Function} resolve - Promise resolve function
 * @property {Function} reject - Promise reject function
 * @property {number} startTime - Request start timestamp
 * @property {number} queueTime - Time when request was queued
 * @property {string} priority - Request priority ('normal' | 'high')
 * @property {string} id - Unique request identifier
 */

class ConcurrentRequestManager {
  /**
   * Create a new ConcurrentRequestManager
   * @param {number} [maxConcurrent=250] - Maximum concurrent requests (RTX 5080 optimized)
   */
  constructor(maxConcurrent = 250) {
    this.maxConcurrent = maxConcurrent;
    this.activeRequests = new Set();
    this.requestQueue = [];
    this.priorityQueue = [];

    /** @type {RequestMetrics} */
    this.metrics = {
      totalRequests: 0,
      completedRequests: 0,
      averageResponseTime: 0,
      peakConcurrency: 0,
      queueWaitTime: 0,
      throughputPerSecond: 0
    };

    this.lastThroughputUpdate = Date.now();
    this.throughputWindow = new Map();
  }

  /**
   * Execute a request with priority-based scheduling
   * @param {Promise} requestPromise - The request to execute
   * @param {string} [priority='normal'] - Request priority ('normal' | 'high')
   * @returns {Promise<any>} The request result
   */
  async executeRequest(requestPromise, priority = 'normal') {
    return new Promise((resolve, reject) => {
      /** @type {Request} */
      const request = {
        promise: requestPromise,
        resolve,
        reject,
        startTime: Date.now(),
        queueTime: Date.now(),
        priority,
        id: Math.random().toString(36).substr(2, 9)
      };

      if (this.activeRequests.size < this.maxConcurrent) {
        this.processRequest(request);
      } else {
        // Priority queue for high-priority requests (health checks, etc.)
        if (priority === 'high') {
          this.priorityQueue.unshift(request);
        } else {
          this.requestQueue.push(request);
        }
      }
    });
  }

  /**
   * Process a single request
   * @param {Request} request - The request to process
   * @private
   */
  async processRequest(request) {
    this.activeRequests.add(request);
    this.metrics.totalRequests++;
    this.metrics.peakConcurrency = Math.max(
      this.metrics.peakConcurrency,
      this.activeRequests.size
    );

    // Track queue wait time for performance monitoring
    const queueWaitTime = Date.now() - request.queueTime;
    this.metrics.queueWaitTime = (this.metrics.queueWaitTime + queueWaitTime) / 2;

    try {
      const result = await request.promise;
      const responseTime = Date.now() - request.startTime;
      this.updateMetrics(responseTime);
      this.updateThroughput();
      request.resolve(result);
    } catch (error) {
      request.reject(error);
    } finally {
      this.activeRequests.delete(request);
      this.processNextInQueue();
    }
  }

  /**
   * Update response time metrics
   * @param {number} responseTime - Response time in ms
   * @private
   */
  updateMetrics(responseTime) {
    this.metrics.completedRequests++;
    this.metrics.averageResponseTime =
      (this.metrics.averageResponseTime * (this.metrics.completedRequests - 1) + responseTime) /
      this.metrics.completedRequests;
  }

  /**
   * Process next request from queue with priority support
   * @private
   */
  processNextInQueue() {
    if (this.activeRequests.size >= this.maxConcurrent) return;

    // Process priority queue first for maximum responsiveness
    const nextRequest = this.priorityQueue.shift() || this.requestQueue.shift();
    if (nextRequest) {
      setImmediate(() => this.processRequest(nextRequest));
    }
  }

  /**
   * Update throughput metrics using rolling window
   * @private
   */
  updateThroughput() {
    const now = Date.now();
    const windowKey = Math.floor(now / 1000);

    this.throughputWindow.set(windowKey, (this.throughputWindow.get(windowKey) || 0) + 1);

    // Clean old entries (keep last 10 seconds)
    for (const [key] of this.throughputWindow) {
      if (key < windowKey - 10) {
        this.throughputWindow.delete(key);
      }
    }

    // Calculate current throughput
    const totalRequests = Array.from(this.throughputWindow.values())
      .reduce((sum, count) => sum + count, 0);
    this.metrics.throughputPerSecond = totalRequests / Math.min(this.throughputWindow.size, 10);
  }

  /**
   * Get current metrics including active concurrency
   * @returns {RequestMetrics & {activeConcurrency: number, queuedRequests: number}}
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeConcurrency: this.activeRequests.size,
      queuedRequests: this.requestQueue.length + this.priorityQueue.length
    };
  }

  /**
   * Reset all metrics to initial state
   */
  resetMetrics() {
    this.metrics = {
      totalRequests: 0,
      completedRequests: 0,
      averageResponseTime: 0,
      peakConcurrency: 0,
      queueWaitTime: 0,
      throughputPerSecond: 0
    };
    this.throughputWindow.clear();
  }

  /**
   * Get queue status
   * @returns {{normal: number, high: number, active: number}}
   */
  getQueueStatus() {
    return {
      normal: this.requestQueue.length,
      high: this.priorityQueue.length,
      active: this.activeRequests.size
    };
  }
}

export { ConcurrentRequestManager };
