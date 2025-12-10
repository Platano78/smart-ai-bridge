/**
 * @fileoverview Glob Parser - Resolve file glob patterns
 * @module utils/glob-parser
 */

import { glob } from 'glob';
import path from 'path';
import fs from 'fs/promises';

/**
 * Parse glob pattern and return matching file paths
 * @param {string} pattern - Glob pattern (e.g., "src/all/files.js", "alltest.ts")
 * @param {Object} [options] - Glob options
 * @param {string} [options.cwd] - Current working directory
 * @param {boolean} [options.absolute] - Return absolute paths
 * @param {number} [options.maxFiles=100] - Maximum files to return
 * @param {string[]} [options.ignore] - Patterns to ignore
 * @returns {Promise<string[]>} Array of matching file paths
 */
async function parseGlobPattern(pattern, options = {}) {
  const {
    cwd = process.cwd(),
    absolute = true,
    maxFiles = 100,
    ignore = ['node_modules/**', '.git/**', 'dist/**', 'build/**']
  } = options;

  try {
    const files = await glob(pattern, {
      cwd,
      absolute,
      ignore,
      nodir: true, // Only files, no directories
      maxDepth: 10 // Prevent infinite recursion
    });

    // Apply max files limit
    if (files.length > maxFiles) {
      console.warn(`[GlobParser] Pattern "${pattern}" matched ${files.length} files, limiting to ${maxFiles}`);
      return files.slice(0, maxFiles);
    }

    return files;

  } catch (error) {
    console.error(`[GlobParser] Failed to parse pattern "${pattern}":`, error);
    throw new Error(`Invalid glob pattern: ${error.message}`);
  }
}

/**
 * Parse multiple glob patterns
 * @param {string[]} patterns - Array of glob patterns
 * @param {Object} [options] - Glob options
 * @returns {Promise<string[]>} Deduplicated array of matching files
 */
async function parseGlobPatterns(patterns, options = {}) {
  if (!Array.isArray(patterns)) {
    throw new Error('Patterns must be an array');
  }

  const allFiles = new Set();

  for (const pattern of patterns) {
    try {
      const files = await parseGlobPattern(pattern, options);
      files.forEach(f => allFiles.add(f));
    } catch (error) {
      console.warn(`[GlobParser] Skipping invalid pattern "${pattern}":`, error.message);
    }
  }

  return Array.from(allFiles);
}

/**
 * Validate glob pattern syntax
 * @param {string} pattern - Glob pattern to validate
 * @returns {Object} Validation result
 */
function validateGlobPattern(pattern) {
  if (!pattern || typeof pattern !== 'string') {
    return {
      valid: false,
      error: 'Pattern must be a non-empty string'
    };
  }

  // Check for common invalid patterns
  const invalidPatterns = [
    { test: /\/{3,}/, error: 'Too many consecutive slashes' },
    { test: /\*{4,}/, error: 'Too many consecutive asterisks' },
    { test: /^\s*$/, error: 'Pattern cannot be whitespace only' },
    { test: /[<>"|]/, error: 'Pattern contains invalid characters' }
  ];

  for (const { test, error } of invalidPatterns) {
    if (test.test(pattern)) {
      return { valid: false, error };
    }
  }

  return { valid: true };
}

/**
 * Get file statistics for glob pattern
 * @param {string} pattern - Glob pattern
 * @param {Object} [options] - Glob options
 * @returns {Promise<Object>} Statistics about matched files
 */
async function getGlobStats(pattern, options = {}) {
  const files = await parseGlobPattern(pattern, options);

  const stats = {
    totalFiles: files.length,
    totalSize: 0,
    filesByExtension: {},
    largestFile: null,
    smallestFile: null
  };

  for (const file of files) {
    try {
      const fileStat = await fs.stat(file);
      const ext = path.extname(file);

      stats.totalSize += fileStat.size;

      if (!stats.filesByExtension[ext]) {
        stats.filesByExtension[ext] = { count: 0, totalSize: 0 };
      }
      stats.filesByExtension[ext].count++;
      stats.filesByExtension[ext].totalSize += fileStat.size;

      if (!stats.largestFile || fileStat.size > stats.largestFile.size) {
        stats.largestFile = { path: file, size: fileStat.size };
      }

      if (!stats.smallestFile || fileStat.size < stats.smallestFile.size) {
        stats.smallestFile = { path: file, size: fileStat.size };
      }

    } catch (error) {
      console.warn(`[GlobParser] Failed to stat file "${file}":`, error.message);
    }
  }

  return stats;
}

/**
 * Common glob pattern presets
 */
const GLOB_PRESETS = {
  allJavaScript: ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
  allTypeScript: ['**/*.ts', '**/*.tsx'],
  allTests: ['**/*.test.{js,ts}', '**/*.spec.{js,ts}', '**/__tests__/**/*'],
  allConfig: ['**/*.config.{js,ts}', '**/.*.{json,yml,yaml}'],
  allSource: ['src/**/*.{js,ts,jsx,tsx}'],
  allDocs: ['**/*.md', '**/*.mdx', '**/docs/**/*']
};

/**
 * Get preset glob patterns
 * @param {string} preset - Preset name
 * @returns {string[]} Glob patterns
 */
function getGlobPreset(preset) {
  return GLOB_PRESETS[preset] || [];
}

export {
  parseGlobPattern,
  parseGlobPatterns,
  validateGlobPattern,
  getGlobStats,
  getGlobPreset,
  GLOB_PRESETS
};
