/**
 * @fileoverview A backend the CALLER NAMED gets exactly ONE attempt.
 *
 * The API keys this bridge uses are the operator's own, so silently cascading
 * off a lane the caller explicitly asked for can spend their credit on lanes
 * they never chose. `BackendRegistry#selectBackend` now marks that ONE branch
 * with `explicit: true`; the handlers thread it into the request options as
 * `noFallback`, and `makeRequestWithFallback` honours it.
 *
 * A RESOLVED backend — `auto`, a routing override, the content-length branch —
 * is unaffected and must keep cascading exactly as before.
 *
 * Stubbing follows tests/retry-timeout-per-attempt.test.js and
 * tests/truncation-no-cloud-escalation.test.js: build the handler, then
 * monkey-patch makeRequest and the network-touching helpers. Nothing here
 * touches the network. Backend names below are deliberately fictional
 * (`operator_named_lane`, `operator_other_lane`) so nothing can pass by virtue
 * of a real backend's name.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import { BackendRegistry } from '../src/backends/backend-registry.js';
import { AnalyzeFileHandler } from '../src/handlers/analyze-file-handler.js';
import { ModifyFileHandler } from '../src/handlers/modify-file-handler.js';

const NAMED = 'operator_named_lane';
const OTHER = 'operator_other_lane';

/**
 * Registry with hand-built adapters, so makeRequestWithFallback walks a real
 * chain. `calls` records every adapter actually contacted, in order.
 */
function makeRegistry({ failing = [], circuitOpen = [], chain = [NAMED, OTHER] } = {}) {
  const registry = new BackendRegistry();
  const calls = [];
  for (const name of chain) {
    registry.adapters.set(name, {
      circuitOpen: circuitOpen.includes(name),
      execute: async () => {
        calls.push(name);
        if (failing.includes(name)) throw new Error(`${name} exploded`);
        return { content: `answer from ${name}` };
      }
    });
  }
  registry.fallbackChain = [...chain];
  return { registry, calls };
}

describe('BackendRegistry: a caller-named lane gets one attempt', () => {
  it('does not cascade, and reports the named lane failing rather than "All backends failed"', async () => {
    const { registry, calls } = makeRegistry({ failing: [NAMED] });

    await expect(
      registry.makeRequestWithFallback('prompt', NAMED, { noFallback: true })
    ).rejects.toThrow(new RegExp(`Backend "${NAMED}" was named by the caller`));

    // Exactly one attempt, and the other lane was never contacted.
    expect(calls).toEqual([NAMED]);
  });

  it('names the underlying error and a concrete next step, and never invents a backend name', async () => {
    const { registry } = makeRegistry({ failing: [NAMED] });

    let thrown;
    try {
      await registry.makeRequestWithFallback('prompt', NAMED, { noFallback: true });
    } catch (error) {
      thrown = error;
    }

    expect(thrown.message).toContain(`${NAMED} exploded`);
    expect(thrown.message).toContain('backend "auto"');
    expect(thrown.message).not.toContain('All backends failed');
    // Model-agnosticism: the only backend name in the message is the caller's own.
    expect(thrown.message).not.toContain(OTHER);
  });

  it('distinguishes "never got to try" from "tried and failed"', async () => {
    // Circuit open on the named lane: no request is issued at all.
    const open = makeRegistry({ circuitOpen: [NAMED] });
    let openError;
    try {
      await open.registry.makeRequestWithFallback('prompt', NAMED, { noFallback: true });
    } catch (error) {
      openError = error;
    }
    expect(openError.message).toContain('could not be attempted at all');
    expect(openError.message).not.toContain('one attempt failed');
    expect(open.calls).toEqual([]);

    // Not registered at all: same class of failure, same distinct message.
    const missing = makeRegistry({ chain: [OTHER] });
    let missingError;
    try {
      await missing.registry.makeRequestWithFallback('prompt', NAMED, { noFallback: true });
    } catch (error) {
      missingError = error;
    }
    expect(missingError.message).toContain('could not be attempted at all');
    expect(missing.calls).toEqual([]);

    // And it is a DIFFERENT message from the tried-and-failed case.
    const failed = makeRegistry({ failing: [NAMED] });
    let failedError;
    try {
      await failed.registry.makeRequestWithFallback('prompt', NAMED, { noFallback: true });
    } catch (error) {
      failedError = error;
    }
    expect(failedError.message).not.toBe(openError.message);
    expect(failedError.message).toContain('one attempt failed');
  });

  it('still cascades when noFallback is absent — a RESOLVED lane is unchanged', async () => {
    const { registry, calls } = makeRegistry({ failing: [NAMED] });

    const result = await registry.makeRequestWithFallback('prompt', NAMED, {});

    expect(result.backend).toBe(OTHER);
    expect(result.content).toBe(`answer from ${OTHER}`);
    expect(calls).toEqual([NAMED, OTHER]);
    expect(result.fallbackChain).toEqual([NAMED]);
  });
});

