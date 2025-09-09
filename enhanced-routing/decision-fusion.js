/**
 * Decision Fusion Logic for DeepSeek MCP Bridge v6.1.1
 * Intelligently combines empirical evidence with complexity analysis
 * 
 * FUSION STRATEGY:
 * - PRESERVES existing empirical routing as primary intelligence source
 * - ENHANCES decisions with complexity analysis insights
 * - LEARNS from combined decision outcomes to optimize fusion weights
 * - MAINTAINS backward compatibility with existing empirical system
 */

export class DecisionFusion {
  constructor() {
    // Fusion weights - start with empirical evidence as primary
    this.fusionWeights = {
      empirical_evidence: 0.65,      // Existing empirical success/failure data
      complexity_analysis: 0.35      // New complexity intelligence
    };

    // Fusion learning data
    this.fusionLearningData = new Map();
    this.performanceHistory = new Map();
    
    // Fusion metrics
    this.fusionMetrics = {
      totalDecisions: 0,
      enhancedDecisions: 0,
      fusionSuccesses: 0,
      empiricalOverrides: 0,
      complexityOverrides: 0,
      weightAdjustments: 0
    };

    // Decision confidence thresholds
    this.confidenceThresholds = {
      high_confidence: 0.85,
      medium_confidence: 0.70,
      low_confidence: 0.55,
      minimum_viable: 0.50
    };
  }

  /**
   * Main fusion method: combines empirical decision with complexity analysis
   * This is the primary integration point with existing empirical routing
   */
  fuseIntelligence(empiricalDecision, complexityAnalysis, prompt) {
    const startTime = Date.now();
    this.fusionMetrics.totalDecisions++;

    try {
      // Extract intelligence from both sources
      const empiricalIntel = this.extractEmpiricalIntelligence(empiricalDecision);
      const complexityIntel = this.extractComplexityIntelligence(complexityAnalysis);

      // Calculate fusion decision
      const fusionDecision = this.calculateFusionDecision(
        empiricalIntel, 
        complexityIntel, 
        prompt
      );

      // Apply decision enhancement rules
      const enhancedDecision = this.applyEnhancementRules(
        fusionDecision, 
        empiricalIntel, 
        complexityIntel
      );

      // Record fusion decision for learning
      this.recordFusionAttempt(enhancedDecision, empiricalIntel, complexityIntel);

      const processingTime = Date.now() - startTime;
      console.error(`🔄 Decision Fusion: ${enhancedDecision.route} (${enhancedDecision.confidence.toFixed(2)}) [${processingTime}ms]`);

      return enhancedDecision;

    } catch (error) {
      console.error(`❌ Decision fusion error: ${error.message}`);
      // Fallback to empirical decision if fusion fails
      return this.createFallbackDecision(empiricalDecision, error);
    }
  }

  extractEmpiricalIntelligence(empiricalDecision) {
    // Extract actionable intelligence from existing empirical system
    const historicalData = empiricalDecision.historicalData;
    
    return {
      suggested_route: empiricalDecision.tryDeepseek ? 'deepseek' : 'claude',
      confidence: historicalData 
        ? historicalData.successRate 
        : 0.70, // Default confidence when no historical data
      reasoning: empiricalDecision.reason || 'Empirical evidence from historical patterns',
      evidence_strength: historicalData 
        ? Math.min(1.0, historicalData.totalExecutions / 10) // More executions = stronger evidence
        : 0.1,
      fingerprint: empiricalDecision.fingerprint,
      historical_context: {
        total_executions: historicalData?.totalExecutions || 0,
        success_rate: historicalData?.successRate || 0,
        average_response_time: historicalData?.averageResponseTime || 0
      }
    };
  }

  extractComplexityIntelligence(complexityAnalysis) {
    // Extract actionable intelligence from complexity analysis
    return {
      suggested_route: complexityAnalysis.suggested_route,
      confidence: complexityAnalysis.confidence,
      reasoning: complexityAnalysis.reasoning,
      complexity_type: complexityAnalysis.complexity_type,
      complexity_level: complexityAnalysis.complexity_level,
      evidence_strength: complexityAnalysis.confidence, // Confidence as evidence strength
      pattern_match: complexityAnalysis.all_scores || {}
    };
  }

