# Smart AI Bridge v2.6.0

<a href="https://glama.ai/mcp/servers/@Platano78/Smart-AI-Bridge">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@Platano78/Smart-AI-Bridge/badge" />
</a>

**Config-driven multi-AI orchestration for Claude Code. Add any OpenAI-compatible provider, route intelligently, and let multiple AIs collaborate through the council system.**

## What It Does

Smart AI Bridge is an MCP server that sits between Claude Code and your AI backends. It provides 18 tools for token-saving file operations, multi-AI workflows, code quality checks, and intelligent routing -- all configured through a single JSON file.

- **Any OpenAI-compatible provider works.** Local models (vLLM, LM Studio, Ollama), cloud APIs, or a mix of both. The included presets cover common providers, but adding your own is just a config entry.
- **Smart routing** selects the best backend per task using a 4-tier system: forced selection, learned preferences, rule-based heuristics, and health-based fallback.
- **Council system** queries multiple backends on the same prompt and returns all responses for Claude to synthesize. Configurable strategies (parallel, sequential, debate, fallback) per topic.
- **Web dashboard** for managing backends and council configuration without editing JSON files.

## Quick Start

### 1. Install

```bash
cd /path/to/smart-ai-bridge
npm install
```

### 2. Configure Backends

Backend configuration lives in `src/config/backends.json`. Set API keys for the providers you want to use:

```bash
# Examples -- set whichever keys apply to your backends
export NVIDIA_API_KEY="your-key"
export OPENAI_API_KEY="your-key"
export GEMINI_API_KEY="your-key"
export GROQ_API_KEY="your-key"
```

You only need at least one working backend (a local model or one cloud API key). See [CONFIGURATION.md](CONFIGURATION.md) for the full config reference.

### 3. Add to Claude Code

```json
{
  "mcpServers": {
    "smart-ai-bridge": {
      "command": "node",
      "args": ["src/server.js"],
      "cwd": "/path/to/smart-ai-bridge",
      "env": {
        "NVIDIA_API_KEY": "your-key",
        "OPENAI_API_KEY": "your-key",
        "GEMINI_API_KEY": "your-key",
        "GROQ_API_KEY": "your-key"
      }
    }
  }
}
```

### 4. Restart Claude Code

After restarting, all 18 tools will be available. Verify with:

```
@check_backend_health({ "backend": "local" })
```

## Tools (18)

### Token-Saving File Operations

| Tool | Savings | Description |
|------|---------|-------------|
| `analyze_file` | ~90% | Backend reads and analyzes files, returns structured findings |
| `modify_file` | ~95% | Backend applies natural-language edits, returns diff |
| `batch_analyze` | ~90%/file | Analyze multiple files via glob patterns |
| `batch_modify` | ~95%/file | Apply same instructions across multiple files |
| `generate_file` | ~80% | Generate code from a natural-language spec |
| `explore` | ~90% | Answer codebase questions using intelligent search |

### Multi-AI Workflows

| Tool | Description |
|------|-------------|
| `ask` | Smart routing with auto or forced backend selection |
| `council` | Multi-AI consensus across configurable backends |
| `dual_iterate` | Generate, review, fix loop between two backends |
| `parallel_agents` | TDD workflow with decomposition and quality gates |
| `spawn_subagent` | Specialized AI agents (10 roles including TDD) |

### Code Quality

| Tool | Description |
|------|-------------|
| `review` | Security, performance, and quality review |
| `refactor` | Cross-file refactoring with reference updates |

### Infrastructure

| Tool | Description |
|------|-------------|
| `check_backend_health` | Health diagnostics for specific backends |
| `backup_restore` | Timestamped backup management |
| `write_files_atomic` | Atomic multi-file writes with backup |
| `manage_conversation` | Multi-turn conversation threading |
| `get_analytics` | Usage analytics and optimization recommendations |

## Smart Routing

The router selects backends using a 4-tier priority system:

1. **Forced** -- explicit backend selection (`model="my_backend"`)
2. **Learning** -- learned preferences from past outcomes (>0.7 confidence)
3. **Rules** -- complexity and task-type heuristics
4. **Fallback** -- health-based fallback through the priority chain

When a backend fails, requests automatically fall to the next healthy backend. Circuit breakers protect each backend (5 consecutive failures trigger a 30-second cooldown).

### Backend Names

There are two layers of backend naming, and both are intentional:

- **Friendly names** are what you pass to tools (e.g. `backend: "qwen3"` or
  `model="groq"`). They are stable, provider-neutral aliases.
- **Internal names** are the registry/config identifiers used in
  `src/config/backends.json` and analytics.

