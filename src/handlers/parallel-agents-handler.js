/**
 * @fileoverview ParallelAgentsHandler - Execute TDD agents in parallel
 * @module handlers/parallel-agents-handler
 *
 * Implements Phase 2 of Local Agent Orchestration:
 * - Decomposes high-level tasks into atomic TDD subtasks
 * - Executes subtasks in parallel groups (RED before GREEN)
 * - Quality gate iteration with automatic retry
 *
 * Key learnings from Phase 1 (bash scripts) applied:
 * - Use Worker (Seed-Coder) for decomposition, not Orchestrator
 * - Unique task IDs to prevent race conditions
 * - JSON repair for malformed LLM outputs
 * - enableThinking=false for JSON-output roles
 */

import { BaseHandler } from './base-handler.js';
import { SubagentHandler } from './subagent-handler.js';
import { ConcurrentRequestManager } from '../utils/concurrent-request-manager.js';
import { roleTemplates } from '../config/role-templates.js';
import { getRouterSlotCount } from '../utils/model-discovery.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Handler for parallel TDD agent execution
 */
class ParallelAgentsHandler extends BaseHandler {
  /**
   * Create ParallelAgentsHandler
   * @param {Object} context - Handler context
   */
  constructor(context = {}) {
    super(context);

    /** @type {ConcurrentRequestManager} */
    // Will be re-initialized with dynamic slot count in execute()
    this.concurrentManager = new ConcurrentRequestManager(10); // Default, updated dynamically

    /** @type {SubagentHandler} */
    this.subagentHandler = new SubagentHandler(context);

    /** @type {Map<string, Object>} */
    this.taskResults = new Map();
  }

