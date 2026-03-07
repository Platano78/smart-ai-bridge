/**
 * @fileoverview UsageAnalytics — Aggregates metrics from subsystems for the get_analytics tool.
 * @module monitoring/usage-analytics
 *
 * Delegates to real data sources:
 * - CompoundLearningEngine for routing history and recommendations
 * - MultiAIRouter for request metrics
 * - BackendRegistry for backend stats
 */

class UsageAnalytics {
  constructor({ compoundLearning, router, backendRegistry } = {}) {
    this.compoundLearning = compoundLearning;
    this.router = router;
    this.backendRegistry = backendRegistry;
    this.startTime = Date.now();
  }

  /**
   * Current session stats — uptime, backend counts, learning summary
   */
  getSessionStats() {
    const registryStats = this.backendRegistry?.getStats() || {};
    const learningSummary = this.compoundLearning?.getSummary() || {};

    return {
      uptime_seconds: process.uptime(),
      start_time: new Date(this.startTime).toISOString(),
      memory: process.memoryUsage(),
      backends: {
        total: registryStats.totalBackends || 0,
        healthy: registryStats.healthyBackends || 0,
        names: registryStats.backends?.map(b => b.name) || []
      },
      learning: {
        total_decisions: learningSummary.totalDecisions || 0,
        pattern_count: learningSummary.patternCount || 0,
        backend_performance: learningSummary.backendPerformance || {}
      }
    };
  }

  /**
   * Historical analytics from compound learning engine
   */
  async getHistoricalAnalytics(timeRange = '7d') {
    const summary = this.compoundLearning?.getSummary() || {};

    return {
      time_range: timeRange,
      total_decisions: summary.totalDecisions || 0,
      backend_performance: summary.backendPerformance || {},
      pattern_count: summary.patternCount || 0,
      generated_at: new Date().toISOString()
    };
  }

  /**
   * Cost analysis — no real cost tracking exists, report backend usage instead
   */
  async getCostAnalysis() {
    const registryStats = this.backendRegistry?.getStats() || {};
    const summary = this.compoundLearning?.getSummary() || {};

    const backendUsage = {};
    for (const [name, perf] of Object.entries(summary.backendPerformance || {})) {
      backendUsage[name] = {
        total_calls: perf.totalCalls || 0,
        success_rate: perf.successRate || 0,
        avg_latency_ms: perf.avgLatency || 0
      };
    }

    return {
      note: 'Cost tracking not available — showing backend usage metrics instead',
      total_backends: registryStats.totalBackends || 0,
      backend_usage: backendUsage,
      generated_at: new Date().toISOString()
    };
  }

  /**
   * Optimization recommendations from compound learning engine
   */
  async getOptimizationRecommendations() {
    const summary = this.compoundLearning?.getSummary() || {};

    return {
      recommendations: summary.recommendations || [],
      backend_performance: summary.backendPerformance || {},
      generated_at: new Date().toISOString()
    };
  }

  /**
   * Export a combined report in JSON or markdown format
   */
  async exportReport(format = 'json', timeRange = '7d') {
    const session = this.getSessionStats();
    const historical = await this.getHistoricalAnalytics(timeRange);
    const cost = await this.getCostAnalysis();
    const recommendations = await this.getOptimizationRecommendations();

    const report = {
      report_type: 'full',
      generated_at: new Date().toISOString(),
      time_range: timeRange,
      session,
      historical,
      cost,
      recommendations: recommendations.recommendations
    };

    if (format === 'markdown') {
      return this._toMarkdown(report);
    }

    return JSON.stringify(report, null, 2);
  }

  /**
   * @private
   */
  _toMarkdown(report) {
    const lines = [
      '# Smart AI Bridge Analytics Report',
      '',
      `Generated: ${report.generated_at}`,
      `Time Range: ${report.time_range}`,
      '',
      '## Session',
      `- Uptime: ${Math.round(report.session.uptime_seconds)}s`,
      `- Backends: ${report.session.backends.total} total, ${report.session.backends.healthy} healthy`,
      `- Routing decisions: ${report.session.learning.total_decisions}`,
      `- Learned patterns: ${report.session.learning.pattern_count}`,
      '',
      '## Backend Performance',
    ];

    for (const [name, perf] of Object.entries(report.historical.backend_performance || {})) {
      lines.push(`- **${name}**: ${perf.totalCalls || 0} calls, ${((perf.successRate || 0) * 100).toFixed(0)}% success, ${(perf.avgLatency || 0).toFixed(0)}ms avg`);
    }

    if (report.recommendations.length > 0) {
      lines.push('', '## Recommendations');
      for (const rec of report.recommendations) {
        lines.push(`- [${rec.type}] ${rec.message} — ${rec.action}`);
      }
    }

    return lines.join('\n');
  }
}

export { UsageAnalytics };
