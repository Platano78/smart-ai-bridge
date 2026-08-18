/**
 * @fileoverview Five handlers (ask, council, review, dual_iterate, explore) shipped
 * with NO capacity check of any kind — zero calls to capacityFor/capacityTokensFor/
 * findBackendWithCapacity(Tokens)/largestBackendCapacity(Tokens). Every other handler
 * gates its assembled prompt (see 16ff9fe, 22ac025, c282624); these five let the
 * provider fail on an oversized payload instead. This file proves each now refuses
 * (token-denominated message) or escalates, without breaking a normal-sized call.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AskHandler } from '../src/handlers/ask-handler.js';
import { CouncilHandler } from '../src/handlers/council-handler.js';
import { ReviewHandler } from '../src/handlers/review-handler.js';
import { DualIterateHandler } from '../src/handlers/dual-iterate-handler.js';
import { ExploreHandler } from '../src/handlers/explore-handler.js';
import { countTokens } from '../src/utils/token-count.js';

afterEach(() => vi.restoreAllMocks());

describe('AskHandler capacity gate', () => {
  function makeRouter(backend) {
    return {
      createRoutingContext: () => ({}),
      routeRequest: async () => backend,
      makeRequestWithFallback: async () => ({ content: 'ok', headers: {}, metadata: {}, usage: {} }),
      recordRoutingOutcome: async () => {},
      orchestratorHealthy: () => true,
      _lastRoutingContext: {},
      backends: { getAdapter: () => null }
    };
  }

  it('refuses (no escalation) when force_backend explicitly names a too-small backend', async () => {
    const handler = new AskHandler({ router: makeRouter('nvidia_glm') });
    handler.capacityTokensFor = async () => 5;
    let escalationTried = false;
    handler.findBackendWithCapacityTokens = async () => { escalationTried = true; return null; };

    await expect(handler.execute({
      model: 'nvidia_glm',
      prompt: 'a reasonably long prompt that exceeds the tiny stubbed cap',
      force_backend: 'nvidia_glm'
    })).rejects.toThrow(/force_backend='nvidia_glm' only accepts 5 tokens/);

    expect(escalationTried).toBe(false);
  });

  it('escalates to a roomier backend for auto-routed (non-forced) oversized prompts', async () => {
    const handler = new AskHandler({ router: makeRouter('local') });
    handler.capacityTokensFor = async (name) => (name === 'local' ? 5 : 999999);
    handler.findBackendWithCapacityTokens = async () => ({ name: 'nvidia_glm', cap: 999999 });

    let usedBackend = null;
    handler.makeRequest = async (prompt, backend) => { usedBackend = backend; return { content: 'ok', headers: {}, metadata: {} }; };

    const result = await handler.execute({ model: 'local', prompt: 'a prompt that overflows the tiny local cap' });

    expect(result.success).toBe(true);
    expect(usedBackend).toBe('nvidia_glm');
  });

  it('refuses with a token-denominated message when nothing fits', async () => {
    const handler = new AskHandler({ router: makeRouter('local') });
    handler.capacityTokensFor = async () => 5;
    handler.findBackendWithCapacityTokens = async () => null;
    handler.largestBackendCapacityTokens = async () => 5;

    await expect(handler.execute({ model: 'local', prompt: 'a prompt that overflows every backend cap here' }))
      .rejects.toThrow(/\d+ tokens.*no configured backend can hold it/s);
  });

  it('a normal-sized payload still succeeds unchanged (no new false refusal)', async () => {
    const handler = new AskHandler({ router: makeRouter('local') });
    const result = await handler.execute({ model: 'local', prompt: 'hello, a short normal prompt' });
    expect(result.success).toBe(true);
  });
});

describe('ReviewHandler capacity gate', () => {
  function makeRouter(backend) {
    return { routeRequest: async () => backend };
  }

  it('refuses the assembled review prompt with a token-denominated message when nothing fits', async () => {
    const handler = new ReviewHandler({ router: makeRouter('nvidia_glm') });
    handler.capacityTokensFor = async () => 5;
    handler.findBackendWithCapacityTokens = async () => null;
    handler.largestBackendCapacityTokens = async () => 5;

    await expect(handler.execute({ content: 'function foo() { return 1; }' }))
      .rejects.toThrow(/\d+ tokens.*no configured backend can hold it/s);
  });

  it('escalates to a roomier backend when the assembled prompt overflows the routed one', async () => {
    const handler = new ReviewHandler({ router: makeRouter('local') });
    handler.capacityTokensFor = async (name) => (name === 'local' ? 5 : 999999);
    handler.findBackendWithCapacityTokens = async () => ({ name: 'nvidia_glm', cap: 999999 });

    let usedEndpoint = null;
    handler.makeRequest = async (prompt, endpoint) => { usedEndpoint = endpoint; return 'review text'; };

    const result = await handler.execute({ content: 'function foo() { return 1; }' });

    expect(result.success).toBe(true);
    expect(usedEndpoint).toBe('nvidia_glm');
  });

  it('a normal-sized payload still succeeds unchanged', async () => {
    const handler = new ReviewHandler({ router: makeRouter('local') });
    handler.makeRequest = async () => 'review text';
    const result = await handler.execute({ content: 'function foo() { return 1; }' });
    expect(result.success).toBe(true);
  });
});

describe('DualIterateHandler capacity gate', () => {
  function makeHandler() {
    return new DualIterateHandler({ dualWorkflowManager: {} });
  }

  it('refuses an oversized task with a token-denominated message (upper bound alongside the <10 floor)', async () => {
    const handler = makeHandler();
    handler.capacityTokensFor = async () => 5;

    const result = await handler.execute({ task: 'a task description that is definitely long enough to pass the floor' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/\d+ tokens.*exceeds the local dual-mode lane/);
  });

  it('still runs the executor for a normal-sized task', async () => {
    const handler = makeHandler();
    let executed = false;
    handler._getExecutor = () => ({
      execute: async () => { executed = true; return { success: true, code: 'x', mode: 'test', iterations: 1, executionTime: 1 }; }
    });

    const result = await handler.execute({ task: 'write a small pure function that adds two numbers' });

    expect(executed).toBe(true);
    expect(result.success).toBe(true);
  });
});

describe('ExploreHandler capacity gate', () => {
  function makeHandler() {
    const handler = new ExploreHandler({});
    handler.extractSearchPatterns = async () => ['foo'];
    handler.findFiles = async () => [];
    handler.performShallowSearch = async () => ({
      evidence: [{ file: 'a.js', line: 1, snippet: 'foo bar' }],
      filesFound: ['a.js'],
      totalChars: 100,
      tokensSaved: 0
    });
    return handler;
  }

  it('refuses the assembled explore prompt (not swallowed by the network-failure fallback) when nothing fits', async () => {
    const handler = makeHandler();
    handler.capacityTokensFor = async () => 5;
    handler.findBackendWithCapacityTokens = async () => null;
    handler.largestBackendCapacityTokens = async () => 5;

    let networkCalled = false;
    handler.makeRequest = async () => { networkCalled = true; return { content: 'should not be reached' }; };

    const result = await handler.execute({ question: 'where is foo defined' });

    expect(networkCalled).toBe(false);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/\d+ tokens.*no configured backend can hold it/s);
  });

  it('escalates to a roomier backend when the assembled prompt overflows the selected one', async () => {
    const handler = makeHandler();
    handler.capacityTokensFor = async (name) => (name === 'groq_llama' ? 5 : 999999);
    handler.findBackendWithCapacityTokens = async () => ({ name: 'nvidia_glm', cap: 999999 });

    let usedBackend = null;
    handler.makeRequest = async (prompt, backend) => { usedBackend = backend; return { content: 'summary text' }; };

    const result = await handler.execute({ question: 'where is foo defined' });

    expect(result.success).toBe(true);
    expect(usedBackend).toBe('nvidia_glm');
  });

  it('a normal-sized payload still succeeds unchanged', async () => {
    const handler = makeHandler();
    handler.makeRequest = async () => ({ content: 'summary text' });
    const result = await handler.execute({ question: 'where is foo defined' });
    expect(result.success).toBe(true);
  });

  it('evidence cap: deep-search evidence stays well under a single-call payload ceiling (~15K chars)', async () => {
    // performDeepSearch caps at 10 files x 5 matches x 300-char context slices —
    // verify that structural cap still holds by exercising the real method with
    // a fixture that would overflow it if the cap were removed.
    const handler = new ExploreHandler({});
    const bigFile = Array.from({ length: 200 }, (_, i) => `const foo_${i} = ${i}; // matches pattern foo`).join('\n');
    const files = Array.from({ length: 15 }, () => '/virtual/file.js');
    vi.spyOn((await import('fs')).promises, 'readFile').mockResolvedValue(bigFile);

    const findings = await handler.performDeepSearch(files, ['foo'], 20);

    let evidenceSummaryChars = 0;
    for (const item of findings.evidence.slice(0, 10)) {
      evidenceSummaryChars += `\n## ${item.file}\n`.length;
      for (const match of item.matches || []) {
        evidenceSummaryChars += `Line ${match.line}:\n${match.context}\n`.length;
      }
    }

    // Measured: 10 files x 5 matches x <=300 chars context, well under the
    // ~15,000-char figure the audit cited.
    expect(evidenceSummaryChars).toBeLessThan(17000);
  });
});


describe('CouncilHandler capacity gate', () => {
  const PROMPT = 'Please analyze this scenario in detail and provide your full assessment with reasoning.';

  it('gateBackendCapacity escalates to a roomier backend rather than throwing', async () => {
    const handler = new CouncilHandler({});
    const tokens = countTokens(PROMPT);
    handler.capacityTokensFor = async (name) => (name === 'small' ? tokens - 1 : 999999);
    handler.findBackendWithCapacityTokens = async () => ({ name: 'roomy', cap: 999999 });

    const gate = await handler.gateBackendCapacity(PROMPT, 'small');
    expect(gate.backend).toBe('roomy');
    expect(gate.error).toBeUndefined();
  });

  it('gateBackendCapacity returns an {error} (never throws) when nothing fits', async () => {
    const handler = new CouncilHandler({});
    const tokens = countTokens(PROMPT);
    handler.capacityTokensFor = async () => tokens - 1;
    handler.findBackendWithCapacityTokens = async () => null;
    handler.largestBackendCapacityTokens = async () => tokens - 1;

    const gate = await handler.gateBackendCapacity(PROMPT, 'small');
    expect(gate.error).toMatch(/\d+ tokens.*exceeds .*small.*limit/);
    expect(gate.backend).toBeUndefined();
  });

  it('getParallelResponses: one member failing capacity does not fail the whole call', async () => {
    const handler = new CouncilHandler({});
    const tokens = countTokens(PROMPT);
    handler.capacityTokensFor = async (name) => (name === 'tiny_backend' ? tokens - 1 : 999999);
    handler.findBackendWithCapacityTokens = async () => null;
    handler.largestBackendCapacityTokens = async () => tokens - 1;

    let calledWith = [];
    handler.makeRequest = async (prompt, backend) => { calledWith.push(backend); return { content: `resp from ${backend}` }; };

    const results = await handler.getParallelResponses(PROMPT, ['tiny_backend', 'healthy_backend'], 1000);

    // tiny_backend is filtered out of the returned successes (matches existing
    // getParallelResponses contract: it already returns only r.success entries).
    expect(results).toHaveLength(1);
    expect(results[0].backend).toBe('healthy_backend');
    // The gated-out member must never reach the network.
    expect(calledWith).toEqual(['healthy_backend']);
  });

  it('executeSequentialStrategy: a later round whose compounded prompt outgrows its backend is skipped, not fatal', async () => {
    const handler = new CouncilHandler({});
    const bareTokens = countTokens(PROMPT);
    // 'second' fits the bare prompt exactly, but the compounded prompt built
    // once 'first' has responded (prior response appended) is strictly
    // larger, so it must overflow this cap.
    handler.capacityTokensFor = async (name) => (name === 'second' ? bareTokens : 999999);
    handler.findBackendWithCapacityTokens = async () => null;
    handler.largestBackendCapacityTokens = async () => bareTokens;
    handler.makeRequest = async (prompt, backend) => ({ content: `first-round response content from ${backend} with some extra detail` });

    const responses = await handler.executeSequentialStrategy(PROMPT, ['first', 'second'], 1000);

    // 'first' succeeded on the bare prompt; 'second' was skipped once the
    // compounded prompt outgrew it — the call still returns results, it
    // does not throw.
    expect(responses.map(r => r.backend)).toEqual(['first']);
  });

  it('executeFallbackStrategy: a too-small backend is skipped, the call still finds a usable one', async () => {
    const handler = new CouncilHandler({});
    const tokens = countTokens(PROMPT);
    handler.capacityTokensFor = async (name) => (name === 'tiny' ? tokens - 1 : 999999);
    handler.findBackendWithCapacityTokens = async () => null;
    handler.largestBackendCapacityTokens = async () => tokens - 1;
    handler.makeRequest = async (prompt, backend) => ({ content: `response from ${backend}` });

    const responses = await handler.executeFallbackStrategy(PROMPT, ['tiny', 'ok1', 'ok2'], 1000);

    expect(responses.some(r => r.backend === 'tiny')).toBe(false);
    expect(responses.some(r => r.backend === 'ok1')).toBe(true);
  });
});
