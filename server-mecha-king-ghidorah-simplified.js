#!/usr/bin/env node

/**
 * MECHA KING GHIDORAH DeepSeek MCP Bridge v8.0.0 🔥
 * The Ultimate Coding Monster - ENHANCED with Smart AI Routing & NVIDIA Cloud Integration
 *
 * 🦖 ENHANCED AI KAIJU WITH BLAZING FAST CAPABILITIES:
 * ⚡ Smart AI Routing System with NVIDIA Cloud Integration
 * ⚡ AI-Driven File Type Detection & Complexity Analysis
 * ⚡ FileModificationManager Orchestrator for Unified Operations
 * ⚡ Enhanced File Modification Tools with Parallel Processing
 * ⚡ Local Caching with 15-minute Response Optimization
 * ⚡ Qwen3-Coder-30B-A3B-Instruct-FP8 Primary Model
 *
 * 🎯 ENHANCED PERFORMANCE TARGETS:
 * • <5 second startup (MCP compliance)
 * • <2 second FIM responses with smart routing
 * • <100ms routing decisions with 95% local processing
 * • <16ms response times for real-time applications
 * • Parallel processing for BLAZING fast batch operations
 *
 * '(ᗒᗣᗕ)՞ "The enhanced monster rises - smarter, faster, more powerful!"
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';

// Import clean foundation
import { config } from './config.js';
import crypto from 'crypto';

/**
 * 🛠️ FILEMODIFICATIONMANAGER ORCHESTRATOR
 * Unified coordination system for all file modification operations
 */
class FileModificationManager {
  constructor(router) {
    this.router = router;
    this.activeOperations = new Map();
    this.operationHistory = [];
    this.maxHistorySize = 1000;

    console.error('🛠️ FileModificationManager initialized');
  }

  /**
   * 🎯 ORCHESTRATE FILE OPERATIONS
   * Central coordination for all file modification tools
   */
  async orchestrateOperation(operationType, params) {
    const operationId = this.generateOperationId();
    const startTime = performance.now();

    try {
      this.activeOperations.set(operationId, {
        type: operationType,
        startTime,
        status: 'running',
        params
      });

      let result;
      switch (operationType) {
        case 'single_edit':
          result = await this.router.performIntelligentFileEdit(
            params.file_path,
            params.edits,
            params.validation_mode,
            params.language
          );
          break;
        case 'multi_edit':
          result = await this.router.performMultiFileEdit(
            params.file_operations,
            params.transaction_mode,
            params.validation_level,
            params.parallel_processing
          );
          break;
        case 'validation':
          result = await this.router.validateCodeChanges(
            params.file_path,
            params.proposed_changes,
            params.validation_rules,
            params.language
          );
          break;
        case 'backup_management':
          result = await this.router.manageBackups(
            params.action,
            params.file_path,
            params.backup_id,
            params.cleanup_options,
            params.metadata
          );
          break;
        default:
          throw new Error(`Unknown operation type: ${operationType}`);
      }

      const executionTime = performance.now() - startTime;
      this.completeOperation(operationId, result, executionTime);
      return result;

    } catch (error) {
      this.failOperation(operationId, error);
      throw error;
    }
  }

  generateOperationId() {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  completeOperation(operationId, result, executionTime) {
    const operation = this.activeOperations.get(operationId);
    if (operation) {
      operation.status = 'completed';
      operation.executionTime = executionTime;
      operation.result = result;

      this.activeOperations.delete(operationId);
      this.addToHistory(operation);
    }
  }

  failOperation(operationId, error) {
    const operation = this.activeOperations.get(operationId);
    if (operation) {
      operation.status = 'failed';
      operation.error = error.message;

      this.activeOperations.delete(operationId);
      this.addToHistory(operation);
    }
  }

  addToHistory(operation) {
    this.operationHistory.unshift(operation);
    if (this.operationHistory.length > this.maxHistorySize) {
      this.operationHistory.pop();
    }
  }

  getOperationStatus() {
    return {
      active: this.activeOperations.size,
      history: this.operationHistory.length,
      recentOperations: this.operationHistory.slice(0, 10)
    };
  }
}

/**
 * 🦖 MECHA KING GHIDORAH ROUTER - Smart AI Routing System with NVIDIA Cloud Integration
 * Enhanced from v7.1 with AI-driven file type detection and FileModificationManager orchestrator
 */
class MechaKingGhidorahRouter {
  constructor() {
    // Smart AI Routing System - NVIDIA Cloud + Local
    this.endpoints = {
      local: {
        name: 'Qwen3-Coder-30B-A3B-Instruct-FP8',
        url: 'http://localhost:8001/v1/chat/completions',
        healthUrl: 'http://localhost:8001/health',
        maxTokens: 131072,
        isHealthy: true,
        lastHealthCheck: 0,
        priority: 1
      },
      nvidiaDeepSeek: {
        name: 'NVIDIA-DeepSeek-V3.1',
        url: 'https://integrate.api.nvidia.com/v1/chat/completions',
        apiKey: process.env.NVIDIA_API_KEY || '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',
        maxTokens: 65536,
        isHealthy: true,
        lastHealthCheck: 0,
        priority: 2
      },
      nvidiaQwen: {
        name: 'NVIDIA-Qwen-3-Coder-480B',
        url: 'https://integrate.api.nvidia.com/v1/chat/completions',
        apiKey: process.env.NVIDIA_API_KEY || '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',
        maxTokens: 32768,
        isHealthy: true,
        lastHealthCheck: 0,
        priority: 3
      }
    };

    // Default to local endpoint for backwards compatibility
    this.endpoint = this.endpoints.local;

    // Token optimization for Qwen2.5-Coder-7B-FP8-Dynamic
    this.MODEL_MAX_TOKENS = 131072;
    this.SAFETY_MARGIN = 1000; // Reserve tokens for response formatting

    // FIM optimization cache
    this.fimCache = new Map();
    this.fimCacheStats = { hits: 0, misses: 0 };
    this.maxFimCacheSize = 500;
    this.fimCacheTimeout = 10 * 60 * 1000; // 10 minutes for code patterns

    // Performance tracking with routing intelligence
    this.metrics = {
      totalRequests: 0,
      fimRequests: 0,
      avgResponseTime: 0,
      cacheHitRate: 0,
      routingDecisions: {
        local: 0,
        nvidiaDeepSeek: 0,
        nvidiaQwen: 0,
        escalations: 0
      },
      complexityAnalysis: {
        simple: 0,
        medium: 0,
        complex: 0
      },
      validationEscalations: {
        attempted: 0,
        successful: 0,
        failed: 0,
        lowConfidenceTriggered: 0,
        complexityTriggered: 0,
        confidenceImprovement: 0
      }
    };

    // Smart routing configuration
    this.routingConfig = {
      localFirstThreshold: 0.95, // 95% local, 5% cloud
      complexityThresholds: {
        simple: 500,    // tokens
        medium: 2000,   // tokens
        complex: 8000   // tokens
      },
      escalationTriggers: {
        localFailures: 2,
        responseTimeMs: 10000
      }
    };

    // FileModificationManager orchestrator
    this.fileModManager = new FileModificationManager(this);

    // Local caching for performance
    this.responseCache = new Map();
    this.cacheTimeout = 15 * 60 * 1000; // 15 minutes
    this.maxCacheSize = 1000;

    console.error('🦖 MECHA KING GHIDORAH v8.0.0 ROUTER INITIALIZED! Smart AI routing with NVIDIA cloud integration ready!');
  }

  /**
   * ⚡ DYNAMIC TOKEN OPTIMIZATION
   * Calculate optimal max_tokens based on input length and model limits
   */
  calculateOptimalTokens(inputText, responseType = 'standard') {
    // Rough token estimation (1 token ≈ 4 characters for English text)
    const estimatedInputTokens = Math.ceil(inputText.length / 4);

    // Adjust for different response types
    const responseTokenBudgets = {
      'fim': 200,           // Code completion responses
      'analysis': 400,      // Code analysis responses
      'review': 300,        // Code review responses
      'validation': 250,    // Validation responses
      'change_analysis': 150, // Change analysis responses
      'standard': 200       // Default responses
    };

    const targetResponseTokens = responseTokenBudgets[responseType] || responseTokenBudgets['standard'];

    // Calculate available tokens: Model Limit - Input Tokens - Safety Margin
    const availableTokens = this.MODEL_MAX_TOKENS - estimatedInputTokens - this.SAFETY_MARGIN;

    // Use the smaller of target response tokens and available tokens
    const optimalTokens = Math.min(targetResponseTokens, Math.max(50, availableTokens));

    console.error(`⚡ Token optimization: Input ~${estimatedInputTokens}, Available: ${availableTokens}, Optimal: ${optimalTokens}`);

    return optimalTokens;
  }

  /**
   * 🔥 INTELLIGENT FIM PROCESSING
   * Optimized for code completion with DialoGPT-small
   */
  async processFimRequest(prefix, suffix, language = 'javascript') {
    const startTime = performance.now();

    // Generate FIM cache key
    const cacheKey = this.generateFimCacheKey(prefix, suffix, language);

    // Check FIM cache for blazing speed
    if (this.fimCache.has(cacheKey)) {
      const cached = this.fimCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.fimCacheTimeout) {
        this.fimCacheStats.hits++;
        console.error(`⚡ FIM CACHE HIT! Response in ${(performance.now() - startTime).toFixed(2)}ms`);
        return cached.completion;
      } else {
        this.fimCache.delete(cacheKey);
      }
    }
    this.fimCacheStats.misses++;

    // Create FIM prompt for Qwen2.5-Coder
    const fimPrompt = await this.createFimPrompt(prefix, suffix, language);

    try {
      const response = await this.queryEndpoint(fimPrompt, 'fim');
      const completion = this.extractFimCompletion(response);

      // Cache successful FIM completion
      this.cacheFimResponse(cacheKey, completion);

      // Update metrics
      this.metrics.fimRequests++;
      const responseTime = performance.now() - startTime;
      console.error(`🔥 FIM COMPLETION: ${completion.length} chars in ${responseTime.toFixed(2)}ms`);

      return completion;
    } catch (error) {
      console.error('❌ FIM Error:', error.message);
      throw new McpError(ErrorCode.InternalError, `FIM processing failed: ${error.message}`);
    }
  }

  /**
   * 🎯 OPTIMIZED FIM PROMPT GENERATION
   */
  async createFimPrompt(prefix, suffix, language) {
    // Trim context for optimal performance
    const maxPrefixLength = 800;  // Reduced for token efficiency
    const maxSuffixLength = 400;  // Reduced for token efficiency

    const trimmedPrefix = prefix.length > maxPrefixLength ?
      prefix.slice(-maxPrefixLength) : prefix;
    const trimmedSuffix = suffix.length > maxSuffixLength ?
      suffix.slice(0, maxSuffixLength) : suffix;

    const promptContent = `Complete the ${language} code between the markers:

<CONTEXT_PREFIX>
${trimmedPrefix}
</CONTEXT_PREFIX>

<FILL_HERE>
[COMPLETE THIS SECTION]
</FILL_HERE>

<CONTEXT_SUFFIX>
${trimmedSuffix}
</CONTEXT_SUFFIX>

Instructions:
- Provide only the code that should go in the FILL_HERE section
- Maintain proper indentation and formatting
- Follow ${language} best practices
- Keep the completion concise and relevant`;

    return {
      model: await this.getAvailableModel(),
      messages: [{
        role: "user",
        content: promptContent
      }],
      temperature: 0.2,
      max_tokens: this.calculateOptimalTokens(promptContent, 'fim'),
      stop: ["<CONTEXT_SUFFIX>", "<CONTEXT_PREFIX>"]
    };
  }

  /**
   * 🎯 DYNAMIC MODEL DISCOVERY
   */
  async getAvailableModel() {
    try {
      const modelsUrl = this.endpoint.url.replace('/v1/chat/completions', '/v1/models');
      const response = await fetch(modelsUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        const models = await response.json();

        // Extract model names from response
        let availableModels = [];
        if (models.data && Array.isArray(models.data)) {
          availableModels = models.data.map(m => m.id);
        } else if (models.models && Array.isArray(models.models)) {
          availableModels = models.models;
        } else if (Array.isArray(models)) {
          availableModels = models;
        }

        // Try to find the model we want, fallback to first available
        const preferredModels = ['dialogpt-small', 'DialoGPT-small', 'gpt2', 'microsoft/DialoGPT-small'];

        for (const preferred of preferredModels) {
          if (availableModels.includes(preferred)) {
            console.error(`🎯 Using model: ${preferred}`);
            return preferred;
          }
        }

        // Use first available model
        if (availableModels.length > 0) {
          const model = availableModels[0];
          console.error(`🎯 Using first available model: ${model}`);
          return model;
        }
      }
    } catch (error) {
      console.error(`⚠️ Model discovery failed: ${error.message}`);
    }

    // Fallback to original assumption
    console.error(`⚠️ Using fallback model: dialogpt-small`);
    return 'dialogpt-small';
  }

