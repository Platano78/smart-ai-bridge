/**
 * AnalyzeFileHandler - Local LLM File Analysis
 *
 * Purpose: Local LLM reads and analyzes files. Claude never sees full content.
 * Token savings: 2000+ → ~150 tokens per file analysis
 *
 * Flow:
 * 1. Claude sends: analyze_file("auth.ts", "What are the security vulnerabilities?")
 * 2. Node.js reads file (Claude never sees it)
 * 3. Local LLM analyzes with full context
 * 4. Returns structured findings only
 */

import { BaseHandler } from './base-handler.js';
import { promises as fs } from 'fs';
import path from 'path';

// Backend selection based on analysis type complexity
const ANALYSIS_BACKEND_MAP = {
  general: 'local',      // Fast, handles most cases
  bug: 'local',          // Code understanding
  security: 'nvidia_qwen', // Deep reasoning for security
  performance: 'nvidia_deepseek', // Complex analysis
  architecture: 'nvidia_deepseek' // System-level understanding
};

export class AnalyzeFileHandler extends BaseHandler {

  /**
   * Execute file analysis using local LLM
   * @param {Object} args - Analysis arguments
   * @param {string} args.filePath - Path to the file to analyze
   * @param {string} args.question - Question about the file
   * @param {Object} [args.options] - Optional configuration
   * @param {string} [args.options.backend] - Force specific backend (auto|local|deepseek|qwen3|gemini|groq)
   * @param {string} [args.options.modelProfile] - Local router model profile (coding-qwen-7b|coding-seed-coder|fast-qwen14b|etc)
   * @param {string} [args.options.analysisType] - Type of analysis (general|bug|security|performance|architecture)
   * @param {string[]} [args.options.includeContext] - Related files for better analysis
   * @param {number} [args.options.maxResponseTokens] - Maximum tokens for response
   * @returns {Promise<Object>} Structured analysis result
   */
  async execute(args) {
    const { filePath, question, options = {} } = args;

    if (!filePath) {
      throw new Error('filePath is required');
    }
    if (!question) {
      throw new Error('question is required');
    }

    const {
      backend = 'auto',
      modelProfile = null,  // For local router model selection
      analysisType = 'general',
      includeContext = [],
      maxResponseTokens = 2000
    } = options;

    const startTime = Date.now();

    try {
      // 1. Read the target file (Claude never sees this content)
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
      const content = await fs.readFile(absolutePath, 'utf8');
      const fileStats = await fs.stat(absolutePath);

      // 2. Read context files if provided
      const contextContents = await this.gatherContextFiles(includeContext);

      // 3. Detect language for better prompting
      const language = this.detectLanguage(filePath);

      // 4. Build the analysis prompt
      const prompt = this.buildAnalysisPrompt(content, question, {
        filePath,
        language,
        analysisType,
        contextContents
      });

      // 5. Determine the backend
      const selectedBackend = this.selectBackend(backend, analysisType);

      console.error(`[AnalyzeFile] 📖 Analyzing ${filePath} (${content.length} chars)`);
      console.error(`[AnalyzeFile] 🎯 Backend: ${selectedBackend}, Type: ${analysisType}${modelProfile ? `, Model: ${modelProfile}` : ''}`);

      // 6. Make request to LLM via router
      // Use longer timeout for file analysis (local can be slow with large files)
      const timeoutMs = selectedBackend === 'local' ? 300000 : 120000; // 5min local, 2min cloud

      const response = await this.makeRequest(prompt, selectedBackend, {
        maxTokens: maxResponseTokens,
        routerModel: modelProfile,  // Pass model profile for llama-swap router
        timeout: timeoutMs
      });

      const processingTime = Date.now() - startTime;

      // 7. Parse structured response from LLM
      const analysis = this.parseAnalysisResponse(response.content || response);

      // 8. Record execution for learning
      this.recordExecution(
        {
          success: true,
          backend: selectedBackend,
          processingTime,
          fileSize: content.length,
          analysisType
        },
        {
          tool: 'analyze_file',
          taskType: analysisType,
          filePath
        }
      );

      // 9. Return structured response (NOT the full file content)
      return this.buildSuccessResponse({
        filePath: absolutePath,
        fileSize: fileStats.size,
        lineCount: content.split('\n').length,
        language,
        analysisType,
        question,
        summary: analysis.summary,
        findings: analysis.findings,
        confidence: analysis.confidence,
        suggestedActions: analysis.suggestedActions,
        backend_used: selectedBackend,
        processing_time: processingTime,
        tokens_saved: this.estimateTokensSaved(content.length)
      });

    } catch (error) {
      console.error(`[AnalyzeFile] ❌ Error: ${error.message}`);

      if (error.code === 'ENOENT') {
        return this.buildErrorResponse(`File not found: ${filePath}`);
      }
      if (error.code === 'EACCES') {
        return this.buildErrorResponse(`Permission denied: ${filePath}`);
      }

      throw error;
    }
  }

