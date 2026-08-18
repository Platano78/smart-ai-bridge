/**
 * @fileoverview Capability Matcher - Dynamic backend selection based on capabilities
 * @module utils/capability-matcher
 *
 * Provides capability-based matching for subagent backend selection.
 *
 * NOTHING here is derived from a model's NAME. A server reports structural facts
 * about the model it loaded (chat_template_caps, modalities, n_ctx) and nothing
 * semantic: there is no server-side source for "this model is code-specialized"
 * or "this model is a deep reasoner". A regex on the name is not a last-resort
 * signal for those, it is a fabrication that will confidently mislabel any
 * fine-tune, merge, or new release whose name happens to contain a familiar word.
 *
 * Resolution order, strongest first:
 *   1. OPERATOR-DECLARED — a `capabilities` array on the backend's config. The
 *      operator knows what they loaded; this is the only trustworthy source of
 *      SEMANTIC capability. See src/config/backends.example.json.
 *   2. SERVER-REPORTED STRUCTURAL — what genuinely follows from real data.
 *   3. GENERAL — honest default, and routable: an unrecognised model must never
 *      be silently excluded from routing.
 */

/**
 * Capability taxonomy for AI backends
 * @enum {string}
 */
const CAPABILITIES = {
  DEEP_REASONING: 'deep_reasoning',      // Complex analysis, architecture, planning
  FAST_GENERATION: 'fast_generation',    // Quick responses, documentation
  LARGE_CONTEXT: 'large_context',        // 64K+ tokens context window
  CODE_SPECIALIZED: 'code_specialized',  // Trained specifically on code
  SECURITY_FOCUS: 'security_focus',      // Security/vulnerability analysis
  DOCUMENTATION: 'documentation',        // Technical writing
  FAST_ROUTING: 'fast_routing',          // Orchestrator routing (NOT for subagent work)
  VISION: 'vision',                      // Multimodal image input (server-reported)
  TOOL_USE: 'tool_use',                  // Chat template carries tool calls (server-reported)
  GENERAL: 'general'                     // General purpose
};

/**
 * Capability set for a model nothing is known about.
 *
 * Deliberately just GENERAL: it is honest (no capability is being claimed on no
 * evidence) and non-empty, and scoreCapabilityMatch gives a GENERAL-only model a
 * non-zero floor so it stays reachable. Padding this with specialist capabilities
 * would let an unknown model outrank a model actually known to have them.
 * @type {string[]}
 */
const DEFAULT_UNKNOWN_CAPABILITIES = [CAPABILITIES.GENERAL];

/**
 * Score floor for a model that advertises only GENERAL against specific
 * requirements. Non-zero on purpose: 0 removes a backend from consideration
 * entirely, which is how an unrecognised model used to get excluded from
 * routing. Low enough that any model with real evidence still wins.
 * @type {number}
 */
const UNKNOWN_MODEL_FLOOR_SCORE = 20;

/**
 * Backend capability definitions (static backends)
 * @type {Object.<string, {capabilities: string[], context_limit: number}>}
 */
const BACKEND_CAPABILITIES = {
  'nvidia_deepseek': {
    capabilities: [CAPABILITIES.DEEP_REASONING, CAPABILITIES.SECURITY_FOCUS],
    context_limit: 8192
  },
  'nvidia_glm': {
    capabilities: [CAPABILITIES.CODE_SPECIALIZED, CAPABILITIES.DEEP_REASONING],
    context_limit: 32768
  },
  'gemini': {
    capabilities: [CAPABILITIES.FAST_GENERATION, CAPABILITIES.DOCUMENTATION],
    context_limit: 32768
  },
  'openai_chatgpt': {
    capabilities: [CAPABILITIES.DEEP_REASONING, CAPABILITIES.DOCUMENTATION],
    context_limit: 128000
  },
  'groq_llama': {
    capabilities: [CAPABILITIES.FAST_GENERATION, CAPABILITIES.GENERAL],
    context_limit: 32768
  },
  'local': {
    capabilities: 'dynamic', // Resolved at runtime from operator config + server report
    context_limit: 65536
  },
  'orchestrator': {
    capabilities: [CAPABILITIES.FAST_ROUTING], // NOT for subagent work
    context_limit: 4096
  }
};

/**
 * Ports that indicate orchestrator (should be excluded from subagent work)
 * @type {number[]}
 */
const ORCHESTRATOR_PORTS = [8085, 8083];

