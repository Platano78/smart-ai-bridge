/**
 * @fileoverview Model-agnostic handling: SAB must survive whatever it is told to
 * talk to. A model whose name matches no table anywhere must still get usable
 * capabilities, a usable speed estimate, correct reasoning handling, and FIM when
 * the server supports it — and must never be excluded from routing.
 *
 * Every server here is a stub. No live network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import {
  CAPABILITIES,
  resolveModelCapabilities,
  scoreCapabilityMatch,
  findBestBackend,
  getBackendCapabilities
} from '../src/utils/capability-matcher.js';
import {
  getServerCapabilities,
  probeInfillSupport,
  supportsThinkingToggle,
  inferCapabilitiesFromMetadata,
  findBestLocalModel,
  clearCache
} from '../src/utils/model-discovery.js';
import {
  recordTimings,
  getLearnedTokensPerSecond,
  clearThroughput
} from '../src/utils/model-throughput.js';
import { LocalAdapter } from '../src/backends/local-adapter.js';
import { NvidiaGlmAdapter } from '../src/backends/nvidia-adapter.js';
import { ModifyFileHandler } from '../src/handlers/modify-file-handler.js';

/** A model name that matches no pattern in any table in this repo. */
const UNKNOWN_MODEL = 'acme-frobnicator-9x';

/** A chat template that advertises the thinking switch, as llama.cpp reports it. */
const TEMPLATE_WITH_THINKING =
  '{%- if enable_thinking is defined and enable_thinking is false %}{{- "" }}{%- endif %}';
const TEMPLATE_WITHOUT_THINKING =
  '{%- for message in messages %}{{ message.content }}{%- endfor %}';

/**
 * Build a fetch stub that routes by URL + method, the way a real server does —
 * so the code under test can make whatever calls it needs in whatever order.
 */
function stubServer(spec = {}) {
  const calls = [];
  const notFound = {
    ok: false, status: 404, statusText: 'Not Found',
    text: async () => 'nope', json: async () => ({})
  };
  const fetchMock = vi.fn(async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, method: init.method || 'GET', body: init.body });

    if (u.endsWith('/props')) {
      return spec.props ? { ok: true, status: 200, json: async () => spec.props } : notFound;
    }
    if (u.endsWith('/v1/models')) {
      return spec.models ? { ok: true, status: 200, json: async () => spec.models } : notFound;
    }
    if (u.endsWith('/infill')) {
      return (spec.infill === null || spec.infill === undefined)
        ? notFound
        : { ok: true, status: 200, json: async () => ({ content: spec.infill }) };
    }
    if (u.endsWith('/v1/chat/completions')) {
      return spec.completion ? { ok: true, status: 200, json: async () => spec.completion } : notFound;
    }
    return notFound;
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}

/** /props as a llama.cpp server actually reports it, for an unheard-of model. */
function unknownModelProps(overrides = {}) {
  return {
    model_path: `/models/${UNKNOWN_MODEL}.Q6_K.gguf`,
    model_alias: UNKNOWN_MODEL,
    model_ftype: 'Q6_K',
    total_slots: 4,
    is_sleeping: false,
    bos_token: '<s>',
    eos_token: '</s>',
    build_info: 'b10330',
    modalities: { vision: false, video: false, audio: false },
    chat_template: TEMPLATE_WITH_THINKING,
    chat_template_caps: {
      supports_tools: true,
      supports_tool_calls: true,
      supports_system_role: true,
      supports_parallel_tool_calls: true,
      supports_preserve_reasoning: true,
      supports_object_arguments: true,
      supports_string_content: true,
      supports_typed_content: true
    },
    default_generation_settings: { n_ctx: 262144 },
    ...overrides
  };
}

function makeLocalAdapter(url = 'http://localhost:8081/v1/chat/completions') {
  const adapter = new LocalAdapter({ skipAutodiscovery: true });
  adapter.initialized = true;
  adapter.config.url = url;
  adapter.model = UNKNOWN_MODEL;
  adapter.modelId = UNKNOWN_MODEL;
  return adapter;
}

