/**
 * @file EnhancedSelfReview module for the SAB dual-iterate system.
 * @description Provides structured self-critique with multi-aspect scoring rubrics.
 */

import { SelfReflectionConfig } from './self-reflection-config.js';

/**
 * EnhancedSelfReview - Structured self-critique with scoring rubrics
 */
class EnhancedSelfReview {
  /**
   * Create a new EnhancedSelfReview instance
   * @param {Object} options
   * @param {Function} options.backendCaller - Function to call backend models
   * @param {Object} options.config - Configuration options
   */
  constructor(options = {}) {
    this.backendCaller = options.backendCaller;
    this.selfReflectionConfig = options.selfReflectionConfig || new SelfReflectionConfig();
    this.config = {
      maxTurns: 3,
      confidenceThreshold: 8.0,
      modelId: 'default-model',
      ...options.config
    };
  }

  /**
   * Run a structured review of the code
   * @param {string} code - Code to review
   * @param {string} task - Original task description
   * @param {string} modelId - Model ID for configuration
   * @returns {Promise<ReviewResult>} Structured review result
   */
  async runReview(code, task, modelId = this.config.modelId) {
    // Get model-appropriate settings
    const modelConfig = this.selfReflectionConfig.getConfig(modelId);

    if (!modelConfig.enabled) {
      // Skip review for small models
      return {
        approved: true,
        confidence: 0.5,
        aspects: this._getDefaultAspects(),
        overallScore: 5,
        suggestions: ['Review skipped - model too small for reliable self-reflection'],
        turnsUsed: 0,
        skipped: true
      };
    }

    const maxTurns = modelConfig.maxTurns || this.config.maxTurns;
    const threshold = modelConfig.confidenceThreshold * 10 || this.config.confidenceThreshold;

    let accumulatedIssues = {
      correctness: [],
      security: [],
      performance: [],
      maintainability: []
    };

    let accumulatedSuggestions = [];
    let bestScores = null;
    let turnsUsed = 0;

    for (let turn = 1; turn <= maxTurns; turn++) {
      turnsUsed = turn;

      const prompt = this._buildCritiquePrompt(code, task, turn);
      const response = await this.backendCaller(modelId, prompt);
      const parsedReview = this._parseStructuredReview(response);

      // Accumulate issues and suggestions
      for (const aspect of Object.keys(accumulatedIssues)) {
        if (parsedReview.aspects[aspect].issues.length > 0) {
          accumulatedIssues[aspect] = [
            ...new Set([
              ...accumulatedIssues[aspect],
              ...parsedReview.aspects[aspect].issues
            ])
          ];
        }
      }

      if (parsedReview.suggestions.length > 0) {
        accumulatedSuggestions = [
          ...new Set([
            ...accumulatedSuggestions,
            ...parsedReview.suggestions
          ])
        ];
      }

      // Keep track of the best scores so far
      if (!bestScores || parsedReview.overallScore > bestScores.overallScore) {
        bestScores = parsedReview;
      }

      // Check for early exit
      if (this._shouldEarlyExit(parsedReview, threshold)) {
        return this._buildResult(parsedReview, accumulatedIssues, accumulatedSuggestions, turnsUsed, threshold);
      }
    }

    // If we've exhausted all turns, return the best result
    return this._buildResult(bestScores, accumulatedIssues, accumulatedSuggestions, turnsUsed, threshold);
  }

