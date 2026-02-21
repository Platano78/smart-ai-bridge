/**
 * @file LearningEngine module for the SAB dual-iterate system.
 * @description Tracks successful patterns and anti-patterns for RAG injection.
 */

import { PatternRAGStore } from './pattern-rag-store.js';

/**
 * LearningEngine - Manages pattern learning and injection for code generation
 */
class LearningEngine {
  /**
   * Create a new LearningEngine instance
   * @param {Object} options
   * @param {PatternRAGStore} options.patternStore - Store for successful patterns
   * @param {PatternRAGStore} options.antiPatternStore - Store for anti-patterns
   * @param {number} options.maxPatternAge - Maximum age in ms before patterns are stale
   * @param {number} options.implicitSuccessTimeoutMs - Time to wait for implicit success detection
   */
  constructor(options = {}) {
    this.patternStore = options.patternStore || new PatternRAGStore();
    this.antiPatternStore = options.antiPatternStore || new PatternRAGStore({
      storagePath: options.antiPatternStoragePath || './data/anti-patterns.json'
    });
    this.maxPatternAge = options.maxPatternAge || 30 * 24 * 60 * 60 * 1000; // 30 days
    this.implicitSuccessTimeoutMs = options.implicitSuccessTimeoutMs || 60000; // 60 seconds

    // Track pending implicit success detections
    this.pendingImplicitSuccess = new Map();

    console.error('[LearningEngine] Initialized');
  }

  /**
   * Initialize the engine (load stores)
   * @returns {Promise<void>}
   */
  async init() {
    await Promise.all([
      this.patternStore.init?.() || this.patternStore.load(),
      this.antiPatternStore.init?.() || this.antiPatternStore.load()
    ]);
  }

  /**
   * Record an execution outcome
   * @param {Object} outcome - Execution outcome details
   * @returns {Promise<void>}
   */
  async recordOutcome(outcome) {
    const { task, code, context, execution, review } = outcome;

    if (execution?.completed && review?.approved !== false) {
      // Successful execution - add to pattern store
      const pattern = await this.patternStore.addPattern({
        task,
        code,
        metadata: {
          taskType: context?.taskType || 'general',
          complexity: context?.complexity || 'medium',
          confidence: review?.confidence || 0.8
        }
      });

      if (pattern) {
        console.error(`[LearningEngine] Recorded successful pattern: ${pattern.id}`);
      }
    } else if (review?.approved === false) {
      // Rejection - record as anti-pattern
      await this.recordRejection(task, code, review?.critique || 'Unknown reason');
    }
  }

  /**
   * Record implicit success (Claude didn't request changes)
   * @param {string} task - Task description
   * @param {string} code - Generated code
   * @returns {Promise<void>}
   */
  async recordImplicitSuccess(task, code) {
    const pattern = await this.patternStore.addPattern({
      task,
      code,
      metadata: {
        taskType: 'general',
        complexity: 'medium',
        confidence: 0.6, // Lower confidence for implicit success
        implicit: true
      }
    });

    if (pattern) {
      console.error(`[LearningEngine] Recorded implicit success: ${pattern.id}`);
    }
  }

  /**
   * Start tracking for implicit success detection
   * @param {string} requestId - Unique request identifier
   * @param {string} task - Task description
   * @param {string} code - Generated code
   */
  startImplicitSuccessTracking(requestId, task, code) {
    const timeoutId = setTimeout(async () => {
      // No follow-up request - mark as implicit success
      await this.recordImplicitSuccess(task, code);
      this.pendingImplicitSuccess.delete(requestId);
    }, this.implicitSuccessTimeoutMs);

    this.pendingImplicitSuccess.set(requestId, {
      task,
      code,
      timeoutId,
      startTime: Date.now()
    });
  }

  /**
   * Cancel implicit success tracking (follow-up request received)
   * @param {string} requestId - Request identifier to cancel
   */
  cancelImplicitSuccessTracking(requestId) {
    const pending = this.pendingImplicitSuccess.get(requestId);
    if (pending) {
      clearTimeout(pending.timeoutId);
      this.pendingImplicitSuccess.delete(requestId);
    }
  }

  /**
   * Record a rejection as an anti-pattern
   * @param {string} task - Task description
   * @param {string} code - Rejected code
   * @param {string} reason - Reason for rejection
   * @returns {Promise<void>}
   */
  async recordRejection(task, code, reason) {
    const antiPattern = await this.antiPatternStore.addPattern({
      task,
      code: `${code}\n\n// REJECTION REASON: ${reason}`,
      metadata: {
        taskType: 'anti-pattern',
        complexity: 'high',
        reason
      }
    });

    if (antiPattern) {
      console.error(`[LearningEngine] Recorded anti-pattern: ${antiPattern.id}`);
    }
  }

