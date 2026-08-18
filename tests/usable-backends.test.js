/**
 * @fileoverview Owner ruling: capacity search and error reporting must only
 * ever offer/quote a backend the caller can actually reach. An enabled
 * backend with no resolvable API key is not usable — getUsableBackends()
 * filters those out without changing what getEnabledBackends() means (the
 * stats count at backend-registry.js:631 depends on the latter staying as-is).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BackendRegistry } from '../src/backends/backend-registry.js';
import { AnalyzeFileHandler } from '../src/handlers/analyze-file-handler.js';

const ORIGINAL_ENV = { ...process.env };

function freshRegistry(backends) {
  const registry = new BackendRegistry({ autoInitialize: false });
  registry.loadConfig({ backends });
  return registry;
}

describe('BackendRegistry#getUsableBackends', () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.NVIDIA_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('always includes local (no key required) and excludes an enabled cloud backend with no key', () => {
    const registry = freshRegistry({
      local: { type: 'local', enabled: true, priority: 1, config: {} },
      openai_chatgpt: { type: 'openai', enabled: true, priority: 2, config: { model: 'gpt-5.2' } }
    });

    expect(registry.getEnabledBackends()).toEqual(expect.arrayContaining(['local', 'openai_chatgpt']));

    const usable = registry.getUsableBackends();
    expect(usable).toContain('local');
    expect(usable).not.toContain('openai_chatgpt');
  });

  it('includes a cloud backend once its env var key is present', () => {
    process.env.OPENAI_API_KEY = 'test-key-placeholder';
    const registry = freshRegistry({
      local: { type: 'local', enabled: true, priority: 1, config: {} },
      openai_chatgpt: { type: 'openai', enabled: true, priority: 2, config: { model: 'gpt-5.2' } }
    });

    expect(registry.getUsableBackends()).toContain('openai_chatgpt');
  });

  it('includes a cloud backend configured with a literal (non-$VAR) apiKey', () => {
    const registry = freshRegistry({
      local: { type: 'local', enabled: true, priority: 1, config: {} },
      groq_llama: { type: 'groq', enabled: true, priority: 2, config: { model: 'x', apiKey: 'literal-key' } }
    });

    expect(registry.getUsableBackends()).toContain('groq_llama');
  });

  it('excludes a disabled backend even if it has a key', () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const registry = freshRegistry({
      local: { type: 'local', enabled: true, priority: 1, config: {} },
      gemini: { type: 'gemini', enabled: false, priority: 2, config: { model: 'gemini-3-pro-preview' } }
    });

    expect(registry.getEnabledBackends()).not.toContain('gemini');
    expect(registry.getUsableBackends()).not.toContain('gemini');
  });
});

describe('BaseHandler capacity search: usable-only candidates', () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.NVIDIA_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('findBackendWithCapacity never returns a keyless backend, even when it would fit', async () => {
    const registry = freshRegistry({
      local: { type: 'local', enabled: true, priority: 1, config: {} },
      openai_chatgpt: { type: 'openai', enabled: true, priority: 2, context_limit: 128000, config: { model: 'gpt-5.2' } }
    });

    const handler = new AnalyzeFileHandler({ backendRegistry: registry });
    handler.getContextLimit = async () => ({ charLimit: 1000, model: 'test-model' });

    const result = await handler.findBackendWithCapacity(50000, ['local']);
    expect(result).toBeNull();
  });

  it('largestBackendCapacity ignores a large but keyless backend', async () => {
    const registry = freshRegistry({
      local: { type: 'local', enabled: true, priority: 1, config: {} },
      openai_chatgpt: { type: 'openai', enabled: true, priority: 2, context_limit: 128000, config: { model: 'gpt-5.2' } }
    });

    const handler = new AnalyzeFileHandler({ backendRegistry: registry });
    handler.getContextLimit = async () => ({ charLimit: 1000, model: 'test-model' });

    const largest = await handler.largestBackendCapacity();
    expect(largest).toBe(1000);
  });

  it('capacityUnfitReport names the would-fit-but-keyless backend and its env var', async () => {
    const registry = freshRegistry({
      local: { type: 'local', enabled: true, priority: 1, config: {} },
      openai_chatgpt: { type: 'openai', enabled: true, priority: 2, context_limit: 128000, config: { model: 'gpt-5.2' } }
    });

    const handler = new AnalyzeFileHandler({ backendRegistry: registry });
    handler.getContextLimit = async () => ({ charLimit: 1000, model: 'test-model' });

    const message = await handler.capacityUnfitReport(50000, ['local']);
    expect(message).toMatch(/no usable backend can hold it \(largest usable: 1000\)/);
    expect(message).toMatch(/openai_chatgpt would fit \(\d+\)/);
    expect(message).toMatch(/OPENAI_API_KEY/);
  });

  it('capacityUnfitReport omits the unusable-backend note when nothing unusable would have fit either', async () => {
    const registry = freshRegistry({
      local: { type: 'local', enabled: true, priority: 1, config: {} },
      openai_chatgpt: { type: 'openai', enabled: true, priority: 2, context_limit: 128000, config: { model: 'gpt-5.2' } }
    });

    const handler = new AnalyzeFileHandler({ backendRegistry: registry });
    handler.getContextLimit = async () => ({ charLimit: 1000, model: 'test-model' });

    const message = await handler.capacityUnfitReport(999999999, ['local']);
    expect(message).toMatch(/no usable backend can hold it/);
    expect(message).not.toMatch(/would fit/);
  });
});
