/**
 * @fileoverview BackendRegistry - Config-driven backend management
 * @module backends/backend-registry
 *
 * Central registry for all AI backends with:
 * - Config-driven registration
 * - Dynamic adapter loading
 * - Hot-reload capability
 * - Fallback chain management
 *
 * Smart AI Bridge v2.0.0
 */

import { LocalAdapter } from './local-adapter.js';
import { NvidiaDeepSeekAdapter, NvidiaGlmAdapter } from './nvidia-adapter.js';
import { GeminiAdapter } from './gemini-adapter.js';
import { OpenAIAdapter } from './openai-adapter.js';
import { GroqAdapter } from './groq-adapter.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getSecret } from './secret-store.js';
import { PROVIDER_ENDPOINTS, resolveBackendKey } from './provider-endpoints.js';
import { selectModel } from './capacity-discovery.js';

// Get directory of current module for resolving config paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Config file paths - backends.json is the SINGLE SOURCE OF TRUTH
const BACKENDS_CONFIG_PATH = join(__dirname, '../config/backends.json');
const CUSTOM_BACKENDS_PATH = join(__dirname, '../../data/backends-custom.json');

/**
 * Map friendly backend names to internal identifiers.
 *
 * Every provider gets a short name; `openai` lacking one was the
 * inconsistency, not the presence of the others. The full identifier keeps
 * working either way — callers resolve through `FRIENDLY_NAME_MAP[x] || x`,
 * so `openai_chatgpt` falls through to itself.
 */
const FRIENDLY_NAME_MAP = {
  local: 'local',
  deepseek: 'nvidia_deepseek',
  gemini: 'gemini',
  groq: 'groq_llama',
  glm: 'nvidia_glm',
  openai: 'openai_chatgpt'
};

/**
 * Adapter class mapping by type
 */
const ADAPTER_CLASSES = {
  'local': LocalAdapter,
  'nvidia_deepseek': NvidiaDeepSeekAdapter,
  'nvidia_glm': NvidiaGlmAdapter,
  'gemini': GeminiAdapter,
  'openai': OpenAIAdapter,
  'groq': GroqAdapter
};

// Retired backend types must not be offered as creatable (e.g. the dashboard's
// add-backend picker). getAvailableTypes() filters these out. Empty today: the
// `nvidia_qwen` lane was removed outright once NVIDIA's catalog dropped every Qwen
// model, rather than being kept as a redirect to a differently-named lane.
const DEPRECATED_TYPES = new Set([]);

/**
 * Load backends from the main config file (single source of truth)
 * @returns {Object} Backend configurations
 */
function loadBackendsFromConfig() {
  try {
    if (existsSync(BACKENDS_CONFIG_PATH)) {
      const data = readFileSync(BACKENDS_CONFIG_PATH, 'utf-8');
      const config = JSON.parse(data);
      return config.backends || {};
    }
  } catch (error) {
    console.error(`[BackendRegistry] Error loading backends.json: ${error.message}`);
  }

  // Fallback to minimal config if file doesn't exist
  console.error('[BackendRegistry] backends.json not found, using minimal fallback');
  return {
    local: {
      type: 'local',
      enabled: true,
      priority: 1,
      description: 'Local model via router (autodiscovery)',
      config: {}
    }
  };
}

/**
 * Resolve API key from environment variable if needed
 * @param {string} apiKey - API key value or environment variable reference
 * @returns {string|undefined} - Resolved API key value
 */
function resolveApiKey(apiKey) {
  if (!apiKey) return undefined;

  if (apiKey.startsWith('$')) {
    const varName = apiKey.substring(1);
    const resolved = process.env[varName];

    if (!resolved) {
      console.warn(`[BackendRegistry] Environment variable ${varName} not set — backend will be disabled`);
      return undefined;
    }

    return resolved;
  }

  return apiKey;
}

class BackendRegistry {
  /**
   * Create a BackendRegistry
   * @param {Object} [config] - Registry configuration
   */
  constructor(config = {}) {
    /** @type {Map<string, Object>} */
    this.backends = new Map();

    /** @type {Map<string, Object>} */
    this.adapters = new Map();

    /** @type {Object} */
    this.config = {
      autoInitialize: true,
      ...config
    };

    /** @type {string[]} */
    this.fallbackChain = [];

    /** @type {Object<string, Function>} Handler-specific routing overrides */
    this.routingOverrides = {};

    this._healthCache = null;
    this._healthCacheTime = 0;
    /** @type {Promise|null} The in-flight sweep, if one is currently running */
    this._healthSweepPromise = null;

    if (this.config.autoInitialize) {
      this.initializeDefaults();
    }
  }

