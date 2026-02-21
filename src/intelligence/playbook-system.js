/**
 * @fileoverview PlaybookSystem - Self-improving execution learning
 * @module intelligence/playbook-system
 *
 * Extracted from smart-ai-bridge.js (lines 86-333)
 * Learns from executions and enhances routing decisions
 */

/**
 * @typedef {Object} PlaybookConfig
 * @property {boolean} enabled - Whether playbook learning is enabled
 * @property {number} minExecutionTimeForReflection - Minimum execution time to trigger reflection (ms)
 * @property {number} maxLessonsPerExecution - Maximum lessons to extract per execution
 * @property {number} lessonStrengthDecay - Decay factor for old lessons
 * @property {number} topLessonsToInject - Number of lessons to inject into routing
 * @property {string[]} reflectionBackends - Which backends can extract lessons
 */

/**
 * @typedef {Object} Lesson
 * @property {string} lesson - The actionable lesson text
 * @property {string} category - Category: routing|performance|error_handling|context_management
 * @property {string} applies_when - Condition when this lesson applies
 * @property {number} [strength] - Lesson strength score
 */

/**
 * @typedef {Object} ExecutionResult
 * @property {boolean} success - Whether execution succeeded
 * @property {string} [backend] - Backend used
 * @property {number} [processingTime] - Processing time in ms
 * @property {number} [tokenCount] - Token count
 * @property {string} [error] - Error message if failed
 * @property {string} [summary] - Result summary
 * @property {string} [content] - Result content
 */

/**
 * @typedef {Object} ExecutionContext
 * @property {string} [taskType] - Type of task
 * @property {string} [prompt] - Task prompt
 * @property {string} [tool] - Tool being used
 * @property {string} [backend] - Backend used
 */

/** @type {PlaybookConfig} */
const DEFAULT_PLAYBOOK_CONFIG = {
  enabled: true,
  minExecutionTimeForReflection: 1000,
  maxLessonsPerExecution: 3,
  lessonStrengthDecay: 0.95,
  topLessonsToInject: 5,
  reflectionBackends: ['local', 'nvidia_deepseek']
};

/**
 * Module-level shared lesson cache for cross-instance learning
 * This allows lessons learned by handlers to be shared with routing system
 * @type {{lessons: Lesson[], lastRefresh: number}}
 */
const SHARED_LESSON_CACHE = {
  lessons: [],
  lastRefresh: 0
};

class PlaybookSystem {
  /**
   * Create a new PlaybookSystem
   * @param {Partial<PlaybookConfig>} [config] - Configuration options
   */
  constructor(config = {}) {
    /** @type {PlaybookConfig} */
    this.config = { ...DEFAULT_PLAYBOOK_CONFIG, ...config };

    // Use shared module-level cache instead of instance cache
    // This enables learning loop across handlers and routing system

    /** @type {number} */
    this.refreshInterval = 5 * 60 * 1000; // 5 minutes

    /** @type {string[]} */
    this.reflectableTools = ['ask', 'review', 'edit_file', 'multi_edit', 'analyze'];
  }

  /** @type {Lesson[]} - Accessor for shared cache */
  get cachedLessons() {
    return SHARED_LESSON_CACHE.lessons;
  }

  set cachedLessons(value) {
    SHARED_LESSON_CACHE.lessons = value;
  }

  /** @type {number} - Accessor for shared refresh timestamp */
  get lastRefresh() {
    return SHARED_LESSON_CACHE.lastRefresh;
  }

  set lastRefresh(value) {
    SHARED_LESSON_CACHE.lastRefresh = value;
  }

