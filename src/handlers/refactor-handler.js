/**
 * RefactorHandler - Cross-File Refactoring with Scope Control
 *
 * Purpose: Apply refactoring across files with intelligent scope detection
 * Token savings: LLM handles complex refactoring, Claude just approves
 *
 * Features:
 * - Scope-based targeting (function, class, module, project)
 * - Symbol/pattern-based targeting
 * - Reference tracking
 * - Preview/dry-run mode
 * - Coordinated multi-file changes
 */

import { BaseHandler } from './base-handler.js';
import { ModifyFileHandler } from './modify-file-handler.js';
import { BatchAnalyzeHandler } from './batch-analyze-handler.js';
import { smartContext } from '../context/smart-context.js';
import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';

// Refactoring complexity determines backend
const REFACTOR_BACKEND_MAP = {
  function: 'local',
  class: 'nvidia_qwen',
  module: 'nvidia_deepseek',
  project: 'nvidia_deepseek'
};

export class RefactorHandler extends BaseHandler {

  constructor(context) {
    super(context);
    this.modifyHandler = new ModifyFileHandler(context);
    this.analyzeHandler = new BatchAnalyzeHandler(context);
  }

  /**
   * Execute refactoring operation
   * @param {Object} args - Refactoring arguments
   * @param {string} args.scope - 'function' | 'class' | 'module' | 'project'
   * @param {string} args.target - Symbol or pattern to refactor
   * @param {string} args.instructions - Refactoring instructions
   * @param {Object} [args.options] - Optional configuration
   * @param {string[]} [args.options.files] - Limit to specific files
   * @param {boolean} [args.options.dryRun] - Preview changes without writing
   * @param {boolean} [args.options.review] - Return for approval (default: true)
   * @param {string} [args.options.backend] - Force specific backend
   * @param {boolean} [args.options.findReferences] - Find and update references (default: true)
   * @returns {Promise<Object>} Refactoring plan and results
   */
  async execute(args) {
    const { scope, target, instructions, options = {} } = args;

    if (!scope) {
      throw new Error('scope is required (function|class|module|project)');
    }
    if (!target) {
      throw new Error('target is required (symbol name or pattern)');
    }
    if (!instructions) {
      throw new Error('instructions is required');
    }

    const validScopes = ['function', 'class', 'module', 'project'];
    if (!validScopes.includes(scope)) {
      throw new Error(`Invalid scope: ${scope}. Must be one of: ${validScopes.join(', ')}`);
    }

    const {
      files = [],
      dryRun = false,
      review = true,
      backend = 'auto',
      findReferences = true
    } = options;

    const startTime = Date.now();

    try {
      console.error(`[Refactor] 🔧 Scope: ${scope}, Target: ${target}`);
      console.error(`[Refactor] 📋 Instructions: ${instructions.substring(0, 100)}...`);

      // 1. Find all files containing the target
      const targetFiles = files.length > 0
        ? await this.resolveFiles(files)
        : await this.findTargetFiles(target, scope);

      if (targetFiles.length === 0) {
        return this.buildSuccessResponse({
          status: 'no_targets',
          message: `No files found containing: ${target}`,
          scope,
          target
        });
      }

      console.error(`[Refactor] 📂 Found ${targetFiles.length} files with target`);

      // 2. Analyze current state
      const analysis = await this.analyzeCurrentState(targetFiles, target, scope);

      // 3. Build refactoring plan
      const plan = await this.buildRefactoringPlan(targetFiles, target, instructions, {
        scope,
        analysis,
        findReferences
      });

      // 4. Select backend based on scope
      const selectedBackend = this.selectBackend(backend, scope);

      console.error(`[Refactor] 🎯 Backend: ${selectedBackend}`);
      console.error(`[Refactor] 📊 Plan: ${plan.steps.length} steps across ${plan.files.length} files`);

      // 5. Execute refactoring
      const results = await this.executeRefactoring(plan, {
        backend: selectedBackend,
        dryRun,
        review
      });

      const processingTime = Date.now() - startTime;

      // 6. Record execution
      this.recordExecution(
        {
          success: !results.some(r => r.error),
          backend: selectedBackend,
          processingTime,
          scope,
          fileCount: targetFiles.length
        },
        {
          tool: 'refactor',
          taskType: 'refactoring',
          target
        }
      );

      // 7. Build response
      if (dryRun || review) {
        return this.buildSuccessResponse({
          status: dryRun ? 'dry_run' : 'pending_review',
          scope,
          target,
          instructions,
          plan: {
            description: plan.description,
            steps: plan.steps.map(s => s.description),
            filesAffected: plan.files.length,
            estimatedChanges: plan.estimatedChanges
          },
          modifications: results.map(r => ({
            filePath: r.filePath,
            status: r.error ? 'error' : (dryRun ? 'dry_run' : 'pending_review'),
            summary: r.summary,
            diff: r.diff,
            stats: r.stats,
            error: r.error
          })),
          analysis: {
            occurrences: analysis.occurrences,
            references: analysis.references,
            impact: analysis.impact
          },
          backend_used: selectedBackend,
          processing_time: processingTime,
          tokens_saved: this.estimateTokensSaved(targetFiles.length, scope)
        });
      }

      // Auto-apply mode
      const failures = results.filter(r => r.error);
      const successes = results.filter(r => !r.error);

      return this.buildSuccessResponse({
        status: failures.length === 0 ? 'completed' : 'partial',
        scope,
        target,
        instructions,
        filesModified: successes.length,
        filesTotal: targetFiles.length,
        modifications: results.map(r => ({
          filePath: r.filePath,
          status: r.error ? 'error' : 'written',
          summary: r.summary,
          error: r.error
        })),
        backend_used: selectedBackend,
        processing_time: processingTime
      });

    } catch (error) {
      console.error(`[Refactor] ❌ Error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find files containing the target symbol/pattern
   */
  async findTargetFiles(target, scope) {
    const searchPatterns = this.getScopePatterns(scope);
    const foundFiles = new Set();

    for (const pattern of searchPatterns) {
      const files = await glob(pattern, {
        ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
        nodir: true
      });

      for (const file of files) {
        try {
          const content = await fs.readFile(file, 'utf8');
          if (content.includes(target)) {
            foundFiles.add(path.resolve(file));
          }
        } catch {
          // Skip unreadable files
        }
      }
    }

    return Array.from(foundFiles);
  }

  /**
   * Get glob patterns based on scope
   */
  getScopePatterns(scope) {
    switch (scope) {
      case 'function':
      case 'class':
        // Search in common source directories
        return [
          'src/**/*.{js,ts,jsx,tsx}',
          'lib/**/*.{js,ts}',
          '*.{js,ts}'
        ];
      case 'module':
        return [
          'src/**/*.{js,ts,jsx,tsx}',
          'lib/**/*.{js,ts}',
          'packages/**/*.{js,ts}'
        ];
      case 'project':
        return [
          '**/*.{js,ts,jsx,tsx}',
          '**/*.{py,go,rs,java}'
        ];
      default:
        return ['src/**/*.{js,ts,jsx,tsx}'];
    }
  }

  /**
   * Resolve file patterns to actual paths
   */
  async resolveFiles(patterns) {
    const files = new Set();

    for (const pattern of patterns) {
      if (!pattern.includes('*')) {
        try {
          await fs.access(pattern);
          files.add(path.resolve(pattern));
        } catch {
          // Skip
        }
        continue;
      }

      const matches = await glob(pattern, {
        ignore: ['**/node_modules/**', '**/.git/**'],
        nodir: true
      });
      matches.forEach(f => files.add(path.resolve(f)));
    }

    return Array.from(files);
  }

  /**
   * Analyze current state of target across files
   */
  async analyzeCurrentState(files, target, scope) {
    const occurrences = [];
    let totalReferences = 0;

    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.split('\n');

        // Find lines containing target
        lines.forEach((line, index) => {
          if (line.includes(target)) {
            occurrences.push({
              file: path.basename(filePath),
              line: index + 1,
              content: line.trim().substring(0, 100)
            });
            totalReferences++;
          }
        });
      } catch {
        // Skip
      }
    }

    // Estimate impact
    let impact = 'low';
    if (totalReferences > 20) impact = 'high';
    else if (totalReferences > 5) impact = 'medium';

    return {
      occurrences: occurrences.slice(0, 10), // Top 10
      totalOccurrences: occurrences.length,
      references: totalReferences,
      impact,
      filesAffected: files.length
    };
  }

  /**
   * Build a refactoring plan
   */
  async buildRefactoringPlan(files, target, instructions, options) {
    const { scope, analysis, findReferences } = options;

    const steps = [];
    let description = '';

    switch (scope) {
      case 'function':
        description = `Refactor function "${target}" across ${files.length} files`;
        steps.push({
          type: 'modify',
          description: `Update function definition of ${target}`,
          priority: 1
        });
        if (findReferences) {
          steps.push({
            type: 'update_references',
            description: `Update all call sites of ${target}`,
            priority: 2
          });
        }
        break;

      case 'class':
        description = `Refactor class "${target}" and its members`;
        steps.push({
          type: 'modify',
          description: `Update class definition of ${target}`,
          priority: 1
        });
        steps.push({
          type: 'update_methods',
          description: `Update class methods as needed`,
          priority: 2
        });
        if (findReferences) {
          steps.push({
            type: 'update_references',
            description: `Update all usages of ${target}`,
            priority: 3
          });
        }
        break;

      case 'module':
        description = `Refactor module containing "${target}"`;
        steps.push({
          type: 'analyze',
          description: `Analyze module dependencies`,
          priority: 1
        });
        steps.push({
          type: 'modify',
          description: `Apply refactoring to module`,
          priority: 2
        });
        steps.push({
          type: 'update_imports',
          description: `Update import statements`,
          priority: 3
        });
        break;

      case 'project':
        description = `Project-wide refactoring for "${target}"`;
        steps.push({
          type: 'analyze',
          description: `Analyze project-wide impact`,
          priority: 1
        });
        steps.push({
          type: 'modify_core',
          description: `Apply core changes`,
          priority: 2
        });
        steps.push({
          type: 'update_all_references',
          description: `Update all references across project`,
          priority: 3
        });
        steps.push({
          type: 'verify',
          description: `Verify consistency`,
          priority: 4
        });
        break;
    }

    return {
      description,
      steps,
      files,
      target,
      instructions,
      scope,
      estimatedChanges: analysis.totalOccurrences
    };
  }

  /**
   * Execute the refactoring plan
   */
  async executeRefactoring(plan, options) {
    const { backend, dryRun, review } = options;
    const results = [];

    // Build comprehensive refactoring prompt
    const refactorPrompt = this.buildRefactorPrompt(plan);

    for (const filePath of plan.files) {
      try {
        const result = await this.modifyHandler.execute({
          filePath,
          instructions: refactorPrompt,
          options: {
            backend,
            review,
            dryRun,
            backup: true
          }
        });

        results.push({
          filePath,
          ...result
        });
      } catch (error) {
        results.push({
          filePath,
          error: error.message,
          status: 'failed'
        });
      }
    }

    return results;
  }

  /**
   * Build comprehensive refactoring prompt
   */
  buildRefactorPrompt(plan) {
    return `REFACTORING TASK:
${plan.description}

TARGET: ${plan.target}

INSTRUCTIONS:
${plan.instructions}

SCOPE: ${plan.scope}

STEPS TO FOLLOW:
${plan.steps.map((s, i) => `${i + 1}. ${s.description}`).join('\n')}

IMPORTANT:
- Maintain consistent naming conventions
- Preserve functionality
- Update all relevant references
- Ensure the code compiles/runs after changes
- If you're unsure about a change, preserve the original behavior
`;
  }

  /**
   * Select backend based on scope
   */
  selectBackend(requestedBackend, scope) {
    if (requestedBackend && requestedBackend !== 'auto') {
      const backendMap = {
        local: 'local',
        deepseek: 'nvidia_deepseek',
        qwen3: 'nvidia_qwen',
        gemini: 'gemini',
        groq: 'groq_llama'
      };
      return backendMap[requestedBackend] || requestedBackend;
    }

    return REFACTOR_BACKEND_MAP[scope] || 'nvidia_qwen';
  }

  /**
   * Estimate tokens saved
   */
  estimateTokensSaved(fileCount, scope) {
    // Refactoring without MKG: Claude processes all files, understands context
    // With MKG: Claude sends instructions, local LLM does the work
    const basePerFile = 3000; // Average refactoring context per file
    const scopeMultiplier = {
      function: 1,
      class: 1.5,
      module: 2,
      project: 3
    };

    const withoutMKG = basePerFile * fileCount * (scopeMultiplier[scope] || 1);
    const withMKG = 500 + (200 * fileCount); // Instructions + summaries

    return Math.max(0, withoutMKG - withMKG);
  }
}

export default RefactorHandler;
