/**
 * OrchestratorClient - 8B routing model integration
 * Analyzes routing decisions with learned context
 *
 * Features:
 * - Health check caching (30s TTL)
 * - Timeout handling (10s analysis, 3s health)
 * - Graceful fallback on failures
 * - JSON response parsing
 */

export class OrchestratorClient {
  constructor(config = {}) {
    this.url = config.url || 'http://localhost:8083/v1/chat/completions';
    this.model = config.model || 'orchestrator';
    this.healthCacheTTL = config.healthCacheTTL || 30000; // 30s

    this._healthy = false;
    this._lastHealthCheck = 0;
    this._healthCheckInProgress = false;
  }

  /**
   * Get cached health status
   * Triggers async health check if cache expired
   */
  get healthy() {
    const now = Date.now();

    // Return cached value if fresh
    if (now - this._lastHealthCheck < this.healthCacheTTL) {
      return this._healthy;
    }

    // Trigger async health check (non-blocking)
    if (!this._healthCheckInProgress) {
      this.checkHealth().catch(err => {
        console.error(`Orchestrator health check failed: ${err.message}`);
      });
    }

    return this._healthy;
  }

  /**
   * Perform health check against orchestrator
   * @returns {Promise<boolean>}
   */
  async checkHealth() {
    if (this._healthCheckInProgress) {
      return this._healthy;
    }

    this._healthCheckInProgress = true;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000); // 3s timeout

      const response = await fetch(`${this.url.replace('/v1/chat/completions', '/v1/models')}`, {
        signal: controller.signal
      });

      clearTimeout(timeout);

      this._healthy = response.ok;
      this._lastHealthCheck = Date.now();

      console.error(`✅ Orchestrator health: ${this._healthy ? 'UP' : 'DOWN'}`);

    } catch (error) {
      this._healthy = false;
      this._lastHealthCheck = Date.now();

      console.error(`❌ Orchestrator health check failed: ${error.message}`);
    } finally {
      this._healthCheckInProgress = false;
    }

    return this._healthy;
  }

  /**
   * Analyze task and recommend backend
   * @param {string} prompt - Task prompt
   * @param {object} context - Routing context (complexity, taskType, etc.)
   * @returns {Promise<object|null>} - { backend, confidence, reasoning } or null
   */
  async analyze(prompt, context) {
    if (!this._healthy) {
      return null;
    }

    try {
      const analysisPrompt = this.buildAnalysisPrompt(prompt, context);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: analysisPrompt }],
          max_tokens: 500,
          temperature: 0.3
        })
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Orchestrator returned ${response.status}`);
      }

      const data = await response.json();
      return this.parseOrchestratorResponse(data);

    } catch (error) {
      console.error(`Orchestrator analysis failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Build analysis prompt for orchestrator
   * @private
   */
  buildAnalysisPrompt(prompt, context) {
    const { complexity, taskType, lessons } = context;

    let analysisPrompt = `Analyze this task and recommend the best backend:

Task: ${prompt.substring(0, 500)}
Complexity: ${complexity || 'unknown'}
Task Type: ${taskType || 'general'}

Available backends:
- local: Qwen2.5-Coder-7B (128K context, fast, general purpose)
- nvidia_deepseek: DeepSeek V3.1 (reasoning, analysis, 8K)
- nvidia_qwen: Qwen3 Coder 480B (complex code, 32K)
`;

    // Add lessons if available
    if (lessons && lessons.length > 0) {
      analysisPrompt += `\nPast lessons:\n${lessons.map(l => `- ${l}`).join('\n')}\n`;
    }

    analysisPrompt += `
Respond with JSON only:
{
  "backend": "local|nvidia_deepseek|nvidia_qwen",
  "confidence": 0.0-1.0,
  "reasoning": "why this backend"
}`;

    return analysisPrompt;
  }

  /**
   * Parse orchestrator response and extract decision
   * @private
   */
  parseOrchestratorResponse(data) {
    try {
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('No content in response');
      }

      // Extract JSON from response (may be wrapped in text)
      const jsonMatch = content.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (!parsed.backend || typeof parsed.confidence !== 'number') {
        throw new Error('Invalid response format');
      }

      // Ensure backend is valid
      const validBackends = ['local', 'nvidia_deepseek', 'nvidia_qwen'];
      if (!validBackends.includes(parsed.backend)) {
        throw new Error(`Invalid backend: ${parsed.backend}`);
      }

      return {
        backend: parsed.backend,
        confidence: Math.max(0, Math.min(1, parsed.confidence)),
        reasoning: parsed.reasoning || 'No reasoning provided'
      };

    } catch (error) {
      console.error(`Failed to parse orchestrator response: ${error.message}`);
      return null;
    }
  }
}
