/**
 * @fileoverview SubagentHandler - Spawn specialized subagents with roles
 * @module handlers/subagent-handler
 *
 * Creates specialized AI subagents with predefined roles like code-reviewer,
 * security-auditor, and planner. Each role has customized system prompts,
 * suggested tools, and specialized behavior.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { BaseHandler } from './base-handler.js';
import { roleTemplates } from '../config/role-templates.js';
import { validateRole } from '../utils/role-validator.js';
import { SpawnMetrics } from '../monitoring/spawn-metrics.js';
import { parseGlobPattern } from '../utils/glob-parser.js';
import { parseVerdict } from '../utils/verdict-parser.js';
import {
  estimateTaskContextSize,
  findBestBackend,
  getBackendCapabilities,
  isSuitableForSubagent
} from '../utils/capability-matcher.js';

/**
 * Handler for spawning specialized subagents
 */
class SubagentHandler extends BaseHandler {
  /**
   * Create SubagentHandler
   * @param {HandlerContext} context - Handler context
   */
  constructor(context = {}) {
    super(context);

    /** @type {SpawnMetrics} */
    this.metrics = new SpawnMetrics();
  }

  /**
   * Execute subagent spawn
   * @param {Object} args - Spawn arguments
   * @param {string} args.role - Subagent role (code-reviewer, security-auditor, planner)
   * @param {string} args.task - Task description for subagent
   * @param {string[]} [args.file_patterns] - Glob patterns for files to analyze
   * @param {Object} [args.context] - Additional context for subagent
   * @param {string} [args.verdict_mode='summary'] - Verdict parsing mode (summary|full)
   * @returns {Promise<Object>}
   */
  async execute(args) {
    let {
      role,
      task,
      file_patterns = [],
      context = {},
      verdict_mode = 'summary'
    } = args;

    // Handle auto-role selection
    if (role === 'auto') {
      const selectedRole = await this.selectBestRole(task, context);
      if (selectedRole) {
        role = selectedRole;
        console.log(`[SUBAGENT] Auto-selected role: ${role}`);
      } else {
        // Default fallback
        role = 'code-reviewer';
        console.log(`[SUBAGENT] Auto-selection fallback: ${role}`);
      }
    }

    // Validate role
    const roleValidation = validateRole(role);
    if (!roleValidation.valid) {
      return this.buildErrorResponse(new Error(roleValidation.error));
    }

    const startTime = Date.now();
    this.metrics.recordSpawnAttempt(role);

    try {
      // Get role template
      const template = roleTemplates[role];

      // Resolve file patterns if provided
      const resolvedFiles = file_patterns.length > 0
        ? await this.resolveFilePatterns(file_patterns)
        : [];

      // Select backend FIRST (needed for dynamic file size limits)
      const backend = await this.selectBackendForRole(role, task);

      // Read file contents with backend-specific size limits
      console.log(`[SubagentHandler] Reading ${resolvedFiles.length} files for backend: ${backend}`);
      const fileContents = resolvedFiles.length > 0
        ? await this.readFileContents(resolvedFiles, this.getFileSizeLimits(backend))
        : [];
      console.log(`[SubagentHandler] File contents loaded: ${fileContents.length} files, ${fileContents.filter(f => f.content).length} with content`);

      // Generate specialized prompt with actual file contents
      const prompt = this.generatePrompt(template, task, fileContents, context);

      // Execute subagent task
      const response = await this.makeRequest(prompt, backend, {
        maxTokens: template.maxTokens || 8192,
        thinking: template.enableThinking !== false
      });

      const responseContent = response.content || response;

      // Parse verdict if this is a review/audit role
      const verdict = template.requiresVerdict
        ? parseVerdict(responseContent, verdict_mode)
        : null;

      const processingTime = Date.now() - startTime;
      this.metrics.recordSpawnSuccess(role, processingTime);

      const result = this.buildSuccessResponse({
        role,
        task,
        backend_used: backend,
        response: responseContent,
        verdict,
        files_analyzed: fileContents.length,
        suggested_tools: template.suggested_tools,
        processing_time_ms: processingTime,
        metrics: this.metrics.getMetricsSummary()
      });

      // Record execution for playbook learning
      await this.recordExecution(result, {
        handler: 'spawn_subagent',
        role,
        backend,
        task_type: template.category
      });

      // Record for compound learning
      await this.recordLearningOutcome(
        verdict?.passed ?? true,
        responseContent.length,
        backend,
        { taskType: 'subagent', role: role, source: 'subagent' }
      );

      return result;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.metrics.recordSpawnError(role, error.message);

      console.error(`[SubagentHandler] Spawn failed for role ${role}:`, error);

      return this.buildErrorResponse(error, {
        role,
        processing_time_ms: processingTime,
        metrics: this.metrics.getMetricsSummary()
      });
    }
  }

