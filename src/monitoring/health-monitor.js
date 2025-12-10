/**
 * @fileoverview HealthMonitor - Unified health monitoring system
 * @module monitoring/health-monitor
 *
 * Aggregated health monitoring for all backends with:
 * - Differentiated timeouts (local vs cloud)
 * - Circuit breaker status
 * - Performance metrics
 * - Smart routing analytics
 */

/**
 * @typedef {Object} BackendHealthStatus
 * @property {string} name - Backend name
 * @property {boolean} healthy - Whether backend is healthy
 * @property {number} latency - Last check latency in ms
 * @property {boolean} circuitOpen - Whether circuit breaker is open
 * @property {number} successRate - Success rate percentage
 * @property {Date} lastCheck - Last health check timestamp
 * @property {string} [error] - Error message if unhealthy
 */

/**
 * @typedef {Object} SystemHealth
 * @property {boolean} overall - Overall system health
 * @property {number} healthyBackends - Number of healthy backends
 * @property {number} totalBackends - Total number of backends
 * @property {BackendHealthStatus[]} backends - Individual backend status
 * @property {Object} metrics - Aggregated metrics
 * @property {Date} timestamp - Check timestamp
 */

class HealthMonitor {
  /**
   * Create a HealthMonitor
   * @param {Object} [options] - Monitor options
   */
  constructor(options = {}) {
    /** @type {Map<string, Object>} */
    this.backends = new Map();

    /** @type {Map<string, Object>} Health check cache */
    this.cache = new Map();

    /** @type {number} Cache TTL in milliseconds */
    this.cacheTTL = options.cacheTTL || 300000; // 5 minutes default

    /** @type {Object} */
    this.options = {
      localTimeout: options.localTimeout || 10000,
      cloudTimeout: options.cloudTimeout || 3000,
      checkInterval: options.checkInterval || 30000,
      ...options
    };

    /** @type {Object} */
    this.metrics = {
      totalChecks: 0,
      lastFullCheck: null,
      avgLatency: 0,
      healthHistory: []
    };

    /** @type {NodeJS.Timeout|null} */
    this.intervalId = null;
  }

  /**
   * Register a backend for monitoring
   * @param {string} name - Backend name
   * @param {Object} adapter - Backend adapter instance
   */
  registerBackend(name, adapter) {
    this.backends.set(name, {
      adapter,
      type: adapter.type || 'unknown',
      lastHealth: null,
      checkCount: 0,
      successCount: 0
    });
  }

  /**
   * Unregister a backend
   * @param {string} name - Backend name
   */
  unregisterBackend(name) {
    this.backends.delete(name);
  }

  /**
   * Get timeout for backend type
   * @private
   * @param {string} type - Backend type
   * @returns {number}
   */
  getTimeout(type) {
    return type === 'local' ? this.options.localTimeout : this.options.cloudTimeout;
  }

  /**
   * Check health of a single backend
   * @param {string} name - Backend name
   * @param {boolean} [force=false] - Force fresh check, bypass cache
   * @returns {Promise<BackendHealthStatus>}
   */
  async checkBackend(name, force = false) {
    const backend = this.backends.get(name);
    if (!backend) {
      return {
        name,
        healthy: false,
        error: 'Backend not registered'
      };
    }

    // Check cache first (unless force=true)
    if (!force && this.cache.has(name)) {
      const cached = this.cache.get(name);
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        return { ...cached.result, fromCache: true };
      }
    }

    backend.checkCount++;
    const startTime = Date.now();

