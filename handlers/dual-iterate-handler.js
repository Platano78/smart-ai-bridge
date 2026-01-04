/**
 * Smart AI Bridge v1.5.0 - Dual Iterate Handler
 *
 * Generate->Review->Fix loop with dual backends:
 * 1. Coding backend generates code from task description
 * 2. Reasoning backend reviews and scores quality
 * 3. If below threshold, coding backend fixes issues
 * 4. Iterate until quality threshold met or max iterations
 * 5. Return only final approved code (token-efficient)
 */

/**
 * Default dual iterate configuration
 */
const DEFAULT_CONFIG = {
  coding_backend: process.env.DUAL_CODING_BACKEND || 'local',
  reasoning_backend: process.env.DUAL_REASONING_BACKEND || 'nvidia_deepseek',
  max_iterations: 3,
  quality_threshold: 0.7
};

/**
 * Dual Iterate Handler - Generate->Review->Fix workflow
 */
export class DualIterateHandler {
  /**
   * @param {Object} backendRegistry - BackendRegistry instance
   */
  constructor(backendRegistry) {
    this.registry = backendRegistry;
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * Handle dual_iterate request
   * @param {Object} params - Request parameters
   * @returns {Promise<Object>} Final approved code and history
   */
  async handle(params) {
    const {
      task,
      max_iterations = this.config.max_iterations,
      quality_threshold = this.config.quality_threshold,
      include_history = false
    } = params;

    // Validate inputs
    if (!task) {
      throw new Error('dual_iterate requires a task description');
    }

    if (quality_threshold < 0.5 || quality_threshold > 1.0) {
      throw new Error('quality_threshold must be between 0.5 and 1.0');
    }

    if (max_iterations < 1 || max_iterations > 5) {
      throw new Error('max_iterations must be between 1 and 5');
    }

    // Resolve backends (check availability)
    const codingBackend = this._resolveBackend(this.config.coding_backend);
    const reasoningBackend = this._resolveBackend(this.config.reasoning_backend);

    console.error(`\n========================================`);
    console.error(`DUAL ITERATE WORKFLOW`);
    console.error(`========================================`);
    console.error(`Task: ${task.substring(0, 80)}${task.length > 80 ? '...' : ''}`);
    console.error(`Coding: ${codingBackend}`);
    console.error(`Reasoning: ${reasoningBackend}`);
    console.error(`Max iterations: ${max_iterations}`);
    console.error(`Quality threshold: ${quality_threshold}`);
    console.error(`========================================\n`);

    const startTime = Date.now();
    const history = [];
    let currentCode = null;
    let lastReview = null;
    let iteration = 0;
    let approved = false;

    while (iteration < max_iterations && !approved) {
      iteration++;
      console.error(`\n--- Iteration ${iteration}/${max_iterations} ---\n`);

      // Step 1: Generate/Fix code
      const generatePrompt = iteration === 1
        ? this._buildGeneratePrompt(task)
        : this._buildFixPrompt(task, currentCode, lastReview);

      console.error(`[1/2] Generating code with ${codingBackend}...`);
      const generateResult = await this._queryBackend(
        codingBackend,
        generatePrompt,
        { max_tokens: 8000 }
      );
      currentCode = this._extractCode(generateResult.content);

      if (include_history) {
        history.push({
          iteration,
          phase: 'generate',
          backend: codingBackend,
          code: currentCode,
          tokens: generateResult.usage?.total_tokens || 0
        });
      }

      // Step 2: Review code
      const reviewPrompt = this._buildReviewPrompt(task, currentCode);
      console.error(`[2/2] Reviewing with ${reasoningBackend}...`);

      const reviewResult = await this._queryBackend(
        reasoningBackend,
        reviewPrompt,
        { max_tokens: 2000 }
      );
      lastReview = this._parseReview(reviewResult.content);

      if (include_history) {
        history.push({
          iteration,
          phase: 'review',
          backend: reasoningBackend,
          review: lastReview,
          tokens: reviewResult.usage?.total_tokens || 0
        });
      }

      console.error(`   Quality Score: ${lastReview.score.toFixed(2)} (threshold: ${quality_threshold})`);

      if (lastReview.score >= quality_threshold) {
        approved = true;
        console.error(`   APPROVED at iteration ${iteration}`);
      } else if (iteration < max_iterations) {
        console.error(`   Below threshold, will fix in next iteration`);
        console.error(`   Issues: ${lastReview.issues.slice(0, 3).join(', ')}`);
      }
    }

    const duration = Date.now() - startTime;

    console.error(`\n========================================`);
    console.error(`DUAL ITERATE COMPLETE`);
    console.error(`========================================`);
    console.error(`Status: ${approved ? 'APPROVED' : 'MAX_ITERATIONS_REACHED'}`);
    console.error(`Iterations: ${iteration}`);
    console.error(`Final Score: ${lastReview?.score?.toFixed(2) || 'N/A'}`);
    console.error(`Duration: ${duration}ms`);
    console.error(`========================================\n`);

    return {
      success: approved || iteration === max_iterations,
      approved,
      code: currentCode,
      final_score: lastReview?.score || 0,
      iterations: iteration,
      final_review: {
        score: lastReview?.score || 0,
        issues: lastReview?.issues || [],
        suggestions: lastReview?.suggestions || []
      },
      history: include_history ? history : undefined,
      metadata: {
        tool: 'dual_iterate',
        coding_backend: codingBackend,
        reasoning_backend: reasoningBackend,
        quality_threshold,
        max_iterations,
        duration_ms: duration
      }
    };
  }

  /**
   * Resolve backend name to available backend
   * @param {string} preferred - Preferred backend name
   * @returns {string} Available backend name
   */
  _resolveBackend(preferred) {
    const backend = this.registry.getBackend(preferred);
    if (backend && backend.enabled) {
      return preferred;
    }

    // Fallback to first available
    const available = this.registry.getNextAvailable([]);
    if (available) {
      console.error(`  Warning: ${preferred} unavailable, using ${available}`);
      return available;
    }

    throw new Error(`No backends available (wanted: ${preferred})`);
  }

  /**
   * Query a specific backend
   * @param {string} backendName - Backend to query
   * @param {string} prompt - Prompt to send
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Backend response
   */
  async _queryBackend(backendName, prompt, options) {
    return this.registry.makeRequestWithFallback(prompt, backendName, options);
  }

  /**
   * Build initial generation prompt
   * @param {string} task - Task description
   * @returns {string} Generation prompt
   */
  _buildGeneratePrompt(task) {
    return `You are an expert code generator. Generate high-quality, production-ready code for the following task.

REQUIREMENTS:
- Write clean, well-structured code
- Include necessary error handling
- Follow best practices for the language
- Add brief comments for complex logic only

TASK:
${task}

OUTPUT:
Provide ONLY the code. No explanations before or after.
Use code blocks with the appropriate language tag.`;
  }

  /**
   * Build fix prompt based on review feedback
   * @param {string} task - Original task
   * @param {string} code - Current code
   * @param {Object} review - Review results
   * @returns {string} Fix prompt
   */
  _buildFixPrompt(task, code, review) {
    return `You are an expert code reviewer fixing code based on feedback.

ORIGINAL TASK:
${task}

CURRENT CODE:
\`\`\`
${code}
\`\`\`

ISSUES FOUND:
${review.issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}

SUGGESTIONS:
${review.suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}

FIX THE CODE:
Address ALL issues above. Output ONLY the fixed code, no explanations.`;
  }

  /**
   * Build review prompt
   * @param {string} task - Original task
   * @param {string} code - Code to review
   * @returns {string} Review prompt
   */
  _buildReviewPrompt(task, code) {
    return `You are an expert code reviewer. Analyze the following code for quality, correctness, and best practices.

TASK DESCRIPTION:
${task}

CODE TO REVIEW:
\`\`\`
${code}
\`\`\`

REVIEW CRITERIA:
1. Correctness: Does it fulfill the task requirements?
2. Quality: Is it clean, readable, maintainable?
3. Best Practices: Does it follow language idioms?
4. Error Handling: Are edge cases covered?
5. Security: Any obvious vulnerabilities?

OUTPUT FORMAT (JSON):
{
  "score": 0.0-1.0,
  "issues": ["issue 1", "issue 2"],
  "suggestions": ["improvement 1", "improvement 2"],
  "summary": "Brief overall assessment"
}

Respond ONLY with the JSON object.`;
  }

  /**
   * Extract code from response (handles markdown code blocks)
   * @param {string} content - Response content
   * @returns {string} Extracted code
   */
  _extractCode(content) {
    // Try to extract code block
    const codeBlockMatch = content.match(/```(?:\w+)?\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // Fallback: return content as-is (might be plain code)
    return content.trim();
  }

  /**
   * Parse review response into structured format
   * @param {string} content - Review response
   * @returns {Object} Parsed review
   */
  _parseReview(content) {
    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          score: Math.min(1, Math.max(0, parseFloat(parsed.score) || 0)),
          issues: Array.isArray(parsed.issues) ? parsed.issues : [],
          suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
          summary: parsed.summary || ''
        };
      }
    } catch (e) {
      console.error('  Warning: Failed to parse review JSON, using heuristic scoring');
    }

    // Heuristic fallback
    const hasPositive = /good|excellent|correct|well|clean/i.test(content);
    const hasNegative = /issue|bug|error|problem|fix|missing/i.test(content);

    return {
      score: hasPositive && !hasNegative ? 0.8 : hasNegative ? 0.4 : 0.6,
      issues: ['Could not parse structured review'],
      suggestions: ['Review the generated code manually'],
      summary: content.substring(0, 200)
    };
  }
}

export default DualIterateHandler;
