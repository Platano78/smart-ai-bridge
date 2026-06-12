/**
 * @fileoverview Adaptive compression sizing via information saturation detection.
 *
 * Instead of hardcoded max_items/max_matches, this module statistically determines
 * how many items to keep by finding the "knee point" — where adding more items
 * stops providing meaningful new information.
 *
 * Algorithm: Track unique bigrams as items are added in importance order. Build a
 * cumulative coverage curve. Find the knee (Kneedle algorithm) where marginal
 * information gain drops sharply. That's the optimal K.
 *
 * Per-tool profiles apply a bias multiplier on the statistically-determined K:
 * - conservative (bias=1.5): keep 50% more than mathematically needed
 * - moderate (bias=1.0): trust the statistics
 * - aggressive (bias=0.7): compress harder
 *
 * Ported from the TypeScript original (MCP-Code-Execution-Migration) to plain
 * ESM JavaScript for the live MKG server. Logic is identical.
 *
 * @author Senior Software Engineer
 * @license Apache-2.0
 * @module adaptiveSizer
 * @copyright chopratejas/headroom
 */

import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

/**
 * Computes the optimal number of items to keep using information saturation.
 *
 * Three-tier decision system:
 *   Tier 1 (fast path): trivial cases, near-duplicate detection
 *   Tier 2 (standard):  Kneedle on unique bigram coverage curve
 *   Tier 3 (validation): zlib compression ratio sanity check
 *
 * @param {string[]} items - Sequence of string representations of items (in importance order).
 * @param {number} [bias=1.0] - Multiplier on the knee point. >1 = keep more, <1 = keep fewer.
 * @param {number} [minK=3] - Never return fewer than this.
 * @param {number | null} [maxK=null] - Never return more than this (null = no cap).
 * @returns {number} Optimal number of items to keep.
 */
export function computeOptimalK(items, bias = 1.0, minK = 3, maxK = null) {
  const n = items.length;
  const effectiveMax = maxK ?? n;

  // Tier 1: Fast path
  if (n <= 8) {
    return n;
  }

  // Check for near-total redundancy
  const uniqueCount = countUniqueSimhash(items);
  if (uniqueCount <= 3) {
    const k = Math.max(minK, uniqueCount);
    return Math.min(k, effectiveMax);
  }

  // Tier 2: Kneedle on unique bigram coverage
  const curve = computeUniqueBigramCurve(items);
  const knee = findKnee(curve);

  // Diversity ratio: what fraction of items are genuinely unique?
  // 1.0 = every item is distinct, 0.1 = mostly near-duplicates.
  const diversityRatio = uniqueCount / n;

  let kneeValue;

  if (knee === null) {
    // No saturation found — each item adds new information.
    // Scale keep-fraction continuously with diversity:
    const keepFraction = 0.3 + 0.7 * diversityRatio;
    kneeValue = Math.max(minK, Math.trunc(n * keepFraction));
  } else {
    // Knee found, but if diversity is very high the knee may be
    // a weak signal. Don't drop below a diversity floor.
    if (diversityRatio > 0.7) {
      const diversityFloor = Math.max(minK, Math.trunc(n * (0.3 + 0.7 * diversityRatio)));
      kneeValue = Math.max(knee, diversityFloor);
    } else {
      kneeValue = knee;
    }
  }

  // Apply bias multiplier
  let k = Math.max(minK, Math.trunc(kneeValue * bias));
  k = Math.min(k, effectiveMax);

  // Tier 3: Validate with zlib compression ratio
  k = validateWithZlib(items, k, effectiveMax);

  // Final clamp
  k = Math.max(minK, Math.min(k, effectiveMax));

  return k;
}

/**
 * Finds the knee point (Kneedle) in a monotonically increasing curve.
 *
 * Uses the Kneedle algorithm: normalize to [0,1], compute the difference
 * from the y=x diagonal, return the index of maximum difference.
 *
 * @param {number[]} curve - List of cumulative values (e.g., unique bigram counts).
 * @returns {number | null} Index of the knee point (1-indexed count), or null if no clear knee exists.
 */
export function findKnee(curve) {
  const n = curve.length;
  if (n < 3) {
    return null;
  }

  // Normalize x and y to [0, 1]
  const xMin = 0;
  const xMax = n - 1;
  const yMin = curve[0];
  const yMax = curve[n - 1];

  if (yMax === yMin) {
    // Flat curve — all items are identical
    return 1;
  }

  const xRange = xMax - xMin;
  const yRange = yMax - yMin;

  // Compute difference from the diagonal (y = x in normalized space)
  let maxDiff = -1.0;
  let kneeIdx = null;

  for (let i = 0; i < n; i++) {
    const xNorm = (i - xMin) / xRange;
    const yNorm = (curve[i] - yMin) / yRange;
    // For concave curves, knee is where y_norm - x_norm is maximized
    const diff = yNorm - xNorm;
    if (diff > maxDiff) {
      maxDiff = diff;
      kneeIdx = i;
    }
  }

  // Require a meaningful deviation from diagonal
  if (maxDiff < 0.05) {
    return null;
  }

  // Knee is at kneeIdx, return 1-indexed count
  return kneeIdx !== null ? kneeIdx + 1 : null;
}

