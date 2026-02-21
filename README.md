# Smart AI Bridge v2.0.0

<a href="https://glama.ai/mcp/servers/@Platano78/Smart-AI-Bridge">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@Platano78/Smart-AI-Bridge/badge" />
</a>

**Modular MCP server for Claude Code with multi-AI orchestration, token-saving operations, intelligent routing, and workflow automation.**

## Overview

Smart AI Bridge is a production-ready Model Context Protocol (MCP) server that orchestrates AI-powered development operations across 6 backends with automatic failover, 4-tier smart routing, and an intelligence layer for continuous learning.

v2.0.0 is a ground-up modular rewrite. The monolithic 1,519-line server has been replaced by 61 source files organized into handlers, backends, intelligence modules, and utilities.

### Key Features

- **6 AI Backends**: local, nvidia_deepseek, nvidia_qwen, gemini, openai, groq (fully expandable)
- **20 Production Tools**: Token-saving file ops, multi-AI workflows, code generation, refactoring
- **Modular Architecture**: Handler registry pattern with BaseHandler inheritance and config-driven backend registration
- **Intelligence Layer**: Dual-iterate executor, diff-context optimizer, learning engine, enhanced self-review
- **4-Tier Smart Routing**: Forced -> Learning -> Rules -> Health-based fallback
- **Config-Driven Backends**: Single source of truth in `src/config/backends.json`

## Architecture

```
smart-ai-bridge v2.0.0/
|
|-- src/
|   |-- server.js                          # Entry point (thin wiring layer)
|   |-- router.js                          # MultiAIRouter (4-tier routing)
|   |-- json-sanitizer.js                  # JSON output sanitization
|   |-- file-security.js                   # Path validation and security
|   |
|   |-- tools/
|   |   |-- tool-definitions.js            # Single source of truth for all 20 tools
|   |   +-- smart-alias-resolver.js        # Alias group support (SAB_, deepseek_)
|   |
|   |-- handlers/
|   |   |-- index.js                       # HandlerFactory + HANDLER_REGISTRY
|   |   |-- base-handler.js                # Abstract BaseHandler class
|   |   |-- ask-handler.js                 # ask tool (smart routing)
|   |   |-- analyze-file-handler.js        # analyze_file (90% token savings)
|   |   |-- modify-file-handler.js         # modify_file (95% token savings)
|   |   |-- generate-file-handler.js       # generate_file (code generation)
|   |   |-- batch-analyze-handler.js       # batch_analyze (multi-file analysis)
|   |   |-- batch-modify-handler.js        # batch_modify (multi-file edits)
|   |   |-- refactor-handler.js            # refactor (cross-file refactoring)
|   |   |-- explore-handler.js             # explore (codebase exploration)
|   |   |-- read-handler.js                # read (raw file content)
|   |   |-- review-handler.js              # review (code review)
|   |   |-- subagent-handler.js            # spawn_subagent (10 roles)
|   |   |-- council-handler.js             # council (multi-AI consensus)
|   |   |-- dual-iterate-handler.js        # dual_iterate (generate->review->fix)
|   |   |-- parallel-agents-handler.js     # parallel_agents (TDD workflow)
|   |   |-- file-handlers.js               # write_files_atomic, backup_restore
|   |   +-- system-handlers.js             # health, validate_changes, analytics
|   |
|   |-- backends/
|   |   |-- backend-registry.js            # Config-driven registry with fallback chains
|   |   |-- backend-adapter.js             # BackendAdapter base class
|   |   |-- local-adapter.js               # Local model (vLLM/LM Studio/Ollama)
|   |   |-- nvidia-adapter.js              # NVIDIA DeepSeek + Qwen adapters
|   |   |-- gemini-adapter.js              # Google Gemini adapter
|   |   |-- openai-adapter.js              # OpenAI GPT adapter
|   |   +-- groq-adapter.js               # Groq Llama adapter
|   |
|   |-- intelligence/
|   |   |-- index.js                       # Intelligence module exports
|   |   |-- dual-iterate-executor.js       # Generate->review->fix loop (798 lines)
|   |   |-- dual-workflow-manager.js        # Workflow orchestration
|   |   |-- diff-context-optimizer.js       # 60% token savings on context
|   |   |-- learning-engine.js             # Routing outcome learning
|   |   |-- enhanced-self-review.js         # Quality-aware self review
|   |   |-- background-analysis-queue.js    # Async analysis queue
|   |   |-- self-reflection-config.js       # Reflection parameters
|   |   |-- pattern-rag-store.js           # TF-IDF pattern memory
|   |   |-- playbook-system.js             # Workflow playbooks
|   |   +-- compound-learning.js           # Adaptive routing with decay
|   |
|   |-- config/
|   |   |-- backends.json                  # Backend configuration (single source of truth)
|   |   |-- role-templates.js              # 10 subagent role definitions
|   |   +-- council-config-manager.js      # Council topic->backend mappings
|   |
|   |-- utils/
|   |   |-- concurrent-request-manager.js  # Request concurrency control
|   |   |-- local-service-detector.js      # Auto-discover local AI services
|   |   |-- model-discovery.js             # Dynamic model detection
|   |   |-- capability-matcher.js          # Backend capability matching
|   |   |-- role-validator.js              # Subagent role validation
|   |   |-- verdict-parser.js              # Structured verdict extraction
|   |   |-- gemini-rate-limiter.js         # Gemini API rate limiting
|   |   |-- path-normalizer.js             # Cross-platform path handling
|   |   +-- glob-parser.js                # File pattern matching
|   |
|   |-- monitoring/
|   |   |-- health-monitor.js              # Backend health checks
|   |   +-- spawn-metrics.js              # Subagent execution metrics
|   |
|   |-- context/
|   |   +-- smart-context.js              # Context management
|   |
|   |-- quality/
|   |   +-- quality-gates.js              # Quality gate evaluation
|   |
|   |-- threading/
|   |   |-- index.js                       # Threading exports
|   |   +-- conversation-threading.js     # Multi-turn conversations
|   |
|   +-- dashboard/
|       |-- index.js                       # Dashboard exports
|       +-- dashboard-server.js           # Optional web dashboard
|
|-- archive/                               # Archived v1.x modules
|-- data/                                  # Runtime data (learning state, patterns)
|-- CHANGELOG.md
|-- CONFIGURATION.md
|-- EXTENDING.md
+-- EXAMPLES.md
```

