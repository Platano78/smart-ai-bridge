/**
 * @fileoverview SmartCrusher implementation for lossy JSON-array compression.
 *
 * This module provides functionality to compress arrays of records (objects)
 * by strategically dropping non-critical items. It uses an adaptive sizing
 * algorithm to determine the optimal number of items to retain, ensuring
 * compression efficiency while preserving key data points. The original,
 * uncrushed arrays are retained in-process via _ccrStore and are
 * recoverable using retrieveOriginal.
 *
 * Ported from the TypeScript original (MCP-Code-Execution-Migration) to plain
 * ESM JavaScript for the live MKG server. Logic is identical.
 *
 * @author Senior Software Engineer
 * @license Apache-2.0
 * @module smartCrusher
 * @copyright chopratejas/headroom
 */

import { computeOptimalK } from './adaptiveSizer.js';
import { createHash } from 'node:crypto';

/**
 * Sentinel key appended to the compressed array to identify the source and
 * details of the compression (e.g., hash, item count dropped).
 * @type {string}
 */
export const CCR_SENTINEL_KEY = '_ccr_dropped';

/**
 * Configuration parameters for the SmartCrusher algorithm.
 *
 * @typedef {Object} SmartCrusherConfig
 * @property {boolean} enabled - Whether compression should be enabled (true = crush, false = pass-through).
 * @property {number} minItemsToAnalyze - Minimum number of items an array must have to even attempt crushing.
 * @property {number} minTokensToCrush - Minimum token count the array must have to justify crushing.
 * @property {number} maxItemsAfterCrush - Maximum number of items allowed after crushing.
 * @property {number} firstFraction - Fraction of items kept from the start (0.0 to 1.0).
 * @property {number} lastFraction - Fraction of items kept from the end (0.0 to 1.0).
 * @property {number} bias - Bias multiplier applied to the Kneedle result (1.0 is standard).
 * @property {number} maxDepth - Maximum recursion depth for crushing nested objects/arrays.
 */

/**
 * Default configuration settings for the SmartCrusher.
 * @type {SmartCrusherConfig}
 */
export const DEFAULT_CRUSHER_CONFIG = {
  enabled: false,
  minItemsToAnalyze: 5,
  minTokensToCrush: 200,
  maxItemsAfterCrush: 15,
  firstFraction: 0.3,
  lastFraction: 0.15,
  bias: 1.0,
  maxDepth: 5,
};

/**
 * Statistics collected during the crushing process.
 *
 * @typedef {Object} CrushStats
 * @property {number} originalTokens
 * @property {number} compressedTokens
 * @property {number} arraysCrushed
 * @property {number} itemsDropped
 */

/**
 * Module-level store for caching original arrays based on their hash.
 * Maps: Hash (string) -> Original Array (unknown[])
 *
 * Bounded with FIFO eviction so a long-running bridge process cannot leak
 * memory without limit. Insertion order is Map-native; the oldest entry is
 * evicted once the cap is hit. Recovery via retrieveOriginal is best-effort
 * for recent results, not a durable archive.
 */
const CCR_STORE_MAX_ENTRIES = 256;
const _ccrStore = new Map();

/**
 * Insert into the CCR store with FIFO eviction at the size cap.
 * @param {string} hash
 * @param {unknown[]} original
 */
function ccrStorePut(hash, original) {
  if (_ccrStore.size >= CCR_STORE_MAX_ENTRIES && !_ccrStore.has(hash)) {
    const oldest = _ccrStore.keys().next().value;
    if (oldest !== undefined) {
      _ccrStore.delete(oldest);
    }
  }
  _ccrStore.set(hash, original);
}

/**
 * JSON.stringify that never throws (circular refs, BigInt, etc. -> '').
 * @param {unknown} v
 * @returns {string}
 */
function safeStringify(v) {
  try {
    return JSON.stringify(v) ?? '';
  } catch {
    return '';
  }
}

/**
 * Internal: Estimates the token count of a value.
 * Uses a rough approximation based on string length (4 characters per token).
 * @param {unknown} v - The value to analyze.
 * @returns {number} Estimated token count.
 */
function estimateTokens(v) {
  try {
    const str = JSON.stringify(v);
    return Math.ceil(str.length / 4);
  } catch (e) {
    // Handles cases where JSON.stringify fails (e.g., circular references)
    return 0;
  }
}

