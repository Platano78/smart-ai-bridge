/**
 * @fileoverview Regression coverage for the frozen-retry-timeout bug: both
 * generate_file and modify_file computed their request timeout ONCE before
 * the truncation-retry loop, then reused that stale value on every retry
 * even though currentTokens (and sometimes usedBackend) change each
 * iteration. This proves the timeout passed to makeRequest is recomputed
 * from each attempt's own live values.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import { GenerateFileHandler } from '../src/handlers/generate-file-handler.js';
import { ModifyFileHandler } from '../src/handlers/modify-file-handler.js';

function stubContextLimit(handler, charLimit = 500000) {
  handler.getContextLimit = async () => ({ charLimit, model: 'test-model' });
  return handler;
}

describe('generate_file: per-attempt timeout tracks live tokens/backend', () => {
  let tmpDir;
  afterEach(async () => {
    if (tmpDir) await fsp.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  it('recomputes the timeout on each retry instead of reusing attempt 1\'s value', async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-retry-timeout-gen-'));
    const outputPath = path.join(tmpDir, 'sum.js');

    const handler = stubContextLimit(new GenerateFileHandler({}));
    // Fix token allocation so the timeout math is predictable and stays off
    // the 30s/300s clamps (see calculateDynamicTimeout).
    handler.calculateDynamicTokens = () => 1000;

    const recorded = [];
    handler.makeRequest = async (prompt, backend, options) => {
      recorded.push({ backend, maxTokens: options.maxTokens, timeout: options.timeout });
      if (recorded.length === 1) {
        // Truncated -> loop retries with currentTokens scaled by 1.5x.
        return {
          content: 'SUMMARY: partial\n\nCODE:\n```js\nfunction sum(a, b) {\n  return a',
          metadata: { finishReason: 'length' }
        };
      }
      return {
        content: 'SUMMARY: adds two numbers\n\nCODE:\n```js\nfunction sum(a, b) {\n  // simple addition helper\n  return a + b;\n}\n```',
        metadata: { finishReason: 'stop' }
      };
    };

    const result = await handler.execute({
      spec: 'a function that sums two numbers',
      outputPath,
      // Staying on a non-'local' backend the whole time skips the
      // dual-mode-iteration branch (which has its own network calls) and
      // isolates the cloud-retry token-scaling path this bug lives in.
      options: { backend: 'nvidia_glm', review: true }
    });

    expect(result.success).toBe(true);
    expect(recorded.length).toBe(2);

    // Attempt 1: maxTokens=1000 -> calculateDynamicTimeout('nvidia_glm', 1000)
    expect(recorded[0].maxTokens).toBe(1000);
    expect(recorded[0].timeout).toBe(handler.calculateDynamicTimeout(recorded[0].backend, recorded[0].maxTokens));

    // Attempt 2: currentTokens scaled by tokenScaleFactor (1.5x) -> 1500
    expect(recorded[1].maxTokens).toBe(1500);
    expect(recorded[1].timeout).toBe(handler.calculateDynamicTimeout(recorded[1].backend, recorded[1].maxTokens));

    // The core regression: the timeout must NOT be frozen at attempt 1's value.
    expect(recorded[1].timeout).not.toBe(recorded[0].timeout);
  });
});

describe('modify_file: per-attempt timeout tracks live tokens/backend', () => {
  let tmpDir;
  afterEach(async () => {
    if (tmpDir) await fsp.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  it('recomputes the timeout on each retry instead of reusing attempt 1\'s value', async () => {
    // Drives the LOCAL truncation-retry path: every response comes back
    // truncated, so the loop re-enters on the same backend with a bigger token
    // budget each time (currentTokens x tokenScaleFactor). That is the other
    // staleness trigger named in the bug report — the timeout must be derived
    // from each attempt's own currentTokens, not frozen at attempt 1's.
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-retry-timeout-mod-'));
    const filePath = path.join(tmpDir, 'const.js');
    await fsp.writeFile(filePath, 'const x = 1;\nconsole.log(x);\n', 'utf8');

    const handler = stubContextLimit(new ModifyFileHandler({}));
    handler.calculateDynamicTokens = () => 3000;
    // Dual-mode probes localhost:8087/8088 over the network; force "unavailable"
    // so the retry path stays on the plain chat-completions call.
    handler.checkDualModeAvailable = async () => false;
    // Give 'local' a distinct measured speed so the timeout math is driven by
    // a real per-backend rate rather than the shared default.
    handler.backendRegistry = {
      selectBackend: (requested) => ({ backend: requested || 'local' }),
      getAdapter: (name) => (name === 'local' ? { getTokensPerSecond: () => 40 } : null),
      getBackend: () => null,
      getKeyStatus: () => ({ configured: false })
    };

    const recorded = [];
    handler.makeRequest = async (prompt, backend, options) => {
      recorded.push({ backend, maxTokens: options.maxTokens, timeout: options.timeout });
      return {
        content: '<<<<<<< SEARCH\nconst x = 1;\n=======\nconst x = 2;\n>>>>>>> REPLACE\nSUMMARY: changed x to',
        metadata: { finishReason: 'length' }
      };
    };

    const result = await handler.execute({
      filePath,
      instructions: 'change x to 2',
      options: { backend: 'local', dryRun: true }
    });

    expect(result.success).toBe(true);
    expect(recorded.length).toBe(3);

    const expectedTimeout = (backend, maxTokens) =>
      Math.max(60000, Math.ceil((maxTokens / handler.estimateBackendSpeed(backend)) * 1000) + 30000);

    // Every attempt stays on the caller's lane; only the token budget grows.
    expect(recorded.map(r => r.backend)).toEqual(['local', 'local', 'local']);
    expect(recorded.map(r => r.maxTokens)).toEqual([3000, 4500, 6750]);

    // Each attempt's timeout is derived from THAT attempt's own tokens.
    for (const attempt of recorded) {
      expect(attempt.timeout).toBe(expectedTimeout(attempt.backend, attempt.maxTokens));
    }

    // The core regression: the timeout must NOT be frozen at attempt 1's value.
    expect(recorded[1].timeout).not.toBe(recorded[0].timeout);
  });
});