  calculateFusionDecision(empiricalIntel, complexityIntel, prompt) {
    // Calculate weighted scores for each possible route
    const routes = ['deepseek', 'claude'];
    const routeScores = {};

    for (const route of routes) {
      routeScores[route] = 0;

      // Add empirical weight
      if (empiricalIntel.suggested_route === route) {
        const empiricalScore = empiricalIntel.confidence * empiricalIntel.evidence_strength;
        routeScores[route] += this.fusionWeights.empirical_evidence * empiricalScore;
      }

      // Add complexity weight
      if (complexityIntel.suggested_route === route) {
        const complexityScore = complexityIntel.confidence * complexityIntel.evidence_strength;
        routeScores[route] += this.fusionWeights.complexity_analysis * complexityScore;
      }
    }

    // Determine best route
    const bestRoute = Object.entries(routeScores)
      .reduce((best, [route, score]) => 
        score > best.score ? { route, score } : best, 
        { route: 'deepseek', score: 0 }
      );

    // Calculate combined confidence
    const combinedConfidence = this.calculateCombinedConfidence(
      empiricalIntel, 
      complexityIntel, 
      bestRoute
    );

    return {
      route: bestRoute.route,
      confidence: combinedConfidence,
      fusion_score: bestRoute.score,
      route_scores: routeScores,
      empirical_input: empiricalIntel,
      complexity_input: complexityIntel
    };
  }

  calculateCombinedConfidence(empiricalIntel, complexityIntel, bestRoute) {
    // Combine confidences based on agreement and evidence strength
    const empiricalConf = empiricalIntel.confidence;
    const complexityConf = complexityIntel.confidence;

    // Check if both intelligence sources agree on the route
    const agreement = empiricalIntel.suggested_route === complexityIntel.suggested_route;

    if (agreement) {
      // Both agree - higher confidence through consensus
      const weightedConfidence = 
        (empiricalConf * this.fusionWeights.empirical_evidence) +
        (complexityConf * this.fusionWeights.complexity_analysis);
      
      // Bonus for consensus (max 0.95 to prevent overconfidence)
      return Math.min(0.95, weightedConfidence + 0.05);
    } else {
      // Sources disagree - confidence based on winning source
      const empiricalForWinner = empiricalIntel.suggested_route === bestRoute.route;
      const baseConfidence = empiricalForWinner ? empiricalConf : complexityConf;
      
      // Reduce confidence due to disagreement
      return Math.max(0.50, baseConfidence - 0.10);
    }
  }

  applyEnhancementRules(fusionDecision, empiricalIntel, complexityIntel) {
    let enhancedDecision = { ...fusionDecision };

    // Rule 1: Strong empirical evidence override
    if (empiricalIntel.evidence_strength > 0.8 && empiricalIntel.confidence > 0.85) {
      if (empiricalIntel.suggested_route !== fusionDecision.route) {
        enhancedDecision.route = empiricalIntel.suggested_route;
        enhancedDecision.confidence = empiricalIntel.confidence;
        enhancedDecision.enhancement_rule = 'empirical_override';
        this.fusionMetrics.empiricalOverrides++;
      }
    }

    // Rule 2: High complexity confidence for strategic tasks
    if (complexityIntel.complexity_type === 'strategic_decision' && 
        complexityIntel.confidence > 0.90) {
      if (complexityIntel.suggested_route !== fusionDecision.route) {
        enhancedDecision.route = complexityIntel.suggested_route;
        enhancedDecision.confidence = complexityIntel.confidence;
        enhancedDecision.enhancement_rule = 'complexity_override';
        this.fusionMetrics.complexityOverrides++;
      }
    }

    // Rule 3: Minimum viable confidence enforcement
    if (enhancedDecision.confidence < this.confidenceThresholds.minimum_viable) {
      // Default to DeepSeek with empirical "try first" principle
      enhancedDecision.route = 'deepseek';
      enhancedDecision.confidence = 0.60;
      enhancedDecision.enhancement_rule = 'minimum_confidence_fallback';
    }

    // Add comprehensive metadata
    enhancedDecision.fusion_metadata = {
      empirical_suggestion: empiricalIntel.suggested_route,
      complexity_suggestion: complexityIntel.suggested_route,
      agreement: empiricalIntel.suggested_route === complexityIntel.suggested_route,
      fusion_weights: { ...this.fusionWeights },
      enhancement_rule: enhancedDecision.enhancement_rule,
      decision_timestamp: new Date().toISOString()
    };

    return enhancedDecision;
  }

