#!/usr/bin/env node
/**
 * @fileoverview MKG v2 Server - Modular entry point
 * @module server-mkg-v2
 *
 * Mecha-King Ghidorah v2 MCP Server
 * Refactored modular architecture with:
 * - Plugin-based backend system
 * - Extracted handlers
 * - Unified health monitoring
 * - Config-driven routing
 *
 * Target: ~500 lines (down from 5,376 in monolith)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

// Import modular components
import { SmartAliasResolver } from './src/tools/smart-alias-resolver.js';
import { HandlerFactory } from './src/handlers/index.js';
import { BackendRegistry } from './src/backends/backend-registry.js';
import { HealthMonitor } from './src/monitoring/health-monitor.js';
import { PlaybookSystem } from './src/intelligence/playbook-system.js';
import { ConcurrentRequestManager } from './src/utils/concurrent-request-manager.js';
import { CompoundLearningEngine } from './src/intelligence/compound-learning.js';
import { OrchestratorClient } from './src/clients/orchestrator-client.js';
import ConversationThreading from './src/threading/index.js';

// Version info
const VERSION = '2.0.0';
const SERVER_NAME = 'mecha-king-ghidorah-v2';

/**
 * MKG v2 Server
 * Slim orchestration layer that delegates to modular components
 */
class MKGServerV2 {
  constructor() {
    // Initialize MCP server
    this.server = new Server(
      { name: SERVER_NAME, version: VERSION },
      { capabilities: { tools: {} } }
    );

    // Initialize modular components
    this.aliasResolver = new SmartAliasResolver();
    this.backendRegistry = new BackendRegistry();
    this.healthMonitor = new HealthMonitor();
    this.playbook = new PlaybookSystem();
    this.requestManager = new ConcurrentRequestManager();

    // Initialize learning engine
    this.learningEngine = new CompoundLearningEngine({
      dataDir: './data/learning',
      emaAlpha: 0.2,
      minSamples: 5
    });

    // Initialize orchestrator client
    this.orchestratorClient = new OrchestratorClient({
      url: 'http://localhost:8083/v1/chat/completions',
      model: 'orchestrator',
      healthCacheTTL: 30000
    });

    // Initialize conversation threading
    this.conversationThreading = new ConversationThreading('./data/conversations');

    // Create router interface (compatibility layer for handlers)
    this.router = this.createRouterInterface();

    // Initialize handler factory with dependencies
    this.handlerFactory = new HandlerFactory({
      router: this.router,
      server: this,
      playbook: this.playbook,
      conversationThreading: this.conversationThreading
    });

    // Register backends with health monitor
    this.registerBackendsWithMonitor();

    // Initialize health check cache
    this.healthCache = new Map();

    // Setup MCP handlers
    this.setupToolHandlers();

    console.error(`🤖 MKG v2 Server initialized (${VERSION})`);
    console.error(`📦 ${this.aliasResolver.getSystemStats().totalTools} tools registered`);
  }

