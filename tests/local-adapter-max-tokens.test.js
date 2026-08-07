/**
 * @fileoverview 1.1a — local backend stops capping max_tokens by default.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { LocalAdapter } from '../src/backends/local-adapter.js';
import { NvidiaGlmAdapter } from '../src/backends/nvidia-adapter.js';

function makeLocalAdapter() {
  const adapter = new LocalAdapter({ skipAutodiscovery: true });
  adapter.initialized = true;
  adapter.config.url = 'http://test-local/v1/chat/completions';
  adapter.model = 'test-model';
  adapter.modelId = 'test-model';
  return adapter;
}

afterEach(() => vi.unstubAllGlobals());

describe('BackendAdapter.omitDefaultMaxTokens / buildRequestBody', () => {
  it('LocalAdapter.buildRequestBody omits max_tokens by default', () => {
    const body = makeLocalAdapter().buildRequestBody('hi', {});
    expect('max_tokens' in body).toBe(false);
  });

  it('LocalAdapter.buildRequestBody includes max_tokens when explicitly requested', () => {
    const body = makeLocalAdapter().buildRequestBody('hi', { maxTokens: 777 });
    expect(body.max_tokens).toBe(777);
  });

  it('a cloud adapter still carries its default budget (omitDefaultMaxTokens stays false)', () => {
    const adapter = new NvidiaGlmAdapter({ apiKey: 'fake-key' });
    const body = adapter.buildRequestBody('hi', {});
    expect('max_tokens' in body).toBe(true);
    expect(body.max_tokens).toBe(adapter.config.maxTokens);
  });
});

function stubFetchForMakeRequest() {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: 'test-model', status: { value: 'loaded' } }] })
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] })
    });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('LocalAdapter.makeRequest wire body + timeout trap', () => {
  it('sends no max_tokens on the wire by default', async () => {
    const adapter = makeLocalAdapter();
    const fetchMock = stubFetchForMakeRequest();

    await adapter.makeRequest('hello', {});

    const wireBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect('max_tokens' in wireBody).toBe(false);
  });

  it('sends the explicit max_tokens on the wire when the caller passes one', async () => {
    const adapter = makeLocalAdapter();
    const fetchMock = stubFetchForMakeRequest();

    await adapter.makeRequest('hello', { maxTokens: 777 });

    const wireBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(wireBody.max_tokens).toBe(777);
  });

  it('trap regression: an uncapped request still takes the DYNAMIC timeout path', async () => {
    const adapter = makeLocalAdapter();
    adapter.config.maxTokens = 65536; // well above the 4000 dynamic-timeout threshold
    adapter.config.timeout = 30000;
    const dynamicSpy = vi.spyOn(adapter, 'calculateDynamicTimeout');
    stubFetchForMakeRequest();

    await adapter.makeRequest('hello', {}); // no options.maxTokens -> uncapped wire body

    // requestedTokens (this.config.maxTokens) still sizes the timeout even though it's
    // no longer on the wire. If this regresses to `undefined > 4000` (false),
    // calculateDynamicTimeout is never called and the short static timeout wins.
    expect(dynamicSpy).toHaveBeenCalledWith(65536);
  });
});
