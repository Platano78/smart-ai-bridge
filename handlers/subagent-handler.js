/**
 * Smart AI Bridge v1.3.0 - Subagent Handler
 * 
 * Handles spawn_subagent tool invocations:
 * 1. Validates request (role, task, file patterns)
 * 2. Resolves file patterns to actual files
 * 3. Constructs specialized prompt with role context
 * 4. Routes to appropriate backend
 * 5. Parses verdict from response
 * 6. Returns structured result
 */

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { getRoleTemplate } from '../config/role-templates.js';
import { parseVerdict, validateVerdict, extractTextContent, hasVerdict } from '../utils/verdict-parser.js';
import { validateSpawnSubagentRequest, validateFilePatterns, assessTaskQuality } from '../utils/role-validator.js';

/**
 * Subagent Handler
 */
export class SubagentHandler {
  /**
   * @param {Object} backendRouter - BackendRouter instance
   */
  constructor(backendRouter) {
    this.router = backendRouter;
  }

  /**
   * Handle spawn_subagent request
   * @param {Object} params - Request parameters
   * @returns {Promise<Object>}
   */
  async handle(params) {
    // Step 1: Validate request
    const validation = validateSpawnSubagentRequest(params);
    if (!validation.valid) {
      throw new Error(`Invalid spawn_subagent request: ${validation.errors.join(', ')}`);
    }

    // Show warnings
    if (validation.warnings.length > 0) {
      console.error(`⚠️  Warnings: ${validation.warnings.join(', ')}`);
    }

    // Step 2: Get role template
    const roleTemplate = getRoleTemplate(params.role);
    if (!roleTemplate) {
      throw new Error(`Role template not found: ${params.role}`);
    }

    // Step 3: Resolve file patterns (if provided)
    let fileContext = null;
    if (params.file_patterns && params.file_patterns.length > 0) {
      fileContext = await this._resolveFilePatterns(params.file_patterns);
      if (fileContext.files.length === 0) {
        console.error('⚠️  No files matched the provided patterns');
      }
    }

    // Step 4: Assess task quality
    const taskQuality = assessTaskQuality(params.task);
    if (taskQuality.suggestions.length > 0) {
      console.error(`💡 Task quality suggestions: ${taskQuality.suggestions.join(', ')}`);
    }

    // Step 5: Construct prompt
    const prompt = this._constructPrompt({
      roleTemplate,
      task: params.task,
      fileContext,
      additionalContext: params.context
    });

    // Step 6: Route to backend (supports env overrides)
    const backend = this._resolveBackend(params.role, roleTemplate.recommendedBackend);
    console.error(`🤖 Spawning ${roleTemplate.name} (${params.role}) on ${backend}...`);

    try {
      const result = await this.router.makeRequest(prompt, backend, {
        temperature: roleTemplate.temperature,
        max_tokens: 4096 // Verdicts can be long
      });

      // Step 7: Parse verdict
      const verdict = parseVerdict(result.response, params.verdict_mode || 'summary');
      const textContent = extractTextContent(result.response);

      // Step 8: Validate verdict
      let verdictValidation = null;
      if (verdict) {
        verdictValidation = validateVerdict(verdict, roleTemplate.verdictFormat);
        if (!verdictValidation.valid) {
          console.error(`⚠️  Verdict validation warnings: ${verdictValidation.errors.join(', ')}`);
        }
      }

      // Step 9: Return structured result
      return {
        success: true,
        role: params.role,
        role_name: roleTemplate.name,
        backend_used: result.backend,
        has_verdict: verdict !== null,
        verdict: verdict,
        text_content: textContent,
        raw_response: result.response,
        metadata: {
          task_quality: taskQuality.quality,
          files_analyzed: fileContext?.files.length || 0,
          verdict_valid: verdictValidation?.valid,
          verdict_warnings: verdictValidation?.warnings || [],
          latency: result.latency,
          tokens: result.tokens
        }
      };
    } catch (error) {
      console.error(`❌ Subagent failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Resolve file patterns to actual files
   * @private
   */
  async _resolveFilePatterns(patterns) {
    const allFiles = [];
    const matchedPatterns = [];

    for (const pattern of patterns) {
      try {
        const matches = await glob(pattern, {
          ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
          nodir: true
        });

        if (matches.length > 0) {
          allFiles.push(...matches);
          matchedPatterns.push({ pattern, count: matches.length });
        }
      } catch (error) {
        console.error(`⚠️  Failed to resolve pattern ${pattern}: ${error.message}`);
      }
    }

    // Remove duplicates
    const uniqueFiles = [...new Set(allFiles)];

    // Limit to 50 files (to avoid overwhelming the AI)
    const limitedFiles = uniqueFiles.slice(0, 50);
    if (uniqueFiles.length > 50) {
      console.error(`⚠️  Found ${uniqueFiles.length} files, limiting to 50 for analysis`);
    }

    // Read file contents (up to 100KB per file)
    const filesWithContent = [];
    for (const file of limitedFiles) {
      try {
        const stats = await fs.stat(file);
        if (stats.size > 100000) {
          console.error(`⚠️  Skipping large file: ${file} (${Math.round(stats.size / 1024)}KB)`);
          continue;
        }

        const content = await fs.readFile(file, 'utf-8');
        filesWithContent.push({ path: file, content });
      } catch (error) {
        console.error(`⚠️  Failed to read ${file}: ${error.message}`);
      }
    }

    return {
      patterns: matchedPatterns,
      files: filesWithContent
    };
  }

  /**
   * Construct prompt for subagent
   * @private
   */
  _constructPrompt({ roleTemplate, task, fileContext, additionalContext }) {
    let prompt = `${roleTemplate.systemPrompt}\n\n`;

    // Add task
    prompt += `# TASK\n${task}\n\n`;

    // Add file context if available
    if (fileContext && fileContext.files.length > 0) {
      prompt += `# FILES TO ANALYZE\n`;
      prompt += `You are analyzing ${fileContext.files.length} file(s):\n\n`;

      for (const file of fileContext.files) {
        prompt += `## File: ${file.path}\n`;
        prompt += `\`\`\`\n${file.content}\n\`\`\`\n\n`;
      }
    }

    // Add additional context
    if (additionalContext) {
      prompt += `# ADDITIONAL CONTEXT\n`;
      for (const [key, value] of Object.entries(additionalContext)) {
        prompt += `${key}: ${JSON.stringify(value)}\n`;
      }
      prompt += `\n`;
    }

    // Reminder to include verdict
    prompt += `\nIMPORTANT: Provide your analysis, then include a structured VERDICT as specified in your role instructions.`;

    return prompt;
  }

  /**
   * Resolve backend for subagent with environment override support
   * Priority: Global override > Role-specific override > Default
   * @private
   * @param {string} role - Role name (e.g., 'code-reviewer')
   * @param {string} defaultBackend - Default backend from role template
   * @returns {string} Resolved backend name
   */
  _resolveBackend(role, defaultBackend) {
    // Priority 1: Global override (SUBAGENT_DEFAULT_BACKEND)
    const globalOverride = process.env.SUBAGENT_DEFAULT_BACKEND;
    if (globalOverride) {
      return globalOverride;
    }

    // Priority 2: Role-specific override (SUBAGENT_CODE_REVIEWER_BACKEND, etc.)
    const envKey = `SUBAGENT_${role.toUpperCase().replace(/-/g, '_')}_BACKEND`;
    const roleOverride = process.env[envKey];
    if (roleOverride) {
      return roleOverride;
    }

    // Priority 3: Default from role template
    return defaultBackend;
  }
}
