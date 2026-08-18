/**
 * @fileoverview Response-shape verification (see tool-definitions.js "Returns:"
 * clauses) for write_files_atomic, backup_restore, check_backend_health.
 * Split into small files per hook size limits; see shape-*.test.js siblings
 * for the remaining 10 of the 13 previously-unverified tools.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import { WriteFilesAtomicHandler, BackupRestoreHandler } from '../src/handlers/file-handlers.js';
import { HealthHandler } from '../src/handlers/system-handlers.js';

async function mkTmpDir(prefix) {
  return fsp.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe('write_files_atomic: response shape', () => {
  let tmpDir;
  afterEach(async () => {
    if (tmpDir) await fsp.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  it('matches the documented Returns clause on the success path', async () => {
    tmpDir = await mkTmpDir('sab-shape-wfa-');
    const filePath = path.join(tmpDir, 'out.txt');

    const handler = new WriteFilesAtomicHandler({});
    const result = await handler.execute({
      file_operations: [{ path: filePath, content: 'hello', operation: 'write' }],
      create_backup: false
    });

    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('files_written');
    expect(result.results[0]).toMatchObject({ path: filePath, operation: 'write', success: true });
    expect(result.results[0]).toHaveProperty('size');
    expect(result).toHaveProperty('backups_created');
    expect(result).toHaveProperty('backups');
  });
});

describe('backup_restore: response shape', () => {
  let tmpDir;
  afterEach(async () => {
    if (tmpDir) await fsp.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  it('create action matches the documented Returns clause', async () => {
    tmpDir = await mkTmpDir('sab-shape-backup-');
    const filePath = path.join(tmpDir, 'file.txt');
    await fsp.writeFile(filePath, 'original content', 'utf8');

    const handler = new BackupRestoreHandler({});
    const result = await handler.execute({ action: 'create', file_path: filePath });

    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('action', 'create');
    expect(result).toHaveProperty('backup_id');
    expect(result).toHaveProperty('backup_path');
    expect(result).toHaveProperty('original_path', filePath);
    expect(result).toHaveProperty('size');
  });
});

describe('check_backend_health: response shape', () => {
  it('matches the documented Returns clause on the success path', async () => {
    const checkedAt = new Date();
    const handler = new HealthHandler({
      backendRegistry: {
        getAdapter: (name) => name === 'local'
          ? { checkHealth: async () => ({ healthy: true, latency: 12, checkedAt, error: null }) }
          : null
      }
    });

    const result = await handler.execute({ backend: 'local', force: false });

    expect(result).toHaveProperty('success', true);
    expect(result).toHaveProperty('status', 'online');
    expect(result).toHaveProperty('backend', 'local');
    expect(result).toHaveProperty('latency_ms', 12);
    expect(result).toHaveProperty('last_check_iso');
    expect(result).toHaveProperty('error', null);
    expect(result).toHaveProperty('total_check_time');
  });
});
