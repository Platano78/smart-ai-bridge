/**
 * Smart AI Bridge v1.6.0 - Parallel Agents Handler
 *
 * TDD workflow with parallel agent execution:
 * 1. Decompose high-level task into atomic subtasks
 * 2. Run RED phase agents in parallel (write failing tests)
 * 3. Run GREEN phase agents (implement to pass tests)
 * 4. Run REFACTOR phase agents (simplify and improve code)
 * 5. Quality gate review
 * 6. Iterate if quality not met
 *
 * Uses SubagentHandler roles for specialized work.
 * REFACTOR phase uses code-reviewer role for code simplification.
 */

import { SubagentHandler } from './subagent-handler.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Default parallel agents configuration
 */
const DEFAULT_CONFIG = {
  max_parallel: 2,
  max_iterations: 3,
  quality_threshold: 0.7,
  decomposition_backend: process.env.PARALLEL_DECOMPOSITION_BACKEND || 'nvidia_qwen',
  quality_backend: process.env.PARALLEL_QUALITY_BACKEND || 'nvidia_deepseek'
};

/**
 * TDD phase to role mapping
 */
const PHASE_ROLES = {
  decompose: 'tdd-decomposer',
  red: 'tdd-test-writer',
  green: 'tdd-implementer',
  refactor: 'code-reviewer',  // Code simplification pass
  quality: 'tdd-quality-reviewer'
};

/**
 * Parallel Agents Handler - TDD workflow orchestration
 */