  /**
   * Build the critique prompt with scoring rubric
   * @private
   */
  _buildCritiquePrompt(code, task, turn) {
    return `You are an expert code reviewer. Analyze the following code for the given task and provide a structured critique.

TASK:
${task}

CODE:
\`\`\`
${code}
\`\`\`

This is review turn ${turn}. Provide your analysis in the following JSON format:
{
  "aspects": {
    "correctness": {
      "score": <number 0-10>,
      "issues": ["issue1", "issue2", ...]
    },
    "security": {
      "score": <number 0-10>,
      "issues": ["issue1", "issue2", ...]
    },
    "performance": {
      "score": <number 0-10>,
      "issues": ["issue1", "issue2", ...]
    },
    "maintainability": {
      "score": <number 0-10>,
      "issues": ["issue1", "issue2", ...]
    }
  },
  "overallScore": <average of aspect scores>,
  "suggestions": ["suggestion1", "suggestion2", ...]
}

SCORING RUBRIC:
- 9-10: Excellent - No significant issues, production ready
- 7-8: Good - Minor improvements needed, safe to use
- 5-6: Fair - Several issues need addressing before use
- 3-4: Poor - Major issues present, needs rework
- 0-2: Critical - Significant problems, do not use

ASPECTS TO EVALUATE:
1. Correctness: Does it fulfill the task requirements? Edge cases handled?
2. Security: Any vulnerabilities? Input validation? Injection risks?
3. Performance: Efficient algorithms? Memory usage? Scalability?
4. Maintainability: Clean code? Good naming? Comments where needed?

Respond with ONLY the JSON object, no additional text.`;
  }

  /**
   * Parse the structured review response
   * @private
   */
  _parseStructuredReview(response) {
    try {
      // Handle different response formats
      let text = typeof response === 'string' ? response :
                 response.content || response.text || response.result || '';

      // Strip markdown code blocks if present
      text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      // Strip think tags
      text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

      const parsed = JSON.parse(text);

      // Ensure all required fields exist with default values
      const aspects = {
        correctness: {
          score: parsed.aspects?.correctness?.score || 0,
          issues: Array.isArray(parsed.aspects?.correctness?.issues)
            ? parsed.aspects.correctness.issues
            : []
        },
        security: {
          score: parsed.aspects?.security?.score || 0,
          issues: Array.isArray(parsed.aspects?.security?.issues)
            ? parsed.aspects.security.issues
            : []
        },
        performance: {
          score: parsed.aspects?.performance?.score || 0,
          issues: Array.isArray(parsed.aspects?.performance?.issues)
            ? parsed.aspects.performance.issues
            : []
        },
        maintainability: {
          score: parsed.aspects?.maintainability?.score || 0,
          issues: Array.isArray(parsed.aspects?.maintainability?.issues)
            ? parsed.aspects.maintainability.issues
            : []
        }
      };

      // Calculate overall score as average of all aspect scores
      const overallScore = (
        aspects.correctness.score +
        aspects.security.score +
        aspects.performance.score +
        aspects.maintainability.score
      ) / 4;

      return {
        aspects,
        overallScore,
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : []
      };
    } catch (error) {
      console.error('[EnhancedSelfReview] Parse error:', error.message);
      // Return a default poor review if parsing fails
      return {
        aspects: this._getDefaultAspects(1, ['Failed to parse review response']),
        overallScore: 1,
        suggestions: ['Review parsing failed - please retry']
      };
    }
  }

  /**
   * Check if early exit conditions are met
   * @private
   */
  _shouldEarlyExit(scores, threshold) {
    return scores.overallScore >= threshold;
  }

  /**
   * Build the final result object
   * @private
   */
  _buildResult(scores, accumulatedIssues, accumulatedSuggestions, turnsUsed, threshold) {
    return {
      approved: scores.overallScore >= threshold,
      confidence: scores.overallScore / 10,
      aspects: {
        correctness: {
          score: scores.aspects.correctness.score,
          issues: accumulatedIssues.correctness
        },
        security: {
          score: scores.aspects.security.score,
          issues: accumulatedIssues.security
        },
        performance: {
          score: scores.aspects.performance.score,
          issues: accumulatedIssues.performance
        },
        maintainability: {
          score: scores.aspects.maintainability.score,
          issues: accumulatedIssues.maintainability
        }
      },
      overallScore: scores.overallScore,
      suggestions: accumulatedSuggestions,
      turnsUsed
    };
  }

  /**
   * Get default aspects structure
   * @private
   */
  _getDefaultAspects(score = 5, issues = []) {
    return {
      correctness: { score, issues: [...issues] },
      security: { score, issues: [...issues] },
      performance: { score, issues: [...issues] },
      maintainability: { score, issues: [...issues] }
    };
  }
}

export { EnhancedSelfReview };
