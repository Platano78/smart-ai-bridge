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

const VERSION = '2.0.0';

console.error(`Smart AI Bridge v${VERSION} starting...`);

// ── Initialize backend registry ──────────────────────────────────
const backendRegistry = new BackendRegistry();

console.error(`Backends initialized: ${backendRegistry.getAvailableBackends?.() || 'registry ready'}`);

// ── Initialize router ────────────────────────────────────────────
const router = new MultiAIRouter(backendRegistry);

// ── Initialize intelligence layer ────────────────────────────────
const playbook = new PlaybookSystem();

// ── Build handler context ────────────────────────────────────────
const handlerContext = {
  router,
  server: {
    backendRegistry,
    VERSION,
  },
  playbook,
  backendRegistry,
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
    const content = typeof result === 'string'
      ? result
      : typeof result === 'object' && result !== null
        ? (result.content || JSON.stringify(sanitizeForJSON(result), null, 2))
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
console.error(`Tools: ${toolToHandler.size} | Backends: 6`);