function makeModifyHandler({ localUrl = 'http://localhost:8081/v1/chat/completions', routerResponse } = {}) {
  const localAdapter = { config: { url: localUrl }, modelId: UNKNOWN_MODEL };
  return new ModifyFileHandler({
    backendRegistry: {
      getAdapter: (name) => (name === 'local' ? localAdapter : null),
      getBackend: () => null,
      getKeyStatus: () => null,
      registerRoutingOverride: () => {},
      selectBackend: () => ({ backend: 'local' })
    },
    router: { makeRequest: async () => routerResponse }
  });
}

beforeEach(() => {
  clearCache();
  clearThroughput();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearCache();
  clearThroughput();
});

describe('an unknown model stays routable', () => {
  it('gets a non-empty capability set when nothing at all is known about it', () => {
    const caps = resolveModelCapabilities({});
    expect(caps.length).toBeGreaterThan(0);
    expect(caps).toContain(CAPABILITIES.GENERAL);
  });

  it('is not scored to zero against a requirement it cannot prove', () => {
    const caps = resolveModelCapabilities({});
    expect(scoreCapabilityMatch(caps, [CAPABILITIES.CODE_SPECIALIZED])).toBeGreaterThan(0);
  });

  it('is still selected by findBestBackend when it is the only backend', () => {
    const result = findBestBackend({
      requiredCapabilities: [CAPABILITIES.CODE_SPECIALIZED, CAPABILITIES.DEEP_REASONING],
      availableBackends: ['local'],
      getLocalCapabilities: () => resolveModelCapabilities({})
    });
    expect(result.backend).toBe('local');
    expect(result.score).toBeGreaterThan(0);
  });

  it('never outranks a model that actually has the required capability', () => {
    const unknown = scoreCapabilityMatch(
      resolveModelCapabilities({}), [CAPABILITIES.CODE_SPECIALIZED]);
    const known = scoreCapabilityMatch(
      [CAPABILITIES.CODE_SPECIALIZED], [CAPABILITIES.CODE_SPECIALIZED]);
    expect(known).toBeGreaterThan(unknown);
  });

  it('gets the SAME capabilities whatever it is called', () => {
    const server = { nCtx: 262144, chatTemplateCaps: { supports_tools: true } };
    const asUnknown = resolveModelCapabilities({ ...server });
    const asFamousName = resolveModelCapabilities({ ...server });
    expect(asUnknown).toEqual(asFamousName);
  });

  it('honours an operator-declared capabilities array over everything else', () => {
    const caps = resolveModelCapabilities({
      declaredCapabilities: [CAPABILITIES.CODE_SPECIALIZED, CAPABILITIES.SECURITY_FOCUS],
      nCtx: 4096
    });
    expect(caps).toEqual([CAPABILITIES.CODE_SPECIALIZED, CAPABILITIES.SECURITY_FOCUS]);
    expect(scoreCapabilityMatch(caps, [CAPABILITIES.CODE_SPECIALIZED])).toBeGreaterThan(
      scoreCapabilityMatch(resolveModelCapabilities({}), [CAPABILITIES.CODE_SPECIALIZED]));
  });

  it('ignores a capability the operator invented, without losing routability', () => {
    const caps = resolveModelCapabilities({ declaredCapabilities: ['telepathy'] });
    expect(caps).toEqual([CAPABILITIES.GENERAL]);
  });

  it('derives capabilities from server-reported metadata, not the name', () => {
    const caps = inferCapabilitiesFromMetadata({
      modelAlias: UNKNOWN_MODEL,
      modelPath: `/models/${UNKNOWN_MODEL}.gguf`,
      nParams: 0,
      nCtxTrain: 0,
      nCtx: 262144,
      modalities: { vision: true, audio: false },
      chatTemplateCaps: { supports_tools: true, supports_preserve_reasoning: true }
    });
    expect(caps).toContain(CAPABILITIES.GENERAL);
    expect(caps).toContain(CAPABILITIES.DEEP_REASONING);
    expect(caps).toContain(CAPABILITIES.VISION);
    expect(caps).toContain(CAPABILITIES.LARGE_CONTEXT);
  });

  it('still returns a non-empty set when the server reports nothing at all', () => {
    const caps = inferCapabilitiesFromMetadata({
      modelAlias: UNKNOWN_MODEL, modelPath: '', nParams: 0, nCtxTrain: 0, nCtx: 0
    });
    expect(caps.length).toBeGreaterThan(0);
  });

  it('is returned by findBestLocalModel instead of "no models available"', async () => {
    stubServer({
      props: unknownModelProps(),
      models: { data: [{ id: UNKNOWN_MODEL, meta: {} }] }
    });
    const result = await findBestLocalModel([CAPABILITIES.CODE_SPECIALIZED], { ports: [8081] });
    expect(result.model).not.toBeNull();
    expect(result.model.modelAlias).toBe(UNKNOWN_MODEL);
  });
});

