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
import { parseLLMJSON } from '../utils/llm-json-parser.js';

const ANALYZE_FIELD_SPECS = {
  summary: 'string',
  findings: 'array',
  confidence: 'number',
  suggestedActions: 'array'
};

export class AnalyzeFileHandler extends BaseHandler {

  constructor(context) {
    super(context);
    this.handlerType = 'analyze';
    if (this.backendRegistry) {
      this.backendRegistry.registerRoutingOverride('analyze', (ctx) => {
        const map = { general: 'local', bug: 'local', security: 'nvidia_glm', performance: 'nvidia_deepseek', architecture: 'nvidia_deepseek' };
        return map[ctx.analysisType] || null;
      });
    }
  }

  /**
   * Execute file analysis using local LLM
   * @param {Object} args - Analysis arguments
   * @param {string} args.filePath - Path to the file to analyze
   * @param {string} args.question - Question about the file
   * @param {Object} [args.options] - Optional configuration
   * @param {string} [args.options.backend] - Force specific backend (auto|local|deepseek|qwen3|gemini|groq)
   * @param {string} [args.options.modelProfile] - Model id to request from the local router (whatever your router serves)
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
      const content = await this.safeReadFile(absolutePath);
      const fileStats = await fs.stat(absolutePath);

      // 2. Verbatim line request detection — skip LLM, extract directly
      const verbatimResult = this.tryVerbatimExtraction(question, content, absolutePath, fileStats, startTime);
      if (verbatimResult) return verbatimResult;

      // 2. Read context files if provided
      const contextContents = await this.gatherContextFiles(includeContext, { maxFiles: 5, maxCharsPerFile: 10000 });

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
      const routingResult = this.selectBackend(backend, { analysisType });
      let selectedBackend = routingResult.backend;

      // 6. Smart override: Dynamic context limit detection
      // For local backend, use actual model context limit from router
      // For cloud backends, use hardcoded limits
      let contextLimit;
      let localSlotInfo = null; // Store for output token calculation
      if (selectedBackend === 'local') {
        const { charLimit, model: loadedModel, context, contextPerRequest, slots } = await this.getContextLimit();
        contextLimit = charLimit;
        localSlotInfo = { context, contextPerRequest, slots }; // Save for calculateDynamicTokens
        console.error(`[AnalyzeFile] 📊 Local model: ${loadedModel} (${contextPerRequest} tokens per request, ${slots} slots -> ${charLimit} char limit)`);
      } else {
        contextLimit = this.getBackendContextLimit(selectedBackend);
      }

      // Smart fallback logic when the assembled prompt (file content + question +
      // includeContext files + scaffolding) exceeds the backend's context limit.
      // Gating on content.length alone missed up to 50000 chars of context files
      // that buildAnalysisPrompt folds in above.
      if (prompt.length > contextLimit) {
        console.error(`[AnalyzeFile] ⚠️ Assembled prompt (${prompt.length} chars) exceeds ${selectedBackend} limit (${contextLimit} chars)`);
        const roomier = await this.findBackendWithCapacity(prompt.length, [selectedBackend]);
        if (roomier) {
          console.error(`[AnalyzeFile] 🔄 Escalating to ${roomier.name} (${roomier.cap} char limit)`);
          selectedBackend = roomier.name;
          contextLimit = roomier.cap;
        } else {
          const largest = await this.largestBackendCapacity();
          throw new Error(
            `Assembled prompt (file content plus question/context/scaffolding) is ${prompt.length} chars; ` +
            `no configured backend can hold it in one context (largest limit found: ${largest} chars). ` +
            `This tool makes a single LLM call and cannot chunk. ` +
            `Next step: narrow the call — pass a line range in the question, drop options.includeContext, ` +
            `or split the file. For several files, batch_analyze works.`
          );
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
        timeout: timeoutMs,
        disableThinking: true  // Suppress qwen3/reasoning-default thinking that
                               // burns the token budget and never closes </think>
      });

      const processingTime = Date.now() - startTime;

      // 7. Parse structured response from LLM
      const analysis = this.parseAnalysisResponse(this.extractResponseText(response));

      // 7b. Truncation detection — authoritative signal from the backend
      const finishReason = response.metadata?.finishReason || response.finish_reason;
      const wasTruncated = finishReason === 'length';

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
      return this.buildSuccessResponseWithSavings({
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
        was_truncated: wasTruncated,
        ...(wasTruncated ? {
          truncation_hint: 'Response hit the token limit; findings may be incomplete. Re-run with a narrower question or a line range, or raise options.maxResponseTokens.'
        } : {})
      }, content.length);

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
   * Parse the LLM response into structured format
   */
  parseAnalysisResponse(responseText) {
    if (typeof responseText !== 'string') {
      responseText = responseText == null ? '' : String(responseText);
    }

    // Stage 1: robust JSON extraction — handles <think> tags, markdown fences,
    // truncated/unclosed reasoning blocks, field-level recovery on partial JSON.
    const parsed = parseLLMJSON(responseText, ANALYZE_FIELD_SPECS);
    if (parsed) {
      return {
        summary: parsed.summary || 'Analysis complete',
        findings: this.sanitizeTextList(Array.isArray(parsed.findings) ? parsed.findings : [], 20),
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.75,
        suggestedActions: this.sanitizeTextList(Array.isArray(parsed.suggestedActions) ? parsed.suggestedActions : [], 10)
      };
    }

    console.error(`[AnalyzeFile] Could not parse JSON response, using prose fallback`);

    // Strip <think>...</think> from prose path too so bullet-finding works on
    // reasoning models that wrote analysis after their thinking block.
    const proseText = responseText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim() || responseText;

    const bulletFindings = proseText
      .split('\n')
      .filter(line => /^\s*[-*•]\s+/.test(line))
      .map(line => line.replace(/^\s*[-*•]\s+/, '').trim());

    if (bulletFindings.length > 0) {
      return {
        summary: proseText.substring(0, 500),
        findings: this.sanitizeTextList(bulletFindings, 20),
        confidence: 0.6,
        suggestedActions: []
      };
    }

    return {
      summary: proseText.substring(0, 500),
      findings: [],
      confidence: 0.5,
      suggestedActions: []
    };
  }