The presets map as follows:

| Friendly name | Internal name | Adapter type |
|---------------|---------------|--------------|
| `local` | `local` | `local` |
| `deepseek` | `nvidia_deepseek` | `nvidia_deepseek` |
| `qwen3` | `nvidia_qwen` | `nvidia_qwen` |
| `gemini` | `gemini` | `gemini` |
| `groq` | `groq_llama` | `groq` |

The OpenAI-compatible backend ships under the internal name `openai_chatgpt` (adapter
type `openai`) and is reached through smart routing rather than a friendly alias. For the
`ask` tool, `openai` is accepted as a compatibility alias for the configured
OpenAI-compatible backend. Custom backends you add via config use their `name` field
directly as the internal name.

### Response Reliability (v2.4.0)

All handlers use a unified response pipeline (`extractResponseText`) that correctly handles every known LLM response shape -- raw strings, OpenAI chat/completion formats, thinking model `reasoning_content`, array content parts, and Gemini candidates. Repetitive output from local models is automatically collapsed, and analysis findings are deduplicated and capped.

## Council System

The council queries multiple backends on the same prompt and returns all responses for Claude to synthesize. Topics like `coding`, `architecture`, and `security` each map to a set of backends and a strategy (parallel, sequential, debate, or fallback).

See [docs/COUNCIL.md](docs/COUNCIL.md) for full documentation.

## Dashboard

An optional web dashboard provides UI for backend management (enable/disable, priorities, health checks) and council configuration (strategies, topic mapping).

See [docs/DASHBOARD.md](docs/DASHBOARD.md) for setup and API reference.

## Adding a Backend

**Via Dashboard** (recommended): Start the server with `SAB_DASHBOARD=true`, then use the web UI at `http://localhost:3000` to add, remove, enable/disable, and re-prioritize backends without editing JSON.

**Via Config File**: Any OpenAI-compatible provider can be added as a config entry in `src/config/backends.json`:

```json
{
  "name": "my_provider",
  "type": "openai",
  "endpoint": "https://api.my-provider.com/v1",
  "model": "my-model",
  "apiKeyEnvVar": "MY_PROVIDER_API_KEY",
  "maxTokens": 8192,
  "priority": 7,
  "enabled": true
}
```

See [EXTENDING.md](EXTENDING.md) for details on adding custom adapter types.

## Documentation

| Document | Description |
|----------|-------------|
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [CONFIGURATION.md](CONFIGURATION.md) | Full configuration reference |
| [EXTENDING.md](EXTENDING.md) | Adding backends, handlers, and tools |
| [EXAMPLES.md](EXAMPLES.md) | Usage examples |
| [docs/DASHBOARD.md](docs/DASHBOARD.md) | Dashboard setup and API |
| [docs/COUNCIL.md](docs/COUNCIL.md) | Council system details |

## Requirements

- Node.js >= 18.0.0
- At least one backend configured (local model or cloud API key)
- Claude Code or Claude Desktop for MCP integration

## Testing

```bash
npm test              # Run the unit + integration suite (Vitest)
npm run test:watch    # Watch mode
npm run test:bench    # Performance benchmarks (25 benchmarks, 6 categories)
```

## Security Notes

- Never commit API keys to version control. Use environment variables exclusively.
- The Claude Code config examples above use placeholder values -- replace them with your actual keys or reference a `.env` file.
- Rotate any accidentally leaked keys immediately.

### Threat Model

Smart AI Bridge is a **trusted-local MCP server**. It is designed to run as a stdio
subprocess of a single client you control (Claude Code or Claude Desktop) on your own
machine, and it assumes that client is trusted.

Within that boundary:

- **The file tools have full filesystem access by design.** `write_files_atomic`,
  `modify_file`, `backup_restore`, and the read/analyze tools operate on whatever paths
  the calling client supplies. They are not sandboxed to a project root. `safeReadFile`
  resolves paths and rejects null bytes (defense against path-injection tricks), but it
  does **not** confine access to a workspace.
- **Argument validation happens at the tool boundary.** Tool calls are validated against
  each tool's JSON Schema (via Ajv) before dispatch; malformed calls are rejected with a
  structured error. This protects against malformed input, not against a hostile client.
- **Tool calls run with the privileges of the server process.** Run it as your normal
  user, not as root.

This posture is appropriate for the intended single-user, local-agent use case. It is
**not** suitable for exposing the server to untrusted or multi-tenant callers over a
network. If you need that, put an authenticating proxy in front of it and add
workspace-root confinement to the file handlers first -- neither is provided here.

## License

Apache-2.0
