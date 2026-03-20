import { describe, it, expect } from 'vitest';
import { BaseHandler } from '../src/handlers/base-handler.js';

class TestHandler extends BaseHandler {
  async execute() { return { success: true }; }
}

describe('BaseHandler utilities', () => {
  const handler = new TestHandler({ handlerName: 'Test' });

  describe('extractResponseText', () => {
    it('handles raw string', () => {
      expect(handler.extractResponseText('hello')).toBe('hello');
    });
    it('handles null/undefined', () => {
      expect(handler.extractResponseText(null)).toBe('');
      expect(handler.extractResponseText(undefined)).toBe('');
    });
    it('handles content string', () => {
      expect(handler.extractResponseText({ content: 'hello' })).toBe('hello');
    });
    it('handles reasoning_content (thinking models)', () => {
      expect(handler.extractResponseText({ content: '', reasoning_content: 'thought' })).toBe('thought');
    });
    it('handles OpenAI choices format', () => {
      expect(handler.extractResponseText({ choices: [{ message: { content: 'answer' } }] })).toBe('answer');
    });
    it('handles legacy completions choices[0].text', () => {
      expect(handler.extractResponseText({ choices: [{ text: 'legacy' }] })).toBe('legacy');
    });
    it('handles Gemini candidates format', () => {
      expect(handler.extractResponseText({ candidates: [{ content: { parts: [{ text: 'gemini' }] } }] })).toBe('gemini');
    });
    it('handles array content parts', () => {
      expect(handler.extractResponseText({ content: [{ text: 'part1' }, { text: 'part2' }] })).toBe('part1\npart2');
    });
    it('handles generic text fallback', () => {
      expect(handler.extractResponseText({ text: 'fallback' })).toBe('fallback');
    });
    it('handles generic result fallback', () => {
      expect(handler.extractResponseText({ result: 'value' })).toBe('value');
    });
    it('falls back to JSON.stringify for unknown objects', () => {
      const result = handler.extractResponseText({ foo: 'bar' });
      expect(result).toBe('{"foo":"bar"}');
    });
  });

  describe('collapseRepetitiveOutput', () => {
    it('returns empty string for null', () => {
      expect(handler.collapseRepetitiveOutput(null)).toBe('');
    });
    it('returns short text unchanged', () => {
      expect(handler.collapseRepetitiveOutput('short')).toBe('short');
    });
    it('returns text with <20 lines unchanged', () => {
      const text = Array(15).fill('line').join('\n');
      expect(handler.collapseRepetitiveOutput(text)).toBe(text);
    });
    it('collapses 6+ repeated lines', () => {
      const lines = [];
      for (let i = 0; i < 5; i++) lines.push('unique line ' + i);
      for (let i = 0; i < 20; i++) lines.push('repeated line');
      const result = handler.collapseRepetitiveOutput(lines.join('\n'));
      expect(result).toContain('unique line 0');
      expect(result).toContain('repeated line');
      expect(result).toContain('[Output compacted');
      expect(result.split('\n').length).toBeLessThan(lines.length);
    });
    it('does not collapse if max repeat < 6', () => {
      const lines = [];
      for (let i = 0; i < 25; i++) lines.push('line ' + (i % 10));
      const result = handler.collapseRepetitiveOutput(lines.join('\n'));
      expect(result).not.toContain('[Output compacted');
    });
  });

  describe('sanitizeTextList', () => {
    it('returns empty array for null', () => {
      expect(handler.sanitizeTextList(null, 10)).toEqual([]);
    });
    it('deduplicates items', () => {
      expect(handler.sanitizeTextList(['a', 'a', 'b'], 10)).toEqual(['a', 'b']);
    });
    it('caps at maxItems', () => {
      expect(handler.sanitizeTextList(['a', 'b', 'c', 'd'], 2)).toEqual(['a', 'b']);
    });
    it('skips non-string items', () => {
      expect(handler.sanitizeTextList([1, null, 'a', undefined], 10)).toEqual(['a']);
    });
    it('trims whitespace', () => {
      expect(handler.sanitizeTextList(['  hello  ', 'hello'], 10)).toEqual(['hello']);
    });
  });

  describe('estimateTokens', () => {
    it('returns 0 for empty', () => {
      expect(handler.estimateTokens('')).toBe(0);
    });
    it('estimates ~4 chars per token', () => {
      expect(handler.estimateTokens('abcdefgh')).toBe(2);
    });
  });
});