  /**
   * Get relevant successful patterns for a task
   * @param {string} task - Task description
   * @param {number} limit - Maximum patterns to return
   * @returns {Promise<Array>} Relevant patterns
   */
  async getRelevantPatterns(task, limit = 3) {
    const patterns = await this.patternStore.findSimilar(task, limit);
    return patterns.map(pattern => ({
      id: pattern.id,
      task: pattern.task,
      code: pattern.code,
      successRate: this._calculateSuccessRate(pattern),
      lastUsed: pattern.metadata.lastUsed
    }));
  }

  /**
   * Get relevant anti-patterns for a task
   * @param {string} task - Task description
   * @param {number} limit - Maximum anti-patterns to return
   * @returns {Promise<Array>} Relevant anti-patterns
   */
  async getAntiPatterns(task, limit = 2) {
    const antiPatterns = await this.antiPatternStore.findSimilar(task, limit);
    return antiPatterns.map(pattern => {
      // Extract reason from stored code
      const reasonMatch = pattern.code.match(/\/\/ REJECTION REASON: (.+)$/m);
      return {
        id: pattern.id,
        reason: reasonMatch?.[1] || pattern.metadata?.reason || 'Unknown issue',
        codeSnippet: pattern.code.split('\n// REJECTION REASON:')[0].substring(0, 200)
      };
    });
  }

  /**
   * Build an augmented prompt with pattern injection
   * @param {string} task - Original task description
   * @returns {Promise<string>} Augmented prompt addition
   */
  async buildAugmentedPrompt(task) {
    const patterns = await this.getRelevantPatterns(task, 3);
    const antiPatterns = await this.getAntiPatterns(task, 2);

    let promptAddition = '';

    if (patterns.length > 0) {
      promptAddition += '\n\n--- SIMILAR SUCCESSFUL PATTERNS ---\n';
      patterns.forEach((pattern, index) => {
        const successRate = Math.round(pattern.successRate * 100);
        promptAddition += `\nPattern ${index + 1} (task: "${pattern.task.substring(0, 50)}...", success rate: ${successRate}%):\n`;
        promptAddition += '```\n' + pattern.code.substring(0, 500) + '\n```\n';
      });
    }

    if (antiPatterns.length > 0) {
      promptAddition += '\n--- ANTI-PATTERNS TO AVOID ---\n';
      antiPatterns.forEach(antiPattern => {
        promptAddition += `- ${antiPattern.reason}\n`;
      });
    }

    return promptAddition;
  }

  /**
   * Prune stale patterns from stores
   * @param {number} maxAgeDays - Maximum age in days
   * @returns {Promise<Object>} Pruning statistics
   */
  async pruneStalePatterns(maxAgeDays = 30) {
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    const cutoffTime = Date.now() - maxAgeMs;

    let prunedPatterns = 0;
    let prunedAntiPatterns = 0;

    // Prune pattern store
    const patternsToRemove = this.patternStore.patterns.filter(
      p => p.metadata.lastUsed < cutoffTime && p.metadata.successCount === 0
    );

    for (const pattern of patternsToRemove) {
      const index = this.patternStore.patterns.indexOf(pattern);
      if (index > -1) {
        this.patternStore.patterns.splice(index, 1);
        prunedPatterns++;
      }
    }

    // Prune anti-pattern store
    const antiPatternsToRemove = this.antiPatternStore.patterns.filter(
      p => p.metadata.lastUsed < cutoffTime
    );

    for (const antiPattern of antiPatternsToRemove) {
      const index = this.antiPatternStore.patterns.indexOf(antiPattern);
      if (index > -1) {
        this.antiPatternStore.patterns.splice(index, 1);
        prunedAntiPatterns++;
      }
    }

    // Save updated stores
    await Promise.all([
      this.patternStore.save(),
      this.antiPatternStore.save()
    ]);

    console.error(`[LearningEngine] Pruned ${prunedPatterns} patterns, ${prunedAntiPatterns} anti-patterns`);

    return {
      prunedPatterns,
      prunedAntiPatterns,
      remainingPatterns: this.patternStore.patterns.length,
      remainingAntiPatterns: this.antiPatternStore.patterns.length
    };
  }

  /**
   * Calculate success rate for a pattern
   * @private
   */
  _calculateSuccessRate(pattern) {
    const successCount = pattern.metadata?.successCount || 0;
    // Base rate starts at confidence, increases with success count
    const baseRate = pattern.metadata?.confidence || 0.5;
    const successBonus = Math.min(successCount * 0.05, 0.4);
    return Math.min(baseRate + successBonus, 1.0);
  }

  /**
   * Get engine statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      patterns: this.patternStore.getStats?.() || { totalPatterns: this.patternStore.patterns?.length || 0 },
      antiPatterns: this.antiPatternStore.getStats?.() || { totalPatterns: this.antiPatternStore.patterns?.length || 0 },
      pendingImplicitSuccess: this.pendingImplicitSuccess.size
    };
  }
}

export { LearningEngine };
