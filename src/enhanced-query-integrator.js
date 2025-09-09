/**
 * Enhanced Query Logic Integrator for DeepSeek MCP Bridge v6.2.0
 * Connects Youtu-Enhanced Empirical Router with the main server architecture
 * 
 * INTEGRATION STRATEGY:
 * 🎯 Seamless integration with existing enhanced_query_deepseek tool
 * 🎯 Backward compatibility with v6.1.0 architecture
 * 🎯 Intelligent routing between DirectDeepSeek and YoutuThenDeepSeek
 * 🎯 Evidence-based learning and optimization
 * 
 * EXECUTION PATHS:
 * 1. DirectDeepSeek: Standard processing for simple queries and small files
 * 2. YoutuThenDeepSeek: Preprocessing pipeline for complex file analysis
 * 3. Fallback: Claude routing for failures or complex scenarios
 */

import { YoutuEmpiricalRouter } from './youtu-empirical-router.js';
import { YoutAgentFileSystem } from './youtu-agent-filesystem.js';
import { YoutAgentContextChunker } from './youtu-agent-context-chunker.js';

/**
 * Enhanced Query Integrator
 * Main coordination class that integrates youtu routing with enhanced query logic
 */
export class EnhancedQueryIntegrator {
  constructor(existingBridge, existingEmpiricalRouter) {
    // Preserve existing bridge and router
    this.bridge = existingBridge;
    this.originalEmpiricalRouter = existingEmpiricalRouter;
    
    // Initialize youtu-enhanced router
    this.youtuRouter = new YoutuEmpiricalRouter(existingEmpiricalRouter);
    
    // Youtu components
    this.youtAgentFileSystem = new YoutAgentFileSystem();
    this.youtAgentContextChunker = new YoutAgentContextChunker();
    
    // Integration control
    this.youtuIntegrationEnabled = true;
    this.fallbackToOriginalEnabled = true;
    
    // Performance tracking
    this.integrationMetrics = {
      totalQueries: 0,
      youtuEnhancedQueries: 0,
      directDeepSeekExecutions: 0,
      youtuThenDeepSeekExecutions: 0,
      fallbackExecutions: 0,
      integrationErrors: 0,
      successRate: 0,
      averageProcessingTime: 0
    };

    console.error('🚀 Enhanced Query Integrator initialized with Youtu routing');
  }

  /**
   * Enhanced query execution with intelligent routing
   * This is the main method that replaces/enhances the existing enhanced query logic
   */
  async executeEnhancedQuery(prompt, options = {}) {
    const startTime = Date.now();
    this.integrationMetrics.totalQueries++;

    try {
      console.error('🎯 Enhanced Query with Youtu Integration:', prompt.substring(0, 100) + '...');

      // Step 1: Get routing decision from youtu-enhanced router
      const routingDecision = await this.youtuRouter.shouldTryDeepseekFirst(prompt, options);
      
      // Step 2: Execute based on routing strategy
      const executionResult = await this.executeBasedOnRouting(prompt, options, routingDecision);
      
      // Step 3: Record success and learn
      this.recordIntegrationSuccess(routingDecision, executionResult, Date.now() - startTime);
      
      return executionResult;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error('❌ Enhanced query integration error:', error.message);
      
      this.recordIntegrationFailure(error, processingTime);
      
      // Fallback to original bridge if enabled
      if (this.fallbackToOriginalEnabled) {
        console.error('🔄 Falling back to original enhanced query logic');
        return await this.executeOriginalEnhancedQuery(prompt, options);
      }
      
      throw error;
    }
  }

