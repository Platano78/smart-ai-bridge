/**
 * @fileoverview Defect fix — performChunkedGeneration must not re-cap an uncapped
 * (local-fleet) request. `options.maxTokens || 4096` substituted an explicit 4096
 * for `undefined` (falsy), re-imposing exactly the cap item 1.1a removed. Every
 * continuation chunk on the wire would have carried max_tokens: 4096.
 */
import { describe, it, expect, vi } from 'vitest';
import { AskHandler } from '../src/handlers/ask-handler.js';

function makeFakeRouter({ backend, omitDefaultMaxTokens }) {
  let callCount = 0;
  return {
    createRoutingContext: () => ({}),
    routeRequest: async () => backend,
    // First call (the initial response) is truncated-looking to trigger chunking;
    // every subsequent call (inside the chunk loop) returns clean content so the
    // loop stops after one iteration.
    makeRequestWithFallback: async () => {
      callCount += 1;
      return {
        content: callCount === 1 ? 'this got cut off...' : 'a clean finished chunk.',
        headers: {},
        metadata: {},
        usage: {}
      };
    },
    recordRoutingOutcome: async () => {},
    orchestratorHealthy: () => true,
    _lastRoutingContext: {},
    backends: {
      getAdapter: (name) => (name === backend ? { omitDefaultMaxTokens } : null)
    }
  };
}

describe('performChunkedGeneration maxTokens passthrough', () => {
  it('an uncapped request stays uncapped through chunking — no numeric maxTokens substituted (proven RED without the fix)', async () => {
    const handler = new AskHandler({ router: makeFakeRouter({ backend: 'local', omitDefaultMaxTokens: true }) });
    const makeRequestSpy = vi.spyOn(handler, 'makeRequest');

    const result = await handler.execute({ model: 'local', prompt: 'hello', enable_chunking: true });

    expect(result.chunked).toBe(true);
    // Call 0 is the initial (pre-chunk) request; call 1 is the first chunk-loop request.
    expect(makeRequestSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    const chunkCallOptions = makeRequestSpy.mock.calls[1][2];
    expect(chunkCallOptions.maxTokens).toBeUndefined();
  });

  it('a capped/cloud request keeps its real numeric budget through chunking', async () => {
    const handler = new AskHandler({ router: makeFakeRouter({ backend: 'groq_llama', omitDefaultMaxTokens: false }) });
    const makeRequestSpy = vi.spyOn(handler, 'makeRequest');

    const result = await handler.execute({ model: 'groq_llama', prompt: 'hello', enable_chunking: true });

    expect(result.chunked).toBe(true);
    const chunkCallOptions = makeRequestSpy.mock.calls[1][2];
    expect(typeof chunkCallOptions.maxTokens).toBe('number');
  });
});