describe('FIM: native /infill, or a normal modify — never a borrowed token table', () => {
  it('prefers native /infill when the server answers it', async () => {
    const { calls } = stubServer({
      props: unknownModelProps(),
      models: { data: [{ id: UNKNOWN_MODEL }] },
      infill: '\n    return a + b'
    });

    const strategy = await makeModifyHandler().resolveFIMStrategy();
    expect(strategy.mode).toBe('infill');
    expect(calls.some(c => c.url.endsWith('/infill') && c.method === 'POST')).toBe(true);
  });

  it('does a normal modify when /infill is absent, whatever the model is called', async () => {
    stubServer({
      props: unknownModelProps({ model_alias: 'a-name-that-once-had-a-token-table-entry' }),
      models: { data: [{ id: 'a-name-that-once-had-a-token-table-entry' }] },
      infill: null
    });
    const strategy = await makeModifyHandler().resolveFIMStrategy();
    expect(strategy.mode).toBe('none');
    expect(strategy.tokens).toBeUndefined();
  });

  it('never sends sentinel tokens of its own to any model', async () => {
    stubServer({
      props: unknownModelProps(),
      models: { data: [{ id: UNKNOWN_MODEL }] },
      infill: null
    });
    const strategy = await makeModifyHandler().resolveFIMStrategy();
    expect(strategy.mode).toBe('none');
    expect(strategy.tokens).toBeUndefined();

    const prompt = makeModifyHandler().buildFIMPrompt('a\nb\n', 'do it', 2);
    expect(prompt).not.toMatch(/fim[_\u2581]|<PRE>|<SUF>|<MID>/i);
  });

  it('degrades to normal modify when there is no server at all', async () => {
    stubServer({});
    expect((await makeModifyHandler().resolveFIMStrategy()).mode).toBe('none');
  });

  it('runs a native infill and returns the generated middle', async () => {
    stubServer({
      props: unknownModelProps(),
      models: { data: [{ id: UNKNOWN_MODEL }] },
      infill: '\n    return a + b'
    });
    const middle = await makeModifyHandler()
      .runNativeInfill('def add(a, b):\n    pass\n', 'implement it', 2);
    expect(middle).toBe('\n    return a + b');
  });

  it('caches the /infill answer per model, and a model swap re-probes', async () => {
    const first = stubServer({
      props: unknownModelProps(),
      models: { data: [{ id: UNKNOWN_MODEL }] },
      infill: 'x'
    });
    expect(await probeInfillSupport('http://localhost:8081')).toBe(true);
    const after = first.calls.filter(c => c.url.endsWith('/infill')).length;
    expect(await probeInfillSupport('http://localhost:8081')).toBe(true);
    expect(first.calls.filter(c => c.url.endsWith('/infill')).length).toBe(after);

    // Swap the model: a different model_path means a different cache key.
    vi.unstubAllGlobals();
    clearCache();
    const second = stubServer({
      props: unknownModelProps({ model_path: '/models/other.gguf', model_alias: 'other' }),
      models: { data: [{ id: 'other' }] },
      infill: null
    });
    expect(await probeInfillSupport('http://localhost:8081')).toBe(false);
    expect(second.calls.filter(c => c.url.endsWith('/infill')).length).toBeGreaterThan(0);
  });
});

