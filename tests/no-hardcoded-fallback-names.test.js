/**
 * @fileoverview REGRESSION GUARD: three more decision paths must derive from
 * what the operator actually configured, never a hardcoded backend name or
 * a per-name guess.
 *
 *   1. BackendRegistry#selectBackend's 'auto' default (backend-registry.js)
 *      used to hardcode 'nvidia_glm' for large content and 'local' otherwise.
 *   2. council-handler.js's DEFAULT_COUNCIL_BACKENDS was a static roster.
 *   3. base-handler.js's estimateBackendSpeed carried a per-backend number
 *      table with a dead key ('chatgpt', which no backend is ever actually
 *      named — the real id is 'openai_chatgpt'), so the real backend fell
 *      through to the same default anyway.
 */
import { describe, it, expect } from 'vitest';
import { BackendRegistry } from '../src/backends/backend-registry.js';
import { getDefaultCouncilBackends, CouncilHandler } from '../src/handlers/council-handler.js';
import { AskHandler } from '../src/handlers/ask-handler.js';

/** A BackendRegistry with autoInitialize off, so tests control exactly what
 * is registered instead of reading the real backends.json / network. */
function makeRegistry() {
  return new BackendRegistry({ autoInitialize: false });
}

describe('BackendRegistry#selectBackend never names an unconfigured backend', () => {
  it('with ONLY groq configured, auto-routing returns groq for small content', () => {
    const registry = makeRegistry();
    registry.register('groq_llama', { type: 'groq', enabled: true, priority: 1, config: { apiKey: 'test-groq-key' } });

    const result = registry.selectBackend('auto', { contentLength: 100 });

    expect(result.backend).toBe('groq_llama');
  });

  it('with ONLY groq configured, auto-routing returns groq for large content (not nvidia_glm, not local)', () => {
    const registry = makeRegistry();
    registry.register('groq_llama', { type: 'groq', enabled: true, priority: 1, config: { apiKey: 'test-groq-key' } });

    const result = registry.selectBackend('auto', { contentLength: 50000 });

    expect(result.backend).toBe('groq_llama');
    expect(result.backend).not.toBe('nvidia_glm');
    expect(result.backend).not.toBe('local');
  });

  it('degrades without throwing when nothing is usable', () => {
    const registry = makeRegistry();
    // groq registered but disabled -> not usable
    registry.register('groq_llama', { type: 'groq', enabled: false, priority: 1, config: {} });

    expect(() => registry.selectBackend('auto', { contentLength: 100 })).not.toThrow();
    const result = registry.selectBackend('auto', { contentLength: 100 });
    expect(result.backend).toBeNull();
  });

  it('prefers a usable local-type lane for small content when both local and cloud are usable', () => {
    const registry = makeRegistry();
    registry.register('local', { type: 'local', enabled: true, priority: 1, config: { skipAutodiscovery: true } });
    registry.register('groq_llama', { type: 'groq', enabled: true, priority: 2, config: { apiKey: 'test-groq-key' } });

    const result = registry.selectBackend('auto', { contentLength: 100 });
    expect(result.backend).toBe('local');
  });

  it('prefers the highest-priority usable non-local lane for large content', () => {
    const registry = makeRegistry();
    registry.register('local', { type: 'local', enabled: true, priority: 1, config: { skipAutodiscovery: true } });
    registry.register('groq_llama', { type: 'groq', enabled: true, priority: 2, config: { apiKey: 'test-groq-key' } });
    registry.register('gemini', { type: 'gemini', enabled: true, priority: 3, config: { apiKey: 'test-gemini-key' } });

    const result = registry.selectBackend('auto', { contentLength: 50000 });
    expect(result.backend).toBe('groq_llama'); // priority 2 beats priority 3, both non-local
  });
});

describe('council falls back to usable backends, not a hardcoded roster', () => {
  it('getDefaultCouncilBackends derives from the registry, not a static list', () => {
    const registry = makeRegistry();
    registry.register('groq_llama', { type: 'groq', enabled: true, priority: 1, config: { apiKey: 'test-groq-key' } });

    expect(getDefaultCouncilBackends(registry)).toEqual(['groq_llama']);
  });

  it('degrades to [] without throwing when no registry is wired', () => {
    expect(() => getDefaultCouncilBackends(undefined)).not.toThrow();
    expect(getDefaultCouncilBackends(undefined)).toEqual([]);
  });

  it('council with fewer than 2 usable backends surfaces honestly, not with an unresolvable name', async () => {
    const handler = new CouncilHandler({
      router: {
        // Only 'gemini' (one of the three 'general'-topic backends) is
        // available; the other two are not — this must refuse, not silently
        // proceed with a roster that can't actually respond.
        isBackendAvailable: async (name) => name === 'gemini'
      }
    });

    const result = await handler.execute({
      prompt: 'Please analyze this scenario in detail and provide your full assessment.',
      topic: 'general',
      confidence_needed: 'low'
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/≥2 backends/);
  });
});

describe('estimateBackendSpeed has no per-name guess table', () => {
  it('returns a sane positive number for openai_chatgpt (the old dead-key case)', () => {
    const handler = new AskHandler({});
    const speed = handler.estimateBackendSpeed('openai_chatgpt');
    expect(speed).toBeGreaterThan(0);
    expect(Number.isFinite(speed)).toBe(true);
  });

  it('returns the same sane default for a backend name nobody has ever heard of', () => {
    const handler = new AskHandler({});
    const speed = handler.estimateBackendSpeed('some-backend-nobody-configured');
    expect(speed).toBeGreaterThan(0);
    expect(speed).toBe(handler.estimateBackendSpeed('openai_chatgpt'));
  });

  it('local consults the adapter\'s own measured/cold-start speed rather than a guess', () => {
    const handler = new AskHandler({
      backendRegistry: {
        getAdapter: (name) => (name === 'local' ? { getTokensPerSecond: () => 77 } : null)
      }
    });
    expect(handler.estimateBackendSpeed('local')).toBe(77);
  });

  it('local falls back to the same conservative default when the adapter has nothing learned yet', () => {
    const handler = new AskHandler({ backendRegistry: { getAdapter: () => null } });
    const speed = handler.estimateBackendSpeed('local');
    expect(speed).toBe(handler.estimateBackendSpeed('openai_chatgpt'));
  });
});
