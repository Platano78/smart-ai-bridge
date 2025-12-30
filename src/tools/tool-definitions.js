/**
 * @fileoverview Tool Definitions - Core tool schemas and metadata
 * @module tools/tool-definitions
 *
 * Single source of truth for all MKG tool schemas
 * Extracted from server-mecha-king-ghidorah-complete.js (lines 487-858)
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
    description: '👀 Comprehensive code review - Security audit, performance analysis, best practices validation. Multi-file correlation analysis. Automated quality scoring and improvement suggestions.',
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
    name: 'read',
    description: '📖 Intelligent file operations - Smart context management with automatic chunking. Multi-file reading with relationship detection. Project structure analysis. Enhanced with fuzzy matching verification for pre-flight edit validation.',
    handler: 'handleRead',
    schema: {
      type: 'object',
      properties: {
        file_paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of file paths to read'
        },
        max_files: { type: 'number', default: 10 },
        analysis_type: {
          type: 'string',
          enum: ['content', 'structure', 'relationships', 'summary'],
          default: 'content'
        },
        verify_texts: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional array of text strings to verify existence in files for pre-flight edit validation'
        },
        verification_mode: {
          type: 'string',
          enum: ['basic', 'fuzzy', 'comprehensive'],
          default: 'fuzzy',
          description: 'Verification mode: basic (exact match only), fuzzy (includes similarity matching), comprehensive (fuzzy + suggestions)'
        },
        fuzzy_threshold: {
          type: 'number',
          default: 0.8,
          minimum: 0.1,
          maximum: 1.0,
          description: 'Similarity threshold for fuzzy matching (0.1-1.0, higher = more strict)'
        }
      },
      required: ['file_paths']
    }
  },
  {
    name: 'health',
    description: '🏥 OPTIMIZED System health and diagnostics - Smart differentiated health monitoring with BLAZING fast performance! Local endpoints get comprehensive inference testing (10s timeout), cloud endpoints get quick connectivity pings (3s timeout). Features performance metrics, NVIDIA cloud integration status, smart routing analytics, and FileModificationManager operation tracking. OPTIMIZER: Includes localhost priority discovery and cache invalidation!',
    handler: 'handleHealth',
    schema: {
      type: 'object',
      properties: {
        check_type: {
          type: 'string',
          enum: ['system', 'performance', 'endpoints', 'comprehensive'],
          default: 'comprehensive'
        },
        force_ip_rediscovery: {
          type: 'boolean',
          default: false,
          description: 'Force cache invalidation and rediscover IP addresses (useful when localhost connection fails)'
        }
      }
    }
  },
  {
    name: 'write_files_atomic',
    description: '✍️ Write multiple files atomically with backup - Enterprise-grade file modification with safety mechanisms',
    handler: 'handleWriteFilesAtomic',
    schema: {
      type: 'object',
      properties: {
        file_operations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              content: { type: 'string' },
              operation: {
                type: 'string',
                enum: ['write', 'append', 'modify'],
                default: 'write'
              }
            },
            required: ['path', 'content']
          }
        },
        create_backup: { type: 'boolean', default: true }
      },
      required: ['file_operations']
    }
  },
  {
    name: 'edit_file',
    description: '🔧 ENHANCED Intelligent file editing - FileModificationManager orchestrated operations with smart AI routing. AI-powered targeted modifications with validation, rollback capability, and complexity-based endpoint selection for optimal performance.',
    handler: 'handleEditFile',
    schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string' },
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              find: { type: 'string' },
              replace: { type: 'string' },
              description: { type: 'string' }
            },
            required: ['find', 'replace']
          }
        },
        language: { type: 'string' },
        validation_mode: {
          type: 'string',
          enum: ['strict', 'lenient', 'dry_run'],
          default: 'strict'
        },
        fuzzy_threshold: {
          type: 'number',
          minimum: 0.1,
          maximum: 1.0,
          default: 0.8,
          description: 'Similarity threshold for fuzzy matching (0.1-1.0, higher = more strict)'
        },
        suggest_alternatives: {
          type: 'boolean',
          default: true,
          description: 'Include fuzzy match suggestions in error messages'
        },
        max_suggestions: {
          type: 'integer',
          minimum: 1,
          maximum: 10,
          default: 3,
          description: 'Maximum number of fuzzy match suggestions to provide'
        }
      },
      required: ['file_path', 'edits']
    }
  },
  {
    name: 'validate_changes',
    description: '✅ Pre-flight validation for code changes - AI-powered syntax checking and impact analysis using DialoGPT-small. Validates proposed modifications before implementation.',
    handler: 'handleValidateChanges',
    schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string' },
        proposed_changes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              find: { type: 'string' },
              replace: { type: 'string' },
              line_number: { type: 'number' }
            },
            required: ['find', 'replace']
          }
        },
        language: { type: 'string' },
        validation_rules: {
          type: 'array',
          items: { type: 'string' },
          default: ['syntax', 'logic', 'security', 'performance']
        }
      },
      required: ['file_path', 'proposed_changes']
    }
  },
  {
    name: 'multi_edit',
    description: '🔄 ENHANCED Atomic batch operations - FileModificationManager orchestrator with parallel processing and smart AI routing. Enterprise-grade multi-file editing with NVIDIA cloud escalation for complex operations, AI validation, and automatic rollback.',
    handler: 'handleMultiEdit',
    schema: {
      type: 'object',
      properties: {
        file_operations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              file_path: { type: 'string' },
              edits: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    find: { type: 'string' },
                    replace: { type: 'string' },
                    description: { type: 'string' }
                  },
                  required: ['find', 'replace']
                }
              }
            },
            required: ['file_path', 'edits']
          }
        },
        transaction_mode: {
          type: 'string',
          enum: ['all_or_nothing', 'best_effort', 'dry_run'],
          default: 'all_or_nothing'
        },
        validation_level: {
          type: 'string',
          enum: ['strict', 'lenient', 'none'],
          default: 'strict'
        },
        parallel_processing: { type: 'boolean', default: true }
      },
      required: ['file_operations']
    }
  },
  {
    name: 'backup_restore',
    description: '💾 Enhanced backup management - Timestamped backup tracking with metadata, restore capability, and intelligent cleanup. Extends existing backup patterns with enterprise-grade management.',
    handler: 'handleBackupRestore',
    schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'restore', 'list', 'cleanup']
        },
        file_path: { type: 'string' },
        backup_id: { type: 'string' },
        metadata: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } }
          }
        },
        cleanup_options: {
          type: 'object',
          properties: {
            max_age_days: { type: 'number', default: 30 },
            max_count_per_file: { type: 'number', default: 10 },
            dry_run: { type: 'boolean', default: false }
          }
        }
      },
      required: ['action']
    }
  },
  {
    name: 'ask',
    description: '🤖 MULTI-AI Direct Query - Ask any backend with BLAZING FAST smart fallback chains! Features automatic Unity detection, dynamic token scaling, and response headers with backend tracking.',
    handler: 'handleAsk',
    schema: {
      type: 'object',
      properties: {
        model: {
          type: 'string',
          enum: ['auto', 'local', 'gemini', 'deepseek', 'qwen3', 'minimax', 'chatgpt', 'groq'],
          description: 'AI backend to query: auto (Orchestrator-8B decides optimal backend), local (Qwen2.5-Coder-7B-Instruct-FP8-Dynamic, 128K+ tokens), gemini (Gemini Enhanced, 32K tokens), deepseek (NVIDIA DeepSeek V3.2 with streaming + reasoning, 8K tokens), qwen3 (NVIDIA Qwen3 Coder 480B, 32K tokens), minimax (NVIDIA MiniMax M2, reasoning with think blocks, 8K tokens), chatgpt (OpenAI GPT-4.1, 128K context, premium reasoning), groq (Llama 3.3 70B, ultra-fast 500+ t/s)'
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
          description: 'Force specific backend (bypasses smart routing) - use backend keys like "local", "gemini", "nvidia_deepseek", "nvidia_qwen", "openai_chatgpt", "groq_llama"'
        },
        model_profile: {
          type: 'string',
          description: 'Router mode model profile for local backend. Available profiles: coding-reap25b (complex refactoring, ~25s), coding-seed-coder (standard coding, ~8s), coding-qwen-7b (fast coding, ~10s), agents-qwen3-14b (multi-agent, ~10s), agents-nemotron (parallel inference, ~12s), agents-seed-coder (high throughput, ~8s), fast-deepseek-lite (quick analysis, ~8s), fast-qwen14b (fast coding, ~12s)'
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
    description: '💬 Manage conversation threading across sessions. Start new conversations, continue existing ones, search conversation history, or get analytics.',
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
    description: '📊 Get usage analytics, performance metrics, cost analysis, and optimization recommendations. View current session stats, historical data, backend performance, and detailed reports.',
    handler: 'handleGetAnalytics',
    schema: {
      type: 'object',
      properties: {
        report_type: {
          type: 'string',
          enum: ['current', 'historical', 'cost', 'recommendations', 'full_report'],
          description: 'Type of analytics to retrieve: current (session stats), historical (time-series data), cost (cost analysis), recommendations (optimization tips), full_report (comprehensive report)'
        },
        time_range: {
          type: 'string',
          enum: ['1h', '24h', '7d', '30d'],
          description: 'Time range for historical data (default: 7d)'
        },
        format: {
          type: 'string',
          enum: ['json', 'markdown'],
          description: 'Output format for reports (default: json)'
        }
      }
    }
  },
  {
    name: 'check_backend_health',
    description: '🩺 Manual backend health check - On-demand health diagnostics for specific backend with 5-minute result caching. Only runs when explicitly requested.',
    handler: 'handleCheckBackendHealth',
    schema: {
      type: 'object',
      properties: {
        backend: {
          type: 'string',
          description: 'Backend name to check (local, gemini, deepseek, qwen3, chatgpt, groq_llama)'
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
    description: '🤖 Spawn specialized AI subagent - Create subagents with predefined roles (code-reviewer, security-auditor, planner, refactor-specialist, test-generator, documentation-writer). Each role has customized prompts, tools, and behavior for specific tasks.',
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
          description: 'Verdict parsing mode: summary (extract key fields only) or full (return complete verdict data)'
        }
      },
      required: ['role', 'task']
    }
  },
  {
    name: 'parallel_agents',
    description: '🚀 Execute multiple TDD agents in parallel with quality gate iteration. Decomposes high-level tasks into atomic subtasks, executes them in parallel groups (RED before GREEN), and iterates based on quality review.',
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
    description: '🏛️ Multi-AI Council - Get consensus from multiple AI backends on complex questions. Claude explicitly selects topic and confidence level, backends provide diverse perspectives, Claude synthesizes the final answer. Use for architectural decisions, controversial topics, or when you need validation from multiple viewpoints.',
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
          description: 'Topic category - determines which backends are consulted: coding (nvidia_qwen, local), reasoning (nvidia_deepseek, nvidia_minimax), architecture (nvidia_deepseek, nvidia_qwen), general (gemini, groq_llama), creative (gemini, nvidia_qwen), security (nvidia_deepseek, nvidia_qwen), performance (nvidia_deepseek, local)'
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
  // MKG v9.0: New Local LLM File Operations
  // These tools route file comprehension/generation to local LLMs,
  // reducing Claude's token consumption by ~90%
  // =============================================================================

  {
    name: 'analyze_file',
    description: '📊 Local LLM File Analysis - Reads and analyzes files using local LLM. Claude never sees full file content, only structured findings. Token savings: 2000+ → ~150 tokens per file.',
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
              description: 'Type of analysis to perform'
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
    name: 'generate_file',
    description: '📝 Local LLM Code Generation - Generates code from natural language spec using local LLM. Claude reviews or auto-approves. Token savings: 500+ → ~50 tokens.',
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
    description: '✏️ Local LLM File Modification - Applies edits using natural language instructions. Local LLM understands code and applies changes. Token savings: 1500+ → ~100 tokens.',
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
    description: '📂 Batch File Analysis - Analyze multiple files using glob patterns. Aggregates findings across files. Massive token savings for multi-file analysis.',
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
    description: '📝 Batch File Modification - Apply same instructions to multiple files with atomic rollback. Supports transaction mode (all or nothing).',
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
              description: 'Transaction mode for atomic operations'
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
    description: '🔧 Cross-File Refactoring - Apply refactoring across files with intelligent scope detection. Supports function, class, module, and project-level refactoring.',
    handler: 'handleRefactor',
    schema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['function', 'class', 'module', 'project'],
          description: 'Refactoring scope: function (single function), class (class and members), module (module-level), project (project-wide)'
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
  // 🖼️ IMAGE GENERATION TOOLS - Stable Diffusion Integration
  {
    name: 'generate_image',
    description: '🖼️ Generate images using local Stable Diffusion (FLUX.1-dev) - Create high-quality images from text prompts. Runs on local GPU (RTX 5080). Server must be running on port 8084.',
    handler: 'handleGenerateImage',
    schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Text description of the image to generate'
        },
        size: {
          type: 'string',
          enum: ['256x256', '512x512', '768x768', '1024x1024'],
          default: '512x512',
          description: 'Image dimensions (width x height)'
        },
        steps: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          default: 20,
          description: 'Number of diffusion steps (more = higher quality but slower)'
        },
        cfg_scale: {
          type: 'number',
          minimum: 0,
          maximum: 20,
          default: 1.0,
          description: 'Classifier-free guidance scale (1.0 recommended for FLUX)'
        },
        seed: {
          type: 'integer',
          default: -1,
          description: 'Random seed (-1 for random)'
        }
      },
      required: ['prompt']
    }
  },
  {
    name: 'sd_status',
    description: '🖼️ Check Stable Diffusion server status - Returns whether the SD server is running and ready to generate images.',
    handler: 'handleSdStatus',
    schema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

/**
 * Alias group definitions
 * @type {Object[]}
 */
const ALIAS_GROUP_DEFINITIONS = [
  {
    groupName: 'MKG',
    prefix: 'MKG_',
    description: 'MKG Alias:',
    aliases: [
      {
        alias: 'MKG_analyze',
        coreTool: 'analyze',
        customDescription: '🔍 MKG Alias: Universal code analysis - AI-driven file type detection with smart routing',
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
        alias: 'MKG_generate',
        coreTool: 'generate',
        customDescription: '⚡ MKG Alias: Smart code generation - Context-aware code creation with AI routing',
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
      { alias: 'MKG_review', coreTool: 'review' },
      { alias: 'MKG_edit', coreTool: 'edit_file' },
      { alias: 'MKG_health', coreTool: 'health' }
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
        customDescription: '🔍 DeepSeek Alias: Universal code analysis - AI-driven file type detection with smart routing',
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
        customDescription: '⚡ DeepSeek Alias: Smart code generation - Context-aware code creation with AI routing',
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
      { alias: 'deepseek_edit', coreTool: 'edit_file' },
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
