import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { auditReadiness, formatFindings, isLocalEndpoint, catalogUrlFor } from '../src/backends/readiness-audit.js';

const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const LOCAL_URL = 'http://127.0.0.1:8081/v1/chat/completions';
const GEMINI_CATALOG_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

function backendsConfig(backends) {
  return { backends };
}

describe('isLocalEndpoint', () => {
  it('accepts localhost, 127.0.0.1, ::1, and RFC-1918 ranges', () => {
    expect(isLocalEndpoint('http://localhost:8081/v1/chat/completions')).toBe(true);
    expect(isLocalEndpoint('http://127.0.0.1:8081/v1/chat/completions')).toBe(true);
    expect(isLocalEndpoint('http://[::1]:8081/v1/chat/completions')).toBe(true);
    expect(isLocalEndpoint('http://10.0.0.5:8081/v1/chat/completions')).toBe(true);
    expect(isLocalEndpoint('http://192.168.0.10:8081/v1/chat/completions')).toBe(true);
    expect(isLocalEndpoint('http://172.16.0.1:8081/v1/chat/completions')).toBe(true);
    expect(isLocalEndpoint('http://172.31.255.255:8081/v1/chat/completions')).toBe(true);
  });

  it('rejects public hosts', () => {
    expect(isLocalEndpoint(NVIDIA_URL)).toBe(false);
    expect(isLocalEndpoint('http://172.32.0.1:8081/v1/chat/completions')).toBe(false);
    expect(isLocalEndpoint('not a url')).toBe(false);
  });
});

describe('catalogUrlFor', () => {
  it('maps a chat/completions URL to its /models catalog', () => {
    expect(catalogUrlFor(NVIDIA_URL)).toBe('https://integrate.api.nvidia.com/v1/models');
  });
  it('returns null for a non-matching URL', () => {
    expect(catalogUrlFor('https://example.com/foo')).toBeNull();
    expect(catalogUrlFor(undefined)).toBeNull();
  });
});

