/**
 * DYNAMIC TOKEN MANAGER v1.0.0
 * Smart token allocation system for AI backends
 * 
 * FEATURES:
 * - Unity generation detection (16K tokens)
 * - Complex request detection (8K tokens)
 * - Simple request optimization (2K tokens)
 * - Backend-aware token limits
 * - Automatic fallback token calculation
 */

export class DynamicTokenManager {
  constructor(tokenConfig = {}) {
    // Token configuration with smart defaults
    this.tokenConfig = {
      // Backend maximum capacities
      local_max: tokenConfig.local_max || 65536,
      gemini_max: tokenConfig.gemini_max || 32768,
      nvidia_deepseek_max: tokenConfig.nvidia_deepseek_max || 8192,
      nvidia_qwen_max: tokenConfig.nvidia_qwen_max || 32768,
      
      // Dynamic scaling thresholds
      unity_generation_tokens: tokenConfig.unity_generation_tokens || 16384,
      complex_request_tokens: tokenConfig.complex_request_tokens || 8192,
      simple_request_tokens: tokenConfig.simple_request_tokens || 2048,
      fallback_tokens: tokenConfig.fallback_tokens || 4096
    };
  }

  /**
   * Calculate optimal token limit based on request complexity
   * @param {string} prompt - The user prompt to analyze
   * @param {string} endpointKey - Backend identifier (local, gemini, nvidia_deepseek, nvidia_qwen)
   * @param {object} options - Additional options
   * @param {number} options.maxTokens - Override maximum tokens
   * @param {boolean} options.enableLogging - Enable console logging (default: true)
   * @returns {number} Calculated token limit
   */
  calculateDynamicTokenLimit(prompt, endpointKey, options = {}) {
    const tokenCount = this.estimateTokens(prompt);
    const enableLogging = options.enableLogging !== false;
    
    // Unity detection - Maximum tokens for game development
    const isUnityGeneration = /unity|monobehaviour|gameobject|transform|rigidbody|collider|animation|shader|script.*generation|generate.*unity|create.*unity.*script/i.test(prompt);
    const isComplexGeneration = /generate|create|build|write.*script|complete.*implementation|full.*code|entire.*system/i.test(prompt);
    const isLargeCodebase = tokenCount > 8000 || /multi.*file|entire.*project|complete.*system/i.test(prompt);
    
    let targetTokens;
    
    // PRIORITY 1: Unity generations get MAXIMUM tokens
    if (isUnityGeneration) {
      targetTokens = this.tokenConfig.unity_generation_tokens;
      if (enableLogging) {
        console.error(`🎮 Dynamic Token Manager: Unity generation detected - allocating ${targetTokens} tokens`);
      }
    }
    // PRIORITY 2: Complex code generation
    else if (isComplexGeneration || isLargeCodebase) {
      targetTokens = this.tokenConfig.complex_request_tokens;
      if (enableLogging) {
        console.error(`🔥 Dynamic Token Manager: Complex generation detected - allocating ${targetTokens} tokens`);
      }
    }
    // PRIORITY 3: Simple requests stay efficient
    else if (tokenCount < 1000 && !isComplexGeneration) {
      targetTokens = this.tokenConfig.simple_request_tokens;
      if (enableLogging) {
        console.error(`⚡ Dynamic Token Manager: Simple request detected - optimizing with ${targetTokens} tokens`);
      }
    }
    // PRIORITY 4: Fallback for medium complexity
    else {
      targetTokens = this.tokenConfig.fallback_tokens;
      if (enableLogging) {
        console.error(`🎯 Dynamic Token Manager: Standard request - using ${targetTokens} tokens`);
      }
    }
    
    // Respect backend limits while maximizing output
    const maxAllowed = this.getBackendLimit(endpointKey);
    const finalTokens = Math.min(targetTokens, maxAllowed, options.maxTokens || Infinity);
    
    if (enableLogging) {
      console.error(`🚀 Dynamic Token Manager: Final allocation: ${finalTokens} (requested: ${targetTokens}, limit: ${maxAllowed})`);
    }
    
    return finalTokens;
  }
  
  /**
   * Get maximum token limit for a specific backend
   * @param {string} endpointKey - Backend identifier
   * @returns {number} Maximum tokens for the backend
   */
  getBackendLimit(endpointKey) {
    const key = endpointKey.toLowerCase();
    
    if (key.includes('local') || key.includes('qwen2.5')) {
      return this.tokenConfig.local_max;
    }
    if (key.includes('gemini')) {
      return this.tokenConfig.gemini_max;
    }
    if (key.includes('deepseek')) {
      return this.tokenConfig.nvidia_deepseek_max;
    }
    if (key.includes('qwen')) {
      return this.tokenConfig.nvidia_qwen_max;
    }
    
    // Default fallback
    return this.tokenConfig.fallback_tokens;
  }
  
  /**
   * Estimate token count from text length
   * @param {string} text - Text to estimate
   * @returns {number} Estimated token count
   */
  estimateTokens(text) {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
  
  /**
   * Detect if request is Unity-related
   * @param {string} prompt - The prompt to analyze
   * @returns {boolean} True if Unity-related
   */
  isUnityRequest(prompt) {
    return /unity|monobehaviour|gameobject|transform|rigidbody|collider|animation|shader|script.*generation|generate.*unity|create.*unity.*script/i.test(prompt);
  }
  
  /**
   * Detect if request is complex
   * @param {string} prompt - The prompt to analyze
   * @returns {boolean} True if complex
   */
  isComplexRequest(prompt) {
    const tokenCount = this.estimateTokens(prompt);
    const isComplexGeneration = /generate|create|build|write.*script|complete.*implementation|full.*code|entire.*system/i.test(prompt);
    const isLargeCodebase = tokenCount > 8000 || /multi.*file|entire.*project|complete.*system/i.test(prompt);
    return isComplexGeneration || isLargeCodebase;
  }
  
  /**
   * Get token configuration for inspection
   * @returns {object} Current token configuration
   */
  getConfig() {
    return { ...this.tokenConfig };
  }
  
  /**
   * Update token configuration
   * @param {object} updates - Configuration updates
   */
  updateConfig(updates) {
    this.tokenConfig = { ...this.tokenConfig, ...updates };
  }
}

// Export singleton instance with default configuration
export const dynamicTokenManager = new DynamicTokenManager();

export default DynamicTokenManager;
