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
 * Topic to backend mapping - Claude decides based on topic
 * @type {Object<string, string[]>}
 */
const TOPIC_BACKENDS = {
  coding: ['nvidia_qwen', 'local', 'nvidia_deepseek'],
  reasoning: ['nvidia_deepseek', 'nvidia_minimax', 'nvidia_qwen'],
  architecture: ['nvidia_deepseek', 'nvidia_qwen', 'gemini'],
  general: ['gemini', 'groq_llama', 'nvidia_qwen'],
  creative: ['gemini', 'nvidia_qwen', 'groq_llama'],
  security: ['nvidia_deepseek', 'nvidia_qwen', 'gemini'],
  performance: ['nvidia_deepseek', 'nvidia_qwen', 'local']
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
 * Default backend selection for council (fallback)
 */
const DEFAULT_COUNCIL_BACKENDS = [
  'nvidia_deepseek',
  'nvidia_qwen', 
  'gemini',
  'local'
];

/**
 * Council execution metrics
 */
class CouncilMetrics {
  constructor() {
    this.totalCouncils = 0;
    this.successfulCouncils = 0;
    this.failedCouncils = 0;
    this.avgBackendsUsed = 0;
    this.avgProcessingTime = 0;
    this.modeDistribution = {};
  }

  recordCouncil(mode, backendsUsed, processingTime, success) {
    this.totalCouncils++;
    if (success) {
      this.successfulCouncils++;
    } else {
      this.failedCouncils++;
    }
    
    // Update averages
    this.avgBackendsUsed = 
      (this.avgBackendsUsed * (this.totalCouncils - 1) + backendsUsed) / this.totalCouncils;
    this.avgProcessingTime = 
      (this.avgProcessingTime * (this.totalCouncils - 1) + processingTime) / this.totalCouncils;
    
    // Track mode usage
    this.modeDistribution[mode] = (this.modeDistribution[mode] || 0) + 1;
  }

  getSummary() {
    return {
      totalCouncils: this.totalCouncils,
      successRate: this.totalCouncils > 0 
        ? (this.successfulCouncils / this.totalCouncils * 100).toFixed(1) + '%'
        : 'N/A',
      avgBackendsUsed: this.avgBackendsUsed.toFixed(1),
      avgProcessingTime: Math.round(this.avgProcessingTime) + 'ms',
      modeDistribution: this.modeDistribution
    };
  }
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
          new Error(`Need at least 2 backends, only ${availableBackends.length} available`)
        );
      }

      console.log(`[Council] Topic: ${topic}, Confidence: ${confidence_needed}, Backends: ${availableBackends.join(', ')}`);

      // Stage 1: Get parallel responses from all backends
      const responses = await this.getParallelResponses(prompt, availableBackends, max_tokens);
      
      const processingTime = Date.now() - startTime;
      this.metrics.recordCouncil(topic, availableBackends.length, processingTime, true);

      // Return responses for Claude to synthesize (Claude is chairman)
      return this.buildSuccessResponse({
        topic,
        confidence_needed,
        backends_queried: availableBackends,
        backends_responded: responses.filter(r => r.success).map(r => r.backend),
        responses: responses,
        processing_time_ms: processingTime,
        metrics: this.metrics.getSummary(),
        // Hint for Claude's synthesis
        synthesis_hint: `You have ${responses.filter(r => r.success).length} expert perspectives. Synthesize them into a unified answer, noting areas of agreement and disagreement.`
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.metrics.recordCouncil(mode, 0, processingTime, false);
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
      console.log(`[Council] Debate round ${round}/${rounds}`);
      
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
   * Get parallel responses from multiple backends
   */
  async getParallelResponses(prompt, backends, maxTokens) {
    const promises = backends.map(async (backend) => {
      try {
        const startTime = Date.now();
        const response = await this.makeRequest(prompt, backend, {
          maxTokens,
          thinking: true
        });
        
        return {
          backend,
          content: response.content || response,
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
    const content = result.content || result;
    
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
    const content = result.content || result;
    
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
    const content = result.content || result;
    
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
    const CHAIRMAN_ORDER = ['nvidia_deepseek', 'nvidia_qwen', 'gemini', 'local'];
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
    const available = [];
    
    for (const backend of requestedBackends) {
      try {
        const isAvailable = await this.isBackendAvailable(backend);
        if (isAvailable) {
          available.push(backend);
        }
      } catch (e) {
        console.warn(`[Council] Backend ${backend} not available:`, e.message);
      }
    }
    
    return available;
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
  DEFAULT_COUNCIL_BACKENDS
};
