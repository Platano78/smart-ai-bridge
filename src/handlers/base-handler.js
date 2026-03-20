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

import path from 'path';
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
    const resolved = path.resolve(filePath);
    if (resolved.includes('\0')) {
      throw new Error(`Invalid file path: null bytes not allowed`);
    }
    try {
      return await fs.readFile(resolved, encoding);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${resolved}`);
      }
      if (error.code === 'EACCES') {
        throw new Error(`Permission denied: ${resolved}`);
      }
      throw error;
    }
  }

  /**
   * Collapse excessive repeated lines while preserving first occurrence order.
   * Triggers when any line repeats 6+ times. Caps output at 400 lines.
   * Fixes a real bug where ANY local LLM can get stuck repeating lines
   * when analyzing structured files (ini, yaml, json).
   * @param {string} text - Raw LLM output
   * @returns {string} Compacted output
   */
  collapseRepetitiveOutput(text) {
    if (!text || typeof text !== 'string') return '';
    const lines = text.split('\n');
    if (lines.length < 20) return text;

    const normalized = lines.map(l => l.trim().toLowerCase().replace(/\s+/g, ' '));
    const freq = new Map();
    for (const line of normalized) {
      if (!line) continue;
      freq.set(line, (freq.get(line) || 0) + 1);
    }

    const maxRepeat = Math.max(0, ...freq.values());
    if (maxRepeat < 6) return text;

    const seen = new Set();
    const compact = [];
    for (const line of lines) {
      const key = line.trim().toLowerCase().replace(/\s+/g, ' ');
      if (!key) { compact.push(line); continue; }
      if (seen.has(key)) continue;
      seen.add(key);
      compact.push(line);
      if (compact.length >= 400) break;
    }
    compact.push('[Output compacted: repetitive lines removed]');
    return compact.join('\n');
  }

  /**
   * Deduplicate repeated findings/actions and cap list size.
   * @param {Array} items - Array of string items to deduplicate
   * @param {number} maxItems - Maximum number of items to return
   * @returns {string[]} Deduplicated list
   */
  sanitizeTextList(items, maxItems) {
    const unique = [];
    const seen = new Set();
    for (const item of items || []) {
      if (typeof item !== 'string') continue;
      const trimmed = item.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase().replace(/\s+/g, ' ').slice(0, 220);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(trimmed);
      if (unique.length >= maxItems) break;
    }
    return unique;
  }

  /**
   * Extract text from any LLM response shape.
   * Handles: raw strings, content strings, reasoning_content (thinking models),
   * array content parts (Gemini, Claude), OpenAI choices format,
   * Gemini candidates format, and generic fallbacks.
   * @param {*} response - Raw response from any backend
   * @returns {string} Extracted text content
   */
  extractResponseText(response) {
    if (typeof response === 'string') return response;
    if (response === null || response === undefined) return '';
    if (typeof response !== 'object') return String(response);

    const readParts = (parts) => {
      if (!Array.isArray(parts)) return '';
      return parts
        .map(part => typeof part === 'string' ? part : (part?.text || ''))
        .filter(Boolean)
        .join('\n')
        .trim();
    };

    // Direct content string
    if (typeof response.content === 'string' && response.content.trim().length > 0) {
      return response.content;
    }
    // Thinking model fallback (reasoning_content)
    if (typeof response.reasoning_content === 'string' && response.reasoning_content.trim().length > 0) {
      return response.reasoning_content;
    }
    // Array content parts
    const contentParts = readParts(response.content);
    if (contentParts.length > 0) return contentParts;

    // OpenAI choices format
    const choiceContent = response.choices?.[0]?.message?.content;
    if (typeof choiceContent === 'string' && choiceContent.trim().length > 0) return choiceContent;
    const choiceReasoning = response.choices?.[0]?.message?.reasoning_content;
    if (typeof choiceReasoning === 'string' && choiceReasoning.trim().length > 0) return choiceReasoning;
    const choiceParts = readParts(choiceContent);
    if (choiceParts.length > 0) return choiceParts;

    // Gemini candidates format
    const geminiParts = response.candidates?.[0]?.content?.parts;
    const geminiText = readParts(geminiParts);
    if (geminiText.length > 0) return geminiText;

    // Legacy completions format (choices[0].text)
    const choiceText = response.choices?.[0]?.text;
    if (typeof choiceText === 'string' && choiceText.trim().length > 0) return choiceText;

    // Generic fallbacks
    if (typeof response.text === 'string' && response.text.trim().length > 0) return response.text;
    if (typeof response.result === 'string' && response.result.trim().length > 0) return response.result;

    try { return JSON.stringify(response); } catch { return String(response); }
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
