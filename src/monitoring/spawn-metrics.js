/**
 * @fileoverview Spawn Metrics - Track subagent spawn statistics
 * @module monitoring/spawn-metrics
 */

/**
 * @typedef {Object} MetricsSummary
 * @property {number} totalSpawns - Total spawn attempts
 * @property {number} successfulSpawns - Successful spawns
 * @property {number} failedSpawns - Failed spawns
 * @property {number} successRate - Success rate percentage
 * @property {Object} roleDistribution - Spawns by role
 * @property {Object} performanceStats - Performance statistics
 * @property {string[]} recentErrors - Recent error messages
 */

/**
 * Metrics tracking for subagent spawns
 */
class SpawnMetrics {
  constructor() {
    /** @type {number} */
    this.totalSpawns = 0;

    /** @type {number} */
    this.successfulSpawns = 0;

    /** @type {number} */
    this.failedSpawns = 0;

    /** @type {Map<string, number>} */
    this.spawnsByRole = new Map();

    /** @type {Map<string, number>} */
    this.successByRole = new Map();

    /** @type {Map<string, number>} */
    this.errorsByRole = new Map();

    /** @type {Array<number>} */
    this.processingTimes = [];

    /** @type {Array<{timestamp: string, role: string, error: string}>} */
    this.recentErrors = [];

    /** @type {number} */
    this.maxRecentErrors = 10;

    /** @type {Date} */
    this.startTime = new Date();
  }

  /**
   * Record spawn attempt
   * @param {string} role - Subagent role
   */
  recordSpawnAttempt(role) {
    this.totalSpawns++;
    this.spawnsByRole.set(role, (this.spawnsByRole.get(role) || 0) + 1);
  }

  /**
   * Record successful spawn
   * @param {string} role - Subagent role
   * @param {number} processingTimeMs - Processing time in milliseconds
   */
  recordSpawnSuccess(role, processingTimeMs) {
    this.successfulSpawns++;
    this.successByRole.set(role, (this.successByRole.get(role) || 0) + 1);

    // Track processing time
    this.processingTimes.push(processingTimeMs);

    // Keep last 100 processing times for stats
    if (this.processingTimes.length > 100) {
      this.processingTimes.shift();
    }
  }

  /**
   * Record spawn error
   * @param {string} role - Subagent role
   * @param {string} errorMessage - Error message
   */
  recordSpawnError(role, errorMessage) {
    this.failedSpawns++;
    this.errorsByRole.set(role, (this.errorsByRole.get(role) || 0) + 1);

    // Track recent errors
    this.recentErrors.push({
      timestamp: new Date().toISOString(),
      role,
      error: errorMessage
    });

    // Keep only recent errors
    if (this.recentErrors.length > this.maxRecentErrors) {
      this.recentErrors.shift();
    }
  }

  /**
   * Get metrics summary
   * @returns {MetricsSummary}
   */
  getMetricsSummary() {
    const successRate = this.totalSpawns > 0
      ? (this.successfulSpawns / this.totalSpawns) * 100
      : 0;

    return {
      totalSpawns: this.totalSpawns,
      successfulSpawns: this.successfulSpawns,
      failedSpawns: this.failedSpawns,
      successRate: Math.round(successRate * 100) / 100,
      roleDistribution: this.getRoleDistribution(),
      performanceStats: this.getPerformanceStats(),
      recentErrors: this.recentErrors.map(e => ({
        timestamp: e.timestamp,
        role: e.role,
        error: e.error
      })),
      uptime: this.getUptime()
    };
  }

  /**
   * Get role distribution statistics
   * @private
   * @returns {Object}
   */
  getRoleDistribution() {
    const distribution = {};

    for (const [role, count] of this.spawnsByRole.entries()) {
      const successCount = this.successByRole.get(role) || 0;
      const errorCount = this.errorsByRole.get(role) || 0;
      const roleSuccessRate = count > 0 ? (successCount / count) * 100 : 0;

      distribution[role] = {
        total: count,
        successful: successCount,
        failed: errorCount,
        successRate: Math.round(roleSuccessRate * 100) / 100,
        percentage: Math.round((count / this.totalSpawns) * 100 * 100) / 100
      };
    }

    return distribution;
  }

