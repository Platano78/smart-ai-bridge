/**
 * Unit tests for the adaptive sizer (Headroom adaptive_sizer.py port).
 * Ported from MCP-Code-Execution-Migration TS suite to vitest + ESM .js.
 */

import { describe, it, expect } from 'vitest';
import {
  computeOptimalK,
  findKnee,
  computeUniqueBigramCurve,
  countUniqueSimhash,
} from '../../src/compression/adaptiveSizer.js';

describe('findKnee', () => {
  it('returns null for curves shorter than 3', () => {
    expect(findKnee([])).toBeNull();
    expect(findKnee([1])).toBeNull();
    expect(findKnee([1, 2])).toBeNull();
  });

  it('returns 1 for a flat curve (all identical)', () => {
    expect(findKnee([5, 5, 5, 5])).toBe(1);
  });

  it('finds an early knee on a sharply saturating curve', () => {
    // Fast rise then plateau -> knee should be near the start.
    const knee = findKnee([0, 8, 10, 10, 10, 10, 10, 10]);
    expect(knee).not.toBeNull();
    expect(knee).toBeLessThanOrEqual(3);
  });
});

describe('computeUniqueBigramCurve', () => {
  it('is monotonically non-decreasing', () => {
    const curve = computeUniqueBigramCurve(['a b c', 'd e f', 'a b c']);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
    }
  });

  it('does not grow for a repeated identical item', () => {
    const curve = computeUniqueBigramCurve(['x y', 'x y', 'x y']);
    expect(curve[0]).toBe(curve[2]);
  });
});

describe('countUniqueSimhash', () => {
  it('returns 0 for an empty list', () => {
    expect(countUniqueSimhash([])).toBe(0);
  });

  it('clusters identical strings into one group', () => {
    expect(countUniqueSimhash(['same text here', 'same text here', 'same text here'])).toBe(1);
  });

  it('counts distinct content as separate groups', () => {
    const items = [
      'the quick brown fox jumps',
      'completely different sentence about databases',
      'a third unrelated topic entirely here',
    ];
    expect(countUniqueSimhash(items)).toBeGreaterThan(1);
  });
});

describe('computeOptimalK', () => {
  it('keeps everything for trivially small inputs (n <= 8)', () => {
    expect(computeOptimalK(['a', 'b', 'c'])).toBe(3);
    expect(computeOptimalK(Array.from({ length: 8 }, (_, i) => `item ${i}`))).toBe(8);
  });

  it('compresses hard when content is near-totally redundant', () => {
    const items = Array.from({ length: 50 }, () => 'identical repeated row value');
    const k = computeOptimalK(items);
    expect(k).toBeLessThanOrEqual(5);
    expect(k).toBeGreaterThanOrEqual(3);
  });

  it('keeps most items when every row is genuinely unique', () => {
    const items = Array.from({ length: 50 }, (_, i) => `unique row ${i} with distinct token ${i * 7} payload ${i}`);
    const k = computeOptimalK(items);
    expect(k).toBeGreaterThan(25);
  });

  it('respects the minK and maxK clamps', () => {
    const items = Array.from({ length: 50 }, () => 'identical repeated row value');
    expect(computeOptimalK(items, 1.0, 10)).toBeGreaterThanOrEqual(10);
    expect(computeOptimalK(items, 1.0, 3, 7)).toBeLessThanOrEqual(7);
  });
});
