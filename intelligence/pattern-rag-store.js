/**
 * Smart AI Bridge v1.6.0 - Pattern RAG Store
 *
 * Lightweight pattern memory with vector-like semantic search:
 * 1. TF-IDF based similarity (no external dependencies)
 * 2. Pattern storage and retrieval
 * 3. Automatic pattern clustering
 * 4. Relevance decay over time
 *
 * Used for storing successful code patterns, solutions, and workflows
 * that can be retrieved based on semantic similarity to new queries.
 */

import fs from 'fs';
import path from 'path';

/**
 * Stop words to filter from TF-IDF
 */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'this', 'that',
  'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what',
  'which', 'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every',
  'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not',
  'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'also'
]);

/**
 * Pattern categories
 */
const PATTERN_CATEGORIES = {
  CODE: 'code',           // Code snippets and implementations
  SOLUTION: 'solution',   // Problem solutions
  WORKFLOW: 'workflow',   // Multi-step workflows
  CONFIG: 'config',       // Configuration patterns
  ERROR_FIX: 'error_fix', // Error resolution patterns
  OPTIMIZATION: 'optimization' // Performance optimizations
};

/**
 * Pattern RAG Store
 * Stores and retrieves patterns using TF-IDF similarity
 */
class PatternRAGStore {
  constructor(config = {}) {
    this.config = {
      dataDir: config.dataDir || './data/patterns',
      maxPatterns: config.maxPatterns || 1000,
      similarityThreshold: config.similarityThreshold || 0.3,
      decayEnabled: config.decayEnabled ?? true,
      decayFactor: config.decayFactor || 0.98,
      maxPatternAge: config.maxPatternAge || 90, // days
      ...config
    };

    // In-memory stores
    this.patterns = new Map();  // id -> pattern
    this.idfCache = {};         // term -> idf score
    this.documentFrequency = {}; // term -> doc count

    this._ensureDataDir();
    this._loadPatterns();
  }

  /**
   * Add a new pattern to the store
   * @param {Object} pattern - Pattern to store
   * @returns {string} Pattern ID
   */
  addPattern(pattern) {
    const {
      content,
      description,
      category = PATTERN_CATEGORIES.CODE,
      tags = [],
      metadata = {}
    } = pattern;

    if (!content || !description) {
      throw new Error('Pattern requires content and description');
    }

    const id = this._generateId();
    const tokens = this._tokenize(`${description} ${content}`);
    const tfVector = this._computeTF(tokens);

    const storedPattern = {
      id,
      content,
      description,
      category,
      tags,
      metadata,
      tokens,
      tfVector,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 0,
      relevanceScore: 1.0
    };

    this.patterns.set(id, storedPattern);
    this._updateDocumentFrequency(tokens);
    this._invalidateIdfCache();

    // Enforce max patterns limit
    if (this.patterns.size > this.config.maxPatterns) {
      this._evictLeastRelevant();
    }

    this._savePatterns();

    return id;
  }

  /**
   * Search for patterns similar to a query
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Array} Matching patterns with similarity scores
   */
  search(query, options = {}) {
    const {
      limit = 5,
      category = null,
      tags = null,
      minSimilarity = this.config.similarityThreshold
    } = options;

    if (!query) return [];

    const queryTokens = this._tokenize(query);
    const queryTF = this._computeTF(queryTokens);
    const queryTFIDF = this._computeTFIDF(queryTF);

    const results = [];

    for (const [id, pattern] of this.patterns) {
      // Filter by category if specified
      if (category && pattern.category !== category) continue;

      // Filter by tags if specified
      if (tags && !tags.some(t => pattern.tags.includes(t))) continue;

      // Compute similarity
      const patternTFIDF = this._computeTFIDF(pattern.tfVector);
      const similarity = this._cosineSimilarity(queryTFIDF, patternTFIDF);

      if (similarity >= minSimilarity) {
        // Apply relevance decay
        const decayedScore = similarity * pattern.relevanceScore;

        results.push({
          id,
          content: pattern.content,
          description: pattern.description,
          category: pattern.category,
          tags: pattern.tags,
          similarity: decayedScore,
          rawSimilarity: similarity,
          accessCount: pattern.accessCount
        });
      }
    }

    // Sort by similarity and limit
    results.sort((a, b) => b.similarity - a.similarity);
    const topResults = results.slice(0, limit);

    // Update access counts for returned patterns
    for (const result of topResults) {
      const pattern = this.patterns.get(result.id);
      if (pattern) {
        pattern.lastAccessed = Date.now();
        pattern.accessCount++;
      }
    }

    return topResults;
  }

