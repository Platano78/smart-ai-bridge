// json-sanitizer.js
// JSON compliance utility for MCP server responses
// Removes emojis and ensures valid JSON structure for Claude Desktop compatibility

/**
 * Sanitizes text content to ensure JSON compliance
 * Removes all emoji characters that cause JSON parsing failures in Claude Desktop
 * @param {string|object} content - Content to sanitize
 * @returns {string} - Sanitized content safe for JSON responses
 */
function sanitizeForJSON(content) {
  // For non-string types (objects, arrays, numbers, booleans), return as-is
  // They are already JSON-safe and don't need emoji sanitization
  if (typeof content !== 'string') {
    if (content !== null && typeof content === 'object') {
      return content;
    }
    content = String(content);
  }

  return content
    // Remove emoji characters that break JSON parsing
    .replace(/⚠️|🎯|🏗️|⚙️|🚀|📊|✅|❌|🔍|🧠|⚡|【≽ܫ≼】/g, '')
    // Remove extra whitespace from emoji removal
    .replace(/\s+/g, ' ')
    // Clean up multiple newlines
    .replace(/\n\s*\n/g, '\n')
    // Trim leading/trailing whitespace
    .trim();
}

/**
 * Creates MCP-compliant response object with sanitized content
 * @param {string} content - Response content
 * @param {boolean} isError - Whether this is an error response
 * @returns {object} - MCP-compliant response object
 */
function createMCPResponse(content, isError = false) {
  const sanitized = sanitizeForJSON(content);
  
  if (isError) {
    return {
      content: [{
        type: "text",
        text: `Error: ${sanitized}`
      }],
      isError: true
    };
  }
  
  return {
    content: [{
      type: "text", 
      text: sanitized
    }]
  };
}

/**
 * Validates that a response object is JSON-compliant
 * @param {object} response - Response object to validate
 * @returns {boolean} - True if JSON-compliant
 */
function validateJSONResponse(response) {
  try {
    JSON.stringify(response);
    return true;
  } catch (error) {
    console.error('JSON validation failed:', error.message);
    return false;
  }
}

export {
  sanitizeForJSON,
  createMCPResponse,
  validateJSONResponse
};