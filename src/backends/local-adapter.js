/**
 * @fileoverview LocalAdapter - Local backend adapter with autodiscovery
 * @module backends/local-adapter
 *
 * Adapter for local llama-server inference with DYNAMIC model detection
 * Automatically discovers running model from /v1/models endpoint
 *
 * Smart AI Bridge v2.0.0
 */

import { BackendAdapter, stripUndefined } from './backend-adapter.js';
import { LocalServiceDetector } from '../utils/local-service-detector.js';
import { resolveModelCapabilities, isExcludedFromSubagent } from '../utils/capability-matcher.js';
import {
  getServerCapabilities,
  discoverModelOnPort,
  discoverAllModels,
  discoverSubagentCapableModels,
  findBestLocalModel,
  getModelSummary,
  clearCache as clearDiscoveryCache
} from '../utils/model-discovery.js';
import {
  recordTimings,
  getLearnedTokensPerSecond
} from '../utils/model-throughput.js';

/**
 * Throughput assumed before any real measurement exists for a model. Conservative
 * on purpose: it only has to keep the first request's timeout sane until
 * parseResponse() files the server's own `timings`.
 * @type {number}
 */
const DEFAULT_COLD_START_TOKENS_PER_SECOND = 20;

class LocalAdapter extends BackendAdapter {
  /**
   * Create a LocalAdapter with autodiscovery support
   * @param {Object} [config] - Configuration overrides
   */
  constructor(config = {}) {
    super({
      name: 'local',
      type: 'local',
      url: null, // Will be set dynamically by autodiscovery
      maxTokens: config.maxTokens || 65536,
      timeout: config.timeout || 120000,
      streaming: false,
      ...stripUndefined(config)
    });

    // Local hardware is user-owned, not billed per-token — never silently cap
    // generation length. See BackendAdapter.omitDefaultMaxTokens.
    this.omitDefaultMaxTokens = true;

    // Model will be discovered dynamically from /v1/models
    this.model = config.model || null;
    this.modelId = null;  // The actual model ID from server
    this.availableModels = []; // Array of all discovered models (router multi-model support)
    this.detector = new LocalServiceDetector({
      ports: [8081, 8087, 8088, 8001, 8000, 1234, 5000],
      cacheTTL: 300000 // 5 minutes
    });

    // Track initialization state
    this.initialized = false;
    this.initializing = false;

    // Start autodiscovery in background
    if (!config.skipAutodiscovery) {
      this.initializeEndpoint();
    }
  }

  /**
   * Initialize endpoint via autodiscovery (async, non-blocking)
   * Also fetches model info dynamically from /v1/models
   */
  async initializeEndpoint() {
    if (this.initialized || this.initializing) return;

    this.initializing = true;

    try {
      console.error('[SAB] LocalAdapter: Starting endpoint autodiscovery...');
      const endpoint = await this.detector.discover();

      if (endpoint) {
        this.config.url = endpoint;
        console.error(`[SAB] LocalAdapter: Endpoint discovered: ${endpoint}`);

        // Fetch model info dynamically
        await this.fetchModelInfo();
      } else {
        // Fallback to default
        this.config.url = 'http://127.0.0.1:8001/v1/chat/completions';
        console.error(`[SAB] LocalAdapter: Using fallback endpoint: ${this.config.url}`);
      }
    } catch (error) {
      console.error(`[SAB] LocalAdapter: Autodiscovery failed: ${error.message}`);
      this.config.url = 'http://127.0.0.1:8001/v1/chat/completions';
    } finally {
      this.initializing = false;
      this.initialized = true;
    }
  }

