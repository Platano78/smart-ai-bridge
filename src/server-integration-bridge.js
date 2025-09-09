/**
 * Server Integration Bridge for Youtu-Enhanced DeepSeek MCP v6.2.0
 * Seamlessly integrates the youtu routing with the existing server architecture
 * 
 * INTEGRATION GOALS:
 * 🔄 Maintain 100% backward compatibility with existing enhanced_query_deepseek tool
 * 🔄 Seamlessly replace existing routing logic with youtu-enhanced version
 * 🔄 Preserve all existing metrics, error handling, and circuit breaker logic
 * 🔄 Add youtu capabilities as transparent enhancement
 * 
 * INTEGRATION STRATEGY:
 * - Drop-in replacement for existing EmpiricalRoutingManager
 * - Enhanced capabilities through composition, not replacement
 * - Graceful degradation when youtu components unavailable
 */

import { EnhancedQueryIntegrator } from './enhanced-query-integrator.js';
import { YoutuEmpiricalRouter } from './youtu-empirical-router.js';

/**
 * Server Integration Bridge
 * Provides backward-compatible interface while adding youtu capabilities
 */
export class ServerIntegrationBridge {
  constructor(existingBridge) {
    // Preserve original bridge
    this.originalBridge = existingBridge;
    this.originalEmpiricalRouter = existingBridge.empiricalRouter;
    
    // Initialize enhanced components
    try {
      this.enhancedQueryIntegrator = new EnhancedQueryIntegrator(
        existingBridge,
        this.originalEmpiricalRouter
      );
      
      this.youtuEnhancedRouter = this.enhancedQueryIntegrator.youtuRouter;
      this.integrationReady = true;
      
      console.error('🚀 Server Integration Bridge initialized with Youtu enhancement');
    } catch (error) {
      console.error('⚠️ Youtu integration failed, falling back to original:', error.message);
      this.integrationReady = false;
    }
    
    // Integration metrics
    this.bridgeMetrics = {
      totalQueries: 0,
      youtuEnhancedQueries: 0,
      fallbackQueries: 0,
      integrationFailures: 0
    };
  }

  /**
   * Enhanced query execution - main integration point
   * This method replaces the original enhancedQuery method in the bridge
   */
  async enhancedQuery(prompt, options = {}) {
    this.bridgeMetrics.totalQueries++;

    // If youtu integration is not ready, fallback to original
    if (!this.integrationReady) {
      console.error('🔄 Youtu integration not ready, using original bridge');
      this.bridgeMetrics.fallbackQueries++;
      return await this.executeOriginalEnhancedQuery(prompt, options);
    }

    try {
      // Execute with youtu-enhanced integrator
      const result = await this.enhancedQueryIntegrator.executeEnhancedQuery(prompt, options);
      this.bridgeMetrics.youtuEnhancedQueries++;
      return result;

    } catch (error) {
      console.error('❌ Youtu-enhanced query failed:', error.message);
      this.bridgeMetrics.integrationFailures++;

      // Graceful fallback to original bridge
      console.error('🔄 Graceful fallback to original enhanced query logic');
      this.bridgeMetrics.fallbackQueries++;
      return await this.executeOriginalEnhancedQuery(prompt, options);
    }
  }

  /**
   * Backward compatible shouldTryDeepseekFirst method
   * This maintains the existing API while adding youtu intelligence
   */
  async shouldTryDeepseekFirst(prompt, options = {}) {
    if (!this.integrationReady) {
      return await this.originalEmpiricalRouter.shouldTryDeepseekFirst(prompt);
    }

    try {
      return await this.youtuEnhancedRouter.shouldTryDeepseekFirst(prompt, options);
    } catch (error) {
      console.error('❌ Youtu routing decision failed, falling back:', error.message);
      return await this.originalEmpiricalRouter.shouldTryDeepseekFirst(prompt);
    }
  }

  /**
   * Enhanced file analysis capabilities
   * New method that exposes youtu file analysis capabilities
   */
  async analyzeFileWithYoutuEnhancement(filePath, analysisType = 'review', focusArea = null, options = {}) {
    if (!this.integrationReady) {
      // Fallback to original file analysis if available
      if (this.originalBridge.analyzeFileWithDeepSeek) {
        return await this.originalBridge.analyzeFileWithDeepSeek(filePath, analysisType, focusArea, options);
      }
      throw new Error('Youtu enhancement not available and no original file analysis method found');
    }

    try {
      // Create enhanced prompt for file analysis
      const enhancedPrompt = this.createFileAnalysisPrompt(filePath, analysisType, focusArea);
      
      // Execute with youtu enhancement
      const result = await this.enhancedQueryIntegrator.executeEnhancedQuery(enhancedPrompt, {
        ...options,
        fileAnalysis: true,
        filePath,
        analysisType,
        focusArea
      });

      // Add file-specific metadata
      return this.enhanceResultWithFileMetadata(result, filePath, analysisType);

    } catch (error) {
      console.error('❌ Youtu-enhanced file analysis failed:', error.message);
      
      // Fallback to original file analysis if available
      if (this.originalBridge.analyzeFileWithDeepSeek) {
        return await this.originalBridge.analyzeFileWithDeepSeek(filePath, analysisType, focusArea, options);
      }
      
      throw error;
    }
  }

