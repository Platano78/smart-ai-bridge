/**
 * @fileoverview Live backend capacity discovery — asks each provider's own
 * model catalog what its real input/output token limits are, instead of
 * trusting a hardcoded per-backend table. Providers report unequal amounts
 * (Groq gives both context_window and max_completion_tokens per model;
 * Gemini's catalog gives inputTokenLimit/outputTokenLimit; NVIDIA NIM's
 * catalog carries no capacity fields at all) — a provider reporting nothing
 * is a NORMAL outcome here, not a failure.
 *
 * This module never throws and never blocks a caller: any fetch error,
 * timeout, malformed response, or missing capability resolves to `null` so
 * the caller can fall back to its own next resolution step (a configured
 * context_limit, then a static default). Results are cached per backend
 * with a TTL, and concurrent lookups for the same backend are coalesced
 * into a single in-flight request — the same idiom backend-registry.js
 * already uses for its health-check sweep.
 */
import { PROVIDER_ENDPOINTS, PROVIDER_CATALOGS } from './provider-endpoints.js';

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes — provider catalogs change rarely
const FETCH_TIMEOUT_MS = 5000;

/** @type {Map<string, {result: {inputTokens: number, outputTokens: number|null}|null, time: number}>} */
const _cache = new Map();
/** @type {Map<string, Promise<{inputTokens: number, outputTokens: number|null}|null>>} */
const _inflight = new Map();

function cacheKey(backend) {
  return `${backend.name}:${backend.type}:${backend.config?.model || ''}`;
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * OpenAI-compatible providers (NVIDIA NIM, Groq, OpenAI): GET .../models,
 * find the configured model by id, read context_window/max_completion_tokens
 * when present. Absent fields (OpenAI's own catalog, NIM's) fall through to
 * null rather than being treated as zero.
 *
 * Prefers the operator's configured `config.url` (the adapters already honor
 * it — see groq-adapter.js/openai-adapter.js's `config.url || <default>`)
 * over the public PROVIDER_ENDPOINTS default, so discovery always queries
 * the same host the request will actually go to (a proxy, a gateway, a
 * self-hosted OpenAI-compatible endpoint).
 */
async function discoverOpenAICompatible(backend, apiKey) {
  const endpoint = backend.config?.url || PROVIDER_ENDPOINTS[backend.type]?.endpoint;
  const catalog = PROVIDER_CATALOGS.openaiCompatible;
  const catalogUrl = catalog.catalogUrl(endpoint);
  if (!catalogUrl) return null;

  const res = await fetchWithTimeout(catalogUrl, { headers: catalog.authHeader(apiKey) });
  if (!res.ok) return null;

  const json = await res.json();
  const model = backend.config?.model;
  const entry = catalog.entries(json).find(e => e.id === model)?.raw;
  if (!entry || typeof entry.context_window !== 'number') return null;

  return {
    inputTokens: entry.context_window,
    outputTokens: typeof entry.max_completion_tokens === 'number' ? entry.max_completion_tokens : null
  };
}

/**
 * Gemini's fixed catalog: GET v1beta/models with an x-goog-api-key header.
 * Model ids come back prefixed "models/"; read inputTokenLimit/outputTokenLimit.
 *
 * KNOWN LIMITATION — this URL is fixed, and deliberately so. Unlike the
 * OpenAI-compatible path above, a Gemini `config.url` cannot be rewritten into a
 * catalog URL reliably: the model id is embedded in the PATH
 * (`.../v1beta/models/<model>:generateContent`), so it is not a base URL that a
 * suffix swap can turn into a listing. Deriving one would mean guessing where the
 * operator's path ends. An operator pointing Gemini at a proxy therefore gets
 * CONFIGURED/DEFAULT capacity rather than discovered — a documented degradation,
 * which is the correct trade against silently querying the wrong host.
 */
async function discoverGemini(backend, apiKey) {
  const catalog = PROVIDER_CATALOGS.gemini;
  const res = await fetchWithTimeout(catalog.catalogUrl(), { headers: catalog.authHeader(apiKey) });
  if (!res.ok) return null;

  const json = await res.json();
  const model = backend.config?.model;
  const wanted = typeof model === 'string' ? model.replace(/^models\//, '') : model;
  const entry = catalog.entries(json).find(e => e.id === wanted)?.raw;
  if (!entry || typeof entry.inputTokenLimit !== 'number') return null;

  return {
    inputTokens: entry.inputTokenLimit,
    outputTokens: typeof entry.outputTokenLimit === 'number' ? entry.outputTokenLimit : null
  };
}

const DISCOVERERS = {
  nvidia_deepseek: discoverOpenAICompatible,
  nvidia_glm: discoverOpenAICompatible,
  nvidia_qwen: discoverOpenAICompatible,
  groq: discoverOpenAICompatible,
  openai: discoverOpenAICompatible,
  gemini: discoverGemini
};

/**
 * Discover a backend's real input/output token limits from its provider's
 * own catalog. Returns `null` (never throws) when the backend type has no
 * discoverer, the provider reports nothing usable, or the request
 * fails/times out.
 * @param {{name: string, type: string, config?: {model?: string}}} backend
 * @param {string|null|undefined} apiKey - resolved key; discovery is skipped without one
 * @returns {Promise<{inputTokens: number, outputTokens: number|null}|null>}
 */
export async function discoverCapacity(backend, apiKey) {
  if (!backend || !apiKey) return null;

  const discoverer = DISCOVERERS[backend.type];
  if (!discoverer) return null;

  const key = cacheKey(backend);
  const cached = _cache.get(key);
  if (cached && (Date.now() - cached.time) < CACHE_TTL_MS) {
    return cached.result;
  }

  if (_inflight.has(key)) {
    return _inflight.get(key);
  }

  const promise = (async () => {
    let result;
    try {
      result = await discoverer(backend, apiKey);
    } catch {
      result = null;
    }
    _cache.set(key, { result, time: Date.now() });
    return result;
  })();

  _inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    _inflight.delete(key);
  }
}

/**
 * Test-only escape hatch: clears the module-level cache/in-flight maps so
 * tests don't leak state into each other across cases.
 */
export function _resetCapacityDiscoveryCache() {
  _cache.clear();
  _inflight.clear();
}
