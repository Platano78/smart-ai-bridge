/**
 * @fileoverview Shared model-retirement classification and error builder.
 * @module backends/model-retirement
 *
 * Split out of nvidia-adapter.js so backend-adapter.js can use the same
 * classification logic without importing nvidia-adapter.js (which itself
 * imports backend-adapter.js — importing the other direction would create
 * a circular import).
 */

/**
 * A retired model is a CONFIG error — retrying never helps. Saturation
 * (429/5xx) and auth failure (401) are NOT retirement and must not be
 * reported as such.
 * @param {number} status - HTTP status code
 * @param {string} [body=''] - Response body text
 * @param {string} [model=''] - Configured model id, used to recognize
 *   "<model-id> is not found"-shaped bodies that don't otherwise use a
 *   model-ish noun.
 * @returns {boolean}
 */
export function isModelRetired(status, body = '', model = '') {
  if (status === 410) return true;
  if (status !== 404) return false;
  // Explicit retirement language is specific enough on its own.
  if (/does not exist|no longer (available|served|supported)|deprecated|end of life|retired/i.test(body)) return true;
  // "not found" alone is generic HTTP boilerplate ("Not Found"), so it only counts
  // as retirement evidence when qualified — either the body names the configured
  // model id, or it uses a model-ish noun.
  const namesModel = Boolean(model) && body.includes(model);
  return (namesModel || /\b(model|engine|deployment)\b/i.test(body)) && /not found|unavailable/i.test(body);
}

/**
 * Build a permanent, actionable error for a retired model.
 * @param {string} backendName - Backend key (e.g. "nvidia_deepseek")
 * @param {string} model - Configured model id
 * @param {number} status - HTTP status code from the failed request
 * @param {string} [body=''] - Response body text
 * @param {string[]} [catalogIds=[]] - Optional list of live model ids to suggest
 * @returns {Error} Error with `isModelRetired: true` set
 */
export function buildRetiredModelError(backendName, model, status, body = '', catalogIds = []) {
  const eol = /end of life[^."]*/i.exec(body);
  const suggestions = catalogIds.length > 0
    ? `\n\nThe provider catalog currently offers ${catalogIds.length} models, including:\n` +
      catalogIds.filter(id => /deepseek|glm|minimax|nemotron|gpt-oss|llama/i.test(id))
                 .slice(0, 8).map(id => `  - ${id}`).join('\n')
    : '\n\n(Could not reach the provider catalog to suggest replacements.)';
  const err = new Error(
    `Backend "${backendName}" is configured with model "${model}", which the provider ` +
    `no longer serves (HTTP ${status}${eol ? `; ${eol[0]}` : ''}). This is a configuration ` +
    `error, not a transient outage — retrying will not help.${suggestions}\n\n` +
    `Fix: set config.model for "${backendName}" in src/config/backends.json to a live id, ` +
    `or run \`node scripts/audit-backends.js\` to check every configured backend at once.`
  );
  err.isModelRetired = true;
  return err;
}
