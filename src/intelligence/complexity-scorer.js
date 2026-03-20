/**
 * Prompt complexity scorer — pure logic, model-agnostic.
 * Produces a 0.0–1.0 score based on prompt characteristics.
 */

const COMPLEXITY_KEYWORDS = [
  'refactor', 'optimize', 'security', 'authentication', 'concurrent',
  'async', 'streaming', 'migration', 'architecture', 'database',
  'encryption', 'oauth', 'websocket', 'real-time', 'algorithm',
];

const TOOL_WEIGHTS = {
  ask: 0.1,
  analyze: 0.25,
  review: 0.3,
  modify: 0.5,
  council: 0.6,
  generate: 0.7,
};

const LENGTH_THRESHOLDS = { low: 200, mid: 800, high: 2000 };
const FILE_SIZE_THRESHOLDS = { mid: 5000, high: 20000 };

/**
 * Score prompt complexity on 0.0-1.0 scale.
 * @param {Object} params
 * @param {string} params.prompt - The prompt text
 * @param {number} [params.fileSize] - File size in chars
 * @param {number} [params.fileCount] - Number of files
 * @param {string} [params.toolType] - Tool type (ask, analyze, modify, generate, review, council)
 * @returns {{score: number, factors: Object}}
 */
export function scoreComplexity({ prompt, fileSize = 0, fileCount = 1, toolType = 'ask' }) {
  const factors = {};

  // 1. Instruction length (0.0-1.0, weight 0.25)
  const len = (prompt || '').length;
  if (len >= LENGTH_THRESHOLDS.high) factors.length = 1.0;
  else if (len >= LENGTH_THRESHOLDS.mid) factors.length = 0.6;
  else if (len >= LENGTH_THRESHOLDS.low) factors.length = 0.3;
  else factors.length = 0.1;

  // 2. Keyword density (0.0-1.0, weight 0.25)
  const lower = (prompt || '').toLowerCase();
  const hits = COMPLEXITY_KEYWORDS.filter(kw => lower.includes(kw)).length;
  factors.keywordDensity = Math.min(hits / 5, 1.0);

  // 3. File size (0.0-1.0, weight 0.15)
  if (fileSize >= FILE_SIZE_THRESHOLDS.high) factors.fileSize = 1.0;
  else if (fileSize >= FILE_SIZE_THRESHOLDS.mid) factors.fileSize = 0.5;
  else if (fileSize > 0) factors.fileSize = 0.2;
  else factors.fileSize = 0.0;

  // 4. File count (0.0-1.0, weight 0.15)
  if (fileCount >= 10) factors.fileCount = 1.0;
  else if (fileCount >= 5) factors.fileCount = 0.6;
  else if (fileCount >= 2) factors.fileCount = 0.3;
  else factors.fileCount = 0.0;

  // 5. Tool type (0.0-1.0, weight 0.20)
  factors.toolType = TOOL_WEIGHTS[toolType] ?? 0.2;

  // Weighted sum
  const score =
    factors.length * 0.25 +
    factors.keywordDensity * 0.25 +
    factors.fileSize * 0.15 +
    factors.fileCount * 0.15 +
    factors.toolType * 0.20;

  return { score: Math.round(score * 1000) / 1000, factors };
}

/**
 * Convenience check: is the prompt complex enough to exceed a threshold?
 * @param {Object} params - Same as scoreComplexity
 * @param {number} [threshold=0.6] - Complexity threshold
 * @returns {boolean}
 */
export function isComplex(params, threshold = 0.6) {
  return scoreComplexity(params).score >= threshold;
}
