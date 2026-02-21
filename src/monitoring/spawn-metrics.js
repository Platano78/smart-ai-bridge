/**
 * @fileoverview Spawn Metrics - Track subagent spawn statistics
 * @module monitoring/spawn-metrics
 */

class SpawnMetrics {
  constructor() {
    this.totalSpawns = 0;
    this.successfulSpawns = 0;
    this.failedSpawns = 0;
    this.spawnsByRole = new Map();
    this.successByRole = new Map();
    this.errorsByRole = new Map();
    this.processingTimes = [];
    this.recentErrors = [];
    this.maxRecentErrors = 10;
    this.startTime = new Date();
  }

  recordSpawnAttempt(role) {
    this.totalSpawns++;
    this.spawnsByRole.set(role, (this.spawnsByRole.get(role) || 0) + 1);
  }

  recordSpawnSuccess(role, processingTimeMs) {
    this.successfulSpawns++;
    this.successByRole.set(role, (this.successByRole.get(role) || 0) + 1);
    this.processingTimes.push(processingTimeMs);
    if (this.processingTimes.length > 100) {
      this.processingTimes.shift();
    }
  }

  recordSpawnError(role, errorMessage) {
    this.failedSpawns++;
    this.errorsByRole.set(role, (this.errorsByRole.get(role) || 0) + 1);
    this.recentErrors.push({
      timestamp: new Date().toISOString(),
      role,
      error: errorMessage
    });
    if (this.recentErrors.length > this.maxRecentErrors) {
      this.recentErrors.shift();
    }
  }

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

  getPercentile(sorted, percentile) {
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[Math.max(0, index)];
  }

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

  exportMetrics() {
    return JSON.stringify(this.getMetricsSummary(), null, 2);
  }

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
