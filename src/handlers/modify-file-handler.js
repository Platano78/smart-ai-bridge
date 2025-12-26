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

// Backend selection based on modification complexity
const MODIFY_BACKEND_MAP = {
  simple: 'local',           // Simple edits
  refactor: 'nvidia_qwen',   // Code restructuring
  complex: 'nvidia_deepseek', // Complex logic changes
  security: 'nvidia_deepseek' // Security-sensitive changes
};

export class ModifyFileHandler extends BaseHandler {

  /**
   * Execute file modification using local LLM
   * @param {Object} args - Modification arguments
   * @param {string} args.filePath - Path to the file to modify
   * @param {string} args.instructions - Natural language edit instructions
   * @param {Object} [args.options] - Optional configuration
   * @param {string} [args.options.backend] - Force specific backend
   * @param {boolean} [args.options.review] - Return for approval (default: true)
   * @param {string[]} [args.options.contextFiles] - For understanding dependencies
   * @param {boolean} [args.options.backup] - Create backup (default: true)
   * @param {boolean} [args.options.dryRun] - Show changes without writing
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
      review = true,
      contextFiles = [],
      backup = true,
      dryRun = false
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

      // 5. Build the modification prompt
      const prompt = this.buildModifyPrompt(originalContent, instructions, {
        filePath,
        language,
        contextContents
      });

      // 6. Determine the backend
      const selectedBackend = this.selectBackend(backend, complexity);

      console.error(`[ModifyFile] ✏️ Modifying ${filePath} (${originalContent.length} chars)`);
      console.error(`[ModifyFile] 🎯 Backend: ${selectedBackend}, Complexity: ${complexity}`);
      console.error(`[ModifyFile] 📋 Instructions: ${instructions.substring(0, 100)}...`);

      // 7. Route to LLM for modification
      const response = await this.routeRequest(prompt, {
        forceBackend: selectedBackend,
        maxTokens: 8000
      });

      const processingTime = Date.now() - startTime;

      // 8. Parse the modified code
      const modified = this.parseModifiedCode(response.content || response, language);

      // 9. Generate unified diff
      const diff = this.generateUnifiedDiff(
        originalContent,
        modified.code,
        filePath
      );

      // 10. Calculate change statistics
      const stats = this.calculateChangeStats(originalContent, modified.code);

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
          summary: modified.summary,
          stats,
          warnings: modified.warnings || [],
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
          status: 'pending_review',
          filePath: absolutePath,
          diff,
          modifiedContent: modified.code,
          summary: modified.summary,
          stats,
          warnings: modified.warnings || [],
          backend_used: selectedBackend,
          processing_time: processingTime,
          approval_options: {
            approve: 'Use write_files_atomic with the modifiedContent to apply changes',
            reject: 'Discard changes',
            edit: 'Manually modify the content before writing'
          }
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
      await fs.writeFile(absolutePath, modified.code, 'utf8');

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
        summary: modified.summary,
        stats,
        warnings: modified.warnings || [],
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
      prompt += '\n--- RELATED CONTEXT (for understanding dependencies) ---\n';
      for (const ctx of contextContents) {
        prompt += `\n=== ${ctx.path} ===\n${ctx.content}\n`;
      }
      prompt += '--- END CONTEXT ---\n';
    }

    prompt += `
REQUIREMENTS:
1. Apply the requested modifications precisely
2. Preserve all code that should not change
3. Maintain consistent coding style
4. Keep imports and dependencies intact
5. Ensure the modified code is syntactically correct
6. Do NOT add unnecessary changes

Respond with the following structure:

SUMMARY: [1-2 sentence description of changes made]

WARNINGS: [Any concerns about the modifications, or "None"]

MODIFIED_CODE:
\`\`\`${language}
[Complete modified file content here - include the ENTIRE file, not just changed parts]
\`\`\`
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

    return MODIFY_BACKEND_MAP[complexity] || 'local';
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
    const withoutMKG = Math.ceil(originalLength / 4) + Math.ceil(instructionsLength / 4);
    // With MKG, Claude only sees instructions + structured response
    const withMKG = Math.ceil(instructionsLength / 4) + 200; // ~200 tokens for response
    return Math.max(0, withoutMKG - withMKG);
  }
}

export default ModifyFileHandler;
