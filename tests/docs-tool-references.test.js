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
