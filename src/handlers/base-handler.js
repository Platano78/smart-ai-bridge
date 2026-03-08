/**
 * @fileoverview BaseHandler - Abstract base class for SAB tool handlers
 * @module handlers/base-handler
 *
 * Provides common functionality for all tool handlers including:
 * - Router access for AI requests
 * - Playbook integration for learning
 * - Token estimation utilities
 * - String similarity for fuzzy matching
 */

import { promises as fs } from 'fs';
import { PlaybookSystem } from '../intelligence/playbook-system.js';
import { detectLanguage } from '../utils/language-detector.js';
import { getLocalContextLimit } from '../utils/model-discovery.js';

const RETRY_CONFIG = {
  maxLocalRetries: 2,
  maxDualModeIterations: 3,
  tokenScaleFactor: 1.5,
  cloudFallbackEnabled: true,
  truncationThreshold: 0.7
};

/**
 * @typedef {Object} HandlerContext
 * @property {Object} router - AI router instance
 * @property {Object} [server] - Server instance for MCP calls
 * @property {PlaybookSystem} [playbook] - Playbook system for learning
 */

/**
 * Abstract base class for tool handlers
 * @abstract
 */
class BaseHandler {
  /**
   * Create a new BaseHandler
   * @param {HandlerContext} context - Handler context with dependencies
   */
  constructor(context = {}) {
    if (new.target === BaseHandler) {
      throw new Error('BaseHandler is abstract and cannot be instantiated directly');
    }

    /** @type {Object} */
    this.context = context;

    /** @type {Object} */
    this.router = context.router;

    /** @type {Object} */
    this.server = context.server;

    /** @type {PlaybookSystem} */
    this.playbook = context.playbook || new PlaybookSystem();

    /** @type {ConversationThreading} */
    this.conversationThreading = context.conversationThreading;

    /** @type {Object} */
    this.backendRegistry = context.backendRegistry;

    /** @type {string} */
    this.handlerName = this.constructor.name;

    /** @type {string} Handler type for routing overrides */
    this.handlerType = null;

    /** @type {Object|null} Cached context limit result */
    this._contextLimitCache = null;
    this._contextLimitCacheTime = 0;
  }

  async getContextLimit() {
    const now = Date.now();
    if (this._contextLimitCache && (now - this._contextLimitCacheTime) < 30000) {
      return this._contextLimitCache;
    }
    this._contextLimitCache = await getLocalContextLimit();
    this._contextLimitCacheTime = now;
    return this._contextLimitCache;
  }

  selectBackend(requestedBackend, context = {}) {
    if (this.backendRegistry) {
      return this.backendRegistry.selectBackend(requestedBackend, {
        handlerType: this.handlerType,
        ...context
      });
    }
    return { backend: requestedBackend || 'local' };
  }

  async safeReadFile(filePath, encoding = 'utf8') {
    try {
      return await fs.readFile(filePath, encoding);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      if (error.code === 'EACCES') {
        throw new Error(`Permission denied: ${filePath}`);
      }
      throw error;
    }
  }

  /**
   * Execute the handler - must be implemented by subclasses
   * @abstract
   * @param {Object} args - Handler arguments
   * @returns {Promise<Object>}
   */
  async execute(args) {
    throw new Error('execute must be implemented by subclass');
  }

  /**
   * Estimate token count for text (4 chars ≈ 1 token)
   * @param {string} text - Text to estimate
   * @returns {number}
   */
  estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate string similarity using Levenshtein distance
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Similarity score 0-1
   */
  calculateStringSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance between two strings
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number}
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Detect programming language from content
   * @param {string} content - Code content
   * @returns {string}
   */
  detectLanguage(input) {
    return detectLanguage(input);
  }

  /**
   * Record execution for playbook learning
   * @protected
   * @param {Object} result - Execution result
   * @param {Object} context - Execution context
   */
  async recordExecution(result, context) {
    if (!this.playbook) return;

    // NEW: Extract modelId from result metadata if available
    const modelId = result?.metadata?.model || 
                    result?.metadata?.detectedModel ||
                    result?.modelId ||
                    (context?.backend === 'local' ? this.router?.backends?.getAdapter?.('local')?.modelId : null);

    const enrichedContext = {
      ...context,
      modelId,  // NEW: Include modelId
      timestamp: Date.now()
    };

    setImmediate(async () => {
      try {
        await this.playbook.postExecutionReflection(result, enrichedContext, this.server);
      } catch (error) {
        console.error(`[${this.handlerName}] Playbook reflection failed:`, error.message);
      }
    });
  }

  /**
   * Record routing outcome for compound learning
   * Feeds into the CompoundLearningEngine for continuous improvement
   * @protected
   * @param {boolean} success - Whether the operation succeeded
   * @param {number} outputLength - Response length in characters
   * @param {string} backend - Backend used for the operation
   * @param {Object} [taskContext] - Additional context (taskType, source, etc.)
   */
  async recordLearningOutcome(success, outputLength, backend, taskContext = {}) {
    if (!this.router?.recordRoutingOutcome) return;

    // NEW: Extract modelId from router context or taskContext
    const modelId = taskContext.modelId || 
                    this.router?._lastRoutingContext?.modelId ||
                    (backend === 'local' ? this.router?.backends?.getAdapter?.('local')?.modelId : null);

    setImmediate(async () => {
      try {
        await this.router.recordRoutingOutcome({
          success,
          outputLength,
          backend,
          modelId,  // NEW: Include modelId in outcome
          timestamp: Date.now(),
          ...taskContext
        });
      } catch (error) {
        console.error(`[${this.handlerName}] Learning outcome recording failed:`, error.message);
      }
    });
  }

  /**
   * Route request through AI router
   * @protected
   * @param {string} prompt - Prompt to route
   * @param {Object} [options] - Routing options
   * @returns {Promise<string>} Selected backend
   */
  async routeRequest(prompt, options = {}) {
    if (!this.router) {
      throw new Error('Router not available');
    }
    return this.router.routeRequest(prompt, options);
  }

  /**
   * Make AI request through router
   * @protected
   * @param {string} prompt - Prompt to send
   * @param {string} endpoint - Backend endpoint
   * @param {Object} [options] - Request options
   * @returns {Promise<Object>}
   */
  async makeRequest(prompt, endpoint, options = {}) {
    if (!this.router) {
      throw new Error('Router not available');
    }
    // Use fallback-enabled request to automatically try dual backends when local fails
    if (typeof this.router.makeRequestWithFallback === 'function') {
      return this.router.makeRequestWithFallback(prompt, endpoint, options);
    }
    return this.router.makeRequest(prompt, endpoint, options);
  }

  /**
   * Build success response
   * @protected
   * @param {Object} data - Response data
   * @returns {Object}
   */
  buildSuccessResponse(data) {
    return {
      success: true,
      handler: this.handlerName,
      timestamp: new Date().toISOString(),
      ...data
    };
  }

  /**
   * Build error response
   * @protected
   * @param {Error} error - Error object
   * @param {Object} [context] - Additional context
   * @returns {Object}
   */
  buildErrorResponse(error, context = {}) {
    // Handle both Error objects and string messages
    const errorMessage = typeof error === 'string' ? error : error.message;
    return {
      success: false,
      handler: this.handlerName,
      error: errorMessage,
      timestamp: new Date().toISOString(),
      ...context
    };
  }
}

export { BaseHandler, RETRY_CONFIG };
