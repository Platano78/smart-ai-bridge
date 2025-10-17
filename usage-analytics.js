import fs from 'fs/promises';
import path from 'path';
import EventEmitter from 'events';

export class UsageAnalytics extends EventEmitter {
  constructor(dataDir = './data/analytics') {
    super();
    this.dataDir = dataDir;
    this.currentSession = {
      session_id: this.generateSessionId(),
      started_at: new Date().toISOString(),
      metrics: {
        total_requests: 0,
        successful_requests: 0,
        failed_requests: 0,
        total_tokens: 0,
        total_processing_time_ms: 0,
        backend_usage: {},
        tool_usage: {},
        routing_decisions: {}
      }
    };
    this.persistenceInterval = null;
  }

  async init() {
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.mkdir(path.join(this.dataDir, 'sessions'), { recursive: true });
    await fs.mkdir(path.join(this.dataDir, 'daily'), { recursive: true });
    await fs.mkdir(path.join(this.dataDir, 'events'), { recursive: true });

    // Start periodic persistence
    this.persistenceInterval = setInterval(() => {
      this.persistCurrentSession();
    }, 60000); // Every minute

    console.error('📊 Usage Analytics initialized');
  }

  /**
   * Record a tool invocation
   */
  async recordInvocation(event) {
    const {
      tool_name,
      backend_used,
      routing_method = 'unknown',
      routing_confidence = 0,
      processing_time_ms,
      tokens_used = 0,
      success = true,
      error = null,
      prompt_length = 0,
      response_length = 0,
      timestamp = new Date().toISOString()
    } = event;

    // Update session metrics
    this.currentSession.metrics.total_requests++;
    if (success) {
      this.currentSession.metrics.successful_requests++;
    } else {
      this.currentSession.metrics.failed_requests++;
    }

    this.currentSession.metrics.total_tokens += tokens_used;
    this.currentSession.metrics.total_processing_time_ms += processing_time_ms;

    // Backend usage tracking
    if (!this.currentSession.metrics.backend_usage[backend_used]) {
      this.currentSession.metrics.backend_usage[backend_used] = {
        requests: 0,
        successes: 0,
        failures: 0,
        total_tokens: 0,
        total_time_ms: 0,
        avg_time_ms: 0,
        avg_tokens: 0
      };
    }

    const backendStats = this.currentSession.metrics.backend_usage[backend_used];
    backendStats.requests++;
    if (success) backendStats.successes++;
    else backendStats.failures++;
    backendStats.total_tokens += tokens_used;
    backendStats.total_time_ms += processing_time_ms;
    backendStats.avg_time_ms = backendStats.total_time_ms / backendStats.requests;
    backendStats.avg_tokens = backendStats.total_tokens / backendStats.requests;

    // Tool usage tracking
    if (!this.currentSession.metrics.tool_usage[tool_name]) {
      this.currentSession.metrics.tool_usage[tool_name] = {
        invocations: 0,
        successes: 0,
        failures: 0,
        avg_processing_time_ms: 0,
        total_time_ms: 0
      };
    }

    const toolStats = this.currentSession.metrics.tool_usage[tool_name];
    toolStats.invocations++;
    if (success) toolStats.successes++;
    else toolStats.failures++;
    toolStats.total_time_ms += processing_time_ms;
    toolStats.avg_processing_time_ms = toolStats.total_time_ms / toolStats.invocations;

    // Routing decisions tracking
    const routingKey = `${routing_method}_${backend_used}`;
    if (!this.currentSession.metrics.routing_decisions[routingKey]) {
      this.currentSession.metrics.routing_decisions[routingKey] = {
        count: 0,
        avg_confidence: 0,
        total_confidence: 0,
        successes: 0,
        failures: 0
      };
    }

    const routingStats = this.currentSession.metrics.routing_decisions[routingKey];
    routingStats.count++;
    routingStats.total_confidence += routing_confidence || 0;
    routingStats.avg_confidence = routingStats.total_confidence / routingStats.count;
    if (success) routingStats.successes++;
    else routingStats.failures++;

    // Persist detailed event
    const eventRecord = {
      timestamp,
      session_id: this.currentSession.session_id,
      tool_name,
      backend_used,
      routing_method,
      routing_confidence,
      processing_time_ms,
      tokens_used,
      prompt_length,
      response_length,
      success,
      error: error ? {
        type: error.type || error.name,
        message: error.message,
        code: error.code
      } : null
    };

    await this.persistEvent(eventRecord);

    // Emit analytics event for real-time monitoring
    this.emit('invocation', eventRecord);

    return eventRecord;
  }