  /**
   * Record fusion outcome for learning and weight optimization
   */
  recordFusionOutcome(fusionDecision, actualRoute, success, responseTime, error = null) {
    const decisionKey = `${fusionDecision.route}_fusion`;
    
    // Update performance history
    if (!this.performanceHistory.has(decisionKey)) {
      this.performanceHistory.set(decisionKey, {
        total_decisions: 0,
        successful_decisions: 0,
        failed_decisions: 0,
        average_response_time: 0,
        last_updated: null
      });
    }

    const history = this.performanceHistory.get(decisionKey);
    history.total_decisions++;
    
    if (success) {
      history.successful_decisions++;
      this.fusionMetrics.fusionSuccesses++;
    } else {
      history.failed_decisions++;
    }

    // Update average response time
    history.average_response_time = (
      (history.average_response_time * (history.total_decisions - 1)) + responseTime
    ) / history.total_decisions;
    
    history.last_updated = new Date().toISOString();
    this.performanceHistory.set(decisionKey, history);

    // Learn from fusion decision accuracy
    this.learnFromFusionOutcome(fusionDecision, success, responseTime);

    // Adaptive weight adjustment
    this.adjustFusionWeights(fusionDecision, success);

    console.error(`📊 Fusion Learning: ${decisionKey} - success rate: ${Math.round((history.successful_decisions/history.total_decisions)*100)}%`);

    return {
      decision_route: fusionDecision.route,
      success_rate: history.successful_decisions / history.total_decisions,
      total_decisions: history.total_decisions,
      enhanced_performance: this.calculateEnhancementValue()
    };
  }

  learnFromFusionOutcome(fusionDecision, success, responseTime) {
    // Learn patterns about when fusion decisions work well
    const metadata = fusionDecision.fusion_metadata;
    const learningKey = `${metadata.empirical_suggestion}_${metadata.complexity_suggestion}_${metadata.agreement}`;
    
    if (!this.fusionLearningData.has(learningKey)) {
      this.fusionLearningData.set(learningKey, {
        pattern_successes: 0,
        pattern_failures: 0,
        average_confidence: 0,
        optimal_weights: { ...this.fusionWeights }
      });
    }

    const data = this.fusionLearningData.get(learningKey);
    const totalOutcomes = data.pattern_successes + data.pattern_failures;
    
    if (success) {
      data.pattern_successes++;
    } else {
      data.pattern_failures++;
    }

    // Update average confidence for this pattern
    data.average_confidence = (
      (data.average_confidence * totalOutcomes) + fusionDecision.confidence
    ) / (totalOutcomes + 1);

    this.fusionLearningData.set(learningKey, data);
  }