## Quick Start

### 1. Install Dependencies

```bash
cd /path/to/smart-ai-bridge
npm install
```

### 2. Configure Backends

Set API keys for the backends you want to use:

```bash
# Required for NVIDIA backends (nvidia_deepseek, nvidia_qwen)
export NVIDIA_API_KEY="your-nvidia-api-key"

# Required for OpenAI backend
export OPENAI_API_KEY="your-openai-api-key"

# Required for Gemini backend
export GEMINI_API_KEY="your-gemini-api-key"

# Required for Groq backend
export GROQ_API_KEY="your-groq-api-key"
```

Backend configuration lives in `src/config/backends.json`. See [CONFIGURATION.md](CONFIGURATION.md) for details.

### 3. Add to Claude Code Configuration

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

### 4. Restart Claude Code

After restarting, all 20 tools will be available.

### 5. Verify

```
@check_backend_health({ "backend": "local" })
```

## AI Backends (6)

All backends are configured in `src/config/backends.json` and managed by the `BackendRegistry`.

| Backend | Type | Model | Context | Priority | Description |
|---------|------|-------|---------|----------|-------------|
| `local` | local | Dynamic (auto-discovery) | 65K | 1 | Local model via vLLM/LM Studio/Ollama |
| `nvidia_deepseek` | nvidia_deepseek | DeepSeek V3.2 | 8K | 2 | NVIDIA API - reasoning and security analysis |
| `nvidia_qwen` | nvidia_qwen | Qwen3 Coder 480B | 32K | 3 | NVIDIA API - code review and refactoring |
| `gemini` | gemini | Gemini 2.5 Flash | 32K | 4 | Google - fast docs and quick responses |
| `openai_chatgpt` | openai | GPT-4.1 | 128K | 5 | OpenAI - premium reasoning |
| `groq_llama` | groq | Llama 3.3 70B | 32K | 6 | Groq - ultra-fast 500+ t/s |