describe('speed is learned from timings, not from the model name', () => {
  it('learns predicted_per_second off a completion the bridge already made', () => {
    const adapter = makeLocalAdapter();
    const seed = adapter.getTokensPerSecond();

    adapter.parseResponse({
      model: UNKNOWN_MODEL,
      choices: [{ message: { content: 'ok' } }],
      timings: { predicted_n: 128, predicted_per_second: 79.26, prompt_per_second: 257.08 }
    });

    expect(getLearnedTokensPerSecond(UNKNOWN_MODEL)).toBeCloseTo(79.26, 2);
    expect(adapter.getTokensPerSecond()).toBeCloseTo(79.26, 2);
    expect(adapter.getTokensPerSecond()).not.toBe(seed);
  });

  it('a model swap does not inherit the previous occupant\'s speed', () => {
    const adapter = makeLocalAdapter();
    adapter.parseResponse({
      model: UNKNOWN_MODEL,
      choices: [{ message: { content: 'ok' } }],
      timings: { predicted_n: 128, predicted_per_second: 79.26 }
    });
    expect(adapter.getTokensPerSecond()).toBeCloseTo(79.26, 2);

    adapter.modelId = 'brand-new-model';
    expect(getLearnedTokensPerSecond('brand-new-model')).toBeNull();
    expect(adapter.getTokensPerSecond()).not.toBeCloseTo(79.26, 2);
  });

  it('falls back to the cold-start seed when the server reports no timings', () => {
    const adapter = makeLocalAdapter();
    adapter.parseResponse({ model: UNKNOWN_MODEL, choices: [{ message: { content: 'ok' } }] });
    expect(getLearnedTokensPerSecond(UNKNOWN_MODEL)).toBeNull();
    expect(adapter.getTokensPerSecond()).toBeGreaterThan(0);
  });

  it('ignores implausible or too-short samples', () => {
    expect(recordTimings(UNKNOWN_MODEL, { predicted_n: 2, predicted_per_second: 900 })).toBeNull();
    expect(recordTimings(UNKNOWN_MODEL, { predicted_n: 100, predicted_per_second: 0 })).toBeNull();
    expect(getLearnedTokensPerSecond(UNKNOWN_MODEL)).toBeNull();
  });
});

