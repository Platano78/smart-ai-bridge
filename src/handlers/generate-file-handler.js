/**
 * GenerateFileHandler - Local LLM Code Generation
 *
 * Purpose: Local LLM generates code from spec. Claude reviews or auto-approves.
 * Token savings: 500+ → ~50 tokens (spec only)
 *
 * Flow:
 * 1. Claude sends: generate_file("JWT auth middleware with rate limiting", "src/middleware/auth.ts")
 * 2. Local LLM generates production code
 * 3. If review=true → returns content for Claude approval
 * 4. If review=false → writes directly, returns summary
 */

import { BaseHandler } from './base-handler.js';
import { promises as fs } from 'fs';
import path from 'path';
import { getLocalContextLimit } from '../utils/model-discovery.js';

// Backend selection based on code complexity/type
const GENERATION_BACKEND_MAP = {
  simple: 'local',           // Quick scaffolding
  standard: 'nvidia_qwen',   // Production code
  complex: 'nvidia_deepseek', // Complex logic
  test: 'nvidia_qwen'        // Test generation
};

// Retry configuration for resilient generation
const RETRY_CONFIG = {
  maxLocalRetries: 2,           // Try local with increasing tokens
  maxDualModeIterations: 3,     // Coding + reasoning model iterations
  tokenScaleFactor: 1.5,        // Multiply tokens on retry
  cloudFallbackEnabled: true,   // Enable cloud fallback by default
  truncationThreshold: 0.7      // If output < 70% expected, likely truncated
};

export class GenerateFileHandler extends BaseHandler {

