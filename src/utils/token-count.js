/**
 * @fileoverview Real token counting for capacity gates.
 * @module utils/token-count
 *
 * SAB's capacity limits are all denominated in characters, converted from
 * provider token limits at a flat 4 chars/token. That ratio only holds for
 * English/code-ish text — measured with tiktoken this varies from ~3.6
 * (minified JSON) to ~0.98 (CJK text, i.e. ~4x MORE tokens than assumed).
 * A CJK payload sized to "fit" a char limit can ship roughly 4x the tokens
 * the limit was derived from. This module measures tokens for real instead
 * of inferring them from string length.
 */

import { get_encoding } from 'tiktoken';

// Lazily-initialized, process-wide singleton encoder. tiktoken allocates
// WASM memory per Tiktoken instance; constructing one per call would mean
// either leaking that memory or having to free() after every single count.
// A single cached encoder, reused for the life of the process, avoids both
// — there is no per-request lifecycle to get wrong.
let encoder = null;
let encoderFailed = false;

function getEncoder() {
  if (encoder) return encoder;
  if (encoderFailed) return null;
  try {
    encoder = get_encoding('cl100k_base');
    return encoder;
  } catch {
    // e.g. WASM init failure. Never retry per-call — remember and fall
    // through to the conservative estimate for the rest of the process.
    encoderFailed = true;
    return null;
  }
}

/**
 * Conservative fallback used only when tiktoken is unavailable. Deliberately
 * ~1 char/token (over-estimates token count) rather than the repo's old
 * 4:1 assumption: an over-estimate causes a false refusal (annoying); an
 * under-estimate ships an oversized prompt (the bug this module fixes).
 * @param {string} text
 * @returns {number}
 */
function conservativeEstimate(text) {
  return text.length;
}

// cl100k_base's pre-tokenization regex is quadratic on long runs of highly
// repetitive text (measured: encoding a single repeated character scales
// from ~1s at 40K chars to 5+ minutes at 700K chars — a genuine pathological
// input, not just "large"). Encoding in fixed-size chunks instead of the
// whole string bounds the worst case to linear time regardless of content:
// each chunk's quadratic cost is capped by CHUNK_CHARS, so total cost scales
// with input length, not input length squared. Measured: a 1MB adversarial
// repeated-char string drops from minutes to ~1.4s; a 1MB normal-text string
// costs ~40ms more than encoding it whole. Splitting mid-token at a chunk
// boundary can only ever produce MORE tokens than a single encode (a token
// that would have spanned the boundary becomes two) — the same conservative,
// over-estimating direction as the rest of this module, never fewer.
const CHUNK_CHARS = 2000;

/**
 * Count tokens in `text` using tiktoken (cl100k_base), chunked to bound
 * worst-case cost on pathological input (see CHUNK_CHARS above). Never
 * throws — a counting failure (missing encoder, bad input, WASM error)
 * degrades to the conservative over-estimate instead.
 * @param {string} text
 * @returns {number}
 */
export function countTokens(text) {
  if (!text || typeof text !== 'string') return 0;

  const enc = getEncoder();
  if (!enc) return conservativeEstimate(text);

  try {
    let total = 0;
    for (let i = 0; i < text.length; i += CHUNK_CHARS) {
      total += enc.encode(text.slice(i, i + CHUNK_CHARS)).length;
    }
    return total;
  } catch {
    return conservativeEstimate(text);
  }
}