  /**
   * Get pattern by ID
   * @param {string} id - Pattern ID
   * @returns {Object|null} Pattern or null
   */
  getPattern(id) {
    const pattern = this.patterns.get(id);
    if (pattern) {
      pattern.lastAccessed = Date.now();
      pattern.accessCount++;
      return {
        id: pattern.id,
        content: pattern.content,
        description: pattern.description,
        category: pattern.category,
        tags: pattern.tags,
        metadata: pattern.metadata,
        accessCount: pattern.accessCount
      };
    }
    return null;
  }

  /**
   * Update an existing pattern
   * @param {string} id - Pattern ID
   * @param {Object} updates - Fields to update
   * @returns {boolean} Success
   */
  updatePattern(id, updates) {
    const pattern = this.patterns.get(id);
    if (!pattern) return false;

    if (updates.content || updates.description) {
      const newText = `${updates.description || pattern.description} ${updates.content || pattern.content}`;
      const newTokens = this._tokenize(newText);
      pattern.tokens = newTokens;
      pattern.tfVector = this._computeTF(newTokens);
      this._invalidateIdfCache();
    }

    Object.assign(pattern, {
      ...updates,
      lastAccessed: Date.now()
    });

    this._savePatterns();
    return true;
  }

  /**
   * Delete a pattern
   * @param {string} id - Pattern ID
   * @returns {boolean} Success
   */
  deletePattern(id) {
    const deleted = this.patterns.delete(id);
    if (deleted) {
      this._savePatterns();
    }
    return deleted;
  }

  /**
   * Get patterns by category
   * @param {string} category - Category name
   * @returns {Array} Patterns in category
   */
  getByCategory(category) {
    const results = [];
    for (const [id, pattern] of this.patterns) {
      if (pattern.category === category) {
        results.push({
          id,
          description: pattern.description,
          tags: pattern.tags,
          accessCount: pattern.accessCount
        });
      }
    }
    return results;
  }

  /**
   * Get store statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const categoryCount = {};
    let totalAccess = 0;
    let avgRelevance = 0;

    for (const pattern of this.patterns.values()) {
      categoryCount[pattern.category] = (categoryCount[pattern.category] || 0) + 1;
      totalAccess += pattern.accessCount;
      avgRelevance += pattern.relevanceScore;
    }

    return {
      totalPatterns: this.patterns.size,
      categoryCounts: categoryCount,
      totalAccesses: totalAccess,
      averageRelevance: this.patterns.size > 0 ? avgRelevance / this.patterns.size : 0,
      vocabularySize: Object.keys(this.documentFrequency).length
    };
  }

  /**
   * Apply relevance decay to all patterns
   */
  applyDecay() {
    if (!this.config.decayEnabled) return;

    const now = Date.now();
    const maxAgeMs = this.config.maxPatternAge * 24 * 60 * 60 * 1000;
    const patternsToRemove = [];

    for (const [id, pattern] of this.patterns) {
      const age = now - pattern.lastAccessed;

      // Remove very old patterns
      if (age > maxAgeMs) {
        patternsToRemove.push(id);
        continue;
      }

      // Apply decay based on age (days)
      const ageDays = age / (24 * 60 * 60 * 1000);
      pattern.relevanceScore = Math.pow(this.config.decayFactor, ageDays);
    }

    for (const id of patternsToRemove) {
      this.patterns.delete(id);
    }

    if (patternsToRemove.length > 0) {
      console.error(`[PatternRAG] Removed ${patternsToRemove.length} stale patterns`);
      this._savePatterns();
    }
  }

  // ============ Private Methods ============

