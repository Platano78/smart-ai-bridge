/**
 * Smart AI Bridge v1.5.0 - Council Handler
 *
 * Multi-AI consensus with configurable backends:
 * 1. Topic-based backend selection (coding/reasoning/architecture/etc.)
 * 2. Confidence levels determine backend count (high=4, medium=3, low=2)
 * 3. User-configurable backend lists via env vars
 * 4. Aggregates responses and returns synthesis metadata
 */

/**
 * Default topic-to-backend mappings
 * Can be overridden via COUNCIL_TOPIC_<TOPIC> env vars
 */
const DEFAULT_TOPIC_BACKENDS = {
  coding: ['nvidia_qwen', 'local', 'nvidia_deepseek', 'groq_llama'],
  reasoning: ['nvidia_deepseek', 'nvidia_minimax', 'nvidia_qwen', 'gemini'],
  architecture: ['nvidia_deepseek', 'nvidia_qwen', 'gemini', 'local'],
  security: ['nvidia_deepseek', 'nvidia_qwen', 'gemini', 'local'],
  performance: ['nvidia_deepseek', 'nvidia_qwen', 'local', 'groq_llama'],
  general: ['gemini', 'groq_llama', 'nvidia_qwen', 'nvidia_deepseek'],
  creative: ['gemini', 'nvidia_qwen', 'groq_llama', 'local']
};

/**
 * Confidence level to backend count mapping
 */
const CONFIDENCE_BACKEND_COUNT = {
  high: 4,
  medium: 3,
  low: 2
};

/**
 * Council Handler - Multi-AI consensus
 */
export class CouncilHandler {
  /**
   * @param {Object} backendRegistry - BackendRegistry instance
   */
  constructor(backendRegistry) {
    this.registry = backendRegistry;
    this.topicBackends = this._loadTopicBackends();
  }

  /**
   * Load topic backends from env vars or use defaults
   */
  _loadTopicBackends() {
    const topics = { ...DEFAULT_TOPIC_BACKENDS };

    // Allow env var overrides: COUNCIL_TOPIC_CODING="nvidia_qwen,local,deepseek"
    for (const topic of Object.keys(DEFAULT_TOPIC_BACKENDS)) {
      const envKey = `COUNCIL_TOPIC_${topic.toUpperCase()}`;
      const envValue = process.env[envKey];
      if (envValue) {
        topics[topic] = envValue.split(',').map(b => b.trim());
      }
    }

    return topics;
  }

  /**
   * Get backends for a topic, filtering to only available ones
   * @param {string} topic - Topic category
   * @param {number} count - Number of backends to return
   * @returns {string[]} Available backend names
   */
  _getTopicBackends(topic, count) {
    const configured = this.topicBackends[topic] || this.topicBackends.general;
    const available = [];

    for (const backendName of configured) {
      const backend = this.registry.getBackend(backendName);
      if (backend && backend.enabled) {
        available.push(backendName);
        if (available.length >= count) break;
      }
    }

    // If not enough backends, add from fallback chain
    if (available.length < count) {
      for (const backendName of this.registry.getFallbackChain()) {
        if (!available.includes(backendName)) {
          available.push(backendName);
          if (available.length >= count) break;
        }
      }
    }

    return available.slice(0, count);
  }

