/**
 * MKG v9.1 Compound Learning System
 *
 * Implements self-improvement through:
 * 1. Outcome Tracking - Records success/failure of routing decisions
 * 2. Confidence Adjustment - Updates routing weights based on outcomes
 * 3. Pattern Recognition - Identifies task patterns that predict success
 * 4. Adaptive Thresholds - Auto-tunes perception/routing thresholds
 *
 * Inspired by SDLAF's PatternFeedbackTracker with EMA-based confidence updates.
 */

import fs from 'fs';
import path from 'path';

/**
 * Feedback types for routing decisions
 */
const FeedbackType = {
  SUCCESS: 'success',           // Task completed successfully
  PARTIAL: 'partial',           // Partially successful
  FAILURE: 'failure',           // Task failed
  TIMEOUT: 'timeout',           // Execution timed out
  VERIFICATION_FAILED: 'verification_failed',  // Code verification failed
  REPAIRED: 'repaired'          // Failed but auto-repaired
};

/**
 * Compound Learning Engine
 * Tracks outcomes and adjusts routing behavior over time
 */
class CompoundLearningEngine {
  constructor(config = {}) {
    this.config = {
      dataDir: config.dataDir || './data/learning',
      emaAlpha: config.emaAlpha || 0.2,          // Exponential moving average factor
      minSamples: config.minSamples || 5,         // Min samples before adjusting
      confidenceDecay: config.confidenceDecay || 0.995,  // Daily decay factor
      ...config
    };

    // In-memory state
    this.toolMetrics = {};       // Per-tool performance metrics
    this.taskPatterns = {};      // Task pattern → outcome mapping
    this.routingHistory = [];    // Recent routing decisions
    this.perceptionHits = { triggered: 0, skipped: 0, beneficial: 0 };

    // Ensure data directory exists
    this._ensureDataDir();

    // Load persisted state
    this._loadState();
  }

  /**
   * Record a routing outcome for learning
   */
  recordOutcome(outcome) {
    const {
      task,
      context,
      routing,
      execution,
      verification,
      userFeedback
    } = outcome;

    const timestamp = Date.now();
    const tool = routing.tool;
    const source = routing.source;

    // Determine success level
    const success = this._calculateSuccess(execution, verification, userFeedback);

    // Update tool metrics with EMA
    this._updateToolMetrics(tool, success, context);

    // Update routing source metrics
    this._updateSourceMetrics(source, success);

    // Learn task patterns
    this._learnTaskPattern(context, tool, success);

    // Track perception effectiveness
    if (routing.perception) {
      this.perceptionHits.triggered++;
      if (success.score >= 0.7) {
        this.perceptionHits.beneficial++;
      }
    } else {
      this.perceptionHits.skipped++;
    }

    // Add to history
    this.routingHistory.push({
      timestamp,
      task: task.substring(0, 100),
      tool,
      source,
      success: success.score,
      context: {
        complexity: context.complexity,
        taskType: context.taskType,
        fileCount: context.fileCount
      }
    });

    // Keep history manageable
    if (this.routingHistory.length > 1000) {
      this.routingHistory = this.routingHistory.slice(-500);
    }

    // Persist state periodically
    if (this.routingHistory.length % 10 === 0) {
      this._saveState();
    }

    return {
      recorded: true,
      toolConfidence: this.toolMetrics[tool]?.confidence || 0.5,
      successScore: success.score
    };
  }

  /**
   * Calculate success score from execution results
   */
  _calculateSuccess(execution, verification, userFeedback) {
    let score = 0;
    const factors = [];

    // Execution success (40%)
    if (execution?.completed) {
      score += 0.4;
      factors.push('execution_complete');
    } else if (execution?.partial) {
      score += 0.2;
      factors.push('execution_partial');
    }

    // Verification success (30%)
    if (verification?.passed) {
      score += 0.3;
      factors.push('verification_passed');
    } else if (verification?.repaired) {
      score += 0.15;
      factors.push('verification_repaired');
    }

    // Output quality (20%)
    if (execution?.outputLength > 100) {
      score += 0.2;
      factors.push('output_substantial');
    } else if (execution?.outputLength > 0) {
      score += 0.1;
      factors.push('output_present');
    }

    // User feedback override (10% or full override)
    if (userFeedback !== undefined) {
      if (userFeedback === 'positive') {
        score = Math.max(score, 0.9);
        factors.push('user_positive');
      } else if (userFeedback === 'negative') {
        score = Math.min(score, 0.3);
        factors.push('user_negative');
      }
    }

    return { score: Math.min(1, score), factors };
  }

