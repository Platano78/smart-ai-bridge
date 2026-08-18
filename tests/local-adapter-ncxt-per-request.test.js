/**
 * @fileoverview Fix B — selectOptimalModel's preferContext path must rank by
 * per-request context (nCtx / slots, unless --kv-unified), not raw --ctx-size.
 * Mirrors the normalization already used in model-discovery.js:289.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { LocalAdapter } from '../src/backends/local-adapter.js';

afterEach(() => vi.unstubAllGlobals());

function modelsResponse(models) {
  return {
    ok: true,
    json: async () => ({
      data: models.map(m => ({
        id: m.id,
        status: { value: m.status || 'loaded', args: m.args || [] }
      }))
    })
  };
}

describe('LocalAdapter.selectOptimalModel — preferContext ranks by per-request context', () => {
  it('picks the smaller-pool model whose per-request window is actually larger (no --kv-unified)', async () => {
    const adapter = new LocalAdapter({ skipAutodiscovery: true });
    adapter.config.url = 'http://test-local/v1/chat/completions';

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(modelsResponse([
      { id: 'wide-pool', args: ['--ctx-size', '65536', '--parallel', '4'] },   // 16K/request
      { id: 'narrow-pool', args: ['--ctx-size', '32768', '--parallel', '1'] } // 32K/request
    ])));

    await adapter.fetchModelInfo();

    const selected = adapter.selectOptimalModel({ preferContext: true });
    expect(selected).toBe('narrow-pool');
  });

  it('the unified-KV model wins once its full 65536 is addressable per-request', async () => {
    const adapter = new LocalAdapter({ skipAutodiscovery: true });
    adapter.config.url = 'http://test-local/v1/chat/completions';

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(modelsResponse([
      { id: 'wide-pool-unified', args: ['--ctx-size', '65536', '--parallel', '4', '--kv-unified'] },
      { id: 'narrow-pool', args: ['--ctx-size', '32768', '--parallel', '1'] }
    ])));

    await adapter.fetchModelInfo();

    const selected = adapter.selectOptimalModel({ preferContext: true });
    expect(selected).toBe('wide-pool-unified');
  });

  it('preferSpeed sort (by slots) is unaffected by the nCtxPerRequest change', async () => {
    const adapter = new LocalAdapter({ skipAutodiscovery: true });
    adapter.config.url = 'http://test-local/v1/chat/completions';

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(modelsResponse([
      { id: 'wide-pool', args: ['--ctx-size', '65536', '--parallel', '4'] },
      { id: 'narrow-pool', args: ['--ctx-size', '32768', '--parallel', '1'] }
    ])));

    await adapter.fetchModelInfo();

    const selected = adapter.selectOptimalModel({ preferSpeed: true });
    expect(selected).toBe('wide-pool'); // 4 slots beats 1 slot, as before
  });
});