  /**
   * Handle council request
   * @param {Object} params - Request parameters
   * @returns {Promise<Object>} Council result with all responses
   */
  async handle(params) {
    const {
      prompt,
      topic = 'general',
      confidence_needed = 'medium',
      num_backends = null,
      max_tokens = 4000
    } = params;

    // Validate inputs
    if (!prompt) {
      throw new Error('Council requires a prompt');
    }

    if (!this.topicBackends[topic]) {
      throw new Error(`Unknown topic: ${topic}. Valid topics: ${Object.keys(this.topicBackends).join(', ')}`);
    }

    if (!CONFIDENCE_BACKEND_COUNT[confidence_needed]) {
      throw new Error(`Unknown confidence level: ${confidence_needed}. Valid: high, medium, low`);
    }

    // Determine backend count
    const backendCount = num_backends || CONFIDENCE_BACKEND_COUNT[confidence_needed];
    const backends = this._getTopicBackends(topic, backendCount);

    if (backends.length < 2) {
      throw new Error(`Council requires at least 2 backends, only ${backends.length} available for topic: ${topic}`);
    }

    console.error(`\n========================================`);
    console.error(`COUNCIL DELIBERATION`);
    console.error(`========================================`);
    console.error(`Topic: ${topic}`);
    console.error(`Confidence: ${confidence_needed} (${backendCount} backends)`);
    console.error(`Backends: ${backends.join(', ')}`);
    console.error(`========================================\n`);

    // Query all backends in parallel
    const startTime = Date.now();
    const responses = await this._queryBackends(backends, prompt, { max_tokens });
    const duration = Date.now() - startTime;

    // Aggregate results
    const successful = responses.filter(r => r.success);
    const failed = responses.filter(r => !r.success);

    if (successful.length === 0) {
      throw new Error(`All council backends failed: ${failed.map(f => f.error).join('; ')}`);
    }

    // Build synthesis metadata
    const synthesis = {
      topic,
      confidence_needed,
      backends_queried: backends.length,
      backends_succeeded: successful.length,
      backends_failed: failed.length,
      duration_ms: duration,
      agreement_level: this._calculateAgreement(successful),
      recommendation: successful.length >= Math.ceil(backendCount * 0.6) ? 'proceed' : 'review'
    };

    console.error(`\n========================================`);
    console.error(`COUNCIL RESULTS`);
    console.error(`========================================`);
    console.error(`Success: ${successful.length}/${backends.length}`);
    console.error(`Duration: ${duration}ms`);
    console.error(`Agreement: ${synthesis.agreement_level}`);
    console.error(`Recommendation: ${synthesis.recommendation}`);
    console.error(`========================================\n`);

    return {
      success: true,
      responses: successful.map(r => ({
        backend: r.backend,
        content: r.content,
        tokens: r.tokens
      })),
      failed: failed.map(f => ({
        backend: f.backend,
        error: f.error
      })),
      synthesis,
      metadata: {
        tool: 'council',
        topic,
        backends: backends,
        duration_ms: duration
      }
    };
  }

  /**
   * Query multiple backends in parallel
   * @param {string[]} backends - Backend names to query
   * @param {string} prompt - Prompt to send
   * @param {Object} options - Request options
   * @returns {Promise<Object[]>} Array of responses
   */
  async _queryBackends(backends, prompt, options) {
    const councilPrompt = this._buildCouncilPrompt(prompt);

    const promises = backends.map(async (backendName) => {
      try {
        console.error(`  -> Querying ${backendName}...`);
        const result = await this.registry.makeRequestWithFallback(
          councilPrompt,
          backendName,
          options
        );
        console.error(`  <- ${backendName} responded (${result.usage?.total_tokens || 'unknown'} tokens)`);

        return {
          success: true,
          backend: backendName,
          content: result.content,
          tokens: result.usage?.total_tokens || 0,
          reasoning: result.reasoning_content || null
        };
      } catch (error) {
        console.error(`  !! ${backendName} failed: ${error.message}`);
        return {
          success: false,
          backend: backendName,
          error: error.message
        };
      }
    });

    return Promise.all(promises);
  }

  /**
   * Build council-specific prompt wrapper
   * @param {string} userPrompt - User's prompt
   * @returns {string} Council-wrapped prompt
   */
  _buildCouncilPrompt(userPrompt) {
    return `You are participating in a multi-AI council deliberation. Provide your expert analysis on the following question/topic.

IMPORTANT: Be concise but thorough. Focus on:
1. Your core recommendation/answer
2. Key reasoning points (2-3 max)
3. Any caveats or considerations

QUESTION/TOPIC:
${userPrompt}

YOUR ANALYSIS:`;
  }

  /**
   * Calculate agreement level between responses
   * This is a simplified heuristic - could be enhanced with semantic similarity
   * @param {Object[]} responses - Successful responses
   * @returns {string} Agreement level
   */
  _calculateAgreement(responses) {
    if (responses.length < 2) return 'single_response';

    // Simple heuristic: check for common key terms
    const contents = responses.map(r => r.content.toLowerCase());

    // Count responses that share significant overlap
    let agreementScore = 0;
    for (let i = 0; i < contents.length; i++) {
      for (let j = i + 1; j < contents.length; j++) {
        const words1 = new Set(contents[i].split(/\s+/).filter(w => w.length > 4));
        const words2 = new Set(contents[j].split(/\s+/).filter(w => w.length > 4));
        const intersection = [...words1].filter(w => words2.has(w));
        const overlap = intersection.length / Math.min(words1.size, words2.size);
        if (overlap > 0.3) agreementScore++;
      }
    }

    const maxPairs = (responses.length * (responses.length - 1)) / 2;
    const ratio = agreementScore / maxPairs;

    if (ratio >= 0.8) return 'high';
    if (ratio >= 0.5) return 'moderate';
    return 'divergent';
  }
}

export default CouncilHandler;