### Fallback Chain

When a backend fails, requests automatically fall through the priority chain:

```
local -> nvidia_deepseek -> nvidia_qwen -> gemini -> openai_chatgpt -> groq_llama
```

Circuit breakers protect each backend: 5 consecutive failures trigger a 30-second cooldown.

## Available Tools (20)

### Token-Saving File Operations

| Tool | Token Savings | Description |
|------|---------------|-------------|
| `analyze_file` | 90% | Local LLM reads and analyzes files, returns structured findings only |
| `modify_file` | 95% | Local LLM applies natural language edits, returns diff |
| `batch_analyze` | 90% per file | Analyze multiple files via glob patterns with aggregated findings |
| `batch_modify` | 95% per file | Apply same instructions across multiple files atomically |
| `generate_file` | 80% | Generate code from natural language spec via local LLM |
| `explore` | 90% | Answer codebase questions using intelligent search, returns summary only |
| `read` | -- | Raw file content (prefer `analyze_file` for token efficiency) |

### Multi-AI Workflow Tools

| Tool | Description |
|------|-------------|
| `ask` | Smart multi-backend routing with auto/forced backend selection |
| `council` | Multi-AI consensus from 2-6 backends on complex decisions |
| `dual_iterate` | Internal generate->review->fix loop between dual backends |
| `parallel_agents` | TDD workflow with decomposition, parallel execution, quality gates |
| `spawn_subagent` | Specialized AI agents (10 roles including TDD) |

### Code Quality Tools

| Tool | Description |
|------|-------------|
| `review` | Comprehensive code review (security, performance, quality) |
| `refactor` | Cross-file refactoring with scope detection and reference updates |
| `validate_changes` | Pre-flight validation for proposed code changes |

### Infrastructure Tools

| Tool | Description |
|------|-------------|
| `check_backend_health` | On-demand health diagnostics for specific backends |
| `backup_restore` | Timestamped backup management with restore and cleanup |
| `write_files_atomic` | Atomic multi-file writes with backup |
| `manage_conversation` | Multi-turn conversation threading |
| `get_analytics` | Usage analytics, cost analysis, optimization recommendations |

### Subagent Roles

Available via `spawn_subagent`:

| Role | Purpose |
|------|---------|
| `code-reviewer` | Quality review and best practices |
| `security-auditor` | Vulnerability detection |
| `planner` | Task breakdown and dependencies |
| `refactor-specialist` | Code improvement suggestions |
| `test-generator` | Test suite generation |
| `documentation-writer` | Documentation creation |
| `tdd-decomposer` | Break task into TDD subtasks |
| `tdd-test-writer` | RED phase - write failing tests |
| `tdd-implementer` | GREEN phase - implement to pass |
| `tdd-quality-reviewer` | Quality gate validation |

## Smart Routing (4-Tier)

The `MultiAIRouter` selects backends using a 4-tier priority system:

```
Tier 1: Forced       - Explicit backend selection (model="nvidia_qwen")
Tier 2: Learning     - Learning engine recommendation (>0.7 confidence)
Tier 3: Rules        - Complexity/task-type heuristics
Tier 4: Fallback     - Health-based fallback chain (priority order)
```

### Rule-Based Routing

```
Complex tasks (long prompts, high token needs) -> nvidia_qwen (480B model)
Code tasks (implement, debug, refactor)        -> nvidia_deepseek
Default                                        -> First healthy backend in chain
```

### Dynamic Token Scaling

```
Unity/game development prompts  -> 16,384 tokens
Complex generation prompts      -> 8,192 tokens (16,384 for local)
Simple queries                  -> 2,048 tokens
```

