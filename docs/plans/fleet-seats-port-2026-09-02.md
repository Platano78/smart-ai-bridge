# Fleet seats port — make SAB honest about custom `local` seats (crew plan, 2026-09-02)

| | |
|---|---|
| **Repo / branch** | `smart-ai-bridge` @ `fleet-seats` (from v2.15.0 main). PUBLIC repo: no private hosts, keys, or owner names in any committed file — use placeholders exactly as `notes/fleet-dogfood-findings-2026-09-01.md` does |
| **Source of truth** | `notes/fleet-dogfood-findings-2026-09-01.md` (F1–F10, file:line, all re-verified on source 2026-09-02) + F11 below |
| **Dogfood config** | `data/backends-custom.json` (gitignored) — 4 `type:"local"` seats; `local_5080` disabled by ruling |
| **Verify by outcome** | every slice ends with a live MCP stdio call, never `npm test` alone |
| **OPTIMIZE FOR** | correctness > backward-compat for existing `backends.json` users > minimal diff > speed; MAY SACRIFICE: elegance |
| **Status** | [x] S1 [ ] S2 [ ] S3 [ ] S4 [ ] S5 [ ] S6 — append-only checklist; orchestrator ticks |

## Rulings (do not re-derive)
- Custom seats are first-class: anything a built-in can do by name, a custom seat can do by name.
- Disabled means unregistered AND unreachable by name (F1's ghost adapter is a bug, not a feature).
- A `local` seat's capacity comes from ITS declared URL, never from a localhost port scan (F5).
- `ask` must report the lane that actually served (F2); `modify_file`'s BaseHandler path is the reference.
- Keyless lanes never enter the cascade (F7a); custom priorities win ties over built-ins when equal — document the rule (F7b).
- No new test may require a real API key (AGENTS.md rule 4; fixes F9). Tests that need one are skipped with a reason, not failed.
- Do NOT touch `local-adapter.js`'s GET-only `checkHealth` (F10 non-finding); do not add any request that could wake a router.

## Slices (one agent per slice, sonnet, sequential — same repo)
**S1 — Custom-config merge is real (F1, F3).** `backend-registry.js:180-183`: an override rebuilds the adapter (`adapters.delete` + `createAdapter`) and `updateFallbackChain()`; a disabled backend is removed from `adapters` and from the chain. `readiness-audit.js` audits the LIVE registry, not `_backendsConfig`. Gate: startup log shows no adapter for a disabled seat; `check_backend_health {"backend":"local"}` on the dogfood config returns `Unknown backend`; audit reports the 3 enabled seats, 0 spurious key findings.
**S2 — Seat pinning (F6).** Replace the six hardcoded `enum: ['auto','local',...]` in `src/tools/tool-definitions.js` (also `:130`, `:417`) with a schema that accepts any registered backend name (string + runtime validation against the registry with a helpful error listing valid names). Gate: `modify_file` with `options.backend:"mb_worker"` runs on that seat (metadata.endpoint proves it); an unknown name returns the list, not -32602.
**S3 — Honest `ask` (F2).** `ask-handler.js:194,197,248,251`: use `result.backend` from `makeRequestWithFallback`. Gate: disable `mb_worker`, call `ask` with `backend:"auto"`, label == the endpoint's seat.
**S4 — Per-seat capacity (F5).** `base-handler.js:91` passes the selected backend; `getLocalContextLimit(backend)` probes `backend.config.url` (`/v1/models`, `--ctx-size` when present, else `context_limit` from config, else floor). Gate: `mb_worker` and `coder` report different capacities; `auto` ≥ the best enabled local seat.
**S5 — Cascade hygiene (F7, F8).** `makeRequestWithFallback` iterates `getUsableBackends()` ∩ enabled; tie-break rule documented in CONFIGURATION.md and enforced (custom before built-in on equal priority). Gate: with `mb_worker` disabled and cloud lanes at default priorities, the cascade never attempts a keyless lane (log proves it) and lands on the next enabled local seat.
**S6 — Visibility + tests (F4, F9, F11).** Readiness audit derives council rosters via `deriveDefaultBackendsForTopic`; the summary health tool lists custom seats; `council-defaults-not-hardcoded.test.js:33` skips (with reason) when `GROQ_API_KEY` is unset; add tests for S1–S5 using a fixture custom file with placeholder hosts. Gate: `npm test` → 0 failed (skips allowed with reasons); fresh-session health table shows all seats.

## HARD GATES (paste outputs verbatim; any failure = fix before reporting)
- `npm test` → `0 failed`, baseline 522 passed + yours.
- Live MCP stdio probe per slice (the python driver in the findings note's method, or `scripts/`): `initialize` → `tools/call` — results pasted.
- `git diff --stat` touches only files named in the slice; `data/` never staged; `grep -rnE '192\.168\.|aldwin' $(git diff --name-only)` → empty.
- Do NOT commit — orchestrator commits per green slice.

## Report format (per slice)
files changed · gate outputs verbatim · epistemic ledger (observed / inferred / assumed / unknown / disconfirmed) · **low-confidence rulings** (design calls you made that should have been the orchestrator's — empty list is an answer).

## F11 (added 2026-09-02, verified by stdio probe)
The summary health tool renders only `backends.json` built-ins; custom seats are absent from a fresh session's health table even though `check_backend_health {"backend":"mb_worker"}` returns online. Fix lives in S6.
