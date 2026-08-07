/**
 * @fileoverview 1.1b — ask-handler skips token tiering for a local-fleet backend
 * with no explicit max_tokens, and reports a truthful sentinel (not undefined) at
 * BOTH response sites (chunked and main path).
 */
import { describe, it, expect } from 'vitest';
import { AskHandler } from '../src/handlers/ask-handler.js';

function makeFakeRouter({ backend, omitDefaultMaxTokens }) {
  return {
    createRoutingContext: () => ({}),
    routeRequest: async () => backend,
    makeRequestWithFallback: async () => ({
      content: 'a short response',
      headers: {},
      metadata: {},
      usage: {}
    }),
    recordRoutingOutcome: async () => {},
    orchestratorHealthy: () => true,
    _lastRoutingContext: {},
    backends: {
      getAdapter: (name) => (name === backend ? { omitDefaultMaxTokens } : null)
    }
  };
}

describe('AskHandler local-fleet uncapped reporting', () => {
  it('reports max_tokens: "uncapped" (not undefined/a fabricated number) for a local-fleet backend with no explicit cap', async () => {
    const handler = new AskHandler({ router: makeFakeRouter({ backend: 'local', omitDefaultMaxTokens: true }) });

    const result = await handler.execute({ model: 'local', prompt: 'hello' });

    expect(result.max_tokens).toBe('uncapped');
    expect(result.max_tokens).not.toBeUndefined();
  });

  it('still reports a real numeric budget for a capped/cloud backend', async () => {
    const handler = new AskHandler({ router: makeFakeRouter({ backend: 'groq_llama', omitDefaultMaxTokens: false }) });

    const result = await handler.execute({ model: 'groq_llama', prompt: 'hello' });

    expect(typeof result.max_tokens).toBe('number');
  });

  it('an explicit max_tokens always wins, even for a local-fleet backend', async () => {
    const handler = new AskHandler({ router: makeFakeRouter({ backend: 'local', omitDefaultMaxTokens: true }) });

    const result = await handler.execute({ model: 'local', prompt: 'hello', max_tokens: 512 });

    expect(result.max_tokens).toBe(512);
  });
});
