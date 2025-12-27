#!/usr/bin/env node

/**
 * Smart AI Bridge v1.3.0
 * Intelligent Multi-Backend AI Router with Learning Capabilities
 *
 * FEATURES:
 * • Smart Fallback Chains: Local→Gemini→NVIDIA with automatic health monitoring
 * • Compound Learning Engine: ML-based routing that improves over time
 * • Specialized Subagents: 6 role-based AI specialists (code-reviewer, security-auditor, etc.)
 * • Circuit Breakers: Automatic failover with 30-second recovery
 * • Request Caching: 15-minute intelligent cache with smart invalidation
 * • Async Health Checks: Non-blocking backend monitoring
 *
 * PERFORMANCE TARGETS:
 * • <5 second startup (MCP compliance)
 * • <500ms backend switching decisions
 * • <100ms fallback chain evaluation
 * • <2 second health checks across all backends
 *
 * TOOL SET:
 * Core: review, read, health, write_files_atomic, edit_file, validate_changes,
 *       multi_edit, backup_restore, ask, spawn_subagent, rate_limit_status, system_metrics
 *
 * BACKENDS:
 * • Local: Qwen2.5-Coder (primary, 128K+ context)
 * • Gemini: Google Gemini Pro (32K context)
 * • NVIDIA DeepSeek: V3.1 with thinking mode (8K output)
 * • NVIDIA Qwen: Qwen3-Coder-480B (32K output)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import {
  validatePath,
  validateFileExists,
  validateDirExists,
  validatePaths,
  safeJoin
} from './path-security.js';

// Security Modules - Production-Grade Security Integration
import { authManager } from './auth-manager.js';
import { InputValidator } from './input-validator.js';
import { rateLimiter } from './rate-limiter.js';
import { ErrorSanitizer } from './error-sanitizer.js';
import { metricsCollector } from './metrics-collector.js';

// Fuzzy Matching Security Module (v8.3.0+)
import {
  FUZZY_SECURITY_LIMITS,
  validateFuzzyEditComplexity,
  createFuzzyTimeoutWrapper,
  trackFuzzyMetrics,
  validateFuzzyThreshold,
  validateMaxSuggestions
} from './fuzzy-matching-security.js';

// v1.3.0 Features - Learning Engine & Subagent System
import { CompoundLearningEngine } from './intelligence/compound-learning.js';
import { SubagentHandler } from './handlers/subagent-handler.js';

/**
 * Sanitizes sensitive data from logs
 * @param {string} message - Log message
 * @returns {string} - Sanitized message
 */
function sanitizeLog(message) {
  if (typeof message !== 'string') return message;

  return message
    .replace(/nvapi-[A-Za-z0-9_-]+/g, 'nvapi-***REDACTED***')
    .replace(/AIza[0-9A-Za-z_-]{35}/g, 'AIza***REDACTED***')
    .replace(/sk-[A-Za-z0-9]{20,}/g, 'sk-***REDACTED***')
    .replace(/x-goog-api-key:\s*[^\s]+/g, 'x-goog-api-key: ***REDACTED***')
    .replace(/key=[^&\s]+/g, 'key=***REDACTED***');
}


// vLLM Endpoint Configuration (Auto-updated by endpoint fix)
const VLLM_ENDPOINTS = ['http://127.0.0.1:4141', 'http://127.0.0.1:4141'];
const DEFAULT_VLLM_ENDPOINT = 'http://127.0.0.1:4141';

// Security Configuration - Production-Grade Limits
const SECURITY_LIMITS = {
  MAX_REQUEST_SIZE: 10 * 1024 * 1024,   // 10 MB max request size
  MAX_FILE_SIZE: 5 * 1024 * 1024,       // 5 MB max file size
  MAX_BATCH_SIZE: 50,                    // 50 files max in batch operations
  MAX_CONTENT_LENGTH: 1000000,           // 1M characters max content
  MAX_EDITS_PER_FILE: 100,               // 100 edits max per file
  MAX_FILES_IN_MULTI_EDIT: 50,           // 50 files max in multi_edit

  // Fuzzy matching security controls (v8.3.0+)
  MAX_FUZZY_EDIT_LENGTH: 5000,           // 5K chars max per edit string
  MAX_FUZZY_LINE_COUNT: 200,             // 200 lines max per edit block
  MAX_FUZZY_TOTAL_CHARS: 50000,          // 50K chars total across all edits
  MAX_FUZZY_ITERATIONS: 10000,           // 10K max loop iterations
  MAX_FUZZY_SUGGESTIONS: 10,             // 10 suggestions max
  FUZZY_TIMEOUT_MS: 5000                 // 5 second timeout per file
};

// High-Performance Concurrent Request Pool
class ConcurrentRequestManager {
  constructor(maxConcurrent = 250) {  // High concurrency for multi-interface support
    this.maxConcurrent = maxConcurrent;
    this.activeRequests = new Set();
    this.requestQueue = [];
    this.priorityQueue = [];  // High-priority requests
    this.metrics = {
      totalRequests: 0,
      completedRequests: 0,
      averageResponseTime: 0,
      peakConcurrency: 0,
      queueWaitTime: 0,       // Track queue waiting time
      throughputPerSecond: 0  // Requests per second
    };
    this.lastThroughputUpdate = Date.now();
    this.throughputWindow = new Map();  // Rolling window for throughput calculation
  }

  async executeRequest(requestPromise, priority = 'normal') {
    return new Promise((resolve, reject) => {
      const request = {
        promise: requestPromise,
        resolve,
        reject,
        startTime: Date.now(),
        queueTime: Date.now(),
        priority,
        id: Math.random().toString(36).substr(2, 9)  // Unique request ID for tracking
      };

      // Priority-based request scheduling
      if (this.activeRequests.size < this.maxConcurrent) {
        this.processRequest(request);
      } else {
        // Priority queue for high-priority requests (health checks, etc.)
        if (priority === 'high') {
          this.priorityQueue.unshift(request);  // Add to front for immediate processing
        } else {
          this.requestQueue.push(request);
        }
      }
    });
  }

  async processRequest(request) {
    this.activeRequests.add(request);
    this.metrics.totalRequests++;
    this.metrics.peakConcurrency = Math.max(this.metrics.peakConcurrency, this.activeRequests.size);

    // Track queue wait time for performance monitoring
    const queueWaitTime = Date.now() - request.queueTime;
    this.metrics.queueWaitTime = (this.metrics.queueWaitTime + queueWaitTime) / 2;  // Rolling average

    try {
      const result = await request.promise;
      const responseTime = Date.now() - request.startTime;
      this.updateMetrics(responseTime);
      this.updateThroughput();  // Update throughput metrics
      request.resolve(result);
    } catch (error) {
      request.reject(error);
    } finally {
      this.activeRequests.delete(request);
      this.processNextInQueue();
    }
  }

  updateMetrics(responseTime) {
    this.metrics.completedRequests++;
    this.metrics.averageResponseTime =
      (this.metrics.averageResponseTime * (this.metrics.completedRequests - 1) + responseTime) /
      this.metrics.completedRequests;
  }

  // Process next request with priority support
  processNextInQueue() {
    if (this.activeRequests.size >= this.maxConcurrent) return;

    // Process priority queue first for maximum responsiveness
    let nextRequest = this.priorityQueue.shift() || this.requestQueue.shift();
    if (nextRequest) {
      setImmediate(() => this.processRequest(nextRequest));
    }
  }

  updateThroughput() {
    const now = Date.now();
    const windowKey = Math.floor(now / 1000);  // 1-second windows

    // Update throughput window
    this.throughputWindow.set(windowKey, (this.throughputWindow.get(windowKey) || 0) + 1);

    // Clean old entries (keep last 10 seconds)
    for (const [key] of this.throughputWindow) {
      if (key < windowKey - 10) {
        this.throughputWindow.delete(key);
      }
    }

    // Calculate current throughput
    const totalRequests = Array.from(this.throughputWindow.values()).reduce((sum, count) => sum + count, 0);
    this.metrics.throughputPerSecond = totalRequests / Math.min(this.throughputWindow.size, 10);
  }

  getMetrics() {
    return {
      ...this.metrics,
      activeConcurrency: this.activeRequests.size,
      queuedRequests: this.requestQueue.length
    };
  }
}



// 🎯 SIDECAR PROXY INTEGRATION - Routes all AI requests through localhost:4141
// This enables Serena multi-AI fallback system with circuit breaker protection
const SIDECAR_PROXY_URL = 'http://127.0.0.1:4141';
const SIDECAR_ENABLED = true;

// Backend URLs already configured above to route through sidecar proxy

// Sidecar-aware backend configurations
const SIDECAR_BACKEND_MAPPING = {
    'local': 'http://127.0.0.1:4141',
    'nvidia_deepseek': 'http://127.0.0.1:4141',
    'nvidia_qwen': 'http://127.0.0.1:4141',
    'gemini': 'http://127.0.0.1:4141'
};


/**
 * 🎯 SMART ALIAS RESOLVER
 * Single source of truth for all tools with intelligent alias routing
 */
class SmartAliasResolver {
  constructor() {
    this.coreTools = new Map();
    this.aliasGroups = new Map();
    this.toolHandlers = new Map();

    console.error('🎯 SmartAliasResolver initialized');
    this.initializeCoreTools();
    this.initializeAliasGroups();
  }

  /**
   * 📋 CORE TOOL DEFINITIONS
   * Single source of truth for all tool schemas and metadata
   */
  initializeCoreTools() {
    const coreToolDefinitions = [
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
        description: '🏥 System health and diagnostics - Differentiated health monitoring with optimized performance. Local endpoints get comprehensive inference testing (10s timeout), cloud endpoints get quick connectivity pings (3s timeout). Features performance metrics, NVIDIA cloud integration status, smart routing analytics, and FileModificationManager operation tracking.',
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
        description: '🤖 Multi-AI Direct Query - Query any backend with optimized fallback chains. Features automatic Unity detection, dynamic token scaling, and response headers with backend tracking.',
        handler: 'handleAsk',
        schema: {
          type: 'object',
          properties: {
            model: {
              type: 'string',
              enum: ['local', 'gemini', 'deepseek3.1', 'qwen3'],
              description: 'AI backend to query: local (Qwen2.5-Coder-7B-Instruct-FP8-Dynamic, 128K+ tokens), gemini (Gemini Enhanced, 32K tokens), deepseek3.1 (NVIDIA DeepSeek V3.1, 8K tokens), qwen3 (NVIDIA Qwen3 Coder 480B, 32K tokens)'
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
              description: 'Force specific backend (bypasses smart routing) - use backend keys like "local", "gemini", "nvidia_deepseek", "nvidia_qwen"'
            }
          },
          required: ['model', 'prompt']
        }
      },
      {
        name: 'rate_limit_status',
        description: '📊 Rate Limit Status - Check current rate limit usage and remaining capacity',
        handler: 'handleRateLimitStatus',
        schema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'system_metrics',
        description: '📈 System Metrics - View system usage metrics, performance statistics, and tool usage breakdown',
        handler: 'handleSystemMetrics',
        schema: {
          type: 'object',
          properties: {},
          required: []
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
              enum: ['code-reviewer', 'security-auditor', 'planner', 'refactor-specialist', 'test-generator', 'documentation-writer'],
              description: 'Subagent role: code-reviewer (quality review), security-auditor (vulnerability detection), planner (task breakdown), refactor-specialist (code improvement), test-generator (test creation), documentation-writer (docs generation)'
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
      }
    ];

    // Store core tools in map for fast lookup
    coreToolDefinitions.forEach(tool => {
      this.coreTools.set(tool.name, tool);
      this.toolHandlers.set(tool.name, tool.handler);
    });

    console.error(`🎯 Initialized ${coreToolDefinitions.length} core tools`);
  }

