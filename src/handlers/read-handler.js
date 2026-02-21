/**
 * @fileoverview ReadHandler - Intelligent file reading with token management
 * @module handlers/read-handler
 *
 * Smart context management with automatic chunking, multi-file reading,
 * and fuzzy matching verification for pre-flight edit validation.
 *
 * @deprecated Since v9.0. Use analyze_file for AI-powered analysis that saves ~90% tokens.
 * This handler still works but sends full file content to Claude, consuming tokens.
 * The new analyze_file tool routes analysis to local LLMs instead.
 */

import { BaseHandler } from './base-handler.js';
import { AnalyzeFileHandler } from './analyze-file-handler.js';
import fs from 'fs/promises';
import path from 'path';

// Map analysis_type to LLM questions
const ANALYSIS_TYPE_QUESTIONS = {
  relationships: 'Analyze this file and identify all imports, exports, dependencies, and relationships with other modules. List class inheritance, interface implementations, and external dependencies.',
  structure: 'Analyze the structure of this file. List all classes, functions, methods, interfaces, and their signatures. Include visibility modifiers and return types.',
  summary: 'Provide a concise summary of what this file does, its main purpose, and key components.',
  architecture: 'Analyze the architectural patterns used in this file. Identify design patterns, SOLID principles compliance, and potential architectural issues.'
};

class ReadHandler extends BaseHandler {
  constructor(context) {
    super(context);
    this.TOKEN_LIMIT = 24000; // Safety buffer from 25K MCP limit
    this.DEPRECATED = true;
  }

  /**
   * Execute file read operation
   * @deprecated Use analyze_file instead for ~90% token savings
   * @param {Object} args - Read arguments
   * @param {string[]} args.file_paths - Array of file paths to read
   * @param {number} [args.max_files=10] - Maximum files to read
   * @param {string} [args.analysis_type='content'] - Type of analysis
   * @param {string[]} [args.verify_texts=[]] - Texts to verify for edit validation
   * @param {string} [args.verification_mode='fuzzy'] - Verification mode
   * @param {number} [args.fuzzy_threshold=0.8] - Fuzzy match threshold
   * @returns {Promise<Object>}
   */
  async execute(args) {
    const {
      file_paths,
      max_files = 10,
      analysis_type = 'content',
      verify_texts = [],
      verification_mode = 'fuzzy',
      fuzzy_threshold = 0.8
    } = args;

    if (!file_paths || file_paths.length === 0) {
      throw new Error('file_paths is required');
    }

    // Route non-content analysis to LLM-based AnalyzeFileHandler
    if (analysis_type !== 'content' && ANALYSIS_TYPE_QUESTIONS[analysis_type]) {
      console.error(`[ReadHandler] 🔄 Routing '${analysis_type}' analysis to LLM...`);
      return this.delegateToLLMAnalysis(file_paths, analysis_type, max_files);
    }

    // For 'content' type, show deprecation warning and use legacy approach
    console.error('\x1b[33m⚠️  DEPRECATED: read() with analysis_type=content is deprecated since SAB v2.0\x1b[0m');
    console.error('\x1b[33m   Use analyze_file() for ~90% token savings.\x1b[0m');
    console.error('');

    const perFileLimit = Math.floor(this.TOKEN_LIMIT / Math.min(file_paths.length, max_files));

    const results = [];
    let totalTokensUsed = 0;
    const metadata = {
      tokenBudget: this.TOKEN_LIMIT,
      perFileLimit,
      truncationOccurred: false,
      verifyTextsProcessed: verify_texts.length,
      processingTimestamp: new Date().toISOString()
    };

    for (const filePath of file_paths.slice(0, max_files)) {
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const language = this.detectLanguage(content) || path.extname(filePath).substring(1);

        let fileResult = {
          file_path: filePath,
          size: content.length,
          lines: content.split('\n').length,
          language,
          originalTokens: this.estimateTokens(content)
        };

        // Handle different analysis types
        switch (analysis_type) {
          case 'summary':
            fileResult.content = content.substring(0, 500) + (content.length > 500 ? '...' : '');
            fileResult.finalTokens = this.estimateTokens(fileResult.content);
            break;

          case 'structure':
            const structureContent = this.extractStructuralElements(content, language);
            fileResult = {
              ...fileResult,
              ...this.truncateIntelligently(structureContent, perFileLimit, {
                language,
                verifyTexts: verify_texts,
                fuzzyThreshold: fuzzy_threshold,
                preserveContext: false
              })
            };
            break;

          case 'relationships':
            const relationshipContent = this.extractRelationships(content, language);
            fileResult = {
              ...fileResult,
              ...this.truncateIntelligently(relationshipContent, perFileLimit, {
                language,
                verifyTexts: verify_texts,
                fuzzyThreshold: fuzzy_threshold
              })
            };
            break;

          case 'content':
          default:
            fileResult = {
              ...fileResult,
              ...this.truncateIntelligently(content, perFileLimit, {
                language,
                verifyTexts: verify_texts,
                fuzzyThreshold: fuzzy_threshold,
                preserveContext: verification_mode !== 'basic'
              })
            };
            break;
        }

        if (fileResult.truncated) {
          metadata.truncationOccurred = true;
        }

        totalTokensUsed += fileResult.finalTokens || fileResult.originalTokens;
        results.push(fileResult);

      } catch (error) {
        results.push({
          file_path: filePath,
          error: error.message,
          finalTokens: 0
        });
      }
    }

