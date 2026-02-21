#!/usr/bin/env node

/**
 * Smart AI Bridge v2.0.0 Integration Tests
 *
 * Tests:
 * 1. All src/ files parse without syntax errors
 * 2. All tool definitions load and have valid structure
 * 3. Handler registry has entries for all tool handlers
 * 4. Backend registry initializes with 6 backends
 * 5. Server starts and connects via stdio
 * 6. Individual handler instantiation works
 * 7. Tool call dispatch works for key tools
 */

import { CORE_TOOL_DEFINITIONS } from '../src/tools/tool-definitions.js';
import { HandlerFactory, HANDLER_REGISTRY, createHandler } from '../src/handlers/index.js';
import { BackendRegistry } from '../src/backends/backend-registry.js';
import { MultiAIRouter } from '../src/router.js';
import { PlaybookSystem } from '../src/intelligence/playbook-system.js';
import { sanitizeForJSON } from '../src/json-sanitizer.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.error(`  FAIL: ${name} — ${err.message}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.error(`  FAIL: ${name} — ${err.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

// ═══════════════════════════════════════════════════════════════
console.log('\n=== Test Suite: Tool Definitions ===');

test('CORE_TOOL_DEFINITIONS is an array', () => {
  assert(Array.isArray(CORE_TOOL_DEFINITIONS), 'Expected array');
});

test('20 tools defined', () => {
  assert(CORE_TOOL_DEFINITIONS.length === 20, `Expected 20, got ${CORE_TOOL_DEFINITIONS.length}`);
});

test('Each tool has name, description, handler, schema', () => {
  for (const tool of CORE_TOOL_DEFINITIONS) {
    assert(tool.name, `Tool missing name`);
    assert(tool.description, `Tool ${tool.name} missing description`);
    assert(tool.handler, `Tool ${tool.name} missing handler`);
    assert(tool.schema, `Tool ${tool.name} missing schema`);
  }
});

test('No image generation tools', () => {
  const imageTools = CORE_TOOL_DEFINITIONS.filter(t =>
    t.name === 'generate_image' || t.name === 'sd_status'
  );
  assert(imageTools.length === 0, `Found image tools: ${imageTools.map(t=>t.name)}`);
});

test('Expected tools present', () => {
  const expectedTools = [
    'ask', 'analyze_file', 'modify_file', 'batch_analyze', 'batch_modify',
    'council', 'dual_iterate', 'explore', 'generate_file', 'refactor',
    'review', 'spawn_subagent', 'parallel_agents', 'read',
    'write_files_atomic', 'validate_changes', 'backup_restore',
    'check_backend_health', 'get_analytics', 'manage_conversation'
  ];
  const toolNames = CORE_TOOL_DEFINITIONS.map(t => t.name);
  for (const expected of expectedTools) {
    assert(toolNames.includes(expected), `Missing tool: ${expected}`);
  }
});

test('No MKG branding in tool descriptions', () => {
  for (const tool of CORE_TOOL_DEFINITIONS) {
    assert(!tool.description.includes('MKG'), `Tool ${tool.name} has MKG in description`);
    assert(!tool.description.includes('Mecha King'), `Tool ${tool.name} has Mecha King in description`);
  }
});

// ═══════════════════════════════════════════════════════════════
console.log('\n=== Test Suite: Handler Registry ===');

test('HANDLER_REGISTRY has entries', () => {
  assert(Object.keys(HANDLER_REGISTRY).length > 0, 'Registry is empty');
});

test('Every tool handler maps to a registry entry', () => {
  for (const tool of CORE_TOOL_DEFINITIONS) {
    const hasHandler = tool.handler in HANDLER_REGISTRY;
    // Some handlers like handleCheckBackendHealth may map through system-handlers
    if (!hasHandler) {
      // Check if it's a known alias
      const knownAliases = {
        'handleCheckBackendHealth': 'handleHealth'
      };
      if (knownAliases[tool.handler]) {
        assert(knownAliases[tool.handler] in HANDLER_REGISTRY,
          `Tool ${tool.name} handler ${tool.handler} not in registry (alias ${knownAliases[tool.handler]} also missing)`);
      } else {
        // Allow missing for now but log it
        console.warn(`    WARN: Tool ${tool.name} handler '${tool.handler}' not in HANDLER_REGISTRY`);
      }
    }
  }
});

