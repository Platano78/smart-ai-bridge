import { describe, it, expect } from 'vitest';
import { BaseHandler } from '../src/handlers/base-handler.js';
import { AnalyzeFileHandler } from '../src/handlers/analyze-file-handler.js';

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
