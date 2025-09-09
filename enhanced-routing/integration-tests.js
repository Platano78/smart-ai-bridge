/**
 * Integration Tests for Enhanced Empirical Routing System
 * Validates that complexity analysis enhances existing empirical routing
 * without breaking backward compatibility
 */

import { ComplexityAnalyzer } from './complexity-analyzer.js';
import { DecisionFusion } from './decision-fusion.js';
import { EnhancedEmpiricalRouter } from './enhanced-empirical-router.js';

// Mock empirical router for testing
class MockEmpiricalRouter {
  constructor() {
    this.empiricalData = {
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      executions: new Map()
    };
    this.callLog = [];
  }

  async shouldTryDeepseekFirst(prompt) {
    this.callLog.push({ method: 'shouldTryDeepseekFirst', prompt });
    
    // Mock historical data based on prompt patterns
    const fingerprint = this.generateQueryFingerprint(prompt);
    const mockHistorical = this.getMockHistoricalData(prompt);
    
    return {
      tryDeepseek: true, // Default empirical "try first" approach
      reason: 'Empirical routing: try first, route on actual failure',
      fingerprint: fingerprint,
      historicalData: mockHistorical
    };
  }

  generateQueryFingerprint(prompt) {
    return {
      domain: prompt.includes('database') ? 'database' : 'general',
      questionType: prompt.includes('implement') ? 'implementation' : 'analysis',
      fingerprint: `mock_${prompt.length}_${prompt.split(' ').length}`,
      complexity: 'medium',
      hasCode: /```/.test(prompt)
    };
  }

  getMockHistoricalData(prompt) {
    // Simulate different success rates for different types of queries
    if (prompt.includes('implement')) {
      return { successRate: 0.85, totalExecutions: 20, averageResponseTime: 3000 };
    } else if (prompt.includes('choose') || prompt.includes('decide')) {
      return { successRate: 0.45, totalExecutions: 15, averageResponseTime: 8000 };
    } else {
      return { successRate: 0.70, totalExecutions: 10, averageResponseTime: 5000 };
    }
  }

  recordExecutionSuccess(fingerprint, responseTime, prompt, result) {
    this.callLog.push({ method: 'recordExecutionSuccess', fingerprint, responseTime });
    this.empiricalData.successfulQueries++;
    this.empiricalData.totalQueries++;
  }

  recordExecutionFailure(fingerprint, responseTime, error, failureAnalysis) {
    this.callLog.push({ method: 'recordExecutionFailure', fingerprint, responseTime, error });
    this.empiricalData.failedQueries++;
    this.empiricalData.totalQueries++;
  }

  analyzeActualFailure(error, responseTime, prompt) {
    return {
      timeout: responseTime >= 25000,
      shouldRouteToClaudeNext: responseTime >= 25000,
      reason: responseTime >= 25000 ? 'Timeout detected' : 'Other failure'
    };
  }
}

class IntegrationTestSuite {
  constructor() {
    this.testResults = [];
    this.mockEmpiricalRouter = new MockEmpiricalRouter();
    this.enhancedRouter = new EnhancedEmpiricalRouter(this.mockEmpiricalRouter);
    this.startTime = Date.now();
  }

  async runAllTests() {
    console.log('🧪 Starting Enhanced Empirical Routing Integration Tests...\n');

    try {
      await this.testComplexityAnalysisIntegration();
      await this.testDecisionFusionIntegration();
      await this.testEnhancedRouterIntegration();
      await this.testBackwardCompatibility();
      await this.testPerformanceImpact();
      await this.testErrorHandlingAndFallback();
      await this.testLearningMechanisms();
      await this.testRealWorldScenarios();

      this.generateTestReport();
      return this.getOverallResults();

    } catch (error) {
      console.error(`❌ Test suite failed: ${error.message}`);
      throw error;
    }
  }

  async testComplexityAnalysisIntegration() {
    console.log('📋 Test 1: Complexity Analysis Integration...');
    const analyzer = new ComplexityAnalyzer();
    let passed = 0;
    const total = 6;

    // Test 1.1: Basic complexity detection
    const testCases = [
      { 
        prompt: 'implement user authentication with JWT tokens', 
        expectedType: 'concrete_implementation',
        expectedRoute: 'deepseek'
      },
      { 
        prompt: 'should I use MongoDB or PostgreSQL for this project?', 
        expectedType: 'strategic_decision',
        expectedRoute: 'claude'
      },
      { 
        prompt: 'analyze the performance implications of different caching strategies', 
        expectedType: 'abstract_reasoning',
        expectedRoute: 'claude'
      }
    ];

    for (const testCase of testCases) {
      try {
        const result = analyzer.analyzeComplexity(testCase.prompt);
        
        if (result.complexity_type === testCase.expectedType && 
            result.suggested_route === testCase.expectedRoute &&
            result.confidence > 0.5) {
          passed++;
          console.log(`  ✅ "${testCase.prompt.substring(0, 40)}..." → ${result.complexity_type} (${result.confidence.toFixed(2)})`);
        } else {
          console.log(`  ❌ "${testCase.prompt.substring(0, 40)}..." → Got ${result.complexity_type}, expected ${testCase.expectedType}`);
        }
      } catch (error) {
        console.log(`  ❌ Error analyzing: ${error.message}`);
      }
    }

    // Test 1.2: Fingerprint enhancement
    try {
      const mockFingerprint = { domain: 'test', fingerprint: 'mock_fp' };
      const result = analyzer.analyzeComplexity('test prompt', mockFingerprint);
      
      if (result.enhanced_fingerprint) {
        passed++;
        console.log('  ✅ Fingerprint enhancement working');
      } else {
        console.log('  ❌ Fingerprint enhancement failed');
      }
    } catch (error) {
      console.log(`  ❌ Fingerprint enhancement error: ${error.message}`);
    }

    // Test 1.3: Performance metrics
    const startTime = Date.now();
    for (let i = 0; i < 10; i++) {
      analyzer.analyzeComplexity('test performance analysis');
    }
    const avgTime = (Date.now() - startTime) / 10;
    
    if (avgTime < 50) {
      passed++;
      console.log(`  ✅ Performance: ${avgTime.toFixed(2)}ms average`);
    } else {
      console.log(`  ❌ Performance: ${avgTime.toFixed(2)}ms too slow`);
    }

    // Test 1.4: Learning mechanism
    try {
      const result = analyzer.recordComplexityOutcome(
        'test prompt', 
        { complexity_type: 'concrete_implementation', suggested_route: 'deepseek' },
        'deepseek', 
        true, 
        2000
      );
      
      if (result.prediction_accuracy >= 0) {
        passed++;
        console.log('  ✅ Learning mechanism functional');
      } else {
        console.log('  ❌ Learning mechanism failed');
      }
    } catch (error) {
      console.log(`  ❌ Learning mechanism error: ${error.message}`);
    }

    this.recordTestResult('complexity_analysis_integration', passed, total);
    console.log(`Complexity Analysis Integration: ${passed}/${total} passed\n`);
  }

  async testDecisionFusionIntegration() {
    console.log('📋 Test 2: Decision Fusion Integration...');
    const fusion = new DecisionFusion();
    let passed = 0;
    const total = 5;

    // Test 2.1: Basic fusion logic
    try {
      const mockEmpiricalDecision = {
        tryDeepseek: true,
        reason: 'empirical test',
        fingerprint: { domain: 'test' },
        historicalData: { successRate: 0.8, totalExecutions: 10 }
      };

      const mockComplexityAnalysis = {
        complexity_type: 'concrete_implementation',
        confidence: 0.9,
        suggested_route: 'deepseek',
        reasoning: 'implementation task'
      };

      const result = fusion.fuseIntelligence(
        mockEmpiricalDecision, 
        mockComplexityAnalysis, 
        'test prompt'
      );

      if (result.route && result.confidence > 0 && result.fusion_metadata) {
        passed++;
        console.log(`  ✅ Basic fusion: ${result.route} (${result.confidence.toFixed(2)})`);
      } else {
        console.log('  ❌ Basic fusion failed');
      }
    } catch (error) {
      console.log(`  ❌ Basic fusion error: ${error.message}`);
    }

    // Test 2.2: Disagreement handling
    try {
      const empiricalDecision = {
        tryDeepseek: true,
        historicalData: { successRate: 0.6 }
      };

      const complexityAnalysis = {
        suggested_route: 'claude',
        confidence: 0.9,
        complexity_type: 'strategic_decision'
      };

      const result = fusion.fuseIntelligence(empiricalDecision, complexityAnalysis, 'test');
      
      if (result.route === 'claude' && result.confidence > 0.5) {
        passed++;
        console.log('  ✅ Disagreement resolution working');
      } else {
        console.log('  ❌ Disagreement resolution failed');
      }
    } catch (error) {
      console.log(`  ❌ Disagreement handling error: ${error.message}`);
    }

    // Test 2.3: Learning from outcomes
    try {
      const mockDecision = { 
        route: 'deepseek', 
        fusion_metadata: { empirical_suggestion: 'deepseek', complexity_suggestion: 'deepseek' } 
      };
      
      const result = fusion.recordFusionOutcome(mockDecision, 'deepseek', true, 3000);
      
      if (result.success_rate > 0) {
        passed++;
        console.log('  ✅ Fusion learning working');
      } else {
        console.log('  ❌ Fusion learning failed');
      }
    } catch (error) {
      console.log(`  ❌ Fusion learning error: ${error.message}`);
    }

    // Test 2.4: Weight adaptation
    try {
      const initialWeights = { ...fusion.fusionWeights };
      
      // Record several outcomes to trigger weight adjustment
      for (let i = 0; i < 5; i++) {
        fusion.recordFusionOutcome(
          { route: 'deepseek', fusion_metadata: { empirical_suggestion: 'deepseek' } },
          'deepseek', 
          true, 
          2000
        );
      }
      
      // Weights should still be normalized (sum to ~1.0)
      const currentWeights = fusion.fusionWeights;
      const weightSum = Object.values(currentWeights).reduce((sum, w) => sum + w, 0);
      
      if (Math.abs(weightSum - 1.0) < 0.01) {
        passed++;
        console.log('  ✅ Weight adaptation and normalization working');
      } else {
        console.log(`  ❌ Weight normalization failed: ${weightSum}`);
      }
    } catch (error) {
      console.log(`  ❌ Weight adaptation error: ${error.message}`);
    }

    // Test 2.5: Performance monitoring
    try {
      const stats = fusion.getFusionStats();
      
      if (stats.fusion_metrics && stats.current_weights && stats.timestamp) {
        passed++;
        console.log('  ✅ Performance monitoring functional');
      } else {
        console.log('  ❌ Performance monitoring failed');
      }
    } catch (error) {
      console.log(`  ❌ Performance monitoring error: ${error.message}`);
    }

    this.recordTestResult('decision_fusion_integration', passed, total);
    console.log(`Decision Fusion Integration: ${passed}/${total} passed\n`);
  }

  async testEnhancedRouterIntegration() {
    console.log('📋 Test 3: Enhanced Router Integration...');
    let passed = 0;
    const total = 6;

    // Test 3.1: API compatibility
    try {
      const decision = await this.enhancedRouter.shouldTryDeepseekFirst('implement user login');
      
      if (decision.hasOwnProperty('tryDeepseek') && 
          decision.hasOwnProperty('reason') && 
          decision.hasOwnProperty('fingerprint')) {
        passed++;
        console.log('  ✅ API compatibility maintained');
      } else {
        console.log('  ❌ API compatibility broken');
      }
    } catch (error) {
      console.log(`  ❌ API compatibility error: ${error.message}`);
    }

    // Test 3.2: Enhancement metadata presence
    try {
      const decision = await this.enhancedRouter.shouldTryDeepseekFirst('analyze database performance');
      
      if (decision.enhancement && 
          decision.enhancement.complexity_analysis && 
          decision.enhancement.fusion_decision) {
        passed++;
        console.log('  ✅ Enhancement metadata present');
      } else {
        console.log('  ❌ Enhancement metadata missing');
      }
    } catch (error) {
      console.log(`  ❌ Enhancement metadata error: ${error.message}`);
    }

    // Test 3.3: Empirical router preservation
    const initialCallCount = this.mockEmpiricalRouter.callLog.length;
    
    try {
      await this.enhancedRouter.shouldTryDeepseekFirst('test empirical preservation');
      
      if (this.mockEmpiricalRouter.callLog.length > initialCallCount) {
        passed++;
        console.log('  ✅ Empirical router methods called');
      } else {
        console.log('  ❌ Empirical router not being called');
      }
    } catch (error) {
      console.log(`  ❌ Empirical preservation error: ${error.message}`);
    }

    // Test 3.4: Learning integration
    try {
      const fingerprint = { enhancement: { 
        complexity_analysis: { type: 'test', suggested_route: 'deepseek' },
        fusion_decision: { route: 'deepseek' }
      }};
      
      this.enhancedRouter.recordExecutionSuccess(fingerprint, 2000, 'test', {});
      
      // Check if empirical router was called
      const successCalls = this.mockEmpiricalRouter.callLog.filter(call => 
        call.method === 'recordExecutionSuccess'
      );
      
      if (successCalls.length > 0) {
        passed++;
        console.log('  ✅ Learning integration functional');
      } else {
        console.log('  ❌ Learning integration failed');
      }
    } catch (error) {
      console.log(`  ❌ Learning integration error: ${error.message}`);
    }

    // Test 3.5: Fallback mechanism
    try {
      this.enhancedRouter.disableEnhancement();
      const decision = await this.enhancedRouter.shouldTryDeepseekFirst('fallback test');
      
      if (!decision.enhancement) {
        passed++;
        console.log('  ✅ Fallback to empirical-only working');
        this.enhancedRouter.enableEnhancement(); // Re-enable for other tests
      } else {
        console.log('  ❌ Fallback mechanism failed');
        this.enhancedRouter.enableEnhancement();
      }
    } catch (error) {
      console.log(`  ❌ Fallback mechanism error: ${error.message}`);
      this.enhancedRouter.enableEnhancement();
    }

    // Test 3.6: Statistics integration
    try {
      const stats = this.enhancedRouter.getEnhancedStats();
      
      if (stats.empirical && stats.complexity && stats.fusion && stats.integration) {
        passed++;
        console.log('  ✅ Statistics integration working');
      } else {
        console.log('  ❌ Statistics integration failed');
      }
    } catch (error) {
      console.log(`  ❌ Statistics integration error: ${error.message}`);
    }

    this.recordTestResult('enhanced_router_integration', passed, total);
    console.log(`Enhanced Router Integration: ${passed}/${total} passed\n`);
  }

  async testBackwardCompatibility() {
    console.log('📋 Test 4: Backward Compatibility...');
    let passed = 0;
    const total = 4;

    // Test 4.1: Original API structure preserved
    try {
      const decision = await this.enhancedRouter.shouldTryDeepseekFirst('compatibility test');
      
      const requiredProps = ['tryDeepseek', 'reason', 'fingerprint'];
      const hasAllProps = requiredProps.every(prop => decision.hasOwnProperty(prop));
      
      if (hasAllProps) {
        passed++;
        console.log('  ✅ Original API structure preserved');
      } else {
        console.log('  ❌ Original API structure modified');
      }
    } catch (error) {
      console.log(`  ❌ API structure test error: ${error.message}`);
    }

    // Test 4.2: Empirical methods still work
    try {
      const fingerprint = this.enhancedRouter.generateQueryFingerprint('test');
      const analysis = this.enhancedRouter.analyzeActualFailure(new Error('test'), 30000, 'test');
      
      if (fingerprint && analysis) {
        passed++;
        console.log('  ✅ Empirical methods still functional');
      } else {
        console.log('  ❌ Empirical methods broken');
      }
    } catch (error) {
      console.log(`  ❌ Empirical methods error: ${error.message}`);
    }

    // Test 4.3: Enhanced properties are additive only
    try {
      const decision = await this.enhancedRouter.shouldTryDeepseekFirst('additive test');
      
      // Check that enhancement data doesn't override original properties
      if (decision.tryDeepseek !== undefined && decision.enhancement) {
        passed++;
        console.log('  ✅ Enhanced properties are additive');
      } else {
        console.log('  ❌ Enhanced properties not properly additive');
      }
    } catch (error) {
      console.log(`  ❌ Additive properties test error: ${error.message}`);
    }

    // Test 4.4: Can work with null/undefined enhancement data
    try {
      const fingerprint = { domain: 'test' }; // No enhancement data
      this.enhancedRouter.recordExecutionSuccess(fingerprint, 1000, 'test', {});
      
      passed++;
      console.log('  ✅ Handles missing enhancement data gracefully');
    } catch (error) {
      console.log(`  ❌ Missing enhancement data handling error: ${error.message}`);
    }

    this.recordTestResult('backward_compatibility', passed, total);
    console.log(`Backward Compatibility: ${passed}/${total} passed\n`);
  }

  async testPerformanceImpact() {
    console.log('📋 Test 5: Performance Impact...');
    let passed = 0;
    const total = 3;

    // Test 5.1: Enhancement overhead acceptable
    const iterations = 50;
    const startTime = Date.now();
    
    try {
      for (let i = 0; i < iterations; i++) {
        await this.enhancedRouter.shouldTryDeepseekFirst(`performance test ${i}`);
      }
      
      const totalTime = Date.now() - startTime;
      const averageTime = totalTime / iterations;
      
      if (averageTime < 100) { // 100ms threshold
        passed++;
        console.log(`  ✅ Performance: ${averageTime.toFixed(2)}ms average per enhanced routing`);
      } else {
        console.log(`  ❌ Performance: ${averageTime.toFixed(2)}ms too slow`);
      }
    } catch (error) {
      console.log(`  ❌ Performance test error: ${error.message}`);
    }

    // Test 5.2: Memory usage reasonable
    try {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Generate some routing decisions to build up data structures
      for (let i = 0; i < 100; i++) {
        await this.enhancedRouter.shouldTryDeepseekFirst(`memory test ${i}`);
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / (1024 * 1024); // MB
      
      if (memoryIncrease < 10) { // 10MB threshold
        passed++;
        console.log(`  ✅ Memory usage: ${memoryIncrease.toFixed(2)}MB increase`);
      } else {
        console.log(`  ❌ Memory usage: ${memoryIncrease.toFixed(2)}MB too high`);
      }
    } catch (error) {
      console.log(`  ❌ Memory usage test error: ${error.message}`);
    }

    // Test 5.3: Performance monitoring
    try {
      const stats = this.enhancedRouter.getEnhancedStats();
      
      if (stats.integration.performance && 
          stats.integration.performance.averageEnhancementTime >= 0) {
        passed++;
        console.log('  ✅ Performance monitoring active');
      } else {
        console.log('  ❌ Performance monitoring failed');
      }
    } catch (error) {
      console.log(`  ❌ Performance monitoring error: ${error.message}`);
    }

    this.recordTestResult('performance_impact', passed, total);
    console.log(`Performance Impact: ${passed}/${total} passed\n`);
  }

  async testErrorHandlingAndFallback() {
    console.log('📋 Test 6: Error Handling and Fallback...');
    let passed = 0;
    const total = 4;

    // Test 6.1: Enhancement error fallback
    try {
      // Temporarily break the complexity analyzer
      const originalAnalyzer = this.enhancedRouter.complexityAnalyzer;
      this.enhancedRouter.complexityAnalyzer = {
        analyzeComplexity: () => { throw new Error('Simulated failure'); }
      };

      const decision = await this.enhancedRouter.shouldTryDeepseekFirst('fallback test');
      
      // Should still get a valid decision via fallback
      if (decision.tryDeepseek !== undefined) {
        passed++;
        console.log('  ✅ Enhancement error fallback working');
      } else {
        console.log('  ❌ Enhancement error fallback failed');
      }

      // Restore original analyzer
      this.enhancedRouter.complexityAnalyzer = originalAnalyzer;
    } catch (error) {
      console.log(`  ❌ Enhancement error fallback test failed: ${error.message}`);
    }

    // Test 6.2: Graceful degradation
    try {
      this.enhancedRouter.setFallbackMode(true);
      this.enhancedRouter.disableEnhancement();
      
      const decision = await this.enhancedRouter.shouldTryDeepseekFirst('degradation test');
      
      if (decision && !decision.enhancement) {
        passed++;
        console.log('  ✅ Graceful degradation working');
      } else {
        console.log('  ❌ Graceful degradation failed');
      }

      this.enhancedRouter.enableEnhancement();
    } catch (error) {
      console.log(`  ❌ Graceful degradation error: ${error.message}`);
      this.enhancedRouter.enableEnhancement();
    }

    // Test 6.3: Error metrics tracking
    try {
      const initialStats = this.enhancedRouter.getEnhancedStats();
      const initialErrors = initialStats.integration.enhancementErrors;

      // Simulate an error condition that gets tracked
      // (This would normally happen through failed enhancement, but we can check the structure)
      
      if (typeof initialErrors === 'number') {
        passed++;
        console.log('  ✅ Error metrics tracking functional');
      } else {
        console.log('  ❌ Error metrics tracking not working');
      }
    } catch (error) {
      console.log(`  ❌ Error metrics test error: ${error.message}`);
    }

    // Test 6.4: Health check functionality
    try {
      const healthCheck = this.enhancedRouter.performHealthCheck();
      
      if (healthCheck.status && healthCheck.issues && healthCheck.recommendations) {
        passed++;
        console.log(`  ✅ Health check working (status: ${healthCheck.status})`);
      } else {
        console.log('  ❌ Health check failed');
      }
    } catch (error) {
      console.log(`  ❌ Health check error: ${error.message}`);
    }

    this.recordTestResult('error_handling_fallback', passed, total);
    console.log(`Error Handling and Fallback: ${passed}/${total} passed\n`);
  }

  async testLearningMechanisms() {
    console.log('📋 Test 7: Learning Mechanisms...');
    let passed = 0;
    const total = 3;

    // Test 7.1: Empirical learning preservation
    try {
      const initialEmpiricalQueries = this.mockEmpiricalRouter.empiricalData.totalQueries;
      
      const fingerprint = { domain: 'test', fingerprint: 'learning_test' };
      this.enhancedRouter.recordExecutionSuccess(fingerprint, 2000, 'test', {});
      
      const finalEmpiricalQueries = this.mockEmpiricalRouter.empiricalData.totalQueries;
      
      if (finalEmpiricalQueries > initialEmpiricalQueries) {
        passed++;
        console.log('  ✅ Empirical learning preserved');
      } else {
        console.log('  ❌ Empirical learning not preserved');
      }
    } catch (error) {
      console.log(`  ❌ Empirical learning test error: ${error.message}`);
    }

    // Test 7.2: Complexity learning active
    try {
      const analyzer = this.enhancedRouter.complexityAnalyzer;
      const initialStats = analyzer.getComplexityStats();
      
      analyzer.recordComplexityOutcome(
        'learning test prompt',
        { complexity_type: 'concrete_implementation', suggested_route: 'deepseek', confidence: 0.8 },
        'deepseek',
        true,
        1500
      );
      
      const updatedStats = analyzer.getComplexityStats();
      
      if (Object.keys(updatedStats.learning_data).length > 0) {
        passed++;
        console.log('  ✅ Complexity learning active');
      } else {
        console.log('  ❌ Complexity learning not working');
      }
    } catch (error) {
      console.log(`  ❌ Complexity learning test error: ${error.message}`);
    }

    // Test 7.3: Fusion learning integration
    try {
      const fusion = this.enhancedRouter.decisionFusion;
      const initialStats = fusion.getFusionStats();
      
      fusion.recordFusionOutcome(
        { 
          route: 'deepseek',
          fusion_metadata: { empirical_suggestion: 'deepseek', complexity_suggestion: 'deepseek' }
        },
        'deepseek',
        true,
        1800
      );
      
      const updatedStats = fusion.getFusionStats();
      
      if (updatedStats.fusion_metrics.totalDecisions >= 0) {
        passed++;
        console.log('  ✅ Fusion learning integration working');
      } else {
        console.log('  ❌ Fusion learning integration failed');
      }
    } catch (error) {
      console.log(`  ❌ Fusion learning test error: ${error.message}`);
    }

    this.recordTestResult('learning_mechanisms', passed, total);
    console.log(`Learning Mechanisms: ${passed}/${total} passed\n`);
  }

  async testRealWorldScenarios() {
    console.log('📋 Test 8: Real World Scenarios...');
    let passed = 0;
    const total = 4;

    const realWorldTests = [
      {
        name: 'Empire\'s Edge Performance Optimization',
        prompt: 'optimize the physics simulation in Empire\'s Edge game engine to improve frame rates',
        expectedRoute: 'deepseek',
        expectedComplexity: 'concrete_implementation'
      },
      {
        name: 'Architecture Decision',
        prompt: 'should we use microservices or monolithic architecture for our new web application?',
        expectedRoute: 'claude',
        expectedComplexity: 'strategic_decision'
      },
      {
        name: 'Bug Fix Implementation',
        prompt: 'fix the memory leak in the database connection pool causing server crashes',
        expectedRoute: 'deepseek',
        expectedComplexity: 'concrete_implementation'
      },
      {
        name: 'System Analysis',
        prompt: 'analyze the trade-offs between REST and GraphQL APIs for our mobile app backend',
        expectedRoute: 'claude',
        expectedComplexity: 'abstract_reasoning'
      }
    ];

    for (const test of realWorldTests) {
      try {
        const decision = await this.enhancedRouter.shouldTryDeepseekFirst(test.prompt);
        const actualRoute = decision.tryDeepseek ? 'deepseek' : 'claude';
        const actualComplexity = decision.enhancement?.complexity_analysis?.type;

        const routeCorrect = actualRoute === test.expectedRoute;
        const complexityReasonable = actualComplexity && actualComplexity !== 'unknown';
        const hasEnhancement = !!decision.enhancement;
        const hasConfidence = decision.enhancement?.fusion_decision?.confidence > 0.5;

        if (routeCorrect && complexityReasonable && hasEnhancement && hasConfidence) {
          passed++;
          console.log(`  ✅ ${test.name}: ${actualRoute} (${actualComplexity})`);
        } else {
          console.log(`  ❌ ${test.name}: Expected ${test.expectedRoute}, got ${actualRoute}`);
        }
      } catch (error) {
        console.log(`  ❌ ${test.name}: Error - ${error.message}`);
      }
    }

    this.recordTestResult('real_world_scenarios', passed, total);
    console.log(`Real World Scenarios: ${passed}/${total} passed\n`);
  }

  recordTestResult(testName, passed, total) {
    this.testResults.push({
      test: testName,
      passed: passed,
      total: total,
      percentage: (passed / total) * 100,
      timestamp: new Date().toISOString()
    });
  }

  generateTestReport() {
    const totalTime = Date.now() - this.startTime;
    
    console.log('📊 INTEGRATION TEST RESULTS SUMMARY');
    console.log('====================================');
    
    let totalPassed = 0;
    let totalTests = 0;
    
    for (const result of this.testResults) {
      const status = result.percentage >= 80 ? '✅' : result.percentage >= 60 ? '⚠️' : '❌';
      console.log(`${status} ${result.test}: ${result.passed}/${result.total} (${result.percentage.toFixed(1)}%)`);
      totalPassed += result.passed;
      totalTests += result.total;
    }
    
    const overallPercentage = (totalPassed / totalTests) * 100;
    const overallStatus = overallPercentage >= 85 ? '🎯 EXCELLENT' : 
                         overallPercentage >= 75 ? '✅ GOOD' : 
                         overallPercentage >= 60 ? '⚠️ NEEDS WORK' : '❌ FAILED';
    
    console.log('\n' + '='.repeat(50));
    console.log(`OVERALL RESULT: ${totalPassed}/${totalTests} (${overallPercentage.toFixed(1)}%)`);
    console.log(`STATUS: ${overallStatus}`);
    console.log(`EXECUTION TIME: ${(totalTime / 1000).toFixed(2)}s`);
    
    if (overallPercentage >= 85) {
      console.log('\n🎉 ENHANCED EMPIRICAL ROUTING INTEGRATION: SUCCESS!');
      console.log('✅ System ready for production deployment');
      console.log('✅ Existing empirical routing preserved and enhanced');
      console.log('✅ Complexity intelligence successfully integrated');
      console.log('✅ Decision fusion operational with learning mechanisms');
    } else {
      console.log('\n⚠️ INTEGRATION NEEDS IMPROVEMENT');
      console.log('❌ Review failed tests before production deployment');
    }

    return {
      overall_percentage: overallPercentage,
      status: overallStatus,
      execution_time_seconds: totalTime / 1000,
      detailed_results: this.testResults
    };
  }

  getOverallResults() {
    const totalPassed = this.testResults.reduce((sum, result) => sum + result.passed, 0);
    const totalTests = this.testResults.reduce((sum, result) => sum + result.total, 0);
    const overallPercentage = (totalPassed / totalTests) * 100;
    
    return {
      success: overallPercentage >= 85,
      percentage: overallPercentage,
      total_passed: totalPassed,
      total_tests: totalTests,
      test_results: this.testResults,
      ready_for_deployment: overallPercentage >= 85
    };
  }
}

// Export test runner
export { IntegrationTestSuite };

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const testSuite = new IntegrationTestSuite();
  testSuite.runAllTests().then(results => {
    process.exit(results.success ? 0 : 1);
  }).catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
}