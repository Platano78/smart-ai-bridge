# AGENTS.md — Smart AI Bridge

Instructions for AI agents and agentic harnesses. Two audiences, in order:

1. **Consuming** this project — installing and running it as an MCP server. Start here.
2. **Working on** this repo — where code lives and what the hard rules are.

Everything below is verified against the code at v2.13.0. If something here disagrees with the
code, the code wins and this file is a bug.

---

# Part 1 — Install and run (for a harness onboarding this as a tool)

## What this is

An MCP server (stdio transport, ESM Node.js) that gives an MCP client 17 tools for token-saving
file operations, multi-AI orchestration, and code review. It routes each request across local
and cloud LLM backends.

## Requirements

- Node.js >= 18.0.0 (enforced via `engines` in `package.json`)
- An MCP client that speaks stdio
- **No API key is required to install, start, or list tools.** A backend is only needed to
  actually execute a tool call.

## Install

There is no npm package. Install by cloning:

```bash
git clone https://github.com/Platano78/smart-ai-bridge.git
cd smart-ai-bridge
npm install
npm test          # expect all tests passing, 0 failures
```

## Run

```bash
node /absolute/path/to/smart-ai-bridge/src/server.js
```

- **stdout carries MCP JSON-RPC only.** Never write to stdout from this codebase; it corrupts
  the protocol stream. All diagnostics go to stderr.
- The server starts and serves `tools/list` (17 tools) with no backends configured.
- On startup it runs a readiness audit to stderr. A backend whose key is unset is reported as
  `cannot verify — <KEY> not set`. **That is not an error and not a failed install.**

## Register with a client

Use an **absolute path**; relative paths depend on the client honoring `cwd`. Copy
`.mcp.json.example`, or:

```json
{
  "mcpServers": {
    "smart-ai-bridge": {
      "command": "node",
      "args": ["/absolute/path/to/smart-ai-bridge/src/server.js"],
      "env": { "NVIDIA_API_KEY": "your-key" }
    }
  }
}
```

## Configure a backend (optional but needed to call tools)

Either is sufficient:

- **A local OpenAI-compatible server** (llama.cpp, vLLM, LM Studio, Ollama). Auto-discovered on
  common local ports. No key.
- **One cloud API key**: `NVIDIA_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, or `GROQ_API_KEY`.

Backend definitions: `src/config/backends.json`. Full reference: `CONFIGURATION.md`.

The six backend identifiers are `local`, `nvidia_deepseek`, `nvidia_glm`, `gemini`,
`openai_chatgpt`, `groq_llama`. Most tools also accept `backend: "auto"`.

## Verify it works

Call a tool that needs no backend:

```
get_analytics({})            -> {"success": true, ...}
```

Then, only if you configured one:

```
check_backend_health({ "backend": "auto" })
```

`check_backend_health({"backend": "local"})` reports critical when no local model is running.
On a cloud-only setup that is expected and does not indicate a broken install.

## Update

```bash
git pull origin main
npm install       # only when dependencies changed
```

Then reconnect the client (in Claude Code, `/mcp`).

## The 17 tools

`analyze_file`, `modify_file`, `generate_file`, `batch_analyze`, `batch_modify`, `explore`,
`refactor`, `write_files_atomic`, `backup_restore`, `ask`, `review`, `council`, `dual_iterate`,
`spawn_subagent`, `parallel_agents`, `check_backend_health`, `get_analytics`.

Names are exact — no aliases, no prefixes. Per-tool schemas and full response shapes live in
`src/tools/tool-definitions.js`, which is the authority; `EXAMPLES.md` has worked calls.

---

# Part 2 — Working on this repo

Route to the area for your task and load only its files.

| Task is about… | Read |
|---|---|
| MCP dispatch / server behaviour | `src/server.js`, `src/handlers/index.js`, `src/handlers/system-handlers.js`, `src/tools/tool-definitions.js` |
| Backend routing / escalation | `src/router.js`, `src/backends/backend-registry.js`, `src/backends/backend-adapter.js` |
| A specific backend adapter | `src/backends/{local,nvidia,gemini,groq,openai}-adapter.js`, `src/config/backends.json` |
| File tools (analyze/modify/generate/batch) | `src/handlers/{analyze-file,modify-file,generate-file,batch-analyze,batch-modify}-handler.js`, `src/handlers/base-handler.js` |
| Council / multi-AI workflows | `src/handlers/{council,dual-iterate,parallel-agents,subagent}-handler.js`, `src/config/role-templates.js` |
| Learning / intelligence | `src/intelligence/` |
| Compression | `src/compression/smartCrush.js` |
| Monitoring / dashboard | `src/monitoring/`, `src/dashboard/dashboard-server.js` |
| Local model discovery / context sizing | `src/utils/model-discovery.js` |
| Tests | `tests/` |

## Hard rules

1. **Never write to stdout.** `console.log` anywhere in `src/` corrupts the MCP stream. Use
   `console.error`. Guarded by `tests/stdio-purity.test.js`.
2. **Do not add or remove a tool casually.** `tests/integration.test.js` pins the count at 17 and
   asserts the README's `## Tools (N)` heading matches. That tripwire is deliberate.
3. **A missing API key is never a defect.** Keys are user-supplied. Report such a backend as
   "cannot verify", never "broken".
4. **Run `npm test` before proposing a change.** All tests must pass; there is no accepted
   baseline of failures.
5. **This is a public repo.** No private hostnames, IP addresses, internal project names, or
   personal infrastructure in code, comments, docs, or templates.

## Release

`package.json` version is the single source (`src/server.js` reads it). A release also updates
the README title and adds a `CHANGELOG.md` entry — both are enforced by drift guards in
`tests/integration.test.js`. Version strings that describe past events ("As of v2.12.0…") are
history and must not be bumped.
