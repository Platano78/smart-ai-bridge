/**
 * @fileoverview Response-shape verification for `batch_modify` — see
 * shape-write-restore-health.test.js for context on this test-file group.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import { BatchModifyHandler } from '../src/handlers/batch-modify-handler.js';

function stubContextLimit(handler, charLimit = 500000) {
  handler.getContextLimit = async () => ({ charLimit, model: 'test-model' });
  return handler;
}

describe('batch_modify: response shape', () => {
  let tmpDir;
  afterEach(async () => {
    if (tmpDir) await fsp.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  it('review mode (default) matches the documented Returns clause', async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-shape-batchmod-'));
    const filePath = path.join(tmpDir, 'a.js');
    await fsp.writeFile(filePath, 'const a = 1;\n', 'utf8');

    const handler = stubContextLimit(new BatchModifyHandler({}));
    handler.modifyHandler.execute = async () => ({
      status: 'pending_review',
      diff: '--- a\n+++ b\n',
      summary: 'renamed a to b',
      stats: { linesAdded: 1, linesRemoved: 1 }
    });

    const result = await handler.execute({
      files: [filePath],
      instructions: 'rename a to b',
      options: { parallel: false, review: true }
    });

    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('status', 'pending_review');
    expect(result).toHaveProperty('filesProcessed', 1);
    expect(result).toHaveProperty('patterns');
    expect(result).toHaveProperty('instructions');
    expect(result.modifications[0]).toMatchObject({
      filePath,
      status: 'pending_review',
      summary: 'renamed a to b'
    });
    expect(result.modifications[0]).toHaveProperty('diff');
    expect(result.modifications[0]).toHaveProperty('stats');
    expect(result).toHaveProperty('successCount', 1);
    expect(result).toHaveProperty('failureCount', 0);
    expect(result).toHaveProperty('approval_instructions');
    expect(result).toHaveProperty('tokens_saved');
  });
});
