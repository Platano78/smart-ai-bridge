/**
 * ModifyFileHandler - Local LLM File Modification
 *
 * Purpose: Local LLM understands and applies edits. Claude sends instructions, not code.
 * Token savings: 1500+ → ~100 tokens
 *
 * Flow:
 * 1. Claude sends: modify_file("auth.ts", "Add rate limiting to the login function")
 * 2. Node.js reads file
 * 3. Local LLM understands code + applies changes
 * 4. Returns diff for review or writes directly
 */

import { BaseHandler } from './base-handler.js';
import { promises as fs } from 'fs';
import path from 'path';
import { createTwoFilesPatch } from 'diff';
import { getLocalContextLimit } from '../utils/model-discovery.js';

// Backend selection based on modification complexity
const MODIFY_BACKEND_MAP = {
  simple: 'local',           // Simple edits
  refactor: 'nvidia_qwen',   // Code restructuring
  complex: 'nvidia_deepseek', // Complex logic changes
  security: 'nvidia_deepseek' // Security-sensitive changes
};

// FIM (Fill-in-the-Middle) token configurations for supported models
// These models can use FIM for more reliable code insertion
const FIM_MODEL_TOKENS = {
  'qwen3-coder': {
    prefix: '<|fim_prefix|>',
    suffix: '<|fim_suffix|>',
    middle: '<|fim_middle|>'
  },
  'qwen2.5-coder': {
    prefix: '<|fim_prefix|>',
    suffix: '<|fim_suffix|>',
    middle: '<|fim_middle|>'
  },
  // Alias: coding-reap25b in llama-swap is actually Qwen3-Coder-30B (q3_K_XL)
  'reap': {
    prefix: '<|fim_prefix|>',
    suffix: '<|fim_suffix|>',
    middle: '<|fim_middle|>'
  },
  'deepseek-coder': {
    prefix: '<｜fim▁begin｜>',
    suffix: '<｜fim▁hole｜>',
    middle: '<｜fim▁end｜>'
  },
  'starcoder': {
    prefix: '<fim_prefix>',
    suffix: '<fim_suffix>',
    middle: '<fim_middle>'
  },
  'codellama': {
    prefix: '<PRE>',
    suffix: '<SUF>',
    middle: '<MID>'
  }
};

// Smart routing thresholds (in characters)
const ROUTING_THRESHOLDS = {
  LOCAL_MAX_CHARS: 20000,      // ~500 lines - local handles well
  CLOUD_FALLBACK_CHARS: 40000, // ~1000 lines - use cloud for larger
  PREFER_NATIVE_EDIT: 60000    // >1500 lines - Claude should read & edit directly
};

// Retry configuration for resilient modification
const RETRY_CONFIG = {
  maxLocalRetries: 2,           // Try local with increasing tokens
  maxDualModeIterations: 3,     // Coding + reasoning model iterations
  tokenScaleFactor: 1.5,        // Multiply tokens on retry
  cloudFallbackEnabled: true    // Enable cloud fallback by default
};

export class ModifyFileHandler extends BaseHandler {

