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

import { BaseHandler, RETRY_CONFIG } from './base-handler.js';
import { detectOutputTruncation } from '../utils/truncation-detector.js';
import { writeFileVerified } from '../utils/verified-write.js';
import { countTokens } from '../utils/token-count.js';
import { probeInfillSupport, runInfill } from '../utils/model-discovery.js';
import { promises as fs } from 'fs';
import path from 'path';
import { createTwoFilesPatch } from 'diff';


// Smart routing thresholds (in characters)
const ROUTING_THRESHOLDS = {
  LOCAL_MAX_CHARS: 20000,      // ~500 lines - local handles well
  CLOUD_FALLBACK_CHARS: 40000, // ~1000 lines - use cloud for larger
  PREFER_NATIVE_EDIT: 60000    // >1500 lines - Claude should read & edit directly
};

// Retry configuration for resilient modification

export class ModifyFileHandler extends BaseHandler {

  constructor(context) {
    super(context);
    this.handlerType = 'modify';
    if (this.backendRegistry) {
      this.backendRegistry.registerRoutingOverride('modify', (ctx) => {
        if (ctx.complexity === 'complex' || ctx.complexity === 'security') return 'nvidia_deepseek';
        if (ctx.contentLength > ROUTING_THRESHOLDS.PREFER_NATIVE_EDIT) {
          return { backend: 'groq_llama', recommendation: 'VERY_LARGE_FILE: Consider native Edit.' };
        }
        if (ctx.contentLength > ROUTING_THRESHOLDS.CLOUD_FALLBACK_CHARS) {
          return { backend: 'groq_llama', recommendation: 'Large file routed to cloud.' };
        }
        return null;
      });
    }
  }

