/**
 * @fileoverview Model Discovery - Live auto-detection of local models and capabilities
 * @module utils/model-discovery
 *
 * Discovers running llama-server instances and infers capabilities from actual
 * model metadata (n_params, n_ctx_train, etc.) instead of hardcoded patterns.
 *
 * This replaces hardcoded MODEL_CAPABILITY_PATTERNS with true dynamic discovery.
 */

import { CAPABILITIES } from './capability-matcher.js';

/**
 * Default ports to scan for local LLM instances
 * Includes: llama.cpp, vLLM, LM Studio, Ollama, text-generation-webui
 * @type {number[]}
 */
const DEFAULT_SCAN_PORTS = [
  // llama.cpp default ports
  8080, 8081, 8082, 8083, 8084, 8085, 8086,
  // vLLM default port
  8000,
  // LM Studio default port
  1234,
  // Ollama default port
  11434,
  // text-generation-webui
  5000, 5001,
  // Common custom ports
  8001, 8888, 3000
];

/**
 * Server type detection patterns
 * @type {Object.<string, {endpoints: string[], modelExtractor: Function}>}
 */
const SERVER_TYPES = {
  'llama.cpp': {
    endpoints: ['/props', '/v1/models'],
    detectFrom: (props) => props?.model_alias || props?.model_path,
    getMetadata: (props, models) => ({
      nParams: models?.data?.[0]?.meta?.n_params || 0,
      nCtxTrain: models?.data?.[0]?.meta?.n_ctx_train || 0,
      nCtx: props?.default_generation_settings?.n_ctx || 4096,
      slots: props?.total_slots || 1
    })
  },
  'vllm': {
    endpoints: ['/v1/models', '/health'],
    detectFrom: (data) => data?.data?.[0]?.id,
    getMetadata: (props, models) => ({
      // vLLM doesn't expose n_params, infer from model name
      nParams: inferParamsFromName(models?.data?.[0]?.id || ''),
      nCtxTrain: models?.data?.[0]?.max_model_len || 0,
      nCtx: models?.data?.[0]?.max_model_len || 32768,
      slots: 1 // vLLM handles this differently (continuous batching)
    })
  },
  'lmstudio': {
    endpoints: ['/v1/models'],
    detectFrom: (data) => data?.data?.[0]?.id,
    getMetadata: (props, models) => ({
      nParams: inferParamsFromName(models?.data?.[0]?.id || ''),
      nCtxTrain: 0, // LM Studio doesn't expose this
      nCtx: 4096, // Default, can be overridden in LM Studio
      slots: 1
    })
  },
  'ollama': {
    endpoints: ['/api/tags', '/api/version'],
    detectFrom: (data) => data?.models?.[0]?.name,
    getMetadata: (props, models) => {
      const model = models?.models?.[0];
      return {
        nParams: parseOllamaParams(model?.details?.parameter_size || ''),
        nCtxTrain: 0,
        nCtx: 4096,
        slots: 1
      };
    }
  }
};

/**
 * Infer parameter count from model name (e.g., "qwen-7b" -> 7e9)
 * @param {string} name - Model name
 * @returns {number}
 */
function inferParamsFromName(name) {
  const match = name.match(/(\d+(?:\.\d+)?)\s*[bB]/i);
  if (match) {
    return parseFloat(match[1]) * 1e9;
  }
  return 0;
}

/**
 * Parse Ollama parameter size string (e.g., "7.2B" -> 7.2e9)
 * @param {string} size - Size string from Ollama
 * @returns {number}
 */
