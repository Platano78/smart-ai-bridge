#!/usr/bin/env node
/**
 * MKG v9.1 Extended Learning Test Suite
 * Generates 25+ diverse tasks to trigger pattern learning
 *
 * Task Distribution:
 * - 10 Analysis tasks (should route to DeepSeek)
 * - 5 Simple code generation (should route to local)
 * - 5 Medium refactoring (mixed routing)
 * - 5 Complex architecture (should route to DeepSeek/Qwen3)
 */

import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);

const toolsConfig = require('../src/config/tools-config.json');
const orchestratorConfig = require('../config/mkg-orchestrator.json');

const { default: RouterFactory } = await import('../src/router/router-factory.js');

console.log('🧪 MKG v9.1 Extended Learning Test Suite\n');
console.log('=' .repeat(60));

const router = new RouterFactory(toolsConfig, orchestratorConfig);

// === TASK DEFINITIONS ===

// T1: Analysis-only tasks (should trigger DeepSeek)
const analysisTasks = [
  {
    name: 'Security Audit - Pixel Aces',
    task: 'Perform a security audit of the pixel_aces Unity project. Identify potential vulnerabilities in the networking code and player data handling.',
    context: { complexity: 'high', taskType: 'analysis', fileCount: 20, workingDir: '/home/platano/project/pixel_aces' }
  },
  {
    name: 'Code Review - Empire Edge Auth',
    task: 'Review the authentication implementation in empire-edge-game for security best practices and potential improvements.',
    context: { complexity: 'high', taskType: 'analysis', fileCount: 15, workingDir: '/home/platano/project/empire-edge-game' }
  },
  {
    name: 'Architecture Analysis - MKG Router',
    task: 'Analyze the router-factory architecture in deepseek-mcp-bridge and identify potential bottlenecks or design improvements.',
    context: { complexity: 'high', taskType: 'analysis', fileCount: 10, workingDir: '/home/platano/project/deepseek-mcp-bridge' }
  },
  {
    name: 'Performance Analysis - Shadow Contracts',
    task: 'Analyze Shadow-Contracts React application for performance bottlenecks and suggest optimizations.',
    context: { complexity: 'medium', taskType: 'analysis', fileCount: 8, workingDir: '/home/platano/project/Shadow-Contracts' }
  },
  {
    name: 'Dependency Analysis - LibreChat',
    task: 'Analyze the dependency tree of LibreChat and identify outdated or vulnerable packages.',
    context: { complexity: 'medium', taskType: 'analysis', fileCount: 25, workingDir: '/home/platano/project/LibreChat' }
  },
  {
    name: 'API Design Review - MKG',
    task: 'Review the MCP tool API design in server-mecha-king-ghidorah-complete.js and suggest improvements for consistency.',
    context: { complexity: 'high', taskType: 'analysis', fileCount: 1, workingDir: '/home/platano/project/deepseek-mcp-bridge' }
  },
  {
    name: 'Test Coverage Analysis - Pixel Aces',
    task: 'Analyze test coverage in the pixel_aces project and identify untested code paths.',
    context: { complexity: 'medium', taskType: 'analysis', fileCount: 30, workingDir: '/home/platano/project/pixel_aces' }
  },
  {
    name: 'Error Handling Audit - Empire Edge',
    task: 'Audit error handling patterns in empire-edge-game and identify gaps in error recovery.',
    context: { complexity: 'high', taskType: 'analysis', fileCount: 20, workingDir: '/home/platano/project/empire-edge-game' }
  },
  {
    name: 'Memory Leak Analysis - MKG',
    task: 'Analyze the MKG server code for potential memory leaks in long-running sessions.',
    context: { complexity: 'high', taskType: 'analysis', fileCount: 5, workingDir: '/home/platano/project/deepseek-mcp-bridge' }
  },
  {
    name: 'Scalability Analysis - Learning Engine',
    task: 'Analyze the compound learning engine scalability with large pattern datasets.',
    context: { complexity: 'high', taskType: 'analysis', fileCount: 3, workingDir: '/home/platano/project/deepseek-mcp-bridge' }
  }
];

// T2a: Simple code generation tasks (should use local)
const simpleTasks = [
  {
    name: 'Simple - String Utility',
    task: 'Write a utility function that reverses a string and handles Unicode properly.',
    context: { complexity: 'low', taskType: 'code_generation', fileCount: 1 }
  },
  {
    name: 'Simple - Array Helper',
    task: 'Create a function that finds the intersection of two arrays.',
    context: { complexity: 'low', taskType: 'code_generation', fileCount: 1 }
  },
  {
    name: 'Simple - Date Formatter',
    task: 'Write a function that formats dates in ISO 8601 format.',
    context: { complexity: 'low', taskType: 'code_generation', fileCount: 1 }
  },
  {
    name: 'Simple - Validation Helper',
    task: 'Create an email validation function with proper regex.',
    context: { complexity: 'low', taskType: 'code_generation', fileCount: 1 }
  },
  {
    name: 'Simple - Config Parser',
    task: 'Write a function that parses environment variables with defaults.',
    context: { complexity: 'low', taskType: 'code_generation', fileCount: 1 }
  }
];

