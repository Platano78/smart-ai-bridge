/**
 * @fileoverview ReviewHandler - Code review tool handler
 * @module handlers/review-handler
 *
 * Comprehensive code review with security audit, performance analysis,
 * and best practices validation.
 */

import { BaseHandler } from './base-handler.js';

class ReviewHandler extends BaseHandler {
  /**
   * Execute code review
   * @param {Object} args - Review arguments
   * @param {string} args.content - Code content to review
   * @param {string} [args.file_path] - File path for context
   * @param {string} [args.language] - Programming language hint
   * @param {string} [args.review_type='comprehensive'] - Type of review
   * @returns {Promise<Object>}
   */
  async execute(args) {
    const {
      content,
      file_path,
      language,
      review_type = 'comprehensive'
    } = args;

    if (!content) {
      throw new Error('Content is required for code review');
    }

    const detectedLanguage = language || this.detectLanguage(content);

    const prompt = this.buildReviewPrompt(content, detectedLanguage, review_type);

    const endpoint = await this.routeRequest(prompt, {
      taskType: 'analysis',
      language: detectedLanguage
    });

    const startTime = Date.now();
    const review = await this.makeRequest(prompt, endpoint);
    const endTime = Date.now();

    // Record for playbook learning
    this.recordExecution(
      {
        success: true,
        backend: endpoint,
        processingTime: endTime - startTime,
        content: typeof review === 'string' ? review?.substring(0, 500) : JSON.stringify(review)?.substring(0, 500)
      },
      {
        tool: 'review',
        taskType: review_type,
        prompt: prompt?.substring(0, 500)
      }
    );

    // Record for compound learning
    const reviewContent = typeof review === 'string' ? review : JSON.stringify(review);
    await this.recordLearningOutcome(
      true,
      reviewContent?.length || 0,
      endpoint,
      { taskType: 'review', reviewType: review_type, source: 'review' }
    );

    return this.buildSuccessResponse({
      file_path,
      language: detectedLanguage,
      review_type,
      review,
      endpoint_used: endpoint
    });
  }

  /**
   * Build review prompt based on review type
   * @private
   * @param {string} content - Code content
   * @param {string} language - Programming language
   * @param {string} reviewType - Type of review
   * @returns {string}
   */
  buildReviewPrompt(content, language, reviewType) {
    const prompts = {
      security: `Perform a SECURITY-focused code review of this ${language} code:

${content}

Focus on:
1. Input validation vulnerabilities
2. Authentication/authorization issues
3. Injection vulnerabilities (SQL, XSS, command)
4. Sensitive data exposure
5. Security misconfiguration
6. Cryptographic weaknesses`,

      performance: `Perform a PERFORMANCE-focused code review of this ${language} code:

${content}

Focus on:
1. Algorithm complexity (time and space)
2. Memory management issues
3. Database query optimization
4. Caching opportunities
5. I/O bottlenecks
6. Parallelization potential`,

      quality: `Perform a CODE QUALITY review of this ${language} code:

${content}

Focus on:
1. Code readability and maintainability
2. Naming conventions
3. Code duplication (DRY violations)
4. SOLID principles compliance
5. Error handling patterns
6. Test coverage considerations`,

      comprehensive: `Perform a COMPREHENSIVE code review of this ${language} code:

${content}

Provide analysis covering:
1. Code quality and maintainability
2. Security vulnerabilities
3. Performance considerations
4. Best practices compliance
5. Suggested improvements`
    };

    return prompts[reviewType] || prompts.comprehensive;
  }
}

export { ReviewHandler };
