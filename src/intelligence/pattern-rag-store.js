/**
 * @file PatternRAGStore module for the SAB dual-iterate system.
 * @description Stores successful code generation patterns for RAG injection into future prompts.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Stop words to filter out for better semantic matching
 */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'that', 'this', 'these', 'those', 'it', 'its', 'i', 'me', 'my',
  'we', 'us', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her',
  'they', 'them', 'their', 'what', 'which', 'who', 'whom', 'where', 'when',
  'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
  'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there'
]);

/**
 * Basic stemmer - removes common suffixes for better matching
 * @param {string} word
 * @returns {string} Stemmed word
 */
function stemWord(word) {
  if (word.length < 4) return word;

  // Common suffix patterns (order matters - check longer suffixes first)
  const suffixes = [
    'ational', 'tional', 'ization', 'fulness', 'ousness', 'iveness',
    'ement', 'ation', 'ness', 'ment', 'able', 'ible', 'ance', 'ence',
    'ing', 'ies', 'ied', 'ely', 'ous', 'ive', 'ize', 'ise',
    'ed', 'ly', 'er', 'es', 's'
  ];

  for (const suffix of suffixes) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      return word.slice(0, -suffix.length);
    }
  }

  return word;
}

/**
 * Word frequency embedding generator with stop word removal and stemming
 * @param {string} text
 * @returns {Map<string, number>} Word frequency map (sparse vector)
 */
function generateEmbedding(text) {
  const words = text.toLowerCase().match(/\b\w+\b/g) || [];

  // Filter stop words and apply stemming
  const contentWords = words
    .filter(word => !STOP_WORDS.has(word) && word.length > 1)
    .map(word => stemWord(word));

  const freqMap = new Map();
  const totalWords = contentWords.length || 1;

  contentWords.forEach(word => {
    freqMap.set(word, (freqMap.get(word) || 0) + 1 / totalWords);
  });

  return freqMap;
}

/**
 * Calculate cosine similarity between two sparse vectors (Maps)
 * @param {Map<string, number>} vecA
 * @param {Map<string, number>} vecB
 * @returns {number} Similarity score between 0 and 1
 */
function cosineSimilarity(vecA, vecB) {
  if (vecA.size === 0 || vecB.size === 0) return 0;

  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  // Calculate dot product (only for shared keys)
  for (const [key, valA] of vecA) {
    const valB = vecB.get(key) || 0;
    dotProduct += valA * valB;
    magA += valA * valA;
  }

  for (const [, valB] of vecB) {
    magB += valB * valB;
  }

  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  if (magA === 0 || magB === 0) return 0;

  const cosine = dotProduct / (magA * magB);

  // Calculate Jaccard similarity for word overlap
  const keysA = new Set(vecA.keys());
  const keysB = new Set(vecB.keys());
  const intersection = [...keysA].filter(k => keysB.has(k)).length;
  const union = new Set([...keysA, ...keysB]).size;
  const jaccard = union > 0 ? intersection / union : 0;

  // Check for subset relationship (smaller is contained in larger)
  const smaller = keysA.size <= keysB.size ? keysA : keysB;
  const larger = keysA.size > keysB.size ? keysA : keysB;
  const isSubset = [...smaller].every(k => larger.has(k));

  // If one is a subset of the other, boost similarity significantly
  // This catches "sort array" being a duplicate of "sort array ascending"
  if (isSubset && smaller.size >= 2) {
    const subsetRatio = smaller.size / larger.size;
    // If subset covers most of the larger set, it's likely a duplicate
    if (subsetRatio >= 0.5) {
      return Math.max(cosine * 0.6 + jaccard * 0.4, 0.85 + (subsetRatio - 0.5) * 0.1);
    }
  }

  // Combined score: weight cosine 60%, jaccard 40%
  return cosine * 0.6 + jaccard * 0.4;
}

/**
 * Convert Map to serializable object
 * @param {Map} map
 * @returns {Object}
 */
function mapToObject(map) {
  return Object.fromEntries(map);
}

/**
 * Convert object back to Map
 * @param {Object} obj
 * @returns {Map}
 */
function objectToMap(obj) {
  return new Map(Object.entries(obj));
}

/**
 * PatternRAGStore - Stores and retrieves successful code patterns
 */
class PatternRAGStore {
  /**
   * Create a new PatternRAGStore
   * @param {Object} options
   * @param {string} [options.storagePath] - Path to persist patterns
   * @param {number} [options.similarityThreshold=0.85] - Threshold for deduplication (0-1)
   */
  constructor(options = {}) {
    this.storagePath = options.storagePath || path.join(__dirname, '../../data/patterns.json');
    this.similarityThreshold = options.similarityThreshold || 0.85;
    this.patterns = [];
    this.initialized = false;
  }

