/**
 * @fileoverview PlaybookSystem - Self-improving execution learning
 * @module intelligence/playbook-system
 *
 * Extracted from server-mecha-king-ghidorah-complete.js (lines 86-333)
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

class PlaybookSystem {
  /**
   * Create a new PlaybookSystem
   * @param {Partial<PlaybookConfig>} [config] - Configuration options
   */
  constructor(config = {}) {
    /** @type {PlaybookConfig} */
    this.config = { ...DEFAULT_PLAYBOOK_CONFIG, ...config };

    /** @type {Lesson[]} */
    this.cachedLessons = [];

    /** @type {number} */
    this.lastRefresh = 0;

    /** @type {number} */
    this.refreshInterval = 5 * 60 * 1000; // 5 minutes

    /** @type {string[]} */
    this.reflectableTools = ['ask', 'review', 'edit_file', 'multi_edit', 'analyze'];
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

    const reflectionPrompt = `Analyze this MKG execution and extract 1-3 actionable lessons for future routing decisions.

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

      if (server && typeof server.callExternalMCP === 'function') {
        await server.callExternalMCP('faulkner-db', 'add_pattern', {
          name: patternName,
          context: `MKG Playbook Lesson - ${lesson.category}`,
          implementation: lesson.lesson,
          use_cases: [
            lesson.applies_when,
            `Backend: ${executionContext.backend}`,
            `Task Type: ${executionContext.taskType}`
          ]
        });
        console.error(`[Playbook] Stored lesson: ${lesson.lesson.substring(0, 50)}...`);
        return true;
      }

      // Fallback: Log the lesson for manual review
      console.error(`[Playbook] Lesson (no Faulkner): ${JSON.stringify({
        name: patternName,
        lesson: lesson.lesson,
        category: lesson.category,
        applies_when: lesson.applies_when,
        backend: executionContext.backend
      })}`);
      return false;
    } catch (error) {
      console.error('[Playbook] Failed to store lesson:', error.message);
      return false;
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
          query: 'playbook routing lessons MKG backend selection'
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
