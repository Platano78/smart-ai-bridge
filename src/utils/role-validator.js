/**
 * @fileoverview Role Validator - Validate subagent roles
 * @module utils/role-validator
 */

import { getAvailableRoles, getRoleTemplate } from '../config/role-templates.js';

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether role is valid
 * @property {string} [error] - Error message if invalid
 * @property {Object} [template] - Role template if valid
 */

/**
 * Validate subagent role
 * @param {string} role - Role to validate
 * @returns {ValidationResult}
 */
function validateRole(role) {
  // Check role is provided
  if (!role || typeof role !== 'string') {
    return {
      valid: false,
      error: 'Role is required and must be a string'
    };
  }

  // Normalize role (trim whitespace, lowercase)
  const normalizedRole = role.trim().toLowerCase();

  // Check role exists
  const availableRoles = getAvailableRoles();
  if (!availableRoles.includes(normalizedRole)) {
    return {
      valid: false,
      error: `Unknown role: "${role}". Available roles: ${availableRoles.join(', ')}`
    };
  }

  // Get role template
  const template = getRoleTemplate(normalizedRole);
  if (!template) {
    return {
      valid: false,
      error: `Role template not found for: "${role}"`
    };
  }

  return {
    valid: true,
    template
  };
}

/**
 * Validate multiple roles
 * @param {string[]} roles - Array of roles to validate
 * @returns {Object} Validation results with valid/invalid roles
 */
function validateRoles(roles) {
  if (!Array.isArray(roles)) {
    return {
      valid: [],
      invalid: [],
      error: 'Roles must be an array'
    };
  }

  const valid = [];
  const invalid = [];

  for (const role of roles) {
    const result = validateRole(role);
    if (result.valid) {
      valid.push(role);
    } else {
      invalid.push({ role, error: result.error });
    }
  }

  return {
    valid,
    invalid,
    allValid: invalid.length === 0
  };
}

/**
 * Suggest similar roles if validation fails
 * @param {string} role - Invalid role
 * @returns {string[]} Similar role suggestions
 */
function suggestSimilarRoles(role) {
  if (!role) return [];

  const availableRoles = getAvailableRoles();
  const normalized = role.toLowerCase();

  // Exact substring match
  const substringMatches = availableRoles.filter(r =>
    r.includes(normalized) || normalized.includes(r)
  );

  if (substringMatches.length > 0) {
    return substringMatches;
  }

  // Levenshtein distance for fuzzy matching
  const distances = availableRoles.map(r => ({
    role: r,
    distance: levenshteinDistance(normalized, r)
  }));

  // Sort by distance and return top 3
  distances.sort((a, b) => a.distance - b.distance);
  return distances.slice(0, 3).map(d => d.role);
}

/**
 * Calculate Levenshtein distance between two strings
 * @private
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number}
 */
function levenshteinDistance(str1, str2) {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

export {
  validateRole,
  validateRoles,
  suggestSimilarRoles
};
