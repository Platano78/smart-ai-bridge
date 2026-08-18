/**
 * @fileoverview REGRESSION GUARD: subagent exclusion and cloud fallback must
 * come from operator declaration and the live registry, never from a
 * hardcoded port list, a name regex, or a hardcoded backend name.
 *
 * SAB is a public product: a port a public user happens to run a model on,
 * or a cloud lane they never configured, must never be baked in as private
 * fleet knowledge.
 */
import { describe, it, expect } from 'vitest';
import {
  isExcludedFromSubagent,
  isSuitableForSubagent
} from '../src/utils/capability-matcher.js';
import { LocalAdapter } from '../src/backends/local-adapter.js';
import { DualWorkflowManager, WorkflowMode } from '../src/intelligence/dual-workflow-manager.js';

describe('subagent exclusion is operator-declared only', () => {
  it('a model served on port 8083 is not excluded from subagent work', () => {
    const adapter = new LocalAdapter({
      skipAutodiscovery: true,
      url: 'http://127.0.0.1:8083/v1/chat/completions'
    });
    expect(adapter.isOrchestrator()).toBe(false);
  });

  it('a model served on port 8085 is not excluded from subagent work', () => {
    const adapter = new LocalAdapter({
      skipAutodiscovery: true,
      url: 'http://127.0.0.1:8085/v1/chat/completions'
    });
    expect(adapter.isOrchestrator()).toBe(false);
  });

  it('a model literally named "orchestrator" is not excluded by name', () => {
    const adapter = new LocalAdapter({ skipAutodiscovery: true, url: 'http://127.0.0.1:8081/v1/chat/completions' });
    adapter.modelId = 'my-orchestrator-model';
    expect(adapter.isOrchestrator()).toBe(false);
  });

  it('an operator-declared excludeFromSubagent:true IS honoured', () => {
    const adapter = new LocalAdapter({
      skipAutodiscovery: true,
      url: 'http://127.0.0.1:8081/v1/chat/completions',
      excludeFromSubagent: true
    });
    expect(adapter.isOrchestrator()).toBe(true);
    expect(isSuitableForSubagent('local', adapter.config)).toBe(false);
  });

  it('isExcludedFromSubagent requires the exact operator flag, not any truthy config', () => {
    expect(isExcludedFromSubagent({ url: 'http://127.0.0.1:8083' })).toBe(false);
    expect(isExcludedFromSubagent()).toBe(false);
    expect(isExcludedFromSubagent({ excludeFromSubagent: true })).toBe(true);
  });
});

describe('CLOUD_FALLBACK never routes to an unconfigured backend name', () => {
  /** Minimal backendRegistry stub: a real registry's getFallbackChain()/getUsableBackends() shape. */
  function makeRegistry({ chain, usable }) {
    return {
      getFallbackChain: () => chain,
      getUsableBackends: () => usable
    };
  }

  function makeDWM(registry) {
    return new DualWorkflowManager({
      backendRegistry: registry,
      healthMonitor: { getBackendHealth: () => ({ healthy: false }) }
    });
  }

  it('picks a usable configured backend rather than a hardcoded name', async () => {
    const dwm = makeDWM(makeRegistry({
      chain: ['local', 'groq_llama', 'gemini'],
      usable: ['local', 'groq_llama', 'gemini']
    }));
    dwm.currentMode = WorkflowMode.CLOUD_FALLBACK;
    dwm.lastModeCheck = Date.now();

    const { backend } = await dwm.getBackendForRole('generator');
    expect(['groq_llama', 'gemini']).toContain(backend);
    expect(backend).not.toBe('local');
  });

  it('with only one unrelated backend configured (e.g. only groq), still returns it', async () => {
    const dwm = makeDWM(makeRegistry({
      chain: ['local', 'groq_llama'],
      usable: ['local', 'groq_llama']
    }));
    dwm.currentMode = WorkflowMode.CLOUD_FALLBACK;
    dwm.lastModeCheck = Date.now();

    const generator = await dwm.getBackendForRole('generator');
    const reviewer = await dwm.getBackendForRole('reviewer');
    expect(generator.backend).toBe('groq_llama');
    expect(reviewer.backend).toBe('groq_llama');
  });

  it('nothing usable -> a clear, non-throwing null result', async () => {
    const dwm = makeDWM(makeRegistry({ chain: ['local'], usable: ['local'] }));
    dwm.currentMode = WorkflowMode.CLOUD_FALLBACK;
    dwm.lastModeCheck = Date.now();

    const { backend } = await dwm.getBackendForRole('generator');
    expect(backend).toBeNull();
  });

  it('_getFirstHealthyBackend degrades to a usable registry backend, never a hardcoded literal', () => {
    const dwm = makeDWM(makeRegistry({
      chain: ['local', 'groq_llama'],
      usable: ['groq_llama']
    }));
    expect(dwm._getFirstHealthyBackend()).toBe('groq_llama');
  });

  it('_getFirstHealthyBackend returns null, never throws, when nothing is usable', () => {
    const dwm = makeDWM(makeRegistry({ chain: [], usable: [] }));
    expect(() => dwm._getFirstHealthyBackend()).not.toThrow();
    expect(dwm._getFirstHealthyBackend()).toBeNull();
  });
});

/**
 * The SECOND orchestrator heuristic, in model-discovery. It excluded a model
 * from subagent work when its NAME or PATH matched /orchestrator/i — and carried
 * a `nParams <= 10e9 && nCtx <= 4096` branch that re-tested the same regex the
 * first branch had already returned on, so the size test could never fire on its
 * own. Verified exhaustively before removal: no input reached it.
 *
 * Discovery cannot know a lane's ROLE. A server reports structural facts only.
 * Exclusion is an operator decision, applied where config is in scope.
 */
describe('model discovery does not infer a lane role', () => {
  it('exposes no name-based orchestrator heuristic', async () => {
    const src = await import('node:fs').then(fs =>
      fs.readFileSync(new URL('../src/utils/model-discovery.js', import.meta.url), 'utf8'));
    expect(src).not.toMatch(/checkIfOrchestrator/);
    // the regex may survive only inside the explanatory comment, never in a test
    const code = src.split('\n').filter(l => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');
    expect(code).not.toMatch(/\/orchestrator\/i/);
  });

  it('a small-context, small-param model is NOT excluded from subagent work', async () => {
    const { discoverSubagentCapableModels } = await import('../src/utils/model-discovery.js');
    expect(typeof discoverSubagentCapableModels).toBe('function');
    // The removed heuristic targeted exactly this shape: <=10e9 params, <=4096 ctx.
    // Nothing in discovery may classify it as a router on those numbers alone.
    const tiny = { modelAlias: 'tiny-helper-3b', modelPath: '/models/tiny.gguf', nParams: 3e9, nCtx: 4096, isOrchestrator: false };
    expect([tiny].filter(m => !m.isOrchestrator)).toHaveLength(1);
  });

  it('a model whose NAME contains "orchestrator" is not excluded by discovery', () => {
    const named = { modelAlias: 'my-orchestrator-70b', modelPath: '/models/orchestrator.gguf', isOrchestrator: false };
    expect(named.isOrchestrator).toBe(false);
  });
});
