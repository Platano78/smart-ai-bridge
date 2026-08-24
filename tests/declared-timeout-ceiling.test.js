/**
 * @fileoverview A per-request timeout must never exceed the timeout the
 * operator declared for that lane.
 *
 * Both handlers size a request budget from token count and measured speed.
 * That estimate answers "how long could this take", not "how long is this
 * operator willing to wait" — and the second answer already exists, per lane,
 * as `config.timeout` in the backend configuration. Uncapped, generate_file
 * would allow up to its hardcoded 300s and modify_file's inline formula had no
 * ceiling at all, so a lane declared at 30s could be handed minutes.
 *
 * The cap is a CEILING, not an override: a lane that declares nothing keeps
 * exactly the behaviour it had (generate_file's 300s cap, modify_file's absence
 * of one), and a declared value larger than the estimate never inflates it.
 *
 * Stubbing follows tests/truncation-no-cloud-escalation.test.js — build the
 * handler, then monkey-patch makeRequest and the network-touching helpers.
 * Nothing here touches the network, and every lane name is fictional.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import { GenerateFileHandler } from '../src/handlers/generate-file-handler.js';
import { ModifyFileHandler } from '../src/handlers/modify-file-handler.js';

const GENERATED_CODE =
  'SUMMARY: adds two numbers\n\nCODE:\n```js\nfunction sum(a, b) {\n  // simple addition helper\n  return a + b;\n}\n```';
const APPLIED_BLOCK =
  '<<<<<<< SEARCH\nconst x = 1;\n=======\nconst x = 2;\n>>>>>>> REPLACE\nSUMMARY: ok';

// The shared default rate (base-handler's DEFAULT_TOKENS_PER_SECOND) with no
// adapter reporting a measured one. Both expectations below are derived from
// it so the numbers are readable rather than magic.
const TOKENS_PER_SECOND = 20;

/** generate_file: (tokens / tps) * 1.5 + 10s, clamped to [30s, 300s]. */
const GENERATE_ESTIMATE_MS = (tokens) =>
  Math.floor(Math.max(30, Math.min((tokens / TOKENS_PER_SECOND) * 1.5 + 10, 300)) * 1000);

/** modify_file: (tokens / tps) + 30s, floored at 60s, with no ceiling. */
const MODIFY_ESTIMATE_MS = (tokens) =>
  Math.max(60000, Math.ceil((tokens / TOKENS_PER_SECOND) * 1000) + 30000);

function stubOffline(handler) {
  handler.getContextLimit = async () => ({ charLimit: 500000, model: 'test-model' });
  handler.checkDualModeAvailable = async () => false;
  return handler;
}

/**
 * Registry stub where `declaredTimeout` is the only thing under test: pass a
 * number to declare one for that lane, or null to declare nothing.
 */
function makeRegistry(declaredTimeouts) {
  return {
    registerRoutingOverride: () => {},
    selectBackend: (requested) => ({ backend: requested }),
    getUsableBackends: () => Object.keys(declaredTimeouts),
    getFallbackChain: () => Object.keys(declaredTimeouts),
    getBackend: (name) => {
      if (!(name in declaredTimeouts)) return null;
      const timeout = declaredTimeouts[name];
      return {
        name,
        type: 'openai_compatible',
        config: timeout === null ? {} : { timeout }
      };
    },
    getKeyStatus: () => ({ configured: false })
  };
}

