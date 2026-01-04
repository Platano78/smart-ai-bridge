/**
 * Analyze File Handler - AI-powered file analysis with 90% token savings
 *
 * The local LLM reads the file and returns structured findings,
 * so Claude never sees the full file content.
 *
 * @module handlers/analyze-file-handler
 * @version 1.4.0
 */

import { promises as fs } from 'fs';
import path from 'path';
import { validatePath, safeJoin } from '../path-security.js';

/**
 * Analysis types supported
 */
const ANALYSIS_TYPES = {
  general: 'Provide a comprehensive analysis of this file including purpose, structure, and key components.',
  bug: 'Analyze this code for bugs, logic errors, and potential issues. Focus on correctness.',
  security: 'Perform a security audit. Look for vulnerabilities, injection risks, auth issues, and data exposure.',
  performance: 'Analyze for performance issues: bottlenecks, memory leaks, inefficient algorithms, N+1 queries.',
  architecture: 'Evaluate architectural patterns, coupling, cohesion, SOLID principles, and design quality.'
};

/**
 * Validates analyze_file request parameters
 * @param {Object} params - Request parameters
 * @returns {{valid: boolean, errors: string[], warnings: string[]}}
 */
export function validateAnalyzeFileRequest(params) {
  const errors = [];
  const warnings = [];

  if (!params.filePath) {
    errors.push('filePath is required');
  }

  if (!params.question) {
    errors.push('question is required');
  }

  if (params.options?.analysisType && !ANALYSIS_TYPES[params.options.analysisType]) {
    warnings.push(`Unknown analysisType '${params.options.analysisType}', using 'general'`);
  }

  if (params.options?.maxResponseTokens && params.options.maxResponseTokens > 8000) {
    warnings.push('maxResponseTokens capped at 8000');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * AnalyzeFileHandler - Offloads file reading and analysis to local LLM
 */
export class AnalyzeFileHandler {
  /**
   * @param {Object} backendRouter - Backend router/registry instance
   * @param {Object} [options] - Handler options
   */
  constructor(backendRouter, options = {}) {
    this.router = backendRouter;
    this.options = {
      maxFileSize: 500000, // 500KB
      defaultMaxTokens: 2000,
      defaultAnalysisType: 'general',
      ...options
    };
  }

  /**
   * Handle analyze_file request
   * @param {Object} params - Request parameters
   * @returns {Promise<Object>}
   */
  async handle(params) {
    // Step 1: Validate request
    const validation = validateAnalyzeFileRequest(params);
    if (!validation.valid) {
      throw new Error(`Invalid analyze_file request: ${validation.errors.join(', ')}`);
    }

    if (validation.warnings.length > 0) {
      console.error(`[analyze-file] Warnings: ${validation.warnings.join(', ')}`);
    }

    const { filePath, question, options = {} } = params;
    const analysisType = options.analysisType || this.options.defaultAnalysisType;
    const maxTokens = Math.min(options.maxResponseTokens || this.options.defaultMaxTokens, 8000);

    // Step 2: Read file (this happens on the server, not in Claude's context)
    let fileContent;
    let fileStats;
    try {
      // 🔒 PATH SECURITY - Validate against traversal attacks
      const resolvedPath = await validatePath(filePath);
      fileStats = await fs.stat(resolvedPath);

      if (fileStats.size > this.options.maxFileSize) {
        throw new Error(`File too large: ${Math.round(fileStats.size / 1024)}KB exceeds ${Math.round(this.options.maxFileSize / 1024)}KB limit`);
      }

      fileContent = await fs.readFile(resolvedPath, 'utf-8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw error;
    }

    // Step 3: Read context files if provided
    let contextContent = '';
    if (options.includeContext && options.includeContext.length > 0) {
      const contextFiles = [];
      for (const ctxPath of options.includeContext.slice(0, 5)) { // Max 5 context files
        try {
          const validatedCtxPath = await validatePath(ctxPath);
          const content = await fs.readFile(validatedCtxPath, 'utf-8');
          contextFiles.push({ path: ctxPath, content: content.slice(0, 50000) }); // Truncate large files
        } catch (error) {
          console.error(`[analyze-file] Failed to read context file ${ctxPath}: ${error.message}`);
        }
      }
      if (contextFiles.length > 0) {
        contextContent = '\n\n# RELATED FILES FOR CONTEXT\n' +
          contextFiles.map(f => `## ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n');
      }
    }

    // Step 4: Construct analysis prompt
    const analysisPrompt = ANALYSIS_TYPES[analysisType] || ANALYSIS_TYPES.general;
    const prompt = `# FILE ANALYSIS REQUEST

## File: ${filePath}
\`\`\`
${fileContent}
\`\`\`
${contextContent}

## Analysis Type: ${analysisType}
${analysisPrompt}

## Specific Question
${question}

## Response Format
Provide a structured analysis with:
1. **Summary**: 2-3 sentence overview
2. **Key Findings**: Bullet points of important discoveries
3. **Details**: Detailed analysis addressing the question
4. **Recommendations**: Actionable suggestions (if applicable)

Keep response focused and under ${maxTokens} tokens.`;

    // Step 5: Route to backend
    const backend = this._resolveBackend(options.backend);
    console.error(`[analyze-file] Analyzing ${filePath} (${Math.round(fileStats.size / 1024)}KB) on ${backend}...`);

    const startTime = Date.now();
    try {
      const result = await this.router.makeRequest(prompt, backend, {
        max_tokens: maxTokens,
        temperature: 0.3 // Lower temperature for analytical tasks
      });

      const latency = Date.now() - startTime;

      // Step 6: Return structured result
      return {
        success: true,
        filePath,
        analysisType,
        question,
        findings: result.response || result.content,
        metadata: {
          backend_used: result.backend || backend,
          file_size_bytes: fileStats.size,
          latency_ms: latency,
          tokens_used: result.tokens || 0,
          context_files: options.includeContext?.length || 0,
          // Token savings estimate: Claude would have consumed ~fileContent.length/4 tokens
          estimated_tokens_saved: Math.round(fileContent.length / 4)
        }
      };
    } catch (error) {
      console.error(`[analyze-file] Analysis failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Resolve backend with environment override support
   * @private
   */
  _resolveBackend(requestedBackend) {
    // Priority 1: Request-specific backend
    if (requestedBackend && requestedBackend !== 'auto') {
      return requestedBackend;
    }

    // Priority 2: Environment override
    const envOverride = process.env.ANALYZE_FILE_BACKEND;
    if (envOverride) {
      return envOverride;
    }

    // Priority 3: Default (local for token efficiency)
    return 'local';
  }
}

export default AnalyzeFileHandler;
