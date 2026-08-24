/**
 * @fileoverview Truncation must never be reported as work a backend did not do.
 *
 * Both generate_file and modify_file used to "escalate to cloud" on a
 * truncated response by flipping `usedBackend` to a hardcoded backend name on
 * the LAST loop iteration — after which the loop condition immediately
 * terminated. No second request was ever issued, so the only thing that
 * escalation produced was a false `backend_used` (and a poisoned per-backend
 * analytics record). That escalation is gone: an exhausted truncation is now
 * reported honestly, on the backend that actually ran.
 *
 * modify_file additionally never re-ran its LOCAL token-scaling retries at all
 * — `while (!response && ...)` was false the moment attempt 1 assigned
 * `response`. The loop is now wrapped in `if (!response)` (preserving the
 * native /infill skip) with `!response` dropped from the loop condition, so
 * the free local retries actually iterate.
 *
 * Stubbing follows tests/retry-timeout-per-attempt.test.js: build the handler,
 * then monkey-patch makeRequest and the network-touching helpers. Nothing here
 * touches the network.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import { GenerateFileHandler } from '../src/handlers/generate-file-handler.js';
import { ModifyFileHandler } from '../src/handlers/modify-file-handler.js';

const TRUNCATED_CODE = 'SUMMARY: partial\n\nCODE:\n```js\nfunction sum(a, b) {\n  return a';
const TRUNCATED_BLOCK =
  '<<<<<<< SEARCH\nconst x = 1;\n=======\nconst x = 2;\n>>>>>>> REPLACE\nSUMMARY: changed x to';

function stubOffline(handler) {
  handler.getContextLimit = async () => ({ charLimit: 500000, model: 'test-model' });
  // Dual-mode probes localhost:8087/8088 over the network; force "unavailable".
  handler.checkDualModeAvailable = async () => false;
  handler.calculateDynamicTokens = () => 1000;
  return handler;
}

/** Registry stub whose *configuration* is the only source of backend names. */
function makeRegistry(backendTypes, selected = 'local') {
  const names = Object.keys(backendTypes);
  return {
    registerRoutingOverride: () => {},
    selectBackend: (requested) => ({ backend: requested || selected }),
    getUsableBackends: () => names,
    getFallbackChain: () => names,
    getBackend: (name) => (backendTypes[name] ? { name, type: backendTypes[name] } : null),
    getKeyStatus: () => ({ configured: true })
  };
}

