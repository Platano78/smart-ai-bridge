/**
 * Complexity Analysis Enhancement for DeepSeek MCP Bridge v6.1.1
 * Integrates with existing EmpiricalRoutingManager to provide complexity intelligence
 * 
 * INTEGRATION STRATEGY:
 * - PRESERVES existing empirical routing logic
 * - ENHANCES fingerprinting with complexity patterns  
 * - ADDS complexity confidence to routing decisions
 * - LEARNS from routing outcomes to improve complexity detection
 */

export class ComplexityAnalyzer {
  constructor() {
    this.complexityPatterns = this.initializeComplexityPatterns();
    this.complexityLearningData = new Map(); // Store complexity learning outcomes
    this.performanceMetrics = {
      totalAnalyses: 0,
      accurateComplexityPredictions: 0,
      averageAnalysisTime: 0
    };
  }

  initializeComplexityPatterns() {
    return {
      // High-confidence concrete implementation patterns
      concrete_implementation: {
        patterns: [
          /implement|create|build|write|code|fix|optimize|debug/i,
          /function|class|component|method|api/i,
          /bug|error|issue|problem.*fix/i,
          /performance.*optimize|speed.*up|make.*faster/i
        ],
        keywords: ['implement', 'create', 'build', 'write', 'fix', 'optimize', 'code', 'debug'],
        confidence_base: 0.75,
        route_preference: 'deepseek',
        complexity_level: 'medium',
        reasoning: 'Concrete implementation with clear deliverable'
      },

      // Strategic decision-making patterns  
      strategic_decision: {
        patterns: [
          /choose|decide|should.*use|which.*better|compare.*options/i,
          /architecture|design.*pattern|approach|strategy/i,
          /trade.*off|pros.*cons|advantages.*disadvantages/i,
          /best.*practice|recommendation|advice/i
        ],
        keywords: ['choose', 'decide', 'should', 'which', 'compare', 'design', 'architecture'],
        confidence_base: 0.80,
        route_preference: 'claude',
        complexity_level: 'high',
        reasoning: 'Strategic decision requiring analysis and judgment'
      },

      // Abstract reasoning and analysis
      abstract_reasoning: {
        patterns: [
          /analyze|evaluate|assess|examine|review/i,
          /explain.*why|understand.*how|concept|theory/i,
          /implications|consequences|impact|effects/i,
          /patterns|trends|relationships|correlations/i
        ],
        keywords: ['analyze', 'evaluate', 'assess', 'explain', 'understand', 'concept'],
        confidence_base: 0.85,
        route_preference: 'claude',
        complexity_level: 'high',
        reasoning: 'Abstract reasoning requiring deep analysis'
      },

      // Multi-step complex tasks
      complex_multi_step: {
        patterns: [
          /step.*by.*step|multiple.*parts|several.*components/i,
          /first.*then.*finally|workflow|process|procedure/i,
          /integrate.*with|connect.*to|combine.*systems/i,
          /end.*to.*end|full.*implementation|complete.*system/i
        ],
        keywords: ['step', 'workflow', 'process', 'integrate', 'complete', 'full'],
        confidence_base: 0.70,
        route_preference: 'claude',
        complexity_level: 'very_high',
        reasoning: 'Multi-step task requiring orchestration'
      },

      // Domain-specific technical implementation
      domain_technical: {
        patterns: [
          /database|sql|query|schema/i,
          /api|endpoint|rest|graphql/i,
          /react|vue|angular|javascript|typescript/i,
          /python|java|c\+\+|rust|go/i
        ],
        keywords: ['database', 'api', 'react', 'javascript', 'python'],
        confidence_base: 0.75,
        route_preference: 'deepseek',
        complexity_level: 'medium',
        reasoning: 'Domain-specific technical implementation'
      }
    };
  }

  /**
   * Analyze task complexity and provide routing intelligence
   * This enhances the existing empirical fingerprint with complexity insights
   */
  analyzeComplexity(prompt, existingFingerprint = null) {
    const startTime = Date.now();
    this.performanceMetrics.totalAnalyses++;

    try {
      const analysis = this.performComplexityAnalysis(prompt);
      
      // Enhance existing fingerprint if provided (integration with empirical system)
      if (existingFingerprint) {
        analysis.enhanced_fingerprint = this.enhanceFingerprint(existingFingerprint, analysis);
      }

      // Record analysis performance
      const analysisTime = Date.now() - startTime;
      this.updatePerformanceMetrics(analysisTime);

      console.error(`🧠 Complexity Analysis: ${analysis.complexity_type} (${analysis.confidence.toFixed(2)}) -> ${analysis.suggested_route} [${analysisTime}ms]`);
      
      return analysis;

    } catch (error) {
      console.error(`❌ Complexity analysis error: ${error.message}`);
      // Fallback to neutral analysis
      return this.createNeutralAnalysis(prompt);
    }
  }

