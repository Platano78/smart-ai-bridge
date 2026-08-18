/**
 * @fileoverview CouncilHandler - Multi-AI consensus through deliberative debate
 * @module handlers/council-handler
 * 
 * Implements the LLM Council pattern:
 * - Stage 1: Parallel independent responses from multiple backends
 * - Stage 2: Anonymized peer review and ranking (optional)
 * - Stage 3: Chairman synthesis into final consensus
 * 
 * @see https://github.com/karpathy/llm-council
 */

import { BaseHandler } from './base-handler.js';
import { configManager, VALID_TOPICS } from '../config/council-config-manager.js';
import { CouncilMetrics } from '../monitoring/council-metrics.js';
import { countTokens } from '../utils/token-count.js';

/**
 * Available council modes
 * @enum {string}
 */
const COUNCIL_MODES = {
  SIMPLE: 'simple',           // Stage 1 + Claude synthesis (fast)
  FULL: 'full',               // Stage 1 + peer review + Claude synthesis
  DEBATE: 'debate',           // Multiple rounds + Claude synthesis
  VOTE: 'vote'                // Majority voting + Claude summary
};

/**
 * Topic to backend mapping - Now loaded from configManager (hot-reloadable)
 * @deprecated Use configManager.getBackendsForTopic() instead
 * @type {Object<string, string[]>}
 */
const TOPIC_BACKENDS = {
  get coding() { return configManager.getBackendsForTopic('coding'); },
  get reasoning() { return configManager.getBackendsForTopic('reasoning'); },
  get architecture() { return configManager.getBackendsForTopic('architecture'); },
  get general() { return configManager.getBackendsForTopic('general'); },
  get creative() { return configManager.getBackendsForTopic('creative'); },
  get security() { return configManager.getBackendsForTopic('security'); },
  get performance() { return configManager.getBackendsForTopic('performance'); }
};

/**
 * Confidence level requirements
 * @type {Object<string, number>}
 */
const CONFIDENCE_BACKENDS = {
  high: 4,    // Need 4 backends for high confidence
  medium: 3,  // Need 3 backends for medium confidence  
  low: 2      // Need 2 backends for low confidence
};

/**
 * Default backend selection for council (fallback when config supplies none).
 * Not a static roster: no set of names can be assumed configured on a public
 * install, so this derives from what the registry actually has enabled and
 * reachable right now (BackendRegistry#getUsableBackends). Council itself
 * already refuses honestly (see execute()'s `availableBackends.length < 2`
 * check) rather than papering over a short roster with names that don't
 * resolve.
 * @param {Object} [backendRegistry] - The live BackendRegistry, if wired
 * @returns {string[]} Usable backend names, or [] if none / no registry
 */
function getDefaultCouncilBackends(backendRegistry) {
  return backendRegistry?.getUsableBackends?.() || [];
}


/**
 * CouncilHandler - Orchestrates multi-AI consensus
 * @extends BaseHandler
 */
class CouncilHandler extends BaseHandler {
  constructor(context = {}) {
    super(context);
    this.metrics = new CouncilMetrics();
  }

