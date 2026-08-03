/**
 * @fileoverview Shared backend-type -> {endpoint, envVar} table, plus the API-key
 * resolution order. Both `scripts/audit-backends.js` (on-demand probe) and
 * `src/backends/readiness-audit.js` (boot-time audit) need identical knowledge of
 * where each backend type lives and which env var supplies its key — this module
 * is the single source of truth so the two cannot drift apart.
 *
 * Public provider URLs only. No private endpoints, no keys.
 */

export const PROVIDER_ENDPOINTS = Object.freeze({
  nvidia_deepseek: { endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions', envVar: 'NVIDIA_API_KEY' },
  nvidia_glm:      { endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions', envVar: 'NVIDIA_API_KEY' },
  nvidia_qwen:     { endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions', envVar: 'NVIDIA_API_KEY' },
  groq:            { endpoint: 'https://api.groq.com/openai/v1/chat/completions',        envVar: 'GROQ_API_KEY' },
  openai:          { endpoint: 'https://api.openai.com/v1/chat/completions',             envVar: 'OPENAI_API_KEY' },
  // Gemini's model id is part of the URL path, not a fixed endpoint — callers build
  // the full URL from config.model themselves. Only the env var is fixed here.
  gemini:          { envVar: 'GEMINI_API_KEY' },
  local:           { envVar: null },
});

/**
 * Resolve the API key for a backend, in priority order:
 *   1. config.apiKey — a literal value, or a "$VAR_NAME" reference resolved via env
 *   2. process.env[envVar] — the type-level default env var
 *   3. null — no resolvable key
 *
 * @param {object} config - backend's `config` block (may carry `apiKey`)
 * @param {string|null|undefined} envVar - type-level env var name (e.g. "NVIDIA_API_KEY")
 * @returns {string|null}
 */
export function resolveBackendKey(config, envVar) {
  if (typeof config?.apiKey === 'string' && config.apiKey.length > 0) {
    if (config.apiKey.startsWith('$')) {
      const envName = config.apiKey.slice(1);
      const envVal = process.env[envName];
      if (envVal) return envVal;
    } else {
      return config.apiKey;
    }
  }
  if (envVar) {
    const envVal = process.env[envVar];
    if (envVal) return envVal;
  }
  return null;
}