  /**
   * Create router interface for backward compatibility with handlers
   * @private
   */
  createRouterInterface() {
    // Capture server instance for proper context binding
    const server = this;

    // Create router object with mutable state
    const router = {
      _lastRoutingContext: null
    };

    router.routeRequest = async (prompt, options = {}) => {
      // PRIORITY 0: Honor forceBackend (spawn_subagent compatibility)
      if (options.forceBackend && server.backendRegistry?.getAdapter(options.forceBackend)) {
        const context = server.createRoutingContext(prompt, options);
        context.source = 'forced';
        context.decision = options.forceBackend;
        context.confidence = 1.0;
        context.reasoning = 'Explicitly requested backend';
        router._lastRoutingContext = context;
        return options.forceBackend;
      }

      const context = server.createRoutingContext(prompt, options);

        // PRIORITY 1: Check learned patterns (uses ALL historical sources)
        try {
          const learned = await server.learningEngine.getRecommendation(context);
          if (learned && learned.confidence > 0.6) {
            context.source = 'compound_learning';
            context.decision = learned.tool;
            context.confidence = learned.confidence;
            context.reasoning = learned.reason || 'Learned from past outcomes';
            this._lastRoutingContext = context;
            return learned.tool;
          }
        } catch (error) {
          console.error(`Learning recommendation failed: ${error.message}`);
          // Continue to next priority
        }

        // PRIORITY 2: Enhance with playbook lessons (optional, non-blocking)
        try {
          const enhanced = await server.playbook.enhanceRoutingWithPlaybook(context, server);
          if (enhanced?.enhancedContext?.lessons) {
            context.lessons = enhanced.enhancedContext.lessons;
          }
        } catch (error) {
          console.error(`Playbook enhancement failed: ${error.message}`);
          // Continue without lessons
        }

        // PRIORITY 3: Query orchestrator (OPTIONAL - skip if unavailable)
        if (server.orchestratorClient?.healthy) {
          try {
            const orchestratorDecision = await server.orchestratorClient.analyze(prompt, context);
            if (orchestratorDecision) {
              context.source = 'orchestrator';
              context.decision = orchestratorDecision.backend;
              context.confidence = orchestratorDecision.confidence;
              context.reasoning = orchestratorDecision.reasoning;
              this._lastRoutingContext = context;
              return orchestratorDecision.backend;
            }
          } catch (error) {
            console.error(`Orchestrator routing failed: ${error.message}`);
            // Gracefully continue to rule-based routing
          }
        }

        // PRIORITY 4: Rule-based routing (from V1 complexity analysis)
        const ruleDecision = server.applyRuleBasedRouting(context);
        if (ruleDecision) {
          context.source = 'rules';
          context.decision = ruleDecision.backend;
          context.confidence = ruleDecision.confidence;
          context.reasoning = ruleDecision.reasoning;
          router._lastRoutingContext = context;
          return ruleDecision.backend;
        }

      // PRIORITY 5: Health-based fallback (always available)
      const recommendations = server.healthMonitor.getRecommendations();
      context.source = 'health';
      context.decision = recommendations.recommended || 'local';
      context.confidence = 0.7;
      context.reasoning = 'Health-based fallback';
      router._lastRoutingContext = context;

      return context.decision;
    };

    // Attach other methods to router
    router.makeRequest = async (prompt, endpoint, options = {}) => {

      const adapter = server.backendRegistry.getAdapter(endpoint);
      if (!adapter) {
        throw new Error(`Backend not available: ${endpoint}`);
      }

      return server.requestManager.executeRequest(
        adapter.execute(prompt, options)
      );
    };

    // Attach utility methods
    router.detectLanguage = (content) => {
        if (!content) return 'unknown';
        if (content.includes('import React') || content.includes('useState')) return 'javascript';
        if (content.includes('def ') || content.includes('import ')) return 'python';
        if (content.includes('public class') || content.includes('private ')) return 'java';
        if (content.includes('#include') || content.includes('std::')) return 'cpp';
        if (content.includes('interface ') || content.includes(': string')) return 'typescript';
        return 'unknown';
    };

    router.calculateDynamicTokenLimit = (prompt, backend) => {
        const promptLower = prompt.toLowerCase();

        // Unity/game development detection
        if (promptLower.includes('unity') || promptLower.includes('monobehaviour') ||
            promptLower.includes('gameobject') || promptLower.includes('c#')) {
          return 16384;
        }

        // Complex generation detection
        if (promptLower.includes('implement') || promptLower.includes('complete') ||
            promptLower.includes('generate') || prompt.length > 2000) {
          return 8192;
        }

        return 2048;
    };

    // Helper methods - delegate to server instance
    router.createRoutingContext = server.createRoutingContext.bind(server);
    router.calculateComplexity = server.calculateComplexity.bind(server);
    router.applyRuleBasedRouting = server.applyRuleBasedRouting.bind(server);

    // Record outcome for learning - ALL SOURCES FEED UNIFIED LEARNING
    // Supports both ask-handler flow (uses _lastRoutingContext) and 
    // other handlers (council/subagent/review) that pass context in outcome
    router.recordRoutingOutcome = async (outcome) => {
        const routingContext = server.router._lastRoutingContext;
        
        // Build context from either passed outcome OR _lastRoutingContext
        // Handler-provided context (source, taskType) takes priority over routing context
        // This ensures council/subagent/review handlers get proper attribution
        const task = routingContext?.prompt || outcome.task || `${outcome.taskType || 'unknown'} operation`;
        const source = outcome.source || routingContext?.source || 'handler';
        const taskType = outcome.taskType || routingContext?.taskType || 'unknown';
        const complexity = routingContext?.complexity || outcome.complexity || 'medium';
        const fileCount = routingContext?.fileCount || outcome.fileCount || 0;
        
        // NEW: Extract modelId from outcome or local adapter
        const modelId = outcome.modelId || 
                        routingContext?.modelId ||
                        (outcome.backend === 'local' ? server.backendRegistry?.getAdapter?.('local')?.modelId : null);

        try {
          await server.learningEngine.recordOutcome({
            task: task,
            context: {
              complexity: complexity,
              taskType: taskType,
              fileCount: fileCount
            },
            routing: {
              tool: outcome.backend,
              source: source,  // 'orchestrator'|'rules'|'health'|'compound_learning'|'forced'|'council'|'subagent'|'review'
              modelId: modelId  // NEW: Pass modelId for model-aware learning
            },
            execution: {
              completed: outcome.success,
              outputLength: outcome.outputLength
            }
          });

          const modelInfo = modelId ? ` (${modelId})` : '';
          console.error(
            `📊 Learning: Recorded ${outcome.success ? 'success' : 'failure'} ` +
            `from ${source} → ${outcome.backend}${modelInfo}`
          );
        } catch (error) {
          // Non-blocking - never fail request if learning fails
          console.error(`Learning recording failed: ${error.message}`);
        }
    };

    // Backend reference for handlers
    router.backends = server.backendRegistry;

    // Orchestrator health check
    router.orchestratorHealthy = () => server.orchestratorClient?.healthy || false;

    return router;
  }