  /**
   * Generate specialized prompt for subagent
   * @private
   * @param {Object} template - Role template
   * @param {string} task - Task description
   * @param {string[]} files - Resolved file paths
   * @param {Object} context - Additional context
   * @returns {string}
   */
  generatePrompt(template, task, files, context) {
    const parts = [
      `# ${template.description}`,
      '',
      `## System Role`,
      template.system_prompt,
      '',
      `## Task`,
      task
    ];

    // Include actual file contents (not just paths)
    if (files.length > 0) {
      parts.push('', '## Files to Analyze');
      for (const file of files) {
        if (file.error) {
          // Handle file read errors gracefully
          parts.push(`\n### ${file.path}\n**Error reading file**: ${file.error}`);
        } else if (file.content) {
          // Format file with syntax highlighting based on extension
          const ext = path.extname(file.path).slice(1) || 'text';
          const truncationNote = file.truncated
            ? ` (truncated: ${file.content.length}/${file.originalSize} bytes)`
            : '';
          parts.push(`\n### ${file.path}${truncationNote}`);
          parts.push('```' + ext);
          parts.push(file.content);
          parts.push('```');
        } else {
          // Fallback for backwards compatibility (if file is just a path string)
          parts.push(`\n- ${file}`);
        }
      }
    }

    if (template.suggested_tools && template.suggested_tools.length > 0) {
      parts.push('', '## Available Tools', template.suggested_tools.map(t => `- ${t}`).join('\n'));
    }

    if (Object.keys(context).length > 0) {
      parts.push('', '## Additional Context', JSON.stringify(context, null, 2));
    }

    if (template.output_format) {
      parts.push('', '## Output Format', template.output_format);
    }

    // Apply template replacements (e.g., {{SLOTS}} -> actual slot count)
    let result = parts.join('\n');
    if (context.slot_replacement) {
      for (const [placeholder, value] of Object.entries(context.slot_replacement)) {
        // Simple string replacement - no regex needed for literal placeholders
        result = result.split(placeholder).join(value);
      }
    }

    return result;
  }

  /**
   * Select optimal backend for role using dynamic capability matching
   * @private
   * @param {string} role - Subagent role
   * @param {string} task - Task description
   * @param {string[]} [filePatterns=[]] - File patterns for context estimation
   * @returns {Promise<string>}
   */
  async selectBackendForRole(role, task, filePatterns = []) {
    const template = roleTemplates[role];

    // Step 1: Estimate task context requirements
    const contextSize = estimateTaskContextSize(task, filePatterns);
    console.error(`[Subagent] Task context size: ${contextSize}`);

    // Step 2: Get available backends (exclude orchestrators)
    const availableBackends = await this.getAvailableBackendsForSubagent();
    console.error(`[Subagent] Available backends: ${availableBackends.join(', ')}`);

    // Step 3: Use capability matching to find best backend
    const result = findBestBackend({
      requiredCapabilities: template.required_capabilities || [],
      availableBackends,
      fallbackOrder: template.fallback_order || [],
      contextSize,
      routingRules: template.routing_rules || null,
      getLocalCapabilities: () => this.getLocalCapabilities()
    });

    console.error(`[Subagent] Selected backend: ${result.backend} (${result.reason})`);
    return result.backend || 'local';
  }