  /**
   * Calculate dynamic token allocation based on model speed and file size
   * @param {string} backendName - Backend identifier
   * @param {number} fileSize - File size in characters
   * @param {string} analysisType - Type of analysis (general|bug|security|performance|architecture)
   * @returns {number} Allocated tokens for response
   */
  calculateDynamicTokens(backendName, fileSize, analysisType, localSlotInfo = null) {
    // For local backend: size the output budget from the model's PER-REQUEST window.
    // That window covers BOTH input and output, and getLocalContextLimit already used
    // 65% of it for input, so 35% is what's left. contextPerRequest is normalized at
    // discovery time - dividing it by `slots` here would divide a second time.
    if (backendName === 'local' && localSlotInfo) {
      const { contextPerRequest, slots } = localSlotInfo;
      // Guard a missing/zero field (older or partial object) so it can't yield NaN -
      // fall through to the conservative fixed limit below instead.
      if (Number.isFinite(contextPerRequest) && contextPerRequest > 0) {
        const maxOutputTokens = Math.floor(contextPerRequest * 0.35);
        // Apply floor (1000) and ceiling (8000) for safety
        const limit = Math.max(1000, Math.min(maxOutputTokens, 8000));
        console.error(`[AnalyzeFile] 🎟️ Local output limit: ${limit} tokens (35% of ${contextPerRequest} tokens per request, ${slots} slots)`);
        return limit;
      }
    }

    // Cloud backends: Fixed limits based on TPM/cost constraints
    const backendLimits = {
      'local': 4000,           // Fallback if no slot info (conservative)
      'nvidia_deepseek': 8000, // Free tier TPM protection
      'nvidia_glm': 8000,     // Free tier TPM protection
      'gemini': 8000,          // Free tier friendly
      'groq_llama': 6000,      // Aggressive TPM limits on free tier
      'chatgpt': 4000          // Cost control (paid per token)
    };

    const limit = backendLimits[backendName] || 8000;
    console.error(`[AnalyzeFile] 🎟️ Token limit for ${backendName}: ${limit} (fixed backend limit)`);
    
    return limit;
  }

  /**
   * Detect line range requests and extract directly — no LLM needed.
   */
  tryVerbatimExtraction(question, content, absolutePath, fileStats, startTime) {
    // Match: "lines 437-490", "lines 1 to 60", "lines 437 through 490", "lines 437–490 verbatim"
    const rangeMatch = question.match(/lines?\s+(\d+)\s*(?:[-–—]|to|through)\s*(\d+)/i);
    // Match: "line 42", "what's on line 42", "at line 360"
    const singleMatch = !rangeMatch && question.match(/(?:at\s+)?lines?(\d+)(?!\s*[-–—to])/i);
    // Skip if question is analysis-oriented despite having line refs
    if (/(?:explain|how\s+does|why\s+does|what\s+does\s+\w+\s+do|purpose|walk.*through)/i.test(question)) return null;
    const match = rangeMatch || singleMatch;
    if (!match) return null;
    const start = parseInt(match[1], 10), end = match[2] ? parseInt(match[2], 10) : Math.min(start + 20, content.split('\n').length);
    const lines = content.split('\n');
    const extracted = lines.slice(start - 1, end).map((l, i) => `${start + i}: ${l}`).join('\n');
    const findings = [`Extracted lines ${start}-${end} (${end - start + 1} lines)`];
    // Verbatim mode returns the requested lines themselves (real content, not a
    // summary) — measure against the actual finished response (envelope +
    // pretty-print included) so a request that returns most/all of the file
    // correctly reports ~0 saved, not ~99%.
    return this.buildSuccessResponseWithSavings({
      filePath: absolutePath, fileSize: fileStats.size, lineCount: lines.length,
      language: this.detectLanguage(absolutePath), analysisType: 'verbatim', question,
      summary: extracted, findings,
      confidence: 1.0, suggestedActions: [], backend_used: 'direct_extraction',
      processing_time: Date.now() - startTime, was_truncated: false
    }, content.length);
  }
}

export default AnalyzeFileHandler;
