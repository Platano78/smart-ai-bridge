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
  'deepseek3.1': 'nvidia_deepseek',
  'qwen3': 'nvidia_qwen',
  'chatgpt': 'openai_chatgpt',
  'openai': 'openai_chatgpt',
  'groq': 'groq_llama',
  'llama': 'groq_llama'
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
   * @returns {Promise<Object>}
   */
  async execute(args) {
    const {
      model,
      prompt,
      thinking = true,
      max_tokens,
      enable_chunking = false,
      force_backend
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
      forceBackend: force_backend
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

      // Record routing outcome for learning
      this.recordRoutingOutcome(true, responseContent.length, selectedBackend);

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
   */
  async recordRoutingOutcome(success, outputLength, selectedBackend) {
    try {
      await this.router?.recordRoutingOutcome?.({
        success,
        outputLength: outputLength || 0,
        backend: selectedBackend,
        timestamp: Date.now()
      });
    } catch (error) {
      // Non-blocking - don't fail request if learning fails
      console.error(`Learning recording failed: ${error.message}`);
    }
  }
}

export { AskHandler, MODEL_MAP };
