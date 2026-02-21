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
import { getLocalContextLimit } from '../utils/model-discovery.js';

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
      maxResponseTokens = null  // Will be calculated dynamically if not provided
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

      // 5. Determine the backend with smart fallback
      let selectedBackend = this.selectBackend(backend, analysisType);

      // 6. Smart override: Dynamic context limit detection
      // For local backend, use actual model context limit from router
      // For cloud backends, use hardcoded limits
      let contextLimit;
      let localSlotInfo = null; // Store for output token calculation
      if (selectedBackend === 'local') {
        const { charLimit, model: loadedModel, context, slots } = await getLocalContextLimit();
        contextLimit = charLimit;
        localSlotInfo = { context, slots }; // Save for calculateDynamicTokens
        console.error(`[AnalyzeFile] 📊 Local model: ${loadedModel} (${context} ctx / ${slots} slots = ${charLimit} char limit)`);
      } else {
        contextLimit = this.getBackendContextLimit(selectedBackend);
      }

      // Smart fallback logic when file exceeds context limit
      if (content.length > contextLimit) {
        if (selectedBackend === 'local') {
          // Local can't handle it - escalate to cloud with larger context
          console.error(`[AnalyzeFile] ⚠️ File (${content.length} chars) exceeds local limit (${contextLimit} chars)`);
          console.error(`[AnalyzeFile] 🔄 Falling back to nvidia_qwen (128K char limit)`);
          selectedBackend = 'nvidia_qwen';
          contextLimit = this.getBackendContextLimit(selectedBackend);
        } else {
          // Cloud backend can't handle it - try local as fallback (might have larger context)
          console.error(`[AnalyzeFile] ⚠️ File size (${content.length} chars) exceeds ${selectedBackend} limit (${contextLimit} chars)`);
          const { charLimit: localLimit, model: loadedModel } = await getLocalContextLimit();
          if (content.length <= localLimit) {
            console.error(`[AnalyzeFile] 🔄 Falling back to local (${localLimit} char limit via ${loadedModel})`);
            selectedBackend = 'local';
            contextLimit = localLimit;
          } else {
            // Neither can handle it - proceed with warning
            console.error(`[AnalyzeFile] ⚠️ File too large for any backend, attempting anyway`);
          }
        }
      }

      // 7. Calculate dynamic token allocation based on backend and slot context
      const allocatedTokens = maxResponseTokens || this.calculateDynamicTokens(
        selectedBackend,
        content.length,
        analysisType,
        localSlotInfo  // Pass slot info for accurate local output limits
      );

      // 7. Make request to LLM via router
      // Generous timeout for local (completeness over speed), tighter for cloud
      const estimatedSpeed = this.estimateBackendSpeed(selectedBackend);
      const baseTimeout = Math.ceil((allocatedTokens / estimatedSpeed) * 1000);
      // Local: 5 min max (let it complete), Cloud: 2 min max
      const timeoutMs = selectedBackend === 'local'
        ? Math.max(120000, Math.min(baseTimeout + 60000, 300000))  // 2-5 min for local
        : Math.max(60000, Math.min(baseTimeout + 30000, 120000)); // 1-2 min for cloud

      const response = await this.makeRequest(prompt, selectedBackend, {
        maxTokens: allocatedTokens,
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
Respond ONLY with this JSON (no explanation, no code blocks):
{"summary":"1-2 sentences max","findings":["finding1","finding2"],"confidence":0.8,"suggestedActions":["action1"]}

CRITICAL: Be BRIEF. Max 3-5 findings. No verbose explanations.
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

  /**
   * Get context limit for a backend (in characters, ~4 chars per token)
   * @param {string} backendName - Backend identifier
   * @returns {number} Context limit in characters
   */
  getBackendContextLimit(backendName) {
    // Context limits in tokens, converted to chars (~4 chars/token)
    const contextLimits = {
      'local': 512000,           // 128K tokens * 4 = 512K chars (YARN extended)
      'nvidia_deepseek': 128000, // 32K tokens * 4 = 128K chars
      'nvidia_qwen': 128000,     // 32K tokens * 4 = 128K chars
      'gemini': 128000,          // 32K tokens * 4 = 128K chars
      'groq_llama': 128000,      // 32K tokens * 4 = 128K chars
      'chatgpt': 512000          // 128K tokens * 4 = 512K chars
    };

    return contextLimits[backendName] || 128000; // Default 32K tokens
  }

  /**
   * Estimate tokens per second for a backend
   * @param {string} backendName - Backend identifier (local, nvidia_qwen, etc.)
   * @returns {number} Estimated tokens/second
   */
  estimateBackendSpeed(backendName) {
    // Backend speed estimates (tokens/sec) - used only for timeout calculation now
    // Token limits are now backend-based, not speed-based
    const backendSpeeds = {
      'local': 50,             // RTX 5080 is fast - be generous
      'nvidia_deepseek': 40,   // Cloud DeepSeek V3
      'nvidia_qwen': 35,       // Cloud Qwen3 480B
      'gemini': 50,            // Gemini Flash
      'groq_llama': 100,       // Ultra-fast Groq
      'chatgpt': 40            // OpenAI GPT-4
    };

    return backendSpeeds[backendName] || 30;
  }

  /**
   * Calculate dynamic token allocation based on model speed and file size
   * @param {string} backendName - Backend identifier
   * @param {number} fileSize - File size in characters
   * @param {string} analysisType - Type of analysis (general|bug|security|performance|architecture)
   * @returns {number} Allocated tokens for response
   */
  calculateDynamicTokens(backendName, fileSize, analysisType, localSlotInfo = null) {
    // For local backend: Calculate max output based on actual slot context
    // Each slot gets (total_context / num_slots) tokens for BOTH input AND output
    // We reserve ~35% for output after the input prompt
    if (backendName === 'local' && localSlotInfo) {
      const { context, slots } = localSlotInfo;
      const tokensPerSlot = Math.floor(context / slots);
      // Reserve 35% of slot for output (65% was used for input calculation)
      const maxOutputTokens = Math.floor(tokensPerSlot * 0.35);
      // Apply floor (1000) and ceiling (8000) for safety
      const limit = Math.max(1000, Math.min(maxOutputTokens, 8000));
      console.error(`[AnalyzeFile] 🎟️ Local output limit: ${limit} tokens (${context}ctx / ${slots}slots = ${tokensPerSlot}/slot, 35% for output)`);
      return limit;
    }

    // Cloud backends: Fixed limits based on TPM/cost constraints
    const backendLimits = {
      'local': 4000,           // Fallback if no slot info (conservative)
      'nvidia_deepseek': 8000, // Free tier TPM protection
      'nvidia_qwen': 8000,     // Free tier TPM protection
      'gemini': 8000,          // Free tier friendly
      'groq_llama': 6000,      // Aggressive TPM limits on free tier
      'chatgpt': 4000          // Cost control (paid per token)
    };

    const limit = backendLimits[backendName] || 8000;
    console.error(`[AnalyzeFile] 🎟️ Token limit for ${backendName}: ${limit} (fixed backend limit)`);
    
    return limit;
  }
}

export default AnalyzeFileHandler;
