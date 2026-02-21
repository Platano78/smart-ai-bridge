# Smart AI Bridge v2.0.0 - Configuration Guide

## Backend Configuration

### Single Source of Truth: `src/config/backends.json`

All backend configuration lives in `src/config/backends.json`. This file is loaded by the `BackendRegistry` at startup and defines every backend, its adapter type, priority, and connection details.

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
        "url": "http://127.0.0.1:8081/v1/chat/completions",
        "model": "dynamic",
        "maxTokens": 65536,
        "timeout": 120000
      }
    },
    "nvidia_deepseek": {
      "type": "nvidia_deepseek",
      "enabled": true,
      "priority": 2,
      "description": "NVIDIA DeepSeek (reasoning, 8K tokens)",
      "capabilities": ["deep_reasoning", "security_focus"],
      "context_limit": 8192,
      "strengths": "Complex reasoning, security analysis",
      "config": {
        "maxTokens": 8192,
        "timeout": 60000,
        "url": "https://integrate.api.nvidia.com/v1/chat/completions",
        "model": "deepseek-ai/deepseek-v3.2"
      }
    },
    "nvidia_qwen": {
      "type": "nvidia_qwen",
      "enabled": true,
      "priority": 3,
      "description": "NVIDIA Qwen (coding, 32K tokens)",
      "capabilities": ["code_specialized", "deep_reasoning"],
      "context_limit": 32768,
      "config": {
        "maxTokens": 32768,
        "timeout": 60000
      }
    },
    "gemini": {
      "type": "gemini",
      "enabled": true,
      "priority": 4,
      "description": "Google Gemini (fast, 32K tokens)",
      "config": {
        "maxTokens": 32768,
        "timeout": 60000
      }
    },
    "openai_chatgpt": {
      "type": "openai",
      "enabled": true,
      "priority": 5,
      "description": "OpenAI GPT-5.2 (premium reasoning, 128K context)",
      "config": {
        "model": "gpt-5.2",
        "maxTokens": 128000,
        "timeout": 120000
      }
    },
    "groq_llama": {
      "type": "groq",
      "enabled": true,
      "priority": 6,
      "description": "Groq Llama 3.3 70B (ultra-fast 500+ t/s)",
      "config": {
        "model": "llama-3.3-70b-versatile",
        "maxTokens": 32768,
        "timeout": 30000
      }
    }
  },
  "fallbackPolicy": {
    "maxRetries": 3,
    "retryDelayMs": 1000,
    "circuitBreakerThreshold": 5,
    "circuitBreakerResetMs": 30000
  },
  "routing": {
    "defaultBackend": "local",
    "complexityThresholds": {
      "simple": 0.3,
      "medium": 0.6,
      "complex": 0.8
    }
  }
}
```

### Backend Configuration Fields

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Adapter type: `local`, `nvidia_deepseek`, `nvidia_qwen`, `gemini`, `openai`, `groq` |
| `enabled` | boolean | Whether the backend is active |
| `priority` | number | Fallback chain order (lower = higher priority) |
| `description` | string | Human-readable description |
| `capabilities` | string/array | Backend capabilities for routing decisions |
| `context_limit` | number | Maximum context window in tokens |
| `strengths` | string | What the backend excels at |
| `config.url` | string | API endpoint URL |
| `config.model` | string | Model identifier |
| `config.maxTokens` | number | Maximum response tokens |
| `config.timeout` | number | Request timeout in milliseconds |
| `config.apiKey` | string | API key (or `$ENV_VAR_NAME` to read from environment) |

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
# NVIDIA API (used by nvidia_deepseek and nvidia_qwen backends)
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

```bash
# Local model endpoint (if not using default from backends.json)
LOCAL_MODEL_ENDPOINT=http://localhost:8081/v1

# Local model port (for auto-discovery)
MKG_SERVER_PORT=8081
```

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

## Fallback Policy

The fallback policy in `backends.json` controls retry behavior:

```json
{
  "fallbackPolicy": {
    "maxRetries": 3,
    "retryDelayMs": 1000,
    "circuitBreakerThreshold": 5,
    "circuitBreakerResetMs": 30000
  }
}
```

| Field | Description |
|-------|-------------|
| `maxRetries` | Number of retry attempts per backend before moving to next |
| `retryDelayMs` | Delay between retries (milliseconds) |
| `circuitBreakerThreshold` | Consecutive failures before circuit opens |
| `circuitBreakerResetMs` | Time before circuit breaker resets (milliseconds) |

## Routing Configuration

```json
{
  "routing": {
    "defaultBackend": "local",
    "complexityThresholds": {
      "simple": 0.3,
      "medium": 0.6,
      "complex": 0.8
    }
  }
}
```

The `MultiAIRouter` uses these thresholds when applying rule-based routing (Tier 3). Complex tasks are routed to higher-capability backends (nvidia_qwen), while simple tasks stay on the default backend.

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
SUBAGENT_BACKEND_PLANNER=nvidia_qwen
SUBAGENT_BACKEND_TEST_GENERATOR=nvidia_deepseek
SUBAGENT_BACKEND_DOCUMENTATION_WRITER=gemini
SUBAGENT_BACKEND_TDD_DECOMPOSER=nvidia_qwen
SUBAGENT_BACKEND_TDD_TEST_WRITER=nvidia_deepseek
SUBAGENT_BACKEND_TDD_IMPLEMENTER=nvidia_qwen
SUBAGENT_BACKEND_TDD_QUALITY_REVIEWER=nvidia_deepseek

# Or set a global default
SUBAGENT_DEFAULT_BACKEND=nvidia_qwen
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
node src/server.js 2>&1 | head -5
# Expected output:
# Smart AI Bridge v2.0.0 starting...
# [BackendRegistry] Initialized 6 backends from backends.json
# [Router] MultiAIRouter initialized
# Smart AI Bridge v2.0.0 connected via stdio
# Tools: 20 | Backends: 6
```

Then use `check_backend_health` to verify each backend:

```
@check_backend_health({ "backend": "local", "force": true })
@check_backend_health({ "backend": "nvidia_deepseek", "force": true })
```
