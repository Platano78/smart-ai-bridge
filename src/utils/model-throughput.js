/**
 * @fileoverview Model Throughput - learned generation speed per model identity
 * @module utils/model-throughput
 *
 * llama.cpp (and llama.cpp-compatible servers) return a `timings` object on every
 * completion, including `predicted_per_second`. That is a measurement of the model
 * actually running on the actual hardware, which is strictly better than guessing
 * tokens/sec from a model's name or parameter count.
 *
 * This module is a passive learner: it never probes anything. Callers hand it the
 * `timings` block from responses the bridge was already making, and it keeps a
 * smoothed value per MODEL IDENTITY. Keying on identity is what makes a model swap
 * safe — a new model never inherits the previous occupant's numbers.
 *
 * Servers that report no timings (vLLM, LM Studio, Ollama, cloud) simply never
 * populate the store, and callers fall back to their cold-start seed.
 */

/**
 * Exponential smoothing factor for repeat samples. Weighted toward the newest
 * measurement so a context-length or batch-size change is reflected quickly,
 * while a single outlier request cannot swing the estimate wholesale.
 * @type {number}
 */
const EMA_ALPHA = 0.4;

/**
 * Sanity bounds. A `predicted_per_second` outside this range is a measurement
 * artifact (e.g. a 1-token completion whose timer barely ticked), not a speed.
 */
const MIN_PLAUSIBLE_TPS = 0.1;
const MAX_PLAUSIBLE_TPS = 10000;

/**
 * Minimum predicted tokens before a sample is trusted. Very short generations
 * produce wildly optimistic per-second figures dominated by fixed overhead.
 * @type {number}
 */
const MIN_PREDICTED_TOKENS = 8;

/**
 * @typedef {Object} ThroughputRecord
 * @property {string} model - Model identity the sample belongs to
 * @property {number} tokensPerSecond - Smoothed generation speed
 * @property {number} samples - How many samples fed the value
 * @property {number} updatedAt - Epoch ms of the last sample
 */

/** @type {Map<string, ThroughputRecord>} */
const throughputByModel = new Map();

/** @type {string|null} Identity of the most recently measured model */
let lastMeasuredModel = null;

/**
 * Record a completion's timings against a model identity.
 * Silently ignores anything that is not a usable measurement, so callers can
 * hand it a raw response body without pre-checking the server type.
 *
 * @param {string} modelIdentity - Model id/alias the completion ran on
 * @param {Object} [timings] - llama.cpp `timings` block from the response
 * @returns {ThroughputRecord|null} The updated record, or null if not recorded
 */
function recordTimings(modelIdentity, timings) {
  if (!modelIdentity || typeof modelIdentity !== 'string') return null;
  if (!timings || typeof timings !== 'object') return null;

  const tps = Number(timings.predicted_per_second);
  if (!Number.isFinite(tps) || tps < MIN_PLAUSIBLE_TPS || tps > MAX_PLAUSIBLE_TPS) {
    return null;
  }

  // A handful of predicted tokens cannot measure steady-state throughput.
  const predicted = Number(timings.predicted_n);
  if (Number.isFinite(predicted) && predicted < MIN_PREDICTED_TOKENS) {
    return null;
  }

  const existing = throughputByModel.get(modelIdentity);
  const smoothed = existing
    ? (EMA_ALPHA * tps) + ((1 - EMA_ALPHA) * existing.tokensPerSecond)
    : tps;

  const record = {
    model: modelIdentity,
    tokensPerSecond: smoothed,
    samples: (existing?.samples || 0) + 1,
    updatedAt: Date.now()
  };

  throughputByModel.set(modelIdentity, record);
  lastMeasuredModel = modelIdentity;
  return record;
}

/**
 * Learned generation speed for a model identity.
 * @param {string} modelIdentity - Model id/alias
 * @returns {number|null} Tokens per second, or null if never measured
 */
function getLearnedTokensPerSecond(modelIdentity) {
  if (!modelIdentity) return null;
  const record = throughputByModel.get(modelIdentity);
  return record ? record.tokensPerSecond : null;
}

/**
 * Full record for a model identity (speed plus provenance).
 * @param {string} modelIdentity - Model id/alias
 * @returns {ThroughputRecord|null}
 */
function getThroughputRecord(modelIdentity) {
  if (!modelIdentity) return null;
  return throughputByModel.get(modelIdentity) || null;
}

/**
 * The most recently measured model's record, for callers that know a local
 * backend is in play but not which model id it resolved to.
 * @returns {ThroughputRecord|null}
 */
function getMostRecentThroughput() {
  if (!lastMeasuredModel) return null;
  return throughputByModel.get(lastMeasuredModel) || null;
}

/**
 * Drop learned speeds. Used by discovery cache invalidation and by tests.
 * @param {string} [modelIdentity] - Clear only this identity; omit to clear all
 */
function clearThroughput(modelIdentity) {
  if (modelIdentity) {
    throughputByModel.delete(modelIdentity);
    if (lastMeasuredModel === modelIdentity) lastMeasuredModel = null;
    return;
  }
  throughputByModel.clear();
  lastMeasuredModel = null;
}

export {
  recordTimings,
  getLearnedTokensPerSecond,
  getThroughputRecord,
  getMostRecentThroughput,
  clearThroughput,
  EMA_ALPHA,
  MIN_PREDICTED_TOKENS
};