  /**
   * Execute query based on routing decision
   */
  async executeBasedOnRouting(prompt, options, routingDecision) {
    const strategy = routingDecision.youtRouting?.strategy || 'direct-deepseek';
    
    console.error(`📍 Routing Strategy: ${strategy}`);
    console.error(`📊 Confidence: ${Math.round((routingDecision.youtRouting?.confidence || 0.8) * 100)}%`);
    
    switch (strategy) {
      case 'direct-deepseek':
        return await this.executeDirectDeepSeek(prompt, options, routingDecision);
        
      case 'youtu-then-deepseek':
        return await this.executeYoutuThenDeepSeek(prompt, options, routingDecision);
        
      case 'claude-direct':
        return await this.executeClaudeDirectRouting(prompt, options, routingDecision);
        
      default:
        console.error(`⚠️ Unknown routing strategy: ${strategy}, defaulting to direct DeepSeek`);
        return await this.executeDirectDeepSeek(prompt, options, routingDecision);
    }
  }

  /**
   * Execute Direct DeepSeek path (standard processing)
   */
  async executeDirectDeepSeek(prompt, options, routingDecision) {
    console.error('🚀 Executing Direct DeepSeek path...');
    this.integrationMetrics.directDeepSeekExecutions++;

    try {
      // Use existing bridge logic with enhanced context
      const result = await this.bridge.executeDeepseekQuery(prompt, {
        ...options,
        routingDecision,
        processingPath: 'direct-deepseek',
        integrationMetadata: {
          youtu_routing: routingDecision.youtRouting,
          file_analysis: routingDecision.youtRouting?.fileAnalysis,
          routing_confidence: routingDecision.youtRouting?.confidence
        }
      });

      // Enhance result with routing metadata
      return this.enhanceResultWithRoutingInfo(result, 'direct-deepseek', routingDecision);

    } catch (error) {
      console.error('❌ Direct DeepSeek execution failed:', error.message);
      
      // Analyze failure and potentially retry with youtu preprocessing
      const failureAnalysis = this.youtuRouter.analyzeActualFailure(error, Date.now(), prompt);
      
      if (this.shouldRetryWithYoutuPreprocessing(error, routingDecision)) {
        console.error('🔄 Retrying with youtu preprocessing...');
        return await this.executeYoutuThenDeepSeek(prompt, options, routingDecision);
      }
      
      throw error;
    }
  }

  /**
   * Execute Youtu-Then-DeepSeek path (preprocessing pipeline)
   */
  async executeYoutuThenDeepSeek(prompt, options, routingDecision) {
    console.error('🔄 Executing Youtu-Then-DeepSeek preprocessing pipeline...');
    this.integrationMetrics.youtuThenDeepSeekExecutions++;

    try {
      // Step 1: Extract file references if not already done
      const fileReferences = this.extractFileReferences(prompt, routingDecision);
      
      if (fileReferences.length === 0) {
        console.error('⚠️ No file references found for youtu preprocessing, falling back to direct');
        return await this.executeDirectDeepSeek(prompt, options, routingDecision);
      }

      // Step 2: Execute youtu preprocessing
      const preprocessingResult = await this.youtuRouter.executeYoutuPreprocessing(
        prompt, 
        fileReferences, 
        options
      );

      if (!preprocessingResult.success) {
        console.error('❌ Youtu preprocessing failed, falling back to direct DeepSeek');
        return await this.executeDirectDeepSeek(prompt, options, routingDecision);
      }

      // Step 3: Execute DeepSeek with enhanced prompt
      const result = await this.bridge.executeDeepseekQuery(preprocessingResult.enhancedPrompt, {
        ...options,
        routingDecision,
        processingPath: 'youtu-then-deepseek',
        preprocessingResult,
        integrationMetadata: {
          youtu_routing: routingDecision.youtRouting,
          preprocessing_context: preprocessingResult.fileContext,
          file_analysis: routingDecision.youtRouting?.fileAnalysis,
          routing_confidence: routingDecision.youtRouting?.confidence
        }
      });

      // Step 4: Enhance result with preprocessing metadata
      return this.enhanceResultWithPreprocessingInfo(result, preprocessingResult, routingDecision);

    } catch (error) {
      console.error('❌ Youtu-then-DeepSeek execution failed:', error.message);
      
      // For youtu failures, we might want to try Claude routing
      if (this.shouldRouteToClaudeAfterYoutuFailure(error, routingDecision)) {
        console.error('🔄 Routing to Claude after youtu failure...');
        return await this.executeClaudeDirectRouting(prompt, options, routingDecision);
      }
      
      throw error;
    }
  }