## Intelligence Layer

### Dual Iterate Executor

798-line generate->review->fix loop that runs entirely within Smart AI Bridge. A coding backend generates code, a reasoning backend reviews it, and the generator fixes issues -- iterating until quality threshold is met. Claude only sees the final approved output.

### Diff-Context Optimizer

Reduces token usage by 60% by sending only relevant diff context rather than full file contents during iterative operations.

### Learning Engine

Records routing outcomes (backend, success, latency, task type) and builds confidence scores. After sufficient data, the learning engine recommends backends before rule-based routing kicks in (Tier 2).

### Enhanced Self-Review

Quality-aware review that adjusts review depth based on model tier and task complexity.

### Pattern RAG Store

TF-IDF semantic search over learned patterns. Stores successful patterns with metadata for future retrieval.

### Playbook System

Predefined workflow playbooks with step management and context tracking.

## Security

v2.0.0 uses a lean security model appropriate for stdio MCP servers:

- **File Security** (`src/file-security.js`): Path traversal prevention, null byte blocking, restricted path validation
- **Backend Circuit Breakers**: Per-adapter circuit breakers (5 failures -> 30s cooldown)
- **Input Validation**: JSON Schema validation on all tool inputs via MCP SDK
- **Error Sanitization**: Server-side errors are caught and returned as structured MCP responses
- **MCP-Compliant Logging**: All logging to stderr, stdout reserved for JSON-RPC protocol

The following v1.x security modules were removed as unnecessary for stdio MCP operation:
- auth-manager (MCP stdio has no external auth surface)
- rate-limiter (Claude Code is the only client)
- input-validator (MCP SDK handles schema validation)
- fuzzy-matching-security, error-sanitizer, circuit-breaker (standalone), metrics-collector

## MCP-Compliant Logging

The MCP protocol requires stdout exclusively for JSON-RPC messages. All Smart AI Bridge logging uses stderr via `console.error()`.

Control log verbosity:

```bash
export MCP_LOG_LEVEL="info"  # silent | error | warn | info | debug
```

Log file locations (Claude Desktop):
- macOS: `~/Library/Logs/Claude/mcp-server-smart-ai-bridge.log`
- Windows: `%APPDATA%\Claude\Logs\mcp-server-smart-ai-bridge.log`
- Linux: `~/.config/Claude/logs/mcp-server-smart-ai-bridge.log`

## Troubleshooting

### Server Startup

```bash
# Check Node.js version (>=18 required)
node --version

# Install dependencies
npm install

# Test server directly
node src/server.js
# Should output to stderr: "Smart AI Bridge v2.0.0 starting..."
```

### Backend Connection Issues

```bash
# Test local endpoint
curl http://localhost:8081/v1/models

# Test NVIDIA API
curl -H "Authorization: Bearer $NVIDIA_API_KEY" \
     https://integrate.api.nvidia.com/v1/models

# Use the built-in health check
@check_backend_health({ "backend": "local", "force": true })
```

### Common Issues

| Issue | Solution |
|-------|----------|
| JSON parse errors in Claude Desktop | Check for `console.log()` calls -- all logging must use stderr |
| "Unknown tool" error | Restart Claude Code to pick up new tool definitions |
| Backend timeout | Increase timeout in `src/config/backends.json` |
| Local model not detected | Verify model server is running and bound to correct port |
| All backends failing | Check API keys are set, run `check_backend_health` with `force: true` |

## Documentation

| Document | Description |
|----------|-------------|
| [CHANGELOG.md](CHANGELOG.md) | Version history with detailed release notes |
| [CONFIGURATION.md](CONFIGURATION.md) | Complete configuration reference |
| [EXTENDING.md](EXTENDING.md) | Guide to adding backends, handlers, and tools |
| [EXAMPLES.md](EXAMPLES.md) | Usage examples for all tools |

## Requirements

- Node.js >= 18.0.0
- At least one backend configured (local model or cloud API key)
- Claude Code or Claude Desktop for MCP integration

## License

Apache-2.0
