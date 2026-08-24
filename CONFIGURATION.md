# Smart AI Bridge v2.15.0 - Configuration Guide

## Backend Configuration

### Single Source of Truth: `src/config/backends.json`

All backend configuration lives in `src/config/backends.json`. This file is loaded by the `BackendRegistry` at startup and defines every backend, its adapter type, priority, and connection details.

> The file's own top-level `version` field is **not** the product version and is not
> used for gating — it has read `2.0.0` since the file was introduced. The product
> version lives in `package.json`. Shown below as it actually is, so this example
> matches the real file.

```json
{
  "version": "2.0.0",
  "description": "Smart AI Bridge v2.0.0 Backend Configuration",
  "backends": {
    "local": {
      "type": "local",
      "enabled": true,
      "priority": 1,
      "description": "Local inference (dynamic model discovery)",
      "capabilities": "dynamic",
      "context_limit": 65536,
      "strengths": "Large context, free inference",
      "config": {
        "model": "dynamic",
        "maxTokens": 65536,
        "timeout": 120000
      }
    },
    "nvidia_deepseek": {
      "type": "nvidia_deepseek",
      "enabled": true,
      "priority": 2,
      "description": "NVIDIA-hosted DeepSeek lane (reasoning-oriented)",
      "capabilities": [
        "deep_reasoning",
        "security_focus"
      ],
      "context_limit": 8192,
      "strengths": "Complex reasoning, security analysis",
      "config": {
        "maxTokens": 8192,
        "timeout": 60000,
        "url": "https://integrate.api.nvidia.com/v1/chat/completions"
      }
    },
    "nvidia_glm": {
      "type": "nvidia_glm",
      "enabled": true,
      "priority": 3,
      "description": "NVIDIA-hosted GLM lane (code-oriented)",
      "capabilities": [
        "code_specialized",
        "deep_reasoning"
      ],
      "context_limit": 32768,
      "strengths": "Code review, refactoring",
      "config": {
        "maxTokens": 32768,
        "timeout": 60000
      }
    },
    "gemini": {
      "type": "gemini",
      "enabled": true,
      "priority": 4,
      "description": "Google Gemini lane",
      "capabilities": [
        "fast_generation",
        "documentation"
      ],
      "context_limit": 32768,
      "strengths": "Fast docs, quick responses",
      "config": {
        "maxTokens": 32768,
        "timeout": 60000
      }
    },
    "openai_chatgpt": {
      "type": "openai",
      "enabled": true,
      "priority": 5,
      "description": "OpenAI lane",
      "context_limit": 131072,
      "config": {
        "maxTokens": 128000,
        "timeout": 120000
      }
    },
    "groq_llama": {
      "type": "groq",
      "enabled": true,
      "priority": 6,
      "description": "Groq lane (low-latency hosted inference); no model id needed \u2014 one is selected from the provider catalog",
      "config": {
        "maxTokens": 32768,
        "timeout": 30000
      }
    }
  },
  "compression": {
    "enabled": false
  }
}
```

### Backend Configuration Fields

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Adapter type: `local`, `nvidia_deepseek`, `nvidia_glm`, `gemini`, `openai`, `groq`. The `nvidia_qwen` type was removed outright in v2.14.0 — it is not an alias, and a config still naming it will not load. |
| `enabled` | boolean | Whether the backend is active |
| `priority` | number | Fallback chain order (lower = higher priority) |
| `description` | string | Human-readable description |
| `capabilities` | string/array | Backend capabilities for routing decisions |
| `context_limit` | number | Maximum context window in tokens |
| `strengths` | string | What the backend excels at |
| `config.url` | string | API endpoint URL |
| `config.model` | string | Model identifier. **No backend ships one.** Omit it and a model is selected from the provider's live catalog at startup, ranked by published context window — which works only where the provider publishes one (Groq's catalog does; NVIDIA's does not, so those lanes need this field set). Setting it is an explicit override that skips selection entirely. |
| `config.maxTokens` | number | Maximum response tokens. **On the `local` backend this no longer caps the request** (see below) — it only sizes the dynamic request timeout. An explicit `max_tokens` from the caller still applies on every backend. |
| `config.timeout` | number | Request timeout in milliseconds. **As of v2.15.0 this is also a ceiling.** `generate_file` and `modify_file` size each attempt's budget from that attempt's own token count and backend speed, then cap the result at this value; the declared value outranks the handler's own floor, so a lane declared below what a large request needs fails fast rather than running past your declared patience. A lane that declares no `timeout` keeps whatever ceiling its handler already had. `options.timeout` from the caller still overrides it per request. |
| `config.apiKey` | string | API key (or `$ENV_VAR_NAME` to read from environment) |

### Token caps and the local backend