  /**
   * Execute file modification using local LLM
   * @param {Object} args - Modification arguments
   * @param {string} args.filePath - Path to the file to modify
   * @param {string} args.instructions - Natural language edit instructions
   * @param {Object} [args.options] - Optional configuration
   * @param {string} [args.options.backend] - Force specific backend
   * @param {string} [args.options.modelProfile] - Local router model profile (coding-qwen-7b|coding-seed-coder|fast-qwen14b|etc)
   * @param {boolean} [args.options.review] - Return for approval (default: true)
   * @param {string[]} [args.options.contextFiles] - For understanding dependencies
   * @param {boolean} [args.options.backup] - Create backup (default: true)
   * @param {boolean} [args.options.dryRun] - Show changes without writing
   * @param {boolean} [args.options.useFIM] - Use FIM (Fill-in-the-Middle) if model supports it
   * @param {number} [args.options.insertionLine] - Line number for FIM insertion (required if useFIM=true)
   * @returns {Promise<Object>} Modification result
   */
  async execute(args) {
    const { filePath, instructions, options = {} } = args;

    if (!filePath) {
      throw new Error('filePath is required');
    }
    if (!instructions) {
      throw new Error('instructions is required');
    }

    const {
      backend = 'auto',
      modelProfile = null,  // For local router model selection
      review = true,
      contextFiles = [],
      backup = true,
      dryRun = false,
      useFIM = false,       // Use FIM mode if model supports it
      insertionLine = null  // Required for FIM mode
    } = options;

    const startTime = Date.now();

    try {
      // 1. Read the current file
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
      const originalContent = await fs.readFile(absolutePath, 'utf8');
      const fileStats = await fs.stat(absolutePath);

      // 2. Detect language
      const language = this.detectLanguage(filePath);

      // 3. Gather optional context files
      const contextContents = await this.gatherContextFiles(contextFiles);

      // 4. Estimate complexity for backend selection
      const complexity = this.estimateComplexity(instructions, originalContent);

      // 5. Determine the backend with smart routing
      const routingResult = this.selectBackend(backend, complexity, originalContent.length);
      let selectedBackend = routingResult.backend;
      const routingRecommendation = routingResult.recommendation;

      // 6. Check for FIM support if requested
      let fimTokens = null;
      let usingFIM = false;

      if (useFIM && selectedBackend === 'local') {
        // Try to detect FIM support from model profile or detected model
        const modelToCheck = modelProfile || 'unknown';
        fimTokens = this.detectFIMSupport(modelToCheck);

        if (fimTokens && insertionLine) {
          usingFIM = true;
          console.error(`[ModifyFile] 🔧 Using FIM mode with ${modelToCheck}`);
        } else if (useFIM && !insertionLine) {
          console.error('[ModifyFile] ⚠️ FIM requested but insertionLine not provided, falling back to SEARCH/REPLACE');
        } else if (useFIM && !fimTokens) {
          console.error(`[ModifyFile] ⚠️ FIM requested but model ${modelToCheck} not recognized as FIM-capable`);
        }
      }

      // 7. Build the appropriate prompt
      let prompt;
      if (usingFIM) {
        prompt = this.buildFIMPrompt(originalContent, instructions, insertionLine, fimTokens);
      } else {
        prompt = this.buildModifyPrompt(originalContent, instructions, {
          filePath,
          language,
          contextContents
        });
      }

      // 8. INPUT size limit check - DYNAMIC based on actual loaded model
      const { charLimit: MAX_LOCAL_INPUT_CHARS, model: loadedModel } = await getLocalContextLimit();
      console.error(`[ModifyFile] 📊 Dynamic limit: ${MAX_LOCAL_INPUT_CHARS} chars (model: ${loadedModel})`);
      if (originalContent.length > MAX_LOCAL_INPUT_CHARS && selectedBackend.startsWith('local')) {
        console.error(`[ModifyFile] ⚠️ File size (${originalContent.length} chars) exceeds local server limit (${MAX_LOCAL_INPUT_CHARS} chars)`);
        console.error(`[ModifyFile] 🔄 Auto-fallback to nvidia_qwen (128K context)`);
        selectedBackend = 'nvidia_qwen'; // Fast cloud alternative with 128K context
      }

      // 9. Context limit check for cloud backends
      const contextLimit = this.getBackendContextLimit(selectedBackend);
      if (originalContent.length > contextLimit && !selectedBackend.startsWith('local')) {
        console.error(`[ModifyFile] ⚠️ File size (${originalContent.length} chars) exceeds ${selectedBackend} limit (${contextLimit} chars)`);
        console.error(`[ModifyFile] 🔄 File too large for any backend - consider splitting`);
        throw new Error(`File size ${originalContent.length} chars exceeds maximum supported size ${contextLimit} chars`);
      }

      // 9. Calculate dynamic token allocation based on backend speed and file size
      const allocatedTokens = this.calculateDynamicTokens(
        selectedBackend,
        originalContent.length,
        complexity
      );

      console.error(`[ModifyFile] ✏️ Modifying ${filePath} (${originalContent.length} chars)`);
      console.error(`[ModifyFile] 🎯 Backend: ${selectedBackend}, Complexity: ${complexity}${modelProfile ? `, Model: ${modelProfile}` : ''}${usingFIM ? ', Mode: FIM' : ''}`);
      console.error(`[ModifyFile] 🎟️ Allocated tokens: ${allocatedTokens} (dynamic)`);
      console.error(`[ModifyFile] 📋 Instructions: ${instructions.substring(0, 100)}...`);

      // 10. Make request to LLM with retry logic for failures
      // Now checks BOTH finish_reason AND response structure inside the loop
      const estimatedSpeed = this.estimateBackendSpeed(selectedBackend);
      const timeoutMs = Math.max(60000, Math.ceil((allocatedTokens / estimatedSpeed) * 1000) + 30000);

      let response;
      let attempts = 0;
      let currentTokens = allocatedTokens;
      let usedBackend = selectedBackend;
      let lastError = null;
      let wasTruncated = false;

      while (attempts < RETRY_CONFIG.maxLocalRetries + 1) {
        attempts++;

        try {
          response = await this.makeRequest(prompt, usedBackend, {
            maxTokens: currentTokens,
            routerModel: modelProfile,
            timeout: timeoutMs
          });

          const responseText = response.content || response;

          // Check for truncation via BOTH finish_reason AND response structure
          const finishReason = response.metadata?.finishReason || response.finish_reason;
          const finishReasonTruncated = finishReason === 'length';
          const structureTruncated = this.detectModificationTruncation(responseText);
          wasTruncated = finishReasonTruncated || structureTruncated;

          if (wasTruncated) {
            const truncationSource = finishReasonTruncated ? 'finish_reason: length' : 'response structure incomplete';
            console.error(`[ModifyFile] ⚠️ Output truncated (${truncationSource}), attempt ${attempts}/${RETRY_CONFIG.maxLocalRetries + 1}`);

            // Try dual-mode iteration if available (local coding + reasoning)
            if (usedBackend === 'local' && attempts <= RETRY_CONFIG.maxLocalRetries) {
              const dualResult = await this.tryDualModeModification(prompt, originalContent, currentTokens);
              if (dualResult.success) {
                response = dualResult.response;
                // Re-check structure after dual mode
                const dualText = response.content || response;
                wasTruncated = this.detectModificationTruncation(dualText);
                if (!wasTruncated) {
                  console.error(`[ModifyFile] ✅ Dual-mode iteration succeeded`);
                  break;
                }
              }

              // Scale up tokens for next attempt
              currentTokens = Math.min(Math.floor(currentTokens * RETRY_CONFIG.tokenScaleFactor), 8000);
              console.error(`[ModifyFile] 🔄 Scaling tokens to ${currentTokens} for retry`);
              continue;
            }

            // Cloud fallback - try cloud if local exhausted OR if already on cloud but still truncated
            if (RETRY_CONFIG.cloudFallbackEnabled) {
              if (usedBackend !== 'nvidia_qwen') {
                console.error(`[ModifyFile] 🌐 Falling back to cloud (nvidia_qwen)`);
                usedBackend = 'nvidia_qwen';
                currentTokens = Math.min(currentTokens * 2, 8000);
                continue;
              } else if (attempts <= RETRY_CONFIG.maxLocalRetries) {
                // Already on cloud, scale up tokens and retry
                currentTokens = Math.min(Math.floor(currentTokens * RETRY_CONFIG.tokenScaleFactor), 8000);
                console.error(`[ModifyFile] 🔄 Cloud retry with ${currentTokens} tokens`);
                continue;
              }
            }
          }

          break; // Success
        } catch (error) {
          lastError = error;
          console.error(`[ModifyFile] ⚠️ Attempt ${attempts} failed: ${error.message}`);

          // Cloud fallback on error
          if (RETRY_CONFIG.cloudFallbackEnabled && usedBackend === 'local' && attempts <= RETRY_CONFIG.maxLocalRetries) {
            console.error(`[ModifyFile] 🌐 Error fallback to cloud (nvidia_qwen)`);
            usedBackend = 'nvidia_qwen';
            continue;
          }
        }
      }

      if (!response && lastError) {
        throw lastError;
      }

      const processingTime = Date.now() - startTime;
      const responseText = response.content || response;

      // 11. Parse response based on mode used
      let modifiedCode;
      let summary;
      let warnings = [];

      if (usingFIM) {
        // Parse FIM response
        const fimResult = this.parseFIMResponse(responseText, originalContent, insertionLine, fimTokens);
        modifiedCode = fimResult.code;
        summary = fimResult.summary;
        console.error(`[ModifyFile] ✅ FIM insertion completed`);
      } else {
        // Try SEARCH/REPLACE blocks first
        const { blocks, summary: blockSummary } = this.parseSearchReplaceBlocks(responseText);

        if (blocks.length > 0) {
          // New SEARCH/REPLACE block format
          console.error(`[ModifyFile] 📦 Found ${blocks.length} SEARCH/REPLACE block(s)`);

          const { code, appliedCount, failedBlocks } = this.applySearchReplaceBlocks(originalContent, blocks);
          modifiedCode = code;
          summary = blockSummary;

          if (failedBlocks.length > 0) {
            warnings.push(`${failedBlocks.length} block(s) could not be applied (search text not found)`);
            console.error(`[ModifyFile] ⚠️ ${failedBlocks.length} blocks failed to apply`);
          }

          console.error(`[ModifyFile] ✅ Applied ${appliedCount}/${blocks.length} blocks`);
        } else {
          // Fallback: try old full-file parsing
          console.error('[ModifyFile] ⚠️ No SEARCH/REPLACE blocks found, trying full-file fallback');
          const modified = this.parseModifiedCode(responseText, language);
          modifiedCode = modified.code;
          summary = modified.summary;
          warnings = modified.warnings || [];

          if (!modifiedCode || modifiedCode.trim() === '') {
            return this.buildErrorResponse('Failed to parse modification response: no code extracted');
          }

          // SAFETY CHECK: Prevent catastrophic file replacement
          // If the "modified" code is <50% of original size, it's likely a snippet, not a full file
          const sizeRatio = modifiedCode.length / originalContent.length;
          if (sizeRatio < 0.5) {
            console.error(`[ModifyFile] ❌ Safety check failed: extracted code is ${(sizeRatio * 100).toFixed(1)}% of original size`);
            console.error('[ModifyFile] 💡 This suggests the model returned a snippet, not SEARCH/REPLACE blocks');
            return this.buildErrorResponse(
              `Safety check failed: Model returned a snippet (${modifiedCode.length} chars) instead of ` +
              `SEARCH/REPLACE blocks for a ${originalContent.length} char file. ` +
              `Try again with a clearer instruction or use native Edit tool.`
            );
          }
        }
      }

      // 12. Generate unified diff
      const diff = this.generateUnifiedDiff(
        originalContent,
        modifiedCode,
        filePath
      );

      // 13. Calculate change statistics
      const stats = this.calculateChangeStats(originalContent, modifiedCode);

      // Handle dry run
      if (dryRun) {
        this.recordExecution(
          {
            success: true,
            backend: selectedBackend,
            processingTime,
            mode: 'dry_run'
          },
          {
            tool: 'modify_file',
            taskType: 'modification',
            filePath
          }
        );

        return this.buildSuccessResponse({
          status: 'dry_run',
          filePath: absolutePath,
          diff,
          summary,
          stats,
          warnings,
          backend_used: selectedBackend,
          processing_time: processingTime,
          instructions: 'This is a dry run. No changes were made.'
        });
      }

      // Handle review mode (default)
      if (review) {
        this.recordExecution(
          {
            success: true,
            backend: selectedBackend,
            processingTime,
            mode: 'review'
          },
          {
            tool: 'modify_file',
            taskType: 'modification',
            filePath
          }
        );

        return this.buildSuccessResponse({
          status: wasTruncated ? 'pending_review_truncated' : 'pending_review',
          filePath: absolutePath,
          diff,
          modifiedContent: modifiedCode,
          summary,
          stats,
          warnings,
          backend_used: usedBackend,
          processing_time: processingTime,
          retry_attempts: attempts,
          was_truncated: wasTruncated,
          approval_options: {
            approve: 'Use write_files_atomic with the modifiedContent to apply changes',
            reject: 'Discard changes',
            edit: 'Manually modify the content before writing'
          },
          instructions: wasTruncated
            ? 'WARNING: Output may be truncated. Review carefully and consider retrying with simpler instructions.'
            : undefined
        });
      }

      // Auto-write mode (review=false)
      // Create backup if enabled
      if (backup) {
        const backupPath = `${absolutePath}.backup.${Date.now()}`;
        await fs.writeFile(backupPath, originalContent, 'utf8');
        console.error(`[ModifyFile] 💾 Backup created: ${backupPath}`);
      }

      // Write the modified file
      await fs.writeFile(absolutePath, modifiedCode, 'utf8');

      this.recordExecution(
        {
          success: true,
          backend: selectedBackend,
          processingTime,
          mode: 'write'
        },
        {
          tool: 'modify_file',
          taskType: 'modification',
          filePath
        }
      );

      return this.buildSuccessResponse({
        status: 'written',
        filePath: absolutePath,
        diff,
        summary,
        stats,
        warnings,
        backupCreated: backup,
        backend_used: selectedBackend,
        processing_time: processingTime,
        tokens_saved: this.estimateTokensSaved(originalContent.length, instructions.length)
      });

    } catch (error) {
      console.error(`[ModifyFile] ❌ Error: ${error.message}`);

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
    for (const contextPath of contextPaths.slice(0, 3)) {
      try {
        const absPath = path.isAbsolute(contextPath) ? contextPath : path.resolve(contextPath);
        const content = await fs.readFile(absPath, 'utf8');
        contextContents.push({
          path: contextPath,
          content: content.substring(0, 5000)
        });
      } catch (error) {
        console.error(`[ModifyFile] Warning: Could not read context file ${contextPath}: ${error.message}`);
      }
    }
    return contextContents;
  }

  /**
   * Build the modification prompt for the LLM
   * Uses SEARCH/REPLACE block format for token-efficient responses
   */
  buildModifyPrompt(originalContent, instructions, options) {
    const { filePath, language, contextContents } = options;

    let prompt = `You are a senior software engineer making targeted modifications to existing code.

FILE: ${filePath}
LANGUAGE: ${language}

MODIFICATION INSTRUCTIONS:
${instructions}

--- ORIGINAL FILE CONTENT ---
${originalContent}
--- END ORIGINAL ---
`;

    if (contextContents && contextContents.length > 0) {
      prompt += '\n--- RELATED CONTEXT ---\n';
      for (const ctx of contextContents) {
        prompt += `\n=== ${ctx.path} ===\n${ctx.content}\n`;
      }
      prompt += '--- END CONTEXT ---\n';
    }

    prompt += `
REQUIREMENTS:
1. Apply the requested modifications precisely
2. Return ONLY the changes using SEARCH/REPLACE blocks
3. Include enough context in SEARCH to make it unique
4. Do NOT return the entire file

OUTPUT FORMAT:
For each change, use this exact format:

<<<<<<< SEARCH
[exact original code to find - include enough lines for uniqueness]
=======
[replacement code]
>>>>>>> REPLACE

If multiple changes are needed, include multiple SEARCH/REPLACE blocks.

SUMMARY: [1-2 sentence description after all blocks]
`;

    return prompt;
  }

  /**
   * Estimate complexity for backend selection
   */
  estimateComplexity(instructions, content) {
    const lowerInstructions = instructions.toLowerCase();

    // Check for complex patterns
    const complexPatterns = [
      'refactor', 'restructure', 'rewrite', 'optimize',
      'add error handling', 'add validation', 'security',
      'authentication', 'authorization', 'async', 'concurrent'
    ];

    const securityPatterns = [
      'security', 'vulnerability', 'sanitize', 'escape',
      'injection', 'xss', 'csrf', 'authentication'
    ];

    const simplePatterns = [
      'add comment', 'rename', 'fix typo', 'update string',
      'change value', 'add import', 'remove unused'
    ];

    if (securityPatterns.some(p => lowerInstructions.includes(p))) return 'security';
    if (complexPatterns.some(p => lowerInstructions.includes(p))) return 'complex';
    if (simplePatterns.some(p => lowerInstructions.includes(p))) return 'simple';

    // Also check content size
    if (content.length > 10000) return 'complex';

    return 'refactor';
  }

  /**
   * Select the appropriate backend with smart routing
   * Priority: local (unlimited) → groq (fast) → nvidia (reliable)
   *
   * @param {string} requestedBackend - Explicitly requested backend or 'auto'
   * @param {string} complexity - Estimated task complexity
   * @param {number} contentLength - File content length in characters
   * @returns {Object} { backend: string, recommendation: string|null }
   */
  selectBackend(requestedBackend, complexity, contentLength = 0) {
    const backendMap = {
      local: 'local',
      deepseek: 'nvidia_deepseek',
      qwen3: 'nvidia_qwen',
      gemini: 'gemini',
      groq: 'groq_llama'
    };

    // If explicitly requested, honor it (but warn for very large files)
    if (requestedBackend && requestedBackend !== 'auto') {
      const backend = backendMap[requestedBackend] || requestedBackend;

      if (contentLength > ROUTING_THRESHOLDS.PREFER_NATIVE_EDIT) {
        console.error(`[ModifyFile] ⚠️ Very large file (${contentLength} chars). Consider using native Edit tool for precision.`);
      }

      return { backend, recommendation: null };
    }

    // Smart routing based on file size
    // Strategy: Maximize local usage, preserve cloud quota

    if (contentLength <= ROUTING_THRESHOLDS.LOCAL_MAX_CHARS) {
      // Small/medium files: always use local (unlimited, free)
      return { backend: 'local', recommendation: null };
    }

    if (contentLength <= ROUTING_THRESHOLDS.CLOUD_FALLBACK_CHARS) {
      // Medium-large files: try local, suggest cloud fallback
      console.error(`[ModifyFile] 📊 Medium-large file (${contentLength} chars). Using local, cloud fallback available.`);
      return {
        backend: 'local',
        recommendation: 'If local fails, retry with backend: "groq"'
      };
    }

    if (contentLength <= ROUTING_THRESHOLDS.PREFER_NATIVE_EDIT) {
      // Large files: use groq (fast, good limits) to preserve local for smaller tasks
      console.error(`[ModifyFile] 📊 Large file (${contentLength} chars). Routing to groq for reliability.`);
      return {
        backend: 'groq_llama',
        recommendation: 'Large file routed to cloud. Local reserved for smaller files.'
      };
    }

    // Very large files: warn that native Edit might be better
    console.error(`[ModifyFile] ⚠️ Very large file (${contentLength} chars). Native Edit tool recommended for precision.`);
    return {
      backend: 'groq_llama',
      recommendation: 'VERY_LARGE_FILE: Claude should consider reading file and using native Edit for precision.'
    };
  }

  /**
   * Detect if the current model supports FIM (Fill-in-the-Middle)
   * @param {string} modelName - The model name/id to check
   * @returns {Object|null} FIM tokens if supported, null otherwise
   */
  detectFIMSupport(modelName) {
    if (!modelName) return null;

    const lowerModel = modelName.toLowerCase();

    for (const [pattern, tokens] of Object.entries(FIM_MODEL_TOKENS)) {
      if (lowerModel.includes(pattern)) {
        return tokens;
      }
    }

    return null;
  }

  /**
   * Build a FIM (Fill-in-the-Middle) prompt for code insertion
   * Best for single-location insertions where we know prefix and suffix
   *
   * @param {string} originalContent - Full file content
   * @param {string} instructions - What to insert/modify
   * @param {number} insertionLine - Line number where to insert (1-based)
   * @param {Object} fimTokens - The FIM tokens for this model
   * @returns {string} FIM-formatted prompt
   */
  buildFIMPrompt(originalContent, instructions, insertionLine, fimTokens) {
    const lines = originalContent.split('\n');

    // Split content at insertion point
    const prefixLines = lines.slice(0, insertionLine - 1);
    const suffixLines = lines.slice(insertionLine - 1);

    const prefix = prefixLines.join('\n');
    const suffix = suffixLines.join('\n');

    // Build FIM prompt with instruction as comment
    const instructionComment = `// TODO: ${instructions}\n`;

    return `${fimTokens.prefix}${prefix}\n${instructionComment}${fimTokens.suffix}${suffix}${fimTokens.middle}`;
  }

  /**
   * Parse FIM response - the model generates just the middle part
   * @param {string} response - Raw model response
   * @param {string} originalContent - Original file content
   * @param {number} insertionLine - Where the insertion was made
   * @param {Object} fimTokens - FIM tokens used
   * @returns {Object} { code: string, summary: string }
   */
  parseFIMResponse(response, originalContent, insertionLine, fimTokens) {
    const lines = originalContent.split('\n');

    // Clean the response - remove any FIM tokens that might be in output
    let cleanResponse = response
      .replace(fimTokens.prefix, '')
      .replace(fimTokens.suffix, '')
      .replace(fimTokens.middle, '')
      .trim();

    // Remove the instruction comment if present
    cleanResponse = cleanResponse.replace(/^\/\/ TODO:.*\n?/m, '');

    // Reconstruct the file with the generated middle
    const prefixLines = lines.slice(0, insertionLine - 1);
    const suffixLines = lines.slice(insertionLine - 1);

    const newContent = [
      ...prefixLines,
      cleanResponse,
      ...suffixLines
    ].join('\n');

    return {
      code: newContent,
      summary: `FIM insertion at line ${insertionLine}`
    };
  }

  /**
   * Parse the LLM response to extract modified code
   */
  parseModifiedCode(responseText, language) {
    let summary = 'Modifications applied';
    let warnings = [];
    let code = '';

    // Extract summary
    const summaryMatch = responseText.match(/SUMMARY:\s*(.+?)(?=\n\nWARNINGS:|WARNINGS:|MODIFIED_CODE:|\n```)/is);
    if (summaryMatch) {
      summary = summaryMatch[1].trim();
    }

    // Extract warnings
    const warningsMatch = responseText.match(/WARNINGS:\s*(.+?)(?=\n\nMODIFIED_CODE:|MODIFIED_CODE:|\n```)/is);
    if (warningsMatch) {
      const warningsText = warningsMatch[1].trim();
      if (warningsText.toLowerCase() !== 'none') {
        warnings = warningsText.split('\n').filter(w => w.trim());
      }
    }

    // Extract modified code block
    const codePattern = new RegExp(`MODIFIED_CODE:\\s*\`\`\`(?:${language})?\\n([\\s\\S]*?)\`\`\``, 'i');
    const codeMatch = responseText.match(codePattern);
    if (codeMatch) {
      code = codeMatch[1].trim();
    } else {
      // Try to find any code block after MODIFIED_CODE
      const anyCodeMatch = responseText.match(/MODIFIED_CODE:[\s\S]*?```(?:\w+)?\n([\s\S]*?)```/i);
      if (anyCodeMatch) {
        code = anyCodeMatch[1].trim();
      } else {
        // Fallback: try to find any code block
        const fallbackMatch = responseText.match(/```(?:\w+)?\n([\s\S]*?)```/);
        if (fallbackMatch) {
          code = fallbackMatch[1].trim();
        }
      }
    }

    return { summary, warnings, code };
  }

  /**
   * Parse SEARCH/REPLACE blocks from LLM response
   * @param {string} responseText - Raw LLM response
   * @returns {Object} { blocks: Array<{search, replace}>, summary: string }
   */
  parseSearchReplaceBlocks(responseText) {
    const blocks = [];

    // Pattern to match SEARCH/REPLACE blocks
    const blockPattern = /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/g;

    let match;
    while ((match = blockPattern.exec(responseText)) !== null) {
      blocks.push({
        search: match[1],
        replace: match[2]
      });
    }

    // Extract summary if present
    const summaryMatch = responseText.match(/SUMMARY:\s*(.+?)$/im);
    const summary = summaryMatch ? summaryMatch[1].trim() : 'Modifications applied';

    return { blocks, summary };
  }

  /**
   * Apply SEARCH/REPLACE blocks to original content
   * @param {string} originalContent - Original file content
   * @param {Array<{search, replace}>} blocks - Parsed blocks
   * @returns {Object} { code: string, appliedCount: number, failedBlocks: Array }
   */
  applySearchReplaceBlocks(originalContent, blocks) {
    let modifiedContent = originalContent;
    let appliedCount = 0;
    const failedBlocks = [];

    for (const block of blocks) {
      if (modifiedContent.includes(block.search)) {
        // Exact match - apply replacement
        modifiedContent = modifiedContent.replace(block.search, block.replace);
        appliedCount++;
      } else {
        // Try normalized matching (handle whitespace differences)
        const normalizedSearch = block.search.replace(/\s+/g, ' ').trim();
        const normalizedContent = modifiedContent.replace(/\s+/g, ' ');

        if (normalizedContent.includes(normalizedSearch)) {
          // Fuzzy match detected - try line-by-line matching
          const searchLines = block.search.split('\n').map(l => l.trim()).filter(l => l);
          const contentLines = modifiedContent.split('\n');

          // Find where the block starts in the content
          let startIdx = -1;
          for (let i = 0; i < contentLines.length; i++) {
            if (contentLines[i].trim() === searchLines[0]) {
              // Check if subsequent lines match
              let allMatch = true;
              for (let j = 1; j < searchLines.length && i + j < contentLines.length; j++) {
                if (contentLines[i + j].trim() !== searchLines[j]) {
                  allMatch = false;
                  break;
                }
              }
              if (allMatch) {
                startIdx = i;
                break;
              }
            }
          }

          if (startIdx !== -1) {
            // Replace the matched lines with replacement content
            const replaceLines = block.replace.split('\n');
            contentLines.splice(startIdx, searchLines.length, ...replaceLines);
            modifiedContent = contentLines.join('\n');
            appliedCount++;
            console.error(`[ModifyFile] ⚠️ Applied fuzzy match for block starting with: ${searchLines[0].substring(0, 50)}...`);
          } else {
            console.error(`[ModifyFile] ❌ Failed to apply fuzzy match for block`);
            failedBlocks.push(block);
          }
        } else {
          failedBlocks.push(block);
        }
      }
    }

    return { code: modifiedContent, appliedCount, failedBlocks };
  }

  /**
   * Generate a unified diff between original and modified content
   */
  generateUnifiedDiff(originalContent, modifiedContent, filePath) {
    try {
      const diff = createTwoFilesPatch(
        `a/${path.basename(filePath)}`,
        `b/${path.basename(filePath)}`,
        originalContent,
        modifiedContent,
        'original',
        'modified',
        { context: 3 }
      );
      return diff;
    } catch (error) {
      // Fallback to simple diff representation
      console.error(`[ModifyFile] Warning: Could not generate unified diff: ${error.message}`);
      return `--- Original\n+++ Modified\n\nDiff generation failed. Review the full modified content.`;
    }
  }

  /**
   * Calculate statistics about the changes
   */
  calculateChangeStats(originalContent, modifiedContent) {
    const originalLines = originalContent.split('\n');
    const modifiedLines = modifiedContent.split('\n');

    const originalSet = new Set(originalLines);
    const modifiedSet = new Set(modifiedLines);

    const added = modifiedLines.filter(l => !originalSet.has(l)).length;
    const removed = originalLines.filter(l => !modifiedSet.has(l)).length;
    const unchanged = originalLines.filter(l => modifiedSet.has(l)).length;

    return {
      originalLines: originalLines.length,
      modifiedLines: modifiedLines.length,
      linesAdded: added,
      linesRemoved: removed,
      linesUnchanged: unchanged,
      changeRatio: ((added + removed) / originalLines.length).toFixed(2)
    };
  }

  /**
   * Estimate tokens saved
   */
  estimateTokensSaved(originalLength, instructionsLength) {
    // Claude would need to see the full file content + instructions
    const withoutSAB = Math.ceil(originalLength / 4) + Math.ceil(instructionsLength / 4);
    // With SAB, Claude only sees instructions + structured response
    const withSAB = Math.ceil(instructionsLength / 4) + 200; // ~200 tokens for response
    return Math.max(0, withoutSAB - withSAB);
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
   * Calculate dynamic token allocation based on model speed, file size, complexity,
   * and REMAINING context window (to prevent overflow)
   * @param {string} backendName - Backend identifier
   * @param {number} fileSize - File size in characters
   * @param {string} complexity - Modification complexity (simple|refactor|complex|security)
   * @returns {number} Allocated tokens for response
   */
  calculateDynamicTokens(backendName, fileSize, complexity) {
    // INCREASED base tokens by modification complexity (council recommended)
    const baseTokens = {
      simple: 800,      // Was 500 - Simple edits (rename, add comment)
      refactor: 1500,   // Was 1000 - Code restructuring
      complex: 2500,    // Was 1500 - Complex logic changes
      security: 2000    // Was 1200 - Security-sensitive modifications
    };

    // Get estimated speed for this backend
    const tokensPerSecond = this.estimateBackendSpeed(backendName);

    // Target response time: 90 seconds for modifications (increased from 60s)
    const targetTimeMs = 90000;
    const maxAffordableTokens = Math.floor((targetTimeMs / 1000) * tokensPerSecond);

    // File size adjustment: +300 tokens per 5KB of code (increased from 200)
    const fileSizeBonus = Math.min(1000, Math.floor(fileSize / 5000) * 300);

    // Calculate requested tokens (base + file size bonus)
    let requestedTokens = (baseTokens[complexity] || baseTokens.refactor) + fileSizeBonus;

    // SMART REMAINING CONTEXT CALCULATION (council recommended)
    // Don't request more tokens than the backend can provide
    const contextLimit = this.getBackendContextLimit(backendName);
    const safetyBuffer = 4000; // ~1000 tokens safety margin
    const maxPossible = Math.floor((contextLimit - fileSize - safetyBuffer) / 4);

    // Cap allocation at what's physically possible
    if (maxPossible > 0 && requestedTokens > maxPossible) {
      console.error(`[ModifyFile] 📊 Capping tokens from ${requestedTokens} to ${maxPossible} (context limit)`);
      requestedTokens = maxPossible;
    }

    // Return the minimum of requested and affordable tokens
    const allocated = Math.min(requestedTokens, maxAffordableTokens);

    // Safety limit: increased from 4000 to 8000 for larger modifications
    return Math.max(800, Math.min(allocated, 8000));
  }

  /**
   * Try dual-mode modification: coding model generates, reasoning model validates
   * This leverages both local models for iteration before falling back to cloud
   * @param {string} prompt - Modification prompt
   * @param {string} originalContent - Original file content
   * @param {number} tokens - Token allocation
   * @returns {Promise<{success: boolean, response: Object}>}
   */
  async tryDualModeModification(prompt, originalContent, tokens) {
    try {
      // Check if dual mode is available (ports 8087 coding, 8088 reasoning)
      const dualAvailable = await this.checkDualModeAvailable();
      if (!dualAvailable) {
        return { success: false, response: null };
      }

      console.error('[ModifyFile] 🔄 Attempting dual-mode iteration (coding + reasoning)');

      // Step 1: Generate modification with coding model (port 8087)
      const scaledTokens = Math.min(tokens * RETRY_CONFIG.tokenScaleFactor, 6000);
      const codingResponse = await this.makeRequest(prompt, 'local', {
        maxTokens: scaledTokens,
        timeout: 90000
      });

      const codingText = codingResponse.content || codingResponse;

      // Step 2: Have reasoning model validate the SEARCH/REPLACE blocks
      const validatePrompt = `Validate these code modifications. Check if the SEARCH blocks will find exact matches in the original code.

ORIGINAL FILE (first 3000 chars):
${originalContent.substring(0, 3000)}

PROPOSED MODIFICATIONS:
${codingText}

If the modifications look correct, respond with:
STATUS: VALID
[keep the original modifications]

If there are issues (SEARCH text won't match), respond with:
STATUS: FIXED
[corrected modifications with proper SEARCH/REPLACE blocks]`;

      const validationResponse = await this.makeRequest(validatePrompt, 'local', {
        maxTokens: scaledTokens,
        timeout: 90000
      });

      const validationText = validationResponse.content || validationResponse;

      // Check if reasoning model made corrections
      if (validationText.includes('STATUS: FIXED')) {
        console.error('[ModifyFile] 🔧 Reasoning model corrected the modifications');
        return {
          success: true,
          response: {
            content: validationText,
            metadata: {
              ...validationResponse.metadata,
              dualModeUsed: true,
              wasFixed: true
            }
          }
        };
      }

      // Original was valid
      return {
        success: true,
        response: {
          content: codingText,
          metadata: {
            ...codingResponse.metadata,
            dualModeUsed: true,
            wasFixed: false
          }
        }
      };

    } catch (error) {
      console.error(`[ModifyFile] ⚠️ Dual-mode failed: ${error.message}`);
      return { success: false, response: null };
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
   * Detect if modification response appears truncated based on structure
   * @param {string} responseText - Raw response from LLM
   * @returns {boolean} True if response appears truncated
   */
  detectModificationTruncation(responseText) {
    if (!responseText || responseText.length < 20) return true;

    // Check for incomplete SEARCH/REPLACE blocks
    const searchCount = (responseText.match(/<<<<<<< SEARCH/g) || []).length;
    const replaceCount = (responseText.match(/>>>>>>> REPLACE/g) || []).length;
    const separatorCount = (responseText.match(/=======/g) || []).length;

    // If we have more SEARCH markers than REPLACE markers, block is incomplete
    if (searchCount > replaceCount) {
      return true;
    }

    // Each SEARCH block needs a separator before REPLACE
    if (searchCount > separatorCount) {
      return true;
    }

    // Check brace/bracket balance in the replacement content
    const replacementBlocks = responseText.match(/=======\n([\s\S]*?)>>>>>>> REPLACE/g) || [];
    for (const block of replacementBlocks) {
      const content = block.replace(/^=======\n/, '').replace(/>>>>>>> REPLACE$/, '');
      const braces = (content.match(/\{/g) || []).length - (content.match(/\}/g) || []).length;
      const brackets = (content.match(/\[/g) || []).length - (content.match(/\]/g) || []).length;
      const parens = (content.match(/\(/g) || []).length - (content.match(/\)/g) || []).length;

      if (braces !== 0 || brackets !== 0 || parens !== 0) {
        return true; // Unbalanced structure in replacement
      }
    }

    // Check for truncation markers at the end
    const truncationMarkers = [
      /\.\.\.$/,                           // Ends with ...
      /<<<<<<< SEARCH\s*$/,                // Unclosed SEARCH block
      /=======\s*$/,                       // Unclosed at separator
      /```\s*$/,                           // Unclosed code block
      /\{\s*$/,                            // Unclosed brace
      /\[\s*$/,                            // Unclosed bracket
      /\/\/\s*\.\.\./,                     // Comment with ... (truncation indicator)
      /\/\*\s*\.\.\./,                     // Block comment with ...
      /#\s*\.\.\./,                        // Python/shell comment with ...
    ];

    const last200 = responseText.slice(-200);
    const endsWithMarker = truncationMarkers.some(pattern => pattern.test(last200));

    // Check for incomplete sentences/code at the very end
    const lastLine = responseText.trim().split('\n').pop() || '';
    const incompleteEnd = /[,\(\[\{:]\s*$/.test(lastLine) ||
                          /^\s*(if|for|while|function|class|const|let|var|import|export)\s+\w*$/.test(lastLine);

    return endsWithMarker || incompleteEnd;
  }
}

export default ModifyFileHandler;