function parseOllamaParams(size) {
  const match = size.match(/(\d+(?:\.\d+)?)\s*([KMGBT])?/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const suffix = (match[2] || '').toUpperCase();
  const multipliers = { 'K': 1e3, 'M': 1e6, 'G': 1e9, 'B': 1e9, 'T': 1e12 };
  return num * (multipliers[suffix] || 1);
}

/**
 * Cache for discovered models (invalidated after TTL)
 * @type {Map<number, {model: Object, timestamp: number}>}
 */
const modelCache = new Map();
const CACHE_TTL = 60000; // 1 minute - short TTL for experimentation flexibility

/**
 * Discovered model information from llama-server
 * @typedef {Object} DiscoveredModel
 * @property {number} port - Port the server is running on
 * @property {string} modelAlias - Model alias from server
 * @property {string} modelPath - Full path to model file
 * @property {number} nParams - Number of parameters
 * @property {number} nCtxTrain - Training context window
 * @property {number} nCtx - Current context window
 * @property {number} slots - Parallel slots available
 * @property {string[]} capabilities - Inferred capabilities
 * @property {boolean} isOrchestrator - Whether this is an orchestrator model
 * @property {string} endpoint - Full endpoint URL
 */

/**
 * Detect server type by probing endpoints
 * @param {number} port - Port to check
 * @param {number} timeout - Request timeout
 * @returns {Promise<{type: string, props: Object, models: Object}|null>}
 */
async function detectServerType(port, timeout) {
  const base = `http://localhost:${port}`;

  // Try llama.cpp first (/props is unique to it)
  try {
    const propsRes = await fetch(`${base}/props`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(timeout)
    });
    if (propsRes.ok) {
      const props = await propsRes.json();
      // Fetch /v1/models for additional metadata
      let models = null;
      try {
        const modelsRes = await fetch(`${base}/v1/models`, {
          signal: AbortSignal.timeout(timeout)
        });
        if (modelsRes.ok) models = await modelsRes.json();
      } catch {}
      return { type: 'llama.cpp', props, models };
    }
  } catch {}

  // Try Ollama (/api/tags is unique to it)
  try {
    const ollamaRes = await fetch(`${base}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(timeout)
    });
    if (ollamaRes.ok) {
      const models = await ollamaRes.json();
      return { type: 'ollama', props: null, models };
    }
  } catch {}

  // Try vLLM/LM Studio (OpenAI-compatible /v1/models)
  try {
    const modelsRes = await fetch(`${base}/v1/models`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(timeout)
    });
    if (modelsRes.ok) {
      const models = await modelsRes.json();
      // Distinguish vLLM from LM Studio by checking for vLLM-specific fields
      const hasVllmFields = models.data?.[0]?.max_model_len !== undefined;
      // Check for /health endpoint (vLLM has it)
      let isVllm = hasVllmFields;
      if (!isVllm) {
        try {
          const healthRes = await fetch(`${base}/health`, { signal: AbortSignal.timeout(500) });
          isVllm = healthRes.ok;
        } catch {}
      }
      return { type: isVllm ? 'vllm' : 'lmstudio', props: null, models };
    }
  } catch {}

  return null;
}

/**
 * Fetch model info from any supported LLM server
 * Supports: llama.cpp, vLLM, LM Studio, Ollama
 * @param {number} port - Port to check
 * @param {number} [timeout=2000] - Request timeout in ms
 * @returns {Promise<DiscoveredModel|DiscoveredModel[]|null>}
 */
async function discoverModelOnPort(port, timeout = 2000) {
  // Check cache first
  const cached = modelCache.get(port);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.model;
  }

  try {
    const detected = await detectServerType(port, timeout);
    if (!detected) return null;

    const { type, props, models } = detected;
    const serverConfig = SERVER_TYPES[type];

    // Special handling for llama.cpp router with multiple loaded models
    if (type === 'llama.cpp' && models?.data && Array.isArray(models.data)) {
      const loadedModels = models.data.filter(m => m.status?.value === 'loaded');

      if (loadedModels.length > 1) {
        // Multiple loaded models - return array
        const modelArray = loadedModels.map(loadedModel => {
          // Parse args for this specific model
          const args = loadedModel.status?.args || [];

          // Extract --ctx-size
          let nCtx = 4096; // default
          const ctxIdx = args.indexOf('--ctx-size');
          if (ctxIdx !== -1 && args[ctxIdx + 1]) {
            const parsedCtx = parseInt(args[ctxIdx + 1], 10);
            if (!isNaN(parsedCtx)) nCtx = parsedCtx;
          }

          // Extract --parallel (slots)
          let slots = 1; // default
          const parallelIdx = args.indexOf('--parallel');
          if (parallelIdx !== -1 && args[parallelIdx + 1]) {
            const parsedSlots = parseInt(args[parallelIdx + 1], 10);
            if (!isNaN(parsedSlots)) slots = parsedSlots;
          }

          // Extract --n-gpu-layers (for nParams inference)
          let nGpuLayers = 0;
          const gpuLayersIdx = args.indexOf('--n-gpu-layers');
          if (gpuLayersIdx !== -1 && args[gpuLayersIdx + 1]) {
            const parsedLayers = parseInt(args[gpuLayersIdx + 1], 10);
            if (!isNaN(parsedLayers)) nGpuLayers = parsedLayers;
          }

          const model = {
            port,
            serverType: type,
            modelAlias: loadedModel.id || 'unknown',
            modelPath: loadedModel.id || '',
            nParams: models?.data?.find(m => m.id === loadedModel.id)?.meta?.n_params || 0,
            nCtxTrain: models?.data?.find(m => m.id === loadedModel.id)?.meta?.n_ctx_train || 0,
            nCtx: nCtx,
            slots: slots,
            modalities: props?.modalities || { vision: false, audio: false },
            endpoint: `http://localhost:${port}/v1/chat/completions`,
            capabilities: [],
            isOrchestrator: false
          };

          // Infer capabilities from actual metadata
          model.capabilities = inferCapabilitiesFromMetadata(model);
          model.isOrchestrator = checkIfOrchestrator(model);

          return model;
        });

        // Cache the result (store as array)
        modelCache.set(port, { model: modelArray, timestamp: Date.now() });

        return modelArray;
      }
      // If only 0 or 1 loaded models, fall through to normal handling
    }

    // Extract model alias based on server type
    let modelAlias = 'unknown';
    let modelPath = '';

    if (type === 'llama.cpp') {
      modelAlias = props?.model_alias || 'unknown';
      modelPath = props?.model_path || '';
    } else if (type === 'ollama') {
      modelAlias = models?.models?.[0]?.name || 'unknown';
      modelPath = models?.models?.[0]?.model || '';
    } else if (type === 'vllm' || type === 'lmstudio') {
      modelAlias = models?.data?.[0]?.id || 'unknown';
      modelPath = modelAlias; // vLLM/LM Studio use model ID as path
    }

    // Get metadata using server-specific extractor
    const metadata = serverConfig.getMetadata(props, models);

    const model = {
      port,
      serverType: type,
      modelAlias,
      modelPath,
      nParams: metadata.nParams,
      nCtxTrain: metadata.nCtxTrain,
      nCtx: metadata.nCtx,
      slots: metadata.slots,
      modalities: props?.modalities || { vision: false, audio: false },
      endpoint: type === 'ollama'
        ? `http://localhost:${port}/api/chat`
        : `http://localhost:${port}/v1/chat/completions`,
      // Inferred below
      capabilities: [],
      isOrchestrator: false
    };

    // Infer capabilities from actual metadata
    model.capabilities = inferCapabilitiesFromMetadata(model);
    model.isOrchestrator = checkIfOrchestrator(model);

    // Cache the result
    modelCache.set(port, { model, timestamp: Date.now() });

    return model;
  } catch (error) {
    // Server not running or not responding
    return null;
  }
}

