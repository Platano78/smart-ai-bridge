/**
 * @fileoverview Follow-up A — dynamic_tokens must be null (present, not absent) when
 * the request is uncapped, at BOTH ask-handler reporting sites (main + chunked path).
 * Reporting the discarded tiering number would re-create the misleading-budget defect
 * the 'uncapped' max_tokens sentinel exists to prevent.
 */
import { describe, it, expect, vi } from 'vitest';
import { AskHandler } from '../src/handlers/ask-handler.js';

function makeFakeRouter({ backend, omitDefaultMaxTokens, content = 'a short response' }) {
  return {
    createRoutingContext: () => ({}),
    routeRequest: async () => backend,
    makeRequestWithFallback: async () => ({ content, headers: {}, metadata: {}, usage: {} }),
    recordRoutingOutcome: async () => {},
    orchestratorHealthy: () => true,
    _lastRoutingContext: {},
    backends: {
      getAdapter: (name) => (name === backend ? { omitDefaultMaxTokens } : null)
    }
  };
}

describe('AskHandler dynamic_tokens sentinel', () => {
  it('main path (ask-handler.js:226): dynamic_tokens is present and null when uncapped', async () => {
    const handler = new AskHandler({ router: makeFakeRouter({ backend: 'local', omitDefaultMaxTokens: true }) });

    const result = await handler.execute({ model: 'local', prompt: 'hello' });

    expect('dynamic_tokens' in result).toBe(true);
    expect(result.dynamic_tokens).toBeNull();
  });

  it('main path: dynamic_tokens is a real number for a capped/cloud backend', async () => {
    const handler = new AskHandler({ router: makeFakeRouter({ backend: 'groq_llama', omitDefaultMaxTokens: false }) });

    const result = await handler.execute({ model: 'groq_llama', prompt: 'hello' });

    expect(typeof result.dynamic_tokens).toBe('number');
  });

  it('chunked path (ask-handler.js:170): dynamic_tokens is present and null when uncapped', async () => {
    // Force wasTruncated=true via a trailing-ellipsis textual indicator so the chunked
    // branch executes, independent of the (null, uncapped) numeric near-limit check.
    const router = makeFakeRouter({ backend: 'local', omitDefaultMaxTokens: true, content: 'cut off...' });
    const handler = new AskHandler({ router });
    vi.spyOn(handler, 'performChunkedGeneration').mockResolvedValue('joined chunks');

    const result = await handler.execute({ model: 'local', prompt: 'hello', enable_chunking: true });

    expect(result.chunked).toBe(true);
    expect('dynamic_tokens' in result).toBe(true);
    expect(result.dynamic_tokens).toBeNull();
  });

  it('does not call calculateDynamicTokens at all when uncapped (wasted-work guard)', async () => {
    const handler = new AskHandler({ router: makeFakeRouter({ backend: 'local', omitDefaultMaxTokens: true }) });
    const spy = vi.spyOn(handler, 'calculateDynamicTokens');

    await handler.execute({ model: 'local', prompt: 'hello' });

    expect(spy).not.toHaveBeenCalled();
  });
});