  /**
   * Fetch model info from /v1/models endpoint
   * Sets this.availableModels array and this.model (default model)
   */
  async fetchModelInfo() {
    try {
      const modelsUrl = this.config.url.replace('/chat/completions', '/models');
      const response = await fetch(modelsUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        const data = await response.json();
        if (data.data && data.data.length > 0) {
          // Include ALL models - router uses lazy loading, so unloaded models are still available
          const availableModels = data.data.filter(m =>
            !m.status?.value || m.status?.value === 'loaded' || m.status?.value === 'unloaded'
          );

          if (availableModels.length > 0) {
            // Store all available models with their metadata
            this.availableModels = availableModels.map(m => {
              const args = m.status?.args || [];

              // Extract --ctx-size
              const ctxIdx = args.indexOf('--ctx-size');
              const nCtx = ctxIdx !== -1 && args[ctxIdx + 1]
                ? parseInt(args[ctxIdx + 1], 10)
                : 4096;

              // Extract --parallel
              const parallelIdx = args.indexOf('--parallel');
              const slots = parallelIdx !== -1 && args[parallelIdx + 1]
                ? parseInt(args[parallelIdx + 1], 10)
                : 1;

              return {
                id: m.id,
                nCtx,
                slots,
                status: m.status?.value || 'unknown'
              };
            });

            // Set default model to first LOADED model, fallback to first available
            const loadedModel = this.availableModels.find(m => m.status === 'loaded');
            const defaultModel = loadedModel || this.availableModels[0];
            this.model = defaultModel.id;
            this.modelId = defaultModel.id;

            console.error(`[SAB] LocalAdapter: ${availableModels.length} model(s) available:`);
            this.availableModels.forEach(m => {
              const marker = m.id === this.modelId ? ' (DEFAULT)' : '';
              const statusMarker = m.status === 'loaded' ? ' [loaded]' : '';
              console.error(`   - ${m.id}: ${m.nCtx}ctx, ${m.slots} slots${statusMarker}${marker}`);
            });
          } else {
            // Fallback if no models loaded
            this.availableModels = [{ id: data.data[0].id, nCtx: 4096, slots: 1, status: 'unknown' }];
            this.model = data.data[0].id;
            this.modelId = data.data[0].id;
            console.error(`[SAB] LocalAdapter: Model detected: ${this.modelId} (fallback)`);
          }
        }
      }
    } catch (error) {
      console.error(`[SAB] LocalAdapter: Could not fetch model info: ${error.message}`);
      this.availableModels = [];
    }
  }