  /**
   * Initialize backends from config file (single source of truth)
   * @private
   */
  initializeDefaults() {
    const backendsConfig = loadBackendsFromConfig();
    const customRaw = this._readCustomBackendsFile();

    for (const [name, backendConfig] of Object.entries(backendsConfig)) {
      // A name with a custom override gets registered WITHOUT an adapter here
      // — loadCustomBackends() immediately re-registers it with the merged
      // config and builds the one real adapter. Registering (and enabling)
      // it fully here first, then again after the merge, would construct two
      // adapters for one backend; for LocalAdapter that means two background
      // autodiscovery port-scans per boot instead of one. `enabled` is left
      // as the base config's own truth (not peeked/overridden) because
      // loadCustomBackends()'s merge reads `existing.enabled` when the
      // override itself omits `enabled`.
      const hasOverride = Boolean(customRaw.backends?.[name]);
      this.register(name, backendConfig, { skipAdapter: hasOverride });
    }

    // Load custom backends from disk (these override/extend main config)
    this.loadCustomBackends(customRaw);

    console.error(`[BackendRegistry] Initialized ${this.backends.size} backends from backends.json`);
  }

  /**
   * Read and parse data/backends-custom.json, or {} if absent/invalid.
   * @private
   */
  _readCustomBackendsFile() {
    try {
      if (existsSync(CUSTOM_BACKENDS_PATH)) {
        const parsed = JSON.parse(readFileSync(CUSTOM_BACKENDS_PATH, 'utf-8'));
        // JSON.parse succeeds on any valid JSON value, not just objects — `null`,
        // a bare number/string, or an array all parse without throwing. Only a
        // plain object has a meaningful `.backends`; anything else must fall
        // through to the same {} every other invalid-file case already returns,
        // so callers (initializeDefaults()'s `customRaw.backends?.[name]`) never
        // have to guard against a non-object here.
        return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
      }
    } catch (error) {
      console.error(`[BackendRegistry] Error loading custom backends: ${error.message}`);
    }
    return {};
  }

  /**
   * Load custom backends from disk
   * @param {Object} [preloaded] - Already-parsed custom config, reused from
   *   initializeDefaults() to avoid a second file read; read fresh if omitted.
   */
  loadCustomBackends(preloaded) {
    const custom = preloaded ?? this._readCustomBackendsFile();
    for (const [name, backendConfig] of Object.entries(custom.backends || {})) {
      // Per-entry try/catch, not one around the whole loop: initializeDefaults()
      // now defers adapter creation (skipAdapter) for every overridden name, so a
      // throw partway through this loop used to strand not just the remaining
      // custom entries but the built-ins that were deliberately left adapter-less
      // waiting for this merge — one malformed hand-edited entry could zero out
      // every adapter. Containment only: skip the bad entry, name it, keep going.
      try {
        if (this.backends.has(name)) {
          // Overriding an existing (built-in) backend keeps built-in identity —
          // per R2, only a name genuinely new to backends.json counts as custom.
          const existing = this.backends.get(name);
          // Merge through register() rather than Object.assign(): that gave
          // custom overrides no adapter rebuild, no fallback-chain update, and
          // no adapter teardown on disable (a "disabled" custom entry left the
          // enabled built-in's adapter live and reachable — the ghost-adapter
          // bug). Rebuild the pre-resolution config from rawApiKey (never the
          // resolved key — merging a resolved key would poison rawApiKey and
          // break getKeyStatus()/saveConfig()'s key-stripping), then let the
          // override win per top-level key and shallow-merge `config` so an
          // override supplying only e.g. config.url keeps the rest.
          const existingRawConfig = { ...existing.config, apiKey: existing.rawApiKey };
          const merged = {
            ...existing,
            ...backendConfig,
            config: { ...existingRawConfig, ...(backendConfig.config || {}) }
          };
          this.register(name, merged);
          if (!merged.enabled) this.adapters.delete(name);
          console.error(`[BackendRegistry] Updated backend from custom config: ${name}`);
        } else {
          // A name not present in backends.json is a genuinely new custom seat —
          // isCustom marks it so updateFallbackChain() can break priority ties
          // in its favor (R2: an operator's new seat outranks a stock lane).
          this.register(name, backendConfig, { isCustom: true });
          if (!backendConfig.enabled) this.adapters.delete(name);
          console.error(`[BackendRegistry] Loaded custom backend: ${name}`);
        }
      } catch (error) {
        console.error(`[BackendRegistry] Skipped custom backend "${name}": ${error.message}`);
      }
    }
  }

