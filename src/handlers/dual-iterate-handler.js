/**
 * @fileoverview Dual Iterate Handler - MCP tool handler for dual_iterate
 * @module handlers/dual-iterate-handler
 *
 * Connects the dual_iterate MCP tool to DualIterateExecutor.
 * Handles parameter validation and response formatting.
 */

import { BaseHandler } from './base-handler.js';
import { DualIterateExecutor } from '../intelligence/dual-iterate-executor.js';

/**
 * Handler for dual_iterate tool
 * Runs internal generate→review→fix loop using dual backends
 */
class DualIterateHandler extends BaseHandler {
  constructor(context) {
    super(context);
    this.executor = null;
  }

  /**
   * Get or create executor instance
   * @private
   */
  _getExecutor() {
    if (!this.executor) {
      // Get dependencies from context
      const dualWorkflowManager = this.context.dualWorkflowManager;
      const backendRegistry = this.context.backendRegistry;
      const learningEngine = this.context.server?.learningEngine;

      if (!dualWorkflowManager) {
        throw new Error('DualWorkflowManager not available in context');
      }

      this.executor = new DualIterateExecutor({
        dualWorkflowManager,
        backendRegistry,
        learningEngine,
        maxIterations: 3,
        qualityThreshold: 0.7,
        timeoutMs: 60000
      });
    }

    return this.executor;
  }

  /**
   * Execute dual_iterate tool
   * @param {Object} args - Tool arguments
   * @param {string} args.task - Code generation task
   * @param {number} [args.max_iterations=3] - Max iterations
   * @param {boolean} [args.include_history=false] - Include history
   * @param {number} [args.quality_threshold=0.7] - Quality threshold
   * @returns {Object} Result with code and metadata
   */
  async execute(args) {
    const {
      task,
      max_iterations = 3,
      include_history = false,
      quality_threshold = 0.7
    } = args;

    // Validate required parameters
    if (!task || typeof task !== 'string') {
      return {
        success: false,
        error: 'Task is required and must be a string',
        usage: 'dual_iterate({ task: "Write a function that..." })'
      };
    }

    if (task.length < 10) {
      return {
        success: false,
        error: 'Task is too short. Please provide a detailed description.',
        task_length: task.length
      };
    }

    try {
      const executor = this._getExecutor();

      console.error(`[DualIterateHandler] Starting: ${task.substring(0, 80)}...`);

      // Execute with options
      const result = await executor.execute(task, {
        maxIterations: max_iterations,
        includeHistory: include_history,
        qualityThreshold: quality_threshold
      });

      // Format response
      const response = {
        success: result.success,
        code: result.code,
        mode: result.mode,
        iterations: result.iterations,
        execution_time_ms: result.executionTime,
        metadata: {
          task_preview: task.substring(0, 100) + (task.length > 100 ? '...' : ''),
          code_length: result.code?.length || 0,
          timestamp: new Date().toISOString()
        }
      };

      // Add optional fields
      if (include_history && result.history) {
        response.history = result.history;
      }

      if (result.finalReview) {
        response.final_review = {
          status: result.finalReview.status,
          notes: result.finalReview.critique?.substring(0, 200)
        };
      }

      if (result.selfReviewApplied !== undefined) {
        response.self_review_applied = result.selfReviewApplied;
      }

      if (result.passThrough) {
        response.pass_through = true;
        response.note = 'No review loop - single model direct generation';
      }

      // Add error if failed
      if (!result.success) {
        response.error = result.error || 'Iteration limit reached without approval';
      }

      console.error(`[DualIterateHandler] Complete: ${result.success ? '✅' : '❌'} ${result.iterations} iterations`);

      return response;

    } catch (error) {
      console.error(`[DualIterateHandler] Error: ${error.message}`);

      return {
        success: false,
        error: error.message,
        stack: process.env.DEBUG ? error.stack : undefined,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get handler status
   * @returns {Object}
   */
  getStatus() {
    return {
      initialized: !!this.executor,
      executor_status: this.executor?.getStatus() || null
    };
  }
}

export { DualIterateHandler };