/**
 * Context sizes above which a model counts as LARGE_CONTEXT.
 * Both are server-reported numbers, not guesses about the model.
 * @type {number}
 */
const LARGE_CONTEXT_TRAIN_TOKENS = 65536;
const LARGE_CONTEXT_RUNTIME_TOKENS = 32768;

/**
 * Keep only values that are real members of the capability taxonomy, so a typo
 * in an operator's config cannot invent a capability nothing will ever match.
 * @param {*} declared - Whatever the config carried
 * @returns {string[]}
 */
function normalizeDeclaredCapabilities(declared) {
  if (!Array.isArray(declared)) {
    return [];
  }
  const known = new Set(Object.values(CAPABILITIES));
  return [...new Set(declared.filter(c => typeof c === 'string' && known.has(c)))];
}

/**
 * Capabilities that genuinely FOLLOW from what a server reported about the model
 * it loaded. Structural only — no semantic label is invented here, because no
 * server reports one.
 *
 * @param {Object} [report] - Server-reported facts about the loaded model
 * @param {Object} [report.chatTemplateCaps] - llama.cpp /props chat_template_caps
 * @param {Object} [report.modalities] - llama.cpp /props modalities
 * @param {number} [report.nCtx] - Context this server is serving
 * @param {number} [report.nCtxTrain] - Context the model was trained at
 * @param {boolean} [report.supportsInfill] - Server answered /infill for this model
 * @returns {string[]} Possibly empty: a server may report nothing at all
 */
function capabilitiesFromServerReport(report = {}) {
  const capabilities = [];

  const templateCaps = report.chatTemplateCaps || null;
  if (templateCaps) {
    // The loaded model's own chat template can carry tool calls. That is a fact
    // about the template, not a guess about the weights.
    if (templateCaps.supports_tools || templateCaps.supports_tool_calls) {
      capabilities.push(CAPABILITIES.TOOL_USE);
      capabilities.push(CAPABILITIES.GENERAL);
    }
    // The template preserves reasoning content across turns, so the model emits it.
    if (templateCaps.supports_preserve_reasoning) {
      capabilities.push(CAPABILITIES.DEEP_REASONING);
    }
  }

  if (report.modalities?.vision) {
    capabilities.push(CAPABILITIES.VISION);
  }

  if ((report.nCtxTrain || 0) >= LARGE_CONTEXT_TRAIN_TOKENS ||
      (report.nCtx || 0) >= LARGE_CONTEXT_RUNTIME_TOKENS) {
    capabilities.push(CAPABILITIES.LARGE_CONTEXT);
  }

  // Native FIM is direct evidence of code training — the server only answers
  // /infill when the loaded GGUF actually carries FIM tokens. Only present when
  // a caller already probed it; discovery never probes /infill on its own.
  if (report.supportsInfill === true) {
    capabilities.push(CAPABILITIES.CODE_SPECIALIZED);
  }

  return [...new Set(capabilities)];
}

/**
 * Resolve a model's capabilities: operator-declared, else server-reported
 * structural, else the routable GENERAL default. Never returns an empty set and
 * never looks at the model's name.
 *
 * @param {Object} [model] - Model facts
 * @param {string[]} [model.declaredCapabilities] - Operator-declared (config.capabilities)
 * @param {Object} [model.chatTemplateCaps] - Server-reported, see capabilitiesFromServerReport
 * @param {Object} [model.modalities] - Server-reported
 * @param {number} [model.nCtx] - Server-reported
 * @param {number} [model.nCtxTrain] - Server-reported
 * @param {boolean} [model.supportsInfill] - Server-reported
 * @returns {string[]} Non-empty
 */
function resolveModelCapabilities(model = {}) {
  // Only `declaredCapabilities` counts as an operator declaration. A plain
  // `capabilities` field is what this function WRITES onto discovered models, so
  // reading it here would let a resolved result feed back in as evidence.
  const declared = normalizeDeclaredCapabilities(model.declaredCapabilities);
  if (declared.length > 0) {
    return declared;
  }

  const reported = capabilitiesFromServerReport(model);
  if (reported.length > 0) {
    return reported;
  }

  return [...DEFAULT_UNKNOWN_CAPABILITIES];
}

/**
 * Check if a model is an orchestrator (should be excluded from subagent work)
 * @param {string} modelId - Model identifier
 * @param {string} [endpoint] - Optional endpoint URL to check port
 * @returns {boolean}
 */