/**
 * Infer capabilities from actual model metadata (not hardcoded patterns)
 * @param {Object} model - Model info from discoverModelOnPort
 * @returns {string[]}
 */
function inferCapabilitiesFromMetadata(model) {
  const capabilities = [];

  // === SIZE-BASED CAPABILITIES ===
  const params = model.nParams;
  if (params > 0) {
    if (params >= 30e9) {
      // 30B+ = Deep reasoning model
      capabilities.push(CAPABILITIES.DEEP_REASONING);
    } else if (params >= 14e9) {
      // 14-30B = Good reasoning, general capable
      capabilities.push(CAPABILITIES.DEEP_REASONING);
      capabilities.push(CAPABILITIES.GENERAL);
    } else if (params <= 8e9) {
      // 8B or less = Fast generation (smaller = faster)
      capabilities.push(CAPABILITIES.FAST_GENERATION);
    }
  }

  // === CONTEXT-BASED CAPABILITIES ===
  const ctxTrain = model.nCtxTrain;
  const ctxCurrent = model.nCtx;

  if (ctxTrain >= 65536 || ctxCurrent >= 32768) {
    capabilities.push(CAPABILITIES.LARGE_CONTEXT);
  }

  // === NAME-BASED CAPABILITIES (backup/refinement) ===
  const name = (model.modelAlias || '').toLowerCase();
  const path = (model.modelPath || '').toLowerCase();
  const combined = `${name} ${path}`;

  // Code-specialized models
  if (/coder|code|reap|starcoder|codellama|seed.?coder/i.test(combined)) {
    if (!capabilities.includes(CAPABILITIES.CODE_SPECIALIZED)) {
      capabilities.push(CAPABILITIES.CODE_SPECIALIZED);
    }
  }

  // Security-focused (DeepSeek is known for reasoning/security)
  if (/deepseek/i.test(combined)) {
    if (!capabilities.includes(CAPABILITIES.SECURITY_FOCUS)) {
      capabilities.push(CAPABILITIES.SECURITY_FOCUS);
    }
    if (!capabilities.includes(CAPABILITIES.DEEP_REASONING)) {
      capabilities.push(CAPABILITIES.DEEP_REASONING);
    }
  }

  // Documentation models
  if (/gemini|doc|write/i.test(combined)) {
    capabilities.push(CAPABILITIES.DOCUMENTATION);
  }

  // Ensure at least GENERAL capability
  if (capabilities.length === 0) {
    capabilities.push(CAPABILITIES.GENERAL);
  }

  return [...new Set(capabilities)]; // Remove duplicates
}

