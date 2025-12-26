/**
 * BatchModifyHandler - Multi-File Modification with Atomic Rollback
 *
 * Purpose: Apply modifications to multiple files with atomic commit/rollback
 * Token savings: Apply same instructions across files efficiently
 *
 * Features:
 * - Apply instructions to multiple files
 * - Atomic transaction mode (all or nothing)
 * - Parallel or sequential processing
 * - Automatic rollback on failure
 * - Review mode for all changes
 */

import { BaseHandler } from './base-handler.js';
import { ModifyFileHandler } from './modify-file-handler.js';
import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';

export class BatchModifyHandler extends BaseHandler {

  constructor(context) {
    super(context);
    this.modifyHandler = new ModifyFileHandler(context);
  }

  /**
   * Execute batch modification using local LLM
   * @param {Object} args - Modification arguments
   * @param {string[]} args.files - File paths or glob patterns
   * @param {string} args.instructions - Instructions to apply to each file
   * @param {Object} [args.options] - Optional configuration
   * @param {boolean} [args.options.parallel] - Parallel processing (default: false for safety)
   * @param {boolean} [args.options.stopOnError] - Stop on first error (default: true)
   * @param {boolean} [args.options.review] - Return for approval (default: true)
   * @param {string} [args.options.transactionMode] - 'all_or_nothing' | 'best_effort' (default: all_or_nothing)
   * @param {string} [args.options.backend] - Force specific backend
   * @returns {Promise<Object>} Batch modification results
   */
  async execute(args) {
    const { files, instructions, options = {} } = args;

    if (!files || files.length === 0) {
      throw new Error('files is required');
    }
    if (!instructions) {
      throw new Error('instructions is required');
    }

    const {
      parallel = false,
      stopOnError = true,
      review = true,
      transactionMode = 'all_or_nothing',
      backend = 'auto'
    } = options;

    const startTime = Date.now();

    try {
      // 1. Expand patterns to actual files
      const resolvedFiles = await this.expandPatterns(files);

      if (resolvedFiles.length === 0) {
        return this.buildSuccessResponse({
          status: 'no_files',
          message: 'No files matched the provided patterns',
          patterns: files
        });
      }

      console.error(`[BatchModify] ✏️ Modifying ${resolvedFiles.length} files`);
      console.error(`[BatchModify] 🎯 Mode: ${transactionMode}, Review: ${review}`);
      console.error(`[BatchModify] 📋 Instructions: ${instructions.substring(0, 100)}...`);

      // 2. Create backups for atomic rollback
      const backups = new Map();
      if (transactionMode === 'all_or_nothing') {
        for (const filePath of resolvedFiles) {
          try {
            const content = await fs.readFile(filePath, 'utf8');
            backups.set(filePath, content);
          } catch (error) {
            console.error(`[BatchModify] Warning: Could not backup ${filePath}: ${error.message}`);
          }
        }
      }

      // 3. Process files
      const results = parallel
        ? await this.modifyParallel(resolvedFiles, instructions, { backend, review, stopOnError })
        : await this.modifySequential(resolvedFiles, instructions, { backend, review, stopOnError });

      const processingTime = Date.now() - startTime;

      // 4. Check for failures
      const failures = results.filter(r => r.error || r.status === 'failed');
      const successes = results.filter(r => !r.error && r.status !== 'failed');

      // 5. Handle transaction mode
      if (transactionMode === 'all_or_nothing' && failures.length > 0 && !review) {
        // Rollback all changes
        await this.rollback(backups);

        return this.buildErrorResponse({
          status: 'rolled_back',
          message: `${failures.length} modifications failed. All changes rolled back.`,
          failures: failures.map(f => ({
            filePath: f.filePath,
            error: f.error
          })),
          successes: successes.length,
          processing_time: processingTime
        });
      }

      // 6. Build response
      if (review) {
        // Return all diffs for review
        this.recordExecution(
          {
            success: true,
            backend,
            processingTime,
            fileCount: resolvedFiles.length,
            mode: 'review'
          },
          {
            tool: 'batch_modify',
            taskType: 'batch_modification',
            patterns: files.join(', ')
          }
        );

        return this.buildSuccessResponse({
          status: 'pending_review',
          filesProcessed: resolvedFiles.length,
          patterns: files,
          instructions,
          modifications: results.map(r => ({
            filePath: r.filePath,
            status: r.error ? 'error' : 'pending_review',
            summary: r.summary,
            diff: r.diff,
            stats: r.stats,
            error: r.error
          })),
          successCount: successes.length,
          failureCount: failures.length,
          processing_time: processingTime,
          approval_instructions: 'Review each modification. Use write_files_atomic to apply approved changes.',
          tokens_saved: this.estimateBatchTokensSaved(resolvedFiles.length)
        });
      }

      // Auto-write mode (review=false)
      this.recordExecution(
        {
          success: failures.length === 0,
          backend,
          processingTime,
          fileCount: resolvedFiles.length,
          mode: 'write'
        },
        {
          tool: 'batch_modify',
          taskType: 'batch_modification',
          patterns: files.join(', ')
        }
      );

      return this.buildSuccessResponse({
        status: failures.length === 0 ? 'completed' : 'partial',
        filesProcessed: resolvedFiles.length,
        patterns: files,
        instructions,
        modifications: results.map(r => ({
          filePath: r.filePath,
          status: r.error ? 'error' : 'written',
          summary: r.summary,
          stats: r.stats,
          error: r.error
        })),
        successCount: successes.length,
        failureCount: failures.length,
        transactionMode,
        processing_time: processingTime,
        tokens_saved: this.estimateBatchTokensSaved(resolvedFiles.length)
      });

    } catch (error) {
      console.error(`[BatchModify] ❌ Error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Expand glob patterns to actual file paths
   */
  async expandPatterns(patterns) {
    const files = new Set();

    for (const pattern of patterns) {
      if (!pattern.includes('*') && !pattern.includes('?')) {
        // Direct file path
        try {
          const stat = await fs.stat(pattern);
          if (stat.isFile()) {
            files.add(path.resolve(pattern));
          }
        } catch {
          // Skip non-existent files
        }
        continue;
      }

      // Expand glob
      const matches = await glob(pattern, {
        ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
        nodir: true
      });

      matches.forEach(f => files.add(path.resolve(f)));
    }

    return Array.from(files);
  }

  /**
   * Modify files in parallel
   */
  async modifyParallel(files, instructions, options) {
    const { backend, review, stopOnError } = options;
    const concurrency = 2; // Limit concurrent modifications
    const results = [];
    let shouldStop = false;

    for (let i = 0; i < files.length && !shouldStop; i += concurrency) {
      const batch = files.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(filePath =>
          this.modifyHandler.execute({
            filePath,
            instructions,
            options: {
              backend,
              review,
              backup: true,
              dryRun: review // Use dryRun if review mode
            }
          }).then(result => ({
            filePath,
            ...result
          })).catch(error => ({
            filePath,
            error: error.message,
            status: 'failed'
          }))
        )
      );

      results.push(...batchResults);

      // Check for errors if stopOnError
      if (stopOnError && batchResults.some(r => r.error)) {
        shouldStop = true;
      }
    }

    return results;
  }

  /**
   * Modify files sequentially
   */
  async modifySequential(files, instructions, options) {
    const { backend, review, stopOnError } = options;
    const results = [];

    for (const filePath of files) {
      try {
        const result = await this.modifyHandler.execute({
          filePath,
          instructions,
          options: {
            backend,
            review,
            backup: true,
            dryRun: review
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

        if (stopOnError) {
          break;
        }
      }
    }

    return results;
  }

  /**
   * Rollback all changes using backups
   */
  async rollback(backups) {
    console.error(`[BatchModify] 🔄 Rolling back ${backups.size} files...`);

    for (const [filePath, content] of backups) {
      try {
        await fs.writeFile(filePath, content, 'utf8');
        console.error(`[BatchModify] ↩️ Restored: ${filePath}`);
      } catch (error) {
        console.error(`[BatchModify] ⚠️ Could not restore ${filePath}: ${error.message}`);
      }
    }
  }

  /**
   * Estimate tokens saved
   */
  estimateBatchTokensSaved(fileCount) {
    // Average file = 2000 tokens + instructions
    // Without MKG: Claude processes each file individually
    // With MKG: Claude sends instructions once, gets summaries
    const withoutMKG = 2000 * fileCount + 500; // Files + instructions repeated
    const withMKG = 500 + 200 * fileCount; // Instructions once + summaries
    return Math.max(0, withoutMKG - withMKG);
  }
}

export default BatchModifyHandler;
