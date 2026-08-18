/**
 * @fileoverview Nothing should be configured, only examples — backends.json
 * ships with no pinned model for cloud lanes; a model is auto-selected from
 * the provider's own catalog (largest published input capacity, deterministic
 * tie-break) when none is configured, and an explicit config.model always
 * wins. Providers that publish no capacity data are left unconfigured rather
 * than guessed at, and the boot audit must say exactly what to type. All
 * network access is stubbed — no live calls, no key-shaped literals.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawnSync } from 'child_process';
import { writeFileSync, unlinkSync, mkdtempSync, cpSync, symlinkSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { selectModel, _resetCapacityDiscoveryCache } from '../src/backends/capacity-discovery.js';
import { BackendRegistry } from '../src/backends/backend-registry.js';
import { auditReadiness } from '../src/backends/readiness-audit.js';
import { GeminiAdapter } from '../src/backends/gemini-adapter.js';
import { GroqAdapter } from '../src/backends/groq-adapter.js';
import { OpenAIAdapter } from '../src/backends/openai-adapter.js';
import { NvidiaDeepSeekAdapter, NvidiaGlmAdapter } from '../src/backends/nvidia-adapter.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function jsonResponse(body, ok = true) {
  return { ok, json: async () => body };
}

const ORIGINAL_ENV = { ...process.env };
beforeEach(() => {
  _resetCapacityDiscoveryCache();
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

describe('selectModel', () => {
  it('chooses the model with the largest published input capacity (OpenAI-compatible catalog)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      data: [
        { id: 'small-model', context_window: 8192 },
        { id: 'big-model', context_window: 131072 },
        { id: 'medium-model', context_window: 32768 }
      ]
    })));

    const backend = { name: 'groq_llama', type: 'groq', config: {} };
    const result = await selectModel(backend, 'fake-key');
    expect(result).toEqual({ id: 'big-model', inputTokens: 131072, outputTokens: null });
  });

  it('breaks a tied input capacity on published output capacity — never on the id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      data: [
        { id: 'zzz-model', context_window: 131072, max_completion_tokens: 8192 },
        { id: 'aaa-model', context_window: 131072, max_completion_tokens: 65536 }
      ]
    })));

    const backend = { name: 'groq_llama', type: 'groq', config: {} };
    const result = await selectModel(backend, 'fake-key');
    // aaa-model wins on output capacity (65536 > 8192) despite sorting after
    // zzz-model alphabetically — id spelling never decides.
    expect(result.id).toBe('aaa-model');
  });

  it('falls through to catalog order — the provider\'s own listing order — when input and output both tie', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      data: [
        { id: 'zzz-model', context_window: 65536, max_completion_tokens: 8192 },
        { id: 'aaa-model', context_window: 65536, max_completion_tokens: 8192 }
      ]
    })));

    const backend = { name: 'groq_llama', type: 'groq', config: {} };
    const result = await selectModel(backend, 'fake-key');
    // zzz-model is listed FIRST by the provider, so it wins despite sorting
    // after aaa-model alphabetically — catalog order, not id spelling, decides.
    expect(result.id).toBe('zzz-model');
  });

  it('reads inputTokenLimit from the Gemini catalog and normalizes the models/ prefix', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      models: [
        { name: 'models/gemini-flash', inputTokenLimit: 32768, outputTokenLimit: 8192 },
        { name: 'models/gemini-pro', inputTokenLimit: 1048576, outputTokenLimit: 65536 }
      ]
    })));

    const backend = { name: 'gemini', type: 'gemini', config: {} };
    const result = await selectModel(backend, 'fake-key');
    expect(result).toEqual({ id: 'gemini-pro', inputTokens: 1048576, outputTokens: 65536 });
  });

  it('returns null — never guesses — when the provider publishes no capacity field for any model (NIM shape)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      data: [
        { id: 'deepseek-ai/deepseek-v4-flash-0731', object: 'model', owned_by: 'deepseek-ai' },
        { id: 'z-ai/glm-5.2', object: 'model', owned_by: 'z-ai' }
      ]
    })));

    const backend = { name: 'nvidia_deepseek', type: 'nvidia_deepseek', config: {} };
    const result = await selectModel(backend, 'fake-key');
    expect(result).toBeNull();
  });

  it('never overrides an explicit config.model — returns null without calling fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const backend = { name: 'groq_llama', type: 'groq', config: { model: 'pinned-model' } };
    const result = await selectModel(backend, 'fake-key');
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never throws on a fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const backend = { name: 'groq_llama', type: 'groq', config: {} };
    await expect(selectModel(backend, 'fake-key')).resolves.toBeNull();
  });

  it('caches the selection within the TTL window (one fetch for two calls)', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ data: [{ id: 'x', context_window: 1000 }] }));
    vi.stubGlobal('fetch', fetchSpy);

    const backend = { name: 'groq_llama', type: 'groq', config: {} };
    await selectModel(backend, 'fake-key');
    await selectModel(backend, 'fake-key');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('BackendRegistry.discoverModels', () => {
  it('sets the adapter model when none is configured, from the largest-capacity catalog entry', async () => {
    process.env.GROQ_API_KEY = 'fake-groq-key';
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      data: [
        { id: 'small', context_window: 8192 },
        { id: 'big', context_window: 131072 }
      ]
    })));

    const registry = new BackendRegistry({ autoInitialize: false });
    registry.loadConfig({
      backends: {
        groq_llama: { type: 'groq', enabled: true, priority: 2, config: {} }
      }
    });

    await registry.discoverModels();

    expect(registry.getBackend('groq_llama').config.model).toBe('big');
    expect(registry.adapters.get('groq_llama').model).toBe('big');
  });

  it('never overrides an explicit config.model', async () => {
    process.env.GROQ_API_KEY = 'fake-groq-key';
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const registry = new BackendRegistry({ autoInitialize: false });
    registry.loadConfig({
      backends: {
        groq_llama: { type: 'groq', enabled: true, priority: 2, config: { model: 'pinned' } }
      }
    });

    await registry.discoverModels();

    expect(registry.getBackend('groq_llama').config.model).toBe('pinned');
    expect(registry.adapters.get('groq_llama').model).toBe('pinned');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('leaves the lane unconfigured (and does not throw) when the provider publishes no capacity data', async () => {
    process.env.NVIDIA_API_KEY = 'fake-nvidia-key';
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      data: [{ id: 'deepseek-ai/deepseek-v4-flash-0731', object: 'model' }]
    })));

    const registry = new BackendRegistry({ autoInitialize: false });
    registry.loadConfig({
      backends: {
        nvidia_deepseek: { type: 'nvidia_deepseek', enabled: true, priority: 2, config: {} }
      }
    });

    await expect(registry.discoverModels()).resolves.toBeUndefined();
    expect(registry.getBackend('nvidia_deepseek').config.model).toBeUndefined();
  });

  it('never throws and leaves lanes unconfigured when no key is resolvable', async () => {
    delete process.env.GEMINI_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const registry = new BackendRegistry({ autoInitialize: false });
    registry.loadConfig({
      backends: {
        gemini: { type: 'gemini', enabled: true, priority: 4, config: {} }
      }
    });

    await expect(registry.discoverModels()).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('readiness audit: unconfigured lanes', () => {
  it('tells the operator how to list the catalog when a lane has no model and no capacity data', async () => {
    process.env.NVIDIA_API_KEY = 'fake-nvidia-key';
    const ids = Array.from({ length: 8 }, (_, i) => `provider/model-${i}`);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      data: ids.map(id => ({ id, object: 'model' }))
    })));

    const result = await auditReadiness({
      backendsConfig: {
        backends: {
          nvidia_deepseek: { type: 'nvidia_deepseek', enabled: true, config: {} }
        }
      },
      councilConfig: { topics: {} }
    });

    const finding = result.findings.find(f => f.backend === 'nvidia_deepseek');
    expect(finding).toBeTruthy();
    expect(finding.severity).toBe('unknown');
    expect(finding.reason).toContain('no model configured');
    expect(finding.reason).toContain('8 models are available');
    // Point at the real catalog rather than a "top 5". This provider publishes
    // no capacity OR capability fields, so any subset would be an arbitrary
    // slice — and the alphabetically-first ids are often embedding models that
    // would break the lane if copied.
    expect(finding.reason).toContain('curl https://integrate.api.nvidia.com/v1/models');
    expect(finding.reason).toContain('nvidia_deepseek');
    expect(finding.reason).toContain('src/config/backends.json');
    expect(finding.reason).toMatch(/chat\/instruct/);
    // and it must NOT present arbitrary ids as if they were recommendations
    expect(finding.reason).not.toContain('provider/model-0');
  });

  it('does not flag a lane as broken when a model can be auto-selected (capacity data present)', async () => {
    process.env.GROQ_API_KEY = 'fake-groq-key';
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      data: [{ id: 'openai/gpt-oss-120b', context_window: 131072, max_completion_tokens: 65536 }]
    })));

    const result = await auditReadiness({
      backendsConfig: {
        backends: {
          groq_llama: { type: 'groq', enabled: true, config: {} }
        }
      },
      councilConfig: { topics: {} }
    });

    expect(result.findings.find(f => f.backend === 'groq_llama')).toBeUndefined();
  });

  it('stays "unknown", never "critical", when a key is simply missing', async () => {
    delete process.env.OPENAI_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await auditReadiness({
      backendsConfig: {
        backends: {
          openai_chatgpt: { type: 'openai', enabled: true, config: {} }
        }
      },
      councilConfig: { topics: {} }
    });

    const finding = result.findings.find(f => f.backend === 'openai_chatgpt');
    expect(finding.severity).toBe('unknown');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('boot survives a missing or malformed backends.json', () => {
  // Boots against an isolated temp COPY of src/ + package.json (node_modules
  // symlinked), never the real tracked backends.json — other test files read
  // that file concurrently (vitest runs test files in parallel workers), so
  // renaming it away here would race them.
  function bootWithConfig(content) {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'sab-boot-test-'));
    try {
      cpSync(path.join(repoRoot, 'src'), path.join(tmpDir, 'src'), { recursive: true });
      cpSync(path.join(repoRoot, 'package.json'), path.join(tmpDir, 'package.json'));
      symlinkSync(path.join(repoRoot, 'node_modules'), path.join(tmpDir, 'node_modules'));

      const cfgPath = path.join(tmpDir, 'src/config/backends.json');
      if (content === null) unlinkSync(cfgPath);
      else writeFileSync(cfgPath, content, 'utf8');

      return spawnSync('node', ['src/server.js'], {
        cwd: tmpDir,
        env: { ...process.env, SAB_DISABLE_READINESS_AUDIT: 'true' },
        input: '',
        timeout: 15000,
        encoding: 'utf8'
      });
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  it('boots (does not crash) when backends.json is missing', () => {
    const result = bootWithConfig(null);
    expect(result.stderr).toContain('backends.json unreadable or malformed');
    expect(result.stderr).not.toMatch(/Uncaught|Unhandled/);
  });

  it('boots (does not crash) when backends.json is malformed JSON', () => {
    const result = bootWithConfig('{ this is not valid json');
    expect(result.stderr).toContain('backends.json unreadable or malformed');
    expect(result.stderr).not.toMatch(/Uncaught|Unhandled/);
  });
}, 30000);

/**
 * No adapter ships a hardcoded model id any more. The two that used to
 * (deepseek-v4-pro, gemini-3-pro-preview) were both retired while still being
 * shipped, so an unconfigured lane silently sent a dead id and failed with an
 * opaque provider error. An unconfigured lane must now fail with something the
 * operator can act on — and must still CONSTRUCT, so boot survives and the
 * readiness audit gets to report it.
 */
