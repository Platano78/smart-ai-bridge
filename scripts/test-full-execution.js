#!/usr/bin/env node
/**
 * Full Execution Flow Test - MKG v9.1
 *
 * Tests the complete pipeline:
 * 1. Perception → 2. Orchestrator Routing → 3. AI Execution → 4. Verification
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load config
const configPath = join(__dirname, '../src/config/tools-config.json');
const orchestratorConfigPath = join(__dirname, '../config/mkg-orchestrator.json');

const toolsConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const orchestratorConfig = JSON.parse(fs.readFileSync(orchestratorConfigPath, 'utf8'));

// Dynamic imports
const { default: RouterFactory } = await import('../src/router/router-factory.js');

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║          MKG v9.1 - Full Execution Flow Test                 ║');
console.log('╠══════════════════════════════════════════════════════════════╣');
console.log('║  Testing: Perception → Routing → Execution → Verification   ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// Check endpoints first
async function checkEndpoints() {
  console.log('📡 Checking AI Backend Endpoints...\n');

  const endpoints = [
    { name: 'Local Coder (Qwen2.5-7B)', url: 'http://localhost:8081/health', required: true },
    { name: 'Orchestrator (8B)', url: 'http://localhost:8083/health', required: true },
    { name: 'NVIDIA NIM API', url: null, check: () => !!process.env.NVIDIA_API_KEY, required: false },
    { name: 'Gemini API', url: null, check: () => !!process.env.GEMINI_API_KEY, required: false }
  ];

  const results = [];

  for (const ep of endpoints) {
    let status = '❌';
    let detail = '';

    try {
      if (ep.url) {
        const resp = await fetch(ep.url, { signal: AbortSignal.timeout(3000) });
        if (resp.ok) {
          status = '✅';
          detail = 'Healthy';
        } else {
          detail = `HTTP ${resp.status}`;
        }
      } else if (ep.check) {
        if (ep.check()) {
          status = '✅';
          detail = 'API Key Set';
        } else {
          status = ep.required ? '❌' : '⚠️';
          detail = 'API Key Missing';
        }
      }
    } catch (e) {
      status = ep.required ? '❌' : '⚠️';
      detail = e.message.includes('timeout') ? 'Timeout' : 'Not reachable';
    }

    console.log(`  ${status} ${ep.name}: ${detail}`);
    results.push({ ...ep, status, detail });
  }

  console.log('');
  return results;
}

// Test scenarios
const testCases = [
  {
    name: 'Simple Code Generation (Local)',
    task: 'Write a Python function that calculates the factorial of a number using recursion.',
    context: {
      complexity: 'low',
      fileCount: 1,
      taskType: 'code_generation',
      workingDir: '/home/platano/project/deepseek-mcp-bridge'
    },
    expectedRoute: 'local_qwen_coder',
    expectPerception: false
  },
  {
    name: 'Complex Refactoring (Orchestrator Decides)',
    task: 'Refactor the user authentication module to support OAuth2 with multiple providers (Google, GitHub, Microsoft). Ensure backward compatibility with existing session-based auth.',
    context: {
      complexity: 'high',
      fileCount: 8,
      taskType: 'refactoring',
      workingDir: '/home/platano/project/deepseek-mcp-bridge'
    },
    expectedRoute: 'nvidia_qwen480b',
    expectPerception: true
  },
  {
    name: 'Code Analysis (DeepSeek Reasoning)',
    task: 'Analyze this codebase and identify potential security vulnerabilities in the authentication flow.',
    context: {
      complexity: 'medium',
      fileCount: 5,
      taskType: 'analysis',
      workingDir: '/home/platano/project/deepseek-mcp-bridge'
    },
    expectedRoute: 'nvidia_deepseek_v3',
    expectPerception: true
  },
  {
    name: 'Quick Fix (Local)',
    task: 'Fix the syntax error in this JavaScript code: const x = { a: 1 b: 2 };',
    context: {
      complexity: 'low',
      fileCount: 1,
      taskType: 'bug_fix'
    },
    expectedRoute: 'local_qwen_coder',
    expectPerception: false
  },
  {
    name: 'Architecture Design (Orchestrator Decides)',
    task: 'Design a microservices architecture for a real-time multiplayer game with matchmaking, leaderboards, and player progression systems.',
    context: {
      complexity: 'high',
      fileCount: 0,
      taskType: 'architecture',
      workingDir: '/home/platano/project/deepseek-mcp-bridge'
    },
    expectedRoute: null, // Orchestrator decides
    expectPerception: true
  }
];

// Run tests
async function runTests() {
  const endpointStatus = await checkEndpoints();

  const localOK = endpointStatus.find(e => e.name.includes('Local Coder'))?.status === '✅';
  const orchestratorOK = endpointStatus.find(e => e.name.includes('Orchestrator'))?.status === '✅';

  if (!localOK) {
    console.log('⛔ Local Coder not available. Run: ~/scripts/orchestrator-mode-start.sh');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log('🧪 Running Test Cases...\n');

  const router = new RouterFactory(toolsConfig, orchestratorConfig);
  const results = [];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\n📋 Test ${i + 1}/${testCases.length}: ${tc.name}`);
    console.log(`   Task: "${tc.task.slice(0, 60)}..."`);
    console.log(`   Context: complexity=${tc.context.complexity}, files=${tc.context.fileCount}, type=${tc.context.taskType}`);

    const startTime = Date.now();

    try {
      // Test routing only first
      console.log('\n   🔀 Routing Decision:');
      const routing = await router.route(tc.task, tc.context);
      const routeTime = Date.now() - startTime;

      console.log(`      Tool: ${routing.tool}`);
      console.log(`      Source: ${routing.source} (${routing.confidence ? (routing.confidence * 100).toFixed(0) + '% confidence' : 'n/a'})`);
      console.log(`      Reasoning: ${routing.reasoning?.slice(0, 80)}...`);
      console.log(`      Latency: ${routeTime}ms`);

      if (routing.perception) {
        console.log(`\n   🔍 Perception:${routing.perception.cached ? ' (cached)' : ''}`);
        console.log(`      Language: ${routing.perception.language?.primary} (${(routing.perception.language?.confidence * 100).toFixed(1)}%)`);
        console.log(`      Files indexed: ${routing.perception.existingFiles?.length || 0}`);
      }

      // Show perception trigger scoring
      const perceptionDecision = router.perceptionEngine?.getLastDecision();
      if (perceptionDecision) {
        console.log(`\n   📊 Perception Score: ${perceptionDecision.score}/${perceptionDecision.threshold} (${perceptionDecision.triggered ? 'triggered' : 'skipped'})`);
        if (perceptionDecision.reasons.length > 0) {
          console.log(`      Reasons: ${perceptionDecision.reasons.join(', ')}`);
        }
      }

      // Check expectations
      let routePass = true;
      if (tc.expectedRoute && routing.tool !== tc.expectedRoute) {
        console.log(`\n   ⚠️  Expected route: ${tc.expectedRoute}, got: ${routing.tool}`);
        routePass = false;
      }

      let perceptionPass = true;
      if (tc.expectPerception && !routing.perception) {
        console.log(`   ⚠️  Expected perception to trigger, but it didn't`);
        perceptionPass = false;
      }

      // Full execution test (only for first simple case to test the pipeline)
      if (i === 0 && localOK) {
        console.log('\n   🚀 Full Execution Test:');
        const execStart = Date.now();

        try {
          const result = await router.execute(tc.task, tc.context);
          const execTime = Date.now() - execStart;

          console.log(`      Output length: ${result.output?.length || 0} chars`);
          console.log(`      Verification: ${result.verification?.passed ? '✅ Passed' : result.verification?.passed === false ? '❌ Failed' : '⏭️ Skipped'}`);
          console.log(`      Total execution: ${execTime}ms`);

          // Show first 200 chars of output
          if (result.output) {
            console.log(`\n   📝 Output Preview:`);
            console.log(`      "${result.output.slice(0, 200).replace(/\n/g, '\n      ')}..."`);
          }

          results.push({
            name: tc.name,
            status: '✅',
            routing: routing.tool,
            source: routing.source,
            latency: execTime,
            verified: result.verification?.passed
          });
        } catch (execErr) {
          console.log(`      ❌ Execution failed: ${execErr.message}`);
          results.push({
            name: tc.name,
            status: '❌',
            error: execErr.message
          });
        }
      } else {
        // Just record routing result
        results.push({
          name: tc.name,
          status: routePass && perceptionPass ? '✅' : '⚠️',
          routing: routing.tool,
          source: routing.source,
          latency: routeTime,
          notes: !routePass ? 'Route mismatch' : !perceptionPass ? 'Perception not triggered' : null
        });
      }

    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
      results.push({
        name: tc.name,
        status: '❌',
        error: err.message
      });
    }

    console.log('');
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\n📊 Test Summary\n');

  const passed = results.filter(r => r.status === '✅').length;
  const warnings = results.filter(r => r.status === '⚠️').length;
  const failed = results.filter(r => r.status === '❌').length;

  console.log(`   ✅ Passed:   ${passed}/${results.length}`);
  console.log(`   ⚠️  Warnings: ${warnings}/${results.length}`);
  console.log(`   ❌ Failed:   ${failed}/${results.length}`);

  console.log('\n   Routing Distribution:');
  const routeCounts = {};
  results.forEach(r => {
    if (r.routing) {
      routeCounts[r.routing] = (routeCounts[r.routing] || 0) + 1;
    }
  });
  Object.entries(routeCounts).forEach(([tool, count]) => {
    console.log(`      ${tool}: ${count} tasks`);
  });

  console.log('\n   Source Distribution:');
  const sourceCounts = {};
  results.forEach(r => {
    if (r.source) {
      sourceCounts[r.source] = (sourceCounts[r.source] || 0) + 1;
    }
  });
  Object.entries(sourceCounts).forEach(([source, count]) => {
    console.log(`      ${source}: ${count} decisions`);
  });

  // System status
  console.log('\n   System Status:');
  const status = router.getStatus();
  console.log(`      Orchestrator: ${orchestratorOK ? '✅ Connected' : '⚠️ Fallback mode'}`);
  console.log(`      Perception cache: ${status.perception.cacheStats?.hits || 0} hits, ${status.perception.cacheStats?.misses || 0} misses`);

  router.shutdown();

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`\n${failed === 0 ? '✅ All tests completed!' : '⚠️ Some tests need attention'}\n`);

  return failed === 0;
}

runTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
