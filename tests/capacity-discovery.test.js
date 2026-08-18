/**
 * @fileoverview Live capacity discovery must never throw, never block a
 * request, never call a provider without a key, and must prefer its own
 * result over the configured/default fallback. All network access is
 * stubbed — no live calls.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { discoverCapacity, _resetCapacityDiscoveryCache } from '../src/backends/capacity-discovery.js';
import { BackendRegistry } from '../src/backends/backend-registry.js';
import { AnalyzeFileHandler } from '../src/handlers/analyze-file-handler.js';

function jsonResponse(body, ok = true) {
  return { ok, json: async () => body };
}

function freshRegistry(backends) {
  const registry = new BackendRegistry({ autoInitialize: false });
  registry.loadConfig({ backends });
  return registry;
}

describe('discoverCapacity', () => {
  beforeEach(() => {
    _resetCapacityDiscoveryCache();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('queries the operator-configured url, not the public provider endpoint', async () => {
    // The adapters honor config.url (groq-adapter.js / openai-adapter.js both do
    // `config.url || <default>`), so discovery must ask the SAME host that will
    // serve the request — otherwise it reports capacity for a host the request
    // never reaches.
    const fetchMock = vi.fn(async () => jsonResponse({
      data: [{ id: 'openai/gpt-oss-120b', context_window: 131072, max_completion_tokens: 65536 }]
    }));
    vi.stubGlobal('fetch', fetchMock);

    const backend = {
      name: 'groq_llama',
      type: 'groq',
      config: { model: 'openai/gpt-oss-120b', url: 'https://gateway.internal.example/v1/chat/completions' }
    };
    const result = await discoverCapacity(backend, 'fake-key');

    expect(result).toEqual({ inputTokens: 131072, outputTokens: 65536 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0][0];
    expect(calledUrl).toBe('https://gateway.internal.example/v1/models');
    expect(calledUrl).not.toContain('api.groq.com');
  });

  it('falls back to the provider endpoint when no url is configured', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      data: [{ id: 'openai/gpt-oss-120b', context_window: 131072, max_completion_tokens: 65536 }]
    }));
    vi.stubGlobal('fetch', fetchMock);

    const backend = { name: 'groq_llama', type: 'groq', config: { model: 'openai/gpt-oss-120b' } };
    await discoverCapacity(backend, 'fake-key');

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.groq.com/openai/v1/models');
  });

  it('reads context_window/max_completion_tokens from an OpenAI-compatible catalog', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      data: [{ id: 'openai/gpt-oss-120b', context_window: 131072, max_completion_tokens: 65536 }]
    })));

    const backend = { name: 'groq_llama', type: 'groq', config: { model: 'openai/gpt-oss-120b' } };
    const result = await discoverCapacity(backend, 'fake-key');
    expect(result).toEqual({ inputTokens: 131072, outputTokens: 65536 });
  });

  it('reads inputTokenLimit/outputTokenLimit from the Gemini catalog, matching the models/ prefix', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      models: [{ name: 'models/gemini-3.1-pro-preview', inputTokenLimit: 1048576, outputTokenLimit: 65536 }]
    })));

    const backend = { name: 'gemini', type: 'gemini', config: { model: 'gemini-3.1-pro-preview' } };
    const result = await discoverCapacity(backend, 'fake-key');
    expect(result).toEqual({ inputTokens: 1048576, outputTokens: 65536 });
  });

  it('degrades to null when the catalog has no capacity fields at all (NIM shape)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      data: [{ id: 'meta/llama-3', object: 'model', owned_by: 'meta' }]
    })));

    const backend = { name: 'nvidia_deepseek', type: 'nvidia_deepseek', config: { model: 'meta/llama-3' } };
    const result = await discoverCapacity(backend, 'fake-key');
    expect(result).toBeNull();
  });

  it('never throws on a fetch rejection (network down / timeout)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));

    const backend = { name: 'groq_llama', type: 'groq', config: { model: 'x' } };
    await expect(discoverCapacity(backend, 'fake-key')).resolves.toBeNull();
  });

  it('never throws and returns null on a non-ok HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, false)));

    const backend = { name: 'openai_chatgpt', type: 'openai', config: { model: 'gpt-5.2' } };
    await expect(discoverCapacity(backend, 'fake-key')).resolves.toBeNull();
  });

  it('returns null without calling fetch at all when no key is supplied', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const backend = { name: 'openai_chatgpt', type: 'openai', config: { model: 'gpt-5.2' } };
    const result = await discoverCapacity(backend, null);
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('caches within the TTL window: a second call for the same backend does not re-fetch', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({
      data: [{ id: 'x', context_window: 100000, max_completion_tokens: 8000 }]
    }));
    vi.stubGlobal('fetch', fetchSpy);

    const backend = { name: 'groq_llama', type: 'groq', config: { model: 'x' } };
    const first = await discoverCapacity(backend, 'fake-key');
    const second = await discoverCapacity(backend, 'fake-key');

    expect(first).toEqual(second);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent in-flight lookups for the same backend into one fetch', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({
      data: [{ id: 'x', context_window: 100000, max_completion_tokens: 8000 }]
    }));
    vi.stubGlobal('fetch', fetchSpy);

    const backend = { name: 'groq_llama', type: 'groq', config: { model: 'x' } };
    const [a, b] = await Promise.all([
      discoverCapacity(backend, 'fake-key'),
      discoverCapacity(backend, 'fake-key')
    ]);

    expect(a).toEqual(b);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

});

describe('capacityFor: discovery -> configured -> default chain', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    _resetCapacityDiscoveryCache();
    vi.restoreAllMocks();
    process.env.GROQ_API_KEY = 'fake-groq-key';
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  it('prefers a discovered capacity over the configured context_limit and the static default', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      data: [{ id: 'openai/gpt-oss-120b', context_window: 131072, max_completion_tokens: 65536 }]
    })));

    const registry = freshRegistry({
      local: { type: 'local', enabled: true, priority: 1, config: {} },
      groq_llama: {
        type: 'groq', enabled: true, priority: 2, context_limit: 8000,
        config: { model: 'openai/gpt-oss-120b' }
      }
    });

    const handler = new AnalyzeFileHandler({ backendRegistry: registry });
    const cap = await handler.capacityFor('groq_llama');
    // (131072 - 65536) tokens * 4 chars/token = 262144, not the config's
    // 8000-token table entry (28800) or the static default (115200).
    expect(cap).toBe(262144);
  });

  it('degrades to the CONFIGURED context_limit when the provider reports no capacity fields', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      data: [{ id: 'meta/llama-3', object: 'model' }]
    })));

    const registry = freshRegistry({
      local: { type: 'local', enabled: true, priority: 1, config: {} },
      groq_llama: {
        type: 'groq', enabled: true, priority: 2, context_limit: 8000,
        config: { model: 'meta/llama-3' }
      }
    });

    const handler = new AnalyzeFileHandler({ backendRegistry: registry });
    const cap = await handler.capacityFor('groq_llama');
    expect(cap).toBe(Math.floor(8000 * 4 * 0.9)); // 28800
  });

  it('degrades silently to the static default when discovery fails and no context_limit is configured', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('timeout'); }));

    const registry = freshRegistry({
      local: { type: 'local', enabled: true, priority: 1, config: {} },
      groq_llama: { type: 'groq', enabled: true, priority: 2, config: { model: 'x' } }
    });

    const handler = new AnalyzeFileHandler({ backendRegistry: registry });
    await expect(handler.capacityFor('groq_llama')).resolves.toBe(handler.getBackendContextLimit('groq_llama') * 0.9);
  });
});

describe('offline gate: no network, no keys — capacity still resolves via config/default', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    _resetCapacityDiscoveryCache();
    vi.restoreAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.NVIDIA_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
    // Any fetch call at all is a bug in this scenario — no keys means
    // discovery must skip every backend without ever reaching the network.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network must not be called'); }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  it('resolves capacity for every backend without throwing and without calling fetch', async () => {
    const registry = freshRegistry({
      local: { type: 'local', enabled: true, priority: 1, config: {} },
      nvidia_deepseek: { type: 'nvidia_deepseek', enabled: true, priority: 2, context_limit: 8192, config: {} },
      nvidia_glm: { type: 'nvidia_glm', enabled: true, priority: 3, context_limit: 32768, config: {} },
      gemini: { type: 'gemini', enabled: true, priority: 4, context_limit: 32768, config: {} },
      openai_chatgpt: { type: 'openai', enabled: true, priority: 5, config: {} },
      groq_llama: { type: 'groq', enabled: true, priority: 6, config: {} }
    });

    const handler = new AnalyzeFileHandler({ backendRegistry: registry });
    handler.getContextLimit = async () => ({ charLimit: 50000, model: 'test-model' });

    for (const name of ['local', 'nvidia_deepseek', 'nvidia_glm', 'gemini', 'openai_chatgpt', 'groq_llama']) {
      await expect(handler.capacityFor(name)).resolves.toEqual(expect.any(Number));
    }

    // LocalAdapter's own background port-scan autodiscovery (unrelated to
    // capacity discovery) is allowed to hit fetch; no PROVIDER_ENDPOINTS
    // catalog URL (the ones capacity-discovery.js would call) may appear,
    // since every cloud backend above is keyless.
    const catalogUrls = fetch.mock.calls
      .map(call => String(call[0]))
      .filter(url => /integrate\.api\.nvidia\.com|api\.groq\.com|api\.openai\.com|generativelanguage\.googleapis\.com/.test(url));
    expect(catalogUrls).toEqual([]);

    // usable-backend filtering + capacity search still work end to end.
    const usable = registry.getUsableBackends();
    expect(usable).toEqual(['local']);
    const result = await handler.findBackendWithCapacity(1000);
    expect(result).toEqual({ name: 'local', cap: 50000 });
  });
});