/**
 * Internal: Checks if an item contains keywords indicating importance.
 * @param {unknown} item - The item to test.
 * @returns {boolean} True if the item is considered important.
 */
function isImportant(item) {
  const str = safeStringify(item);
  return /\b(error|fail|failure|exception|fatal|warn|warning|critical)\b/i.test(str);
}

/**
 * Internal: Generates a short 12-character SHA256 hash of a string.
 * @param {string} s - The input string.
 * @returns {string} The 12-char hash.
 */
function shortHash(s) {
  return createHash('sha256').update(s).digest('hex').slice(0, 12);
}

/**
 * Internal: Crushes a single array of records using SmartCrusher logic.
 *
 * Determines the optimal number of items to keep based on content saturation,
 * ensuring that important items, first items, and last items are preserved.
 *
 * @param {unknown[]} arr - The input array of records.
 * @param {SmartCrusherConfig} cfg - The crushing configuration.
 * @param {CrushStats} stats - The stats object to update.
 * @returns {unknown[]} The crushed array, including the sentinel object.
 */
function crushArray(arr, cfg, stats) {
  const n = arr.length;

  // 1. Initial Checks
  if (n < cfg.minItemsToAnalyze) {
    return arr;
  }

  // Check if all elements are non-null objects (targeting arrays-of-records)
  if (!arr.every(item => item !== null && typeof item === 'object' && !Array.isArray(item))) {
    return arr;
  }

  const originalTokens = estimateTokens(arr);
  if (originalTokens < cfg.minTokensToCrush) {
    return arr;
  }

  // 2. Tokenization and Sizing
  const itemStrings = arr.map(x => JSON.stringify(x) ?? '');

  // Use adaptive sizer to find optimal K
  const k = computeOptimalK(itemStrings, cfg.bias, 3, cfg.maxItemsAfterCrush);

  if (k >= n) {
    // Optimal K is too high, no compression needed
    return arr;
  }

  // 3. Determine Keep Indices
  const keepIndices = new Set();

  // A. Important items
  for (let i = 0; i < n; i++) {
    if (isImportant(arr[i])) {
      keepIndices.add(i);
    }
  }

  // B. First F items
  const firstCount = Math.ceil(cfg.firstFraction * n);
  for (let i = 0; i < firstCount; i++) {
    keepIndices.add(i);
  }

  // C. Last L items
  const lastCount = Math.ceil(cfg.lastFraction * n);
  for (let i = 0; i < lastCount; i++) {
    // Index n - lastCount + i
    const index = n - lastCount + i;
    if (index < n) { // Safety check
      keepIndices.add(index);
    }
  }

  // 4. Fill remaining K slots
  const sortedKeepIndices = Array.from(keepIndices).sort((a, b) => a - b);
  let remainingIndices = new Set();
  for (let i = 0; i < n; i++) {
    if (!keepIndices.has(i)) {
      remainingIndices.add(i);
    }
  }

  // Fill up to k
  const needed = k - sortedKeepIndices.length;
  if (needed > 0) {
    const fillIndices = Array.from(remainingIndices).sort((a, b) => a - b);
    for (let i = 0; i < Math.min(needed, fillIndices.length); i++) {
      sortedKeepIndices.push(fillIndices[i]);
    }
  }

  // Re-sort so filled middle indices stay in original document order
  sortedKeepIndices.sort((a, b) => a - b);

  // 5. Build the Result Array
  const kept = sortedKeepIndices.map(i => arr[i]);
  const droppedCount = n - kept.length;

  if (droppedCount <= 0) {
    // Should not happen if k < n, but safe check
    return arr;
  }

  // 6. Hash and Store the pristine original (best-effort; skip if unserializable)
  const base = safeStringify(arr);
  if (!base) {
    return arr;
  }
  const hash = shortHash(base);
  ccrStorePut(hash, arr);

  // 7. Update Stats and Return
  stats.arraysCrushed += 1;
  stats.itemsDropped += droppedCount;

  // Append sentinel object. Encode the ORIGINAL row count (n) alongside the
  // dropped count so a downstream consumer can read the total directly
  // (kept + dropped) instead of reconstructing it by arithmetic — the latter
  // is unreliable for LLM consumers and was a measured artifact-trail defect.
  const sentinelMessage = `<<ccr:${hash} ${droppedCount}_of_${n}_rows_offloaded>>`;
  return [...kept, { [CCR_SENTINEL_KEY]: sentinelMessage }];
}

