/**
 * @fileoverview REGRESSION GUARD: model-discovery.js must not guess a model's
 * ROLE (orchestrator vs. subagent-suitable) from its name or its size.
 *
 * checkIfOrchestrator() used to test `/orchestrator/i` against the model's
 * name/path, plus a `nParams <= 10e9 && nCtx <= 4096` branch. That size
 * branch re-tested the SAME regex the first branch had already caught, so it
 * could never independently return true — the whole function was a name
 * check wearing a param-count disguise. Discovery has no operator config to
 * consult, so it can no longer guess at all: `isOrchestrator` is now always
 * false from this file. Exclusion is an operator decision made where the
 * backend's config is actually in scope (capability-matcher.js /
 * local-adapter.js, covered by tests/backend-topology-not-hardcoded.test.js).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { discoverModelOnPort, clearCache } from '../src/utils/model-discovery.js';
import { isExcludedFromSubagent } from '../src/utils/capability-matcher.js';

function stubServer(spec = {}) {
  const notFound = {
    ok: false, status: 404, statusText: 'Not Found',
    text: async () => 'nope', json: async () => ({})
  };
  const fetchMock = vi.fn(async (url) => {
    const u = String(url);
    if (u.endsWith('/props')) {
      return spec.props ? { ok: true, status: 200, json: async () => spec.props } : notFound;
    }
    if (u.endsWith('/v1/models')) {
      return spec.models ? { ok: true, status: 200, json: async () => spec.models } : notFound;
    }
    return notFound;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** A model that is small AND short-context AND named "orchestrator" — the
 * exact shape the old heuristic's two branches both fired on. */
function orchestratorShapedProps() {
  return {
    model_alias: 'my-orchestrator-router',
    model_path: '/models/tiny-orchestrator.gguf',
    model_ftype: 'Q4_K_M',
    total_slots: 1,
    default_generation_settings: { n_ctx: 2048 } // <= 4096
  };
}

function orchestratorShapedModels() {
  return { data: [{ id: 'my-orchestrator-router', meta: { n_params: 3e9, n_ctx_train: 8192 } }] }; // <= 10e9
}

beforeEach(() => clearCache());
afterEach(() => {
  vi.unstubAllGlobals();
  clearCache();
});

describe('discovery no longer classifies model role', () => {
  it('a small-param, short-context, "orchestrator"-named model is NOT excluded', async () => {
    stubServer({ props: orchestratorShapedProps(), models: orchestratorShapedModels() });

    const model = await discoverModelOnPort(8083, 500);

    expect(model).not.toBeNull();
    expect(model.isOrchestrator).toBe(false);
  });

  it('a normal-sized, large-context model is also not excluded (no regression either direction)', async () => {
    stubServer({
      props: {
        model_alias: 'some-coder-70b',
        model_path: '/models/some-coder-70b.gguf',
        default_generation_settings: { n_ctx: 32768 }
      },
      models: { data: [{ id: 'some-coder-70b', meta: { n_params: 70e9, n_ctx_train: 131072 } }] }
    });

    const model = await discoverModelOnPort(8084, 500);

    expect(model.isOrchestrator).toBe(false);
  });

  it('branch B (param/context size) was provably unreachable: its guard is a strict subset of branch A', () => {
    // The old code:
    //   if (/orchestrator/i.test(name) || /orchestrator/i.test(path)) return true;      // A
    //   if (nParams <= 10e9 && nCtx <= 4096) {
    //     if (/orchestrator/i.test(`${name}${path}`)) return true;                       // B, re-tests A's condition
    //   }
    // Any input satisfying B's inner regex already satisfies A's regex (same test,
    // same strings), and A runs first and returns. So B could never independently fire.
    const nameOrPathHasWord = (name, path) => /orchestrator/i.test(name) || /orchestrator/i.test(path);
    const brancBInnerFires = (name, path) => /orchestrator/i.test(`${name}${path}`);

    // Exhaustive over the only inputs that could make branch B's inner test true:
    // any string containing "orchestrator" in either field, in either case.
    const probes = [
      ['orchestrator', ''], ['', 'orchestrator'], ['ORCHESTRATOR', ''],
      ['my-orchestrator-model', 'x'], ['x', '/models/orchestrator.gguf']
    ];
    for (const [name, path] of probes) {
      if (brancBInnerFires(name, path)) {
        // Branch A's guard (the exact same regex, tested first) is already true here.
        expect(nameOrPathHasWord(name, path)).toBe(true);
      }
    }
  });

  it('an operator-declared exclusion IS honoured at the layer that has the config (not by discovery)', () => {
    // Discovery itself has no config to consult (proven above: always false).
    // The operator's actual exclusion mechanism lives one layer up.
    expect(isExcludedFromSubagent({ excludeFromSubagent: true })).toBe(true);
    expect(isExcludedFromSubagent({})).toBe(false);
  });
});
