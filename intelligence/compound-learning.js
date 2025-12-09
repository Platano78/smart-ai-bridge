/**
 * Smart AI Bridge v1.3.0 - Compound Learning Engine
 * 
 * Self-improving backend routing through outcome tracking:
 * 1. Outcome Tracking - Records success/failure of backend selections
 * 2. Confidence Adjustment - Updates backend weights using EMA
 * 3. Pattern Recognition - Identifies task patterns that predict success
 * 4. Adaptive Routing - Learns optimal backend for each pattern
 *
 * Ported from MKG V2 compound-learning.js
 * Adapted for Smart AI Bridge's backend adapter architecture
 */

import fs from 'fs';
import path from 'path';

/**
 * Feedback types for routing outcomes
 */
const FeedbackType = {
  SUCCESS: 'success',           // Task completed successfully
  PARTIAL: 'partial',           // Partially successful
  FAILURE: 'failure',           // Task failed
  TIMEOUT: 'timeout',           // Execution timed out
  ERROR: 'error'                // Execution error
};

/**
 * Compound Learning Engine
 * Tracks backend performance and learns optimal routing patterns
 */
class CompoundLearningEngine {
  constructor(config = {}) {
    this.config = {
      dataDir: config.dataDir || './data/learning',
      emaAlpha: config.emaAlpha || 0.2,          // Exponential moving average factor
      minSamples: config.minSamples || 5,         // Min samples before recommending
      confidenceThreshold: config.confidenceThreshold || 0.6, // Min confidence for recommendation
      ...config
    };

    // In-memory state
    this.backendMetrics = {};    // Per-backend performance metrics
    this.taskPatterns = {};      // Task pattern → outcome mapping
    this.routingHistory = [];    // Recent routing decisions

    // Ensure data directory exists
    this._ensureDataDir();

    // Load persisted state
    this._loadState();
  }

