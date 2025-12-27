/**
 * @fileoverview AskHandler - Multi-AI query handler
 * @module handlers/ask-handler
 *
 * MULTI-AI Direct Query with smart fallback chains, automatic Unity detection,
 * dynamic token scaling, and backend tracking.
 */

import { BaseHandler } from './base-handler.js';

/**
 * Model name to backend mapping
 */
const MODEL_MAP = {
  'auto': null,           // Let Orchestrator decide
  'local': 'local',
  'gemini': 'gemini',
  'deepseek': 'nvidia_deepseek',
  'qwen3': 'nvidia_qwen',
  'minimax': 'nvidia_minimax',
  'chatgpt': 'openai_chatgpt',
  'openai': 'openai_chatgpt',
  'groq': 'groq_llama',
  'llama': 'groq_llama'
};

/**
 * Router mode model profiles with estimated load times (seconds)
 */
const ROUTER_PROFILES = {
  'coding-reap25b': { loadTime: 25, vram: '~15GB', slots: 2, type: 'coding', desc: 'Complex refactoring, architecture' },
  'coding-seed-coder': { loadTime: 8, vram: '~5GB', slots: 2, type: 'coding', desc: 'Standard coding, bug fixes' },
  'coding-qwen-7b': { loadTime: 10, vram: '~5GB', slots: 2, type: 'coding', desc: 'Fast coding tasks' },
  'agents-qwen3-14b': { loadTime: 10, vram: '~12GB', slots: 8, type: 'reasoning', desc: 'Multi-agent orchestration' },
  'agents-nemotron': { loadTime: 12, vram: '~8GB', slots: 10, type: 'reasoning', desc: 'Fast parallel inference' },
  'agents-seed-coder': { loadTime: 8, vram: '~5GB', slots: 10, type: 'coding', desc: 'High throughput agents' },
  'fast-deepseek-lite': { loadTime: 8, vram: '~6GB', slots: 8, type: 'coding', desc: 'Quick analysis' },
  'fast-qwen14b': { loadTime: 12, vram: '~8GB', slots: 8, type: 'coding', desc: 'Fast coding, more capable' }
};;


// Default model profiles by task type for intelligent auto-selection
const DEFAULT_PROFILES = {
  'coding': 'coding-seed-coder',      // Best balance of speed/quality for code
  'analysis': 'coding-qwen-7b',       // Fast analysis tasks
  'reasoning': null,                   // Reasoning models require explicit selection
  'general': null                      // No default, use whatever is loaded
};