describe('an unconfigured cloud adapter refuses to guess a model', () => {
  const CASES = [
    ['GeminiAdapter', () => new GeminiAdapter({ apiKey: 'k' })],
    ['GroqAdapter', () => new GroqAdapter({ apiKey: 'k' })],
    ['OpenAIAdapter', () => new OpenAIAdapter({ apiKey: 'k' })],
    ['NvidiaDeepSeekAdapter', () => new NvidiaDeepSeekAdapter({ apiKey: 'k' })],
    ['NvidiaGlmAdapter', () => new NvidiaGlmAdapter({ apiKey: 'k' })]
  ];

  it.each(CASES)('%s constructs with no model (boot must not break)', (_name, make) => {
    const adapter = make();
    expect(adapter).toBeTruthy();
    expect(adapter.model ?? null).toBeNull();
  });

  it.each(CASES)('%s throws an actionable error at REQUEST time, not construction', async (_name, make) => {
    const adapter = make();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(adapter.makeAPICall({ messages: [] })).rejects.toThrow(/no model configured/i);
    // The whole point: it fails BEFORE reaching the provider, so the operator
    // gets our message rather than an opaque 400/404 from upstream.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('names the backend and where to configure it', async () => {
    const adapter = new GroqAdapter({ apiKey: 'k' });
    vi.stubGlobal('fetch', vi.fn());
    await expect(adapter.makeAPICall({ messages: [] })).rejects.toThrow(/backends\.json/);
  });

  it('an explicitly configured model is sent, and never overridden', async () => {
    const adapter = new GroqAdapter({ apiKey: 'k', model: 'operator/pinned-model' });
    expect(adapter.model).toBe('operator/pinned-model');
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [] }) }));
    vi.stubGlobal('fetch', fetchSpy);
    await adapter.makeAPICall({ model: adapter.model, messages: [] });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('no adapter source carries a hardcoded model-id default any more', async () => {
    const { readFileSync, readdirSync } = await import('fs');
    const dir = path.join(repoRoot, 'src/backends');
    const offenders = [];
    for (const f of readdirSync(dir).filter(n => n.endsWith('-adapter.js'))) {
      const src = readFileSync(path.join(dir, f), 'utf8');
      // The shape that rotted twice: assigning a literal as the fallback when
      // config supplies no model, i.e. `x = config.model || '<literal>'`.
      // Deliberately anchored on the assignment so it does not flag the
      // `this.model || this.config.model || 'unknown'` display fallback used
      // when rendering a retirement error.
      const m = src.match(/=\s*config\.model\s*\|\|\s*['"][^'"]+['"]/);
      if (m) offenders.push(`${f}: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });
});