  /**
   * Extract actionable lessons from an execution result
   * @param {ExecutionResult} executionResult - The execution result
   * @param {ExecutionContext} context - Execution context
   * @param {Object} [router] - Router for making reflection requests
   * @returns {Promise<Lesson[]>}
   */
  async extractLessonsFromExecution(executionResult, context, router = null) {
    // Skip reflection for trivial operations
    if (executionResult.processingTime < this.config.minExecutionTimeForReflection) {
      return [];
    }

    // Skip if reflection is disabled
    if (!this.config.enabled) {
      return [];
    }

    const reflectionPrompt = `Analyze this SAB execution and extract 1-3 actionable lessons for future routing decisions.

EXECUTION CONTEXT:
- Task Type: ${context.taskType || 'unknown'}
- Backend Used: ${executionResult.backend || 'unknown'}
- Success: ${executionResult.success}
- Processing Time: ${executionResult.processingTime}ms
- Token Count: ${executionResult.tokenCount || 'unknown'}
- Error (if any): ${executionResult.error || 'none'}

TASK DESCRIPTION:
${context.prompt?.substring(0, 500) || 'No prompt available'}

RESULT SUMMARY:
${executionResult.summary || executionResult.content?.substring(0, 300) || 'No result'}

Extract ONLY actionable routing lessons in this JSON format:
{
  "lessons": [
    {
      "lesson": "One clear, actionable statement about when to use or avoid this backend",
      "category": "routing|performance|error_handling|context_management",
      "applies_when": "Specific condition when this lesson applies"
    }
  ]
}

Rules:
- Only extract lessons that would help FUTURE routing decisions
- Be specific about conditions (token counts, task types, error patterns)
- Skip if there's nothing novel to learn from this execution
- Return empty lessons array if execution was routine`;

    try {
      if (!router) {
        console.error('[Playbook] No router available for lesson extraction');
        return [];
      }

      const reflectionResult = await router.makeRequest(reflectionPrompt, 'local', {
        maxTokens: 500,
        thinking: false
      });

      const content = reflectionResult.content || reflectionResult;
      const jsonMatch = content.match(/\{[\s\S]*"lessons"[\s\S]*\}/);
      if (!jsonMatch) {
        return [];
      }
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.lessons || [];
    } catch (error) {
      console.error('[Playbook] Lesson extraction failed (non-critical):', error.message);
      return [];
    }
  }

  /**
   * Store a lesson in Faulkner-DB with strength scoring
   * @param {Lesson} lesson - The lesson to store
   * @param {ExecutionContext} executionContext - Execution context
   * @param {Object} [server] - Server instance for MCP calls
   * @returns {Promise<boolean>}
   */
  async storeLesson(lesson, executionContext, server = null) {
    try {
      const patternName = `playbook-${lesson.category}-${Date.now()}`;

      // ALWAYS add to shared in-memory cache for immediate availability
      const cacheEntry = {
        lesson: lesson.lesson,
        category: lesson.category || 'routing',
        applies_when: lesson.applies_when,
        backend: executionContext.backend,
        strength: lesson.strength || 1,
        timestamp: Date.now()
      };

      // Add to shared cache (deduplicate by lesson text)
      const existingIdx = this.cachedLessons.findIndex(l => l.lesson === lesson.lesson);
      if (existingIdx >= 0) {
        // Strengthen existing lesson
        this.cachedLessons[existingIdx].strength = (this.cachedLessons[existingIdx].strength || 1) + 0.5;
      } else {
        // Add new lesson at the front
        this.cachedLessons.unshift(cacheEntry);
        // Keep cache bounded
        if (this.cachedLessons.length > 50) {
          this.cachedLessons.pop();
        }
      }

      // Also persist to Faulkner-DB if available
      if (server && typeof server.callExternalMCP === 'function') {
        await server.callExternalMCP('faulkner-db', 'add_pattern', {
          name: patternName,
          context: `SAB Playbook Lesson - ${lesson.category}`,
          implementation: lesson.lesson,
          use_cases: [
            lesson.applies_when,
            `Backend: ${executionContext.backend}`,
            `Task Type: ${executionContext.taskType}`
          ]
        });
        console.error(`[Playbook] Stored lesson (cache + DB): ${lesson.lesson.substring(0, 50)}...`);
        return true;
      }

      console.error(`[Playbook] Cached lesson: ${lesson.lesson.substring(0, 50)}...`);
      return true; // In-memory storage succeeded
    } catch (error) {
      console.error('[Playbook] Failed to store lesson:', error.message);
      return false;
    }
  }