  /**
   * Gather content from context files
   */
  async gatherContextFiles(contextPaths) {
    if (!contextPaths || contextPaths.length === 0) {
      return [];
    }

    const contextContents = [];
    for (const contextPath of contextPaths.slice(0, 5)) { // Limit to 5 context files
      try {
        const absPath = path.isAbsolute(contextPath) ? contextPath : path.resolve(contextPath);
        const content = await fs.readFile(absPath, 'utf8');
        contextContents.push({
          path: contextPath,
          content: content.substring(0, 10000) // Limit per-file context
        });
      } catch (error) {
        console.error(`[AnalyzeFile] Warning: Could not read context file ${contextPath}: ${error.message}`);
      }
    }
    return contextContents;
  }

  /**
   * Build the analysis prompt for the local LLM
   */
  buildAnalysisPrompt(content, question, options) {
    const { filePath, language, analysisType, contextContents } = options;

    let prompt = `You are a senior software engineer analyzing code. Provide a structured analysis.

FILE: ${filePath}
LANGUAGE: ${language}
ANALYSIS TYPE: ${analysisType}

QUESTION: ${question}

--- FILE CONTENT ---
${content}
--- END FILE CONTENT ---
`;

    if (contextContents && contextContents.length > 0) {
      prompt += '\n--- RELATED CONTEXT FILES ---\n';
      for (const ctx of contextContents) {
        prompt += `\n=== ${ctx.path} ===\n${ctx.content}\n`;
      }
      prompt += '--- END CONTEXT ---\n';
    }

    prompt += `
Respond with a structured analysis in this EXACT JSON format:
{
  "summary": "Brief 1-2 sentence summary of findings",
  "findings": [
    "Finding 1: Specific observation or issue",
    "Finding 2: Another observation",
    "..."
  ],
  "confidence": 0.85,
  "suggestedActions": [
    "Action 1: Recommended next step",
    "Action 2: Another recommendation"
  ]
}

IMPORTANT:
- summary should be concise (1-2 sentences max)
- findings should be specific, actionable items
- confidence is 0.0 to 1.0 based on how certain you are
- suggestedActions are optional but helpful
- Only return valid JSON, no markdown code blocks
`;

    return prompt;
  }

  /**
   * Select the appropriate backend based on analysis type
   */
  selectBackend(requestedBackend, analysisType) {
    if (requestedBackend && requestedBackend !== 'auto') {
      // Map friendly names to backend identifiers
      const backendMap = {
        local: 'local',
        deepseek: 'nvidia_deepseek',
        qwen3: 'nvidia_qwen',
        gemini: 'gemini',
        groq: 'groq_llama'
      };
      return backendMap[requestedBackend] || requestedBackend;
    }

    // Auto-select based on analysis type
    return ANALYSIS_BACKEND_MAP[analysisType] || 'local';
  }

  /**
   * Parse the LLM response into structured format
   */
  parseAnalysisResponse(responseText) {
    try {
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || 'Analysis complete',
          findings: Array.isArray(parsed.findings) ? parsed.findings : [],
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.75,
          suggestedActions: Array.isArray(parsed.suggestedActions) ? parsed.suggestedActions : []
        };
      }
    } catch (error) {
      console.error(`[AnalyzeFile] Could not parse JSON response, using fallback`);
    }

    // Fallback: treat entire response as summary
    return {
      summary: responseText.substring(0, 500),
      findings: [],
      confidence: 0.5,
      suggestedActions: []
    };
  }

  /**
   * Estimate tokens saved by not sending file content to Claude
   */
  estimateTokensSaved(contentLength) {
    // Rough estimation: ~4 characters per token
    const fileTokens = Math.ceil(contentLength / 4);
    const responseTokens = 150; // Typical structured response size
    return Math.max(0, fileTokens - responseTokens);
  }
}

export default AnalyzeFileHandler;
