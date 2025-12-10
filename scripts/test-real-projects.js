#!/usr/bin/env node
/**
 * MKG v9.1 Real-World Project Testing
 * Tests: Pixel Aces, Shadow-Contracts, Empire-Edge, MKG Self-Analysis
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const toolsConfig = require('../src/config/tools-config.json');
const orchestratorConfig = require('../config/mkg-orchestrator.json');

// Dynamic import for ES modules
const { default: RouterFactory } = await import('../src/router/router-factory.js');

console.log('🚀 MKG v9.1 Real-World Project Testing\n');
console.log('=' .repeat(60));

const router = new RouterFactory(toolsConfig, orchestratorConfig);

// Test tasks for real projects
const testTasks = [
  {
    name: 'T1: Pixel Aces (Unity C#)',
    task: 'Analyze the combat system in pixel_aces and suggest performance optimizations for mobile. Focus on the dogfight mechanics and boss encounter systems.',
    context: {
      complexity: 'high',
      taskType: 'analysis',
      fileCount: 50,
      workingDir: '/home/platano/project/pixel_aces'
    }
  },
  {
    name: 'T2: Shadow-Contracts (TypeScript/React)',
    task: 'Refactor Shadow-Contracts to add proper error boundaries and loading states for the React components.',
    context: {
      complexity: 'medium',
      taskType: 'refactoring',
      fileCount: 8,
      workingDir: '/home/platano/project/Shadow-Contracts'
    }
  },
  {
    name: 'T3: Empire-Edge (Next.js Full-Stack)',
    task: 'Debug the authentication flow in empire-edge-game and identify potential security vulnerabilities in the OAuth implementation.',
    context: {
      complexity: 'high',
      taskType: 'debugging',
      fileCount: 25,
      workingDir: '/home/platano/project/empire-edge-game'
    }
  },
  {
    name: 'T4: MKG Self-Analysis',
    task: 'Review the compound learning implementation in deepseek-mcp-bridge and suggest architectural improvements for the feedback loop.',
    context: {
      complexity: 'high',
      taskType: 'architecture',
      fileCount: 15,
      workingDir: '/home/platano/project/deepseek-mcp-bridge'
    }
  }
];

// Execute tasks
const results = [];
for (const test of testTasks) {
  console.log(`\n📋 ${test.name}`);
  console.log('-'.repeat(50));

  const startTime = Date.now();
  try {
    const result = await router.execute(test.task, test.context);
    const duration = Date.now() - startTime;

    results.push({
      name: test.name,
      success: true,
      tool: result.routing?.tool || 'unknown',
      source: result.routing?.source || 'unknown',
      perceptionTriggered: result.routing?.perceptionTriggered || false,
      duration
    });

    console.log(`✅ Tool Selected: ${result.routing?.tool}`);
    console.log(`   Source: ${result.routing?.source}`);
    console.log(`   Perception: ${result.routing?.perceptionTriggered ? 'YES' : 'NO'}`);
    console.log(`   Duration: ${duration}ms`);

    // Show partial output if available
    if (result.output) {
      const preview = result.output.substring(0, 200);
      console.log(`   Output Preview: ${preview}...`);
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    results.push({
      name: test.name,
      success: false,
      error: error.message,
      duration
    });
    console.log(`❌ Error: ${error.message}`);
  }
}

// T5: Learning Validation
console.log('\n' + '='.repeat(60));
console.log('📊 T5: Learning Validation');
console.log('='.repeat(60));

try {
  const analytics = router.getAnalytics();

  console.log('\n📈 Tool Performance Metrics:');
  if (analytics.learning?.toolPerformance) {
    for (const [tool, metrics] of Object.entries(analytics.learning.toolPerformance)) {
      console.log(`   ${tool}:`);
      console.log(`     - Confidence: ${(metrics.confidence * 100).toFixed(1)}%`);
      console.log(`     - Success Rate: ${(metrics.successRate * 100).toFixed(1)}%`);
      console.log(`     - Uses: ${metrics.totalUses}`);
    }
  }

  console.log('\n🧠 Learned Patterns:');
  const patternCount = Object.keys(analytics.learning?.patterns || {}).length;
  console.log(`   Total Patterns: ${patternCount}`);

  if (analytics.learning?.patterns) {
    for (const [pattern, data] of Object.entries(analytics.learning.patterns).slice(0, 5)) {
      console.log(`   - ${pattern}: ${data.recommendedTool} (${data.occurrences} occurrences)`);
    }
  }

  console.log('\n💡 Recommendations:');
  if (analytics.recommendations && analytics.recommendations.length > 0) {
    for (const rec of analytics.recommendations) {
      console.log(`   - ${rec}`);
    }
  } else {
    console.log('   (Need more data for recommendations)');
  }

  console.log('\n📊 Perception Stats:');
  console.log(`   Triggered: ${analytics.learning?.perceptionStats?.triggered || 0}`);
  console.log(`   Beneficial: ${analytics.learning?.perceptionStats?.beneficial || 0}`);

} catch (error) {
  console.log(`❌ Learning validation error: ${error.message}`);
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('📋 EXECUTION SUMMARY');
console.log('='.repeat(60));

const passed = results.filter(r => r.success).length;
const failed = results.filter(r => !r.success).length;

console.log(`\n✅ Passed: ${passed}/${results.length}`);
console.log(`❌ Failed: ${failed}/${results.length}`);

console.log('\n📊 Routing Distribution:');
const toolCounts = {};
for (const r of results.filter(r => r.success)) {
  toolCounts[r.tool] = (toolCounts[r.tool] || 0) + 1;
}
for (const [tool, count] of Object.entries(toolCounts)) {
  console.log(`   ${tool}: ${count}`);
}

console.log('\n🎯 Source Distribution:');
const sourceCounts = {};
for (const r of results.filter(r => r.success)) {
  sourceCounts[r.source] = (sourceCounts[r.source] || 0) + 1;
}
for (const [source, count] of Object.entries(sourceCounts)) {
  console.log(`   ${source}: ${count}`);
}

console.log('\n⏱️ Performance:');
const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
console.log(`   Average Duration: ${avgDuration.toFixed(0)}ms`);

// Check learning state file
console.log('\n📁 Learning State Persistence:');
import fs from 'fs';
const learningPath = './data/learning/learning-state.json';
if (fs.existsSync(learningPath)) {
  const state = JSON.parse(fs.readFileSync(learningPath, 'utf8'));
  console.log(`   Total Decisions Recorded: ${state.totalDecisions || 0}`);
  console.log(`   Tool Metrics Tracked: ${Object.keys(state.toolMetrics || {}).length}`);
  console.log(`   Patterns Learned: ${Object.keys(state.patterns || {}).length}`);
} else {
  console.log('   (No persistent state file yet)');
}

console.log('\n🎉 Testing Complete!');