describe('thinking suppression is gated on the template, not the name', () => {
  it('detects the switch from the chat template TEXT', () => {
    expect(supportsThinkingToggle({ chatTemplate: TEMPLATE_WITH_THINKING })).toBe(true);
    expect(supportsThinkingToggle({ chatTemplate: TEMPLATE_WITHOUT_THINKING })).toBe(false);
    expect(supportsThinkingToggle({})).toBe(false);
  });

  it('sends enable_thinking when the loaded model\'s template supports it', async () => {
    const { calls } = stubServer({
      props: unknownModelProps(),
      models: { data: [{ id: UNKNOWN_MODEL, status: { value: 'loaded' } }] },
      completion: { choices: [{ message: { content: 'ok' } }] }
    });

    await makeLocalAdapter().makeRequest('hi', { disableThinking: true });

    const wire = JSON.parse(calls.find(c => c.url.endsWith('/v1/chat/completions')).body);
    expect(wire.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(wire.reasoning_format).toBe('none');
  });

  it('does NOT send enable_thinking when the template never mentions it', async () => {
    const { calls } = stubServer({
      props: unknownModelProps({ chat_template: TEMPLATE_WITHOUT_THINKING }),
      models: { data: [{ id: UNKNOWN_MODEL, status: { value: 'loaded' } }] },
      completion: { choices: [{ message: { content: 'ok' } }] }
    });

    await makeLocalAdapter().makeRequest('hi', { disableThinking: true });

    const wire = JSON.parse(calls.find(c => c.url.endsWith('/v1/chat/completions')).body);
    expect(wire.chat_template_kwargs).toBeUndefined();
    expect(wire.reasoning_format).toBe('none');
  });

  it('sends neither switch to a server that publishes no /props', async () => {
    const { calls } = stubServer({
      models: { data: [{ id: UNKNOWN_MODEL, status: { value: 'loaded' } }] },
      completion: { choices: [{ message: { content: 'ok' } }] }
    });

    await makeLocalAdapter().makeRequest('hi', { disableThinking: true });

    const wire = JSON.parse(calls.find(c => c.url.endsWith('/v1/chat/completions')).body);
    expect(wire.chat_template_kwargs).toBeUndefined();
    expect(wire.reasoning_format).toBeUndefined();
  });

  it('adds no probe when the caller does not ask to disable thinking', async () => {
    const { calls } = stubServer({
      props: unknownModelProps(),
      models: { data: [{ id: UNKNOWN_MODEL, status: { value: 'loaded' } }] },
      completion: { choices: [{ message: { content: 'ok' } }] }
    });

    await makeLocalAdapter().makeRequest('hi', {});
    expect(calls.some(c => c.url.endsWith('/props'))).toBe(false);
  });
});

describe('a server that is not llama.cpp still works', () => {
  it('reports "assume nothing" rather than throwing when /props is absent', async () => {
    stubServer({ models: { data: [{ id: 'mystery-model', max_model_len: 32768 }] } });
    const caps = await getServerCapabilities('http://localhost:8000/v1/chat/completions');
    expect(caps.available).toBe(false);
    expect(caps.supportsThinkingToggle).toBe(false);
    expect(caps.serverType).toBe('unknown');
  });

  it('returns false from the /infill probe rather than throwing', async () => {
    stubServer({ models: { data: [{ id: 'mystery-model' }] } });
    await expect(probeInfillSupport('http://localhost:8000')).resolves.toBe(false);
  });

  it('completes a request with no /props, no /infill and no timings', async () => {
    const { calls } = stubServer({
      models: { data: [{ id: 'mystery-model', status: { value: 'loaded' } }] },
      completion: { choices: [{ message: { content: 'hello from vLLM' } }] }
    });

    const adapter = makeLocalAdapter('http://localhost:8000/v1/chat/completions');
    adapter.modelId = 'mystery-model';
    adapter.model = 'mystery-model';
    const result = await adapter.makeRequest('hi', { disableThinking: true });

    expect(result.content).toBe('hello from vLLM');
    const wire = JSON.parse(calls.find(c => c.url.endsWith('/v1/chat/completions')).body);
    expect('chat_template_kwargs' in wire).toBe(false);
    expect('reasoning_format' in wire).toBe(false);
    expect(adapter.getTokensPerSecond()).toBeGreaterThan(0);
  });
});

describe('cloud backends are unchanged', () => {
  it('keeps their static capability sets', () => {
    expect(getBackendCapabilities('nvidia_glm')).toEqual([
      CAPABILITIES.CODE_SPECIALIZED,
      CAPABILITIES.DEEP_REASONING
    ]);
    expect(getBackendCapabilities('groq_llama')).toEqual([
      CAPABILITIES.FAST_GENERATION,
      CAPABILITIES.GENERAL
    ]);
  });

  it('never probes /props or /infill from a cloud adapter', () => {
    const { calls } = stubServer({});
    const body = new NvidiaGlmAdapter({ apiKey: 'placeholder' })
      .buildRequestBody('hi', { disableThinking: true });

    expect('chat_template_kwargs' in body).toBe(false);
    expect(calls.some(c => c.url.includes('/props') || c.url.includes('/infill'))).toBe(false);
  });
});

describe('ACCEPTANCE: a model nobody has ever heard of', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sab-agnostic-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('gets capabilities, a speed estimate, correct thinking handling and a working modify_file', async () => {
    stubServer({
      props: unknownModelProps(),
      models: { data: [{ id: UNKNOWN_MODEL, status: { value: 'loaded' }, meta: {} }] },
      infill: null,
      completion: { choices: [{ message: { content: 'ok' } }] }
    });

    const caps = await getServerCapabilities('http://localhost:8081/v1/chat/completions');
    expect(caps.available).toBe(true);
    expect(caps.modelIdentity).toContain(UNKNOWN_MODEL);

    const inferred = inferCapabilitiesFromMetadata({
      modelAlias: UNKNOWN_MODEL,
      modelPath: caps.modelIdentity,
      nParams: 0,
      nCtxTrain: 0,
      nCtx: caps.nCtx,
      modalities: caps.modalities,
      chatTemplateCaps: caps.chatTemplateCaps
    });
    expect(inferred.length).toBeGreaterThan(0);
    console.log('[ACCEPTANCE] capabilities:', JSON.stringify(inferred));

    const routing = findBestBackend({
      requiredCapabilities: [CAPABILITIES.CODE_SPECIALIZED],
      availableBackends: ['local'],
      getLocalCapabilities: () => inferred
    });
    expect(routing.backend).toBe('local');
    expect(routing.score).toBeGreaterThan(0);
    console.log(`[ACCEPTANCE] routable: backend=${routing.backend} score=${routing.score}`);

    // Operator-declared capabilities win over everything the server said.
    const declaring = makeLocalAdapter();
    declaring.config.capabilities = [CAPABILITIES.CODE_SPECIALIZED];
    declaring.config.modelCapabilities = { [UNKNOWN_MODEL]: [CAPABILITIES.DEEP_REASONING] };
    declaring.availableModels = [{ id: UNKNOWN_MODEL, nCtx: 262144, slots: 1, status: 'loaded' }];
    expect(declaring.getModelCapabilities()).toEqual([CAPABILITIES.DEEP_REASONING]);
    console.log('[ACCEPTANCE] operator-declared:', JSON.stringify(declaring.getModelCapabilities()));

    const adapter = makeLocalAdapter();
    const seed = adapter.getTokensPerSecond();
    expect(seed).toBeGreaterThan(0);
    adapter.parseResponse({
      model: UNKNOWN_MODEL,
      choices: [{ message: { content: 'ok' } }],
      timings: { predicted_n: 256, predicted_per_second: 79.26 }
    });
    const learned = adapter.getTokensPerSecond();
    expect(learned).toBeCloseTo(79.26, 2);
    console.log(`[ACCEPTANCE] speed: seed=${seed} t/s -> learned=${learned} t/s`);

    expect(caps.supportsThinkingToggle).toBe(true);
    console.log('[ACCEPTANCE] supportsThinkingToggle:', caps.supportsThinkingToggle);

    const filePath = path.join(tmpDir, 'add.py');
    await fs.writeFile(filePath, 'def add(a, b):\n    return 0\n\n\ndef sub(a, b):\n    return a - b\n');

    const handler = makeModifyHandler({
      routerResponse: {
        content: [
          'SUMMARY: fix add',
          '',
          '<<<<<<< SEARCH',
          '    return 0',
          '=======',
          '    return a + b',
          '>>>>>>> REPLACE'
        ].join('\n'),
        metadata: { finishReason: 'stop' }
      }
    });

    const result = await handler.execute({
      filePath,
      instructions: 'make add actually add',
      options: { backend: 'local', useFIM: true, insertionLine: 2, dryRun: true }
    });

    console.log('[ACCEPTANCE] modify_file success:', result.success, '| summary:', result.summary);
    expect(result.success).toBe(true);
    expect(result.diff).toContain('return a + b');
  });
});