As of v2.12.0 the `local` backend does **not** send a default `max_tokens`. A cap is
cloud-API cost control, and it does not apply to hardware you own — with thinking
enabled, a small budget could be consumed entirely by reasoning, returning `200 OK`
with empty content.

- **Local:** no `max_tokens` is sent unless the caller passes one explicitly. `ask`
  reports `max_tokens: "uncapped"` and `dynamic_tokens: null` in that case.
- **Cloud backends:** unchanged — they still apply `config.maxTokens`, because they
  cost money per token.
- **Either way**, an explicit `max_tokens` from the caller always wins.

`config.maxTokens` is still read on the local backend to size the request timeout, so
long uncapped generations get the longer dynamic timeout rather than the short static
one. Lowering it will shorten that timeout even though it no longer caps output.

### Custom Backends

Additional backends can be added at `data/backends-custom.json`. These extend or override the main config:

```json
{
  "backends": {
    "my_custom_backend": {
      "type": "openai",
      "enabled": true,
      "priority": 7,
      "description": "My custom OpenAI-compatible endpoint",
      "config": {
        "url": "https://my-api.example.com/v1/chat/completions",
        "apiKey": "$MY_CUSTOM_API_KEY",
        "model": "my-model",
        "maxTokens": 16384,
        "timeout": 60000
      }
    }
  }
}
```

## Environment Variables

### API Keys

These are the primary environment variables consumed by the backend adapters:

```bash
# NVIDIA API (used by nvidia_deepseek and nvidia_glm backends)
NVIDIA_API_KEY=your-nvidia-api-key

# OpenAI API
OPENAI_API_KEY=your-openai-api-key

# Google Gemini API
GEMINI_API_KEY=your-gemini-api-key

# Groq API
GROQ_API_KEY=your-groq-api-key
```

### Server Configuration

```bash
# Node environment
NODE_ENV=production                    # production | development

# MCP logging (all output goes to stderr)
MCP_LOG_LEVEL=info                     # silent | error | warn | info | debug
```

### Local Model Configuration

There is no environment variable for the local endpoint — nothing in `src/` reads one.
The `local` backend ships **no** `config.url`: at startup it scans the common local LLM
ports (llama.cpp 8080-8086, vLLM 8000, LM Studio 1234, Ollama 11434) and uses the first
server that answers. To pin it instead, declare the endpoint yourself:

```json
{
  "local": {
    "config": {
      "url": "http://127.0.0.1:8081/v1/chat/completions"
    }
  }
}
```

A declared URL is honoured as-is and is never overridden by discovery.

### API Key References in backends.json

Backend configurations can reference environment variables using the `$` prefix:

```json
{
  "config": {
    "apiKey": "$NVIDIA_API_KEY"
  }
}
```

The `BackendRegistry` resolves `$NVIDIA_API_KEY` to the value of `process.env.NVIDIA_API_KEY` at startup.

## Circuit Breaker

The circuit breaker is not configurable. Its threshold (5 consecutive failures) and reset
window (30s) are fixed in `src/backends/backend-adapter.js`.

## Routing Configuration

Routing is not configured in `backends.json` — it is derived. `MultiAIRouter` scores a
request's complexity in `_extractContext` from prompt length and `max_tokens`, and its
Tier-4 default is the first healthy backend in the registry's priority order.

Tier-3 rule-based routing selects on declared **capability**, never on a backend name: a
complex task prefers the first healthy, usable lane declaring `deep_reasoning`, and a code
task the first declaring `code_specialized`, both walked in the registry's own priority
order. An operator who configured neither capability simply falls through to Tier 4.

## Claude Code MCP Configuration

### Basic Configuration

```json
{
  "mcpServers": {
    "smart-ai-bridge": {
      "command": "node",
      "args": ["src/server.js"],
      "cwd": "/path/to/smart-ai-bridge",
      "env": {
        "NVIDIA_API_KEY": "your-nvidia-api-key",
        "OPENAI_API_KEY": "your-openai-api-key",
        "GEMINI_API_KEY": "your-gemini-api-key",
        "GROQ_API_KEY": "your-groq-api-key"
      }
    }
  }
}
```

### Full Production Configuration

```json
{
  "mcpServers": {
    "smart-ai-bridge": {
      "command": "node",
      "args": ["src/server.js"],
      "cwd": "/path/to/smart-ai-bridge",
      "env": {
        "NODE_ENV": "production",
        "MCP_LOG_LEVEL": "warn",
        "NVIDIA_API_KEY": "${NVIDIA_API_KEY}",
        "OPENAI_API_KEY": "${OPENAI_API_KEY}",
        "GEMINI_API_KEY": "${GEMINI_API_KEY}",
        "GROQ_API_KEY": "${GROQ_API_KEY}"
      }
    }
  }
}
```

### Development Configuration