  /**
   * Initialize the store (load existing patterns)
   * @returns {Promise<void>}
   */
  async init() {
    if (this.initialized) return;
    await this.load();
    this.initialized = true;
  }

  /**
   * Add a new pattern to the store
   * @param {Object} pattern
   * @param {string} pattern.task - Task description
   * @param {string} pattern.code - Generated code
   * @param {Object} pattern.metadata - Pattern metadata
   * @returns {Promise<Object|null>} Added pattern or null if duplicate
   */
  async addPattern(pattern) {
    const embedding = generateEmbedding(pattern.task);

    // Check for duplicates
    const isDuplicate = this.patterns.some(existingPattern => {
      const existingEmbedding = existingPattern.embedding instanceof Map
        ? existingPattern.embedding
        : objectToMap(existingPattern.embedding);
      const similarity = cosineSimilarity(embedding, existingEmbedding);
      return similarity >= this.similarityThreshold;
    });

    if (isDuplicate) {
      return null;
    }

    const newPattern = {
      id: this._generateId(),
      task: pattern.task,
      code: pattern.code,
      embedding: mapToObject(embedding),
      metadata: {
        taskType: pattern.metadata?.taskType || 'general',
        complexity: pattern.metadata?.complexity || 'medium',
        successCount: 0,
        lastUsed: Date.now(),
        createdAt: Date.now()
      }
    };

    this.patterns.push(newPattern);
    return newPattern;
  }

  /**
   * Find similar patterns based on task description
   * @param {string} task - Task description to match against
   * @param {number} [limit=3] - Maximum number of patterns to return
   * @returns {Promise<Array>} Array of similar patterns sorted by similarity
   */
  async findSimilar(task, limit = 3) {
    const taskEmbedding = generateEmbedding(task);

    const similarities = this.patterns.map(pattern => {
      const patternEmbedding = pattern.embedding instanceof Map
        ? pattern.embedding
        : objectToMap(pattern.embedding);
      return {
        pattern,
        similarity: cosineSimilarity(taskEmbedding, patternEmbedding)
      };
    });

    const sorted = similarities
      .filter(item => item.similarity > 0.1)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    // Update lastUsed timestamp
    sorted.forEach(item => {
      item.pattern.metadata.lastUsed = Date.now();
    });

    return sorted.map(item => item.pattern);
  }

  /**
   * Get patterns filtered by task type
   * @param {string} taskType - Type of task to filter by
   * @returns {Promise<Array>} Array of patterns matching the task type
   */
  async getPatternsByType(taskType) {
    return this.patterns.filter(p => p.metadata.taskType === taskType);
  }

  /**
   * Increment success count for a pattern
   * @param {string} patternId - ID of pattern to update
   * @returns {Promise<boolean>} True if pattern was found and updated
   */
  async incrementSuccess(patternId) {
    const pattern = this.patterns.find(p => p.id === patternId);
    if (pattern) {
      pattern.metadata.successCount += 1;
      pattern.metadata.lastUsed = Date.now();
      return true;
    }
    return false;
  }

  /**
   * Save patterns to persistent storage
   * @returns {Promise<void>}
   */
  async save() {
    try {
      const dir = path.dirname(this.storagePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.storagePath, JSON.stringify(this.patterns, null, 2));
    } catch (error) {
      throw new Error(`Failed to save patterns: ${error.message}`);
    }
  }

  /**
   * Load patterns from persistent storage
   * @returns {Promise<void>}
   */
  async load() {
    try {
      const data = await fs.readFile(this.storagePath, 'utf8');
      this.patterns = JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.patterns = [];
      } else {
        throw new Error(`Failed to load patterns: ${error.message}`);
      }
    }
  }

  /**
   * Get store statistics
   * @returns {Object} Statistics about stored patterns
   */
  getStats() {
    const typeCount = {};
    let totalSuccess = 0;

    this.patterns.forEach(p => {
      typeCount[p.metadata.taskType] = (typeCount[p.metadata.taskType] || 0) + 1;
      totalSuccess += p.metadata.successCount;
    });

    return {
      totalPatterns: this.patterns.length,
      patternsByType: typeCount,
      totalSuccessCount: totalSuccess,
      averageSuccessRate: this.patterns.length > 0 ? totalSuccess / this.patterns.length : 0
    };
  }

  /**
   * Generate a unique ID for patterns
   * @private
   * @returns {string} Unique ID
   */
  _generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
  }
}

export { PatternRAGStore, generateEmbedding, cosineSimilarity };
