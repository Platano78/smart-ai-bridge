/**
 * Enhanced Empirical Router for DeepSeek MCP Bridge v6.1.1
 * Seamlessly integrates complexity analysis with existing empirical routing
 * 
 * INTEGRATION APPROACH:
 * - WRAPS existing EmpiricalRoutingManager without modifying it
 * - ENHANCES decisions with complexity intelligence and fusion logic
 * - PRESERVES all existing empirical learning and data structures
 * - MAINTAINS backward compatibility with existing API
 * - ADDS enhanced routing capabilities as optional layer
 */

import { ComplexityAnalyzer } from './complexity-analyzer.js';
import { DecisionFusion } from './decision-fusion.js';

export class EnhancedEmpiricalRouter {
  constructor(existingEmpiricalRouter) {
    // PRESERVE existing empirical router (composition, not inheritance)
    this.empiricalRouter = existingEmpiricalRouter;
    
    // ADD enhancement layers
    this.complexityAnalyzer = new ComplexityAnalyzer();
    this.decisionFusion = new DecisionFusion();
    
    // Enhancement control flags
    this.enhancementEnabled = true;
    this.fallbackToEmpiricalOnError = true;
    
    // Integration metrics
    this.integrationMetrics = {
      totalQueries: 0,
      enhancedQueries: 0,
      empiricalOnlyQueries: 0,
      enhancementErrors: 0,
      enhancementValue: 0,
      integrationSuccessRate: 0
    };

    // Performance monitoring
    this.performanceMonitor = {
      averageEnhancementTime: 0,
      maxEnhancementTime: 0,
      enhancementTimeouts: 0
    };

    console.error('🚀 Enhanced Empirical Router initialized - preserving existing empirical system');
  }

  /**
   * Enhanced version of shouldTryDeepseekFirst - main integration point
   * This method maintains the same API as the existing empirical router
   */
  async shouldTryDeepseekFirst(prompt) {
    const startTime = Date.now();
    this.integrationMetrics.totalQueries++;

    try {
      // Get decision from existing empirical system (PRESERVE original logic)
      const empiricalDecision = await this.empiricalRouter.shouldTryDeepseekFirst(prompt);
      
      // If enhancement is disabled, return original decision
      if (!this.enhancementEnabled) {
        this.integrationMetrics.empiricalOnlyQueries++;
        return empiricalDecision;
      }

      // ADD complexity analysis and fusion enhancement
      const enhancedDecision = await this.enhanceEmpiricalDecision(prompt, empiricalDecision);
      
      // Record performance metrics
      this.recordEnhancementPerformance(Date.now() - startTime);
      this.integrationMetrics.enhancedQueries++;

      return enhancedDecision;

    } catch (error) {
      console.error(`❌ Enhancement error: ${error.message}`);
      this.integrationMetrics.enhancementErrors++;
      
      if (this.fallbackToEmpiricalOnError) {
        // Fallback to original empirical decision
        console.error('🔄 Falling back to pure empirical routing');
        this.integrationMetrics.empiricalOnlyQueries++;
        return await this.empiricalRouter.shouldTryDeepseekFirst(prompt);
      } else {
        throw error;
      }
    }
  }