  /**
   * Record a routing outcome for learning
   * @param {Object} outcome - Outcome data
   * @param {string} outcome.backend - Backend that was used
   * @param {Object} outcome.context - Request context (complexity, taskType, etc.)
   * @param {boolean} outcome.success - Whether request succeeded
   * @param {number} outcome.latency - Response latency in ms
   * @param {string} outcome.source - Routing decision source
   */
  recordOutcome(outcome) {
    const {
      backend,
      context,
      success,
      latency,
      source = 'unknown'
    } = outcome;

    const timestamp = Date.now();
    const successScore = success ? 1.0 : 0.0;

    // Update backend metrics with EMA
    this._updateBackendMetrics(backend, successScore, latency, context);

    // Learn task patterns
    this._learnTaskPattern(context, backend, successScore);

    // Add to history
    this.routingHistory.push({
      timestamp,
      backend,
      source,
      success: successScore,
      latency,
      context: {
        complexity: context.complexity,
        taskType: context.taskType
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
      backendConfidence: this.backendMetrics[backend]?.confidence || 0.5,
      successScore
    };
  }

  /**
   * Update backend metrics using Exponential Moving Average
   * @private
   */
  _updateBackendMetrics(backend, successScore, latency, context) {
    if (!this.backendMetrics[backend]) {
      this.backendMetrics[backend] = {
        confidence: 0.5,
        totalCalls: 0,
        successfulCalls: 0,
        totalLatency: 0,
        avgLatency: 0,
        byComplexity: {
          low: { calls: 0, success: 0 },
          medium: { calls: 0, success: 0 },
          high: { calls: 0, success: 0 }
        },
        byTaskType: {},
        trend: 'stable',
        lastUpdated: Date.now()
      };
    }

    const metrics = this.backendMetrics[backend];
    metrics.totalCalls++;
    metrics.totalLatency += latency;
    metrics.avgLatency = metrics.totalLatency / metrics.totalCalls;

    if (successScore >= 0.7) {
      metrics.successfulCalls++;
    }

    // EMA confidence update
    // Formula: new_confidence = alpha * observation + (1 - alpha) * old_confidence
    metrics.confidence = this.config.emaAlpha * successScore +
                         (1 - this.config.emaAlpha) * metrics.confidence;

    // Track by complexity
    const complexity = context.complexity || 'medium';
    if (metrics.byComplexity[complexity]) {
      metrics.byComplexity[complexity].calls++;
      if (successScore >= 0.7) {
        metrics.byComplexity[complexity].success++;
      }
    }

    // Track by task type
    const taskType = context.taskType || 'unknown';
    if (!metrics.byTaskType[taskType]) {
      metrics.byTaskType[taskType] = { calls: 0, success: 0 };
    }
    metrics.byTaskType[taskType].calls++;
    if (successScore >= 0.7) {
      metrics.byTaskType[taskType].success++;
    }

    // Calculate trend
    metrics.trend = this._calculateTrend(backend);
    metrics.lastUpdated = Date.now();
  }

  /**
   * Learn task patterns for future routing
   * @private
   */
  _learnTaskPattern(context, backend, successScore) {
    // Create pattern key from context
    const complexity = context.complexity || 'unknown';
    const taskType = context.taskType || 'unknown';
    const patternKey = `${complexity}:${taskType}`;

    if (!this.taskPatterns[patternKey]) {
      this.taskPatterns[patternKey] = {
        backendPerformance: {},
        totalSamples: 0
      };
    }

    const pattern = this.taskPatterns[patternKey];
    pattern.totalSamples++;

    if (!pattern.backendPerformance[backend]) {
      pattern.backendPerformance[backend] = { calls: 0, successSum: 0 };
    }

    pattern.backendPerformance[backend].calls++;
    pattern.backendPerformance[backend].successSum += successScore;
  }

  /**
   * Calculate trend from recent history
   * @private
   */
  _calculateTrend(backend) {
    const backendHistory = this.routingHistory
      .filter(h => h.backend === backend)
      .slice(-20);

    if (backendHistory.length < 10) {
      return 'stable';
    }

    const recentHalf = backendHistory.slice(-5);
    const olderHalf = backendHistory.slice(0, 5);

    const recentAvg = recentHalf.reduce((sum, h) => sum + h.success, 0) / recentHalf.length;
    const olderAvg = olderHalf.reduce((sum, h) => sum + h.success, 0) / olderHalf.length;

    const diff = recentAvg - olderAvg;

    if (diff > 0.15) return 'improving';
    if (diff < -0.15) return 'degrading';
    return 'stable';
  }

  /**
   * Get recommended backend for a given context
   * Uses learned patterns to suggest optimal routing
   * @param {Object} context - Request context
   * @returns {Object|null} Recommendation with backend and confidence
   */
  getRecommendation(context) {
    const complexity = context.complexity || 'unknown';
    const taskType = context.taskType || 'unknown';
    const patternKey = `${complexity}:${taskType}`;
    const pattern = this.taskPatterns[patternKey];

    if (!pattern || pattern.totalSamples < this.config.minSamples) {
      return null; // Not enough data
    }

    // Find best performing backend for this pattern
    let bestBackend = null;
    let bestScore = 0;

    for (const [backend, perf] of Object.entries(pattern.backendPerformance)) {
      if (perf.calls >= 3) {
        const avgSuccess = perf.successSum / perf.calls;
        // Weight by both success rate and backend confidence
        const backendConfidence = this.backendMetrics[backend]?.confidence || 0.5;
        const weightedScore = avgSuccess * 0.7 + backendConfidence * 0.3;

        if (weightedScore > bestScore) {
          bestScore = weightedScore;
          bestBackend = backend;
        }
      }
    }

    if (bestBackend && bestScore > this.config.confidenceThreshold) {
      return {
        backend: bestBackend,
        confidence: bestScore,
        reason: `Learned: ${patternKey} → ${bestBackend} (${(bestScore * 100).toFixed(0)}% confidence)`,
        source: 'compound_learning'
      };
    }

    return null;
  }

  /**
   * Get learning summary/analytics
   * @returns {Object} Summary of learning state
   */
  getSummary() {
    const backendSummaries = {};
    for (const [backend, metrics] of Object.entries(this.backendMetrics)) {
      backendSummaries[backend] = {
        confidence: metrics.confidence,
        totalCalls: metrics.totalCalls,
        successRate: metrics.totalCalls > 0 ? metrics.successfulCalls / metrics.totalCalls : 0,
        avgLatency: metrics.avgLatency,
        trend: metrics.trend
      };
    }

    return {
      totalDecisions: this.routingHistory.length,
      backendPerformance: backendSummaries,
      patternCount: Object.keys(this.taskPatterns).length,
      recommendations: this._generateRecommendations()
    };
  }

  /**
   * Generate actionable recommendations
   * @private
   */
  _generateRecommendations() {
    const recommendations = [];

    // Check for degrading backends
    for (const [backend, metrics] of Object.entries(this.backendMetrics)) {
      if (metrics.trend === 'degrading' && metrics.totalCalls >= 10) {
        recommendations.push({
          type: 'warning',
          message: `${backend} performance is degrading (confidence: ${(metrics.confidence * 100).toFixed(0)}%)`,
          action: 'Consider routing fewer tasks to this backend'
        });
      }

      // Check for task-type specialization opportunities
      for (const [taskType, typeMetrics] of Object.entries(metrics.byTaskType)) {
        if (typeMetrics.calls >= 5) {
          const successRate = typeMetrics.success / typeMetrics.calls;
          if (successRate > 0.9) {
            recommendations.push({
              type: 'insight',
              message: `${backend} excels at ${taskType} tasks (${(successRate * 100).toFixed(0)}% success)`,
              action: 'Consider prioritizing this backend for this task type'
            });
          } else if (successRate < 0.4) {
            recommendations.push({
              type: 'warning',
              message: `${backend} struggles with ${taskType} tasks (${(successRate * 100).toFixed(0)}% success)`,
              action: 'Consider routing these tasks elsewhere'
            });
          }
        }
      }
    }

    return recommendations;
  }

  /**
   * Ensure data directory exists
   * @private
   */
  _ensureDataDir() {
    const dir = this.config.dataDir;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Save state to disk
   * @private
   */
  _saveState() {
    try {
      const state = {
        backendMetrics: this.backendMetrics,
        taskPatterns: this.taskPatterns,
        routingHistory: this.routingHistory.slice(-200), // Keep last 200
        savedAt: Date.now()
      };

      const filePath = path.join(this.config.dataDir, 'learning-state.json');
      fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
    } catch (error) {
      console.error('[CompoundLearning] Failed to save state:', error.message);
    }
  }

  /**
   * Load state from disk
   * @private
   */
  _loadState() {
    try {
      const filePath = path.join(this.config.dataDir, 'learning-state.json');
      if (fs.existsSync(filePath)) {
        const state = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        this.backendMetrics = state.backendMetrics || {};
        this.taskPatterns = state.taskPatterns || {};
        this.routingHistory = state.routingHistory || [];
        console.error(`[CompoundLearning] Loaded state: ${Object.keys(this.backendMetrics).length} backends, ${Object.keys(this.taskPatterns).length} patterns`);
      }
    } catch (error) {
      console.error('[CompoundLearning] Failed to load state:', error.message);
    }
  }

  /**
   * Reset all learned data
   */
  reset() {
    this.backendMetrics = {};
    this.taskPatterns = {};
    this.routingHistory = [];
    this._saveState();
  }
}

export { CompoundLearningEngine, FeedbackType };
export default CompoundLearningEngine;
