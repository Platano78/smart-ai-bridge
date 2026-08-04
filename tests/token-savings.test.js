import { describe, it, expect, afterAll } from 'vitest';
import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import { BaseHandler } from '../src/handlers/base-handler.js';
import { AnalyzeFileHandler } from '../src/handlers/analyze-file-handler.js';
import { ExploreHandler } from '../src/handlers/explore-handler.js';

class TestHandler extends BaseHandler {
  async execute() { return { success: true }; }
}

describe('BaseHandler.measureTokensSaved', () => {
  const handler = new TestHandler({ handlerName: 'Test' });

  it('reports a high percentage for a large input with a small response', () => {
    const input = 'x'.repeat(60000); // 60KB file
    const response = { summary: 'Short summary.', findings: ['one finding'] };
    const { tokensSaved, tokensSavedPercent } = handler.measureTokensSaved(input.length, response);
    expect(tokensSaved).toBeGreaterThan(0);
    expect(tokensSavedPercent).toBeGreaterThan(90);
  });

  it('reports a low percentage for a large input with a large response', () => {
    const input = 'x'.repeat(60000);
    // Response payload nearly as large as the input itself (e.g. a full diff/dump).
    const response = { dump: 'x'.repeat(58000) };
    const { tokensSavedPercent } = handler.measureTokensSaved(input.length, response);
    expect(tokensSavedPercent).toBeLessThan(15);
  });

  it('the verbatim regression: returning ~the entire file reports ~0 saved, not ~99%', () => {
    // This mirrors analyze-file-handler.js's verbatim short-circuit: it used to
    // report tokens_saved from content.length alone while actually returning
    // (most of) that same content back to the caller.
    const fileContent = 'line of code\n'.repeat(2000); // ~26KB
    const returnedVerbatim = fileContent; // caller gets (almost) the whole file back
    const { tokensSaved, tokensSavedPercent } = handler.measureTokensSaved(
      fileContent.length,
      { summary: returnedVerbatim, findings: ['Extracted lines 1-2000 (2000 lines)'] }
    );
    expect(tokensSavedPercent).toBeLessThan(5);
    expect(tokensSaved).toBeLessThan(Math.ceil(fileContent.length / 4) * 0.05);
  });

  it('batch tools scale with real file sizes: ten tiny files != ten large files', () => {
    const tinyFilesChars = 10 * 200;   // ten 200-char files
    const largeFilesChars = 10 * 20000; // ten 20KB files
    const aggregatedResponse = {
      aggregated: { summary: 'Aggregated summary of findings.', findings: ['a', 'b', 'c'] },
      perFileResults: Array.from({ length: 10 }, (_, i) => ({
        filePath: `/repo/file${i}.js`, summary: 'ok', findingCount: 1, confidence: 0.8
      }))
    };

    const tiny = handler.measureTokensSaved(tinyFilesChars, aggregatedResponse);
    const large = handler.measureTokensSaved(largeFilesChars, aggregatedResponse);

    expect(large.tokensSaved).toBeGreaterThan(tiny.tokensSaved);
    expect(large.tokensSavedPercent).toBeGreaterThan(tiny.tokensSavedPercent);
    // Ten tiny files must NOT report the same saving as ten large files.
    expect(large.tokensSaved).not.toBe(tiny.tokensSaved);
  });

  it('never returns a negative number, even when the response is larger than the input', () => {
    const { tokensSaved } = handler.measureTokensSaved(10, { huge: 'x'.repeat(10000) });
    expect(tokensSaved).toBe(0);
  });

  it('never returns a negative number for zero/negative input chars', () => {
    expect(handler.measureTokensSaved(0, { a: 1 }).tokensSaved).toBe(0);
    expect(handler.measureTokensSaved(-500, { a: 1 }).tokensSaved).toBe(0);
  });

  it('handles string response payloads directly (not double-JSON-encoded)', () => {
    const { responseTokens } = handler.measureTokensSaved(1000, 'abcd'.repeat(10)); // 40 chars
    expect(responseTokens).toBe(10);
  });
});