  /**
   * Execute parallel agents workflow
   * @param {Object} args - Handler arguments
   * @param {string} args.task - High-level task to decompose
   * @param {number} [args.max_parallel=2] - Maximum parallel agents
   * @param {boolean} [args.iterate_until_quality=true] - Enable quality iteration
   * @param {number} [args.max_iterations=3] - Maximum quality iterations
   * @param {string} [args.work_directory] - Optional work directory
   * @returns {Promise<Object>}
   */
  async execute(args) {
    const {
      task,
      max_parallel,  // Now optional - will auto-detect from router
      iterate_until_quality = true,
      max_iterations = 3,
      work_directory
    } = args;

    const startTime = Date.now();
    const workDir = work_directory || `/tmp/parallel-agents-${Date.now()}`;

    try {
      // Ensure work directory exists
      if (!fs.existsSync(workDir)) {
        fs.mkdirSync(workDir, { recursive: true });
      }

      // Dynamic slot detection from llama.cpp router
      let effectiveMaxParallel = max_parallel;
      let routerInfo = null;

      if (!max_parallel) {
        routerInfo = await getRouterSlotCount(8081);
        effectiveMaxParallel = routerInfo.slots;
        console.error(`[ParallelAgents] Auto-detected ${effectiveMaxParallel} slots from router (model: ${routerInfo.model}, ctx: ${routerInfo.context})`);
      } else {
        effectiveMaxParallel = max_parallel;
      }

      // Safety cap at 10 (reasonable maximum for most setups)
      effectiveMaxParallel = Math.min(effectiveMaxParallel, 10);

      // Update ConcurrentRequestManager with actual slot count
      this.concurrentManager = new ConcurrentRequestManager(effectiveMaxParallel);

      console.error(`[ParallelAgents] Starting workflow for: ${task.substring(0, 50)}...`);
      console.error(`[ParallelAgents] Work directory: ${workDir}`);
      console.error(`[ParallelAgents] Max parallel: ${effectiveMaxParallel}${routerInfo ? ' (auto-detected)' : ''}`);

      // Stage 1: Decompose task using Worker (Phase 1 learning: not Orchestrator)
      // Pass slot count so decomposer can batch independent tasks appropriately
      const decomposed = await this.decompose(task, effectiveMaxParallel);

      if (decomposed.error) {
        return this.buildErrorResponse(new Error(decomposed.error), {
          stage: 'decomposition',
          raw_output: decomposed.raw
        });
      }

      // Save decomposition result
      fs.writeFileSync(
        path.join(workDir, 'decomposed.json'),
        JSON.stringify(decomposed, null, 2)
      );

      console.error(`[ParallelAgents] Decomposed into ${this.countTasks(decomposed)} tasks`);

      // Stage 2: Execute parallel groups sequentially
      const results = {
        groups: [],
        all_outputs: [],
        task_results: {}
      };

      for (const group of decomposed.parallel_groups || []) {
        console.error(`[ParallelAgents] Executing group ${group.group}: ${group.name || 'unnamed'}`);
        const groupResults = await this.executeGroup(group, effectiveMaxParallel);
        results.groups.push(groupResults);

        // Collect outputs
        for (const output of groupResults.outputs) {
          results.all_outputs.push(output);
          if (output.task_id) {
            results.task_results[output.task_id] = output;
          }
        }
      }

      // Save execution results
      fs.writeFileSync(
        path.join(workDir, 'results.json'),
        JSON.stringify(results, null, 2)
      );

      // Stage 3: Quality gate with iteration
      let qualityResult = { verdict: 'skip', score: 0 };
      let iteration = 0;

      if (iterate_until_quality) {
        while (iteration < max_iterations) {
          console.error(`[ParallelAgents] Quality review iteration ${iteration + 1}/${max_iterations}`);
          qualityResult = await this.qualityReview(results);

          // Save quality result
          fs.writeFileSync(
            path.join(workDir, `quality-${iteration}.json`),
            JSON.stringify(qualityResult, null, 2)
          );

          if (qualityResult.verdict === 'pass') {
            console.error(`[ParallelAgents] Quality gate PASSED (score: ${qualityResult.score})`);
            break;
          }

          console.error(`[ParallelAgents] Quality gate ITERATE (score: ${qualityResult.score})`);

          // Retry failed tasks with specific feedback
          if (qualityResult.retry_tasks && qualityResult.retry_tasks.length > 0) {
            for (const taskId of qualityResult.retry_tasks) {
              // Get per-task feedback if available, otherwise use general issues
              const taskFeedback = qualityResult.task_issues?.[taskId] || qualityResult.issues || [];
              console.error(`[ParallelAgents] Retrying task: ${taskId} with ${taskFeedback.length} feedback items`);
              const retryResult = await this.retryTask(taskId, decomposed, results, taskFeedback);
              if (retryResult) {
                results.task_results[taskId] = retryResult;
                results.all_outputs.push(retryResult);
              }
            }
          }

          iteration++;
        }

        if (iteration >= max_iterations && qualityResult.verdict !== 'pass') {
          console.error(`[ParallelAgents] Max iterations reached, quality gate incomplete`);
        }
      }

      // Stage 4: Synthesize final result
      const synthesis = await this.synthesize(task, results, qualityResult);

      // Save synthesis
      fs.writeFileSync(
        path.join(workDir, 'synthesis.json'),
        JSON.stringify(synthesis, null, 2)
      );

      const processingTime = Date.now() - startTime;

      return this.buildSuccessResponse({
        task,
        decomposition: decomposed,
        execution: {
          groups_executed: results.groups.length,
          tasks_completed: results.all_outputs.filter(o => o.success).length,
          tasks_failed: results.all_outputs.filter(o => !o.success).length,
          max_parallel_used: effectiveMaxParallel,
          slots_auto_detected: !max_parallel
        },
        router_info: routerInfo || { slots: effectiveMaxParallel, model: 'manual', status: 'specified' },
        quality: {
          verdict: qualityResult.verdict,
          score: qualityResult.score,
          iterations: iteration + (iterate_until_quality ? 1 : 0)
        },
        synthesis,
        work_directory: workDir,
        processing_time_ms: processingTime,
        metrics: this.concurrentManager.getMetrics()
      });

    } catch (error) {
      console.error(`[ParallelAgents] Workflow failed:`, error);
      return this.buildErrorResponse(error, {
        work_directory: workDir,
        processing_time_ms: Date.now() - startTime
      });
    }
  }

  /**
   * Decompose task into parallel groups of subtasks
   * @param {string} task - High-level task
   * @param {number} slots - Available parallel slots
   * @returns {Promise<Object>}
   */
  async decompose(task, slots) {
    console.error(`[ParallelAgents] Decomposing task with ${slots} slots available`);

    try {
      // Use tdd-decomposer role (routes to Worker per Phase 1 learning)
      // The role template contains {{SLOTS}} placeholder that SubagentHandler will replace
      const result = await this.subagentHandler.execute({
        role: 'tdd-decomposer',
        task: `Task: ${task}`,
        context: {
          available_slots: slots,
          slot_replacement: { '{{SLOTS}}': String(slots) }  // For template replacement
        },
        verdict_mode: 'full'
      });

      if (!result.success) {
        return { error: 'Decomposition failed', raw: result.error };
      }

      // Apply JSON repair (Phase 1 learning: LLMs produce malformed JSON)
      const parsed = this.repairAndParseJSON(result.response);

      if (parsed.error) {
        return { error: 'JSON parsing failed', raw: result.response };
      }

      // Reorganize by phase to maximize parallelism
      // LLMs tend to group by feature; we force phase-based grouping
      const reorganized = this.reorganizeByPhase(parsed, slots);

      return reorganized;

    } catch (error) {
      console.error(`[ParallelAgents] Decomposition error:`, error);
      return { error: error.message };
    }
  }


