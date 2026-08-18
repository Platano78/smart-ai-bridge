/**
 * @fileoverview Dual Iterate Handler - MCP tool handler for dual_iterate
 * @module handlers/dual-iterate-handler
 *
 * Connects the dual_iterate MCP tool to DualIterateExecutor.
 * Handles parameter validation and response formatting.
 */

import { BaseHandler } from './base-handler.js';
import { DualIterateExecutor } from '../intelligence/dual-iterate-executor.js';
import { WorkflowMode } from '../intelligence/dual-workflow-manager.js';
import { countTokens } from '../utils/token-count.js';

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
      const learningEngine = this.context.learningEngine;

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
   * Resolve the backend name(s) DualIterateExecutor will ACTUALLY route this
   * task to, so the capacity gate sizes against the real lane rather than a
   * hardcoded guess. DualWorkflowManager#detectMode() is not fixed to local:
   * under CLOUD_FALLBACK it hands generator/reviewer roles to different
   * CLOUD backends (nvidia_glm / nvidia_deepseek) — see
   * src/intelligence/dual-workflow-manager.js getBackendForRole(). Only
   * DUAL_ITERATIVE mode's loop actually calls both the 'generator' and
   * 'reviewer' roles (dual-iterate-executor.js runDualLoop); every other
   * mode's loop (runSelfReflection, runPassThrough) only ever calls
   * 'generator'. Mirrors that role usage here rather than checking both
   * roles unconditionally, which would over-refuse on modes that never
   * touch 'reviewer'.
   * @private
   * @returns {Promise<string[]|null>} Resolved backend names, or null if the
   *   mode/routing could not be resolved up front (no DualWorkflowManager
   *   wired, or resolution itself failed).
   */
  async _resolveGatingBackends() {
    const dualWorkflowManager = this.context.dualWorkflowManager;
    if (!dualWorkflowManager?.detectMode || !dualWorkflowManager?.getBackendForRole) return null;

    try {
      const { mode } = await dualWorkflowManager.detectMode();
      const roles = mode === WorkflowMode.DUAL_ITERATIVE ? ['generator', 'reviewer'] : ['generator'];
      const routings = await Promise.all(roles.map(role => dualWorkflowManager.getBackendForRole(role)));
      const names = [...new Set(routings.map(r => r?.backend).filter(Boolean))];
      return names.length ? names : null;
    } catch {
      return null;
    }
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

    // Upper bound: measured in TOKENS against the backend(s) the executor
    // will ACTUALLY route this task to (see _resolveGatingBackends — under
    // CLOUD_FALLBACK mode that can be a cloud lane, not local). Gate against
    // the SMALLEST of the resolved lanes, since the loop can hit either
    // role's backend and a payload that doesn't fit the smaller one will
    // still fail there.
    const taskTokens = countTokens(task);
    const resolvedBackends = await this._resolveGatingBackends();

    let gateLabel;
    let dualIterateCapTokens;
    if (resolvedBackends) {
      const caps = await Promise.all(resolvedBackends.map(b => this.capacityTokensFor(b)));
      const minAt = caps.indexOf(Math.min(...caps));
      gateLabel = `'${resolvedBackends[minAt]}'`;
      dualIterateCapTokens = caps[minAt];
    } else {
      // Mode/routing could not be resolved up front (no DualWorkflowManager
      // wired, or resolution itself failed) — gate against the roomiest
      // USABLE backend instead of guessing a lane, so this only ever
      // refuses what genuinely nothing could serve.
      gateLabel = 'the largest usable backend';
      dualIterateCapTokens = await this.largestBackendCapacityTokens();
    }

    if (taskTokens > dualIterateCapTokens) {
      return {
        success: false,
        error: `Task is ${taskTokens} tokens (${task.length} chars); exceeds ${gateLabel}'s usable input capacity ` +
          `(${dualIterateCapTokens} tokens, after reserving room for the response). Shorten the task description.`,
        task_tokens: taskTokens
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
