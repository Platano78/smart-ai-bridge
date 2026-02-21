/**
 * @file SelfReflectionConfig module for the SAB dual-iterate system.
 * @description Manages configuration for self-reflection based on model parameters.
 */

/**
 * Enum representing different model tiers based on parameter count.
 * @enum {string}
 */
const ModelTier = {
  LARGE: 'large',
  MEDIUM: 'medium',
  SMALL: 'small'
};

/**
 * Class for managing self-reflection configuration based on model parameters.
 */
class SelfReflectionConfig {
  /**
   * Creates a new SelfReflectionConfig instance.
   * @param {Object} [options] - Configuration options
   * @param {number} [options.smallModelThreshold=7] - Threshold in billions for small/medium model distinction
   * @param {number} [options.mediumModelThreshold=14] - Threshold in billions for medium/large model distinction
   */
  constructor(options = {}) {
    this.smallModelThreshold = options.smallModelThreshold || 7;
    this.mediumModelThreshold = options.mediumModelThreshold || 14;
  }

  /**
   * Parses model ID string to extract parameter count.
   * @param {string} modelId - The model identifier (e.g., "llama-7b", "gpt-14b")
   * @returns {number|null} Parameter count in billions or null if not found
   */
  parseParameterCount(modelId) {
    if (!modelId) return null;

    const match = modelId.match(/(\d+)b/i);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Determines model tier based on parameter count.
   * @param {number} paramCount - Parameter count in billions
   * @returns {ModelTier} The model tier
   */
  detectModelTier(paramCount) {
    if (paramCount < this.smallModelThreshold) {
      return ModelTier.SMALL;
    } else if (paramCount < this.mediumModelThreshold) {
      return ModelTier.MEDIUM;
    } else {
      return ModelTier.LARGE;
    }
  }

  /**
   * Generates self-reflection configuration based on model ID.
   * @param {string} modelId - The model identifier
   * @returns {Object} Configuration object with enabled, maxTurns, and confidenceThreshold
   */
  getConfig(modelId) {
    const paramCount = this.parseParameterCount(modelId);

    if (paramCount === null) {
      // If we can't determine parameter count, default to medium model behavior
      return {
        enabled: true,
        maxTurns: 2,
        confidenceThreshold: 0.8
      };
    }

    const tier = this.detectModelTier(paramCount);

    switch (tier) {
      case ModelTier.SMALL:
        return {
          enabled: false,
          maxTurns: 0,
          confidenceThreshold: 1.0
        };

      case ModelTier.MEDIUM:
        return {
          enabled: true,
          maxTurns: 2,
          confidenceThreshold: 0.8
        };

      case ModelTier.LARGE:
        return {
          enabled: true,
          maxTurns: 3,
          confidenceThreshold: 0.7
        };

      default:
        // Fallback configuration
        return {
          enabled: true,
          maxTurns: 2,
          confidenceThreshold: 0.8
        };
    }
  }
}

export { SelfReflectionConfig, ModelTier };
