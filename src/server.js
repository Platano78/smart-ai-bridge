#!/usr/bin/env node

/**
 * Smart AI Bridge v2.0.0 - Modular MCP Server
 *
 * Thin entry point that wires together:
 * - Tool definitions (tools/tool-definitions.js)
 * - Handler factory (handlers/index.js)
 * - Backend registry (backends/backend-registry.js)
 * - Intelligence layer (intelligence/index.js)
 * - StdioServerTransport (MCP SDK)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { CORE_TOOL_DEFINITIONS } from './tools/tool-definitions.js';
import { HandlerFactory } from './handlers/index.js';
import { BackendRegistry } from './backends/backend-registry.js';
import { sanitizeForJSON } from './json-sanitizer.js';
import { PlaybookSystem } from './intelligence/playbook-system.js';
import { MultiAIRouter } from './router.js';
import CompoundLearningEngine from './intelligence/compound-learning.js';
import { HealthMonitor } from './monitoring/health-monitor.js';
import { DualWorkflowManager } from './intelligence/dual-workflow-manager.js';
import { LearningEngine } from './intelligence/learning-engine.js';
import { PatternRAGStore } from './intelligence/pattern-rag-store.js';
import ConversationThreading from './threading/conversation-threading.js';
import { UsageAnalytics } from './monitoring/usage-analytics.js';
import { setBackendRegistry } from './config/council-config-manager.js';
import { DashboardServer } from './dashboard/index.js';

const VERSION = '2.0.1';

console.error(`Smart AI Bridge v${VERSION} starting...`);

// ── 1. Initialize backend registry ──────────────────────────────
const backendRegistry = new BackendRegistry();
console.error(`[SAB] Backends initialized: ${backendRegistry.getBackendCount()} configured`);

// ── 2. Link council config to backend registry ──────────────────
setBackendRegistry(backendRegistry);

// ── 3. Initialize compound learning engine (routing intelligence) ─
const compoundLearning = new CompoundLearningEngine({
  dataDir: './data/learning',
  emaAlpha: 0.2,
  minSamples: 5,
  confidenceThreshold: 0.6,
  decayEnabled: true
});
console.error('[SAB] CompoundLearningEngine initialized');

// ── 4. Initialize health monitor ────────────────────────────────
const healthMonitor = new HealthMonitor({
  localTimeout: 10000,
  cloudTimeout: 3000,
  checkInterval: 30000
});

for (const [name, adapter] of backendRegistry.adapters) {
  healthMonitor.registerBackend(name, adapter);
}
console.error(`[SAB] HealthMonitor initialized, ${healthMonitor.backends.size} backends registered`);

// ── 5. Initialize dual workflow manager ─────────────────────────
const dualWorkflowManager = new DualWorkflowManager({
  healthMonitor,
  backendRegistry,
  learningEngine: compoundLearning,
  maxIterations: 3,
  qualityThreshold: 0.7,
  enableLearning: true
});
console.error('[SAB] DualWorkflowManager initialized');

// ── 6. Initialize code pattern learning engine ──────────────────
const patternStore = new PatternRAGStore({ storagePath: './data/patterns.json' });
const antiPatternStore = new PatternRAGStore({ storagePath: './data/anti-patterns.json' });
const codeLearningEngine = new LearningEngine({ patternStore, antiPatternStore });
await codeLearningEngine.init();
console.error('[SAB] LearningEngine (code patterns) initialized');

// ── 7. Initialize conversation threading ────────────────────────
const conversationThreading = new ConversationThreading('./data/conversations');
await conversationThreading.init();
console.error('[SAB] ConversationThreading initialized');

// ── 8. Initialize router with learning engine ───────────────────
const router = new MultiAIRouter(backendRegistry, { learningEngine: compoundLearning });
console.error('[SAB] MultiAIRouter initialized with learning engine');

// ── 9. Initialize usage analytics ───────────────────────────────
const usageAnalytics = new UsageAnalytics({ compoundLearning, router, backendRegistry });

// ── 10. Initialize intelligence layer ───────────────────────────
const playbook = new PlaybookSystem();

// ── 11. Build handler context ───────────────────────────────────
const handlerContext = {
  router,
  backendRegistry,
  playbook,
  healthMonitor,
  dualWorkflowManager,
  learningEngine: codeLearningEngine,
  compoundLearning,
  conversationThreading,
  usageAnalytics,
  server: {
    backendRegistry,
    VERSION,
  },
};

const handlerFactory = new HandlerFactory(handlerContext);

// ── Create MCP server ────────────────────────────────────────────
const server = new Server(
  {
    name: 'smart-ai-bridge',
    version: VERSION,
    description: 'Smart AI Bridge - Multi-AI orchestration MCP server with modular handler architecture'
  },
  {
    capabilities: {
      tools: {},
      logging: {}
    }
  }
);

// ── ListTools handler ────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = CORE_TOOL_DEFINITIONS.map(def => ({
    name: def.name,
    description: def.description,
    inputSchema: def.schema
  }));

  console.error(`[SAB] ListTools: ${tools.length} tools available`);
  return { tools };
});

// ── Build tool-name → handler-name mapping ───────────────────────
const toolToHandler = new Map();
for (const def of CORE_TOOL_DEFINITIONS) {
  toolToHandler.set(def.name, def.handler);
}

// ── CallTool handler ─────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const startTime = Date.now();

  console.error(`[SAB] CallTool: ${name}`);

  const handlerName = toolToHandler.get(name);
  if (!handlerName) {
    throw new McpError(
      ErrorCode.MethodNotFound,
      `Unknown tool: ${name}. Available: ${[...toolToHandler.keys()].join(', ')}`
    );
  }

  try {
    const result = await handlerFactory.execute(handlerName, args || {});
    const elapsed = Date.now() - startTime;
    console.error(`[SAB] ${name} completed in ${elapsed}ms`);

    // Normalize result format
    // If handler already returns MCP-formatted content array, pass through directly
    if (typeof result === 'object' && result !== null && Array.isArray(result.content)
        && result.content.length > 0 && result.content[0].type === 'text') {
      return result;
    }

    const content = typeof result === 'string'
      ? result
      : typeof result === 'object' && result !== null
        ? JSON.stringify(sanitizeForJSON(result), null, 2)
        : String(result);

    return {
      content: [{
        type: 'text',
        text: content
      }]
    };

  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[SAB] ${name} failed after ${elapsed}ms: ${error.message}`);

    if (error instanceof McpError) {
      throw error;
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: error.message,
          tool: name,
          elapsed_ms: elapsed
        })
      }],
      isError: true
    };
  }
});

// ── Connect transport ────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);

console.error(`Smart AI Bridge v${VERSION} connected via stdio`);
console.error(`Tools: ${toolToHandler.size} | Backends: ${backendRegistry.getStats().totalBackends}`);

// ── Dashboard (optional, env-gated) ─────────────────────────────
if (process.env.SAB_DASHBOARD === 'true') {
  const dashboard = new DashboardServer({
    port: parseInt(process.env.SAB_DASHBOARD_PORT || '3456'),
    backendRegistry,
    conversationThreading
  });
  await dashboard.start();
  console.error(`[SAB] Dashboard running on port ${dashboard.port}`);
}