  /**
   * Calculate complexity of prompt (from V1)
   * @private
   */
  calculateComplexity(prompt) {
    const tokenCount = Math.ceil(prompt.length / 4);
    const hasCode = /```|function\s|class\s|import\s|def\s|const\s|let\s|var\s/.test(prompt);

    let score = 0.3;
    if (tokenCount > 8000) score += 0.3;
    if (hasCode) score += 0.2;

    const taskType = hasCode ? 'coding' :
                     /analyze|research/.test(prompt) ? 'analysis' :
                     'general';

    return { score: Math.min(score, 1.0), taskType };
  }

  /**
   * Apply rule-based routing (V1 complexity logic)
   * @private
   */
  applyRuleBasedRouting(context) {
    const { complexity, taskType } = context;

    // High complexity → cloud backends
    if (complexity > 0.7) {
      return {
        backend: taskType === 'coding' ? 'nvidia_qwen' : 'nvidia_deepseek',
        confidence: 0.75,
        reasoning: `High complexity (${complexity.toFixed(2)}) → cloud backend`
      };
    }

    // Medium complexity with code → Qwen3
    if (complexity > 0.4 && taskType === 'coding') {
      return {
        backend: 'nvidia_qwen',
        confidence: 0.65,
        reasoning: 'Medium complexity coding task'
      };
    }

    // Default to local
    return {
      backend: 'local',
      confidence: 0.6,
      reasoning: 'Standard complexity → local backend'
    };
  }

  /**
   * Create routing context for a request
   * @private
   */
  createRoutingContext(prompt, options) {
    const complexity = this.calculateComplexity(prompt);
    return {
      prompt,
      complexity: complexity.score,
      taskType: complexity.taskType,
      fileCount: options.fileCount || 0,
      source: 'unknown',
      decision: null,
      confidence: null,
      reasoning: null,
      lessons: []
    };
  }

  /**
   * Register all backends with health monitor
   * @private
   */
  registerBackendsWithMonitor() {
    for (const name of this.backendRegistry.getEnabledBackends()) {
      const adapter = this.backendRegistry.getAdapter(name);
      if (adapter) {
        this.healthMonitor.registerBackend(name, adapter);
      }
    }
  }

  /**
   * Setup MCP tool handlers
   * @private
   */
  setupToolHandlers() {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: this.aliasResolver.generateToolList() };
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        const result = await this.handleToolCall(name, args);
        return {
          content: [{
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
          }]
        };
      } catch (error) {
        console.error(`❌ Tool error [${name}]:`, error.message);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error.message,
              tool: name,
              timestamp: new Date().toISOString()
            }, null, 2)
          }],
          isError: true
        };
      }
    });
  }

  /**
   * Handle tool call by routing to appropriate handler
   * @private
   */
  async handleToolCall(toolName, args) {
    // Resolve tool handler
    const handlerName = this.aliasResolver.resolveToolHandler(toolName);

    if (!handlerName) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    // Special handling for health check
    if (handlerName === 'handleHealth') {
      return this.handleHealth(args);
    }

    // Special handling for backend health check (on-demand)
    if (toolName === 'check_backend_health') {
      return this.handleCheckBackendHealth(args);
    }

    // Special handling for analytics
    if (handlerName === 'handleGetAnalytics') {
      return this.handleGetAnalytics(args);
    }

    // Delegate to handler factory
    return this.handlerFactory.execute(handlerName, args);
  }

  /**
   * Handle on-demand backend health check with caching
   * @private
   */
  async handleCheckBackendHealth(args = {}) {
    const { backend, force = false } = args;

    if (!backend) {
      throw new Error('Backend name is required');
    }

    // Check cache first unless force=true
    if (!force && this.healthCache.has(backend)) {
      const cached = this.healthCache.get(backend);
      const age = Date.now() - cached.timestamp;
      if (age < 300000) { // 5 min TTL
        return {
          success: true,
          backend,
          ...cached.result,
          cached: true,
          cacheAge: Math.floor(age / 1000) + 's'
        };
      }
    }

    // Perform actual health check
    const result = await this.healthMonitor.checkBackend(backend, force);

    // Cache result
    this.healthCache.set(backend, {
      result,
      timestamp: Date.now()
    });

    return {
      success: true,
      backend,
      ...result,
      cached: false
    };
  }

  /**
   * Handle health check with full system status
   * @private
   */
  async handleHealth(args = {}) {
    const { check_type = 'comprehensive', force_ip_rediscovery = false } = args;

    // Force health check
    const healthStatus = await this.healthMonitor.checkAll();

    // Get backend registry stats
    const registryStats = this.backendRegistry.getStats();

    // Get dynamic model info from local adapter
    const localAdapter = this.backendRegistry.getAdapter('local');
    const localModelInfo = localAdapter?.getModelInfo?.() || {};

    // Update local backend description with detected model
    if (localModelInfo.id && registryStats.backends) {
      const localBackend = registryStats.backends.find(b => b.name === 'local');
      if (localBackend) {
        localBackend.detectedModel = localModelInfo.id;
        localBackend.endpoint = localModelInfo.endpoint;
        localBackend.description = `Local ${localModelInfo.id} (dynamic)`;
      }
    }

    // Get request manager metrics
    const requestMetrics = this.requestManager.getMetrics();

    // Get playbook stats
    const playbookStats = this.playbook.getStats();

    // Get recommendations
    const recommendations = this.healthMonitor.getRecommendations();

    return {
      success: true,
      server: {
        name: SERVER_NAME,
        version: VERSION,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      },
      health: healthStatus,
      backends: registryStats,
      localModel: localModelInfo,
      requests: requestMetrics,
      playbook: playbookStats,
      recommendations,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Handle analytics request
   * @private
   */
  async handleGetAnalytics(args = {}) {
    const { report_type = 'current', time_range = '24h', format = 'json' } = args;

    const analytics = {
      session: {
        requests: this.requestManager.getMetrics(),
        backends: this.backendRegistry.getStats(),
        health: this.healthMonitor.getMetrics()
      },
      recommendations: this.healthMonitor.getRecommendations(),
      timestamp: new Date().toISOString()
    };

    if (format === 'markdown') {
      return this.formatAnalyticsAsMarkdown(analytics);
    }

    return {
      success: true,
      report_type,
      time_range,
      analytics
    };
  }

  /**
   * Format analytics as markdown
   * @private
   */
  formatAnalyticsAsMarkdown(analytics) {
    return `# MKG v2 Analytics Report

## Session Metrics
- Total Requests: ${analytics.session.requests.totalRequests}
- Completed: ${analytics.session.requests.completedRequests}
- Avg Response Time: ${analytics.session.requests.averageResponseTime?.toFixed(2)}ms
- Peak Concurrency: ${analytics.session.requests.peakConcurrency}

## Backend Status
- Healthy: ${analytics.session.backends.healthyBackends}/${analytics.session.backends.totalBackends}
- Fallback Chain: ${analytics.session.backends.fallbackChain?.join(' → ')}

## Recommendations
- Primary: ${analytics.recommendations.recommended || 'None'}
- Healthy: ${analytics.recommendations.healthy?.join(', ') || 'None'}
- Degraded: ${analytics.recommendations.degraded?.join(', ') || 'None'}

Generated: ${analytics.timestamp}`;
  }

  /**
   * Start the MCP server
   */
  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    // Health monitoring is now on-demand only (reactive checks on failures)
    // Automatic monitoring disabled to prevent excessive API calls
    // this.healthMonitor.startMonitoring(30000);

    console.error(`🚀 MKG v2 Server running on stdio transport`);
    console.error(`📊 Health monitoring: on-demand only (reactive mode)`);
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.error('🛑 Shutting down MKG v2 Server...');
    this.healthMonitor.stopMonitoring();
    await this.server.close();
  }
}

// Main entry point
async function main() {
  const server = new MKGServerV2();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await server.shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.shutdown();
    process.exit(0);
  });

  await server.start();
}

// Run if main module (ESM compatible)
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { MKGServerV2 };
