/**
 * ExploreHandler - Codebase Exploration Tool
 *
 * Purpose: Answer questions about a codebase using intelligent search and LLM summarization.
 * Token savings: Claude never sees raw file contents, only structured summaries.
 */

import { BaseHandler } from './base-handler.js';
import { promises as fs } from 'fs';
import path from 'path';


// Default ignore patterns for common non-code directories
const DEFAULT_IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/__pycache__/**',
  '**/*.backup.*'
];

// Common English stop words to filter out
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were',
  'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
  'can', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'where', 'why', 'how', 'what',
  'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'then', 'than', 'so', 'just', 'now', 'here', 'there',
  'when', 'while', 'if', 'because', 'as', 'until', 'although', 'unless', 'since', 'being', 'been', 'being'
]);

export class ExploreHandler extends BaseHandler {
  constructor(context) {
    super(context);
    this.handlerName = 'ExploreHandler';
    // Initialize orchestrator for intelligent pattern extraction
  }

  /**
   * Execute codebase exploration
   * @param {Object} args - Exploration arguments
   * @returns {Promise<Object>} Structured exploration result
   */
  async execute(args) {
    const { question, options = {} } = args;
    const startTime = Date.now();

    // 1. Validate inputs
    if (!question || typeof question !== 'string') {
      return this.buildErrorResponse(new Error('question is required and must be a string'));
    }

    const {
      scope = '.',
      depth = 'shallow',
      maxFiles = 20,
      backend = 'auto'
    } = options;

    try {
      // 2. Generate search patterns from question (uses orchestrator when available)
      const searchPatterns = await this.extractSearchPatterns(question);
      if (searchPatterns.length === 0) {
        return this.buildSuccessResponse({
          summary: 'Could not extract meaningful search terms from the question.',
          files_found: [],
          search_patterns: [],
          evidence: [],
          tokens_saved: 0,
          processing_time_ms: Date.now() - startTime
        });
      }

      console.error(`[ExploreHandler] Searching for patterns: ${searchPatterns.join(', ')}`);

      // 3. Find files matching scope using glob
      const files = await this.findFiles(scope, maxFiles);
      console.error(`[ExploreHandler] Found ${files.length} files to search`);

      // 4. Search files based on depth
      let findings;
      if (depth === 'deep') {
        findings = await this.performDeepSearch(files, searchPatterns, maxFiles);
      } else {
        findings = await this.performShallowSearch(files, searchPatterns, maxFiles);
      }

      // 5. Summarize findings with LLM
      const summary = await this.summarizeFindings(findings, question, depth, backend);

      const processingTime = Date.now() - startTime;

      // 6. Record for learning
      await this.recordExecution(
        { success: true, filesSearched: files.length, matchesFound: findings.evidence.length },
        { tool: 'explore', depth, scope }
      );

      return this.buildSuccessResponse({
        summary,
        files_found: findings.filesFound,
        search_patterns: searchPatterns,
        evidence: findings.evidence.slice(0, 15), // Limit evidence in response
        tokens_saved: findings.tokensSaved,
        processing_time_ms: processingTime,
        depth,
        backend_used: depth === 'deep' ? 'nvidia_qwen' : 'groq_llama'
      });

    } catch (error) {
      console.error(`[ExploreHandler] Error: ${error.message}`);
      return this.buildErrorResponse(error);
    }
  }

  /**
   * Extract meaningful search patterns from a question
   * Uses orchestrator for intelligent extraction when available
   */
  async extractSearchPatterns(question) {
    // Simple keyword extraction
    const words = question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !STOP_WORDS.has(word));

    // Also extract potential code patterns (camelCase, snake_case)
    const codePatterns = question.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
    const uniquePatterns = [...new Set([...words, ...codePatterns.map(p => p.toLowerCase())])];