  /**
   * Store lesson with source authority and conflict resolution
   * Used by tri-mode orchestrator for GPU (weight=1) vs CPU (weight=2) lessons
   *
   * Conflict resolution rules:
   * 1. If new.originTimestamp < existing.originTimestamp - 5min, reject (stale)
   * 2. If timestamps within 5min and existing.sourceWeight > new.sourceWeight, reject
   * 3. Otherwise store (newer or higher weight wins)
   *
   * @param {Object} lesson - Lesson object with lesson, category, applies_when
   * @param {Object} executionContext - Context with backend, taskType, source, sourceWeight, originTimestamp
   * @param {Object} server - Optional server for Faulkner-DB persistence
   */
  async storeLessonWithAuthority(lesson, executionContext, server = null) {
    const FIVE_MINUTES_MS = 5 * 60 * 1000;
    const MATURITY_THRESHOLD = 10;  // T5: Lessons mature after 10 observations

    try {
      const {
        backend,
        taskType,
        source,
        sourceWeight = 1,
        originTimestamp = Date.now(),
        modelVersion = null  // T6: Model version hash for invalidation
      } = executionContext;

      // Find existing lesson
      const existingIdx = this.cachedLessons.findIndex(l =>
        l.lesson === lesson.lesson ||
        (l.category === lesson.category && l.applies_when === lesson.applies_when)
      );

      const existingLesson = existingIdx >= 0 ? this.cachedLessons[existingIdx] : null;

      // T6: Check if existing lesson should be invalidated due to model change
      if (existingLesson && modelVersion && existingLesson.modelVersion &&
          existingLesson.modelVersion !== modelVersion) {
        console.error(`[Playbook] Invalidating lesson due to model version change`);
        this.cachedLessons.splice(existingIdx, 1);
        // Continue to add as new lesson
      } else if (existingLesson) {
        // T6: Stability dampener - can't overwrite until 5 min old
        const lessonAge = Date.now() - (existingLesson.timestamp || 0);
        if (lessonAge < FIVE_MINUTES_MS) {
          // During dampening period, only higher weight + 0.5 can override
          if (sourceWeight <= (existingLesson.sourceWeight || 1) + 0.5) {
            console.error(`[Playbook] Stability dampener: lesson too new to overwrite (${Math.round(lessonAge / 1000)}s old)`);
            // Update observation count instead
            existingLesson.observationCount = (existingLesson.observationCount || 0) + 1;
            existingLesson.successCount = (existingLesson.successCount || 0) + 1;
            // T5: Bayesian confidence update
            existingLesson.confidence = this._updateConfidence(existingLesson);
            return true;
          }
        }

        // Standard conflict resolution
        const timeDiff = originTimestamp - (existingLesson.originTimestamp || existingLesson.timestamp || 0);

        // Reject if new lesson is more than 5 min older than existing
        if (timeDiff < -FIVE_MINUTES_MS) {
          console.error(`[Playbook] Rejected stale lesson from ${source} (${Math.round(-timeDiff / 1000)}s older)`);
          return false;
        }

        // T4 & T6: Compare scores using enhanced formula
        const existingScore = this._calculateLessonScore(existingLesson);
        const incomingScore = this._calculateLessonScore({
          sourceWeight,
          confidence: lesson.confidence || 0.1,  // T5: New lessons start low
          timestamp: originTimestamp
        });

        if (incomingScore <= existingScore && Math.abs(timeDiff) <= FIVE_MINUTES_MS) {
          console.error(`[Playbook] Rejected lower-score lesson from ${source} (score ${incomingScore.toFixed(2)} <= ${existingScore.toFixed(2)})`);
          return false;
        }
      }

      // T5: Cold-start - new lessons start with low confidence
      const isUpdate = existingLesson && lesson.lesson === existingLesson.lesson;
      const cacheEntry = {
        lesson: lesson.lesson,
        category: lesson.category || 'routing',
        applies_when: lesson.applies_when,
        backend,
        taskType,
        source,
        sourceWeight,
        originTimestamp,
        timestamp: Date.now(),
        modelVersion,  // T6: Track model version
        // T5: Cold-start confidence handling
        confidence: isUpdate
          ? this._updateConfidence(existingLesson)
          : 0.1,  // New lessons start at 0.1
        observationCount: isUpdate
          ? (existingLesson.observationCount || 0) + 1
          : 1,
        successCount: isUpdate
          ? (existingLesson.successCount || 0) + 1
          : 1,
        failureCount: isUpdate
          ? (existingLesson.failureCount || 0)
          : 0,
        // T4: Calculate score
        score: 0  // Will be set below
      };

      cacheEntry.score = this._calculateLessonScore(cacheEntry);

      // Update or add to cache
      if (existingIdx >= 0) {
        this.cachedLessons[existingIdx] = cacheEntry;
        console.error(`[Playbook] Updated lesson from ${source} (weight=${sourceWeight}, conf=${cacheEntry.confidence.toFixed(2)}, score=${cacheEntry.score.toFixed(2)})`);
      } else {
        this.cachedLessons.unshift(cacheEntry);
        if (this.cachedLessons.length > 50) {
          this.cachedLessons.pop();
        }
        console.error(`[Playbook] Added new lesson from ${source} (weight=${sourceWeight}, conf=${cacheEntry.confidence.toFixed(2)})`);
      }

      // Persist to Faulkner-DB if available
      if (server && typeof server.callExternalMCP === 'function') {
        const patternName = `playbook-${lesson.category}-${Date.now()}`;
        await server.callExternalMCP('faulkner-db', 'add_pattern', {
          name: patternName,
          context: `SAB Playbook Lesson - ${lesson.category} (${source})`,
          implementation: lesson.lesson,
          use_cases: [
            lesson.applies_when,
            `Backend: ${backend}`,
            `Task Type: ${taskType}`,
            `Source: ${source} (weight=${sourceWeight}, conf=${cacheEntry.confidence.toFixed(2)})`
          ]
        });
      }

      return true;
    } catch (error) {
      console.error('[Playbook] Failed to store lesson with authority:', error.message);
      return false;
    }
  }

