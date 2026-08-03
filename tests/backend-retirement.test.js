import { describe, it, expect, vi, afterEach } from 'vitest';
import { isModelRetired, buildRetiredModelError } from '../src/backends/model-retirement.js';
import { NvidiaGlmAdapter, isModelRetired as nvidiaIsModelRetired } from '../src/backends/nvidia-adapter.js';
import { stripUndefined, BackendAdapter } from '../src/backends/backend-adapter.js';
import { BackendRegistry } from '../src/backends/backend-registry.js';

describe('isModelRetired', () => {
  it('classifies HTTP 410 as retired', () => {
    expect(isModelRetired(410, '')).toBe(true);
  });

  it('classifies 404 naming the model as retired', () => {
    expect(isModelRetired(404, 'The model qwen/x does not exist')).toBe(true);
  });

  it('classifies a plain 404 as NOT retired', () => {
    expect(isModelRetired(404, 'Not Found')).toBe(false);
  });

  it('classifies 429 (rate limit) as NOT retired', () => {
    expect(isModelRetired(429, 'rate limit')).toBe(false);
  });

  it('classifies 503 (overloaded) as NOT retired', () => {
    expect(isModelRetired(503, 'overloaded')).toBe(false);
  });

  it('classifies 401 (unauthorized) as NOT retired', () => {
    expect(isModelRetired(401, 'unauthorized')).toBe(false);
  });

  it('is re-exported from nvidia-adapter.js as the same logic', () => {
    expect(nvidiaIsModelRetired(410, '')).toBe(true);
    expect(nvidiaIsModelRetired(429, 'rate limit')).toBe(false);
  });

  // Regression coverage: the doc's OR regex (/model|not found|does not exist/i)
  // flags a bare "Not Found" body as retired, violating its own required test case.
  // These lock in the corrected predicate against realistic provider bodies.
  it('classifies "<id> does not exist" as retired without needing the model param', () => {
    expect(isModelRetired(404, 'The ID qwen/q3-coder-480b does not exist')).toBe(true);
  });

  it('classifies "<configured model id> is not found" as retired when the model id is threaded through', () => {
    expect(isModelRetired(404, 'deepseek-ai/deepseek-v3.1-terminus is not found', 'deepseek-ai/deepseek-v3.1-terminus')).toBe(true);
  });

  it('classifies explicit deprecation language as retired', () => {
    expect(isModelRetired(404, 'Model deprecated and no longer available')).toBe(true);
  });

  it('still classifies a bare "Not Found" body as NOT retired', () => {
    expect(isModelRetired(404, 'Not Found')).toBe(false);
  });

  it('still classifies a bare lowercase "not found" body as NOT retired', () => {
    expect(isModelRetired(404, 'not found')).toBe(false);
  });
});

describe('buildRetiredModelError', () => {
  it('names the backend, the model, and gives a fix, with no private-infra mention', () => {
    const err = buildRetiredModelError('nvidia_glm', 'some-vendor/some-model-v1', 410, 'end of life 2026-06-11');
    expect(err.isModelRetired).toBe(true);
    expect(err.message).toContain('nvidia_glm');
    expect(err.message).toContain('some-vendor/some-model-v1');
    expect(err.message).toMatch(/config\.model/);
    expect(err.message).not.toMatch(/192\.168\.|:8084|coder|gemma4|ai-utility/i);
  });
});

describe('stripUndefined', () => {
  it('drops undefined-valued keys but keeps defined ones', () => {
    expect(stripUndefined({ a: 1, b: undefined, c: 'x' })).toEqual({ a: 1, c: 'x' });
  });

  it('handles missing/empty input', () => {
    expect(stripUndefined()).toEqual({});
  });

  it('fixes the phantom-401 bug: explicit apiKey:undefined no longer clobbers the resolved default', () => {
    const original = process.env.NVIDIA_API_KEY;
    process.env.NVIDIA_API_KEY = 'test-key-not-real';
    try {
      const adapter = new NvidiaGlmAdapter({ apiKey: undefined });
      expect(adapter.config.apiKey).toBe(process.env.NVIDIA_API_KEY);
      expect(adapter.config.apiKey).not.toBeUndefined();
    } finally {
      if (original === undefined) delete process.env.NVIDIA_API_KEY;
      else process.env.NVIDIA_API_KEY = original;
    }
  });
});

