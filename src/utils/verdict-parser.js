/**
 * @fileoverview Verdict Parser - Extract YAML verdict from AI responses
 * @module utils/verdict-parser
 */

import yaml from 'yaml';

/**
 * @typedef {Object} Verdict
 * @property {string} status - Verdict status (APPROVE|APPROVE_WITH_CHANGES|REJECT|etc)
 * @property {number} [score] - Quality/security score (0-10)
 * @property {string} [reasoning] - Brief explanation
 * @property {string} [riskLevel] - Risk level for security audits
 * @property {Object} [raw] - Raw parsed verdict data
 */

/**
 * Parse verdict from AI response
 * @param {string} response - AI response text
 * @param {string} [mode='summary'] - Parsing mode (summary|full)
 * @returns {Verdict|null} Parsed verdict or null if not found
 */
function parseVerdict(response, mode = 'summary') {
  if (!response || typeof response !== 'string') {
    return null;
  }

  try {
    // Try to extract YAML verdict block
    const yamlVerdict = extractYamlVerdict(response);
    if (yamlVerdict) {
      return yamlVerdict;
    }

    // Fallback: Try to extract verdict from markdown
    const markdownVerdict = extractMarkdownVerdict(response);
    if (markdownVerdict) {
      return markdownVerdict;
    }

    // Last resort: Try to extract key-value pairs
    const kvVerdict = extractKeyValueVerdict(response);
    if (kvVerdict) {
      return kvVerdict;
    }

    console.warn('[VerdictParser] No verdict found in response');
    return null;

  } catch (error) {
    console.error('[VerdictParser] Failed to parse verdict:', error);
    return null;
  }
}

/**
 * Extract YAML verdict block from response
 * @private
 * @param {string} response - AI response
 * @returns {Verdict|null}
 */
function extractYamlVerdict(response) {
  // Look for YAML code blocks
  const yamlBlockRegex = /```ya?ml\n([\s\S]+?)\n```/gi;
  const matches = [...response.matchAll(yamlBlockRegex)];

  for (const match of matches) {
    try {
      const parsed = yaml.parse(match[1]);

      // Check if this looks like a verdict
      if (parsed && (parsed.verdict || parsed.status || parsed.Verdict || parsed.Status)) {
        return normalizeVerdict(parsed.verdict || parsed.Verdict || parsed);
      }
    } catch (error) {
      // Not valid YAML, continue
      continue;
    }
  }

  return null;
}

/**
 * Extract verdict from markdown section
 * @private
 * @param {string} response - AI response
 * @returns {Verdict|null}
 */
function extractMarkdownVerdict(response) {
  // Look for "### Verdict" or "## Verdict" sections
  const verdictSectionRegex = /#{2,3}\s+Verdict\s*\n([\s\S]+?)(?=\n#{2,3}|\n\n\n|$)/i;
  const match = response.match(verdictSectionRegex);

  if (!match) return null;

  const verdictText = match[1].trim();
  const verdict = {};

  // Extract key-value pairs from markdown list
  const listItemRegex = /[-*]\s+\*\*(.+?)\*\*:\s*(.+)/g;
  const items = [...verdictText.matchAll(listItemRegex)];

  for (const item of items) {
    const key = item[1].trim().toLowerCase().replace(/\s+/g, '_');
    const value = item[2].trim();
    verdict[key] = parseValue(value);
  }

  if (Object.keys(verdict).length > 0) {
    return normalizeVerdict(verdict);
  }

  return null;
}

/**
 * Extract verdict from key-value pairs
 * @private
 * @param {string} response - AI response
 * @returns {Verdict|null}
 */