// T2b: Medium refactoring tasks
const mediumTasks = [
  {
    name: 'Medium - Extract React Hook',
    task: 'Refactor Shadow-Contracts to extract form handling logic into a reusable custom hook.',
    context: { complexity: 'medium', taskType: 'refactoring', fileCount: 4, workingDir: '/home/platano/project/Shadow-Contracts' }
  },
  {
    name: 'Medium - Add Error Boundaries',
    task: 'Add error boundaries to the main React components in Shadow-Contracts.',
    context: { complexity: 'medium', taskType: 'refactoring', fileCount: 5, workingDir: '/home/platano/project/Shadow-Contracts' }
  },
  {
    name: 'Medium - Improve Logging',
    task: 'Refactor MKG server logging to use structured JSON format with levels.',
    context: { complexity: 'medium', taskType: 'refactoring', fileCount: 3, workingDir: '/home/platano/project/deepseek-mcp-bridge' }
  },
  {
    name: 'Medium - Add TypeScript Types',
    task: 'Add TypeScript type definitions to the router-factory module.',
    context: { complexity: 'medium', taskType: 'refactoring', fileCount: 2, workingDir: '/home/platano/project/deepseek-mcp-bridge' }
  },
  {
    name: 'Medium - Improve Test Structure',
    task: 'Refactor test files to use describe/it blocks with better organization.',
    context: { complexity: 'medium', taskType: 'refactoring', fileCount: 5, workingDir: '/home/platano/project/deepseek-mcp-bridge' }
  }
];

// T2c: Complex architecture tasks (should trigger DeepSeek)
const complexTasks = [
  {
    name: 'Complex - Design Event System',
    task: 'Design an event-driven architecture for the MKG router to support plugins.',
    context: { complexity: 'high', taskType: 'architecture', fileCount: 8, workingDir: '/home/platano/project/deepseek-mcp-bridge' }
  },
  {
    name: 'Complex - Caching Strategy',
    task: 'Design a multi-layer caching strategy for the perception engine.',
    context: { complexity: 'high', taskType: 'architecture', fileCount: 5, workingDir: '/home/platano/project/deepseek-mcp-bridge' }
  },
  {
    name: 'Complex - Distributed Learning',
    task: 'Design a distributed learning system that can sync patterns across multiple MKG instances.',
    context: { complexity: 'high', taskType: 'architecture', fileCount: 6, workingDir: '/home/platano/project/deepseek-mcp-bridge' }
  },
  {
    name: 'Complex - Migration Strategy',
    task: 'Design a migration strategy to upgrade empire-edge-game from Next.js 13 to 14.',
    context: { complexity: 'high', taskType: 'migration', fileCount: 30, workingDir: '/home/platano/project/empire-edge-game' }
  },
  {
    name: 'Complex - Observability Stack',
    task: 'Design an observability stack for MKG with metrics, tracing, and alerting.',
    context: { complexity: 'high', taskType: 'architecture', fileCount: 10, workingDir: '/home/platano/project/deepseek-mcp-bridge' }
  }
];

// Combine all tasks
const allTasks = [
  ...analysisTasks.map(t => ({ ...t, category: 'analysis' })),
  ...simpleTasks.map(t => ({ ...t, category: 'simple' })),
  ...mediumTasks.map(t => ({ ...t, category: 'medium' })),
  ...complexTasks.map(t => ({ ...t, category: 'complex' }))
];

console.log(`\n📊 Task Distribution:`);
console.log(`   Analysis: ${analysisTasks.length}`);
console.log(`   Simple: ${simpleTasks.length}`);
console.log(`   Medium: ${mediumTasks.length}`);
console.log(`   Complex: ${complexTasks.length}`);
console.log(`   Total: ${allTasks.length}\n`);

// === EXECUTION ===
const results = [];
const routingStats = {};
const sourceStats = {};
const categoryStats = {};

for (let i = 0; i < allTasks.length; i++) {
  const test = allTasks[i];
  console.log(`\n[${i + 1}/${allTasks.length}] ${test.name}`);
  console.log('-'.repeat(50));

  const startTime = Date.now();
  try {
    const result = await router.execute(test.task, test.context);
    const duration = Date.now() - startTime;

    const tool = result.routing?.tool || 'unknown';
    const source = result.routing?.source || 'unknown';

    results.push({
      name: test.name,
      category: test.category,
      success: true,
      tool,
      source,
      perceptionTriggered: result.routing?.perceptionTriggered || false,
      duration
    });

    // Track stats
    routingStats[tool] = (routingStats[tool] || 0) + 1;
    sourceStats[source] = (sourceStats[source] || 0) + 1;
    categoryStats[test.category] = categoryStats[test.category] || { count: 0, tools: {} };
    categoryStats[test.category].count++;
    categoryStats[test.category].tools[tool] = (categoryStats[test.category].tools[tool] || 0) + 1;

    console.log(`✅ Tool: ${tool} | Source: ${source} | ${duration}ms`);
  } catch (error) {
    results.push({
      name: test.name,
      category: test.category,
      success: false,
      error: error.message,
      duration: Date.now() - startTime
    });
    console.log(`❌ Error: ${error.message}`);
  }
}

