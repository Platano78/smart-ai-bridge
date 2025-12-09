/**
 * Smart AI Bridge v1.3.0 - Role Validator
 * 
 * Validates spawn_subagent requests:
 * - Role existence
 * - Required parameters
 * - File pattern syntax
 * - Task description quality
 */

import { isValidRole, getRoleTemplate } from '../config/role-templates.js';
import { minimatch } from 'minimatch';

/**
 * Validate spawn_subagent request
 * @param {Object} params - Request parameters
 * @returns {Object} Validation result
 */
export function validateSpawnSubagentRequest(params) {
  const errors = [];
  const warnings = [];

  // Validate role
  if (!params.role) {
    errors.push('role is required');
  } else if (!isValidRole(params.role)) {
    errors.push(`Unknown role: ${params.role}`);
  }

  // Validate task
  if (!params.task) {
    errors.push('task is required');
  } else if (typeof params.task !== 'string') {
    errors.push('task must be a string');
  } else if (params.task.length < 10) {
    warnings.push('task description is very short, consider providing more detail');
  } else if (params.task.length > 10000) {
    errors.push('task description is too long (max 10000 characters)');
  }

  // Validate file_patterns (if provided)
  if (params.file_patterns) {
    if (!Array.isArray(params.file_patterns)) {
      errors.push('file_patterns must be an array');
    } else {
      for (const pattern of params.file_patterns) {
        if (typeof pattern !== 'string') {
          errors.push(`Invalid file pattern: ${pattern} (must be string)`);
        } else {
          // Validate glob syntax
          try {
            minimatch('test.js', pattern);
          } catch (error) {
            errors.push(`Invalid glob pattern: ${pattern} - ${error.message}`);
          }
        }
      }
    }
  }

  // Validate context (if provided)
  if (params.context && typeof params.context !== 'object') {
    errors.push('context must be an object');
  }

  // Validate verdict_mode
  if (params.verdict_mode && !['summary', 'full'].includes(params.verdict_mode)) {
    errors.push('verdict_mode must be "summary" or "full"');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate file patterns can match files
 * @param {string[]} patterns - Glob patterns
 * @param {string[]} files - File paths to test
 * @returns {Object} Validation result
 */
export function validateFilePatterns(patterns, files) {
  const matched = [];
  const unmatched = [];

  for (const pattern of patterns) {
    const matches = files.filter(file => minimatch(file, pattern));
    if (matches.length === 0) {
      unmatched.push(pattern);
    } else {
      matched.push({ pattern, matches: matches.slice(0, 10) }); // Limit examples
    }
  }

  return {
    hasMatches: matched.length > 0,
    matched,
    unmatched,
    totalMatches: matched.reduce((sum, m) => sum + m.matches.length, 0)
  };
}

/**
 * Suggest file patterns based on role
 * @param {string} role - Role name
 * @returns {string[]} Suggested patterns
 */
export function suggestFilePatternsForRole(role) {
  const suggestions = {
    'code-reviewer': ['**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx', '**/*.py'],
    'security-auditor': ['**/auth/**/*.js', '**/api/**/*.js', '**/middleware/**/*.js', '**/*security*.js'],
    'planner': ['**/*.md', '**/package.json', '**/README*'],
    'refactor-specialist': ['**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx'],
    'test-generator': ['**/src/**/*.js', '**/lib/**/*.js', '!**/*.test.js', '!**/*.spec.js'],
    'documentation-writer': ['**/README*', '**/docs/**/*.md', '**/*.js', '**/*.ts']
  };

  return suggestions[role] || ['**/*'];
}

/**
 * Validate task description quality
 * @param {string} task - Task description
 * @returns {Object} Quality assessment
 */
export function assessTaskQuality(task) {
  const issues = [];
  const suggestions = [];

  // Too vague
  const vagueWords = ['this', 'that', 'it', 'thing', 'stuff'];
  const hasVagueWords = vagueWords.some(word => 
    task.toLowerCase().includes(` ${word} `)
  );
  if (hasVagueWords) {
    suggestions.push('Be more specific - avoid vague references like "this" or "it"');
  }

  // Missing action verb
  const actionVerbs = ['review', 'audit', 'plan', 'refactor', 'generate', 'write', 'analyze', 'test'];
  const hasActionVerb = actionVerbs.some(verb => 
    task.toLowerCase().includes(verb)
  );
  if (!hasActionVerb) {
    suggestions.push('Start with an action verb (review, audit, plan, etc.)');
  }

  // Missing context
  if (task.length < 30) {
    suggestions.push('Provide more context - what should the subagent focus on?');
  }

  // Too generic
  const genericPhrases = ['review code', 'check security', 'write tests'];
  const isGeneric = genericPhrases.some(phrase => 
    task.toLowerCase() === phrase
  );
  if (isGeneric) {
    suggestions.push('Add specifics - which code? What aspects? What type of tests?');
  }

  return {
    quality: suggestions.length === 0 ? 'good' : suggestions.length < 2 ? 'fair' : 'poor',
    issues,
    suggestions
  };
}
