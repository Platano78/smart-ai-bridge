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
   * Simple mode: Parallel responses + Chairman synthesis
   * Fastest option - skips peer review
   */
  async executeSimpleMode(prompt, backends, chairmanOverride, maxTokens, includeReasoning) {
    // Stage 1: Get parallel responses
    const responses = await this.getParallelResponses(prompt, backends, maxTokens);
    
    // Select chairman (exclude from responses if possible)
    const chairman = await this.selectChairman(chairmanOverride, backends, responses);
    
    // Stage 3: Chairman synthesis
    const synthesis = await this.synthesizeResponses(prompt, responses, chairman, maxTokens, includeReasoning);
    
    return {
      backends_used: responses.map(r => r.backend),
      individual_responses: responses,
      synthesis: synthesis.content,
      consensus: synthesis.consensus,
      confidence: synthesis.confidence,
      chairman
    };
  }

  /**
   * Full mode: Parallel responses + Peer review + Chairman synthesis
   * More thorough - includes anonymized peer evaluation
   */
  async executeFullMode(prompt, backends, chairmanOverride, maxTokens, includeReasoning) {
    // Stage 1: Get parallel responses
    const responses = await this.getParallelResponses(prompt, backends, maxTokens);
    
    // Stage 2: Peer review (each model reviews others anonymously)
    const reviews = await this.conductPeerReview(prompt, responses, maxTokens);
    
    // Select chairman
    const chairman = await this.selectChairman(chairmanOverride, backends, responses);
    
    // Stage 3: Chairman synthesis with peer review context
    const synthesis = await this.synthesizeWithReviews(prompt, responses, reviews, chairman, maxTokens, includeReasoning);
    
    return {
      backends_used: responses.map(r => r.backend),
      individual_responses: responses,
      peer_reviews: reviews,
      synthesis: synthesis.content,
      consensus: synthesis.consensus,
      confidence: synthesis.confidence,
      chairman
    };
  }

  /**
   * Vote mode: Simple majority voting on discrete options
   * Best for yes/no or multiple-choice questions
   */
  async executeVoteMode(prompt, backends, maxTokens) {
    const votePrompt = `${prompt}\n\nProvide your answer in this exact format:\nVOTE: [your choice]\nREASON: [brief explanation]`;
    
    const responses = await this.getParallelResponses(votePrompt, backends, Math.min(maxTokens, 500));
    
    // Extract votes
    const votes = responses.map(r => {
      const voteMatch = r.content.match(/VOTE:\s*(.+?)(?:\n|$)/i);
      return {
        backend: r.backend,
        vote: voteMatch ? voteMatch[1].trim().toLowerCase() : 'abstain',
        reason: r.content
      };
    });
    
    // Count votes
    const voteCounts = {};
    for (const v of votes) {
      voteCounts[v.vote] = (voteCounts[v.vote] || 0) + 1;
    }
    
    // Find winner
    const winner = Object.entries(voteCounts)
      .sort((a, b) => b[1] - a[1])[0];
    
    const totalVotes = votes.length;
    const winnerCount = winner ? winner[1] : 0;
    const confidence = totalVotes > 0 ? (winnerCount / totalVotes * 100).toFixed(0) + '%' : '0%';
    
    return {
      backends_used: responses.map(r => r.backend),
      individual_responses: votes,
      synthesis: `Council vote result: ${winner ? winner[0].toUpperCase() : 'NO CONSENSUS'}`,
      consensus: winner ? winner[0] : null,
      confidence,
      chairman: 'vote_aggregation',
      vote_breakdown: voteCounts
    };
  }

  /**
   * Debate mode: Multiple rounds of back-and-forth
   * Most thorough - models can respond to each other
   */
  async executeDebateMode(prompt, backends, chairmanOverride, maxTokens, rounds = 2) {
    let currentContext = prompt;
    const allResponses = [];
    
    for (let round = 1; round <= rounds; round++) {
      console.error(`[Council] Debate round ${round}/${rounds}`);
      
      const roundPrompt = round === 1 
        ? currentContext 
        : `Original question: ${prompt}\n\nPrevious responses:\n${this.formatPreviousResponses(allResponses)}\n\nProvide your updated perspective considering the other viewpoints:`;
      
      const responses = await this.getParallelResponses(roundPrompt, backends, maxTokens);
      allResponses.push(...responses.map(r => ({ ...r, round })));
    }
    
    // Select chairman
    const chairman = await this.selectChairman(chairmanOverride, backends, allResponses);
    
    // Final synthesis
    const synthesis = await this.synthesizeDebate(prompt, allResponses, chairman, maxTokens);
    
    return {
      backends_used: [...new Set(allResponses.map(r => r.backend))],
      individual_responses: allResponses,
      synthesis: synthesis.content,
      consensus: synthesis.consensus,
      confidence: synthesis.confidence,
      chairman,
      rounds_completed: rounds
    };
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
   * Conduct anonymized peer review
   */
  async conductPeerReview(originalPrompt, responses, maxTokens) {
    const reviews = [];
    
    for (let i = 0; i < responses.length; i++) {
      const reviewer = responses[i];
      const othersToReview = responses
        .filter((_, idx) => idx !== i)
        .map((r, idx) => `Response ${idx + 1}:\n${r.content}`);
      
      const reviewPrompt = `Original question: ${originalPrompt}\n\nYou previously gave your answer. Now review these other responses (anonymized) and rank them by quality:\n\n${othersToReview.join('\n\n---\n\n')}\n\nProvide rankings (best to worst) with brief justification for each.`;
      
      try {
        const review = await this.makeRequest(reviewPrompt, reviewer.backend, {
          maxTokens: Math.min(maxTokens, 1000)
        });
        
        reviews.push({
          reviewer: reviewer.backend,
          review: review.content || review
        });
      } catch (error) {
        console.error(`[Council] Peer review by ${reviewer.backend} failed:`, error.message);
      }
    }
    
    return reviews;
  }

  /**
   * Chairman synthesis without peer reviews
   */
  async synthesizeResponses(originalPrompt, responses, chairman, maxTokens, includeReasoning) {
    const formattedResponses = responses
      .map((r, i) => `### Expert ${i + 1} (${r.backend})\n${r.content}`)
      .join('\n\n---\n\n');
    
    const synthesisPrompt = `You are the Chairman of an AI council. Multiple AI experts have provided their perspectives on a question. Your job is to synthesize their responses into a unified, high-quality answer.

Original Question:
${originalPrompt}

Expert Responses:
${formattedResponses}

Provide a synthesis that:
1. Identifies points of agreement (consensus)
2. Addresses any disagreements or different perspectives
3. Provides the best unified answer
${includeReasoning ? '4. Explains your reasoning for the synthesis' : ''}

Format your response as:
CONSENSUS: [High/Medium/Low] - [brief explanation of agreement level]
SYNTHESIS: [Your unified answer]`;

    const result = await this.makeRequest(synthesisPrompt, chairman, { maxTokens });
    const content = this.extractResponseText(result);
    
    // Parse consensus level
    const consensusMatch = content.match(/CONSENSUS:\s*(High|Medium|Low)/i);
    const confidence = consensusMatch 
      ? { High: '90%', Medium: '70%', Low: '50%' }[consensusMatch[1]] || '60%'
      : '60%';
    
    return {
      content,
      consensus: consensusMatch ? consensusMatch[1] : 'Unknown',
      confidence
    };
  }

  /**
   * Chairman synthesis with peer review context
   */
  async synthesizeWithReviews(originalPrompt, responses, reviews, chairman, maxTokens, includeReasoning) {
    const formattedResponses = responses
      .map((r, i) => `### Expert ${i + 1}\n${r.content}`)
      .join('\n\n---\n\n');
    
    const formattedReviews = reviews
      .map(r => `### Review by ${r.reviewer}\n${r.review}`)
      .join('\n\n');
    
    const synthesisPrompt = `You are the Chairman of an AI council. Multiple AI experts have provided perspectives and peer-reviewed each other's work.

Original Question:
${originalPrompt}

Expert Responses:
${formattedResponses}

Peer Reviews:
${formattedReviews}

Synthesize the best answer considering both the original responses and the peer feedback. Identify the consensus level.

Format:
CONSENSUS: [High/Medium/Low]
SYNTHESIS: [Your unified answer]`;

    const result = await this.makeRequest(synthesisPrompt, chairman, { maxTokens });
    const content = this.extractResponseText(result);
    
    const consensusMatch = content.match(/CONSENSUS:\s*(High|Medium|Low)/i);
    const confidence = consensusMatch 
      ? { High: '90%', Medium: '70%', Low: '50%' }[consensusMatch[1]] || '60%'
      : '60%';
    
    return {
      content,
      consensus: consensusMatch ? consensusMatch[1] : 'Unknown',
      confidence
    };
  }

  /**
   * Synthesize debate rounds
   */
  async synthesizeDebate(originalPrompt, allResponses, chairman, maxTokens) {
    const byRound = {};
    for (const r of allResponses) {
      const round = r.round || 1;
      byRound[round] = byRound[round] || [];
      byRound[round].push(r);
    }
    
    const formatted = Object.entries(byRound)
      .map(([round, responses]) => 
        `## Round ${round}\n${responses.map(r => `**${r.backend}**: ${r.content}`).join('\n\n')}`
      )
      .join('\n\n---\n\n');
    
    const synthesisPrompt = `You are the Chairman concluding a multi-round debate. Synthesize the final consensus.

Original Question:
${originalPrompt}

Debate Transcript:
${formatted}

Provide final synthesis noting how positions evolved and the final consensus.

Format:
CONSENSUS: [High/Medium/Low]
EVOLUTION: [How positions changed across rounds]
SYNTHESIS: [Final unified answer]`;

    const result = await this.makeRequest(synthesisPrompt, chairman, { maxTokens });
    const content = this.extractResponseText(result);
    
    const consensusMatch = content.match(/CONSENSUS:\s*(High|Medium|Low)/i);
    const confidence = consensusMatch 
      ? { High: '90%', Medium: '70%', Low: '50%' }[consensusMatch[1]] || '60%'
      : '60%';
    
    return {
      content,
      consensus: consensusMatch ? consensusMatch[1] : 'Unknown',
      confidence
    };
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
   * Select chairman backend (used for internal synthesis modes)
   */
  async selectChairman(override, availableBackends, responses) {
    if (override && availableBackends.includes(override)) {
      return override;
    }
    
    // Prefer DeepSeek for reasoning
    const CHAIRMAN_ORDER = ['nvidia_deepseek', 'nvidia_glm', 'gemini', 'local'];
    for (const preferred of CHAIRMAN_ORDER) {
      if (availableBackends.includes(preferred)) {
        return preferred;
      }
    }
    
    // Fallback to first available
    return availableBackends[0] || 'local';
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
