import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs, { promises as fsPromises } from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

import {
  SECRETS_PATH,
  readSecrets,
  getSecret,
  setSecret,
  deleteSecret
} from '../src/backends/secret-store.js';
import { BackendRegistry } from '../src/backends/backend-registry.js';
import { DashboardServer } from '../src/dashboard/dashboard-server.js';

// Fake, obviously-non-live credentials only — never a real key shape.
const FAKE_KEY_A = 'test-key-1234';
const FAKE_KEY_B = 'test-key-5678';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const BACKENDS_CONFIG_PATH = path.join(repoRoot, 'src/config/backends.json');

/**
 * Redirects every fs call secret-store.js makes against SECRETS_PATH to a
 * temp file instead, so tests never touch the real data/backends-secrets.json.
 * Restored via vi.restoreAllMocks() in afterEach.
 */
function redirectSecretsPath(tmpFile) {
  const tmpDir = path.dirname(tmpFile);
  const realDir = path.dirname(SECRETS_PATH);

  const realExistsSync = fs.existsSync;
  const realReadFileSync = fs.readFileSync;
  const realMkdirSync = fs.mkdirSync;
  const realChmodSync = fs.chmodSync;
  const realWriteFile = fsPromises.writeFile;
  const realReadFile = fsPromises.readFile;

  vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
    if (p === SECRETS_PATH) return realExistsSync(tmpFile);
    if (p === realDir) return realExistsSync(tmpDir);
    return realExistsSync(p);
  });
  vi.spyOn(fs, 'readFileSync').mockImplementation((p, enc) => {
    if (p === SECRETS_PATH) return realReadFileSync(tmpFile, enc);
    return realReadFileSync(p, enc);
  });
  vi.spyOn(fs, 'mkdirSync').mockImplementation((p, opts) => {
    if (p === realDir) return realMkdirSync(tmpDir, opts);
    return realMkdirSync(p, opts);
  });
  vi.spyOn(fs, 'chmodSync').mockImplementation((p, mode) => {
    if (p === SECRETS_PATH) return realChmodSync(tmpFile, mode);
    return realChmodSync(p, mode);
  });
  vi.spyOn(fsPromises, 'writeFile').mockImplementation((p, content, enc) => {
    if (p === SECRETS_PATH) return realWriteFile(tmpFile, content, enc);
    return realWriteFile(p, content, enc);
  });
  vi.spyOn(fsPromises, 'readFile').mockImplementation((p, enc) => {
    if (p === SECRETS_PATH) return realReadFile(tmpFile, enc);
    return realReadFile(p, enc);
  });
}

describe('secret-store', () => {
  let tmpDir;
  let tmpFile;

  beforeEach(async () => {
    tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'sab-secrets-'));
    tmpFile = path.join(tmpDir, 'backends-secrets.json');
    redirectSecretsPath(tmpFile);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  });

  it('degrades to empty when the file is absent, malformed, or the wrong shape', async () => {
    expect(readSecrets()).toEqual({});
    expect(getSecret('anything')).toBeNull();

    await fsPromises.writeFile(tmpFile, '{ not valid json', 'utf8');
    expect(() => readSecrets()).not.toThrow();
    expect(readSecrets()).toEqual({});

    await fsPromises.writeFile(tmpFile, '["array", "not", "object"]', 'utf8');
    expect(readSecrets()).toEqual({});
  });

  it('sets, reads, and deletes a secret', async () => {
    await setSecret('groq_llama', FAKE_KEY_A);
    expect(getSecret('groq_llama')).toBe(FAKE_KEY_A);
    expect(readSecrets()).toEqual({ groq_llama: FAKE_KEY_A });

    await deleteSecret('groq_llama');
    expect(getSecret('groq_llama')).toBeNull();
    expect(readSecrets()).toEqual({});
  });

  it('writes the secrets file at mode 0600', async () => {
    await setSecret('groq_llama', FAKE_KEY_A);
    const mode = fs.statSync(tmpFile).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});