  /**
   * Generate unique pattern ID
   * @private
   */
  _generateId() {
    return `pat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Tokenize text into terms
   * @private
   */
  _tokenize(text) {
    if (!text) return [];

    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2 && !STOP_WORDS.has(token));
  }

  /**
   * Compute term frequency vector
   * @private
   */
  _computeTF(tokens) {
    const tf = {};
    for (const token of tokens) {
      tf[token] = (tf[token] || 0) + 1;
    }
    // Normalize by max frequency
    const maxFreq = Math.max(...Object.values(tf), 1);
    for (const token in tf) {
      tf[token] = tf[token] / maxFreq;
    }
    return tf;
  }

  /**
   * Compute TF-IDF vector from TF vector
   * @private
   */
  _computeTFIDF(tfVector) {
    const tfidf = {};
    for (const [term, tf] of Object.entries(tfVector)) {
      const idf = this._getIDF(term);
      tfidf[term] = tf * idf;
    }
    return tfidf;
  }

  /**
   * Get IDF score for a term
   * @private
   */
  _getIDF(term) {
    if (this.idfCache[term] !== undefined) {
      return this.idfCache[term];
    }

    const docCount = this.documentFrequency[term] || 0;
    const totalDocs = this.patterns.size || 1;
    const idf = Math.log((totalDocs + 1) / (docCount + 1)) + 1;

    this.idfCache[term] = idf;
    return idf;
  }

  /**
   * Compute cosine similarity between two TF-IDF vectors
   * @private
   */
  _cosineSimilarity(vec1, vec2) {
    const terms = new Set([...Object.keys(vec1), ...Object.keys(vec2)]);

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (const term of terms) {
      const v1 = vec1[term] || 0;
      const v2 = vec2[term] || 0;
      dotProduct += v1 * v2;
      norm1 += v1 * v1;
      norm2 += v2 * v2;
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    if (norm1 === 0 || norm2 === 0) return 0;
    return dotProduct / (norm1 * norm2);
  }

  /**
   * Update document frequency for terms
   * @private
   */
  _updateDocumentFrequency(tokens) {
    const uniqueTokens = new Set(tokens);
    for (const token of uniqueTokens) {
      this.documentFrequency[token] = (this.documentFrequency[token] || 0) + 1;
    }
  }

  /**
   * Invalidate IDF cache (call after adding patterns)
   * @private
   */
  _invalidateIdfCache() {
    this.idfCache = {};
  }

  /**
   * Evict least relevant patterns when limit exceeded
   * @private
   */
  _evictLeastRelevant() {
    const patterns = Array.from(this.patterns.entries());

    // Sort by relevance score * access count (lower = less valuable)
    patterns.sort((a, b) => {
      const scoreA = a[1].relevanceScore * Math.log(a[1].accessCount + 1);
      const scoreB = b[1].relevanceScore * Math.log(b[1].accessCount + 1);
      return scoreA - scoreB;
    });

    // Remove bottom 10%
    const removeCount = Math.ceil(this.config.maxPatterns * 0.1);
    for (let i = 0; i < removeCount && patterns.length > 0; i++) {
      this.patterns.delete(patterns[i][0]);
    }

    console.error(`[PatternRAG] Evicted ${removeCount} patterns`);
  }

  /**
   * Ensure data directory exists
   * @private
   */
  _ensureDataDir() {
    if (!fs.existsSync(this.config.dataDir)) {
      fs.mkdirSync(this.config.dataDir, { recursive: true });
    }
  }

  /**
   * Save patterns to disk
   * @private
   */
  _savePatterns() {
    try {
      const data = {
        patterns: Array.from(this.patterns.entries()),
        documentFrequency: this.documentFrequency,
        savedAt: Date.now()
      };

      const filePath = path.join(this.config.dataDir, 'patterns.json');
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[PatternRAG] Failed to save:', error.message);
    }
  }

  /**
   * Load patterns from disk
   * @private
   */
  _loadPatterns() {
    try {
      const filePath = path.join(this.config.dataDir, 'patterns.json');
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        this.patterns = new Map(data.patterns || []);
        this.documentFrequency = data.documentFrequency || {};
        console.error(`[PatternRAG] Loaded ${this.patterns.size} patterns`);
      }
    } catch (error) {
      console.error('[PatternRAG] Failed to load:', error.message);
    }
  }
}

export { PatternRAGStore, PATTERN_CATEGORIES };
export default PatternRAGStore;