  // ==================== Lesson Scoring Helpers (T4, T5) ====================

  /**
   * T4: Calculate lesson score using weight × confidence × recency
   * @param {Object} lesson - Lesson with sourceWeight, confidence, timestamp
   * @returns {number} Computed score
   * @private
   */
  _calculateLessonScore(lesson) {
    const weight = lesson.sourceWeight || 1;  // GPU=1, CPU=2
    const confidence = lesson.confidence || 0.5;
    const ageMs = Date.now() - (lesson.timestamp || lesson.originTimestamp || Date.now());
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

    // Exponential decay with 24-hour half-life
    const recencyFactor = Math.exp(-ageMs / TWENTY_FOUR_HOURS_MS);

    return weight * confidence * recencyFactor;
  }

  /**
   * T5: Bayesian confidence update based on observations
   * Lessons "mature" after 10 observations
   * @param {Object} lesson - Lesson with observationCount, successCount, failureCount
   * @returns {number} Updated confidence (0-1)
   * @private
   */
  _updateConfidence(lesson) {
    const observations = lesson.observationCount || 1;
    const successes = lesson.successCount || 0;
    const failures = lesson.failureCount || 0;
    const MATURITY_THRESHOLD = 10;

    // Start with prior of 0.1 (cold-start)
    const priorAlpha = 0.1;
    const priorBeta = 0.9;

    // Bayesian update: posterior = (prior + successes) / (prior + total + 2)
    // Using Beta-Binomial conjugate prior
    const alpha = priorAlpha + successes;
    const beta = priorBeta + failures;
    const posterior = alpha / (alpha + beta);

    // Blend with maturity: immature lessons stay closer to prior
    const maturityFactor = Math.min(1, observations / MATURITY_THRESHOLD);
    const confidence = (1 - maturityFactor) * 0.1 + maturityFactor * posterior;

    return Math.max(0.01, Math.min(0.99, confidence));
  }

  /**
   * T6: Check if incoming lesson can overwrite existing lesson
   * @param {Object} existing - Existing lesson
   * @param {Object} incoming - Incoming lesson
   * @returns {boolean} True if can overwrite
   */
  canOverwriteLesson(existing, incoming) {
    const FIVE_MINUTES_MS = 5 * 60 * 1000;

    // Stability dampener: lesson can't be overwritten until 5 min old
    const lessonAge = Date.now() - (existing.timestamp || 0);
    if (lessonAge < FIVE_MINUTES_MS) {
      // During dampening, require significantly higher weight
      return (incoming.sourceWeight || 1) > (existing.sourceWeight || 1) + 0.5;
    }

    // Otherwise, higher score wins
    const existingScore = this._calculateLessonScore(existing);
    const incomingScore = this._calculateLessonScore(incoming);
    return incomingScore > existingScore;
  }

  /**
   * Record a failure for a lesson (decreases confidence)
   * @param {string} lessonText - The lesson text to find
   */
  recordLessonFailure(lessonText) {
    const idx = this.cachedLessons.findIndex(l => l.lesson === lessonText);
    if (idx >= 0) {
      const lesson = this.cachedLessons[idx];
      lesson.observationCount = (lesson.observationCount || 0) + 1;
      lesson.failureCount = (lesson.failureCount || 0) + 1;
      lesson.confidence = this._updateConfidence(lesson);
      lesson.score = this._calculateLessonScore(lesson);
      console.error(`[Playbook] Recorded failure for lesson (conf=${lesson.confidence.toFixed(2)})`);
    }
  }

