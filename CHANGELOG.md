# Changelog

All notable changes to the Smart AI Bridge project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-02-20

### BREAKING CHANGE: Full Modular Rewrite

Complete migration from monolithic architecture to modular `src/` directory structure. This is a major release with breaking changes to the entry point, configuration format, backend names, and tool inventory.

### Added - New Tools (9)

| Tool | Description |
|------|-------------|
| `explore` | Codebase exploration with intelligent search -- returns summary, never raw content (90%+ token savings) |
| `generate_file` | Local LLM code generation from natural language spec with review/auto-approve |
| `refactor` | Cross-file refactoring with scope detection (function/class/module/project) and reference updates |
| `write_files_atomic` | Atomic multi-file writes with automatic backup (previously existed but reworked) |
| `validate_changes` | Pre-flight validation for proposed code changes with AI-powered impact analysis |
| `backup_restore` | Timestamped backup management with restore, list, and cleanup actions |
| `batch_analyze` | Multi-file analysis via glob patterns with aggregated findings |
| `check_backend_health` | On-demand health diagnostics for specific backends with 5-minute caching |
| `read` | Raw file content reader (deprecated -- prefer `analyze_file`) |

### Added - New Backends (2)

| Backend | Model | Description |
|---------|-------|-------------|
| `openai_chatgpt` | GPT-5.2 | Premium reasoning with 128K context |
| `groq_llama` | Llama 3.3 70B | Ultra-fast inference at 500+ tokens/sec |

### Added - Intelligence Layer

- **Dual Iterate Executor** (798 lines): Complete generate->review->fix loop with quality thresholds running entirely within Smart AI Bridge
- **Diff-Context Optimizer**: 60% token savings by sending only relevant diff context during iterative operations
- **Learning Engine**: Records routing outcomes and builds confidence-based backend recommendations (Tier 2 routing)
- **Enhanced Self-Review**: Quality-aware review depth based on model tier and task complexity
- **Background Analysis Queue**: Async analysis processing for non-blocking operations
- **Dual Workflow Manager**: Workflow orchestration with model tier awareness

### Added - Architecture

- **Modular `src/` structure**: 61 source files organized into handlers, backends, intelligence, config, utils, monitoring, quality, context, threading, and dashboard
- **HandlerFactory**: Central handler registry pattern -- maps tool names to handler classes, creates instances lazily, manages shared context
- **BaseHandler**: Abstract base class providing router access, playbook integration, token estimation, language detection, string similarity, and learning outcome recording
- **BackendRegistry**: Config-driven backend management with dynamic adapter loading, fallback chain management, and hot-reload capability
- **BackendAdapter base class**: Per-adapter circuit breakers, health checking, and metrics
- **MultiAIRouter**: 4-tier routing (Forced -> Learning -> Rules -> Fallback) extracted from monolith
- **Tool Definitions**: Single source of truth in `src/tools/tool-definitions.js` with handler mapping
- **Config-driven backends**: `src/config/backends.json` as single source of truth for all backend configuration

### Changed

- **Entry point**: `smart-ai-bridge-v1.1.0.js` (root) -> `src/server.js` (thin wiring layer)
- **Tool count**: 19 -> 20 (added 9 new, kept 11 existing)
- **Backend count**: 4 -> 6 (added openai, groq; renamed deepseek->nvidia_deepseek, qwen->nvidia_qwen)
- **Backend names**: `deepseek` -> `nvidia_deepseek`, `qwen` -> `nvidia_qwen`, `local` unchanged, `gemini` unchanged
- **Backend configuration**: Hardcoded in server.js -> `src/config/backends.json` (JSON, editable)
- **Handler architecture**: Inline switch/case in monolith -> individual handler classes extending BaseHandler
- **MCP SDK**: Updated to `@modelcontextprotocol/sdk` v1.18.2
- **License**: Changed from MIT to Apache-2.0
- **npm start**: Now runs `node src/server.js`

