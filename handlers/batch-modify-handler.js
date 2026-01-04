/**
 * Batch Modify Handler - Multi-file NL modifications with transaction support
 *
 * Apply same instructions to multiple files with atomic rollback capability.
 * 95% token savings per file.
 *
 * @module handlers/batch-modify-handler
 * @version 1.4.0
 */

import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';
import { ModifyFileHandler } from './modify-file-handler.js';
import { validatePath, safeJoin } from '../path-security.js';

/**
 * Transaction modes
 */
const TRANSACTION_MODES = {
  all_or_nothing: 'Rollback all changes if any file fails',
  best_effort: 'Continue with remaining files on failure'
};

/**
 * Validates batch_modify request parameters
 * @param {Object} params - Request parameters
 * @returns {{valid: boolean, errors: string[], warnings: string[]}}
 */
export function validateBatchModifyRequest(params) {
  const errors = [];
  const warnings = [];

  if (!params.files || !Array.isArray(params.files) || params.files.length === 0) {
    errors.push('files array is required and must not be empty');
  }

  if (!params.instructions) {
    errors.push('instructions is required');
  }

  if (params.files && params.files.length > 50) {
    errors.push('Maximum 50 files per batch');
  }

  if (params.options?.transactionMode && !TRANSACTION_MODES[params.options.transactionMode]) {
    warnings.push(`Unknown transactionMode '${params.options.transactionMode}', using 'all_or_nothing'`);
  }

  if (params.options?.parallel) {
    warnings.push('Parallel mode enabled - files will be processed concurrently');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * BatchModifyHandler - Multi-file natural language modifications
 */
export class BatchModifyHandler {
  /**
   * @param {Object} backendRouter - Backend router/registry instance
   * @param {Object} [options] - Handler options
   */
  constructor(backendRouter, options = {}) {
    this.router = backendRouter;
    this.modifyHandler = new ModifyFileHandler(backendRouter, options);
    this.options = {
      maxFilesPerBatch: 50,
      defaultTransactionMode: 'all_or_nothing',
      ...options
    };
  }

  /**
   * Handle batch_modify request
   * @param {Object} params - Request parameters
   * @returns {Promise<Object>}
   */
  async handle(params) {
    // Step 1: Validate request
    const validation = validateBatchModifyRequest(params);
    if (!validation.valid) {
      throw new Error(`Invalid batch_modify request: ${validation.errors.join(', ')}`);
    }

    if (validation.warnings.length > 0) {
      console.error(`[batch-modify] Warnings: ${validation.warnings.join(', ')}`);
    }

    const { files, instructions, options = {} } = params;
    const transactionMode = options.transactionMode || this.options.defaultTransactionMode;
    const parallel = options.parallel ?? false;
    const review = options.review ?? true;
    const stopOnError = options.stopOnError ?? (transactionMode === 'all_or_nothing');

    // Step 2: Resolve file patterns to actual files
    const resolvedFiles = await this._resolveFilePatterns(files);

    if (resolvedFiles.length === 0) {
      return {
        success: false,
        error: 'No files matched the provided patterns',
        patterns: files
      };
    }

    if (resolvedFiles.length > this.options.maxFilesPerBatch) {
      throw new Error(`Too many files: ${resolvedFiles.length} exceeds limit of ${this.options.maxFilesPerBatch}`);
    }

    console.error(`[batch-modify] Processing ${resolvedFiles.length} files in ${transactionMode} mode...`);

    // Step 3: Process files
    const results = [];
    const backups = new Map(); // For rollback
    const startTime = Date.now();
    let totalTokensSaved = 0;

    const processFile = async (filePath) => {
      try {
        const result = await this.modifyHandler.handle({
          filePath,
          instructions,
          options: {
            ...options,
            review: true, // Always get diff first in batch mode
            dryRun: true
          }
        });

        // Store backup info for potential rollback
        if (result.hasChanges) {
          backups.set(filePath, {
            originalHash: result.originalHash,
            modifiedContent: result.modifiedContent
          });
        }

        totalTokensSaved += result.metadata?.estimated_tokens_saved || 0;

        return {
          filePath,
          success: true,
          hasChanges: result.hasChanges,
          diff: result.diff,
          modifiedContent: result.modifiedContent
        };
      } catch (error) {
        return {
          filePath,
          success: false,
          error: error.message
        };
      }
    };

    // Process files (parallel or sequential)
    if (parallel) {
      const batchResults = await Promise.all(resolvedFiles.map(processFile));
      results.push(...batchResults);
    } else {
      for (const filePath of resolvedFiles) {
        const result = await processFile(filePath);
        results.push(result);

        if (!result.success && stopOnError) {
          console.error(`[batch-modify] Stopping on error: ${result.error}`);
          break;
        }
      }
    }

    const latency = Date.now() - startTime;

    // Step 4: Check for failures
    const failures = results.filter(r => !r.success);
    const successes = results.filter(r => r.success);
    const changedFiles = successes.filter(r => r.hasChanges);

    // Step 5: If review mode, return all diffs for approval
    if (review) {
      return {
        success: failures.length === 0,
        review: true,
        transactionMode,
        summary: {
          total: resolvedFiles.length,
          processed: results.length,
          succeeded: successes.length,
          failed: failures.length,
          withChanges: changedFiles.length
        },
        results: results.map(r => ({
          filePath: r.filePath,
          success: r.success,
          hasChanges: r.hasChanges,
          diff: r.diff,
          error: r.error
        })),
        metadata: {
          latency_ms: latency,
          estimated_tokens_saved: totalTokensSaved,
          parallel_processing: parallel
        },
        message: failures.length > 0 ?
          `${failures.length} file(s) failed. Review errors above.` :
          `Review ${changedFiles.length} file diffs above. Call again with review: false to apply.`
      };
    }

    // Step 6: Apply changes (transactional)
    if (transactionMode === 'all_or_nothing' && failures.length > 0) {
      return {
        success: false,
        transactionMode,
        error: 'Transaction aborted due to failures',
        summary: {
          total: resolvedFiles.length,
          processed: results.length,
          succeeded: successes.length,
          failed: failures.length
        },
        failures: failures.map(f => ({ filePath: f.filePath, error: f.error })),
        metadata: {
          latency_ms: latency,
          estimated_tokens_saved: totalTokensSaved
        }
      };
    }

    // Step 7: Write changes
    const writeResults = [];
    for (const result of changedFiles) {
      const backupInfo = backups.get(result.filePath);
      if (!backupInfo) continue;

      try {
        // Create backup with validated paths
        // 🔒 PATH SECURITY - Validate against traversal attacks
        const resolvedPath = await validatePath(result.filePath);
        const originalContent = await fs.readFile(resolvedPath, 'utf-8');
        const backupDir = safeJoin(path.dirname(resolvedPath), '.smart-ai-bridge-backups');
        await fs.mkdir(backupDir, { recursive: true });
        const backupPath = path.join(backupDir, `${path.basename(resolvedPath)}.${Date.now()}.bak`);
        await fs.writeFile(backupPath, originalContent, 'utf-8');

        // Write modified content
        await fs.writeFile(resolvedPath, backupInfo.modifiedContent, 'utf-8');

        writeResults.push({
          filePath: result.filePath,
          success: true,
          backupPath
        });
      } catch (error) {
        writeResults.push({
          filePath: result.filePath,
          success: false,
          error: error.message
        });

        // Rollback if all_or_nothing mode
        if (transactionMode === 'all_or_nothing') {
          console.error(`[batch-modify] Rolling back due to write failure: ${error.message}`);
          await this._rollback(writeResults.filter(w => w.success));

          return {
            success: false,
            transactionMode,
            error: `Write failed, rolled back all changes: ${error.message}`,
            rolledBack: writeResults.filter(w => w.success).map(w => w.filePath)
          };
        }
      }
    }

    const writeFailures = writeResults.filter(w => !w.success);
    const writeSuccesses = writeResults.filter(w => w.success);

    return {
      success: writeFailures.length === 0,
      transactionMode,
      summary: {
        total: resolvedFiles.length,
        analyzed: successes.length,
        modified: writeSuccesses.length,
        failed: failures.length + writeFailures.length
      },
      results: writeResults,
      metadata: {
        latency_ms: Date.now() - startTime,
        estimated_tokens_saved: totalTokensSaved,
        parallel_processing: parallel
      },
      message: writeSuccesses.length > 0 ?
        `Successfully modified ${writeSuccesses.length} file(s). Backups created.` :
        'No files were modified.'
    };
  }

  /**
   * Resolve file patterns (globs) to actual file paths
   * @private
   */
  async _resolveFilePatterns(patterns) {
    const allFiles = new Set();

    for (const pattern of patterns) {
      // Check if it's a glob pattern or direct file path
      if (pattern.includes('*') || pattern.includes('?')) {
        try {
          const matches = await glob(pattern, {
            ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
            nodir: true
          });
          matches.forEach(f => allFiles.add(f));
        } catch (error) {
          console.error(`[batch-modify] Failed to resolve pattern ${pattern}: ${error.message}`);
        }
      } else {
        // Direct file path - validate before access
        try {
          const validatedPath = await validatePath(pattern);
          await fs.access(validatedPath);
          allFiles.add(validatedPath);
        } catch (error) {
          console.error(`[batch-modify] File not accessible: ${pattern} - ${error.message}`);
        }
      }
    }

    return Array.from(allFiles);
  }

  /**
   * Rollback changes by restoring from backups
   * @private
   */
  async _rollback(writeResults) {
    for (const result of writeResults) {
      if (result.backupPath) {
        try {
          // 🔒 PATH SECURITY - Validate paths during rollback
          const validatedPath = await validatePath(result.filePath);
          const backupContent = await fs.readFile(result.backupPath, 'utf-8');
          await fs.writeFile(validatedPath, backupContent, 'utf-8');
          console.error(`[batch-modify] Rolled back: ${result.filePath}`);
        } catch (error) {
          console.error(`[batch-modify] Failed to rollback ${result.filePath}: ${error.message}`);
        }
      }
    }
  }
}

export default BatchModifyHandler;