  /**
   * Update tool metrics using Exponential Moving Average
   */
  _updateToolMetrics(tool, success, context) {
    if (!this.toolMetrics[tool]) {
      this.toolMetrics[tool] = {
        confidence: 0.5,
        totalCalls: 0,
        successfulCalls: 0,
        avgLatency: 0,
        byComplexity: { low: { calls: 0, success: 0 }, medium: { calls: 0, success: 0 }, high: { calls: 0, success: 0 } },
        byTaskType: {},
        trend: 'stable',
        lastUpdated: Date.now()
      };
    }

    const metrics = this.toolMetrics[tool];
    metrics.totalCalls++;

    if (success.score >= 0.7) {
      metrics.successfulCalls++;
    }

    // EMA confidence update
    // Formula: new_confidence = alpha * observation + (1 - alpha) * old_confidence
    const observation = success.score;
    metrics.confidence = this.config.emaAlpha * observation +
                         (1 - this.config.emaAlpha) * metrics.confidence;

    // Track by complexity
    const complexity = context.complexity || 'medium';
    if (metrics.byComplexity[complexity]) {
      metrics.byComplexity[complexity].calls++;
      if (success.score >= 0.7) {
        metrics.byComplexity[complexity].success++;
      }
    }

    // Track by task type
    const taskType = context.taskType || 'unknown';
    if (!metrics.byTaskType[taskType]) {
      metrics.byTaskType[taskType] = { calls: 0, success: 0 };
    }
    metrics.byTaskType[taskType].calls++;
    if (success.score >= 0.7) {
      metrics.byTaskType[taskType].success++;
    }

    // Calculate trend
    metrics.trend = this._calculateTrend(tool);
    metrics.lastUpdated = Date.now();
  }

  /**
   * Update routing source metrics
   */
  _updateSourceMetrics(source, success) {
    if (!this.sourceMetrics) {
      this.sourceMetrics = {};
    }

    if (!this.sourceMetrics[source]) {
      this.sourceMetrics[source] = {
        calls: 0,
        successSum: 0,
        confidence: 0.5
      };
    }

    const metrics = this.sourceMetrics[source];
    metrics.calls++;
    metrics.successSum += success.score;
    metrics.confidence = metrics.successSum / metrics.calls;
  }

  /**
   * Learn task patterns for future routing
   */
  _learnTaskPattern(context, tool, success) {
    // Create pattern key from context
    const patternKey = `${context.complexity || 'unknown'}:${context.taskType || 'unknown'}:${context.fileCount > 3 ? 'multi' : 'single'}`;

    if (!this.taskPatterns[patternKey]) {
      this.taskPatterns[patternKey] = {
        toolPerformance: {},
        totalSamples: 0
      };
    }

    const pattern = this.taskPatterns[patternKey];
    pattern.totalSamples++;

    if (!pattern.toolPerformance[tool]) {
      pattern.toolPerformance[tool] = { calls: 0, successSum: 0 };
    }

    pattern.toolPerformance[tool].calls++;
    pattern.toolPerformance[tool].successSum += success.score;
  }

  /**
   * Calculate trend from recent history
   */
  _calculateTrend(tool) {
    const toolHistory = this.routingHistory
      .filter(h => h.tool === tool)
      .slice(-20);

    if (toolHistory.length < 10) {
      return 'stable';
    }

    const recentHalf = toolHistory.slice(-5);
    const olderHalf = toolHistory.slice(0, 5);

    const recentAvg = recentHalf.reduce((sum, h) => sum + h.success, 0) / recentHalf.length;
    const olderAvg = olderHalf.reduce((sum, h) => sum + h.success, 0) / olderHalf.length;

    const diff = recentAvg - olderAvg;

    if (diff > 0.15) return 'improving';
    if (diff < -0.15) return 'degrading';
    return 'stable';
  }

  /**
   * Get recommended tool for a given context
   * Uses learned patterns to suggest optimal routing
   */
  getRecommendation(context) {
    const patternKey = `${context.complexity || 'unknown'}:${context.taskType || 'unknown'}:${(context.fileCount || 0) > 3 ? 'multi' : 'single'}`;
    const pattern = this.taskPatterns[patternKey];

    if (!pattern || pattern.totalSamples < this.config.minSamples) {
      return null; // Not enough data
    }

    // Find best performing tool for this pattern
    let bestTool = null;
    let bestScore = 0;

    for (const [tool, perf] of Object.entries(pattern.toolPerformance)) {
      if (perf.calls >= 3) {
        const avgSuccess = perf.successSum / perf.calls;
        // Weight by both success rate and tool confidence
        const toolConfidence = this.toolMetrics[tool]?.confidence || 0.5;
        const weightedScore = avgSuccess * 0.7 + toolConfidence * 0.3;

        if (weightedScore > bestScore) {
          bestScore = weightedScore;
          bestTool = tool;
        }
      }
    }

    if (bestTool && bestScore > 0.6) {
      return {
        tool: bestTool,
        confidence: bestScore,
        reason: `Learned: ${patternKey} → ${bestTool} (${(bestScore * 100).toFixed(0)}% confidence)`,
        source: 'compound_learning'
      };
    }

    return null;
  }

