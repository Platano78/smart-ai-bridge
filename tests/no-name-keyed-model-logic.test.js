/**
 * @fileoverview REGRESSION GUARD: no behaviour may be derived from a model's NAME.
 *
 * A server reports structural facts only (chat template caps, modalities, context
 * size). It reports no model size and no semantic capability, so a regex on the
 * model id cannot be a "last-resort signal" for one — it is a fabrication that
 * mislabels every fine-tune, merge, and new release whose name happens to carry a
 * familiar word. This test fails if such a table, regex, or substring test comes
 * back into the files that resolve capability, speed, FIM, or workflow tier.
 *
 * WHAT THIS DOES NOT COVER:
 *   - Files outside GUARDED_FILES (handlers other than modify-file, the backend
 *     registry, docs, scripts).
 *   - Comments and JSDoc: they are stripped before scanning, so prose may name
 *     any model it likes. Only executable code is scanned.
 *   - BACKEND LANE names ('gemini', 'groq_llama', 'nvidia_deepseek', …) and
 *     SERVER types ('llama.cpp', 'ollama'): those identify a configured lane or a
 *     server product, not a model, and are removed before scanning.
 *   - Operator-declared per-model config (config.modelCapabilities), which is an
 *     exact id the operator wrote, never a pattern — it lives in config, not here.
 *   - Name-derived logic expressed without any of the literals below (e.g. a
 *     table loaded from a file at runtime).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The files this slice made agnostic. */
const GUARDED_FILES = [
  'src/utils/capability-matcher.js',
  'src/utils/model-discovery.js',
  'src/backends/local-adapter.js',
  'src/handlers/modify-file-handler.js',
  'src/intelligence/dual-workflow-manager.js'
];

/** Lane identifiers and server product names: not model names. */
const NOT_MODEL_NAMES =
  /'(?:nvidia_deepseek|nvidia_glm|groq_llama|openai_chatgpt|gemini|chatgpt|local|orchestrator|ollama|vllm|lmstudio)'|llama\.cpp/g;

/** Model families a name regex would key on. */
const MODEL_FAMILY =
  /\b(?:deepseek|qwen\d*|llama|codellama|mistral|codestral|starcoder|nemotron|cerebras|gemma|seed-?coder|claude|reap)\b/i;

/** "how big is it" read off the id: `includes('70b')`, `/(\d+)b/`, `13B`. */
const SIZE_FROM_NAME = /\b\d{1,4}\s*b\b|\(\\d\+\)\s*b|\\d\+\s*b/i;

/** Sentinel tokens belonging to one model family's FIM dialect. */
const FIM_SENTINEL = /fim[_▁](?:prefix|suffix|middle|begin|hole|end)|<PRE>|<SUF>|<MID>/i;

/** Remove comments and lane/server identifiers, keeping line numbers intact. */
function executableCode(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, lead) => lead + ' '.repeat(m.length - lead.length))
    .replace(NOT_MODEL_NAMES, m => ' '.repeat(m.length));
}

function offendingLines(file, pattern) {
  const source = readFileSync(path.join(ROOT, file), 'utf8');
  return executableCode(source)
    .split('\n')
    .map((line, i) => ({ line: i + 1, text: line }))
    .filter(({ text }) => pattern.test(text))
    .map(({ line, text }) => `${file}:${line}: ${text.trim()}`);
}

describe('no behaviour is derived from a model name', () => {
  for (const file of GUARDED_FILES) {
    it(`${file} keys nothing on a model family name`, () => {
      expect(offendingLines(file, MODEL_FAMILY)).toEqual([]);
    });

    it(`${file} never reads a parameter count off the id`, () => {
      expect(offendingLines(file, SIZE_FROM_NAME)).toEqual([]);
    });

    it(`${file} carries no model-family FIM sentinel tokens`, () => {
      expect(offendingLines(file, FIM_SENTINEL)).toEqual([]);
    });
  }

  it('fires when a name pattern is reintroduced', () => {
    const reintroduced = `
      const t = { 'qwen-32b': 15, 'llama-70b': 8 };
      if (modelId.includes('deepseek-r1')) return 'large';
      const m = modelId.match(/(\\d+)b/);
    `;
    expect(MODEL_FAMILY.test(executableCode(reintroduced))).toBe(true);
    expect(SIZE_FROM_NAME.test(executableCode(reintroduced))).toBe(true);
  });

  it('does not fire on comments, lane names or server types', () => {
    const benign = `
      // deepseek and qwen used to be keyed here, with a 70b special case
      /** starcoder sentinels <PRE> lived here */
      const lane = 'groq_llama';
      if (type === 'llama.cpp') return 'ollama';
    `;
    const code = executableCode(benign);
    expect(MODEL_FAMILY.test(code)).toBe(false);
    expect(SIZE_FROM_NAME.test(code)).toBe(false);
    expect(FIM_SENTINEL.test(code)).toBe(false);
  });
});
