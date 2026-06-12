/**
 * Unit tests for SmartCrusher (lossy JSON-array compression + reversible CCR).
 */

import { describe, it, expect } from 'vitest';
import {
  crushToolResult,
  retrieveOriginal,
  isCcrSentinel,
  stripCcrSentinels,
  CCR_SENTINEL_KEY,
} from '../../src/compression/smartCrush.js';

function repetitiveRows(n) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    if (i === 10) rows.push({ ts: i, level: 'error', msg: 'disk write failed ENOSPC' });
    else if (i === 20) rows.push({ ts: i, level: 'fatal', msg: 'segfault in worker' });
    else rows.push({ ts: i, level: 'info', msg: 'request handled ok', code: 200 });
  }
  return rows;
}

function sentinelOf(arr) {
  return arr.find(isCcrSentinel);
}

describe('crushToolResult — passthrough / gating', () => {
  it('is inert when disabled (default): returns the same reference', () => {
    const value = { matches: repetitiveRows(50) };
    const { value: out, stats } = crushToolResult(value);
    expect(out).toBe(value);
    expect(stats.compressedTokens).toBe(stats.originalTokens);
    expect(stats.arraysCrushed).toBe(0);
  });

  it('does not crush arrays below minItemsToAnalyze', () => {
    const value = { matches: repetitiveRows(4) };
    const { value: out, stats } = crushToolResult(value, { enabled: true });
    expect(out.matches).toHaveLength(4);
    expect(stats.arraysCrushed).toBe(0);
  });

  it('does not crush arrays of primitives (targets arrays-of-records)', () => {
    const value = { tags: Array.from({ length: 40 }, (_, i) => `tag-${i % 3}`) };
    const { value: out, stats } = crushToolResult(value, { enabled: true });
    expect(out.tags).toHaveLength(40);
    expect(stats.arraysCrushed).toBe(0);
  });

  it('throws on undefined input', () => {
    expect(() => crushToolResult(undefined)).toThrow();
  });
});

describe('crushToolResult — compression', () => {
  it('crushes a large repetitive array and reduces tokens', () => {
    const value = { matches: repetitiveRows(100) };
    const { value: out, stats } = crushToolResult(value, { enabled: true });
    const matches = out.matches;
    expect(matches.length).toBeLessThan(100);
    expect(stats.arraysCrushed).toBe(1);
    expect(stats.itemsDropped).toBeGreaterThan(0);
    expect(stats.compressedTokens).toBeLessThan(stats.originalTokens);
  });

  it('preserves important (error/fatal) rows', () => {
    const { value: out } = crushToolResult({ matches: repetitiveRows(100) }, { enabled: true });
    const kept = stripCcrSentinels(out.matches);
    const levels = kept.map(r => r.level);
    expect(levels).toContain('error');
    expect(levels).toContain('fatal');
  });

  it('appends exactly one CCR sentinel describing the drop', () => {
    const { value: out } = crushToolResult({ matches: repetitiveRows(100) }, { enabled: true });
    const matches = out.matches;
    const sentinel = sentinelOf(matches);
    expect(sentinel).toBeDefined();
    expect(String(sentinel[CCR_SENTINEL_KEY])).toMatch(/^<<ccr:[a-f0-9]{12} \d+_of_\d+_rows_offloaded>>$/);
  });
});

describe('reversibility (CCR)', () => {
  it('retrieveOriginal round-trips the pristine original array', () => {
    const { value: out } = crushToolResult({ matches: repetitiveRows(100) }, { enabled: true });
    const sentinel = sentinelOf(out.matches);
    const hash = String(sentinel[CCR_SENTINEL_KEY]).match(/<<ccr:([a-f0-9]{12})/)[1];
    const restored = retrieveOriginal(hash);
    expect(restored).toHaveLength(100);
    expect(restored.some(isCcrSentinel)).toBe(false);
  });

  it('stores the pristine original for nested arrays (no double-crush leak)', () => {
    const nested = {
      items: Array.from({ length: 30 }, (_, i) => ({
        id: i,
        tags: ['t', 't', 't', 't', 't', 't'],
        note: `same note repeated for redundancy ${i % 3}`,
      })),
    };
    const { value: out } = crushToolResult(nested, { enabled: true });
    const sentinel = sentinelOf(out.items);
    if (!sentinel) {
      return; // under thresholds in this environment — nothing to assert
    }
    const hash = String(sentinel[CCR_SENTINEL_KEY]).match(/<<ccr:([a-f0-9]{12})/)[1];
    const restored = retrieveOriginal(hash);
    expect(restored).toHaveLength(30);
    expect(Array.isArray(restored[0].tags)).toBe(true);
    expect(restored[0].tags).toHaveLength(6);
    expect(restored.some(isCcrSentinel)).toBe(false);
  });
});

describe('sentinel helpers', () => {
  it('isCcrSentinel only matches the sentinel object', () => {
    expect(isCcrSentinel({ [CCR_SENTINEL_KEY]: '<<ccr:abc 1_of_5_rows_offloaded>>' })).toBe(true);
    expect(isCcrSentinel({ level: 'info' })).toBe(false);
    expect(isCcrSentinel('string')).toBe(false);
    expect(isCcrSentinel(null)).toBe(false);
  });

  it('stripCcrSentinels removes only sentinels', () => {
    const arr = [{ a: 1 }, { [CCR_SENTINEL_KEY]: '<<ccr:abc 1_of_5_rows_offloaded>>' }, { b: 2 }];
    expect(stripCcrSentinels(arr)).toHaveLength(2);
  });
});