/**
 * Internal: Recursively crushes a value (object or array).
 *
 * Traverses the data structure, crushing nested arrays and applying
 * the array-level crushing logic when an array is encountered.
 *
 * @param {unknown} value - The value to crush.
 * @param {SmartCrusherConfig} cfg - The crushing configuration.
 * @param {CrushStats} stats - The stats object to update.
 * @param {number} depth - Current recursion depth.
 * @returns {unknown} The crushed value.
 */
function crushValue(value, cfg, stats, depth) {
  // Base Case 1: Max Depth Reached
  if (depth > cfg.maxDepth) {
    return value;
  }

  // Case 1: Array (Recursive Step)
  if (Array.isArray(value)) {
    // Crush THIS array first so the pristine original is captured in the CCR
    // store, then recurse into the kept elements. Doing it in this order avoids
    // the double-crush bug where recursing first would store an already-crushed
    // child as the "original", breaking retrieveOriginal fidelity.
    const crushed = crushArray(value, cfg, stats);
    return crushed.map(item => crushValue(item, cfg, stats, depth + 1));
  }

  // Case 2: Non-null Object (Traversal Step)
  if (value !== null && typeof value === 'object') {
    const source = value;
    const crushedObject = {};
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        crushedObject[key] = crushValue(source[key], cfg, stats, depth + 1);
      }
    }
    return crushedObject;
  }

  // Case 3: Primitive (Base Case)
  return value;
}

/**
 * Retrieves the original (uncrushed) array associated with a given hash.
 *
 * @param {string} hash - The 12-character hash generated by the crusher.
 * @returns {unknown | undefined} The original array, or undefined if not found in the store.
 */
export function retrieveOriginal(hash) {
  return _ccrStore.get(hash);
}

/**
 * True if `item` is a CCR-dropped sentinel object
 * (`{ _ccr_dropped: "<<ccr:...>>" }`).
 * @param {unknown} item
 * @returns {boolean}
 */
export function isCcrSentinel(item) {
  return typeof item === 'object' && item !== null && CCR_SENTINEL_KEY in item;
}

/**
 * Return `items` with any CCR-dropped sentinel objects filtered out.
 *
 * Use this in any code that iterates a (possibly compressed) array expecting a
 * uniform-schema list of records — the appended sentinel object would otherwise
 * break field access like `entries.map(e => e.level)`.
 *
 * @template T
 * @param {T[]} items
 * @returns {T[]}
 */
export function stripCcrSentinels(items) {
  return items.filter(item => !isCcrSentinel(item));
}

/**
 * Public entry point for the SmartCrusher compression tool.
 *
 * Applies lossy compression to a value (object, array, primitive).
 * If the value is an array, it attempts row-dropping; otherwise, it traverses
 * and crushes nested structures.
 *
 * @param {unknown} value - The data structure to compress.
 * @param {Partial<SmartCrusherConfig>} [config] - Optional configuration overrides.
 * @returns {{ value: unknown, stats: CrushStats }} An object containing the compressed value and compression statistics.
 * @throws {Error} If the input value is undefined.
 */
export function crushToolResult(value, config) {
  if (value === undefined) {
    throw new Error("Input value cannot be undefined for crushing.");
  }

  // Merge configuration
  const cfg = {
    ...DEFAULT_CRUSHER_CONFIG,
    ...(config ?? {}),
  };

  // Initialize statistics
  const stats = {
    originalTokens: estimateTokens(value),
    compressedTokens: 0,
    arraysCrushed: 0,
    itemsDropped: 0,
  };

  // 1. Handle Pass-through/Audit Mode
  if (!cfg.enabled) {
    stats.compressedTokens = stats.originalTokens;
    return { value, stats };
  }

  // 2. Perform Crushing
  const crushed = crushValue(value, cfg, stats, 0);

  // 3. Finalize Statistics
  stats.compressedTokens = estimateTokens(crushed);

  return { value: crushed, stats };
}