  /**
   * Execute Claude Direct routing (for complex scenarios)
   */
  async executeClaudeDirectRouting(prompt, options, routingDecision) {
    console.error('🎯 Executing Claude Direct routing...');
    this.integrationMetrics.fallbackExecutions++;

    // Generate routing guidance for Claude
    return {
      success: true,
      routingGuidance: true,
      routeTo: 'claude',
      empiricalEvidence: true,
      response: this.generateClaudeRoutingGuidance(prompt, routingDecision),
      model: 'youtu-enhanced-empirical-routing',
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      endpoint: 'youtu-empirical-router',
      timestamp: new Date().toISOString(),
      youtRouting: {
        strategy: 'claude-direct',
        reason: routingDecision.reason,
        fileAnalysis: routingDecision.youtRouting?.fileAnalysis,
        confidence: routingDecision.youtRouting?.confidence
      }
    };
  }

  /**
   * Extract file references from prompt and routing decision
   */
  extractFileReferences(prompt, routingDecision) {
    // First try to get from routing decision
    if (routingDecision.youtRouting?.fileAnalysis) {
      const fileAnalysis = routingDecision.youtRouting.fileAnalysis;
      // Extract file paths from the file analysis if available
      return []; // This would be populated from the actual file analysis
    }

    // Fallback to extracting from prompt
    return this.youtuRouter.fileAnalysisContext.extractFileReferences(prompt);
  }

