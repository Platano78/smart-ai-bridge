/**
 * Youtu-Enhanced Empirical Router for DeepSeek MCP Bridge v6.2.0
 * Integrates EmpiricalRouter with FileAnalysisContext for intelligent youtu routing
 * 
 * ROUTING PHILOSOPHY: "Try First, Route on Evidence"
 * 🎯 Analyze prompt for file references and complexity
 * 🎯 Estimate processing requirements (file size, count, complexity)
 * 🎯 Choose between DirectDeepSeek and YoutuThenDeepSeek based on evidence
 * 🎯 Learn from actual execution results, not predictions
 * 
 * ROUTING DECISIONS:
 * - DirectDeepSeek: Single files <50KB, simple queries, proven patterns
 * - YoutuThenDeepSeek: Multiple files >32KB total, complex analysis, large codebases
 * - Evidence-based learning: Route optimization based on actual success/failure
 */

import { YoutAgentFileSystem } from './youtu-agent-filesystem.js';
import { YoutAgentContextChunker } from './youtu-agent-context-chunker.js';
import { YoutAgentOrchestrator } from './youtu-agent-orchestrator.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * File Analysis Context for routing decisions
 */
class FileAnalysisContext {
  constructor() {
    this.fileSystem = new YoutAgentFileSystem();
    this.contextChunker = new YoutAgentContextChunker();
    
    // Context analysis cache
    this.analysisCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    
    // File size thresholds for routing decisions
    this.thresholds = {
      directDeepSeekMaxSize: 50 * 1024,      // 50KB per file
      directDeepSeekMaxTotal: 100 * 1024,    // 100KB total
      youtuMinFiles: 3,                      // 3+ files suggests youtu
      youtuMinTotalSize: 32 * 1024,          // 32KB+ suggests chunking
      complexityThreshold: 0.7               // Complexity score threshold
    };
    
    // Performance metrics
    this.metrics = {
      analysisRequests: 0,
      cacheHits: 0,
      fileAnalyses: 0,
      routingDecisions: 0
    };
  }

