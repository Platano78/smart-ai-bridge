/**
 * @fileoverview Regression coverage for authoritative truncation reporting added
 * to analyze_file and propagated through batch_analyze's aggregation rollup.
 * Stubs the backend response (metadata.finishReason) and the handlers' own
 * network-touching helpers, matching the mocking style in modify-handler.test.js
 * / base-handler.test.js (real temp fixtures, monkey-patched instance methods).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import { AnalyzeFileHandler } from '../src/handlers/analyze-file-handler.js';
import { BatchAnalyzeHandler } from '../src/handlers/batch-analyze-handler.js';
import { AskHandler } from '../src/handlers/ask-handler.js';

async function makeFixture(content = 'function foo() { return 1; }\n') {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-truncation-'));
  const filePath = path.join(tmpDir, 'fixture.js');
  await fsp.writeFile(filePath, content, 'utf8');
  return { tmpDir, filePath };
}

const ANALYSIS_JSON = '{"summary":"ok","findings":["f1"],"confidence":0.8,"suggestedActions":[]}';

describe('AnalyzeFileHandler truncation reporting', () => {
  let tmpDir;

  afterEach(async () => {
    if (tmpDir) {
      await fsp.rm(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it('sets was_truncated true and a non-empty truncation_hint on finish_reason: length', async () => {
    const fixture = await makeFixture();
    tmpDir = fixture.tmpDir;

    const handler = new AnalyzeFileHandler({ handlerName: 'AnalyzeFile' });
    handler.makeRequest = async () => ({
      content: ANALYSIS_JSON,
      metadata: { finishReason: 'length' }
    });

    const result = await handler.execute({
      filePath: fixture.filePath,
      question: 'what does this do',
      options: { backend: 'nvidia_glm' }
    });

    expect(result.was_truncated).toBe(true);
    expect(typeof result.truncation_hint).toBe('string');
    expect(result.truncation_hint.length).toBeGreaterThan(0);
  });

  it('sets was_truncated false and omits truncation_hint on finish_reason: stop', async () => {
    const fixture = await makeFixture();
    tmpDir = fixture.tmpDir;

    const handler = new AnalyzeFileHandler({ handlerName: 'AnalyzeFile' });
    handler.makeRequest = async () => ({
      content: ANALYSIS_JSON,
      metadata: { finishReason: 'stop' }
    });

    const result = await handler.execute({
      filePath: fixture.filePath,
      question: 'what does this do',
      options: { backend: 'nvidia_glm' }
    });

    expect(result.was_truncated).toBe(false);
    expect(result).not.toHaveProperty('truncation_hint');
  });

  it('reports was_truncated false with no truncation_hint on the verbatim short-circuit (no LLM call)', async () => {
    const fixture = await makeFixture('line one\nline two\nline three\nline four\nline five\n');
    tmpDir = fixture.tmpDir;

    const handler = new AnalyzeFileHandler({ handlerName: 'AnalyzeFile' });
    // Throwing proves the short-circuit really bypassed the backend — if the
    // LLM path were ever taken instead, this test would fail loudly.
    handler.makeRequest = async () => { throw new Error('makeRequest should not be called for a verbatim extraction'); };

    const result = await handler.execute({
      filePath: fixture.filePath,
      question: 'show me lines 2-4',
      options: { backend: 'nvidia_glm' }
    });

    expect(result.backend_used).toBe('direct_extraction');
    expect(result.analysisType).toBe('verbatim');
    expect(result.was_truncated).toBe(false);
    expect(result).not.toHaveProperty('truncation_hint');
  });
});

describe('BatchAnalyzeHandler truncation aggregation', () => {
  let tmpDir;

  afterEach(async () => {
    if (tmpDir) {
      await fsp.rm(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it('rolls up was_truncated=true and truncated_files when any per-file result is truncated', async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-batch-truncation-'));
    const fileA = path.join(tmpDir, 'a.js');
    const fileB = path.join(tmpDir, 'b.js');
    await fsp.writeFile(fileA, 'const a = 1;\n', 'utf8');
    await fsp.writeFile(fileB, 'const b = 2;\n', 'utf8');

    const handler = new BatchAnalyzeHandler({ handlerName: 'BatchAnalyze' });
    handler.getContextLimit = async () => ({ charLimit: 128000, model: 'test-model' });
    handler.analyzeHandler.execute = async ({ filePath }) => ({
      filePath,
      summary: 'ok',
      findings: ['f1'],
      confidence: 0.8,
      suggestedActions: [],
      was_truncated: filePath === fileA,
      ...(filePath === fileA ? { truncation_hint: 'hit the limit' } : {})
    });

    const result = await handler.execute({
      filePatterns: [fileA, fileB],
      question: 'what does this do',
      options: { backend: 'nvidia_glm', parallel: false, aggregateResults: true }
    });

    expect(result.was_truncated).toBe(true);
    expect(result.truncated_files).toEqual([fileA]);
    expect(typeof result.truncation_hint).toBe('string');
    expect(result.truncation_hint.length).toBeGreaterThan(0);
  });

  it('omits truncated_files/truncation_hint and reports was_truncated=false when nothing was truncated', async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-batch-truncation-clean-'));
    const fileA = path.join(tmpDir, 'a.js');
    await fsp.writeFile(fileA, 'const a = 1;\n', 'utf8');

    const handler = new BatchAnalyzeHandler({ handlerName: 'BatchAnalyze' });
    handler.getContextLimit = async () => ({ charLimit: 128000, model: 'test-model' });
    handler.analyzeHandler.execute = async ({ filePath }) => ({
      filePath,
      summary: 'ok',
      findings: ['f1'],
      confidence: 0.8,
      suggestedActions: [],
      was_truncated: false
    });

    const result = await handler.execute({
      filePatterns: [fileA],
      question: 'what does this do',
      options: { backend: 'nvidia_glm', parallel: false, aggregateResults: true }
    });

    expect(result.was_truncated).toBe(false);
    expect(result).not.toHaveProperty('truncated_files');
    expect(result).not.toHaveProperty('truncation_hint');
  });

  it('propagates truncation through the real AnalyzeFileHandler, not a stubbed one', async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-batch-truncation-seam-'));
    const fileA = path.join(tmpDir, 'a.js');
    const fileB = path.join(tmpDir, 'b.js');
    await fsp.writeFile(fileA, 'const a = 1;\n', 'utf8');
    await fsp.writeFile(fileB, 'const b = 2;\n', 'utf8');

    const handler = new BatchAnalyzeHandler({ handlerName: 'BatchAnalyze' });
    handler.getContextLimit = async () => ({ charLimit: 128000, model: 'test-model' });
    // Stub ONLY the network layer on the real child handler — the seam between
    // AnalyzeFileHandler's emitted was_truncated and batch_analyze's rollup
    // stays live, unlike the two tests above which stub execute() wholesale.
    handler.analyzeHandler.makeRequest = async (prompt) => ({
      content: ANALYSIS_JSON,
      metadata: { finishReason: prompt.includes('a.js') ? 'length' : 'stop' }
    });

    const result = await handler.execute({
      filePatterns: [fileA, fileB],
      question: 'what does this do',
      options: { backend: 'nvidia_glm', parallel: false, aggregateResults: true }
    });

    expect(result.was_truncated).toBe(true);
    expect(result.truncated_files).toEqual([fileA]);
  });
});

describe('AskHandler chunked recovery reporting', () => {
  it('reports chunked=true and was_truncated=false once chunking has recovered the full response', async () => {
    const handler = new AskHandler({ router: { routeRequest: async () => 'nvidia_glm' } });
    // Every call (the initial request and each chunk request inside
    // performChunkedGeneration) reports finish_reason: length, but returns
    // content with no textual truncation indicators — so detectTruncation's
    // heuristic exit check inside the chunk loop is satisfied after one
    // chunk and the loop stops there.
    handler.makeRequest = async () => ({
      content: 'This is a complete final answer.',
      metadata: { finishReason: 'length' }
    });

    const result = await handler.execute({
      model: 'auto',
      prompt: 'a short prompt',
      enable_chunking: true
    });

    expect(result.chunked).toBe(true);
    expect(result.was_truncated).toBe(false);
  });
});
