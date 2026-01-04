/**
 * Modify File Handler - Natural language file modifications with 95% token savings
 *
 * Claude sends NL instructions, local LLM reads file and generates diff,
 * Claude reviews small diff instead of full file content.
 *
 * @module handlers/modify-file-handler
 * @version 1.4.0
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { validatePath, safeJoin } from '../path-security.js';

/**
 * Validates modify_file request parameters
 * @param {Object} params - Request parameters
 * @returns {{valid: boolean, errors: string[], warnings: string[]}}
 */
export function validateModifyFileRequest(params) {
  const errors = [];
  const warnings = [];

  if (!params.filePath) {
    errors.push('filePath is required');
  }

  if (!params.instructions) {
    errors.push('instructions is required');
  }

  if (params.instructions && params.instructions.length < 10) {
    warnings.push('Instructions seem too brief - be specific about desired changes');
  }

  if (params.options?.dryRun === undefined) {
    warnings.push('Consider using dryRun: true to preview changes first');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Generate a unified diff between two strings
 * @param {string} original - Original content
 * @param {string} modified - Modified content
 * @param {string} filePath - File path for diff header
 * @returns {string}
 */
function generateUnifiedDiff(original, modified, filePath) {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');

  const diff = [`--- a/${filePath}`, `+++ b/${filePath}`];

  let i = 0, j = 0;
  let hunk = [];
  let hunkStart = -1;
  let originalStart = 0;
  let modifiedStart = 0;

  while (i < originalLines.length || j < modifiedLines.length) {
    if (i < originalLines.length && j < modifiedLines.length && originalLines[i] === modifiedLines[j]) {
      if (hunk.length > 0) {
        // Context line in active hunk
        hunk.push(` ${originalLines[i]}`);
      }
      i++;
      j++;
    } else {
      // Start new hunk if needed
      if (hunkStart === -1) {
        hunkStart = Math.max(0, i - 3);
        originalStart = hunkStart;
        modifiedStart = Math.max(0, j - 3);
        // Add context before
        for (let k = hunkStart; k < i; k++) {
          hunk.push(` ${originalLines[k]}`);
        }
      }

      // Find next matching line
      let foundMatch = false;
      for (let lookAhead = 1; lookAhead < 5 && !foundMatch; lookAhead++) {
        if (i + lookAhead < originalLines.length &&
            j < modifiedLines.length &&
            originalLines[i + lookAhead] === modifiedLines[j]) {
          // Lines were removed
          for (let k = 0; k < lookAhead; k++) {
            hunk.push(`-${originalLines[i + k]}`);
          }
          i += lookAhead;
          foundMatch = true;
        } else if (j + lookAhead < modifiedLines.length &&
                   i < originalLines.length &&
                   modifiedLines[j + lookAhead] === originalLines[i]) {
          // Lines were added
          for (let k = 0; k < lookAhead; k++) {
            hunk.push(`+${modifiedLines[j + k]}`);
          }
          j += lookAhead;
          foundMatch = true;
        }
      }

      if (!foundMatch) {
        // Changed line
        if (i < originalLines.length) {
          hunk.push(`-${originalLines[i]}`);
          i++;
        }
        if (j < modifiedLines.length) {
          hunk.push(`+${modifiedLines[j]}`);
          j++;
        }
      }
    }

    // Flush hunk if we have context after changes
    if (hunkStart !== -1) {
      const noMoreChanges = (i >= originalLines.length && j >= modifiedLines.length) ||
                           (i < originalLines.length && j < modifiedLines.length &&
                            originalLines.slice(i, i + 3).join('\n') === modifiedLines.slice(j, j + 3).join('\n'));

      if (noMoreChanges && hunk.some(l => l.startsWith('+') || l.startsWith('-'))) {
        // Add context after
        const contextAfter = Math.min(3, originalLines.length - i);
        for (let k = 0; k < contextAfter; k++) {
          hunk.push(` ${originalLines[i + k]}`);
        }

        const origCount = hunk.filter(l => !l.startsWith('+')).length;
        const modCount = hunk.filter(l => !l.startsWith('-')).length;
        diff.push(`@@ -${originalStart + 1},${origCount} +${modifiedStart + 1},${modCount} @@`);
        diff.push(...hunk);

        hunk = [];
        hunkStart = -1;
      }
    }
  }

  // Flush remaining hunk
  if (hunk.length > 0 && hunk.some(l => l.startsWith('+') || l.startsWith('-'))) {
    const origCount = hunk.filter(l => !l.startsWith('+')).length;
    const modCount = hunk.filter(l => !l.startsWith('-')).length;
    diff.push(`@@ -${originalStart + 1},${origCount} +${modifiedStart + 1},${modCount} @@`);
    diff.push(...hunk);
  }

  return diff.length > 2 ? diff.join('\n') : '(no changes)';
}

/**
 * ModifyFileHandler - Natural language file modifications
 */
export class ModifyFileHandler {
  /**
   * @param {Object} backendRouter - Backend router/registry instance
   * @param {Object} [options] - Handler options
   */
  constructor(backendRouter, options = {}) {
    this.router = backendRouter;
    this.options = {
      maxFileSize: 500000, // 500KB
      backupEnabled: true,
      backupDir: '.smart-ai-bridge-backups',
      ...options
    };
  }

  /**
   * Handle modify_file request
   * @param {Object} params - Request parameters
   * @returns {Promise<Object>}
   */
  async handle(params) {
    // Step 1: Validate request
    const validation = validateModifyFileRequest(params);
    if (!validation.valid) {
      throw new Error(`Invalid modify_file request: ${validation.errors.join(', ')}`);
    }

    if (validation.warnings.length > 0) {
      console.error(`[modify-file] Warnings: ${validation.warnings.join(', ')}`);
    }

    const { filePath, instructions, options = {} } = params;
    const dryRun = options.dryRun ?? false;
    const review = options.review ?? true;
    const backup = options.backup ?? this.options.backupEnabled;

    // Step 2: Read original file
    let originalContent;
    let fileStats;
    let resolvedPath;

    try {
      // 🔒 PATH SECURITY - Validate against traversal attacks
      resolvedPath = await validatePath(filePath);
      fileStats = await fs.stat(resolvedPath);

      if (fileStats.size > this.options.maxFileSize) {
        throw new Error(`File too large: ${Math.round(fileStats.size / 1024)}KB exceeds ${Math.round(this.options.maxFileSize / 1024)}KB limit`);
      }

      originalContent = await fs.readFile(resolvedPath, 'utf-8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw error;
    }

    // Step 3: Read context files if provided
    let contextContent = '';
    if (options.contextFiles && options.contextFiles.length > 0) {
      const contextFiles = [];
      for (const ctxPath of options.contextFiles.slice(0, 3)) {
        try {
          const validatedCtxPath = await validatePath(ctxPath);
          const content = await fs.readFile(validatedCtxPath, 'utf-8');
          contextFiles.push({ path: ctxPath, content: content.slice(0, 30000) });
        } catch (error) {
          console.error(`[modify-file] Failed to read context file ${ctxPath}: ${error.message}`);
        }
      }
      if (contextFiles.length > 0) {
        contextContent = '\n\n# RELATED FILES FOR CONTEXT (do not modify these)\n' +
          contextFiles.map(f => `## ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n');
      }
    }

    // Step 4: Construct modification prompt
    const prompt = `# FILE MODIFICATION REQUEST

## File to Modify: ${filePath}
\`\`\`
${originalContent}
\`\`\`
${contextContent}

## Modification Instructions
${instructions}

## Response Format
Return ONLY the complete modified file content. Do not include:
- Markdown code fences
- Explanations before or after
- Partial content

Return the ENTIRE file with your modifications applied.`;

    // Step 5: Route to backend for modification
    const backend = this._resolveBackend(options.backend);
    console.error(`[modify-file] Modifying ${filePath} on ${backend}...`);

    const startTime = Date.now();
    let modifiedContent;

    try {
      const result = await this.router.makeRequest(prompt, backend, {
        max_tokens: Math.min(originalContent.length * 2 + 1000, 16000),
        temperature: 0.2 // Low temperature for accurate modifications
      });

      modifiedContent = this._cleanResponse(result.response || result.content);
    } catch (error) {
      console.error(`[modify-file] Modification failed: ${error.message}`);
      throw error;
    }

    const latency = Date.now() - startTime;

    // Step 6: Generate diff
    const diff = generateUnifiedDiff(originalContent, modifiedContent, filePath);
    const hasChanges = diff !== '(no changes)';

    // Step 7: If review mode, return diff for approval
    if (review || dryRun) {
      return {
        success: true,
        filePath,
        dryRun: true,
        hasChanges,
        diff,
        originalHash: createHash('md5').update(originalContent).digest('hex'),
        modifiedHash: createHash('md5').update(modifiedContent).digest('hex'),
        modifiedContent: review ? modifiedContent : undefined, // Include for approval workflow
        metadata: {
          backend_used: backend,
          file_size_bytes: fileStats.size,
          latency_ms: latency,
          estimated_tokens_saved: Math.round(originalContent.length / 4)
        },
        message: dryRun ?
          'Dry run complete. Review the diff above.' :
          'Review the diff above. Call again with dryRun: false to apply.'
      };
    }

    // Step 8: Create backup if enabled
    if (backup && hasChanges) {
      await this._createBackup(resolvedPath, originalContent);
    }

    // Step 9: Write modified file
    if (hasChanges) {
      await fs.writeFile(resolvedPath, modifiedContent, 'utf-8');
      console.error(`[modify-file] Successfully modified ${filePath}`);
    }

    return {
      success: true,
      filePath,
      dryRun: false,
      hasChanges,
      diff,
      metadata: {
        backend_used: backend,
        file_size_bytes: fileStats.size,
        latency_ms: latency,
        backup_created: backup && hasChanges,
        estimated_tokens_saved: Math.round(originalContent.length / 4)
      },
      message: hasChanges ?
        `File modified successfully. ${backup ? 'Backup created.' : ''}` :
        'No changes were needed.'
    };
  }

  /**
   * Clean LLM response to extract pure code
   * @private
   */
  _cleanResponse(response) {
    if (!response) return '';

    let content = response.trim();

    // Remove markdown code fences
    const codeBlockMatch = content.match(/```[\w]*\n?([\s\S]*?)```/);
    if (codeBlockMatch) {
      content = codeBlockMatch[1];
    }

    // Remove common prefixes
    content = content.replace(/^(Here's|Here is|The modified|Modified|Updated|Below is)[^:]*:\s*/i, '');

    return content.trim();
  }

  /**
   * Create backup of original file
   * @private
   */
  async _createBackup(filePath, content) {
    const backupDir = safeJoin(path.dirname(filePath), this.options.backupDir);
    await fs.mkdir(backupDir, { recursive: true });

    const timestamp = Date.now();
    const fileName = path.basename(filePath);
    const backupPath = path.join(backupDir, `${fileName}.${timestamp}.bak`);

    await fs.writeFile(backupPath, content, 'utf-8');
    console.error(`[modify-file] Backup created: ${backupPath}`);
  }

  /**
   * Resolve backend with environment override support
   * @private
   */
  _resolveBackend(requestedBackend) {
    if (requestedBackend && requestedBackend !== 'auto') {
      return requestedBackend;
    }

    const envOverride = process.env.MODIFY_FILE_BACKEND;
    if (envOverride) {
      return envOverride;
    }

    return 'local';
  }
}

export default ModifyFileHandler;