class AskHandler extends BaseHandler {
  /**
   * Execute AI query
   * @param {Object} args - Query arguments
   * @param {string} args.model - Model to use
   * @param {string} args.prompt - Query prompt
   * @param {boolean} [args.thinking=true] - Enable thinking mode
   * @param {number} [args.max_tokens] - Maximum response tokens
   * @param {boolean} [args.enable_chunking=false] - Enable chunked generation
   * @param {string} [args.force_backend] - Force specific backend
   * @param {string} [args.model_profile] - Router mode model profile (e.g., 'coding-reap25b')
   * @returns {Promise<Object>}
   */
  async execute(args) {
    const {
      model,
      prompt,
      thinking = true,
      max_tokens,
      enable_chunking = false,
      force_backend,
      model_profile,
      auto_profile = false  // Opt-in flag for automatic profile selection
    } = args;

    if (!model) {
      throw new Error('model is required');
    }
    if (!prompt) {
      throw new Error('prompt is required');
    }

    const requestedBackend = MODEL_MAP[model];
    if (requestedBackend === undefined) {
      throw new Error(`Unknown model: ${model}. Available models: ${Object.keys(MODEL_MAP).join(', ')}`);
    }

    // Router mode: handle model_profile for local backend
    let routerModelProfile = null;
    if (model_profile && (model === 'local' || requestedBackend === 'local')) {
      if (!ROUTER_PROFILES[model_profile]) {
        const available = Object.keys(ROUTER_PROFILES).join(', ');
        throw new Error(`Unknown model_profile: ${model_profile}. Available: ${available}`);
      }
      routerModelProfile = model_profile;
      const profileInfo = ROUTER_PROFILES[model_profile];
      console.error(`\n[MKG] 🎯 Router mode: ${model_profile}`);
      console.error(`[MKG]    ${profileInfo.desc} | ${profileInfo.vram} | ${profileInfo.slots} slots`);

      // Check router status and load model if needed
      await this.ensureRouterModel(model_profile, profileInfo);
    }

    // Auto-select default profile based on detected task type (OPT-IN: requires auto_profile=true)
    if (auto_profile && !routerModelProfile && (model === 'local' || requestedBackend === 'local')) {
      const detectedTaskType = this.detectTaskType(prompt);
      const defaultProfile = DEFAULT_PROFILES[detectedTaskType];
      
      if (defaultProfile && ROUTER_PROFILES[defaultProfile]) {
        routerModelProfile = defaultProfile;
        const profileInfo = ROUTER_PROFILES[defaultProfile];
        console.error(`\n[MKG] 🎯 Auto-selected: ${defaultProfile} (detected: ${detectedTaskType} task)`);
        console.error(`[MKG]    ${profileInfo.desc} | ${profileInfo.vram} | ${profileInfo.slots} slots`);
        await this.ensureRouterModel(defaultProfile, profileInfo);
      }
    }

    // Smart routing or forced backend
    let selectedBackend;
    if (force_backend && this.router?.backends?.getAdapter?.(force_backend)) {
      selectedBackend = force_backend;
      console.error(`🎯 FORCED BACKEND: Using ${force_backend} (bypassing smart routing)`);

      // Create routing context for metadata
      const context = this.router.createRoutingContext(prompt, {});
      context.source = 'forced';
      context.decision = force_backend;
      context.confidence = 1.0;
      context.reasoning = 'Explicitly requested backend via force_backend parameter';
      this.router._lastRoutingContext = context;
    } else if (model === 'auto' || requestedBackend === null) {
      console.error(`🎯 AUTO MODE: Letting Orchestrator decide optimal backend`);
      selectedBackend = await this.routeRequest(prompt, {});
    } else {
      selectedBackend = await this.routeRequest(prompt, { forceBackend: force_backend || requestedBackend });
    }

    // Dynamic token optimization
    const dynamicTokens = this.calculateDynamicTokens(prompt, selectedBackend);
    const finalMaxTokens = max_tokens || dynamicTokens;

    const options = {
      thinking,
      maxTokens: finalMaxTokens,
      forceBackend: force_backend,
      routerModel: routerModelProfile  // Pass router profile name as model for router mode
    };

    console.error(`🚀 MULTI-AI: Processing ${model} → ${selectedBackend} with ${finalMaxTokens} tokens`);

    const startTime = Date.now();

    try {
      const response = await this.makeRequest(prompt, selectedBackend, options);
      const responseContent = response.content || response;
      const responseHeaders = response.headers || {};
      const processingTime = Date.now() - startTime;

      // Truncation detection
      const wasTruncated = this.detectTruncation(responseContent, finalMaxTokens);

      if (wasTruncated && enable_chunking) {
        console.error(`🔄 Response truncated, attempting chunked generation...`);
        const chunkedResponse = await this.performChunkedGeneration(prompt, selectedBackend, options);
        return this.buildSuccessResponse({
          model,
          requested_backend: requestedBackend,
          actual_backend: responseHeaders['X-AI-Backend'] || selectedBackend,
          prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
          response: chunkedResponse,
          backend_used: responseHeaders['X-AI-Backend'] || selectedBackend,
          fallback_chain: responseHeaders['X-Fallback-Chain'] || 'none',
          thinking_enabled: thinking,
          max_tokens: finalMaxTokens,
          dynamic_tokens: dynamicTokens,
          chunked: true,
          processing_time: processingTime
        });
      }

      // Record for playbook learning
      this.recordExecution(
        {
          success: true,
          backend: selectedBackend,
          processingTime,
          tokenCount: response.usage?.total_tokens,
          content: responseContent?.substring(0, 500)
        },
        {
          tool: 'ask',
          taskType: this.router?._lastRoutingContext?.complexity?.taskType || 'general',
          prompt: prompt?.substring(0, 500)
        }
      );

      // Record routing outcome for learning (with modelId)
      this.recordRoutingOutcome(true, responseContent.length, selectedBackend, {
        modelId: response?.metadata?.model || response?.metadata?.detectedModel,
        taskType: this.router?._lastRoutingContext?.taskType || 'general'
      });

      // Build full routing metadata from enhanced routing context
      const routingContext = this.router?._lastRoutingContext || {};
      const routingIndicator = {
        source: routingContext.source || 'unknown',
        decision: routingContext.decision || selectedBackend,
        confidence: routingContext.confidence || null,
        orchestrator_healthy: this.router?.orchestratorHealthy?.() || false,
        complexity: routingContext.complexity?.toFixed(2) || null,
        task_type: routingContext.taskType || 'general',
        reasoning: routingContext.reasoning || null
      };

      return this.buildSuccessResponse({
        model,
        requested_backend: requestedBackend,
        actual_backend: responseHeaders['X-AI-Backend'] || selectedBackend,
        prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
        response: responseContent,
        backend_used: responseHeaders['X-AI-Backend'] || selectedBackend,
        fallback_chain: responseHeaders['X-Fallback-Chain'] || 'none',
        request_id: responseHeaders['X-Request-ID'],
        response_time: responseHeaders['X-Response-Time'],
        cache_status: responseHeaders['X-Cache-Status'] || 'MISS',
        thinking_enabled: thinking,
        max_tokens: finalMaxTokens,
        dynamic_tokens: dynamicTokens,
        was_truncated: wasTruncated,
        smart_routing_applied: !force_backend && (selectedBackend !== requestedBackend),
        routing: routingIndicator,
        response_headers: responseHeaders,
        metadata: response.metadata || {},
        processing_time: processingTime
      });

    } catch (error) {
      this.recordRoutingOutcome(false, 0, selectedBackend);
      console.error(`❌ MULTI-AI: Error in ${model} request: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate dynamic token limit based on prompt and backend
   * @private
   */
  calculateDynamicTokens(prompt, backend) {
    if (this.router?.calculateDynamicTokenLimit) {
      return this.router.calculateDynamicTokenLimit(prompt, backend);
    }

    // Default calculation
    const promptLower = prompt.toLowerCase();

    // Unity/game development detection
    if (promptLower.includes('unity') || promptLower.includes('monobehaviour') ||
        promptLower.includes('gameobject') || promptLower.includes('c#')) {
      return 16384;
    }

    // Complex generation detection
    if (promptLower.includes('implement') || promptLower.includes('complete') ||
        promptLower.includes('generate') || prompt.length > 2000) {
      return 8192;
    }

    // Simple queries
    return 2048;
  }

  /**
   * Detect if response was truncated
   * @private
   */
  detectTruncation(content, maxTokens) {
    if (!content) return false;

    // Check for common truncation indicators
    const truncationIndicators = [
      /\.\.\.$/, // Ends with ellipsis
      /[{(\[,]$/, // Ends with open bracket or comma
      /```$/, // Ends with code fence
      /^\s*$/.test(content.slice(-100)) // Ends with whitespace
    ];

    const estimatedTokens = this.estimateTokens(content);
    const nearLimit = estimatedTokens >= maxTokens * 0.95;

    return nearLimit || truncationIndicators.some(pattern =>
      typeof pattern === 'object' ? pattern.test(content) : false
    );
  }

  /**
   * Perform chunked generation for long responses
   * @private
   */
  async performChunkedGeneration(prompt, backend, options) {
    const chunks = [];
    let continuation = prompt;
    const maxChunks = 3;

    for (let i = 0; i < maxChunks; i++) {
      const chunkPrompt = i === 0
        ? continuation
        : `Continue from: "${chunks[chunks.length - 1].slice(-100)}"\n\nOriginal task: ${prompt.substring(0, 200)}`;

      const response = await this.makeRequest(chunkPrompt, backend, {
        ...options,
        maxTokens: options.maxTokens || 4096
      });

      const content = response.content || response;
      chunks.push(content);

      // Check if complete
      if (!this.detectTruncation(content, options.maxTokens)) {
        break;
      }
    }

    return chunks.join('\n');
  }

  /**
   * Record routing outcome for learning
   * @private
   * @param {boolean} success - Whether the request succeeded
   * @param {number} outputLength - Response length
   * @param {string} selectedBackend - Backend that handled the request
   * @param {Object} [taskContext={}] - Additional context (modelId, taskType, etc.)
   */
  async recordRoutingOutcome(success, outputLength, selectedBackend, taskContext = {}) {
    try {
      await this.router?.recordRoutingOutcome?.({
        success,
        outputLength: outputLength || 0,
        backend: selectedBackend,
        modelId: taskContext.modelId || null,  // NEW: Pass modelId to learning
        taskType: taskContext.taskType || 'general',
        timestamp: Date.now()
      });
    } catch (error) {
      // Non-blocking - don't fail request if learning fails
      console.error(`Learning recording failed: ${error.message}`);
    }
  }


  /**
   * Detect task type from prompt for auto-profile selection
   * @param {string} prompt - The prompt to analyze
   * @returns {string} Task type: 'coding', 'analysis', or 'general'
   */
  detectTaskType(prompt) {
    const hasCode = /```|function\s|class\s|import\s|def\s|const\s|let\s|var\s|write.*code|implement|create.*function/i.test(prompt);
    if (hasCode) return 'coding';
    
    if (/analyze|research|explain|understand|review/i.test(prompt)) return 'analysis';
    
    return 'general';
  }

  /**
   * Ensure router model is loaded, with terminal feedback
   * @private
   * @param {string} profileName - Router preset name
   * @param {Object} profileInfo - Profile metadata (loadTime, vram, etc.)
   */
  async ensureRouterModel(profileName, profileInfo) {
    const ROUTER_URL = 'http://localhost:8081';

    try {
      // Check router health
      const healthResponse = await fetch(`${ROUTER_URL}/health`, {
        signal: AbortSignal.timeout(3000)
      });

      if (!healthResponse.ok) {
        console.error(`[MKG] ⚠️  Router not healthy, falling back to default local`);
        return;
      }

      // Get current model status
      const modelsResponse = await fetch(`${ROUTER_URL}/models`, {
        signal: AbortSignal.timeout(5000)
      });

      if (!modelsResponse.ok) {
        console.error(`[MKG] ⚠️  Cannot query router models`);
        return;
      }

      const modelsData = await modelsResponse.json();
      const targetModel = modelsData.data?.find(m => m.id === profileName);

      if (!targetModel) {
        console.error(`[MKG] ⚠️  Profile '${profileName}' not found in router config`);
        return;
      }

      const modelStatus = targetModel.status?.value || 'unknown';

      if (modelStatus === 'loaded' || modelStatus === 'running') {
        console.error(`[MKG] ✅ Model already loaded: ${profileName}`);
        return;
      }

      // Model needs loading
      console.error(`[MKG] 📥 Loading model: ${profileName} (~${profileInfo.loadTime}s estimated)`);

      const loadStartTime = Date.now();

      // Trigger model load
      const loadResponse = await fetch(`${ROUTER_URL}/models/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: profileName }),
        signal: AbortSignal.timeout(120000) // 2 minute timeout for large models
      });

      if (!loadResponse.ok) {
        const errorText = await loadResponse.text();
        console.error(`[MKG] ❌ Failed to load model: ${errorText}`);
        return;
      }

      // Poll for loading progress
      const maxWait = profileInfo.loadTime * 2 * 1000; // Double estimated time as max
      const pollInterval = 1000;
      let elapsed = 0;

      while (elapsed < maxWait) {
        await new Promise(r => setTimeout(r, pollInterval));
        elapsed = Date.now() - loadStartTime;

        try {
          const statusResponse = await fetch(`${ROUTER_URL}/models`, {
            signal: AbortSignal.timeout(3000)
          });

          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            const currentModel = statusData.data?.find(m => m.id === profileName);
            const currentStatus = currentModel?.status?.value || 'unknown';

            if (currentStatus === 'loaded' || currentStatus === 'running') {
              const loadTime = ((Date.now() - loadStartTime) / 1000).toFixed(1);
              console.error(`[MKG] ✅ Model ready! (${loadTime}s)`);
              return;
            }

            // Show progress
            const progress = Math.min(100, Math.round((elapsed / (profileInfo.loadTime * 1000)) * 100));
            const bar = '█'.repeat(Math.floor(progress / 5)) + '░'.repeat(20 - Math.floor(progress / 5));
            console.error(`[MKG] ${bar} ${progress}% (${(elapsed / 1000).toFixed(0)}s)`);
          }
        } catch (pollError) {
          // Continue polling
        }
      }

      console.error(`[MKG] ⚠️  Model load timed out, proceeding anyway...`);

    } catch (error) {
      console.error(`[MKG] ⚠️  Router check failed: ${error.message}`);
      console.error(`[MKG]    Falling back to default local endpoint`);
    }
  }
}

export { AskHandler, MODEL_MAP };