  /**
   * Core enhancement logic - adds complexity intelligence to empirical decision
   */
  async enhanceEmpiricalDecision(prompt, empiricalDecision) {
    try {
      // Step 1: Analyze complexity with enhancement of existing fingerprint
      const complexityAnalysis = this.complexityAnalyzer.analyzeComplexity(
        prompt, 
        empiricalDecision.fingerprint
      );

      // Step 2: Fuse empirical evidence with complexity intelligence
      const fusedDecision = this.decisionFusion.fuseIntelligence(
        empiricalDecision, 
        complexityAnalysis, 
        prompt
      );

      // Step 3: Create enhanced empirical decision maintaining API compatibility
      const enhancedDecision = this.createEnhancedDecision(
        empiricalDecision, 
        complexityAnalysis, 
        fusedDecision
      );

      return enhancedDecision;

    } catch (error) {
      console.error(`Enhancement process failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create enhanced decision that maintains API compatibility
   */
  createEnhancedDecision(empiricalDecision, complexityAnalysis, fusedDecision) {
    return {
      // PRESERVE existing empirical API structure
      tryDeepseek: fusedDecision.route === 'deepseek',
      reason: this.createEnhancedReason(empiricalDecision, complexityAnalysis, fusedDecision),
      fingerprint: complexityAnalysis.enhanced_fingerprint || empiricalDecision.fingerprint,
      historicalData: empiricalDecision.historicalData,

      // ADD enhancement metadata (non-breaking additions)
      enhancement: {
        enabled: true,
        complexity_analysis: {
          type: complexityAnalysis.complexity_type,
          confidence: complexityAnalysis.confidence,
          suggested_route: complexityAnalysis.suggested_route,
          reasoning: complexityAnalysis.reasoning
        },
        fusion_decision: {
          route: fusedDecision.route,
          confidence: fusedDecision.confidence,
          fusion_score: fusedDecision.fusion_score,
          agreement: fusedDecision.fusion_metadata?.agreement || false
        },
        decision_metadata: {
          empirical_suggestion: empiricalDecision.tryDeepseek ? 'deepseek' : 'claude',
          complexity_suggestion: complexityAnalysis.suggested_route,
          final_route: fusedDecision.route,
          enhancement_rule: fusedDecision.enhancement_rule,
          confidence_level: this.categorizeConfidence(fusedDecision.confidence)
        }
      }
    };
  }

  createEnhancedReason(empiricalDecision, complexityAnalysis, fusedDecision) {
    const empiricalRoute = empiricalDecision.tryDeepseek ? 'deepseek' : 'claude';
    const complexityRoute = complexityAnalysis.suggested_route;
    const finalRoute = fusedDecision.route;

    if (empiricalRoute === complexityRoute && empiricalRoute === finalRoute) {
      return `Enhanced routing consensus: Both empirical evidence and complexity analysis suggest ${finalRoute} (confidence: ${fusedDecision.confidence.toFixed(2)})`;
    } else if (empiricalRoute !== complexityRoute) {
      return `Enhanced routing resolution: Empirical suggests ${empiricalRoute}, complexity suggests ${complexityRoute}, fusion decision: ${finalRoute} (${fusedDecision.enhancement_rule || 'weighted_fusion'})`;
    } else {
      return `Enhanced routing: ${empiricalDecision.reason} + complexity analysis (${complexityAnalysis.complexity_type}) → ${finalRoute}`;
    }
  }

  categorizeConfidence(confidence) {
    if (confidence >= 0.85) return 'high';
    if (confidence >= 0.70) return 'medium';
    if (confidence >= 0.55) return 'low';
    return 'minimal';
  }

  /**
   * Enhanced version of recordExecutionSuccess - preserves empirical learning
   */
  recordExecutionSuccess(fingerprint, responseTime, prompt, result) {
    // PRESERVE original empirical learning (critical!)
    this.empiricalRouter.recordExecutionSuccess(fingerprint, responseTime, prompt, result);

    // ADD complexity and fusion learning
    try {
      this.recordEnhancementSuccess(fingerprint, responseTime, prompt, result);
    } catch (error) {
      console.error(`Enhancement learning error: ${error.message}`);
      // Continue - empirical learning already succeeded
    }
  }

  /**
   * Enhanced version of recordExecutionFailure - preserves empirical learning
   */
  recordExecutionFailure(fingerprint, responseTime, error, failureAnalysis) {
    // PRESERVE original empirical learning (critical!)
    this.empiricalRouter.recordExecutionFailure(fingerprint, responseTime, error, failureAnalysis);

    // ADD complexity and fusion learning
    try {
      this.recordEnhancementFailure(fingerprint, responseTime, error, failureAnalysis);
    } catch (enhancementError) {
      console.error(`Enhancement learning error: ${enhancementError.message}`);
      // Continue - empirical learning already succeeded
    }
  }

  recordEnhancementSuccess(fingerprint, responseTime, prompt, result) {
    // Extract enhancement metadata from fingerprint if available
    const enhancementData = fingerprint.enhancement;
    if (!enhancementData) return;

    const complexityAnalysis = enhancementData.complexity_analysis;
    const fusionDecision = enhancementData.fusion_decision;

    // Record complexity learning
    this.complexityAnalyzer.recordComplexityOutcome(
      prompt,
      complexityAnalysis,
      fusionDecision.route,
      true, // success
      responseTime
    );

    // Record fusion learning
    this.decisionFusion.recordFusionOutcome(
      fusionDecision,
      fusionDecision.route,
      true, // success
      responseTime
    );

    // Update integration metrics
    this.updateIntegrationSuccessRate(true);
  }

  recordEnhancementFailure(fingerprint, responseTime, error, failureAnalysis) {
    // Extract enhancement metadata from fingerprint if available
    const enhancementData = fingerprint.enhancement;
    if (!enhancementData) return;

    const complexityAnalysis = enhancementData.complexity_analysis;
    const fusionDecision = enhancementData.fusion_decision;

    // Record complexity learning
    this.complexityAnalyzer.recordComplexityOutcome(
      prompt,
      complexityAnalysis,
      fusionDecision.route,
      false, // failure
      responseTime
    );

    // Record fusion learning
    this.decisionFusion.recordFusionOutcome(
      fusionDecision,
      fusionDecision.route,
      false, // failure
      responseTime,
      error
    );

    // Update integration metrics
    this.updateIntegrationSuccessRate(false);
  }

  updateIntegrationSuccessRate(success) {
    const totalEnhanced = this.integrationMetrics.enhancedQueries;
    if (totalEnhanced === 0) return;

    if (success) {
      this.integrationMetrics.integrationSuccessRate = 
        (this.integrationMetrics.integrationSuccessRate * (totalEnhanced - 1) + 1) / totalEnhanced;
    } else {
      this.integrationMetrics.integrationSuccessRate = 
        (this.integrationMetrics.integrationSuccessRate * (totalEnhanced - 1)) / totalEnhanced;
    }
  }

  recordEnhancementPerformance(enhancementTime) {
    const currentCount = this.integrationMetrics.enhancedQueries;
    
    // Update average
    this.performanceMonitor.averageEnhancementTime = 
      (this.performanceMonitor.averageEnhancementTime * (currentCount - 1) + enhancementTime) / currentCount;
    
    // Update max
    if (enhancementTime > this.performanceMonitor.maxEnhancementTime) {
      this.performanceMonitor.maxEnhancementTime = enhancementTime;
    }

    // Track timeouts (enhancement taking too long)
    if (enhancementTime > 500) { // 500ms threshold
      this.performanceMonitor.enhancementTimeouts++;
    }
  }

  /**
   * Proxy methods to maintain compatibility with existing empirical router API
   */
  generateQueryFingerprint(prompt) {
    return this.empiricalRouter.generateQueryFingerprint(prompt);
  }

  analyzeActualFailure(error, responseTime, prompt) {
    return this.empiricalRouter.analyzeActualFailure(error, responseTime, prompt);
  }

  /**
   * Enhanced statistics that combine empirical and complexity intelligence
   */
  getEnhancedStats() {
    // Get stats from all components
    const empiricalStats = this.empiricalRouter.empiricalData;
    const complexityStats = this.complexityAnalyzer.getComplexityStats();
    const fusionStats = this.decisionFusion.getFusionStats();

    return {
      // Original empirical data (PRESERVED)
      empirical: {
        totalQueries: empiricalStats.totalQueries,
        successfulQueries: empiricalStats.successfulQueries,
        failedQueries: empiricalStats.failedQueries,
        successRate: empiricalStats.successfulQueries / Math.max(1, empiricalStats.totalQueries),
        executionData: empiricalStats.executions.size
      },

      // Complexity analysis data
      complexity: complexityStats,

      // Decision fusion data
      fusion: fusionStats,

      // Integration performance
      integration: {
        ...this.integrationMetrics,
        performance: { ...this.performanceMonitor },
        enhancement_overhead: this.performanceMonitor.averageEnhancementTime,
        reliability: (this.integrationMetrics.enhancedQueries - this.integrationMetrics.enhancementErrors) / 
                    Math.max(1, this.integrationMetrics.enhancedQueries)
      },

      // Overall system health
      system: {
        total_queries: this.integrationMetrics.totalQueries,
        enhancement_adoption: this.integrationMetrics.enhancedQueries / Math.max(1, this.integrationMetrics.totalQueries),
        system_reliability: this.calculateSystemReliability(),
        timestamp: new Date().toISOString()
      }
    };
  }

  calculateSystemReliability() {
    const totalQueries = this.integrationMetrics.totalQueries;
    if (totalQueries === 0) return 1.0;

    const successfulQueries = totalQueries - this.integrationMetrics.enhancementErrors;
    return successfulQueries / totalQueries;
  }

  /**
   * Configuration and control methods
   */
  enableEnhancement() {
    this.enhancementEnabled = true;
    console.error('✅ Enhanced routing enabled');
  }

  disableEnhancement() {
    this.enhancementEnabled = false;
    console.error('⏸️ Enhanced routing disabled - using pure empirical routing');
  }

  setFallbackMode(enabled) {
    this.fallbackToEmpiricalOnError = enabled;
    console.error(`🔄 Empirical fallback mode: ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Health check and diagnostics
   */
  performHealthCheck() {
    const stats = this.getEnhancedStats();
    const health = {
      status: 'healthy',
      issues: [],
      recommendations: []
    };

    // Check integration performance
    if (stats.integration.performance.averageEnhancementTime > 200) {
      health.issues.push('High enhancement latency');
      health.recommendations.push('Consider optimizing complexity analysis patterns');
    }

    // Check enhancement error rate
    const errorRate = stats.integration.enhancementErrors / Math.max(1, stats.integration.totalQueries);
    if (errorRate > 0.05) { // 5% error threshold
      health.issues.push('High enhancement error rate');
      health.recommendations.push('Review error logs and consider fallback settings');
    }

    // Check system reliability
    if (stats.system.system_reliability < 0.95) {
      health.issues.push('System reliability below threshold');
      health.status = 'degraded';
    }

    // Overall health assessment
    if (health.issues.length === 0) {
      health.status = 'excellent';
      health.recommendations.push('System performing optimally');
    } else if (health.issues.length > 2) {
      health.status = 'needs_attention';
    }

    return health;
  }

  /**
   * Integration validation - ensures enhanced system works correctly
   */
  async validateIntegration() {
    console.error('🧪 Validating enhanced empirical router integration...');
    
    const testPrompts = [
      'implement user authentication function',
      'choose between JWT and session-based authentication',  
      'analyze trade-offs between different database patterns',
      'fix database connection timeout issue'
    ];

    const results = [];
    
    for (const prompt of testPrompts) {
      try {
        const decision = await this.shouldTryDeepseekFirst(prompt);
        results.push({
          prompt: prompt,
          route: decision.tryDeepseek ? 'deepseek' : 'claude',
          enhanced: !!decision.enhancement,
          confidence: decision.enhancement?.fusion_decision?.confidence || 0.7,
          complexity_type: decision.enhancement?.complexity_analysis?.type || 'unknown'
        });
      } catch (error) {
        results.push({
          prompt: prompt,
          error: error.message,
          fallback_used: true
        });
      }
    }

    console.error('✅ Integration validation completed');
    return {
      validation_results: results,
      integration_health: this.performHealthCheck(),
      timestamp: new Date().toISOString()
    };
  }
}

export default EnhancedEmpiricalRouter;