describe('generate_file: a truncated run reports the backend that actually ran', () => {
  let tmpDir;
  afterEach(async () => {
    if (tmpDir) await fsp.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  it('never contacts another backend and never reports one it did not call', async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-trunc-gen-'));
    const outputPath = path.join(tmpDir, 'sum.js');

    const handler = stubOffline(new GenerateFileHandler({}));

    const calls = [];
    handler.makeRequest = async (prompt, backend, options) => {
      calls.push({ backend, maxTokens: options.maxTokens });
      return { content: TRUNCATED_CODE, metadata: { finishReason: 'length' } };
    };

    const result = await handler.execute({
      spec: 'a function that sums two numbers',
      outputPath,
      options: { backend: 'local', review: true }
    });

    expect(result.success).toBe(true);
    expect(result.was_truncated).toBe(true);

    // Every request went to the backend the caller asked for.
    expect(calls.length).toBeGreaterThan(0);
    expect([...new Set(calls.map(c => c.backend))]).toEqual(['local']);

    // The reported backend is one that was actually called.
    expect(result.backend_used).toBe('local');
    expect(calls.some(c => c.backend === result.backend_used)).toBe(true);
  });
});

describe('same-lane retries survive on a NON-local backend', () => {
  let tmpDir;
  afterEach(async () => {
    if (tmpDir) await fsp.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  it('generate_file retries on the caller\'s own cloud lane, scaling tokens, never switching', async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-trunc-gen-cloud-'));

    const handler = stubOffline(new GenerateFileHandler({}));
    const calls = [];
    handler.makeRequest = async (prompt, backend, options) => {
      calls.push({ backend, maxTokens: options.maxTokens });
      return { content: TRUNCATED_CODE, metadata: { finishReason: 'length' } };
    };

    const result = await handler.execute({
      spec: 'a function that sums two numbers',
      outputPath: path.join(tmpDir, 'sum.js'),
      options: { backend: 'operator_cloud_lane', review: true }
    });

    expect(result.success).toBe(true);
    // The retry branch must not be gated on the lane being 'local'.
    expect(calls.length).toBe(3);
    expect(calls.map(c => c.maxTokens)).toEqual([1000, 1500, 2250]);
    expect([...new Set(calls.map(c => c.backend))]).toEqual(['operator_cloud_lane']);
    expect(result.backend_used).toBe('operator_cloud_lane');
  });

  it('modify_file retries on the caller\'s own cloud lane, scaling tokens, never switching', async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-trunc-mod-cloud-'));
    const filePath = path.join(tmpDir, 'const.js');
    await fsp.writeFile(filePath, 'const x = 1;\nconsole.log(x);\n', 'utf8');

    const handler = stubOffline(new ModifyFileHandler({}));
    handler.calculateDynamicTokens = () => 3000;
    const calls = [];
    handler.makeRequest = async (prompt, backend, options) => {
      calls.push({ backend, maxTokens: options.maxTokens });
      return { content: TRUNCATED_BLOCK, metadata: { finishReason: 'length' } };
    };

    const result = await handler.execute({
      filePath,
      instructions: 'change x to 2',
      options: { backend: 'operator_cloud_lane', dryRun: true }
    });

    expect(result.success).toBe(true);
    expect(calls.length).toBe(3);
    expect(calls.map(c => c.maxTokens)).toEqual([3000, 4500, 6750]);
    expect([...new Set(calls.map(c => c.backend))]).toEqual(['operator_cloud_lane']);
  });
});

describe('modify_file: local truncation retries actually run, with no escalation', () => {
  let tmpDir;
  afterEach(async () => {
    if (tmpDir) await fsp.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  async function fixture() {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-trunc-mod-'));
    const filePath = path.join(tmpDir, 'const.js');
    await fsp.writeFile(filePath, 'const x = 1;\nconsole.log(x);\n', 'utf8');
    return filePath;
  }

  it('retries more than once, scaling maxTokens upward, all on the same backend', async () => {
    const filePath = await fixture();

    const handler = stubOffline(new ModifyFileHandler({}));

    const calls = [];
    handler.makeRequest = async (prompt, backend, options) => {
      calls.push({ backend, maxTokens: options.maxTokens });
      return { content: TRUNCATED_BLOCK, metadata: { finishReason: 'length' } };
    };

    const result = await handler.execute({
      filePath,
      instructions: 'change x to 2',
      options: { backend: 'local', dryRun: true }
    });

    expect(result.success).toBe(true);

    // Defect B: this used to be exactly 1 — the retry loop never re-entered.
    expect(calls.length).toBeGreaterThan(1);

    // Token scaling is the point of the local retry.
    for (let i = 1; i < calls.length; i++) {
      expect(calls[i].maxTokens).toBeGreaterThan(calls[i - 1].maxTokens);
    }

    // No lane other than the one the caller asked for was contacted.
    expect([...new Set(calls.map(c => c.backend))]).toEqual(['local']);
  });

  it('makes ZERO chat requests when native /infill already produced a response', async () => {
    const filePath = await fixture();

    const handler = stubOffline(new ModifyFileHandler({}));
    handler.resolveFIMStrategy = async () => ({ mode: 'infill' });
    handler.runNativeInfill = async () => 'const x = 2;';

    const calls = [];
    handler.makeRequest = async (prompt, backend, options) => {
      calls.push({ backend, maxTokens: options.maxTokens });
      return { content: TRUNCATED_BLOCK, metadata: { finishReason: 'length' } };
    };

    const result = await handler.execute({
      filePath,
      instructions: 'set x to 2',
      options: { backend: 'local', useFIM: true, insertionLine: 2, dryRun: true }
    });

    expect(result.success).toBe(true);
    // The /infill skip must survive the loop-condition fix.
    expect(calls.length).toBe(0);
  });
});

describe('modify_file: the error-path fallback target comes from configuration', () => {
  let tmpDir;
  afterEach(async () => {
    if (tmpDir) await fsp.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  async function fixture() {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-trunc-err-'));
    const filePath = path.join(tmpDir, 'const.js');
    await fsp.writeFile(filePath, 'const x = 1;\nconsole.log(x);\n', 'utf8');
    return filePath;
  }

  it('escalates to the first configured non-local backend, whatever it is named', async () => {
    const filePath = await fixture();

    const registry = makeRegistry({ local: 'local', operator_cloud_lane: 'openai_compatible' });
    const handler = stubOffline(new ModifyFileHandler({ backendRegistry: registry }));

    const calls = [];
    handler.makeRequest = async (prompt, backend) => {
      calls.push(backend);
      if (calls.length === 1) throw new Error('simulated local failure');
      return {
        content: '<<<<<<< SEARCH\nconst x = 1;\n=======\nconst x = 2;\n>>>>>>> REPLACE\nSUMMARY: ok',
        metadata: { finishReason: 'stop' }
      };
    };

    const result = await handler.execute({
      filePath,
      instructions: 'change x to 2',
      options: { backend: 'local', dryRun: true }
    });

    expect(result.success).toBe(true);
    expect(calls).toEqual(['local', 'operator_cloud_lane']);
  });

  it('does NOT escalate when only a local backend is configured — the error surfaces', async () => {
    const filePath = await fixture();

    const registry = makeRegistry({ local: 'local' });
    const handler = stubOffline(new ModifyFileHandler({ backendRegistry: registry }));

    const calls = [];
    handler.makeRequest = async (prompt, backend) => {
      calls.push(backend);
      throw new Error('simulated local failure');
    };

    await expect(handler.execute({
      filePath,
      instructions: 'change x to 2',
      options: { backend: 'local', dryRun: true }
    })).rejects.toThrow(/simulated local failure/);

    // Local retries still happen (they are free); nothing else is contacted.
    expect([...new Set(calls)]).toEqual(['local']);
  });
});
