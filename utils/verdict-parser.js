/**
 * Smart AI Bridge v1.3.0 - Verdict Parser
 * 
 * Extracts structured verdicts from AI responses.
 * Handles two verdict formats:
 * 1. JSON block (```json ... ```)
 * 2. VERDICT: { ... } marker
 * 
 * Validates verdicts against role templates.
 */

/**
 * Parse verdict from AI response
 * @param {string} response - Raw AI response
 * @param {string} mode - Parsing mode: 'summary' or 'full'
 * @returns {Object|null} Parsed verdict or null
 */
export function parseVerdict(response, mode = 'summary') {
  if (!response || typeof response !== 'string') {
    return null;
  }

  // Try JSON code block first
  const jsonMatch = response.match(/```json\s*\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    try {
      const verdict = JSON.parse(jsonMatch[1]);
      return mode === 'summary' ? extractSummary(verdict) : verdict;
    } catch (error) {
      // Fall through to VERDICT: format
    }
  }

  // Try VERDICT: marker
  const verdictMatch = response.match(/VERDICT:\s*\n?({[\s\S]*?})/);
  if (verdictMatch) {
    try {
      const verdict = JSON.parse(verdictMatch[1]);
      return mode === 'summary' ? extractSummary(verdict) : verdict;
    } catch (error) {
      console.error('[VerdictParser] Failed to parse VERDICT JSON:', error.message);
      return null;
    }
  }

  // No structured verdict found
  return null;
}

/**
 * Extract summary fields from full verdict
 * @private
 */
function extractSummary(verdict) {
  // Common summary fields across all roles
  const summary = {};

  // Score fields
  if ('quality_score' in verdict) summary.quality_score = verdict.quality_score;
  if ('security_score' in verdict) summary.security_score = verdict.security_score;

  // Assessment fields
  if ('overall_assessment' in verdict) summary.overall_assessment = verdict.overall_assessment;
  if ('risk_assessment' in verdict) summary.risk_assessment = verdict.risk_assessment;

  // Priority/Complexity
  if ('complexity_estimate' in verdict) summary.complexity_estimate = verdict.complexity_estimate;
  if ('refactoring_priority' in verdict) summary.refactoring_priority = verdict.refactoring_priority;

  // Quality indicators
  if ('documentation_quality' in verdict) summary.documentation_quality = verdict.documentation_quality;
  if ('test_coverage_estimate' in verdict) summary.test_coverage_estimate = verdict.test_coverage_estimate;

  // Issue counts
  if ('issues' in verdict) summary.issue_count = verdict.issues.length;
  if ('vulnerabilities' in verdict) summary.vulnerability_count = verdict.vulnerabilities.length;
  if ('refactorings' in verdict) summary.refactoring_count = verdict.refactorings.length;

  // Key lists (truncated)
  if ('strengths' in verdict) summary.strengths = verdict.strengths.slice(0, 3);
  if ('missing_documentation' in verdict) summary.missing_documentation = verdict.missing_documentation.slice(0, 3);

  return summary;
}

/**
 * Validate verdict against expected format
 * @param {Object} verdict - Parsed verdict
 * @param {Object} expectedFormat - Expected format from role template
 * @returns {Object} Validation result
 */
export function validateVerdict(verdict, expectedFormat) {
  if (!verdict || typeof verdict !== 'object') {
    return { valid: false, errors: ['Verdict is not an object'] };
  }

  const errors = [];
  const warnings = [];

  // Check required fields
  for (const [field, type] of Object.entries(expectedFormat)) {
    if (!(field in verdict)) {
      warnings.push(`Missing expected field: ${field}`);
      continue;
    }

    const actualType = Array.isArray(verdict[field]) ? 'array' : typeof verdict[field];
    if (actualType !== type) {
      errors.push(`Field '${field}' has type '${actualType}', expected '${type}'`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Extract plain text (non-verdict) from response
 * @param {string} response - Raw AI response
 * @returns {string} Text without verdict block
 */
export function extractTextContent(response) {
  if (!response) return '';

  // Remove JSON blocks
  let text = response.replace(/```json[\s\S]*?```/g, '');
  
  // Remove VERDICT: blocks
  text = text.replace(/VERDICT:\s*\n?{[\s\S]*?}/g, '');
  
  // Clean up extra whitespace
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  
  return text;
}

/**
 * Check if response contains a verdict
 * @param {string} response - Raw AI response
 * @returns {boolean}
 */
export function hasVerdict(response) {
  if (!response || typeof response !== 'string') return false;
  
  return (
    response.includes('```json') ||
    response.includes('VERDICT:')
  );
}
