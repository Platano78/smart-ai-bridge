# Smart AI Bridge v2.3.0

<a href="https://glama.ai/mcp/servers/@Platano78/Smart-AI-Bridge">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@Platano78/Smart-AI-Bridge/badge" />
</a>

**Config-driven multi-AI orchestration for Claude Code. Add any OpenAI-compatible provider, route intelligently, and let multiple AIs collaborate through the council system.**

## What It Does

Smart AI Bridge is an MCP server that sits between Claude Code and your AI backends. It provides 19 tools for token-saving file operations, multi-AI workflows, code quality checks, and intelligent routing -- all configured through a single JSON file.

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

After restarting, all 19 tools will be available. Verify with:

```
@check_backend_health({ "backend": "local" })
```

## Tools (19)

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
| `validate_changes` | Pre-flight validation for proposed changes |

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

## Council System

The council queries multiple backends on the same prompt and returns all responses for Claude to synthesize. Topics like `coding`, `architecture`, and `security` each map to a set of backends and a strategy (parallel, sequential, debate, or fallback).

See [docs/COUNCIL.md](docs/COUNCIL.md) for full documentation.

## Dashboard

An optional web dashboard provides UI for backend management (enable/disable, priorities, health checks) and council configuration (strategies, topic mapping).

See [docs/DASHBOARD.md](docs/DASHBOARD.md) for setup and API reference.

## Adding a Backend

Any OpenAI-compatible provider can be added as a config entry in `src/config/backends.json`:

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

## Security Notes

- Never commit API keys to version control. Use environment variables exclusively.
- The Claude Code config examples above use placeholder values -- replace them with your actual keys or reference a `.env` file.
- Rotate any accidentally leaked keys immediately.

## License

Apache-2.0