describe('BackendRegistry#selectBackend: explicit marks ONLY the named branch', () => {
  function registryWithBackends() {
    const registry = new BackendRegistry();
    registry.getUsableBackends = () => [NAMED, OTHER];
    registry.getFallbackChain = () => [NAMED, OTHER];
    registry.getBackend = (name) => ({ name, type: name === NAMED ? 'local' : 'cloud' });
    return registry;
  }

  it('flags a caller-named backend', () => {
    expect(registryWithBackends().selectBackend(NAMED).explicit).toBe(true);
  });

  it('does NOT flag auto', () => {
    const result = registryWithBackends().selectBackend('auto');
    expect(result.backend).toBe(NAMED);
    expect(result.explicit).toBeUndefined();
  });

  it('does NOT flag a routing-override-resolved backend', () => {
    const registry = registryWithBackends();
    registry.registerRoutingOverride('some-handler', () => OTHER);
    const result = registry.selectBackend('auto', { handlerType: 'some-handler' });
    expect(result.backend).toBe(OTHER);
    expect(result.explicit).toBeUndefined();
  });

  it('does NOT flag a content-length-resolved backend', () => {
    const result = registryWithBackends().selectBackend('auto', { contentLength: 50000 });
    expect(result.backend).toBe(OTHER);
    expect(result.explicit).toBeUndefined();
  });

  it('does NOT flag the no-usable-backend branch', () => {
    const registry = registryWithBackends();
    registry.getUsableBackends = () => [];
    registry.getFallbackChain = () => [];
    const result = registry.selectBackend('auto');
    expect(result.backend).toBeNull();
    expect(result.explicit).toBeUndefined();
  });
});

/**
 * End-to-end through a handler: the registry decides explicitness, the handler
 * threads it, and the registry's own fallback walk honours it. The real
 * BaseHandler.makeRequest -> router -> registry path runs (no makeRequest
 * stub), so this proves the wiring, not just the registry.
 */
function wireHandler(handler, { failing, circuitOpen, chain } = {}) {
  const names = chain || [NAMED, OTHER];
  const { registry, calls } = makeRegistry({ failing, circuitOpen, chain: names });
  registry.getUsableBackends = () => names;
  registry.getFallbackChain = () => names;
  registry.getBackend = (name) => ({ name, type: name === NAMED ? 'local' : 'cloud' });
  registry.getKeyStatus = () => ({ configured: true });

  handler.backendRegistry = registry;
  handler.router = {
    makeRequestWithFallback: (prompt, backend, options) =>
      registry.makeRequestWithFallback(prompt, backend, options)
  };
  handler.getContextLimit = async () => ({ charLimit: 500000, model: 'test-model' });
  handler.checkDualModeAvailable = async () => false;
  handler.calculateDynamicTokens = () => 1000;
  handler.capacityFor = async () => 500000;
  handler.capacityTokensFor = async () => 100000;
  return calls;
}