### Removed - Security Modules

The following modules were removed as unnecessary for stdio MCP servers (Claude Code is the only client):

| Module | Reason |
|--------|--------|
| `auth-manager.js` | MCP stdio has no external auth surface |
| `input-validator.js` | MCP SDK handles JSON Schema validation |
| `rate-limiter.js` | Single client (Claude Code), no rate limiting needed |
| `fuzzy-matching-security.js` | Merged into handler-level logic |
| `path-security.js` | Replaced by `src/file-security.js` |
| `error-sanitizer.js` | Handled by server.js error wrapper |
| `circuit-breaker.js` (standalone) | Moved into BackendAdapter base class |
| `metrics-collector.js` | Replaced by handler-level metrics |

### Removed - Other

| Item | Reason |
|------|--------|
| `smart-ai-bridge-v1.1.0.js` | Monolithic server archived to `archive/` |
| Image generation tools | Require local Stable Diffusion, not generally available |
| `orchestrator` backend | Replaced by BackendRegistry fallback chains |
| Dual port architecture | Single stdio transport |
| `nvidia_minimax` backend | Removed from NVIDIA lineup |
| `nvidia_nemotron` backend | Removed from NVIDIA lineup |
| `pattern_search`, `pattern_add`, `playbook_list`, `playbook_run`, `playbook_step`, `learning_summary` tools | Intelligence layer internalized -- pattern learning and playbooks operate automatically via BaseHandler hooks |
| `system_metrics`, `rate_limit_status` tools | No longer needed without rate limiter/metrics collector |

### Fixed

- Module resolution using proper ESM imports with `.js` extensions throughout
- JSON sanitization for non-serializable values in handler responses
- Concurrent request management for parallel backend calls
- Backend health check caching to prevent excessive health queries

### Migration Guide

1. Update Claude Code config entry point: `smart-ai-bridge-v1.1.0.js` -> `src/server.js`
2. Update backend names in any scripts: `deepseek` -> `nvidia_deepseek`, `qwen` -> `nvidia_qwen`
3. Set new API key env vars: `OPENAI_API_KEY`, `GROQ_API_KEY` (if using those backends)
4. Backend configuration is now in `src/config/backends.json` -- edit that file instead of env vars for backend URLs/models
5. Intelligence tools (`pattern_search`, `playbook_run`, etc.) are no longer exposed as MCP tools -- the intelligence layer operates automatically

---

## [1.6.0] - 2026-01-04

### Added - Intelligence Layer

#### Pattern Learning System
- **TF-IDF Pattern Store**: Semantic search for learned patterns
- **Pattern Persistence**: Patterns saved to `data/patterns/`
- **Decay Scoring**: Pattern relevance decreases over time
- **Complexity Weighting**: Patterns scored by task complexity

#### Workflow Playbooks
- **5 Built-in Playbooks**: tdd-feature, bug-fix, code-review, refactor, documentation
- **Step Management**: Start, pause, resume, complete playbook steps
- **Context Tracking**: Maintains state across playbook execution
- **Analytics**: Usage tracking and success metrics

#### New Tools (6)
| Tool | Purpose |
|------|---------|
| `pattern_search` | TF-IDF semantic pattern search |
| `pattern_add` | Store patterns for learning |
| `playbook_list` | List available workflow playbooks |
| `playbook_run` | Start playbook execution |
| `playbook_step` | Manage playbook execution |
| `learning_summary` | Pattern/playbook analytics |

### Removed - Deprecated Tools

**BREAKING CHANGE**: 5 tools removed that duplicated Claude's native capabilities:

| Removed Tool | Replacement | Reason |
|--------------|-------------|--------|
| `review` | Use `ask` with review prompt | Just a wrapper around `ask` |
| `read` | Claude's native `Read` tool | Passthrough, no token savings |
| `edit_file` | Claude's native `Edit` tool | Passthrough, no token savings |
| `validate_changes` | Use `ask` with validation prompt | Just a wrapper around `ask` |
| `multi_edit` | Claude's native `Edit` (multiple) | Passthrough, no token savings |

