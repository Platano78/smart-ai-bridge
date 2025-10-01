/**
 * Authentication & Authorization Manager
 * Provides MCP client authentication and tool-level access control
 */

import crypto from 'crypto';

export class AuthManager {
  constructor() {
    // Token-based authentication
    this.validTokens = new Set();
    this.tokenMetadata = new Map();

    // Tool-level permissions
    this.toolPermissions = new Map();

    // Initialize with environment-based master token
    this.initializeMasterToken();
  }

  /**
   * Initialize master authentication token from environment
   */
  initializeMasterToken() {
    const masterToken = process.env.MCP_AUTH_TOKEN;

    if (masterToken && masterToken !== 'your-secure-token-here') {
      this.validTokens.add(masterToken);
      this.tokenMetadata.set(masterToken, {
        type: 'master',
        created: new Date(),
        permissions: ['*'] // All tools
      });
      console.log('✅ Master authentication token configured');
    } else {
      console.warn('⚠️  No MCP_AUTH_TOKEN set - authentication disabled (development only!)');
    }
  }

  /**
   * Generate a new authentication token
   * @param {string[]} permissions - List of allowed tool names (or ['*'] for all)
   * @returns {string} - Authentication token
   */
  generateToken(permissions = ['*']) {
    const token = crypto.randomBytes(32).toString('hex');
    this.validTokens.add(token);
    this.tokenMetadata.set(token, {
      type: 'generated',
      created: new Date(),
      permissions
    });
    return token;
  }

  /**
   * Validate authentication token
   * @param {string} token - Token to validate
   * @returns {boolean}
   */
  isValidToken(token) {
    if (!token) return this.validTokens.size === 0; // Allow if no auth configured
    return this.validTokens.has(token);
  }

  /**
   * Check if token has permission for specific tool
   * @param {string} token - Authentication token
   * @param {string} toolName - Tool name to check
   * @returns {boolean}
   */
  hasToolPermission(token, toolName) {
    // If no auth configured, allow all
    if (this.validTokens.size === 0) return true;

    // If no token provided, deny
    if (!token) return false;

    const metadata = this.tokenMetadata.get(token);
    if (!metadata) return false;

    // Check permissions
    return metadata.permissions.includes('*') ||
           metadata.permissions.includes(toolName);
  }

  /**
   * Revoke authentication token
   * @param {string} token - Token to revoke
   */
  revokeToken(token) {
    this.validTokens.delete(token);
    this.tokenMetadata.delete(token);
  }

  /**
   * Get authentication statistics
   */
  getStats() {
    return {
      totalTokens: this.validTokens.size,
      authEnabled: this.validTokens.size > 0,
      tokens: Array.from(this.tokenMetadata.entries()).map(([token, meta]) => ({
        token: token.substring(0, 8) + '...',
        type: meta.type,
        created: meta.created,
        permissions: meta.permissions
      }))
    };
  }
}

// Singleton instance
export const authManager = new AuthManager();