describe('auditReadiness', () => {
  const origEnv = { ...process.env };
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
    delete process.env.NVIDIA_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    process.env = { ...origEnv };
    vi.restoreAllMocks();
  });

  it('never reports a local backend as "not in catalog", even when unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const cfg = backendsConfig({
      local: { enabled: true, type: 'local', config: { url: LOCAL_URL, model: 'dynamic' } }
    });
    const { findings } = await auditReadiness({ backendsConfig: cfg, councilConfig: {} });
    expect(findings.some(f => /not in the provider catalog/i.test(f.reason))).toBe(false);
  });

  it('marks an unreachable local endpoint as critical', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const cfg = backendsConfig({
      local: { enabled: true, type: 'local', config: { url: LOCAL_URL, model: 'dynamic' } }
    });
    const { findings } = await auditReadiness({ backendsConfig: cfg, councilConfig: {} });
    expect(findings).toContainEqual(expect.objectContaining({
      severity: 'critical', backend: 'local', reason: expect.stringContaining('local endpoint unreachable')
    }));
  });

  it('reports a keyless cloud backend as unknown with "cannot verify", and never fetches for it', async () => {
    const cfg = backendsConfig({
      nvidia_deepseek: { enabled: true, type: 'nvidia_deepseek', config: { url: NVIDIA_URL, model: 'deepseek-ai/deepseek-v4-pro' } }
    });
    const { findings } = await auditReadiness({ backendsConfig: cfg, councilConfig: {} });
    expect(findings).toContainEqual(expect.objectContaining({
      severity: 'unknown', backend: 'nvidia_deepseek', reason: expect.stringContaining('cannot verify — NVIDIA_API_KEY not set')
    }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('flags a cloud backend whose model is missing from the catalog as critical', async () => {
    process.env.NVIDIA_API_KEY = 'test-key';
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'deepseek-ai/deepseek-v4-pro' }] })
    });
    const cfg = backendsConfig({
      nvidia_deepseek: { enabled: true, type: 'nvidia_deepseek', config: { url: NVIDIA_URL, model: 'deepseek-ai/deepseek-v3.1-terminus' } }
    });
    const { findings } = await auditReadiness({ backendsConfig: cfg, councilConfig: {} });
    expect(findings).toContainEqual(expect.objectContaining({
      severity: 'critical', backend: 'nvidia_deepseek', reason: expect.stringContaining('NOT in the provider catalog')
    }));
  });

  it('reports an unreachable cloud catalog as unknown, not critical', async () => {
    process.env.NVIDIA_API_KEY = 'test-key';
    fetchMock.mockRejectedValue(new Error('network down'));
    const cfg = backendsConfig({
      nvidia_deepseek: { enabled: true, type: 'nvidia_deepseek', config: { url: NVIDIA_URL, model: 'deepseek-ai/deepseek-v4-pro' } }
    });
    const { findings } = await auditReadiness({ backendsConfig: cfg, councilConfig: {} });
    expect(findings).toContainEqual(expect.objectContaining({
      severity: 'unknown', backend: 'nvidia_deepseek', reason: expect.stringContaining('catalog unreachable')
    }));
  });

  it('dedupes catalog fetches: two backends sharing a host produce exactly one fetch', async () => {
    process.env.NVIDIA_API_KEY = 'test-key';
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'deepseek-ai/deepseek-v4-pro' }, { id: 'z-ai/glm-5.2' }] })
    });
    const cfg = backendsConfig({
      nvidia_deepseek: { enabled: true, type: 'nvidia_deepseek', config: { url: NVIDIA_URL, model: 'deepseek-ai/deepseek-v4-pro' } },
      nvidia_glm: { enabled: true, type: 'nvidia_glm', config: { url: NVIDIA_URL, model: 'z-ai/glm-5.2' } }
    });
    await auditReadiness({ backendsConfig: cfg, councilConfig: {} });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('checks gemini against its catalog with the x-goog-api-key header at the v1beta URL', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: 'models/gemini-3.1-pro-preview' }] })
    });
    const cfg = backendsConfig({
      gemini: { enabled: true, type: 'gemini', config: { model: 'gemini-3.1-pro-preview' } }
    });
    await auditReadiness({ backendsConfig: cfg, councilConfig: {} });
    expect(fetchMock).toHaveBeenCalledWith(GEMINI_CATALOG_URL, expect.objectContaining({
      headers: { 'x-goog-api-key': 'test-key' }
    }));
  });

  it('flags a retired gemini model as critical', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: 'models/gemini-3.1-pro-preview' }] })
    });
    const cfg = backendsConfig({
      gemini: { enabled: true, type: 'gemini', config: { model: 'gemini-3-pro-preview' } }
    });
    const { findings, checked } = await auditReadiness({ backendsConfig: cfg, councilConfig: {} });
    expect(findings).toContainEqual(expect.objectContaining({
      severity: 'critical', backend: 'gemini', model: 'gemini-3-pro-preview',
      reason: expect.stringContaining('NOT in the provider catalog')
    }));
    expect(checked).toBe(1);
  });

  it('reports no finding when the configured gemini model IS in the catalog', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: 'models/gemini-3.1-pro-preview' }] })
    });
    const cfg = backendsConfig({
      gemini: { enabled: true, type: 'gemini', config: { model: 'gemini-3.1-pro-preview' } }
    });
    const { findings } = await auditReadiness({ backendsConfig: cfg, councilConfig: {} });
    expect(findings).toEqual([]);
  });

  it('normalizes the catalog\'s "models/" prefix so a bare configured id matches', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: 'models/gemini-3.1-pro-preview' }] })
    });
    const cfg = backendsConfig({
      gemini: { enabled: true, type: 'gemini', config: { model: 'gemini-3.1-pro-preview' } }
    });
    const { findings } = await auditReadiness({ backendsConfig: cfg, councilConfig: {} });
    expect(findings.some(f => /NOT in the provider catalog/.test(f.reason))).toBe(false);
  });

  it('reports a keyless gemini backend as unknown, not critical', async () => {
    const cfg = backendsConfig({
      gemini: { enabled: true, type: 'gemini', config: { model: 'gemini-3-pro-preview' } }
    });
    const { findings } = await auditReadiness({ backendsConfig: cfg, councilConfig: {} });
    expect(findings).toContainEqual(expect.objectContaining({
      severity: 'unknown', backend: 'gemini', reason: expect.stringContaining('cannot verify — GEMINI_API_KEY not set')
    }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shares one catalog fetch across two gemini backends', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: 'models/gemini-3.1-pro-preview' }] })
    });
    const cfg = backendsConfig({
      gemini: { enabled: true, type: 'gemini', config: { model: 'gemini-3.1-pro-preview' } },
      gemini_flash: { enabled: true, type: 'gemini', config: { model: 'gemini-3.1-pro-preview' } }
    });
    await auditReadiness({ backendsConfig: cfg, councilConfig: {} });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('marks an un-checkable backend as unknown and excludes it from `checked`', async () => {
    const cfg = backendsConfig({
      // A public (non-RFC-1918) URL with a resolvable key, but a type with no
      // catalog descriptor — must not be silently counted as "checked".
      mystery: {
        enabled: true, type: 'mystery_type',
        config: { url: 'https://example.com/v1/chat/completions', model: 'x', apiKey: 'literal-key' }
      }
    });
    const { findings, checked } = await auditReadiness({ backendsConfig: cfg, councilConfig: {} });
    expect(findings).toContainEqual(expect.objectContaining({
      severity: 'unknown', backend: 'mystery', reason: expect.stringContaining('cannot verify')
    }));
    expect(checked).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('flags a council topic member that is not a defined backend', async () => {
    const cfg = backendsConfig({
      local: { enabled: true, type: 'local', config: { url: LOCAL_URL, model: 'dynamic' } }
    });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    const council = { topics: { coding: { backends: ['local', 'nvidia_kimi'] } } };
    const { findings } = await auditReadiness({ backendsConfig: cfg, councilConfig: council });
    expect(findings).toContainEqual(expect.objectContaining({
      severity: 'critical', backend: 'nvidia_kimi', topic: 'coding', reason: expect.stringContaining('undefined backend')
    }));
  });
});

describe('formatFindings', () => {
  it('returns an empty array on a clean audit', () => {
    expect(formatFindings({ findings: [], checked: 3 })).toEqual([]);
  });

  it('renders findings as lines', () => {
    const lines = formatFindings({
      findings: [{ severity: 'critical', backend: 'foo', model: 'bar', reason: 'test reason' }],
      checked: 1
    });
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some(l => l.includes('test reason'))).toBe(true);
  });
});