// === LEARNING VALIDATION ===
console.log('\n' + '='.repeat(60));
console.log('📊 LEARNING ENGINE VALIDATION');
console.log('='.repeat(60));

try {
  const analytics = router.getAnalytics();

  console.log('\n📈 Tool Performance (after 25+ decisions):');
  if (analytics.learning?.toolPerformance) {
    for (const [tool, metrics] of Object.entries(analytics.learning.toolPerformance)) {
      console.log(`   ${tool}:`);
      console.log(`     Confidence: ${(metrics.confidence * 100).toFixed(1)}%`);
      console.log(`     Success Rate: ${(metrics.successRate * 100).toFixed(1)}%`);
      console.log(`     Total Uses: ${metrics.totalUses || 'N/A'}`);
    }
  }

  console.log('\n🧠 Learned Patterns:');
  const patternCount = Object.keys(analytics.learning?.patterns || {}).length;
  console.log(`   Total Patterns: ${patternCount}`);

  if (analytics.learning?.patterns && patternCount > 0) {
    console.log('\n   Top Patterns:');
    for (const [pattern, data] of Object.entries(analytics.learning.patterns).slice(0, 10)) {
      console.log(`   - ${pattern}: ${data.recommendedTool} (${data.occurrences}x, conf: ${(data.confidence * 100).toFixed(1)}%)`);
    }
  }

  console.log('\n💡 Recommendations:');
  if (analytics.recommendations && analytics.recommendations.length > 0) {
    for (const rec of analytics.recommendations) {
      console.log(`   - ${rec}`);
    }
  } else {
    console.log('   (Generating recommendations...)');
  }

  console.log('\n📊 Perception Stats:');
  console.log(`   Triggered: ${analytics.learning?.perceptionStats?.triggered || 0}`);
  console.log(`   Beneficial: ${analytics.learning?.perceptionStats?.beneficial || 0}`);

} catch (error) {
  console.log(`❌ Learning validation error: ${error.message}`);
}

// === T4: PERSISTENCE CHECK ===
console.log('\n' + '='.repeat(60));
console.log('💾 LEARNING PERSISTENCE CHECK');
console.log('='.repeat(60));

const learningPath = './data/learning/learning-state.json';
if (fs.existsSync(learningPath)) {
  const state = JSON.parse(fs.readFileSync(learningPath, 'utf8'));
  console.log('\n✅ Learning state file exists!');
  console.log(`   Path: ${learningPath}`);
  console.log(`   Total Decisions: ${state.totalDecisions || 0}`);
  console.log(`   Tool Metrics Tracked: ${Object.keys(state.toolMetrics || {}).length}`);
  console.log(`   Patterns Learned: ${Object.keys(state.patterns || {}).length}`);
  console.log(`   Last Updated: ${state.lastUpdated || 'N/A'}`);
} else {
  console.log('\n⚠️ Learning state file NOT found');
  console.log('   Expected path:', learningPath);
  console.log('   This might indicate persistence is not working');
}

// === SUMMARY ===
console.log('\n' + '='.repeat(60));
console.log('📋 EXECUTION SUMMARY');
console.log('='.repeat(60));

const passed = results.filter(r => r.success).length;
const failed = results.filter(r => !r.success).length;

console.log(`\n✅ Passed: ${passed}/${results.length}`);
console.log(`❌ Failed: ${failed}/${results.length}`);

console.log('\n📊 Routing Distribution:');
for (const [tool, count] of Object.entries(routingStats).sort((a, b) => b[1] - a[1])) {
  const pct = ((count / results.length) * 100).toFixed(1);
  console.log(`   ${tool}: ${count} (${pct}%)`);
}

console.log('\n🎯 Source Distribution:');
for (const [source, count] of Object.entries(sourceStats).sort((a, b) => b[1] - a[1])) {
  const pct = ((count / results.length) * 100).toFixed(1);
  console.log(`   ${source}: ${count} (${pct}%)`);
}

console.log('\n📂 Routing by Category:');
for (const [category, data] of Object.entries(categoryStats)) {
  console.log(`   ${category} (${data.count} tasks):`);
  for (const [tool, count] of Object.entries(data.tools)) {
    console.log(`     - ${tool}: ${count}`);
  }
}

console.log('\n⏱️ Performance:');
const avgDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0) / results.length;
console.log(`   Average Duration: ${avgDuration.toFixed(0)}ms`);
console.log(`   Total Time: ${(avgDuration * results.length / 1000 / 60).toFixed(1)} minutes`);

console.log('\n🎉 Extended Learning Test Complete!');