export class ParallelAgentsHandler {
  /**
   * @param {Object} backendRegistry - BackendRegistry instance
   */
  constructor(backendRegistry) {
    this.registry = backendRegistry;
    this.subagentHandler = new SubagentHandler(backendRegistry);
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * Handle parallel_agents request
   * @param {Object} params - Request parameters
   * @returns {Promise<Object>} TDD workflow results
   */
  async handle(params) {
    const {
      task,
      max_parallel = this.config.max_parallel,
      max_iterations = this.config.max_iterations,
      iterate_until_quality = true,
      work_directory = null,
      write_files = true
    } = params;

    // Validate inputs
    if (!task) {
      throw new Error('parallel_agents requires a task description');
    }

    if (max_parallel < 1 || max_parallel > 6) {
      throw new Error('max_parallel must be between 1 and 6');
    }

    // Setup work directory
    const workDir = work_directory || `/tmp/parallel-agents-${Date.now()}`;
    if (write_files) {
      await this._ensureDirectory(workDir);
      await this._ensureDirectory(path.join(workDir, 'red'));
      await this._ensureDirectory(path.join(workDir, 'green'));
      await this._ensureDirectory(path.join(workDir, 'refactor'));
    }

    console.error(`\n========================================`);
    console.error(`PARALLEL AGENTS TDD WORKFLOW`);
    console.error(`========================================`);
    console.error(`Task: ${task.substring(0, 80)}${task.length > 80 ? '...' : ''}`);
    console.error(`Max Parallel: ${max_parallel}`);
    console.error(`Max Iterations: ${max_iterations}`);
    console.error(`Work Directory: ${workDir}`);
    console.error(`========================================\n`);

    const startTime = Date.now();
    const results = {
      subtasks: [],
      red_phase: [],
      green_phase: [],
      refactor_phase: [],
      quality_reviews: [],
      files_written: []
    };

    let iteration = 0;
    let qualityPassed = false;

    // Step 1: Decompose task into subtasks
    console.error(`\n--- PHASE: DECOMPOSITION ---\n`);
    const subtasks = await this._decompose(task);
    results.subtasks = subtasks;
    console.error(`Decomposed into ${subtasks.length} subtasks`);

    while (iteration < max_iterations && !qualityPassed) {
      iteration++;
      console.error(`\n=== ITERATION ${iteration}/${max_iterations} ===\n`);

      // Step 2: RED phase - write failing tests in parallel
      console.error(`\n--- PHASE: RED (Write Tests) ---\n`);
      const redResults = await this._runPhaseParallel(
        'red',
        subtasks,
        max_parallel,
        { work_directory: workDir, iteration }
      );
      results.red_phase.push({ iteration, results: redResults });

      if (write_files) {
        for (const r of redResults.filter(r => r.success)) {
          const filePath = path.join(workDir, 'red', `${r.subtask.id}_test.js`);
          await this._writeFile(filePath, r.code || r.content);
          results.files_written.push(filePath);
        }
      }

      // Step 3: GREEN phase - implement to pass tests
      console.error(`\n--- PHASE: GREEN (Implement) ---\n`);
      const greenResults = await this._runPhaseParallel(
        'green',
        subtasks.map((st, i) => ({
          ...st,
          test_code: redResults[i]?.code || redResults[i]?.content
        })),
        max_parallel,
        { work_directory: workDir, iteration }
      );
      results.green_phase.push({ iteration, results: greenResults });

      if (write_files) {
        for (const r of greenResults.filter(r => r.success)) {
          const filePath = path.join(workDir, 'green', `${r.subtask.id}_impl.js`);
          await this._writeFile(filePath, r.code || r.content);
          results.files_written.push(filePath);
        }
      }

      // Step 4: REFACTOR phase - simplify and improve code
      console.error(`\n--- PHASE: REFACTOR (Simplify) ---\n`);
      const refactorResults = await this._runPhaseParallel(
        'refactor',
        subtasks.map((st, i) => ({
          ...st,
          test_code: redResults[i]?.code || redResults[i]?.content,
          impl_code: greenResults[i]?.code || greenResults[i]?.content
        })),
        max_parallel,
        { work_directory: workDir, iteration }
      );
      results.refactor_phase.push({ iteration, results: refactorResults });

      if (write_files) {
        for (const r of refactorResults.filter(r => r.success)) {
          const filePath = path.join(workDir, 'refactor', `${r.subtask.id}_refactored.js`);
          await this._writeFile(filePath, r.code || r.content);
          results.files_written.push(filePath);
        }
      }

      // Step 5: Quality gate review
      console.error(`\n--- PHASE: QUALITY GATE ---\n`);
      const qualityReview = await this._qualityGate(
        task,
        subtasks,
        redResults,
        greenResults,
        refactorResults
      );
      results.quality_reviews.push({ iteration, review: qualityReview });

      console.error(`Quality Score: ${qualityReview.score.toFixed(2)}`);
      console.error(`Status: ${qualityReview.passed ? 'PASSED' : 'NEEDS IMPROVEMENT'}`);

      if (qualityReview.passed) {
        qualityPassed = true;
      } else if (iterate_until_quality && iteration < max_iterations) {
        console.error(`Issues: ${qualityReview.issues.slice(0, 3).join(', ')}`);
        // Update subtasks with feedback for next iteration
        subtasks.forEach((st, i) => {
          st.feedback = qualityReview.feedback?.[i] || qualityReview.issues[0];
        });
      }
    }

    const duration = Date.now() - startTime;

    console.error(`\n========================================`);
    console.error(`PARALLEL AGENTS COMPLETE`);
    console.error(`========================================`);
    console.error(`Status: ${qualityPassed ? 'QUALITY_PASSED' : 'MAX_ITERATIONS_REACHED'}`);
    console.error(`Iterations: ${iteration}`);
    console.error(`Subtasks: ${subtasks.length}`);
    console.error(`Files Written: ${results.files_written.length}`);
    console.error(`Duration: ${duration}ms`);
    console.error(`========================================\n`);

    return {
      success: true,
      quality_passed: qualityPassed,
      iterations: iteration,
      subtasks: subtasks.map(st => ({
        id: st.id,
        description: st.description,
        type: st.type
      })),
      final_quality: results.quality_reviews[results.quality_reviews.length - 1]?.review,
      files_written: results.files_written,
      work_directory: workDir,
      metadata: {
        tool: 'parallel_agents',
        max_parallel,
        max_iterations,
        iterate_until_quality,
        duration_ms: duration
      }
    };
  }

  /**
   * Decompose task into atomic subtasks
   * @param {string} task - High-level task description
   * @returns {Promise<Object[]>} Array of subtasks
   */
  async _decompose(task) {
    const result = await this.subagentHandler.handle({
      role: PHASE_ROLES.decompose,
      task: `Decompose this task into 2-5 atomic subtasks for TDD implementation:

TASK: ${task}

OUTPUT FORMAT (JSON array):
[
  {"id": "task-1", "description": "...", "type": "feature|bugfix|refactor"},
  {"id": "task-2", "description": "...", "type": "feature|bugfix|refactor"}
]

Each subtask should be:
- Atomic (completable in ~10 minutes)
- Testable (clear pass/fail criteria)
- Independent (minimal dependencies)`,
      context: { original_task: task }
    });

    try {
      const match = result.text_content.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return parsed.map((st, i) => ({
          id: st.id || `task-${i + 1}`,
          description: st.description,
          type: st.type || 'feature',
          index: i
        }));
      }
    } catch (e) {
      console.error('Failed to parse subtasks, using single task fallback');
    }

    // Fallback: treat entire task as single subtask
    return [{ id: 'task-1', description: task, type: 'feature', index: 0 }];
  }

