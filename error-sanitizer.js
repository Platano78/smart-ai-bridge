/**
 * Error Sanitization Module
 * Prevents information leakage through error messages
 */

export class ErrorSanitizer {

  // Sensitive patterns to redact
  static SENSITIVE_PATTERNS = [
    // File paths
    { pattern: /\/home\/[^/]+/g, replacement: '/home/***' },
    { pattern: /\/Users\/[^/]+/g, replacement: '/Users/***' },
    { pattern: /C:\\Users\\[^\\]+/g, replacement: 'C:\\Users\\***' },

    // API endpoints
    { pattern: /https?:\/\/[^/]+\/v\d+\/[^\s]+/g, replacement: 'https://***' },

    // Stack traces (line numbers only)
    { pattern: /at .+ \((.+:\d+:\d+)\)/g, replacement: 'at [REDACTED]' },

    // Environment variables
    { pattern: /process\.env\.[A-Z_]+/g, replacement: 'process.env.***' },

    // Database connection strings
    { pattern: /mongodb:\/\/[^@]+@/g, replacement: 'mongodb://***@' },
    { pattern: /postgres:\/\/[^@]+@/g, replacement: 'postgres://***@' }
  ];

  /**
   * Sanitize error message for user display
   * @param {Error|string} error - Error to sanitize
   * @param {boolean} isDevelopment - Include details in development mode
   * @returns {string} - Safe error message
   */
  static sanitize(error, isDevelopment = false) {
    // Development mode: show all details
    if (isDevelopment) {
      return error.toString();
    }

    // Production mode: sanitize
    let message = error instanceof Error ? error.message : String(error);

    // Apply redaction patterns
    for (const { pattern, replacement } of this.SENSITIVE_PATTERNS) {
      message = message.replace(pattern, replacement);
    }

    // Remove stack traces in production
    message = message.split('\n')[0];

    return message;
  }

  /**
   * Create user-friendly error response
   * @param {Error} error - Original error
   * @param {string} context - Error context
   * @returns {object} - Sanitized error response
   */
  static createErrorResponse(error, context = 'operation') {
    const isDev = process.env.NODE_ENV === 'development';

    // Classify error type
    const errorType = this.classifyError(error);

    return {
      success: false,
      error: {
        type: errorType,
        message: this.getUserMessage(errorType, context),
        details: isDev ? this.sanitize(error, true) : undefined,
        timestamp: new Date().toISOString(),
        requestId: this.generateRequestId()
      },
      hint: this.getErrorHint(errorType)
    };
  }

  /**
   * Classify error type
   */
  static classifyError(error) {
    const message = error.message.toLowerCase();

    if (message.includes('authentication') || message.includes('unauthorized')) {
      return 'AUTH_ERROR';
    }
    if (message.includes('validation') || message.includes('invalid')) {
      return 'VALIDATION_ERROR';
    }
    if (message.includes('not found') || message.includes('enoent')) {
      return 'NOT_FOUND';
    }
    if (message.includes('permission') || message.includes('eacces')) {
      return 'PERMISSION_ERROR';
    }
    if (message.includes('timeout') || message.includes('etimedout')) {
      return 'TIMEOUT_ERROR';
    }
    if (message.includes('rate limit')) {
      return 'RATE_LIMIT';
    }

    return 'INTERNAL_ERROR';
  }

  /**
   * Get user-friendly error message
   */
  static getUserMessage(errorType, context) {
    const messages = {
      AUTH_ERROR: 'Authentication failed. Please check your credentials.',
      VALIDATION_ERROR: `Invalid input for ${context}. Please check your parameters.`,
      NOT_FOUND: `Resource not found for ${context}.`,
      PERMISSION_ERROR: 'Permission denied. Check file permissions.',
      TIMEOUT_ERROR: `Operation timed out for ${context}. Please retry.`,
      RATE_LIMIT: 'Rate limit exceeded. Please wait before retrying.',
      INTERNAL_ERROR: `An error occurred during ${context}. Please contact support if this persists.`
    };

    return messages[errorType] || messages.INTERNAL_ERROR;
  }

  /**
   * Get helpful hint for error resolution
   */
  static getErrorHint(errorType) {
    const hints = {
      AUTH_ERROR: 'Verify MCP_AUTH_TOKEN is set correctly',
      VALIDATION_ERROR: 'Check the input format and required fields',
      NOT_FOUND: 'Ensure the file path is correct and file exists',
      PERMISSION_ERROR: 'Check file ownership and permissions',
      TIMEOUT_ERROR: 'The operation may be too complex, try simplifying',
      RATE_LIMIT: 'Wait a moment before making more requests'
    };

    return hints[errorType] || null;
  }

  /**
   * Generate unique request ID for error tracking
   */
  static generateRequestId() {
    return `ERR-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }
}

// Set production mode from environment
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export { IS_PRODUCTION };