  /**
   * Get list of backends suitable for subagent work (excludes orchestrators)
   * @private
   * @returns {Promise<string[]>}
   */
  async getAvailableBackendsForSubagent() {
    const allBackends = ['local', 'nvidia_deepseek', 'nvidia_qwen', 'gemini', 'groq_llama'];
    const available = [];

    for (const backend of allBackends) {
      try {
        // Check health/availability
        const isAvailable = await this.isBackendAvailable(backend);
        if (!isAvailable) continue;

        // For local, check it's not an orchestrator
        if (backend === 'local') {
          const localAdapter = this.getLocalAdapter();
          if (localAdapter && localAdapter.isOrchestrator && localAdapter.isOrchestrator()) {
            console.error('[Subagent] Skipping local - orchestrator model detected');
            continue;
          }
        }

        // Check if suitable for subagent work
        if (isSuitableForSubagent(backend)) {
          available.push(backend);
        }
      } catch (e) {
        // Backend not available, skip
      }
    }

    return available.length > 0 ? available : ['local']; // Ultimate fallback
  }

  /**
   * Get capabilities of local model (dynamic based on detected model)
   * @private
   * @returns {string[]}
   */
  getLocalCapabilities() {
    const localAdapter = this.getLocalAdapter();
    if (localAdapter && localAdapter.getModelCapabilities) {
      return localAdapter.getModelCapabilities();
    }
    return ['general'];
  }

  /**
   * Get the local adapter instance
   * @private
   * @returns {Object|null}
   */
  getLocalAdapter() {
    // Access from context or registry
    return this.context?.adapters?.local || this.context?.localAdapter || null;
  }

  /**
   * Check if a backend is available with actual health check
   * @private
   * @param {string} backend - Backend name
   * @returns {Promise<boolean>}
   */
  async isBackendAvailable(backend) {
    const HEALTH_TIMEOUT = 5000; // 5 second timeout for health check

    try {
      // Use router's backend availability check if available
      if (this.context?.router?.isBackendAvailable) {
        return await this.context.router.isBackendAvailable(backend);
      }

      // For local backend, do a quick health ping
      if (backend === 'local') {
        return await this.checkLocalHealth(HEALTH_TIMEOUT);
      }

      // For NVIDIA backends, check with cached health status
      if (backend.startsWith('nvidia_')) {
        return await this.checkNvidiaHealth(backend, HEALTH_TIMEOUT);
      }

      // For other backends (gemini, groq), assume available
      // They have their own timeout handling in adapters
      return true;
    } catch (e) {
      console.error(`[SubagentHandler] Health check failed for ${backend}:`, e.message);
      return false;
    }
  }

