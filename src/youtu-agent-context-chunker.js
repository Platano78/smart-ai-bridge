import { promises as fs } from 'fs';
import path from 'path';

export class YoutAgentContextChunker {
  constructor(options = {}) {
    this.targetChunkSize = options.targetChunkSize || 20000;
    this.maxChunkSize = options.maxChunkSize || 25000;
    this.minChunkSize = options.minChunkSize || 5000;
    this.overlapTokens = options.overlapTokens || 200;
    this.semanticBoundaries = options.semanticBoundaries !== false;
    this.preserveStructure = options.preserveStructure !== false;
    this.fileSystem = options.fileSystem;
    
    // Performance optimization settings
    this.tokenRatio = 0.3; // Approximate tokens per character
    this.maxProcessingTime = 2000; // 2 seconds limit
    
    // Semantic patterns for different content types
    this.semanticPatterns = {
      javascript: {
        function: /(?:^|\n)(?:export\s+)?(?:async\s+)?function\s+\w+/g,
        class: /(?:^|\n)(?:export\s+)?class\s+\w+/g,
        method: /(?:^|\n)\s*(?:async\s+)?\w+\s*\([^)]*\)\s*\{/g,
        block: /\{[^{}]*\}/g
      },
      python: {
        function: /(?:^|\n)def\s+\w+/g,
        class: /(?:^|\n)class\s+\w+/g,
        method: /(?:^|\n)\s+def\s+\w+/g,
        block: /:\s*\n(?:\s+.+\n)*/g
      },
      markdown: {
        heading: /(?:^|\n)#{1,6}\s+.+/g,
        section: /(?:^|\n)#{1,6}\s+.+(?:\n(?!#{1,6}).*)*/g,
        codeBlock: /```[\s\S]*?```/g,
        list: /(?:^|\n)(?:\*|-|\d+\.)\s+.+/g
      }
    };
  }

  /**
   * Estimate token count for content (fast approximation)
   * @param {string} content - Content to estimate
   * @returns {number} Estimated token count
   */
  estimateTokenCount(content) {
    if (!content) return 0;
    // Fast approximation: ~0.3 tokens per character for code/text
    return Math.ceil(content.length * this.tokenRatio);
  }

