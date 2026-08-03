/**
 * @fileoverview Boot-time readiness audit — checks configured backends and
 * council topics for drift (retired models, unreachable endpoints, ghost
 * backend names). Fire-and-forget only (see wiring in server.js); findings
 * go to stderr — stdout is reserved for the MCP stdio transport.
 *
 * Owner ruling: API keys come from the end user, not the maintainer. A
 * backend with no resolvable key is `unknown` ("cannot verify"), never
 * critical/broken — most public users configure exactly one provider.
 */

import { PROVIDER_ENDPOINTS, resolveBackendKey } from './provider-endpoints.js';

/** `/chat/completions` URL -> provider `/models` catalog URL, or null. */
export function catalogUrlFor(url) {
  if (typeof url !== 'string') return null;
  const m = url.match(/^(https?:\/\/[^/]+(?:\/[^/]+)*?)\/chat\/completions$/);
  return m ? `${m[1]}/models` : null;
}

/**
 * SAB's `local` backend is `"model": "dynamic"` — a handle, not a catalog
 * id; the local router serves whatever it has loaded regardless of name.
 * So local endpoints are reachability-checked only, never catalog-checked
 * (comparing against /v1/models produced a false "retired" finding on
 * every boot). Generic RFC-1918 matching — not tied to any one machine.
 */
export function isLocalEndpoint(url) {
  try {
    const h = new URL(url).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]' ||
           /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);
  } catch { return false; }
}

async function fetchCatalog(catalogUrl, apiKey, timeoutMs) {
  try {
    const res = await fetch(catalogUrl, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const body = await res.json();
    return { ids: (body.data ?? []).map(m => m.id).filter(Boolean) };
  } catch (err) { return { error: err.message || String(err) }; }
}

async function checkLocalReachable(url, timeoutMs) {
  try {
    const origin = url.replace(/\/v1\/chat\/completions$/, '').replace(/\/+$/, '');
    const res = await fetch(`${origin}/v1/models`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok ? {} : { error: `HTTP ${res.status}` };
  } catch (err) { return { error: err.message || String(err) }; }
}

/** @returns {Promise<{findings: Array, checked: number}>} */
export async function auditReadiness({ backendsConfig, councilConfig, timeoutMs = 8000 }) {
  const findings = [];
  const entries = Object.entries(backendsConfig?.backends ?? {})
    .filter(([, def]) => def.enabled)
    .map(([name, def]) => ({
      name, type: def.type,
      url: def.config?.url ?? PROVIDER_ENDPOINTS[def.type]?.endpoint ?? null,
      model: def.config?.model ?? null,
      config: def.config ?? {}
    }));

  let checked = 0;
  const catalogCache = new Map();

  for (const e of entries) {
    if (isLocalEndpoint(e.url ?? '')) {
      checked++;
      const r = await checkLocalReachable(e.url, timeoutMs);
      if (r.error) findings.push({ severity: 'critical', backend: e.name, model: e.model, reason: `local endpoint unreachable (${r.error})` });
      continue;
    }

    const envVar = PROVIDER_ENDPOINTS[e.type]?.envVar ?? null;
    const key = resolveBackendKey(e.config, envVar);
    if (!key) {
      findings.push({ severity: 'unknown', backend: e.name, model: e.model, reason: `cannot verify — ${envVar ?? 'API key'} not set` });
      continue;
    }

    const catUrl = e.url ? catalogUrlFor(e.url) : null;
    if (!catUrl) { checked++; continue; }
    if (!catalogCache.has(catUrl)) catalogCache.set(catUrl, await fetchCatalog(catUrl, key, timeoutMs));
    checked++;
    const cat = catalogCache.get(catUrl);
    if (cat.error) findings.push({ severity: 'unknown', backend: e.name, model: e.model, reason: `catalog unreachable (${cat.error})` });
    else if (e.model && !cat.ids.includes(e.model)) findings.push({ severity: 'critical', backend: e.name, model: e.model, reason: 'model is NOT in the provider catalog — likely retired or renamed' });
  }

  const defined = new Set(entries.map(e => e.name));
  const broken = new Set(findings.filter(f => f.severity === 'critical').map(f => f.backend));
  for (const [topic, def] of Object.entries(councilConfig?.topics ?? {})) {
    const members = def.backends ?? [];
    for (const g of members.filter(m => !defined.has(m))) {
      findings.push({ severity: 'critical', backend: g, topic, reason: `council topic "${topic}" names undefined backend "${g}"` });
    }
    const usable = members.filter(m => defined.has(m) && !broken.has(m)).length;
    if (usable < 2) findings.push({ severity: 'critical', topic, reason: `council topic "${topic}" has fewer than 2 usable backends (${usable})` });
  }

  return { findings, checked };
}

/** Renders findings as log lines; [] on a clean audit so boot stays quiet. */
export function formatFindings({ findings, checked }) {
  if (!findings || findings.length === 0) return [];
  const lines = [`[SAB] Readiness audit: ${checked} backend(s) checked, ${findings.length} finding(s)`];
  for (const f of findings) {
    const where = f.backend ? `${f.backend}${f.model ? ` (${f.model})` : ''}` : (f.topic ?? '');
    lines.push(`[SAB]   [${f.severity}] ${where}: ${f.reason}`);
  }
  return lines;
}
