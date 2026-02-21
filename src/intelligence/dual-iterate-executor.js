/**
 * SAB Dual Iterate Executor
 *
 * Implements the generate→review→fix loop:
 * - DUAL_ITERATIVE: dual1 generates, dual2 reviews, dual1 fixes
 * - SINGLE_REFLECTION: Single model self-reviews via multi-turn
 * - PASS_THROUGH: Direct generation without review
 *
 * Integrates with DualWorkflowManager for mode detection and backend selection.
 * Uses DiffContextOptimizer for ~60% token reduction on fix iterations.
 */

import { WorkflowMode } from './dual-workflow-manager.js';
import { DiffContextOptimizer } from './diff-context-optimizer.js';

/**
 * Review status from reviewer
 */
const ReviewStatus = {
  APPROVED: 'approved',
  REJECTED: 'rejected',
  NEEDS_MINOR_FIXES: 'needs_minor_fixes'
};

/**
 * Dual Iterate Executor
 */
class DualIterateExecutor {
  constructor(options = {}) {
    this.dualWorkflowManager = options.dualWorkflowManager;
    this.backendRegistry = options.backendRegistry;
    this.learningEngine = options.learningEngine;

    // Configuration
    this.maxIterations = options.maxIterations || 3;
    this.qualityThreshold = options.qualityThreshold || 0.7;
    this.timeoutMs = options.timeoutMs || 60000;

    // DiffContextOptimizer for targeted fixes (reduces tokens by ~60%)
    this.diffContextOptimizer = options.diffContextOptimizer || new DiffContextOptimizer({
      contextLines: 4,
      groupAdjacentIssues: true
    });

    // Metrics
    this.metrics = {
      totalExecutions: 0,
      dualLoops: 0,
      selfReflections: 0,
      passThroughs: 0,
      averageIterations: 0,
      successRate: 0,
      tokensSavedByOptimizer: 0
    };

    console.error('[DualIterateExecutor] Initialized with DiffContextOptimizer');
  }