  /**
   * Execute file modification using local LLM
   * @param {Object} args - Modification arguments
   * @param {string} args.filePath - Path to the file to modify
   * @param {string} args.instructions - Natural language edit instructions
   * @param {Object} [args.options] - Optional configuration
   * @param {string} [args.options.backend] - Force specific backend
   * @param {string} [args.options.modelProfile] - Model id to request from the local router (whatever your router serves)
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
      const originalContent = await this.safeReadFile(absolutePath);
      const fileStats = await fs.stat(absolutePath);

      // 2. Detect language
      const language = this.detectLanguage(filePath);

      // 3. Gather optional context files
      const contextContents = await this.gatherContextFiles(contextFiles, { maxFiles: 3, maxCharsPerFile: 5000 });

      // 4. Estimate complexity for backend selection
      const complexity = this.estimateComplexity(instructions, originalContent);

      // 5. Determine the backend with smart routing
      const routingResult = this.selectBackend(backend, { complexity, contentLength: originalContent.length });
      let selectedBackend = routingResult.backend;
      const routingRecommendation = routingResult.recommendation;

      // 6. Resolve the FIM strategy purely from what the SERVER supports.
      let usingFIM = false;
      let fimMode = 'none';   // 'infill' | 'none'

      if (useFIM && selectedBackend === 'local') {
        if (!insertionLine) {
          console.error('[ModifyFile] ⚠️ FIM requested but insertionLine not provided, falling back to SEARCH/REPLACE');
        } else {
          const strategy = await this.resolveFIMStrategy();
          fimMode = strategy.mode;
          usingFIM = fimMode !== 'none';

          if (fimMode === 'infill') {
            console.error('[ModifyFile] 🔧 Using FIM mode via native /infill (server supplies the model\'s own tokens)');
          } else {
            console.error('[ModifyFile] ⚠️ FIM requested but the server has no /infill — doing a normal modify instead');
          }
        }
      }

      // 7. Build the appropriate prompt
      let prompt;
      if (usingFIM) {
        prompt = this.buildFIMPrompt(originalContent, instructions, insertionLine);
      } else {
        prompt = this.buildModifyPrompt(originalContent, instructions, {
          filePath,
          language,
          contextContents
        });
      }

      // 8. INPUT size limit check - DYNAMIC based on actual loaded model.
      // Gate on the assembled prompt (originalContent + instructions + context
      // files + scaffolding), not originalContent alone — refactor in particular
      // passes a large generated prompt in as `instructions`, which the old
      // originalContent-only gate never counted. Measured in TOKENS: a flat
      // 4 chars/token estimate is wrong by ~4x for CJK text (see
      // src/utils/token-count.js), so the real token count of the assembled
      // prompt is what gets compared, not its length.
      const { charLimit: MAX_LOCAL_INPUT_CHARS, model: loadedModel } = await this.getContextLimit();
      console.error(`[ModifyFile] 📊 Dynamic limit: ${MAX_LOCAL_INPUT_CHARS} chars (model: ${loadedModel})`);
      const promptTokens = countTokens(prompt);
      const modifyFileCapTokens = await this.capacityTokensFor(selectedBackend);
      if (promptTokens > modifyFileCapTokens) {
        console.error(`[ModifyFile] ⚠️ Assembled prompt (${promptTokens} tokens, ${prompt.length} chars) exceeds ${selectedBackend} limit (${modifyFileCapTokens} tokens)`);
        const roomier = await this.findBackendWithCapacityTokens(promptTokens, [selectedBackend]);
        if (roomier) {
          console.error(`[ModifyFile] 🔄 Escalating to ${roomier.name} (${roomier.cap} token limit)`);
          selectedBackend = roomier.name;
        } else {
          const largest = await this.largestBackendCapacityTokens();
          throw new Error(
            `Assembled prompt (file content plus instructions/context/scaffolding) is ${promptTokens} tokens ` +
            `(${prompt.length} chars); no configured backend can hold it in one context (largest limit found: ${largest} tokens). ` +
            `This tool makes a single LLM call and cannot chunk. ` +
            `Next step: narrow the call — split the file, shorten instructions, or target a smaller region.`
          );
        }
      }

      // 9. Context limit check for cloud backends (backstop after any escalation above)
      const contextLimitTokens = await this.capacityTokensFor(selectedBackend);
      if (promptTokens > contextLimitTokens && !selectedBackend.startsWith('local')) {
        console.error(`[ModifyFile] ⚠️ Assembled prompt (${promptTokens} tokens, ${prompt.length} chars) exceeds ${selectedBackend} limit (${contextLimitTokens} tokens)`);
        console.error(`[ModifyFile] 🔄 Prompt too large for any backend - consider splitting`);
        throw new Error(`Assembled prompt (file content plus instructions/context/scaffolding) is ${promptTokens} tokens (${prompt.length} chars), exceeding maximum supported size ${contextLimitTokens} tokens`);
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

      // Native /infill talks to the server directly rather than through the
      // chat-completions prompt path, so it runs here — after the capacity gate,
      // before the generic retry loop. Any failure degrades to the normal modify
      // below instead of erroring out.
      let response;
      if (fimMode === 'infill') {
        const infillText = await this.runNativeInfill(originalContent, instructions, insertionLine);
        if (infillText !== null) {
          response = { content: infillText, metadata: { mode: 'infill' } };
          console.error('[ModifyFile] ✅ /infill returned a completion');
        } else {
          console.error('[ModifyFile] ⚠️ /infill call failed — falling back to a normal modify');
          fimMode = 'none';
          usingFIM = false;
          prompt = this.buildModifyPrompt(originalContent, instructions, {
            filePath,
            language,
            contextContents
          });
        }
      }

      let attempts = 0;
      let currentTokens = allocatedTokens;
      let usedBackend = selectedBackend;
      let lastError = null;
      let wasTruncated = false;

      // The native /infill path above may already have produced a response;
      // in that case the chat-completions retry loop must not run at all.
      if (!response) {
        while (attempts < RETRY_CONFIG.maxLocalRetries + 1) {
          attempts++;

          try {
            const attemptTimeoutMs = Math.max(60000, Math.ceil((currentTokens / this.estimateBackendSpeed(usedBackend)) * 1000) + 30000);
            response = await this.makeRequest(prompt, usedBackend, {
              maxTokens: currentTokens,
              routerModel: modelProfile,
              timeout: attemptTimeoutMs,
              disableThinking: true
            });

            const responseText = this.extractResponseText(response);

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
                  const dualText = this.extractResponseText(response);
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

              // Same lane, bigger budget. Deliberately never switches lanes: an
              // escalation the caller cannot see would spend on a backend they
              // never chose.
              if (attempts <= RETRY_CONFIG.maxLocalRetries) {
                currentTokens = Math.min(Math.floor(currentTokens * RETRY_CONFIG.tokenScaleFactor), 8000);
                console.error(`[ModifyFile] 🔄 Scaling tokens to ${currentTokens} for same-lane retry`);
                continue;
              }

              // Retries exhausted: fall through to the break below and report
              // the truncation honestly, on the backend that actually ran.
            }

            break; // Success
          } catch (error) {
            lastError = error;
            console.error(`[ModifyFile] ⚠️ Attempt ${attempts} failed: ${error.message}`);

            // Cloud fallback on error. The target is whatever non-local lane the
            // operator actually configured (same selection as
            // BackendRegistry#selectBackend), never a hardcoded backend name. If
            // no such lane is configured, don't escalate — let the error surface.
            if (RETRY_CONFIG.cloudFallbackEnabled && usedBackend === 'local' && attempts <= RETRY_CONFIG.maxLocalRetries) {
              const errorFallback = this.selectNonLocalFallback(usedBackend);
              if (errorFallback) {
                console.error(`[ModifyFile] 🌐 Error fallback to ${errorFallback}`);
                usedBackend = errorFallback;
                continue;
              }
            }
          }
        }
      }

      if (!response && lastError) {
        throw lastError;
      }

      const processingTime = Date.now() - startTime;
      const responseText = this.extractResponseText(response);

      // 11. Parse response based on mode used
      let modifiedCode;
      let summary;
      let warnings = [];

      if (usingFIM) {
        // Parse FIM response
        const fimResult = this.parseFIMResponse(responseText, originalContent, insertionLine);
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

          // SAFETY: catch S/R blocks that hallucinated "replace with empty" and shrank the file.
          const srSizeRatio = modifiedCode.length / originalContent.length;
          if (srSizeRatio < 0.5) {
            console.error(`[ModifyFile] ❌ Safety check failed: result is ${(srSizeRatio * 100).toFixed(1)}% of original after S/R blocks`);
            return this.buildErrorResponse(
              `Safety check failed: result (${modifiedCode.length} chars) is ` +
              `${(srSizeRatio * 100).toFixed(1)}% of original (${originalContent.length} chars) ` +
              `after applying SEARCH/REPLACE blocks. Refusing to write — likely truncated or over-deleting.`
            );
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
            return this.buildErrorResponse(
              'Failed to parse modification response: no code extracted. ' +
              'The model may have returned only an explanation. ' +
              'Try again with a more specific instruction, or use analyze_file first to understand the current structure, then retry modify_file.'
            );
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
              `Next steps: (1) call analyze_file first to understand the structure, then retry modify_file with a more specific instruction; ` +
              `(2) or use the native Edit tool for a targeted in-context change.`
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

      // Auto-write mode (review=false): write directly without human review.
      // Caller controls `backup` (default true); when both review and backup
      // are disabled we warn loudly since there is no recovery path.
      let backupPath = null;
      if (backup) {
        backupPath = `${absolutePath}.backup.${Date.now()}`;
        await writeFileVerified(backupPath, originalContent, { label: 'modify_file backup' });
        console.error(`[ModifyFile] 💾 Backup created: ${backupPath}`);
      } else {
        console.error(`[ModifyFile] ⚠️  WARNING: auto-write (review:false) with backup:false — destructive, no recovery if the edit is wrong`);
      }

      // Write the modified file
      await writeFileVerified(absolutePath, modifiedCode, { label: 'modify_file auto-write', backupPath });

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

      return this.buildSuccessResponseWithSavings({
        status: 'written',
        filePath: absolutePath,
        diff,
        summary,
        stats,
        warnings,
        backupCreated: backup,
        backend_used: selectedBackend,
        processing_time: processingTime
      }, originalContent.length);

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
   * Pick the lane to escalate to when a request throws on the local backend.
   * Mirrors BackendRegistry#selectBackend's candidate selection: the
   * configured fallback chain narrowed to backends that are usable right now,
   * then the first candidate that isn't a local lane. The repo ships no model
   * ids and no backend names, so this is derived from the operator's own
   * configuration — never a literal.
   * @param {string} currentBackend - Backend that just failed (skipped)
   * @returns {string|null} Backend name to escalate to, or null to not escalate
   */
  selectNonLocalFallback(currentBackend) {
    const usable = new Set(this.backendRegistry?.getUsableBackends?.() || []);
    const chain = (this.backendRegistry?.getFallbackChain?.() || []).filter(b => usable.has(b));
    const candidates = chain.length > 0 ? chain : [...usable];

    return candidates.find(
      b => b !== currentBackend && this.backendRegistry?.getBackend?.(b)?.type !== 'local'
    ) || null;
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
   * Base URL of the local backend, for endpoints the chat-completions router
   * does not cover (e.g. llama.cpp's /infill).
   * @returns {string|null}
   */
  getLocalBaseUrl() {
    const url = this.backendRegistry?.getAdapter?.('local')?.config?.url;
    return typeof url === 'string' && url.length > 0 ? url : null;
  }

  /**
   * Decide how (or whether) to do fill-in-the-middle:
   *
   *   1. NATIVE /infill — the server answers it, so it applies the loaded model's
   *      OWN FIM tokens from GGUF metadata. Works for a model nobody has heard of.
   *   2. NONE — the caller does an ordinary SEARCH/REPLACE modify. Not a failure:
   *      FIM is an optimisation, and losing it on a server that cannot do it is
   *      correct. There is deliberately no name-keyed sentinel-token table to fall
   *      back to — one model family's sentinels sent to another model are treated
   *      as literal text and produce garbage.
   *
   * @returns {Promise<{mode: 'infill'|'none'}>}
   */
  async resolveFIMStrategy() {
    const baseUrl = this.getLocalBaseUrl();

    if (baseUrl) {
      try {
        if (await probeInfillSupport(baseUrl)) {
          return { mode: 'infill' };
        }
      } catch (error) {
        // A failed probe is not a failed modify — degrade to a normal modify.
        console.error(`[ModifyFile] /infill probe failed: ${error.message}`);
      }
    }

    return { mode: 'none' };
  }

  /**
   * Run a fill-in-the-middle completion through the server's native /infill.
   * @param {string} originalContent - Full file content
   * @param {string} instructions - What to insert
   * @param {number} insertionLine - 1-based line to insert at
   * @returns {Promise<string|null>} Generated middle, or null on any failure
   */
  async runNativeInfill(originalContent, instructions, insertionLine) {
    const baseUrl = this.getLocalBaseUrl();
    if (!baseUrl) return null;

    const lines = originalContent.split('\n');
    const prefix = `${lines.slice(0, insertionLine - 1).join('\n')}\n// TODO: ${instructions}\n`;
    const suffix = lines.slice(insertionLine - 1).join('\n');

    return runInfill(baseUrl, { prefix, suffix });
  }

  /**
   * Build a FIM (Fill-in-the-Middle) prompt for code insertion
   * Best for single-location insertions where we know prefix and suffix
   *
   * @param {string} originalContent - Full file content
   * @param {string} instructions - What to insert/modify
   * @param {number} insertionLine - Line number where to insert (1-based)
   * @returns {string} FIM-formatted prompt
   */
  buildFIMPrompt(originalContent, instructions, insertionLine) {
    // No sentinels: the native /infill path is the only FIM path, and the server
    // injects the model's own FIM tokens. The prompt here is just
    // prefix + instruction + suffix (also the honest size proxy for the capacity gate).
    const lines = originalContent.split('\n');

    // Split content at insertion point
    const prefixLines = lines.slice(0, insertionLine - 1);
    const suffixLines = lines.slice(insertionLine - 1);

    const prefix = prefixLines.join('\n');
    const suffix = suffixLines.join('\n');

    // Build FIM prompt with instruction as comment
    const instructionComment = `// TODO: ${instructions}\n`;

    return `${prefix}\n${instructionComment}${suffix}`;
  }

  /**
   * Parse FIM response - the model generates just the middle part
   * @param {string} response - Raw model response
   * @param {string} originalContent - Original file content
   * @param {number} insertionLine - Where the insertion was made
   * @returns {Object} { code: string, summary: string }
   */
  parseFIMResponse(response, originalContent, insertionLine) {
    const lines = originalContent.split('\n');

    // The native /infill path never echoes sentinels, so there is nothing to strip.
    let cleanResponse = response.trim();

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
        timeout: 90000,
        disableThinking: true
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
        timeout: 90000,
        disableThinking: true
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
   * Detect if modification response appears truncated based on structure
   * @param {string} responseText - Raw response from LLM
   * @returns {boolean} True if response appears truncated
   */
  detectModificationTruncation(responseText) {
    return detectOutputTruncation(responseText, { minLength: 20, format: 'modification' });
  }
}

export default ModifyFileHandler;