  /**
   * Get current session statistics
   */
  getSessionStats() {
    const stats = JSON.parse(JSON.stringify(this.currentSession)); // Deep clone

    // Calculate derived metrics
    stats.metrics.success_rate = stats.metrics.total_requests > 0
      ? (stats.metrics.successful_requests / stats.metrics.total_requests) * 100
      : 0;

    stats.metrics.avg_processing_time_ms = stats.metrics.total_requests > 0
      ? stats.metrics.total_processing_time_ms / stats.metrics.total_requests
      : 0;

    stats.metrics.avg_tokens_per_request = stats.metrics.total_requests > 0
      ? stats.metrics.total_tokens / stats.metrics.total_requests
      : 0;

    // Add backend performance ranking
    stats.metrics.backend_ranking = Object.entries(stats.metrics.backend_usage)
      .map(([backend, data]) => ({
        backend,
        success_rate: data.requests > 0 ? (data.successes / data.requests) * 100 : 0,
        avg_time_ms: data.avg_time_ms,
        total_requests: data.requests,
        score: this.calculateBackendScore(data)
      }))
      .sort((a, b) => b.score - a.score);

    return stats;
  }

  /**
   * Get historical analytics
   */
  async getHistoricalAnalytics(timeRange = '7d') {
    const now = Date.now();
    const ranges = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };

    const cutoffTime = now - (ranges[timeRange] || ranges['7d']);
    const eventsDir = path.join(this.dataDir, 'events');

    let files;
    try {
      files = await fs.readdir(eventsDir);
    } catch (error) {
      return this.aggregateEvents([]); // Return empty analytics
    }

    const events = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filepath = path.join(eventsDir, file);
      try {
        const stat = await fs.stat(filepath);

        if (stat.mtimeMs >= cutoffTime) {
          const content = await fs.readFile(filepath, 'utf8');
          const event = JSON.parse(content);
          events.push(event);
        }
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }

    return this.aggregateEvents(events);
  }

  /**
   * Aggregate events into analytics
   */
  aggregateEvents(events) {
    const analytics = {
      time_range: {
        start: events.length > 0 ? events[0].timestamp : null,
        end: events.length > 0 ? events[events.length - 1].timestamp : null,
        total_events: events.length
      },
      totals: {
        requests: events.length,
        successes: events.filter(e => e.success).length,
        failures: events.filter(e => !e.success).length,
        total_tokens: events.reduce((sum, e) => sum + (e.tokens_used || 0), 0),
        total_time_ms: events.reduce((sum, e) => sum + (e.processing_time_ms || 0), 0)
      },
      backend_performance: {},
      tool_popularity: {},
      routing_effectiveness: {},
      hourly_distribution: {},
      error_patterns: []
    };

    // Calculate success rate
    analytics.totals.success_rate = analytics.totals.requests > 0
      ? (analytics.totals.successes / analytics.totals.requests) * 100
      : 0;

    // Backend performance
    events.forEach(event => {
      const backend = event.backend_used;

      if (!analytics.backend_performance[backend]) {
        analytics.backend_performance[backend] = {
          requests: 0,
          successes: 0,
          failures: 0,
          total_tokens: 0,
          total_time_ms: 0,
          avg_time_ms: 0,
          avg_tokens: 0,
          success_rate: 0
        };
      }

      const perf = analytics.backend_performance[backend];
      perf.requests++;
      if (event.success) perf.successes++;
      else perf.failures++;
      perf.total_tokens += event.tokens_used || 0;
      perf.total_time_ms += event.processing_time_ms || 0;
    });

    // Calculate averages for each backend
    Object.values(analytics.backend_performance).forEach(perf => {
      perf.avg_time_ms = perf.requests > 0 ? perf.total_time_ms / perf.requests : 0;
      perf.avg_tokens = perf.requests > 0 ? perf.total_tokens / perf.requests : 0;
      perf.success_rate = perf.requests > 0 ? (perf.successes / perf.requests) * 100 : 0;
    });

    // Tool popularity
    events.forEach(event => {
      const tool = event.tool_name;
      analytics.tool_popularity[tool] = (analytics.tool_popularity[tool] || 0) + 1;
    });

    // Routing effectiveness
    events.forEach(event => {
      const key = `${event.routing_method}_${event.backend_used}`;

      if (!analytics.routing_effectiveness[key]) {
        analytics.routing_effectiveness[key] = {
          count: 0,
          avg_confidence: 0,
          total_confidence: 0,
          success_rate: 0,
          successes: 0
        };
      }

      const routing = analytics.routing_effectiveness[key];
      routing.count++;
      routing.total_confidence += event.routing_confidence || 0;
      if (event.success) routing.successes++;
    });

    // Calculate routing averages
    Object.values(analytics.routing_effectiveness).forEach(routing => {
      routing.avg_confidence = routing.count > 0 ? routing.total_confidence / routing.count : 0;
      routing.success_rate = routing.count > 0 ? (routing.successes / routing.count) * 100 : 0;
    });

    // Hourly distribution
    events.forEach(event => {
      const hour = new Date(event.timestamp).getHours();
      analytics.hourly_distribution[hour] = (analytics.hourly_distribution[hour] || 0) + 1;
    });

    // Error patterns
    const errors = events.filter(e => !e.success && e.error);
    const errorCounts = {};

    errors.forEach(e => {
      const key = `${e.error.type}_${e.error.code || 'unknown'}`;
      if (!errorCounts[key]) {
        errorCounts[key] = {
          type: e.error.type,
          message: e.error.message,
          code: e.error.code,
          count: 0,
          first_seen: e.timestamp,
          last_seen: e.timestamp
        };
      }
      errorCounts[key].count++;
      errorCounts[key].last_seen = e.timestamp;
    });

    analytics.error_patterns = Object.values(errorCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return analytics;
  }

  /**
   * Get cost analysis
   */
  async getCostAnalysis(pricing = {}) {
    // Default pricing (USD per million tokens)
    const defaultPricing = {
      local: { input: 0, output: 0 },
      gemini: { input: 0.075, output: 0.30 },
      nvidia_deepseek: { input: 0.27, output: 1.08 },
      nvidia_qwen: { input: 0.45, output: 1.80 }
    };

    const pricingModel = { ...defaultPricing, ...pricing };
    const stats = this.getSessionStats();
    const costBreakdown = {};
    let totalCost = 0;

    Object.entries(stats.metrics.backend_usage).forEach(([backend, data]) => {
      const backendPricing = pricingModel[backend] || { input: 0, output: 0 };

      // Estimate input/output split (assume 30% input, 70% output)
      const inputTokens = data.total_tokens * 0.3;
      const outputTokens = data.total_tokens * 0.7;

      const cost = {
        input_cost: (inputTokens / 1000000) * backendPricing.input,
        output_cost: (outputTokens / 1000000) * backendPricing.output,
        total_cost: 0,
        tokens: data.total_tokens,
        requests: data.requests
      };

      cost.total_cost = cost.input_cost + cost.output_cost;
      totalCost += cost.total_cost;

      costBreakdown[backend] = cost;
    });

    return {
      total_cost: totalCost,
      breakdown: costBreakdown,
      cost_per_request: stats.metrics.total_requests > 0
        ? totalCost / stats.metrics.total_requests
        : 0,
      estimated_monthly_cost: totalCost * 30, // Rough estimate
      cost_savings_vs_cloud_only: this.calculateCostSavings(costBreakdown, pricingModel)
    };
  }

  /**
   * Get optimization recommendations
   */
  async getOptimizationRecommendations() {
    const stats = this.getSessionStats();
    const historical = await this.getHistoricalAnalytics('7d');
    const recommendations = [];

    // Backend performance recommendations
    Object.entries(stats.metrics.backend_usage).forEach(([backend, data]) => {
      if (data.requests > 10 && data.successes / data.requests < 0.9) {
        recommendations.push({
          type: 'backend_reliability',
          severity: 'warning',
          backend,
          message: `${backend} has ${((1 - data.successes / data.requests) * 100).toFixed(1)}% failure rate`,
          suggestion: `Consider reviewing routing rules for ${backend} or investigating backend health`
        });
      }

      if (data.avg_time_ms > 5000) {
        recommendations.push({
          type: 'backend_performance',
          severity: 'info',
          backend,
          message: `${backend} averaging ${data.avg_time_ms.toFixed(0)}ms response time`,
          suggestion: `Consider using faster backend for time-sensitive operations`
        });
      }
    });

    // Routing optimization recommendations
    Object.entries(stats.metrics.routing_decisions).forEach(([key, data]) => {
      if (data.count > 10 && data.avg_confidence < 0.7) {
        recommendations.push({
          type: 'routing_confidence',
          severity: 'warning',
          routing_method: key.split('_')[0],
          message: `Low routing confidence (${(data.avg_confidence * 100).toFixed(1)}%) for ${key}`,
          suggestion: 'Consider refining routing rules or patterns for better confidence'
        });
      }
    });

    // Cost optimization recommendations
    const costAnalysis = await this.getCostAnalysis();
    if (costAnalysis.cost_savings_vs_cloud_only.potential_savings > 10) {
      recommendations.push({
        type: 'cost_optimization',
        severity: 'info',
        message: `Using local backend more could save $${costAnalysis.cost_savings_vs_cloud_only.potential_savings.toFixed(2)}/month`,
        suggestion: 'Route more large-context requests to local backend to reduce costs'
      });
    }

    return {
      total_recommendations: recommendations.length,
      by_severity: {
        critical: recommendations.filter(r => r.severity === 'critical').length,
        warning: recommendations.filter(r => r.severity === 'warning').length,
        info: recommendations.filter(r => r.severity === 'info').length
      },
      recommendations: recommendations.sort((a, b) => {
        const severityOrder = { critical: 3, warning: 2, info: 1 };
        return severityOrder[b.severity] - severityOrder[a.severity];
      })
    };
  }

  /**
   * Export analytics report
   */
  async exportReport(format = 'json', timeRange = '7d') {
    const historical = await this.getHistoricalAnalytics(timeRange);
    const currentSession = this.getSessionStats();
    const costAnalysis = await this.getCostAnalysis();
    const recommendations = await this.getOptimizationRecommendations();

    const report = {
      generated_at: new Date().toISOString(),
      time_range: timeRange,
      current_session: currentSession,
      historical_data: historical,
      cost_analysis: costAnalysis,
      recommendations: recommendations
    };

    if (format === 'json') {
      return JSON.stringify(report, null, 2);
    }

    if (format === 'markdown') {
      return this.generateMarkdownReport(report);
    }

    return report;
  }

  /**
   * Generate markdown report
   */
  generateMarkdownReport(report) {
    let md = `# Usage Analytics Report\n\n`;
    md += `**Generated:** ${report.generated_at}\n`;
    md += `**Time Range:** ${report.time_range}\n\n`;

    md += `## Current Session Summary\n\n`;
    md += `- **Session ID:** ${report.current_session.session_id}\n`;
    md += `- **Started:** ${report.current_session.started_at}\n`;
    md += `- **Total Requests:** ${report.current_session.metrics.total_requests}\n`;
    md += `- **Success Rate:** ${report.current_session.metrics.success_rate.toFixed(2)}%\n`;
    md += `- **Total Tokens:** ${report.current_session.metrics.total_tokens.toLocaleString()}\n`;
    md += `- **Avg Processing Time:** ${report.current_session.metrics.avg_processing_time_ms.toFixed(0)}ms\n\n`;

    md += `## Backend Performance\n\n`;
    md += `| Backend | Requests | Success Rate | Avg Time (ms) | Total Tokens |\n`;
    md += `|---------|----------|--------------|---------------|---------------|\n`;

    Object.entries(report.current_session.metrics.backend_usage).forEach(([backend, data]) => {
      const successRate = (data.successes / data.requests * 100).toFixed(1);
      md += `| ${backend} | ${data.requests} | ${successRate}% | ${data.avg_time_ms.toFixed(0)} | ${data.total_tokens.toLocaleString()} |\n`;
    });

    md += `\n## Cost Analysis\n\n`;
    md += `- **Total Cost:** $${report.cost_analysis.total_cost.toFixed(4)}\n`;
    md += `- **Cost Per Request:** $${report.cost_analysis.cost_per_request.toFixed(6)}\n`;
    md += `- **Estimated Monthly:** $${report.cost_analysis.estimated_monthly_cost.toFixed(2)}\n`;
    md += `- **Savings vs Cloud-Only:** $${report.cost_analysis.cost_savings_vs_cloud_only.savings.toFixed(4)}\n\n`;

    if (report.recommendations.total_recommendations > 0) {
      md += `## Recommendations (${report.recommendations.total_recommendations})\n\n`;

      report.recommendations.recommendations.forEach(rec => {
        const icon = rec.severity === 'critical' ? '🔴' : rec.severity === 'warning' ? '⚠️' : 'ℹ️';
        md += `${icon} **${rec.type}:** ${rec.message}\n`;
        md += `   - ${rec.suggestion}\n\n`;
      });
    }

    return md;
  }

  // Helper methods
  calculateBackendScore(data) {
    const successWeight = 0.5;
    const speedWeight = 0.3;
    const usageWeight = 0.2;

    const successScore = data.requests > 0 ? (data.successes / data.requests) * 100 : 0;
    const speedScore = Math.max(0, 100 - (data.avg_time_ms / 100)); // Faster = higher score
    const usageScore = Math.min(100, data.requests); // More usage = higher score (capped at 100)

    return (
      successScore * successWeight +
      speedScore * speedWeight +
      usageScore * usageWeight
    );
  }

  calculateCostSavings(costBreakdown, pricingModel) {
    const localCost = costBreakdown.local?.total_cost || 0;
    const localTokens = costBreakdown.local?.tokens || 0;

    // Calculate what local tokens would have cost on gemini
    const cloudPricing = pricingModel.gemini || { input: 0.075, output: 0.30 };
    const inputTokens = localTokens * 0.3;
    const outputTokens = localTokens * 0.7;

    const wouldHaveCost =
      (inputTokens / 1000000) * cloudPricing.input +
      (outputTokens / 1000000) * cloudPricing.output;

    return {
      actual_cost: localCost,
      would_have_cost: wouldHaveCost,
      savings: wouldHaveCost - localCost,
      potential_savings: (wouldHaveCost - localCost) * 30 // Monthly estimate
    };
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  async persistEvent(event) {
    try {
      const date = new Date(event.timestamp);
      const filename = `${date.getTime()}_${event.tool_name}.json`;
      const filepath = path.join(this.dataDir, 'events', filename);

      await fs.writeFile(filepath, JSON.stringify(event, null, 2));
    } catch (error) {
      // Silent fail for persistence errors
      console.error('Failed to persist event:', error.message);
    }
  }

  async persistCurrentSession() {
    try {
      const filename = `${this.currentSession.session_id}.json`;
      const filepath = path.join(this.dataDir, 'sessions', filename);

      const sessionData = {
        ...this.currentSession,
        last_updated: new Date().toISOString()
      };

      await fs.writeFile(filepath, JSON.stringify(sessionData, null, 2));
    } catch (error) {
      console.error('Failed to persist session:', error.message);
    }
  }

  async cleanup() {
    if (this.persistenceInterval) {
      clearInterval(this.persistenceInterval);
    }
    await this.persistCurrentSession();
    console.error('📊 Usage Analytics cleaned up');
  }
}

export default UsageAnalytics;