/**
 * Check if model is an orchestrator (should be excluded from subagent work)
 * @param {Object} model - Model info
 * @returns {boolean}
 */
function checkIfOrchestrator(model) {
  const name = (model.modelAlias || '').toLowerCase();
  const path = (model.modelPath || '').toLowerCase();

  // Check name
  if (/orchestrator/i.test(name) || /orchestrator/i.test(path)) {
    return true;
  }

  // Small context + small params = likely orchestrator
  // Orchestrators are typically 8B or less with minimal context
  if (model.nParams > 0 && model.nParams <= 10e9 && model.nCtx <= 4096) {
    // Additional check: if name contains "orchestrator", it's definitely one
    if (/orchestrator/i.test(`${name}${path}`)) {
      return true;
    }
  }

  return false;
}

/**
 * Discover all running llama-server instances on given ports
 * @param {number[]} [ports=DEFAULT_SCAN_PORTS] - Ports to scan
 * @param {number} [timeout=2000] - Per-port timeout
 * @returns {Promise<DiscoveredModel[]>}
 */
async function discoverAllModels(ports = DEFAULT_SCAN_PORTS, timeout = 2000) {
  const discoveries = await Promise.all(
    ports.map(port => discoverModelOnPort(port, timeout))
  );

  // Flatten results - if any discovery returned an array, spread it
  const flattened = [];
  for (const discovery of discoveries) {
    if (discovery !== null) {
      if (Array.isArray(discovery)) {
        flattened.push(...discovery);
      } else {
        flattened.push(discovery);
      }
    }
  }
  return flattened;
}

/**
 * Discover models suitable for subagent work (excludes orchestrators)
 * @param {number[]} [ports=DEFAULT_SCAN_PORTS] - Ports to scan
 * @returns {Promise<DiscoveredModel[]>}
 */
async function discoverSubagentCapableModels(ports = DEFAULT_SCAN_PORTS) {
  const all = await discoverAllModels(ports);
  return all.filter(m => !m.isOrchestrator);
}

/**
 * Find the best model for given capability requirements
 * @param {string[]} requiredCapabilities - Required capabilities
 * @param {Object} [options] - Options
 * @param {number[]} [options.ports] - Ports to scan
 * @param {string} [options.contextSize='small'] - 'small', 'medium', 'large'
 * @returns {Promise<{model: DiscoveredModel|null, score: number, reason: string}>}
 */
