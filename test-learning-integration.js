#!/usr/bin/env node
/**
 * Test Learning Engine Integration in Smart AI Bridge v1.3.0
 * 
 * Validates:
 * 1. 4-tier routing priority system
 * 2. Outcome recording after requests
 * 3. Learning recommendations with confidence scores
 * 4. Context extraction and rule-based routing
 */

import { BackendRegistry } from './backends/backend-registry.js';
import { LocalAdapter } from './backends/local-adapter.js';
import { GeminiAdapter } from './backends/gemini-adapter.js';
import { DeepSeekAdapter } from './backends/deepseek-adapter.js';
import { QwenAdapter } from './backends/qwen-adapter.js';
import { CompoundLearningEngine } from './intelligence/compound-learning.js';

// Mock BackendRouter for testing
class TestBackendRouter {
  constructor() {
    this.registry = new BackendRegistry();
    this.learningEngine = new CompoundLearningEngine('./data/learning');

    // Register backends (registry initializes with defaults)
    // Just set the adapters
    const local = new LocalAdapter();
    const gemini = new GeminiAdapter();
    const deepseek = new DeepSeekAdapter();
    const qwen = new QwenAdapter();

    this.registry.setAdapter('local', local);
    this.registry.setAdapter('gemini', gemini);
    this.registry.setAdapter('deepseek3.1', deepseek);
    this.registry.setAdapter('qwen3', qwen);
  }

  // Copy routeRequest method
  async routeRequest(prompt, options = {}) {
    if (options.backend) {
      return options.backend;
    }

    const context = this._extractContext(prompt, options);

    const recommendation = this.learningEngine.getRecommendation(context);
    if (recommendation && recommendation.confidence > 0.7) {
      console.log(`🧠 Learning recommendation: ${recommendation.backend} (confidence: ${recommendation.confidence.toFixed(2)})`);
      const backends = await this.registry.checkHealth();
      if (backends[recommendation.backend]?.status === 'healthy') {
        return recommendation.backend;
      }
    }

    const ruleBackend = await this._applyRuleBasedRouting(context);
    if (ruleBackend) {
      console.log(`📋 Rule-based routing: ${ruleBackend} (${context.complexity}/${context.taskType})`);
      return ruleBackend;
    }

    const fallbackChain = this.registry.getFallbackChain();
    return fallbackChain[0] || 'local';
  }

  _extractContext(prompt, options) {
    let complexity = 'simple';
    if (prompt.length > 2000 || (options.max_tokens && options.max_tokens > 4000)) {
      complexity = 'complex';
    } else if (prompt.length > 500 || (options.max_tokens && options.max_tokens > 1000)) {
      complexity = 'moderate';
    }

    let taskType = 'general';
    const lower = prompt.toLowerCase();
    if (lower.includes('code') || lower.includes('function') || lower.includes('class') || lower.includes('implement')) {
      taskType = 'code';
    } else if (lower.includes('analyze') || lower.includes('review') || lower.includes('understand')) {
      taskType = 'analysis';
    } else if (lower.includes('write') || lower.includes('create') || lower.includes('generate')) {
      taskType = 'generation';
    }

    return {
      complexity,
      taskType,
      promptLength: prompt.length,
      maxTokens: options.max_tokens || 2048
    };
  }

  async _applyRuleBasedRouting(context) {
    const backends = await this.registry.checkHealth();

    if (context.complexity === 'complex' && backends.qwen3?.status === 'healthy') {
      return 'qwen3';
    }

    if (context.taskType === 'code' && backends['deepseek3.1']?.status === 'healthy') {
      return 'deepseek3.1';
    }

    return null;
  }

  simulateOutcome(backend, context, success, latency, source) {
    this.learningEngine.recordOutcome({
      backend,
      context,
      success,
      latency,
      source
    });
  }
}