    try {
      const health = await backend.adapter.checkHealth();

      if (health.healthy) {
        backend.successCount++;
      }

      backend.lastHealth = {
        name,
        healthy: health.healthy,
        latency: health.latency,
        circuitOpen: backend.adapter.circuitOpen || false,
        successRate: (backend.successCount / backend.checkCount) * 100,
        lastCheck: new Date(),
        error: health.error
      };

      // Cache result
      this.cache.set(name, {
        result: backend.lastHealth,
        timestamp: Date.now()
      });

      return { ...backend.lastHealth, fromCache: false };
    } catch (error) {
      backend.lastHealth = {
        name,
        healthy: false,
        latency: Date.now() - startTime,
        circuitOpen: backend.adapter.circuitOpen || false,
        successRate: (backend.successCount / backend.checkCount) * 100,
        lastCheck: new Date(),
        error: error.message
      };

      // Cache error result too
      this.cache.set(name, {
        result: backend.lastHealth,
        timestamp: Date.now()
      });

      return { ...backend.lastHealth, fromCache: false };
    }
  }

  /**
   * Check health of all backends
   * @returns {Promise<SystemHealth>}
   */
  async checkAll() {
    this.metrics.totalChecks++;
    const startTime = Date.now();

    const healthChecks = [];
    for (const [name] of this.backends) {
      healthChecks.push(this.checkBackend(name));
    }

    const results = await Promise.all(healthChecks);
    const healthyCount = results.filter(r => r.healthy).length;
    const totalLatency = results.reduce((sum, r) => sum + (r.latency || 0), 0);

    this.metrics.lastFullCheck = new Date();
    this.metrics.avgLatency = totalLatency / results.length;

    // Keep health history (last 100 entries)
    this.metrics.healthHistory.push({
      timestamp: new Date(),
      healthyCount,
      total: results.length
    });
    if (this.metrics.healthHistory.length > 100) {
      this.metrics.healthHistory.shift();
    }

    const systemHealth = {
      overall: healthyCount > 0,
      healthyBackends: healthyCount,
      totalBackends: results.length,
      backends: results,
      metrics: {
        checkDuration: Date.now() - startTime,
        avgBackendLatency: this.metrics.avgLatency,
        totalChecksPerformed: this.metrics.totalChecks,
        uptimePercentage: this.calculateUptime()
      },
      timestamp: new Date()
    };

    return systemHealth;
  }

  /**
   * Calculate system uptime percentage from history
   * @private
   * @returns {number}
   */
  calculateUptime() {
    if (this.metrics.healthHistory.length === 0) return 100;

    const healthyChecks = this.metrics.healthHistory.filter(h => h.healthyCount > 0).length;
    return (healthyChecks / this.metrics.healthHistory.length) * 100;
  }

  /**
   * Get current health status without performing new checks
   * @returns {Object}
   */
  getCurrentStatus() {
    const backends = [];
    let healthyCount = 0;

    for (const [name, backend] of this.backends) {
      if (backend.lastHealth) {
        backends.push(backend.lastHealth);
        if (backend.lastHealth.healthy) healthyCount++;
      } else {
        backends.push({
          name,
          healthy: false,
          error: 'Never checked'
        });
      }
    }

    return {
      overall: healthyCount > 0,
      healthyBackends: healthyCount,
      totalBackends: backends.length,
      backends,
      lastFullCheck: this.metrics.lastFullCheck
    };
  }

  /**
   * Start automatic health monitoring
   * @param {number} [interval] - Check interval in ms
   */
  startMonitoring(interval) {
    if (this.intervalId) {
      this.stopMonitoring();
    }

    const checkInterval = interval || this.options.checkInterval;
    this.intervalId = setInterval(async () => {
      try {
        await this.checkAll();
      } catch (error) {
        console.error('[HealthMonitor] Check failed:', error.message);
      }
    }, checkInterval);

    // Initial check
    this.checkAll();
  }

  /**
   * Stop automatic health monitoring
   */
  stopMonitoring() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Get metrics summary
   * @returns {Object}
   */
  getMetrics() {
    return {
      ...this.metrics,
      registeredBackends: this.backends.size,
      monitoring: this.intervalId !== null
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      totalChecks: 0,
      lastFullCheck: null,
      avgLatency: 0,
      healthHistory: []
    };

    for (const [, backend] of this.backends) {
      backend.checkCount = 0;
      backend.successCount = 0;
      backend.lastHealth = null;
    }
  }

  /**
   * Get backend recommendations based on health
   * @returns {Object}
   */
  getRecommendations() {
    const healthy = [];
    const degraded = [];
    const unhealthy = [];

    for (const [name, backend] of this.backends) {
      if (!backend.lastHealth) {
        unhealthy.push({ name, reason: 'Never checked' });
        continue;
      }

      if (backend.adapter.circuitOpen) {
        unhealthy.push({ name, reason: 'Circuit breaker open' });
      } else if (!backend.lastHealth.healthy) {
        unhealthy.push({ name, reason: backend.lastHealth.error });
      } else if (backend.lastHealth.latency > 5000) {
        degraded.push({ name, latency: backend.lastHealth.latency });
      } else {
        healthy.push({ name, latency: backend.lastHealth.latency });
      }
    }

    // Sort healthy by latency
    healthy.sort((a, b) => a.latency - b.latency);

    return {
      recommended: healthy[0]?.name || null,
      healthy: healthy.map(h => h.name),
      degraded: degraded.map(d => d.name),
      unhealthy: unhealthy.map(u => u.name),
      fallbackChain: [...healthy, ...degraded].map(b => b.name)
    };
  }
}

export { HealthMonitor };