### Changed
- Tool count: 24 -> 19 (removed 5 bloat, added 6 intelligence)
- Updated documentation to reflect current tool inventory
- Enhanced compound learning with decay and complexity scoring

---

## [1.5.0] - 2025-12-XX

### Added - Multi-AI Workflow Tools

#### Multi-AI Council
- **Topic-Based Routing**: coding, reasoning, architecture, security, performance
- **Confidence Levels**: high (4 backends), medium (3 backends), low (2 backends)
- **Synthesis**: Claude combines diverse perspectives into final answer

#### Dual Iterate Workflow
- **Coding Backend**: Generates code (e.g., Seed-Coder)
- **Reasoning Backend**: Reviews and validates (e.g., DeepSeek-R1)
- **Quality Threshold**: Iterates until quality score met (0.5-1.0)
- **Token Savings**: Entire workflow runs in MKG, returns only final code

#### Parallel Agents (TDD Workflow)
- **Decomposition**: Breaks high-level tasks into atomic subtasks
- **Parallel Execution**: RED phase tests before GREEN implementation
- **Quality Gates**: Iterates based on quality review (up to 5 iterations)
- **File Organization**: Output organized by phase (red/green/refactor)

#### TDD Subagent Roles (4 new roles)
| Role | Purpose |
|------|---------|
| `tdd-decomposer` | Break task into TDD subtasks |
| `tdd-test-writer` | RED phase - write failing tests |
| `tdd-implementer` | GREEN phase - implement to pass |
| `tdd-quality-reviewer` | Quality gate validation |

### Changed
- Total subagent roles: 6 -> 10 (added 4 TDD roles)
- Enhanced role-templates.js with TDD prompts

---

## [1.4.0] - 2025-12-XX

### Added - Token-Saving Tools

#### Local LLM Offloading
Tools that offload work to local LLMs, providing massive token savings:

| Tool | Token Savings | How It Works |
|------|---------------|--------------|
| `analyze_file` | 90% | Local LLM reads file, returns structured findings |
| `modify_file` | 95% | Local LLM applies natural language edits |
| `batch_modify` | 95% per file | Multi-file NL modifications |

#### Workflow
```
Claude -> NL instructions -> MKG -> Local LLM -> diff -> Claude reviews -> approve/reject
```

- Claude sends only instructions (not file content)
- Local LLM reads file and applies changes
- Claude reviews small diff (~100 tokens vs 2000+)
- Massive token savings per operation

### Added
- `handlers/analyze-file-handler.js` - File analysis handler
- `handlers/modify-file-handler.js` - File modification handler
- `handlers/batch-modify-handler.js` - Batch modification handler

---

## [1.3.0] - 2025-12-09

### Added - Backend Adapter Architecture
- **Circuit Breaker Protection**: 5 consecutive failures -> 30-second cooldown
- **Automatic Fallback Chains**: `local -> deepseek -> qwen -> gemini`
- **Per-Backend Metrics**: Success rate, latency, call counts
- **Health Monitoring**: Real-time status (healthy/degraded/circuit_open)

### Added - Compound Learning Engine
- **EMA Confidence Scoring**: Exponential moving average (alpha=0.2)
- **Task Pattern Recognition**: Learns from `complexity:taskType` combinations
- **4-Tier Routing Priority**: Forced -> Learning -> Rules -> Health

### Added - Specialized Subagent System
Ten AI roles with tailored prompts and structured outputs via `spawn_subagent`.

### Added - Security Certification (8.7/10)
- OWASP Top 10:2025: 82% compliance
- OWASP API Security: 92% compliance
- NIST AI RMF: 84% alignment

---

## Previous Versions

For changes prior to v1.3.0, please refer to the git commit history.
