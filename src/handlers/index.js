/**
 * @fileoverview Handler registry - Exports all MKG tool handlers
 * @module handlers
 *
 * Central export point for all handler classes
 */

import { BaseHandler } from './base-handler.js';
import { ReviewHandler } from './review-handler.js';
import { ReadHandler } from './read-handler.js';
import { AskHandler, MODEL_MAP } from './ask-handler.js';
import {
  WriteFilesAtomicHandler,
  EditFileHandler,
  MultiEditHandler,
  BackupRestoreHandler
} from './file-handlers.js';
import {
  HealthHandler,
  ValidateChangesHandler,
  ManageConversationHandler,
  GetAnalyticsHandler
} from './system-handlers.js';
import { SubagentHandler } from './subagent-handler.js';
import { ParallelAgentsHandler } from './parallel-agents-handler.js';
import { CouncilHandler } from './council-handler.js';

/**
 * Handler class registry mapping handler names to classes
 */
const HANDLER_REGISTRY = {
  'handleReview': ReviewHandler,
  'handleRead': ReadHandler,
  'handleAsk': AskHandler,
  'handleWriteFilesAtomic': WriteFilesAtomicHandler,
  'handleEditFile': EditFileHandler,
  'handleMultiEdit': MultiEditHandler,
  'handleBackupRestore': BackupRestoreHandler,
  'handleHealth': HealthHandler,
  'handleValidateChanges': ValidateChangesHandler,
  'handleManageConversation': ManageConversationHandler,
  'handleGetAnalytics': GetAnalyticsHandler,
  'handleSpawnSubagent': SubagentHandler,
  'handleParallelAgents': ParallelAgentsHandler,
  'handleCouncil': CouncilHandler
};

/**
 * Create handler instance by name
 * @param {string} handlerName - Handler name from tool definition
 * @param {Object} context - Handler context with router, server, playbook
 * @returns {BaseHandler|null}
 */
function createHandler(handlerName, context) {
  const HandlerClass = HANDLER_REGISTRY[handlerName];
  if (!HandlerClass) {
    return null;
  }
  return new HandlerClass(context);
}

/**
 * Get all available handler names
 * @returns {string[]}
 */
function getAvailableHandlers() {
  return Object.keys(HANDLER_REGISTRY);
}

/**
 * Check if handler exists
 * @param {string} handlerName - Handler name
 * @returns {boolean}
 */
function hasHandler(handlerName) {
  return handlerName in HANDLER_REGISTRY;
}

/**
 * Handler factory - creates and executes handlers
 */
class HandlerFactory {
  /**
   * Create a new HandlerFactory
   * @param {Object} context - Shared context for all handlers
   */
  constructor(context) {
    /** @type {Object} */
    this.context = context;

    /** @type {Map<string, BaseHandler>} */
    this.instances = new Map();
  }

  /**
   * Get or create handler instance
   * @param {string} handlerName - Handler name
   * @returns {BaseHandler|null}
   */
  getHandler(handlerName) {
    if (!this.instances.has(handlerName)) {
      const handler = createHandler(handlerName, this.context);
      if (handler) {
        this.instances.set(handlerName, handler);
      }
    }
    return this.instances.get(handlerName) || null;
  }

  /**
   * Execute handler by name
   * @param {string} handlerName - Handler name
   * @param {Object} args - Handler arguments
   * @returns {Promise<Object>}
   */
  async execute(handlerName, args) {
    const handler = this.getHandler(handlerName);
    if (!handler) {
      throw new Error(`Unknown handler: ${handlerName}`);
    }
    return handler.execute(args);
  }

  /**
   * Update shared context
   * @param {Object} context - New context values
   */
  updateContext(context) {
    this.context = { ...this.context, ...context };
    // Clear cached instances to pick up new context
    this.instances.clear();
  }
}

export {
  // Base class
  BaseHandler,

  // Handler classes
  ReviewHandler,
  ReadHandler,
  AskHandler,
  WriteFilesAtomicHandler,
  EditFileHandler,
  MultiEditHandler,
  BackupRestoreHandler,
  HealthHandler,
  ValidateChangesHandler,
  ManageConversationHandler,
  GetAnalyticsHandler,
  SubagentHandler,
  ParallelAgentsHandler,

  // Registry and factory
  HANDLER_REGISTRY,
  HandlerFactory,
  createHandler,
  getAvailableHandlers,
  hasHandler,

  // Constants
  MODEL_MAP
};
