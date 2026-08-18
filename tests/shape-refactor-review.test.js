/**
 * @fileoverview Response-shape verification for `refactor` and `review` —
 * see shape-write-restore-health.test.js for context on this test-file group.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import { RefactorHandler } from '../src/handlers/refactor-handler.js';
import { ReviewHandler } from '../src/handlers/review-handler.js';

function stubContextLimit(handler, charLimit = 500000) {
  handler.getContextLimit = async () => ({ charLimit, model: 'test-model' });
  return handler;
}

describe('refactor: response shape', () => {
  let tmpDir;
  afterEach(async () => {
    if (tmpDir) await fsp.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  it('dryRun mode matches the documented Returns clause', async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-shape-refactor-'));
    const filePath = path.join(tmpDir, 'foo.js');
    await fsp.writeFile(filePath, 'function foo() { return 1; }\n', 'utf8');

    const handler = stubContextLimit(new RefactorHandler({}));
    handler.modifyHandler.execute = async () => ({
      status: 'dry_run',
      diff: '--- foo\n+++ bar\n',
      summary: 'renamed foo to bar',
      stats: { linesAdded: 1, linesRemoved: 1 }
    });

    const result = await handler.execute({
      scope: 'function',
      target: 'foo',
      instructions: 'rename foo to bar',
      options: { files: [filePath], backend: 'local', dryRun: true }
    });

    expect(result).toHaveProperty('success', true);
    expect(result).toHaveProperty('status', 'dry_run');
    expect(result).toHaveProperty('scope', 'function');
    expect(result).toHaveProperty('target', 'foo');
    expect(result).toHaveProperty('instructions');
    expect(result.plan).toHaveProperty('description');
    expect(result.plan).toHaveProperty('steps');
    expect(result.plan).toHaveProperty('filesAffected');
    expect(result.plan).toHaveProperty('estimatedChanges');
    expect(result.modifications[0]).toMatchObject({ filePath, status: 'dry_run' });
    expect(result.modifications[0]).toHaveProperty('diff');
    expect(result.modifications[0]).toHaveProperty('summary');
    expect(result.analysis).toHaveProperty('occurrences');
    expect(result.analysis).toHaveProperty('references');
    expect(result.analysis).toHaveProperty('impact');
    expect(result).toHaveProperty('tokens_saved');
    expect(result).toHaveProperty('backend_used', 'local');
    expect(result).toHaveProperty('processing_time');
  });
});

describe('review: response shape', () => {
  it('matches the documented Returns clause on the success path', async () => {
    const handler = stubContextLimit(new ReviewHandler({}));
    handler.routeRequest = async () => 'local';
    handler.makeRequest = async () => 'Review findings: looks fine, no issues found.';

    const result = await handler.execute({
      content: 'function add(a, b) { return a + b; }',
      file_path: 'add.js',
      review_type: 'comprehensive'
    });

    expect(result).toHaveProperty('success', true);
    expect(result).toHaveProperty('file_path', 'add.js');
    expect(result).toHaveProperty('language');
    expect(result).toHaveProperty('review_type', 'comprehensive');
    expect(result).toHaveProperty('review');
    expect(result).toHaveProperty('endpoint_used', 'local');
  });
});