function isOrchestratorModel(modelId, endpoint = null) {
  // Check by model name
  if (modelId && /orchestrator/i.test(modelId)) {
    return true;
  }

  // Check by port if endpoint provided
  if (endpoint) {
    const portMatch = endpoint.match(/:(\d+)/);
    if (portMatch) {
      const port = parseInt(portMatch[1], 10);
      if (ORCHESTRATOR_PORTS.includes(port)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get capabilities for a known backend
 * @param {string} backend - Backend name
 * @returns {string[]} Array of capability strings
 */
function getBackendCapabilities(backend) {
  const config = BACKEND_CAPABILITIES[backend];
  if (!config) {
    return [...DEFAULT_UNKNOWN_CAPABILITIES];
  }

  // Dynamic backends need runtime inference
  if (config.capabilities === 'dynamic') {
    return [...DEFAULT_UNKNOWN_CAPABILITIES]; // Caller should use resolveModelCapabilities
  }

  return config.capabilities;
}

/**
 * Get context limit for a backend
 * @param {string} backend - Backend name
 * @returns {number} Context limit in tokens
 */
function getBackendContextLimit(backend) {
  const config = BACKEND_CAPABILITIES[backend];
  return config?.context_limit || 8192;
}

/**
 * Score how well a backend matches required capabilities
 * Higher score = better match
 * @param {string[]} backendCaps - Backend's capabilities
 * @param {string[]} requiredCaps - Required capabilities
 * @returns {number} Score from 0-100
 */
function scoreCapabilityMatch(backendCaps, requiredCaps) {
  if (!requiredCaps || requiredCaps.length === 0) {
    return 50; // No requirements = neutral score
  }

  if (!backendCaps || backendCaps.length === 0) {
    return 0;
  }

  // Orchestrators get 0 score for subagent work
  if (backendCaps.includes(CAPABILITIES.FAST_ROUTING)) {
    return 0;
  }

  let matchCount = 0;
  for (const cap of requiredCaps) {
    if (backendCaps.includes(cap)) {
      matchCount++;
    }
  }

  // Nothing matched, and all this backend claims is GENERAL: that is an
  // unrecognised model, not a disqualified one. Returning 0 here is what used to
  // drop it out of routing entirely (findBestBackend only keeps score > 0), so a
  // model nobody has heard of could never be selected. Give it the floor instead.
  if (matchCount === 0 && backendCaps.every(c => c === CAPABILITIES.GENERAL)) {
    return UNKNOWN_MODEL_FLOOR_SCORE;
  }

  // Calculate percentage match
  const matchPercentage = (matchCount / requiredCaps.length) * 100;

  // Bonus for having extra useful capabilities
  const extraCaps = backendCaps.filter(c => !requiredCaps.includes(c) && c !== CAPABILITIES.GENERAL);
  const bonusScore = Math.min(extraCaps.length * 5, 15); // Max 15 bonus

  return Math.min(matchPercentage + bonusScore, 100);
}

/**
 * Estimate task context size from task description and file patterns
 * @param {string} task - Task description
 * @param {string[]} [filePatterns=[]] - Glob patterns for files
 * @returns {'small'|'medium'|'large'} Context size category
 */
function estimateTaskContextSize(task, filePatterns = []) {
  // Start with base score
  let contextScore = 0;

  // Task description length analysis
  const taskLength = task?.length || 0;
  if (taskLength > 2000) contextScore += 3;
  else if (taskLength > 1000) contextScore += 2;
  else if (taskLength > 500) contextScore += 1;

  // File patterns analysis
  const fileCount = filePatterns?.length || 0;
  if (fileCount > 10) contextScore += 4;
  else if (fileCount > 5) contextScore += 3;
  else if (fileCount > 2) contextScore += 2;
  else if (fileCount > 0) contextScore += 1;

  // Check for indicators of large scope in task
  const largeIndicators = [
    /entire\s+(codebase|project|repository)/i,
    /all\s+(files|components|modules)/i,
    /comprehensive|complete|full\s+analysis/i,
    /refactor.*entire/i,
    /architecture.*review/i
  ];

  for (const indicator of largeIndicators) {
    if (indicator.test(task)) {
      contextScore += 2;
    }
  }

  // Check for indicators of small scope
  const smallIndicators = [
    /single\s+(file|function|method)/i,
    /quick\s+(review|fix|check)/i,
    /this\s+(function|method|class)/i,
    /just\s+(add|fix|update)/i
  ];

  for (const indicator of smallIndicators) {
    if (indicator.test(task)) {
      contextScore -= 2;
    }
  }

  // Categorize
  if (contextScore >= 5) return 'large';
  if (contextScore >= 2) return 'medium';
  return 'small';
}

/**
 * Check if a backend is suitable for subagent work
 * (Orchestrators are not suitable)
 * @param {string} backend - Backend name
 * @param {string} [modelId] - Optional model ID for local backend
 * @param {string} [endpoint] - Optional endpoint URL
 * @returns {boolean}
 */
function isSuitableForSubagent(backend, modelId = null, endpoint = null) {
  // Known orchestrator backend
  if (backend === 'orchestrator') {
    return false;
  }

  // Check local backend by model and port
  if (backend === 'local') {
    if (isOrchestratorModel(modelId, endpoint)) {
      return false;
    }
  }

  // All other backends are suitable
  return true;
}

/**
 * Find the best backend for a role given requirements and available backends
 * @param {Object} options - Selection options
 * @param {string[]} options.requiredCapabilities - Required capabilities
 * @param {string[]} options.availableBackends - List of available backend names
 * @param {string[]} [options.fallbackOrder] - Ordered fallback list
 * @param {string} [options.contextSize='small'] - Task context size
 * @param {Object} [options.routingRules] - Context-aware routing rules
 * @param {Function} [options.getLocalCapabilities] - Function to get local model capabilities
 * @returns {{backend: string, score: number, reason: string}}
 */
function findBestBackend(options) {
  const {
    requiredCapabilities = [],
    availableBackends = [],
    fallbackOrder = [],
    contextSize = 'small',
    routingRules = null,
    getLocalCapabilities = () => [CAPABILITIES.GENERAL]
  } = options;

  console.error('[DEBUG] findBestBackend - requiredCapabilities:', requiredCapabilities);
  console.error('[DEBUG] findBestBackend - availableBackends:', availableBackends);
  console.error('[DEBUG] findBestBackend - contextSize:', contextSize);

  // Check routing rules first for context-sensitive selection
  if (routingRules) {
    const rule = contextSize === 'large'
      ? routingRules.large_context
      : routingRules.small_task;

    if (rule && availableBackends.includes(rule.prefer)) {
      console.error('[DEBUG] findBestBackend - routing rule matched:', rule.prefer);
      return {
        backend: rule.prefer,
        score: 100,
        reason: rule.reason
      };
    }
  }

  // Score each available backend
  const scored = [];
  for (const backend of availableBackends) {
    // Get capabilities (dynamic for local)
    const caps = backend === 'local'
      ? getLocalCapabilities()
      : getBackendCapabilities(backend);

    console.error(`[DEBUG] findBestBackend - ${backend} caps:`, caps);

    const score = scoreCapabilityMatch(caps, requiredCapabilities);

    console.error(`[DEBUG] findBestBackend - ${backend} score:`, score);

    if (score > 0) {
      scored.push({
        backend,
        score,
        capabilities: caps,
        reason: `Capability match: ${score}%`
      });
    }
  }

  console.error('[DEBUG] findBestBackend - all scored:', scored);

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Return best match if any
  if (scored.length > 0 && scored[0].score > 0) {
    console.error('[DEBUG] findBestBackend - best match:', scored[0]);
    return scored[0];
  }

  // Use fallback order
  for (const fb of fallbackOrder) {
    if (availableBackends.includes(fb)) {
      console.error('[DEBUG] findBestBackend - fallback:', fb);
      return {
        backend: fb,
        score: 25,
        reason: 'Fallback order'
      };
    }
  }

  // Ultimate fallback to local
  if (availableBackends.includes('local')) {
    console.error('[DEBUG] findBestBackend - ultimate fallback to local');
    return {
      backend: 'local',
      score: 10,
      reason: 'Ultimate fallback'
    };
  }

  // No suitable backend found
  console.error('[DEBUG] findBestBackend - no backend found');
  return {
    backend: null,
    score: 0,
    reason: 'No suitable backend available'
  };
}

export {
  CAPABILITIES,
  DEFAULT_UNKNOWN_CAPABILITIES,
  UNKNOWN_MODEL_FLOOR_SCORE,
  BACKEND_CAPABILITIES,
  ORCHESTRATOR_PORTS,
  normalizeDeclaredCapabilities,
  capabilitiesFromServerReport,
  resolveModelCapabilities,
  isOrchestratorModel,
  getBackendCapabilities,
  getBackendContextLimit,
  scoreCapabilityMatch,
  estimateTaskContextSize,
  isSuitableForSubagent,
  findBestBackend
};
