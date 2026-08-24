/**
 * @fileoverview Every backend name a caller can legitimately type must resolve
 * to a backend that is actually registered.
 *
 * `openai` was declared in the `ask` tool's `model` enum but had no entry in
 * FRIENDLY_NAME_MAP, so it resolved to nothing while the real identifier is
 * `openai_chatgpt`. The guard that would have caught it is the enum-driven one
 * below: it reads the shipped enum rather than a hand-copied list, so a value
 * added to the enum without a matching alias fails here.
 */
import { describe, it, expect } from 'vitest';
import { FRIENDLY_NAME_MAP, loadBackendsFromConfig } from '../src/backends/backend-registry.js';
import { CORE_TOOL_DEFINITIONS } from '../src/tools/tool-definitions.js';

/** Registered backend identifiers, from the shipped backends.json. */
const registered = new Set(Object.keys(loadBackendsFromConfig()));

/** Resolve exactly the way selectBackend does: `FRIENDLY_NAME_MAP[x] || x`. */
const resolve = name => FRIENDLY_NAME_MAP[name] || name;

describe('FRIENDLY_NAME_MAP', () => {
  it('every alias resolves to a registered backend identifier', () => {
    const unresolved = Object.entries(FRIENDLY_NAME_MAP)
      .filter(([, target]) => !registered.has(target))
      .map(([alias, target]) => `${alias} -> ${target}`);
    expect(unresolved).toEqual([]);
  });

  it('maps openai to the openai_chatgpt identifier', () => {
    expect(resolve('openai')).toBe('openai_chatgpt');
    expect(registered.has('openai_chatgpt')).toBe(true);
  });

  it('leaves the full identifier openai_chatgpt resolving to itself', () => {
    expect(resolve('openai_chatgpt')).toBe('openai_chatgpt');
  });
});

describe("the ask tool's model enum", () => {
  const ask = CORE_TOOL_DEFINITIONS.find(t => t.name === 'ask');
  const enumValues = ask?.schema?.properties?.model?.enum ?? [];

  it('is present and non-empty (the guard is worthless if the enum moved)', () => {
    expect(ask).toBeTruthy();
    expect(enumValues.length).toBeGreaterThan(1);
    expect(enumValues).toContain('auto');
  });

  it('every value except auto resolves to a real registered backend', () => {
    const broken = enumValues
      .filter(v => v !== 'auto')
      .filter(v => !registered.has(resolve(v)))
      .map(v => `${v} -> ${resolve(v)}`);
    expect(broken).toEqual([]);
  });
});