/** One generate_file run on `lane`; returns the timeout handed to makeRequest. */
async function generateTimeout(lane, declaredTimeouts, tokens) {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-declared-gen-'));
  try {
    const handler = stubOffline(
      new GenerateFileHandler({ backendRegistry: makeRegistry(declaredTimeouts) })
    );
    handler.calculateDynamicTokens = () => tokens;

    const recorded = [];
    handler.makeRequest = async (prompt, backend, options) => {
      recorded.push(options.timeout);
      return { content: GENERATED_CODE, metadata: { finishReason: 'stop' } };
    };

    const result = await handler.execute({
      spec: 'a function that sums two numbers',
      outputPath: path.join(tmpDir, 'sum.js'),
      options: { backend: lane, review: true }
    });

    expect(result.success).toBe(true);
    expect(recorded.length).toBe(1);
    return recorded[0];
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
}

/** One modify_file run on `lane`; returns the timeout handed to makeRequest. */
async function modifyTimeout(lane, declaredTimeouts, tokens) {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-declared-mod-'));
  try {
    const filePath = path.join(tmpDir, 'const.js');
    await fsp.writeFile(filePath, 'const x = 1;\nconsole.log(x);\n', 'utf8');

    const handler = stubOffline(
      new ModifyFileHandler({ backendRegistry: makeRegistry(declaredTimeouts) })
    );
    handler.calculateDynamicTokens = () => tokens;

    const recorded = [];
    handler.makeRequest = async (prompt, backend, options) => {
      recorded.push(options.timeout);
      return { content: APPLIED_BLOCK, metadata: { finishReason: 'stop' } };
    };

    const result = await handler.execute({
      filePath,
      instructions: 'change x to 2',
      options: { backend: lane, dryRun: true }
    });

    expect(result.success).toBe(true);
    expect(recorded.length).toBe(1);
    return recorded[0];
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
}

describe('a declared timeout caps the computed request budget', () => {
  it('generate_file: a lane declared at 20s is not handed the 85s estimate', async () => {
    expect(GENERATE_ESTIMATE_MS(1000)).toBe(85000);

    const timeout = await generateTimeout('operator_impatient_lane', { operator_impatient_lane: 20000 }, 1000);
    expect(timeout).toBe(20000);
  });

  it('modify_file: a lane declared at 20s is not handed the 180s estimate', async () => {
    expect(MODIFY_ESTIMATE_MS(3000)).toBe(180000);

    const timeout = await modifyTimeout('operator_impatient_lane', { operator_impatient_lane: 20000 }, 3000);
    expect(timeout).toBe(20000);
  });
});

describe('a lane that declares nothing keeps the behaviour it had', () => {
  it('generate_file: keeps its own estimate, still capped at its hardcoded 300s', async () => {
    const modest = await generateTimeout('operator_silent_lane', { operator_silent_lane: null }, 1000);
    expect(modest).toBe(GENERATE_ESTIMATE_MS(1000));
    expect(modest).toBe(85000);

    // The 300s cap is the handler's own and must survive untouched.
    const huge = await generateTimeout('operator_silent_lane', { operator_silent_lane: null }, 16000);
    expect(huge).toBe(300000);
  });

  it('modify_file: keeps its uncapped estimate, well past any declared value', async () => {
    const timeout = await modifyTimeout('operator_silent_lane', { operator_silent_lane: null }, 3000);
    expect(timeout).toBe(MODIFY_ESTIMATE_MS(3000));
    expect(timeout).toBe(180000);
  });

  it('a lane absent from configuration entirely is treated as declaring nothing', async () => {
    // getBackend returns null for this name — the guard must not throw.
    const timeout = await modifyTimeout('operator_unknown_lane', {}, 3000);
    expect(timeout).toBe(180000);
  });
});

describe('the declared timeout is a ceiling, never an override', () => {
  it('generate_file: a generous declaration does not inflate a small estimate', async () => {
    const timeout = await generateTimeout('operator_patient_lane', { operator_patient_lane: 600000 }, 1000);
    expect(timeout).toBe(85000);
  });

  it('generate_file: a declaration above 300s does not lift the handler\'s own cap', async () => {
    const timeout = await generateTimeout('operator_patient_lane', { operator_patient_lane: 600000 }, 16000);
    expect(timeout).toBe(300000);
  });

  it('modify_file: a generous declaration does not inflate the estimate', async () => {
    const timeout = await modifyTimeout('operator_patient_lane', { operator_patient_lane: 600000 }, 3000);
    expect(timeout).toBe(180000);
  });

  it('a malformed or non-positive declaration is ignored, not obeyed', async () => {
    for (const bogus of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '30000', null]) {
      const timeout = await modifyTimeout('operator_bogus_lane', { operator_bogus_lane: bogus }, 3000);
      expect(timeout).toBe(180000);
    }
  });
});