    metadata.totalTokensUsed = totalTokensUsed;
    metadata.tokenEfficiency = (totalTokensUsed / this.TOKEN_LIMIT * 100).toFixed(1) + '%';

    return this.buildSuccessResponse({
      analysis_type,
      files_processed: results.length,
      results,
      metadata
    });
  }

  /**
   * Delegate analysis to LLM-based AnalyzeFileHandler
   * @private
   * @param {string[]} filePaths - Files to analyze
   * @param {string} analysisType - Type of analysis
   * @param {number} maxFiles - Maximum files to process
   * @returns {Promise<Object>}
   */
  async delegateToLLMAnalysis(filePaths, analysisType, maxFiles) {
    const analyzeHandler = new AnalyzeFileHandler(this.context);
    const question = ANALYSIS_TYPE_QUESTIONS[analysisType];
    const results = [];
    const startTime = Date.now();

    for (const filePath of filePaths.slice(0, maxFiles)) {
      try {
        const result = await analyzeHandler.execute({
          filePath,
          question,
          options: {
            backend: 'local',  // Use local LLM (free, no token cost)
            analysisType: analysisType === 'relationships' ? 'architecture' : 'general',
            maxResponseTokens: 1500  // Keep responses concise
          }
        });

        if (result.success) {
          results.push({
            file_path: filePath,
            summary: result.summary,
            findings: result.findings,
            confidence: result.confidence,
            suggestedActions: result.suggestedActions,
            backend_used: result.backend_used,
            tokens_saved: result.tokens_saved
          });
        } else {
          results.push({
            file_path: filePath,
            error: result.error || 'Analysis failed'
          });
        }
      } catch (error) {
        results.push({
          file_path: filePath,
          error: error.message
        });
      }
    }

    const totalTokensSaved = results.reduce((sum, r) => sum + (r.tokens_saved || 0), 0);

    return this.buildSuccessResponse({
      analysis_type: analysisType,
      files_processed: results.length,
      results,
      metadata: {
        llm_powered: true,
        total_tokens_saved: totalTokensSaved,
        processing_time_ms: Date.now() - startTime
      }
    });
  }

  /**
   * Extract structural elements (classes, functions, interfaces)
   * @private
   */
  extractStructuralElements(content, language) {
    const lines = content.split('\n');
    const structuralLines = [];

    const patterns = {
      javascript: /^\s*(class|function|const|let|var|export|import)\s+/,
      typescript: /^\s*(class|interface|type|function|const|let|var|export|import)\s+/,
      python: /^\s*(class|def|import|from)\s+/,
      java: /^\s*(public|private|protected)?\s*(class|interface|method|import)\s+/,
      cpp: /^\s*(class|struct|namespace|#include)\s+/,
      default: /^\s*[\w\s]*(class|function|def|import|export|namespace)\s+/
    };

    const pattern = patterns[language] || patterns.default;

    lines.forEach((line, index) => {
      if (pattern.test(line) || line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim().startsWith('*')) {
        structuralLines.push(`${index + 1}: ${line}`);
      }
    });

    return structuralLines.join('\n');
  }

  /**
   * Extract relationship information (imports, exports, dependencies)
   * @private
   */
  extractRelationships(content, language) {
    const lines = content.split('\n');
    const relationshipLines = [];

    const patterns = {
      javascript: /^\s*(import|export|require|module\.exports)/,
      typescript: /^\s*(import|export|require|module\.exports)/,
      python: /^\s*(import|from|__import__)/,
      java: /^\s*(import|package)/,
      cpp: /^\s*(#include|using|namespace)/,
      default: /^\s*(import|export|require|include|using)/
    };

    const pattern = patterns[language] || patterns.default;

    lines.forEach((line, index) => {
      if (pattern.test(line)) {
        relationshipLines.push(`${index + 1}: ${line}`);
      }
    });

    return relationshipLines.join('\n');
  }

  /**
   * Intelligently truncate content while preserving verify_texts
   * @private
   */
  truncateIntelligently(content, tokenLimit, options = {}) {
    const { language, verifyTexts = [], fuzzyThreshold = 0.8, preserveContext = true } = options;

    const contentTokens = this.estimateTokens(content);

    if (contentTokens <= tokenLimit) {
      return {
        content,
        finalTokens: contentTokens,
        truncated: false,
        verifyResults: this.verifyTexts(content, verifyTexts, fuzzyThreshold)
      };
    }

    // Find verify_texts matches to preserve
    const matches = this.findVerifyTextMatches(content, verifyTexts, fuzzyThreshold);

    // Calculate target character length
    const targetChars = tokenLimit * 4;

    let truncatedContent;
    if (matches.length > 0 && preserveContext) {
      // Preserve sections containing verify_texts
      truncatedContent = this.preserveMatchedSections(content, matches, targetChars);
    } else {
      // Simple truncation with semantic boundaries
      const boundaries = this.findSemanticBoundaries(content, language);
      truncatedContent = this.truncateAtBoundary(content, targetChars, boundaries);
    }

    return {
      content: truncatedContent,
      finalTokens: this.estimateTokens(truncatedContent),
      truncated: true,
      originalTokens: contentTokens,
      verifyResults: this.verifyTexts(truncatedContent, verifyTexts, fuzzyThreshold)
    };
  }

  /**
   * Verify texts exist in content
   * @private
   */
  verifyTexts(content, verifyTexts, threshold) {
    if (!verifyTexts || verifyTexts.length === 0) return [];

    return verifyTexts.map(text => {
      const exactMatch = content.includes(text);
      if (exactMatch) {
        return { text: text.substring(0, 50), found: true, similarity: 1.0 };
      }

      // Try fuzzy matching
      const lines = content.split('\n');
      let bestMatch = { similarity: 0, line: '' };

      for (const line of lines) {
        const similarity = this.calculateStringSimilarity(text, line);
        if (similarity > bestMatch.similarity) {
          bestMatch = { similarity, line };
        }
      }

      return {
        text: text.substring(0, 50),
        found: bestMatch.similarity >= threshold,
        similarity: bestMatch.similarity,
        closestMatch: bestMatch.similarity > 0.5 ? bestMatch.line.substring(0, 50) : null
      };
    });
  }

  /**
   * Find positions of verify_texts matches
   * @private
   */
  findVerifyTextMatches(content, verifyTexts, fuzzyThreshold) {
    if (!verifyTexts || verifyTexts.length === 0) return [];

    const matches = [];

    verifyTexts.forEach(searchText => {
      let index = content.indexOf(searchText);
      while (index !== -1) {
        matches.push({
          text: searchText,
          start: index,
          end: index + searchText.length,
          exact: true
        });
        index = content.indexOf(searchText, index + 1);
      }
    });

    return matches.sort((a, b) => a.start - b.start);
  }

  /**
   * Find semantic boundaries for intelligent truncation
   * @private
   */
  findSemanticBoundaries(content, language) {
    const boundaries = [];
    const lines = content.split('\n');

    const patterns = {
      javascript: [/^\s*(function|class|const|let|var)\s+\w+/m],
      typescript: [/^\s*(function|class|interface|type|const|let|var)\s+\w+/m],
      python: [/^\s*(def|class)\s+\w+/m],
      default: [/^\s*[\w\s]+[{(]/m]
    };

    const langPatterns = patterns[language] || patterns.default;

    lines.forEach((line, index) => {
      langPatterns.forEach(pattern => {
        if (pattern.test(line)) {
          boundaries.push({
            line: index,
            position: lines.slice(0, index).join('\n').length,
            type: 'semantic'
          });
        }
      });
    });

    return boundaries.sort((a, b) => a.position - b.position);
  }

  /**
   * Truncate at semantic boundary
   * @private
   */
  truncateAtBoundary(content, targetChars, boundaries) {
    if (boundaries.length === 0) {
      return content.substring(0, targetChars) + '\n... [truncated]';
    }

    // Find best boundary within target
    let bestBoundary = 0;
    for (const boundary of boundaries) {
      if (boundary.position < targetChars) {
        bestBoundary = boundary.position;
      } else {
        break;
      }
    }

    if (bestBoundary > 0) {
      return content.substring(0, bestBoundary) + '\n... [truncated at semantic boundary]';
    }

    return content.substring(0, targetChars) + '\n... [truncated]';
  }

  /**
   * Preserve sections containing matched texts
   * @private
   */
  preserveMatchedSections(content, matches, targetChars) {
    // Implementation for preserving sections with verify_texts
    // This is a simplified version - the full implementation would
    // preserve context around each match
    const sections = [];
    const contextChars = Math.floor(targetChars / (matches.length + 1));

    matches.forEach(match => {
      const start = Math.max(0, match.start - contextChars / 2);
      const end = Math.min(content.length, match.end + contextChars / 2);
      sections.push(content.substring(start, end));
    });

    return sections.join('\n...\n');
  }
}

export { ReadHandler };
