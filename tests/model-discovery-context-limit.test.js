/**
 * @fileoverview getLocalContextLimit must size inputs from a PER-REQUEST context
 * window. `nCtx` arrives from five discovery sources with different meanings —
 * only the llama.cpp router's `--ctx-size` is a total pool that has to be divided
 * by the slot count. Dividing the others (notably /props, which already reports the
 * slot's own window) silently costs a `--parallel N` user N× their usable context.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getLocalContextLimit, clearCache } from '../src/utils/model-discovery.js';

const PORT = 8081;

/**
 * Route fetch by "port -> path -> JSON body". Any unmapped path/port throws, which
 * is what detectServerType sees for a closed port.
 */
function mockServers(map) {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const m = String(url).match(/localhost:(\d+)(\/.*)$/);
    if (!m) throw new Error('unroutable');
    const body = map[m[1]]?.[m[2]];
    if (body === undefined) throw new Error('ECONNREFUSED');
    return { ok: true, json: async () => body };
  }));
}

/** llama.cpp single model behind /props (source 1). */
function llamaProps(alias, nCtx, totalSlots) {
  return {
    '/props': {
      model_alias: alias,
      model_path: `/models/${alias}.gguf`,
      total_slots: totalSlots,
      default_generation_settings: { n_ctx: nCtx }
    },
    '/v1/models': { data: [{ id: alias, meta: { n_params: 7e9, n_ctx_train: 32768 } }] }
  };
}

/** llama.cpp router with >1 loaded model, context described by CLI args (source 2). */
function llamaRouter(models) {
  return {
    '/props': { model_alias: 'router', model_path: '/router' },
    '/v1/models': {
      data: models.map(({ id, args }) => ({
        id,
        meta: { n_params: 7e9, n_ctx_train: 32768 },
        status: { value: 'loaded', args }
      }))
    }
  };
}

beforeEach(() => clearCache());
afterEach(() => {
  vi.unstubAllGlobals();
  clearCache();
});