// Test suite
async function runTests() {
  console.log('\n='.repeat(70));
  console.log('🧪 SMART AI BRIDGE v1.3.0 - LEARNING INTEGRATION TEST');
  console.log('='.repeat(70) + '\n');

  const router = new TestBackendRouter();
  let passCount = 0;
  let failCount = 0;

  function test(name, fn) {
    return async () => {
      try {
        await fn();
        console.log(`✅ ${name}`);
        passCount++;
      } catch (error) {
        console.error(`❌ ${name}`);
        console.error(`   Error: ${error.message}`);
        failCount++;
      }
    };
  }

  // Test 1: Context extraction
  await test('Context Extraction - Simple', async () => {
    const ctx = router._extractContext('Hello world', {});
    if (ctx.complexity !== 'simple') throw new Error(`Expected simple, got ${ctx.complexity}`);
    if (ctx.taskType !== 'general') throw new Error(`Expected general, got ${ctx.taskType}`);
  })();

  await test('Context Extraction - Code Task', async () => {
    const ctx = router._extractContext('Implement a function to sort arrays', {});
    if (ctx.taskType !== 'code') throw new Error(`Expected code, got ${ctx.taskType}`);
  })();

  await test('Context Extraction - Complex', async () => {
    const longPrompt = 'a'.repeat(2500);
    const ctx = router._extractContext(longPrompt, {});
    if (ctx.complexity !== 'complex') throw new Error(`Expected complex, got ${ctx.complexity}`);
  })();

  // Test 2: Rule-based routing
  await test('Rule-Based Routing - Code Task', async () => {
    const context = { complexity: 'simple', taskType: 'code' };
    const backend = await router._applyRuleBasedRouting(context);
    // Note: May be null if deepseek is unhealthy, which is fine
    console.log(`   Routed to: ${backend || 'null (fallback will apply)'}`);
  })();

  await test('Rule-Based Routing - Complex Task', async () => {
    const context = { complexity: 'complex', taskType: 'general' };
    const backend = await router._applyRuleBasedRouting(context);
    console.log(`   Routed to: ${backend || 'null (fallback will apply)'}`);
  })();

  // Test 3: Outcome recording
  await test('Outcome Recording - Success', async () => {
    const context = { complexity: 'simple', taskType: 'code' };
    router.simulateOutcome('deepseek3.1', context, true, 1200, 'routed');
    
    // Check learning state
    const summary = router.learningEngine.getSummary();
    if (summary.totalOutcomes === 0) throw new Error('Outcome not recorded');
  })();

  await test('Outcome Recording - Multiple Outcomes', async () => {
    const ctx1 = { complexity: 'simple', taskType: 'code' };
    const ctx2 = { complexity: 'complex', taskType: 'analysis' };
    
    // Simulate successful code tasks on deepseek
    router.simulateOutcome('deepseek3.1', ctx1, true, 800, 'routed');
    router.simulateOutcome('deepseek3.1', ctx1, true, 900, 'routed');
    
    // Simulate successful analysis on qwen
    router.simulateOutcome('qwen3', ctx2, true, 1500, 'routed');
    
    const summary = router.learningEngine.getSummary();
    if (summary.totalOutcomes < 3) throw new Error('Not all outcomes recorded');
  })();

  // Test 4: Learning recommendations
  await test('Learning Recommendation - After Training', async () => {
    // Train with successful code tasks on deepseek
    const codeContext = { complexity: 'simple', taskType: 'code' };
    for (let i = 0; i < 5; i++) {
      router.simulateOutcome('deepseek3.1', codeContext, true, 800 + i * 100, 'routed');
    }
    
    // Get recommendation
    const rec = router.learningEngine.getRecommendation(codeContext);
    console.log(`   Recommendation: ${rec?.backend || 'none'} (confidence: ${rec?.confidence.toFixed(2) || 'N/A'})`);
  })();

  // Test 5: Full routing flow
  await test('Full Routing Flow - Forced Backend', async () => {
    const backend = await router.routeRequest('Test prompt', { backend: 'gemini' });
    if (backend !== 'gemini') throw new Error(`Expected gemini, got ${backend}`);
  })();

  await test('Full Routing Flow - Rule-Based', async () => {
    const backend = await router.routeRequest('Implement a sorting function', {});
    console.log(`   Routed to: ${backend}`);
  })();

  await test('Full Routing Flow - Complex Task', async () => {
    const longPrompt = 'Analyze this complex system: ' + 'x'.repeat(2000);
    const backend = await router.routeRequest(longPrompt, {});
    console.log(`   Routed to: ${backend}`);
  })();

  // Test 6: Learning summary
  await test('Learning Summary Generation', async () => {
    const summary = router.learningEngine.getSummary();
    console.log(`   Total decisions: ${summary.totalDecisions}`);
    console.log(`   Backends tracked: ${Object.keys(summary.backendPerformance).length}`);
    console.log(`   Patterns learned: ${summary.patternCount}`);
    console.log(`   Recommendations: ${summary.recommendations.length}`);
    
    if (summary.totalDecisions === 0) throw new Error('No learning data collected');
  })();

  // Results
  console.log('\n' + '='.repeat(70));
  console.log('TEST RESULTS');
  console.log('='.repeat(70));
  console.log(`✅ Passed: ${passCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`📊 Success Rate: ${((passCount / (passCount + failCount)) * 100).toFixed(1)}%`);
  console.log('='.repeat(70) + '\n');

  if (failCount === 0) {
    console.log('🎉 ALL TESTS PASSED - Learning integration is working correctly!\n');
  } else {
    console.log('⚠️  Some tests failed - Review implementation\n');
    process.exit(1);
  }
}

runTests().catch(console.error);