  /**
   * Retrieve top lessons from Faulkner-DB for injection into routing
   * @param {string} [category] - Filter by category
   * @param {Object} [server] - Server instance for MCP calls
   * @returns {Promise<Lesson[]>}
   */
  async getTopLessons(category = null, server = null) {
    const now = Date.now();

    // Use cache if fresh
    if (this.cachedLessons.length > 0 && (now - this.lastRefresh) < this.refreshInterval) {
      return category
        ? this.cachedLessons.filter(l => l.category === category)
        : this.cachedLessons.slice(0, this.config.topLessonsToInject);
    }

    try {
      if (server && typeof server.callExternalMCP === 'function') {
        const result = await server.callExternalMCP('faulkner-db', 'query_decisions', {
          query: 'playbook routing lessons SAB backend selection'
        });

        this.cachedLessons = (result.patterns || result.decisions || [])
          .filter(p => p.name?.startsWith('playbook-') || p.implementation?.includes('playbook'))
          .map(p => ({
            lesson: p.implementation || p.description,
            category: p.name?.split('-')[1] || 'routing',
            context: p.context,
            strength: p.strength || 1
          }))
          .sort((a, b) => (b.strength || 1) - (a.strength || 1));

        this.lastRefresh = now;
      }

      return category
        ? this.cachedLessons.filter(l => l.category === category)
        : this.cachedLessons.slice(0, this.config.topLessonsToInject);
    } catch (error) {
      console.error('[Playbook] Failed to retrieve lessons:', error.message);
      return [];
    }
  }

  /**
   * Enhance routing decision with playbook lessons
   * @param {ExecutionContext} taskContext - Task context
   * @param {Object} [server] - Server instance
   * @returns {Promise<{enhancedContext: ExecutionContext, lessonsApplied: number}>}
   */
  async enhanceRoutingWithPlaybook(taskContext, server = null) {
    const lessons = await this.getTopLessons('routing', server);

    if (lessons.length === 0) {
      return { enhancedContext: taskContext, lessonsApplied: 0 };
    }

    const lessonText = lessons
      .map((l, i) => `${i + 1}. ${l.lesson}`)
      .join('\n');

    const enhancedPrompt = `ROUTING LESSONS FROM PAST EXECUTIONS:
${lessonText}

Consider these learned patterns when selecting the backend.

ORIGINAL TASK:
${taskContext.prompt || taskContext.task}`;

    return {
      enhancedContext: {
        ...taskContext,
        prompt: enhancedPrompt,
        playbookLessonsInjected: lessons.length
      },
      lessonsApplied: lessons.length
    };
  }

  /**
   * Main reflection function - called after significant executions
   * @param {ExecutionResult} executionResult - Execution result
   * @param {ExecutionContext} context - Execution context
   * @param {Object} [server] - Server instance
   */
  async postExecutionReflection(executionResult, context, server = null) {
    if (!executionResult || !this.config.enabled) {
      return;
    }

    // Skip reflection for simple tool calls
    if (!this.reflectableTools.includes(context.tool)) {
      return;
    }

    try {
      const router = server?.router || null;

      // Extract lessons from this execution
      const lessons = await this.extractLessonsFromExecution(executionResult, context, router);

      // Store valuable lessons
      for (const lesson of lessons.slice(0, this.config.maxLessonsPerExecution)) {
        if (lesson.lesson && lesson.lesson.length > 20) {
          await this.storeLesson(lesson, {
            backend: executionResult.backend,
            taskType: context.taskType || context.tool,
            success: executionResult.success
          }, server);
        }
      }

      if (lessons.length > 0) {
        console.error(`[Playbook] Extracted ${lessons.length} lesson(s) from ${context.tool} execution`);
      }
    } catch (error) {
      // Reflection failures should never break main execution
      console.error('[Playbook] Reflection failed (non-critical):', error.message);
    }
  }

  /**
   * Clear cached lessons (force refresh on next retrieval)
   */
  clearCache() {
    this.cachedLessons = [];
    this.lastRefresh = 0;
  }

  /**
   * Get playbook statistics
   * @returns {{cachedLessons: number, enabled: boolean, lastRefresh: Date|null}}
   */
  getStats() {
    return {
      cachedLessons: this.cachedLessons.length,
      enabled: this.config.enabled,
      lastRefresh: this.lastRefresh ? new Date(this.lastRefresh) : null
    };
  }
}

export {
  PlaybookSystem,
  DEFAULT_PLAYBOOK_CONFIG
};
