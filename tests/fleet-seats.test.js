/**
 * @fileoverview Fleet-seats port (S6 tests, F1/F2/F4/F5/F6/F7 -> S1-S5):
 * regression coverage for the multi-seat local fleet behavior the earlier
 * slices of this plan implemented. Fixture custom-backends data only —
 * never reads or writes src/config/backends.json or data/backends-custom.json,
 * and every URL is either a non-resolving placeholder host or an ephemeral
 * 127.0.0.1 mock server started/torn down within the test. No test requires
 * a real API key or touches the real network.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { BackendRegistry } from '../src/backends/backend-registry.js';

function baseBackends() {
  return {
    local: { type: 'local', enabled: true, priority: 1, config: {} },
    groq_llama: { type: 'groq', enabled: true, priority: 90, config: { model: 'llama-x' } },
    gemini: { type: 'gemini', enabled: true, priority: 91, config: { model: 'gemini-x' } }
  };
}

/** BackendRegistry seeded entirely in-memory: loadConfig() for the base
 *  roster, loadCustomBackends() with a preloaded object for the fleet/
 *  override layer — neither reads a file from disk. */
function freshRegistry(backends, custom) {
  const registry = new BackendRegistry({ autoInitialize: false });
  registry.loadConfig({ backends });
  if (custom) registry.loadCustomBackends(custom);
  return registry;
}

describe('S1 — custom-config merge reaches the adapter, disabled seats are unreachable', () => {
  it('a config-only override of an existing backend (config.url) reaches its adapter', () => {
    const registry = freshRegistry(baseBackends(), {
      backends: {
        local: { config: { url: 'http://fixture-worker.invalid:8081/v1/chat/completions' } }
      }
    });
    const adapter = registry.getAdapter('local');
    expect(adapter).not.toBeNull();
    expect(adapter.config.url).toBe('http://fixture-worker.invalid:8081/v1/chat/completions');
  });

  it('a seat the custom file disables has no adapter and is unreachable by name', () => {
    const registry = freshRegistry(baseBackends(), {
      backends: { local: { enabled: false } }
    });
    expect(registry.getAdapter('local')).toBeNull();
    expect(registry.getEnabledBackends()).not.toContain('local');
    const resolved = registry.resolveRequestedBackend('local');
    // Still a REGISTERED name (appears in the valid list elsewhere), but no
    // longer selectable as an enabled/usable lane.
    expect(registry.getUsableBackends()).not.toContain('local');
    expect(resolved.ok).toBe(true); // registered-name lookup still resolves...
    expect(registry.getFallbackChain()).not.toContain('local'); // ...but the disabled seat never reaches the cascade
  });
});

describe('S2 — any registered name is pinnable; an unknown name lists registered backends', () => {
  it('resolveRequestedBackend accepts a custom fleet seat by its own name', () => {
    const registry = freshRegistry(baseBackends(), {
      backends: {
        mb_worker: { type: 'local', enabled: true, priority: 2, config: { url: 'http://fixture-mb-worker.invalid:8081/v1/chat/completions' } }
      }
    });
    const resolved = registry.resolveRequestedBackend('mb_worker');
    expect(resolved).toEqual({ ok: true, backend: 'mb_worker' });
    expect(registry.selectBackend('mb_worker')).toEqual({ backend: 'mb_worker', explicit: true });
  });

  it('an unknown name yields ok:false and lists the registered backend names', () => {
    const registry = freshRegistry(baseBackends(), {
      backends: {
        mb_worker: { type: 'local', enabled: true, priority: 2, config: { url: 'http://fixture-mb-worker.invalid:8081/v1/chat/completions' } }
      }
    });
    const resolved = registry.resolveRequestedBackend('totally_unregistered_seat');
    expect(resolved.ok).toBe(false);
    expect(resolved.error).toMatch(/Unknown backend/);
    expect(resolved.valid).toEqual(expect.arrayContaining(['local', 'groq_llama', 'gemini', 'mb_worker']));
    expect(() => registry.selectBackend('totally_unregistered_seat')).toThrow(/Unknown backend/);
  });
});

/** Minimal /v1/models mock mirroring llama-swap's status.args shape, which
 *  getSeatContextLimit reads to derive per-request context. */
function startMockLocalSeat(ctxSize) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        data: [{
          id: 'fixture-model',
          status: { value: 'loaded', args: ['--ctx-size', String(ctxSize), '--parallel', '1'] }
        }]
      }));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

describe('S4 — per-seat capacity: two local seats with different declared contexts differ', () => {
  let seatA, seatB;
  afterEach(async () => {
    await Promise.all([seatA, seatB].filter(Boolean).map(s => new Promise(r => s.close(r))));
    seatA = seatB = null;
  });

  it('mb_worker and coder report different probed capacities from their own endpoints', async () => {
    seatA = await startMockLocalSeat(8192);
    seatB = await startMockLocalSeat(131072);

    const registry = freshRegistry(baseBackends(), {
      backends: {
        mb_worker: { type: 'local', enabled: true, priority: 2, config: { url: `http://127.0.0.1:${seatA.address().port}/v1/chat/completions` } },
        coder: { type: 'local', enabled: true, priority: 3, config: { url: `http://127.0.0.1:${seatB.address().port}/v1/chat/completions` } }
      }
    });

    const { AnalyzeFileHandler } = await import('../src/handlers/analyze-file-handler.js');
    const handler = new AnalyzeFileHandler({ backendRegistry: registry });

    const workerCap = await handler.capacityTokensFor('mb_worker');
    const coderCap = await handler.capacityTokensFor('coder');

    expect(workerCap).not.toBe(coderCap);
    // 8192 * 0.65 vs 131072 * 0.65 — the larger declared window must win.
    expect(coderCap).toBeGreaterThan(workerCap);
  });
});

describe('S5 — cascade hygiene: keyless lanes excluded, custom seat wins a priority tie', () => {
  // getUsableBackends()/selectBackend('auto') must exclude groq_llama because
  // it is KEYLESS, not because this environment happens to lack the env var
  // — the assertion must hold regardless of whether the developer (or CI)
  // has GROQ_API_KEY set for something unrelated. Control it explicitly,
  // mirroring the F8 fix in council-defaults-not-hardcoded.test.js.
  let priorGroqKey;
  beforeEach(() => { priorGroqKey = process.env.GROQ_API_KEY; delete process.env.GROQ_API_KEY; });
  afterEach(() => {
    if (priorGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = priorGroqKey;
  });

  it('a keyless (no API key configured) cloud lane never enters the usable set or the fallback chain', () => {
    const registry = freshRegistry({
      local: { type: 'local', enabled: true, priority: 1, config: {} },
      groq_llama: { type: 'groq', enabled: true, priority: 2, config: { model: 'llama-x' } } // no apiKey, no env var set
    });

    expect(registry.getEnabledBackends()).toContain('groq_llama');
    expect(registry.getUsableBackends()).not.toContain('groq_llama');

    const selected = registry.selectBackend('auto');
    expect(selected.backend).not.toBe('groq_llama');
  });

  it('a custom seat wins a priority tie against a built-in', () => {
    const registry = freshRegistry(baseBackends(), {
      backends: {
        // Reuses local's own priority (1) — R2: on a tie, the custom seat
        // (isCustom) must sort ahead of the built-in it collided with.
        mb_worker: { type: 'local', enabled: true, priority: 1, config: { url: 'http://fixture-mb-worker.invalid:8081/v1/chat/completions' } }
      }
    });

    const chain = registry.getFallbackChain();
    expect(chain.indexOf('mb_worker')).toBeLessThan(chain.indexOf('local'));
  });
});