describe('BaseHandler.buildSuccessResponseWithSavings — measures the actual wire payload', () => {
  const handler = new TestHandler({ handlerName: 'Test' });

  // A realistic analyze_file-shaped payload, matching what handlers actually pass.
  function realisticAnalysisData(fileSize) {
    return {
      filePath: '/repo/src/auth.js',
      fileSize,
      lineCount: Math.round(fileSize / 33),
      language: 'javascript',
      analysisType: 'security',
      question: 'What are the security vulnerabilities?',
      summary: 'This module handles user auth via JWT validation and session refresh.',
      findings: [
        'Missing rate limiting on login endpoint',
        'Password reset token has no expiry check',
        'SQL query in getUserById uses string concatenation'
      ],
      confidence: 0.82,
      suggestedActions: ['Add rate limiting middleware', 'Set token expiry', 'Use parameterized queries'],
      backend_used: 'local',
      processing_time: 4200
    };
  }

  it('regression: reports a SMALLER saving than measuring the bare payload alone, for the same input', () => {
    const inputChars = 6000;
    const data = realisticAnalysisData(inputChars);

    // What the old (partial) measurement would have claimed: bare data, compact stringify.
    const bareTokensSaved = handler.measureTokensSaved(inputChars, data).tokensSaved;

    // What the new path actually returns.
    const full = handler.buildSuccessResponseWithSavings(data, inputChars);

    expect(full.tokens_saved).toBeLessThan(bareTokensSaved);
  });

  it('the envelope (success/handler/timestamp) is actually counted', () => {
    const inputChars = 6000;
    const data = realisticAnalysisData(inputChars);
    const full = handler.buildSuccessResponseWithSavings(data, inputChars);

    // Envelope fields must be present on the object actually returned...
    expect(full.success).toBe(true);
    expect(full.handler).toBe('TestHandler');
    expect(typeof full.timestamp).toBe('string');

    // ...and their characters must be reflected in the measurement: the finished
    // wire payload is strictly larger than a compact stringify of the bare data,
    // and tokens_saved is computed from that larger figure.
    const wireLen = JSON.stringify(full, null, 2).length;
    const bareLen = JSON.stringify(data).length;
    expect(wireLen).toBeGreaterThan(bareLen);
  });

  it('the pretty-print indentation (2-space, matching src/server.js) is actually counted', () => {
    const inputChars = 20000;
    const data = { summary: 'ok', findings: ['a', 'b'], confidence: 0.9, suggestedActions: [] };
    const full = handler.buildSuccessResponseWithSavings(data, inputChars);

    const prettyLen = JSON.stringify(full, null, 2).length;
    const compactLen = JSON.stringify(full).length;
    // Pretty-printing must add real characters (newlines + 2-space indents) beyond
    // just the envelope fields, and tokens_saved must reflect the pretty length.
    expect(prettyLen).toBeGreaterThan(compactLen);
    const inputTokens = Math.ceil(inputChars / 4);
    const expectedFromPretty = Math.max(0, inputTokens - Math.ceil(prettyLen / 4));
    // Allow a couple of characters of drift from the placeholder-width
    // substitution used to resolve the tokens_saved circularity (documented in
    // buildSuccessResponseWithSavings — a fixed-point loop is not used).
    expect(Math.abs(full.tokens_saved - expectedFromPretty)).toBeLessThanOrEqual(1);
  });

  it('the small-input case: an ~800-char input with a realistic response reports a MODEST saving, not 80%+', () => {
    const inputChars = 800;
    const data = realisticAnalysisData(inputChars);
    const full = handler.buildSuccessResponseWithSavings(data, inputChars);

    const inputTokens = Math.ceil(inputChars / 4);
    const percent = inputTokens > 0 ? (full.tokens_saved / inputTokens) * 100 : 0;

    // This is the case the old (bare-payload) measurement got most wrong: it
    // claimed ~83% saved here. The finished response (envelope + indentation)
    // is comparable in size to an 800-char input, so the honest figure is small.
    expect(percent).toBeLessThan(80);
  });

  it('the medium/large-input cases still show a strong, honest saving', () => {
    for (const inputChars of [6000, 20000]) {
      const data = realisticAnalysisData(inputChars);
      const full = handler.buildSuccessResponseWithSavings(data, inputChars);
      const inputTokens = Math.ceil(inputChars / 4);
      const percent = (full.tokens_saved / inputTokens) * 100;
      expect(percent).toBeGreaterThan(50);
    }
  });

  it('never returns a negative tokens_saved, even for a tiny input with a large response', () => {
    const full = handler.buildSuccessResponseWithSavings({ dump: 'x'.repeat(5000) }, 10);
    expect(full.tokens_saved).toBe(0);
  });

  it('does not mutate or lose fields from the original data object', () => {
    const data = { filePath: '/x.js', status: 'written', nested: { a: 1 } };
    const full = handler.buildSuccessResponseWithSavings(data, 1000);
    expect(full.filePath).toBe('/x.js');
    expect(full.status).toBe('written');
    expect(full.nested).toEqual({ a: 1 });
    expect(typeof full.tokens_saved).toBe('number');
  });
});