  /**
   * Get adaptive thresholds based on learning
   */
  getAdaptiveThresholds() {
    // Calculate optimal perception threshold based on hit rate
    const perceptionEffectiveness = this.perceptionHits.triggered > 0
      ? this.perceptionHits.beneficial / this.perceptionHits.triggered
      : 0.5;

    // If perception rarely helps, raise the threshold
    // If perception often helps, lower the threshold
    let perceptionThreshold = 40; // Default
    if (perceptionEffectiveness < 0.3 && this.perceptionHits.triggered > 20) {
      perceptionThreshold = 60; // Raise threshold - perception not helping
    } else if (perceptionEffectiveness > 0.8 && this.perceptionHits.triggered > 20) {
      perceptionThreshold = 30; // Lower threshold - perception is valuable
    }

    return {
      perceptionScoreThreshold: perceptionThreshold,
      perceptionEffectiveness,
      recommendations: this._generateRecommendations()
    };
  }

  /**
   * Generate actionable recommendations
   */
  _generateRecommendations() {
    const recommendations = [];

    // Check for degrading tools
    for (const [tool, metrics] of Object.entries(this.toolMetrics)) {
      if (metrics.trend === 'degrading' && metrics.totalCalls >= 10) {
        recommendations.push({
          type: 'warning',
          message: `${tool} performance is degrading (confidence: ${(metrics.confidence * 100).toFixed(0)}%)`,
          action: 'Consider routing fewer tasks to this tool'
        });
      }

      // Check for task-type specialization opportunities
      for (const [taskType, typeMetrics] of Object.entries(metrics.byTaskType)) {
        if (typeMetrics.calls >= 5) {
          const successRate = typeMetrics.success / typeMetrics.calls;
          if (successRate > 0.9) {
            recommendations.push({
              type: 'insight',
              message: `${tool} excels at ${taskType} tasks (${(successRate * 100).toFixed(0)}% success)`,
              action: 'Consider prioritizing this tool for this task type'
            });
          } else if (successRate < 0.4) {
            recommendations.push({
              type: 'warning',
              message: `${tool} struggles with ${taskType} tasks (${(successRate * 100).toFixed(0)}% success)`,
              action: 'Consider routing these tasks elsewhere'
            });
          }
        }
      }
    }

    return recommendations;
  }

  /**
   * Get learning summary/analytics
   */
  getSummary() {
    const toolSummaries = {};
    for (const [tool, metrics] of Object.entries(this.toolMetrics)) {
      toolSummaries[tool] = {
        confidence: metrics.confidence,
        totalCalls: metrics.totalCalls,
        successRate: metrics.totalCalls > 0 ? metrics.successfulCalls / metrics.totalCalls : 0,
        trend: metrics.trend
      };
    }

    return {
      totalDecisions: this.routingHistory.length,
      toolPerformance: toolSummaries,
      sourcePerformance: this.sourceMetrics || {},
      perceptionStats: this.perceptionHits,
      patternCount: Object.keys(this.taskPatterns).length,
      adaptiveThresholds: this.getAdaptiveThresholds(),
      recommendations: this._generateRecommendations()
    };
  }

  /**
   * Apply daily confidence decay (call once per day)
   */
  applyConfidenceDecay() {
    for (const metrics of Object.values(this.toolMetrics)) {
      // Decay towards 0.5 (neutral)
      metrics.confidence = 0.5 + (metrics.confidence - 0.5) * this.config.confidenceDecay;
    }
    this._saveState();
  }

  /**
   * Ensure data directory exists
   */
  _ensureDataDir() {
    const dir = this.config.dataDir;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Save state to disk
   */
  _saveState() {
    try {
      const state = {
        toolMetrics: this.toolMetrics,
        taskPatterns: this.taskPatterns,
        sourceMetrics: this.sourceMetrics,
        perceptionHits: this.perceptionHits,
        routingHistory: this.routingHistory.slice(-200), // Keep last 200
        savedAt: Date.now()
      };

      const filePath = path.join(this.config.dataDir, 'learning-state.json');
      fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
    } catch (error) {
      console.error('Failed to save learning state:', error.message);
    }
  }

  /**
   * Load state from disk
   */
  _loadState() {
    try {
      const filePath = path.join(this.config.dataDir, 'learning-state.json');
      if (fs.existsSync(filePath)) {
        const state = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        this.toolMetrics = state.toolMetrics || {};
        this.taskPatterns = state.taskPatterns || {};
        this.sourceMetrics = state.sourceMetrics || {};
        this.perceptionHits = state.perceptionHits || { triggered: 0, skipped: 0, beneficial: 0 };
        this.routingHistory = state.routingHistory || [];
        console.log(`[CompoundLearning] Loaded state: ${Object.keys(this.toolMetrics).length} tools, ${Object.keys(this.taskPatterns).length} patterns`);
      }
    } catch (error) {
      console.error('Failed to load learning state:', error.message);
    }
  }

  /**
   * Reset all learned data
   */
  reset() {
    this.toolMetrics = {};
    this.taskPatterns = {};
    this.sourceMetrics = {};
    this.perceptionHits = { triggered: 0, skipped: 0, beneficial: 0 };
    this.routingHistory = [];
    this._saveState();
  }
}

export { CompoundLearningEngine, FeedbackType };
export default CompoundLearningEngine;