/**
 * Builds cumulative unique bigram coverage curve.
 *
 * For each item (in order), extracts word-level bigrams, adds them to a
 * running set, and records the total unique count.
 *
 * @param {string[]} items - Sequence of string items in importance order.
 * @returns {number[]} List where curve[k] = number of unique bigrams after seeing items[0:k+1].
 */
export function computeUniqueBigramCurve(items) {
  // Bigram keys are joined strings — JS Sets compare arrays by reference, so a
  // Set<[string,string]> would never dedupe and the curve would be meaningless.
  const seenBigrams = new Set();
  const curve = [];

  for (const item of items) {
    const words = item.toLowerCase().split(/\s+/).filter(Boolean);

    if (words.length < 2) {
      // For single-word items, use the word itself as a degenerate bigram
      seenBigrams.add(`${words[0] || ''} `);
    } else {
      for (let j = 0; j < words.length - 1; j++) {
        seenBigrams.add(`${words[j]} ${words[j + 1]}`);
      }
    }
    curve.push(seenBigrams.size);
  }

  return curve;
}

/**
 * Computes a 64-bit SimHash fingerprint for a text string.
 *
 * Uses character 4-grams hashed to 64-bit values, then aggregates
 * via weighted bit voting.
 *
 * @param {string} text - Input text.
 * @returns {bigint} 64-bit integer fingerprint.
 */
function _simhash(text) {
  const v = new Array(64).fill(0);
  const textLower = text.toLowerCase();

  // Character 4-grams
  // Python: max(1, lower.length - 3)
  const limit = Math.max(1, textLower.length - 3);

  for (let i = 0; i < limit; i++) {
    const gram = textLower.slice(i, i + 4);

    // MD5 hash of the gram, take the first 16 hex chars
    const digest = createHash('md5').update(gram).digest('hex').slice(0, 16);
    // Convert hex string to BigInt
    const h = BigInt(`0x${digest}`);

    for (let j = 0; j < 64; j++) {
      // Check j-th bit (0-indexed)
      if (h & (1n << BigInt(j))) {
        v[j] += 1;
      } else {
        v[j] -= 1;
      }
    }
  }

  let fingerprint = 0n;
  for (let j = 0; j < 64; j++) {
    if (v[j] > 0) {
      fingerprint |= (1n << BigInt(j));
    }
  }
  return fingerprint;
}

/**
 * Counts differing bits between two 64-bit BigInts.
 *
 * Uses Brian Kernighan loop logic implicitly via BigInt XOR and string counting.
 *
 * @param {bigint} a - First fingerprint.
 * @param {bigint} b - Second fingerprint.
 * @returns {number} Hamming distance (popcount).
 */
function _hammingDistance(a, b) {
  const xorResult = a ^ b;

  // Efficiently count set bits in a BigInt
  // Convert to binary string and count '1's
  return xorResult.toString(2).split('1').length - 1;
}

/**
 * Counts items with distinct content using SimHash.
 *
 * Groups items by SimHash fingerprint similarity (Hamming distance <= threshold).
 * Returns the number of distinct groups.
 *
 * @param {string[]} items - Sequence of string items.
 * @param {number} [threshold=3] - Max Hamming distance to consider items as duplicates.
 * @returns {number} Number of unique content groups.
 */
export function countUniqueSimhash(items, threshold = 3) {
  if (items.length === 0) {
    return 0;
  }

  // Compute fingerprints
  const fingerprints = items.map(_simhash);

  // Greedy clustering: assign each item to the first matching cluster
  const clusters = []; // Representative fingerprint per cluster
  for (const fp of fingerprints) {
    let matched = false;
    for (const rep of clusters) {
      if (_hammingDistance(fp, rep) <= threshold) {
        matched = true;
        break;
      }
    }
    if (!matched) {
      clusters.push(fp);
    }
  }

  return clusters.length;
}

/**
 * Validates the optimal K using Zlib compression ratio.
 *
 * If the compression ratio of the subset is significantly different
 * from the full set, we adjust K upwards.
 *
 * @param {string[]} items - All items.
 * @param {number} k - Proposed K value.
 * @param {number} maxK - Maximum allowable K.
 * @param {number} [tolerance=0.15] - Allowed difference in compression ratios.
 * @returns {number} Adjusted K value.
 */
function validateWithZlib(items, k, maxK, tolerance = 0.15) {
  if (k >= items.length || k >= maxK) {
    return k;
  }

  // Join items with newline, mimicking Python's join('\n')
  const fullText = Buffer.from(items.join('\n'));
  const subsetText = Buffer.from(items.slice(0, k).join('\n'));

  // Check minimum size constraint
  if (fullText.length < 200) {
    return k;
  }

  // Compress using zlib (level 1)
  const fullCompressed = deflateSync(fullText, { level: 1 }).length;
  const subsetCompressed = deflateSync(subsetText, { level: 1 }).length;

  // Calculate ratios
  const fullRatio = fullText.length ? fullCompressed / fullText.length : 1.0;
  const subsetRatio = subsetText.length ? subsetCompressed / subsetText.length : 1.0;
  const ratioDiff = Math.abs(fullRatio - subsetRatio);

  if (ratioDiff > tolerance) {
    // If ratio difference is high, increase K by 20% (trunc)
    const adjustedK = Math.trunc(k * 1.2);
    return Math.min(adjustedK, maxK);
  }

  return k;
}
