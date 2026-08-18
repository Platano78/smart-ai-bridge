/**
 * Guard: every tool a doc tells users to call must actually exist.
 *
 * Twice now a doc has shipped instructions for a tool that had been removed —
 * `manage_conversation` (removed in v2.11.0) and `validate_changes` (removed back
 * in v2.5.0, but still documented with a full worked example years later). Both
 * were user-facing: anyone following them got "Unknown tool".
 *
 * The version guards in tests/integration.test.js check the tool COUNT and the
 * README title. Neither catches prose, which is where this class of rot lives.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { CORE_TOOL_DEFINITIONS } from '../src/tools/tool-definitions.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// CHANGELOG is exempt: it is a historical record and MUST keep naming tools that
// no longer exist, because it documents when they stopped existing.
const EXEMPT = new Set(['CHANGELOG.md']);

function trackedMarkdown() {
  return execSync("git ls-files '*.md'", { cwd: REPO_ROOT, encoding: 'utf-8' })
    .trim()
    .split('\n')
    .filter(f => f && !EXEMPT.has(f));
}

describe('documentation references only tools that exist', () => {
  it('every `@tool_name({` invocation in the docs names a real tool', () => {
    const real = new Set(CORE_TOOL_DEFINITIONS.map(t => t.name));
    const offenders = [];

    for (const file of trackedMarkdown()) {
      const text = readFileSync(join(REPO_ROOT, file), 'utf-8');
      // Matches the `@tool_name({` call style used throughout the docs.
      for (const match of text.matchAll(/@([a-z_]{3,40})\s*\(\{/g)) {
        const name = match[1];
        if (!real.has(name)) {
          const line = text.slice(0, match.index).split('\n').length;
          offenders.push(`${file}:${line} -> @${name}`);
        }
      }
    }

    expect(
      offenders,
      `Docs invoke tools that do not exist in CORE_TOOL_DEFINITIONS. A user ` +
      `following these gets "Unknown tool". Remove the example or point it at a ` +
      `real tool:\n  ${offenders.join('\n  ')}`
    ).toEqual([]);
  });
});

/**
 * Guard: every KEY a doc example passes must exist in that tool's schema.
 *
 * The guard above catches a doc naming a tool that does not exist. This one
 * catches the quieter failure: a doc naming an OPTION that does not exist.
 * Ajv runs with `strict: false` and the schemas set no `additionalProperties`,
 * so an unknown key is not rejected — it is silently ignored. A user follows
 * the example, sets the option, and nothing happens, with no error to explain
 * why. That is worse than a hard failure.
 */
describe('documentation examples only pass keys that exist in the schema', () => {
  it('every key in a documented tool call is a real schema property', () => {
    const schemas = Object.fromEntries(
      CORE_TOOL_DEFINITIONS.map(t => [t.name, t.schema?.properties || {}])
    );
    const offenders = [];

    for (const file of trackedMarkdown()) {
      const text = readFileSync(join(REPO_ROOT, file), 'utf-8');

      for (const match of text.matchAll(/@([a-z_]{3,40})\s*\(\{/g)) {
        const tool = match[1];
        if (!schemas[tool]) continue; // handled by the tool-name guard above

        // Walk to the matching close brace of the call's object literal.
        const open = match.index + match[0].length - 1;
        let depth = 0, end = -1;
        for (let j = open; j < text.length; j++) {
          if (text[j] === '{') depth++;
          else if (text[j] === '}' && --depth === 0) { end = j; break; }
        }
        if (end < 0) continue;

        const body = text.slice(open, end + 1);
        const line = text.slice(0, match.index).split('\n').length;

        // Indent-based descent. A key that opens an object or array pushes that
        // property's sub-schema (or its array items' sub-schema) as the context
        // for the more-indented keys beneath it.
        const stack = [{ indent: 0, props: schemas[tool], path: '' }];
        for (const raw of body.split('\n')) {
          const km = raw.match(/^(\s+)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/);
          if (!km) continue;
          const [, pad, key] = km;
          const indent = pad.length;

          while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
          const cur = stack[stack.length - 1];

          const def = cur.props?.[key];
          if (!def) {
            offenders.push(`${file}:${line} -> @${tool} passes '${cur.path}${key}'`);
          } else if (raw.includes('{') || raw.includes('[')) {
            stack.push({
              indent,
              props: def.properties || def.items?.properties || {},
              path: `${cur.path}${key}.`
            });
          }
        }
      }
    }

    expect(
      offenders,
      `Docs pass keys no schema declares. Ajv silently ignores unknown keys, so ` +
      `a user setting these gets no effect and no error:\n  ${offenders.join('\n  ')}`
    ).toEqual([]);
  });
});