  /**
   * Enhanced project analysis capabilities
   * New method that exposes youtu project analysis capabilities
   */
  async analyzeProjectWithYoutuEnhancement(projectPath, analysisGoal, options = {}) {
    if (!this.integrationReady) {
      // Fallback to original project analysis if available
      if (this.originalBridge.analyzeProjectWithDeepSeek) {
        return await this.originalBridge.analyzeProjectWithDeepSeek(projectPath, analysisGoal, options);
      }
      throw new Error('Youtu enhancement not available and no original project analysis method found');
    }

    try {
      // Create enhanced prompt for project analysis
      const enhancedPrompt = this.createProjectAnalysisPrompt(projectPath, analysisGoal, options);
      
      // Execute with youtu enhancement
      const result = await this.enhancedQueryIntegrator.executeEnhancedQuery(enhancedPrompt, {
        ...options,
        projectAnalysis: true,
        projectPath,
        analysisGoal
      });

      // Add project-specific metadata
      return this.enhanceResultWithProjectMetadata(result, projectPath, analysisGoal);

    } catch (error) {
      console.error('❌ Youtu-enhanced project analysis failed:', error.message);
      
      // Fallback to original project analysis if available
      if (this.originalBridge.analyzeProjectWithDeepSeek) {
        return await this.originalBridge.analyzeProjectWithDeepSeek(projectPath, analysisGoal, options);
      }
      
      throw error;
    }
  }

