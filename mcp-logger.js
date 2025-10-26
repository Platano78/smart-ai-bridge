/**
 * MCP-Compliant Logger
 *
 * ALL output goes to stderr (console.error) to maintain MCP protocol compliance.
 * The MCP specification requires that stdout ONLY contains JSON-RPC messages.
 *
 * Environment Configuration:
 * - MCP_LOG_LEVEL: silent | error | warn | info | debug
 * - Default: info
 *
 * Usage:
 *   import { logger } from './mcp-logger.js';
 *   logger.debug('Debug message');
 *   logger.info('Info message');
 *   logger.warn('Warning message');
 *   logger.error('Error message');
 */

const LOG_LEVELS = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4
};

class MCPLogger {
  constructor() {
    // Read from environment, default to 'info' for production
    const envLevel = process.env.MCP_LOG_LEVEL || process.env.LOG_LEVEL || 'info';
    this.level = envLevel.toLowerCase();
    this.threshold = LOG_LEVELS[this.level] !== undefined ? LOG_LEVELS[this.level] : LOG_LEVELS.info;

    // Validate log level on startup
    if (LOG_LEVELS[this.level] === undefined) {
      console.error(`⚠️  Invalid log level '${envLevel}', defaulting to 'info'`);
      this.level = 'info';
      this.threshold = LOG_LEVELS.info;
    }
  }

  /**
   * Check if a message at the given level should be logged
   */
  _shouldLog(level) {
    return LOG_LEVELS[level] <= this.threshold;
  }

  /**
   * Internal logging method - ALWAYS uses console.error for MCP compliance
   */
  _log(level, ...args) {
    if (this._shouldLog(level)) {
      // Use console.error for MCP compliance (stderr)
      // This ensures we NEVER write to stdout
      console.error(...args);
    }
  }

  /**
   * Log error-level messages (always shown except in silent mode)
   */
  error(...args) {
    this._log('error', ...args);
  }

  /**
   * Log warning-level messages
   */
  warn(...args) {
    this._log('warn', ...args);
  }

  /**
   * Log info-level messages (default for production)
   */
  info(...args) {
    this._log('info', ...args);
  }

  /**
   * Log debug-level messages (verbose, for development)
   */
  debug(...args) {
    this._log('debug', ...args);
  }

  /**
   * Check if logger is in silent mode
   */
  isSilent() {
    return this.threshold === LOG_LEVELS.silent;
  }

  /**
   * Get current log level name
   */
  getLevel() {
    return this.level;
  }

  /**
   * Set log level programmatically
   */
  setLevel(level) {
    const normalizedLevel = level.toLowerCase();
    if (LOG_LEVELS[normalizedLevel] !== undefined) {
      this.level = normalizedLevel;
      this.threshold = LOG_LEVELS[normalizedLevel];
      return true;
    }
    return false;
  }
}

// Singleton instance
const logger = new MCPLogger();

// Log the current level on startup (unless silent)
if (!logger.isSilent()) {
  logger.debug(`📋 MCP Logger initialized (level: ${logger.getLevel()})`);
}

export { logger, MCPLogger, LOG_LEVELS };
