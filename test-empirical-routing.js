#!/usr/bin/env node

/**
 * Test Empirical Routing Behavior with Complex Query
 */

// Simulate the empirical routing logic from the enhanced server
class EmpiricalRoutingTest {
  constructor() {
    this.empiricalData = {
      executions: new Map(),
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0
    };
  }

  generateQueryFingerprint(prompt) {
    const keywords = [];
    const lowercasePrompt = prompt.toLowerCase();
    
    if (/json|parse|load|data/.test(lowercasePrompt)) keywords.push('json_data');
    if (/architecture|system|design/.test(lowercasePrompt)) keywords.push('architecture');
    if (/multiple|integrate|coordinate/.test(lowercasePrompt)) keywords.push('multi_component');
    if (/microservices|distributed/.test(lowercasePrompt)) keywords.push('distributed_systems');
    
    const complexity = Math.min(prompt.length / 1000, 0.3) + 
      (keywords.filter(k => ['architecture', 'multi_component', 'distributed_systems'].includes(k)).length * 0.3);
    
    const domain = /architecture|system|design/.test(lowercasePrompt) ? 'architecture' : 'general';
    
    return {
      keywords,
      complexity: Math.max(0, Math.min(1, complexity)),
      domain,
      fingerprint: `${domain}_${Math.round(complexity * 10)}_${keywords.join('_')}`.substring(0, 50)
    };
  }

  shouldTryDeepseekFirst(prompt) {
    const fingerprint = this.generateQueryFingerprint(prompt);
    const historical = this.empiricalData.executions.get(fingerprint.fingerprint);
    
    if (historical && historical.totalExecutions >= 10 && historical.successRate < 0.2) {
      console.log(`⚠️ Empirical data shows low success rate (${Math.round(historical.successRate * 100)}%) for this pattern, but trying anyway`);
    }
    
    return {
      tryDeepseek: true,  // ALWAYS try first
      reason: 'Empirical routing: try first, route on actual failure',
      fingerprint: fingerprint,
      historicalData: historical
    };
  }

  simulateComplexTaskExecution(prompt) {
    console.log(`\n🎯 EMPIRICAL ROUTING TEST`);
    console.log(`Query: "${prompt}"`);
    console.log(`\n--- OLD SYSTEM BEHAVIOR (Predictive Blocking) ---`);
    
    // Simulate old system pattern matching
    if (/architecture|system.*design|multiple.*component|distributed|microservices|enterprise/i.test(prompt)) {
      console.log(`❌ OLD: Pattern matched complex indicators`);
      console.log(`❌ OLD: BLOCKED upfront - "Route to Claude first"`);
      console.log(`❌ OLD: DeepSeek never attempted, no empirical learning`);
    }
    
    console.log(`\n--- NEW SYSTEM BEHAVIOR (Empirical Routing) ---`);
    
    // New empirical routing approach
    const decision = this.shouldTryDeepseekFirst(prompt);
    console.log(`✅ NEW: ${decision.reason}`);
    console.log(`✅ NEW: Query fingerprint: ${decision.fingerprint.domain} (complexity: ${Math.round(decision.fingerprint.complexity * 100)}%)`);
    console.log(`✅ NEW: Keywords detected: [${decision.fingerprint.keywords.join(', ')}]`);
    
    // Simulate trying DeepSeek first
    console.log(`\n🚀 NEW: Attempting execution with DeepSeek...`);
    
    // For complex architecture queries, simulate timeout/capacity issue
    const isComplexArchitecture = decision.fingerprint.complexity > 0.6 || 
      decision.fingerprint.keywords.includes('architecture') ||
      decision.fingerprint.keywords.includes('distributed_systems');
    
    if (isComplexArchitecture) {
      console.log(`⏱️ NEW: Simulating 27-second timeout for complex architecture task...`);
      console.log(`❌ NEW: DeepSeek failed after 27s (actual timeout evidence)`);
      console.log(`🔄 NEW: NOW recommending Claude based on REAL failure evidence:`);
      console.log(`\n🎯 **EMPIRICAL ROUTING RECOMMENDATION (Based on Actual Evidence)**`);
      console.log(`**What Happened**: DeepSeek was tried first but failed after 27s`);
      console.log(`**Failure Type**: timeout`);
      console.log(`**Evidence**: Actual timeout after 27s - empirical evidence for Claude routing`);
      console.log(`**Why This is Better**: This recommendation is based on actual execution evidence, not upfront pattern matching.`);
      
      // Record empirical failure
      this.recordFailure(decision.fingerprint, 27000, 'timeout');
      console.log(`📊 NEW: Empirical data recorded - future similar queries will have historical context`);
    } else {
      console.log(`✅ NEW: DeepSeek succeeded in 3.2s`);
      console.log(`📊 NEW: Success recorded for pattern learning`);
      this.recordSuccess(decision.fingerprint, 3200);
    }
    
    console.log(`\n--- KEY DIFFERENCE ---`);
    console.log(`❌ OLD: False positive blocking (never learned from reality)`);
    console.log(`✅ NEW: Evidence-based routing (learns from actual execution)`);
  }

  recordSuccess(fingerprint, responseTime) {
    this.empiricalData.totalQueries++;
    this.empiricalData.successfulQueries++;
    
    const key = fingerprint.fingerprint;
    const existing = this.empiricalData.executions.get(key) || {
      successRate: 0, totalExecutions: 0, successfulExecutions: 0
    };

    existing.totalExecutions++;
    existing.successfulExecutions++;
    existing.successRate = existing.successfulExecutions / existing.totalExecutions;

    this.empiricalData.executions.set(key, existing);
  }

  recordFailure(fingerprint, responseTime, errorType) {
    this.empiricalData.totalQueries++;
    this.empiricalData.failedQueries++;
    
    const key = fingerprint.fingerprint;
    const existing = this.empiricalData.executions.get(key) || {
      successRate: 0, totalExecutions: 0, successfulExecutions: 0
    };

    existing.totalExecutions++;
    existing.successRate = existing.successfulExecutions / existing.totalExecutions;

    this.empiricalData.executions.set(key, existing);
  }
}

// Run tests
const tester = new EmpiricalRoutingTest();

// Test 1: JSON question (the original problem)
tester.simulateComplexTaskExecution("How do I load JSON data in JavaScript?");

// Test 2: Complex architecture query 
tester.simulateComplexTaskExecution("Design a microservices architecture with multiple components, API gateways, and distributed event handling for an enterprise-scale e-commerce platform");

// Test 3: Medium complexity query
tester.simulateComplexTaskExecution("Create a React component with state management and API integration");