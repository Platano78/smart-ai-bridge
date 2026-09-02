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

/**
 * F6: a caller-supplied backend name must be checked against the LIVE
 * registry at call time, never against a schema-baked closed set — a custom
 * seat (e.g. an operator's own `mb_worker`) has no fixed name SAB can ship
 * an enum for. Re-adding an `enum` to any backend-name field silently
 * reintroduces the bug this file is named after, so every field that names
 * a backend is walked here, not just `ask`'s.
 */
describe("backend-name fields carry no closed enum (F6 regression guard)", () => {
  const ask = CORE_TOOL_DEFINITIONS.find(t => t.name === 'ask');

  it("ask's model field accepts any string — no enum", () => {
    expect(ask).toBeTruthy();
    expect(ask.schema.properties.model).not.toHaveProperty('enum');
    expect(ask.schema.properties.model.type).toBe('string');
  });

  it("ask's force_backend field accepts any string — no enum", () => {
    expect(ask.schema.properties.force_backend).not.toHaveProperty('enum');
  });

  it("check_backend_health's backend field accepts any string — no enum", () => {
    const health = CORE_TOOL_DEFINITIONS.find(t => t.name === 'check_backend_health');
    expect(health.schema.properties.backend).not.toHaveProperty('enum');
  });

  it('every options.backend field across the tool definitions accepts any string — no enum', () => {
    const withOptionsBackend = CORE_TOOL_DEFINITIONS
      .filter(t => t.schema?.properties?.options?.properties?.backend);
    // The guard is worthless if nothing is actually being checked.
    expect(withOptionsBackend.length).toBeGreaterThan(1);

    for (const tool of withOptionsBackend) {
      const field = tool.schema.properties.options.properties.backend;
      expect(field, `${tool.name}.options.backend`).not.toHaveProperty('enum');
      expect(field.type, `${tool.name}.options.backend`).toBe('string');
    }
  });
});