    return uniquePatterns.slice(0, 10); // Limit to 10 patterns
  }

  /**
   * Find files matching scope using glob
   */
  async findFiles(scope, maxFiles) {
    const { glob } = await import('glob');
    const cwd = process.cwd();
    const resolvedScope = path.resolve(cwd, scope);

    // Check if scope is a directory or glob pattern
    let pattern;
    try {
      const stat = await fs.stat(resolvedScope);
      if (stat.isDirectory()) {
        pattern = path.join(resolvedScope, '**/*.{js,ts,jsx,tsx,py,go,rs,java,c,cpp,h,hpp,cs,rb,php}');
      } else {
        pattern = resolvedScope;
      }
    } catch {
      // Treat as glob pattern
      pattern = scope.includes('*') ? scope : path.join(scope, '**/*.{js,ts,jsx,tsx,py,go,rs}');
    }

    const files = await glob(pattern, {
      ignore: DEFAULT_IGNORE_PATTERNS,
      nodir: true,
      absolute: true
    });

    return files.slice(0, maxFiles * 2); // Get extra for filtering
  }

  /**
   * Shallow search - grep-like keyword matching
   */
  async performShallowSearch(files, patterns, maxFiles) {
    const evidence = [];
    const filesFound = new Set();
    let totalChars = 0;

    // Build regex for all patterns
    const patternRegex = new RegExp(
      patterns.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
      'gi'
    );

    for (const file of files) {
      if (filesFound.size >= maxFiles) break;

      try {
        const content = await fs.readFile(file, 'utf8');
        totalChars += content.length;
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          if (patternRegex.test(lines[i])) {
            const relativePath = path.relative(process.cwd(), file);
            evidence.push({
              file: relativePath,
              line: i + 1,
              snippet: lines[i].trim().substring(0, 150)
            });
            filesFound.add(relativePath);

            if (evidence.length >= 30) break; // Limit matches per search
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    return {
      evidence,
      filesFound: Array.from(filesFound),
      tokensSaved: Math.floor(totalChars / 4) // ~4 chars per token
    };
  }

  /**
   * Deep search - read context around matches
   */
  async performDeepSearch(files, patterns, maxFiles) {
    const evidence = [];
    const filesFound = new Set();
    let totalChars = 0;

    const patternRegex = new RegExp(
      patterns.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
      'gi'
    );

    for (const file of files) {
      if (filesFound.size >= maxFiles) break;

      try {
        const content = await fs.readFile(file, 'utf8');
        totalChars += content.length;
        const lines = content.split('\n');
        const fileMatches = [];

        for (let i = 0; i < lines.length; i++) {
          if (patternRegex.test(lines[i])) {
            // Get context: 2 lines before and after
            const startLine = Math.max(0, i - 2);
            const endLine = Math.min(lines.length - 1, i + 2);
            const context = lines.slice(startLine, endLine + 1).join('\n');

            fileMatches.push({
              line: i + 1,
              context: context.substring(0, 300)
            });
          }
        }

        if (fileMatches.length > 0) {
          const relativePath = path.relative(process.cwd(), file);
          evidence.push({
            file: relativePath,
            matches: fileMatches.slice(0, 5) // Limit matches per file
          });
          filesFound.add(relativePath);
        }
      } catch {
        // Skip unreadable files
      }
    }

    return {
      evidence,
      filesFound: Array.from(filesFound),
      tokensSaved: Math.floor(totalChars / 4)
    };
  }

  /**
   * Summarize findings using LLM
   */
  async summarizeFindings(findings, question, depth, requestedBackend) {
    if (findings.evidence.length === 0) {
      return `No matches found for: "${question}"`;
    }

    // Select backend: groq for shallow (fast), nvidia_qwen for deep (thorough)
    const backend = requestedBackend !== 'auto' 
      ? requestedBackend 
      : (depth === 'deep' ? 'nvidia_qwen' : 'groq_llama');

    // Build evidence summary for prompt
    let evidenceSummary = '';
    if (depth === 'deep') {
      for (const item of findings.evidence.slice(0, 10)) {
        evidenceSummary += `\n## ${item.file}\n`;
        for (const match of item.matches || []) {
          evidenceSummary += `Line ${match.line}:\n${match.context}\n`;
        }
      }
    } else {
      for (const item of findings.evidence.slice(0, 15)) {
        evidenceSummary += `${item.file}:${item.line} - ${item.snippet}\n`;
      }
    }

    const prompt = `Question: ${question}

Codebase search results:
${evidenceSummary}

Provide a concise answer to the question based on the search results. Include specific file locations when relevant. If the results don't fully answer the question, say what was found and what might be missing.`;

    try {
      const response = await this.makeRequest(prompt, backend, {
        maxTokens: 800,
        temperature: 0.3
      });

      // Extract content from response
      const content = response?.content || response?.choices?.[0]?.message?.content || response;
      return typeof content === 'string' ? content.trim() : 'Unable to generate summary';

    } catch (error) {
      console.error(`[ExploreHandler] Summarization failed: ${error.message}`);
      // Return a basic summary on error
      return `Found ${findings.filesFound.length} files matching the search. Top matches: ${findings.filesFound.slice(0, 5).join(', ')}`;
    }
  }
}
