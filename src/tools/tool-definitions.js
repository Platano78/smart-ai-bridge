/**
 * @fileoverview Tool Definitions - Core tool schemas and metadata
 * @module tools/tool-definitions
 *
 * Single source of truth for all Smart AI Bridge tool schemas
 */

/**
 * @typedef {Object} ToolDefinition
 * @property {string} name - Tool name
 * @property {string} description - Tool description
 * @property {string} handler - Handler function name
 * @property {Object} schema - JSON Schema for input validation
 */

/**
 * Core tool definitions
 * @type {ToolDefinition[]}
 */
const CORE_TOOL_DEFINITIONS = [
  {
    name: 'review',
    description: "Review a code blob you already have in context and return structured findings + a quality score + improvement suggestions. Pass the code itself in `content`; this tool does not read any file from disk. Use when Claude already has the code in hand. For a review of a file Claude has NOT seen (so the file content stays out of context, ~90% token savings), use `analyze_file` with analysisType:'security' instead. For multiple AI perspectives on the same code, use `council`. Read-only: never writes to disk. Returns: `{success, file_path, language, review_type, review (full review text from the LLM, includes findings + severity + suggestions), endpoint_used}`.",
    handler: 'handleReview',
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Code content to review' },
        file_path: { type: 'string', description: 'File path for context' },
        language: { type: 'string', description: 'Programming language hint' },
        review_type: {
          type: 'string',
          enum: ['security', 'performance', 'quality', 'comprehensive'],
          default: 'comprehensive'
        }
      },
      required: ['content']
    }
  },
  {
    name: 'write_files_atomic',
    description: "Write a batch of files in a single atomic operation with automatic backup. All files succeed or all roll back on any failure. Use this when several file writes must land together (config changes across modules, multi-file generation output). For natural-language edits to a single file, use `modify_file` instead. For appending to a log or accumulator file, use the `append` operation here. Each overwrite produces a `<path>.backup.<timestamp>` file when create_backup is true (default). ⚠️ DESTRUCTIVE: every operation writes (or appends to) a real file on disk. The rollback path runs only when a LATER operation in the same batch fails — earlier successful writes are reverted from their backups, but if every operation succeeds, the new files stand and the backups remain on disk. Returns: `{success, files_written, results:[{path, operation, success, size}], backups_created, backups:[{original, backup}]}`. On a mid-batch failure the call throws after restoring earlier files (rollback is not reflected in a success response).",
    handler: 'handleWriteFilesAtomic',
    schema: {
      type: 'object',
      properties: {
        file_operations: {
          type: 'array',
          description: 'Array of write operations to apply atomically. If any operation fails, all previously written files are restored from their backups.',
          items: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Absolute or relative file path. Parent directories are auto-created if missing.'
              },
              content: {
                type: 'string',
                description: "Full file content (for operation 'write') or content to append (for operation 'append')."
              },
              operation: {
                type: 'string',
                enum: ['write', 'append'],
                default: 'write',
                description: "'write' overwrites the file with content; 'append' adds content to the end. The legacy 'modify' value is no longer accepted — use the `modify_file` tool for search/replace edits."
              }
            },
            required: ['path', 'content']
          }
        },
        create_backup: {
          type: 'boolean',
          default: true,
          description: 'When true, each file that would be overwritten is first copied to `<path>.backup.<timestamp>`. Set false only when you know the prior content is recoverable from version control.'
        }
      },
      required: ['file_operations']
    }
  },
  {
    name: 'backup_restore',
    description: "Manage the timestamped backup files produced by `modify_file` and `write_files_atomic`. Four actions: `create` (manually snapshot a file before a risky native edit), `list` (enumerate known backups, optionally filtered to one file), `restore` (overwrite a file with a specific backup_id), `cleanup` (delete old backups per the policy in cleanup_options). The cleanup policy applies BOTH thresholds — a backup is deleted only when it exceeds max_age_days OR when its file already has more than max_count_per_file newer backups. Use dry_run to preview before applying. ⚠️ DESTRUCTIVE: `restore` overwrites the current file (the prior state is auto-snapshotted to `<path>.pre_restore_<timestamp>`, so the restore itself is reversible); `cleanup` permanently deletes backup files from disk. `create` and `list` are read-only. Returns: `{ success, action, ...action-specific fields }`. `create`→`{backup_id, backup_path, original_path, size}`. `restore`→`{backup_id, restored_to, pre_restore_backup}`. `list`→`{file_path, backups:[{path, backup_id, size, created, metadata}]}`. `cleanup`→`{dry_run, backups_deleted, deleted:[{path, reason:'age'|'count'}]}`.",
    handler: 'handleBackupRestore',
    schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'restore', 'list', 'cleanup'],
          description: 'Required. Operation to perform on the backup store.'
        },
        file_path: {
          type: 'string',
          description: "For `create`: file to snapshot (required). For `list`: optional filter to one file. Ignored for `restore` (use backup_id) and `cleanup` (operates on the whole store)."
        },
        backup_id: {
          type: 'string',
          description: "Identifier of the backup to restore (timestamp from `<path>.backup.<timestamp>`). Required for `restore`, ignored for other actions."
        },
        metadata: {
          type: 'object',
          description: 'Optional tags and description attached to a `create` snapshot for later identification via `list`.',
          properties: {
            description: { type: 'string', description: 'Human-readable note attached to this backup.' },
            tags: { type: 'array', items: { type: 'string' }, description: 'String labels for filtering in `list`.' }
          }
        },
        cleanup_options: {
          type: 'object',
          description: 'Policy controls for the `cleanup` action. Ignored by other actions.',
          properties: {
            max_age_days: { type: 'number', default: 30, description: 'Backups older than this many days are eligible for deletion.' },
            max_count_per_file: { type: 'number', default: 10, description: 'When a file has more than this many backups, the oldest extras are deleted.' },
            dry_run: { type: 'boolean', default: false, description: 'When true, report what would be deleted without actually removing files.' }
          }
        }
      },
      required: ['action']
    }
  },
  {
    name: 'ask',
    description: "Send one prompt to one AI backend and return the response. `model:'auto'` lets SAB's router pick the best backend by task complexity + current health; passing a specific model name forces that provider. Use this for direct LLM queries that don't fit a more specialized tool. For multi-backend consensus on the same prompt, use `council`. For agentic multi-step work with a defined role, use `spawn_subagent`. For LLM-driven file generation or editing, use `generate_file` / `modify_file` so the file content stays out of Claude's context window. Read-only: makes one HTTP call to the chosen backend. Returns: `{success, model, requested_backend, actual_backend, prompt (truncated preview), response (the LLM output), backend_used, fallback_chain, response_time, cache_status, thinking_enabled, max_tokens, was_truncated, smart_routing_applied, routing, processing_time}`.",
    handler: 'handleAsk',
    schema: {
      type: 'object',
      properties: {
        model: {
          type: 'string',
          enum: ['auto', 'local', 'gemini', 'nvidia_deepseek', 'nvidia_qwen', 'openai', 'groq'],
          description: 'AI backend to query: auto (smart routing selects optimal backend), local (autodiscover vLLM/llama.cpp/LM Studio), gemini (Gemini Enhanced, 32K tokens), nvidia_deepseek (NVIDIA DeepSeek with streaming + reasoning, 8K tokens), nvidia_qwen (NVIDIA Qwen3 Coder 480B, 32K tokens), openai (OpenAI GPT-5.2, 128K context, premium reasoning), groq (Llama 3.3 70B, ultra-fast 500+ t/s)'
        },
        prompt: {
          type: 'string',
          description: 'Your question or prompt (Unity/complex generations automatically get high token limits)'
        },
        thinking: {
          type: 'boolean',
          default: true,
          description: 'Enable thinking mode for DeepSeek (shows reasoning)'
        },
        max_tokens: {
          type: 'number',
          description: 'Maximum response length (auto-calculated if not specified: Unity=16K, Complex=8K, Simple=2K)'
        },
        enable_chunking: {
          type: 'boolean',
          default: false,
          description: 'Enable automatic request chunking for extremely large generations (fallback if truncated)'
        },
        force_backend: {
          type: 'string',
          description: 'Force specific backend (bypasses smart routing) - use backend keys like "local", "gemini", "nvidia_deepseek", "nvidia_qwen", "openai", "groq"'
        },
        model_profile: {
          type: 'string',
          description: 'Router mode model profile for local backend. Available profiles: coding-reap25b (complex refactoring, ~25s), coding-seed-coder (standard coding, ~8s), coding-qwen-7b (fast coding, ~10s), agents-qwen3-14b (multi-agent, ~10s), agents-seed-coder (high throughput, ~8s), fast-deepseek-lite (quick analysis, ~8s), fast-qwen14b (fast coding, ~12s)'
        },
        auto_profile: {
          type: 'boolean',
          default: false,
          description: 'Enable automatic profile selection based on task type detection. When true, auto-selects coding-seed-coder for coding tasks if no explicit model_profile is set.'
        }
      },
      required: ['model', 'prompt']
    }
  },
  {
    name: 'manage_conversation',
    description: "Manage long-running conversation threads across sessions. The conversation state machine: call `start` (topic is recommended but not required — used for search/grouping) to receive a thread_id + continuation_id; pass `continuation_id` on each follow-up turn with `continue` to extend the thread; use `resume` with a stored thread_id to pick up an old thread from any session. `history` returns the messages in one thread; `search` queries across all stored conversations by free-text query; `analytics` reports per-thread/per-user usage stats. Each action requires only the parameters listed in its description below — extra fields are ignored. Persists conversation state to the configured threading store (non-destructive to user files; the threading store grows over time). Returns: `{success, action, data}` where `data` shape varies — start: `{thread_id, continuation_id, topic, created_at}`. continue: `{thread_id, continuation_id, response, message_count}`. resume: `{thread_id, topic, last_message_at, message_count}`. history: `{thread_id, messages:[{role, content, timestamp}]}` (capped at `limit`, default 10). search: `{query, matches:[{thread_id, topic, snippet, score}]}`. analytics: `{total_threads, threads_by_user, avg_messages_per_thread, recent_topics}`.",
    handler: 'handleManageConversation',
    schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['start', 'continue', 'resume', 'history', 'search', 'analytics'],
          description: 'Action to perform: start (new thread), continue (with continuation_id), resume (with thread_id), history (get thread history), search (search conversations), analytics (get analytics)'
        },
        thread_id: {
          type: 'string',
          description: 'Thread ID to resume or get history (optional)'
        },
        continuation_id: {
          type: 'string',
          description: 'Continuation ID from previous response (optional)'
        },
        topic: {
          type: 'string',
          description: 'Topic for new conversation (optional)'
        },
        query: {
          type: 'string',
          description: 'Search query for conversations (optional)'
        },
        user_id: {
          type: 'string',
          description: 'User identifier (optional, defaults to "default")'
        },
        platform: {
          type: 'string',
          enum: ['claude_desktop', 'claude_code'],
          description: 'Platform identifier (optional)'
        },
        limit: {
          type: 'number',
          description: 'Limit for history results (optional, default 10)'
        }
      },
      required: ['action']
    }
  },
  {
    name: 'get_analytics',
    description: "Inspect SAB's internal telemetry: backend invocation counts, success/failure rates, latency distributions, estimated token spend per provider, and recent routing decisions. Read-only — never calls an LLM, never writes to disk. Use to diagnose 'why did SAB pick backend X', tune routing rules, or understand cost trade-offs across providers. Report types are cumulative: `full_report` includes everything from the other types. Returns: `{success, report_type, data}` where `data` depends on report_type — current: `{backends:{[name]:{invocations, success_rate, p50_ms, p95_ms}}, session_uptime, timestamp}`. historical: `{time_range, series:[{timestamp, backend, calls, errors, latency}]}`. cost: `{by_backend:{[name]:{tokens_in, tokens_out, estimated_usd}}, total_estimated_usd}`. recommendations: `{recommendations:[{type, suggestion, confidence}]}`. full_report: a merged object with all sections. If analytics hasn't initialized, returns `{message, basic_stats:{uptime, memory, timestamp}}`.",
    handler: 'handleGetAnalytics',
    schema: {
      type: 'object',
      properties: {
        report_type: {
          type: 'string',
          enum: ['current', 'historical', 'cost', 'recommendations', 'full_report'],
          description: '`current` = stats since this server started (invocation counts, success rate, p50/p95 latency per backend). `historical` = time-bucketed series over `time_range`. `cost` = estimated token spend per backend, with cost-per-1K-tokens projections. `recommendations` = SAB heuristics on backend selection (e.g. "switch coding tasks to qwen3 — 18% faster on your traces"). `full_report` = all of the above.'
        },
        time_range: {
          type: 'string',
          enum: ['1h', '24h', '7d', '30d'],
          description: 'Lookback window for `historical` and `cost` reports. Ignored for `current` and `recommendations`. Default: 7d.'
        },
        format: {
          type: 'string',
          enum: ['json', 'markdown'],
          description: '`json` = machine-readable nested object. `markdown` = human-readable summary with tables. Default: json.'
        }
      }
    }
  },
  {
    name: 'check_backend_health',
    description: "On-demand ping of one backend's API endpoint to verify reachability and capture latency. Results are cached for 5 minutes; pass `force:true` to bypass the cache. SAB already runs periodic auto-health checks in the background, so most callers don't need this — reach for it when troubleshooting a routing decision that failed unexpectedly or before kicking off a long batch call against a particular backend. Read-only: makes one HTTP request to the backend's health endpoint. Returns: `{status:'online'|'offline'|'degraded', latency_ms, backend, last_check_iso, error?, models?:[{id, name, size, quantization}] (router only), available_presets? (router only), cache_status:'HIT'|'MISS', total_check_time}`.",
    handler: 'handleCheckBackendHealth',
    schema: {
      type: 'object',
      properties: {
        backend: {
          type: 'string',
          description: 'Backend name to check (local, gemini, nvidia_deepseek, nvidia_qwen, openai, groq)'
        },
        force: {
          type: 'boolean',
          default: false,
          description: 'Bypass cache and force fresh check'
        }
      },
      required: ['backend']
    }
  },
  {
    name: 'spawn_subagent',
    description: "Spawn one AI agent with a predefined role + system prompt and run it to completion on a single task. The agent runs once and returns its verdict; there is no memory between calls. Use when the work fits a clear role (security audit on one module, generate tests for one function, write docs for one API). For multi-agent TDD parallelism with quality gates, use `parallel_agents`. For multi-backend consensus on a question, use `council`. Pass file paths and acceptance criteria in `task` — the agent has no other context. ⚠️ DESTRUCTIVE when `write_files:true`: code blocks the agent emits are saved into `work_directory` (auto-created if missing, defaults to `/tmp/subagent-<role>-<timestamp>`). The default `write_files:false` is non-destructive — code is returned inline in the response. Returns: `{success, role, task, backend_used, response (agent's full output), verdict (structured findings, depth controlled by verdict_mode), files_analyzed (paths the agent read), files_written:[paths] (only when write_files), work_directory, suggested_tools:[follow-up tool names], processing_time_ms, metrics}`.",
    handler: 'handleSpawnSubagent',
    schema: {
      type: 'object',
      properties: {
        role: {
          type: 'string',
          enum: ['code-reviewer', 'security-auditor', 'planner', 'refactor-specialist', 'test-generator', 'documentation-writer', 'tdd-decomposer', 'tdd-test-writer', 'tdd-implementer', 'tdd-quality-reviewer'],
          description: 'Subagent role: code-reviewer (quality review), security-auditor (vulnerability detection), planner (task breakdown), refactor-specialist (code improvement), test-generator (test creation), documentation-writer (docs generation), tdd-decomposer (break task into TDD subtasks), tdd-test-writer (RED phase), tdd-implementer (GREEN phase), tdd-quality-reviewer (quality gate)'
        },
        task: {
          type: 'string',
          description: 'Task description for the subagent to perform'
        },
        file_patterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional glob patterns for files to analyze (e.g., ["src/**/*.js", "*.test.ts"])'
        },
        context: {
          type: 'object',
          description: 'Additional context object for the subagent'
        },
        verdict_mode: {
          type: 'string',
          enum: ['summary', 'full'],
          default: 'summary',
          description: '`summary` returns the agent\'s key findings + recommended actions only (faster, less for Claude to read). `full` returns the agent\'s complete structured verdict including reasoning trace.'
        },
        write_files: {
          type: 'boolean',
          default: false,
          description: 'When true, code blocks the agent emits are saved into `work_directory` as separate files. Default false — code is returned inline in the response, which keeps disk state clean but adds tokens.'
        },
        work_directory: {
          type: 'string',
          description: 'Destination directory when `write_files:true`. Auto-created if missing. Defaults to `/tmp/subagent-<role>-<timestamp>`.'
        }
      },
      required: ['role', 'task']
    }
  },
  {
    name: 'parallel_agents',
    description: "Run a test-first development workflow as a graph of parallel agents: a decomposer splits the task into atomic subtasks, RED-phase agents write failing tests, GREEN-phase agents implement to pass them, then a quality reviewer iterates the cycle until a threshold is met or `max_iterations` runs out. Use for self-contained features that benefit from test-first discipline and can be parallelized. For a single agent on a single task, use `spawn_subagent`. For a generate→review→fix loop on one code blob (no test infrastructure), use `dual_iterate`. ⚠️ DESTRUCTIVE when `write_files:true` (default): generated tests, implementation, and refactor outputs are written under `work_directory` in `red/`, `green/`, `refactor/` subdirectories (defaults to `/tmp/parallel-agents-<timestamp>`). Returns: `{success, task, decomposition (decomposer's plan), execution:{groups_executed, tasks_completed, tasks_failed, max_parallel_used, files_written, write_files_enabled}, router_info:{slots, model, status}, quality:{verdict, score, iterations}, synthesis (combined output), files:[absolute paths written], work_directory, processing_time_ms, metrics}`.",
    handler: 'handleParallelAgents',
    schema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'High-level task to decompose and execute via TDD workflow'
        },
        max_parallel: {
          type: 'integer',
          default: 2,
          minimum: 1,
          maximum: 6,
          description: 'Maximum parallel agents (matches GPU slots, default: 2)'
        },
        iterate_until_quality: {
          type: 'boolean',
          default: true,
          description: 'Whether to iterate on failed quality checks'
        },
        max_iterations: {
          type: 'integer',
          default: 3,
          minimum: 1,
          maximum: 5,
          description: 'Maximum quality gate iterations (prevents infinite loops)'
        },
        write_files: {
          type: 'boolean',
          default: true,
          description: 'Write generated code to files in work_directory (default: true). Files are organized by phase (red/green/refactor subdirectories).'
        },
        work_directory: {
          type: 'string',
          description: 'Optional directory for generated files (default: /tmp/parallel-agents-{timestamp})'
        }
      },
      required: ['task']
    }
  },
  {
    name: 'council',
    description: "Pose one prompt to several AI backends in parallel and return all of their responses for Claude to synthesize. Backend selection is driven by `topic` (e.g. coding routes to qwen + local, reasoning routes to deepseek). `confidence_needed` controls how many backends are queried — high (4), medium (3), low (2). Use for architectural trade-offs, controversial calls, or anywhere dissent surfaced cheaply (~1-2s for 2-3 backends) is more useful than a single answer. For a single backend query, use `ask`. Read-only: makes N parallel HTTP calls; never writes to disk. Returns: `{success, topic, strategy, confidence_needed, backends_queried:[names], backends_responded:[names of those that succeeded], responses:[{backend, success, content, response_time, error?}], processing_time_ms, metrics, synthesis_hint (suggestion to Claude on how to synthesize)}`.",
    handler: 'handleCouncil',
    schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The question or topic for the council to deliberate on'
        },
        topic: {
          type: 'string',
          enum: ['coding', 'reasoning', 'architecture', 'general', 'creative', 'security', 'performance'],
          description: 'Topic category - determines which backends are consulted: coding (nvidia_qwen, local), reasoning (nvidia_deepseek), architecture (nvidia_deepseek, nvidia_qwen), general (gemini, groq), creative (gemini, nvidia_qwen), security (nvidia_deepseek, nvidia_qwen), performance (nvidia_deepseek, local)'
        },
        confidence_needed: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          default: 'medium',
          description: 'Required confidence level - determines number of backends: high (4 backends), medium (3 backends), low (2 backends)'
        },
        num_backends: {
          type: 'integer',
          minimum: 2,
          maximum: 6,
          description: 'Override number of backends to query (optional - auto-calculated from confidence_needed)'
        },
        max_tokens: {
          type: 'integer',
          default: 4000,
          description: 'Maximum tokens per backend response'
        }
      },
      required: ['prompt', 'topic']
    }
  },

  // =============================================================================
  // Smart AI Bridge: Local LLM File Operations
  // These tools route file comprehension/generation to local LLMs,
  // reducing Claude's token consumption by ~90%
  // =============================================================================

  {
    name: 'analyze_file',
    description: "Read ONE file and answer a question about it using a local or cloud LLM — Claude never sees the file contents, only the structured findings the LLM returns (~90% token savings). Use when you have one specific file and a specific question (security check, bug hunt, architectural concern). For the same question across many files (glob patterns), use `batch_analyze`. For a natural-language search across the codebase with no specific file in mind, use `explore`. Pure line-range questions like 'show me lines 437–490' short-circuit the LLM entirely and return the requested lines verbatim at zero token cost. Read-only: reads filePath, optionally reads includeContext files, makes one LLM call. Returns: `{success, filePath, fileSize, lineCount, language, analysisType, question, summary, findings:[strings], confidence (0-1), suggestedActions:[strings], backend_used, processing_time, tokens_saved}`. Verbatim short-circuit returns the same shape with `analysisType:'verbatim'`, `backend_used:'direct_extraction'`, and the requested lines in `summary`.",
    handler: 'handleAnalyzeFile',
    schema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the file to analyze'
        },
        question: {
          type: 'string',
          description: 'Question about the file (e.g., "What are the security vulnerabilities?")'
        },
        options: {
          type: 'object',
          properties: {
            backend: {
              type: 'string',
              enum: ['auto', 'local', 'deepseek', 'qwen3', 'gemini', 'groq'],
              default: 'auto',
              description: 'AI backend to use for analysis'
            },
            analysisType: {
              type: 'string',
              enum: ['general', 'bug', 'security', 'performance', 'architecture'],
              default: 'general',
              description: '`general` = open-ended question (default). `bug` = look for defects, off-by-ones, race conditions. `security` = vulnerability-focused (SQLi, XSS, secret leaks, OWASP-style review). `performance` = bottlenecks, hot loops, allocation churn. `architecture` = design issues, coupling, layering. The choice also influences which backend is preferred for the analysis.'
            },
            includeContext: {
              type: 'array',
              items: { type: 'string' },
              description: 'Related files to include for better analysis'
            },
            maxResponseTokens: {
              type: 'number',
              default: 2000,
              description: 'Maximum tokens for the analysis response'
            }
          }
        }
      },
      required: ['filePath', 'question']
    }
  },
  {
    name: 'explore',
    description: "Natural-language search across the codebase: combines grep-style matching with optional LLM summarization to answer 'where is X handled?' or 'what files implement Y?' Returns a summary + the matching file:line list, not raw file contents. Use when you DON'T already know which file to look at. For a deep analysis of ONE known file, use `analyze_file`. For a structured question across a known set of files (glob patterns), use `batch_analyze`. `depth:'shallow'` is fast grep; `depth:'deep'` adds LLM-generated context per match. Read-only: walks the filesystem and reads matched files but never writes. Returns: `{success, summary (LLM- or template-generated answer), files_found:[paths], search_patterns:[strings actually grepped], evidence:[{file, line, match}] (capped at 15), tokens_saved, processing_time_ms, depth, backend_used}`.",
    handler: 'handleExplore',
    schema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'Natural language question about the codebase (e.g., "where is user authentication handled?")'
        },
        options: {
          type: 'object',
          properties: {
            scope: {
              type: 'string',
              default: '.',
              description: 'Glob pattern to limit search scope (e.g., "src/**/*.js")'
            },
            depth: {
              type: 'string',
              enum: ['shallow', 'deep'],
              default: 'shallow',
              description: 'Search depth: shallow (fast grep) or deep (context-aware analysis)'
            },
            maxFiles: {
              type: 'number',
              default: 20,
              description: 'Maximum files to examine'
            },
            backend: {
              type: 'string',
              enum: ['auto', 'groq', 'qwen3', 'deepseek'],
              default: 'auto',
              description: 'Backend for summarization (auto selects based on depth)'
            }
          }
        }
      },
      required: ['question']
    }
  },
  {
    name: 'generate_file',
    description: "Generate a new file from a natural-language spec. The local LLM writes the code; Claude either reviews the proposed content (`review:true`, default) or it gets written directly to `outputPath` (`review:false`). Use for fresh files you can describe by goal — boilerplate, scaffolding, test fixtures, single-file utilities. For editing an EXISTING file, use `modify_file`. For writing a known content string to disk with no LLM involved, use `write_files_atomic`. Optionally pass `contextFiles` to anchor the generated style on existing code. ⚠️ DESTRUCTIVE when `review:false`: writes (and creates parent directories of) `outputPath`. If `includeTests:true`, also writes a sibling test file. The default (`review:true`) is non-destructive — returns the generated content for Claude to inspect first. Returns: `{success, status:'written'|'written_truncated'|'pending_review', outputPath, summary, linesOfCode, language, testPath (when includeTests), backend_used, processing_time, retry_attempts, was_truncated}`. In review mode the response also carries the generated `content` for Claude to apply via write_files_atomic.",
    handler: 'handleGenerateFile',
    schema: {
      type: 'object',
      properties: {
        spec: {
          type: 'string',
          description: 'Natural language specification for the code to generate'
        },
        outputPath: {
          type: 'string',
          description: 'Where to write the generated file'
        },
        options: {
          type: 'object',
          properties: {
            backend: {
              type: 'string',
              enum: ['auto', 'local', 'deepseek', 'qwen3', 'gemini', 'groq'],
              default: 'auto',
              description: 'AI backend to use for generation'
            },
            review: {
              type: 'boolean',
              default: true,
              description: 'Return content for Claude approval (true) or write directly (false)'
            },
            contextFiles: {
              type: 'array',
              items: { type: 'string' },
              description: 'Related files for style/pattern matching'
            },
            language: {
              type: 'string',
              description: 'Programming language (auto-detected if not specified)'
            },
            includeTests: {
              type: 'boolean',
              default: false,
              description: 'Also generate unit tests'
            }
          }
        }
      },
      required: ['spec', 'outputPath']
    }
  },
  {
    name: 'modify_file',
    description: "Edit an existing file by describing the change in natural language. The local LLM reads the file, applies the edit using SEARCH/REPLACE blocks (with a size-ratio safety net that refuses writes <50% of the original), and returns a unified diff for Claude to approve (`review:true`, default) or writes directly (`review:false`). Use for non-trivial edits where the AI does the work. For a known string→string replacement Claude can do itself, use native Edit. For writing a fully-specified content string to a file, use `write_files_atomic`. For the same instruction across MANY files, use `batch_modify`. For symbol renames + cross-file reference updates, use `refactor`. ⚠️ DESTRUCTIVE when `review:false`: writes directly to `filePath`. A backup at `<path>.backup.<timestamp>` is created unless `backup:false` is also passed (a warning is logged in that case). `dryRun:true` produces the diff without writing. Returns: shape depends on mode. review (default): `{success, status:'pending_review'|'pending_review_truncated', filePath, diff, modifiedContent, summary, stats, warnings, was_truncated, approval_options, retry_attempts}`. dryRun: `{success, status:'dry_run', filePath, diff, summary, stats, warnings, backend_used, processing_time}`. auto-write: `{success, status:'written', filePath, diff, summary, stats, backupCreated, backend_used, processing_time, tokens_saved}`.",
    handler: 'handleModifyFile',
    schema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the file to modify'
        },
        instructions: {
          type: 'string',
          description: 'Natural language edit instructions (e.g., "Add rate limiting to the login function")'
        },
        options: {
          type: 'object',
          properties: {
            backend: {
              type: 'string',
              enum: ['auto', 'local', 'deepseek', 'qwen3', 'gemini', 'groq'],
              default: 'auto',
              description: 'AI backend to use for modification'
            },
            review: {
              type: 'boolean',
              default: true,
              description: 'Return diff for Claude approval (true) or write directly (false)'
            },
            contextFiles: {
              type: 'array',
              items: { type: 'string' },
              description: 'Related files for understanding dependencies'
            },
            backup: {
              type: 'boolean',
              default: true,
              description: 'Create backup before writing'
            },
            dryRun: {
              type: 'boolean',
              default: false,
              description: 'Show changes without writing'
            }
          }
        }
      },
      required: ['filePath', 'instructions']
    }
  },
  {
    name: 'batch_analyze',
    description: "Run the SAME question against a glob of files, then aggregate the findings into one cross-file summary. Use for codebase-wide audits ('any SQL injection under src/**/handlers/*.js?'), per-feature reviews, or pre-merge sweeps. For ONE file, use `analyze_file` (cheaper). For NL search without a known file set, use `explore`. Set `aggregateResults:false` to get raw per-file results instead of the aggregated summary. Read-only: reads every matched file (capped by `maxFiles`) and makes one LLM call per file (parallel by default). Returns: shape depends on aggregateResults. aggregateResults:true (default): `{success, status:'completed', filesAnalyzed, patterns, question, aggregatedSummary, aggregatedFindings:[strings], aggregatedActions:[strings], overallConfidence, perFileResults:[{filePath, summary, findingCount, confidence}], processing_time, tokens_saved}`. aggregateResults:false: `{success, status:'completed', filesAnalyzed, patterns, question, results:[full per-file analysis objects], processing_time}`. Empty pattern match: `{success, status:'no_files', message, patterns}`.",
    handler: 'handleBatchAnalyze',
    schema: {
      type: 'object',
      properties: {
        filePatterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Glob patterns or file paths (e.g., ["src/**/*.ts", "lib/*.js"])'
        },
        question: {
          type: 'string',
          description: 'Question to ask about each file'
        },
        options: {
          type: 'object',
          properties: {
            maxFiles: {
              type: 'number',
              default: 20,
              description: 'Maximum files to analyze'
            },
            aggregateResults: {
              type: 'boolean',
              default: true,
              description: 'Combine findings into summary'
            },
            parallel: {
              type: 'boolean',
              default: true,
              description: 'Process files in parallel'
            },
            backend: {
              type: 'string',
              enum: ['auto', 'local', 'deepseek', 'qwen3', 'gemini', 'groq'],
              default: 'auto'
            },
            analysisType: {
              type: 'string',
              enum: ['general', 'bug', 'security', 'performance'],
              default: 'general'
            }
          }
        }
      },
      required: ['filePatterns', 'question']
    }
  },
  {
    name: 'batch_modify',
    description: "Apply the SAME natural-language instruction independently to each file in `files`. Use for sweeping consistent edits — 'add JSDoc to every exported function in lib/', 'replace console.log with logger.info'. `transactionMode:'all_or_nothing'` (default) rolls every file back if any one fails; `'best_effort'` keeps the successful edits and reports failures. This tool does NOT find cross-file references — each file is edited in isolation. For symbol renames that must update callers, use `refactor`. For one file with custom instructions, use `modify_file`. ⚠️ DESTRUCTIVE when `review:false`: writes to every file in the batch (per-file backups at `<path>.backup.<timestamp>`). The default `review:true` returns the proposed diffs without writing. Returns: shape depends on review. review:true (default): `{success, status:'pending_review', filesProcessed, patterns, instructions, modifications:[{filePath, status:'pending_review'|'error', summary, diff, stats, error?}], successCount, failureCount, approval_instructions, tokens_saved}`. review:false (auto-write): `{success, status:'completed'|'partial', filesProcessed, modifications:[{filePath, status:'written'|'error', summary, stats, error?}], successCount, failureCount}`.",
    handler: 'handleBatchModify',
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'File paths or glob patterns to modify'
        },
        instructions: {
          type: 'string',
          description: 'Instructions to apply to each file'
        },
        options: {
          type: 'object',
          properties: {
            parallel: {
              type: 'boolean',
              default: false,
              description: 'Process files in parallel (false is safer)'
            },
            stopOnError: {
              type: 'boolean',
              default: true,
              description: 'Stop on first error'
            },
            review: {
              type: 'boolean',
              default: true,
              description: 'Return all diffs for approval'
            },
            transactionMode: {
              type: 'string',
              enum: ['all_or_nothing', 'best_effort'],
              default: 'all_or_nothing',
              description: '`all_or_nothing` (default, safer): if ANY file fails, every successfully-modified file is restored from its backup and the batch reports failure. `best_effort`: keep the files that succeeded, report which ones failed. Use best_effort only when partial success is acceptable.'
            },
            backend: {
              type: 'string',
              enum: ['auto', 'local', 'deepseek', 'qwen3', 'gemini', 'groq'],
              default: 'auto'
            }
          }
        }
      },
      required: ['files', 'instructions']
    }
  },
  {
    name: 'refactor',
    description: "Cross-file refactoring with automatic reference tracking. Locates where `target` is defined and where it's used, then applies the instruction consistently across the matched scope. Use for renames, signature changes, API migrations — any edit where consistency between definition and callers matters. `scope` bounds how wide the search goes: 'function' / 'class' / 'module' / 'project'. For the same blind edit across files without reference-awareness (cheaper), use `batch_modify`. For a single-file change, use `modify_file`. ⚠️ DESTRUCTIVE when `review:false`: writes to every file touched by the refactor. `dryRun:true` produces the plan without writing. Returns: shape depends on mode. review:true (default) or dryRun:true: `{success, status:'pending_review'|'dry_run', scope, target, instructions, plan:{filesToModify, references}, modifications:[{filePath, diff, summary}], backend_used, processing_time}`. Auto-apply (review:false): `{success, status:'completed'|'partial', scope, target, instructions, filesModified, filesTotal, modifications:[{filePath, status:'written'|'error', summary, error?}], backend_used, processing_time}`.",
    handler: 'handleRefactor',
    schema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['function', 'class', 'module', 'project'],
          description: 'How wide the reference search goes. `function` = the target function and its direct callers in the same module. `class` = the class definition, its methods, and call sites within the same module. `module` = the file containing `target` plus any file that imports from it. `project` = whole-repo search (slowest, most thorough). Pick the narrowest scope that covers your actual change.'
        },
        target: {
          type: 'string',
          description: 'Symbol or pattern to refactor (e.g., "UserService", "handleLogin")'
        },
        instructions: {
          type: 'string',
          description: 'Refactoring instructions (e.g., "Rename to AuthService and update all references")'
        },
        options: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Limit to specific files (optional)'
            },
            dryRun: {
              type: 'boolean',
              default: false,
              description: 'Preview changes without writing'
            },
            review: {
              type: 'boolean',
              default: true,
              description: 'Return plan for approval'
            },
            backend: {
              type: 'string',
              enum: ['auto', 'local', 'deepseek', 'qwen3', 'gemini', 'groq'],
              default: 'auto'
            },
            findReferences: {
              type: 'boolean',
              default: true,
              description: 'Find and update all references'
            }
          }
        }
      },
      required: ['scope', 'target', 'instructions']
    }
  },
  // =============================================================================
  // Smart AI Bridge: Dual Iterate Tool - Internal generate->review->fix loop
  // =============================================================================

  {
    name: 'dual_iterate',
    description: "Code generation with an internal review loop: a generator backend writes code, a reviewer backend scores it against `quality_threshold`, the generator fixes flagged issues, and the cycle repeats until the threshold is met or `max_iterations` runs out. The whole loop runs inside SAB; Claude sees only the final accepted code (~1 turn of output instead of 3-5). Use for complex single-file generation where you would otherwise pay the token cost of reviewing iterations in-chat. For multi-agent TDD with parallelism + tests, use `parallel_agents`. For one-shot generation without iteration, use `generate_file`. Read-only: returns the generated code to the caller; does NOT write to disk (pass the result to `write_files_atomic` to persist). Returns: `{success, code (final accepted code as a string), mode (the iteration mode used), iterations (number actually run), execution_time_ms, metadata:{task_preview, code_length, timestamp}, history (full per-iteration log, only when include_history:true), final_review:{status, notes}, self_review_applied}`.",
    handler: 'handleDualIterate',
    schema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'Code generation task description (e.g., "Write a function that validates email addresses")'
        },
        max_iterations: {
          type: 'integer',
          minimum: 1,
          maximum: 5,
          default: 3,
          description: 'Maximum review iterations before accepting result (default: 3)'
        },
        include_history: {
          type: 'boolean',
          default: false,
          description: 'Include iteration history in response (useful for debugging)'
        },
        quality_threshold: {
          type: 'number',
          minimum: 0.5,
          maximum: 1.0,
          default: 0.7,
          description: 'Minimum reviewer score (0.5–1.0) needed to accept and stop iterating. 0.7 (default) = balanced. 0.85+ = strict (more iterations, better code, may exhaust `max_iterations`). 0.5 = lenient (returns first plausible attempt). The loop also stops at `max_iterations` regardless of threshold.'
        }
      },
      required: ['task']
    }
  }
];