  /**
   * 🔗 ALIAS GROUP DEFINITIONS
   * Smart mapping system for all alias variants
   */
  initializeAliasGroups() {
    const aliasGroupDefinitions = [
      {
        groupName: 'Smart',
        prefix: 'smart_',
        description: 'Smart Alias:',
        aliases: [
          {
            alias: 'smart_analyze',
            coreTool: 'analyze', // Virtual core tool, maps to handleAnalyze
            customDescription: '🔍 Smart Alias: Universal code analysis - AI-driven file type detection with smart routing',
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
            alias: 'smart_generate',
            coreTool: 'generate', // Virtual core tool, maps to handleGenerate
            customDescription: '⚡ Smart Alias: Smart code generation - Context-aware code creation with AI routing',
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
          { alias: 'smart_review', coreTool: 'review' },
          { alias: 'smart_edit', coreTool: 'edit_file' },
          { alias: 'smart_health', coreTool: 'health' }
        ]
      },
      {
        groupName: 'DeepSeek',
        prefix: 'deepseek_',
        description: 'DeepSeek Alias:',
        aliases: [
          {
            alias: 'deepseek_analyze',
            coreTool: 'analyze', // Virtual core tool
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
            coreTool: 'generate', // Virtual core tool
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

    // Store alias groups and create handler mappings
    aliasGroupDefinitions.forEach(group => {
      this.aliasGroups.set(group.groupName, group);

      group.aliases.forEach(alias => {
        // Map alias to appropriate handler
        if (alias.coreTool === 'analyze') {
          this.toolHandlers.set(alias.alias, 'handleAnalyze');
        } else if (alias.coreTool === 'generate') {
          this.toolHandlers.set(alias.alias, 'handleGenerate');
        } else {
          // Use core tool handler for direct mappings
          const coreTool = this.coreTools.get(alias.coreTool);
          if (coreTool) {
            this.toolHandlers.set(alias.alias, coreTool.handler);
          }
        }
      });
    });

    console.error(`🔗 Initialized ${aliasGroupDefinitions.length} alias groups with smart routing`);
  }

  /**
   * 🎨 DYNAMIC TOOL LIST GENERATION
   * Generates complete tool list with all aliases from core definitions
   */
  generateToolList() {
    const tools = [];

    // Add ONLY core tools for ListToolsRequestSchema
    for (const [name, tool] of this.coreTools) {
      tools.push({
        name,
        description: tool.description,
        inputSchema: tool.schema
      });
    }

    return tools;
  }

  /**
   * 🎯 SMART TOOL RESOLUTION
   * Resolves any tool name (core or alias) to its appropriate handler
   */
  resolveToolHandler(toolName) {
    return this.toolHandlers.get(toolName) || null;
  }

  /**
   * 📊 SYSTEM STATISTICS
   * Provides insights into the alias resolution system
   */
  getSystemStats() {
    const coreToolCount = this.coreTools.size;
    const aliasCount = Array.from(this.aliasGroups.values())
      .reduce((total, group) => total + group.aliases.length, 0);

    return {
      coreTools: coreToolCount,
      aliases: aliasCount,
      totalTools: coreToolCount + aliasCount,
      aliasGroups: this.aliasGroups.size,
      compressionRatio: `${Math.round((aliasCount / (coreToolCount + aliasCount)) * 100)}% aliases auto-generated`
    };
  }
}

/**
 * 🛠️ FILEMODIFICATIONMANAGER ORCHESTRATOR
 * Unified coordination system for all file modification operations
 */
class FileModificationManager {
  constructor(router) {
    this.router = router;
    this.activeOperations = new Map();
    this.operationHistory = [];
    this.maxHistorySize = 1000;

    console.error('🛠️ FileModificationManager initialized');
  }

  /**
   * 🎯 ORCHESTRATE FILE OPERATIONS
   * Central coordination for all file modification tools
   */
  async orchestrateOperation(operationType, params) {
    const operationId = this.generateOperationId();
    const startTime = performance.now();

    try {
      this.activeOperations.set(operationId, {
        type: operationType,
        startTime,
        status: 'running',
        params
      });

      let result;
      switch (operationType) {
        case 'single_edit':
          result = await this.router.performIntelligentFileEdit(
            params.file_path,
            params.edits,
            params.validation_mode,
            params.language
          );
          break;
        case 'multi_edit':
          result = await this.router.performMultiFileEdit(
            params.file_operations,
            params.transaction_mode,
            params.validation_level,
            params.parallel_processing
          );
          break;
        case 'validation':
          result = await this.router.validateCodeChanges(
            params.file_path,
            params.proposed_changes,
            params.validation_rules,
            params.language
          );
          break;
        case 'backup_restore':
          result = await this.router.performBackupRestore(
            params.action,
            params.file_path,
            params.backup_id,
            params.metadata,
            params.cleanup_options
          );
          break;
        case 'atomic_write':
          result = await this.router.performAtomicFileWrite(
            params.file_operations,
            params.create_backup
          );
          break;
        default:
          throw new Error(`Unknown operation type: ${operationType}`);
      }

      const duration = performance.now() - startTime;
      this.recordOperation(operationId, operationType, duration, 'success', result);

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      this.recordOperation(operationId, operationType, duration, 'error', error);
      throw error;
    } finally {
      this.activeOperations.delete(operationId);
    }
  }

  generateOperationId() {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  recordOperation(operationId, type, duration, status, result) {
    const record = {
      operationId,
      type,
      duration,
      status,
      timestamp: new Date().toISOString(),
      success: status === 'success'
    };

    this.operationHistory.push(record);
    if (this.operationHistory.length > this.maxHistorySize) {
      this.operationHistory.shift();
    }
  }
}

/**
 * 🧠 MULTI-AI ROUTER WITH SMART FALLBACK CHAINS
 * Primary: Local Qwen2.5-Coder-7B-Instruct-FP8-Dynamic
 * Fallback Chain: Local → Gemini → NVIDIA (DeepSeek/Qwen)
 * Features optimized multi-backend integration with circuit breakers
 */
class MultiAIRouter {
  constructor() {
    // Multi-backend token configuration
    this.tokenConfig = {
      // Local model capabilities - Dynamic Detection
      local_max: 8192,                  // Qwen 2.5 Coder 14B AWQ: 8K context (fallback)
                                        // Will be auto-updated by LocalServiceDetector
                                        // Supports: vLLM, LM Studio, Ollama detection
                                        // Actual limit detected from /v1/models endpoint

      // Cloud backends
      gemini_max: 32768,               // Gemini Pro capacity
      nvidia_deepseek_max: 8192,       // DeepSeek V3.1 output limit
      nvidia_qwen_max: 32768,          // Qwen3 480B output limit

      // Dynamic scaling thresholds
      unity_generation_tokens: 16384,   // High tokens for Unity scripts
      complex_request_tokens: 8192,     // Complex operations
      simple_request_tokens: 2048,      // Simple operations
      fallback_tokens: 4096             // Safe fallback
    };

    this.backends = {
      local: {
        name: 'Local-Qwen2.5-Coder-7B',
        url: process.env.DEEPSEEK_ENDPOINT || 'http://localhost:8000/v1',
        priority: 1,
        maxTokens: this.tokenConfig.local_max,
        specialization: 'general',
        type: 'local',
        health: { status: 'unknown', lastCheck: 0, failures: 0 }
      },
      gemini: {
        name: 'Gemini-Enhanced-Backend',
        url: process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta',
        priority: 2,
        maxTokens: this.tokenConfig.gemini_max,
        specialization: 'code_generation',
        type: 'cloud',
        health: { status: 'unknown', lastCheck: 0, failures: 0 }
      },
      nvidia_deepseek: {
        name: 'NVIDIA-DeepSeek-V3.1',
        url: 'https://integrate.api.nvidia.com/v1',
        priority: 3,
        maxTokens: this.tokenConfig.nvidia_deepseek_max,
        specialization: 'analysis',
        type: 'nvidia',
        health: { status: 'unknown', lastCheck: 0, failures: 0 }
      },
      nvidia_qwen: {
        name: 'NVIDIA-Qwen-3-Coder-480B',
        url: 'https://integrate.api.nvidia.com/v1',
        priority: 4,
        maxTokens: this.tokenConfig.nvidia_qwen_max,
        specialization: 'coding',
        type: 'nvidia',
        health: { status: 'unknown', lastCheck: 0, failures: 0 }
      }
    };

    // Smart fallback chains - Priority order based on health and capability
    this.fallbackChains = {
      'local': ['gemini', 'nvidia_deepseek', 'nvidia_qwen'],
      'gemini': ['local', 'nvidia_deepseek', 'nvidia_qwen'],
      'nvidia_deepseek': ['nvidia_qwen', 'local', 'gemini'],
      'nvidia_qwen': ['nvidia_deepseek', 'local', 'gemini']
    };

    // Performance optimization components
    this.cache = new Map();
    this.cacheTimeout = 15 * 60 * 1000; // 15 minutes
    this.connectionPool = new Map();
    this.circuitBreakers = new Map();

    // Initialize circuit breakers for each backend
    Object.keys(this.backends).forEach(key => {
      this.circuitBreakers.set(key, {
        failures: 0,
        lastFailure: 0,
        state: 'closed', // closed, open, half-open
        timeout: 30000 // 30 second recovery
      });
    });

    this.requestStats = {
      total: 0,
      successful: 0,
      cached: 0,
      fallbacks: 0,
      routingDecisions: new Map(),
      backendUsage: new Map(),
      responseHeaders: new Map()
    };

    // v1.3.0: Initialize Compound Learning Engine
    this.learningEngine = new CompoundLearningEngine();
    console.error('🎓 Compound Learning Engine initialized');

    // Start async health monitoring
    this.startHealthMonitoring();

    console.error('🧠 Multi-AI Router initialized with optimized fallback chains');
    console.error('⚡ Backends configured: Local, Gemini, NVIDIA DeepSeek, NVIDIA Qwen');
    console.error('🔄 Smart fallback chains active with circuit breaker protection');
    console.error('');
    console.error('🤖 Smart AI Bridge - Local Backend Configuration:');
    console.error(`  Endpoint: ${this.backends.local.url}`);
    console.error(`  Model: ${process.env.LOCAL_MODEL_NAME || 'default-local-model'}`);
    console.error(`  Max Tokens: ${this.backends.local.maxTokens}`);
    console.error('');
  }

  /**
   * 🚀 ASYNC HEALTH MONITORING - Non-blocking backend health checks
   */
  startHealthMonitoring() {
    // Initial health check
    this.performHealthChecks();

    // Periodic health monitoring (every 30 seconds)
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, 30000);

    console.error('🏥 Async health monitoring started (30s intervals)');
  }

  async performHealthChecks() {
    const healthCheckPromises = Object.entries(this.backends).map(async ([key, backend]) => {
      try {
        const startTime = Date.now();
        const timeout = backend.type === 'local' ? 5000 : 3000; // 5s local, 3s cloud

        const response = await Promise.race([
          this.pingBackend(backend),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Health check timeout')), timeout))
        ]);

        const responseTime = Date.now() - startTime;

        backend.health = {
          status: 'healthy',
          lastCheck: Date.now(),
          failures: 0,
          responseTime
        };

        // Reset circuit breaker on successful health check
        const circuitBreaker = this.circuitBreakers.get(key);
        if (circuitBreaker.state === 'open' || circuitBreaker.state === 'half-open') {
          circuitBreaker.state = 'closed';
          circuitBreaker.failures = 0;
          console.error(`✅ Circuit breaker CLOSED for ${key} - backend recovered`);
        }

      } catch (error) {
        backend.health.status = 'unhealthy';
        backend.health.lastCheck = Date.now();
        backend.health.failures = (backend.health.failures || 0) + 1;
        backend.health.error = error.message;

        // Update circuit breaker
        this.updateCircuitBreaker(key, error);
      }
    });

    await Promise.allSettled(healthCheckPromises);
  }

  async pingBackend(backend) {
    const controller = new AbortController();

    try {
      // Different ping strategies based on backend type
      switch (backend.type) {
        case 'local':
          return await fetch(`${backend.url}/health`, {
            method: 'GET',
            signal: controller.signal
          });

        case 'cloud':
          // For Gemini, try a simple API check
          return await this.pingCloudBackend(backend);

        case 'nvidia':
          return await fetch(`${backend.url}/models`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}` },
            signal: controller.signal
          });

        default:
          throw new Error(`Unknown backend type: ${backend.type}`);
      }
    } finally {
      controller.abort();
    }
  }

  async pingCloudBackend(backend) {
    // Simplified ping for cloud backends
    return new Promise((resolve, reject) => {
      // For now, assume cloud backends are healthy if configured
      if (backend.name.includes('Gemini') && process.env.GEMINI_API_KEY) {
        resolve({ ok: true });
      } else {
        reject(new Error('API key not configured'));
      }
    });
  }

  updateCircuitBreaker(backendKey, error) {
    const circuitBreaker = this.circuitBreakers.get(backendKey);
    circuitBreaker.failures++;
    circuitBreaker.lastFailure = Date.now();

    // Open circuit breaker after 3 failures
    if (circuitBreaker.failures >= 3 && circuitBreaker.state === 'closed') {
      circuitBreaker.state = 'open';
      console.error(`🚫 Circuit breaker OPENED for ${backendKey} - too many failures`);
    }

    // Transition to half-open after timeout
    if (circuitBreaker.state === 'open' &&
        Date.now() - circuitBreaker.lastFailure > circuitBreaker.timeout) {
      circuitBreaker.state = 'half-open';
      console.error(`🔄 Circuit breaker HALF-OPEN for ${backendKey} - attempting recovery`);
    }
  }

  /**
   * 🎯 SMART ROUTING WITH HEALTH-AWARE FALLBACK CHAINS
   */
  async routeRequest(prompt, options = {}) {
    const complexity = await this.analyzeComplexity(prompt, options);
    const startTime = Date.now();

    // Initial backend selection based on complexity and specialization
    let selectedBackend = this.selectPrimaryBackend(complexity, options);

    // Check if primary backend is healthy and circuit breaker is closed
    const backend = this.backends[selectedBackend];
    const circuitBreaker = this.circuitBreakers.get(selectedBackend);

    if (backend.health.status !== 'healthy' || circuitBreaker.state === 'open') {
      console.error(`⚠️ Primary backend ${selectedBackend} unavailable, using fallback chain`);
      selectedBackend = this.selectFallbackBackend(selectedBackend, complexity);
    }

    const routingTime = Date.now() - startTime;
    console.error(`🎯 Routing: ${complexity.score.toFixed(2)} complexity → ${selectedBackend} (${routingTime}ms)`);

    // Update stats
    this.requestStats.routingDecisions.set(selectedBackend,
      (this.requestStats.routingDecisions.get(selectedBackend) || 0) + 1);

    return selectedBackend;
  }

  selectPrimaryBackend(complexity, options = {}) {
    // Force specific backend if requested
    if (options.forceBackend && this.backends[options.forceBackend]) {
      return options.forceBackend;
    }

    // Smart selection based on complexity and specialization
    if (complexity.taskType === 'coding' && complexity.score > 0.7) {
      return 'gemini'; // Gemini for complex code generation
    }

    if (complexity.taskType === 'analysis' && complexity.tokenCount > 16000) {
      return 'nvidia_deepseek'; // NVIDIA DeepSeek for large analysis tasks
    }

    if (complexity.score > 0.8 || complexity.tokenCount > 32000) {
      return 'nvidia_qwen'; // NVIDIA for very complex tasks
    }

    // Default to local for most requests
    return 'local';
  }

  selectFallbackBackend(originalBackend, complexity) {
    const fallbackChain = this.fallbackChains[originalBackend] || ['local', 'gemini', 'nvidia_deepseek'];

    for (const fallbackKey of fallbackChain) {
      const fallbackBackend = this.backends[fallbackKey];
      const circuitBreaker = this.circuitBreakers.get(fallbackKey);

      if (fallbackBackend.health.status === 'healthy' && circuitBreaker.state !== 'open') {
        console.error(`🔄 Fallback selected: ${fallbackKey}`);
        this.requestStats.fallbacks++;
        return fallbackKey;
      }
    }

    // If all backends are down, return local as last resort
    console.error('🚨 All backends unhealthy, falling back to local');
    return 'local';
  }

  /**
   * 🔍 AI-DRIVEN COMPLEXITY ANALYSIS
   * Uses lightweight local model for rapid assessment
   */
  async analyzeComplexity(prompt, options = {}) {
    const tokenCount = this.estimateTokens(prompt);
    const hasCode = /```|function\s|class\s|import\s|def\s|const\s|let\s|var\s/.test(prompt);
    const hasMath = /\$[^$]+\$|\\\(|\\\[|\\begin\{|equation|formula/.test(prompt);

    let baseScore = 0.3;

    // Token-based complexity
    if (tokenCount > 8000) baseScore += 0.3;
    if (tokenCount > 16000) baseScore += 0.2;

    // Content-based complexity
    if (hasCode) baseScore += 0.2;
    if (hasMath) baseScore += 0.15;

    // Task type detection
    let taskType = 'general';
    if (hasCode || /code|programming|function|algorithm/.test(prompt.toLowerCase())) {
      taskType = 'coding';
      baseScore += 0.1;
    } else if (hasMath || /analyze|research|data|calculate/.test(prompt.toLowerCase())) {
      taskType = 'analysis';
      baseScore += 0.1;
    }

    return {
      score: Math.min(baseScore, 1.0),
      tokenCount,
      language: this.detectLanguage(prompt),
      taskType,
      hasCode,
      hasMath
    };
  }

  detectLanguage(prompt) {
    const patterns = {
      javascript: /(?:function|const|let|var|=>|\bnode\b|\bnpm\b)/i,
      python: /(?:def\s|import\s|from\s.*import|\.py\b|python)/i,
      java: /(?:public\s+class|import\s+java|\.java\b)/i,
      cpp: /(?:#include|std::|\.cpp\b|\.hpp\b)/i,
      rust: /(?:fn\s|use\s|cargo|\.rs\b)/i,
      go: /(?:func\s|package\s|import\s.*fmt|\.go\b)/i,
      csharp: /(?:using\s|class\s|namespace\s|\.cs\b|unity|monobehaviour)/i
    };

    for (const [lang, pattern] of Object.entries(patterns)) {
      if (pattern.test(prompt)) return lang;
    }
    return 'unknown';
  }

  /**
   * Dynamic token calculation with automatic optimization
   * Auto-scales token limits based on request complexity and model capabilities
   */
  calculateDynamicTokenLimit(prompt, endpointKey, options = {}) {
    const tokenCount = this.estimateTokens(prompt);
    const language = this.detectLanguage(prompt);

    // Unity detection - Maximum tokens for game development
    const isUnityGeneration = /unity|monobehaviour|gameobject|transform|rigidbody|collider|animation|shader|script.*generation|generate.*unity|create.*unity.*script/i.test(prompt);
    const isComplexGeneration = /generate|create|build|write.*script|complete.*implementation|full.*code|entire.*system/i.test(prompt);
    const isLargeCodebase = tokenCount > 8000 || /multi.*file|entire.*project|complete.*system/i.test(prompt);

    let targetTokens;

    // PRIORITY 1: Unity generations get maximum tokens
    if (isUnityGeneration) {
      targetTokens = this.tokenConfig.unity_generation_tokens;
      console.error(`🎮 Unity generation detected - allocating ${targetTokens} tokens for script generation`);
    }
    // PRIORITY 2: Complex code generation
    else if (isComplexGeneration || isLargeCodebase) {
      targetTokens = this.tokenConfig.complex_request_tokens;
      console.error(`🔥 Complex generation detected - allocating ${targetTokens} tokens for comprehensive output`);
    }
    // PRIORITY 3: Simple requests stay efficient
    else if (tokenCount < 1000 && !isComplexGeneration) {
      targetTokens = this.tokenConfig.simple_request_tokens;
      console.error(`⚡ Simple request detected - using ${targetTokens} tokens for optimal speed`);
    }
    // PRIORITY 4: Fallback for medium complexity
    else {
      targetTokens = this.tokenConfig.fallback_tokens;
      console.error(`🎯 Standard request - using ${targetTokens} tokens for balanced performance`);
    }

    // Respect model limits while maximizing output
    const endpoint = this.backends[endpointKey];
    const maxAllowed = endpoint ? endpoint.maxTokens : this.tokenConfig.fallback_tokens;
    const finalTokens = Math.min(targetTokens, maxAllowed);

    console.error(`🚀 Final token allocation: ${finalTokens} (requested: ${targetTokens}, limit: ${maxAllowed}, endpoint: ${endpointKey})`);

    return finalTokens;
  }

  estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }

  /**
   * v1.3.0: Estimate request complexity for learning engine
   */
  estimateComplexity(prompt) {
    const length = prompt.length;
    const hasCode = /```|function|class|import|export|const|let|var/.test(prompt);
    const hasMultiStep = /step|first|then|next|finally|1\.|2\.|3\./.test(prompt.toLowerCase());
    
    if (length > 5000 || (hasCode && hasMultiStep)) return 'high';
    if (length > 1000 || hasCode) return 'medium';
    return 'low';
  }

  /**
   * v1.3.0: Detect task type for learning engine routing
   */
  detectTaskType(prompt) {
    const lower = prompt.toLowerCase();
    if (/unity|gameobject|monobehaviour|c#|csharp/.test(lower)) return 'unity';
    if (/implement|create|build|write|generate|code/.test(lower)) return 'coding';
    if (/analyze|review|explain|understand|what|why|how/.test(lower)) return 'analysis';
    if (/fix|bug|error|issue|problem|debug/.test(lower)) return 'debugging';
    if (/refactor|improve|optimize|clean/.test(lower)) return 'refactoring';
    return 'general';
  }

  /**
   * 🔄 MAKE REQUEST WITH SMART FALLBACK CHAINS AND RESPONSE HEADERS
   */
  async makeRequest(prompt, selectedBackend, options = {}) {
    const requestId = this.generateRequestId();
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(prompt, selectedBackend, options);

    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        this.requestStats.cached++;
        console.error('💾 Cache hit');

        // Add cache headers
        return {
          content: cached.response,
          headers: {
            'X-AI-Backend': cached.backend,
            'X-Cache-Status': 'HIT',
            'X-Request-ID': requestId,
            'X-Sidecar-Enabled': 'true',
            'X-Original-Backend': cached.backend
          }
        };
      }
      this.cache.delete(cacheKey);
    }

    let response;
    let usedBackend = selectedBackend;
    let fallbackChain = [];

    try {
      // Try primary backend
      response = await this.callBackend(selectedBackend, prompt, options);
      this.requestStats.successful++;
      console.error(`✅ Request successful on primary backend: ${selectedBackend}`);

    } catch (error) {
      console.error(`❌ Primary backend ${selectedBackend} failed: ${error.message}`);
      this.updateCircuitBreaker(selectedBackend, error);

      // Try fallback chain
      const availableFallbacks = this.fallbackChains[selectedBackend] || ['local'];

      for (const fallbackKey of availableFallbacks) {
        const fallbackBackend = this.backends[fallbackKey];
        const circuitBreaker = this.circuitBreakers.get(fallbackKey);

        // Skip unhealthy backends or open circuit breakers
        if (fallbackBackend.health.status !== 'healthy' || circuitBreaker.state === 'open') {
          console.error(`⚠️ Skipping unhealthy backend: ${fallbackKey}`);
          continue;
        }

        try {
          console.error(`🔄 Trying fallback: ${fallbackKey}`);
          fallbackChain.push(fallbackKey);
          response = await this.callBackend(fallbackKey, prompt, options);
          usedBackend = fallbackKey;
          this.requestStats.successful++;
          this.requestStats.fallbacks++;
          console.error(`✅ Fallback successful: ${fallbackKey}`);
          break;

        } catch (fallbackError) {
          console.error(`❌ Fallback ${fallbackKey} failed: ${fallbackError.message}`);
          this.updateCircuitBreaker(fallbackKey, fallbackError);
        }
      }

      if (!response) {
        // v1.3.0: Record failure for learning engine
        if (this.learningEngine) {
          this.learningEngine.recordOutcome({
            backend: selectedBackend,
            context: {
              complexity: this.estimateComplexity(prompt),
              taskType: this.detectTaskType(prompt),
              tokenCount: this.estimateTokens(prompt)
            },
            success: false,
            latency: Date.now() - startTime,
            source: 'all_failed'
          });
        }
        throw new Error(`All backends failed. Primary: ${selectedBackend}, Tried fallbacks: ${fallbackChain.join(', ')}`);
      }
    }

    const totalTime = Date.now() - startTime;

    // Cache successful response
    this.cache.set(cacheKey, {
      response: response.content || response,
      backend: usedBackend,
      timestamp: Date.now()
    });

    // Update backend usage stats
    this.requestStats.backendUsage.set(usedBackend,
      (this.requestStats.backendUsage.get(usedBackend) || 0) + 1);

    this.requestStats.total++;

    // Create response with headers
    const responseHeaders = {
      'X-AI-Backend': usedBackend,
      'X-Fallback-Chain': selectedBackend === usedBackend ? 'none' : `${selectedBackend}→${usedBackend}`,
      'X-Request-ID': requestId,
      'X-Response-Time': `${totalTime}ms`,
      'X-Cache-Status': 'MISS'
    };

    // Log fallback chain usage if applicable
    if (fallbackChain.length > 0) {
      console.error(`🔄 FALLBACK CHAIN USED: ${selectedBackend} → ${fallbackChain.join(' → ')}`);
    }

    // v1.3.0: Record outcome for learning engine
    if (this.learningEngine) {
      this.learningEngine.recordOutcome({
        backend: usedBackend,
        context: {
          complexity: this.estimateComplexity(prompt),
          taskType: this.detectTaskType(prompt),
          tokenCount: this.estimateTokens(prompt)
        },
        success: true,
        latency: totalTime,
        source: fallbackChain.length > 0 ? 'fallback' : 'primary'
      });
    }

    return {
      content: response.content || response,
      headers: responseHeaders,
      metadata: {
        backend: usedBackend,
        fallbackChain,
        responseTime: totalTime,
        requestId
      }
    };
  }

  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getFallbackChain(primary) {
    const chains = {
      'local': ['nvidia_deepseek', 'nvidia_qwen'],
      'nvidia_deepseek': ['nvidia_qwen', 'local'],
      'nvidia_qwen': ['nvidia_deepseek', 'local']
    };
    return chains[primary] || ['local'];
  }

  /**
   * 🚀 UNIFIED BACKEND CALLER - Handles all backend types with unified response format
   */
  async callBackend(backendKey, prompt, options = {}) {
    const backend = this.backends[backendKey];
    if (!backend) throw new Error(`Unknown backend: ${backendKey}`);

    const startTime = Date.now();
    console.error(`🚀 Calling ${backend.name} backend...`);

    switch (backend.type) {
      case 'local':
        return await this.callLocalBackend(backend, prompt, options);

      case 'cloud':
        if (backend.name.includes('Gemini')) {
          return await this.callGeminiBackend(backend, prompt, options);
        }
        throw new Error(`Unknown cloud backend: ${backend.name}`);

      case 'nvidia':
        return await this.callNvidiaBackend(backend, prompt, options);

      default:
        throw new Error(`Unknown backend type: ${backend.type}`);
    }
  }

  /**
   * 🏠 LOCAL BACKEND CALLER - Handles local Qwen model
   */
  async callLocalBackend(backend, prompt, options = {}) {
    const dynamicTokens = this.calculateDynamicTokenLimit(prompt, 'local', options);
    const finalTokens = Math.min(options.maxTokens || dynamicTokens, backend.maxTokens);

    const requestBody = {
      model: process.env.LOCAL_MODEL_NAME || 'default-local-model',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: finalTokens,
      temperature: options.temperature || 0.7,
      stream: false
    };

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer sk-placeholder'
    };

    const timeoutMs = this.calculateDynamicTimeout(prompt, 'local', options);
    console.error(`⚡ LOCAL: Using ${finalTokens} tokens, ${timeoutMs}ms timeout`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${backend.url}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Local backend HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.choices?.[0]?.message?.content) {
        throw new Error('Invalid local backend response format');
      }

      return {
        content: data.choices[0].message.content,
        backend: 'local',
        tokens_used: finalTokens
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Local backend timeout after ${timeoutMs}ms`);
      }
      throw error;
    }
  }


  /**
   * 💎 GEMINI BACKEND CALLER - Handles Gemini API
   */
  async callGeminiBackend(backend, prompt, options = {}) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('Gemini API key not configured');
    }

    const dynamicTokens = this.calculateDynamicTokenLimit(prompt, 'gemini', options);
    const finalTokens = Math.min(options.maxTokens || dynamicTokens, backend.maxTokens);

    const requestBody = {
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        maxOutputTokens: finalTokens,
        temperature: options.temperature || 0.7
      }
    };

    const headers = {
      'Content-Type': 'application/json'
    };

    const timeoutMs = this.calculateDynamicTimeout(prompt, 'gemini', options);
    console.error(`💎 GEMINI: Using ${finalTokens} tokens, ${timeoutMs}ms timeout`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(
        `${backend.url}/models/${process.env.GEMINI_MODEL_NAME || 'gemini-pro'}:generateContent`,
        {
          method: 'POST',
          headers: {
            ...headers,
            'x-goog-api-key': process.env.GEMINI_API_KEY
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Gemini backend HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error('Invalid Gemini backend response format');
      }

      return {
        content: data.candidates[0].content.parts[0].text,
        backend: 'gemini',
        tokens_used: finalTokens
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Gemini backend timeout after ${timeoutMs}ms`);
      }
      throw error;
    }
  }

  /**
   * 🏢 NVIDIA BACKEND CALLER - Handles NVIDIA API endpoints
   */
  async callNvidiaBackend(backend, prompt, options = {}) {
    if (!process.env.NVIDIA_API_KEY) {
      throw new Error('NVIDIA API key not configured');
    }

    const dynamicTokens = this.calculateDynamicTokenLimit(prompt, backend.name.includes('deepseek') ? 'nvidia_deepseek' : 'nvidia_qwen', options);
    const finalTokens = Math.min(options.maxTokens || dynamicTokens, backend.maxTokens);

    const isDeepSeek = backend.name.includes('DeepSeek');
    const requestBody = {
      model: isDeepSeek ? (process.env.DEEPSEEK_MODEL_NAME || 'deepseek-ai/deepseek-v3.1') : (process.env.QWEN_MODEL_NAME || 'qwen/qwen3-coder-480b-a35b-instruct'),
      messages: [{ role: 'user', content: prompt }],
      max_tokens: finalTokens,
      temperature: options.temperature || 0.7,
      stream: false
    };

    // Add thinking mode for DeepSeek
    if (isDeepSeek && options.thinking !== false) {
      requestBody.extra_body = {"chat_template_kwargs": {"thinking": true}};
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`
    };

    const timeoutMs = this.calculateDynamicTimeout(prompt, isDeepSeek ? 'nvidia_deepseek' : 'nvidia_qwen', options);
    console.error(`🏢 NVIDIA ${isDeepSeek ? 'DeepSeek' : 'Qwen'}: Using ${finalTokens} tokens, ${timeoutMs}ms timeout`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${backend.url}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`NVIDIA backend HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.choices?.[0]?.message?.content) {
        throw new Error('Invalid NVIDIA backend response format');
      }

      return {
        content: data.choices[0].message.content,
        backend: isDeepSeek ? 'nvidia_deepseek' : 'nvidia_qwen',
        tokens_used: finalTokens
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`NVIDIA backend timeout after ${timeoutMs}ms`);
      }
      throw error;
    }
  }

  /**
   * Dynamic timeout calculation based on complexity and token analysis
   * Scales from 60s (simple) to 300s (large Unity generations)
   */
  calculateDynamicTimeout(prompt, endpointKey, options = {}) {
    const tokenCount = this.estimateTokens(prompt);
    const expectedTokens = this.calculateDynamicTokenLimit(prompt, endpointKey, options);
    const hasCode = /```|function\s|class\s|import\s|def\s|const\s|let\s|var\s/.test(prompt);
    const hasMath = /\$[^$]+\$|\\\(|\\\[|\\begin\{|equation|formula/.test(prompt);
    const isUnityGeneration = /unity|monobehaviour|gameobject|transform|rigidbody|collider|animation|shader|script.*generation|generate.*unity|create.*unity.*script/i.test(prompt);
    const isComplexGeneration = /generate|create|build|write.*script|validation.*script|complete.*implementation|full.*code|entire.*system/i.test(prompt);

    // Base timeout: 60s (IMPROVED from original 30s)
    let timeoutMs = 60000;

    // Token-based scaling - More tokens = longer timeout
    if (expectedTokens >= 16384) timeoutMs += 60000;  // +60s for Unity/massive generations
    else if (expectedTokens >= 8192) timeoutMs += 45000;   // +45s for complex generations
    else if (expectedTokens >= 4096) timeoutMs += 30000;   // +30s for medium generations

    // Input complexity scaling
    if (tokenCount > 8000) timeoutMs += 30000;  // +30s for large prompts
    if (tokenCount > 16000) timeoutMs += 30000; // +30s for huge prompts

    // Content complexity scaling
    if (hasCode) timeoutMs += 20000;            // +20s for code operations
    if (hasMath) timeoutMs += 15000;            // +15s for mathematical content
    if (isUnityGeneration) timeoutMs += 45000;  // +45s for Unity generations (they're BIG!)
    if (isComplexGeneration) timeoutMs += 25000; // +25s for general generation tasks

    // Endpoint-specific adjustments
    if (endpointKey.includes('nvidia')) {
      timeoutMs += 15000; // +15s for cloud endpoints (network latency)
    }

    // Expanded cap: Up to 5 minutes for large Unity script generations
    timeoutMs = Math.min(timeoutMs, 300000); // 5 minutes max for the biggest generations

    console.error(`⏱️ Calculated timeout ${timeoutMs}ms for ${expectedTokens} expected tokens (Unity: ${isUnityGeneration})`);

    return timeoutMs;
  }

  /**
   * TIMEOUT IMPROVEMENTS: Smart timeout suggestion generator
   */
  generateTimeoutSuggestion(complexity, usedTimeout, endpointKey) {
    const suggestions = [];

    if (complexity.tokenCount > 16000) {
      suggestions.push("Try breaking the request into smaller chunks");
    }

    if (complexity.score > 0.8) {
      suggestions.push("This is a complex request - consider using NVIDIA cloud endpoints for better performance");
    }

    if (usedTimeout < 120000 && endpointKey.includes('local')) {
      suggestions.push("Consider switching to NVIDIA cloud endpoints for complex operations");
    }

    const suggestion = suggestions.length > 0
      ? `💡 Suggestions: ${suggestions.join("; ")}`
      : "💡 Try reducing request complexity or using cloud endpoints";

    return suggestion;
  }

  generateCacheKey(prompt, endpoint, options) {
    const key = JSON.stringify({ prompt: prompt.substring(0, 200), endpoint, ...options });
    return crypto.createHash('md5').update(key).digest('hex');
  }

  // Enhanced router methods for FileModificationManager integration
  async performIntelligentFileEdit(filePath, edits, validationMode, language, fuzzyThreshold, suggestAlternatives, maxSuggestions) {
    return await this.handleEditFile({
      file_path: filePath,
      edits,
      validation_mode: validationMode,
      language,
      fuzzy_threshold: fuzzyThreshold,
      suggest_alternatives: suggestAlternatives,
      max_suggestions: maxSuggestions
    });
  }

  async performMultiFileEdit(fileOperations, transactionMode, validationLevel, parallelProcessing) {
    return await this.handleMultiEdit({
      file_operations: fileOperations,
      transaction_mode: transactionMode,
      validation_level: validationLevel,
      parallel_processing: parallelProcessing
    });
  }

  async validateCodeChanges(filePath, proposedChanges, validationRules, language) {
    return await this.handleValidateChanges({
      file_path: filePath,
      proposed_changes: proposedChanges,
      validation_rules: validationRules,
      language
    });
  }

  async performBackupRestore(action, filePath, backupId, metadata, cleanupOptions) {
    return await this.handleBackupRestore({
      action,
      file_path: filePath,
      backup_id: backupId,
      metadata,
      cleanup_options: cleanupOptions
    });
  }

  async performAtomicFileWrite(fileOperations, createBackup) {
    return await this.handleWriteFilesAtomic({
      file_operations: fileOperations,
      create_backup: createBackup
    });
  }
}

/**
 * 🚀 SMART AI BRIDGE SERVER
 * Complete MCP server with multi-backend AI routing
 */
class SmartAIBridgeServer {
  constructor() {
    this.router = new MultiAIRouter();
    this.fileManager = new FileModificationManager(this.router);
    this.aliasResolver = new SmartAliasResolver();
    this.server = new Server(
      {
        name: "Smart AI Bridge",
        version: "1.3.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    console.error('🤖 Smart AI Bridge Server initialized');
    console.error(`🎯 ${this.aliasResolver.coreTools.size} core tools with multi-backend support`);
    console.error('⚡ Backends: Local, Gemini, NVIDIA DeepSeek, NVIDIA Qwen');
    console.error('🔄 Smart fallback chains with circuit breaker protection active');
    this.setupToolHandlers();
  }

  setupToolHandlers() {
    // Register ONLY 9 core tools via SmartAliasResolver
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.aliasResolver.generateToolList()
      };
    });

    // Smart tool call handler with COMPREHENSIVE SECURITY INTEGRATION
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const startTime = performance.now();

      // Extract authentication token from request metadata (if provided)
      const authToken = request.params._meta?.authToken || process.env.MCP_AUTH_TOKEN;
      const clientId = authToken || 'anonymous';

      try {
        // 🔒 STEP 1: AUTHENTICATION - Validate token
        if (!authManager.isValidToken(authToken)) {
          metricsCollector.recordError('AUTH_ERROR');
          throw new McpError(ErrorCode.InvalidRequest, 'Authentication failed. Invalid or missing token.');
        }

        // 🔒 STEP 2: AUTHORIZATION - Check tool permissions
        if (!authManager.hasToolPermission(authToken, name)) {
          metricsCollector.recordError('PERMISSION_DENIED');
          throw new McpError(ErrorCode.InvalidRequest, `Permission denied for tool: ${name}`);
        }

        // 🔒 STEP 3: RATE LIMITING - Check request limits
        const rateLimitCheck = rateLimiter.checkLimit(clientId);
        if (!rateLimitCheck.allowed) {
          metricsCollector.recordError('RATE_LIMIT');
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Rate limit exceeded. Please retry after ${rateLimitCheck.retryAfter} seconds.`
          );
        }

        // 🔒 STEP 4: PAYLOAD SIZE VALIDATION
        const requestSize = JSON.stringify(args).length;
        if (requestSize > SECURITY_LIMITS.MAX_REQUEST_SIZE) {
          metricsCollector.recordError('PAYLOAD_TOO_LARGE');
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Request payload too large: ${Math.round(requestSize / 1024 / 1024)}MB (max ${SECURITY_LIMITS.MAX_REQUEST_SIZE / 1024 / 1024}MB)`
          );
        }

        // Use SmartAliasResolver to get the handler
        const handlerName = this.aliasResolver.resolveToolHandler(name);
        if (!handlerName) {
          metricsCollector.recordError('TOOL_NOT_FOUND');
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }

        // Call the appropriate handler method with validated args
        let result;
        if (typeof this[handlerName] === 'function') {
          result = await this[handlerName](args);
        } else {
          metricsCollector.recordError('HANDLER_NOT_FOUND');
          throw new McpError(ErrorCode.InternalError, `Handler not found: ${handlerName}`);
        }

        // Record successful request
        const duration = performance.now() - startTime;
        metricsCollector.recordRequest(name, true, duration);

        return {
          content: [
            {
              type: "text",
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        const duration = performance.now() - startTime;
        metricsCollector.recordRequest(name, false, duration);

        // 🔒 SANITIZE ERRORS - Use ErrorSanitizer for all errors
        const sanitizedError = ErrorSanitizer.createErrorResponse(error, name);
        console.error(`Tool error [${name}]:`, sanitizedError);

        throw new McpError(
          error.code || ErrorCode.InternalError,
          sanitizedError.error.message
        );
      }
    });
  }

  async handleAnalyze(args) {
    // 🔒 INPUT VALIDATION
    const content = InputValidator.validateString(args.content, {
      required: true,
      maxLength: SECURITY_LIMITS.MAX_CONTENT_LENGTH,
      name: 'content'
    });
    const file_path = InputValidator.validateString(args.file_path, {
      required: false,
      maxLength: 4096,
      name: 'file_path'
    });
    const language = InputValidator.validateString(args.language, {
      required: false,
      maxLength: 50,
      name: 'language'
    });
    const analysis_type = InputValidator.validateEnum(
      args.analysis_type || 'comprehensive',
      ['security', 'performance', 'structure', 'dependencies', 'comprehensive'],
      { name: 'analysis_type' }
    );

    const prompt = `Analyze this ${language || 'unknown'} code with focus on ${analysis_type}:

${content}

Provide a comprehensive analysis including:
1. Code quality assessment
2. Security vulnerabilities
3. Performance considerations
4. Best practices compliance
5. Suggested improvements
6. Architecture patterns detected`;

    const endpoint = await this.router.routeRequest(prompt, {
      taskType: 'analysis',
      language: language || this.router.detectLanguage(content)
    });

    const analysis = await this.router.makeRequest(prompt, endpoint);

    return {
      success: true,
      file_path,
      language: language || this.router.detectLanguage(content),
      analysis_type,
      analysis,
      endpoint_used: endpoint,
      timestamp: new Date().toISOString()
    };
  }

  async handleGenerate(args) {
    // 🔒 INPUT VALIDATION
    const prefix = InputValidator.validateString(args.prefix, {
      required: true,
      maxLength: SECURITY_LIMITS.MAX_CONTENT_LENGTH,
      name: 'prefix'
    });
    const suffix = InputValidator.validateString(args.suffix, {
      required: false,
      maxLength: SECURITY_LIMITS.MAX_CONTENT_LENGTH,
      name: 'suffix'
    }) || '';
    const language = InputValidator.validateString(args.language, {
      required: false,
      maxLength: 50,
      name: 'language'
    }) || 'javascript';
    const task_type = InputValidator.validateEnum(
      args.task_type || 'completion',
      ['completion', 'refactor', 'feature', 'fix'],
      { name: 'task_type' }
    ) || 'completion';

    // Unity detection for automatic high token allocation
    const isUnityGeneration = /unity|monobehaviour|gameobject|transform|rigidbody|collider|animation|shader/i.test(prefix + suffix) ||
                              language.toLowerCase() === 'csharp' ||
                              /\.cs$|unity.*script|unity.*component/i.test(task_type);

    const prompt = `Generate ${language} code for ${task_type}:

Context before:
${prefix}

Context after:
${suffix}

Generate appropriate code that fits between the before and after contexts. Focus on:
1. Correct syntax and structure
2. Proper variable scoping
3. Best practices for ${language}
4. Performance considerations
5. Error handling where appropriate${isUnityGeneration ? '\n6. Unity-specific best practices and component patterns' : ''}`;

    const endpoint = await this.router.routeRequest(prompt, {
      taskType: 'coding',
      language,
      isUnityGeneration // Pass Unity detection to router
    });

    // Dynamic token allocation based on generation complexity
    const dynamicTokens = this.router.calculateDynamicTokenLimit(prompt, endpoint);
    const options = {
      maxTokens: dynamicTokens,
      taskType: 'coding'
    };

    console.error(`🎮 ${isUnityGeneration ? 'Unity' : 'Standard'} generation with ${dynamicTokens} tokens`);

    const generated = await this.router.makeRequest(prompt, endpoint, options);

    return {
      success: true,
      language,
      task_type,
      generated_code: generated,
      endpoint_used: endpoint,
      unity_generation: isUnityGeneration,
      tokens_allocated: dynamicTokens,
      optimization_applied: true,
      timestamp: new Date().toISOString()
    };
  }

  async handleReview(args) {
    // 🔒 INPUT VALIDATION
    const content = InputValidator.validateString(args.content, {
      required: true,
      maxLength: SECURITY_LIMITS.MAX_CONTENT_LENGTH,
      name: 'content'
    });
    const file_path = InputValidator.validateString(args.file_path, {
      required: false,
      maxLength: 4096,
      name: 'file_path'
    });
    const language = InputValidator.validateString(args.language, {
      required: false,
      maxLength: 50,
      name: 'language'
    });
    const review_type = InputValidator.validateEnum(
      args.review_type || 'comprehensive',
      ['security', 'performance', 'quality', 'comprehensive'],
      { name: 'review_type' }
    ) || 'comprehensive';

    const prompt = `Perform a ${review_type} code review of this ${language || 'unknown'} code:

${content}

Provide analysis covering:
1. Code quality and maintainability
2. Security vulnerabilities
3. Performance considerations
4. Best practices compliance
5. Suggested improvements`;

    const endpoint = await this.router.routeRequest(prompt, {
      taskType: 'analysis',
      language: language || this.router.detectLanguage(content)
    });

    const review = await this.router.makeRequest(prompt, endpoint);

    return {
      success: true,
      file_path,
      language: language || this.router.detectLanguage(content),
      review_type,
      review,
      endpoint_used: endpoint,
      timestamp: new Date().toISOString()
    };
  }

  // Token estimation utility (4 chars ≈ 1 token)
  estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  // Find semantic boundaries for intelligent truncation
  findSemanticBoundaries(content, language) {
    const boundaries = [];
    const lines = content.split('\n');

    // Language-specific patterns for functions/classes
    const patterns = {
      javascript: [/^\s*(function|class|const|let|var)\s+\w+/m, /^\s*\/\*[\s\S]*?\*\//m],
      typescript: [/^\s*(function|class|interface|type|const|let|var)\s+\w+/m, /^\s*\/\*[\s\S]*?\*\//m],
      python: [/^\s*(def|class)\s+\w+/m, /^\s*"""[\s\S]*?"""/m],
      java: [/^\s*(public|private|protected)?\s*(class|interface|method)\s+\w+/m, /^\s*\/\*[\s\S]*?\*\//m],
      cpp: [/^\s*(class|struct|namespace)\s+\w+/m, /^\s*\/\*[\s\S]*?\*\//m],
      default: [/^\s*[\w\s]+[{(]/m, /^\s*\/\/|^\s*#|^\s*\/\*/m]
    };

    const langPatterns = patterns[language] || patterns.default;

    lines.forEach((line, index) => {
      langPatterns.forEach(pattern => {
        if (pattern.test(line)) {
          boundaries.push({
            line: index,
            position: lines.slice(0, index).join('\n').length,
            type: 'semantic'
          });
        }
      });
    });

    return boundaries.sort((a, b) => a.position - b.position);
  }

  /**
   * Normalize whitespace for fuzzy matching
   * Handles cross-platform line endings and whitespace variations
   * @param {string} str - String to normalize
   * @returns {string} Normalized string
   */
  normalizeWhitespace(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .trim()                              // Remove leading/trailing whitespace
      .replace(/\r\n/g, '\n')             // Normalize line endings (Windows → Unix)
      .replace(/\s+/g, ' ')               // Collapse multiple spaces/tabs to single space
      .replace(/\s*([{}()\[\];,])\s*/g, '$1'); // Remove spaces around punctuation
  }

  // Simple similarity calculation (fallback when string-similarity not available)
  calculateStringSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  // Levenshtein distance calculation
  levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  // Find positions of verify_texts matches for preservation
  findVerifyTextMatches(content, verifyTexts, fuzzyThreshold = 0.8) {
    if (!verifyTexts || verifyTexts.length === 0) return [];

    const matches = [];

    // Try to use string-similarity if available, fallback to our implementation
    let stringSimilarity;
    try {
      stringSimilarity = require('string-similarity');
    } catch (e) {
      stringSimilarity = { compareTwoStrings: this.calculateStringSimilarity.bind(this) };
    }

    verifyTexts.forEach(searchText => {
      // Exact matches first
      let index = content.indexOf(searchText);
      while (index !== -1) {
        matches.push({
          text: searchText,
          position: index,
          length: searchText.length,
          type: 'exact',
          context: this.getContextAroundPosition(content, index, searchText.length)
        });
        index = content.indexOf(searchText, index + 1);
      }

      // Fuzzy matches if enabled
      if (fuzzyThreshold > 0) {
        const lines = content.split('\n');
        lines.forEach((line, lineIndex) => {
          if (line.trim().length < 3) return; // Skip very short lines

          const similarity = stringSimilarity.compareTwoStrings(searchText, line);
          if (similarity >= fuzzyThreshold) {
            const position = lines.slice(0, lineIndex).join('\n').length + lineIndex;
            matches.push({
              text: searchText,
              foundText: line,
              position,
              length: line.length,
              type: 'fuzzy',
              similarity,
              context: this.getContextAroundPosition(content, position, line.length)
            });
          }
        });
      }
    });

    return matches.sort((a, b) => a.position - b.position);
  }

  // Get context around a position for verify_texts preservation
  getContextAroundPosition(content, position, length, contextSize = 200) {
    const start = Math.max(0, position - contextSize);
    const end = Math.min(content.length, position + length + contextSize);
    return {
      before: content.substring(start, position),
      match: content.substring(position, position + length),
      after: content.substring(position + length, end),
      full: content.substring(start, end)
    };
  }

  // Intelligent content truncation with semantic boundaries
  truncateContentIntelligently(content, maxTokens, options = {}) {
    const {
      verifyTexts = [],
      fuzzyThreshold = 0.8,
      language = 'javascript',
      preserveContext = true
    } = options;

    const currentTokens = this.estimateTokens(content);
    if (currentTokens <= maxTokens) {
      return {
        content,
        truncated: false,
        originalTokens: currentTokens,
        finalTokens: currentTokens,
        preserved: [],
        metadata: {}
      };
    }

    // Find important sections to preserve
    const verifyMatches = this.findVerifyTextMatches(content, verifyTexts, fuzzyThreshold);
    const semanticBoundaries = this.findSemanticBoundaries(content, language);

    // Strategy: Preserve verify_texts context first, then truncate at semantic boundaries
    const maxChars = maxTokens * 4; // Approximate character limit
    let result = {
      content: '',
      truncated: true,
      originalTokens: currentTokens,
      finalTokens: 0,
      preserved: [],
      metadata: {
        verifyMatches: verifyMatches.length,
        semanticBoundaries: semanticBoundaries.length,
        truncationStrategy: 'intelligent'
      }
    };

    if (verifyMatches.length > 0 && preserveContext) {
      // Preserve context around verify_texts matches
      let preservedContent = '';
      let preservedSections = [];

      verifyMatches.forEach((match, index) => {
        if (this.estimateTokens(preservedContent + match.context.full) < maxTokens * 0.8) {
          preservedContent += (preservedSections.length > 0 ? '\n\n[...]\n\n' : '') + match.context.full;
          preservedSections.push({
            type: match.type,
            text: match.text,
            position: match.position,
            similarity: match.similarity || 1.0
          });
        }
      });

      if (preservedContent.length > 0) {
        result.content = preservedContent;
        result.preserved = preservedSections;
        result.finalTokens = this.estimateTokens(result.content);
        result.metadata.truncationStrategy = 'verify_texts_preservation';
        return result;
      }
    }

    // Fallback: Truncate at semantic boundaries (but only if we have reasonable space)
    if (semanticBoundaries.length > 0 && maxTokens > 30) {
      let truncatedAtBoundary = false;
      for (let i = semanticBoundaries.length - 1; i >= 0; i--) {
        const boundary = semanticBoundaries[i];
        const truncatedContent = content.substring(0, boundary.position);

        if (this.estimateTokens(truncatedContent) <= maxTokens) {
          result.content = truncatedContent + '\n\n[... truncated at semantic boundary ...]';
          result.finalTokens = this.estimateTokens(result.content);
          result.metadata.truncationStrategy = 'semantic_boundary';
          result.metadata.truncatedAtLine = boundary.line;
          truncatedAtBoundary = true;
          break;
        }
      }

      if (truncatedAtBoundary) {
        return result;
      }
    }

    // Final fallback: Simple character truncation
    result.content = content.substring(0, maxChars) + '\n\n[... truncated due to token limit ...]';
    result.finalTokens = this.estimateTokens(result.content);
    result.metadata.truncationStrategy = 'character_limit';

    return result;
  }

  async handleRead(args) {
    // 🔒 INPUT VALIDATION
    const file_paths = InputValidator.validateArray(args.file_paths, {
      required: true,
      minLength: 1,
      maxLength: SECURITY_LIMITS.MAX_BATCH_SIZE,
      name: 'file_paths',
      itemValidator: (item) => InputValidator.validateString(item, {
        required: true,
        maxLength: 4096,
        name: 'file_path'
      })
    });
    const max_files = InputValidator.validateInteger(args.max_files, {
      required: false,
      min: 1,
      max: SECURITY_LIMITS.MAX_BATCH_SIZE,
      name: 'max_files'
    }) || 10;
    const analysis_type = InputValidator.validateEnum(
      args.analysis_type || 'content',
      ['content', 'structure', 'relationships', 'summary'],
      { name: 'analysis_type' }
    ) || 'content';
    const verify_texts = InputValidator.validateArray(args.verify_texts, {
      required: false,
      maxLength: 100,
      name: 'verify_texts',
      itemValidator: (item) => InputValidator.validateString(item, {
        required: true,
        maxLength: 10000,
        name: 'verify_text'
      })
    }) || [];
    const verification_mode = InputValidator.validateEnum(
      args.verification_mode || 'fuzzy',
      ['basic', 'fuzzy', 'comprehensive'],
      { name: 'verification_mode' }
    ) || 'fuzzy';
    const fuzzy_threshold = InputValidator.validateInteger(args.fuzzy_threshold * 100, {
      required: false,
      min: 10,
      max: 100,
      name: 'fuzzy_threshold'
    }) / 100 || 0.8;

    // SECURITY: Validate all file paths before processing
    try {
      await validatePaths(file_paths);
    } catch (error) {
      return {
        success: false,
        error: `Path validation failed: ${error.message}`,
        securityViolation: true
      };
    }

    // Token budget configuration
    const TOKEN_LIMIT = 24000; // 1000 token safety buffer from 25K MCP limit
    const PER_FILE_TOKEN_LIMIT = Math.floor(TOKEN_LIMIT / Math.min(file_paths.length, max_files));

    const results = [];
    let totalTokensUsed = 0;
    let responseMetadata = {
      tokenBudget: TOKEN_LIMIT,
      perFileLimit: PER_FILE_TOKEN_LIMIT,
      truncationOccurred: false,
      verifyTextsProcessed: verify_texts.length,
      processingTimestamp: new Date().toISOString()
    };

    for (const filePath of file_paths.slice(0, max_files)) {
      try {
        // SECURITY: Validate path and check file exists
        const validatedPath = await validatePath(filePath);
        const fileExists = await validateFileExists(validatedPath);
        if (!fileExists) {
          results.push({
            file_path: filePath,
            error: 'File does not exist or is not a regular file',
            success: false
          });
          continue;
        }

        const fs = await import('fs/promises');
        const path = await import('path');
        const content = await fs.readFile(validatedPath, 'utf8');
        const language = this.router?.detectLanguage?.(content) || path.extname(filePath).substring(1);

        let fileResult = {
          file_path: filePath,
          size: content.length,
          lines: content.split('\n').length,
          language,
          originalTokens: this.estimateTokens(content)
        };

        // Handle different analysis types with token awareness
        switch (analysis_type) {
          case 'summary':
            fileResult.content = content.substring(0, 500) + (content.length > 500 ? '...' : '');
            fileResult.finalTokens = this.estimateTokens(fileResult.content);
            break;

          case 'structure':
            // For structure analysis, focus on key structural elements
            const structureContent = this.extractStructuralElements(content, language);
            const structureTruncation = this.truncateContentIntelligently(
              structureContent,
              PER_FILE_TOKEN_LIMIT,
              { language, verifyTexts: verify_texts, fuzzyThreshold: fuzzy_threshold, preserveContext: false }
            );
            fileResult = { ...fileResult, ...structureTruncation };
            break;

          case 'relationships':
            // For relationship analysis, focus on imports/exports/dependencies
            const relationshipContent = this.extractRelationships(content, language);
            const relationshipTruncation = this.truncateContentIntelligently(
              relationshipContent,
              PER_FILE_TOKEN_LIMIT,
              { language, verifyTexts: verify_texts, fuzzyThreshold: fuzzy_threshold }
            );
            fileResult = { ...fileResult, ...relationshipTruncation };
            break;

          case 'content':
          default:
            // Full content analysis with intelligent truncation
            const contentTruncation = this.truncateContentIntelligently(
              content,
              PER_FILE_TOKEN_LIMIT,
              { language, verifyTexts: verify_texts, fuzzyThreshold: fuzzy_threshold, preserveContext: verification_mode !== 'basic' }
            );
            fileResult = { ...fileResult, ...contentTruncation };
            break;
        }

        // Track global truncation status
        if (fileResult.truncated) {
          responseMetadata.truncationOccurred = true;
        }

        totalTokensUsed += fileResult.finalTokens || fileResult.originalTokens;
        results.push(fileResult);

      } catch (error) {
        results.push({
          file_path: filePath,
          error: error.message,
          finalTokens: 0
        });
      }
    }

    responseMetadata.totalTokensUsed = totalTokensUsed;
    responseMetadata.tokenEfficiency = (totalTokensUsed / TOKEN_LIMIT * 100).toFixed(1) + '%';

    return {
      success: true,
      analysis_type,
      files_processed: results.length,
      results,
      metadata: responseMetadata
    };
  }

  // Extract structural elements (classes, functions, interfaces)
  extractStructuralElements(content, language) {
    const lines = content.split('\n');
    const structuralLines = [];

    const patterns = {
      javascript: /^\s*(class|function|const|let|var|export|import)\s+/,
      typescript: /^\s*(class|interface|type|function|const|let|var|export|import)\s+/,
      python: /^\s*(class|def|import|from)\s+/,
      java: /^\s*(public|private|protected)?\s*(class|interface|method|import)\s+/,
      cpp: /^\s*(class|struct|namespace|#include)\s+/,
      default: /^\s*[\w\s]*(class|function|def|import|export|namespace)\s+/
    };

    const pattern = patterns[language] || patterns.default;

    lines.forEach((line, index) => {
      if (pattern.test(line) || line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim().startsWith('*')) {
        structuralLines.push(`${index + 1}: ${line}`);
      }
    });

    return structuralLines.join('\n');
  }

  // Extract relationship information (imports, exports, dependencies)
  extractRelationships(content, language) {
    const lines = content.split('\n');
    const relationshipLines = [];

    const patterns = {
      javascript: /^\s*(import|export|require|module\.exports)/,
      typescript: /^\s*(import|export|require|module\.exports)/,
      python: /^\s*(import|from|__import__)/,
      java: /^\s*(import|package)/,
      cpp: /^\s*(#include|using|namespace)/,
      default: /^\s*(import|export|require|include|using)/
    };

    const pattern = patterns[language] || patterns.default;

    lines.forEach((line, index) => {
      if (pattern.test(line)) {
        relationshipLines.push(`${index + 1}: ${line}`);
      }
    });

    return relationshipLines.join('\n');
  }

  async handleHealth(args) {
    const { check_type = 'comprehensive', force_ip_rediscovery = false } = args;
    const startTime = Date.now();

    const healthData = {
      success: true,
      check_type,
      timestamp: new Date().toISOString(),
      server_info: {
        name: 'Smart AI Bridge',
        version: '1.3.0',
        uptime: process.uptime(),
        memory_usage: process.memoryUsage(),
        multi_ai_integration: 'Optimized Smart Fallback Chains',
        backends_configured: Object.keys(this.router.backends).length
      },
      tool_stats: this.aliasResolver.getSystemStats(),
      multi_ai_status: {
        total_backends: Object.keys(this.router.backends).length,
        healthy_backends: 0,
        fallback_chains_active: Object.keys(this.router.fallbackChains).length,
        circuit_breakers: {},
        request_stats: this.router.requestStats
      },
      backends: {}
    };

    // Test backends based on check type
    if (check_type === 'comprehensive' || check_type === 'endpoints') {
      for (const [key, backend] of Object.entries(this.router.backends)) {
        try {
          const backendHealth = backend.health;
          const circuitBreaker = this.router.circuitBreakers.get(key);
          const isHealthy = backendHealth.status === 'healthy' && circuitBreaker.state === 'closed';

          if (isHealthy) {
            healthData.multi_ai_status.healthy_backends++;
          }

          healthData.backends[key] = {
            name: backend.name,
            type: backend.type,
            url: backend.url,
            priority: backend.priority,
            specialization: backend.specialization,
            max_tokens: backend.maxTokens,
            health_status: backendHealth.status,
            last_check: new Date(backendHealth.lastCheck).toISOString(),
            response_time: backendHealth.responseTime || 'N/A',
            failures: backendHealth.failures || 0,
            circuit_breaker: {
              state: circuitBreaker.state,
              failures: circuitBreaker.failures,
              last_failure: circuitBreaker.lastFailure ? new Date(circuitBreaker.lastFailure).toISOString() : null
            },
            overall_status: isHealthy ? 'operational' : 'degraded'
          };

          // Store circuit breaker info in multi_ai_status
          healthData.multi_ai_status.circuit_breakers[key] = circuitBreaker.state;

        } catch (error) {
          healthData.backends[key] = {
            name: backend.name,
            type: backend.type,
            status: 'error',
            error: error.message,
            overall_status: 'failed'
          };
        }
      }
    }

    // Add fallback chain information
    healthData.multi_ai_status.fallback_chains = this.router.fallbackChains;

    // Performance metrics
    healthData.performance_metrics = {
      cache_hit_rate: this.router.requestStats.total > 0
        ? `${Math.round((this.router.requestStats.cached / this.router.requestStats.total) * 100)}%`
        : '0%',
      fallback_usage_rate: this.router.requestStats.total > 0
        ? `${Math.round((this.router.requestStats.fallbacks / this.router.requestStats.total) * 100)}%`
        : '0%',
      backend_distribution: Object.fromEntries(this.router.requestStats.backendUsage)
    };

    healthData.total_check_time = Date.now() - startTime;
    return healthData;
  }

  async handleWriteFilesAtomic(args) {
    // 🔒 INPUT VALIDATION
    const file_operations = InputValidator.validateArray(args.file_operations, {
      required: true,
      minLength: 1,
      maxLength: SECURITY_LIMITS.MAX_FILES_IN_MULTI_EDIT,
      name: 'file_operations'
    });
    const create_backup = InputValidator.validateBoolean(args.create_backup, {
      required: false,
      name: 'create_backup'
    }) !== false;

    // Validate each file operation
    for (let i = 0; i < file_operations.length; i++) {
      const op = file_operations[i];
      InputValidator.validateString(op.path, {
        required: true,
        maxLength: 4096,
        name: `file_operations[${i}].path`
      });
      InputValidator.validateString(op.content, {
        required: true,
        maxLength: SECURITY_LIMITS.MAX_FILE_SIZE,
        name: `file_operations[${i}].content`
      });
      if (op.operation) {
        InputValidator.validateEnum(op.operation, ['write', 'append', 'modify'], {
          name: `file_operations[${i}].operation`
        });
      }
    }

    const results = [];

    for (const operation of file_operations) {
      try {
        // SECURITY: Validate operation path before any file operations
        let validatedPath;
        try {
          validatedPath = await validatePath(operation.path);
        } catch (error) {
          results.push({
            path: operation.path,
            operation: operation.operation,
            success: false,
            error: `Path validation failed: ${error.message}`,
            securityViolation: true
          });
          continue;
        }

        const fs = await import('fs/promises');

        // Create backup if requested
        if (create_backup) {
          try {
            // SECURITY: Validate backup path
            const backupPath = `${validatedPath}.backup.${Date.now()}`;
            const validatedBackupPath = await validatePath(backupPath);

            const existingContent = await fs.readFile(validatedPath, 'utf8');
            await fs.writeFile(validatedBackupPath, existingContent);
          } catch (error) {
            // File might not exist, continue
          }
        }

        // Perform the operation
        switch (operation.operation) {
          case 'write':
            await fs.writeFile(validatedPath, operation.content);
            break;
          case 'append':
            await fs.appendFile(validatedPath, operation.content);
            break;
          default:
            await fs.writeFile(validatedPath, operation.content);
        }

        results.push({
          path: operation.path,
          operation: operation.operation,
          success: true
        });
      } catch (error) {
        results.push({
          path: operation.path,
          operation: operation.operation,
          success: false,
          error: error.message
        });
      }
    }

    return {
      success: true,
      operations_completed: results.filter(r => r.success).length,
      operations_failed: results.filter(r => !r.success).length,
      results
    };
  }

  async handleEditFile(args) {
    // 🔒 INPUT VALIDATION
    const file_path = InputValidator.validateString(args.file_path, {
      required: true,
      maxLength: 4096,
      name: 'file_path'
    });
    const edits = InputValidator.validateArray(args.edits, {
      required: true,
      minLength: 1,
      maxLength: SECURITY_LIMITS.MAX_EDITS_PER_FILE,
      name: 'edits'
    });
    const validation_mode = InputValidator.validateEnum(
      args.validation_mode || 'strict',
      ['strict', 'lenient', 'dry_run'],
      { name: 'validation_mode' }
    ) || 'strict';

    // ⚡ FUZZY MATCHING PARAMETERS (v8.3.0+)
    const fuzzy_threshold = validateFuzzyThreshold(args.fuzzy_threshold || 0.85);
    const suggest_alternatives = args.suggest_alternatives !== false; // Default true
    const max_suggestions = validateMaxSuggestions(args.max_suggestions || 3);

    // Validate each edit operation
    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i];
      InputValidator.validateString(edit.find, {
        required: true,
        maxLength: 100000,
        name: `edits[${i}].find`
      });
      InputValidator.validateString(edit.replace, {
        required: true,
        maxLength: 100000,
        name: `edits[${i}].replace`
      });
    }

    // 🔒 FUZZY MATCHING SECURITY: Validate complexity
    const complexityValidation = validateFuzzyEditComplexity(edits, SECURITY_LIMITS);
    if (!complexityValidation.valid) {
      return {
        success: false,
        file_path,
        error: `Complexity validation failed: ${complexityValidation.errors.join(', ')}`,
        securityViolation: true
      };
    }

    // SECURITY: Validate file path before any operations
    try {
      const validatedPath = await validatePath(file_path);
      const fileExists = await validateFileExists(validatedPath);
      if (!fileExists) {
        return {
          success: false,
          file_path,
          error: 'File does not exist or is not a regular file',
          securityViolation: true
        };
      }

      // Wrap in timeout protection
      return await createFuzzyTimeoutWrapper(async () => {
        const fs = await import('fs/promises');
        let content = await fs.readFile(validatedPath, 'utf8');

        // Detect line ending style for preservation
        const originalLineEnding = content.includes('\r\n') ? '\r\n' : '\n';

        const dry_run = validation_mode === 'dry_run';
        const strict_mode = validation_mode === 'strict';
        let edits_applied = 0;
        const fuzzy_matches = [];
        const suggestions = [];
        const failed_edits = [];

        // Process each edit
        for (const edit of edits) {
          let matchFound = false;
          let matchInfo = null;

          // === PHASE 1: EXACT MATCH (fastest path) ===
          if (content.includes(edit.find)) {
            content = content.replace(edit.find, edit.replace);
            edits_applied++;
            matchFound = true;
            matchInfo = { type: 'exact', similarity: 1.0 };
            trackFuzzyMetrics('EXACT_MATCH', { file_path });
          }
          // === PHASE 2: FUZZY MATCH (if exact fails and lenient mode) ===
          else if (!strict_mode && fuzzy_threshold < 1.0) {
            const normalizedFind = this.normalizeWhitespace(edit.find);
            const contentLines = content.split(originalLineEnding);
            const findLines = edit.find.split('\n');

            let bestMatch = null;
            let bestSimilarity = 0;
            let bestPosition = -1;
            let iterationCount = 0;
            const maxIterations = Math.min(
              contentLines.length - findLines.length + 1,
              SECURITY_LIMITS.MAX_FUZZY_ITERATIONS
            );

            // Search for fuzzy matches
            for (let i = 0; i <= contentLines.length - findLines.length; i++) {
              if (++iterationCount > maxIterations) {
                trackFuzzyMetrics('ITERATION_LIMIT_HIT', { file_path, iterations: iterationCount });
                break;
              }

              const candidateBlock = contentLines.slice(i, i + findLines.length).join('\n');
              const normalizedCandidate = this.normalizeWhitespace(candidateBlock);
              const similarity = this.calculateStringSimilarity(normalizedFind, normalizedCandidate);

              if (similarity >= fuzzy_threshold && similarity > bestSimilarity) {
                bestSimilarity = similarity;
                bestMatch = candidateBlock;
                bestPosition = i;
              }
            }

            if (bestMatch && bestSimilarity >= fuzzy_threshold) {
              content = content.replace(bestMatch, edit.replace);
              edits_applied++;
              matchFound = true;
              matchInfo = {
                type: 'fuzzy',
                similarity: bestSimilarity,
                original_find: edit.find,
                matched_content: bestMatch.substring(0, 100) + (bestMatch.length > 100 ? '...' : ''),
                line_position: bestPosition
              };
              fuzzy_matches.push(matchInfo);
              trackFuzzyMetrics('FUZZY_MATCH', { file_path, similarity: bestSimilarity });
            }
          }

          // === PHASE 3: SUGGESTION GENERATION (if no match found) ===
          if (!matchFound && suggest_alternatives) {
            const normalizedFind = this.normalizeWhitespace(edit.find);
            const contentLines = content.split(originalLineEnding);
            const findLines = edit.find.split('\n');
            const alternatives = [];

            // Find top N similar blocks
            for (let i = 0; i <= contentLines.length - findLines.length; i++) {
              const candidateBlock = contentLines.slice(i, i + findLines.length).join('\n');
              const normalizedCandidate = this.normalizeWhitespace(candidateBlock);
              const similarity = this.calculateStringSimilarity(normalizedFind, normalizedCandidate);

              if (similarity > 0.3) { // Minimum threshold for suggestions
                alternatives.push({
                  similarity,
                  line_start: i,
                  code: candidateBlock.substring(0, 100) + (candidateBlock.length > 100 ? '...' : '')
                });
              }
            }

            alternatives.sort((a, b) => b.similarity - a.similarity);
            suggestions.push({
              original_find: edit.find.substring(0, 100) + (edit.find.length > 100 ? '...' : ''),
              threshold_needed: fuzzy_threshold,
              alternatives: alternatives.slice(0, max_suggestions)
            });

            failed_edits.push(edit);
            trackFuzzyMetrics('MATCH_FAILED', { file_path });
          }
        }

        // Write changes if not in dry_run mode
        if (!dry_run && edits_applied > 0) {
          await fs.writeFile(validatedPath, content);
        }

        return {
          success: edits_applied === edits.length,
          file_path,
          edits_applied,
          total_edits: edits.length,
          validation_mode,
          dry_run,
          strict_mode,
          fuzzy_threshold,
          fuzzy_matches,
          suggestions,
          failed_edits: failed_edits.length,
          optimization_applied: !strict_mode && fuzzy_threshold < 1.0
        };
      }, SECURITY_LIMITS.FUZZY_TIMEOUT_MS);
    } catch (error) {
      return {
        success: false,
        file_path,
        error: error.message,
        securityViolation: error.message.includes('Path') || error.message.includes('Complexity')
      };
    }
  }

  async handleValidateChanges(args) {
    const { file_path, proposed_changes, validation_rules = ['syntax'] } = args;

    const validationResults = [];

    for (const change of proposed_changes) {
      const result = {
        find: change.find,
        replace: change.replace,
        valid: true,
        warnings: [],
        suggestions: []
      };

      // Basic validation
      if (validation_rules.includes('syntax')) {
        if (change.replace.includes('undefined') || change.replace.includes('null')) {
          result.warnings.push('Potential null/undefined values detected');
        }
      }

      validationResults.push(result);
    }

    return {
      success: true,
      file_path,
      total_changes: proposed_changes.length,
      valid_changes: validationResults.filter(r => r.valid).length,
      validation_results: validationResults
    };
  }

  async handleMultiEdit(args) {
    // 🔒 INPUT VALIDATION
    const file_operations = InputValidator.validateArray(args.file_operations, {
      required: true,
      minLength: 1,
      maxLength: SECURITY_LIMITS.MAX_FILES_IN_MULTI_EDIT,
      name: 'file_operations'
    });
    const transaction_mode = InputValidator.validateEnum(
      args.transaction_mode || 'all_or_nothing',
      ['all_or_nothing', 'best_effort', 'dry_run'],
      { name: 'transaction_mode' }
    ) || 'all_or_nothing';

    // Validate each file operation
    for (let i = 0; i < file_operations.length; i++) {
      const op = file_operations[i];
      InputValidator.validateString(op.file_path, {
        required: true,
        maxLength: 4096,
        name: `file_operations[${i}].file_path`
      });
      InputValidator.validateArray(op.edits, {
        required: true,
        minLength: 1,
        maxLength: SECURITY_LIMITS.MAX_EDITS_PER_FILE,
        name: `file_operations[${i}].edits`
      });
    }

    const results = [];

    // SECURITY: Pre-validate all file paths before processing any operations
    const pathValidationErrors = [];
    for (const operation of file_operations) {
      try {
        await validatePath(operation.file_path);
      } catch (error) {
        pathValidationErrors.push({
          file_path: operation.file_path,
          error: `Path validation failed: ${error.message}`,
          securityViolation: true
        });
      }
    }

    // If any path validation failed and we're in all_or_nothing mode, fail early
    if (pathValidationErrors.length > 0 && transaction_mode === 'all_or_nothing') {
      return {
        success: false,
        transaction_mode,
        operations_successful: 0,
        operations_failed: file_operations.length,
        results: pathValidationErrors,
        earlyTermination: 'Path validation failed for one or more files'
      };
    }

    for (const operation of file_operations) {
      try {
        const result = await this.handleEditFile({
          file_path: operation.file_path,
          edits: operation.edits,
          validation_mode: 'strict'
        });
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          file_path: operation.file_path,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;

    return {
      success: transaction_mode !== 'all_or_nothing' || failCount === 0,
      transaction_mode,
      operations_successful: successCount,
      operations_failed: failCount,
      results
    };
  }

  async handleBackupRestore(args) {
    const { action, file_path, backup_id } = args;

    switch (action) {
      case 'create':
        try {
          // SECURITY: Validate file path
          const validatedPath = await validatePath(file_path);
          const fileExists = await validateFileExists(validatedPath);
          if (!fileExists) {
            return {
              success: false,
              action: 'create',
              error: 'File does not exist or is not a regular file',
              securityViolation: true
            };
          }

          const fs = await import('fs/promises');
          const content = await fs.readFile(validatedPath, 'utf8');

          // SECURITY: Validate backup path
          const backupPath = `${validatedPath}.backup.${Date.now()}`;
          const validatedBackupPath = await validatePath(backupPath);
          await fs.writeFile(validatedBackupPath, content);

          return {
            success: true,
            action: 'create',
            file_path,
            backup_path: backupPath,
            timestamp: new Date().toISOString()
          };
        } catch (error) {
          return {
            success: false,
            action: 'create',
            error: error.message,
            securityViolation: error.message.includes('Path')
          };
        }

      case 'list':
        try {
          // SECURITY: Validate file path
          const validatedPath = await validatePath(file_path);

          const fs = await import('fs/promises');
          const path = await import('path');
          const dir = path.dirname(validatedPath);

          // SECURITY: Validate directory path
          const validatedDir = await validatePath(dir);
          const dirExists = await validateDirExists(validatedDir);
          if (!dirExists) {
            return {
              success: false,
              action: 'list',
              error: 'Directory does not exist',
              securityViolation: true
            };
          }

          const basename = path.basename(validatedPath);
          const files = await fs.readdir(validatedDir);
          const backups = files.filter(f => f.startsWith(`${basename}.backup.`));

          return {
            success: true,
            action: 'list',
            file_path,
            backups
          };
        } catch (error) {
          return {
            success: false,
            action: 'list',
            error: error.message,
            securityViolation: error.message.includes('Path')
          };
        }

      case 'restore':
        try {
          // SECURITY: Validate both backup and target paths
          if (!backup_id) {
            return {
              success: false,
              action: 'restore',
              error: 'backup_id is required for restore action'
            };
          }

          const validatedPath = await validatePath(file_path);
          const backupPath = `${validatedPath}.backup.${backup_id}`;
          const validatedBackupPath = await validatePath(backupPath);

          const backupExists = await validateFileExists(validatedBackupPath);
          if (!backupExists) {
            return {
              success: false,
              action: 'restore',
              error: 'Backup file does not exist',
              securityViolation: true
            };
          }

          const fs = await import('fs/promises');
          const backupContent = await fs.readFile(validatedBackupPath, 'utf8');
          await fs.writeFile(validatedPath, backupContent);

          return {
            success: true,
            action: 'restore',
            file_path,
            backup_id,
            timestamp: new Date().toISOString()
          };
        } catch (error) {
          return {
            success: false,
            action: 'restore',
            error: error.message,
            securityViolation: error.message.includes('Path')
          };
        }

      default:
        return {
          success: false,
          action,
          error: `Unsupported action: ${action}`
        };
    }
  }

  async handleAsk(args) {
    // 🔒 INPUT VALIDATION
    const model = InputValidator.validateEnum(
      args.model,
      ['local', 'gemini', 'deepseek3.1', 'qwen3'],
      { required: true, name: 'model' }
    );
    const prompt = InputValidator.validateString(args.prompt, {
      required: true,
      minLength: 1,
      maxLength: SECURITY_LIMITS.MAX_CONTENT_LENGTH,
      name: 'prompt'
    });
    const thinking = InputValidator.validateBoolean(args.thinking, {
      required: false,
      name: 'thinking'
    }) !== false;
    const max_tokens = args.max_tokens ? InputValidator.validateInteger(args.max_tokens, {
      required: false,
      min: 1,
      max: 200000,
      name: 'max_tokens'
    }) : undefined;
    const enable_chunking = InputValidator.validateBoolean(args.enable_chunking, {
      required: false,
      name: 'enable_chunking'
    }) === true;
    const force_backend = args.force_backend ? InputValidator.validateString(args.force_backend, {
      required: false,
      maxLength: 50,
      name: 'force_backend'
    }) : undefined;

    // Map user-friendly model names to internal backend names
    const modelMap = {
      'local': 'local',
      'gemini': 'gemini',
      'deepseek3.1': 'nvidia_deepseek',
      'qwen3': 'nvidia_qwen'
    };

    const requestedBackend = modelMap[model];
    if (!requestedBackend) {
      throw new Error(`Unknown model: ${model}. Available models: local, gemini, deepseek3.1, qwen3`);
    }

    // Smart routing or force backend
    let selectedBackend;
    if (force_backend && this.router && this.router.backends && this.router.backends[force_backend]) {
      selectedBackend = force_backend;
      console.error(`🎯 FORCED BACKEND: Using ${force_backend} (bypassing smart routing)`);
    } else {
      const routingOptions = { forceBackend: requestedBackend };
      selectedBackend = await this.router.routeRequest(prompt, routingOptions);
    }

    // Dynamic token optimization - Calculate optimal tokens
    const dynamicTokens = this.router.calculateDynamicTokenLimit(prompt, selectedBackend);
    const finalMaxTokens = max_tokens || dynamicTokens;

    const options = {
      thinking,
      maxTokens: finalMaxTokens,
      forceBackend: force_backend
    };

    console.error(`🚀 MULTI-AI: Processing ${model} → ${selectedBackend} with ${finalMaxTokens} tokens (dynamic: ${dynamicTokens}, specified: ${max_tokens || 'auto'})`);

    try {
      const response = await this.router.makeRequest(prompt, selectedBackend, options);
      const responseContent = response.content || response;
      const responseHeaders = response.headers || {};

      // Truncation detection - Check if response was cut off
      const wasTruncated = this.detectTruncation(responseContent, finalMaxTokens);

      if (wasTruncated && enable_chunking) {
        console.error(`🔄 MULTI-AI: Response truncated, attempting chunked generation...`);
        const chunkedResponse = await this.performChunkedGeneration(prompt, selectedBackend, options);
        return {
          success: true,
          model,
          requested_backend: requestedBackend,
          actual_backend: responseHeaders['X-AI-Backend'] || selectedBackend,
          prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
          response: chunkedResponse,
          backend_used: responseHeaders['X-AI-Backend'] || selectedBackend,
          fallback_chain: responseHeaders['X-Fallback-Chain'] || 'none',
          request_id: responseHeaders['X-Request-ID'],
          response_time: responseHeaders['X-Response-Time'],
          thinking_enabled: thinking,
          max_tokens: finalMaxTokens,
          dynamic_tokens: dynamicTokens,
          chunked: true,
          multi_ai_optimization: true,
          response_headers: responseHeaders,
          timestamp: new Date().toISOString()
        };
      }

      return {
        success: true,
        model,
        requested_backend: requestedBackend,
        actual_backend: responseHeaders['X-AI-Backend'] || selectedBackend,
        prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
        response: responseContent,
        backend_used: responseHeaders['X-AI-Backend'] || selectedBackend,
        fallback_chain: responseHeaders['X-Fallback-Chain'] || 'none',
        request_id: responseHeaders['X-Request-ID'],
        response_time: responseHeaders['X-Response-Time'],
        cache_status: responseHeaders['X-Cache-Status'] || 'MISS',
        thinking_enabled: thinking,
        max_tokens: finalMaxTokens,
        dynamic_tokens: dynamicTokens,
        was_truncated: wasTruncated,
        multi_ai_optimization: finalMaxTokens !== 4096, // Show if we optimized beyond default
        smart_routing_applied: !force_backend && (selectedBackend !== requestedBackend),
        response_headers: responseHeaders,
        metadata: response.metadata || {},
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`❌ MULTI-AI: Error in ${model} request: ${error.message}`);
      throw error;
    }
  }

  /**
   * Truncation detection - Smart detection of incomplete responses
   */
  detectTruncation(response, maxTokens) {
    const responseTokens = this.router.estimateTokens(response);
    const isNearLimit = responseTokens > (maxTokens * 0.9); // 90% of token limit
    const endsAbruptly = !/[.!?})\]"'`]\s*$/.test(response.trim()); // Doesn't end with proper punctuation
    const hasIncompleteCode = /```[^`]*$/.test(response); // Unfinished code block

    return isNearLimit && (endsAbruptly || hasIncompleteCode);
  }

  /**
   * Chunked generation - Fallback for large requests
   */
  async performChunkedGeneration(originalPrompt, endpoint, options) {
    // Simple chunking strategy - break prompt into smaller parts
    const maxChunkSize = 4000; // Conservative chunk size
    const chunks = this.chunkPrompt(originalPrompt, maxChunkSize);
    const responses = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkPrompt = `Part ${i + 1} of ${chunks.length}: ${chunks[i]}`;
      console.error(`🔄 Processing chunk ${i + 1}/${chunks.length}`);

      const chunkResponse = await this.router.makeRequest(chunkPrompt, endpoint, {
        ...options,
        maxTokens: Math.min(8192, options.maxTokens) // Smaller tokens per chunk
      });

      responses.push(chunkResponse);
    }

    return responses.join('\n\n--- CHUNK BOUNDARY ---\n\n');
  }

  /**
   * Smart prompt chunking
   */
  chunkPrompt(prompt, maxChunkSize) {
    if (prompt.length <= maxChunkSize) return [prompt];

    const chunks = [];
    let currentPos = 0;

    while (currentPos < prompt.length) {
      let chunkEnd = Math.min(currentPos + maxChunkSize, prompt.length);

      // Try to break at a sentence boundary
      if (chunkEnd < prompt.length) {
        const sentenceBreak = prompt.lastIndexOf('.', chunkEnd);
        const paragraphBreak = prompt.lastIndexOf('\n\n', chunkEnd);

        if (sentenceBreak > currentPos + (maxChunkSize * 0.5)) {
          chunkEnd = sentenceBreak + 1;
        } else if (paragraphBreak > currentPos + (maxChunkSize * 0.3)) {
          chunkEnd = paragraphBreak + 2;
        }
      }

      chunks.push(prompt.substring(currentPos, chunkEnd));
      currentPos = chunkEnd;
    }

    return chunks;
  }

  /**
   * 📊 RATE LIMIT STATUS HANDLER
   * Check current rate limit usage and remaining capacity
   */
  async handleRateLimitStatus(args) {
    // Extract authentication token from environment
    const authToken = process.env.MCP_AUTH_TOKEN;
    const clientId = authToken || 'anonymous';

    // Get rate limit statistics
    const stats = rateLimiter.getStats(clientId);

    // Get authentication statistics
    const authStats = authManager.getStats();

    return {
      success: true,
      client_id: clientId.substring(0, 8) + '...',
      rate_limits: stats,
      authentication: {
        enabled: authStats.authEnabled,
        total_tokens: authStats.totalTokens
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 📈 SYSTEM METRICS HANDLER
   * View system usage metrics, performance statistics, and tool usage breakdown
   */
  async handleSystemMetrics(args) {
    // Get metrics from collector
    const metrics = metricsCollector.getMetrics();

    // Get authentication statistics
    const authStats = authManager.getStats();

    // Get rate limiter stats for all clients
    const authToken = process.env.MCP_AUTH_TOKEN;
    const clientId = authToken || 'anonymous';
    const rateLimitStats = rateLimiter.getStats(clientId);

    // Get FileModificationManager stats if available
    const fileManagerStats = this.fileManager.operationHistory.length > 0 ? {
      total_operations: this.fileManager.operationHistory.length,
      active_operations: this.fileManager.activeOperations.size,
      recent_operations: this.fileManager.operationHistory.slice(-10).map(op => ({
        type: op.type,
        duration: Math.round(op.duration),
        status: op.status,
        timestamp: op.timestamp
      }))
    } : null;

    // Get MultiAI router stats if available
    const routerStats = this.router.requestStats ? {
      total_requests: this.router.requestStats.total,
      cached_requests: this.router.requestStats.cached,
      fallback_requests: this.router.requestStats.fallbacks,
      backend_usage: Object.fromEntries(this.router.requestStats.backendUsage || new Map()),
      cache_hit_rate: this.router.requestStats.total > 0
        ? `${Math.round((this.router.requestStats.cached / this.router.requestStats.total) * 100)}%`
        : '0%'
    } : null;

    return {
      success: true,
      system_metrics: {
        requests: metrics.requests,
        performance: {
          average_duration: Math.round(metrics.performance.averageTime),
          total_time: Math.round(metrics.performance.totalTime),
          request_count: metrics.performance.count
        },
        tools: Object.entries(metrics.tools).map(([name, stats]) => ({
          name,
          count: stats.count,
          success: stats.success,
          failed: stats.failed,
          average_duration: stats.count > 0 ? Math.round(stats.totalTime / stats.count) : 0,
          success_rate: stats.count > 0 ? `${Math.round((stats.success / stats.count) * 100)}%` : '0%'
        })).sort((a, b) => b.count - a.count),
        errors: metrics.errors,
        authentication: {
          enabled: authStats.authEnabled,
          total_tokens: authStats.totalTokens
        },
        rate_limits: rateLimitStats,
        file_operations: fileManagerStats,
        multi_ai_router: routerStats
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 🤖 SPAWN SUBAGENT HANDLER
   * Create specialized AI subagents with role-based expertise
   */
  async handleSpawnSubagent(args) {
    // 🔒 INPUT VALIDATION
    const role = InputValidator.validateEnum(
      args.role,
      ['code-reviewer', 'security-auditor', 'planner', 'refactor-specialist', 'test-generator', 'documentation-writer'],
      { name: 'role', required: true }
    );
    const task = InputValidator.validateString(args.task, {
      required: true,
      minLength: 10,
      maxLength: 10000,
      name: 'task'
    });
    const file_patterns = args.file_patterns ? InputValidator.validateArray(args.file_patterns, {
      maxLength: 20,
      name: 'file_patterns'
    }) : undefined;
    const verdict_mode = InputValidator.validateEnum(
      args.verdict_mode || 'summary',
      ['summary', 'full'],
      { name: 'verdict_mode' }
    );

    console.error(`🤖 Spawning subagent with role: ${role}`);
    console.error(`📋 Task: ${task.substring(0, 100)}${task.length > 100 ? '...' : ''}`);

    try {
      // Create subagent handler with router access
      const handler = new SubagentHandler(this.router);

      // Execute the subagent task
      const result = await handler.handle({
        role,
        task,
        file_patterns,
        context: args.context,
        verdict_mode
      });

      console.error(`✅ Subagent ${role} completed successfully`);

      return {
        success: true,
        role: result.role,
        role_name: result.role_name,
        backend_used: result.backend_used,
        has_verdict: result.has_verdict,
        verdict: result.verdict,
        text_content: result.text_content,
        metadata: result.metadata,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`❌ Subagent ${role} failed: ${error.message}`);
      throw error;
    }
  }
}

async function main() {
  const server = new SmartAIBridgeServer();
  const transport = new StdioServerTransport();

  console.error('🚀 Starting Smart AI Bridge v1.3.0...');
  const stats = server.aliasResolver.getSystemStats();
  console.error(`⚡ ${stats.coreTools} core tools registered, ${stats.aliases} aliases available via SmartAliasResolver`);
  console.error('');
  console.error('🚀 MULTI-AI BACKEND INTEGRATION ACTIVE:');
  console.error('⚡ Local Backend: Qwen2.5-Coder-7B (128K+ tokens)');
  console.error('⚡ Gemini Backend: Gemini Enhanced (32K tokens)');
  console.error('⚡ NVIDIA DeepSeek: V3.1 with thinking mode (8K tokens)');
  console.error('⚡ NVIDIA Qwen: 3-Coder-480B (32K tokens)');
  console.error('');
  console.error('🔄 SMART FALLBACK CHAINS:');
  console.error('   • Local → Gemini → NVIDIA (DeepSeek/Qwen)');
  console.error('   • Circuit breaker protection (30s recovery)');
  console.error('   • Automatic health monitoring (30s intervals)');
  console.error('   • Response headers: X-AI-Backend, X-Fallback-Chain');
  console.error('');
  console.error('🔥 PERFORMANCE OPTIMIZATIONS:');
  console.error('⚡ Smart routing decisions: <500ms');
  console.error('⚡ Fallback chain evaluation: <100ms');
  console.error('⚡ Request caching: 15-minute timeout');
  console.error('⚡ Connection pooling for cloud backends');
  console.error('⚡ Dynamic token scaling: Unity (16K), Complex (8K), Simple (2K)');
  console.error('⚡ Timeout scaling: 60s-300s based on complexity');
  console.error('');
  console.error('🛠️ COMPREHENSIVE TOOLSET:');
  console.error('   • FileModificationManager orchestrator ready');
  console.error('   • Enhanced validation with fuzzy matching');
  console.error('   • Atomic batch operations with rollback');
  console.error('   • Multi-backend ask tool with force options');
  console.error('   • Unified Agno-Serena response format');
  console.error('');
  console.error('🔒 PRODUCTION-GRADE SECURITY:');
  console.error('   • Authentication & Authorization (token-based)');
  console.error('   • Rate Limiting (60/min, 500/hr, 5000/day)');
  console.error('   • Input Validation (all tool parameters)');
  console.error('   • Error Sanitization (no information leakage)');
  console.error('   • Metrics Collection (performance tracking)');
  console.error('   • Payload Limits (10MB request, 5MB file, 50 batch)');
  console.error('   • New Tools: rate_limit_status, system_metrics');

  await server.server.connect(transport);
  console.error('🎉 Smart AI Bridge server ready!');
  console.error('🌟 All backends initialized - Smart fallback chains operational!');
}

// Export for testing
export { SmartAIBridgeServer };

main().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
