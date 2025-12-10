/**
 * @fileoverview Capability Matcher - Dynamic backend selection based on capabilities
 * @module utils/capability-matcher
 *
 * Provides capability-based matching for subagent backend selection.
 * Infers model capabilities from model IDs and scores backend matches.
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
  GENERAL: 'general'                     // General purpose
};

/**
 * Model name patterns -> capabilities inference
 * Uses regex patterns for flexible matching
 * Order matters: more specific patterns should come first
 * @type {Array<{pattern: RegExp, capabilities: string[]}>}
 */
const MODEL_CAPABILITY_PATTERNS = [
  // Orchestrator - EXCLUDE from subagent work
  { pattern: /orchestrator/i, capabilities: [CAPABILITIES.FAST_ROUTING] },

  // DeepSeek models - reasoning specialists
  { pattern: /deepseek.*r1/i, capabilities: [CAPABILITIES.DEEP_REASONING, CAPABILITIES.SECURITY_FOCUS] },
  { pattern: /deepseek.*v3/i, capabilities: [CAPABILITIES.DEEP_REASONING, CAPABILITIES.SECURITY_FOCUS] },
  { pattern: /deepseek.*coder/i, capabilities: [CAPABILITIES.CODE_SPECIALIZED, CAPABILITIES.DEEP_REASONING] },
  { pattern: /deepseek/i, capabilities: [CAPABILITIES.DEEP_REASONING, CAPABILITIES.SECURITY_FOCUS] },

  // Seed Coder
  { pattern: /seed.*coder/i, capabilities: [CAPABILITIES.CODE_SPECIALIZED, CAPABILITIES.FAST_GENERATION, CAPABILITIES.LARGE_CONTEXT] },

  // REAP/Cerebras models - current local model
  { pattern: /reap/i, capabilities: [CAPABILITIES.CODE_SPECIALIZED, CAPABILITIES.DEEP_REASONING, CAPABILITIES.LARGE_CONTEXT] },
  { pattern: /cerebras/i, capabilities: [CAPABILITIES.CODE_SPECIALIZED, CAPABILITIES.DEEP_REASONING] },

  // Qwen models
  { pattern: /qwen.*coder/i, capabilities: [CAPABILITIES.CODE_SPECIALIZED, CAPABILITIES.FAST_GENERATION] },
  { pattern: /qwen3/i, capabilities: [CAPABILITIES.CODE_SPECIALIZED, CAPABILITIES.DEEP_REASONING] },
  { pattern: /qwen/i, capabilities: [CAPABILITIES.CODE_SPECIALIZED, CAPABILITIES.GENERAL] },

  // Gemini - fast and documentation focused
  { pattern: /gemini/i, capabilities: [CAPABILITIES.FAST_GENERATION, CAPABILITIES.DOCUMENTATION] },

  // Llama variants
  { pattern: /codellama/i, capabilities: [CAPABILITIES.CODE_SPECIALIZED, CAPABILITIES.FAST_GENERATION] },
  { pattern: /llama/i, capabilities: [CAPABILITIES.GENERAL, CAPABILITIES.FAST_GENERATION] },

  // Claude models (if ever used locally)
  { pattern: /claude/i, capabilities: [CAPABILITIES.DEEP_REASONING, CAPABILITIES.DOCUMENTATION] },

  // Mistral models
  { pattern: /mistral.*code/i, capabilities: [CAPABILITIES.CODE_SPECIALIZED, CAPABILITIES.FAST_GENERATION] },
  { pattern: /mistral/i, capabilities: [CAPABILITIES.GENERAL, CAPABILITIES.FAST_GENERATION] },

  // StarCoder
  { pattern: /starcoder/i, capabilities: [CAPABILITIES.CODE_SPECIALIZED, CAPABILITIES.FAST_GENERATION] },

  // Phi models
  { pattern: /phi/i, capabilities: [CAPABILITIES.CODE_SPECIALIZED, CAPABILITIES.FAST_GENERATION] },

  // Nemotron
  { pattern: /nemotron/i, capabilities: [CAPABILITIES.DEEP_REASONING, CAPABILITIES.LARGE_CONTEXT] }
];

/**
 * Backend capability definitions (static backends)
 * @type {Object.<string, {capabilities: string[], context_limit: number}>}
 */
const BACKEND_CAPABILITIES = {
  'nvidia_deepseek': {
    capabilities: [CAPABILITIES.DEEP_REASONING, CAPABILITIES.SECURITY_FOCUS],
    context_limit: 8192
  },
  'nvidia_qwen': {
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
    capabilities: 'dynamic', // Inferred at runtime from model ID
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
const ORCHESTRATOR_PORTS = [8083, 8085];

/**
 * Infer capabilities from a model ID string
 * @param {string} modelId - Model identifier (e.g., "Seed-Coder-8B-Instruct")
 * @returns {string[]} Array of capability strings
 */
function inferCapabilitiesFromModelId(modelId) {
  if (!modelId) {
    return [CAPABILITIES.GENERAL];
  }

  const normalizedId = modelId.toLowerCase();

  // Check each pattern in order (more specific first)
  for (const { pattern, capabilities } of MODEL_CAPABILITY_PATTERNS) {
    if (pattern.test(normalizedId)) {
      return capabilities;
    }
  }

  // Default to general capabilities
  return [CAPABILITIES.GENERAL];
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
    return [CAPABILITIES.GENERAL];
  }

  // Dynamic backends need runtime inference
  if (config.capabilities === 'dynamic') {
    return [CAPABILITIES.GENERAL]; // Caller should use inferCapabilitiesFromModelId
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

  // Check routing rules first for context-sensitive selection
  if (routingRules) {
    const rule = contextSize === 'large'
      ? routingRules.large_context
      : routingRules.small_task;

    if (rule && availableBackends.includes(rule.prefer)) {
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

    const score = scoreCapabilityMatch(caps, requiredCapabilities);

    if (score > 0) {
      scored.push({
        backend,
        score,
        capabilities: caps,
        reason: `Capability match: ${score}%`
      });
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Return best match if any
  if (scored.length > 0 && scored[0].score > 0) {
    return scored[0];
  }

  // Use fallback order
  for (const fb of fallbackOrder) {
    if (availableBackends.includes(fb)) {
      return {
        backend: fb,
        score: 25,
        reason: 'Fallback order'
      };
    }
  }

  // Ultimate fallback to local
  if (availableBackends.includes('local')) {
    return {
      backend: 'local',
      score: 10,
      reason: 'Ultimate fallback'
    };
  }

  // No suitable backend found
  return {
    backend: null,
    score: 0,
    reason: 'No suitable backend available'
  };
}

export {
  CAPABILITIES,
  MODEL_CAPABILITY_PATTERNS,
  BACKEND_CAPABILITIES,
  ORCHESTRATOR_PORTS,
  inferCapabilitiesFromModelId,
  isOrchestratorModel,
  getBackendCapabilities,
  getBackendContextLimit,
  scoreCapabilityMatch,
  estimateTaskContextSize,
  isSuitableForSubagent,
  findBestBackend
};