  /**
   * Detect semantic boundaries for content type
   * @param {string} content - Content to analyze
   * @param {string} contentType - Type of content
   * @returns {Array} Array of boundary positions
   */
  detectSemanticBoundaries(content, contentType) {
    const patterns = this.semanticPatterns[contentType] || {};
    const boundaries = [];
    
    Object.entries(patterns).forEach(([type, pattern]) => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        boundaries.push({
          position: match.index,
          type: type,
          text: match[0]
        });
        // Reset regex for global matching
        if (!pattern.global) break;
      }
    });
    
    return boundaries.sort((a, b) => a.position - b.position);
  }

  /**
   * Find optimal chunk boundary near target position
   * @param {string} content - Content to analyze
   * @param {number} targetPos - Target position for boundary
   * @param {string} contentType - Type of content
   * @returns {number} Optimal boundary position
   */
  findOptimalBoundary(content, targetPos, contentType) {
    if (!this.semanticBoundaries) return targetPos;
    
    const boundaries = this.detectSemanticBoundaries(content, contentType);
    
    // Find nearest semantic boundary within reasonable distance
    const maxDistance = 2000; // Maximum distance to search for boundary
    let bestBoundary = targetPos;
    let minDistance = Infinity;
    
    for (const boundary of boundaries) {
      const distance = Math.abs(boundary.position - targetPos);
      if (distance < minDistance && distance <= maxDistance) {
        minDistance = distance;
        bestBoundary = boundary.position;
      }
    }
    
    // Ensure we don't go beyond reasonable limits
    const minPos = Math.max(0, targetPos - maxDistance);
    const maxPos = Math.min(content.length, targetPos + maxDistance);
    
    return Math.max(minPos, Math.min(maxPos, bestBoundary));
  }

  /**
   * Chunk content into optimally-sized pieces
   * @param {string} content - Content to chunk
   * @param {string} contentType - Type of content
   * @returns {Promise<Array>} Array of chunks
   */
  async chunkContent(content, contentType = 'text') {
    const startTime = performance.now();
    
    if (!content || content.trim().length === 0) {
      return [];
    }
    
    const totalTokens = this.estimateTokenCount(content);
    if (totalTokens <= this.maxChunkSize) {
      return [{
        chunkId: 0,
        content: content,
        tokenCount: totalTokens,
        type: contentType,
        metadata: {
          semanticBoundaries: this.detectSemanticBoundaries(content, contentType),
          preservedStructures: [contentType],
          boundaryQuality: 'optimal',
          semanticCoherence: 1.0
        },
        relationships: {
          dependencies: [],
          precedingChunk: null,
          followingChunk: null
        }
      }];
    }
    
    const chunks = [];
    let currentPos = 0;
    let chunkId = 0;
    
    while (currentPos < content.length) {
      // Calculate target end position
      const targetTokens = this.targetChunkSize;
      const estimatedChars = Math.ceil(targetTokens / this.tokenRatio);
      const targetEndPos = Math.min(currentPos + estimatedChars, content.length);
      
      // Find optimal boundary
      const optimalEndPos = this.findOptimalBoundary(content, targetEndPos, contentType);
      
      // Extract chunk content
      const chunkContent = content.substring(currentPos, optimalEndPos);
      const chunkTokens = this.estimateTokenCount(chunkContent);
      
      // Skip if chunk is too small (unless it's the last chunk)
      if (chunkTokens < this.minChunkSize && optimalEndPos < content.length) {
        currentPos = optimalEndPos;
        continue;
      }
      
      // Create chunk object
      const chunk = {
        chunkId: chunkId,
        content: chunkContent,
        tokenCount: chunkTokens,
        type: contentType,
        metadata: {
          semanticBoundaries: this.detectSemanticBoundaries(chunkContent, contentType),
          preservedStructures: [contentType],
          boundaryQuality: 'optimal',
          semanticCoherence: 0.9
        },
        relationships: {
          dependencies: [],
          precedingChunk: chunkId > 0 ? chunkId - 1 : null,
          followingChunk: null // Will be set for previous chunk
        }
      };
      
      // Update previous chunk's following relationship
      if (chunks.length > 0) {
        chunks[chunks.length - 1].relationships.followingChunk = chunkId;
      }
      
      chunks.push(chunk);
      chunkId++;
      
      // Move position forward with overlap consideration
      const overlap = Math.min(this.overlapTokens / this.tokenRatio, optimalEndPos - currentPos);
      currentPos = Math.max(currentPos + 1, optimalEndPos - overlap);
      
      // Safety check to prevent infinite loops
      if (currentPos >= optimalEndPos) {
        currentPos = optimalEndPos;
      }
    }
    
    const processingTime = performance.now() - startTime;
    
    // Add processing metadata to first chunk
    if (chunks.length > 0) {
      chunks[0].metadata.processingTimeMs = processingTime;
      chunks[0].metadata.totalChunks = chunks.length;
    }
    
    return chunks;
  }

  /**
   * Chunk a single file
   * @param {string} filePath - Path to file to chunk
   * @returns {Promise<Array>} Array of chunks
   */
  async chunkFile(filePath) {
    if (!this.fileSystem) {
      throw new Error('FileSystem integration required for file chunking');
    }
    
    const fileResult = await this.fileSystem.readFile(filePath);
    if (!fileResult.success) {
      throw new Error(`Failed to read file ${filePath}: ${fileResult.error}`);
    }
    
    const extension = path.extname(filePath).toLowerCase().substring(1);
    const contentType = this._mapExtensionToType(extension);
    
    const chunks = await this.chunkContent(fileResult.content, contentType);
    
    // Add file metadata to each chunk
    chunks.forEach(chunk => {
      chunk.sourceFile = filePath;
      chunk.metadata.fileExtension = extension;
      chunk.metadata.originalFileSize = fileResult.content.length;
    });
    
    return chunks;
  }

  /**
   * Chunk multiple files and track cross-file relationships
   * @param {Array} filePaths - Array of file paths
   * @returns {Promise<Object>} Object with chunks and relationships
   */
  async chunkMultipleFiles(filePaths) {
    const allChunks = [];
    const crossFileRelationships = [];
    const fileContents = new Map();
    
    // Read all files first
    for (const filePath of filePaths) {
      const fileResult = await this.fileSystem.readFile(filePath);
      if (fileResult.success) {
        fileContents.set(filePath, fileResult.content);
      }
    }
    
    // Analyze cross-file dependencies
    for (const [filePath, content] of fileContents) {
      const imports = this._extractImports(content, filePath);
      for (const imp of imports) {
        crossFileRelationships.push({
          fromFile: filePath,
          toFile: imp.path,
          type: imp.type,
          dependency: imp.name
        });
      }
    }
    
    // Chunk each file
    for (const filePath of filePaths) {
      try {
        const fileChunks = await this.chunkFile(filePath);
        allChunks.push(...fileChunks);
      } catch (error) {
        console.warn(`Failed to chunk file ${filePath}:`, error.message);
      }
    }
    
    return {
      chunks: allChunks,
      crossFileRelationships: crossFileRelationships
    };
  }

  /**
   * Reconstruct content from chunks
   * @param {Array} chunks - Array of chunks to reconstruct
   * @returns {Promise<string>} Reconstructed content
   */
  async reconstructContent(chunks) {
    if (!chunks || chunks.length === 0) {
      return '';
    }
    
    // Sort chunks by ID to ensure proper order
    const sortedChunks = [...chunks].sort((a, b) => a.chunkId - b.chunkId);
    
    // Simple reconstruction with overlap handling
    let reconstructed = '';
    let lastOverlapRemoved = 0;
    
    for (let i = 0; i < sortedChunks.length; i++) {
      const chunk = sortedChunks[i];
      let chunkContent = chunk.content;
      
      // Remove overlap from previous chunk (simple approach)
      if (i > 0) {
        const overlapSize = Math.min(this.overlapTokens / this.tokenRatio, chunkContent.length);
        chunkContent = chunkContent.substring(overlapSize);
      }
      
      reconstructed += chunkContent;
    }
    
    return reconstructed;
  }

  /**
   * Chunk content with detailed statistics
   * @param {string} content - Content to chunk
   * @param {string} contentType - Type of content
   * @returns {Promise<Object>} Result with chunks and statistics
   */
  async chunkContentWithStats(content, contentType = 'text') {
    const startTime = performance.now();
    
    const chunks = await this.chunkContent(content, contentType);
    const originalTokens = this.estimateTokenCount(content);
    
    const processingTime = performance.now() - startTime;
    
    // Calculate statistics
    const statistics = {
      totalTokens: originalTokens,
      chunkCount: chunks.length,
      averageChunkSize: chunks.length > 0 ? Math.round(originalTokens / chunks.length) : 0,
      minChunkSize: chunks.length > 0 ? Math.min(...chunks.map(c => c.tokenCount)) : 0,
      maxChunkSize: chunks.length > 0 ? Math.max(...chunks.map(c => c.tokenCount)) : 0,
      processingTimeMs: processingTime,
      preservationRate: 0.95, // Estimated preservation rate
      tokensPerSecond: processingTime > 0 ? Math.round(originalTokens / (processingTime / 1000)) : 0
    };
    
    return {
      chunks: chunks,
      statistics: statistics
    };
  }

  /**
   * Prepare chunks for MCP integration
   * @param {string} content - Content to prepare
   * @param {Object} options - Preparation options
   * @returns {Promise<Object>} MCP-ready chunk structure
   */
  async prepareMCPChunks(content, options = {}) {
    const {
      contentType = 'text',
      analysisType = 'general',
      preserveContext = true
    } = options;
    
    const chunks = await this.chunkContent(content, contentType);
    
    // Prepare MCP-specific metadata
    const mcpChunks = chunks.map((chunk, index) => ({
      ...chunk,
      mcpPromptTemplate: this._generateMCPPromptTemplate(chunk, analysisType),
      contextWindow: {
        before: index > 0 ? chunks[index - 1].content.substring(-200) : null,
        after: index < chunks.length - 1 ? chunks[index + 1].content.substring(0, 200) : null
      },
      expectedDeepSeekTokens: chunk.tokenCount
    }));
    
    return {
      chunks: mcpChunks,
      metadata: {
        totalChunks: chunks.length,
        contentType: contentType,
        analysisType: analysisType,
        recommendedProcessingOrder: Array.from({length: chunks.length}, (_, i) => i)
      },
      executionPlan: {
        strategy: 'sequential-with-context',
        estimatedProcessingTime: chunks.length * 2000, // 2s per chunk estimate
        parallelizable: false
      }
    };
  }

  /**
   * Map file extension to content type
   * @private
   * @param {string} extension - File extension
   * @returns {string} Content type
   */
  _mapExtensionToType(extension) {
    const mappings = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'javascript',
      'tsx': 'javascript',
      'py': 'python',
      'md': 'markdown',
      'txt': 'text',
      'json': 'json'
    };
    
    return mappings[extension] || 'text';
  }

  /**
   * Extract import/dependency information from content
   * @private
   * @param {string} content - File content
   * @param {string} filePath - File path for context
   * @returns {Array} Array of import objects
   */
  _extractImports(content, filePath) {
    const imports = [];
    const extension = path.extname(filePath).toLowerCase();
    
    if (extension === '.js' || extension === '.jsx' || extension === '.ts' || extension === '.tsx') {
      // JavaScript/TypeScript imports
      const importRegex = /import\s+(?:.*\s+from\s+)?['"`]([^'"`]+)['"`]/g;
      const requireRegex = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
      
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        imports.push({
          type: 'import',
          path: match[1],
          name: match[1].split('/').pop()
        });
      }
      
      while ((match = requireRegex.exec(content)) !== null) {
        imports.push({
          type: 'require',
          path: match[1],
          name: match[1].split('/').pop()
        });
      }
    } else if (extension === '.py') {
      // Python imports
      const importRegex = /(?:from\s+(\S+)\s+)?import\s+(.+)/g;
      
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        imports.push({
          type: 'import',
          path: match[1] || match[2],
          name: match[2]
        });
      }
    }
    
    return imports;
  }

  /**
   * Generate MCP prompt template for chunk
   * @private
   * @param {Object} chunk - Chunk to create template for
   * @param {string} analysisType - Type of analysis requested
   * @returns {string} MCP prompt template
   */
  _generateMCPPromptTemplate(chunk, analysisType) {
    const templates = {
      'code-review': `Please review this ${chunk.type} code chunk (${chunk.chunkId + 1}/${chunk.metadata.totalChunks || 1}):\n\n{content}\n\nFocus on: code quality, potential issues, best practices, and improvements.`,
      'general': `Please analyze this ${chunk.type} content chunk (${chunk.chunkId + 1}/${chunk.metadata.totalChunks || 1}):\n\n{content}`,
      'optimization': `Please optimize this ${chunk.type} code chunk (${chunk.chunkId + 1}/${chunk.metadata.totalChunks || 1}):\n\n{content}\n\nFocus on: performance, efficiency, and maintainability.`
    };
    
    return templates[analysisType] || templates.general;
  }
}