/**
 * @fileoverview Capacity gates must measure the ASSEMBLED PROMPT actually sent
 * to a backend (file content + instructions/context/scaffolding), not just the
 * raw file content. A gate that only checks file content misses everything
 * gatherContextFiles/buildAnalysisPrompt/buildModifyPrompt add on top, and can
 * ship an oversized prompt to a backend that never had room for it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import { AnalyzeFileHandler } from '../src/handlers/analyze-file-handler.js';
import { ModifyFileHandler } from '../src/handlers/modify-file-handler.js';
import { RefactorHandler } from '../src/handlers/refactor-handler.js';
import { BatchAnalyzeHandler } from '../src/handlers/batch-analyze-handler.js';

async function writeTmpFile(content, name = 'target.js') {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-capgate-'));
  const filePath = path.join(tmpDir, name);
  await fsp.writeFile(filePath, content, 'utf8');
  return { tmpDir, filePath };
}

describe('analyze_file: gate measures the assembled prompt, not raw content', () => {
  let tmpDir;
  afterEach(async () => {
    if (tmpDir) await fsp.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  it('refuses when content alone fits but content+includeContext does not', async () => {
    const content = 'a'.repeat(50000);
    const fixture = await writeTmpFile(content, 'main.js');
    tmpDir = fixture.tmpDir;

    const contextContent = 'b'.repeat(20000);
    const contextFixture = await writeTmpFile(contextContent, 'context.js');

    const handler = new AnalyzeFileHandler({});
    // Fix the backend's limit small enough that content alone (50000) fits,
    // but content + includeContext (~70000+ scaffolding) does not.
    handler.getBackendContextLimit = () => 60000;
    // No roomier backend exists — force the refusal branch deterministically.
    handler.findBackendWithCapacity = async () => null;
    handler.largestBackendCapacity = async () => 60000;

    let capturedError = null;
    try {
      await handler.execute({
        filePath: fixture.filePath,
        question: 'what is this',
        options: { backend: 'nvidia_glm', includeContext: [contextFixture.filePath] }
      });
    } catch (err) {
      capturedError = err;
    } finally {
      await fsp.rm(contextFixture.tmpDir, { recursive: true, force: true });
    }

    expect(capturedError).not.toBeNull();
    expect(capturedError.message).toMatch(/Assembled prompt/i);
    // Must cite the assembled prompt length (content + context + scaffolding),
    // not the raw 50000-char file content.
    expect(capturedError.message).not.toContain('50000 chars');
    const citedChars = Number(capturedError.message.match(/is (\d+) chars/)[1]);
    // Must exceed the 60000-char limit that triggered the refusal (raw
    // content alone, 50000, would not have).
    expect(citedChars).toBeGreaterThan(60000);
  });

  it('still succeeds when content and content+includeContext both fit', async () => {
    const content = 'a'.repeat(1000);
    const fixture = await writeTmpFile(content, 'main.js');
    tmpDir = fixture.tmpDir;

    const handler = new AnalyzeFileHandler({});
    handler.getBackendContextLimit = () => 60000;
    handler.makeRequest = async () => ({
      content: '{"summary":"ok","findings":[],"confidence":0.9,"suggestedActions":[]}',
      metadata: { finishReason: 'stop' }
    });

    const result = await handler.execute({
      filePath: fixture.filePath,
      question: 'what is this',
      options: { backend: 'nvidia_glm' }
    });

    expect(result.summary).toBe('ok');
  });
});

describe('modify_file: gate measures the assembled prompt, not raw originalContent', () => {
  let tmpDir;
  afterEach(async () => {
    if (tmpDir) await fsp.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  it('refuses when originalContent alone fits but originalContent+instructions does not', async () => {
    const originalContent = 'a'.repeat(50000);
    const fixture = await writeTmpFile(originalContent, 'main.js');
    tmpDir = fixture.tmpDir;

    const bigInstructions = 'refactor this: ' + 'x'.repeat(20000);

    const handler = new ModifyFileHandler({});
    handler.getBackendContextLimit = () => 60000;
    handler.findBackendWithCapacity = async () => null;
    handler.largestBackendCapacity = async () => 60000;

    let capturedError = null;
    try {
      await handler.execute({
        filePath: fixture.filePath,
        instructions: bigInstructions,
        options: { backend: 'nvidia_glm' }
      });
    } catch (err) {
      capturedError = err;
    }

    expect(capturedError).not.toBeNull();
    expect(capturedError.message).toMatch(/Assembled prompt/i);
    expect(capturedError.message).not.toContain('50000 chars');
    const citedChars = Number(capturedError.message.match(/is (\d+) chars/)[1]);
    expect(citedChars).toBeGreaterThan(70000);
  });

  it('still succeeds when originalContent and originalContent+instructions both fit', async () => {
    const originalContent = 'a'.repeat(1000);
    const fixture = await writeTmpFile(originalContent, 'main.js');
    tmpDir = fixture.tmpDir;

    const handler = new ModifyFileHandler({});
    handler.getBackendContextLimit = () => 60000;
    handler.makeRequest = async () => ({
      content: 'SUMMARY: no changes needed\n\n<<<<<<< SEARCH\naaa\n=======\naaa\n>>>>>>> REPLACE',
      metadata: { finishReason: 'stop' }
    });

    const result = await handler.execute({
      filePath: fixture.filePath,
      instructions: 'do nothing',
      options: { backend: 'nvidia_glm', dryRun: true }
    });

    expect(result.status).toBe('dry_run');
  });
});

describe('refactor: per-file gate uses the dynamic/selected capacity, not the static table', () => {
  let tmpDir;
  afterEach(async () => {
    if (tmpDir) await fsp.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  it('skips a file that fits under the static 512000 limit but exceeds the dynamic probed capacity', async () => {
    const fixture = await writeTmpFile('a'.repeat(500), 'main.js');
    tmpDir = fixture.tmpDir;

    const handler = new RefactorHandler({});
    // Simulate a dynamic probe (e.g. a small local context window) far below
    // the flat static 512000 char table entry for 'local'.
    handler.capacityFor = async () => 100;
    let modifyCalled = false;
    handler.modifyHandler.execute = async () => {
      modifyCalled = true;
      return { status: 'completed' };
    };

    const plan = {
      files: [fixture.filePath],
      scope: 'function',
      description: 'test refactor',
      steps: [{ description: 'rename foo to bar' }],
      target: 'foo',
      instructions: 'rename foo to bar',
      estimatedChanges: 1
    };

    const results = await handler.executeRefactoring(plan, { backend: 'local', dryRun: false, review: true });

    expect(modifyCalled).toBe(false);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('skipped');
    expect(results[0].error).toMatch(/too large for backend context/);
  });

  it('proceeds when the file fits under the dynamic probed capacity', async () => {
    const fixture = await writeTmpFile('a'.repeat(500), 'main.js');
    tmpDir = fixture.tmpDir;

    const handler = new RefactorHandler({});
    handler.capacityFor = async () => 1000000;
    let modifyCalled = false;
    handler.modifyHandler.execute = async () => {
      modifyCalled = true;
      return { status: 'completed' };
    };

    const plan = {
      files: [fixture.filePath],
      scope: 'function',
      description: 'test refactor',
      steps: [{ description: 'rename foo to bar' }],
      target: 'foo',
      instructions: 'rename foo to bar',
      estimatedChanges: 1
    };

    const results = await handler.executeRefactoring(plan, { backend: 'local', dryRun: false, review: true });

    expect(modifyCalled).toBe(true);
    expect(results[0].status).toBe('completed');
  });
});

describe('batch_analyze singlePass: re-sizes evidence against the selected backend, then refuses if still oversized', () => {
  let tmpDir;
  afterEach(async () => {
    if (tmpDir) await fsp.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  it('refuses (naming the assembled prompt size) rather than shipping an oversized prompt, without calling the network', async () => {
    const fixtures = await Promise.all([
      writeTmpFile('a'.repeat(200000), 'a.js'),
      writeTmpFile('b'.repeat(200000), 'b.js'),
      writeTmpFile('c'.repeat(200000), 'c.js')
    ]);
    tmpDir = fixtures[0].tmpDir;

    const handler = new BatchAnalyzeHandler({});
    handler.getContextLimit = async () => ({ charLimit: 1000000, model: 'test-model' });
    // Force every backend's real capacity to a tiny figure so even the
    // resized/rebuilt prompt (scaffolding + question alone) still overflows,
    // and no roomier backend can be found either.
    handler.capacityFor = async () => 10;

    let networkCalled = false;
    handler.makeRequest = async () => {
      networkCalled = true;
      return { content: '{}', metadata: { finishReason: 'stop' } };
    };

    let capturedError = null;
    try {
      await handler.execute({
        filePatterns: fixtures.map(f => f.filePath),
        question: 'what does this do',
        options: { backend: 'nvidia_glm', parallel: false, singlePass: true }
      });
    } catch (err) {
      capturedError = err;
    }

    for (const f of fixtures) {
      await fsp.rm(f.tmpDir, { recursive: true, force: true });
    }
    tmpDir = null;

    expect(networkCalled).toBe(false);
    expect(capturedError).not.toBeNull();
    expect(capturedError.message).toMatch(/no configured backend can hold it|cannot chunk/i);
  });

  it('re-sizes evidence against a smaller selected backend and still succeeds when it fits', async () => {
    const fixtures = await Promise.all([
      writeTmpFile('a'.repeat(2000), 'a.js'),
      writeTmpFile('b'.repeat(2000), 'b.js')
    ]);
    tmpDir = fixtures[0].tmpDir;

    const handler = new BatchAnalyzeHandler({});
    // Local dynamic limit is generous, so the FIRST build assumes plenty of room.
    handler.getContextLimit = async () => ({ charLimit: 500000, model: 'test-model' });

    let capturedPromptLength = null;
    handler.makeRequest = async (prompt) => {
      capturedPromptLength = prompt.length;
      return { content: '{"summary":"ok","findings":[],"confidence":0.9,"suggestedActions":[]}', metadata: { finishReason: 'stop' } };
    };

    const result = await handler.execute({
      filePatterns: fixtures.map(f => f.filePath),
      question: 'what does this do',
      options: { backend: 'nvidia_glm', parallel: false, singlePass: true }
    });

    for (const f of fixtures) {
      await fsp.rm(f.tmpDir, { recursive: true, force: true });
    }
    tmpDir = null;

    // nvidia_glm's real capacityFor is 128000*0.9=115200 chars, well under the
    // generous local charLimit used for the first build — proves the resize
    // actually ran against the selected backend and still produced a request.
    expect(capturedPromptLength).not.toBeNull();
    expect(capturedPromptLength).toBeLessThanOrEqual(115200);
    expect(result.singlePass).toBe(true);
  });
});