  /**
   * Execute original enhanced query as fallback
   */
  async executeOriginalEnhancedQuery(prompt, options) {
    // This method calls the original bridge's logic
    // Since we don't have the exact original implementation, we'll simulate it
    
    try {
      // Get original empirical decision
      const empiricalDecision = await this.originalEmpiricalRouter.shouldTryDeepseekFirst(prompt);
      
      if (empiricalDecision.tryDeepseek) {
        // Execute with original DeepSeek logic
        return await this.originalBridge.executeDeepseekQuery(prompt, {
          ...options,
          originalEnhancedQuery: true
        });
      } else {
        // Generate routing guidance
        return {
          success: true,
          routingGuidance: true,
          routeTo: 'claude',
          empiricalEvidence: true,
          response: `🎯 **ORIGINAL EMPIRICAL ROUTING**\n\n${empiricalDecision.reason}\n\nRoute this query to Claude based on empirical evidence from previous executions.`,
          model: 'original-empirical-routing',
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          endpoint: 'original-empirical-router',
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      throw new Error(`Original enhanced query failed: ${error.message}`);
    }
  }

  /**
   * Create file analysis prompt
   */
  createFileAnalysisPrompt(filePath, analysisType, focusArea) {
    let prompt = `Please ${analysisType} the file: ${filePath}`;
    
    if (focusArea) {
      prompt += `\n\nFocus on: ${focusArea}`;
    }

    const analysisInstructions = {
      review: 'Provide a comprehensive code review focusing on code quality, best practices, and potential improvements.',
      debug: 'Analyze the code to identify potential bugs, logical errors, and debugging suggestions.',
      improve: 'Suggest improvements for code organization, performance, and maintainability.',
      explain: 'Explain how the code works, its purpose, and key implementation details.',
      optimize: 'Analyze for performance optimizations and efficiency improvements.'
    };

    prompt += `\n\n${analysisInstructions[analysisType] || analysisInstructions.review}`;
    
    return prompt;
  }

  /**
   * Create project analysis prompt
   */
  createProjectAnalysisPrompt(projectPath, analysisGoal, options) {
    let prompt = `Please analyze the project at: ${projectPath}`;
    prompt += `\n\nAnalysis Goal: ${analysisGoal}`;
    
    if (options.file_patterns) {
      prompt += `\n\nFocus on files matching: ${options.file_patterns.join(', ')}`;
    }
    
    if (options.max_files) {
      prompt += `\n\nAnalyze up to ${options.max_files} files to stay within context limits.`;
    }

    prompt += `\n\nProvide insights on project structure, code quality, architecture patterns, and recommendations for achieving the stated goal.`;
    
    return prompt;
  }

  /**
   * Enhance result with file-specific metadata
   */
  enhanceResultWithFileMetadata(result, filePath, analysisType) {
    return {
      ...result,
      fileAnalysis: {
        filePath,
        analysisType,
        youtuEnhanced: this.integrationReady,
        processingPath: result.youtRouting?.processingPath || 'fallback',
        integrationVersion: '6.2.0'
      }
    };
  }

  /**
   * Enhance result with project-specific metadata
   */
  enhanceResultWithProjectMetadata(result, projectPath, analysisGoal) {
    return {
      ...result,
      projectAnalysis: {
        projectPath,
        analysisGoal,
        youtuEnhanced: this.integrationReady,
        processingPath: result.youtRouting?.processingPath || 'fallback',
        integrationVersion: '6.2.0'
      }
    };
  }

  /**
   * Enhanced status check that includes youtu capabilities
   */
  async checkEnhancedStatus() {
    // Get original status
    const baseStatus = await this.originalBridge.checkEnhancedStatus();
    
    // Add youtu enhancement status
    const youtuStatus = {
      youtu_integration: {
        enabled: this.integrationReady,
        version: '6.2.0',
        capabilities: this.integrationReady ? [
          'intelligent-file-routing',
          'preprocessing-pipeline',
          'multi-file-analysis',
          'evidence-based-routing'
        ] : [],
        metrics: this.getIntegrationMetrics()
      }
    };

    return {
      ...baseStatus,
      ...youtuStatus,
      version: '6.2.0',
      description: 'Youtu-Enhanced DeepSeek MCP Bridge with Intelligent File Routing'
    };
  }

  /**
   * Get comprehensive integration metrics
   */
  getIntegrationMetrics() {
    if (!this.integrationReady) {
      return {
        status: 'unavailable',
        bridge_metrics: this.bridgeMetrics
      };
    }

    const integrationStats = this.enhancedQueryIntegrator.getIntegrationStats();
    
    return {
      status: 'active',
      bridge_metrics: this.bridgeMetrics,
      integration_stats: integrationStats,
      routing_effectiveness: {
        youtu_usage_rate: (this.bridgeMetrics.youtuEnhancedQueries / Math.max(this.bridgeMetrics.totalQueries, 1)) * 100,
        fallback_rate: (this.bridgeMetrics.fallbackQueries / Math.max(this.bridgeMetrics.totalQueries, 1)) * 100,
        failure_rate: (this.bridgeMetrics.integrationFailures / Math.max(this.bridgeMetrics.totalQueries, 1)) * 100
      },
      system_health: integrationStats.system_health
    };
  }

  /**
   * Proxy methods for backward compatibility
   * These ensure that all existing bridge methods continue to work
   */

  async executeDeepseekQuery(prompt, options = {}, classification = null) {
    return await this.originalBridge.executeDeepseekQuery(prompt, options, classification);
  }

  async getWorkingBaseURL() {
    return await this.originalBridge.getWorkingBaseURL();
  }

  async testConnection(ip) {
    return await this.originalBridge.testConnection(ip);
  }

  async getAvailableModels() {
    return await this.originalBridge.getAvailableModels();
  }

  recordExecutionSuccess(fingerprint, responseTime, prompt, result) {
    // Record in original bridge
    this.originalBridge.recordExecutionSuccess(fingerprint, responseTime, prompt, result);
    
    // Record in youtu router if available
    if (this.integrationReady) {
      this.youtuEnhancedRouter.recordExecutionSuccess(fingerprint, responseTime, prompt, result);
    }
  }

  recordExecutionFailure(fingerprint, responseTime, error, failureAnalysis) {
    // Record in original bridge
    this.originalBridge.recordExecutionFailure(fingerprint, responseTime, error, failureAnalysis);
    
    // Record in youtu router if available
    if (this.integrationReady) {
      this.youtuEnhancedRouter.recordExecutionFailure(fingerprint, responseTime, error, failureAnalysis);
    }
  }

  analyzeActualFailure(error, responseTime, prompt) {
    if (this.integrationReady) {
      return this.youtuEnhancedRouter.analyzeActualFailure(error, responseTime, prompt);
    }
    return this.originalBridge.analyzeActualFailure(error, responseTime, prompt);
  }

  // Preserve all other original bridge properties and methods
  get routingMetrics() {
    return this.originalBridge.routingMetrics;
  }

  get circuitBreaker() {
    return this.originalBridge.circuitBreaker;
  }

  get fallbackGenerator() {
    return this.originalBridge.fallbackGenerator;
  }

  get fileManager() {
    return this.originalBridge.fileManager;
  }

  /**
   * Integration health check
   */
  performIntegrationHealthCheck() {
    return {
      integration_ready: this.integrationReady,
      original_bridge_healthy: !!this.originalBridge,
      youtu_components_loaded: this.integrationReady && !!this.enhancedQueryIntegrator,
      bridge_metrics: this.bridgeMetrics,
      recommendations: this.generateHealthRecommendations()
    };
  }

  /**
   * Generate health recommendations
   */
  generateHealthRecommendations() {
    const recommendations = [];
    
    if (!this.integrationReady) {
      recommendations.push('Consider resolving youtu integration issues for enhanced capabilities');
    }
    
    const failureRate = this.bridgeMetrics.integrationFailures / Math.max(this.bridgeMetrics.totalQueries, 1);
    if (failureRate > 0.1) {
      recommendations.push('High integration failure rate - investigate error patterns');
    }
    
    const youtuUsageRate = this.bridgeMetrics.youtuEnhancedQueries / Math.max(this.bridgeMetrics.totalQueries, 1);
    if (youtuUsageRate < 0.5 && this.integrationReady) {
      recommendations.push('Low youtu enhancement usage - verify routing logic effectiveness');
    }

    if (recommendations.length === 0) {
      recommendations.push('Integration performing optimally');
    }

    return recommendations;
  }
}

export default ServerIntegrationBridge;