describe('BackendRegistry key resolution precedence', () => {
  let tmpDir;
  let tmpFile;
  let registry;
  const origEnv = { ...process.env };

  beforeEach(async () => {
    tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'sab-secrets-'));
    tmpFile = path.join(tmpDir, 'backends-secrets.json');
    redirectSecretsPath(tmpFile);
    delete process.env.GROQ_API_KEY;
    delete process.env.SAB_TEST_LITERAL_VAR;
    registry = new BackendRegistry({ autoInitialize: false });
  });

  afterEach(async () => {
    process.env = { ...origEnv };
    vi.restoreAllMocks();
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  });

  it('falls back to env when nothing else is configured', () => {
    process.env.GROQ_API_KEY = 'env-fallback-key';
    registry.register('groq_llama', { type: 'groq', config: {} });

    const status = registry.getKeyStatus('groq_llama');
    expect(status.configured).toBe(true);
    expect(status.source).toBe('env');
    expect(status.last4).toBe('-key');
  });

  it('a stored key beats the env fallback', async () => {
    process.env.GROQ_API_KEY = 'env-fallback-key';
    await setSecret('groq_llama', FAKE_KEY_A);
    registry.register('groq_llama', { type: 'groq', config: {} });

    const status = registry.getKeyStatus('groq_llama');
    expect(status.source).toBe('store');
    expect(status.last4).toBe(FAKE_KEY_A.slice(-4));
    expect(registry.getBackend('groq_llama').config.apiKey).toBe(FAKE_KEY_A);
  });

  it('a config.apiKey "$VAR" reference beats the store', async () => {
    process.env.SAB_TEST_LITERAL_VAR = 'literal-env-key';
    await setSecret('groq_llama', FAKE_KEY_A);
    registry.register('groq_llama', { type: 'groq', config: { apiKey: '$SAB_TEST_LITERAL_VAR' } });

    const status = registry.getKeyStatus('groq_llama');
    expect(status.source).toBe('config');
    expect(status.last4).toBe('-key');
    expect(registry.getBackend('groq_llama').config.apiKey).toBe('literal-env-key');
  });

  it('falls back to env after the stored key is deleted', async () => {
    process.env.GROQ_API_KEY = 'env-fallback-key';
    await setSecret('groq_llama', FAKE_KEY_A);
    registry.register('groq_llama', { type: 'groq', config: {} });
    expect(registry.getKeyStatus('groq_llama').source).toBe('store');

    await deleteSecret('groq_llama');
    registry.rebuildAdapter('groq_llama');

    const status = registry.getKeyStatus('groq_llama');
    expect(status.source).toBe('env');
    // Registry leaves apiKey unset (per F2) so the adapter's own
    // process.env fallback applies — the adapter is where it actually lands.
    expect(registry.getBackend('groq_llama').config.apiKey).toBeUndefined();
    expect(registry.getAdapter('groq_llama').config.apiKey).toBe('env-fallback-key');
  });
});

describe('saveConfig() never writes an apiKey (S1)', () => {
  let tmpDir;
  let tmpConfigPath;

  beforeEach(async () => {
    tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'sab-backends-config-'));
    tmpConfigPath = path.join(tmpDir, 'backends.json');
    // Seed with the real config's content so the test starts from a
    // realistic shape without ever writing back to the tracked file.
    const realContent = fs.readFileSync(BACKENDS_CONFIG_PATH, 'utf8');
    fs.writeFileSync(tmpConfigPath, realContent, 'utf8');
  });

  afterEach(async () => {
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  });

  it('strips apiKey from every backend before writing to the tracked config file', () => {
    const registry = new BackendRegistry({ autoInitialize: false });
    registry.register('leak_test_backend', {
      type: 'groq',
      enabled: false,
      config: { apiKey: FAKE_KEY_A, model: 'test-model' }
    });

    const saved = registry.saveConfig(tmpConfigPath);
    expect(saved).toBe(true);

    const writtenRaw = fs.readFileSync(tmpConfigPath, 'utf8');
    expect(writtenRaw).not.toContain(FAKE_KEY_A);
    expect(writtenRaw).not.toContain('apiKey');

    const written = JSON.parse(writtenRaw);
    for (const backend of Object.values(written.backends)) {
      expect(backend.config?.apiKey).toBeUndefined();
    }
  });
});

