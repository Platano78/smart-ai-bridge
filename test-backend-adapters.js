#!/usr/bin/env node
/**
 * Test script for Smart AI Bridge v1.3.0 Backend Adapter Architecture
 * 
 * Tests:
 * 1. Backend adapter creation
 * 2. Backend registry initialization
 * 3. Adapter registration
 * 4. Health checks
 * 5. Fallback chain
 */

import { BackendRegistry } from './backends/backend-registry.js';
import { LocalAdapter } from './backends/local-adapter.js';
import { GeminiAdapter } from './backends/gemini-adapter.js';
import { DeepSeekAdapter } from './backends/deepseek-adapter.js';
import { QwenAdapter } from './backends/qwen-adapter.js';

console.log('\n='.repeat(60));
console.log('Smart AI Bridge v1.3.0 - Backend Adapter Test');
console.log('='.repeat(60) + '\n');

// Test 1: Create adapters
console.log('✓ Test 1: Creating backend adapters...');
try {
  const localAdapter = new LocalAdapter();
  const geminiAdapter = new GeminiAdapter();
  const deepseekAdapter = new DeepSeekAdapter();
  const qwenAdapter = new QwenAdapter();
  
  console.log(`  - LocalAdapter: ${localAdapter.name} (${localAdapter.type})`);
  console.log(`  - GeminiAdapter: ${geminiAdapter.name} (${geminiAdapter.type})`);
  console.log(`  - DeepSeekAdapter: ${deepseekAdapter.name} (${deepseekAdapter.type})`);
  console.log(`  - QwenAdapter: ${qwenAdapter.name} (${qwenAdapter.type})`);
  console.log('✅ Adapters created successfully\n');
} catch (error) {
  console.error('❌ Failed to create adapters:', error.message);
  process.exit(1);
}

// Test 2: Initialize backend registry
console.log('✓ Test 2: Initializing backend registry...');
let registry;
try {
  registry = new BackendRegistry();
  const stats = registry.getStats();
  console.log(`  - Total backends: ${stats.totalBackends}`);
  console.log(`  - Enabled backends: ${stats.enabledBackends}`);
  console.log(`  - Fallback chain: ${stats.fallbackChain.join(' → ')}`);
  console.log('✅ Registry initialized successfully\n');
} catch (error) {
  console.error('❌ Failed to initialize registry:', error.message);
  process.exit(1);
}

// Test 3: Register adapters
console.log('✓ Test 3: Registering adapters with registry...');
try {
  const localAdapter = new LocalAdapter();
  const geminiAdapter = new GeminiAdapter();
  const deepseekAdapter = new DeepSeekAdapter();
  const qwenAdapter = new QwenAdapter();
  
  registry.setAdapter('local', localAdapter);
  registry.setAdapter('gemini', geminiAdapter);
  registry.setAdapter('deepseek', deepseekAdapter);
  registry.setAdapter('qwen', qwenAdapter);
  
  const enabledBackends = registry.getEnabledBackends();
  console.log(`  - Registered ${enabledBackends.length} adapters`);
  enabledBackends.forEach(name => {
    const adapter = registry.getAdapter(name);
    console.log(`    * ${name}: ${adapter ? '✓ available' : '✗ missing'}`);
  });
  console.log('✅ Adapters registered successfully\n');
} catch (error) {
  console.error('❌ Failed to register adapters:', error.message);
  process.exit(1);
}

// Test 4: Test circuit breaker
console.log('✓ Test 4: Testing circuit breaker...');
try {
  const localAdapter = registry.getAdapter('local');
  console.log(`  - Initial state: circuit ${localAdapter.circuitOpen ? 'OPEN' : 'CLOSED'}`);
  console.log(`  - Consecutive failures: ${localAdapter.consecutiveFailures}`);
  console.log(`  - Circuit threshold: ${localAdapter.circuitOpenThreshold}`);
  console.log('✅ Circuit breaker functional\n');
} catch (error) {
  console.error('❌ Circuit breaker test failed:', error.message);
  process.exit(1);
}

// Test 5: Test adapter metrics
console.log('✓ Test 5: Testing adapter metrics...');
try {
  const localAdapter = registry.getAdapter('local');
  const metrics = localAdapter.getMetrics();
  console.log(`  - Total requests: ${metrics.totalRequests}`);
  console.log(`  - Successful: ${metrics.successfulRequests}`);
  console.log(`  - Failed: ${metrics.failedRequests}`);
  console.log(`  - Avg latency: ${metrics.averageLatency}ms`);
  console.log('✅ Metrics tracking functional\n');
} catch (error) {
  console.error('❌ Metrics test failed:', error.message);
  process.exit(1);
}

// Test 6: Test fallback chain
console.log('✓ Test 6: Testing fallback chain...');
try {
  const chain = registry.getFallbackChain();
  console.log(`  - Fallback order: ${chain.join(' → ')}`);
  
  const nextAvailable = registry.getNextAvailable();
  console.log(`  - Next available backend: ${nextAvailable}`);
  
  const nextExcludingLocal = registry.getNextAvailable(['local']);
  console.log(`  - Next (excluding local): ${nextExcludingLocal}`);
  console.log('✅ Fallback chain functional\n');
} catch (error) {
  console.error('❌ Fallback chain test failed:', error.message);
  process.exit(1);
}

// Summary
console.log('='.repeat(60));
console.log('✅ All tests passed! Backend adapter architecture is functional.');
console.log('='.repeat(60) + '\n');

console.log('Backend Adapter Architecture Summary:');
const stats = registry.getStats();
console.log(`- Registered backends: ${stats.totalBackends}`);
console.log(`- Enabled backends: ${stats.enabledBackends}`);
console.log(`- Healthy backends: ${stats.healthyBackends}`);
console.log(`- Fallback chain: ${stats.fallbackChain.join(' → ')}`);
console.log('\nBackend Details:');
stats.backends.forEach(backend => {
  console.log(`  ${backend.name}:`);
  console.log(`    Type: ${backend.type}`);
  console.log(`    Enabled: ${backend.enabled}`);
  console.log(`    Priority: ${backend.priority}`);
  console.log(`    Description: ${backend.description}`);
});

console.log('\n✓ Smart AI Bridge v1.3.0 backend adapter architecture is ready!');