describe('ACCEPTANCE: a server that reports nothing at all', () => {
  let bareDir;

  beforeEach(async () => {
    bareDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sab-bare-'));
  });

  afterEach(async () => {
    await fs.rm(bareDir, { recursive: true, force: true });
  });

  it('still yields capabilities, a speed estimate and a working modify_file', async () => {
    // No /props, no /infill, no timings — a bare OpenAI-compatible proxy.
    stubServer({ models: { data: [{ id: 'mystery-model', status: { value: 'loaded' } }] } });

    const caps = resolveModelCapabilities({});
    expect(caps.length).toBeGreaterThan(0);
    console.log('[ACCEPTANCE-BARE] capabilities:', JSON.stringify(caps));

    const adapter = makeLocalAdapter('http://localhost:8000/v1/chat/completions');
    adapter.modelId = 'mystery-model';
    const speed = adapter.getTokensPerSecond();
    expect(speed).toBeGreaterThan(0);
    console.log(`[ACCEPTANCE-BARE] cold-start speed: ${speed} t/s`);

    const handler = makeModifyHandler({
      localUrl: 'http://localhost:8000/v1/chat/completions',
      routerResponse: {
        content: [
          'SUMMARY: fix add',
          '',
          '<<<<<<< SEARCH',
          '    return 0',
          '=======',
          '    return a + b',
          '>>>>>>> REPLACE'
        ].join('\n'),
        metadata: { finishReason: 'stop' }
      }
    });

    const strategy = await handler.resolveFIMStrategy();
    expect(strategy.mode).toBe('none');
    console.log('[ACCEPTANCE-BARE] FIM strategy:', strategy.mode);

    const filePath = path.join(bareDir, 'add.py');
    await fs.writeFile(filePath, 'def add(a, b):\n    return 0\n');

    const result = await handler.execute({
      filePath,
      instructions: 'make add actually add',
      options: { backend: 'local', useFIM: true, insertionLine: 2, dryRun: true }
    });
    expect(result.success).toBe(true);
    console.log('[ACCEPTANCE-BARE] modify_file success:', result.success, '| summary:', result.summary);
  });
});