async function findBestLocalModel(requiredCapabilities, options = {}) {
  const {
    ports = DEFAULT_SCAN_PORTS,
    contextSize = 'small'
  } = options;

  const models = await discoverSubagentCapableModels(ports);

  if (models.length === 0) {
    return { model: null, score: 0, reason: 'No local models available' };
  }

  let bestMatch = null;
  let bestScore = 0;
  let bestReason = '';

  for (const model of models) {
    let score = 0;

    // Score based on capability matches
    for (const cap of requiredCapabilities) {
      if (model.capabilities.includes(cap)) {
        score += 25;
      }
    }

    // Bonus for context size match
    if (contextSize === 'large' && model.capabilities.includes(CAPABILITIES.LARGE_CONTEXT)) {
      score += 30;
    }

    // Bonus for code specialization on code tasks
    if (requiredCapabilities.includes(CAPABILITIES.CODE_SPECIALIZED) &&
        model.capabilities.includes(CAPABILITIES.CODE_SPECIALIZED)) {
      score += 20;
    }

    // Penalty for mismatch (small task but huge model = overkill)
    if (contextSize === 'small' && model.nParams > 50e9) {
      score -= 10;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = model;
      bestReason = `Best match: ${model.modelAlias} (${Math.round(model.nParams / 1e9)}B params, ${model.nCtx}ctx)`;
    }
  }

  return {
    model: bestMatch,
    score: bestScore,
    reason: bestReason || 'Fallback to first available'
  };
}

/**
 * Clear the model cache (force re-discovery)
 */
function clearCache() {
  modelCache.clear();
}

/**
 * Get summary of all discovered models
 * @param {number[]} [ports=DEFAULT_SCAN_PORTS] - Ports to scan
 * @returns {Promise<string>}
 */
async function getModelSummary(ports = DEFAULT_SCAN_PORTS) {
  const models = await discoverAllModels(ports);

  if (models.length === 0) {
    return 'No local models discovered';
  }

  return models.map(m => {
    const params = m.nParams > 0 ? `${Math.round(m.nParams / 1e9)}B` : '?B';
    const orchestrator = m.isOrchestrator ? ' [ORCHESTRATOR]' : '';
    const caps = m.capabilities.join(', ');
    return `Port ${m.port}: ${m.modelAlias} (${params}, ${m.nCtx}ctx, ${m.slots} slots)${orchestrator}\n  Capabilities: [${caps}]`;
  }).join('\n');
}

/**
 * Get dynamic slot count from llama.cpp router for the currently loaded model
 * Queries /v1/models and extracts --parallel from the loaded model's args
 * @param {number} [routerPort=8081] - Router port
 * @param {number} [timeout=3000] - Request timeout
 * @returns {Promise<{slots: number, model: string, context: number, status: string}>}
 */
async function getRouterSlotCount(routerPort = 8081, timeout = 3000) {
  try {
    const response = await fetch(`http://localhost:${routerPort}/v1/models`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(timeout)
    });

    if (!response.ok) {
      return { slots: 2, model: 'unknown', context: 0, status: 'router_error' };
    }

    const data = await response.json();
    const models = data?.data || [];

    // Find the loaded model (status.value === 'loaded')
    const loadedModel = models.find(m => m.status?.value === 'loaded');

    if (!loadedModel) {
      // No model loaded yet, return conservative default
      return { slots: 2, model: 'none', context: 0, status: 'no_model_loaded' };
    }

    // Extract --parallel from args array
    const args = loadedModel.status?.args || [];
    const parallelIdx = args.indexOf('--parallel');
    const slots = parallelIdx !== -1 && args[parallelIdx + 1]
      ? parseInt(args[parallelIdx + 1], 10)
      : 2; // Conservative default

    // Extract --ctx-size from args array
    const ctxIdx = args.indexOf('--ctx-size');
    const context = ctxIdx !== -1 && args[ctxIdx + 1]
      ? parseInt(args[ctxIdx + 1], 10)
      : 0;

    return {
      slots,
      model: loadedModel.id,
      context,
      status: 'loaded'
    };

  } catch (error) {
    console.error('[ModelDiscovery] Router slot query failed:', error.message);
    return { slots: 2, model: 'error', context: 0, status: 'error' };
  }
}

/**
 * Cache for local context limits (invalidated when model changes)
 */
let cachedLocalLimit = null;
let cachedModel = null;

/**
 * Ports to scan for local models (matches Smart AI Bridge's local-adapter autodiscovery)
 * Includes: llama.cpp router (8081), dual mode (8087, 8088), vLLM (8000, 8001),
 * LM Studio (1234), text-generation-webui (5000)
 */
const LOCAL_DISCOVERY_PORTS = [8081, 8087, 8088, 8001, 8000, 1234, 5000];