function extractKeyValueVerdict(response) {
  const verdict = {};

  // Common verdict patterns
  const patterns = [
    { key: 'status', regex: /(?:Status|Verdict):\s*([A-Z_]+)/i },
    { key: 'score', regex: /(?:Score|Quality|Rating):\s*(\d+(?:\.\d+)?)\s*(?:\/\s*10)?/i },
    { key: 'reasoning', regex: /Reasoning:\s*(.+?)(?:\n|$)/i },
    { key: 'riskLevel', regex: /Risk\s+Level:\s*([A-Z]+)/i }
  ];

  for (const { key, regex } of patterns) {
    const match = response.match(regex);
    if (match) {
      verdict[key] = parseValue(match[1].trim());
    }
  }

  if (Object.keys(verdict).length > 0) {
    return normalizeVerdict(verdict);
  }

  return null;
}

/**
 * Normalize verdict to standard format
 * @private
 * @param {Object} raw - Raw verdict data
 * @returns {Verdict}
 */
function normalizeVerdict(raw) {
  const normalized = {
    status: extractStatus(raw),
    score: extractScore(raw),
    reasoning: extractReasoning(raw),
    riskLevel: extractRiskLevel(raw),
    raw
  };

  // Remove undefined fields
  Object.keys(normalized).forEach(key => {
    if (normalized[key] === undefined) {
      delete normalized[key];
    }
  });

  return normalized;
}

/**
 * Extract status field
 * @private
 */
function extractStatus(raw) {
  const statusFields = ['status', 'Status', 'verdict', 'Verdict', 'decision', 'Decision'];
  for (const field of statusFields) {
    if (raw[field]) {
      return String(raw[field]).toUpperCase();
    }
  }
  return undefined;
}

/**
 * Extract score field
 * @private
 */
function extractScore(raw) {
  const scoreFields = ['score', 'Score', 'quality_score', 'Quality Score', 'rating', 'Rating'];
  for (const field of scoreFields) {
    if (raw[field] !== undefined) {
      const score = parseFloat(raw[field]);
      return isNaN(score) ? undefined : Math.min(10, Math.max(0, score));
    }
  }
  return undefined;
}

/**
 * Extract reasoning field
 * @private
 */
function extractReasoning(raw) {
  const reasoningFields = ['reasoning', 'Reasoning', 'explanation', 'Explanation', 'rationale', 'Rationale'];
  for (const field of reasoningFields) {
    if (raw[field]) {
      return String(raw[field]);
    }
  }
  return undefined;
}

/**
 * Extract risk level field
 * @private
 */
function extractRiskLevel(raw) {
  const riskFields = ['risk_level', 'Risk Level', 'riskLevel', 'severity', 'Severity'];
  for (const field of riskFields) {
    if (raw[field]) {
      return String(raw[field]).toUpperCase();
    }
  }
  return undefined;
}

/**
 * Parse value to appropriate type
 * @private
 */
function parseValue(value) {
  if (typeof value !== 'string') return value;

  // Try to parse as number
  const num = parseFloat(value);
  if (!isNaN(num) && value.trim() === String(num)) {
    return num;
  }

  // Try to parse as boolean
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;

  return value;
}

/**
 * Validate verdict structure
 * @param {Verdict} verdict - Verdict to validate
 * @returns {Object} Validation result
 */
function validateVerdict(verdict) {
  if (!verdict || typeof verdict !== 'object') {
    return {
      valid: false,
      error: 'Verdict must be an object'
    };
  }

  if (!verdict.status) {
    return {
      valid: false,
      error: 'Verdict must have a status field'
    };
  }

  const validStatuses = [
    'APPROVE', 'APPROVE_WITH_CHANGES', 'REJECT',
    'SECURE', 'VULNERABLE', 'CRITICAL_ISSUES',
    'PASS', 'FAIL', 'WARNING'
  ];

  if (!validStatuses.includes(verdict.status)) {
    return {
      valid: false,
      error: `Invalid status: ${verdict.status}. Must be one of: ${validStatuses.join(', ')}`
    };
  }

  if (verdict.score !== undefined) {
    if (typeof verdict.score !== 'number' || verdict.score < 0 || verdict.score > 10) {
      return {
        valid: false,
        error: 'Score must be a number between 0 and 10'
      };
    }
  }

  return { valid: true };
}

export {
  parseVerdict,
  validateVerdict
};
