/**
 * @file DiffContextOptimizer module for the SAB dual-iterate system.
 * @description Reduces token usage by ~60% through targeted fixes instead of full code regeneration.
 */

/**
 * @typedef {Object} LineIssue
 * @property {number} lineStart - Starting line number (1-indexed)
 * @property {number} lineEnd - Ending line number (1-indexed)
 * @property {'bug'|'security'|'performance'|'style'} type - Type of issue
 * @property {'critical'|'major'|'minor'} severity - Severity level
 * @property {string} description - Description of the issue
 * @property {string} [suggestion] - Suggested fix
 */

/**
 * @typedef {Object} Fix
 * @property {number} lineStart - Starting line number
 * @property {number} lineEnd - Ending line number
 * @property {string} originalCode - Original code section
 * @property {string} fixedCode - Fixed code section
 * @property {LineIssue} issue - The issue that was fixed
 */

/**
 * DiffContextOptimizer - Optimizes code review context through targeted fixes
 */
class DiffContextOptimizer {
  /**
   * Creates a new DiffContextOptimizer instance.
   * @param {Object} options - Configuration options
   * @param {number} [options.contextLines=4] - Number of context lines around issues
   * @param {boolean} [options.groupAdjacentIssues=true] - Group adjacent line issues
   */
  constructor(options = {}) {
    this.contextLines = options.contextLines || 4;
    this.groupAdjacentIssues = options.groupAdjacentIssues !== false;

    // Metrics tracking
    this.metrics = {
      totalTokensSaved: 0,
      fixesApplied: 0,
      issuesParsed: 0
    };
  }

  /**
   * Parses reviewer feedback to extract line-specific issues.
   * @param {string} reviewText - The raw reviewer feedback text
   * @param {string} originalCode - The original code being reviewed
   * @returns {LineIssue[]} Array of parsed line issues
   */
  parseReviewerFeedback(reviewText, originalCode) {
    const lines = originalCode.split('\n');
    const issues = [];

    // Pattern 1: "Line X:" or "Lines X-Y:"
    const linePattern = /lines?\s+(\d+)(?:\s*[-–:]\s*(\d+))?\s*[:–-]?\s*(.+?)(?=\n|$)/gi;

    let match;
    while ((match = linePattern.exec(reviewText)) !== null) {
      const startLine = parseInt(match[1], 10);
      const endLine = match[2] ? parseInt(match[2], 10) : startLine;
      const description = match[3].trim();

      if (startLine > 0 && endLine >= startLine && endLine <= lines.length) {
        issues.push({
          lineStart: startLine,
          lineEnd: endLine,
          type: this._inferIssueType(description),
          severity: this._inferSeverity(description),
          description
        });
      }
    }

    // Pattern 2: Function references
    const functionPattern = /in\s+(?:function|method)\s+([$\w]+)\s*[:–-]?\s*(.+?)(?=\n|$)/gi;

    while ((match = functionPattern.exec(reviewText)) !== null) {
      const functionName = match[1];
      const description = match[2].trim();

      const funcRange = this._findFunctionRange(functionName, lines);
      if (funcRange) {
        issues.push({
          lineStart: funcRange.start,
          lineEnd: funcRange.end,
          type: this._inferIssueType(description),
          severity: this._inferSeverity(description),
          description: `In function ${functionName}: ${description}`
        });
      }
    }

    // Pattern 3: Infer from code references if no explicit line numbers
    if (issues.length === 0) {
      const inferredIssues = this._inferLineNumbersFromCodeRefs(reviewText, lines);
      issues.push(...inferredIssues);
    }

    this.metrics.issuesParsed += issues.length;
    return issues.sort((a, b) => a.lineStart - b.lineStart);
  }

  /**
   * Extracts a region of code between specified line numbers.
   * @param {string} code - The full code text
   * @param {number} startLine - Starting line number (1-indexed)
   * @param {number} endLine - Ending line number (1-indexed)
   * @returns {string} The extracted code region
   */
  extractCodeRegion(code, startLine, endLine) {
    const lines = code.split('\n');
    const startIdx = Math.max(0, startLine - 1);
    const endIdx = Math.min(lines.length, endLine);
    return lines.slice(startIdx, endIdx).join('\n');
  }

