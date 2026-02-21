/**
 * @fileoverview FileHandlers - File operation handlers
 * @module handlers/file-handlers
 *
 * Handlers for write_files_atomic, edit_file, multi_edit, backup_restore
 *
 * @deprecated (Partial) Since v9.0:
 * - edit_file: Use modify_file instead (natural language instructions, local LLM processing)
 * - multi_edit: Use batch_modify instead (same instructions across files, atomic rollback)
 *
 * NOT deprecated:
 * - write_files_atomic: Still the best for direct file writes with backup
 * - backup_restore: Still needed for backup management
 */

import { BaseHandler } from './base-handler.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * WriteFilesAtomicHandler - Atomic multi-file write with backup
 */
class WriteFilesAtomicHandler extends BaseHandler {
  async execute(args) {
    const { file_operations, create_backup = true } = args;

    if (!file_operations || file_operations.length === 0) {
      throw new Error('file_operations is required');
    }

    const results = [];
    const backups = [];

    try {
      // Create backups first if requested
      if (create_backup) {
        for (const op of file_operations) {
          try {
            const exists = await fs.access(op.path).then(() => true).catch(() => false);
            if (exists) {
              const content = await fs.readFile(op.path, 'utf8');
              const backupPath = `${op.path}.backup.${Date.now()}`;
              await fs.writeFile(backupPath, content);
              backups.push({ original: op.path, backup: backupPath });
            }
          } catch (e) {
            // File doesn't exist, no backup needed
          }
        }
      }

      // Execute all operations
      for (const op of file_operations) {
        const operation = op.operation || 'write';
        const dirPath = path.dirname(op.path);

        // Ensure directory exists
        await fs.mkdir(dirPath, { recursive: true });

        switch (operation) {
          case 'write':
            await fs.writeFile(op.path, op.content, 'utf8');
            break;
          case 'append':
            await fs.appendFile(op.path, op.content, 'utf8');
            break;
          case 'modify':
            // For modify, content should be the full new content
            await fs.writeFile(op.path, op.content, 'utf8');
            break;
        }

        results.push({
          path: op.path,
          operation,
          success: true,
          size: op.content.length
        });
      }

      return this.buildSuccessResponse({
        files_written: results.length,
        results,
        backups_created: backups.length,
        backups
      });

    } catch (error) {
      // Rollback on failure
      if (create_backup) {
        for (const backup of backups) {
          try {
            const backupContent = await fs.readFile(backup.backup, 'utf8');
            await fs.writeFile(backup.original, backupContent);
            await fs.unlink(backup.backup);
          } catch (e) {
            console.error(`Rollback failed for ${backup.original}: ${e.message}`);
          }
        }
      }
      throw error;
    }
  }
}

/**
 * EditFileHandler - Intelligent file editing with fuzzy matching
 * @deprecated Since v9.0. Use modify_file instead for natural language edits via local LLM.
 */
class EditFileHandler extends BaseHandler {
  async execute(args) {
    // Deprecation warning
    console.error('\x1b[33m⚠️  DEPRECATED: edit_file() is deprecated since SAB v2.0\x1b[0m');
    console.error('\x1b[33m   Use modify_file() with natural language instructions.\x1b[0m');
    console.error('');

    const {
      file_path,
      edits,
      language,
      validation_mode = 'strict',
      fuzzy_threshold = 0.8,
      suggest_alternatives = true,
      max_suggestions = 3
    } = args;

    if (!file_path) {
      throw new Error('file_path is required');
    }
    if (!edits || edits.length === 0) {
      throw new Error('edits is required');
    }

    // Read current content
    let content = await fs.readFile(file_path, 'utf8');
    const originalContent = content;
    const editResults = [];

    // Dry run mode
    if (validation_mode === 'dry_run') {
      for (const edit of edits) {
        const found = content.includes(edit.find);
        editResults.push({
          find: edit.find.substring(0, 50),
          found,
          would_replace: found,
          description: edit.description
        });
      }

      return this.buildSuccessResponse({
        file_path,
        dry_run: true,
        edits_analyzed: editResults.length,
        results: editResults
      });
    }

    // Apply edits
    for (const edit of edits) {
      const result = {
        find: edit.find.substring(0, 50),
        description: edit.description
      };

      // Try exact match first
      if (content.includes(edit.find)) {
        content = content.replace(edit.find, edit.replace);
        result.success = true;
        result.match_type = 'exact';
      } else if (validation_mode === 'lenient') {
        // Try fuzzy matching
        const fuzzyResult = this.findFuzzyMatch(content, edit.find, fuzzy_threshold);
        if (fuzzyResult.found) {
          content = content.replace(fuzzyResult.match, edit.replace);
          result.success = true;
          result.match_type = 'fuzzy';
          result.similarity = fuzzyResult.similarity;
        } else {
          result.success = false;
          result.error = 'No match found';
          if (suggest_alternatives && fuzzyResult.suggestions) {
            result.suggestions = fuzzyResult.suggestions.slice(0, max_suggestions);
          }
        }
      } else {
        result.success = false;
        result.error = 'Exact match not found';
        if (suggest_alternatives) {
          const fuzzyResult = this.findFuzzyMatch(content, edit.find, 0.5);
          if (fuzzyResult.suggestions) {
            result.suggestions = fuzzyResult.suggestions.slice(0, max_suggestions);
          }
        }
      }

      editResults.push(result);
    }

    // Check if any edits failed in strict mode
    const failedEdits = editResults.filter(r => !r.success);
    if (validation_mode === 'strict' && failedEdits.length > 0) {
      return this.buildSuccessResponse({
        file_path,
        success: false,
        error: `${failedEdits.length} edit(s) failed in strict mode`,
        results: editResults
      });
    }

    // Write modified content
    if (content !== originalContent) {
      // Create backup
      const backupPath = `${file_path}.backup.${Date.now()}`;
      await fs.writeFile(backupPath, originalContent);

      // Write new content
      await fs.writeFile(file_path, content);
    }

    return this.buildSuccessResponse({
      file_path,
      edits_applied: editResults.filter(r => r.success).length,
      edits_failed: failedEdits.length,
      results: editResults,
      content_changed: content !== originalContent
    });
  }