describe('getLocalContextLimit - per-request context normalization', () => {
  it('source 1 (/props): does NOT divide the reported window by total_slots', async () => {
    // /props reports the slot's own window. 32768 tokens * 0.65 * 4 chars = 85196.
    // The bug this test pins divided by total_slots first and returned 21296.
    mockServers({ [PORT]: llamaProps('props-model', 32768, 4) });

    const result = await getLocalContextLimit([PORT], 50);

    expect(result.charLimit).toBe(85196);
    expect(result.charLimit).not.toBe(21296);
    expect(result.slots).toBe(4);
  });

  it('source 2 (router args) WITHOUT --kv-unified: divides --ctx-size by --parallel', async () => {
    // 262144 / 4 = 65536 per request; 65536 * 0.65 = 42598 tokens; * 4 = 170392 chars.
    mockServers({
      [PORT]: llamaRouter([
        { id: 'args-split-a', args: ['--ctx-size', '262144', '--parallel', '4'] },
        { id: 'args-split-b', args: ['--ctx-size', '8192', '--parallel', '1'] }
      ])
    });

    const result = await getLocalContextLimit([PORT], 50);

    expect(result.model).toBe('args-split-a');
    expect(result.charLimit).toBe(170392);
  });

  it('source 2 (router args) WITH --kv-unified: each slot addresses the full --ctx-size', async () => {
    // 131072 per request (not 32768); 131072 * 0.65 = 85196 tokens; * 4 = 340784 chars.
    mockServers({
      [PORT]: llamaRouter([
        { id: 'args-unified-a', args: ['--ctx-size', '131072', '--parallel', '4', '--kv-unified'] },
        { id: 'args-unified-b', args: ['--ctx-size', '8192', '--parallel', '1'] }
      ])
    });

    const result = await getLocalContextLimit([PORT], 50);

    expect(result.model).toBe('args-unified-a');
    expect(result.charLimit).toBe(340784);
  });

  it('accepts the -kvu short form of --kv-unified', async () => {
    mockServers({
      [PORT]: llamaRouter([
        { id: 'args-kvu-a', args: ['--ctx-size', '131072', '--parallel', '4', '-kvu'] },
        { id: 'args-kvu-b', args: ['--ctx-size', '8192', '--parallel', '1'] }
      ])
    });

    const result = await getLocalContextLimit([PORT], 50);

    expect(result.charLimit).toBe(340784);
  });

  it('selects on the per-request window, not the largest raw --ctx-size', async () => {
    // "big-pool" has the larger raw nCtx (262144) but only 32768 per request;
    // "small-pool" has a smaller pool yet a larger per-request window (65536).
    mockServers({
      [PORT]: llamaRouter([
        { id: 'big-pool', args: ['--ctx-size', '262144', '--parallel', '8'] },
        { id: 'small-pool', args: ['--ctx-size', '65536', '--parallel', '1'] }
      ])
    });

    const result = await getLocalContextLimit([PORT], 50);

    expect(result.model).toBe('small-pool');
    expect(result.charLimit).toBe(170392);
  });

  it('source 3 (vllm): max_model_len is already per-request', async () => {
    mockServers({
      [PORT]: {
        '/v1/models': { data: [{ id: 'vllm-model', max_model_len: 32768 }] },
        '/health': {}
      }
    });

    const result = await getLocalContextLimit([PORT], 50);

    expect(result.model).toBe('vllm-model');
    expect(result.context).toBe(32768);
    expect(result.slots).toBe(1);
    expect(result.charLimit).toBe(85196);
  });

  it('source 4 (lmstudio): hardcoded 4096 still lands on the 20000 floor', async () => {
    mockServers({
      [PORT]: { '/v1/models': { data: [{ id: 'lmstudio-model' }] } }
    });

    const result = await getLocalContextLimit([PORT], 50);

    expect(result.model).toBe('lmstudio-model');
    expect(result.context).toBe(4096);
    expect(result.charLimit).toBe(20000); // raw 10648, clamped up by the floor
  });

  it('source 5 (ollama): hardcoded 4096 still lands on the 20000 floor', async () => {
    mockServers({
      [PORT]: {
        '/api/tags': { models: [{ name: 'ollama-model', model: 'ollama-model', details: { parameter_size: '7B' } }] }
      }
    });

    const result = await getLocalContextLimit([PORT], 50);

    expect(result.model).toBe('ollama-model');
    expect(result.context).toBe(4096);
    expect(result.charLimit).toBe(20000);
  });

  it('clamps to the 512000 ceiling', async () => {
    mockServers({ [PORT]: llamaProps('huge-ctx-model', 1000000, 1) });

    const result = await getLocalContextLimit([PORT], 50);

    expect(result.charLimit).toBe(512000);
  });

  it('returns the conservative default when nothing is discoverable', async () => {
    mockServers({});

    const result = await getLocalContextLimit([PORT], 50);

    expect(result).toEqual({ charLimit: 20000, model: 'unknown', context: 0, contextPerRequest: 0, slots: 2, port: null });
  });

  it('clearCache() resets the context-limit memo, not just the model cache', async () => {
    // The memo only self-invalidates when modelAlias changes, so a model reloaded at a
    // different context under the SAME alias (a named profile keeping its name) would
    // otherwise keep sizing against the old window forever. local-adapter.js's
    // clearDiscoveryCache() routes here, so this is a production path, not a test concern.
    mockServers({ [PORT]: llamaProps('reloaded-model', 32768, 1) });
    const first = await getLocalContextLimit([PORT], 50);
    expect(first.charLimit).toBe(85196);

    clearCache();

    // Same alias, smaller context: 8192 * 0.65 = 5324 tokens; * 4 = 21296 chars.
    mockServers({ [PORT]: llamaProps('reloaded-model', 8192, 1) });
    const second = await getLocalContextLimit([PORT], 50);

    expect(second.context).toBe(8192);
    expect(second.charLimit).toBe(21296);
  });

  it('reports contextPerRequest, which DIFFERS from context on a split-KV router source', async () => {
    // This is precisely why both fields exist: `context` is what the model reports
    // (a total pool here), `contextPerRequest` is what one request may actually use.
    // The output-token budget in analyze-file-handler must read the latter.
    mockServers({
      [PORT]: llamaRouter([
        { id: 'two-fields-a', args: ['--ctx-size', '262144', '--parallel', '4'] },
        { id: 'two-fields-b', args: ['--ctx-size', '8192', '--parallel', '1'] }
      ])
    });

    const result = await getLocalContextLimit([PORT], 50);

    expect(result.context).toBe(262144);
    expect(result.contextPerRequest).toBe(65536);
  });

  it('reports contextPerRequest equal to context when the source is already per-request', async () => {
    mockServers({ [PORT]: llamaProps('per-request-model', 32768, 4) });

    const result = await getLocalContextLimit([PORT], 50);

    expect(result.context).toBe(32768);
    expect(result.contextPerRequest).toBe(32768);
  });

  it('preserves the returned object shape consumers cache and read', async () => {
    mockServers({ [PORT]: llamaProps('shape-model', 32768, 2) });

    const result = await getLocalContextLimit([PORT], 50);

    expect(Object.keys(result).sort()).toEqual(['charLimit', 'context', 'contextPerRequest', 'model', 'port', 'slots']);
    expect(result.port).toBe(PORT);
    expect(result.context).toBe(32768);
  });
});