  /**
   * Builds a targeted fix prompt for a specific issue.
   * @param {LineIssue} issue - The issue to address
   * @param {string} codeRegion - The relevant code section
   * @param {Object} context - Additional context information
   * @returns {string} Formatted prompt for fixing the issue
   */
  buildTargetedFixPrompt(issue, codeRegion, context = {}) {
    const lines = [
      `Fix this ${issue.severity} ${issue.type} issue:`,
      '',
      `Problem: ${issue.description}`,
      ''
    ];

    if (context.functionName) {
      lines.push(`Location: function ${context.functionName}`, '');
    }

    if (context.lineNumbers) {
      lines.push(`Lines: ${context.lineNumbers}`, '');
    }

    lines.push(
      'Code to fix:',
      '```',
      codeRegion,
      '```',
      ''
    );

    if (issue.suggestion) {
      lines.push(`Hint: ${issue.suggestion}`, '');
    }

    lines.push(
      'Respond with ONLY the fixed code. No explanations, no markdown.',
      'Preserve the original structure and indentation.'
    );

    return lines.join('\n');
  }

  /**
   * Stitches fixed code sections back into the original code.
   * @param {string} originalCode - The original code
   * @param {Fix[]} fixes - Array of fix objects
   * @returns {string} Code with fixes applied
   */
  stitchFixes(originalCode, fixes) {
    if (fixes.length === 0) return originalCode;

    const lines = originalCode.split('\n');

    // Sort fixes by line number (descending) to preserve indices
    const sortedFixes = [...fixes].sort((a, b) => b.lineStart - a.lineStart);

    for (const fix of sortedFixes) {
      const startIdx = fix.lineStart - 1;
      const deleteCount = fix.lineEnd - fix.lineStart + 1;
      const newLines = fix.fixedCode.split('\n');

      lines.splice(startIdx, deleteCount, ...newLines);
      this.metrics.fixesApplied++;
    }

    return lines.join('\n');
  }

  /**
   * Estimates token savings achieved by using optimized context.
   * @param {string} originalCode - The original code
   * @param {string} optimizedContext - The optimized context
   * @returns {Object} Token savings statistics
   */
  estimateTokenSavings(originalCode, optimizedContext) {
    // Approximate: 1 token ≈ 4 characters
    const originalTokens = Math.ceil(originalCode.length / 4);
    const optimizedTokens = Math.ceil(optimizedContext.length / 4);
    const tokensSaved = Math.max(0, originalTokens - optimizedTokens);
    const percentSaved = originalTokens > 0
      ? Math.round((tokensSaved / originalTokens) * 100)
      : 0;

    this.metrics.totalTokensSaved += tokensSaved;

    return {
      originalTokens,
      optimizedTokens,
      tokensSaved,
      percentSaved
    };
  }

  /**
   * Gets optimized context for all issues in the review.
   * @param {string} reviewText - The reviewer feedback
   * @param {string} originalCode - The original code
   * @returns {Object} Optimized context and metadata
   */
  getOptimizedContext(reviewText, originalCode) {
    const issues = this.parseReviewerFeedback(reviewText, originalCode);

    if (issues.length === 0) {
      return {
        context: originalCode,
        issues: [],
        savings: this.estimateTokenSavings(originalCode, originalCode)
      };
    }

    const groupedIssues = this.groupAdjacentIssues
      ? this._groupAdjacentIssues(issues)
      : issues;

    const lines = originalCode.split('\n');
    const contextSections = [];

    for (const issue of groupedIssues) {
      // Expand context window
      const contextStart = Math.max(1, issue.lineStart - this.contextLines);
      const contextEnd = Math.min(lines.length, issue.lineEnd + this.contextLines);

      // Add scope context
      const scopeContext = this._getScopeContext(lines, contextStart);
      if (scopeContext) {
        contextSections.push(scopeContext);
      }

      // Add line numbers as comments
      contextSections.push(`// Lines ${contextStart}-${contextEnd}`);

      // Add the actual code region
      const codeRegion = this.extractCodeRegion(originalCode, contextStart, contextEnd);
      contextSections.push(codeRegion);
    }

    const optimizedContext = contextSections.join('\n\n// ---\n\n');

    return {
      context: optimizedContext,
      issues: groupedIssues,
      savings: this.estimateTokenSavings(originalCode, optimizedContext)
    };
  }

