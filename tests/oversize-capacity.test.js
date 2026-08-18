/**
 * @fileoverview Every handler that finds a payload too big for `local` used to
 * escalate straight to nvidia_glm without checking whether it fits there
 * either — a 636K-char file would still get sent to a 128K-char backend.
 * findBackendWithCapacity() picks a backend that actually fits (or throws a
 * clear, actionable error when nothing does), replacing "attempt anyway".
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { AnalyzeFileHandler } from '../src/handlers/analyze-file-handler.js';
import { GenerateFileHandler } from '../src/handlers/generate-file-handler.js';
import { countTokens } from '../src/utils/token-count.js';
import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';

afterEach(() => vi.restoreAllMocks());

// A single repeated character compresses under real BPE tokenization far
// more than normal text — cl100k_base counts roughly 1 token per 8 chars of
// a uniform repeated character, not the ~4 chars/token this repo assumes
// for real text. Fixtures sized against a token budget need a realistic
// chars/token ratio, so use varied code-like text (measured ~4.05
// chars/token) instead of e.g. 'x'.repeat(N).
const REALISTIC_PHRASE = 'function processData(item, index) { return item.value * index + 1; } ';
function realisticText(chars) {
  return REALISTIC_PHRASE.repeat(Math.ceil(chars / REALISTIC_PHRASE.length)).slice(0, chars);
}

function stubbedAnalyzeHandler() {
  const handler = new AnalyzeFileHandler({});
  handler.getContextLimit = async () => ({ charLimit: 85196, model: 'test-model' });
  return handler;
}

describe('findBackendWithCapacity', () => {
  it('picks local when the dynamic local limit fits', async () => {
    const handler = stubbedAnalyzeHandler();
    const result = await handler.findBackendWithCapacity(50000);
    expect(result).toEqual({ name: 'local', cap: 85196 });
  });

  it('picks a cloud backend when local is too small but a cloud one fits', async () => {
    const handler = stubbedAnalyzeHandler();
    const result = await handler.findBackendWithCapacity(100000, ['local']);
    expect(result).not.toBeNull();
    expect(result.cap).toBeGreaterThanOrEqual(100000);
    expect(result.name).not.toBe('local');
  });

  it('returns null when the payload exceeds every cap', async () => {
    const handler = stubbedAnalyzeHandler();
    const result = await handler.findBackendWithCapacity(999999999);
    expect(result).toBeNull();
  });

  it('works with no registry (fallback list path)', async () => {
    const handler = stubbedAnalyzeHandler();
    expect(handler.backendRegistry).toBeUndefined();
    const result = await handler.findBackendWithCapacity(50000);
    expect(result).toEqual({ name: 'local', cap: 85196 });
  });
});

describe('getBackendContextLimit', () => {
  it('resolves openai_chatgpt to 512000, and the dead "chatgpt" alias to the 128000 default', () => {
    const handler = stubbedAnalyzeHandler();
    expect(handler.getBackendContextLimit('openai_chatgpt')).toBe(512000);
    expect(handler.getBackendContextLimit('chatgpt')).toBe(128000);
  });
});

describe('capacityFor', () => {
  it('resolves local and the unresolved auto token to the same dynamic limit', async () => {
    const handler = stubbedAnalyzeHandler();
    expect(await handler.capacityFor('local')).toBe(85196);
    expect(await handler.capacityFor('auto')).toBe(85196);
  });

  it('resolves cloud backends to 90% of their static caps, reserving response headroom', async () => {
    const handler = stubbedAnalyzeHandler();
    expect(await handler.capacityFor('nvidia_glm')).toBe(115200); // 128000 * 0.9
    expect(await handler.capacityFor('openai_chatgpt')).toBe(460800); // 512000 * 0.9
  });
});

describe('capacityTokensFor: shares the same resolution chain as capacityFor', () => {
  it('agrees with capacityFor on the underlying resolution for local/auto (chars / 4)', async () => {
    const handler = stubbedAnalyzeHandler();
    const chars = await handler.capacityFor('local');
    const tokens = await handler.capacityTokensFor('local');
    expect(chars).toBe(85196);
    expect(tokens).toBe(Math.floor(85196 / 4));
    expect(await handler.capacityTokensFor('auto')).toBe(tokens);
  });

  it('agrees with capacityFor on the underlying resolution for the default chain (chars / 4)', async () => {
    const handler = stubbedAnalyzeHandler();
    const chars = await handler.capacityFor('nvidia_glm');
    const tokens = await handler.capacityTokensFor('nvidia_glm');
    expect(chars).toBe(115200); // 128000 * 0.9
    expect(tokens).toBe(115200 / 4); // 28800 — the real token reserve, not a re-derived chars estimate
  });
});

describe('BUG PROOF: a CJK payload that fit under the old char math is correctly refused under the real token gate', () => {
  let tmpDir;

  afterEach(async () => {
    if (tmpDir) {
      await fsp.rm(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it('refuses a CJK payload the OLD 4-chars-per-token gate would have accepted', async () => {
    const cjkPhrase = '这是一段用于测试的中文文本内容重复段落用来验证真实分词器的行为表现';
    const cjkContent = cjkPhrase.repeat(Math.ceil(110000 / cjkPhrase.length)).slice(0, 110000);

    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-cjk-oversize-'));
    const filePath = path.join(tmpDir, 'chinese.txt');
    await fsp.writeFile(filePath, cjkContent, 'utf8');

    // No registry -> nvidia_glm resolves via the default chain:
    // capacityFor (chars)       = 128000 * 0.9 = 115200
    // capacityTokensFor (tokens) = 115200 / 4  =  28800 (the real limit this backend
    //                                                     was actually configured for)
    const handler = new AnalyzeFileHandler({});
    const capChars = await handler.capacityFor('nvidia_glm');
    const capTokens = await handler.capacityTokensFor('nvidia_glm');
    expect(capChars).toBe(115200);
    expect(capTokens).toBe(28800);

    // Prove the OLD bug's premise: the raw payload is under the char limit,
    // so the old `prompt.length > contextLimit` gate would have shipped it.
    expect(cjkContent.length).toBeLessThan(capChars);

    // Prove the payload is nowhere near that cheap under a real tokenizer —
    // CJK runs close to 1 token/char, not the assumed ~4 chars/token.
    const realTokens = countTokens(cjkContent);
    expect(realTokens).toBeGreaterThan(capTokens);
    console.log(`[proof] chars=${cjkContent.length} tokens=${realTokens} tokenLimit=${capTokens} (old char limit would have been ${capChars})`);

    // No roomier backend either — the real-world result (every candidate
    // backend, under the default fallback table, caps out around the same
    // token figure) collapses to a deterministic refusal.
    handler.findBackendWithCapacityTokens = async () => null;
    handler.largestBackendCapacityTokens = async () => capTokens;

    let capturedError = null;
    try {
      await handler.execute({
        filePath,
        question: 'what does this say',
        options: { backend: 'nvidia_glm' }
      });
    } catch (err) {
      capturedError = err;
    }

    expect(capturedError).not.toBeNull();
    expect(capturedError.message).toMatch(/no configured backend can hold it/);
    const citedTokens = Number(capturedError.message.match(/is (\d+) tokens/)[1]);
    expect(Number.isFinite(citedTokens)).toBe(true);
    expect(citedTokens).toBeGreaterThan(capTokens);
  });

  it('regression: an ASCII payload that fit under the old gate still fits under the new one', async () => {
    // Same shape as the CJK case above, but real code-like ASCII text at the
    // repo's assumed ~4 chars/token, sized well under capacityTokensFor —
    // must still succeed, proving the fix does not introduce new false
    // refusals for the text the old math was actually calibrated for.
    const phrase = 'function processData(item, index) { return item.value * index + 1; } ';
    const asciiContent = phrase.repeat(Math.ceil(20000 / phrase.length)).slice(0, 20000);

    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-ascii-fits-'));
    const filePath = path.join(tmpDir, 'code.js');
    await fsp.writeFile(filePath, asciiContent, 'utf8');

    const handler = new AnalyzeFileHandler({});
    handler.makeRequest = async () => ({
      content: '{"summary":"ok","findings":[],"confidence":0.9,"suggestedActions":[]}',
      metadata: { finishReason: 'stop' }
    });

    const result = await handler.execute({
      filePath,
      question: 'what does this do',
      options: { backend: 'nvidia_glm' }
    });

    expect(result.isError).not.toBe(true);
    expect(result.summary).toBe('ok');
  });
});

describe('analyze_file oversize handling', () => {
  let tmpDir;

  afterEach(async () => {
    if (tmpDir) {
      await fsp.rm(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it('throws with the payload size and largest capacity when nothing fits', async () => {
    const content = 'x'.repeat(700000); // exceeds every backend cap
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-oversize-'));
    const filePath = path.join(tmpDir, 'huge.js');
    await fsp.writeFile(filePath, content, 'utf8');

    const handler = stubbedAnalyzeHandler();

    await expect(handler.execute({
      filePath,
      question: 'what does this do',
      options: { backend: 'local' }
    })).rejects.toThrow(/700\d+ chars.*no configured backend can hold it/s);
  });

  it('succeeds on the escalated backend when the payload fits after escalation', async () => {
    const content = realisticText(100000); // ~24677 tokens: exceeds local (~21299) but fits nvidia_glm/others
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-escalate-'));
    const filePath = path.join(tmpDir, 'big.js');
    await fsp.writeFile(filePath, content, 'utf8');

    const handler = stubbedAnalyzeHandler();
    let usedBackend = null;
    handler.router = {
      makeRequest: async (prompt, backend) => {
        usedBackend = backend;
        return { content: '{"summary":"ok","findings":[],"confidence":0.8,"suggestedActions":[]}' };
      }
    };

    const result = await handler.execute({
      filePath,
      question: 'what does this do',
      options: { backend: 'local' }
    });

    expect(result.isError).not.toBe(true);
    expect(usedBackend).not.toBe('local');
    expect(usedBackend).not.toBeNull();
  });
});

describe('generate_file forced-cloud oversize handling', () => {
  let tmpDir;

  afterEach(async () => {
    if (tmpDir) {
      await fsp.rm(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it('throws when a caller explicitly forces a small cloud backend that cannot hold the payload', async () => {
    // The old gate only fired for selectedBackend === 'local' — an explicitly
    // forced cloud backend (nvidia_deepseek, 128000 cap) with an oversized
    // payload sailed straight through to the provider. Here nothing fits
    // (spec exceeds even openai_chatgpt's 512000), so this must now throw.
    const handler = new GenerateFileHandler({});
    handler.getContextLimit = async () => ({ charLimit: 50000, model: 'test-model' });

    const spec = 'x'.repeat(700000);
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-generate-forced-cloud-'));
    const outputPath = path.join(tmpDir, 'out.js');

    // GenerateFileHandler's execute() catches every thrown error and returns
    // a resolved error response (unlike AnalyzeFileHandler, which rethrows) —
    // so the refusal shows up as a failed result, not a rejected promise.
    const result = await handler.execute({
      spec,
      outputPath,
      options: { backend: 'nvidia_deepseek' }
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no configured backend can hold it/);
  });

  it('never produces the false "exceeds context limit" refusal for a payload actually below the raw cap', async () => {
    // Regression for the false-refusal bug: capacityFor() used to mix a
    // reserved input capacity (local) with a raw total capacity (cloud).
    // A 500,593-char payload sits below openai_chatgpt's raw 512000 cap but
    // above 90% of it — escalation used to hand it to openai_chatgpt, which
    // then falsely claimed the payload "exceeds openai_chatgpt context
    // limit (512000 chars)" even though 500593 < 512000. Now capacityFor
    // already reserves the 10% response headroom, so escalation itself
    // recognizes no cloud backend fits and refuses honestly up front.
    const handler = new GenerateFileHandler({});
    handler.getContextLimit = async () => ({ charLimit: 50000, model: 'test-model' });

    const spec = 'x'.repeat(500593 - 300); // buildGenerationPrompt adds a fixed wrapper
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-generate-false-refusal-'));
    const outputPath = path.join(tmpDir, 'out.js');

    const result = await handler.execute({
      spec,
      outputPath,
      options: { backend: 'gemini' }
    });

    expect(result.success).toBe(false);
    expect(result.error).not.toMatch(/exceeds gemini context limit/);
    expect(result.error).not.toMatch(/exceeds openai_chatgpt context limit/);
    expect(result.error).toMatch(/no configured backend can hold it/);
  });
});