  /**
   * Find fuzzy match in content
   * @private
   */
  findFuzzyMatch(content, searchText, threshold) {
    const lines = content.split('\n');
    const searchLines = searchText.split('\n');
    const suggestions = [];

    // Try line-by-line matching
    for (let i = 0; i <= lines.length - searchLines.length; i++) {
      const segment = lines.slice(i, i + searchLines.length).join('\n');
      const similarity = this.calculateStringSimilarity(searchText, segment);

      if (similarity >= threshold) {
        return {
          found: true,
          match: segment,
          similarity,
          lineNumber: i + 1
        };
      }

      if (similarity > 0.5) {
        suggestions.push({
          text: segment.substring(0, 100),
          similarity,
          lineNumber: i + 1
        });
      }
    }

    return {
      found: false,
      suggestions: suggestions.sort((a, b) => b.similarity - a.similarity)
    };
  }
}

/**
 * MultiEditHandler - Atomic batch operations across multiple files
 * @deprecated Since v9.0. Use batch_modify instead for natural language edits via local LLM.
 */
class MultiEditHandler extends BaseHandler {
  async execute(args) {
    // Deprecation warning
    console.error('\x1b[33m⚠️  DEPRECATED: multi_edit() is deprecated since SAB v2.0\x1b[0m');
    console.error('\x1b[33m   Use batch_modify() with natural language instructions.\x1b[0m');
    console.error('');

    const {
      file_operations,
      transaction_mode = 'all_or_nothing',
      validation_level = 'strict',
      parallel_processing = true
    } = args;

    if (!file_operations || file_operations.length === 0) {
      throw new Error('file_operations is required');
    }

    const editHandler = new EditFileHandler({
      router: this.router,
      server: this.server,
      playbook: this.playbook
    });

    const results = [];
    const backups = [];

    // Create backups for all files
    for (const op of file_operations) {
      try {
        const content = await fs.readFile(op.file_path, 'utf8');
        backups.push({
          path: op.file_path,
          content
        });
      } catch (e) {
        // File doesn't exist
      }
    }

    // Process operations
    const processOperation = async (op) => {
      try {
        const result = await editHandler.execute({
          file_path: op.file_path,
          edits: op.edits,
          validation_mode: validation_level === 'none' ? 'lenient' : validation_level
        });
        return { ...result, file_path: op.file_path };
      } catch (error) {
        return {
          file_path: op.file_path,
          success: false,
          error: error.message
        };
      }
    };

    if (parallel_processing) {
      const promises = file_operations.map(processOperation);
      results.push(...await Promise.all(promises));
    } else {
      for (const op of file_operations) {
        results.push(await processOperation(op));
      }
    }

    // Handle transaction mode
    const failedOps = results.filter(r => !r.success);

    if (transaction_mode === 'all_or_nothing' && failedOps.length > 0) {
      // Rollback all changes
      for (const backup of backups) {
        try {
          await fs.writeFile(backup.path, backup.content);
        } catch (e) {
          console.error(`Rollback failed for ${backup.path}: ${e.message}`);
        }
      }

      return this.buildSuccessResponse({
        success: false,
        transaction_mode,
        error: `${failedOps.length} operation(s) failed, all changes rolled back`,
        files_attempted: file_operations.length,
        files_succeeded: 0,
        results
      });
    }

    return this.buildSuccessResponse({
      transaction_mode,
      files_processed: file_operations.length,
      files_succeeded: results.filter(r => r.success).length,
      files_failed: failedOps.length,
      results
    });
  }
}