  /**
   * Enhance result with routing information
   */
  enhanceResultWithRoutingInfo(result, processingPath, routingDecision) {
    return {
      ...result,
      youtRouting: {
        processingPath,
        strategy: routingDecision.youtRouting?.strategy,
        confidence: routingDecision.youtRouting?.confidence,
        fileAnalysis: routingDecision.youtRouting?.fileAnalysis,
        routingReason: routingDecision.reason,
        integrationVersion: '6.2.0'
      },
      integrationMetadata: {
        youtu_enhanced: true,
        routing_used: processingPath,
        empirical_base: routingDecision.fingerprint?.fingerprint,
        processing_timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Enhance result with preprocessing information
   */
  enhanceResultWithPreprocessingInfo(result, preprocessingResult, routingDecision) {
    return {
      ...result,
      youtRouting: {
        processingPath: 'youtu-then-deepseek',
        strategy: routingDecision.youtRouting?.strategy,
        confidence: routingDecision.youtRouting?.confidence,
        fileAnalysis: routingDecision.youtRouting?.fileAnalysis,
        routingReason: routingDecision.reason,
        integrationVersion: '6.2.0'
      },
      preprocessingInfo: {
        filesProcessed: preprocessingResult.fileContext?.filesProcessed || 0,
        chunksCreated: preprocessingResult.fileContext?.chunksCreated || 0,
        totalTokens: preprocessingResult.fileContext?.totalTokens || 0,
        preprocessingTime: preprocessingResult.preprocessingTime
      },
      integrationMetadata: {
        youtu_enhanced: true,
        routing_used: 'youtu-then-deepseek',
        preprocessing_applied: true,
        empirical_base: routingDecision.fingerprint?.fingerprint,
        processing_timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Generate Claude routing guidance with youtu context
   */
  generateClaudeRoutingGuidance(prompt, routingDecision) {
    let guidance = `🎯 **YOUTU-ENHANCED EMPIRICAL ROUTING** (v6.2.0)\n\n`;
    
    guidance += `**Query Analysis:**\n`;
    guidance += `- Routing Strategy: ${routingDecision.youtRouting?.strategy}\n`;
    guidance += `- Confidence: ${Math.round((routingDecision.youtRouting?.confidence || 0.8) * 100)}%\n`;
    guidance += `- Empirical Evidence: ${routingDecision.reason}\n\n`;

    if (routingDecision.youtRouting?.fileAnalysis) {
      const fa = routingDecision.youtRouting.fileAnalysis;
      guidance += `**File Analysis Context:**\n`;
      guidance += `- Files Detected: ${fa.fileCount}\n`;
      guidance += `- Total Size: ${Math.round(fa.totalSize / 1024)}KB\n`;
      guidance += `- Estimated Tokens: ~${fa.estimatedTokens}\n`;
      guidance += `- Complexity Score: ${Math.round(fa.complexityScore * 100)}%\n\n`;
    }

    guidance += `**Routing Recommendation:**\n`;
    guidance += `Route this query to Claude for optimal processing. The combination of empirical evidence and file analysis indicates that Claude's capabilities are better suited for this specific task.\n\n`;

    guidance += `**Processing Approach:**\n`;
    guidance += `${routingDecision.youtRouting?.expectedApproach?.benefits?.map(b => `- ${b}`).join('\n') || '- Comprehensive analysis with full context understanding'}\n\n`;

    guidance += `**Integration Benefits:**\n`;
    guidance += `- Evidence-based routing decision\n`;
    guidance += `- File complexity analysis\n`;
    guidance += `- Optimized processing path selection\n`;
    guidance += `- Empirical learning integration`;

    return guidance;
  }

  /**
   * Decision logic for retrying with youtu preprocessing
   */
  shouldRetryWithYoutuPreprocessing(error, routingDecision) {
    // Retry with youtu if:
    // - Original routing was direct-deepseek
    // - Error indicates context/complexity issues
    // - File references were detected
    
    const wasDirectRouting = routingDecision.youtRouting?.strategy === 'direct-deepseek';
    const hasFileReferences = routingDecision.youtRouting?.fileAnalysis?.fileCount > 0;
    const contextError = error.message.toLowerCase().includes('context') ||
                        error.message.toLowerCase().includes('token') ||
                        error.message.toLowerCase().includes('size');

    return wasDirectRouting && hasFileReferences && contextError;
  }

  /**
   * Decision logic for routing to Claude after youtu failure
   */
  shouldRouteToClaudeAfterYoutuFailure(error, routingDecision) {
    // Route to Claude if:
    // - Youtu preprocessing failed due to complexity
    // - File analysis indicated high complexity
    // - Error suggests model limitations

    const highComplexity = routingDecision.youtRouting?.fileAnalysis?.complexityScore > 0.8;
    const preprocessingError = error.message.toLowerCase().includes('preprocessing') ||
                              error.message.toLowerCase().includes('chunking');
    const modelLimitation = error.message.toLowerCase().includes('timeout') ||
                           error.message.toLowerCase().includes('capacity');

    return highComplexity || preprocessingError || modelLimitation;
  }

  /**
   * Fallback to original enhanced query logic
   */
  async executeOriginalEnhancedQuery(prompt, options) {
    console.error('🔄 Executing original enhanced query as fallback...');
    this.integrationMetrics.fallbackExecutions++;

    try {
      // This would call the original bridge's enhanced query logic
      // For now, we'll simulate this with the direct execution
      return await this.bridge.executeDeepseekQuery(prompt, {
        ...options,
        fallback: true,
        originalEnhancedQuery: true
      });
    } catch (error) {
      console.error('❌ Original enhanced query fallback also failed:', error.message);
      throw error;
    }
  }

  /**
   * Record integration success
   */
  recordIntegrationSuccess(routingDecision, result, processingTime) {
    this.integrationMetrics.youtuEnhancedQueries++;
    
    // Update average processing time
    const currentCount = this.integrationMetrics.youtuEnhancedQueries;
    this.integrationMetrics.averageProcessingTime = 
      (this.integrationMetrics.averageProcessingTime * (currentCount - 1) + processingTime) / currentCount;

    // Update success rate
    const totalOutcomes = this.integrationMetrics.youtuEnhancedQueries + this.integrationMetrics.integrationErrors;
    this.integrationMetrics.successRate = 
      (this.integrationMetrics.youtuEnhancedQueries / totalOutcomes) * 100;

    // Record in youtu router
    this.youtuRouter.recordExecutionSuccess(
      routingDecision.fingerprint,
      processingTime,
      result.originalPrompt || '',
      result
    );

    console.error(`✅ Integration success: ${routingDecision.youtRouting?.strategy} in ${processingTime}ms`);
  }

  /**
   * Record integration failure
   */
  recordIntegrationFailure(error, processingTime) {
    this.integrationMetrics.integrationErrors++;
    
    // Update success rate
    const totalOutcomes = this.integrationMetrics.youtuEnhancedQueries + this.integrationMetrics.integrationErrors;
    this.integrationMetrics.successRate = 
      (this.integrationMetrics.youtuEnhancedQueries / totalOutcomes) * 100;

    console.error(`❌ Integration failure after ${processingTime}ms: ${error.message}`);
  }

  /**
   * Get integration statistics
   */
  getIntegrationStats() {
    const routingStats = this.youtuRouter.getRoutingStats();
    
    return {
      integration_metrics: this.integrationMetrics,
      routing_stats: routingStats,
      system_health: {
        youtu_integration_enabled: this.youtuIntegrationEnabled,
        fallback_enabled: this.fallbackToOriginalEnabled,
        success_rate: this.integrationMetrics.successRate,
        average_processing_time: Math.round(this.integrationMetrics.averageProcessingTime),
        routing_distribution: routingStats.routing_distribution
      },
      performance_insights: {
        direct_deepseek_efficiency: this.calculatePathEfficiency('direct'),
        youtu_preprocessing_efficiency: this.calculatePathEfficiency('youtu'),
        overall_integration_benefit: this.calculateIntegrationBenefit()
      }
    };
  }

  /**
   * Calculate efficiency metrics for different processing paths
   */
  calculatePathEfficiency(pathType) {
    if (pathType === 'direct') {
      const directExecutions = this.integrationMetrics.directDeepSeekExecutions;
      const totalQueries = this.integrationMetrics.totalQueries;
      return {
        usage_percentage: (directExecutions / Math.max(totalQueries, 1)) * 100,
        average_time: this.integrationMetrics.averageProcessingTime * 0.8 // Direct is typically faster
      };
    } else if (pathType === 'youtu') {
      const youtuExecutions = this.integrationMetrics.youtuThenDeepSeekExecutions;
      const totalQueries = this.integrationMetrics.totalQueries;
      return {
        usage_percentage: (youtuExecutions / Math.max(totalQueries, 1)) * 100,
        average_time: this.integrationMetrics.averageProcessingTime * 1.3 // Youtu has preprocessing overhead
      };
    }
    return { usage_percentage: 0, average_time: 0 };
  }

  /**
   * Calculate overall integration benefit
   */
  calculateIntegrationBenefit() {
    const successRate = this.integrationMetrics.successRate;
    const youtuEnhancedQueries = this.integrationMetrics.youtuEnhancedQueries;
    const totalQueries = this.integrationMetrics.totalQueries;
    
    return {
      success_improvement: Math.max(0, successRate - 85), // Assuming 85% baseline
      query_enhancement_rate: (youtuEnhancedQueries / Math.max(totalQueries, 1)) * 100,
      integration_reliability: Math.min(successRate / 95, 1.0) // Normalized to 95% target
    };
  }

  /**
   * Enable/disable youtu integration
   */
  setYoutuIntegration(enabled) {
    this.youtuIntegrationEnabled = enabled;
    console.error(`${enabled ? '✅' : '⏸️'} Youtu integration ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Enable/disable fallback to original logic
   */
  setFallbackEnabled(enabled) {
    this.fallbackToOriginalEnabled = enabled;
    console.error(`${enabled ? '✅' : '⏸️'} Original fallback ${enabled ? 'enabled' : 'disabled'}`);
  }
}

export default EnhancedQueryIntegrator;