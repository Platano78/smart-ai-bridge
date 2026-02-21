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

class HealthMonitor {
  constructor(options = {}) {
    this.backends = new Map();
    this.cache = new Map();
    this.cacheTTL = options.cacheTTL || 300000;

    this.options = {
      localTimeout: options.localTimeout || 10000,
      cloudTimeout: options.cloudTimeout || 3000,
      checkInterval: options.checkInterval || 30000,
      ...options
    };

    this.metrics = {
      totalChecks: 0,
      lastFullCheck: null,
      avgLatency: 0,
      healthHistory: []
    };

    this.intervalId = null;
  }

  registerBackend(name, adapter) {
    this.backends.set(name, {
      adapter,
      type: adapter.type || 'unknown',
      lastHealth: null,
      checkCount: 0,
      successCount: 0
    });
  }

  unregisterBackend(name) {
    this.backends.delete(name);
  }

  getTimeout(type) {
    return type === 'local' ? this.options.localTimeout : this.options.cloudTimeout;
  }

  async checkBackend(name, force = false) {
    const backend = this.backends.get(name);
    if (!backend) {
      return { name, healthy: false, error: 'Backend not registered' };
    }

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

      this.cache.set(name, {
        result: backend.lastHealth,
        timestamp: Date.now()
      });

      return { ...backend.lastHealth, fromCache: false };
    }
  }

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

    this.metrics.healthHistory.push({
      timestamp: new Date(),
      healthyCount,
      total: results.length
    });
    if (this.metrics.healthHistory.length > 100) {
      this.metrics.healthHistory.shift();
    }

    return {
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
  }

  calculateUptime() {
    if (this.metrics.healthHistory.length === 0) return 100;
    const healthyChecks = this.metrics.healthHistory.filter(h => h.healthyCount > 0).length;
    return (healthyChecks / this.metrics.healthHistory.length) * 100;
  }

  getCurrentStatus() {
    const backends = [];
    let healthyCount = 0;

    for (const [name, backend] of this.backends) {
      if (backend.lastHealth) {
        backends.push(backend.lastHealth);
        if (backend.lastHealth.healthy) healthyCount++;
      } else {
        backends.push({ name, healthy: false, error: 'Never checked' });
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

    this.checkAll();
  }

  stopMonitoring() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  getMetrics() {
    return {
      ...this.metrics,
      registeredBackends: this.backends.size,
      monitoring: this.intervalId !== null
    };
  }

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

  getBackendHealth(name) {
    const backend = this.backends.get(name);
    if (!backend) return null;
    return backend.lastHealth || { healthy: false, error: 'Never checked' };
  }

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