/**
 * Alias group definitions
 * @type {Object[]}
 */
const ALIAS_GROUP_DEFINITIONS = [
  {
    groupName: 'SAB',
    prefix: 'SAB_',
    description: 'Smart AI Bridge Alias:',
    aliases: [
      {
        alias: 'SAB_analyze',
        coreTool: 'analyze',
        customDescription: 'SAB Alias: Universal code analysis - AI-driven file type detection with smart routing',
        customSchema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'File content to analyze' },
            file_path: { type: 'string', description: 'Path to file for analysis' },
            language: { type: 'string', description: 'Programming language hint (auto-detected if not provided)' },
            analysis_type: {
              type: 'string',
              enum: ['security', 'performance', 'structure', 'dependencies', 'comprehensive'],
              default: 'comprehensive'
            }
          },
          required: ['content']
        }
      },
      {
        alias: 'SAB_generate',
        coreTool: 'generate',
        customDescription: 'SAB Alias: Smart code generation - Context-aware code creation with AI routing',
        customSchema: {
          type: 'object',
          properties: {
            prefix: { type: 'string', description: 'Code before the completion point' },
            suffix: { type: 'string', description: 'Code after the completion point' },
            language: { type: 'string', default: 'javascript' },
            task_type: {
              type: 'string',
              enum: ['completion', 'refactor', 'feature', 'fix'],
              default: 'completion'
            }
          },
          required: ['prefix']
        }
      },
      { alias: 'SAB_review', coreTool: 'review' },
      { alias: 'SAB_edit', coreTool: 'modify_file' },
      { alias: 'SAB_health', coreTool: 'health' }
    ]
  },
  {
    groupName: 'DeepSeek',
    prefix: 'deepseek_',
    description: 'DeepSeek Alias:',
    aliases: [
      {
        alias: 'deepseek_analyze',
        coreTool: 'analyze',
        customDescription: 'DeepSeek Alias: Universal code analysis - AI-driven file type detection with smart routing',
        customSchema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'File content to analyze' },
            file_path: { type: 'string', description: 'Path to file for analysis' },
            language: { type: 'string', description: 'Programming language hint (auto-detected if not provided)' },
            analysis_type: {
              type: 'string',
              enum: ['security', 'performance', 'structure', 'dependencies', 'comprehensive'],
              default: 'comprehensive'
            }
          },
          required: ['content']
        }
      },
      {
        alias: 'deepseek_generate',
        coreTool: 'generate',
        customDescription: 'DeepSeek Alias: Smart code generation - Context-aware code creation with AI routing',
        customSchema: {
          type: 'object',
          properties: {
            prefix: { type: 'string', description: 'Code before the completion point' },
            suffix: { type: 'string', description: 'Code after the completion point' },
            language: { type: 'string', default: 'javascript' },
            task_type: {
              type: 'string',
              enum: ['completion', 'refactor', 'feature', 'fix'],
              default: 'completion'
            }
          },
          required: ['prefix']
        }
      },
      { alias: 'deepseek_review', coreTool: 'review' },
      { alias: 'deepseek_edit', coreTool: 'modify_file' },
      { alias: 'deepseek_health', coreTool: 'health' }
    ]
  }
];

/**
 * Get tool definition by name
 * @param {string} name - Tool name
 * @returns {ToolDefinition|undefined}
 */
function getToolDefinition(name) {
  return CORE_TOOL_DEFINITIONS.find(t => t.name === name);
}

/**
 * Get all tool names
 * @returns {string[]}
 */
function getAllToolNames() {
  return CORE_TOOL_DEFINITIONS.map(t => t.name);
}

export {
  CORE_TOOL_DEFINITIONS,
  ALIAS_GROUP_DEFINITIONS,
  getToolDefinition,
  getAllToolNames
};