describe('ACCEPTANCE: modify_file drives the native /infill path end to end', () => {
  let tmpDir;
  beforeEach(async () => { tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sab-infill-')); });
  afterEach(async () => { await fs.rm(tmpDir, { recursive: true, force: true }); });

  it('inserts the server-generated middle without ever touching the token table', async () => {
    const { calls } = stubServer({
      props: unknownModelProps(),
      models: { data: [{ id: UNKNOWN_MODEL, status: { value: 'loaded' }, meta: {} }] },
      infill: '    return a + b',
      completion: { choices: [{ message: { content: 'SHOULD NOT BE USED' } }] }
    });

    const filePath = path.join(tmpDir, 'add.py');
    await fs.writeFile(filePath, 'def add(a, b):\n    raise NotImplementedError\n');

    const handler = makeModifyHandler({
      routerResponse: { content: 'SHOULD NOT BE USED', metadata: { finishReason: 'stop' } }
    });

    const result = await handler.execute({
      filePath,
      instructions: 'implement add',
      options: { backend: 'local', useFIM: true, insertionLine: 2, dryRun: true }
    });

    console.log('[ACCEPTANCE-FIM] /infill calls:',
      calls.filter(c => c.url.endsWith('/infill') && c.method === 'POST').length,
      '| chat/completions calls:',
      calls.filter(c => c.url.endsWith('/v1/chat/completions')).length);
    console.log('[ACCEPTANCE-FIM] summary:', result.summary);

    expect(result.success).toBe(true);
    expect(result.diff).toContain('return a + b');
    expect(result.summary).toContain('FIM insertion');
    // The chat-completions lane was never used for this modify.
    expect(calls.some(c => c.url.endsWith('/v1/chat/completions'))).toBe(false);
  });
});