describe('analyze_file: naming a lane end-to-end stops the cascade', () => {
  let tmpDir;
  afterEach(async () => {
    if (tmpDir) await fsp.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  async function fixture() {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-named-lane-'));
    const filePath = path.join(tmpDir, 'sample.js');
    await fsp.writeFile(filePath, 'export const x = 1;\n', 'utf8');
    return filePath;
  }

  it('a named lane that fails is tried once and reported as the named lane', async () => {
    const filePath = await fixture();
    const handler = new AnalyzeFileHandler({});
    const calls = wireHandler(handler, { failing: [NAMED] });

    // analyze_file rethrows a backend failure to the caller.
    let thrown;
    try {
      await handler.execute({
        filePath,
        question: 'what does this do?',
        options: { backend: NAMED }
      });
    } catch (error) {
      thrown = error;
    }

    expect(calls).toEqual([NAMED]);
    expect(thrown.message).toContain(`Backend "${NAMED}" was named by the caller`);
    expect(thrown.message).toContain('its one attempt failed');
    expect(thrown.message).not.toContain('All backends failed');
  });

  it('auto still cascades: the first lane fails and a later lane answers', async () => {
    const filePath = await fixture();
    const handler = new AnalyzeFileHandler({});
    const calls = wireHandler(handler, { failing: [NAMED] });

    const result = await handler.execute({
      filePath,
      question: 'what does this do?',
      options: { backend: 'auto' }
    });

    // auto resolved to the local lane, it failed, and the cascade reached the next one.
    expect(calls).toEqual([NAMED, OTHER]);
    expect(result.success).toBe(true);
    expect(result.summary).toContain(`answer from ${OTHER}`);
  });

  it('a content-length-resolved lane still cascades', async () => {
    const filePath = await fixture();
    const handler = new AnalyzeFileHandler({});
    // >40000 chars resolves to the non-local lane; make IT fail and prove the
    // walk continues onto the other lane.
    const calls = wireHandler(handler, { failing: [OTHER] });
    handler.selectBackend = (requested, context) =>
      handler.backendRegistry.selectBackend(requested, { ...context, contentLength: 50000 });

    const result = await handler.execute({
      filePath,
      question: 'what does this do?',
      options: { backend: 'auto' }
    });

    expect(calls).toEqual([OTHER, NAMED]);
    expect(result.success).toBe(true);
    expect(result.summary).toContain(`answer from ${NAMED}`);
  });

  it('a routing-override-resolved lane still cascades', async () => {
    const filePath = await fixture();
    const handler = new AnalyzeFileHandler({});
    const calls = wireHandler(handler, { failing: [OTHER] });
    handler.backendRegistry.registerRoutingOverride(handler.handlerType, () => OTHER);

    const result = await handler.execute({
      filePath,
      question: 'what does this do?',
      options: { backend: 'auto' }
    });

    expect(calls).toEqual([OTHER, NAMED]);
    expect(result.success).toBe(true);
    expect(result.summary).toContain(`answer from ${NAMED}`);
  });

  it('a named lane that is unavailable is never contacted and says so', async () => {
    const filePath = await fixture();
    const handler = new AnalyzeFileHandler({});
    const calls = wireHandler(handler, { circuitOpen: [NAMED] });

    let thrown;
    try {
      await handler.execute({
        filePath,
        question: 'what does this do?',
        options: { backend: NAMED }
      });
    } catch (error) {
      thrown = error;
    }

    expect(calls).toEqual([]);
    expect(thrown.message).toContain('could not be attempted at all');
  });
});

describe('modify_file: the handler-level error escalation also respects a named lane', () => {
  let tmpDir;
  afterEach(async () => {
    if (tmpDir) await fsp.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  it('does not escalate off a named local lane after a failure', async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-named-lane-mod-'));
    const filePath = path.join(tmpDir, 'const.js');
    await fsp.writeFile(filePath, 'const x = 1;\n', 'utf8');

    const handler = new ModifyFileHandler({});
    handler.getContextLimit = async () => ({ charLimit: 500000, model: 'test-model' });
    handler.checkDualModeAvailable = async () => false;
    handler.calculateDynamicTokens = () => 1000;
    handler.backendRegistry = {
      registerRoutingOverride: () => {},
      selectBackend: (requested) =>
        (requested && requested !== 'auto'
          ? { backend: requested, explicit: true }
          : { backend: 'local' }),
      getUsableBackends: () => ['local', OTHER],
      getFallbackChain: () => ['local', OTHER],
      getBackend: (name) => ({ name, type: name === 'local' ? 'local' : 'cloud' }),
      getAdapter: () => null,
      getKeyStatus: () => ({ configured: true })
    };

    const seen = [];
    handler.makeRequest = async (prompt, backend, options) => {
      seen.push({ backend, noFallback: options.noFallback });
      throw new Error(`Backend "${backend}" was named by the caller and its one attempt failed`);
    };

    await expect(handler.execute({
      filePath,
      instructions: 'change x to 2',
      options: { backend: 'local', dryRun: true }
    })).rejects.toThrow();

    // One lane only: the local retries stay on the caller's lane and the
    // handler-level cloud escalation never fires.
    expect([...new Set(seen.map(s => s.backend))]).toEqual(['local']);
    expect(seen.every(s => s.noFallback === true)).toBe(true);
  });
});
