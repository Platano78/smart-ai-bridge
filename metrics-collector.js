/**
 * Metrics Collection Module
 * Track usage and performance statistics
 */

export class MetricsCollector {
  constructor() {
    this.metrics = {
      requests: { total: 0, success: 0, failed: 0 },
      tools: {},
      performance: { totalTime: 0, count: 0 },
      errors: {}
    };
  }

  recordRequest(toolName, success, duration) {
    this.metrics.requests.total++;
    if (success) {
      this.metrics.requests.success++;
    } else {
      this.metrics.requests.failed++;
    }

    if (!this.metrics.tools[toolName]) {
      this.metrics.tools[toolName] = { count: 0, success: 0, failed: 0, totalTime: 0 };
    }

    this.metrics.tools[toolName].count++;
    this.metrics.tools[toolName][success ? 'success' : 'failed']++;
    this.metrics.tools[toolName].totalTime += duration;

    this.metrics.performance.totalTime += duration;
    this.metrics.performance.count++;
  }

  recordError(errorType) {
    this.metrics.errors[errorType] = (this.metrics.errors[errorType] || 0) + 1;
  }

  getMetrics() {
    return {
      ...this.metrics,
      performance: {
        ...this.metrics.performance,
        averageTime: this.metrics.performance.count > 0
          ? this.metrics.performance.totalTime / this.metrics.performance.count
          : 0
      }
    };
  }
}

export const metricsCollector = new MetricsCollector();