  /**
   * Save current backends to the main config file (single source of truth)
   */
  saveConfig(targetPath = BACKENDS_CONFIG_PATH) {
    try {
      let existingConfig = { version: "2.0.0", description: "Smart AI Bridge Backend Configuration" };
      try {
        if (existsSync(targetPath)) {
          existingConfig = JSON.parse(readFileSync(targetPath, 'utf-8'));
        }
      } catch (e) {
        console.error(`[BackendRegistry] Error reading existing config: ${e.message}`);
      }

      const backends = {};
      for (const [name, backend] of this.backends) {
        // S1 fix: apiKey NEVER goes into this file — it is git-tracked. This
        // applies unconditionally, whether the key is a resolved secret-store
        // value or a plain `$VAR` reference; there is no case where key
        // material belongs here. A key supplied inline goes to the secrets
        // store instead (see secret-store.js / register()).
        const { apiKey: _apiKey, ...configWithoutKey } = backend.config || {};
        backends[name] = {
          type: backend.type,
          enabled: backend.enabled,
          priority: backend.priority,
          description: backend.description,
          ...(backend.capabilities && { capabilities: backend.capabilities }),
          ...(backend.context_limit && { context_limit: backend.context_limit }),
          ...(backend.strengths && { strengths: backend.strengths }),
          ...(backend.excludeFromSubagent && { excludeFromSubagent: backend.excludeFromSubagent }),
          ...(backend.ports && { ports: backend.ports }),
          config: configWithoutKey
        };
      }

      existingConfig.backends = backends;

      const dir = dirname(targetPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(
        targetPath,
        JSON.stringify(existingConfig, null, 2),
        'utf-8'
      );

      console.error(`[BackendRegistry] Saved ${Object.keys(backends).length} backends to backends.json`);
      return true;
    } catch (error) {
      console.error(`[BackendRegistry] Error saving config: ${error.message}`);
      return false;
    }
  }

  /**
   * Register a backend
   * @param {string} name - Backend name
   * @param {Object} backendConfig - Backend configuration
   * @param {Object} [options] - Registration options
   * @param {boolean} [options.skipAdapter=false] - Record the backend without
   *   constructing its adapter. Used by initializeDefaults() for a built-in
   *   that a custom override will immediately re-register: without this, a
   *   still-enabled backend gets its adapter constructed twice (once here,
   *   once when loadCustomBackends() re-registers the merge), which for
   *   LocalAdapter means a second background autodiscovery port-scan per
   *   boot — the standing "never wake a router twice" ruling.
   * @param {boolean} [options.isCustom=false] - This backend's name was not
   *   present in backends.json — it's a genuinely new custom seat, not an
   *   override of a built-in. updateFallbackChain() uses this to break
   *   priority ties in the custom seat's favor (F7b).
   */
  register(name, backendConfig, { skipAdapter = false, isCustom = false } = {}) {
    const { type, enabled = true, priority = 99, config = {} } = backendConfig;

    // rawApiKey preserves the literal/`$VAR` value as configured (never the
    // resolved secret) so key-status reporting and saveConfig() can tell
    // "user set an explicit config.apiKey" apart from "resolved from the
    // secrets store" without re-deriving it from a resolved value.
    const rawApiKey = config.apiKey;
    const resolvedConfig = { ...config };
    resolvedConfig.apiKey = this._resolveEffectiveApiKey({ name, rawApiKey });

    this.backends.set(name, {
      name,
      type,
      enabled,
      priority,
      isCustom,
      config: resolvedConfig,
      rawApiKey,
      description: backendConfig.description || `Backend: ${name}`,
      ...(backendConfig.capabilities && { capabilities: backendConfig.capabilities }),
      ...(backendConfig.context_limit && { context_limit: backendConfig.context_limit }),
      ...(backendConfig.strengths && { strengths: backendConfig.strengths }),
      ...(backendConfig.excludeFromSubagent && { excludeFromSubagent: backendConfig.excludeFromSubagent }),
      ...(backendConfig.ports && { ports: backendConfig.ports })
    });

    if (enabled && !skipAdapter) {
      this.createAdapter(name);
    }

    this.updateFallbackChain();
  }

  /**
   * Create adapter instance for backend
   * @private
   */
  createAdapter(name) {
    const backend = this.backends.get(name);
    if (!backend) return null;

    const AdapterClass = ADAPTER_CLASSES[backend.type];
    if (!AdapterClass) {
      console.error(`[BackendRegistry] Unknown adapter type: ${backend.type}`);
      return null;
    }

    try {
      const adapter = new AdapterClass(backend.config);
      this.adapters.set(name, adapter);
      return adapter;
    } catch (error) {
      console.error(`[BackendRegistry] Failed to create adapter ${name}:`, error.message);
      return null;
    }
  }

  /**
   * Resolve the API key that should actually reach the adapter, in priority
   * order (highest first):
   *   1. config.apiKey — literal or `$VAR` reference (existing behavior)
   *   2. the secrets store, looked up by backend name
   *   3. undefined — leaves apiKey unset so the adapter's own
   *      process.env.<PROVIDER>_API_KEY fallback applies
   * A stored key beats the env fallback deliberately: it is the more recent,
   * more explicit user action.
   * @private
   */
  _resolveEffectiveApiKey({ name, rawApiKey }) {
    if (rawApiKey) {
      const resolved = resolveApiKey(rawApiKey);
      if (resolved) return resolved;
    }
    return getSecret(name) || undefined;
  }

  /**
   * Report where a backend's active API key is coming from, without ever
   * returning the key itself. Computed here (not in getStats(), which is
   * shared with the MCP tool surface) so dashboard callers can decorate rows
   * and answer GET/PUT/DELETE .../key without duplicating resolution logic.
   * @param {string} name - Backend name
   * @returns {{configured: boolean, source: 'config'|'store'|'env'|'none', last4: string|null, envVar: string|null}|null}
   */
  getKeyStatus(name) {
    const backend = this.getBackend(name);
    if (!backend) return null;

    const envVar = PROVIDER_ENDPOINTS[backend.type]?.envVar ?? null;

    const fromConfig = backend.rawApiKey ? resolveApiKey(backend.rawApiKey) : undefined;
    if (fromConfig) {
      return { configured: true, source: 'config', last4: fromConfig.slice(-4), envVar };
    }

    const stored = getSecret(backend.name);
    if (stored) {
      return { configured: true, source: 'store', last4: stored.slice(-4), envVar };
    }

    const fromEnv = envVar ? process.env[envVar] : undefined;
    if (fromEnv) {
      return { configured: true, source: 'env', last4: fromEnv.slice(-4), envVar };
    }

    return { configured: false, source: 'none', last4: null, envVar };
  }

  /**
   * Re-resolve a backend's effective API key (config -> store -> env
   * fallback) and rebuild its adapter so a secrets-store change takes effect
   * without a server restart.
   * @param {string} name - Backend name
   * @returns {boolean} whether the backend exists
   */
  rebuildAdapter(name) {
    // Alias-tolerant: getBackend() resolves friendly names (e.g. `glm` ->
    // `nvidia_glm`) via FRIENDLY_NAME_MAP; the raw this.backends map is keyed
    // by the canonical name only. Resolving here means callers can't reintroduce
    // the alias/raw-lookup mismatch that silently rebuilt the wrong (or no)
    // adapter.
    const backend = this.getBackend(name);
    if (!backend) return false;
    const canonicalName = backend.name;

    backend.config = {
      ...backend.config,
      apiKey: this._resolveEffectiveApiKey({ name: canonicalName, rawApiKey: backend.rawApiKey })
    };

    if (backend.enabled) {
      this.adapters.delete(canonicalName);
      this.createAdapter(canonicalName);
    }

    return true;
  }

  /**
   * Update fallback chain based on priorities
   * @private
   */
  updateFallbackChain() {
    // Sort ascending by priority; on a tie, a custom seat (isCustom) sorts
    // before a built-in — R2: an operator's new lane outranks a stock lane
    // at equal priority, so a hand-edited backends-custom.json reusing
    // priorities 2-6 doesn't silently lose to the built-in it collided with.
    const enabled = Array.from(this.backends.values())
      .filter(b => b.enabled)
      .sort((a, b) => a.priority - b.priority || (b.isCustom === true) - (a.isCustom === true));

    this.fallbackChain = enabled.map(b => b.name);
  }

  /**
   * Get adapter by name
   * @param {string} name - Backend name
   * @returns {Object|null}
   */
  getAdapter(name) {
    return this.adapters.get(name)
      || this.adapters.get(FRIENDLY_NAME_MAP[name])
      || null;
  }

  /**
   * Get backend configuration
   * @param {string} name - Backend name
   * @returns {Object|null}
   */
  getBackend(name) {
    return this.backends.get(name)
      || this.backends.get(FRIENDLY_NAME_MAP[name])
      || null;
  }

  /**
   * Get all enabled backend names
   * @returns {string[]}
   */
  getEnabledBackends() {
    return Array.from(this.backends.values())
      .filter(b => b.enabled)
      .map(b => b.name);
  }

  /**
   * Enabled backends that are also actually reachable: either a backend
   * type that needs no key (local, or any type whose PROVIDER_ENDPOINTS
   * envVar is null) or one with a resolvable API key per getKeyStatus().
   * Key presence only — never probes a provider — so this stays synchronous
   * and cheap. Distinct from getEnabledBackends(), whose meaning (and the
   * stats count that depends on it) is unchanged by this method.
   * @returns {string[]}
   */
  getUsableBackends() {
    return Array.from(this.backends.values())
      .filter(b => b.enabled)
      .filter(b => {
        const envVar = PROVIDER_ENDPOINTS[b.type]?.envVar ?? null;
        if (!envVar) return true;
        return this.getKeyStatus(b.name)?.configured === true;
      })
      .map(b => b.name);
  }

  /**
   * Get fallback chain
   * @returns {string[]}
   */
  getFallbackChain() {
    return [...this.fallbackChain];
  }

  /**
   * Get total number of registered backends
   * @returns {number}
   */
  getBackendCount() {
    return this.backends.size;
  }

  /**
   * For every enabled, non-local backend with no `config.model`, ask its
   * provider's catalog for one (largest published input capacity — see
   * capacity-discovery.js#selectModel) and apply it to both the stored
   * backend config and the live adapter, so the very first real request
   * targets a live model instead of an adapter's hardcoded fallback literal.
   *
   * An explicit `config.model` always wins and is never queried. A backend
   * with no resolvable API key is skipped — it can't reach a catalog, and
   * the readiness audit already reports it as `unknown`. Never throws:
   * failures leave the backend unconfigured, which downstream (adapter
   * construction, the readiness audit) already handles.
   * @returns {Promise<void>}
   */
  async discoverModels() {
    const tasks = [];
    for (const [name, backend] of this.backends) {
      if (!backend.enabled || backend.type === 'local' || backend.config?.model) continue;

      const envVar = PROVIDER_ENDPOINTS[backend.type]?.envVar ?? null;
      const apiKey = resolveBackendKey(backend.config, envVar);
      if (!apiKey) continue;

      tasks.push((async () => {
        const selected = await selectModel({ name, type: backend.type, config: backend.config }, apiKey);
        if (!selected) return;
        backend.config.model = selected.id;
        const adapter = this.adapters.get(name);
        if (adapter) adapter.setModel(selected.id);
        console.error(
          `[BackendRegistry] Auto-selected model for "${name}": ${selected.id} ` +
          `(input capacity ${selected.inputTokens})`
        );
      })());
    }
    await Promise.allSettled(tasks);
  }

  /**
   * Get all backends as name->config object
   * @returns {Object}
   */
  getAllBackends() {
    return Object.fromEntries(this.backends.entries());
  }

  /**
   * Enable/disable backend
   * @param {string} name - Backend name
   * @param {boolean} enabled - Enable state
   */
  setEnabled(name, enabled) {
    const backend = this.backends.get(name);
    if (!backend) return;

    backend.enabled = enabled;

    if (enabled && !this.adapters.has(name)) {
      this.createAdapter(name);
    } else if (!enabled && this.adapters.has(name)) {
      this.adapters.delete(name);
    }

    this.updateFallbackChain();
  }

  /**
   * Update backend priority
   * @param {string} name - Backend name
   * @param {number} priority - New priority
   */
  setPriority(name, priority) {
    const backend = this.backends.get(name);
    if (!backend) return;

    backend.priority = priority;
    this.updateFallbackChain();
  }

  /**
   * Get next available backend in fallback chain
   * @param {string[]} [exclude=[]] - Backends to exclude
   * @returns {string|null}
   */
  getNextAvailable(exclude = []) {
    for (const name of this.fallbackChain) {
      if (!exclude.includes(name)) {
        const adapter = this.adapters.get(name);
        if (adapter && !adapter.circuitOpen) {
          return name;
        }
      }
    }
    return null;
  }

  /**
   * Make request with automatic fallback
   * @param {string} prompt - Prompt to send
   * @param {string} [preferredBackend] - Preferred backend
   * @param {Object} [options] - Request options
   * @returns {Promise<Object>}
   */
  async makeRequestWithFallback(prompt, preferredBackend = null, options = {}) {
    const attempted = [];
    let lastError = null;
    // A backend the CALLER NAMED gets exactly one attempt (options.noFallback).
    // The API keys are the operator's own, so cascading off a named lane can
    // spend their credit on lanes they never asked for. Only RESOLVED
    // backends — 'auto', a routing override, the content-length branch —
    // cascade; see BackendRegistry#selectBackend's `explicit` flag.
    const noFallback = options.noFallback === true && Boolean(preferredBackend);

    if (preferredBackend) {
      const adapter = this.adapters.get(preferredBackend);
      if (adapter && !adapter.circuitOpen) {
        try {
          const result = await adapter.execute(prompt, options);
          return {
            ...result,
            fallbackChain: attempted,
            backend: preferredBackend
          };
        } catch (error) {
          lastError = error;
          attempted.push(preferredBackend);
          if (noFallback) {
            throw new Error(
              `Backend "${preferredBackend}" was named by the caller and its one attempt failed; ` +
              `no other backend was tried. Underlying error: ${error.message}. ` +
              `Next step: fix or retry that lane, or re-run with backend "auto" to allow the ` +
              `other configured lanes.`
            );
          }
        }
      } else if (noFallback) {
        throw new Error(
          `Backend "${preferredBackend}" was named by the caller but could not be attempted at all — ` +
          `it is not registered, or its circuit breaker is open. No request was made and no other ` +
          `backend was tried. Next step: configure or recover that lane, or re-run with backend ` +
          `"auto" to allow the other configured lanes.`
        );
      }
    }

    // Keyless cloud lanes (no resolvable API key) are excluded from the
    // cascade itself — R1: they can never succeed, so letting them sit in
    // the fallback chain just burns one failed attempt each before a usable
    // seat is reached. This is scoped to the loop only; the preferredBackend
    // attempt above keeps its existing one-honest-attempt behavior. A chain
    // entry absent from this.backends carries no key-status evidence at all —
    // the goal is to skip lanes we KNOW cannot work, not lanes we know
    // nothing about, so it is left alone (usable) rather than assumed
    // keyless. In production every chain entry comes from register() and is
    // therefore always present in this.backends, so this is behaviourally
    // identical to a plain fallbackChain ∩ usable intersection; the
    // distinction only matters for a registry state built by hand (e.g.
    // tests) that never arises via normal registration.
    const usable = new Set(this.getUsableBackends());
    const cascadeChain = this.fallbackChain.filter(
      name => !this.backends.has(name) || usable.has(name)
    );
    // Discount names the preferredBackend block already tried — a chain that
    // still lists the failed lane is not actually anything left to fall back
    // to, so the emptiness check below must look at what remains untried.
    const remaining = cascadeChain.filter(name => !attempted.includes(name));

    if (remaining.length === 0) {
      // A prior attempt (the preferredBackend block above) already failed
      // and used up `lastError` — surface that underlying cause rather than
      // discarding it behind a generic "nothing configured" message, which
      // would make a routine misconfiguration much harder to diagnose.
      if (attempted.length > 0) {
        const failedName = attempted[attempted.length - 1];
        throw new Error(
          `Backend "${failedName}" failed and no other usable backend is configured to fall back to. ` +
          `Underlying error: ${lastError?.message}. ` +
          `Next step: configure another usable backend, or fix/retry "${failedName}".`
        );
      }
      throw new Error('No usable backend is configured');
    }

    for (const name of cascadeChain) {
      if (attempted.includes(name)) continue;

      const adapter = this.adapters.get(name);
      if (!adapter || adapter.circuitOpen) continue;

      try {
        const result = await adapter.execute(prompt, options);
        return {
          ...result,
          fallbackChain: attempted,
          backend: name
        };
      } catch (error) {
        lastError = error;
        attempted.push(name);
      }
    }

    throw new Error(`All backends failed. Last error: ${lastError?.message}`);
  }

  /**
   * Check health of all backends
   * @param {boolean} [force=false] - Bypass the 10s TTL cache and force a fresh sweep
   * @returns {Promise<Object>} Shared cached result — callers must treat it as read-only
   */
  async checkHealth(force = false) {
    // 10s TTL promise cache: dedupes concurrent sweeps (council/subagent fire several
    // availability checks at once) and collapses repeat sweeps, while staying far under
    // model-swap time so local-adapter's modelId rediscovery (a checkHealth side effect)
    // stays fresh. Caching the in-flight promise (not the result) is what prevents the
    // concurrent-caller thundering herd.
    const CACHE_TTL_MS = 10000;

    // Always join an in-flight sweep, regardless of TTL. Without this, a sweep that
    // takes longer than the TTL to resolve is "expired" the instant it completes, so
    // no sequential caller made during the sweep ever gets a cache hit — each one
    // starts its own full re-probe instead of joining the one already running.
    if (!force && this._healthSweepPromise) {
      return this._healthSweepPromise;
    }

    if (!force && this._healthCache && (Date.now() - this._healthCacheTime) < CACHE_TTL_MS) {
      return this._healthCache;
    }

    const sweep = (async () => {
      const entries = await Promise.all(
        Array.from(this.adapters, async ([name, adapter]) => {
          try {
            return [name, await adapter.checkHealth()];
          } catch (error) {
            return [name, { healthy: false, error: error.message }];
          }
        })
      );
      return Object.fromEntries(entries);
    })();

    this._healthSweepPromise = sweep;

    try {
      const result = await sweep;
      // Stamp the TTL from completion, not from start — measuring from start let a
      // sweep slower than the TTL expire the instant it resolved, starving every
      // sequential caller of a cache hit. Store the resolved value (not the promise)
      // so the TTL-hit path above returns the same plain object shape as this path.
      this._healthCache = result;
      this._healthCacheTime = Date.now();
      return result;
    } catch (error) {
      // A failed sweep must not poison the cache forever: clear it so the next call
      // retries cleanly instead of serving (or perpetually re-rejecting with) a dead
      // promise. In practice each adapter's checkHealth() is already try/caught above,
      // so this only fires on a genuinely unexpected failure (e.g. Promise.all itself
      // throwing), but it's the correct behavior either way.
      this._healthCache = null;
      this._healthCacheTime = 0;
      throw error;
    } finally {
      this._healthSweepPromise = null;
    }
  }

  /**
   * Snapshot of the LIVE registry in the shape auditReadiness() expects,
   * replacing the boot-time backends.json read at server.js's audit call
   * site. Custom-config merges (loadCustomBackends()) happen only in memory,
   * so a snapshot taken straight from backends.json would miss them entirely
   * — this is what actually fixes that. Includes every registered backend
   * (enabled and disabled); the audit itself filters on `enabled`. `config`
   * is the RESOLVED config (including its resolved apiKey), deliberately —
   * a key sourced from the secrets store must count as configured here.
   * @returns {{backends: Object}}
   */
  getAuditSnapshot() {
    const backends = {};
    for (const [name, b] of this.backends) {
      backends[name] = {
        type: b.type,
        enabled: b.enabled,
        priority: b.priority,
        config: b.config,
        ...(b.context_limit && { context_limit: b.context_limit })
      };
    }
    return { backends };
  }

  /**
   * Get registry statistics
   * @returns {Object}
   */
  getStats() {
    const total = this.backends.size;
    const enabled = this.getEnabledBackends().length;
    const adapterList = Array.from(this.adapters.values());
    const healthy = adapterList.filter(a => a.lastHealth?.healthy === true).length;
    // A backend that has never been probed is UNKNOWN, not unhealthy. Counting the
    // two together made a freshly-started server report "0 healthy" before the first
    // health sweep, which reads as a total outage.
    const unknown = adapterList.filter(a => a.lastHealth == null).length;

    return {
      totalBackends: total,
      enabledBackends: enabled,
      healthyBackends: healthy,
      unknownBackends: unknown,
      healthChecked: unknown < adapterList.length,
      fallbackChain: this.fallbackChain,
      backends: Array.from(this.backends.values()).map(b => {
        const adapter = this.adapters.get(b.name);
        return {
          name: b.name,
          type: b.type,
          enabled: b.enabled,
          priority: b.priority,
          description: b.description,
          icon: b.icon || null,
          model: b.config?.model || null,
          healthy: adapter?.lastHealth?.healthy ?? null
        };
      })
    };
  }

  /**
   * Load configuration from JSON
   * @param {Object} config - Configuration object
   */
  loadConfig(config) {
    this.backends.clear();
    this.adapters.clear();

    for (const [name, backendConfig] of Object.entries(config.backends || {})) {
      this.register(name, backendConfig);
    }

    console.error(`[BackendRegistry] Loaded ${this.backends.size} backends from config`);
  }

  /**
   * Export current configuration
   * @returns {Object}
   */
  exportConfig() {
    const backends = {};

    for (const [name, backend] of this.backends) {
      backends[name] = {
        type: backend.type,
        enabled: backend.enabled,
        priority: backend.priority,
        description: backend.description,
        config: backend.config
      };
    }

    return { backends };
  }

  /**
   * Add a new backend dynamically
   * @param {Object} config - Backend configuration
   * @returns {Object} Result with success status
   */
  addBackend(config) {
    const { name, type, url, apiKey, model, maxTokens, timeout, priority, description, icon } = config;

    if (!name || !type) {
      return { success: false, error: 'Name and type are required' };
    }

    if (this.backends.has(name)) {
      return { success: false, error: `Backend '${name}' already exists` };
    }

    if (!ADAPTER_CLASSES[type]) {
      console.error(`[BackendRegistry] Using openai adapter for custom type: ${type}`);
    }

    const backendConfig = {
      type: ADAPTER_CLASSES[type] ? type : 'openai',
      enabled: true,
      priority: priority || this.backends.size + 1,
      description: description || `Custom backend: ${name}`,
      icon: icon || undefined,
      config: {
        url: url || undefined,
        apiKey: resolveApiKey(apiKey) || undefined,
        model: model || undefined,
        maxTokens: maxTokens || 4096,
        timeout: timeout || 30000
      }
    };

    this.register(name, backendConfig);
    this.saveConfig();

    return {
      success: true,
      message: `Backend '${name}' added successfully`,
      backend: this.backends.get(name)
    };
  }

  /**
   * Remove a backend
   * @param {string} name - Backend name
   * @returns {Object} Result with success status
   */
  removeBackend(name) {
    if (!this.backends.has(name)) {
      return { success: false, error: `Backend '${name}' not found` };
    }

    this.adapters.delete(name);
    this.backends.delete(name);
    this.updateFallbackChain();
    this.saveConfig();

    return {
      success: true,
      message: `Backend '${name}' removed successfully`
    };
  }

  /**
   * Update a backend configuration
   * @param {string} name - Backend name
   * @param {Object} updates - Configuration updates
   * @returns {Object} Result with success status
   */
  updateBackend(name, updates) {
    const backend = this.backends.get(name);
    if (!backend) {
      return { success: false, error: `Backend '${name}' not found` };
    }

    if (updates.enabled !== undefined) {
      this.setEnabled(name, updates.enabled);
    }
    if (updates.priority !== undefined) {
      this.setPriority(name, updates.priority);
    }
    if (updates.description !== undefined) {
      backend.description = updates.description;
    }
    if (updates.icon !== undefined) {
      backend.icon = updates.icon;
    }
    if (updates.config) {
      backend.config = { ...backend.config, ...updates.config };
      if (backend.enabled) {
        this.adapters.delete(name);
        this.createAdapter(name);
      }
    }

    this.saveConfig();

    return {
      success: true,
      message: `Backend '${name}' updated successfully`,
      backend: this.backends.get(name)
    };
  }

  /**
   * Resolve a caller-supplied backend name against the LIVE registry — the
   * single validation seam for every tool that accepts a free-form backend
   * name (options.backend on the file tools, `model`/`force_backend` on
   * `ask`, `backend` on check_backend_health). 'auto' (and an absent/nullish
   * name, treated the same way) always resolves; anything else must be a
   * registered canonical name or a FRIENDLY_NAME_MAP alias (getBackend()
   * already checks both). Deliberately does NOT throw — an unknown name is
   * caller error, not a protocol error, so the result carries `ok:false` and
   * a message a handler can surface directly. The valid list is built from
   * `this.backends` at call time, never a literal, so it can't go stale as
   * backends are added, renamed, or removed.
   * @param {string} [name]
   * @returns {{ok: true, backend: string} | {ok: false, error: string, valid: string[]}}
   */
  resolveRequestedBackend(name) {
    if (name === undefined || name === null || name === 'auto') {
      return { ok: true, backend: 'auto' };
    }
    const backend = this.getBackend(name);
    if (backend) {
      return { ok: true, backend: backend.name };
    }
    const valid = Array.from(this.backends.keys());
    return {
      ok: false,
      error: `Unknown backend: '${name}'. Registered backends: ${valid.join(', ')}`,
      valid
    };
  }

  /**
   * Pick a default lane for an 'auto' request. This is a routing HINT only,
   * not a capacity decision — real capacity gating happens in the handlers
   * (countTokens vs capacityTokensFor), so this threshold does not need to
   * be, and must not pretend to be, authoritative. It exists purely to bias
   * small/cheap requests toward a free local lane and large ones toward
   * whatever cloud lane the operator has actually configured — never a
   * hardcoded name, since the repo ships no model ids and expects the
   * operator to configure their own backends.
   * @param {string} requestedBackend
   * @param {Object} [context]
   * @param {number} [context.contentLength]
   * `explicit: true` marks the ONE branch where the caller NAMED the lane, so
   * callers can request a single attempt instead of a cascade
   * (makeRequestWithFallback's `options.noFallback`). Every other branch below
   * is a RESOLUTION — 'auto', a routing override, the content-length hint —
   * and deliberately carries no flag, so resolved lanes keep cascading.
   * @returns {{backend: string|null, explicit?: boolean, recommendation?: string}}
   */
  selectBackend(requestedBackend, context = {}) {
    if (requestedBackend && requestedBackend !== 'auto') {
      const resolved = this.resolveRequestedBackend(requestedBackend);
      if (!resolved.ok) {
        throw new Error(resolved.error);
      }
      return { backend: resolved.backend, explicit: true };
    }
    if (context.handlerType && this.routingOverrides[context.handlerType]) {
      const override = this.routingOverrides[context.handlerType](context);
      if (override) {
        if (typeof override === 'string') return { backend: override };
        return override;
      }
    }

    const usable = new Set(this.getUsableBackends());
    const chain = this.getFallbackChain().filter(b => usable.has(b));
    const candidates = chain.length > 0 ? chain : [...usable];

    if (candidates.length === 0) {
      return { backend: null, recommendation: 'No usable backend is configured' };
    }

    const localCandidate = candidates.find(b => this.getBackend(b)?.type === 'local');
    const nonLocalCandidates = candidates.filter(b => b !== localCandidate);

    // Large content: prefer the highest-priority usable non-local lane —
    // still just a hint, so degrade to whatever IS usable if none exists.
    if (context.contentLength > 40000 && nonLocalCandidates.length > 0) {
      return { backend: nonLocalCandidates[0], recommendation: 'Large content — routed to cloud' };
    }

    return { backend: localCandidate || candidates[0] };
  }

  registerRoutingOverride(handlerType, fn) {
    this.routingOverrides[handlerType] = fn;
  }

  /**
   * Get list of available adapter types
   * @returns {string[]}
   */
  getAvailableTypes() {
    return Object.keys(ADAPTER_CLASSES).filter(type => !DEPRECATED_TYPES.has(type));
  }
}

export {
  BackendRegistry,
  ADAPTER_CLASSES,
  FRIENDLY_NAME_MAP,
  loadBackendsFromConfig,
  BACKENDS_CONFIG_PATH
};