  /**
   * Execute file generation using local LLM
   * @param {Object} args - Generation arguments
   * @param {string} args.spec - Natural language specification
   * @param {string} args.outputPath - Where to write the file
   * @param {Object} [args.options] - Optional configuration
   * @param {string} [args.options.backend] - Force specific backend
   * @param {string} [args.options.modelProfile] - Local router model profile (coding-qwen-7b|coding-seed-coder|fast-qwen14b|etc)
   * @param {boolean} [args.options.review] - Return for approval (default: true)
   * @param {string[]} [args.options.contextFiles] - Related files for style/patterns
   * @param {string} [args.options.language] - Language (auto-detect if not specified)
   * @param {boolean} [args.options.includeTests] - Also generate tests
   * @returns {Promise<Object>} Generation result
   */
  async execute(args) {
    const { spec, outputPath, options = {} } = args;

    if (!spec) {
      throw new Error('spec is required');
    }
    if (!outputPath) {
      throw new Error('outputPath is required');
    }

    const {
      backend = 'auto',
      modelProfile = null,  // For local router model selection
      review = true,
      contextFiles = [],
      language = null,
      includeTests = false
    } = options;

    const startTime = Date.now();

    try {
      // 1. Resolve output path
      const absolutePath = path.isAbsolute(outputPath) ? outputPath : path.resolve(outputPath);

      // 2. Detect language from path or explicit setting
      const detectedLanguage = language || this.detectLanguage(outputPath);

      // 3. Check if file already exists
      let existingContent = null;
      try {
        existingContent = await fs.readFile(absolutePath, 'utf8');
        console.error(`[GenerateFile] ⚠️ File exists, will overwrite: ${outputPath}`);
      } catch {
        // File doesn't exist, that's fine
      }

      // 4. Gather context from related files
      const contextContents = await this.gatherContextFiles(contextFiles);

      // 5. Estimate complexity for backend selection
      const complexity = this.estimateComplexity(spec, includeTests);

      // 6. Build the generation prompt
      const prompt = this.buildGenerationPrompt(spec, {
        outputPath,
        language: detectedLanguage,
        contextContents,
        includeTests,
        existingContent
      });

      // 7. Determine the backend
      let selectedBackend = this.selectBackend(backend, complexity);

      // INPUT size limit check (local llama.cpp server configured limit)
      // Get dynamic context limit from loaded model
      const { charLimit: MAX_LOCAL_INPUT_CHARS, model: loadedModel } = await getLocalContextLimit();
      console.error(`[${this.constructor.name}] 📊 Dynamic limit: ${MAX_LOCAL_INPUT_CHARS} chars (model: ${loadedModel})`);
      if (prompt.length > MAX_LOCAL_INPUT_CHARS && selectedBackend.startsWith('local')) {
        console.error(`[GenerateFile] ⚠️ Prompt size (${prompt.length} chars) exceeds local server limit (${MAX_LOCAL_INPUT_CHARS} chars)`);
        console.error(`[GenerateFile] 🔄 Auto-fallback to nvidia_qwen (128K context)`);
        selectedBackend = 'nvidia_qwen'; // Fast cloud alternative with 128K context
      }

      console.error(`[GenerateFile] 📝 Generating ${outputPath}`);
      console.error(`[GenerateFile] 🎯 Backend: ${selectedBackend}, Language: ${detectedLanguage}${modelProfile ? `, Model: ${modelProfile}` : ''}`);
      console.error(`[GenerateFile] 📋 Spec: ${spec.substring(0, 100)}...`);

      // 8. Calculate dynamic token allocation and timeout
      const promptLength = prompt.length;
      const maxTokens = this.calculateDynamicTokens(selectedBackend, promptLength, complexity);
      const timeoutMs = this.calculateDynamicTimeout(selectedBackend, maxTokens);

      // Check if context limit exceeded
      const contextLimit = this.getBackendContextLimit(selectedBackend);
      if (promptLength > contextLimit * 0.9) { // 90% threshold
        throw new Error(
          `Generation prompt (${promptLength} chars) exceeds ${selectedBackend} context limit (${contextLimit} chars). ` +
          `Consider reducing spec, context files, or using a backend with larger context.`
        );
      }

      console.error(`[GenerateFile] 📊 Allocation: ${maxTokens} tokens, ${(timeoutMs / 1000).toFixed(1)}s timeout`);

      // 9. Execute with retry logic for truncation handling
      // Now checks BOTH finish_reason AND code structure inside the loop
      let response;
      let generated;
      let currentTokens = maxTokens;
      let attempts = 0;
      let usedBackend = selectedBackend;
      let wasTruncated = false;

      while (attempts < RETRY_CONFIG.maxLocalRetries + 1) {
        attempts++;

        response = await this.makeRequest(prompt, usedBackend, {
          maxTokens: currentTokens,
          routerModel: modelProfile,
          timeout: timeoutMs
        });

        // Parse the response immediately so we can check structure
        generated = this.parseGeneratedCode(response.content || response, detectedLanguage);

        // Check for truncation via BOTH finish_reason AND code structure
        const finishReason = response.metadata?.finishReason || response.finish_reason;
        const finishReasonTruncated = finishReason === 'length';
        const structureTruncated = this.detectCodeTruncation(generated.code, spec);
        wasTruncated = finishReasonTruncated || structureTruncated;

        if (wasTruncated) {
          const truncationSource = finishReasonTruncated ? 'finish_reason: length' : 'code structure incomplete';
          console.error(`[GenerateFile] ⚠️ Output truncated (${truncationSource}), attempt ${attempts}/${RETRY_CONFIG.maxLocalRetries + 1}`);

          // Try dual-mode iteration if available (local coding + reasoning)
          if (usedBackend === 'local' && attempts <= RETRY_CONFIG.maxLocalRetries) {
            const dualResult = await this.tryDualModeGeneration(prompt, currentTokens, modelProfile);
            if (dualResult.success && !dualResult.truncated) {
              response = dualResult.response;
              generated = this.parseGeneratedCode(response.content || response, detectedLanguage);
              // Re-check structure after dual mode
              wasTruncated = this.detectCodeTruncation(generated.code, spec);
              if (!wasTruncated) {
                console.error(`[GenerateFile] ✅ Dual-mode iteration succeeded`);
                break;
              }
            }

            // Scale up tokens for next attempt
            currentTokens = Math.min(Math.floor(currentTokens * RETRY_CONFIG.tokenScaleFactor), 16000);
            console.error(`[GenerateFile] 🔄 Scaling tokens to ${currentTokens} for retry`);
            continue;
          }

          // Cloud fallback - try cloud if local exhausted OR if already on cloud but still truncated
          if (RETRY_CONFIG.cloudFallbackEnabled) {
            if (usedBackend !== 'nvidia_qwen') {
              console.error(`[GenerateFile] 🌐 Falling back to cloud (nvidia_qwen)`);
              usedBackend = 'nvidia_qwen';
              currentTokens = Math.min(currentTokens * 2, 16000);
              continue;
            } else if (attempts <= RETRY_CONFIG.maxLocalRetries) {
              // Already on cloud, scale up tokens and retry
              currentTokens = Math.min(Math.floor(currentTokens * RETRY_CONFIG.tokenScaleFactor), 16000);
              console.error(`[GenerateFile] 🔄 Cloud retry with ${currentTokens} tokens`);
              continue;
            }
          }
        }

        break; // Success or exhausted retries
      }

      const processingTime = Date.now() - startTime;

      // 11. Handle review mode (default)
      if (review) {
        this.recordExecution(
          {
            success: true,
            backend: usedBackend,
            processingTime,
            mode: 'review',
            retryAttempts: attempts,
            wasTruncated
          },
          {
            tool: 'generate_file',
            taskType: 'generation',
            outputPath
          }
        );

        return this.buildSuccessResponse({
          status: wasTruncated ? 'pending_review_truncated' : 'pending_review',
          outputPath: absolutePath,
          content: generated.code,
          summary: generated.summary,
          linesOfCode: generated.code.split('\n').length,
          language: detectedLanguage,
          tests: generated.tests,
          backend_used: usedBackend,
          processing_time: processingTime,
          retry_attempts: attempts,
          was_truncated: wasTruncated,
          instructions: wasTruncated
            ? 'WARNING: Output may be truncated. Review carefully and consider regenerating with simpler spec.'
            : 'Review the generated code. Use write_files_atomic to save or modify as needed.'
        });
      }

      // 12. Auto-write mode (review=false)
      // Ensure directory exists
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, generated.code, 'utf8');

      // Write tests if generated
      if (includeTests && generated.tests) {
        const testPath = this.getTestPath(absolutePath);
        await fs.mkdir(path.dirname(testPath), { recursive: true });
        await fs.writeFile(testPath, generated.tests, 'utf8');
      }

      this.recordExecution(
        {
          success: true,
          backend: usedBackend,
          processingTime,
          mode: 'write',
          retryAttempts: attempts,
          wasTruncated
        },
        {
          tool: 'generate_file',
          taskType: 'generation',
          outputPath
        }
      );

      return this.buildSuccessResponse({
        status: wasTruncated ? 'written_truncated' : 'written',
        outputPath: absolutePath,
        summary: generated.summary,
        linesOfCode: generated.code.split('\n').length,
        language: detectedLanguage,
        testPath: includeTests && generated.tests ? this.getTestPath(absolutePath) : null,
        backend_used: usedBackend,
        processing_time: processingTime,
        retry_attempts: attempts,
        was_truncated: wasTruncated
      });

    } catch (error) {
      console.error(`[GenerateFile] ❌ Error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Gather content from context files for style matching
   */
  async gatherContextFiles(contextPaths) {
    if (!contextPaths || contextPaths.length === 0) {
      return [];
    }

    const contextContents = [];
    for (const contextPath of contextPaths.slice(0, 3)) { // Limit to 3 context files
      try {
        const absPath = path.isAbsolute(contextPath) ? contextPath : path.resolve(contextPath);
        const content = await fs.readFile(absPath, 'utf8');
        contextContents.push({
          path: contextPath,
          content: content.substring(0, 8000) // Limit per-file context
        });
      } catch (error) {
        console.error(`[GenerateFile] Warning: Could not read context file ${contextPath}: ${error.message}`);
      }
    }
    return contextContents;
  }

  /**
   * Build the generation prompt for the LLM
   */
  buildGenerationPrompt(spec, options) {
    const { outputPath, language, contextContents, includeTests, existingContent } = options;

    let prompt = `You are a senior software engineer. Generate production-ready code based on this specification.

SPECIFICATION: ${spec}

OUTPUT FILE: ${outputPath}
LANGUAGE: ${language}
${includeTests ? 'GENERATE TESTS: Yes' : ''}
`;

    if (existingContent) {
      prompt += `
--- EXISTING FILE (will be replaced) ---
${existingContent.substring(0, 5000)}
--- END EXISTING ---
`;
    }

    if (contextContents && contextContents.length > 0) {
      prompt += '\n--- STYLE REFERENCE FILES ---\n';
      prompt += 'Match the coding style, patterns, and conventions from these files:\n';
      for (const ctx of contextContents) {
        prompt += `\n=== ${ctx.path} ===\n${ctx.content}\n`;
      }
      prompt += '--- END REFERENCE ---\n';
    }

    prompt += `
REQUIREMENTS:
1. Generate complete, working, production-ready code
2. Include necessary imports and dependencies
3. Add appropriate error handling
4. Include JSDoc/docstrings for public APIs
5. Follow best practices for ${language}
6. Code should be ready to use without modification

Respond with the following structure:

SUMMARY: [1-2 sentence description of what was generated]

CODE:
\`\`\`${language}
[Your generated code here]
\`\`\`
`;

    if (includeTests) {
      prompt += `
TESTS:
\`\`\`${language}
[Your generated test code here]
\`\`\`
`;
    }

    return prompt;
  }

  /**
   * Estimate complexity for backend selection
   */
  estimateComplexity(spec, includeTests) {
    const lowerSpec = spec.toLowerCase();

    // Check for complex patterns
    const complexPatterns = [
      'algorithm', 'oauth', 'authentication', 'encryption',
      'database', 'migration', 'websocket', 'real-time',
      'concurrent', 'async', 'streaming', 'cache'
    ];

    const simplePatterns = [
      'utility', 'helper', 'constant', 'config',
      'type', 'interface', 'enum', 'model'
    ];

    const hasComplex = complexPatterns.some(p => lowerSpec.includes(p));
    const hasSimple = simplePatterns.some(p => lowerSpec.includes(p));

    if (hasComplex || includeTests) return 'complex';
    if (hasSimple) return 'simple';
    return 'standard';
  }

  /**
   * Select the appropriate backend
   */
  selectBackend(requestedBackend, complexity) {
    if (requestedBackend && requestedBackend !== 'auto') {
      const backendMap = {
        local: 'local',
        deepseek: 'nvidia_deepseek',
        qwen3: 'nvidia_qwen',
        gemini: 'gemini',
        groq: 'groq_llama'
      };
      return backendMap[requestedBackend] || requestedBackend;
    }

    return GENERATION_BACKEND_MAP[complexity] || 'local';
  }

  /**
   * Parse the LLM response to extract code and tests
   */
  parseGeneratedCode(responseText, language) {
    let summary = 'Code generated successfully';
    let code = '';
    let tests = null;

    // Extract summary
    const summaryMatch = responseText.match(/SUMMARY:\s*(.+?)(?=\n\nCODE:|CODE:|\n```)/is);
    if (summaryMatch) {
      summary = summaryMatch[1].trim();
    }

    // Extract main code block
    const codePattern = new RegExp(`CODE:\\s*\`\`\`(?:${language})?\\n([\\s\\S]*?)\`\`\``, 'i');
    const codeMatch = responseText.match(codePattern);
    if (codeMatch) {
      code = codeMatch[1].trim();
    } else {
      // Try to find any code block
      const anyCodeMatch = responseText.match(/```(?:\w+)?\n([\s\S]*?)```/);
      if (anyCodeMatch) {
        code = anyCodeMatch[1].trim();
      } else {
        // Last resort: treat entire response as code (excluding SUMMARY line)
        code = responseText.replace(/SUMMARY:.*\n?/i, '').trim();
      }
    }

    // Extract test code block
    const testPattern = new RegExp(`TESTS:\\s*\`\`\`(?:${language})?\\n([\\s\\S]*?)\`\`\``, 'i');
    const testMatch = responseText.match(testPattern);
    if (testMatch) {
      tests = testMatch[1].trim();
    }

    return { summary, code, tests };
  }

  /**
   * Get the test file path based on source file
   */
  getTestPath(sourcePath) {
    const dir = path.dirname(sourcePath);
    const ext = path.extname(sourcePath);
    const base = path.basename(sourcePath, ext);

    // Common test file naming conventions
    return path.join(dir, '__tests__', `${base}.test${ext}`);
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
      'local': 512000,     // Same - dual mode local
      'local': 512000,     // Same - dual mode local
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
    // Backend speed estimates (tokens/sec)
    const backendSpeeds = {
      'local': 20,           // Conservative estimate for local models
      'nvidia_deepseek': 40, // Cloud DeepSeek V3
      'nvidia_qwen': 35,     // Cloud Qwen3 480B
      'gemini': 50,          // Gemini Flash
      'groq_llama': 80,      // Ultra-fast Groq
      'chatgpt': 40          // OpenAI GPT-4
    };

    return backendSpeeds[backendName] || 20; // Default 20 tokens/sec
  }

  /**
   * Calculate dynamic token allocation based on backend speed, generation complexity,
   * and REMAINING context window (to prevent overflow)
   * @param {string} backendName - Backend identifier
   * @param {number} promptSize - Prompt size in characters
   * @param {string} complexity - Generation complexity (simple|standard|complex)
   * @returns {number} Allocated tokens for response
   */
  calculateDynamicTokens(backendName, promptSize, complexity) {
    // INCREASED base tokens for generation (council recommended)
    const baseTokens = {
      simple: 1500,     // Was 800 - Simple functions, utilities
      standard: 3000,   // Was 1500 - Standard components, classes
      complex: 5000     // Was 2500 - Complex features, multiple files
    };

    // Get base allocation for this complexity level
    let allocation = baseTokens[complexity] || baseTokens.standard;

    // Scale up for larger prompts (more context = potentially more code)
    const promptTokens = Math.ceil(promptSize / 4);
    if (promptTokens > 2000) {
      allocation = Math.min(allocation * 1.5, 8000); // Cap at 8K for very large specs (was 4K)
    }

    // Backend-specific adjustments
    const tokensPerSecond = this.estimateBackendSpeed(backendName);
    if (tokensPerSecond < 25) {
      // Slower backends (local) - reduce allocation slightly
      allocation = Math.floor(allocation * 0.9);
    } else if (tokensPerSecond > 60) {
      // Very fast backends (groq) - can handle more
      allocation = Math.floor(allocation * 1.2);
    }

    // SMART REMAINING CONTEXT CALCULATION (council recommended)
    // Don't request more tokens than the backend can provide
    const contextLimit = this.getBackendContextLimit(backendName);
    const safetyBuffer = 4000; // ~1000 tokens safety margin
    const maxPossible = Math.floor((contextLimit - promptSize - safetyBuffer) / 4); // chars to tokens

    // Cap allocation at what's physically possible
    if (maxPossible > 0 && allocation > maxPossible) {
      console.error(`[GenerateFile] 📊 Capping tokens from ${allocation} to ${maxPossible} (context limit)`);
      allocation = maxPossible;
    }

    // Ensure minimum and maximum bounds (increased max from 8000 to 16000)
    return Math.max(1500, Math.min(allocation, 16000));
  }

  /**
   * Calculate dynamic timeout based on backend speed and allocated tokens
   * @param {string} backendName - Backend identifier
   * @param {number} maxTokens - Allocated response tokens
   * @returns {number} Timeout in milliseconds
   */
  calculateDynamicTimeout(backendName, maxTokens) {
    const tokensPerSecond = this.estimateBackendSpeed(backendName);

    // Estimated generation time + 50% buffer + 10s base overhead
    const estimatedSeconds = (maxTokens / tokensPerSecond) * 1.5 + 10;

    // Ensure minimum 30s, maximum 5min
    const timeoutSeconds = Math.max(30, Math.min(estimatedSeconds, 300));

    return Math.floor(timeoutSeconds * 1000);
  }

  /**
   * Try dual-mode generation: coding model generates, reasoning model reviews/fixes
   * This leverages both local models for iteration before falling back to cloud
   * @param {string} prompt - Generation prompt
   * @param {number} tokens - Token allocation
   * @param {string} modelProfile - Optional router model profile
   * @returns {Promise<{success: boolean, response: Object, truncated: boolean}>}
   */
  async tryDualModeGeneration(prompt, tokens, modelProfile) {
    try {
      // Check if dual mode is available (ports 8087 coding, 8088 reasoning)
      const dualAvailable = await this.checkDualModeAvailable();
      if (!dualAvailable) {
        return { success: false, response: null, truncated: true };
      }

      console.error('[GenerateFile] 🔄 Attempting dual-mode iteration (coding + reasoning)');

      // Step 1: Generate with coding model (port 8087)
      const scaledTokens = Math.min(tokens * RETRY_CONFIG.tokenScaleFactor, 12000);
      const codingResponse = await this.makeRequest(prompt, 'local', {
        maxTokens: scaledTokens,
        routerModel: modelProfile,
        timeout: 120000
      });

      const codingFinishReason = codingResponse.metadata?.finishReason;
      if (codingFinishReason === 'length') {
        // Still truncated, but let reasoning model try to complete
        console.error('[GenerateFile] 🔄 Coding model truncated, trying reasoning model to complete');
      }

      const codingCode = codingResponse.content || codingResponse;

      // Step 2: Have reasoning model review and potentially fix/complete
      const reviewPrompt = `Review and complete this code if it appears truncated or incomplete.
If the code looks complete, return it unchanged.
If it's truncated, complete the remaining parts following the same patterns.

ORIGINAL SPECIFICATION:
${prompt.substring(0, 2000)}...

GENERATED CODE:
${codingCode}

If complete, respond with:
STATUS: COMPLETE
CODE:
\`\`\`
[the code]
\`\`\`

If needs completion, respond with:
STATUS: COMPLETED
CODE:
\`\`\`
[the full completed code]
\`\`\``;

      const reviewResponse = await this.makeRequest(reviewPrompt, 'local', {
        maxTokens: scaledTokens,
        timeout: 120000
      });

      const reviewText = reviewResponse.content || reviewResponse;
      const reviewFinishReason = reviewResponse.metadata?.finishReason;

      // Parse the review response
      const statusMatch = reviewText.match(/STATUS:\s*(COMPLETE|COMPLETED)/i);
      const codeMatch = reviewText.match(/CODE:\s*```[\w]*\n([\s\S]*?)```/i);

      if (codeMatch) {
        return {
          success: true,
          response: {
            content: codeMatch[1].trim(),
            metadata: {
              ...reviewResponse.metadata,
              dualModeUsed: true,
              codingModel: 'local',
              reasoningModel: 'local'
            }
          },
          truncated: reviewFinishReason === 'length'
        };
      }

      // Fallback: return the coding response
      return {
        success: true,
        response: codingResponse,
        truncated: codingFinishReason === 'length'
      };

    } catch (error) {
      console.error(`[GenerateFile] ⚠️ Dual-mode failed: ${error.message}`);
      return { success: false, response: null, truncated: true };
    }
  }

  /**
   * Check if dual-mode local backends are available
   * @returns {Promise<boolean>}
   */
  async checkDualModeAvailable() {
    try {
      // Quick health check on dual ports
      const checks = await Promise.all([
        fetch('http://localhost:8087/health', { signal: AbortSignal.timeout(1000) }).catch(() => null),
        fetch('http://localhost:8088/health', { signal: AbortSignal.timeout(1000) }).catch(() => null)
      ]);

      return checks[0]?.ok && checks[1]?.ok;
    } catch {
      return false;
    }
  }

  /**
   * Detect if generated code appears truncated based on structure
   * @param {string} code - Generated code
   * @param {string} spec - Original specification
   * @returns {boolean}
   */
  detectCodeTruncation(code, spec) {
    if (!code || code.length < 50) return true;

    // Check for common truncation indicators
    const truncationMarkers = [
      /\.\.\.$/,                           // Ends with ...
      /\/\/\s*\.\.\./,                     // Comment with ...
      /\/\*\s*\.\.\.\s*\*\/$/,             // Block comment with ...
      /\/\/\s*(TODO|FIXME|incomplete)/i,   // Incomplete markers at end
      /{\s*$/,                             // Unclosed brace at end
      /\(\s*$/,                            // Unclosed paren at end
    ];

    const endsWithMarker = truncationMarkers.some(pattern =>
      pattern.test(code.slice(-100))
    );

    // Check if spec mentions 'export' but code doesn't have complete exports
    const specMentionsExport = /export/i.test(spec);
    const hasCompleteExport = /export\s+(default\s+)?(class|function|const|let|var|interface|type)\s+\w+/i.test(code);
    const missingExport = specMentionsExport && !hasCompleteExport && code.length > 100;

    // Check brace balance
    const openBraces = (code.match(/\{/g) || []).length;
    const closeBraces = (code.match(/\}/g) || []).length;
    const unbalancedBraces = openBraces > closeBraces + 1; // Allow 1 unclosed for partial

    return endsWithMarker || missingExport || unbalancedBraces;
  }
}

export default GenerateFileHandler;