  /**
   * Run a TDD phase in parallel across subtasks
   * @param {string} phase - Phase name (red|green)
   * @param {Object[]} subtasks - Subtasks to process
   * @param {number} maxParallel - Max concurrent agents
   * @param {Object} context - Additional context
   * @returns {Promise<Object[]>} Phase results
   */
  async _runPhaseParallel(phase, subtasks, maxParallel, context) {
    const role = PHASE_ROLES[phase];
    const results = [];

    // Process in batches of maxParallel
    for (let i = 0; i < subtasks.length; i += maxParallel) {
      const batch = subtasks.slice(i, i + maxParallel);
      console.error(`  Processing batch ${Math.floor(i / maxParallel) + 1} (${batch.length} subtasks)`);

      const batchPromises = batch.map(async (subtask) => {
        try {
          const taskPrompt = phase === 'red'
            ? this._buildRedPrompt(subtask)
            : phase === 'green'
              ? this._buildGreenPrompt(subtask)
              : this._buildRefactorPrompt(subtask);

          const result = await this.subagentHandler.handle({
            role,
            task: taskPrompt,
            context: { ...context, subtask }
          });

          return {
            success: true,
            subtask,
            content: result.text_content,
            code: this._extractCode(result.text_content),
            verdict: result.verdict
          };
        } catch (error) {
          console.error(`  !! ${subtask.id} failed: ${error.message}`);
          return {
            success: false,
            subtask,
            error: error.message
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    const succeeded = results.filter(r => r.success).length;
    console.error(`  Phase ${phase.toUpperCase()}: ${succeeded}/${subtasks.length} succeeded`);

    return results;
  }

  /**
   * Build RED phase prompt (write failing test)
   * @param {Object} subtask - Subtask to test
   * @returns {string} Prompt
   */
  _buildRedPrompt(subtask) {
    return `Write a failing test for this subtask (TDD RED phase):

SUBTASK: ${subtask.description}
TYPE: ${subtask.type}
${subtask.feedback ? `PREVIOUS FEEDBACK: ${subtask.feedback}` : ''}

REQUIREMENTS:
1. Write a test that will FAIL initially (RED state)
2. Test should clearly define expected behavior
3. Use appropriate testing framework syntax
4. Include edge cases if relevant

OUTPUT: Only the test code, no explanations.`;
  }

  /**
   * Build GREEN phase prompt (implement to pass test)
   * @param {Object} subtask - Subtask with test code
   * @returns {string} Prompt
   */
  _buildGreenPrompt(subtask) {
    return `Implement code to make this test pass (TDD GREEN phase):

SUBTASK: ${subtask.description}
TYPE: ${subtask.type}

TEST CODE:
\`\`\`
${subtask.test_code || 'No test provided'}
\`\`\`

REQUIREMENTS:
1. Write MINIMAL code to make the test pass
2. Focus on correctness over optimization
3. Follow language best practices
${subtask.feedback ? `4. Address: ${subtask.feedback}` : ''}

OUTPUT: Only the implementation code, no explanations.`;
  }

  /**
   * Build REFACTOR phase prompt (simplify and improve code)
   * @param {Object} subtask - Subtask with test and implementation code
   * @returns {string} Prompt
   */
  _buildRefactorPrompt(subtask) {
    return `Review and refactor this implementation for clarity, simplicity, and maintainability (TDD REFACTOR phase):

SUBTASK: ${subtask.description}
TYPE: ${subtask.type}

TEST CODE (must still pass):
\`\`\`
${subtask.test_code || 'No test provided'}
\`\`\`

IMPLEMENTATION TO REFACTOR:
\`\`\`
${subtask.impl_code || 'No implementation provided'}
\`\`\`

REFACTORING RULES:
1. PRESERVE ALL FUNCTIONALITY - tests must still pass
2. Simplify nested conditionals (flatten with early returns/guard clauses)
3. Improve naming for clarity
4. Remove redundant code
5. Apply consistent formatting
6. Replace magic numbers with named constants
7. Consolidate duplicate logic

DON'T:
- Add new features or behavior
- Remove defensive checks at boundaries
- Over-abstract (don't create helpers for one-time operations)
- Sacrifice type safety for brevity

OUTPUT FORMAT:
\`\`\`
[Refactored code only, no explanations]
\`\`\`

SIMPLIFICATION_SCORE: [1-10] (include as comment at end)`;
  }

  /**
   * Run quality gate review
   * @param {string} originalTask - Original task description
   * @param {Object[]} subtasks - All subtasks
   * @param {Object[]} redResults - RED phase results
   * @param {Object[]} greenResults - GREEN phase results
   * @param {Object[]} refactorResults - REFACTOR phase results
   * @returns {Promise<Object>} Quality review
   */
  async _qualityGate(originalTask, subtasks, redResults, greenResults, refactorResults = []) {
    const succeeded = greenResults.filter(r => r.success);
    const refactorSucceeded = refactorResults.filter(r => r.success);
    const failureRate = 1 - (succeeded.length / subtasks.length);

    // Quick fail if too many failures
    if (failureRate > 0.5) {
      return {
        passed: false,
        score: 0.3,
        issues: [`${Math.round(failureRate * 100)}% of subtasks failed`],
        feedback: subtasks.map(() => 'Agent execution failed, retry with simpler scope')
      };
    }

    // Use refactored code if available, otherwise fall back to green
    const finalCode = refactorSucceeded.length > 0 ? refactorResults : greenResults;

    // Run quality reviewer
    const result = await this.subagentHandler.handle({
      role: PHASE_ROLES.quality,
      task: `Review this TDD implementation for quality:

ORIGINAL TASK: ${originalTask}

SUBTASKS COMPLETED: ${succeeded.length}/${subtasks.length}
REFACTORED: ${refactorSucceeded.length}/${subtasks.length}

TESTS (samples):
${redResults.slice(0, 2).map(r => r.code?.substring(0, 500) || 'N/A').join('\n---\n')}

FINAL IMPLEMENTATIONS (samples):
${finalCode.slice(0, 2).map(r => r.code?.substring(0, 500) || 'N/A').join('\n---\n')}

SCORE (0.0-1.0) and list any ISSUES.
Consider both correctness AND code quality/simplicity.
OUTPUT JSON: {"score": 0.X, "passed": true/false, "issues": [...], "feedback": [...], "simplification_quality": "good|fair|poor"}`,
      context: { subtasks, red_count: redResults.length, green_count: greenResults.length, refactor_count: refactorSucceeded.length }
    });

    try {
      const match = result.text_content.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return {
          passed: parsed.passed || parsed.score >= this.config.quality_threshold,
          score: parseFloat(parsed.score) || 0.5,
          issues: parsed.issues || [],
          feedback: parsed.feedback || []
        };
      }
    } catch (e) {
      console.error('Failed to parse quality review');
    }

    // Heuristic fallback
    return {
      passed: succeeded.length === subtasks.length,
      score: succeeded.length / subtasks.length,
      issues: ['Quality review parsing failed'],
      feedback: []
    };
  }

  /**
   * Extract code from response
   * @param {string} content - Response content
   * @returns {string} Extracted code
   */
  _extractCode(content) {
    const match = content?.match(/```(?:\w+)?\n([\s\S]*?)```/);
    return match ? match[1].trim() : content?.trim() || '';
  }

  /**
   * Ensure directory exists
   * @param {string} dir - Directory path
   */
  async _ensureDirectory(dir) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  }

  /**
   * Write file with content
   * @param {string} filePath - File path
   * @param {string} content - File content
   */
  async _writeFile(filePath, content) {
    await fs.writeFile(filePath, content, 'utf-8');
    console.error(`  Wrote: ${filePath}`);
  }
}

export default ParallelAgentsHandler;
