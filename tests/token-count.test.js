/**
 * @fileoverview Every capacity limit in SAB used to be denominated in
 * characters, converted from provider token limits at a flat 4 chars/token.
 * That ratio only holds for English/code-ish text — CJK text runs at
 * roughly 1 char/token, ~4x MORE tokens than the flat conversion assumes.
 * countTokens() measures real tokens instead of inferring them from string
 * length; these tests pin down its accuracy and its fallback behavior.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { get_encoding } from 'tiktoken';
import { countTokens } from '../src/utils/token-count.js';

describe('countTokens: accuracy against a real tiktoken encoder', () => {
  it('matches tiktoken exactly on ASCII text', () => {
    const text = 'The quick brown fox jumps over the lazy dog.';
    const enc = get_encoding('cl100k_base');
    const expected = enc.encode(text).length;
    enc.free();
    expect(countTokens(text)).toBe(expected);
  });

  it('counts CJK text at ~1 token/char, not ~1/4', () => {
    const cjk = '中文测试文本内容重复段落用于验证分词器的真实行为'; // 24 chars
    const tokens = countTokens(cjk);
    // A flat 4 chars/token estimate would predict ~6 tokens. Real CJK tokenization
    // runs close to 1 token/char — assert it lands far above the old estimate
    // and within a generous band around 1:1.
    expect(tokens).toBeGreaterThan(cjk.length / 2);
    expect(tokens).toBeLessThanOrEqual(cjk.length);
  });

  it('returns 0 for empty or non-string input without throwing', () => {
    expect(countTokens('')).toBe(0);
    expect(countTokens(null)).toBe(0);
    expect(countTokens(undefined)).toBe(0);
  });
});

describe('countTokens: conservative fallback when tiktoken is unavailable', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('over-estimates (never under-estimates) when the encoder throws, and never uses a 4:1 ratio', async () => {
    vi.doMock('tiktoken', () => ({
      get_encoding: () => {
        throw new Error('WASM init failed');
      }
    }));
    vi.resetModules();
    const { countTokens: countTokensNoEncoder } = await import('../src/utils/token-count.js');

    const ascii = 'a'.repeat(1000);
    const result = countTokensNoEncoder(ascii);

    // Conservative fallback: ~1 char/token (over-estimate direction), not the
    // old 4:1 ratio (which would under-count and let an oversized payload
    // through the gate).
    expect(result).toBe(1000);
    expect(result).not.toBe(Math.ceil(1000 / 4));
  });

  it('never throws even when passed pathological input after encoder failure', async () => {
    vi.doMock('tiktoken', () => ({
      get_encoding: () => {
        throw new Error('WASM init failed');
      }
    }));
    vi.resetModules();
    const { countTokens: countTokensNoEncoder } = await import('../src/utils/token-count.js');

    expect(() => countTokensNoEncoder('some text')).not.toThrow();
    expect(countTokensNoEncoder('some text')).toBe('some text'.length);
  });
});

describe('countTokens: CJK payload that "fit" under the old char math is correctly flagged oversized', () => {
  it('a CJK payload sized to an old 4:1 char budget is really ~4x over the real token budget', () => {
    // Simulate the old assumption: a backend with a 8000-token limit was
    // treated as an 32000-char budget (8000 * 4). A CJK payload sized right
    // up to that 32000-char ceiling looks like it fits under the old math...
    const oldCharBudget = 32000;
    const cjkChar = '中';
    const payload = cjkChar.repeat(oldCharBudget / cjkChar.length);
    expect(payload.length).toBe(oldCharBudget);

    // ...but its real token count is nowhere near the 8000-token limit the
    // budget was derived from — it is close to one token per character.
    const realTokens = countTokens(payload);
    const realTokenLimit = 8000;
    expect(realTokens).toBeGreaterThan(realTokenLimit);
  });
});