describe('retirement wiring in makeAPICall', () => {
  class FakeAdapter extends BackendAdapter {
    constructor(config) {
      super({ name: 'fake', type: 'fake', url: 'http://example.invalid/v1/chat/completions', timeout: 1000, ...config });
      this.model = config?.model || 'fake-model';
    }
    async makeRequest(prompt, options = {}) {
      return this.makeAPICall({ model: this.model, messages: [] }, 'Fake error');
    }
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws an isModelRetired error on HTTP 410 and never falls through to the generic error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 410,
      text: async () => 'end of life 2026-06-11'
    });

    const adapter = new FakeAdapter({});
    await expect(adapter.makeRequest('hi')).rejects.toMatchObject({ isModelRetired: true });
  });

  it('does NOT flag a plain 404 as retired', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not Found'
    });

    const adapter = new FakeAdapter({});
    let caught;
    try {
      await adapter.makeRequest('hi');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(caught.isModelRetired).toBeFalsy();
  });

  it('threads the adapter\'s configured model id into isModelRetired at the call site', async () => {
    // Body has no model-ish noun and no explicit retirement wording — it only
    // qualifies as retired because it contains this exact adapter's model id.
    // If makeAPICall stopped passing `model` through, this would misclassify as
    // a generic (non-retired) 404, same as the "does not flag a plain 404" case.
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'vendor-zx9f3a is not found'
    });

    const adapter = new FakeAdapter({ model: 'vendor-zx9f3a' });
    await expect(adapter.makeRequest('hi')).rejects.toMatchObject({ isModelRetired: true });

    // Sanity: the same body is NOT retired without the model id supplied — proving
    // the classification above genuinely depended on makeAPICall threading it through,
    // not on the body containing a model-ish noun by coincidence.
    expect(isModelRetired(404, 'vendor-zx9f3a is not found')).toBe(false);
  });

  it('opens the circuit breaker immediately on a retired-model error via execute()', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 410,
      text: async () => ''
    });

    const adapter = new FakeAdapter({});
    expect(adapter.circuitOpen).toBe(false);
    await expect(adapter.execute('hi')).rejects.toMatchObject({ isModelRetired: true });
    expect(adapter.circuitOpen).toBe(true);
    expect(adapter.consecutiveFailures).toBe(1);
  });
});

describe('BackendRegistry.checkHealth TTL cache', () => {
  it('a second sequential call within the TTL hits the cache (does not re-probe)', async () => {
    const registry = new BackendRegistry({ autoInitialize: false });
    const probe = vi.fn().mockResolvedValue({ healthy: true });
    registry.adapters.set('fake', { checkHealth: probe });

    await registry.checkHealth();
    await registry.checkHealth();

    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('concurrent callers join the same in-flight sweep instead of starting a second one', async () => {
    const registry = new BackendRegistry({ autoInitialize: false });
    let resolveProbe;
    const pending = new Promise(resolve => { resolveProbe = resolve; });
    const probe = vi.fn().mockReturnValue(pending);
    registry.adapters.set('fake', { checkHealth: probe });

    const p1 = registry.checkHealth();
    const p2 = registry.checkHealth();

    resolveProbe({ healthy: true });
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(probe).toHaveBeenCalledTimes(1);
    expect(r1).toEqual(r2);
  });

  it('force=true bypasses the cache and re-probes', async () => {
    const registry = new BackendRegistry({ autoInitialize: false });
    const probe = vi.fn().mockResolvedValue({ healthy: true });
    registry.adapters.set('fake', { checkHealth: probe });

    await registry.checkHealth();
    await registry.checkHealth(true);

    expect(probe).toHaveBeenCalledTimes(2);
  });
});

describe('BackendRegistry.getStats honest health counts', () => {
  it('counts never-probed backends as unknown, not unhealthy', () => {
    const registry = new BackendRegistry({ autoInitialize: false });
    registry.backends.set('a', { name: 'a', type: 'fake', enabled: true, priority: 1, description: 'a', config: {} });
    registry.backends.set('b', { name: 'b', type: 'fake', enabled: true, priority: 2, description: 'b', config: {} });
    registry.adapters.set('a', { lastHealth: null });
    registry.adapters.set('b', { lastHealth: { healthy: true } });

    const stats = registry.getStats();

    expect(stats.healthyBackends).toBe(1);
    expect(stats.unknownBackends).toBe(1);
    // healthChecked is true once at least one backend has been probed.
    expect(stats.healthChecked).toBe(true);
    expect(stats.totalBackends).toBe(2);
    expect(stats.enabledBackends).toBe(2);
    expect(Array.isArray(stats.fallbackChain)).toBe(true);
    expect(Array.isArray(stats.backends)).toBe(true);
  });
});
