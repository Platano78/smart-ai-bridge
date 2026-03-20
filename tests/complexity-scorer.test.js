import { describe, it, expect } from 'vitest';
import { scoreComplexity, isComplex } from '../src/intelligence/complexity-scorer.js';

describe('Complexity Scorer', () => {
  it('returns score between 0 and 1', () => {
    const { score } = scoreComplexity({ prompt: 'hello' });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('scores simple prompt low', () => {
    const { score } = scoreComplexity({ prompt: 'what is x?' });
    expect(score).toBeLessThan(0.3);
  });

  it('scores complex prompt higher', () => {
    const { score } = scoreComplexity({
      prompt: 'Refactor the authentication system to use OAuth encryption with concurrent database migration and streaming websocket architecture',
      fileSize: 25000,
      fileCount: 12,
      toolType: 'generate'
    });
    expect(score).toBeGreaterThan(0.6);
  });

  it('includes factors in result', () => {
    const { factors } = scoreComplexity({ prompt: 'test', toolType: 'ask' });
    expect(factors).toHaveProperty('length');
    expect(factors).toHaveProperty('keywordDensity');
    expect(factors).toHaveProperty('fileSize');
    expect(factors).toHaveProperty('fileCount');
    expect(factors).toHaveProperty('toolType');
  });

  it('toolType affects score', () => {
    const ask = scoreComplexity({ prompt: 'test', toolType: 'ask' });
    const generate = scoreComplexity({ prompt: 'test', toolType: 'generate' });
    expect(generate.score).toBeGreaterThan(ask.score);
  });

  it('isComplex returns boolean', () => {
    expect(isComplex({ prompt: 'hi' })).toBe(false);
    expect(isComplex({ prompt: 'refactor optimize security authentication concurrent async streaming migration architecture database encryption oauth websocket', fileSize: 50000, fileCount: 15, toolType: 'generate' })).toBe(true);
  });

  it('handles empty prompt', () => {
    const { score } = scoreComplexity({ prompt: '' });
    expect(score).toBeGreaterThanOrEqual(0);
  });
});
