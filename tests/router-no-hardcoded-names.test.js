/**
 * @fileoverview REGRESSION GUARD: router.js's rule-based routing tier and
 * dynamic token budget must derive from capability/registry data, never a
 * hardcoded backend name.
 *
 *   1. MultiAIRouter#_applyRuleBasedRouting used to test
 *      `backends.nvidia_glm?.healthy` / `backends.nvidia_deepseek?.healthy`
 *      directly — an operator without those two names configured got a
 *      routing tier that could never fire, with no indication why.
 *   2. MultiAIRouter#calculateDynamicTokenLimit chose between two hardcoded
 *      numbers by testing `backend === 'local'`.
 */
import { describe, it, expect } from 'vitest';
import { MultiAIRouter } from '../src/router.js';

/** A minimal registry-shaped stub: checkHealth/getUsableBackends/
 * getFallbackChain/getBackend, no adapters, no network. */
function makeRouterRegistry({ healthy, usable, chain, backends }) {
  return {
    checkHealth: async () => healthy,
    getUsableBackends: () => usable,
    getFallbackChain: () => chain,
    getBackend: (name) => backends[name] || null
  };
}

describe('MultiAIRouter#_applyRuleBasedRouting has no hardcoded backend name', () => {
  it('prefers a custom-named, code-capable, healthy+usable lane for a code task', async () => {
    const registry = makeRouterRegistry({
      healthy: { acme_coder: { healthy: true } },
      usable: ['acme_coder'],
      chain: ['acme_coder'],
      backends: { acme_coder: { capabilities: ['code_specialized'] } }
    });
    const router = new MultiAIRouter(registry);

    const pick = await router._applyRuleBasedRouting({ complexity: 'simple', taskType: 'code' });
    expect(pick).toBe('acme_coder');
  });

  it('prefers a custom-named, deep-reasoning-capable lane for a complex task', async () => {
    const registry = makeRouterRegistry({
      healthy: { acme_thinker: { healthy: true } },
      usable: ['acme_thinker'],
      chain: ['acme_thinker'],
      backends: { acme_thinker: { capabilities: ['deep_reasoning'] } }
    });
    const router = new MultiAIRouter(registry);

    const pick = await router._applyRuleBasedRouting({ complexity: 'complex', taskType: 'general' });
    expect(pick).toBe('acme_thinker');
  });

  it('returns null when nothing usable matches the desired capability', async () => {
    const registry = makeRouterRegistry({
      healthy: { acme_general: { healthy: true } },
      usable: ['acme_general'],
      chain: ['acme_general'],
      backends: { acme_general: { capabilities: ['general'] } }
    });
    const router = new MultiAIRouter(registry);

    const pick = await router._applyRuleBasedRouting({ complexity: 'complex', taskType: 'code' });
    expect(pick).toBeNull();
  });

  it('never considers a healthy backend that is not usable (e.g. no resolvable key)', async () => {
    const registry = makeRouterRegistry({
      healthy: { unkeyed_coder: { healthy: true } },
      usable: [], // not usable, despite reporting healthy
      chain: ['unkeyed_coder'],
      backends: { unkeyed_coder: { capabilities: ['code_specialized'] } }
    });
    const router = new MultiAIRouter(registry);

    const pick = await router._applyRuleBasedRouting({ complexity: 'simple', taskType: 'code' });
    expect(pick).toBeNull();
  });
});

describe('MultiAIRouter#calculateDynamicTokenLimit has no name-based two-way split', () => {
  it('returns a sane, positive budget for a non-local backend', () => {
    const registry = { getBackend: (name) => (name === 'acme_cloud' ? { context_limit: 32768 } : null) };
    const router = new MultiAIRouter(registry);

    const budget = router.calculateDynamicTokenLimit('please implement this feature in detail', 'acme_cloud');
    expect(budget).toBeGreaterThan(0);
    expect(Number.isFinite(budget)).toBe(true);
  });

  it('degrades to a single flat default for a backend with no configured context_limit', () => {
    const registry = { getBackend: () => null };
    const router = new MultiAIRouter(registry);

    const budget = router.calculateDynamicTokenLimit('please implement this feature in detail', 'unknown_backend');
    expect(budget).toBeGreaterThan(0);
  });
});
