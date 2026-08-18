/**
 * @fileoverview Coverage for batch_analyze's grepFilter and singlePass options.
 * Stubs the network layer (analyzeHandler.execute for the default fan-out,
 * handler.makeRequest for singlePass's one aggregated call) rather than the
 * units under test, matching the house style in handler-truncation-reporting.test.js.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import { BatchAnalyzeHandler } from '../src/handlers/batch-analyze-handler.js';

async function makeFixtures(files) {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-batch-grep-'));
  const paths = {};
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(tmpDir, name);
    await fsp.writeFile(filePath, content, 'utf8');
    paths[name] = filePath;
  }
  return { tmpDir, paths };
}

const ANALYSIS_JSON = '{"summary":"ok","findings":["f1"],"confidence":0.8,"suggestedActions":[]}';
const SINGLE_PASS_JSON = '{"summary":"aggregated ok","findings":["f1","f2"],"confidence":0.9,"suggestedActions":["a1"]}';

function stubbedHandler() {
  const handler = new BatchAnalyzeHandler({ handlerName: 'BatchAnalyze' });
  handler.getContextLimit = async () => ({ charLimit: 128000, model: 'test-model' });
  return handler;
}

describe('batch_analyze grepFilter', () => {
  let tmpDir;

  afterEach(async () => {
    if (tmpDir) {
      await fsp.rm(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it('narrows the file set to files containing the term', async () => {
    const fixtures = await makeFixtures({
      'a.js': 'const mutex = require("mutex");\n',
      'b.js': 'const other = 1;\n'
    });
    tmpDir = fixtures.tmpDir;

    const handler = stubbedHandler();
    let callCount = 0;
    handler.analyzeHandler.execute = async ({ filePath }) => {
      callCount++;
      return { filePath, summary: 'ok', findings: [], confidence: 0.8, suggestedActions: [], was_truncated: false };
    };

    const result = await handler.execute({
      filePatterns: [fixtures.paths['a.js'], fixtures.paths['b.js']],
      question: 'q',
      options: { backend: 'nvidia_glm', parallel: false, grepFilter: 'mutex' }
    });

    expect(result.filesAnalyzed).toBe(1);
    expect(callCount).toBe(1);
    expect(result.grepFilter.terms).toEqual(['mutex']);
    expect(result.grepFilter.filesScanned).toBe(2);
    expect(result.grepFilter.filesMatched).toBe(1);
  });

  it('treats regex metacharacters as literal substrings without throwing or over-matching', async () => {
    const fixtures = await makeFixtures({
      'a.js': 'const x = a.b;\n',
      'b.js': 'const y = x(y);\n',
      'c.js': 'const z = c++;\n',
      'd.js': 'nothing relevant here\n'
    });
    tmpDir = fixtures.tmpDir;

    const handler = stubbedHandler();
    handler.analyzeHandler.execute = async ({ filePath }) => ({
      filePath, summary: 'ok', findings: [], confidence: 0.8, suggestedActions: [], was_truncated: false
    });

    const result = await handler.execute({
      filePatterns: Object.values(fixtures.paths),
      question: 'q',
      options: { backend: 'nvidia_glm', parallel: false, grepFilter: ['a.b', 'x(y', 'c++'] }
    });

    expect(result.filesAnalyzed).toBe(3);
    expect(result.grepFilter.filesMatched).toBe(3);
  });

  it('accepts grepFilter as a bare string', async () => {
    const fixtures = await makeFixtures({ 'a.js': 'hello world\n' });
    tmpDir = fixtures.tmpDir;

    const handler = stubbedHandler();
    handler.analyzeHandler.execute = async ({ filePath }) => ({
      filePath, summary: 'ok', findings: [], confidence: 0.8, suggestedActions: [], was_truncated: false
    });

    const result = await handler.execute({
      filePatterns: [fixtures.paths['a.js']],
      question: 'q',
      options: { backend: 'nvidia_glm', parallel: false, grepFilter: 'hello' }
    });

    expect(result.filesAnalyzed).toBe(1);
  });

  it('accepts grepFilter as an array', async () => {
    const fixtures = await makeFixtures({
      'a.js': 'foo\n',
      'b.js': 'bar\n'
    });
    tmpDir = fixtures.tmpDir;

    const handler = stubbedHandler();
    handler.analyzeHandler.execute = async ({ filePath }) => ({
      filePath, summary: 'ok', findings: [], confidence: 0.8, suggestedActions: [], was_truncated: false
    });

    const result = await handler.execute({
      filePatterns: [fixtures.paths['a.js'], fixtures.paths['b.js']],
      question: 'q',
      options: { backend: 'nvidia_glm', parallel: false, grepFilter: ['foo', 'bar'] }
    });

    expect(result.filesAnalyzed).toBe(2);
  });
});

describe('batch_analyze singlePass', () => {
  let tmpDir;

  afterEach(async () => {
    if (tmpDir) {
      await fsp.rm(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it('makes exactly ONE backend call for N files', async () => {
    const fixtures = await makeFixtures({
      'a.js': 'const a = 1;\n',
      'b.js': 'const b = 2;\n',
      'c.js': 'const c = 3;\n'
    });
    tmpDir = fixtures.tmpDir;

    const handler = stubbedHandler();
    let callCount = 0;
    handler.makeRequest = async () => {
      callCount++;
      return { content: SINGLE_PASS_JSON, metadata: { finishReason: 'stop' } };
    };

    const result = await handler.execute({
      filePatterns: Object.values(fixtures.paths),
      question: 'what does this do',
      options: { backend: 'nvidia_glm', parallel: false, singlePass: true }
    });

    expect(callCount).toBe(1);
    expect(result.singlePass).toBe(true);
    expect(result.filesAnalyzed).toBe(3);
    expect(result.aggregatedSummary).toBe('aggregated ok');
    expect(result.perFileResults).toHaveLength(3);
    expect(result.perFileResults[0]).toHaveProperty('filePath');
    expect(result.perFileResults[0]).toHaveProperty('contributedEvidence');
    expect(result.perFileResults[0]).not.toHaveProperty('confidence');
  });

  it('reports evidence truncation when the budget is exceeded', async () => {
    const fixtures = await makeFixtures({
      'a.js': 'x'.repeat(500),
      'b.js': 'y'.repeat(500)
    });
    tmpDir = fixtures.tmpDir;

    const handler = stubbedHandler();
    // A tiny char limit forces the per-file evidence budget below MIN_USEFUL_CHARS.
    handler.getContextLimit = async () => ({ charLimit: 150, model: 'test-model' });
    handler.makeRequest = async () => ({ content: SINGLE_PASS_JSON, metadata: { finishReason: 'stop' } });

    const result = await handler.execute({
      filePatterns: Object.values(fixtures.paths),
      question: 'what does this do',
      options: { backend: 'nvidia_glm', parallel: false, singlePass: true }
    });

    expect(result.evidence_truncated).toBe(true);
    expect(Array.isArray(result.evidence_dropped_files)).toBe(true);
    expect(result.evidence_dropped_files.length).toBeGreaterThan(0);
    expect(typeof result.evidence_truncation_hint).toBe('string');
  });

  it('combines singlePass with grepFilter, using matched lines as evidence', async () => {
    const fixtures = await makeFixtures({
      'a.js': 'line one\nconst needle = 1;\nline three\n',
      'b.js': 'no match here\n'
    });
    tmpDir = fixtures.tmpDir;

    const handler = stubbedHandler();
    let capturedPrompt = null;
    handler.makeRequest = async (prompt) => {
      capturedPrompt = prompt;
      return { content: SINGLE_PASS_JSON, metadata: { finishReason: 'stop' } };
    };

    const result = await handler.execute({
      filePatterns: Object.values(fixtures.paths),
      question: 'q',
      options: { backend: 'nvidia_glm', parallel: false, singlePass: true, grepFilter: 'needle' }
    });

    expect(result.filesAnalyzed).toBe(1);
    expect(result.grepFilter.filesMatched).toBe(1);
    expect(capturedPrompt).toContain('needle');
  });

  it('reports was_truncated true with a hint when the aggregated call itself hits the token limit', async () => {
    const fixtures = await makeFixtures({ 'a.js': 'const a = 1;\n' });
    tmpDir = fixtures.tmpDir;

    const handler = stubbedHandler();
    handler.makeRequest = async () => ({
      content: SINGLE_PASS_JSON,
      metadata: { finishReason: 'length' }
    });

    const result = await handler.execute({
      filePatterns: [fixtures.paths['a.js']],
      question: 'q',
      options: { backend: 'nvidia_glm', parallel: false, singlePass: true }
    });

    expect(result.was_truncated).toBe(true);
    expect(typeof result.truncation_hint).toBe('string');
    expect(result.truncation_hint.length).toBeGreaterThan(0);
  });

  it('reports was_truncated false with no hint when the aggregated call finishes cleanly', async () => {
    const fixtures = await makeFixtures({ 'a.js': 'const a = 1;\n' });
    tmpDir = fixtures.tmpDir;

    const handler = stubbedHandler();
    handler.makeRequest = async () => ({
      content: SINGLE_PASS_JSON,
      metadata: { finishReason: 'stop' }
    });

    const result = await handler.execute({
      filePatterns: [fixtures.paths['a.js']],
      question: 'q',
      options: { backend: 'nvidia_glm', parallel: false, singlePass: true }
    });

    expect(result.was_truncated).toBe(false);
    expect(result).not.toHaveProperty('truncation_hint');
  });
});

describe('batch_analyze default behavior unchanged', () => {
  let tmpDir;

  afterEach(async () => {
    if (tmpDir) {
      await fsp.rm(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it('with neither grepFilter nor singlePass set, still fans out N calls for N files with the same response keys', async () => {
    const fixtures = await makeFixtures({
      'a.js': 'const a = 1;\n',
      'b.js': 'const b = 2;\n'
    });
    tmpDir = fixtures.tmpDir;

    const handler = stubbedHandler();
    let callCount = 0;
    handler.analyzeHandler.execute = async ({ filePath }) => {
      callCount++;
      return { filePath, summary: 'ok', findings: ['f1'], confidence: 0.8, suggestedActions: [], was_truncated: false };
    };

    const result = await handler.execute({
      filePatterns: Object.values(fixtures.paths),
      question: 'what does this do',
      options: { backend: 'nvidia_glm', parallel: false }
    });

    expect(callCount).toBe(2);
    expect(result).not.toHaveProperty('singlePass');
    expect(result).not.toHaveProperty('grepFilter');
    expect(Object.keys(result).sort()).toEqual([
      'aggregatedActions',
      'aggregatedFindings',
      'aggregatedSummary',
      'filesAnalyzed',
      'handler',
      'overallConfidence',
      'patterns',
      'perFileResults',
      'processing_time',
      'question',
      'status',
      'success',
      'timestamp',
      'tokens_saved',
      'was_truncated'
    ]);
  });

  it('propagates grepFilter through the real network-layer seam (makeRequest stubbed, not execute)', async () => {
    const fixtures = await makeFixtures({
      'a.js': 'const needle = 1;\n',
      'b.js': 'const other = 2;\n'
    });
    tmpDir = fixtures.tmpDir;

    const handler = stubbedHandler();
    handler.analyzeHandler.makeRequest = async () => ({
      content: ANALYSIS_JSON,
      metadata: { finishReason: 'stop' }
    });

    const result = await handler.execute({
      filePatterns: Object.values(fixtures.paths),
      question: 'q',
      options: { backend: 'nvidia_glm', parallel: false, grepFilter: 'needle' }
    });

    expect(result.filesAnalyzed).toBe(1);
    expect(result.grepFilter.filesMatched).toBe(1);
  });
});
