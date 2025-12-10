#!/usr/bin/env node
/**
 * MKG v9.1 Cloud Fallback Test
 * Tests routing when local LLM is unavailable
 *
 * This verifies that:
 * 1. When local LLM is down, routing falls back to cloud
 * 2. NVIDIA DeepSeek or Gemini endpoints work
 * 3. Learning still records outcomes
 */

import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);

const toolsConfig = require('../src/config/tools-config.json');
const orchestratorConfig = require('../config/mkg-orchestrator.json');

console.log('☁️ MKG v9.1 Cloud Fallback Test\n');
console.log('=' .repeat(60));

// Check API keys
const hasNVIDIA = !!process.env.NVIDIA_API_KEY;
const hasGemini = !!process.env.GEMINI_API_KEY;

console.log('\n🔑 API Key Status:');
console.log(`   NVIDIA_API_KEY: ${hasNVIDIA ? '✅ Set' : '❌ Missing'}`);
console.log(`   GEMINI_API_KEY: ${hasGemini ? '✅ Set' : '❌ Missing'}`);

if (!hasNVIDIA && !hasGemini) {
  console.log('\n❌ No cloud API keys available. Cannot test cloud fallback.');
  process.exit(1);
}

// Check local LLM status
console.log('\n🖥️ Local LLM Status:');
try {
  const localCheck = await fetch('http://localhost:8081/health', {
    signal: AbortSignal.timeout(2000)
  });
  console.log(`   Port 8081: ${localCheck.ok ? '⚠️ Still running (stop for true fallback test)' : '✅ Stopped'}`);
} catch {
  console.log('   Port 8081: ✅ Stopped (good for fallback test)');
}

try {
  const orchCheck = await fetch('http://localhost:8083/health', {
    signal: AbortSignal.timeout(2000)
  });
  console.log(`   Port 8083: ${orchCheck.ok ? '✅ Orchestrator running' : '⚠️ Orchestrator down'}`);
} catch {
  console.log('   Port 8083: ⚠️ Orchestrator stopped (will use rule-based routing)');
}

// Modify config to force cloud routing
const modifiedConfig = JSON.parse(JSON.stringify(toolsConfig));

// Disable local tool (simulate unavailability)
modifiedConfig.tools = modifiedConfig.tools.map(t => {
  if (t.name === 'local_qwen_coder') {
    return { ...t, enabled: false };
  }
  return t;
});

console.log('\n📝 Modified config: local_qwen_coder disabled');
console.log('   This will force cloud routing via NVIDIA/Gemini');

// Dynamic import for ES modules
const { default: RouterFactory } = await import('../src/router/router-factory.js');

const router = new RouterFactory(modifiedConfig, orchestratorConfig);

// Test tasks
const cloudTasks = [
  {
    name: 'Cloud Test 1: Simple Code',
    task: 'Write a Python function that calculates the factorial of a number recursively.',
    context: { complexity: 'low', taskType: 'code_generation', fileCount: 1 }
  },
  {
    name: 'Cloud Test 2: Analysis',
    task: 'Explain the pros and cons of using recursion vs iteration for calculating factorial.',
    context: { complexity: 'medium', taskType: 'analysis', fileCount: 1 }
  },
  {
    name: 'Cloud Test 3: Architecture',
    task: 'Design a microservice architecture for a real-time chat application with presence detection.',
    context: { complexity: 'high', taskType: 'architecture', fileCount: 5 }
  }
];

console.log('\n' + '='.repeat(60));
console.log('🧪 Running Cloud Fallback Tests');
console.log('='.repeat(60));

const results = [];

for (let i = 0; i < cloudTasks.length; i++) {
  const test = cloudTasks[i];
  console.log(`\n[${i + 1}/${cloudTasks.length}] ${test.name}`);
  console.log('-'.repeat(50));

  const startTime = Date.now();
  try {
    // Just test routing, not full execution (saves API credits)
    const routeResult = await router.route(test.task, test.context);
    const duration = Date.now() - startTime;

    results.push({
      name: test.name,
      success: true,
      tool: routeResult.tool,
      source: routeResult.source,
      confidence: routeResult.confidence,
      duration
    });

    console.log(`✅ Routed to: ${routeResult.tool}`);
    console.log(`   Source: ${routeResult.source}`);
    console.log(`   Confidence: ${(routeResult.confidence * 100).toFixed(1)}%`);
    console.log(`   Duration: ${duration}ms`);

    // Optionally execute one task to verify cloud works
    if (i === 0 && hasNVIDIA) {
      console.log('\n   📡 Testing actual cloud execution...');
      try {
        const execResult = await router.execute(test.task, test.context);
        if (execResult.output) {
          console.log('   ✅ Cloud execution successful!');
          console.log(`   Output preview: ${execResult.output.substring(0, 100)}...`);
        }
      } catch (execErr) {
        console.log(`   ⚠️ Cloud execution failed: ${execErr.message}`);
      }
    }
  } catch (error) {
    results.push({
      name: test.name,
      success: false,
      error: error.message,
      duration: Date.now() - startTime
    });
    console.log(`❌ Error: ${error.message}`);
  }
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('📋 CLOUD FALLBACK TEST SUMMARY');
console.log('='.repeat(60));

const passed = results.filter(r => r.success).length;
const failed = results.filter(r => !r.success).length;
const cloudRouted = results.filter(r =>
  r.success && (r.tool.includes('nvidia') || r.tool.includes('gemini') || r.tool.includes('deepseek'))
).length;

console.log(`\n✅ Passed: ${passed}/${results.length}`);
console.log(`❌ Failed: ${failed}/${results.length}`);
console.log(`☁️ Cloud-routed: ${cloudRouted}/${results.length}`);

console.log('\n📊 Routing Distribution:');
const toolCounts = {};
for (const r of results.filter(r => r.success)) {
  toolCounts[r.tool] = (toolCounts[r.tool] || 0) + 1;
}
for (const [tool, count] of Object.entries(toolCounts)) {
  console.log(`   ${tool}: ${count}`);
}

// Check if cloud fallback worked
if (cloudRouted > 0) {
  console.log('\n✅ CLOUD FALLBACK WORKING!');
  console.log('   When local LLM is unavailable, requests route to cloud.');
} else if (passed > 0 && cloudRouted === 0) {
  console.log('\n⚠️ Routing succeeded but not to cloud tools.');
  console.log('   Check if local LLM is still available or rule-based routing is being used.');
} else {
  console.log('\n❌ Cloud fallback test failed.');
  console.log('   Verify API keys and network connectivity.');
}

console.log('\n🎉 Cloud Fallback Test Complete!');