/**
 * Get actual local backend context limit from any available model
 * Uses existing autodiscovery to find models across all ports, then calculates safe input limit
 * @param {number[]} [ports=LOCAL_DISCOVERY_PORTS] - Ports to scan
 * @param {number} [timeout=1000] - Discovery timeout per port
 * @returns {Promise<{charLimit: number, model: string, context: number, slots: number, port: number}>}
 */
async function getLocalContextLimit(ports = LOCAL_DISCOVERY_PORTS, timeout = 1000) {
  // Try to discover any available model using existing infrastructure
  const rawModels = await Promise.all(
    ports.map(port => discoverModelOnPort(port, timeout))
  );

  // Flatten results - discoverModelOnPort can return array when multiple models loaded
  const flatModels = rawModels.flatMap(m => {
    if (m === null) return [];
    if (Array.isArray(m)) return m;
    return [m];
  });

  // Find model with largest context (best for file analysis)
  const availableModel = flatModels.length > 0
    ? flatModels.reduce((best, curr) => (curr.nCtx > best.nCtx ? curr : best))
    : null;

  // Invalidate cache if model changed
  const modelId = availableModel?.modelAlias || 'unknown';
  if (modelId !== cachedModel) {
    cachedModel = modelId;
    cachedLocalLimit = null;
  }

  if (cachedLocalLimit) return cachedLocalLimit;

  if (!availableModel || !availableModel.nCtx) {
    // No model found - return conservative default
    cachedLocalLimit = {
      charLimit: 20000,
      model: 'unknown',
      context: 0,
      slots: 2,
      port: null
    };
    return cachedLocalLimit;
  }

  // Calculate safe input limit using discovered model's actual context and slots:
  // - context / slots = tokens per request slot
  // - Reserve 35% for output/overhead (65% for input)
  // - Convert tokens to chars (~4 chars per token)
  const tokensPerSlot = Math.floor(availableModel.nCtx / availableModel.slots);
  const safeInputTokens = Math.floor(tokensPerSlot * 0.65);
  const charLimit = safeInputTokens * 4;

  // Enforce floor (20K minimum) and ceiling (512K max)
  const finalLimit = Math.max(20000, Math.min(charLimit, 512000));

  cachedLocalLimit = {
    charLimit: finalLimit,
    model: availableModel.modelAlias,
    context: availableModel.nCtx,
    slots: availableModel.slots,
    port: availableModel.port
  };

  console.error(`[ModelDiscovery] Dynamic limit: ${finalLimit} chars from ${availableModel.modelAlias} on port ${availableModel.port}`);

  return cachedLocalLimit;
}

/**
 * Get slot counts for all models in router config (loaded or not)
 * @param {number} [routerPort=8081] - Router port
 * @returns {Promise<Map<string, {slots: number, context: number, status: string}>>}
 */
async function getAllRouterModelSlots(routerPort = 8081) {
  const slotMap = new Map();

  try {
    const response = await fetch(`http://localhost:${routerPort}/v1/models`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(3000)
    });

    if (!response.ok) return slotMap;

    const data = await response.json();
    const models = data?.data || [];

    for (const model of models) {
      const args = model.status?.args || [];

      // Extract --parallel
      const parallelIdx = args.indexOf('--parallel');
      const slots = parallelIdx !== -1 && args[parallelIdx + 1]
        ? parseInt(args[parallelIdx + 1], 10)
        : 2;

      // Extract --ctx-size
      const ctxIdx = args.indexOf('--ctx-size');
      const context = ctxIdx !== -1 && args[ctxIdx + 1]
        ? parseInt(args[ctxIdx + 1], 10)
        : 0;

      slotMap.set(model.id, {
        slots,
        context,
        status: model.status?.value || 'unknown'
      });
    }

  } catch (error) {
    console.error('[ModelDiscovery] Failed to get all router model slots:', error.message);
  }

  return slotMap;
}

export {
  DEFAULT_SCAN_PORTS,
  SERVER_TYPES,
  discoverModelOnPort,
  detectServerType,
  discoverAllModels,
  discoverSubagentCapableModels,
  findBestLocalModel,
  inferCapabilitiesFromMetadata,
  inferParamsFromName,
  checkIfOrchestrator,
  clearCache,
  getModelSummary,
  getRouterSlotCount,
  getLocalContextLimit,
  getAllRouterModelSlots,
  CACHE_TTL
};