  /**
   * Execute council deliberation
   * Claude calls this tool, backends provide perspectives, Claude synthesizes
   * 
   * @param {Object} args - Council arguments
   * @param {string} args.prompt - The question/task for the council
   * @param {string} args.topic - Topic category for backend selection (coding|reasoning|architecture|general|creative|security|performance)
   * @param {string} [args.confidence_needed='medium'] - Required confidence level (high|medium|low)
   * @param {number} [args.num_backends] - Override number of backends (auto-calculated from confidence)
   * @param {number} [args.max_tokens=4000] - Max tokens per response
   * @returns {Promise<Object>} - Individual responses for Claude to synthesize
   */
  async execute(args) {
    const {
      prompt,
      topic = 'general',
      confidence_needed = 'medium',
      num_backends = null,
      max_tokens = 4000
    } = args;

    // Claude decides backends based on topic
    const topicBackends = TOPIC_BACKENDS[topic] || TOPIC_BACKENDS.general;
    
    // Number of backends based on confidence needed
    const requiredCount = num_backends || CONFIDENCE_BACKENDS[confidence_needed] || 3;
    
    // Select backends (up to required count from topic list)
    const backends = topicBackends.slice(0, requiredCount);

    if (!prompt) {
      return this.buildErrorResponse(new Error('prompt is required'));
    }

    if (!topic || !TOPIC_BACKENDS[topic]) {
      return this.buildErrorResponse(new Error(`Invalid topic. Must be one of: ${Object.keys(TOPIC_BACKENDS).join(', ')}`));
    }

    const startTime = Date.now();
    
    try {
      // Get available backends from topic-selected list
      const availableBackends = await this.filterAvailableBackends(backends);
      
      if (availableBackends.length < 2) {
        return this.buildErrorResponse(
          `council needs ≥2 backends — only ${availableBackends.length} available from [${backends.join(', ')}]. ` +
          `Cloud lanes (nvidia_deepseek, nvidia_glm, groq_llama) may be saturated; retry in a moment, ` +
          `or call ask with model:'local' for a single-backend response.`
        );
      }

      // Get strategy from config
      const strategy = configManager.getStrategyForTopic(topic);

      console.error(`[Council] Topic: ${topic}, Strategy: ${strategy}, Confidence: ${confidence_needed}, Backends: ${availableBackends.join(', ')}`);

      // Dispatch based on strategy
      let responses;
      switch (strategy) {
        case 'sequential':
          responses = await this.executeSequentialStrategy(prompt, availableBackends, max_tokens);
          break;
        case 'debate':
          responses = await this.executeDebateStrategy(prompt, availableBackends, max_tokens);
          break;
        case 'fallback':
          responses = await this.executeFallbackStrategy(prompt, availableBackends, max_tokens);
          break;
        case 'parallel':
        default:
          responses = await this.getParallelResponses(prompt, availableBackends, max_tokens);
          break;
      }

      const processingTime = Date.now() - startTime;
      this.metrics.recordCouncil(topic, availableBackends.length, processingTime, true);

      // Record routing outcomes for compound learning
      for (const response of responses) {
        await this.recordLearningOutcome(
          response.success,
          response.content?.length || 0,
          response.backend,
          { taskType: 'council', topic: topic, source: 'council' }
        );
      }

      // Return responses for Claude to synthesize (Claude is chairman)
      return this.buildSuccessResponse({
        topic,
        strategy,
        confidence_needed,
        backends_queried: availableBackends,
        backends_responded: responses.filter(r => r.success).map(r => r.backend),
        responses: responses,
        processing_time_ms: processingTime,
        metrics: this.metrics.getSummary(),
        synthesis_hint: `You have ${responses.filter(r => r.success).length} expert perspectives (${strategy} strategy). Synthesize them into a unified answer, noting areas of agreement and disagreement.`
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.metrics.recordCouncil(topic, 0, processingTime, false);
      console.error('[Council] Execution failed:', error);
      return this.buildErrorResponse(error);
    }
  }

  /**
   * Gate a prompt against ONE backend's real capacity (measured in TOKENS,
   * not chars — see src/utils/token-count.js), escalating to a roomier
   * usable backend when it doesn't fit rather than shipping an oversized
   * payload (see commit 16ff9fe). Council fans the same prompt to several
   * backends of differing capacity, and a debate/sequential prompt compounds
   * across rounds — so this is called per backend, per round/step, never
   * once up front for the whole call.
   *
   * Never throws: council's whole value is dissent from several backends,
   * so one member that can't be gated must not fail the call. Callers get
   * back either the (possibly escalated) backend to use, or an `error`
   * string to record as that member's failure and continue.
   * @param {string} prompt
   * @param {string} backend
   * @returns {Promise<{backend: string}|{error: string}>}
   */
  async gateBackendCapacity(prompt, backend) {
    const tokens = countTokens(prompt);
    const cap = await this.capacityTokensFor(backend);
    if (tokens <= cap) return { backend };

    const roomier = await this.findBackendWithCapacityTokens(tokens, [backend]);
    if (roomier) {
      console.error(`[Council] ⚠️ Payload (${tokens} tokens) exceeds ${backend} limit (${cap} tokens); escalating to ${roomier.name} (${roomier.cap} tokens)`);
      return { backend: roomier.name };
    }

    const largest = await this.largestBackendCapacityTokens();
    return {
      error: `Payload is ${tokens} tokens; exceeds ${backend}'s limit (${cap} tokens) and no usable backend can hold it ` +
        `(largest limit found: ${largest} tokens). This council member was skipped.`
    };
  }

  /**
   * Get parallel responses from multiple backends
   */
  async getParallelResponses(prompt, backends, maxTokens) {
    const promises = backends.map(async (backend) => {
      const gate = await this.gateBackendCapacity(prompt, backend);
      if (gate.error) {
        console.error(`[Council] Backend ${backend} skipped:`, gate.error);
        return {
          backend,
          content: null,
          error: gate.error,
          success: false
        };
      }

      try {
        const startTime = Date.now();
        const response = await this.makeRequest(prompt, gate.backend, {
          maxTokens,
          thinking: true
        });

        return {
          backend: gate.backend,
          content: this.extractResponseText(response),
          latency: Date.now() - startTime,
          success: true
        };
      } catch (error) {
        console.error(`[Council] Backend ${backend} failed:`, error.message);
        return {
          backend,
          content: null,
          error: error.message,
          success: false
        };
      }
    });

    const results = await Promise.all(promises);
    return results.filter(r => r.success);
  }

  /**
   * Sequential strategy: Query backends one-by-one, each sees prior responses
   */
  async executeSequentialStrategy(prompt, backends, maxTokens) {
    const responses = [];

    for (const backend of backends) {
      try {
        const startTime = Date.now();

        // Build prompt with prior context
        let sequentialPrompt = prompt;
        if (responses.length > 0) {
          const priorSummary = responses
            .map(r => `[${r.backend}]: ${r.content?.slice(0, 300)}...`)
            .join('\n\n');
          sequentialPrompt = `${prompt}\n\nPrevious expert responses (consider and build upon these):\n${priorSummary}`;
        }

        // Gate the COMPOUNDED prompt (grows each round with prior responses)
        // against THIS step's target backend — a prompt that fit an earlier
        // step can overflow a later one on a smaller backend.
        const gate = await this.gateBackendCapacity(sequentialPrompt, backend);
        if (gate.error) {
          console.error(`[Council] Sequential backend ${backend} skipped:`, gate.error);
          responses.push({
            backend,
            content: null,
            error: gate.error,
            success: false,
            order: responses.length + 1
          });
          continue;
        }

        const response = await this.makeRequest(sequentialPrompt, gate.backend, {
          maxTokens,
          thinking: true
        });

        responses.push({
          backend: gate.backend,
          content: this.extractResponseText(response),
          latency: Date.now() - startTime,
          success: true,
          order: responses.length + 1
        });
      } catch (error) {
        console.error(`[Council] Sequential backend ${backend} failed:`, error.message);
        responses.push({
          backend,
          content: null,
          error: error.message,
          success: false,
          order: responses.length + 1
        });
      }
    }

    return responses.filter(r => r.success);
  }

  /**
   * Debate strategy: Multiple rounds of parallel responses, each round sees prior
   */
  async executeDebateStrategy(prompt, backends, maxTokens, rounds = 2) {
    const allResponses = [];

    for (let round = 1; round <= rounds; round++) {
      console.error(`[Council] Debate round ${round}/${rounds}`);

      const roundPrompt = round === 1
        ? prompt
        : `Original question: ${prompt}\n\nPrevious responses:\n${this.formatPreviousResponses(allResponses)}\n\nProvide your updated perspective considering the other viewpoints:`;

      const responses = await this.getParallelResponses(roundPrompt, backends, maxTokens);
      allResponses.push(...responses.map(r => ({ ...r, round })));
    }

    return allResponses;
  }

  /**
   * Fallback strategy: Try backends in order until 2+ succeed
   */
  async executeFallbackStrategy(prompt, backends, maxTokens) {
    const responses = [];
    const minSuccessful = 2;

    for (const backend of backends) {
      try {
        const gate = await this.gateBackendCapacity(prompt, backend);
        if (gate.error) {
          console.error(`[Council] Fallback backend ${backend} skipped:`, gate.error);
          responses.push({
            backend,
            content: null,
            error: gate.error,
            success: false
          });
          continue;
        }

        const startTime = Date.now();
        const response = await this.makeRequest(prompt, gate.backend, {
          maxTokens,
          thinking: true
        });

        responses.push({
          backend: gate.backend,
          content: this.extractResponseText(response),
          latency: Date.now() - startTime,
          success: true
        });

        // Stop once we have enough successful responses
        if (responses.filter(r => r.success).length >= minSuccessful) {
          console.error(`[Council] Fallback: ${minSuccessful} backends succeeded, stopping`);
          break;
        }
      } catch (error) {
        console.error(`[Council] Fallback backend ${backend} failed:`, error.message);
        responses.push({
          backend,
          content: null,
          error: error.message,
          success: false
        });
      }
    }

    return responses.filter(r => r.success);
  }

  /**
   * Format previous responses for debate context
   */
  formatPreviousResponses(responses) {
    return responses
      .map(r => `[${r.backend} - Round ${r.round || 1}]: ${r.content.slice(0, 500)}...`)
      .join('\n\n');
  }

  /**
   * Filter backends to only available ones
   */
  async filterAvailableBackends(requestedBackends) {
    const checks = await Promise.all(requestedBackends.map(async (backend) => {
      try {
        return (await this.isBackendAvailable(backend)) ? backend : null;
      } catch (e) {
        console.warn(`[Council] Backend ${backend} not available:`, e.message);
        return null;
      }
    }));
    return checks.filter(Boolean);
  }

  /**
   * Check backend availability
   */
  async isBackendAvailable(backend) {
    if (this.context?.router?.isBackendAvailable) {
      return await this.context.router.isBackendAvailable(backend);
    }
    // Assume available if no router
    return true;
  }
}

export {
  CouncilHandler,
  COUNCIL_MODES,
  TOPIC_BACKENDS,
  CONFIDENCE_BACKENDS,
  getDefaultCouncilBackends
};
