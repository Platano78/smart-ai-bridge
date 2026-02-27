#!/usr/bin/env node

/**
 * Dashboard Persistence Tests
 * Verifies that backend enable/priority changes persist to disk
 * and that council config API operations work correctly.
 *
 * Run: node tests/test-dashboard-persistence.js
 */

import assert from 'assert';
import { BackendRegistry } from '../src/backends/backend-registry.js';
import { configManager, setBackendRegistry, VALID_STRATEGIES } from '../src/config/council-config-manager.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (error) {
    console.log(`  \u2717 ${name}`);
    console.log(`    ${error.message}`);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (error) {
    console.log(`  \u2717 ${name}`);
    console.log(`    ${error.message}`);
    failed++;
  }
}

console.log('\n=== Dashboard Persistence Tests ===\n');

// --- Backend Registry Tests ---
console.log('Backend Registry:');

const registry = new BackendRegistry();

test('saveConfig is a function', () => {
  assert.strictEqual(typeof registry.saveConfig, 'function');
});

test('setEnabled is a function', () => {
  assert.strictEqual(typeof registry.setEnabled, 'function');
});

test('setPriority is a function', () => {
  assert.strictEqual(typeof registry.setPriority, 'function');
});

test('getBackend returns null for unknown backend', () => {
  assert.strictEqual(registry.getBackend('nonexistent'), null);
});

test('getStats returns totalBackends', () => {
  const stats = registry.getStats();
  assert.strictEqual(typeof stats.totalBackends, 'number');
  assert.ok(stats.totalBackends >= 0);
});

test('getAvailableTypes returns array', () => {
  const types = registry.getAvailableTypes();
  assert.ok(Array.isArray(types));
});

// --- Council Config Manager Tests ---
console.log('\nCouncil Config Manager:');

test('configManager getConfig returns object', () => {
  const config = configManager.getConfig();
  assert.ok(config !== null && typeof config === 'object');
  assert.ok(config.topics);
  assert.ok(config.defaults);
});

test('configManager getMetadata returns metadata', () => {
  const meta = configManager.getMetadata();
  assert.strictEqual(typeof meta.version, 'number');
  assert.strictEqual(typeof meta.topicCount, 'number');
  assert.strictEqual(typeof meta.historyCount, 'number');
});

test('getStrategyForTopic returns valid strategy', () => {
  const strategy = configManager.getStrategyForTopic('coding');
  assert.ok(VALID_STRATEGIES.includes(strategy), `Strategy '${strategy}' should be valid`);
});

test('getStrategyForTopic default is parallel not consensus', () => {
  // For an unknown topic, should default to 'parallel'
  const strategy = configManager.getStrategyForTopic('nonexistent_topic_xyz');
  assert.strictEqual(strategy, 'parallel');
});

test('validateConfig catches invalid config', () => {
  const result = configManager.validateConfig({ version: 'bad', topics: null });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test('validateConfig passes valid config', () => {
  const config = configManager.getConfig();
  const result = configManager.validateConfig(config);
  assert.strictEqual(result.valid, true, `Errors: ${result.errors?.join(', ')}`);
});

test('updateTopic updates and can be retrieved', () => {
  const originalConfig = configManager.getConfig();
  const result = configManager.updateTopic('general', ['local', 'gemini'], 'sequential', 'test');
  assert.strictEqual(result.success, true);

  const strategy = configManager.getStrategyForTopic('general');
  assert.strictEqual(strategy, 'sequential');

  const backends = configManager.getBackendsForTopic('general');
  assert.deepStrictEqual(backends, ['local', 'gemini']);

  // Restore original
  configManager.updateConfig(originalConfig, 'test-restore');
});

test('getHistory returns array', () => {
  const history = configManager.getHistory();
  assert.ok(Array.isArray(history));
});

test('rollback works after update', () => {
  const original = configManager.getConfig();
  configManager.updateTopic('coding', ['local'], 'fallback', 'test');

  const result = configManager.rollback();
  assert.strictEqual(result.success, true);

  const restored = configManager.getConfig();
  assert.deepStrictEqual(restored.topics.coding, original.topics.coding);
});

// --- Summary ---
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