  adjustFusionWeights(fusionDecision, success) {
    // Simple adaptive weight adjustment based on decision outcomes
    const metadata = fusionDecision.fusion_metadata;
    const adjustment = success ? 0.01 : -0.01;

    if (metadata.agreement && success) {
      // Both agreed and succeeded - slight boost to both
      this.fusionWeights.empirical_evidence += adjustment * 0.5;
      this.fusionWeights.complexity_analysis += adjustment * 0.5;
    } else if (!metadata.agreement) {
      // Sources disagreed - adjust based on which was right
      if ((metadata.empirical_suggestion === fusionDecision.route) && success) {
        this.fusionWeights.empirical_evidence += adjustment;
        this.fusionWeights.complexity_analysis -= adjustment;
      } else if ((metadata.complexity_suggestion === fusionDecision.route) && success) {
        this.fusionWeights.complexity_analysis += adjustment;
        this.fusionWeights.empirical_evidence -= adjustment;
      }
    }

    // Normalize weights to sum to 1.0
    const totalWeight = this.fusionWeights.empirical_evidence + this.fusionWeights.complexity_analysis;
    this.fusionWeights.empirical_evidence /= totalWeight;
    this.fusionWeights.complexity_analysis /= totalWeight;

    this.fusionMetrics.weightAdjustments++;
  }

  calculateEnhancementValue() {
    // Calculate the value added by fusion vs pure empirical routing
    const totalDecisions = this.fusionMetrics.totalDecisions;
    if (totalDecisions === 0) return 0;

    const fusionSuccessRate = this.fusionMetrics.fusionSuccesses / totalDecisions;
    
    // Estimate what pure empirical success rate would have been
    // This is approximate - in real implementation you'd track this separately
    const estimatedEmpiricalSuccessRate = 0.75; // Baseline estimate
    
    const enhancementValue = ((fusionSuccessRate - estimatedEmpiricalSuccessRate) / estimatedEmpiricalSuccessRate) * 100;
    return Math.round(enhancementValue);
  }

  recordFusionAttempt(decision, empiricalIntel, complexityIntel) {
    this.fusionMetrics.enhancedDecisions++;
  }

  createFallbackDecision(empiricalDecision, error) {
    // If fusion fails, fall back to pure empirical decision
    return {
      route: empiricalDecision.tryDeepseek ? 'deepseek' : 'claude',
      confidence: 0.70,
      fusion_score: 0,
      route_scores: { deepseek: 0.7, claude: 0.3 },
      empirical_input: this.extractEmpiricalIntelligence(empiricalDecision),
      complexity_input: null,
      fusion_metadata: {
        fallback_reason: error.message,
        empirical_fallback: true,
        decision_timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Generate comprehensive fusion performance report
   */
  getFusionStats() {
    const performanceData = {};
    for (const [key, data] of this.performanceHistory.entries()) {
      performanceData[key] = {
        success_rate: data.successful_decisions / data.total_decisions,
        total_decisions: data.total_decisions,
        average_response_time: data.average_response_time
      };
    }

    const learningData = {};
    for (const [pattern, data] of this.fusionLearningData.entries()) {
      const total = data.pattern_successes + data.pattern_failures;
      learningData[pattern] = {
        success_rate: total > 0 ? data.pattern_successes / total : 0,
        total_patterns: total,
        average_confidence: data.average_confidence
      };
    }

    return {
      fusion_metrics: { ...this.fusionMetrics },
      performance_data: performanceData,
      learning_patterns: learningData,
      current_weights: { ...this.fusionWeights },
      enhancement_value: this.calculateEnhancementValue(),
      confidence_thresholds: { ...this.confidenceThresholds },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Integration helper for existing empirical routing system
   */
  createEnhancedEmpiricalDecision(empiricalDecision, complexityAnalysis, prompt) {
    // This is the main integration point for the existing system
    const fusionDecision = this.fuseIntelligence(empiricalDecision, complexityAnalysis, prompt);
    
    return {
      // PRESERVE original empirical structure
      tryDeepseek: fusionDecision.route === 'deepseek',
      reason: `Enhanced routing: ${fusionDecision.fusion_metadata.empirical_suggestion} (empirical) + ${fusionDecision.fusion_metadata.complexity_suggestion} (complexity) = ${fusionDecision.route}`,
      fingerprint: empiricalDecision.fingerprint,
      historicalData: empiricalDecision.historicalData,
      
      // ADD fusion enhancements
      fusion_enhancement: fusionDecision,
      enhanced_confidence: fusionDecision.confidence,
      enhancement_metadata: fusionDecision.fusion_metadata
    };
  }
}

export default DecisionFusion;