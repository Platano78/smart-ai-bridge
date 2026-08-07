/**
 * @fileoverview Follow-up C — restores the isolated detectTruncation null/undefined
 * guard test dropped during the earlier file split (see prior report, section C(iii)).
 * detectTruncation is a private method, so we exercise it via a minimal AskHandler
 * instance rather than reimplementing its logic.
 */
import { describe, it, expect } from 'vitest';
import { AskHandler } from '../src/handlers/ask-handler.js';

describe('AskHandler.detectTruncation null/undefined maxTokens guard', () => {
  const handler = new AskHandler({});

  it('does not throw and ignores the numeric near-limit check when maxTokens is null', () => {
    expect(() => handler.detectTruncation('plain finished sentence.', null)).not.toThrow();
    expect(handler.detectTruncation('plain finished sentence.', null)).toBe(false);
  });

  it('does not throw and ignores the numeric near-limit check when maxTokens is undefined', () => {
    expect(() => handler.detectTruncation('plain finished sentence.', undefined)).not.toThrow();
    expect(handler.detectTruncation('plain finished sentence.', undefined)).toBe(false);
  });

  it('still returns true based on a textual indicator when maxTokens is null (ellipsis)', () => {
    expect(handler.detectTruncation('this got cut off...', null)).toBe(true);
  });

  it('still returns true for a genuine near-limit numeric case', () => {
    const longContent = 'word '.repeat(100); // ~100 tokens by this project's estimator
    expect(handler.detectTruncation(longContent, 10)).toBe(true);
  });

  it('returns false for a genuine numeric case well under the limit', () => {
    expect(handler.detectTruncation('short.', 10000)).toBe(false);
  });
});
