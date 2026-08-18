/**
 * @fileoverview Response-shape verification for `generate_file` and
 * `modify_file` — see shape-write-restore-health.test.js for context on this
 * test-file group.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import { GenerateFileHandler } from '../src/handlers/generate-file-handler.js';
import { ModifyFileHandler } from '../src/handlers/modify-file-handler.js';

function stubContextLimit(handler, charLimit = 500000) {
  handler.getContextLimit = async () => ({ charLimit, model: 'test-model' });
  return handler;
}

describe('generate_file: response shape', () => {
  let tmpDir;
  afterEach(async () => {
    if (tmpDir) await fsp.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  it('review mode (default) matches the documented Returns clause', async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-shape-genfile-'));
    const outputPath = path.join(tmpDir, 'sum.js');

    const handler = stubContextLimit(new GenerateFileHandler({}));
    handler.makeRequest = async () => ({
      content: 'SUMMARY: adds two numbers\n\nCODE:\n```js\nfunction sum(a, b) {\n  // simple addition helper\n  return a + b;\n}\n```',
      metadata: { finishReason: 'stop' }
    });

    const result = await handler.execute({
      spec: 'a function that sums two numbers',
      outputPath,
      options: { backend: 'local', review: true }
    });

    expect(result).toHaveProperty('success', true);
    expect(result).toHaveProperty('status', 'pending_review');
    expect(result).toHaveProperty('outputPath');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('linesOfCode');
    expect(result).toHaveProperty('language');
    expect(result).toHaveProperty('backend_used');
    expect(result).toHaveProperty('processing_time');
    expect(result).toHaveProperty('retry_attempts');
    expect(result).toHaveProperty('was_truncated', false);
    // Review mode additionally carries the generated content, per the doc's
    // trailing sentence.
    expect(result).toHaveProperty('content');
  });
});

describe('modify_file: response shape', () => {
  let tmpDir;
  afterEach(async () => {
    if (tmpDir) await fsp.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  it('dryRun mode matches the documented Returns clause', async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-shape-modfile-'));
    const filePath = path.join(tmpDir, 'const.js');
    await fsp.writeFile(filePath, 'const x = 1;\nconsole.log(x);\n', 'utf8');

    const handler = stubContextLimit(new ModifyFileHandler({}));
    handler.makeRequest = async () => ({
      content: '<<<<<<< SEARCH\nconst x = 1;\n=======\nconst x = 2;\n>>>>>>> REPLACE\nSUMMARY: changed x to 2',
      metadata: { finishReason: 'stop' }
    });

    const result = await handler.execute({
      filePath,
      instructions: 'change x to 2',
      options: { backend: 'local', dryRun: true }
    });

    expect(result).toHaveProperty('success', true);
    expect(result).toHaveProperty('status', 'dry_run');
    expect(result).toHaveProperty('filePath');
    expect(result).toHaveProperty('diff');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('stats');
    expect(result).toHaveProperty('warnings');
    expect(result).toHaveProperty('backend_used');
    expect(result).toHaveProperty('processing_time');
    expect(result).toHaveProperty('instructions');
  });
});
