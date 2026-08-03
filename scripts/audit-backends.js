#!/usr/bin/env node
/**
 * Audit every configured backend and report which ones actually work.
 *
 * Standalone CLI — not imported by the server at runtime.
 * Run: node scripts/audit-backends.js [--json] [--timeout <ms>]
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isModelRetired } from '../src/backends/model-retirement.js';
import { PROVIDER_ENDPOINTS as TYPE_TABLE, resolveBackendKey } from '../src/backends/provider-endpoints.js';

// ── helpers ─────────────────────────────────────────────────────────────────

const BACKENDS_CONFIG = JSON.parse(
  readFileSync(fileURLToPath(new URL('../src/config/backends.json', import.meta.url)), 'utf-8')
);

function parseArgs() {
  const args = process.argv.slice(2);
  let json = false;
  let timeout = 20000;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') json = true;
    else if (args[i] === '--timeout') timeout = Number(args[++i]) || 20000;
  }
  return { json, timeout };
}

function endpointFor(config, type) {
  if (config.url) return config.url;
  const entry = TYPE_TABLE[type];
  return entry ? entry.endpoint : null;
}

// ── probes ──────────────────────────────────────────────────────────────────

// Collapse whitespace (incl. newlines) and trim before truncating, so a
// multi-line JSON error body (e.g. a Gemini 429 body) can't break table
// alignment.
function clip(body, len = 200) {
  return String(body ?? '').replace(/\s+/g, ' ').trim().slice(0, len);
}

// A network/timeout failure is TRANSIENT (retry may help); anything else
// (e.g. a TypeError from a programming bug) must surface as ERROR so it
// isn't silently swallowed as a blip.
function classifyCatch(err) {
  if (err?.name === 'TimeoutError' || err?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' || String(err).includes('timeout')) {
    return { status: 'TRANSIENT', detail: 'timeout' };
  }
  const networkish = err instanceof TypeError || ['ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET', 'EAI_AGAIN'].includes(err?.cause?.code ?? err?.code);
  if (networkish) {
    return { status: 'TRANSIENT', detail: clip(err.message || String(err)) };
  }
  return { status: 'ERROR', detail: clip(err.message || String(err)) };
}

async function probeLocal(config, timeout) {
  try {
    if (!config.url) return { status: 'ERROR', detail: 'no url configured for local backend' };
    const origin = config.url.replace(/\/v1\/chat\/completions$/, '').replace(/\/+$/, '');
    const target = `${origin}/v1/models`;
    const resp = await fetch(target, { signal: AbortSignal.timeout(timeout) });
    if (resp.ok) return { status: 'OK' };
    return { status: 'ERROR', detail: `HTTP ${resp.status}` };
  } catch (err) {
    return classifyCatch(err);
  }
}

async function probeGemini(config, key, timeout) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(timeout),
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'ok' }] }] }),
    });
    if (resp.ok) {
      return { status: 'OK' };
    }
    const body = await resp.text().catch(() => '');
    if (resp.status === 429 || resp.status >= 500) {
      return { status: 'TRANSIENT', detail: `HTTP ${resp.status} — ${clip(body)}` };
    }
    if (isModelRetired(resp.status, body, config.model)) {
      return { status: 'RETIRED', detail: clip(body) };
    }
    return { status: 'ERROR', detail: `HTTP ${resp.status} — ${clip(body)}` };
  } catch (err) {
    return classifyCatch(err);
  }
}

async function probeOpenaiCompatible(url, config, key, timeout) {
  try {
    const resp = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(timeout),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: 'ok' }],
        max_tokens: 5,
      }),
    });
    if (resp.ok) {
      return { status: 'OK' };
    }
    const body = await resp.text().catch(() => '');
    if (resp.status === 429 || resp.status >= 500) {
      return { status: 'TRANSIENT', detail: `HTTP ${resp.status} — ${clip(body)}` };
    }
    if (isModelRetired(resp.status, body, config.model)) {
      return { status: 'RETIRED', detail: clip(body) };
    }
    return { status: 'ERROR', detail: `HTTP ${resp.status} — ${clip(body)}` };
  } catch (err) {
    return classifyCatch(err);
  }
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  const { json, timeout } = parseArgs();
  const backends = BACKENDS_CONFIG.backends;
  const results = [];

  for (const [name, def] of Object.entries(backends)) {
    if (!def.enabled) continue;

    const type = def.type;
    const config = def.config ?? {};
    const model = config.model ?? null;
    const tableEntry = TYPE_TABLE[type] ?? {};
    const envVar = tableEntry.envVar ?? '';

    // Class: no model
    if (!model && type !== 'local') {
      results.push({ backend: name, model: '(none)', status: 'NO_MODEL', detail: '' });
      continue;
    }

    // Local — reachability only
    if (type === 'local') {
      const r = await probeLocal(config, timeout);
      results.push({ backend: name, model: model ?? '(none)', status: r.status, detail: r.detail ?? '' });
      continue;
    }

    // Key resolution
    const key = resolveBackendKey(config, envVar);
    if (!key) {
      results.push({ backend: name, model, status: 'NO_KEY', detail: `cannot verify — ${envVar} not set` });
      continue;
    }

    // Probe
    let r;
    if (type === 'gemini') {
      r = await probeGemini(config, key, timeout);
    } else {
      const url = endpointFor(config, type);
      if (!url) {
        r = { status: 'ERROR', detail: 'no endpoint' };
      } else {
        r = await probeOpenaiCompatible(url, config, key, timeout);
      }
    }
    results.push({ backend: name, model, status: r.status, detail: r.detail ?? '' });
  }

  // ── output ──────────────────────────────────────────────────────────────

  if (json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    // Build aligned table
    const maxBackend = Math.max('BACKEND'.length, ...results.map(r => r.backend.length));
    const maxModel = Math.max('MODEL'.length, ...results.map(r => (r.model ?? '').length));
    const maxStatus = Math.max('STATUS'.length, ...results.map(r => r.status.length));

    const pad = (s, len) => String(s).padEnd(len);
    console.log(`${pad('BACKEND', maxBackend)}  ${pad('MODEL', maxModel)}  ${pad('STATUS', maxStatus)}  DETAIL`);
    console.log(`${'─'.repeat(maxBackend)}  ${'─'.repeat(maxModel)}  ${'─'.repeat(maxStatus)}  ${'─'.repeat(40)}`);
    for (const r of results) {
      console.log(`${pad(r.backend, maxBackend)}  ${pad(r.model ?? '', maxModel)}  ${pad(r.status, maxStatus)}  ${r.detail}`);
    }

    // Summary line
    const counts = {};
    for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
    const parts = Object.entries(counts).map(([k, n]) => `${n} ${k}`);
    console.log(`\n${parts.join(', ')}`);
  }

  // ── exit code ───────────────────────────────────────────────────────────

  const failStatuses = new Set(['RETIRED', 'ERROR', 'NO_MODEL']);
  const anyFail = results.some(r => failStatuses.has(r.status));
  if (anyFail) process.exit(1);
  process.exit(0);
}

main().catch(err => {
  console.error('audit-backends unhandled error:', err);
  process.exit(2);
});