describe('AnalyzeFileHandler.tryVerbatimExtraction — verbatim regression (end-to-end)', () => {
  const handler = new AnalyzeFileHandler({ handlerName: 'AnalyzeFile' });

  it('a "lines 1-N covering the whole file" request reports ~0 tokens_saved', () => {
    const lines = Array.from({ length: 500 }, (_, i) => `const x${i} = ${i};`);
    const content = lines.join('\n');
    const question = 'show me lines 1-500';
    const fileStats = { size: content.length };

    const result = handler.tryVerbatimExtraction(question, content, '/repo/big-file.js', fileStats, Date.now());

    expect(result).toBeTruthy();
    expect(result.summary).toBe(content.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n'));
    // The whole file came back verbatim, so almost nothing was actually saved.
    const fileTokens = Math.ceil(content.length / 4);
    expect(result.tokens_saved).toBeLessThan(fileTokens * 0.05);
  });

  it('a small line-range request out of a large file reports a real, non-trivial saving', () => {
    const lines = Array.from({ length: 5000 }, (_, i) => `const x${i} = ${i};`);
    const content = lines.join('\n');
    const question = 'show me lines 1-10';
    const fileStats = { size: content.length };

    const result = handler.tryVerbatimExtraction(question, content, '/repo/big-file.js', fileStats, Date.now());

    expect(result).toBeTruthy();
    const fileTokens = Math.ceil(content.length / 4);
    expect(result.tokens_saved).toBeGreaterThan(fileTokens * 0.9);
  });
});

describe('ExploreHandler.performShallowSearch / performDeepSearch — tokens_saved regression (end-to-end)', () => {
  // Exercises the real handler methods (they only do fs.readFile + regex matching,
  // no network/backend call) against real temp files on disk, rather than restating
  // measureTokensSaved with explore-shaped fixtures. This is the actual code path
  // that had the bug: `tokensSaved: Math.floor(totalChars / 4)` counted the ENTIRE
  // input as saved and subtracted nothing for the evidence/filesFound it returns.
  const handler = new ExploreHandler({ handlerName: 'Explore' });
  const tempDirs = [];

  afterAll(async () => {
    await Promise.all(tempDirs.map(dir => fsp.rm(dir, { recursive: true, force: true })));
  });

  /**
   * Writes `n` deterministic files of `linesPerFile` lines (each padded to
   * `lineLen` chars) into a fresh temp dir. Every `matchEvery`-th line contains
   * the literal string "findme" so match frequency (and therefore evidence
   * size) is controlled precisely.
   */
  async function makeFiles(n, linesPerFile, matchEvery, lineLen = 40) {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-explore-test-'));
    tempDirs.push(dir);
    const files = [];
    for (let i = 0; i < n; i++) {
      const lines = [];
      for (let j = 0; j < linesPerFile; j++) {
        lines.push(j % matchEvery === 0
          ? `findme_widget_${j}`.padEnd(lineLen, 'x')
          : `filler_${j}`.padEnd(lineLen, 'y'));
      }
      const file = path.join(dir, `f${i}.js`);
      await fsp.writeFile(file, lines.join('\n'), 'utf8');
      files.push(file);
    }
    return files;
  }

  async function realTotalChars(files) {
    let total = 0;
    for (const f of files) total += (await fsp.stat(f)).size;
    return total;
  }

  it('regression: a large read with a large evidence list reports substantially less than totalChars/4', async () => {
    // Frequent matches (every 5th line) -> a large evidence/context payload.
    const files = await makeFiles(8, 60, 5);
    const totalChars = await realTotalChars(files);
    const oldFormulaClaim = Math.floor(totalChars / 4); // the exact old, reverted formula

    const deep = await handler.performDeepSearch(files, ['findme'], 8);

    expect(deep.evidence.length).toBeGreaterThan(0);
    // This is the assertion that fails if anyone reverts to the old formula:
    // the old formula and the new measurement would be identical.
    expect(deep.tokensSaved).toBeLessThan(oldFormulaClaim * 0.9);
  });

  it('the response genuinely affects the number: same totalChars, different evidence size -> different tokensSaved', async () => {
    // Same file count/size/line length in both cases (so totalChars matches),
    // only match frequency (and thus evidence payload size) differs.
    const frequentFiles = await makeFiles(8, 60, 5);   // large evidence payload
    const rareFiles = await makeFiles(8, 60, 60);      // ~one match per file: small evidence payload

    const totalCharsFrequent = await realTotalChars(frequentFiles);
    const totalCharsRare = await realTotalChars(rareFiles);
    expect(totalCharsFrequent).toBe(totalCharsRare); // sanity: identical input size

    const largeEvidence = await handler.performDeepSearch(frequentFiles, ['findme'], 8);
    const smallEvidence = await handler.performDeepSearch(rareFiles, ['findme'], 8);

    // Both touch all 8 files, but frequent matches pack far more match/context
    // objects per file (performDeepSearch caps at 5 matches/file) -> a larger
    // serialized response, independent of the (identical) input size.
    const totalMatches = (findings) => findings.evidence.reduce((sum, e) => sum + e.matches.length, 0);
    expect(totalMatches(smallEvidence)).toBeLessThan(totalMatches(largeEvidence));
    expect(JSON.stringify(smallEvidence).length).toBeLessThan(JSON.stringify(largeEvidence).length);
    // The old formula could not express this at all (same totalChars -> same
    // claimed saving no matter what came back). The new measurement must.
    expect(smallEvidence.tokensSaved).not.toBe(largeEvidence.tokensSaved);
    expect(smallEvidence.tokensSaved).toBeGreaterThan(largeEvidence.tokensSaved);
  });

  it('a legitimate high-saving case still reports high: large read, small evidence list', async () => {
    // Rare matches (one per file) out of a moderately large read -> the
    // response is tiny relative to the input, so the saving should still be strong.
    const files = await makeFiles(8, 60, 60);
    const totalChars = await realTotalChars(files);
    const oldFormulaClaim = Math.floor(totalChars / 4);

    const deep = await handler.performDeepSearch(files, ['findme'], 8);

    expect(deep.tokensSaved).toBeGreaterThan(oldFormulaClaim * 0.8);
    expect(deep.tokensSaved).toBeGreaterThan(0);
  });
});