  performComplexityAnalysis(prompt) {
    const promptLower = prompt.toLowerCase();
    const scores = {};
    let bestMatch = null;
    let maxScore = 0;

    // Score each complexity type
    for (const [type, config] of Object.entries(this.complexityPatterns)) {
      let score = 0;
      let matches = 0;

      // Pattern matching
      for (const pattern of config.patterns) {
        if (pattern.test(prompt)) {
          score += 2;
          matches++;
        }
      }

      // Keyword matching
      for (const keyword of config.keywords) {
        if (promptLower.includes(keyword)) {
          score += 1;
        }
      }

      // Length and structure analysis
      if (prompt.length > 500) score += 0.5; // Longer prompts often more complex
      if (prompt.split('\n').length > 5) score += 0.5; // Multi-line suggests complexity
      if (/```/.test(prompt)) score += (type === 'concrete_implementation' ? 1 : 0); // Code blocks

      const confidence = Math.min(0.95, config.confidence_base + (score * 0.05));
      
      scores[type] = {
        raw_score: score,
        confidence: confidence,
        matches: matches,
        preference: config.route_preference,
        level: config.complexity_level,
        reasoning: config.reasoning
      };

      if (score > maxScore) {
        maxScore = score;
        bestMatch = { type, ...scores[type] };
      }
    }

    // If no strong match, default to concrete implementation with lower confidence
    if (!bestMatch || maxScore < 1) {
      bestMatch = {
        type: 'concrete_implementation',
        confidence: 0.60,
        preference: 'deepseek',
        level: 'medium',
        reasoning: 'No clear complexity pattern detected - defaulting to implementation'
      };
    }

    return {
      complexity_type: bestMatch.type,
      confidence: bestMatch.confidence,
      suggested_route: bestMatch.preference,
      complexity_level: bestMatch.level,
      reasoning: bestMatch.reasoning,
      all_scores: scores,
      analysis_metadata: {
        prompt_length: prompt.length,
        has_code_blocks: /```/.test(prompt),
        multi_line: prompt.split('\n').length > 1,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Enhance existing empirical fingerprint with complexity intelligence
   * This preserves existing empirical data while adding complexity insights
   */
  enhanceFingerprint(empiricalFingerprint, complexityAnalysis) {
    return {
      ...empiricalFingerprint, // PRESERVE all existing empirical data
      
      // ADD complexity enhancements
      complexity_type: complexityAnalysis.complexity_type,
      complexity_confidence: complexityAnalysis.confidence,
      complexity_level: complexityAnalysis.complexity_level,
      complexity_reasoning: complexityAnalysis.reasoning,
      complexity_suggested_route: complexityAnalysis.suggested_route,
      
      // Enhanced composite fingerprint for better learning
      enhanced_fingerprint: `${empiricalFingerprint.fingerprint}_${complexityAnalysis.complexity_type}_${complexityAnalysis.complexity_level}`
    };
  }

  /**
   * Learn from routing outcomes to improve complexity detection
   * This works alongside empirical learning to create dual-intelligence system
   */
  recordComplexityOutcome(prompt, predictedComplexity, actualRoute, success, responseTime) {
    const key = `${predictedComplexity.complexity_type}_${predictedComplexity.suggested_route}`;
    
    if (!this.complexityLearningData.has(key)) {
      this.complexityLearningData.set(key, {
        predictions: 0,
        correct_predictions: 0,
        route_successes: 0,
        route_failures: 0,
        average_response_time: 0,
        last_updated: null
      });
    }

    const data = this.complexityLearningData.get(key);
    data.predictions++;
    
    // Was the complexity prediction accurate? (success with suggested route)
    if (actualRoute === predictedComplexity.suggested_route && success) {
      data.correct_predictions++;
      data.route_successes++;
      this.performanceMetrics.accurateComplexityPredictions++;
    } else if (actualRoute === predictedComplexity.suggested_route && !success) {
      data.route_failures++;
    }

    // Update average response time
    data.average_response_time = (data.average_response_time * (data.predictions - 1) + responseTime) / data.predictions;
    data.last_updated = new Date().toISOString();
    
    this.complexityLearningData.set(key, data);

    // Adaptive pattern adjustment based on learning
    this.adjustComplexityPatterns(predictedComplexity.complexity_type, success, actualRoute);

    console.error(`📈 Complexity Learning: ${key} - predictions: ${data.predictions}, accuracy: ${Math.round((data.correct_predictions/data.predictions)*100)}%`);

    return {
      complexity_type: predictedComplexity.complexity_type,
      prediction_accuracy: data.correct_predictions / data.predictions,
      total_predictions: data.predictions
    };
  }

  adjustComplexityPatterns(complexityType, success, actualRoute) {
    // Simple adaptive adjustment of confidence bases
    const pattern = this.complexityPatterns[complexityType];
    if (!pattern) return;

    const adjustment = success ? 0.01 : -0.01;
    
    // Adjust confidence base slightly based on outcomes
    pattern.confidence_base = Math.max(0.5, Math.min(0.95, pattern.confidence_base + adjustment));
  }

  createNeutralAnalysis(prompt) {
    return {
      complexity_type: 'concrete_implementation',
      confidence: 0.60,
      suggested_route: 'deepseek',
      complexity_level: 'medium',
      reasoning: 'Neutral analysis due to complexity assessment error',
      all_scores: {},
      analysis_metadata: {
        prompt_length: prompt.length,
        has_code_blocks: false,
        multi_line: false,
        timestamp: new Date().toISOString(),
        error_fallback: true
      }
    };
  }

  updatePerformanceMetrics(analysisTime) {
    const totalTime = this.performanceMetrics.averageAnalysisTime * (this.performanceMetrics.totalAnalyses - 1) + analysisTime;
    this.performanceMetrics.averageAnalysisTime = totalTime / this.performanceMetrics.totalAnalyses;
  }

  /**
   * Generate complexity intelligence report
   */
  getComplexityStats() {
    const predictionAccuracy = this.performanceMetrics.totalAnalyses > 0 
      ? this.performanceMetrics.accurateComplexityPredictions / this.performanceMetrics.totalAnalyses 
      : 0;

    const learningData = {};
    for (const [key, data] of this.complexityLearningData.entries()) {
      learningData[key] = {
        predictions: data.predictions,
        accuracy: data.correct_predictions / data.predictions,
        success_rate: data.route_successes / (data.route_successes + data.route_failures),
        avg_response_time: data.average_response_time
      };
    }

    return {
      performance: {
        total_analyses: this.performanceMetrics.totalAnalyses,
        prediction_accuracy: predictionAccuracy,
        average_analysis_time: this.performanceMetrics.averageAnalysisTime
      },
      learning_data: learningData,
      pattern_confidence: Object.entries(this.complexityPatterns).reduce((acc, [type, pattern]) => {
        acc[type] = pattern.confidence_base;
        return acc;
      }, {}),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Integration method for existing empirical system
   * Returns complexity enhancement that can be merged with empirical decision
   */
  enhanceEmpiricalDecision(prompt, empiricalDecision) {
    const complexityAnalysis = this.analyzeComplexity(prompt, empiricalDecision.fingerprint);
    
    return {
      ...empiricalDecision, // PRESERVE empirical decision
      complexity_enhancement: complexityAnalysis,
      enhanced_confidence: this.calculateEnhancedConfidence(empiricalDecision, complexityAnalysis)
    };
  }

  calculateEnhancedConfidence(empiricalDecision, complexityAnalysis) {
    // Combine empirical historical data with complexity analysis confidence
    const empiricalConfidence = empiricalDecision.historicalData 
      ? empiricalDecision.historicalData.successRate 
      : 0.70; // default if no historical data

    const complexityConfidence = complexityAnalysis.confidence;

    // Weighted combination: 60% empirical evidence, 40% complexity analysis
    const enhancedConfidence = (empiricalConfidence * 0.6) + (complexityConfidence * 0.4);
    
    return Math.min(0.95, enhancedConfidence);
  }
}

// Export for integration with existing DeepSeek MCP Bridge
export default ComplexityAnalyzer;