  /**
   * Check local backend health with timeout
   * @private
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<boolean>}
   */
  async checkLocalHealth(timeout) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      // Try to reach local endpoint (vLLM or LM Studio)
      const endpoints = [
        'http://localhost:8000/v1/models',  // vLLM
        'http://localhost:1234/v1/models',  // LM Studio
        'http://127.0.0.1:8000/v1/models',
        'http://127.0.0.1:1234/v1/models'
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            method: 'GET',
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (response.ok) {
            console.error(`[SubagentHandler] Local backend healthy at ${endpoint}`);
            return true;
          }
        } catch (e) {
          // Try next endpoint
        }
      }

      clearTimeout(timeoutId);
      console.error('[SubagentHandler] Local backend not responding');
      return false;
    } catch (e) {
      if (e.name === 'AbortError') {
        console.error('[SubagentHandler] Local health check timed out');
      }
      return false;
    }
  }

  /**
   * Check NVIDIA backend health with cached status
   * @private
   * @param {string} backend - Backend name (nvidia_deepseek, nvidia_qwen)
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<boolean>}
   */
  async checkNvidiaHealth(backend, timeout) {
    try {
      // Use cached health status from BackendHealthManager if available
      if (this.context?.healthManager?.getBackendStatus) {
        const status = this.context.healthManager.getBackendStatus(backend);
        if (status && status.healthy !== undefined) {
          console.error(`[SubagentHandler] ${backend} cached status: ${status.healthy ? 'healthy' : 'unhealthy'}`);
          return status.healthy;
        }
      }

      // If no health manager, be conservative - NVIDIA backends are slow to timeout
      // Return false to prefer local backend which responds quickly
      console.error(`[SubagentHandler] No health status for ${backend}, skipping (prefer local)`);
      return false;
    } catch (e) {
      console.error(`[SubagentHandler] NVIDIA health check error:`, e.message);
      return false;
    }
  }

  /**
   * Select the best role for a task using orchestrator LLM
   * @private
   * @param {string} task - Task description
   * @param {Object} context - Additional context
   * @returns {Promise<string|null>} Selected role or null
   */
  async selectBestRole(task, context = {}) {
    const availableRoles = Object.keys(roleTemplates).filter(r => r !== 'auto');
    
    const prompt = `Select the BEST role for this task. Reply with ONLY the role name, nothing else.

Task: ${task}
${context.phase ? `Phase: ${context.phase}` : ''}

Available roles:
${availableRoles.map(r => `- ${r}: ${roleTemplates[r].description}`).join('\n')}

Best role:`;

    try {
      // Use orchestrator for intelligent selection
      const router = this.context?.router;
      if (!router) {
        console.log('[SUBAGENT] No router available for auto-selection');
        return null;
      }

      const response = await router.route({
        prompt,
        max_tokens: 50,
        temperature: 0.1
      });

      if (response?.content) {
        // Extract role name from response
        const selected = response.content
          .trim()
          .toLowerCase()
          .replace(/[^a-z-]/g, '');
        
        // Validate it's a real role
        if (availableRoles.includes(selected)) {
          return selected;
        }
        
        // Try fuzzy match
        const match = availableRoles.find(r => 
          selected.includes(r) || r.includes(selected)
        );
        if (match) return match;
      }
    } catch (error) {
      console.log(`[SUBAGENT] Auto-selection error: ${error.message}`);
    }

    return null;
  }

  /**
   * Resolve glob patterns to file paths
   * @private
   * @param {string[]} patterns - Glob patterns
   * @returns {Promise<string[]>}
   */
  async resolveFilePatterns(patterns) {
    const allFiles = [];

    for (const pattern of patterns) {
      const resolved = await parseGlobPattern(pattern);
      allFiles.push(...resolved);
    }

    return [...new Set(allFiles)]; // Deduplicate
  }


  /**
   * Get file size limits based on backend context window
   * @param {string} backend - Backend identifier
   * @returns {Object} - { maxTotalSize, maxSizePerFile }
   */
  getFileSizeLimits(backend) {
    const LIMITS = {
      local: { maxTotalSize: 400000, maxSizePerFile: 100000 },
      nvidia_deepseek: { maxTotalSize: 50000, maxSizePerFile: 25000 },
      nvidia_qwen: { maxTotalSize: 150000, maxSizePerFile: 50000 },
      gemini: { maxTotalSize: 150000, maxSizePerFile: 50000 },
      openai_chatgpt: { maxTotalSize: 500000, maxSizePerFile: 100000 },
      groq_llama: { maxTotalSize: 150000, maxSizePerFile: 50000 }
    };
    return LIMITS[backend] || LIMITS.nvidia_qwen; // Safe default
  }

  /**
   * Read file contents with size limits
   * @param {string[]} filePaths - Array of file paths to read
   * @param {Object} options - Size limit options
   * @param {number} [options.maxSizePerFile=50000] - Max bytes per file
   * @param {number} [options.maxTotalSize=200000] - Max total bytes
   * @returns {Promise<Array<{path: string, content?: string, truncated?: boolean, error?: string}>>}
   */
  async readFileContents(filePaths, options = {}) {
    const { maxSizePerFile = 50000, maxTotalSize = 200000 } = options;
    const contents = [];
    let totalSize = 0;

    for (const filePath of filePaths) {
      if (totalSize >= maxTotalSize) {
        console.log(`[SubagentHandler] Skipping ${filePath} - total size limit reached (${totalSize}/${maxTotalSize})`);
        break;
      }

      try {
        const content = await fs.readFile(filePath, 'utf8');
        const remainingBudget = maxTotalSize - totalSize;
        const effectiveMax = Math.min(maxSizePerFile, remainingBudget);
        const truncated = content.length > effectiveMax;
        const finalContent = truncated ? content.slice(0, effectiveMax) : content;

        contents.push({
          path: filePath,
          content: finalContent,
          truncated,
          originalSize: content.length
        });

        totalSize += finalContent.length;
        console.log(`[SubagentHandler] Read ${filePath}: ${finalContent.length} bytes${truncated ? ' (truncated)' : ''}`);
      } catch (err) {
        console.error(`[SubagentHandler] Failed to read ${filePath}:`, err.message);
        contents.push({
          path: filePath,
          error: err.message
        });
      }
    }

    console.log(`[SubagentHandler] Total files read: ${contents.length}, total size: ${totalSize} bytes`);
    return contents;
  }
}

export { SubagentHandler };