/**
 * BackupRestoreHandler - Backup management operations
 */
class BackupRestoreHandler extends BaseHandler {
  async execute(args) {
    const { action, file_path, backup_id, metadata, cleanup_options } = args;

    switch (action) {
      case 'create':
        return this.createBackup(file_path, metadata);
      case 'restore':
        return this.restoreBackup(file_path, backup_id);
      case 'list':
        return this.listBackups(file_path);
      case 'cleanup':
        return this.cleanupBackups(file_path, cleanup_options);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  async createBackup(filePath, metadata = {}) {
    if (!filePath) {
      throw new Error('file_path is required for create action');
    }

    const content = await fs.readFile(filePath, 'utf8');
    const backupId = `backup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const backupPath = `${filePath}.${backupId}`;

    await fs.writeFile(backupPath, content);

    // Store metadata
    const metadataPath = `${backupPath}.meta.json`;
    await fs.writeFile(metadataPath, JSON.stringify({
      ...metadata,
      originalPath: filePath,
      backupId,
      createdAt: new Date().toISOString(),
      size: content.length
    }));

    return this.buildSuccessResponse({
      action: 'create',
      backup_id: backupId,
      backup_path: backupPath,
      original_path: filePath,
      size: content.length
    });
  }

  async restoreBackup(filePath, backupId) {
    if (!filePath || !backupId) {
      throw new Error('file_path and backup_id are required for restore action');
    }

    const backupPath = `${filePath}.${backupId}`;
    const content = await fs.readFile(backupPath, 'utf8');

    // Create backup of current state before restoring
    const preRestoreBackup = `${filePath}.pre_restore_${Date.now()}`;
    try {
      const currentContent = await fs.readFile(filePath, 'utf8');
      await fs.writeFile(preRestoreBackup, currentContent);
    } catch (e) {
      // File doesn't exist, no pre-restore backup needed
    }

    await fs.writeFile(filePath, content);

    return this.buildSuccessResponse({
      action: 'restore',
      backup_id: backupId,
      restored_to: filePath,
      pre_restore_backup: preRestoreBackup
    });
  }

  async listBackups(filePath) {
    const dir = path.dirname(filePath || '.');
    const basename = path.basename(filePath || '');

    const files = await fs.readdir(dir);
    const backups = [];

    for (const file of files) {
      if (file.startsWith(basename) && file.includes('backup_')) {
        const fullPath = path.join(dir, file);
        const stats = await fs.stat(fullPath);

        if (!file.endsWith('.meta.json')) {
          const metaPath = `${fullPath}.meta.json`;
          let metadata = {};
          try {
            metadata = JSON.parse(await fs.readFile(metaPath, 'utf8'));
          } catch (e) {
            // No metadata file
          }

          backups.push({
            path: fullPath,
            backup_id: file.replace(`${basename}.`, ''),
            size: stats.size,
            created: stats.mtime,
            metadata
          });
        }
      }
    }

    return this.buildSuccessResponse({
      action: 'list',
      file_path: filePath,
      backups: backups.sort((a, b) => b.created - a.created)
    });
  }

  async cleanupBackups(filePath, options = {}) {
    const {
      max_age_days = 30,
      max_count_per_file = 10,
      dry_run = false
    } = options;

    const listResult = await this.listBackups(filePath);
    const backups = listResult.backups || [];

    const now = Date.now();
    const maxAge = max_age_days * 24 * 60 * 60 * 1000;

    const toDelete = [];

    // Filter by age
    for (const backup of backups) {
      const age = now - new Date(backup.created).getTime();
      if (age > maxAge) {
        toDelete.push({ ...backup, reason: 'age' });
      }
    }

    // Keep only max_count most recent
    const remaining = backups.filter(b => !toDelete.find(d => d.path === b.path));
    if (remaining.length > max_count_per_file) {
      const excess = remaining.slice(max_count_per_file);
      for (const backup of excess) {
        toDelete.push({ ...backup, reason: 'count' });
      }
    }

    if (!dry_run) {
      for (const backup of toDelete) {
        try {
          await fs.unlink(backup.path);
          // Also delete metadata file
          try {
            await fs.unlink(`${backup.path}.meta.json`);
          } catch (e) {
            // Metadata file might not exist
          }
        } catch (e) {
          console.error(`Failed to delete ${backup.path}: ${e.message}`);
        }
      }
    }

    return this.buildSuccessResponse({
      action: 'cleanup',
      dry_run,
      backups_deleted: toDelete.length,
      deleted: toDelete.map(b => ({ path: b.path, reason: b.reason }))
    });
  }
}

export {
  WriteFilesAtomicHandler,
  EditFileHandler,
  MultiEditHandler,
  BackupRestoreHandler
};
