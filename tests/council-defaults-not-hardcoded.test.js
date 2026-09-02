/**
 * @fileoverview REGRESSION GUARD: CouncilConfigManager's default topic
 * backend rosters must adapt to what is configured, never a hardcoded
 * roster of three cloud backend names.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BackendRegistry } from '../src/backends/backend-registry.js';
import {
  CouncilConfigManager,
  setBackendRegistry,
  getEffectiveBackends,
  getActiveBackends
} from '../src/config/council-config-manager.js';

function backendRow(name, overrides = {}) {
  return { name, type: name, enabled: true, priority: 1, description: '', config: {}, ...overrides };
}

describe('council defaults adapt to what is configured', () => {
  // getUsableBackends() (reached via deriveDefaultBackendsForTopic) requires a
  // keyed provider to have a PRESENT key — a pure presence check, no network,
  // no validation. This env is not guaranteed to have GROQ_API_KEY set (and
  // per AGENTS.md rule 4, no test may require a real key), so inject a fake
  // one for the duration of the test that needs it and restore whatever was
  // there before, rather than skip the scenario it exists to cover.
  let priorGroqKey;
  beforeEach(() => { priorGroqKey = process.env.GROQ_API_KEY; process.env.GROQ_API_KEY = 'test-fake-key'; });
  afterEach(() => {
    setBackendRegistry(null);
    if (priorGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = priorGroqKey;
  });

  it('an operator with only groq configured gets council topic defaults naming groq, not absent backends', () => {
    const registry = new BackendRegistry({ autoInitialize: false });
    registry.backends.set('groq_llama', backendRow('groq_llama', { type: 'groq' }));
    setBackendRegistry(registry);

    const manager = new CouncilConfigManager();
    // Simulate "not operator-customized" for this topic regardless of what
    // might already be persisted on disk in this environment.
    manager.config.topics.general.backends = [];

    const backends = manager.getBackendsForTopic('general');
    expect(backends).toEqual(['groq_llama']);
  });

  it('an operator-customized (non-empty) roster always wins over derivation', () => {
    const registry = new BackendRegistry({ autoInitialize: false });
    registry.backends.set('groq_llama', backendRow('groq_llama', { type: 'groq' }));
    registry.backends.set('gemini', backendRow('gemini', { type: 'gemini' }));
    setBackendRegistry(registry);

    const manager = new CouncilConfigManager();
    manager.config.topics.general.backends = ['gemini']; // operator explicitly chose this

    expect(manager.getBackendsForTopic('general')).toEqual(['gemini']);
  });

  it('a custom-named backend is not rejected by VALID_BACKENDS / getEffectiveBackends', () => {
    const registry = new BackendRegistry({ autoInitialize: false });
    registry.backends.set('acme_custom_cloud', backendRow('acme_custom_cloud', { type: 'groq', enabled: true }));
    setBackendRegistry(registry);

    expect(getEffectiveBackends()).toContain('acme_custom_cloud');
    expect(getActiveBackends()).toContain('acme_custom_cloud');
  });
});
