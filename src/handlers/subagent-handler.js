/**
 * @fileoverview SubagentHandler - Spawn specialized subagents with roles
 * @module handlers/subagent-handler
 *
 * Creates specialized AI subagents with predefined roles like code-reviewer,
 * security-auditor, and planner. Each role has customized system prompts,
 * suggested tools, and specialized behavior.
 */

import { promises as fs, existsSync, mkdirSync, writeFileSync } from 'fs';
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
   * @param {boolean} [args.write_files=false] - Write generated code to files
   * @param {string} [args.work_directory] - Directory for generated files
   * @returns {Promise<Object>}
   */
  async execute(args) {
    let {
      role,
      task,
      file_patterns = [],
      context = {},
      verdict_mode = 'summary',
      write_files = false,  // Default false for spawn_subagent (explicit opt-in)
      work_directory
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

    // Declare backend before try block so it's accessible in catch block
    let backend;

    try {
      // Get role template
      const template = roleTemplates[role];

      // Resolve file patterns if provided
      const resolvedFiles = file_patterns.length > 0
        ? await this.resolveFilePatterns(file_patterns)
        : [];

      // Select backend FIRST (needed for dynamic file size limits)
      backend = await this.selectBackendForRole(role, task);

      // Read file contents with backend-specific size limits
      console.log(`[SubagentHandler] Reading ${resolvedFiles.length} files for backend: ${backend}`);
      const fileContents = resolvedFiles.length > 0
        ? await this.readFileContents(resolvedFiles, this.getFileSizeLimits(backend))
        : [];
      console.log(`[SubagentHandler] File contents loaded: ${fileContents.length} files, ${fileContents.filter(f => f.content).length} with content`);

      // Generate specialized prompt with actual file contents
      const prompt = this.generatePrompt(template, task, fileContents, context);

      // Execute subagent task - use fallback chain if available, else direct request
      const requestOptions = {
        maxTokens: template.maxTokens || 8192,
        thinking: template.enableThinking !== false
      };

      const response = typeof this.router.makeRequestWithFallback === 'function'
        ? await this.router.makeRequestWithFallback(prompt, backend, requestOptions)
        : await this.router.makeRequest(prompt, backend, requestOptions);

      // Log actual backend used (might differ from selected if fallback triggered)
      const actualBackend = response.backend || backend;
      if (actualBackend !== backend) {
        console.error(`[SubagentHandler] Fallback triggered: ${backend} → ${actualBackend}`);
      }

      // Safely extract content - must be a string, not fallback to response object
      // Using typeof check because empty string "" is valid content but falsy
      let responseContent = typeof response.content === 'string'
        ? response.content
        : (typeof response === 'string' ? response : String(response.content ?? ''));

      // NEW: Detect degenerate/repetitive output (fix for local LLM loops)
      const degenerateCheck = this._detectDegenerateOutput(responseContent);
      if (degenerateCheck.isDegenerate) {
        console.error(`[SubagentHandler] ⚠️ Degenerate output detected: ${degenerateCheck.reason}`);
        // Truncate at first sign of repetition (keep useful prefix)
        const truncatePoint = this._findRepetitionStart(responseContent);
        if (truncatePoint > 100) {
          responseContent = responseContent.substring(0, truncatePoint) + 
            '\n\n[Output truncated: repetitive content detected]';
          console.error(`[SubagentHandler] Truncated output at position ${truncatePoint}`);
        } else {
          // Output is mostly garbage, return error
          return this.buildErrorResponse(new Error(`LLM produced degenerate output: ${degenerateCheck.reason}`), {
            role,
            backend_used: actualBackend,
            processing_time_ms: Date.now() - startTime,
            degenerate_output: true,
            metrics: this.metrics.getMetricsSummary()
          });
        }
      }

      // Parse verdict if this is a review/audit role
      const verdict = template.requiresVerdict
        ? parseVerdict(responseContent, verdict_mode)
        : null;

      const processingTime = Date.now() - startTime;
      this.metrics.recordSpawnSuccess(role, processingTime);

      // NEW: Write generated code to files if enabled
      let writtenFiles = [];
      if (write_files && responseContent) {
        const workDir = work_directory || `/tmp/subagent-${role}-${Date.now()}`;
        const codeBlocks = this.parseCodeBlocks(responseContent);
        if (codeBlocks.length > 0) {
          writtenFiles = this.writeGeneratedFiles(codeBlocks, workDir, role);
          console.error(`[SubagentHandler] Wrote ${writtenFiles.length} files to ${workDir}`);
        }
      }

      const result = this.buildSuccessResponse({
        role,
        task,
        backend_used: backend,
        response: responseContent,
        verdict,
        files_analyzed: fileContents.length,
        files_written: writtenFiles,  // NEW: Include written files
        work_directory: write_files ? (work_directory || `/tmp/subagent-${role}-${Date.now()}`) : null,
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

      // Enhanced error logging with structured details
      const errorInfo = {
        type: error.name || 'Error',
        message: error.message,
        code: error.code,
        cause: error.cause?.message
      };

      console.error(`[SubagentHandler] Spawn failed:`, JSON.stringify({
        role,
        backend: backend || 'not_selected',
        processingTime,
        error: errorInfo
      }, null, 2));

      return this.buildErrorResponse(error, {
        role,
        processing_time_ms: processingTime,
        error_type: error.name,
        error_code: error.code,
        metrics: this.metrics.getMetricsSummary()
      });
    }
  }

  /**
   * Detect if LLM output is degenerate (repetitive garbage)
   * Council-synthesized patterns for comprehensive detection
   * @private
   * @param {string} content - LLM output to check
   * @returns {{isDegenerate: boolean, reason: string|null}}
   */
  _detectDegenerateOutput(content) {
    if (!content || content.length < 200) {
      return { isDegenerate: false, reason: null };
    }

    const trimmed = content.trim();

    // Pattern 1: Word repeated 6+ times consecutively (test test test test test test)
    const wordRepeat = /(\b\w+\b)(?:\s+\1){5,}/i;
    if (wordRepeat.test(trimmed)) {
      const match = trimmed.match(wordRepeat);
      return {
        isDegenerate: true,
        reason: `Word repetition: "${match[0].substring(0, 50)}..."`
      };
    }

    // Pattern 2: Phrase with ellipsis repeated (processing... processing...)
    const ellipsisRepeat = /(\b\w+\.{3}\s*){3,}/i;
    if (ellipsisRepeat.test(trimmed)) {
      const match = trimmed.match(ellipsisRepeat);
      return {
        isDegenerate: true,
        reason: `Ellipsis phrase repeated: "${match[0].substring(0, 50)}..."`
      };
    }

    // Pattern 3: Asterisk/bullet spam (5+ asterisks with optional spaces)
    const asteriskSpam = /(?:\*\s*){5,}|\*{5,}/;
    if (asteriskSpam.test(trimmed)) {
      return {
        isDegenerate: true,
        reason: 'Asterisk spam detected'
      };
    }

    // Pattern 4: Same phrase repeated (any 5-40 char sequence repeated 4+ times)
    const phraseRepeat = /(.{5,40}?)\1{3,}/;
    if (phraseRepeat.test(trimmed)) {
      const match = trimmed.match(phraseRepeat);
      return {
        isDegenerate: true,
        reason: `Phrase repetition: "${match[0].substring(0, 50)}..."`
      };
    }

    // Pattern 5: Known degenerate patterns
    if (/parse\s+parse\s+parse/i.test(trimmed)) {
      return {
        isDegenerate: true,
        reason: 'Known degenerate pattern (parse loop)'
      };
    }

    // Pattern 6: Check last 30% of text for repetition (mixed content case)
    const textLength = trimmed.length;
    if (textLength > 200) {
      const endSection = trimmed.substring(Math.floor(textLength * 0.7));
      const endWordRepeat = /(\b\w+\b)(?:\s+\1){3,}/i;
      if (endWordRepeat.test(endSection)) {
        const match = endSection.match(endWordRepeat);
        return {
          isDegenerate: true,
          reason: `End section repetition: "${match[0].substring(0, 50)}..."`
        };
      }
    }

    // Pattern 7: Very low entropy (same characters over and over)
    const sample = trimmed.substring(0, 3000);
    const charCounts = {};
    for (const char of sample) {
      charCounts[char] = (charCounts[char] || 0) + 1;
    }
    const uniqueChars = Object.keys(charCounts).length;
    const entropyRatio = uniqueChars / sample.length;

    if (entropyRatio < 0.01) {
      return {
        isDegenerate: true,
        reason: `Low character entropy: ${(entropyRatio * 100).toFixed(2)}%`
      };
    }

    // Pattern 8: Same line repeated >50% of output
    const lines = trimmed.split('\n').filter(l => l.trim().length > 5);
    if (lines.length > 20) {
      const lineCounts = {};
      for (const line of lines) {
        const normalized = line.trim().toLowerCase();
        lineCounts[normalized] = (lineCounts[normalized] || 0) + 1;
      }
      const maxRepeats = Math.max(...Object.values(lineCounts));
      if (maxRepeats > lines.length * 0.5) {
        return {
          isDegenerate: true,
          reason: `Line repeated ${maxRepeats}/${lines.length} times`
        };
      }
    }

    return { isDegenerate: false, reason: null };
  }

  /**
   * Find where repetition starts in the content
   * Uses exec() to get actual match positions
   * @private
   * @param {string} content - Content to analyze
   * @returns {number} - Position where useful content ends
   */
  _findRepetitionStart(content) {
    if (!content) return 0;

    // Patterns that indicate repetition - use exec() for position
    const patternDefs = [
      /(\b\w+\b)(?:\s+\1){4,}/gi,    // Word repeated 5+ times
      /(.{5,30}?)\1{3,}/g,           // Phrase repeated 4+ times
      /(\b\w+\.{3}\s*){3,}/gi,       // Ellipsis phrase repeated
      /(?:\*\s*){5,}/g,              // Asterisk spam
    ];

    let earliestMatch = content.length;

    for (const pattern of patternDefs) {
      // Reset lastIndex for global patterns
      pattern.lastIndex = 0;
      const match = pattern.exec(content);
      if (match && match.index !== undefined) {
        earliestMatch = Math.min(earliestMatch, match.index);
      }
    }

    // If no pattern match found, use structural heuristics
    if (earliestMatch === content.length) {
      // Find last complete structural element
      const lastCodeBlockEnd = content.lastIndexOf('```');
      const lastNewlinePara = content.lastIndexOf('\n\n');
      const lastListItem = content.lastIndexOf('\n- ');

      // Use the latest structural boundary that's at least halfway through
      const halfPoint = Math.floor(content.length / 2);
      const candidates = [lastCodeBlockEnd, lastNewlinePara, lastListItem]
        .filter(pos => pos > halfPoint);

      if (candidates.length > 0) {
        earliestMatch = Math.max(...candidates);
      } else {
        earliestMatch = halfPoint;
      }
    }

    // Ensure we keep at least some content (minimum 100 chars)
    return Math.max(earliestMatch, Math.min(100, content.length));
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

    // Step 2: Get available backends (exclude non-capable backends)
    const availableBackends = await this.getAvailableBackendsForSubagent();
    console.error(`[Subagent] Available backends: ${availableBackends.join(', ')}`);

    // Step 3: Pre-fetch local capabilities (CRITICAL: must await initialization)
    const localCaps = await this.getLocalCapabilities();
    console.error(`[Subagent] Pre-fetched local capabilities:`, localCaps);

    // Step 4: Use capability matching to find best backend
    const result = findBestBackend({
      requiredCapabilities: template.required_capabilities || [],
      availableBackends,
      fallbackOrder: template.fallback_order || [],
      contextSize,
      routingRules: template.routing_rules || null,
      getLocalCapabilities: () => localCaps  // Return pre-fetched (no async needed)
    });

    console.error(`[Subagent] Selected backend: ${result.backend} (${result.reason})`);
    return result.backend || 'local';
  }

  /**
   * Get list of backends suitable for subagent work (excludes non-capable backends)
   * @private
   * @returns {Promise<string[]>}
   */
  async getAvailableBackendsForSubagent() {
    const allBackends = ['local', 'nvidia_deepseek', 'nvidia_qwen', 'gemini', 'groq_llama'];
    const available = [];
    const circuitOpenBackends = [];

    for (const backend of allBackends) {
      try {
        // Check circuit breaker first (fast check)
        const adapter = this.context?.router?.backends?.getAdapter?.(backend);
        if (adapter?.circuitOpen) {
          circuitOpenBackends.push(backend);
          continue;
        }

        // Check health/availability
        const isAvailable = await this.isBackendAvailable(backend);
        if (!isAvailable) continue;

        // Local backend check passed

        // Check if suitable for subagent work
        if (isSuitableForSubagent(backend)) {
          available.push(backend);
        }
      } catch (e) {
        // Backend not available, skip
      }
    }

    // Log circuit breaker status for visibility
    if (circuitOpenBackends.length > 0) {
      console.error(`[Subagent] Circuit breakers open: ${circuitOpenBackends.join(', ')}`);
    }

    return available.length > 0 ? available : ['local']; // Ultimate fallback
  }

  /**
   * Get capabilities of local model (dynamic based on detected model)
   * @private
   * @returns {string[]}
   */
  async getLocalCapabilities() {
    const localAdapter = this.getLocalAdapter();
    console.error('[DEBUG] getLocalCapabilities - localAdapter exists:', !!localAdapter);

    // CRITICAL FIX: Ensure adapter is fully initialized before getting capabilities
    if (localAdapter && localAdapter.ensureInitialized) {
      await localAdapter.ensureInitialized();
      console.error('[DEBUG] getLocalCapabilities - ensureInitialized() complete');
    }

    if (localAdapter && localAdapter.getModelCapabilities) {
      const caps = localAdapter.getModelCapabilities();
      console.error('[DEBUG] getLocalCapabilities - returned caps:', caps);
      return caps;
    }
    console.error('[DEBUG] getLocalCapabilities - fallback to [general]');
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
      console.error(`[DEBUG] isBackendAvailable(${backend}) - checking...`);

      // PRIORITY 1: Check circuit breaker status first (fast, no network call)
      const adapter = this.context?.router?.backends?.getAdapter?.(backend);
      console.error(`[DEBUG] isBackendAvailable(${backend}) - adapter exists:`, !!adapter, 'circuitOpen:', adapter?.circuitOpen);
      if (adapter?.circuitOpen) {
        console.error(`[SubagentHandler] Backend ${backend} skipped - circuit breaker open`);
        return false;
      }

      // Use router's backend availability check if available
      if (this.context?.router?.isBackendAvailable) {
        const result = await this.context.router.isBackendAvailable(backend);
        console.error(`[DEBUG] isBackendAvailable(${backend}) - router check result:`, result);
        return result;
      }

      // For local backend, do a quick health ping
      if (backend === 'local') {
        const result = await this.checkLocalHealth(HEALTH_TIMEOUT);
        console.error(`[DEBUG] isBackendAvailable(${backend}) - checkLocalHealth result:`, result);
        return result;
      }

      // For NVIDIA backends, check with cached health status
      if (backend.startsWith('nvidia_')) {
        const result = await this.checkNvidiaHealth(backend, HEALTH_TIMEOUT);
        console.error(`[DEBUG] isBackendAvailable(${backend}) - checkNvidiaHealth result:`, result);
        return result;
      }

      // For other backends (gemini, groq), assume available
      // They have their own timeout handling in adapters
      console.error(`[DEBUG] isBackendAvailable(${backend}) - assumed available`);
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
      // Priority: llama.cpp (8081) first, then vLLM (8000), then LM Studio (1234)
      const endpoints = [
        'http://127.0.0.1:8081/v1/models',  // llama.cpp router
        'http://127.0.0.1:8081/health',     // llama.cpp health endpoint
        'http://127.0.0.1:8000/v1/models',  // vLLM
        'http://127.0.0.1:1234/v1/models'   // LM Studio
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
      // Use local backend for intelligent selection
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

  /**
   * Parse code blocks from LLM response
   * Extracts code with language hints and optional filename from comments
   * @param {string} response - Raw LLM response containing code blocks
   * @returns {Array<{language: string, filename: string|null, code: string}>}
   */
  parseCodeBlocks(response) {
    if (!response || typeof response !== 'string') {
      return [];
    }

    const codeBlocks = [];
    const regex = /```(\w+)?\s*\n([\s\S]*?)```/g;
    let match;

    while ((match = regex.exec(response)) !== null) {
      const language = match[1] || 'txt';
      const code = match[2].trim();

      // Try to extract filename from first comment line
      let filename = null;
      const lines = code.split('\n');
      const firstLine = lines[0] || '';

      const filenamePatterns = [
        /^#\s*(\S+\.\w+)/,
        /^\/\/\s*(\S+\.\w+)/,
        /^\/\*\s*(\S+\.\w+)/,
        /^['"]?(\S+\.\w+)['"]?$/,
        /^@file(?:name)?\s+(\S+\.\w+)/i
      ];

      for (const pattern of filenamePatterns) {
        const filenameMatch = firstLine.match(pattern);
        if (filenameMatch) {
          filename = filenameMatch[1];
          break;
        }
      }

      if (!filename) {
        const extensions = {
          javascript: 'js', typescript: 'ts', python: 'py',
          java: 'java', csharp: 'cs', cpp: 'cpp', c: 'c',
          rust: 'rs', go: 'go', ruby: 'rb', php: 'php',
          swift: 'swift', kotlin: 'kt', scala: 'scala',
          html: 'html', css: 'css', scss: 'scss',
          json: 'json', yaml: 'yaml', xml: 'xml',
          sql: 'sql', bash: 'sh', shell: 'sh', sh: 'sh'
        };
        const ext = extensions[language.toLowerCase()] || language.toLowerCase() || 'txt';
        filename = `generated_${codeBlocks.length + 1}.${ext}`;
      }

      codeBlocks.push({ language, filename, code });
    }

    return codeBlocks;
  }

  /**
   * Write generated code blocks to files
   * @param {Array} codeBlocks - Parsed code blocks
   * @param {string} workDir - Work directory path
   * @param {string} role - Role name for organizing files
   * @returns {Array<{path: string, filename: string, language: string, bytes: number}>}
   */
  writeGeneratedFiles(codeBlocks, workDir, role) {
    const writtenFiles = [];

    // Ensure work directory exists
    if (!existsSync(workDir)) {
      mkdirSync(workDir, { recursive: true });
    }

    for (const block of codeBlocks) {
      try {
        const safeFilename = block.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        let filePath = path.join(workDir, safeFilename);

        // Handle duplicates
        if (existsSync(filePath)) {
          const ext = path.extname(safeFilename);
          const base = path.basename(safeFilename, ext);
          filePath = path.join(workDir, `${base}_${Date.now()}${ext}`);
        }

        writeFileSync(filePath, block.code, 'utf8');

        writtenFiles.push({
          path: filePath,
          filename: path.basename(filePath),
          language: block.language,
          bytes: Buffer.byteLength(block.code, 'utf8')
        });

        console.error(`[SubagentHandler] Wrote: ${filePath} (${block.language}, ${writtenFiles[writtenFiles.length - 1].bytes} bytes)`);

      } catch (error) {
        console.error(`[SubagentHandler] Failed to write ${block.filename}:`, error.message);
      }
    }

    return writtenFiles;
  }
}

export { SubagentHandler };