// Provider env vars that resolveBackendKey() (src/backends/provider-endpoints.js)
// falls back to, per PROVIDER_ENDPOINTS. A real dev machine may have any of
// these exported for unrelated projects, which would falsely satisfy
// "configured" via the env fallback and break the "not configured" /
// "falls back to none after delete" assertions below. Isolate them for the
// duration of this suite only.
const PROVIDER_ENV_VARS = ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'NVIDIA_API_KEY'];

describe('dashboard key-management endpoints', () => {
  let tmpDir;
  let tmpFile;
  let dashboard;
  let baseUrl;
  const origEnv = { ...process.env };

  beforeEach(async () => {
    for (const name of PROVIDER_ENV_VARS) delete process.env[name];

    tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'sab-secrets-'));
    tmpFile = path.join(tmpDir, 'backends-secrets.json');
    redirectSecretsPath(tmpFile);

    // Health checks make a real HTTP call to the (fake) backend URL; stub
    // just that, and let requests to the dashboard's own loopback server
    // (what these tests actually assert on) through to the real fetch.
    const realFetch = global.fetch;
    vi.spyOn(global, 'fetch').mockImplementation((url, ...rest) => {
      if (typeof url === 'string' && url.includes('127.0.0.1')) {
        return realFetch(url, ...rest);
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });

    const registry = new BackendRegistry({ autoInitialize: false });
    registry.register('groq_llama', {
      type: 'groq',
      enabled: true,
      config: { model: 'test-model', url: 'https://example.invalid/v1/chat/completions' }
    });

    dashboard = new DashboardServer({ port: 0, backendRegistry: registry });
    await dashboard.start();
    const addr = dashboard.server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await dashboard.stop();
    vi.restoreAllMocks();
    process.env = { ...origEnv };
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  });

  it('defaults to binding 127.0.0.1', () => {
    expect(dashboard.host).toBe('127.0.0.1');
    expect(dashboard.server.address().address).toBe('127.0.0.1');
  });

  it('GET .../key reports "not configured" and never returns a key', async () => {
    const res = await fetch(`${baseUrl}/api/backends/groq_llama/key`);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.configured).toBe(false);
    expect(body.source).toBe('none');
    expect(body.last4).toBeNull();
    expect(JSON.stringify(body)).not.toContain(FAKE_KEY_B);
  });

  it('PUT sets the key, GET/list reflect it without leaking it, adapter picks it up, DELETE falls back', async () => {
    const putRes = await fetch(`${baseUrl}/api/backends/groq_llama/key`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: FAKE_KEY_B })
    });
    const putBody = await putRes.json();
    expect(putBody.success).toBe(true);
    expect(putBody.configured).toBe(true);
    expect(putBody.source).toBe('store');
    expect(putBody.last4).toBe(FAKE_KEY_B.slice(-4));
    expect(JSON.stringify(putBody)).not.toContain(FAKE_KEY_B);

    // Adapter rebuilt and now carries the key.
    expect(dashboard.backendRegistry.getAdapter('groq_llama').config.apiKey).toBe(FAKE_KEY_B);

    const getRes = await fetch(`${baseUrl}/api/backends/groq_llama/key`);
    const getBody = await getRes.json();
    expect(getBody.configured).toBe(true);
    expect(getBody.source).toBe('store');
    expect(JSON.stringify(getBody)).not.toContain(FAKE_KEY_B);

    const listRes = await fetch(`${baseUrl}/api/backends`);
    const listBody = await listRes.json();
    const row = listBody.backends.find((b) => b.name === 'groq_llama');
    expect(row.keyConfigured).toBe(true);
    expect(row.keySource).toBe('store');
    expect(JSON.stringify(listBody)).not.toContain(FAKE_KEY_B);

    const delRes = await fetch(`${baseUrl}/api/backends/groq_llama/key`, { method: 'DELETE' });
    const delBody = await delRes.json();
    expect(delBody.success).toBe(true);
    expect(delBody.configured).toBe(false);
    expect(delBody.source).toBe('none');
    expect(dashboard.backendRegistry.getAdapter('groq_llama').config.apiKey).toBeUndefined();
  });

  it('rejects an unknown backend name', async () => {
    const res = await fetch(`${baseUrl}/api/backends/nope_not_real/key`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: FAKE_KEY_A })
    });
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('rejects a whitespace-containing key', async () => {
    const res = await fetch(`${baseUrl}/api/backends/groq_llama/key`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'has a space' })
    });
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});

