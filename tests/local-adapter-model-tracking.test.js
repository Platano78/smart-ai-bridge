/**
 * @fileoverview 1.2 — LocalAdapter.ensureModelLoaded records the actually-loaded
 * model on the "requested IS loaded" branch, and ONLY on that branch.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { LocalAdapter } from '../src/backends/local-adapter.js';

function makeStaleAdapter() {
  const adapter = new LocalAdapter({ skipAutodiscovery: true });
  adapter.initialized = true;
  adapter.config.url = 'http://test-local/v1/chat/completions';
  adapter.model = 'stale-model-A';
  adapter.modelId = 'stale-model-A';
  return adapter;
}

afterEach(() => vi.unstubAllGlobals());

describe('ensureModelLoaded write-back', () => {
  it('updates this.model/this.modelId when the requested model is confirmed loaded (proven RED without the fix — see report)', async () => {
    const adapter = makeStaleAdapter();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: 'model-B', status: { value: 'loaded' } }] })
    }));

    const result = await adapter.ensureModelLoaded('model-B');

    expect(result).toBe('model-B');
    // The gap this closes: previously only the return value was correct; this.modelId
    // (what parseResponse's detectedModel actually reads) stayed stale at 'stale-model-A'.
    expect(adapter.modelId).toBe('model-B');
    expect(adapter.model).toBe('model-B');
  });

  it('does NOT write back on a failure path (no models loaded)', async () => {
    const adapter = makeStaleAdapter();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] })
    }));

    const result = await adapter.ensureModelLoaded('model-B');

    expect(result).toBe('model-B');
    expect(adapter.modelId).toBe('stale-model-A');
    expect(adapter.model).toBe('stale-model-A');
  });

  it('does NOT write back on a non-ok response', async () => {
    const adapter = makeStaleAdapter();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 503 }));

    const result = await adapter.ensureModelLoaded('model-B');

    expect(result).toBe('model-B');
    expect(adapter.modelId).toBe('stale-model-A');
  });

  it('does NOT write back when the fetch itself throws', async () => {
    const adapter = makeStaleAdapter();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('network down')));

    const result = await adapter.ensureModelLoaded('model-B');

    expect(result).toBe('model-B');
    expect(adapter.modelId).toBe('stale-model-A');
  });
});