  /**
   * Get current metrics
   * @returns {Object} Metrics statistics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      totalTokensSaved: 0,
      fixesApplied: 0,
      issuesParsed: 0
    };
  }

  // Private helper methods

  /**
   * Infers issue type from description keywords.
   * @private
   */
  _inferIssueType(description) {
    const desc = description.toLowerCase();
    if (desc.includes('vulnerab') || desc.includes('security') || desc.includes('inject')) {
      return 'security';
    }
    if (desc.includes('performance') || desc.includes('slow') || desc.includes('optim')) {
      return 'performance';
    }
    if (desc.includes('format') || desc.includes('style') || desc.includes('indent')) {
      return 'style';
    }
    return 'bug';
  }

  /**
   * Infers severity level from description keywords.
   * @private
   */
  _inferSeverity(description) {
    const desc = description.toLowerCase();
    if (desc.includes('critical') || desc.includes('crash') || desc.includes('security') || desc.includes('vulnerab') || desc.includes('inject')) {
      return 'critical';
    }
    if (desc.includes('major') || desc.includes('break') || desc.includes('fail')) {
      return 'major';
    }
    return 'minor';
  }

  /**
   * Finds the line range of a function by name.
   * @private
   */
  _findFunctionRange(functionName, lines) {
    const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const funcPattern = new RegExp(
      `(?:function\\s+${escapedName}|${escapedName}\\s*=\\s*(?:function|\\()|(?:const|let|var)\\s+${escapedName}\\s*=)`,
      'i'
    );

    let startLine = -1;

    for (let i = 0; i < lines.length; i++) {
      if (funcPattern.test(lines[i])) {
        startLine = i + 1;
        break;
      }
    }

    if (startLine === -1) return null;

    // Find function end via brace matching
    let braceCount = 0;
    let foundOpenBrace = false;
    let endLine = startLine;

    for (let i = startLine - 1; i < lines.length; i++) {
      const line = lines[i];
      const opens = (line.match(/{/g) || []).length;
      const closes = (line.match(/}/g) || []).length;

      if (opens > 0) foundOpenBrace = true;
      braceCount += opens - closes;

      if (foundOpenBrace && braceCount === 0) {
        endLine = i + 1;
        break;
      }
    }

    return { start: startLine, end: endLine };
  }

  /**
   * Infers line numbers from code references in review text.
   * @private
   */
  _inferLineNumbersFromCodeRefs(reviewText, lines) {
    const issues = [];
    const codeRefPattern = /[`'"]([\w\s.()=;{}\[\]]+)[`'"]/g;

    let match;
    while ((match = codeRefPattern.exec(reviewText)) !== null) {
      const codeSnippet = match[1].trim();
      if (codeSnippet.length < 5) continue;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(codeSnippet)) {
          // Extract surrounding context from review
          const contextStart = Math.max(0, match.index - 50);
          const contextEnd = Math.min(reviewText.length, match.index + match[0].length + 50);
          const contextText = reviewText.substring(contextStart, contextEnd).trim();

          issues.push({
            lineStart: i + 1,
            lineEnd: i + 1,
            type: this._inferIssueType(contextText),
            severity: this._inferSeverity(contextText),
            description: contextText
          });
          break;
        }
      }
    }

    return issues;
  }

  /**
   * Groups adjacent line issues together.
   * @private
   */
  _groupAdjacentIssues(issues) {
    if (issues.length <= 1) return issues;

    const grouped = [];
    let currentGroup = { ...issues[0] };

    for (let i = 1; i < issues.length; i++) {
      const issue = issues[i];

      if (issue.lineStart <= currentGroup.lineEnd + this.contextLines) {
        currentGroup.lineEnd = Math.max(currentGroup.lineEnd, issue.lineEnd);
        currentGroup.description += `; ${issue.description}`;
        // Upgrade severity if needed
        if (issue.severity === 'critical') currentGroup.severity = 'critical';
        else if (issue.severity === 'major' && currentGroup.severity === 'minor') {
          currentGroup.severity = 'major';
        }
      } else {
        grouped.push(currentGroup);
        currentGroup = { ...issue };
      }
    }

    grouped.push(currentGroup);
    return grouped;
  }

  /**
   * Gets scope context (function/class) as comments.
   * @private
   */
  _getScopeContext(lines, startLine) {
    for (let i = startLine - 2; i >= Math.max(0, startLine - 15); i--) {
      const line = lines[i].trim();
      if (
        line.startsWith('function ') ||
        line.includes(' = function') ||
        line.startsWith('class ') ||
        line.startsWith('async function') ||
        line.match(/^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\(/)
      ) {
        return `// Context: ${line.substring(0, 60)}${line.length > 60 ? '...' : ''}`;
      }
    }
    return null;
  }
}

export { DiffContextOptimizer };