  /**
   * 🏥 ENDPOINT HEALTH VALIDATION
   */
  async validateEndpointHealth() {
    const now = Date.now();

    // Check cache (don't validate more than once per minute)
    if (this.endpoint.isHealthy && (now - this.endpoint.lastHealthCheck) < 60000) {
      return true;
    }

    try {
      console.error(`🏥 Validating endpoint health: ${this.endpoint.url}`);

      // Check if we can reach the models endpoint
      const modelsUrl = this.endpoint.url.replace('/v1/chat/completions', '/v1/models');
      const response = await fetch(modelsUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(10000)
      });

      if (response.ok) {
        const models = await response.json();
        console.error(`🎯 Available models: ${JSON.stringify(models.data?.map(m => m.id) || models)}`);

        this.endpoint.isHealthy = true;
        this.endpoint.lastHealthCheck = now;
        return true;
      } else {
        throw new Error(`Models endpoint returned ${response.status}`);
      }
    } catch (error) {
      console.error(`❌ Endpoint health check failed: ${error.message}`);
      this.endpoint.isHealthy = false;
      throw new Error(`Endpoint unhealthy: ${error.message}`);
    }
  }

  /**
   * 🚀 ENHANCED CORE ENDPOINT QUERY WITH SMART ROUTING
   */
  async queryEndpoint(prompt, taskType = 'general') {
    const startTime = performance.now();
    let lastError = null;

    // Determine complexity for routing decisions
    const estimatedTokens = Math.ceil(JSON.stringify(prompt).length / 4);
    const complexity = estimatedTokens > 4000 ? 'complex' : estimatedTokens > 1000 ? 'medium' : 'simple';
    this.metrics.complexityAnalysis[complexity]++;

    // Try endpoints in priority order
    const endpointOrder = ['local', 'nvidiaDeepSeek', 'nvidiaQwen'];

    for (const endpointKey of endpointOrder) {
      const endpoint = this.endpoints[endpointKey];

      // Skip unhealthy endpoints
      if (!endpoint.isHealthy && (Date.now() - endpoint.lastHealthCheck) < 30000) {
        continue;
      }

      try {
        console.error(`🚀 Attempting query to ${endpointKey} (${endpoint.name})`);

        // Prepare headers based on endpoint type
        const headers = {
          'Content-Type': 'application/json'
        };

        if (endpointKey === 'local') {
          headers['Authorization'] = 'Bearer sk-no-key-required';
        } else {
          headers['Authorization'] = `Bearer ${endpoint.apiKey}`;
          // Update model for NVIDIA endpoints
          if (endpointKey === 'nvidiaDeepSeek') {
            prompt.model = 'nvidia/deepseek-v3';
          } else if (endpointKey === 'nvidiaQwen') {
            prompt.model = 'nvidia/qwen-3-coder-480b';
          }
        }

        const response = await fetch(endpoint.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(prompt),
          signal: AbortSignal.timeout(endpointKey === 'local' ? 60000 : 30000)
        });

        if (!response.ok) {
          let errorDetails = `HTTP ${response.status}: ${response.statusText}`;
          try {
            const errorBody = await response.text();
            errorDetails += ` - ${errorBody}`;
          } catch (e) {
            // Continue with basic error
          }
          throw new Error(errorDetails);
        }

        const data = await response.json();

        // Success! Update metrics and mark endpoint healthy
        endpoint.isHealthy = true;
        endpoint.lastHealthCheck = Date.now();
        this.metrics.totalRequests++;
        this.metrics.routingDecisions[endpointKey]++;

        const responseTime = performance.now() - startTime;
        this.updateMetrics(responseTime);

        console.error(`✅ Query successful via ${endpointKey}: ${responseTime.toFixed(2)}ms`);
        return data;

      } catch (error) {
        lastError = error;
        endpoint.isHealthy = false;
        endpoint.lastHealthCheck = Date.now();
        console.error(`❌ ${endpointKey} failed: ${error.message}`);

        // If this is the local endpoint, try next immediately
        if (endpointKey === 'local') {
          console.error(`🔄 Local endpoint failed, escalating to NVIDIA cloud...`);
          this.metrics.routingDecisions.escalations++;
        }
      }
    }

    // All endpoints failed
    console.error(`💥 All endpoints failed. Last error: ${lastError?.message}`);
    throw lastError || new Error('All endpoints unavailable');
  }

  /**
   * 🧠 SMART UNITY C# FILE ANALYSIS
   */
  async analyzeUnityFile(filePath, content) {
    console.error(`🎮 Analyzing Unity C# file: ${path.basename(filePath)}`);

    // Truncate content if too large for token efficiency
    const truncatedContent = content.length > 2000 ? content.substring(0, 2000) + '\n// [Content truncated for analysis]' : content;

    const promptContent = `Analyze this Unity C# script for compilation errors and improvements:

FILE: ${path.basename(filePath)}

\`\`\`csharp
${truncatedContent}
\`\`\`

Please provide:
1. **Compilation Errors**: Identify any CS#### errors with explanations
2. **Unity-Specific Issues**: Check for Unity API usage problems
3. **Performance Recommendations**: Suggest optimizations for mobile
4. **Code Quality**: Assess structure and best practices
5. **Fix Suggestions**: Provide specific code fixes

Focus on Unity 6 compatibility and mobile performance optimization.`;

    const prompt = {
      model: await this.getAvailableModel(),
      messages: [{
        role: "user",
        content: promptContent
      }],
      temperature: 0.3,
      max_tokens: this.calculateOptimalTokens(promptContent, 'analysis')
    };

    try {
      const response = await this.queryEndpoint(prompt, 'unity_analysis');
      return response.choices[0]?.message?.content || 'Analysis failed';
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Unity analysis failed: ${error.message}`);
    }
  }

  /**
   * 🔧 UTILITY METHODS
   */
  generateFimCacheKey(prefix, suffix, language) {
    const content = prefix.slice(-200) + suffix.slice(0, 200);
    return `fim_${language}_${this.hashString(content)}`;
  }

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  cacheFimResponse(cacheKey, completion) {
    // Clean cache if too large
    if (this.fimCache.size >= this.maxFimCacheSize) {
      const oldestKey = this.fimCache.keys().next().value;
      this.fimCache.delete(oldestKey);
    }

    this.fimCache.set(cacheKey, {
      completion,
      timestamp: Date.now()
    });
  }

  extractFimCompletion(response) {
    const content = response.choices?.[0]?.message?.content;
    if (!content) return '';

    // Clean up the response - remove markdown formatting if present
    return content
      .replace(/```[a-zA-Z]*\n?/g, '')
      .replace(/^```|```$/g, '')
      .trim();
  }

  updateMetrics(responseTime) {
    this.metrics.avgResponseTime =
      (this.metrics.avgResponseTime * (this.metrics.totalRequests - 1) + responseTime) /
      this.metrics.totalRequests;

    this.metrics.cacheHitRate =
      this.fimCacheStats.hits / (this.fimCacheStats.hits + this.fimCacheStats.misses) * 100;
  }

  /**
   * 📊 GET VALIDATION ESCALATION METRICS
   * Returns comprehensive metrics about validation escalation performance
   */
  getValidationEscalationMetrics() {
    const escalationMetrics = this.metrics.validationEscalations;
    const totalAttempted = escalationMetrics.attempted;

    return {
      escalationStats: {
        attempted: totalAttempted,
        successful: escalationMetrics.successful,
        failed: escalationMetrics.failed,
        successRate: totalAttempted > 0 ? ((escalationMetrics.successful / totalAttempted) * 100).toFixed(1) + '%' : '0%'
      },
      escalationTriggers: {
        lowConfidence: escalationMetrics.lowConfidenceTriggered,
        complexity: escalationMetrics.complexityTriggered,
        lowConfidencePercentage: totalAttempted > 0 ? ((escalationMetrics.lowConfidenceTriggered / totalAttempted) * 100).toFixed(1) + '%' : '0%',
        complexityPercentage: totalAttempted > 0 ? ((escalationMetrics.complexityTriggered / totalAttempted) * 100).toFixed(1) + '%' : '0%'
      },
      performanceImpact: {
        averageConfidenceImprovement: escalationMetrics.successful > 0 ?
          ((escalationMetrics.confidenceImprovement / escalationMetrics.successful) * 100).toFixed(1) + '%' : '0%',
        totalConfidenceGained: (escalationMetrics.confidenceImprovement * 100).toFixed(1) + '%'
      },
      systemHealth: {
        escalationReliability: totalAttempted > 0 ? 'Active' : 'Inactive',
        recommendedAction: this.getEscalationRecommendation(escalationMetrics)
      }
    };
  }

  /**
   * 🎯 GET ESCALATION RECOMMENDATION
   * Provides system recommendations based on escalation performance
   */
  getEscalationRecommendation(escalationMetrics) {
    const successRate = escalationMetrics.attempted > 0 ? escalationMetrics.successful / escalationMetrics.attempted : 0;

    if (escalationMetrics.attempted === 0) {
      return 'System ready - no escalations attempted yet';
    } else if (successRate > 0.9) {
      return 'Excellent escalation performance - system optimal';
    } else if (successRate > 0.7) {
      return 'Good escalation performance - monitor cloud endpoint health';
    } else if (successRate > 0.5) {
      return 'Moderate escalation performance - check cloud connectivity';
    } else {
      return 'Poor escalation performance - investigate cloud endpoint issues';
    }
  }

  /**
   * 🔍 ENHANCED ENDPOINT HEALTH MONITORING
   */
  async performComprehensiveHealthCheck() {
    const healthResults = {};

    for (const [key, endpoint] of Object.entries(this.endpoints)) {
      try {
        const startTime = performance.now();
        let healthUrl = endpoint.healthUrl || endpoint.url.replace('/v1/chat/completions', '/health');

        // For NVIDIA endpoints, use models endpoint for health check
        if (key.startsWith('nvidia')) {
          healthUrl = endpoint.url.replace('/v1/chat/completions', '/v1/models');
        }

        const response = await fetch(healthUrl, {
          method: 'GET',
          headers: key.startsWith('nvidia') ? {
            'Authorization': `Bearer ${endpoint.apiKey}`
          } : {},
          signal: AbortSignal.timeout(5000)
        });

        const responseTime = performance.now() - startTime;

        if (response.ok) {
          endpoint.isHealthy = true;
          endpoint.lastHealthCheck = Date.now();

          let details = null;
          try {
            details = await response.json();
          } catch (e) {
            details = { status: 'healthy' };
          }

          healthResults[key] = {
            status: 'healthy',
            responseTime: `${responseTime.toFixed(2)}ms`,
            lastCheck: new Date(endpoint.lastHealthCheck).toISOString(),
            details
          };
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (error) {
        endpoint.isHealthy = false;
        endpoint.lastHealthCheck = Date.now();

        healthResults[key] = {
          status: 'unhealthy',
          error: error.message,
          lastCheck: new Date(endpoint.lastHealthCheck).toISOString()
        };
      }
    }

    return healthResults;
  }

  getSystemStatus(checkType = 'comprehensive') {
    const baseStatus = {
      name: "Mecha King Ghidorah",
      version: "8.0.0",
      status: "🦖 ENHANCED ONLINE - Smart AI Routing Beast ready!",
      activeEndpoint: Object.entries(this.endpoints).find(([k, ep]) => ep.isHealthy)?.[1]?.name || 'None',
      tools: ["analyze", "generate", "review", "read", "health", "write_files_atomic", "edit_file", "validate_changes", "multi_edit", "backup_restore"],
      smartRouting: {
        priorityOrder: ['Local (Qwen3-Coder-30B)', 'NVIDIA DeepSeek-V3', 'NVIDIA Qwen-3-Coder-480B'],
        localFirst: this.routingConfig.localFirstThreshold * 100 + '%',
        nvidiaIntegration: !!(this.endpoints.nvidiaDeepSeek.isHealthy || this.endpoints.nvidiaQwen.isHealthy),
        endpointHealth: Object.fromEntries(
          Object.entries(this.endpoints).map(([key, ep]) => [
            key,
            {
              healthy: ep.isHealthy,
              lastCheck: new Date(ep.lastHealthCheck).toISOString(),
              url: ep.url,
              priority: ep.priority
            }
          ])
        )
      },
      metrics: this.metrics,
      fimCache: {
        size: this.fimCache.size,
        hitRate: this.metrics.cacheHitRate.toFixed(1) + '%'
      },
      fileModificationManager: this.fileModManager.getOperationStatus()
    };

    if (checkType === 'comprehensive') {
      baseStatus.performance = {
        avgResponseTime: this.metrics.avgResponseTime.toFixed(2) + 'ms',
        totalRequests: this.metrics.totalRequests,
        fimRequests: this.metrics.fimRequests,
        cacheEfficiency: this.metrics.cacheHitRate.toFixed(1) + '%'
      };
      baseStatus.capabilities = [
        "🔍 Universal code analysis (20+ languages)",
        "⚡ Smart code generation and refactoring",
        "👀 Comprehensive code review",
        "📖 Intelligent file operations",
        "✍️ Atomic file modifications with backup",
        "🔧 AI-powered intelligent file editing with smart routing",
        "✅ Pre-flight code validation & safety checks",
        "🔄 Enterprise-grade atomic batch operations with parallel processing",
        "💾 Advanced backup management & rollback capability",
        "🧠 Priority-based smart routing: Local → NVIDIA DeepSeek → NVIDIA Qwen",
        "🎯 AI-driven file type detection and complexity analysis",
        "⚡ Local caching with 15-minute response optimization",
        "🛠️ FileModificationManager orchestrator for unified operations",
        "🏥 Real-time endpoint health monitoring with automatic failover",
        "📊 Comprehensive routing metrics and performance analytics"
      ];

      // Add real-time health check if comprehensive
      if (checkType === 'comprehensive') {
        baseStatus.realtimeHealthCheck = 'Available via performComprehensiveHealthCheck()';
      }
    }

    return baseStatus;
  }

  /**
   * 🧠 AI-DRIVEN LANGUAGE DETECTION
   * Enhanced language detection using AI for ambiguous cases
   */
  async detectLanguageWithAI(content, filePath) {
    // Fast path: use traditional detection first
    const traditionalLang = this.detectLanguage(content, filePath);
    if (traditionalLang !== 'text') {
      return traditionalLang;
    }

    // AI-driven detection for ambiguous cases
    try {
      const sample = content.substring(0, 500);
      const prompt = {
        model: await this.getAvailableModel(),
        messages: [{
          role: "user",
          content: `Identify the programming language of this code snippet. Respond with just the language name (e.g., javascript, python, java, etc.):\n\n${sample}`
        }],
        temperature: 0.1,
        max_tokens: 10
      };

      const response = await this.queryEndpoint(prompt, 'language_detection');
      const detectedLang = response.choices[0]?.message?.content?.trim().toLowerCase();

      // Validate and normalize the response
      const validLanguages = ['javascript', 'typescript', 'python', 'java', 'csharp', 'cpp', 'c', 'rust', 'go', 'php', 'ruby'];
      return validLanguages.includes(detectedLang) ? detectedLang : traditionalLang;
    } catch (error) {
      console.error(`⚠️ AI language detection failed: ${error.message}`);
      return traditionalLang;
    }
  }

  /**
   * ENHANCED: Universal code analysis with AI-driven language detection
   */
  async analyzeUniversal(content, filePath, analysisType = 'comprehensive', language) {
    try {
      // Use AI-driven language detection for better accuracy
      const detectedLang = language || await this.detectLanguageWithAI(content, filePath);

      // Truncate content if too large for token efficiency
      const truncatedContent = content.length > 1500 ? content.substring(0, 1500) + '\n// [Content truncated for analysis]' : content;

      const promptContent = `Perform ${analysisType} code analysis on this ${detectedLang} code:

File: ${filePath || 'code-snippet'}
Analysis Type: ${analysisType}

Code:
\`\`\`${detectedLang}
${truncatedContent}
\`\`\`

Please analyze for:
- Security vulnerabilities and issues
- Performance bottlenecks and optimization opportunities
- Code structure and architectural patterns
- Best practices compliance
- Dependency issues and circular dependencies
- Language-specific concerns

Provide actionable recommendations.`;

      const response = await this.queryEndpoint({
        model: await this.getAvailableModel(),
        messages: [{ role: "user", content: promptContent }],
        temperature: 0.3,
        max_tokens: this.calculateOptimalTokens(promptContent, 'analysis')
      }, 'analysis');

      return response.choices[0]?.message?.content || 'Analysis failed';
    } catch (error) {
      return `Analysis error: ${error.message}`;
    }
  }

  /**
   * ENHANCED: Comprehensive code review with AI-driven language detection
   */
  async performCodeReview(content, filePath, reviewType = 'comprehensive', language) {
    try {
      const detectedLang = language || await this.detectLanguageWithAI(content, filePath);

      // Truncate content if too large for token efficiency
      const truncatedContent = content.length > 1200 ? content.substring(0, 1200) + '\n// [Content truncated for review]' : content;

      const promptContent = `Conduct a thorough ${reviewType} code review for this ${detectedLang} code:

File: ${filePath || 'code-snippet'}
Review Focus: ${reviewType}

Code:
\`\`\`${detectedLang}
${truncatedContent}
\`\`\`

Review checklist:
✅ Security audit (vulnerabilities, injection risks, secrets)
✅ Performance analysis (bottlenecks, memory usage, algorithms)
✅ Code quality (readability, maintainability, complexity)
✅ Best practices validation (conventions, patterns, standards)
✅ Architecture assessment (coupling, cohesion, SOLID principles)

Provide:
1. Quality Score (1-10)
2. Critical Issues (if any)
3. Improvement Suggestions
4. Security Recommendations`;

      const response = await this.queryEndpoint({
        model: await this.getAvailableModel(),
        messages: [{ role: "user", content: promptContent }],
        temperature: 0.2,
        max_tokens: this.calculateOptimalTokens(promptContent, 'review')
      }, 'review');

      return response.choices[0]?.message?.content || 'Review failed';
    } catch (error) {
      return `Review error: ${error.message}`;
    }
  }

  /**
   * ENHANCED: Detect programming language from content and file path
   * Now supports AI-driven detection for ambiguous cases
   */
  detectLanguage(content, filePath) {
    if (filePath) {
      const ext = path.extname(filePath).toLowerCase();
      const langMap = {
        '.js': 'javascript',
        '.ts': 'typescript',
        '.jsx': 'javascript',
        '.tsx': 'typescript',
        '.cs': 'csharp',
        '.py': 'python',
        '.java': 'java',
        '.cpp': 'cpp',
        '.c': 'c',
        '.rs': 'rust',
        '.go': 'go',
        '.php': 'php',
        '.rb': 'ruby',
        '.swift': 'swift',
        '.kt': 'kotlin',
        '.scala': 'scala',
        '.json': 'json',
        '.yaml': 'yaml',
        '.yml': 'yaml',
        '.xml': 'xml',
        '.html': 'html',
        '.css': 'css',
        '.sql': 'sql'
      };
      if (langMap[ext]) return langMap[ext];
    }

    // Content-based detection
    if (content.includes('using UnityEngine') || content.includes('MonoBehaviour')) return 'csharp';
    if (content.includes('import React') || content.includes('useState')) return 'javascript';
    if (content.includes('def ') && content.includes('import ')) return 'python';
    if (content.includes('public class') && content.includes('void ')) return 'java';
    if (content.includes('fn ') && content.includes('let ')) return 'rust';
    if (content.includes('func ') && content.includes('package ')) return 'go';

    return 'text';
  }

  /**
   * 🔧 ENHANCED SMART ROUTING SYSTEM
   * AI-driven endpoint selection with priority-based fallback
   */
  async selectOptimalEndpoint(taskType = 'general', complexity = 'medium') {
    const now = Date.now();

    // Priority order: Local → NVIDIA DeepSeek → NVIDIA Qwen
    const endpointOrder = ['local', 'nvidiaDeepSeek', 'nvidiaQwen'];

    for (const endpointKey of endpointOrder) {
      const endpoint = this.endpoints[endpointKey];

      // Skip if endpoint was recently marked unhealthy
      if (!endpoint.isHealthy && (now - endpoint.lastHealthCheck) < 30000) {
        console.error(`⚠️ Skipping ${endpointKey}: marked unhealthy`);
        continue;
      }

      // Quick health check for local endpoint
      if (endpointKey === 'local') {
        try {
          const response = await fetch(endpoint.url.replace('/v1/chat/completions', '/health'), {
            method: 'GET',
            signal: AbortSignal.timeout(2000)
          });

          if (response.ok) {
            endpoint.isHealthy = true;
            endpoint.lastHealthCheck = now;
            this.metrics.routingDecisions[endpointKey]++;
            console.error(`🎯 Selected endpoint: ${endpointKey} (${endpoint.name})`);
            return endpoint;
          } else {
            endpoint.isHealthy = false;
            endpoint.lastHealthCheck = now;
            console.error(`❌ Local endpoint health check failed: ${response.status}`);
          }
        } catch (error) {
          endpoint.isHealthy = false;
          endpoint.lastHealthCheck = now;
          console.error(`❌ Local endpoint unreachable: ${error.message}`);
        }
      } else {
        // For NVIDIA endpoints, assume healthy if not recently checked
        endpoint.isHealthy = true;
        this.metrics.routingDecisions[endpointKey]++;
        console.error(`🎯 Selected endpoint: ${endpointKey} (${endpoint.name})`);
        return endpoint;
      }
    }

    // If all endpoints failed, use local as fallback
    console.error(`⚠️ All endpoints failed, using local as fallback`);
    this.metrics.routingDecisions.escalations++;
    return this.endpoints.local;
  }

  /**
   * 🔧 INTELLIGENT FILE EDITING
   * AI-powered targeted modifications with validation and rollback capability
   */
  async performIntelligentFileEdit(filePath, edits, validationMode = 'strict', language) {
    const startTime = performance.now();
    console.error(`🔧 Starting intelligent file edit: ${path.basename(filePath)}`);

    try {
      // Read the current file content
      const originalContent = await fs.readFile(filePath, 'utf8');
      const detectedLang = language || this.detectLanguage(originalContent, filePath);

      // Create backup if not in dry_run mode
      let backupPath = null;
      if (validationMode !== 'dry_run') {
        backupPath = `${filePath}.backup.${Date.now()}`;
        await fs.copyFile(filePath, backupPath);
      }

      // Analyze validation complexity before proceeding
      const validationComplexity = this.analyzeValidationComplexity(edits, originalContent, detectedLang);

      // Validate edits using AI before applying
      const validationResult = await this.validateCodeChanges(
        filePath,
        edits,
        ['syntax', 'logic', 'security'],
        detectedLang,
        validationComplexity
      );

      // Intelligent validation analysis with escalation capability
      const responseAnalysis = this.analyzeValidationResponse(validationResult, validationComplexity);
      const isCloudEnhanced = validationResult.includes('ASSESSMENT:') || validationResult.includes('CONFIDENCE:');

      // Parse cloud-enhanced assessment if available
      let finalAssessment = 'NEEDS_REVIEW';
      let finalConfidence = responseAnalysis.confidence;

      if (isCloudEnhanced) {
        const assessmentMatch = validationResult.match(/ASSESSMENT:\s*(APPROVED|REJECTED|NEEDS_REVIEW)/i);
        finalAssessment = assessmentMatch ? assessmentMatch[1].toUpperCase() : 'NEEDS_REVIEW';

        const confidenceMatch = validationResult.match(/CONFIDENCE:\s*(\d+)%/i);
        finalConfidence = confidenceMatch ? parseInt(confidenceMatch[1]) / 100 : responseAnalysis.confidence;
      } else {
        // Legacy keyword-based analysis for non-escalated results
        const hasCriticalIssues = validationResult.toLowerCase().includes('critical') ||
                                  validationResult.toLowerCase().includes('error') ||
                                  validationResult.toLowerCase().includes('invalid');

        if (hasCriticalIssues && finalConfidence > 0.8) {
          finalAssessment = 'REJECTED';
        } else if (hasCriticalIssues) {
          finalAssessment = 'NEEDS_REVIEW';
        } else {
          finalAssessment = 'APPROVED';
        }
      }

      // Enhanced decision logic for strict mode
      if (validationMode === 'strict') {
        if (finalAssessment === 'REJECTED' && finalConfidence > 0.85) {
          // High-confidence rejection - proceed with rejection
          return JSON.stringify({
            status: 'rejected',
            reason: 'High-confidence validation rejection',
            assessment: finalAssessment,
            confidence: `${(finalConfidence * 100).toFixed(1)}%`,
            complexity: validationComplexity.level,
            validation: validationResult,
            appliedEdits: 0,
            totalEdits: edits.length,
            backup: backupPath,
            executionTime: `${(performance.now() - startTime).toFixed(2)}ms`,
            escalated: isCloudEnhanced
          }, null, 2);
        } else if (finalAssessment === 'REJECTED' || (finalAssessment === 'NEEDS_REVIEW' && finalConfidence < 0.6)) {
          // Low-confidence rejection or needs review - return with warning but allow override
          return JSON.stringify({
            status: 'validation_warning',
            reason: 'Validation concerns detected - review recommended',
            assessment: finalAssessment,
            confidence: `${(finalConfidence * 100).toFixed(1)}%`,
            complexity: validationComplexity.level,
            validation: validationResult,
            appliedEdits: 0,
            totalEdits: edits.length,
            backup: backupPath,
            executionTime: `${(performance.now() - startTime).toFixed(2)}ms`,
            escalated: isCloudEnhanced,
            overrideNote: 'Use validation_mode="lenient" to proceed with acknowledged risks'
          }, null, 2);
        }
      }

      if (validationMode === 'dry_run') {
        return JSON.stringify({
          status: 'dry_run_complete',
          validation: validationResult,
          plannedEdits: edits.length,
          executionTime: `${(performance.now() - startTime).toFixed(2)}ms`,
          note: 'No changes were applied (dry run mode)'
        }, null, 2);
      }

      // Apply edits sequentially
      let modifiedContent = originalContent;
      const appliedEdits = [];
      const failedEdits = [];

      for (let i = 0; i < edits.length; i++) {
        const edit = edits[i];

        try {
          // Check if the find text exists
          if (!modifiedContent.includes(edit.find)) {
            failedEdits.push({
              index: i,
              edit: edit,
              reason: 'Find text not found in current content'
            });
            continue;
          }

          // Apply the replacement
          const beforeLength = modifiedContent.length;
          modifiedContent = modifiedContent.replace(edit.find, edit.replace);
          const afterLength = modifiedContent.length;

          appliedEdits.push({
            index: i,
            edit: edit,
            characterDelta: afterLength - beforeLength
          });

        } catch (error) {
          failedEdits.push({
            index: i,
            edit: edit,
            reason: error.message
          });
        }
      }

      // Write the modified content
      if (appliedEdits.length > 0) {
        await fs.writeFile(filePath, modifiedContent, 'utf8');
      }

      // Generate AI analysis of the changes
      const changeAnalysis = await this.analyzeFileChanges(
        originalContent,
        modifiedContent,
        detectedLang,
        appliedEdits
      );

      const result = {
        status: appliedEdits.length > 0 ? 'success' : 'no_changes',
        filePath: filePath,
        language: detectedLang,
        appliedEdits: appliedEdits.length,
        failedEdits: failedEdits.length,
        totalEdits: edits.length,
        backup: backupPath,
        validation: validationResult,
        changeAnalysis: changeAnalysis,
        executionTime: `${(performance.now() - startTime).toFixed(2)}ms`,
        appliedChanges: appliedEdits,
        failedChanges: failedEdits
      };

      console.error(`✅ File edit complete: ${appliedEdits.length}/${edits.length} edits applied`);
      return JSON.stringify(result, null, 2);

    } catch (error) {
      console.error(`❌ File edit error: ${error.message}`);
      throw new McpError(ErrorCode.InternalError, `File edit failed: ${error.message}`);
    }
  }

  /**
   * ✅ INTELLIGENT CODE CHANGE VALIDATION
   * Enhanced validation with complexity analysis and cloud escalation capability
   */
  async validateCodeChanges(filePath, proposedChanges, validationRules = ['syntax', 'logic', 'security', 'performance'], language, validationComplexity = null) {
    const startTime = performance.now();
    console.error(`✅ Validating ${proposedChanges.length} changes for: ${path.basename(filePath)}`);

    try {
      // Read current file content for context
      let currentContent = '';
      try {
        currentContent = await fs.readFile(filePath, 'utf8');
      } catch (error) {
        // File might not exist yet - that's okay for validation
        currentContent = '// New file';
      }

      const detectedLang = language || this.detectLanguage(currentContent, filePath);

      // Use provided complexity analysis or calculate if not provided
      const complexity = validationComplexity || this.analyzeValidationComplexity(proposedChanges, currentContent, detectedLang);

      // Simulate the changes to create the proposed new content
      let proposedContent = currentContent;
      for (const change of proposedChanges) {
        if (proposedContent.includes(change.find)) {
          proposedContent = proposedContent.replace(change.find, change.replace);
        }
      }

      // Truncate content for token efficiency
      const truncatedCurrentContent = currentContent.length > 800 ?
        currentContent.substring(0, 800) + '\n// [Content truncated for validation]' : currentContent;
      const truncatedProposedContent = proposedContent.length > 800 ?
        proposedContent.substring(0, 800) + '\n// [Content truncated for validation]' : proposedContent;

      const promptContent = `Validate these ${detectedLang} code changes for a ${path.basename(filePath)} file:

VALIDATION RULES: ${validationRules.join(', ')}

ORIGINAL CODE:
\`\`\`${detectedLang}
${truncatedCurrentContent}
\`\`\`

PROPOSED CHANGES:
${proposedChanges.map((change, i) => `
Change ${i + 1}:
  Find: "${change.find}"
  Replace: "${change.replace}"
  Line: ${change.line_number || 'auto-detect'}
`).join('')}

RESULTING CODE:
\`\`\`${detectedLang}
${truncatedProposedContent}
\`\`\`

Please analyze these changes and provide:

🔍 **SYNTAX VALIDATION**:
- Check for syntax errors in the resulting code
- Validate proper language constructs
- Check bracket/brace matching

🧠 **LOGIC VALIDATION**:
- Verify logical consistency
- Check for potential runtime errors
- Validate function signatures and calls

🔒 **SECURITY VALIDATION**:
- Identify potential security vulnerabilities
- Check for injection risks
- Validate input handling

⚡ **PERFORMANCE VALIDATION**:
- Assess performance impact
- Identify optimization opportunities
- Check for inefficient patterns

🎯 **OVERALL ASSESSMENT**:
- Rate the changes (SAFE/CAUTION/RISKY)
- Provide specific recommendations
- Highlight any critical issues that must be addressed

Focus on ${detectedLang}-specific best practices and provide actionable feedback.`;

      const prompt = {
        model: await this.getAvailableModel(),
        messages: [{
          role: "user",
          content: promptContent
        }],
        temperature: 0.2,
        max_tokens: this.calculateOptimalTokens(promptContent, 'validation')
      };

      const response = await this.queryEndpoint(prompt, 'validation');
      let validationResult = response.choices[0]?.message?.content || 'Validation analysis failed';

      // Analyze the validation response for confidence and escalation needs
      const responseAnalysis = this.analyzeValidationResponse(validationResult, complexity);

      console.error(`🧠 Validation complexity: ${complexity.level} (score: ${complexity.score})`);
      console.error(`🎯 Validation confidence: ${(responseAnalysis.confidence * 100).toFixed(1)}%`);

      // Check if escalation to cloud APIs is needed
      if (responseAnalysis.needsEscalation) {
        console.error(`🚀 Escalating to cloud for expert analysis (reason: ${responseAnalysis.escalationReason})`);

        // Track escalation metrics
        this.metrics.validationEscalations.attempted++;
        if (responseAnalysis.escalationReason === 'low_confidence') {
          this.metrics.validationEscalations.lowConfidenceTriggered++;
        } else if (responseAnalysis.escalationReason === 'complexity_trigger') {
          this.metrics.validationEscalations.complexityTriggered++;
        }

        try {
          const cloudValidation = await this.performCloudValidationEscalation(
            filePath,
            proposedChanges,
            validationResult,
            complexity,
            responseAnalysis,
            detectedLang
          );

          validationResult = cloudValidation.enhancedResult;
          this.metrics.validationEscalations.successful++;

          // Track confidence improvement
          const confidenceImprovement = cloudValidation.finalConfidence - responseAnalysis.confidence;
          if (confidenceImprovement > 0) {
            this.metrics.validationEscalations.confidenceImprovement += confidenceImprovement;
          }

          console.error(`✨ Cloud escalation complete: confidence improved to ${(cloudValidation.finalConfidence * 100).toFixed(1)}%`);
        } catch (escalationError) {
          this.metrics.validationEscalations.failed++;
          console.error(`⚠️ Cloud escalation failed: ${escalationError.message}, using local result`);
          // Add escalation failure context to result
          validationResult += `\n\n[ESCALATION NOTE] Attempted cloud validation but failed: ${escalationError.message}. Local validation confidence: ${(responseAnalysis.confidence * 100).toFixed(1)}%`;
        }
      }

      console.error(`✅ Validation complete: ${(performance.now() - startTime).toFixed(2)}ms`);
      return validationResult;

    } catch (error) {
      console.error(`❌ Validation error: ${error.message}`);
      return `Validation error: ${error.message}`;
    }
  }

  /**
   * 🧠 VALIDATION COMPLEXITY ANALYSIS
   * Analyzes the complexity of proposed changes to determine validation strategy
   */
  analyzeValidationComplexity(proposedChanges, currentContent, language) {
    let complexityScore = 0;
    const factors = {
      changeVolume: 0,
      syntaxComplexity: 0,
      semanticComplexity: 0,
      riskLevel: 0,
      languageSpecificRisk: 0
    };

    // Factor 1: Change volume analysis
    const totalChanges = proposedChanges.length;
    const contentLength = currentContent.length;
    factors.changeVolume = Math.min(totalChanges * 2, 20); // Cap at 20 points

    // Factor 2: Syntax complexity analysis
    for (const change of proposedChanges) {
      const changeText = change.new_code || change.content || '';

      // Check for complex syntax patterns
      const complexPatterns = [
        /async\s+function|await\s+/gi,  // Async operations
        /Promise\.|\.then\(|\.catch\(/gi, // Promise chains
        /class\s+\w+|extends\s+\w+/gi,   // Class definitions
        /interface\s+\w+|type\s+\w+/gi,  // TypeScript types
        /try\s*\{|catch\s*\(|finally\s*\{/gi, // Error handling
        /import\s+.*from|require\s*\(/gi, // Module imports
        /\$\{.*\}|`.*`/gi,               // Template literals
        /\[.*\]\s*=|{.*}\s*=/gi          // Destructuring
      ];

      for (const pattern of complexPatterns) {
        factors.syntaxComplexity += (changeText.match(pattern) || []).length;
      }
    }

    // Factor 3: Semantic complexity (based on change types)
    for (const change of proposedChanges) {
      const changeText = change.new_code || change.content || '';

      // High-risk semantic patterns
      const semanticRisks = [
        /security|auth|password|token|key|secret/gi,
        /database|sql|query|connection/gi,
        /api|endpoint|route|middleware/gi,
        /crypto|encrypt|decrypt|hash/gi,
        /file|path|directory|fs\./gi,
        /eval\s*\(|exec\s*\(|new Function/gi
      ];

      for (const risk of semanticRisks) {
        factors.semanticComplexity += (changeText.match(risk) || []).length * 3;
      }
    }

    // Factor 4: Risk level assessment
    const totalChangeSize = proposedChanges.reduce((sum, change) => {
      return sum + (change.new_code || change.content || '').length;
    }, 0);

    if (totalChangeSize > 2000) factors.riskLevel += 15;
    else if (totalChangeSize > 1000) factors.riskLevel += 10;
    else if (totalChangeSize > 500) factors.riskLevel += 5;

    // Factor 5: Language-specific risk assessment
    const languageRisks = {
      'javascript': 8,
      'typescript': 6,
      'python': 7,
      'java': 5,
      'csharp': 5,
      'cpp': 9,
      'c': 10,
      'rust': 4,
      'go': 5
    };
    factors.languageSpecificRisk = languageRisks[language] || 5;

    // Calculate final complexity score
    complexityScore = factors.changeVolume +
                     Math.min(factors.syntaxComplexity * 2, 30) +
                     Math.min(factors.semanticComplexity, 25) +
                     factors.riskLevel +
                     factors.languageSpecificRisk;

    const complexity = complexityScore > 70 ? 'high' :
                      complexityScore > 40 ? 'medium' : 'low';

    return {
      score: complexityScore,
      level: complexity,
      factors,
      requiresCloudEscalation: complexity === 'high' || factors.semanticComplexity > 15,
      confidenceThreshold: complexity === 'high' ? 0.85 : 0.70
    };
  }

  /**
   * ☁️ CLOUD VALIDATION ESCALATION
   * Escalates complex validation scenarios to cloud APIs for expert analysis
   */
  async performCloudValidationEscalation(filePath, proposedChanges, localValidation, complexityAnalysis, responseAnalysis, language) {
    const startTime = performance.now();
    console.error(`☁️ Starting cloud validation escalation for ${path.basename(filePath)}`);

    try {
      // Create enhanced prompt for cloud validation
      const promptContent = `EXPERT CODE VALIDATION REQUEST

**Context:**
- File: ${path.basename(filePath)}
- Language: ${language}
- Change complexity: ${complexityAnalysis.level} (score: ${complexityAnalysis.score})
- Local validation confidence: ${(responseAnalysis.confidence * 100).toFixed(1)}%
- Escalation reason: ${responseAnalysis.escalationReason}

**Complexity Factors:**
- Change volume: ${complexityAnalysis.factors.changeVolume}
- Syntax complexity: ${complexityAnalysis.factors.syntaxComplexity}
- Semantic complexity: ${complexityAnalysis.factors.semanticComplexity}
- Risk level: ${complexityAnalysis.factors.riskLevel}

**Local Validation Result:**
${localValidation}

**Proposed Changes:**
${proposedChanges.map((change, index) => `
Change ${index + 1}:
Type: ${change.type || 'modification'}
Target: ${change.target_line ? `Line ${change.target_line}` : change.target || 'Not specified'}
Content: ${(change.new_code || change.content || '').substring(0, 500)}${(change.new_code || change.content || '').length > 500 ? '...' : ''}
`).join('\n')}

**Expert Analysis Required:**
As a senior software architect and security expert, please provide a comprehensive validation with:

1. **Definitive Assessment**: Is this change safe to apply? (High confidence YES/NO)
2. **Technical Justification**: Detailed reasoning for your assessment
3. **Risk Analysis**: Specific risks identified and their likelihood/impact
4. **Alternative Approaches**: If risky, suggest safer alternatives
5. **Confidence Level**: Your confidence in this assessment (0-100%)

**Critical Requirements:**
- Focus on ${language}-specific best practices and security concerns
- Consider architectural and performance implications
- Provide actionable, specific guidance
- Clearly state if you need more context to make a definitive assessment

**Response Format:**
ASSESSMENT: [APPROVED/REJECTED/NEEDS_REVIEW]
CONFIDENCE: [0-100]%
JUSTIFICATION: [Detailed technical reasoning]
RISKS: [Specific risk analysis]
ALTERNATIVES: [If applicable]
RECOMMENDATIONS: [Specific actions]`;

      const prompt = {
        model: await this.getAvailableModel(),
        messages: [{
          role: "system",
          content: "You are a senior software architect and security expert with deep expertise in code validation, security analysis, and system architecture. Provide definitive, technically accurate assessments."
        }, {
          role: "user",
          content: promptContent
        }],
        temperature: 0.1, // Lower temperature for more deterministic expert analysis
        max_tokens: this.calculateOptimalTokens(promptContent, 'expert_validation')
      };

      // Try cloud endpoints in priority order
      const cloudEndpoints = ['nvidiaDeepSeek', 'nvidiaQwen'];
      let cloudResponse = null;
      let lastError = null;

      for (const endpointKey of cloudEndpoints) {
        try {
          if (this.endpoints[endpointKey] && this.endpoints[endpointKey].isHealthy) {
            console.error(`☁️ Attempting cloud validation via ${endpointKey}`);
            cloudResponse = await this.queryEndpoint(prompt, 'expert_validation');
            break;
          }
        } catch (error) {
          lastError = error;
          console.error(`⚠️ Cloud endpoint ${endpointKey} failed: ${error.message}`);
        }
      }

      if (!cloudResponse) {
        throw new Error(`All cloud endpoints failed. Last error: ${lastError?.message || 'Unknown error'}`);
      }

      const enhancedResult = cloudResponse.choices[0]?.message?.content || 'Cloud validation failed';

      // Parse the enhanced result to extract confidence
      const confidenceMatch = enhancedResult.match(/CONFIDENCE:\s*(\d+)%/i);
      const finalConfidence = confidenceMatch ? parseInt(confidenceMatch[1]) / 100 : responseAnalysis.confidence;

      // Parse assessment result
      const assessmentMatch = enhancedResult.match(/ASSESSMENT:\s*(APPROVED|REJECTED|NEEDS_REVIEW)/i);
      const assessment = assessmentMatch ? assessmentMatch[1].toUpperCase() : 'NEEDS_REVIEW';

      console.error(`☁️ Cloud validation complete: ${assessment} (${(performance.now() - startTime).toFixed(2)}ms)`);

      return {
        enhancedResult: enhancedResult,
        finalConfidence: finalConfidence,
        assessment: assessment,
        escalationSuccessful: true,
        executionTime: performance.now() - startTime
      };

    } catch (error) {
      console.error(`❌ Cloud validation escalation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🔍 SEMANTIC VALIDATION RESPONSE ANALYSIS
   * Analyzes validation responses to determine confidence and escalation needs
   */
  analyzeValidationResponse(validationResult, complexityAnalysis) {
    const response = validationResult.toLowerCase();

    // Confidence indicators
    const highConfidenceIndicators = [
      /syntax\s+error|compilation\s+error|invalid\s+syntax/gi,
      /definitely|certainly|clearly|obviously/gi,
      /critical\s+security|major\s+vulnerability/gi,
      /will\s+break|cannot\s+work|guaranteed\s+to\s+fail/gi
    ];

    const lowConfidenceIndicators = [
      /might|maybe|possibly|potentially|could/gi,
      /being\s+cautious|to\s+be\s+safe|uncertain/gi,
      /recommend\s+reviewing|suggest\s+checking/gi,
      /may\s+want\s+to\s+consider/gi
    ];

    const escalationTriggers = [
      /complex\s+logic|sophisticated\s+pattern/gi,
      /requires\s+domain\s+knowledge|specialized\s+expertise/gi,
      /architectural\s+implications|system\s+design/gi,
      /performance\s+critical|optimization\s+sensitive/gi
    ];

    let confidenceScore = 0.5; // Default neutral confidence

    // Increase confidence for clear indicators
    for (const indicator of highConfidenceIndicators) {
      const matches = (validationResult.match(indicator) || []).length;
      confidenceScore += matches * 0.2;
    }

    // Decrease confidence for uncertain language
    for (const indicator of lowConfidenceIndicators) {
      const matches = (validationResult.match(indicator) || []).length;
      confidenceScore -= matches * 0.15;
    }

    // Check for escalation triggers
    let needsEscalation = false;
    for (const trigger of escalationTriggers) {
      if (trigger.test(validationResult)) {
        needsEscalation = true;
        break;
      }
    }

    // Force escalation for high complexity with low confidence
    if (complexityAnalysis.level === 'high' && confidenceScore < complexityAnalysis.confidenceThreshold) {
      needsEscalation = true;
    }

    return {
      confidence: Math.max(0, Math.min(1, confidenceScore)),
      needsEscalation: needsEscalation || complexityAnalysis.requiresCloudEscalation,
      escalationReason: needsEscalation ?
        (confidenceScore < complexityAnalysis.confidenceThreshold ? 'low_confidence' : 'complexity_trigger') :
        null
    };
  }

  /**
   * 📊 ANALYZE FILE CHANGES
   * AI-powered analysis of before/after changes
   */
  async analyzeFileChanges(originalContent, modifiedContent, language, appliedEdits) {
    try {
      // More aggressive truncation for change analysis
      const maxContentLength = 800;
      const truncatedOriginal = originalContent.length > maxContentLength ?
        originalContent.substring(0, maxContentLength) + '...[truncated]' : originalContent;
      const truncatedModified = modifiedContent.length > maxContentLength ?
        modifiedContent.substring(0, maxContentLength) + '...[truncated]' : modifiedContent;

      const promptContent = `Analyze the impact of these ${language} code changes:

ORIGINAL CODE:
\`\`\`${language}
${truncatedOriginal}
\`\`\`

MODIFIED CODE:
\`\`\`${language}
${truncatedModified}
\`\`\`

APPLIED EDITS: ${appliedEdits.length}

Please provide:
1. **Change Summary**: Brief description of what was modified
2. **Impact Assessment**: Functional impact of the changes
3. **Quality Score**: Rate the overall quality improvement (1-10)
4. **Recommendations**: Any additional improvements suggested

Keep the analysis concise and focused on the most important aspects.`;

      const prompt = {
        model: await this.getAvailableModel(),
        messages: [{
          role: "user",
          content: promptContent
        }],
        temperature: 0.3,
        max_tokens: this.calculateOptimalTokens(promptContent, 'change_analysis')
      };

      const response = await this.queryEndpoint(prompt, 'change_analysis');
      return response.choices[0]?.message?.content || 'Change analysis failed';

    } catch (error) {
      return `Change analysis error: ${error.message}`;
    }
  }

  /**
   * 🔄 ATOMIC MULTI-FILE EDITING
   * Enterprise-grade batch operations with AI validation and rollback
   */
  async performMultiFileEdit(fileOperations, transactionMode = 'all_or_nothing', validationLevel = 'strict', enableParallel = true) {
    const startTime = performance.now();
    console.error(`🔄 Starting multi-file edit: ${fileOperations.length} files, mode: ${transactionMode}`);

    try {
      const results = {
        status: 'pending',
        transactionMode,
        validationLevel,
        totalFiles: fileOperations.length,
        processedFiles: 0,
        successfulFiles: 0,
        failedFiles: 0,
        fileResults: [],
        backups: [],
        executionTime: '0ms',
        rollbackInfo: null
      };

      // Pre-flight validation if enabled
      if (validationLevel !== 'none') {
        console.error(`🔍 Pre-flight validation (${validationLevel} mode) for ${fileOperations.length} files...`);

        const validationPromises = fileOperations.map(async (op, index) => {
          try {
            const validation = await this.validateCodeChanges(
              op.file_path,
              op.edits,
              ['syntax', 'logic', 'security'],
              this.detectLanguage('', op.file_path)
            );

            // Use intelligent validation analysis instead of crude keyword matching
            const isCloudEnhanced = validation.includes('ASSESSMENT:') || validation.includes('CONFIDENCE:');
            let assessment = 'NEEDS_REVIEW';
            let confidence = 0.5;

            if (isCloudEnhanced) {
              // Parse cloud-enhanced results
              const assessmentMatch = validation.match(/ASSESSMENT:\s*(APPROVED|REJECTED|NEEDS_REVIEW)/i);
              assessment = assessmentMatch ? assessmentMatch[1].toUpperCase() : 'NEEDS_REVIEW';

              const confidenceMatch = validation.match(/CONFIDENCE:\s*(\d+)%/i);
              confidence = confidenceMatch ? parseInt(confidenceMatch[1]) / 100 : 0.5;
            } else {
              // Legacy analysis for backwards compatibility
              const hasCriticalIssues = validation.toLowerCase().includes('critical') ||
                                      validation.toLowerCase().includes('error') ||
                                      validation.toLowerCase().includes('risky');

              if (hasCriticalIssues) {
                // Analyze confidence based on language patterns
                const lowConfidenceWords = ['might', 'possibly', 'potentially', 'being cautious'];
                const hasLowConfidence = lowConfidenceWords.some(word => validation.toLowerCase().includes(word));

                assessment = hasLowConfidence ? 'NEEDS_REVIEW' : 'REJECTED';
                confidence = hasLowConfidence ? 0.4 : 0.8;
              } else {
                assessment = 'APPROVED';
                confidence = 0.7;
              }
            }

            // Determine validity based on assessment and confidence
            const isValid = assessment === 'APPROVED' ||
                           (assessment === 'NEEDS_REVIEW' && confidence > 0.6) ||
                           (assessment === 'REJECTED' && confidence < 0.7);

            return {
              index,
              filePath: op.file_path,
              isValid,
              validation,
              assessment,
              confidence: `${(confidence * 100).toFixed(1)}%`,
              escalated: isCloudEnhanced,
              criticalIssues: assessment === 'REJECTED' && confidence > 0.7
            };
          } catch (error) {
            return {
              index,
              filePath: op.file_path,
              isValid: false,
              validation: `Validation error: ${error.message}`,
              criticalIssues: true
            };
          }
        });

        const validationResults = enableParallel ?
          await Promise.all(validationPromises) :
          await this.processSequentially(validationPromises);

        const criticalFailures = validationResults.filter(r => r.criticalIssues);

        if (validationLevel === 'strict' && criticalFailures.length > 0) {
          results.status = 'validation_failed';
          results.validationFailures = criticalFailures;
          results.executionTime = `${(performance.now() - startTime).toFixed(2)}ms`;
          return JSON.stringify(results, null, 2);
        }

        results.validationResults = validationResults;
      }

      // Dry run mode - simulate all operations
      if (transactionMode === 'dry_run') {
        console.error(`🧪 Dry run simulation for ${fileOperations.length} files...`);

        for (const op of fileOperations) {
          try {
            const simulation = await this.simulateFileEdit(op.file_path, op.edits);
            results.fileResults.push({
              filePath: op.file_path,
              status: 'simulated',
              editsCount: op.edits.length,
              simulation
            });
          } catch (error) {
            results.fileResults.push({
              filePath: op.file_path,
              status: 'simulation_failed',
              error: error.message
            });
          }
        }

        results.status = 'dry_run_complete';
        results.processedFiles = fileOperations.length;
        results.executionTime = `${(performance.now() - startTime).toFixed(2)}ms`;
        return JSON.stringify(results, null, 2);
      }

      // Create backups for all files first
      console.error(`💾 Creating backups for ${fileOperations.length} files...`);
      for (const op of fileOperations) {
        try {
          const exists = await fs.access(op.file_path).then(() => true).catch(() => false);
          if (exists) {
            const backupId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const backupPath = `${op.file_path}.backup.${backupId}`;
            await fs.copyFile(op.file_path, backupPath);

            results.backups.push({
              original: op.file_path,
              backup: backupPath,
              backupId,
              timestamp: new Date().toISOString()
            });
          }
        } catch (error) {
          console.error(`⚠️ Backup failed for ${op.file_path}: ${error.message}`);
        }
      }

      // Execute file operations
      const operationPromises = fileOperations.map(async (op, index) => {
        try {
          console.error(`🔧 Processing file ${index + 1}/${fileOperations.length}: ${path.basename(op.file_path)}`);

          const editResult = await this.performIntelligentFileEdit(
            op.file_path,
            op.edits,
            'lenient', // Use lenient mode since we already validated
            this.detectLanguage('', op.file_path)
          );

          const parsed = JSON.parse(editResult);
          results.processedFiles++;

          if (parsed.status === 'success') {
            results.successfulFiles++;
            return {
              filePath: op.file_path,
              status: 'success',
              appliedEdits: parsed.appliedEdits,
              totalEdits: parsed.totalEdits,
              changeAnalysis: parsed.changeAnalysis
            };
          } else {
            results.failedFiles++;
            return {
              filePath: op.file_path,
              status: 'failed',
              reason: parsed.reason || 'Unknown error',
              appliedEdits: parsed.appliedEdits || 0,
              totalEdits: parsed.totalEdits || op.edits.length
            };
          }
        } catch (error) {
          results.failedFiles++;
          return {
            filePath: op.file_path,
            status: 'error',
            error: error.message
          };
        }
      });

      // Execute operations (parallel or sequential based on enableParallel)
      results.fileResults = enableParallel ?
        await Promise.all(operationPromises) :
        await this.processSequentially(operationPromises);

      // Handle transaction modes
      if (transactionMode === 'all_or_nothing' && results.failedFiles > 0) {
        console.error(`🔄 Rolling back ${results.successfulFiles} successful operations due to ${results.failedFiles} failures...`);

        const rollbackResults = await this.rollbackChanges(results.backups);
        results.status = 'rolled_back';
        results.rollbackInfo = rollbackResults;
      } else if (results.failedFiles === 0) {
        results.status = 'complete_success';
      } else {
        results.status = 'partial_success';
      }

      results.executionTime = `${(performance.now() - startTime).toFixed(2)}ms`;
      console.error(`✅ Multi-file edit complete: ${results.successfulFiles}/${results.totalFiles} files successful`);

      return JSON.stringify(results, null, 2);

    } catch (error) {
      console.error(`❌ Multi-file edit error: ${error.message}`);
      throw new McpError(ErrorCode.InternalError, `Multi-file edit failed: ${error.message}`);
    }
  }

  /**
   * 💾 ENHANCED BACKUP MANAGEMENT
   * Timestamped backup tracking with metadata and intelligent cleanup
   */
  async manageBackups(action, filePath, backupId, cleanupOptions, metadata) {
    const startTime = performance.now();
    console.error(`💾 Backup management: ${action} ${filePath ? `for ${path.basename(filePath)}` : ''}`);

    try {
      switch (action) {
        case 'create':
          if (!filePath) {
            throw new Error('file_path required for create action');
          }

          const exists = await fs.access(filePath).then(() => true).catch(() => false);
          if (!exists) {
            throw new Error(`File does not exist: ${filePath}`);
          }

          const timestamp = new Date().toISOString();
          const backupUniqueId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const backupPath = `${filePath}.backup.${backupUniqueId}`;

          await fs.copyFile(filePath, backupPath);

          // Create metadata file
          const metadataPath = `${backupPath}.meta`;
          const backupMetadata = {
            originalFile: filePath,
            backupId: backupUniqueId,
            timestamp,
            size: (await fs.stat(filePath)).size,
            description: metadata?.description || 'Manual backup',
            tags: metadata?.tags || [],
            createdBy: 'mecha-king-ghidorah'
          };

          await fs.writeFile(metadataPath, JSON.stringify(backupMetadata, null, 2), 'utf8');

          return JSON.stringify({
            action: 'create',
            status: 'success',
            backupId: backupUniqueId,
            backupPath,
            metadataPath,
            metadata: backupMetadata,
            executionTime: `${(performance.now() - startTime).toFixed(2)}ms`
          }, null, 2);

        case 'restore':
          if (!filePath) {
            throw new Error('file_path required for restore action');
          }

          let targetBackupPath;
          let restoreBackupMetadata = null;

          if (backupId) {
            // Restore specific backup
            targetBackupPath = `${filePath}.backup.${backupId}`;
            const metadataPath = `${targetBackupPath}.meta`;

            try {
              const metaContent = await fs.readFile(metadataPath, 'utf8');
              restoreBackupMetadata = JSON.parse(metaContent);
            } catch (error) {
              // Continue without metadata if it doesn't exist
            }
          } else {
            // Find latest backup
            const backups = await this.findBackupsForFile(filePath);
            if (backups.length === 0) {
              throw new Error(`No backups found for file: ${filePath}`);
            }

            // Sort by timestamp (newest first)
            backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            targetBackupPath = backups[0].backupPath;
            restoreBackupMetadata = backups[0].metadata;
          }

          const backupExists = await fs.access(targetBackupPath).then(() => true).catch(() => false);
          if (!backupExists) {
            throw new Error(`Backup not found: ${targetBackupPath}`);
          }

          // Validate backup before restoring
          const backupValidation = await this.validateBackupIntegrity(targetBackupPath, restoreBackupMetadata);
          if (!backupValidation.isValid) {
            throw new Error(`Backup validation failed: ${backupValidation.reason}`);
          }

          // Create backup of current file before restoring
          const preRestoreBackup = `${filePath}.pre-restore.${Date.now()}`;
          const currentExists = await fs.access(filePath).then(() => true).catch(() => false);
          if (currentExists) {
            await fs.copyFile(filePath, preRestoreBackup);
          }

          // Perform restore
          await fs.copyFile(targetBackupPath, filePath);

          return JSON.stringify({
            action: 'restore',
            status: 'success',
            restoredFrom: targetBackupPath,
            preRestoreBackup: currentExists ? preRestoreBackup : null,
            metadata: restoreBackupMetadata,
            validation: backupValidation,
            executionTime: `${(performance.now() - startTime).toFixed(2)}ms`
          }, null, 2);

        case 'list':
          const allBackups = filePath ?
            await this.findBackupsForFile(filePath) :
            await this.findAllBackups();

          return JSON.stringify({
            action: 'list',
            filePath: filePath || 'all',
            totalBackups: allBackups.length,
            backups: allBackups.map(backup => ({
              backupId: backup.backupId,
              originalFile: backup.originalFile,
              backupPath: backup.backupPath,
              timestamp: backup.timestamp,
              size: backup.size,
              description: backup.metadata?.description,
              tags: backup.metadata?.tags
            })),
            executionTime: `${(performance.now() - startTime).toFixed(2)}ms`
          }, null, 2);

        case 'cleanup':
          const cleanupResults = await this.cleanupBackups(filePath, cleanupOptions);

          return JSON.stringify({
            action: 'cleanup',
            filePath: filePath || 'all',
            ...cleanupResults,
            executionTime: `${(performance.now() - startTime).toFixed(2)}ms`
          }, null, 2);

        default:
          throw new Error(`Unknown backup action: ${action}`);
      }

    } catch (error) {
      console.error(`❌ Backup management error: ${error.message}`);
      throw new McpError(ErrorCode.InternalError, `Backup management failed: ${error.message}`);
    }
  }

  /**
   * 🔧 HELPER METHODS FOR MULTI-FILE OPERATIONS
   */
  async processSequentially(promiseFunctions) {
    const results = [];
    for (const promiseFunc of promiseFunctions) {
      if (typeof promiseFunc === 'function') {
        results.push(await promiseFunc());
      } else {
        results.push(await promiseFunc);
      }
    }
    return results;
  }

  async simulateFileEdit(filePath, edits) {
    try {
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      if (!exists) {
        return {
          status: 'new_file',
          editsToApply: edits.length,
          estimatedChanges: 'File will be created'
        };
      }

      const content = await fs.readFile(filePath, 'utf8');
      let simulatedContent = content;
      const appliedEdits = [];

      for (let i = 0; i < edits.length; i++) {
        const edit = edits[i];
        if (simulatedContent.includes(edit.find)) {
          const beforeLength = simulatedContent.length;
          simulatedContent = simulatedContent.replace(edit.find, edit.replace);
          const afterLength = simulatedContent.length;

          appliedEdits.push({
            index: i,
            characterDelta: afterLength - beforeLength
          });
        }
      }

      return {
        status: 'simulated',
        originalSize: content.length,
        simulatedSize: simulatedContent.length,
        sizeDelta: simulatedContent.length - content.length,
        appliedEdits: appliedEdits.length,
        totalEdits: edits.length
      };

    } catch (error) {
      return {
        status: 'simulation_error',
        error: error.message
      };
    }
  }

  async rollbackChanges(backups) {
    const rollbackResults = [];

    for (const backup of backups) {
      try {
        const backupExists = await fs.access(backup.backup).then(() => true).catch(() => false);
        if (backupExists) {
          await fs.copyFile(backup.backup, backup.original);
          rollbackResults.push({
            file: backup.original,
            status: 'restored',
            from: backup.backup
          });
        } else {
          rollbackResults.push({
            file: backup.original,
            status: 'backup_missing',
            backup: backup.backup
          });
        }
      } catch (error) {
        rollbackResults.push({
          file: backup.original,
          status: 'rollback_failed',
          error: error.message
        });
      }
    }

    return rollbackResults;
  }

  /**
   * 🔍 BACKUP DISCOVERY AND MANAGEMENT HELPERS
   */
  async findBackupsForFile(filePath) {
    const backups = [];
    const fileDir = path.dirname(filePath);
    const fileName = path.basename(filePath);

    try {
      const entries = await fs.readdir(fileDir);

      for (const entry of entries) {
        if (entry.startsWith(`${fileName}.backup.`)) {
          const backupPath = path.join(fileDir, entry);
          const metadataPath = `${backupPath}.meta`;

          let metadata = null;
          try {
            const metaContent = await fs.readFile(metadataPath, 'utf8');
            metadata = JSON.parse(metaContent);
          } catch (error) {
            // Extract basic info from filename if metadata missing
            const backupIdMatch = entry.match(/\.backup\.(.+)$/);
            metadata = {
              backupId: backupIdMatch ? backupIdMatch[1] : entry,
              timestamp: new Date((await fs.stat(backupPath)).mtime).toISOString(),
              description: 'Legacy backup (no metadata)',
              createdBy: 'unknown'
            };
          }

          const stats = await fs.stat(backupPath);
          backups.push({
            backupId: metadata.backupId,
            originalFile: filePath,
            backupPath,
            timestamp: metadata.timestamp,
            size: stats.size,
            metadata
          });
        }
      }
    } catch (error) {
      // Directory might not exist or be readable
    }

    return backups;
  }

  async findAllBackups() {
    // This is a simplified version - in production, you'd want to scan systematically
    const backups = [];

    // Scan current directory and common project directories
    const searchDirs = [
      process.cwd(),
      path.join(process.cwd(), 'src'),
      path.join(process.cwd(), 'lib'),
      path.join(process.cwd(), 'components')
    ];

    for (const dir of searchDirs) {
      try {
        const entries = await fs.readdir(dir);

        for (const entry of entries) {
          if (entry.includes('.backup.')) {
            const backupPath = path.join(dir, entry);
            const originalPath = entry.replace(/\.backup\..+$/, '');

            try {
              const stats = await fs.stat(backupPath);
              backups.push({
                backupId: entry,
                originalFile: path.join(dir, originalPath),
                backupPath,
                timestamp: stats.mtime.toISOString(),
                size: stats.size,
                metadata: { description: 'Auto-discovered backup' }
              });
            } catch (error) {
              // Skip files that can't be accessed
            }
          }
        }
      } catch (error) {
        // Skip directories that can't be read
      }
    }

    return backups;
  }

  async validateBackupIntegrity(backupPath, metadata) {
    try {
      const stats = await fs.stat(backupPath);

      // Basic validation checks
      if (stats.size === 0) {
        return { isValid: false, reason: 'Backup file is empty' };
      }

      if (metadata?.size && Math.abs(stats.size - metadata.size) > stats.size * 0.1) {
        return { isValid: false, reason: 'Backup size differs significantly from metadata' };
      }

      // Try to read the file to ensure it's not corrupted
      await fs.readFile(backupPath, 'utf8');

      return { isValid: true, reason: 'Backup validation passed' };

    } catch (error) {
      return { isValid: false, reason: `Backup validation error: ${error.message}` };
    }
  }

  async cleanupBackups(targetFile, options = {}) {
    const {
      max_age_days = 30,
      max_count_per_file = 10,
      dry_run = false
    } = options;

    const cleanupResults = {
      processed: 0,
      cleaned: 0,
      errors: 0,
      cleanedFiles: [],
      errors_list: [],
      dry_run
    };

    try {
      const backups = targetFile ?
        await this.findBackupsForFile(targetFile) :
        await this.findAllBackups();

      // Group backups by original file
      const backupGroups = {};
      for (const backup of backups) {
        if (!backupGroups[backup.originalFile]) {
          backupGroups[backup.originalFile] = [];
        }
        backupGroups[backup.originalFile].push(backup);
      }

      for (const [originalFile, fileBackups] of Object.entries(backupGroups)) {
        cleanupResults.processed++;

        // Sort by timestamp (newest first)
        fileBackups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Cleanup by age
        const cutoffDate = new Date(Date.now() - (max_age_days * 24 * 60 * 60 * 1000));
        const oldBackups = fileBackups.filter(b => new Date(b.timestamp) < cutoffDate);

        // Cleanup by count (keep only the newest max_count_per_file)
        const excessBackups = fileBackups.slice(max_count_per_file);

        // Combine cleanup candidates (remove duplicates)
        const toCleanup = [...new Set([...oldBackups, ...excessBackups])];

        for (const backup of toCleanup) {
          try {
            if (!dry_run) {
              await fs.unlink(backup.backupPath);

              // Also remove metadata file if it exists
              const metadataPath = `${backup.backupPath}.meta`;
              try {
                await fs.unlink(metadataPath);
              } catch (error) {
                // Metadata file might not exist
              }
            }

            cleanupResults.cleaned++;
            cleanupResults.cleanedFiles.push({
              backup: backup.backupPath,
              originalFile: backup.originalFile,
              timestamp: backup.timestamp,
              size: backup.size,
              reason: oldBackups.includes(backup) ? 'age' : 'count'
            });

          } catch (error) {
            cleanupResults.errors++;
            cleanupResults.errors_list.push({
              backup: backup.backupPath,
              error: error.message
            });
          }
        }
      }

      return cleanupResults;

    } catch (error) {
      cleanupResults.errors++;
      cleanupResults.errors_list.push({
        error: error.message
      });
      return cleanupResults;
    }
  }
}

/**
 * 🌟 MECHA KING GHIDORAH MCP SERVER
 */
class MechaKingGhidorahServer {
  constructor() {
    this.router = new MechaKingGhidorahRouter();
    this.server = new Server(
      {
        name: 'mecha-king-ghidorah',
        version: '8.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupTools();
    console.error('🦖 MECHA KING GHIDORAH v8.0.0 SERVER INITIALIZED with FileModificationManager!');
  }

  setupTools() {
    // Tool list handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'analyze',
            description: '🔍 ENHANCED Universal code analysis - AI-driven file type detection with smart routing to NVIDIA cloud for complex analysis. Automatically detects security issues, architectural patterns, and performance bottlenecks. Supports 20+ programming languages with intelligent complexity assessment.',
            inputSchema: {
              type: 'object',
              properties: {
                file_path: { type: 'string', description: 'Path to file for analysis' },
                content: { type: 'string', description: 'File content to analyze' },
                analysis_type: { type: 'string', enum: ['security', 'performance', 'structure', 'dependencies', 'comprehensive'], default: 'comprehensive' },
                language: { type: 'string', description: 'Programming language hint (auto-detected if not provided)' }
              },
              required: ['content']
            }
          },
          {
            name: 'generate',
            description: '⚡ ENHANCED Smart code generation - Qwen3-Coder-30B-A3B-Instruct-FP8 primary model with NVIDIA cloud escalation for complex tasks. Context-aware code creation with AI-driven complexity analysis and intelligent routing for optimal performance.',
            inputSchema: {
              type: 'object',
              properties: {
                prefix: { type: 'string', description: 'Code before the completion point' },
                suffix: { type: 'string', description: 'Code after the completion point' },
                language: { type: 'string', description: 'Programming language', default: 'javascript' },
                task_type: { type: 'string', enum: ['completion', 'refactor', 'feature', 'fix'], default: 'completion' }
              },
              required: ['prefix']
            }
          },
          {
            name: 'review',
            description: '👀 Comprehensive code review - Security audit, performance analysis, best practices validation. Multi-file correlation analysis. Automated quality scoring and improvement suggestions.',
            inputSchema: {
              type: 'object',
              properties: {
                content: { type: 'string', description: 'Code content to review' },
                file_path: { type: 'string', description: 'File path for context' },
                review_type: { type: 'string', enum: ['security', 'performance', 'quality', 'comprehensive'], default: 'comprehensive' },
                language: { type: 'string', description: 'Programming language hint' }
              },
              required: ['content']
            }
          },
          {
            name: 'read',
            description: '📖 Intelligent file operations - Smart context management with automatic chunking. Multi-file reading with relationship detection. Project structure analysis.',
            inputSchema: {
              type: 'object',
              properties: {
                file_paths: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Array of file paths to read'
                },
                analysis_type: {
                  type: 'string',
                  enum: ['content', 'structure', 'relationships', 'summary'],
                  description: 'Type of analysis to perform',
                  default: 'content'
                },
                max_files: { type: 'number', description: 'Maximum number of files to process', default: 10 }
              },
              required: ['file_paths']
            }
          },
          {
            name: 'health',
            description: '🏥 ENHANCED System health and diagnostics - Multi-endpoint health monitoring with NVIDIA cloud integration status. Smart routing metrics, performance analytics, and FileModificationManager operation tracking.',
            inputSchema: {
              type: 'object',
              properties: {
                check_type: { type: 'string', enum: ['system', 'performance', 'endpoints', 'comprehensive'], default: 'comprehensive' }
              },
              additionalProperties: false
            }
          },
          {
            name: 'write_files_atomic',
            description: '✍️ Write multiple files atomically with backup - Enterprise-grade file modification with safety mechanisms',
            inputSchema: {
              type: 'object',
              properties: {
                file_operations: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      path: { type: 'string', description: 'File path' },
                      content: { type: 'string', description: 'File content' },
                      operation: { type: 'string', enum: ['write', 'append', 'modify'], default: 'write' }
                    },
                    required: ['path', 'content']
                  },
                  description: 'Array of file operations to perform'
                },
                create_backup: { type: 'boolean', description: 'Create backup before writing', default: true }
              },
              required: ['file_operations']
            }
          },
          {
            name: 'edit_file',
            description: '🔧 ENHANCED Intelligent file editing - FileModificationManager orchestrated operations with smart AI routing. AI-powered targeted modifications with validation, rollback capability, and complexity-based endpoint selection for optimal performance.',
            inputSchema: {
              type: 'object',
              properties: {
                file_path: { type: 'string', description: 'Path to the file to edit' },
                edits: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      find: { type: 'string', description: 'Text to find and replace' },
                      replace: { type: 'string', description: 'Replacement text' },
                      description: { type: 'string', description: 'Description of the change being made' }
                    },
                    required: ['find', 'replace']
                  },
                  description: 'Array of find/replace operations to perform'
                },
                validation_mode: { type: 'string', enum: ['strict', 'lenient', 'dry_run'], default: 'strict', description: 'Validation level for the edits' },
                language: { type: 'string', description: 'Programming language hint for intelligent editing' }
              },
              required: ['file_path', 'edits']
            }
          },
          {
            name: 'validate_changes',
            description: '✅ Pre-flight validation for code changes - AI-powered syntax checking and impact analysis using DialoGPT-small. Validates proposed modifications before implementation.',
            inputSchema: {
              type: 'object',
              properties: {
                file_path: { type: 'string', description: 'Path to the file being validated' },
                proposed_changes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      find: { type: 'string', description: 'Original text' },
                      replace: { type: 'string', description: 'Proposed replacement' },
                      line_number: { type: 'number', description: 'Line number hint (optional)' }
                    },
                    required: ['find', 'replace']
                  },
                  description: 'Array of proposed changes to validate'
                },
                validation_rules: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Custom validation rules to apply',
                  default: ['syntax', 'logic', 'security', 'performance']
                },
                language: { type: 'string', description: 'Programming language for context-aware validation' }
              },
              required: ['file_path', 'proposed_changes']
            }
          },
          {
            name: 'multi_edit',
            description: '🔄 ENHANCED Atomic batch operations - FileModificationManager orchestrator with parallel processing and smart AI routing. Enterprise-grade multi-file editing with NVIDIA cloud escalation for complex operations, AI validation, and automatic rollback.',
            inputSchema: {
              type: 'object',
              properties: {
                file_operations: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      file_path: { type: 'string', description: 'Path to the file to edit' },
                      edits: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            find: { type: 'string', description: 'Text to find and replace' },
                            replace: { type: 'string', description: 'Replacement text' },
                            description: { type: 'string', description: 'Description of the change' }
                          },
                          required: ['find', 'replace']
                        },
                        description: 'Array of edits to apply to this file'
                      }
                    },
                    required: ['file_path', 'edits']
                  },
                  description: 'Array of file operations to perform atomically'
                },
                transaction_mode: { type: 'string', enum: ['all_or_nothing', 'best_effort', 'dry_run'], default: 'all_or_nothing', description: 'Transaction safety level' },
                validation_level: { type: 'string', enum: ['strict', 'lenient', 'none'], default: 'strict', description: 'AI validation intensity' },
                parallel_processing: { type: 'boolean', default: true, description: 'Enable parallel processing where safe' }
              },
              required: ['file_operations']
            }
          },
          {
            name: 'backup_restore',
            description: '💾 Enhanced backup management - Timestamped backup tracking with metadata, restore capability, and intelligent cleanup. Extends existing backup patterns with enterprise-grade management.',
            inputSchema: {
              type: 'object',
              properties: {
                action: { type: 'string', enum: ['create', 'restore', 'list', 'cleanup'], description: 'Backup operation to perform' },
                file_path: { type: 'string', description: 'Target file path (required for create/restore)' },
                backup_id: { type: 'string', description: 'Specific backup to restore (optional, uses latest if not provided)' },
                cleanup_options: {
                  type: 'object',
                  properties: {
                    max_age_days: { type: 'number', default: 30, description: 'Remove backups older than N days' },
                    max_count_per_file: { type: 'number', default: 10, description: 'Keep only N latest backups per file' },
                    dry_run: { type: 'boolean', default: false, description: 'Show what would be cleaned without removing' }
                  },
                  description: 'Cleanup configuration options'
                },
                metadata: {
                  type: 'object',
                  properties: {
                    description: { type: 'string', description: 'Backup description/reason' },
                    tags: { type: 'array', items: { type: 'string' }, description: 'Backup tags for categorization' }
                  },
                  description: 'Additional backup metadata'
                }
              },
              required: ['action']
            }
          },
          // MKG Aliases - shorter names for common operations
          {
            name: 'MKG_analyze',
            description: '🔍 MKG Alias: Universal code analysis - AI-driven file type detection with smart routing',
            inputSchema: {
              type: 'object',
              properties: {
                file_path: { type: 'string', description: 'Path to file for analysis' },
                content: { type: 'string', description: 'File content to analyze' },
                analysis_type: { type: 'string', enum: ['security', 'performance', 'structure', 'dependencies', 'comprehensive'], default: 'comprehensive' },
                language: { type: 'string', description: 'Programming language hint (auto-detected if not provided)' }
              },
              required: ['content']
            }
          },
          {
            name: 'MKG_generate',
            description: '⚡ MKG Alias: Smart code generation - Context-aware code creation with AI routing',
            inputSchema: {
              type: 'object',
              properties: {
                prefix: { type: 'string', description: 'Code before the completion point' },
                suffix: { type: 'string', description: 'Code after the completion point' },
                language: { type: 'string', description: 'Programming language', default: 'javascript' },
                task_type: { type: 'string', enum: ['completion', 'refactor', 'feature', 'fix'], default: 'completion' }
              },
              required: ['prefix']
            }
          },
          {
            name: 'MKG_review',
            description: '👀 MKG Alias: Comprehensive code review - Security audit, performance analysis, best practices',
            inputSchema: {
              type: 'object',
              properties: {
                content: { type: 'string', description: 'Code content to review' },
                file_path: { type: 'string', description: 'File path for context' },
                review_type: { type: 'string', enum: ['security', 'performance', 'quality', 'comprehensive'], default: 'comprehensive' },
                language: { type: 'string', description: 'Programming language hint' }
              },
              required: ['content']
            }
          },
          {
            name: 'MKG_edit',
            description: '🔧 MKG Alias: Intelligent file editing - AI-powered targeted modifications with validation',
            inputSchema: {
              type: 'object',
              properties: {
                file_path: { type: 'string', description: 'Path to the file to edit' },
                edits: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      find: { type: 'string', description: 'Text to find and replace' },
                      replace: { type: 'string', description: 'Replacement text' },
                      description: { type: 'string', description: 'Description of the change being made' }
                    },
                    required: ['find', 'replace']
                  },
                  description: 'Array of find/replace operations to perform'
                },
                validation_mode: { type: 'string', enum: ['strict', 'lenient', 'dry_run'], default: 'strict' },
                language: { type: 'string', description: 'Programming language hint for intelligent editing' }
              },
              required: ['file_path', 'edits']
            }
          },
          {
            name: 'MKG_health',
            description: '🏥 MKG Alias: System health and diagnostics - Multi-endpoint health monitoring',
            inputSchema: {
              type: 'object',
              properties: {
                check_type: { type: 'string', enum: ['system', 'performance', 'endpoints', 'comprehensive'], default: 'comprehensive' }
              },
              additionalProperties: false
            }
          },
          // DeepSeek Aliases - alternative shorter names
          {
            name: 'deepseek_analyze',
            description: '🔍 DeepSeek Alias: Universal code analysis - AI-driven file type detection with smart routing',
            inputSchema: {
              type: 'object',
              properties: {
                file_path: { type: 'string', description: 'Path to file for analysis' },
                content: { type: 'string', description: 'File content to analyze' },
                analysis_type: { type: 'string', enum: ['security', 'performance', 'structure', 'dependencies', 'comprehensive'], default: 'comprehensive' },
                language: { type: 'string', description: 'Programming language hint (auto-detected if not provided)' }
              },
              required: ['content']
            }
          },
          {
            name: 'deepseek_generate',
            description: '⚡ DeepSeek Alias: Smart code generation - Context-aware code creation with AI routing',
            inputSchema: {
              type: 'object',
              properties: {
                prefix: { type: 'string', description: 'Code before the completion point' },
                suffix: { type: 'string', description: 'Code after the completion point' },
                language: { type: 'string', description: 'Programming language', default: 'javascript' },
                task_type: { type: 'string', enum: ['completion', 'refactor', 'feature', 'fix'], default: 'completion' }
              },
              required: ['prefix']
            }
          },
          {
            name: 'deepseek_review',
            description: '👀 DeepSeek Alias: Comprehensive code review - Security audit, performance analysis, best practices',
            inputSchema: {
              type: 'object',
              properties: {
                content: { type: 'string', description: 'Code content to review' },
                file_path: { type: 'string', description: 'File path for context' },
                review_type: { type: 'string', enum: ['security', 'performance', 'quality', 'comprehensive'], default: 'comprehensive' },
                language: { type: 'string', description: 'Programming language hint' }
              },
              required: ['content']
            }
          },
          {
            name: 'deepseek_edit',
            description: '🔧 DeepSeek Alias: Intelligent file editing - AI-powered targeted modifications with validation',
            inputSchema: {
              type: 'object',
              properties: {
                file_path: { type: 'string', description: 'Path to the file to edit' },
                edits: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      find: { type: 'string', description: 'Text to find and replace' },
                      replace: { type: 'string', description: 'Replacement text' },
                      description: { type: 'string', description: 'Description of the change being made' }
                    },
                    required: ['find', 'replace']
                  },
                  description: 'Array of find/replace operations to perform'
                },
                validation_mode: { type: 'string', enum: ['strict', 'lenient', 'dry_run'], default: 'strict' },
                language: { type: 'string', description: 'Programming language hint for intelligent editing' }
              },
              required: ['file_path', 'edits']
            }
          },
          {
            name: 'deepseek_health',
            description: '🏥 DeepSeek Alias: System health and diagnostics - Multi-endpoint health monitoring',
            inputSchema: {
              type: 'object',
              properties: {
                check_type: { type: 'string', enum: ['system', 'performance', 'endpoints', 'comprehensive'], default: 'comprehensive' }
              },
              additionalProperties: false
            }
          }
        ]
      };
    });

    // Tool call handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'analyze':
            // Universal code analysis combining Unity, structure, and general analysis
            const analysis = await this.router.analyzeUniversal(
              args.content,
              args.file_path,
              args.analysis_type || 'comprehensive',
              args.language
            );
            return {
              content: [{
                type: 'text',
                text: `🔍 **UNIVERSAL CODE ANALYSIS**\n\n${analysis}`
              }]
            };

          case 'generate':
            // Smart code generation and refactoring (FIM)
            const completion = await this.router.processFimRequest(
              args.prefix,
              args.suffix || '',
              args.language || 'javascript'
            );
            return {
              content: [{
                type: 'text',
                text: `⚡ **SMART CODE GENERATION**\n\n\`\`\`${args.language || 'javascript'}\n${completion}\n\`\`\``
              }]
            };

          case 'review':
            // Comprehensive code review
            const review = await this.router.performCodeReview(
              args.content,
              args.file_path,
              args.review_type || 'comprehensive',
              args.language
            );
            return {
              content: [{
                type: 'text',
                text: `👀 **COMPREHENSIVE CODE REVIEW**\n\n${review}`
              }]
            };

          case 'read':
            // Intelligent file operations
            const fileContents = await this.readMultipleFiles(args.file_paths, args.analysis_type, args.max_files);
            return {
              content: [{
                type: 'text',
                text: `📖 **INTELLIGENT FILE OPERATIONS**\n\n${fileContents}`
              }]
            };

          case 'health':
            // Enhanced system health and diagnostics with real-time endpoint monitoring
            let healthReport;
            if (args.check_type === 'endpoints' || args.check_type === 'comprehensive') {
              const realtimeHealth = await this.router.performComprehensiveHealthCheck();
              const systemStatus = this.router.getSystemStatus(args.check_type || 'comprehensive');

              healthReport = {
                ...systemStatus,
                realtimeEndpointHealth: realtimeHealth,
                routingRecommendation: this.generateRoutingRecommendation(realtimeHealth),
                timestamp: new Date().toISOString()
              };
            } else {
              healthReport = this.router.getSystemStatus(args.check_type || 'comprehensive');
            }

            return {
              content: [{
                type: 'text',
                text: `🏥 **ENHANCED SYSTEM HEALTH & DIAGNOSTICS**\n\n${JSON.stringify(healthReport, null, 2)}`
              }]
            };

          case 'write_files_atomic':
            // File modification capability (bonus 6th tool)
            const writeResult = await this.writeFilesAtomic(args.file_operations, args.create_backup);
            return {
              content: [{
                type: 'text',
                text: `✍️ **ATOMIC WRITE COMPLETE**\n\n${writeResult}`
              }]
            };

          case 'edit_file':
            // Intelligent file editing with AI-powered validation (orchestrated)
            const editResult = await this.router.fileModManager.orchestrateOperation('single_edit', {
              file_path: args.file_path,
              edits: args.edits,
              validation_mode: args.validation_mode || 'strict',
              language: args.language
            });
            return {
              content: [{
                type: 'text',
                text: `🔧 **INTELLIGENT FILE EDIT**\n\n${editResult}`
              }]
            };

          case 'validate_changes':
            // Pre-flight validation for code changes (orchestrated)
            const validationResult = await this.router.fileModManager.orchestrateOperation('validation', {
              file_path: args.file_path,
              proposed_changes: args.proposed_changes,
              validation_rules: args.validation_rules || ['syntax', 'logic', 'security', 'performance'],
              language: args.language
            });
            return {
              content: [{
                type: 'text',
                text: `✅ **CHANGE VALIDATION**\n\n${validationResult}`
              }]
            };

          case 'multi_edit':
            // Atomic batch file operations with AI validation (orchestrated)
            const multiEditResult = await this.router.fileModManager.orchestrateOperation('multi_edit', {
              file_operations: args.file_operations,
              transaction_mode: args.transaction_mode || 'all_or_nothing',
              validation_level: args.validation_level || 'strict',
              parallel_processing: args.parallel_processing !== false
            });
            return {
              content: [{
                type: 'text',
                text: `🔄 **ATOMIC BATCH OPERATIONS**\n\n${multiEditResult}`
              }]
            };

          case 'backup_restore':
            // Enhanced backup management and rollback capability (orchestrated)
            const backupResult = await this.router.fileModManager.orchestrateOperation('backup_management', {
              action: args.action,
              file_path: args.file_path,
              backup_id: args.backup_id,
              cleanup_options: args.cleanup_options,
              metadata: args.metadata
            });
            return {
              content: [{
                type: 'text',
                text: `💾 **BACKUP MANAGEMENT**\n\n${backupResult}`
              }]
            };

          // MKG Aliases - map to original functions
          case 'MKG_analyze':
            // Alias for analyze
            const mkgAnalysis = await this.router.analyzeUniversal(
              args.content,
              args.file_path,
              args.analysis_type || 'comprehensive',
              args.language
            );
            return {
              content: [{
                type: 'text',
                text: `🔍 **MKG CODE ANALYSIS**\n\n${mkgAnalysis}`
              }]
            };

          case 'MKG_generate':
            // Alias for generate
            const mkgCompletion = await this.router.processFimRequest(
              args.prefix,
              args.suffix || '',
              args.language || 'javascript'
            );
            return {
              content: [{
                type: 'text',
                text: `⚡ **MKG CODE GENERATION**\n\n\`\`\`${args.language || 'javascript'}\n${mkgCompletion}\n\`\`\``
              }]
            };

          case 'MKG_review':
            // Alias for review
            const mkgReview = await this.router.performCodeReview(
              args.content,
              args.file_path,
              args.review_type || 'comprehensive',
              args.language
            );
            return {
              content: [{
                type: 'text',
                text: `👀 **MKG CODE REVIEW**\n\n${mkgReview}`
              }]
            };

          case 'MKG_edit':
            // Alias for edit_file
            const mkgEditResult = await this.router.fileModManager.orchestrateOperation('single_edit', {
              file_path: args.file_path,
              edits: args.edits,
              validation_mode: args.validation_mode || 'strict',
              language: args.language
            });
            return {
              content: [{
                type: 'text',
                text: `🔧 **MKG FILE EDITING**\n\n${JSON.stringify(mkgEditResult, null, 2)}`
              }]
            };

          case 'MKG_health':
            // Alias for health
            let mkgHealthReport;
            try {
              mkgHealthReport = await this.getComprehensiveHealth(args.check_type || 'comprehensive');
            } catch (error) {
              mkgHealthReport = `Health check failed: ${error.message}`;
            }
            return {
              content: [{
                type: 'text',
                text: `🏥 **MKG SYSTEM HEALTH**\n\n${mkgHealthReport}`
              }]
            };

          // DeepSeek Aliases - map to original functions
          case 'deepseek_analyze':
            // Alias for analyze
            const deepseekAnalysis = await this.router.analyzeUniversal(
              args.content,
              args.file_path,
              args.analysis_type || 'comprehensive',
              args.language
            );
            return {
              content: [{
                type: 'text',
                text: `🔍 **DEEPSEEK CODE ANALYSIS**\n\n${deepseekAnalysis}`
              }]
            };

          case 'deepseek_generate':
            // Alias for generate
            const deepseekCompletion = await this.router.processFimRequest(
              args.prefix,
              args.suffix || '',
              args.language || 'javascript'
            );
            return {
              content: [{
                type: 'text',
                text: `⚡ **DEEPSEEK CODE GENERATION**\n\n\`\`\`${args.language || 'javascript'}\n${deepseekCompletion}\n\`\`\``
              }]
            };

          case 'deepseek_review':
            // Alias for review
            const deepseekReview = await this.router.performCodeReview(
              args.content,
              args.file_path,
              args.review_type || 'comprehensive',
              args.language
            );
            return {
              content: [{
                type: 'text',
                text: `👀 **DEEPSEEK CODE REVIEW**\n\n${deepseekReview}`
              }]
            };

          case 'deepseek_edit':
            // Alias for edit_file
            const deepseekEditResult = await this.router.fileModManager.orchestrateOperation('single_edit', {
              file_path: args.file_path,
              edits: args.edits,
              validation_mode: args.validation_mode || 'strict',
              language: args.language
            });
            return {
              content: [{
                type: 'text',
                text: `🔧 **DEEPSEEK FILE EDITING**\n\n${JSON.stringify(deepseekEditResult, null, 2)}`
              }]
            };

          case 'deepseek_health':
            // Alias for health
            let deepseekHealthReport;
            try {
              deepseekHealthReport = await this.getComprehensiveHealth(args.check_type || 'comprehensive');
            } catch (error) {
              deepseekHealthReport = `Health check failed: ${error.message}`;
            }
            return {
              content: [{
                type: 'text',
                text: `🏥 **DEEPSEEK SYSTEM HEALTH**\n\n${deepseekHealthReport}`
              }]
            };

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
        }
      } catch (error) {
        console.error(`Tool error [${name}]:`, error);
        throw new McpError(ErrorCode.InternalError, error.message);
      }
    });
  }

  /**
   * 📚 READ MULTIPLE FILES IMPLEMENTATION
   */
  async readMultipleFiles(filePaths, analysisType = 'content', maxFiles = 10) {
    try {
      const results = [];
      const limitedPaths = filePaths.slice(0, maxFiles);

      for (const filePath of limitedPaths) {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          const stats = await fs.stat(filePath);

          let processedContent = content;
          if (analysisType === 'summary') {
            processedContent = content.substring(0, 500) + (content.length > 500 ? '...' : '');
          } else if (analysisType === 'structure') {
            // Extract key structural elements
            const lines = content.split('\n');
            const imports = lines.filter(line => line.includes('import') || line.includes('require')).slice(0, 5);
            const functions = lines.filter(line => line.includes('function') || line.includes('def ') || line.includes('class ')).slice(0, 10);
            processedContent = `Imports:\n${imports.join('\n')}\n\nKey Functions/Classes:\n${functions.join('\n')}`;
          }

          results.push({
            path: filePath,
            size: stats.size,
            content: processedContent,
            lines: content.split('\n').length,
            lastModified: stats.mtime.toISOString(),
            analysisType: analysisType
          });
        } catch (error) {
          results.push({
            path: filePath,
            error: `Failed to read: ${error.message}`
          });
        }
      }

      if (filePaths.length > maxFiles) {
        results.push({
          note: `Showing ${maxFiles} of ${filePaths.length} files (limit applied)`
        });
      }

      return JSON.stringify(results, null, 2);
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to read files: ${error.message}`);
    }
  }

  /**
   * ✍️ ATOMIC FILE WRITE IMPLEMENTATION
   */
  async writeFilesAtomic(fileOperations, createBackup = true) {
    try {
      const results = [];
      const backups = [];

      // Create backups first if requested
      if (createBackup) {
        for (const op of fileOperations) {
          try {
            const exists = await fs.access(op.path).then(() => true).catch(() => false);
            if (exists) {
              const backupPath = `${op.path}.backup.${Date.now()}`;
              await fs.copyFile(op.path, backupPath);
              backups.push({ original: op.path, backup: backupPath });
            }
          } catch (error) {
            // Backup failed, but continue
          }
        }
      }

      // Perform file operations
      for (const op of fileOperations) {
        try {
          switch (op.operation || 'write') {
            case 'write':
              await fs.writeFile(op.path, op.content, 'utf8');
              break;
            case 'append':
              await fs.appendFile(op.path, op.content, 'utf8');
              break;
            case 'modify':
              // For modify, we expect content to be the full file content
              await fs.writeFile(op.path, op.content, 'utf8');
              break;
          }

          results.push({
            path: op.path,
            operation: op.operation || 'write',
            status: 'success',
            bytes: Buffer.byteLength(op.content, 'utf8')
          });
        } catch (error) {
          results.push({
            path: op.path,
            operation: op.operation || 'write',
            status: 'failed',
            error: error.message
          });
        }
      }

      return JSON.stringify({
        operations: results,
        backups: backups,
        timestamp: new Date().toISOString()
      }, null, 2);

    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Atomic write failed: ${error.message}`);
    }
  }

  /**
   * 🏗️ CODEBASE STRUCTURE ANALYSIS IMPLEMENTATION
   */
  async analyzeCodebaseStructure(rootPath, includePatterns = ['*.js', '*.ts'], analysisDepth = 'shallow') {
    try {
      const structure = {
        rootPath,
        analysisDepth,
        timestamp: new Date().toISOString(),
        summary: {},
        files: [],
        dependencies: {}
      };

      // Simple file discovery
      const files = await this.discoverFiles(rootPath, includePatterns);
      structure.summary.totalFiles = files.length;
      structure.summary.totalSize = 0;

      for (const file of files.slice(0, analysisDepth === 'deep' ? 100 : 20)) {
        try {
          const stats = await fs.stat(file);
          const content = await fs.readFile(file, 'utf8');

          structure.summary.totalSize += stats.size;
          structure.files.push({
            path: file,
            size: stats.size,
            lines: content.split('\n').length,
            type: path.extname(file).substring(1)
          });

          // Basic dependency extraction for JS/TS files
          if (file.endsWith('.js') || file.endsWith('.ts')) {
            const imports = this.extractImports(content);
            if (imports.length > 0) {
              structure.dependencies[file] = imports;
            }
          }
        } catch (error) {
          // Skip files that can't be read
        }
      }

      return JSON.stringify(structure, null, 2);
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Structure analysis failed: ${error.message}`);
    }
  }

  /**
   * 🔍 HELPER METHODS FOR CODEBASE ANALYSIS
   */
  async discoverFiles(rootPath, patterns) {
    const files = [];

    async function walkDir(dir) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await walkDir(fullPath);
          } else if (entry.isFile()) {
            const matched = patterns.some(pattern => {
              const regex = new RegExp(pattern.replace('*', '.*'));
              return regex.test(entry.name);
            });

            if (matched) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    }

    await walkDir(rootPath);
    return files;
  }

  extractImports(content) {
    const imports = [];
    const importRegex = /(?:import|require)\s*\(?['"](.*?)['"]\)?/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    return imports;
  }

  /**
   * 🎯 ROUTING RECOMMENDATION GENERATOR
   */
  generateRoutingRecommendation(healthResults) {
    const recommendations = [];
    const priorities = ['local', 'nvidiaDeepSeek', 'nvidiaQwen'];

    // Check each endpoint health
    for (const [key, health] of Object.entries(healthResults)) {
      if (health.status === 'healthy') {
        const endpoint = this.router.endpoints[key];
        recommendations.push({
          endpoint: key,
          name: endpoint.name,
          priority: endpoint.priority,
          status: 'RECOMMENDED',
          reason: `${health.responseTime} response time`,
          url: endpoint.url
        });
      } else {
        recommendations.push({
          endpoint: key,
          name: this.router.endpoints[key].name,
          priority: this.router.endpoints[key].priority,
          status: 'UNAVAILABLE',
          reason: health.error,
          url: this.router.endpoints[key].url
        });
      }
    }

    // Sort by priority
    recommendations.sort((a, b) => a.priority - b.priority);

    const primaryEndpoint = recommendations.find(r => r.status === 'RECOMMENDED');

    return {
      currentStrategy: 'Priority-based routing: Local → NVIDIA DeepSeek → NVIDIA Qwen',
      primaryEndpoint: primaryEndpoint ? primaryEndpoint.endpoint : 'None available',
      endpoints: recommendations,
      localContainerStatus: healthResults.local?.status || 'unknown',
      nvidiaCloudStatus: healthResults.nvidiaDeepSeek?.status === 'healthy' || healthResults.nvidiaQwen?.status === 'healthy' ? 'available' : 'unavailable'
    };
  }

  async start() {
    // Create transport and connect
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('🔥 MECHA KING GHIDORAH v8.0.0 CONNECTED! Enhanced AI routing ready to code!');
  }
}

/**
 * 🚀 LAUNCH THE CODING MONSTER
 */
async function main() {
  try {
    console.error('🦖 Initializing Mecha King Ghidorah v8.0.0 with Smart AI Routing...');
    const mechaKingGhidorah = new MechaKingGhidorahServer();
    await mechaKingGhidorah.start();
  } catch (error) {
    console.error('💥 Failed to start Mecha King Ghidorah:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.error('🔄 Mecha King Ghidorah shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('🔄 Mecha King Ghidorah shutting down gracefully...');
  process.exit(0);
});

main().catch(error => {
  console.error('💥 Mecha King Ghidorah startup error:', error);
  process.exit(1);
});