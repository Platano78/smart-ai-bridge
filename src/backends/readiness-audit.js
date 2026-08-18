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

import { PROVIDER_ENDPOINTS, PROVIDER_CATALOGS, CATALOG_KIND_FOR_TYPE, resolveBackendKey } from './provider-endpoints.js';
import { selectModel } from './capacity-discovery.js';

/** `/chat/completions` URL -> provider `/models` catalog URL, or null. */
export function catalogUrlFor(url) {
  return PROVIDER_CATALOGS.openaiCompatible.catalogUrl(url);
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

async function fetchCatalog(catalogUrl, apiKey, catalog, timeoutMs) {
  try {
    const res = await fetch(catalogUrl, {
      headers: catalog.authHeader(apiKey),
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const body = await res.json();
    return { ids: catalog.entries(body).map(e => e.id) };
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

    const catalogKind = CATALOG_KIND_FOR_TYPE[e.type];
    const catalog = catalogKind ? PROVIDER_CATALOGS[catalogKind] : null;
    const catUrl = catalog ? catalog.catalogUrl(e.url) : null;
    if (!catalog || !catUrl) {
      findings.push({ severity: 'unknown', backend: e.name, model: e.model, reason: 'cannot verify — no catalog check available for this backend type' });
      continue;
    }
    if (!catalogCache.has(catUrl)) catalogCache.set(catUrl, await fetchCatalog(catUrl, key, catalog, timeoutMs));
    checked++;
    const cat = catalogCache.get(catUrl);
    if (cat.error) {
      findings.push({ severity: 'unknown', backend: e.name, model: e.model, reason: `catalog unreachable (${cat.error})` });
    } else if (e.model) {
      if (!cat.ids.includes(e.model)) {
        findings.push({ severity: 'critical', backend: e.name, model: e.model, reason: 'model is NOT in the provider catalog — likely retired or renamed' });
      }
    } else {
      // No config.model — see whether auto-selection (largest published input
      // capacity) can resolve one. Providers that publish no capacity data for
      // any model (NVIDIA NIM today) can't be ranked honestly, so the lane
      // stays unconfigured and this reports real ids the operator can copy in.
      const selected = await selectModel({ name: e.name, type: e.type, config: e.config }, key);
      if (!selected) {
        // Deliberately NOT presenting a "top 5" here. This provider publishes no
        // capacity or capability fields, so any subset we picked would be an
        // arbitrary slice — and the alphabetically-first entries are things like
        // embedding models, which would break the lane if copied. Point the
        // operator at the full catalog instead of implying a recommendation.
        const catalogUrl = catalogUrlFor(e.url) ?? 'the provider catalog';
        findings.push({
          severity: 'unknown', backend: e.name, model: null,
          reason: `no model configured, and this provider publishes no capacity data, so one ` +
            `cannot be chosen automatically. ${cat.ids.length} models are available — list them ` +
            `with:  curl ${catalogUrl}  — then set config.model for "${e.name}" in ` +
            `src/config/backends.json (see src/config/backends.example.json). ` +
            `Note the catalog includes non-chat models, so pick a chat/instruct one.`
        });
      }
    }
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