  /**
   * Reorganize decomposition to maximize parallelism by grouping by phase
   * LLMs tend to group by feature; we force phase-based grouping for better parallelism
   * @private
   * @param {Object} decomposed - Original decomposition from LLM
   * @param {number} maxParallel - Maximum parallel tasks
   * @returns {Object} - Reorganized decomposition
   */
  reorganizeByPhase(decomposed, maxParallel) {
    if (!decomposed.parallel_groups || decomposed.parallel_groups.length === 0) {
      return decomposed;
    }

    // Collect all tasks by phase
    const tasksByPhase = { RED: [], GREEN: [], REFACTOR: [] };
    
    for (const group of decomposed.parallel_groups) {
      for (const task of group.tasks || []) {
        const phase = task.phase?.toUpperCase() || 'GREEN';
        if (tasksByPhase[phase]) {
          tasksByPhase[phase].push(task);
        }
      }
    }

    // Build new phase-based groups
    const newGroups = [];
    let groupNum = 1;

    // RED phase first (all tests in parallel)
    if (tasksByPhase.RED.length > 0) {
      // Split into batches if more than maxParallel
      for (let i = 0; i < tasksByPhase.RED.length; i += maxParallel) {
        const batch = tasksByPhase.RED.slice(i, i + maxParallel);
        newGroups.push({
          group: groupNum++,
          name: `RED phase - all tests (batch ${Math.floor(i / maxParallel) + 1})`,
          tasks: batch.map((t, idx) => ({
            ...t,
            id: t.id || `R${i + idx + 1}`
          }))
        });
      }
    }

    // GREEN phase second (all implementations in parallel)
    if (tasksByPhase.GREEN.length > 0) {
      for (let i = 0; i < tasksByPhase.GREEN.length; i += maxParallel) {
        const batch = tasksByPhase.GREEN.slice(i, i + maxParallel);
        newGroups.push({
          group: groupNum++,
          name: `GREEN phase - all implementations (batch ${Math.floor(i / maxParallel) + 1})`,
          tasks: batch.map((t, idx) => ({
            ...t,
            id: t.id || `G${i + idx + 1}`
          }))
        });
      }
    }

    // REFACTOR phase last (optional)
    if (tasksByPhase.REFACTOR.length > 0) {
      for (let i = 0; i < tasksByPhase.REFACTOR.length; i += maxParallel) {
        const batch = tasksByPhase.REFACTOR.slice(i, i + maxParallel);
        newGroups.push({
          group: groupNum++,
          name: `REFACTOR phase (batch ${Math.floor(i / maxParallel) + 1})`,
          tasks: batch.map((t, idx) => ({
            ...t,
            id: t.id || `F${i + idx + 1}`
          }))
        });
      }
    }

    const originalTaskCount = decomposed.parallel_groups.reduce((sum, g) => sum + (g.tasks?.length || 0), 0);
    const newTaskCount = newGroups.reduce((sum, g) => sum + (g.tasks?.length || 0), 0);

    console.error(`[ParallelAgents] Reorganized: ${decomposed.parallel_groups.length} feature-groups → ${newGroups.length} phase-groups (${newTaskCount} tasks)`);

    return {
      parallel_groups: newGroups,
      _reorganized: true,
      _original_groups: decomposed.parallel_groups.length
    };
  }

