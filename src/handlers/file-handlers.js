/**
 * @fileoverview FileHandlers - File operation handlers
 * @module handlers/file-handlers
 *
 * Handlers for write_files_atomic and backup_restore
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

    const content = await this.safeReadFile(filePath);
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
    const content = await this.safeReadFile(backupPath);

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
  BackupRestoreHandler
};