  /**
   * Execute iterative code generation with review loop
   * @param {string} task - Code generation task description
   * @param {Object} options - Execution options
   * @returns {Object} { success, code, iterations, mode, history }
   */
  async execute(task, options = {}) {
    const startTime = Date.now();
    this.metrics.totalExecutions++;

    // Detect current mode
    const modeInfo = await this.dualWorkflowManager.detectMode();
    const mode = modeInfo.mode;

    console.error(`[DualIterateExecutor] Mode: ${mode}, Task: ${task.substring(0, 50)}...`);

    let result;

    try {
      switch (mode) {
        case WorkflowMode.DUAL_ITERATIVE:
          this.metrics.dualLoops++;
          result = await this.runDualLoop(task, options);
          break;

        case WorkflowMode.SINGLE_REFLECTION:
          this.metrics.selfReflections++;
          result = await this.runSelfReflection(task, options);
          break;

        case WorkflowMode.PASS_THROUGH:
        case WorkflowMode.CLOUD_FALLBACK:
        default:
          this.metrics.passThroughs++;
          result = await this.runPassThrough(task, options);
          break;
      }

      result.mode = mode;
      result.executionTime = Date.now() - startTime;

      // Update metrics
      this._updateMetrics(result);

      // Record to learning engine if available
      if (this.learningEngine && result.success) {
        await this._recordSuccess(task, result);
      }

      return result;

    } catch (error) {
      console.error(`[DualIterateExecutor] Execution failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        mode,
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Run dual backend iterative loop
   * dual1 (Seed-Coder) generates → dual2 (DeepSeek-R1) reviews → dual1 fixes
   * @private
   */
  async runDualLoop(task, options = {}) {
    const history = [];
    let code = null;
    let approved = false;
    let iterations = 0;
    let bestCode = null;
    let bestQualityScore = 0;
    let bestIteration = 0;

    const maxIter = options.maxIterations || this.maxIterations;

    while (!approved && iterations < maxIter) {
      iterations++;
      console.error(`[DualIterateExecutor] Iteration ${iterations}/${maxIter}`);

      // Step 1: Generate with coding model (e.g., agents-seed-coder)
      const genRouting = await this.dualWorkflowManager.getBackendForRole('generator');
      const genPrompt = this._buildGenerationPrompt(task, code, history);

      const genResult = await this._callBackend(genRouting.backend, {
        systemPrompt: 'You are an expert programmer. Generate clean, working code.',
        userPrompt: genPrompt,
        routerModel: genRouting.routerModel
      });

      code = this._extractCode(genResult);

      // Step 2: Review with reasoning model (e.g., agents-qwen3-14b)
      const reviewRouting = await this.dualWorkflowManager.getBackendForRole('reviewer');
      const reviewPrompt = this._buildReviewPrompt(code, task);

      const reviewResult = await this._callBackend(reviewRouting.backend, {
        systemPrompt: `You are a senior code reviewer. Review the code and output EXACTLY in this format:

STATUS: APPROVED
QUALITY_SCORE: 0.95
CRITIQUE: None
SUGGESTIONS: None

OR

STATUS: REJECTED
QUALITY_SCORE: 0.75
CRITIQUE: [list specific bugs or security issues]
SUGGESTIONS: [specific fixes needed]

Rules:
- QUALITY_SCORE: Rate functional correctness for STATED requirements (0.0-1.0)
- APPROVED if code works correctly for the task requirements
- REJECTED only for actual bugs, security issues, or missing STATED requirements
- Do NOT reject for style preferences or hypothetical edge cases NOT in requirements
- A score >= 0.7 means "code works but has minor issues"
- The STATUS and QUALITY_SCORE lines MUST be first in your response`,
        userPrompt: reviewPrompt,
        routerModel: reviewRouting.routerModel
      });

      const review = this._parseReview(reviewResult);

      // Record iteration
      history.push({
        iteration: iterations,
        code: code.substring(0, 500) + (code.length > 500 ? '...' : ''),
        review: review,
        generator: genRouting.backend,
        generatorModel: genRouting.routerModel,
        reviewer: reviewRouting.backend,
        reviewerModel: reviewRouting.routerModel
      });

      // Track best version for fallback
      const qualityScore = review.qualityScore || review.confidence;
      if (qualityScore > bestQualityScore) {
        bestQualityScore = qualityScore;
        bestCode = code;
        bestIteration = iterations;
      }

      // Soft pass: Accept if quality >= threshold even when REJECTED (pragmatic acceptance)
      if (review.status === ReviewStatus.REJECTED && 
          (review.qualityScore || review.confidence) >= this.qualityThreshold) {
        approved = true;
        review.softPass = true;
        console.error(`[DualIterateExecutor] ✅ Soft pass on iteration ${iterations} (quality: ${review.qualityScore || review.confidence} >= ${this.qualityThreshold})`);
      }
      // Hard approval
      else if (review.status === ReviewStatus.APPROVED) {
        if (review.implicit && review.confidence < 0.8 && iterations < maxIter) {
          // Low-confidence implicit approval - get confirmation review
          console.error(`[DualIterateExecutor] ⚠️ Implicit approval (confidence: ${review.confidence}) - requesting confirmation`);

          const confirmResult = await this._callBackend(reviewRouting.backend, {
            systemPrompt: `Confirm or reject this code. Reply with ONLY one word: APPROVED or REJECTED`,
            userPrompt: `Is this code correct and complete for the task?\n\nTask: ${task.substring(0, 200)}\n\nCode:\n${code}`,
            routerModel: reviewRouting.routerModel
          });

          const confirmText = (confirmResult?.content || confirmResult || '').toString().toUpperCase();
          if (confirmText.includes('APPROVED')) {
            approved = true;
            review.confidence = 0.9; // Upgraded confidence
            console.error(`[DualIterateExecutor] ✅ Confirmed approved on iteration ${iterations}`);
          } else {
            console.error(`[DualIterateExecutor] ❌ Confirmation rejected - continuing iterations`);
          }
        } else {
          approved = true;
          console.error(`[DualIterateExecutor] ✅ Approved on iteration ${iterations} (confidence: ${review.confidence})`);
        }
      } else {
        // Rejected - use DiffContextOptimizer for targeted fix (saves ~60% tokens)
        const optimizedResult = this.diffContextOptimizer.getOptimizedContext(
          review.critique + '\n' + review.suggestions,
          code
        );

        if (optimizedResult.issues.length > 0 && optimizedResult.savings.percentSaved > 20) {
          // Use optimized context for fix prompt
          this.metrics.tokensSavedByOptimizer += optimizedResult.savings.tokensSaved;
          task = this._buildOptimizedFixPrompt(task, review, optimizedResult);
          console.error(`[DualIterateExecutor] 🔄 Rejected (confidence: ${review.confidence}), fixing with optimized context (${optimizedResult.savings.percentSaved}% tokens saved)...`);
        } else {
          // Fall back to full context if optimizer didn't find specific issues
          // Pass raw review for detailed feedback (local tokens are free!)
          task = this._buildFixPrompt(task, review.critique, review.suggestions, review.raw);
          console.error(`[DualIterateExecutor] 🔄 Rejected (confidence: ${review.confidence}), fixing with full review feedback...`);
        }
      }
    }

    // Best-effort fallback: Return best version if we have one
    if (!approved && bestCode && bestQualityScore >= 0.5) {
      console.error(`[DualIterateExecutor] ⚠️ Max iterations reached. Returning best effort (iteration ${bestIteration}, quality: ${bestQualityScore})`);
      return {
        success: true,
        code: bestCode,
        mode: 'dual_iterative',
        iterations,
        bestEffort: true,
        bestIteration,
        bestQualityScore,
        history: options.includeHistory ? history : undefined,
        finalReview: history[history.length - 1]?.review
      };
    }

    return {
      success: approved,
      code,
      mode: 'dual_iterative',
      iterations,
      history: options.includeHistory ? history : undefined,
      finalReview: history[history.length - 1]?.review
    };
  }

  /**
   * Run single model self-reflection
   * Uses multi-turn prompting for self-review
   * @private
   */
  async runSelfReflection(task, options = {}) {
    const history = [];
    const routing = await this.dualWorkflowManager.getBackendForRole('generator');

    console.error(`[DualIterateExecutor] Self-reflection with ${routing.backend}${routing.routerModel ? ` (${routing.routerModel})` : ''}`);

    // Turn 1: Generate code
    const genResult = await this._callBackend(routing.backend, {
      systemPrompt: 'You are an expert programmer. Generate clean, working code.',
      userPrompt: task,
      routerModel: routing.routerModel
    });

    let code = this._extractCode(genResult);

    history.push({
      turn: 1,
      type: 'generation',
      code: code.substring(0, 500) + (code.length > 500 ? '...' : '')
    });

    // Turn 2: Self-review (fresh context to avoid bias)
    const reviewResult = await this._callBackend(routing.backend, {
      systemPrompt: `You are a code reviewer. Your response MUST follow this EXACT format.

CRITICAL: Your FIRST line MUST be exactly "STATUS: APPROVED" or "STATUS: REJECTED" with NO other text before it.

Format for good code:
STATUS: APPROVED
CRITIQUE: None
SUGGESTIONS: None

Format for code with bugs:
STATUS: REJECTED
CRITIQUE: [describe actual bugs found - not style issues]
SUGGESTIONS: [specific line-by-line fixes needed]

Rules:
- First line = STATUS only (no thinking, no preamble, no explanation before STATUS)
- Only reject for real bugs, not style preferences
- Be specific about line numbers when rejecting`,
      userPrompt: `Review this code for correctness, security, and best practices:\n\n${code}\n\nOriginal task: ${task}`,
      routerModel: routing.routerModel
    });

    const review = this._parseReview(reviewResult);

    history.push({
      turn: 2,
      type: 'review',
      review
    });

    // Turn 3: Fix if rejected
    if (review.status === ReviewStatus.REJECTED) {
      console.error(`[DualIterateExecutor] Self-review rejected, applying fixes...`);

      const fixResult = await this._callBackend(routing.backend, {
        systemPrompt: 'You are an expert programmer. Fix the code based on the review feedback.',
        userPrompt: `Fix this code based on the review:\n\nOriginal code:\n${code}\n\nReview feedback:\n${review.critique}\n\nSuggested fixes:\n${review.suggestions}\n\nOutput only the corrected code.`,
        routerModel: routing.routerModel
      });

      code = this._extractCode(fixResult);

      history.push({
        turn: 3,
        type: 'fix',
        code: code.substring(0, 500) + (code.length > 500 ? '...' : '')
      });

      return {
        success: true,
        code,
        iterations: 2,
        history: options.includeHistory ? history : undefined,
        selfReviewApplied: true
      };
    }

    return {
      success: true,
      code,
      iterations: 1,
      history: options.includeHistory ? history : undefined,
      selfReviewApplied: false
    };
  }

  /**
   * Run pass-through (no review loop)
   * @private
   */
  async runPassThrough(task, options = {}) {
    const routing = await this.dualWorkflowManager.getBackendForRole('generator');

    console.error(`[DualIterateExecutor] Pass-through with ${routing.backend}${routing.routerModel ? ` (${routing.routerModel})` : ''}`);

    const result = await this._callBackend(routing.backend, {
      systemPrompt: 'You are an expert programmer. Generate clean, working code.',
      userPrompt: task,
      routerModel: routing.routerModel
    });

    const code = this._extractCode(result);

    return {
      success: true,
      code,
      iterations: 1,
      passThrough: true
    };
  }

  /**
   * Call backend with prompt
   * @private
   * @param {string} backendName - Backend adapter name
   * @param {Object} options - Call options
   * @param {string} options.systemPrompt - System prompt
   * @param {string} options.userPrompt - User prompt
   * @param {string|null} [options.routerModel] - Router model name for 8081 multi-model selection
   */
  async _callBackend(backendName, { systemPrompt, userPrompt, routerModel = null }) {
    const adapter = this.backendRegistry?.getAdapter?.(backendName);

    if (!adapter) {
      throw new Error(`Backend not available: ${backendName}`);
    }

    // Build messages
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    // Execute with timeout - pass routerModel for 8081 router model selection
    const result = await Promise.race([
      adapter.execute(userPrompt, {
        messages,
        maxTokens: 4096,
        temperature: 0.7,
        routerModel // LocalAdapter uses this to select specific model on router
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Backend timeout')), this.timeoutMs)
      )
    ]);

    return result;
  }

  /**
   * Extract code from LLM response
   * @private
   */
  _extractCode(response) {
    if (!response) return '';

    // Handle different response formats
    let text = typeof response === 'string' ? response : 
               response.content || response.text || response.result || '';

    // Strip DeepSeek <think> tags
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    // Extract code blocks if present
    const codeBlockMatch = text.match(/```(?:\w+)?\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    return text.trim();
  }

  /**
   * Parse review response with multi-layer extraction
   * Priority: XML tags > Header parsing > Bullet extraction > Heuristics
   * @private
   */
  _parseReview(response) {
    const text = typeof response === 'string' ? response :
                 response.content || response.text || response.result || '';

    // Strip <think> tags from reasoning models (DeepSeek R1, etc.)
    const cleanText = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    let status = ReviewStatus.REJECTED;
    let confidence = 0.5;
    let implicit = false;
    let feedback = '';
    let qualityScore = null;

    // === LAYER 1: XML Tag Extraction (preferred) ===
    const statusTagMatch = cleanText.match(/<status>\s*(APPROVED|REJECTED)\s*<\/status>/i);
    const feedbackTagMatch = cleanText.match(/<feedback>([\s\S]*?)<\/feedback>/i);
    const qualityScoreMatch = cleanText.match(/<quality_score>\s*([\d.]+)\s*<\/quality_score>/i);
    
    if (qualityScoreMatch) {
      qualityScore = parseFloat(qualityScoreMatch[1]);
    }

    if (statusTagMatch) {
      status = statusTagMatch[1].toUpperCase() === 'APPROVED'
        ? ReviewStatus.APPROVED
        : ReviewStatus.REJECTED;
      confidence = 1.0;
      console.error(`[DualIterateExecutor] XML status found: ${status}`);

      if (feedbackTagMatch) {
        feedback = feedbackTagMatch[1].trim();
        console.error(`[DualIterateExecutor] XML feedback extracted (${feedback.length} chars)`);
      }
    }
    // === LAYER 2: Header-based parsing (legacy format) ===
    else if (/STATUS:\s*APPROVED/i.test(cleanText)) {
      status = ReviewStatus.APPROVED;
      confidence = 1.0;
    } else if (/STATUS:\s*REJECTED/i.test(cleanText)) {
      status = ReviewStatus.REJECTED;
      confidence = 1.0;
    }
    
    // Extract quality score from headers
    const qualityHeaderMatch = cleanText.match(/QUALITY_SCORE:\s*([\d.]+)/i);
    if (qualityHeaderMatch) {
      qualityScore = parseFloat(qualityHeaderMatch[1]);
    }
    // === LAYER 3: Heuristic inference ===
    else {
      implicit = true;

      const positivePatterns = [
        /code is correct/i, /correctly (fulfills|implements|handles)/i,
        /handles all (specified |edge )?cases/i, /follows best practices/i,
        /no (security )?vulnerabilities/i, /meets? (the |all )?requirements?/i
      ];

      const negativePatterns = [
        /(?<!no |without |any )bug/i, /(?<!no |minor |any )issue/i,
        /is incorrect|is wrong|is broken/i, /fails? to (handle|meet|work)/i,
        /missing required/i, /needs? (to be |)(fixed|changed)/i
      ];

      const positiveScore = positivePatterns.filter(p => p.test(cleanText)).length;
      const negativeScore = negativePatterns.filter(p => p.test(cleanText)).length;

      if (positiveScore >= 2 && negativeScore === 0) {
        status = ReviewStatus.APPROVED;
        confidence = positiveScore >= 3 ? 0.85 : 0.7;
      } else if (negativeScore >= 1) {
        status = ReviewStatus.REJECTED;
        confidence = 0.8;
      } else {
        status = ReviewStatus.REJECTED;
        confidence = 0.4;
      }
    }

    // === LAYER 4: Extract actionable feedback if not from XML ===
    if (!feedback) {
      // Try header-based extraction
      const critiqueMatch = cleanText.match(/CRITIQUE:\s*([^\n]+(?:\n(?!STATUS:|SUGGESTIONS:)[^\n]+)*)/i);
      const suggestionsMatch = cleanText.match(/SUGGESTIONS?:\s*([^\n]+(?:\n(?!STATUS:|CRITIQUE:)[^\n]+)*)/i);

      if (critiqueMatch || suggestionsMatch) {
        feedback = [critiqueMatch?.[1], suggestionsMatch?.[1]].filter(Boolean).join('\n\n');
      }
    }

    // === LAYER 5: Bullet point extraction (fallback for free-form reviews) ===
    if (!feedback || feedback === 'No specific critique') {
      // Extract lines that look like actionable items (numbered, bulleted, or imperative)
      const lines = cleanText.split('\n');
      const actionableLines = lines.filter(line => {
        const trimmed = line.trim();
        // Match: "1. Fix...", "- Add...", "* Change...", or lines with action verbs
        return /^(\d+\.|[-*•])\s/.test(trimmed) ||
               /^(Fix|Add|Remove|Change|Update|Implement|Check|Handle|Validate|Ensure)\s/i.test(trimmed);
      });

      if (actionableLines.length > 0) {
        feedback = actionableLines.join('\n');
        console.error(`[DualIterateExecutor] Extracted ${actionableLines.length} actionable items from free-form review`);
      }
    }

    // Final fallback: use first 500 chars of review if still no feedback
    const critique = feedback || cleanText.substring(0, 500);
    const suggestions = feedback ? 'See feedback above' : 'No suggestions';

    return {
      status,
      critique,
      suggestions,
      confidence,
      qualityScore, // New: explicit quality rating
      implicit,
      raw: cleanText,
      feedback  // New: clean actionable feedback for the fixer
    };
  }

  /**
   * Build generation prompt with history context
   * Uses extracted feedback (clean actionable items) when available
   * @private
   */
  _buildGenerationPrompt(task, previousCode, history) {
    if (!previousCode || history.length === 0) {
      return task;
    }

    const lastReview = history[history.length - 1]?.review;

    // Priority: feedback (extracted actionables) > critique > raw (truncated)
    if (lastReview?.feedback && lastReview.feedback.length > 10) {
      // Use clean extracted feedback (XML tags, bullets, or header-parsed)
      return `${task}

PREVIOUS ATTEMPT WAS REJECTED. Fix these specific issues:
${lastReview.feedback}

Previous code for reference:
${previousCode}`;
    } else if (lastReview?.critique && lastReview.critique !== 'No specific critique') {
      // Use parsed critique
      return `${task}

PREVIOUS ATTEMPT WAS REJECTED. Issues to fix:
${lastReview.critique}

Previous code for reference:
${previousCode}`;
    } else if (lastReview?.raw) {
      // Fallback: Use truncated raw (first 800 chars to avoid context pollution)
      const truncatedRaw = lastReview.raw.length > 800
        ? lastReview.raw.substring(0, 800) + '...[truncated]'
        : lastReview.raw;
      return `${task}

PREVIOUS ATTEMPT WAS REJECTED. Review feedback:
${truncatedRaw}

Previous code for reference:
${previousCode}`;
    } else {
      return `${task}

PREVIOUS ATTEMPT WAS REJECTED. Please improve the code.

Previous code for reference:
${previousCode}`;
    }
  }

  /**
   * Build review prompt with XML tag structure for reliable parsing
   * Uses "Think-Then-Tag" strategy - let model reason freely, but require structured output
   * @private
   */
  _buildReviewPrompt(code, task) {
    return `Review this code against the requirements.

Task: ${task}

Code to review:
\`\`\`
${code}
\`\`\`

Analyze the code for:
1. Correctness - Does it fulfill the task?
2. Security - Any vulnerabilities?
3. Edge cases - Are they handled?

First, analyze the code step-by-step.
Then, provide your verdict and specific fixes.

You MUST format your final verdict using these EXACT tags:

<status>APPROVED</status> or <status>REJECTED</status>

If REJECTED, include actionable fixes inside <feedback> tags:
<feedback>
1. [Specific fix needed]
2. [Another fix]
</feedback>

Example of a rejection:
The function doesn't handle empty input...
<status>REJECTED</status>
<feedback>
1. Add null check at line 5: if not input: return None
2. Handle edge case when list is empty
</feedback>`;
  }

  /**
   * Build fix prompt for next iteration
   * @private
   */
  _buildFixPrompt(originalTask, critique, suggestions, rawReview = null) {
    // Use raw review if available and parsed fields are generic
    if (rawReview && (critique === 'No specific critique' || !critique)) {
      return `${originalTask}\n\nIMPORTANT: Previous attempt was rejected. Here is the full review - fix ALL issues:\n\n${rawReview}`;
    }
    return `${originalTask}\n\nIMPORTANT: Previous attempt had these issues that MUST be fixed:\n${critique}\n\nApply these improvements:\n${suggestions}`;
  }

  /**
   * Build optimized fix prompt using DiffContextOptimizer results
   * Provides only the relevant code sections to fix, reducing token usage
   * @private
   */
  _buildOptimizedFixPrompt(originalTask, review, optimizedResult) {
    const { context, issues, savings } = optimizedResult;

    const issueDescriptions = issues.map((issue, idx) => {
      return `${idx + 1}. [${issue.severity.toUpperCase()} ${issue.type}] Lines ${issue.lineStart}-${issue.lineEnd}: ${issue.description}`;
    }).join('\n');

    return `${originalTask}

TARGETED FIXES NEEDED (${issues.length} issues found):
${issueDescriptions}

RELEVANT CODE SECTIONS TO FIX:
\`\`\`
${context}
\`\`\`

FULL REVIEW FEEDBACK (address all issues):
${review.raw || review.critique}

${review.suggestions !== 'No suggestions' ? `SUGGESTED IMPROVEMENTS:\n${review.suggestions}` : ''}

INSTRUCTIONS:
- Fix ONLY the issues listed above
- Preserve all other code exactly as-is
- Return the complete fixed code`;
  }

  /**
   * Update metrics
   * @private
   */
  _updateMetrics(result) {
    const total = this.metrics.totalExecutions;
    const prevAvg = this.metrics.averageIterations;
    
    // Running average of iterations
    this.metrics.averageIterations = (prevAvg * (total - 1) + result.iterations) / total;
    
    // Success rate
    if (result.success) {
      const successes = this.metrics.successRate * (total - 1) + 1;
      this.metrics.successRate = successes / total;
    } else {
      const successes = this.metrics.successRate * (total - 1);
      this.metrics.successRate = successes / total;
    }
  }

  /**
   * Record successful execution to learning engine
   * @private
   */
  async _recordSuccess(task, result) {
    try {
      await this.learningEngine.recordOutcome({
        task: task.substring(0, 200),
        context: {
          complexity: result.iterations > 2 ? 'high' : 'medium',
          taskType: 'coding'
        },
        routing: {
          tool: 'dual_iterate',
          source: result.mode
        },
        execution: {
          completed: result.success,
          iterations: result.iterations,
          outputLength: result.code?.length || 0
        }
      });
    } catch (error) {
      console.error(`[DualIterateExecutor] Learning record failed: ${error.message}`);
    }
  }

  /**
   * Get executor status and metrics
   * @returns {Object}
   */
  getStatus() {
    return {
      metrics: this.metrics,
      config: {
        maxIterations: this.maxIterations,
        qualityThreshold: this.qualityThreshold,
        timeoutMs: this.timeoutMs
      },
      optimizer: {
        enabled: true,
        metrics: this.diffContextOptimizer.getMetrics()
      }
    };
  }
}

export { DualIterateExecutor, ReviewStatus };