  /**
   * Execute a group of tasks in parallel
   * @param {Object} group - Group definition
   * @param {number} maxParallel - Maximum parallel tasks
   * @returns {Promise<Object>}
   */
  async executeGroup(group, maxParallel) {
    const tasks = group.tasks || [];
    const outputs = [];

    // Process in batches if more tasks than slots
    const batches = [];
    for (let i = 0; i < tasks.length; i += maxParallel) {
      batches.push(tasks.slice(i, i + maxParallel));
    }

    for (const batch of batches) {
      // Execute batch in parallel using ConcurrentRequestManager
      const promises = batch.map((taskDef, idx) => {
        const uniqueId = `${group.group}-${taskDef.id || idx}-${Date.now()}`;
        return this.concurrentManager.executeRequest(
          this.executeTask(taskDef, uniqueId),
          'normal'
        );
      });

      const batchResults = await Promise.allSettled(promises);

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          outputs.push(result.value);
        } else {
          outputs.push({
            success: false,
            error: result.reason?.message || 'Task failed',
            task_id: 'unknown'
          });
        }
      }
    }

    return {
      group: group.group,
      name: group.name,
      outputs,
      completed: outputs.filter(o => o.success).length,
      failed: outputs.filter(o => !o.success).length
    };
  }

  /**
   * Execute a single task with optional feedback injection
   * Enhanced: Supports retry with quality feedback for targeted fixes
   * @param {Object} taskDef - Task definition
   * @param {string} uniqueId - Unique task ID (Phase 1 fix: prevents race conditions)
   * @param {Object} retryContext - Optional retry context with feedback
   * @returns {Promise<Object>}
   */
  async executeTask(taskDef, uniqueId, retryContext = null) {
    const { id, phase, task, agent } = taskDef;

    // Map phase to role
    let role;
    if (agent) {
      // Use explicit agent if provided
      role = agent;
    } else if (phase === 'RED') {
      role = 'tdd-test-writer';
    } else if (phase === 'GREEN') {
      role = 'tdd-implementer';
    } else if (phase === 'REFACTOR') {
      role = 'refactor-specialist';
    } else {
      role = 'code-reviewer';  // Default
    }

    // Build task prompt - inject feedback if this is a retry
    let taskPrompt = task;
    if (retryContext?.isRetry && retryContext.feedback?.length > 0) {
      const feedbackSection = retryContext.feedback.map((f, i) => `${i + 1}. ${f}`).join('\n');
      taskPrompt = `${task}

⚠️ RETRY - QUALITY ISSUES TO FIX:
A quality reviewer found these specific issues with the previous attempt:
${feedbackSection}

${retryContext.previousOutput ? `PREVIOUS ATTEMPT (for reference):
${retryContext.previousOutput.substring(0, 500)}...` : ''}

Please address ALL the issues above in your new implementation.`;
      
      console.error(`[ParallelAgents] Executing ${id} (${phase}) with role ${role} [RETRY with feedback]`);
    } else {
      console.error(`[ParallelAgents] Executing ${id} (${phase}) with role ${role}`);
    }

    try {
      const result = await this.subagentHandler.execute({
        role,
        task: taskPrompt,
        context: {
          task_id: uniqueId,
          phase,
          original_id: id,
          isRetry: retryContext?.isRetry || false
        },
        verdict_mode: 'full'
      });

      return {
        success: result.success,
        task_id: id,
        unique_id: uniqueId,
        phase,
        role,
        response: result.response,
        backend_used: result.backend_used,
        processing_time_ms: result.processing_time_ms,
        wasRetry: retryContext?.isRetry || false
      };

    } catch (error) {
      console.error(`[ParallelAgents] Task ${id} failed:`, error);
      return {
        success: false,
        task_id: id,
        unique_id: uniqueId,
        phase,
        role,
        error: error.message,
        wasRetry: retryContext?.isRetry || false
      };
    }
  }

  /**
   * Perform quality review of results with per-task feedback
   * Enhanced: Returns task_issues map for targeted retry feedback
   * @param {Object} results - Execution results
   * @returns {Promise<Object>}
   */
  async qualityReview(results) {
    try {
      // Truncate task outputs to prevent context overflow
      // task_results is an object keyed by task ID, not an array
      const truncatedResults = Object.entries(results.task_results || {}).map(([taskId, t]) => ({
        id: taskId,
        phase: t.phase,
        success: t.success,
        // Truncate response to first 500 chars to keep context manageable
        output_preview: t.response ? t.response.substring(0, 500) + (t.response.length > 500 ? '...' : '') : 'No output'
      }));

      // Use tdd-quality-reviewer with truncated outputs
      const review = await this.subagentHandler.execute({
        role: 'tdd-quality-reviewer',
        task: `Review these TDD agent outputs and provide quality assessment.

RULES:
1. If all tasks completed successfully with code output, score 80+
2. If tests AND implementation exist, verdict should be "pass"
3. Only "iterate" if there are real bugs or missing functionality

OUTPUT FORMAT (strict JSON only, no explanation):
{"verdict":"pass","score":85,"summary":"Brief assessment"}

TASK SUMMARIES:
${JSON.stringify(truncatedResults, null, 2)}`,
        verdict_mode: 'full'
      });

      if (!review.success) {
        return {
          verdict: 'error',
          score: 0,
          issues: ['Quality review failed'],
          retry_tasks: [],
          task_issues: {}
        };
      }

      const parsed = this.repairAndParseJSON(review.response);

      return {
        verdict: parsed.verdict || 'iterate',
        score: parsed.score || 0,
        issues: parsed.issues || [],
        retry_tasks: parsed.retry_tasks || [],
        task_issues: parsed.task_issues || {},
        summary: parsed.summary || 'No summary available'
      };

    } catch (error) {
      console.error(`[ParallelAgents] Quality review error:`, error);
      return {
        verdict: 'error',
        score: 0,
        issues: [error.message],
        retry_tasks: [],
        task_issues: {}
      };
    }
  }

  /**
   * Retry a failed task with quality feedback injection
   * Enhanced: Passes specific issues to the agent for targeted fixes
   * @param {string} taskId - Task ID to retry
   * @param {Object} decomposed - Original decomposition
   * @param {Object} results - Current results
   * @param {string[]} feedback - Specific issues to fix (from quality reviewer)
   * @returns {Promise<Object|null>}
   */
  async retryTask(taskId, decomposed, results, feedback = []) {
    // Find original task definition
    let taskDef = null;
    for (const group of decomposed.parallel_groups || []) {
      for (const task of group.tasks || []) {
        if (task.id === taskId) {
          taskDef = task;
          break;
        }
      }
    }

    if (!taskDef) {
      console.error(`[ParallelAgents] Task ${taskId} not found for retry`);
      return null;
    }

    // Get previous output for context
    const previousOutput = results.task_results[taskId]?.response || null;

    const uniqueId = `${taskId}-retry-${Date.now()}`;
    
    console.error(`[ParallelAgents] Retrying ${taskId} with ${feedback.length} feedback items`);
    
    return this.executeTask(taskDef, uniqueId, {
      feedback,
      previousOutput,
      isRetry: true
    });
  }

  /**
   * Synthesize final result from all outputs
   * @param {string} originalTask - Original task description
   * @param {Object} results - All execution results
   * @param {Object} quality - Quality review result
   * @returns {Promise<Object>}
   */
  async synthesize(originalTask, results, quality) {
    // Aggregate all successful outputs
    const successfulOutputs = results.all_outputs
      .filter(o => o.success)
      .map(o => ({
        task_id: o.task_id,
        phase: o.phase,
        summary: o.response?.substring(0, 200) || 'No output'
      }));

    return {
      original_task: originalTask,
      tasks_completed: successfulOutputs.length,
      tasks_failed: results.all_outputs.filter(o => !o.success).length,
      quality_score: quality.score,
      quality_verdict: quality.verdict,
      outputs: successfulOutputs,
      recommendations: quality.issues || []
    };
  }

  /**
   * Repair and parse JSON from LLM output
   * Phase 1 learning: LLMs produce malformed JSON with various issues
   * @param {string} content - Raw content from LLM
   * @returns {Object}
   */
  repairAndParseJSON(content) {
    if (!content || typeof content !== 'string') {
      return { error: 'No content to parse' };
    }

    let json = content;

    try {
      // Fix 1: Remove stray quotes before brackets
      json = json.replace(/}"\]/g, '}]');
      json = json.replace(/\]"\}/g, ']}');

      // Fix 2: Extract JSON from markdown code blocks
      const codeBlockMatch = json.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        json = codeBlockMatch[1].trim();
      }

      // Fix 3: Find JSON object/array in text
      const jsonMatch = json.match(/[\[{][\s\S]*[\]}]/);
      if (jsonMatch) {
        json = jsonMatch[0];
      }

      // Fix 4: Remove control characters
      json = json.replace(/[\x00-\x1F\x7F]/g, ' ');

      // Fix 5: Handle escaped newlines in strings
      json = json.replace(/\\n/g, ' ');

      // Parse
      return JSON.parse(json);

    } catch (parseError) {
      // Try one more repair: sometimes there's text before/after JSON
      try {
        const lastBracket = json.lastIndexOf('}');
        const firstBracket = json.indexOf('{');
        if (firstBracket !== -1 && lastBracket !== -1) {
          json = json.substring(firstBracket, lastBracket + 1);
          return JSON.parse(json);
        }
      } catch (e) {
        // Give up
      }

      return {
        error: 'JSON parse failed',
        raw: content.substring(0, 500),
        parseError: parseError.message
      };
    }
  }

  /**
   * Count total tasks in decomposition
   * @param {Object} decomposed - Decomposition result
   * @returns {number}
   */
  countTasks(decomposed) {
    let count = 0;
    for (const group of decomposed.parallel_groups || []) {
      count += (group.tasks || []).length;
    }
    return count;
  }
}

export { ParallelAgentsHandler };