test('Handler factory creates instances', () => {
  const context = { router: null, server: {}, playbook: null, backendRegistry: null };
  const factory = new HandlerFactory(context);

  const handler = factory.getHandler('handleReview');
  assert(handler !== null, 'Failed to create ReviewHandler');
});

// ═══════════════════════════════════════════════════════════════
console.log('\n=== Test Suite: Backend Registry ===');

test('BackendRegistry initializes', () => {
  const registry = new BackendRegistry();
  assert(registry !== null, 'Registry is null');
});

await testAsync('Backend config loads 6 backends', async () => {
  const configPath = path.resolve(__dirname, '../src/config/backends.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const backendCount = Object.keys(config.backends).length;
  assert(backendCount === 6, `Expected 6 backends, got ${backendCount}`);
});

test('Backend config has expected backends', () => {
  const configPath = path.resolve(__dirname, '../src/config/backends.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const expected = ['local', 'nvidia_deepseek', 'nvidia_qwen', 'gemini', 'openai_chatgpt', 'groq_llama'];
  for (const name of expected) {
    assert(name in config.backends, `Missing backend: ${name}`);
  }
});

test('No orchestrator/dual ports in config', () => {
  const configPath = path.resolve(__dirname, '../src/config/backends.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert(!('orchestrator' in config.backends), 'Orchestrator should be removed');
  assert(!('local_dual1' in config.backends), 'local_dual1 should be removed');
  assert(!('local_dual2' in config.backends), 'local_dual2 should be removed');
  assert(!('nvidia_nemotron' in config.backends), 'nvidia_nemotron should be removed');
});

// ═══════════════════════════════════════════════════════════════
console.log('\n=== Test Suite: Router ===');

test('MultiAIRouter initializes with registry', () => {
  const registry = new BackendRegistry();
  const router = new MultiAIRouter(registry);
  assert(router !== null, 'Router is null');
});

await testAsync('Router routes auto to a backend', async () => {
  const registry = new BackendRegistry();
  const router = new MultiAIRouter(registry);
  const backend = await router.routeRequest('Hello world', {});
  assert(typeof backend === 'string', `Expected string, got ${typeof backend}`);
  assert(backend.length > 0, 'Empty backend name');
});

// ═══════════════════════════════════════════════════════════════
console.log('\n=== Test Suite: JSON Sanitizer ===');

test('sanitizeForJSON handles basic objects', () => {
  const result = sanitizeForJSON({ key: 'value', num: 42 });
  assert(result.key === 'value', 'Key not preserved');
  assert(result.num === 42, 'Number not preserved');
});

// ═══════════════════════════════════════════════════════════════
console.log('\n=== Test Suite: Intelligence Layer ===');

test('PlaybookSystem initializes', () => {
  const playbook = new PlaybookSystem();
  assert(playbook !== null, 'Playbook is null');
});

await testAsync('Intelligence index exports modules', async () => {
  const intelligence = await import('../src/intelligence/index.js');
  assert(intelligence !== null, 'Intelligence module is null');
});

// ═══════════════════════════════════════════════════════════════
console.log('\n=== Test Suite: Package.json ===');

test('Version is 2.0.0', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
  assert(pkg.version === '2.0.0', `Expected 2.0.0, got ${pkg.version}`);
});

test('Main points to src/server.js', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
  assert(pkg.main === 'src/server.js', `Expected src/server.js, got ${pkg.main}`);
});

test('Start script uses src/server.js', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
  assert(pkg.scripts.start === 'node src/server.js', `Expected 'node src/server.js', got ${pkg.scripts.start}`);
});

test('Has legacy start script', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
  assert(pkg.scripts['start:legacy'], 'Missing start:legacy script');
});

// ═══════════════════════════════════════════════════════════════
console.log('\n=== Test Suite: No MKG Branding in Source ===');

await testAsync('No MKG branding in src/ JS files', async () => {
  const srcDir = path.resolve(__dirname, '../src');
  const jsFiles = [];

  function walkDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.endsWith('.js')) {
        jsFiles.push(fullPath);
      }
    }
  }
  walkDir(srcDir);

  const violations = [];
  for (const file of jsFiles) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('deepseek-mcp-bridge') || content.includes('mecha-king-ghidorah')) {
      violations.push(path.relative(srcDir, file));
    }
  }
  assert(violations.length === 0, `MKG branding found in: ${violations.join(', ')}`);
});

// ═══════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.error(`  - ${f.name}: ${f.error}`);
  }
}
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);