```json
{
  "mcpServers": {
    "smart-ai-bridge-dev": {
      "command": "node",
      "args": ["src/server.js"],
      "cwd": "/path/to/smart-ai-bridge",
      "env": {
        "NODE_ENV": "development",
        "MCP_LOG_LEVEL": "debug"
      }
    }
  }
}
```

## Local Model Setup

### vLLM via Docker

```yaml
services:
  qwen3-coder:
    image: vllm/vllm-openai:latest
    container_name: qwen3-coder
    ports:
      - "8081:8000"
    environment:
      - NVIDIA_VISIBLE_DEVICES=all
    command: [
      "--model", "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8",
      "--host", "0.0.0.0",
      "--port", "8000",
      "--max-model-len", "32768",
      "--gpu-memory-utilization", "0.85",
      "--trust-remote-code"
    ]
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    restart: unless-stopped
```

### LM Studio

1. Load a model in LM Studio
2. Start the local server (default port 1234)
3. Update `backends.json` local config URL:

```json
{
  "local": {
    "config": {
      "url": "http://localhost:1234/v1/chat/completions"
    }
  }
}
```

### Ollama

```bash
ollama serve
ollama run qwen2.5-coder:14b
```

Update the local backend URL to `http://localhost:11434/v1/chat/completions`.

## Cross-Platform Notes

### Windows (WSL2)

If your local model server runs on the Windows host while Smart AI Bridge runs in WSL2, use the WSL2 gateway IP:

```json
{
  "local": {
    "config": {
      "url": "http://172.23.16.1:8081/v1/chat/completions"
    }
  }
}
```

Ensure the model server binds to `0.0.0.0` (not `127.0.0.1`) to accept WSL2 connections.

### Linux / macOS

Standard localhost works:

```json
{
  "local": {
    "config": {
      "url": "http://127.0.0.1:8081/v1/chat/completions"
    }
  }
}
```

## Subagent Backend Overrides

Override which backend handles specific subagent roles:

```bash
# Per-role overrides
SUBAGENT_BACKEND_CODE_REVIEWER=nvidia_deepseek
SUBAGENT_BACKEND_SECURITY_AUDITOR=nvidia_deepseek
SUBAGENT_BACKEND_PLANNER=nvidia_glm
SUBAGENT_BACKEND_TEST_GENERATOR=nvidia_deepseek
SUBAGENT_BACKEND_DOCUMENTATION_WRITER=gemini
SUBAGENT_BACKEND_TDD_DECOMPOSER=nvidia_glm
SUBAGENT_BACKEND_TDD_TEST_WRITER=nvidia_deepseek
SUBAGENT_BACKEND_TDD_IMPLEMENTER=nvidia_glm
SUBAGENT_BACKEND_TDD_QUALITY_REVIEWER=nvidia_deepseek

# Or set a global default
SUBAGENT_DEFAULT_BACKEND=nvidia_glm
```

## Disabling Backends

To disable a backend without removing it from configuration, set `enabled: false`:

```json
{
  "openai_chatgpt": {
    "type": "openai",
    "enabled": false,
    "priority": 5,
    "config": {}
  }
}
```

Disabled backends are excluded from the fallback chain and will not receive requests.

## Configuration Validation

After modifying `backends.json`, verify the server starts correctly:

```bash
node src/server.js 2>&1 | head -25
# Expected among the startup lines (all on stderr, interleaved with other diagnostics):
# Smart AI Bridge v2.15.0 starting...
# [BackendRegistry] Initialized 6 backends from backends.json
# [Router] MultiAIRouter initialized
# Smart AI Bridge v2.15.0 connected via stdio
# Tools: 17 | Backends: 6
```

Then use `check_backend_health` to verify each backend:

```
@check_backend_health({ "backend": "local", "force": true })
@check_backend_health({ "backend": "nvidia_deepseek", "force": true })
```

### Backend Readiness and Drift

A startup readiness audit checks each configured backend's model against the provider's
catalog and prints findings to stderr after the MCP handshake completes; it never delays
or aborts startup. Disable it with `SAB_DISABLE_READINESS_AUDIT=true`.

Run an on-demand probe at any time:

```bash
npm run audit:backends            # human-readable table
npm run audit:backends -- --json  # machine-readable
```

It exits non-zero only on `RETIRED`, `ERROR`, or `NO_MODEL`. A backend with no API key
set is never reported as broken — it shows `cannot verify — <VAR> not set`.

### Dashboard API Keys

Backend API keys can also be set/cleared per backend from the dashboard UI instead of
editing `backends.json`. Keys are stored in the gitignored `data/backends-secrets.json`
at mode `0600`, take effect immediately without a restart, and take precedence over the
backend's `process.env` fallback. The dashboard binds to `127.0.0.1` only by default;
override with `SAB_DASHBOARD_HOST` if it needs to be reachable off-box (a non-loopback
host prints a startup warning).
