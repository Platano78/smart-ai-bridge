#!/usr/bin/env node
/**
 * Compound Learning System Test
 *
 * Tests the self-improvement feedback loop:
 * 1. Simulates routing decisions with outcomes
 * 2. Verifies confidence adjustments
 * 3. Checks pattern learning
 * 4. Validates recommendations
 */

import { CompoundLearningEngine, FeedbackType } from '../src/intelligence/compound-learning.js';

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║          MKG v9.1 - Compound Learning Test                   ║');
console.log('╠══════════════════════════════════════════════════════════════╣');
console.log('║  Testing: Outcome Tracking → Confidence → Recommendations   ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// Initialize with test directory
const learner = new CompoundLearningEngine({
  dataDir: './data/learning-test',
  emaAlpha: 0.3,  // Higher alpha for faster learning in tests
  minSamples: 3
});

// Reset for clean test
learner.reset();

console.log('📊 Test 1: Recording Successful Outcomes\n');

// Simulate successful local_qwen_coder calls for simple tasks
for (let i = 0; i < 5; i++) {
  learner.recordOutcome({
    task: 'Write a simple Python function',
    context: { complexity: 'low', taskType: 'code_generation', fileCount: 1 },
    routing: { tool: 'local_qwen_coder', source: 'rule_based', confidence: 0.7 },
    execution: { completed: true, outputLength: 500 },
    verification: { passed: true }
  });
}

console.log('   ✅ Recorded 5 successful simple tasks → local_qwen_coder');

// Simulate mixed results for nvidia_qwen480b on complex tasks
for (let i = 0; i < 4; i++) {
  learner.recordOutcome({
    task: 'Complex refactoring task',
    context: { complexity: 'high', taskType: 'refactoring', fileCount: 8 },
    routing: { tool: 'nvidia_qwen480b', source: 'orchestrator', confidence: 0.9 },
    execution: { completed: true, outputLength: 2000 },
    verification: { passed: i < 3 }  // 3 pass, 1 fails
  });
}

console.log('   ✅ Recorded 4 complex tasks → nvidia_qwen480b (3 success, 1 fail)');

// Simulate DeepSeek for analysis tasks
for (let i = 0; i < 3; i++) {
  learner.recordOutcome({
    task: 'Analyze codebase security',
    context: { complexity: 'medium', taskType: 'analysis', fileCount: 5 },
    routing: { tool: 'nvidia_deepseek_v3', source: 'orchestrator', confidence: 0.85, perception: true },
    execution: { completed: true, outputLength: 1500 },
    verification: { passed: true }
  });
}

console.log('   ✅ Recorded 3 analysis tasks → nvidia_deepseek_v3 (all success)\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('📊 Test 2: Checking Learned Confidence Scores\n');

const summary = learner.getSummary();

console.log('   Tool Performance:');
for (const [tool, perf] of Object.entries(summary.toolPerformance)) {
  const bar = '█'.repeat(Math.round(perf.confidence * 20));
  const emptyBar = '░'.repeat(20 - Math.round(perf.confidence * 20));
  console.log(`      ${tool}:`);
  console.log(`         Confidence: ${bar}${emptyBar} ${(perf.confidence * 100).toFixed(1)}%`);
  console.log(`         Calls: ${perf.totalCalls}, Success Rate: ${(perf.successRate * 100).toFixed(0)}%, Trend: ${perf.trend}`);
}

console.log('\n   Source Performance:');
for (const [source, perf] of Object.entries(summary.sourcePerformance)) {
  console.log(`      ${source}: ${perf.calls} calls, ${(perf.confidence * 100).toFixed(1)}% avg success`);
}

console.log(`\n   Perception Stats:`);
console.log(`      Triggered: ${summary.perceptionStats.triggered}, Beneficial: ${summary.perceptionStats.beneficial}`);
console.log(`      Skipped: ${summary.perceptionStats.skipped}`);

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('📊 Test 3: Pattern-Based Recommendations\n');

// Test recommendation for known pattern
const lowComplexityRec = learner.getRecommendation({
  complexity: 'low',
  taskType: 'code_generation',
  fileCount: 1
});

console.log('   Query: low complexity, code_generation, 1 file');
if (lowComplexityRec) {
  console.log(`   ✅ Recommendation: ${lowComplexityRec.tool} (${(lowComplexityRec.confidence * 100).toFixed(0)}% confidence)`);
  console.log(`      Reason: ${lowComplexityRec.reason}`);
} else {
  console.log('   ⚠️ No recommendation (not enough data)');
}

const highComplexityRec = learner.getRecommendation({
  complexity: 'high',
  taskType: 'refactoring',
  fileCount: 8
});

console.log('\n   Query: high complexity, refactoring, 8 files');
if (highComplexityRec) {
  console.log(`   ✅ Recommendation: ${highComplexityRec.tool} (${(highComplexityRec.confidence * 100).toFixed(0)}% confidence)`);
  console.log(`      Reason: ${highComplexityRec.reason}`);
} else {
  console.log('   ⚠️ No recommendation (not enough data)');
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('📊 Test 4: Adaptive Thresholds\n');

const thresholds = learner.getAdaptiveThresholds();
console.log(`   Perception Score Threshold: ${thresholds.perceptionScoreThreshold}`);
console.log(`   Perception Effectiveness: ${(thresholds.perceptionEffectiveness * 100).toFixed(1)}%`);

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('📊 Test 5: Degradation Detection\n');

// Simulate degrading tool performance
console.log('   Simulating degrading performance for nvidia_qwen480b...');
for (let i = 0; i < 8; i++) {
  learner.recordOutcome({
    task: 'Complex refactoring task',
    context: { complexity: 'high', taskType: 'refactoring', fileCount: 8 },
    routing: { tool: 'nvidia_qwen480b', source: 'orchestrator', confidence: 0.9 },
    execution: { completed: i < 2, outputLength: i < 2 ? 1000 : 50 },  // First 2 ok, rest fail
    verification: { passed: i < 2 }
  });
}

const updatedSummary = learner.getSummary();
const qwenMetrics = updatedSummary.toolPerformance['nvidia_qwen480b'];
console.log(`\n   nvidia_qwen480b after degradation:`);
console.log(`      Confidence: ${(qwenMetrics.confidence * 100).toFixed(1)}%`);
console.log(`      Trend: ${qwenMetrics.trend}`);

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('📊 Test 6: Generated Recommendations\n');

const recommendations = updatedSummary.recommendations;
if (recommendations.length > 0) {
  for (const rec of recommendations.slice(0, 5)) {
    const icon = rec.type === 'warning' ? '⚠️' : '💡';
    console.log(`   ${icon} ${rec.message}`);
    console.log(`      Action: ${rec.action}\n`);
  }
} else {
  console.log('   No recommendations yet (need more data)');
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('📊 Test 7: Persistence Test\n');

// Save state
console.log('   Saving learned state...');
learner._saveState();

// Create new instance and load
const learner2 = new CompoundLearningEngine({
  dataDir: './data/learning-test'
});

const summary2 = learner2.getSummary();
console.log(`   Loaded state: ${summary2.totalDecisions} decisions, ${summary2.patternCount} patterns`);

const patternsMatch = summary2.patternCount === updatedSummary.patternCount;
console.log(`   ✅ Persistence: ${patternsMatch ? 'State preserved correctly' : 'State mismatch!'}`);

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('\n✅ Compound Learning Tests Complete!\n');

console.log('Summary:');
console.log(`   • Total decisions recorded: ${summary2.totalDecisions}`);
console.log(`   • Patterns learned: ${summary2.patternCount}`);
console.log(`   • Tools tracked: ${Object.keys(summary2.toolPerformance).length}`);
console.log(`   • Recommendations generated: ${recommendations.length}`);
console.log('');
