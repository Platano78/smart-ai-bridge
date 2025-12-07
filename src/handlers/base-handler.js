/**
 * @fileoverview BaseHandler - Abstract base class for MKG tool handlers
 * @module handlers/base-handler
 *
 * Provides common functionality for all tool handlers including:
 * - Router access for AI requests
 * - Playbook integration for learning
 * - Token estimation utilities
 * - String similarity for fuzzy matching
 */

import { PlaybookSystem } from '../intelligence/playbook-system.js';

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
    this.router = context.router;

    /** @type {Object} */
    this.server = context.server;

    /** @type {PlaybookSystem} */
    this.playbook = context.playbook || new PlaybookSystem();

    /** @type {string} */
    this.handlerName = this.constructor.name;
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
  detectLanguage(content) {
    if (this.router?.detectLanguage) {
      return this.router.detectLanguage(content);
    }

    // Simple detection fallback
    if (content.includes('import React') || content.includes('useState')) return 'javascript';
    if (content.includes('def ') || content.includes('import ')) return 'python';
    if (content.includes('public class') || content.includes('private ')) return 'java';
    if (content.includes('#include') || content.includes('std::')) return 'cpp';
    if (content.includes('interface ') || content.includes(': string')) return 'typescript';
    return 'unknown';
  }

  /**
   * Record execution for playbook learning
   * @protected
   * @param {Object} result - Execution result
   * @param {Object} context - Execution context
   */
  async recordExecution(result, context) {
    if (!this.playbook) return;

    setImmediate(async () => {
      try {
        await this.playbook.postExecutionReflection(result, context, this.server);
      } catch (error) {
        console.error(`[${this.handlerName}] Playbook reflection failed:`, error.message);
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
    return {
      success: false,
      handler: this.handlerName,
      error: error.message,
      timestamp: new Date().toISOString(),
      ...context
    };
  }
}

export { BaseHandler };
