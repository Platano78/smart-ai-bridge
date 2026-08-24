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
    // NOTE (see report): modify-file-handler's truncation-retry branch never
    // actually re-loops — its `while (!response && ...)` condition is already
    // false once `response` is assigned on attempt 1, truncated or not (a
    // separate, pre-existing bug, left untouched per the "staleness only"
    // scope). The one path that genuinely re-enters the loop is the
    // catch(error) cloud-fallback (response stays unset on a thrown error),
    // so that's what this test drives: attempt 1 throws on 'local', attempt 2
    // succeeds on 'nvidia_glm'. maxTokens is unchanged by that path, but
    // usedBackend switches — exactly the other staleness trigger named in
    // the bug report — which is enough to prove the timeout is recomputed
    // per attempt rather than frozen from attempt 1.
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-retry-timeout-mod-'));
    const filePath = path.join(tmpDir, 'const.js');
    await fsp.writeFile(filePath, 'const x = 1;\nconsole.log(x);\n', 'utf8');

    const handler = stubContextLimit(new ModifyFileHandler({}));
    handler.calculateDynamicTokens = () => 3000;
    // Give 'local' a distinct measured speed so switching to 'nvidia_glm'
    // (which always falls through to the shared default) changes the
    // timeout even though maxTokens itself doesn't change on this path.
    handler.backendRegistry = {
      selectBackend: (requested) => ({ backend: requested || 'local' }),
      getAdapter: (name) => (name === 'local' ? { getTokensPerSecond: () => 40 } : null),
      getBackend: () => null,
      getKeyStatus: () => ({ configured: false })
    };

    const recorded = [];
    handler.makeRequest = async (prompt, backend, options) => {
      recorded.push({ backend, maxTokens: options.maxTokens, timeout: options.timeout });
      if (recorded.length === 1) {
        throw new Error('simulated attempt 1 failure');
      }
      return {
        content: '<<<<<<< SEARCH\nconst x = 1;\n=======\nconst x = 2;\n>>>>>>> REPLACE\nSUMMARY: changed x to 2',
        metadata: { finishReason: 'stop' }
      };
    };

    const result = await handler.execute({
      filePath,
      instructions: 'change x to 2',
      options: { backend: 'local', dryRun: true }
    });

    expect(result.success).toBe(true);
    expect(recorded.length).toBe(2);

    const expectedTimeout = (backend, maxTokens) =>
      Math.max(60000, Math.ceil((maxTokens / handler.estimateBackendSpeed(backend)) * 1000) + 30000);

    // Attempt 1: backend='local' (measured speed 40 tok/s, stubbed above)
    expect(recorded[0].backend).toBe('local');
    expect(recorded[0].maxTokens).toBe(3000);
    expect(recorded[0].timeout).toBe(expectedTimeout('local', 3000));

    // Attempt 2: backend switched to 'nvidia_glm' (default 20 tok/s) after the error fallback
    expect(recorded[1].backend).toBe('nvidia_glm');
    expect(recorded[1].maxTokens).toBe(3000);
    expect(recorded[1].timeout).toBe(expectedTimeout('nvidia_glm', 3000));

    // The core regression: the timeout must NOT be frozen at attempt 1's value.
    expect(recorded[1].timeout).not.toBe(recorded[0].timeout);
  });
});