  /**
   * Ensure a model is loaded before making a request
   * @param {string} requestedModel - Model we want to use
   * @returns {Promise<string|null>} The model to use, or null if none available
   */
  async ensureModelLoaded(requestedModel) {
    try {
      const modelsUrl = this.config.url.replace('/chat/completions', '/models');
      const response = await fetch(modelsUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(3000)
      });

      if (!response.ok) {
        return requestedModel;
      }

      const data = await response.json();
      if (!data.data || data.data.length === 0) {
        return requestedModel;
      }

      // Find all loaded models
      const loadedModels = data.data.filter(m => m.status?.value === 'loaded');

      // Check if requested model is loaded
      if (loadedModels.some(m => m.id === requestedModel)) {
        // Record what was actually observed running, so detectedModel/telemetry
        // (parseResponse) attribute results to the confirmed model, not a stale value.
        this.model = requestedModel;
        this.modelId = requestedModel;
        return requestedModel;
      }

      // Requested model not loaded - pick the first loaded model instead
      if (loadedModels.length > 0) {
        const alternative = loadedModels[0].id;
        console.error(`[SAB] LocalAdapter: Model ${requestedModel} not loaded, using ${alternative} instead`);

        this.model = alternative;
        this.modelId = alternative;

        this.availableModels = loadedModels.map(m => {
          const args = m.status?.args || [];
          const ctxIdx = args.indexOf('--ctx-size');
          const nCtx = ctxIdx !== -1 && args[ctxIdx + 1] ? parseInt(args[ctxIdx + 1], 10) : 4096;
          const parallelIdx = args.indexOf('--parallel');
          const slots = parallelIdx !== -1 && args[parallelIdx + 1] ? parseInt(args[parallelIdx + 1], 10) : 1;
          return { id: m.id, nCtx, slots, status: m.status?.value || 'unknown' };
        });

        return alternative;
      }

      // No models loaded at all - return requested and let llama-swap load it
      console.error(`[SAB] LocalAdapter: No models loaded, requesting ${requestedModel} (will trigger load)`);
      return requestedModel;
    } catch (error) {
      console.error(`[SAB] LocalAdapter: ensureModelLoaded check failed: ${error.message}`);
      return requestedModel;
    }
  }

  /**
   * Select optimal model based on task requirements
   * @param {Object} options - Selection criteria
   * @param {number} [options.contentSize] - Size of content in characters
   * @param {boolean} [options.preferSpeed] - Prefer model with more slots
   * @param {boolean} [options.preferContext] - Prefer model with larger context
   * @returns {string} Selected model ID
   */
  selectOptimalModel(options = {}) {
    if (!this.availableModels || this.availableModels.length === 0) {
      return this.model;
    }

    if (this.availableModels.length === 1) {
      return this.availableModels[0].id;
    }

    const { contentSize = 0, preferSpeed = false, preferContext = false } = options;

    if (preferContext || contentSize > 20000) {
      const sorted = [...this.availableModels].sort((a, b) => b.nCtx - a.nCtx);
      return sorted[0].id;
    }

    if (preferSpeed) {
      const sorted = [...this.availableModels].sort((a, b) => b.slots - a.slots);
      return sorted[0].id;
    }

    return this.availableModels[0].id;
  }

  /**
   * Ensure endpoint is initialized before making requests
   */
  async ensureInitialized() {
    if (this.initialized) return;

    while (this.initializing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (!this.initialized) {
      await this.initializeEndpoint();
    }
  }

  /**
   * Force re-discovery of endpoint (cache invalidation)
   */
  async forceRediscovery() {
    console.error('[SAB] LocalAdapter: Force rediscovery requested');
    this.detector.clearCache();
    this.initialized = false;
    this.config.url = null;
    this.model = null;
    this.modelId = null;
    this.availableModels = [];
    await this.initializeEndpoint();
  }

  /**
   * Get current model info including all loaded models
   * @returns {Object} Model info
   */
  getModelInfo() {
    const loadedModels = this.availableModels?.filter(m => m.status === 'loaded') || [];

    return {
      id: this.modelId,
      model: this.model,
      endpoint: this.config.url,
      initialized: this.initialized,
      capabilities: this.getModelCapabilities(),
      loadedModels: loadedModels.map(m => ({
        id: m.id,
        nCtx: m.nCtx,
        slots: m.slots,
        capabilities: this.capabilitiesForModel(m)
      })),
      multiModelCapable: loadedModels.length >= 2
    };
  }

  /**
   * Capabilities the OPERATOR declared for a model, if any.
   *
   * `config.capabilities` declares them for the whole local lane;
   * `config.modelCapabilities` declares them per exact model id, for a router
   * serving several models at once. Both are exact operator statements — no id
   * is pattern-matched, so a model the operator did not mention gets nothing
   * from here rather than a guess.
   * @param {string|null} [modelId]
   * @returns {string[]|undefined}
   */
  getDeclaredCapabilities(modelId = null) {
    const perModel = this.config?.modelCapabilities;
    if (modelId && perModel && Array.isArray(perModel[modelId])) {
      return perModel[modelId];
    }
    return this.config?.capabilities;
  }

  /**
   * Capabilities for one entry of availableModels: operator-declared first, then
   * what the server reported about it, then the routable default. Never keyed on
   * the model's NAME.
   * @param {Object} model - An availableModels entry
   * @returns {string[]}
   */
  capabilitiesForModel(model) {
    return resolveModelCapabilities({
      declaredCapabilities: this.getDeclaredCapabilities(model?.id),
      nCtx: model?.nCtx
    });
  }

  /**
   * Get capabilities based on ALL loaded models (union)
   * @returns {string[]} List of capability strings
   */
  getModelCapabilities() {
    const loadedModels = this.availableModels?.filter(m => m.status === 'loaded') || [];

    if (loadedModels.length > 1) {
      const allCaps = new Set();
      loadedModels.forEach(m => {
        this.capabilitiesForModel(m).forEach(c => allCaps.add(c));
      });
      return Array.from(allCaps);
    }

    const current = this.availableModels?.find(m => m.id === this.modelId) || { id: this.modelId };
    return this.capabilitiesForModel(current);
  }

  /**
   * Check if local model supports a specific capability
   * @param {string} capability - Required capability
   * @returns {boolean}
   */
  hasCapability(capability) {
    return this.getModelCapabilities().includes(capability);
  }

  /**
   * Whether this lane is excluded from subagent work — operator-declared only
   * (`config.excludeFromSubagent`). No port or model name can tell you what a
   * lane is for; see capability-matcher.js#isExcludedFromSubagent.
   * @returns {boolean}
   */
  isOrchestrator() {
    return isExcludedFromSubagent(this.config);
  }

  /**
   * Get estimated tokens per second for the current model
   * @returns {number} Estimated tokens/second
   */
  getTokensPerSecond() {
    // MEASURED FIRST. Every llama.cpp completion carries a `timings` block with
    // predicted_per_second; parseResponse() files those under the model identity
    // that produced them. Because the store is keyed on model identity, a model
    // swap cannot inherit the previous occupant's number.
    const learned = getLearnedTokensPerSecond(this.modelId);
    if (learned !== null) {
      return learned;
    }

    // COLD START: one conservative constant, until the first completion comes
    // back with timings. There is deliberately no name-keyed table and no
    // parameter-count-from-the-name regex here: no server reports a model's
    // size, so a number derived from its name is a wrong number wearing a
    // confident face — and it silently mis-sizes every timeout computed from it.
    return DEFAULT_COLD_START_TOKENS_PER_SECOND;
  }

  /**
   * Calculate dynamic timeout based on token count
   * @param {number} maxTokens - Requested max tokens
   * @returns {number} Timeout in milliseconds
   */
  calculateDynamicTimeout(maxTokens) {
    const baseMs = maxTokens * 25;
    return Math.min(Math.max(60000, baseMs), 600000);
  }

  /**
   * Make request to local llama-server instance
   * @param {string} prompt - Prompt to send
   * @param {Object} [options] - Request options
   * @param {string} [options.routerModel] - Router mode model profile name
   * @returns {Promise<Object>}
   */
  async makeRequest(prompt, options = {}) {
    await this.ensureInitialized();

    let modelToUse = options.routerModel ||
                     this.selectOptimalModel({
                       contentSize: prompt.length,
                       preferSpeed: options.preferSpeed,
                       preferContext: options.preferContext
                     }) ||
                     this.model ||
                     undefined;

    // Verify the model is actually loaded, refresh if not
    const loadedModel = await this.ensureModelLoaded(modelToUse);
    if (loadedModel && loadedModel !== modelToUse) {
      modelToUse = loadedModel;
    }

    // requestedTokens sizes the TIMEOUT below regardless of whether a cap is sent on
    // the wire — an uncapped generation still needs the dynamic (longer) timeout, not
    // the short static one, or it will time out sooner than the capped case did.
    const requestedTokens = options.maxTokens !== undefined
      ? options.maxTokens
      : this.config.maxTokens;

    const body = {
      model: modelToUse,
      messages: [{ role: 'user', content: prompt }],
      temperature: options.temperature || 0.7,
      stream: false
    };

    // Only emit max_tokens on the wire when the caller explicitly asked for a cap.
    // Local models run on hardware the user owns; capping by default risks the
    // response getting cut off mid-reasoning for no cost benefit.
    if (options.maxTokens !== undefined) {
      body.max_tokens = options.maxTokens;
    }

    // Opt-in: suppress reasoning/thinking emission on models whose chat template
    // defaults thinking=true. Without it, max_tokens can land mid-<think>, the
    // closing tag never arrives, and the parser sees raw reasoning prose instead
    // of a structured answer.
    //
    // `disableThinking` is the caller's INTENT; whether the kwarg is actually sent
    // is decided here from what the server reports about the loaded model, never
    // from its name. Sending chat_template_kwargs a model does not understand is
    // how a bridge fails to survive an unfamiliar backend — some OpenAI-compatible
    // servers reject unknown body fields outright. When support is unknown we send
    // nothing: llm-json-parser strips <think> blocks generically at parse time, so
    // the safety net holds either way.
    //
    // The probe is cached (TTL + in-flight dedup in model-discovery) and only runs
    // when a caller actually asks to disable thinking, so it adds no round-trip to
    // the normal request path.
    if (options.disableThinking) {
      const caps = await getServerCapabilities(this.config.url).catch(() => null);
      if (caps?.supportsThinkingToggle) {
        if (!body.chat_template_kwargs) body.chat_template_kwargs = {};
        body.chat_template_kwargs.enable_thinking = false;
      }
      // reasoning_format is a llama.cpp server field, not a chat-template kwarg —
      // gate it on the server type rather than on the model's template.
      if (caps?.serverType === 'llama.cpp') {
        body.reasoning_format = 'none';
      }
    }

    const timeout = options.timeout
      || (requestedTokens > 4000 ? this.calculateDynamicTimeout(requestedTokens) : this.config.timeout);

    const response = await fetch(this.config.url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Could not read error body');
      console.error(`[SAB LocalAdapter] Request failed: ${response.status} ${response.statusText} - ${errorText}`);

      if (!options._retried) {
        console.error('[SAB] LocalAdapter: Request failed, attempting rediscovery...');
        await this.forceRediscovery();
        return this.makeRequest(prompt, { ...options, _retried: true });
      }
      throw new Error(`Local backend error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return this.parseResponse(data);
  }

  /**
   * Check health of local backend
   * @returns {Promise<Object>}
   */
  async checkHealth() {
    await this.ensureInitialized();

    const startTime = Date.now();

    try {
      const modelsUrl = this.config.url.replace('/chat/completions', '/models');

      const response = await fetch(modelsUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'SAB-v2-Health-Check/2.0.0'
        },
        signal: AbortSignal.timeout(3000)
      });

      const latency = Date.now() - startTime;
      const healthy = response.ok;

      if (healthy) {
        try {
          const data = await response.json();
          if (data.data && data.data.length > 0) {
            const loadedModel = data.data.find(m => m.status?.value === 'loaded');
            const modelInfo = loadedModel || data.data[0];
            this.modelId = modelInfo.id;
            this.model = modelInfo.id;
          }
        } catch (e) {
          // Ignore parse errors
        }
      }

      this.lastHealth = {
        healthy,
        latency,
        checkedAt: new Date(),
        url: this.config.url,
        model: this.modelId,
        error: healthy ? null : `Status ${response.status}`
      };

      if (!healthy) {
        console.error('[SAB] LocalAdapter: Health check failed, scheduling rediscovery...');
        setImmediate(() => this.forceRediscovery());
      }

      return this.lastHealth;
    } catch (error) {
      this.lastHealth = {
        healthy: false,
        latency: Date.now() - startTime,
        checkedAt: new Date(),
        url: this.config.url,
        model: this.modelId,
        error: error.message
      };

      console.error('[SAB] LocalAdapter: Health check error, scheduling rediscovery...');
      setImmediate(() => this.forceRediscovery());

      return this.lastHealth;
    }
  }

  // ============================================================
  // Dynamic Model Discovery Methods
  // ============================================================

  async discoverAllModels(ports) {
    return discoverAllModels(ports);
  }

  async discoverSubagentCapableModels(ports) {
    return discoverSubagentCapableModels(ports);
  }

  async findBestLocalModel(requiredCapabilities, options = {}) {
    return findBestLocalModel(requiredCapabilities, options);
  }

  async getModelSummary(ports) {
    return getModelSummary(ports);
  }

  async discoverModelOnPort(port) {
    return discoverModelOnPort(port);
  }

  clearDiscoveryCache() {
    clearDiscoveryCache();
    console.error('[SAB] LocalAdapter: Discovery cache cleared');
  }

  async getExtendedModelInfo() {
    await this.ensureInitialized();

    const portMatch = this.config.url?.match(/:(\d+)/);
    const port = portMatch ? parseInt(portMatch[1], 10) : 8081;

    const liveModel = await discoverModelOnPort(port);

    return {
      id: this.modelId,
      model: this.model,
      endpoint: this.config.url,
      initialized: this.initialized,
      live: liveModel ? {
        nParams: liveModel.nParams,
        nCtxTrain: liveModel.nCtxTrain,
        nCtx: liveModel.nCtx,
        slots: liveModel.slots,
        capabilities: liveModel.capabilities,
        isOrchestrator: liveModel.isOrchestrator
      } : null,
      legacyCapabilities: this.getModelCapabilities()
    };
  }

  /**
   * Parse response from local llama-server
   * @protected
   */
  parseResponse(response) {
    const result = super.parseResponse(response);

    // super.parseResponse() treats an empty-string `content` as a real (if unhelpful)
    // answer via `??` (backend-adapter.js), deliberately, so it never falls through to
    // reasoning_content there. But llama.cpp's reasoning parser (its default 'auto', or
    // an explicit 'deepseek') can land the ENTIRE generation in reasoning_content when a
    // <think> block gets truncated before its closing tag — leaving `content` genuinely
    // empty. Recover that case here rather than letting the caller see empty content.
    if (typeof result.content === 'string' && result.content.trim().length === 0) {
      const reasoningContent = response.choices?.[0]?.message?.reasoning_content;
      if (typeof reasoningContent === 'string' && reasoningContent.trim().length > 0) {
        result.content = reasoningContent;
      }
    }

    // Learn this model's real generation speed from the timings llama.cpp already
    // returned on this very response — no extra call, no name lookup. Servers that
    // report no timings (vLLM, LM Studio, Ollama, an OpenAI-compatible proxy) are
    // simply never recorded, and getTokensPerSecond() keeps using its seed.
    const measuredModel = response.model || this.modelId;
    if (measuredModel && response.timings) {
      recordTimings(measuredModel, response.timings);
    }

    result.metadata = {
      ...result.metadata,
      model: response.model || this.modelId || 'local',
      detectedModel: this.modelId,
      endpoint: this.config.url
    };
    return result;
  }
}

export { LocalAdapter };