  /**
   * Analyze prompt for file references and determine routing context
   */
  async analyzePromptForFiles(prompt, options = {}) {
    const startTime = Date.now();
    this.metrics.analysisRequests++;

    // Check cache first
    const cacheKey = this.generateCacheKey(prompt, options);
    const cached = this.getCachedAnalysis(cacheKey);
    if (cached) {
      this.metrics.cacheHits++;
      return cached;
    }

    try {
      // Extract file references from prompt
      const fileReferences = this.extractFileReferences(prompt);
      
      let fileAnalysis = null;
      let routingRecommendation = 'direct-deepseek'; // Default
      
      if (fileReferences.length > 0) {
        // Analyze actual files
        fileAnalysis = await this.analyzeReferencedFiles(fileReferences, options);
        routingRecommendation = this.determineRoutingStrategy(fileAnalysis, prompt);
        this.metrics.fileAnalyses++;
      } else {
        // No files referenced, analyze prompt complexity
        const complexityAnalysis = this.analyzePromptComplexity(prompt);
        routingRecommendation = complexityAnalysis.suggestedRoute;
      }

      const result = {
        hasFileReferences: fileReferences.length > 0,
        fileReferences,
        fileAnalysis,
        routingRecommendation,
        confidence: this.calculateRoutingConfidence(fileAnalysis, prompt),
        analysisTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };

      // Cache the result
      this.cacheAnalysis(cacheKey, result);
      this.metrics.routingDecisions++;

      return result;

    } catch (error) {
      console.error('File analysis context error:', error.message);
      // Fallback to simple routing
      return {
        hasFileReferences: false,
        fileReferences: [],
        fileAnalysis: null,
        routingRecommendation: 'direct-deepseek',
        confidence: 0.5,
        error: error.message,
        analysisTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Extract file references from prompt text
   */
  extractFileReferences(prompt) {
    const filePatterns = [
      // Explicit file paths
      /(?:file|path|analyze|review|check|examine|read)\s+["`']?([^"`'\s]+\.[a-zA-Z]{1,4})["`']?/gi,
      // Common path patterns
      /["`']?([\.\/\~]?[\w\-\.\/]+\.[a-zA-Z]{1,4})["`']?/g,
      // Project patterns
      /(?:project|directory|folder)\s+["`']?([^"`'\s]+)["`']?/gi
    ];

    const references = new Set();
    
    for (const pattern of filePatterns) {
      let match;
      while ((match = pattern.exec(prompt)) !== null) {
        const filePath = match[1];
        if (this.isValidFilePath(filePath)) {
          references.add(filePath);
        }
      }
    }

    return Array.from(references);
  }

  /**
   * Validate if extracted string looks like a valid file path
   */
  isValidFilePath(filePath) {
    // Basic validation
    if (!filePath || filePath.length < 2) return false;
    
    // Supported extensions
    const supportedExts = [
      '.js', '.ts', '.jsx', '.tsx', '.vue', '.svelte',
      '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift',
      '.html', '.css', '.scss', '.sass', '.json', '.md'
    ];
    
    const ext = path.extname(filePath).toLowerCase();
    return supportedExts.includes(ext);
  }

  /**
   * Analyze referenced files to determine routing strategy
   */
  async analyzeReferencedFiles(fileReferences, options = {}) {
    const analysis = {
      files: [],
      totalSize: 0,
      totalLines: 0,
      fileCount: 0,
      largestFile: 0,
      complexityScore: 0,
      estimatedTokens: 0,
      hasLargeFiles: false,
      hasMultipleFiles: false,
      hasComplexContent: false
    };

    for (const filePath of fileReferences) {
      try {
        // Try to resolve and analyze the file
        const resolvedPath = path.resolve(filePath);
        const stats = await fs.stat(resolvedPath);
        
        if (stats.isFile()) {
          const fileSize = stats.size;
          const content = await fs.readFile(resolvedPath, 'utf8');
          const lines = content.split('\n').length;
          const tokens = this.estimateTokens(content);
          
          const fileAnalysis = {
            path: filePath,
            resolvedPath,
            size: fileSize,
            lines,
            estimatedTokens: tokens,
            extension: path.extname(filePath),
            lastModified: stats.mtime,
            complexity: this.analyzeFileComplexity(content, path.extname(filePath))
          };

          analysis.files.push(fileAnalysis);
          analysis.totalSize += fileSize;
          analysis.totalLines += lines;
          analysis.estimatedTokens += tokens;
          analysis.largestFile = Math.max(analysis.largestFile, fileSize);
          analysis.complexityScore = Math.max(analysis.complexityScore, fileAnalysis.complexity);
        }
      } catch (error) {
        // File not accessible, add as unresolved reference
        analysis.files.push({
          path: filePath,
          error: error.message,
          accessible: false
        });
      }
    }

    analysis.fileCount = analysis.files.filter(f => !f.error).length;
    analysis.hasLargeFiles = analysis.largestFile > this.thresholds.directDeepSeekMaxSize;
    analysis.hasMultipleFiles = analysis.fileCount >= this.thresholds.youtuMinFiles;
    analysis.hasComplexContent = analysis.complexityScore > this.thresholds.complexityThreshold;

    return analysis;
  }

  /**
   * Determine optimal routing strategy based on file analysis
   */
  determineRoutingStrategy(fileAnalysis, prompt) {
    if (!fileAnalysis || fileAnalysis.fileCount === 0) {
      return 'direct-deepseek';
    }

    // Decision matrix based on file characteristics
    const factors = {
      singleSmallFile: fileAnalysis.fileCount === 1 && 
                       fileAnalysis.totalSize <= this.thresholds.directDeepSeekMaxSize,
      
      multipleLargeFiles: fileAnalysis.fileCount >= this.thresholds.youtuMinFiles ||
                          fileAnalysis.totalSize > this.thresholds.youtuMinTotalSize,
      
      highComplexity: fileAnalysis.hasComplexContent,
      
      largeTotal: fileAnalysis.estimatedTokens > 20000, // ~20K tokens
      
      projectAnalysis: prompt.toLowerCase().includes('project') ||
                      prompt.toLowerCase().includes('codebase') ||
                      prompt.toLowerCase().includes('analyze all')
    };

    // Routing logic
    if (factors.singleSmallFile && !factors.highComplexity) {
      return 'direct-deepseek';
    }

    if (factors.multipleLargeFiles || factors.largeTotal || factors.projectAnalysis) {
      return 'youtu-then-deepseek';
    }

    // Edge case: medium complexity single file
    if (fileAnalysis.fileCount === 1 && factors.highComplexity) {
      return fileAnalysis.totalSize > 100000 ? 'youtu-then-deepseek' : 'direct-deepseek';
    }

    return 'direct-deepseek';
  }

  /**
   * Analyze prompt complexity without files
   */
  analyzePromptComplexity(prompt) {
    const complexityIndicators = {
      multiStep: /(?:first|then|next|after|finally|step)/gi.test(prompt),
      comparison: /(?:compare|versus|vs|difference|choose between)/gi.test(prompt),
      analysis: /(?:analyze|review|examine|evaluate|assess)/gi.test(prompt),
      architecture: /(?:architecture|design|pattern|structure)/gi.test(prompt),
      optimization: /(?:optimize|improve|performance|efficient)/gi.test(prompt),
      debugging: /(?:debug|fix|error|issue|problem|bug)/gi.test(prompt),
      implementation: /(?:implement|create|build|develop)/gi.test(prompt)
    };

    const complexityScore = Object.values(complexityIndicators).filter(Boolean).length / 
                           Object.keys(complexityIndicators).length;

    return {
      score: complexityScore,
      suggestedRoute: complexityScore > 0.4 ? 'youtu-then-deepseek' : 'direct-deepseek',
      indicators: Object.entries(complexityIndicators)
        .filter(([_, present]) => present)
        .map(([key, _]) => key)
    };
  }

  /**
   * Calculate routing confidence based on analysis
   */
  calculateRoutingConfidence(fileAnalysis, prompt) {
    if (!fileAnalysis) {
      // No files, base on prompt complexity
      const complexity = this.analyzePromptComplexity(prompt);
      return complexity.score > 0.6 ? 0.8 : 0.9; // High confidence for simple prompts
    }

    // File-based confidence calculation
    let confidence = 0.7; // Base confidence

    // Increase confidence for clear indicators
    if (fileAnalysis.fileCount === 1 && fileAnalysis.totalSize < 20000) {
      confidence += 0.2; // High confidence for small single files
    }

    if (fileAnalysis.fileCount > 5 || fileAnalysis.totalSize > 100000) {
      confidence += 0.2; // High confidence for large multi-file
    }

    if (fileAnalysis.complexityScore > 0.8) {
      confidence += 0.1; // Increase for high complexity
    }

    return Math.min(confidence, 0.95);
  }

  /**
   * Estimate token count for content
   */
  estimateTokens(content) {
    // Simple estimation: ~4 characters per token for code
    return Math.ceil(content.length / 4);
  }

  /**
   * Analyze file complexity
   */
  analyzeFileComplexity(content, extension) {
    const complexityFactors = {
      length: content.length / 10000,  // Longer files = more complex
      functions: (content.match(/function|def |class |interface/g) || []).length / 10,
      imports: (content.match(/import|require|from|include/g) || []).length / 20,
      comments: (content.match(/\/\*|\/\/|#|"""|\'\'\'/g) || []).length / 50,
      nesting: (content.match(/\{|\[|\(/g) || []).length / 100
    };

    const totalComplexity = Object.values(complexityFactors).reduce((sum, factor) => 
      sum + Math.min(factor, 1), 0) / Object.keys(complexityFactors).length;

    return Math.min(totalComplexity, 1.0);
  }

  /**
   * Cache management
   */
  generateCacheKey(prompt, options) {
    const key = JSON.stringify({ prompt: prompt.substring(0, 100), options });
    return Buffer.from(key).toString('base64').substring(0, 32);
  }

  getCachedAnalysis(cacheKey) {
    const cached = this.analysisCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.analysis;
    }
    return null;
  }

  cacheAnalysis(cacheKey, analysis) {
    this.analysisCache.set(cacheKey, {
      analysis,
      timestamp: Date.now()
    });

    // Cleanup old cache entries
    if (this.analysisCache.size > 100) {
      const entries = Array.from(this.analysisCache.entries());
      const expired = entries.filter(([_, value]) => 
        (Date.now() - value.timestamp) > this.cacheTimeout);
      
      expired.forEach(([key, _]) => this.analysisCache.delete(key));
    }
  }

  /**
   * Get analysis metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      cacheHitRate: this.metrics.cacheHits / Math.max(this.metrics.analysisRequests, 1),
      cacheSize: this.analysisCache.size,
      thresholds: this.thresholds
    };
  }
}

/**
 * Youtu-Enhanced Empirical Router
 * Integrates file analysis context with empirical routing
 */
export class YoutuEmpiricalRouter {
  constructor(existingEmpiricalRouter) {
    // Preserve existing empirical router
    this.empiricalRouter = existingEmpiricalRouter;
    
    // Add file analysis context
    this.fileAnalysisContext = new FileAnalysisContext();
    
    // Youtu integration components
    this.youtAgentFileSystem = new YoutAgentFileSystem();
    this.youtAgentContextChunker = new YoutAgentContextChunker();
    
    // Routing decision tracking
    this.routingDecisions = new Map();
    this.routingMetrics = {
      totalQueries: 0,
      directDeepSeekRouted: 0,
      youtuThenDeepSeekRouted: 0,
      routingSuccesses: 0,
      routingFailures: 0,
      fileAnalysisRequests: 0
    };

    console.error('🚀 Youtu-Enhanced Empirical Router initialized');
  }

  /**
   * Enhanced shouldTryDeepseekFirst with youtu routing logic
   */
  async shouldTryDeepseekFirst(prompt, options = {}) {
    const startTime = Date.now();
    this.routingMetrics.totalQueries++;

    try {
      // Step 1: Get original empirical decision
      const empiricalDecision = await this.empiricalRouter.shouldTryDeepseekFirst(prompt);

      // Step 2: Analyze prompt for file context
      const fileAnalysis = await this.fileAnalysisContext.analyzePromptForFiles(prompt, options);
      this.routingMetrics.fileAnalysisRequests++;

      // Step 3: Determine routing strategy
      const routingStrategy = this.determineOptimalRouting(
        empiricalDecision, 
        fileAnalysis, 
        prompt, 
        options
      );

      // Step 4: Create enhanced decision
      const enhancedDecision = this.createEnhancedRoutingDecision(
        empiricalDecision,
        fileAnalysis,
        routingStrategy,
        prompt
      );

      // Step 5: Track routing decision
      this.trackRoutingDecision(enhancedDecision, startTime);

      return enhancedDecision;

    } catch (error) {
      console.error('Youtu routing error:', error.message);
      // Fallback to original empirical routing
      return await this.empiricalRouter.shouldTryDeepseekFirst(prompt);
    }
  }

  /**
   * Determine optimal routing strategy combining empirical and file analysis
   */
  determineOptimalRouting(empiricalDecision, fileAnalysis, prompt, options) {
    // If no files referenced, use empirical decision
    if (!fileAnalysis.hasFileReferences) {
      return {
        strategy: empiricalDecision.tryDeepseek ? 'direct-deepseek' : 'claude-direct',
        reason: 'No file references - using empirical routing',
        confidence: empiricalDecision.confidence || 0.8
      };
    }

    // File analysis recommendations
    const fileRecommendation = fileAnalysis.routingRecommendation;
    const empiricalRecommendation = empiricalDecision.tryDeepseek ? 'direct-deepseek' : 'claude-direct';

    // Decision matrix
    const routingLogic = {
      // Both suggest DeepSeek - choose based on file complexity
      'direct-deepseek-direct-deepseek': {
        strategy: 'direct-deepseek',
        reason: 'Empirical and file analysis agree on direct DeepSeek',
        confidence: Math.min(fileAnalysis.confidence + 0.1, 0.95)
      },
      
      // File analysis suggests youtu, empirical suggests DeepSeek
      'direct-deepseek-youtu-then-deepseek': {
        strategy: 'youtu-then-deepseek',
        reason: 'File analysis overrides empirical for complex file processing',
        confidence: fileAnalysis.confidence
      },
      
      // Empirical suggests Claude, but files present
      'claude-direct-direct-deepseek': {
        strategy: fileAnalysis.fileAnalysis?.fileCount === 1 ? 'direct-deepseek' : 'youtu-then-deepseek',
        reason: 'File presence suggests DeepSeek routing despite empirical caution',
        confidence: 0.7
      },
      
      // Both suggest complex processing
      'claude-direct-youtu-then-deepseek': {
        strategy: 'youtu-then-deepseek',
        reason: 'Complex file processing required - youtu preprocessing optimal',
        confidence: fileAnalysis.confidence
      }
    };

    const decisionKey = `${empiricalRecommendation}-${fileRecommendation}`;
    const routing = routingLogic[decisionKey] || {
      strategy: 'direct-deepseek',
      reason: 'Default routing fallback',
      confidence: 0.6
    };

    return routing;
  }

  /**
   * Create enhanced routing decision with youtu integration
   */
  createEnhancedRoutingDecision(empiricalDecision, fileAnalysis, routingStrategy, prompt) {
    return {
      // Maintain empirical API compatibility
      tryDeepseek: routingStrategy.strategy.includes('deepseek'),
      reason: this.buildEnhancedReason(empiricalDecision, fileAnalysis, routingStrategy),
      fingerprint: empiricalDecision.fingerprint,
      historicalData: empiricalDecision.historicalData,

      // Enhanced youtu routing information
      youtRouting: {
        enabled: true,
        strategy: routingStrategy.strategy,
        fileAnalysis: fileAnalysis.hasFileReferences ? {
          fileCount: fileAnalysis.fileAnalysis?.fileCount || 0,
          totalSize: fileAnalysis.fileAnalysis?.totalSize || 0,
          estimatedTokens: fileAnalysis.fileAnalysis?.estimatedTokens || 0,
          complexityScore: fileAnalysis.fileAnalysis?.complexityScore || 0,
          routingRecommendation: fileAnalysis.routingRecommendation
        } : null,
        confidence: routingStrategy.confidence,
        processingRoute: this.getProcessingRoute(routingStrategy.strategy),
        expectedApproach: this.getExpectedApproach(routingStrategy.strategy, fileAnalysis)
      },

      // Enhanced metadata
      enhancement: {
        ...empiricalDecision.enhancement,
        youtu_integration: {
          file_references_detected: fileAnalysis.hasFileReferences,
          file_analysis_confidence: fileAnalysis.confidence,
          routing_strategy: routingStrategy.strategy,
          routing_reason: routingStrategy.reason,
          preprocessing_required: routingStrategy.strategy === 'youtu-then-deepseek'
        }
      }
    };
  }

  /**
   * Build enhanced reasoning combining empirical and file analysis
   */
  buildEnhancedReason(empiricalDecision, fileAnalysis, routingStrategy) {
    let reason = `Youtu-Enhanced Routing: ${routingStrategy.strategy}\n`;
    reason += `• File Analysis: ${fileAnalysis.hasFileReferences ? 'Files detected' : 'No files'}\n`;
    
    if (fileAnalysis.hasFileReferences && fileAnalysis.fileAnalysis) {
      const fa = fileAnalysis.fileAnalysis;
      reason += `• Files: ${fa.fileCount}, Size: ${Math.round(fa.totalSize/1024)}KB, Tokens: ~${fa.estimatedTokens}\n`;
    }
    
    reason += `• Empirical: ${empiricalDecision.reason}\n`;
    reason += `• Decision: ${routingStrategy.reason}`;
    
    return reason;
  }

  /**
   * Get processing route details
   */
  getProcessingRoute(strategy) {
    const routes = {
      'direct-deepseek': {
        pipeline: 'prompt → DeepSeek',
        preprocessing: false,
        chunking: false,
        expectedLatency: 'low'
      },
      'youtu-then-deepseek': {
        pipeline: 'prompt → file-analysis → chunking → DeepSeek',
        preprocessing: true,
        chunking: true,
        expectedLatency: 'medium'
      },
      'claude-direct': {
        pipeline: 'prompt → Claude',
        preprocessing: false,
        chunking: false,
        expectedLatency: 'low'
      }
    };

    return routes[strategy] || routes['direct-deepseek'];
  }

  /**
   * Get expected processing approach
   */
  getExpectedApproach(strategy, fileAnalysis) {
    if (strategy === 'youtu-then-deepseek' && fileAnalysis.hasFileReferences) {
      return {
        preprocessing: 'YoutAgent file system analysis',
        chunking: 'Context-aware semantic chunking',
        routing: 'Optimized for large file processing',
        benefits: ['Better context management', 'Semantic boundaries', 'Cross-file relationships']
      };
    }

    return {
      preprocessing: 'Direct prompt processing',
      chunking: 'Standard context window',
      routing: 'Direct to model',
      benefits: ['Low latency', 'Simple pipeline', 'Fast response']
    };
  }

  /**
   * Track routing decisions for learning
   */
  trackRoutingDecision(decision, startTime) {
    const strategy = decision.youtRouting.strategy;
    
    if (strategy === 'direct-deepseek') {
      this.routingMetrics.directDeepSeekRouted++;
    } else if (strategy === 'youtu-then-deepseek') {
      this.routingMetrics.youtuThenDeepSeekRouted++;
    }

    // Store decision for analysis
    const decisionId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    this.routingDecisions.set(decisionId, {
      decision,
      timestamp: Date.now(),
      processingTime: Date.now() - startTime
    });

    // Cleanup old decisions (keep last 100)
    if (this.routingDecisions.size > 100) {
      const oldestKey = this.routingDecisions.keys().next().value;
      this.routingDecisions.delete(oldestKey);
    }
  }

  /**
   * Execute youtu preprocessing pipeline if needed
   */
  async executeYoutuPreprocessing(prompt, fileReferences, options = {}) {
    try {
      console.error('🔄 Executing youtu preprocessing pipeline...');
      
      // Use YoutAgent file system for multi-file analysis
      const files = await this.youtAgentFileSystem.readMultipleFiles(fileReferences, {
        maxFiles: options.maxFiles || 20,
        enableChunking: true,
        chunkSize: options.chunkSize || 20000
      });

      // Create optimized context
      const chunks = await this.youtAgentContextChunker.chunkMultipleFiles(files, {
        maxChunkSize: 25000,
        preserveSemanticBoundaries: true
      });

      // Enhanced prompt with file context
      const enhancedPrompt = this.buildEnhancedPrompt(prompt, chunks);

      return {
        success: true,
        enhancedPrompt,
        fileContext: {
          filesProcessed: files.length,
          chunksCreated: chunks.length,
          totalTokens: chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0)
        },
        preprocessingTime: Date.now()
      };

    } catch (error) {
      console.error('Youtu preprocessing error:', error.message);
      return {
        success: false,
        error: error.message,
        fallbackToStandard: true
      };
    }
  }

  /**
   * Build enhanced prompt with file context
   */
  buildEnhancedPrompt(originalPrompt, chunks) {
    let enhancedPrompt = `# Enhanced File Analysis Request\n\n`;
    enhancedPrompt += `**Original Request:** ${originalPrompt}\n\n`;
    enhancedPrompt += `**File Context:** ${chunks.length} chunks from ${new Set(chunks.map(c => c.sourceFile)).size} files\n\n`;

    // Add chunked file content
    chunks.forEach((chunk, index) => {
      enhancedPrompt += `## File Chunk ${index + 1}: ${chunk.sourceFile}\n`;
      enhancedPrompt += `**Lines:** ${chunk.startLine}-${chunk.endLine} | **Tokens:** ~${chunk.tokenCount}\n\n`;
      enhancedPrompt += '```' + (chunk.contentType || 'text') + '\n';
      enhancedPrompt += chunk.content + '\n';
      enhancedPrompt += '```\n\n';
    });

    enhancedPrompt += `**Instructions:** Please analyze the provided file chunks in the context of the original request. `;
    enhancedPrompt += `Consider cross-file relationships and provide comprehensive analysis.`;

    return enhancedPrompt;
  }

  /**
   * Enhanced execution success recording
   */
  recordExecutionSuccess(fingerprint, responseTime, prompt, result) {
    // Record in original empirical router
    this.empiricalRouter.recordExecutionSuccess(fingerprint, responseTime, prompt, result);

    // Record youtu routing success
    this.routingMetrics.routingSuccesses++;
    
    // Extract routing strategy from fingerprint if available
    if (fingerprint.youtRouting) {
      const strategy = fingerprint.youtRouting.strategy;
      console.error(`✅ Youtu routing success: ${strategy} completed in ${responseTime}ms`);
    }
  }

  /**
   * Enhanced execution failure recording
   */
  recordExecutionFailure(fingerprint, responseTime, error, failureAnalysis) {
    // Record in original empirical router
    this.empiricalRouter.recordExecutionFailure(fingerprint, responseTime, error, failureAnalysis);

    // Record youtu routing failure
    this.routingMetrics.routingFailures++;
    
    if (fingerprint.youtRouting) {
      const strategy = fingerprint.youtRouting.strategy;
      console.error(`❌ Youtu routing failure: ${strategy} failed after ${responseTime}ms - ${error.message}`);
    }
  }

  /**
   * Get comprehensive routing statistics
   */
  getRoutingStats() {
    const baseStats = this.empiricalRouter.getEmpiricalStats();
    const fileAnalysisStats = this.fileAnalysisContext.getMetrics();

    return {
      empirical: baseStats,
      youtu_routing: this.routingMetrics,
      file_analysis: fileAnalysisStats,
      routing_distribution: {
        direct_deepseek_percentage: (this.routingMetrics.directDeepSeekRouted / Math.max(1, this.routingMetrics.totalQueries)) * 100,
        youtu_then_deepseek_percentage: (this.routingMetrics.youtuThenDeepSeekRouted / Math.max(1, this.routingMetrics.totalQueries)) * 100
      },
      performance: {
        total_queries: this.routingMetrics.totalQueries,
        routing_success_rate: (this.routingMetrics.routingSuccesses / Math.max(1, this.routingMetrics.routingSuccesses + this.routingMetrics.routingFailures)) * 100,
        file_analysis_usage: (this.routingMetrics.fileAnalysisRequests / Math.max(1, this.routingMetrics.totalQueries)) * 100
      }
    };
  }

  /**
   * Proxy methods for compatibility
   */
  analyzeActualFailure(error, responseTime, prompt) {
    return this.empiricalRouter.analyzeActualFailure(error, responseTime, prompt);
  }

  generateQueryFingerprint(prompt) {
    return this.empiricalRouter.generateQueryFingerprint(prompt);
  }
}

export default YoutuEmpiricalRouter;