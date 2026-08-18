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

/** @type {Map<string, {result: {id: string, inputTokens: number, outputTokens: number|null}|null, time: number}>} */
const _selectCache = new Map();
/** @type {Map<string, Promise<{id: string, inputTokens: number, outputTokens: number|null}|null>>} */
const _selectInflight = new Map();

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
 * List every catalog entry that carries a usable input-capacity field, for
 * providers whose catalog is OpenAI-compatible (`context_window`). Entries
 * with no numeric `context_window` are dropped rather than defaulted — an
 * absent field cannot be ranked honestly against providers that do report it.
 */
async function listOpenAICompatibleCapacities(backend, apiKey) {
  const endpoint = backend.config?.url || PROVIDER_ENDPOINTS[backend.type]?.endpoint;
  const catalog = PROVIDER_CATALOGS.openaiCompatible;
  const catalogUrl = catalog.catalogUrl(endpoint);
  if (!catalogUrl) return [];

  const res = await fetchWithTimeout(catalogUrl, { headers: catalog.authHeader(apiKey) });
  if (!res.ok) return [];

  const json = await res.json();
  return catalog.entries(json)
    .filter(e => typeof e.raw.context_window === 'number')
    .map(e => ({
      id: e.id,
      inputTokens: e.raw.context_window,
      outputTokens: typeof e.raw.max_completion_tokens === 'number' ? e.raw.max_completion_tokens : null
    }));
}

/** Same idea as {@link listOpenAICompatibleCapacities}, for Gemini's `inputTokenLimit` field. */
async function listGeminiCapacities(backend, apiKey) {
  const catalog = PROVIDER_CATALOGS.gemini;
  const res = await fetchWithTimeout(catalog.catalogUrl(), { headers: catalog.authHeader(apiKey) });
  if (!res.ok) return [];

  const json = await res.json();
  return catalog.entries(json)
    .filter(e => typeof e.raw.inputTokenLimit === 'number')
    .map(e => ({
      id: e.id,
      inputTokens: e.raw.inputTokenLimit,
      outputTokens: typeof e.raw.outputTokenLimit === 'number' ? e.raw.outputTokenLimit : null
    }));
}

const CATALOG_LISTERS = {
  nvidia_deepseek: listOpenAICompatibleCapacities,
  nvidia_glm: listOpenAICompatibleCapacities,
  nvidia_qwen: listOpenAICompatibleCapacities,
  groq: listOpenAICompatibleCapacities,
  openai: listOpenAICompatibleCapacities,
  gemini: listGeminiCapacities
};

function selectCacheKey(backend) {
  return `${backend.name}:${backend.type}:${backend.config?.url || ''}`;
}

/**
 * Auto-select a model for a backend that ships with no `config.model`, by
 * choosing the provider catalog entry with the largest published input
 * capacity. Ties break on published output capacity, then on the provider's
 * own catalog order — never on the model id's spelling — so the choice is
 * stable across boots and reproducible in tests.
 *
 * An explicit `config.model` always wins — this function is only for the
 * unconfigured case, and returns `null` immediately if one is set. Providers
 * that publish no capacity field for any model (NVIDIA NIM today) cannot be
 * ranked honestly, so this returns `null` rather than guessing — the lane
 * stays unconfigured (see readiness-audit.js for the actionable finding).
 *
 * Never throws; cached with the same TTL/coalescing idiom as
 * {@link discoverCapacity}.
 * @param {{name: string, type: string, config?: {model?: string, url?: string}}} backend
 * @param {string|null|undefined} apiKey
 * @returns {Promise<{id: string, inputTokens: number, outputTokens: number|null}|null>}
 */
export async function selectModel(backend, apiKey) {
  if (!backend || !apiKey || backend.config?.model) return null;

  const lister = CATALOG_LISTERS[backend.type];
  if (!lister) return null;

  const key = selectCacheKey(backend);
  const cached = _selectCache.get(key);
  if (cached && (Date.now() - cached.time) < CACHE_TTL_MS) {
    return cached.result;
  }

  if (_selectInflight.has(key)) {
    return _selectInflight.get(key);
  }

  const promise = (async () => {
    let result = null;
    try {
      const candidates = await lister(backend, apiKey);
      if (candidates.length > 0) {
        // Rank on PROVIDER-PUBLISHED data only — never on the model id's
        // spelling. Substring heuristics (`preview`, `lite`, version numbers)
        // are the hardcoding this module exists to remove, and provider naming
        // conventions change without notice.
        //   1. inputTokens  DESC  - the most context wins
        //   2. outputTokens DESC  - among equals, the one that can answer most
        //   3. catalog order      - the provider's own ordering decides the rest
        // Step 3 falls out of a strict `>` comparison: an equal candidate never
        // displaces the earlier one, so the first-listed survives. 17 Gemini
        // models tie on step 1 alone, so steps 2 and 3 do the real work.
        result = candidates.reduce((best, cur) => {
          if (cur.inputTokens !== best.inputTokens) {
            return cur.inputTokens > best.inputTokens ? cur : best;
          }
          const curOut = cur.outputTokens ?? -1;
          const bestOut = best.outputTokens ?? -1;
          if (curOut !== bestOut) return curOut > bestOut ? cur : best;
          return best;
        });
      }
    } catch {
      result = null;
    }
    _selectCache.set(key, { result, time: Date.now() });
    return result;
  })();

  _selectInflight.set(key, promise);
  try {
    return await promise;
  } finally {
    _selectInflight.delete(key);
  }
}

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
  _selectCache.clear();
  _selectInflight.clear();
}
