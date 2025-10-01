/**
 * Input Validation Module
 * Comprehensive validation for all tool inputs
 */

export class InputValidator {

  /**
   * Validate string input
   * @param {*} value - Value to validate
   * @param {object} options - Validation options
   * @returns {string} - Validated string
   */
  static validateString(value, options = {}) {
    const {
      required = false,
      minLength = 0,
      maxLength = 100000,
      allowEmpty = true,
      pattern = null,
      name = 'field'
    } = options;

    // Required check
    if (required && (value === undefined || value === null)) {
      throw new Error(`${name} is required`);
    }

    // Null/undefined handling
    if (value === null || value === undefined) {
      return allowEmpty ? '' : null;
    }

    // Type check
    if (typeof value !== 'string') {
      throw new Error(`${name} must be a string, got ${typeof value}`);
    }

    // Length validation
    if (value.length < minLength) {
      throw new Error(`${name} must be at least ${minLength} characters`);
    }
    if (value.length > maxLength) {
      throw new Error(`${name} must be at most ${maxLength} characters`);
    }

    // Pattern validation
    if (pattern && !pattern.test(value)) {
      throw new Error(`${name} format is invalid`);
    }

    return value;
  }

  /**
   * Validate integer input
   */
  static validateInteger(value, options = {}) {
    const {
      required = false,
      min = Number.MIN_SAFE_INTEGER,
      max = Number.MAX_SAFE_INTEGER,
      name = 'field'
    } = options;

    if (required && (value === undefined || value === null)) {
      throw new Error(`${name} is required`);
    }

    if (value === null || value === undefined) {
      return null;
    }

    const num = parseInt(value, 10);
    if (isNaN(num)) {
      throw new Error(`${name} must be a valid integer`);
    }

    if (num < min || num > max) {
      throw new Error(`${name} must be between ${min} and ${max}`);
    }

    return num;
  }

  /**
   * Validate boolean input
   */
  static validateBoolean(value, options = {}) {
    const { required = false, name = 'field' } = options;

    if (required && value === undefined) {
      throw new Error(`${name} is required`);
    }

    if (value === undefined || value === null) {
      return false;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    // Accept string representations
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      if (lower === 'true' || lower === '1' || lower === 'yes') return true;
      if (lower === 'false' || lower === '0' || lower === 'no') return false;
    }

    throw new Error(`${name} must be a boolean`);
  }

  /**
   * Validate array input
   */
  static validateArray(value, options = {}) {
    const {
      required = false,
      minLength = 0,
      maxLength = 1000,
      itemValidator = null,
      name = 'field'
    } = options;

    if (required && !value) {
      throw new Error(`${name} is required`);
    }

    if (!value) return [];

    if (!Array.isArray(value)) {
      throw new Error(`${name} must be an array`);
    }

    if (value.length < minLength || value.length > maxLength) {
      throw new Error(`${name} must have between ${minLength} and ${maxLength} items`);
    }

    // Validate each item
    if (itemValidator) {
      return value.map((item, index) => {
        try {
          return itemValidator(item);
        } catch (error) {
          throw new Error(`${name}[${index}]: ${error.message}`);
        }
      });
    }

    return value;
  }

  /**
   * Validate object input
   */
  static validateObject(value, schema, name = 'object') {
    if (!value || typeof value !== 'object') {
      throw new Error(`${name} must be an object`);
    }

    const validated = {};

    for (const [key, validator] of Object.entries(schema)) {
      try {
        validated[key] = validator(value[key]);
      } catch (error) {
        throw new Error(`${name}.${key}: ${error.message}`);
      }
    }

    return validated;
  }

  /**
   * Validate enum value
   */
  static validateEnum(value, validValues, options = {}) {
    const { required = false, name = 'field' } = options;

    if (required && !value) {
      throw new Error(`${name} is required`);
    }

    if (!value) return null;

    if (!validValues.includes(value)) {
      throw new Error(`${name} must be one of: ${validValues.join(', ')}`);
    }

    return value;
  }

  /**
   * Sanitize string for safe output
   */
  static sanitizeString(value) {
    if (typeof value !== 'string') return value;

    // Remove null bytes
    return value.replace(/\0/g, '')
      // Remove control characters except newlines/tabs
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }
}
