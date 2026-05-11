/**
 * Shared LLM JSON Parser Module
 * Extracted from analyze-file-handler.js (commit c4db442) and generalized.
 * Robust parsing pipeline for extracting structured JSON from LLM responses.
 * Handles: markdown fences, code with braces, truncated output, prose preambles, <think> tags.
 */

/**
 * Strip common LLM wrapper artifacts from response text.
 * @param {string} text - Raw LLM response
 * @returns {string} Cleaned text
 */
function stripLLMWrappers(text) {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text;
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  cleaned = cleaned.replace(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/g, '$1').trim();
  return cleaned;
}

/**
 * Extract first balanced JSON object from text using brace counting.
 * Handles code snippets with braces inside string values.
 * @param {string} text - Raw LLM response text
 * @returns {string|null} Extracted JSON string or null
 */
function extractBalancedJSON(text) {
  const cleaned = stripLLMWrappers(text);
  const startIdx = cleaned.indexOf('{');
  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let prevChar = '';

  for (let i = startIdx; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === '"' && prevChar !== '\\') {
      inString = !inString;
    } else if (!inString) {
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          return cleaned.substring(startIdx, i + 1);
        }
      }
    }
    prevChar = ch;
  }
  return null;
}

/**
 * Extract first balanced JSON array from text using bracket counting.
 * @param {string} text - Raw LLM response text
 * @returns {string|null} Extracted JSON array string or null
 */
function extractBalancedJSONArray(text) {
  const cleaned = stripLLMWrappers(text);
  const startIdx = cleaned.indexOf('[');
  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let prevChar = '';

  for (let i = startIdx; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === '"' && prevChar !== '\\') {
      inString = !inString;
    } else if (!inString) {
      if (ch === '[') depth++;
      else if (ch === ']') {
        depth--;
        if (depth === 0) {
          return cleaned.substring(startIdx, i + 1);
        }
      }
    }
    prevChar = ch;
  }
  return null;
}

/**
 * Recover individual fields via regex when JSON.parse fails (truncation).
 * Parameterized by field specs so each caller defines its own expected schema.
 * @param {string} text - Raw or partially parsed text
 * @param {Object<string,string>} fieldSpecs - Map of field name to type: 'string'|'number'|'array'
 * @returns {Object|null} Recovered fields or null if nothing found
 */
function recoverPartialJSON(text, fieldSpecs) {
  if (!text || typeof text !== 'string' || !fieldSpecs) return null;

  const result = {};
  let fieldsFound = 0;

  for (const [field, type] of Object.entries(fieldSpecs)) {
    if (type === 'string') {
      const match = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 's').exec(text);
      if (match) {
        let val = match[1]
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
        if (val.length > 100) {
          const lastSentence = val.match(/^([\s\S]*[.!?])\s/);
          if (lastSentence) val = lastSentence[1];
        }
        result[field] = val;
        fieldsFound++;
      }
    } else if (type === 'number') {
      const match = new RegExp(`"${field}"\\s*:\\s*([\\d.]+)`).exec(text);
      if (match) {
        result[field] = parseFloat(match[1]);
        fieldsFound++;
      }
    } else if (type === 'array') {
      const fieldStart = text.indexOf(`"${field}"`);
      if (fieldStart !== -1) {
        const bracketStart = text.indexOf('[', fieldStart);
        if (bracketStart !== -1) {
          const items = [];
          const itemRegex = /"((?:[^"\\]|\\.)*)"/g;
          const searchRange = text.substring(bracketStart + 1, bracketStart + 50000);
          let m;
          while ((m = itemRegex.exec(searchRange)) !== null) {
            const preceding = searchRange.substring(0, m.index);
            if (preceding.includes(']')) break;
            const val = m[1]
              .replace(/\\n/g, '\n')
              .replace(/\\"/g, '"')
              .replace(/\\\\/g, '\\');
            if (val.length > 3) items.push(val);
          }
          if (items.length > 0) {
            result[field] = items;
            fieldsFound++;
          }
        }
      }
    }
  }

  if (fieldsFound === 0) return null;
  return result;
}

/**
 * Full parsing pipeline for LLM JSON responses.
 * Stage 1: extractBalancedJSON -> JSON.parse
 * Stage 2: recoverPartialJSON (field-level regex recovery)
 * Stage 3: Returns null (caller handles prose fallback)
 * @param {string} text - Raw LLM response
 * @param {Object<string,string>} fieldSpecs - Field specs for recovery
 * @returns {Object|null} Parsed object or null
 */
function parseLLMJSON(text, fieldSpecs) {
  if (!text || typeof text !== 'string') return null;

  const jsonStr = extractBalancedJSON(text);
  if (jsonStr) {
    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      if (fieldSpecs) {
        const recovered = recoverPartialJSON(jsonStr, fieldSpecs);
        if (recovered) return recovered;
      }
    }
  }

  // Retry path — handles truncated reasoning-first responses (qwen3/glm/deepseek-r1 default
  // thinking burns the token budget, </think> never arrives, raw text is just prose).
  // Trigger ONLY when no </think> exists anywhere AND the first attempt found no balanced
  // JSON. Strip from the unclosed <think> to EOS and retry extraction. This is safe because:
  //   - If model legitimately wrote "<think>" as a string literal inside JSON, the first
  //     attempt already extracted it (extractBalancedJSON ignores tag-shaped text inside
  //     string values via its quote-aware scan).
  //   - If model emitted JSON inside an unclosed <think> block, the first attempt found it.
  //   - Only the pure "all reasoning, no answer" case reaches this retry.
  if (!jsonStr && /<think>/i.test(text) && !/<\/think>/i.test(text)) {
    const cutoff = text.search(/<think>/i);
    const stripped = text.substring(0, cutoff).trim();
    if (stripped) {
      const retryJson = extractBalancedJSON(stripped);
      if (retryJson) {
        try {
          return JSON.parse(retryJson);
        } catch (e) {
          if (fieldSpecs) {
            const recovered = recoverPartialJSON(retryJson, fieldSpecs);
            if (recovered) return recovered;
          }
        }
      }
    }
  }

  if (fieldSpecs) {
    const recovered = recoverPartialJSON(text, fieldSpecs);
    if (recovered) return recovered;
  }

  return null;
}

export {
  stripLLMWrappers,
  extractBalancedJSON,
  extractBalancedJSONArray,
  recoverPartialJSON,
  parseLLMJSON,
};