  /**
   * Get performance statistics
   * @private
   * @returns {Object}
   */
  getPerformanceStats() {
    if (this.processingTimes.length === 0) {
      return {
        avgProcessingTimeMs: 0,
        minProcessingTimeMs: 0,
        maxProcessingTimeMs: 0,
        p50ProcessingTimeMs: 0,
        p95ProcessingTimeMs: 0,
        p99ProcessingTimeMs: 0
      };
    }

    const sorted = [...this.processingTimes].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, val) => acc + val, 0);
    const avg = sum / sorted.length;

    return {
      avgProcessingTimeMs: Math.round(avg),
      minProcessingTimeMs: sorted[0],
      maxProcessingTimeMs: sorted[sorted.length - 1],
      p50ProcessingTimeMs: this.getPercentile(sorted, 0.50),
      p95ProcessingTimeMs: this.getPercentile(sorted, 0.95),
      p99ProcessingTimeMs: this.getPercentile(sorted, 0.99)
    };
  }

  /**
   * Calculate percentile from sorted array
   * @private
   * @param {number[]} sorted - Sorted array of values
   * @param {number} percentile - Percentile (0-1)
   * @returns {number}
   */
  getPercentile(sorted, percentile) {
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get uptime in human-readable format
   * @private
   * @returns {string}
   */
  getUptime() {
    const now = new Date();
    const uptimeMs = now - this.startTime;

    const seconds = Math.floor(uptimeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.totalSpawns = 0;
    this.successfulSpawns = 0;
    this.failedSpawns = 0;
    this.spawnsByRole.clear();
    this.successByRole.clear();
    this.errorsByRole.clear();
    this.processingTimes = [];
    this.recentErrors = [];
    this.startTime = new Date();
  }

  /**
   * Get metrics for specific role
   * @param {string} role - Role name
   * @returns {Object|null}
   */
  getRoleMetrics(role) {
    if (!this.spawnsByRole.has(role)) {
      return null;
    }

    const total = this.spawnsByRole.get(role);
    const successful = this.successByRole.get(role) || 0;
    const failed = this.errorsByRole.get(role) || 0;
    const successRate = total > 0 ? (successful / total) * 100 : 0;

    return {
      role,
      total,
      successful,
      failed,
      successRate: Math.round(successRate * 100) / 100
    };
  }

  /**
   * Export metrics as JSON
   * @returns {string}
   */
  exportMetrics() {
    return JSON.stringify(this.getMetricsSummary(), null, 2);
  }

  /**
   * Get markdown report
   * @returns {string}
   */
  getMarkdownReport() {
    const summary = this.getMetricsSummary();

    const lines = [
      '# Subagent Spawn Metrics',
      '',
      '## Overall Statistics',
      `- **Total Spawns**: ${summary.totalSpawns}`,
      `- **Successful**: ${summary.successfulSpawns}`,
      `- **Failed**: ${summary.failedSpawns}`,
      `- **Success Rate**: ${summary.successRate}%`,
      `- **Uptime**: ${summary.uptime}`,
      '',
      '## Performance',
      `- **Average Processing Time**: ${summary.performanceStats.avgProcessingTimeMs}ms`,
      `- **P50**: ${summary.performanceStats.p50ProcessingTimeMs}ms`,
      `- **P95**: ${summary.performanceStats.p95ProcessingTimeMs}ms`,
      `- **P99**: ${summary.performanceStats.p99ProcessingTimeMs}ms`,
      '',
      '## Role Distribution',
      ''
    ];

    for (const [role, stats] of Object.entries(summary.roleDistribution)) {
      lines.push(
        `### ${role}`,
        `- **Total**: ${stats.total} (${stats.percentage}%)`,
        `- **Success Rate**: ${stats.successRate}%`,
        `- **Successful**: ${stats.successful}`,
        `- **Failed**: ${stats.failed}`,
        ''
      );
    }

    if (summary.recentErrors.length > 0) {
      lines.push('## Recent Errors', '');
      for (const error of summary.recentErrors) {
        lines.push(`- **[${error.timestamp}] ${error.role}**: ${error.error}`);
      }
    }

    return lines.join('\n');
  }
}

export { SpawnMetrics };
