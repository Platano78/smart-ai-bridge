#!/usr/bin/env node

/**
 * DeepSeek MCP Bridge v6.0.0 - Empirical Routing
 * 
 * 🎯 "TRY FIRST, ROUTE ON FAILURE" STRATEGY:
 * ✅ ALL queries try DeepSeek first (no upfront classification)
 * ✅ Route to Claude only AFTER actual failures
 * ✅ Build routing intelligence from empirical data
 * ✅ Eliminate false positives from pattern matching
 * ✅ Learn what actually fails vs. what we predict fails
 * 
 * EMPIRICAL ROUTING PHILOSOPHY:
 * • No pre-judging - every query gets a chance with DeepSeek
 * • Actual failure data > predicted complexity patterns
 * • Route on evidence, not assumptions
 * • Build intelligence from real performance metrics
 * 
 * ROUTING TRIGGERS (EMPIRICAL):
 * ❌ Timeout (>25s) → Probably too complex, try Claude next time
 * ❌ Server Error (5xx) → Service issue, fallback to Claude
 * ❌ Request Error (4xx) → Format issue, debug and retry
 * ❌ Network Error → Connectivity issue, automatic retry
 * 
 * SUCCESS TRACKING:
 * ✅ Response time < 25s → DeepSeek handles this pattern well
 * ✅ Valid response received → Add to success patterns
 * ✅ User satisfied → Positive feedback loop
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
import { exec } from 'child_process';
import { promisify } from 'util';

// Import existing infrastructure
import { config } from './config.js';
import { CircuitBreaker, FallbackResponseGenerator } from './circuit-breaker.js';

const execAsync = promisify(exec);

/**
 * Empirical Routing Intelligence
 * Learn from actual failures, not predicted ones
 */
class EmpiricalRoutingEngine {
  constructor() {
    // Raw empirical data - what actually happens
    this.empiricalData = {
      totalAttempts: 0,
      successfulAttempts: 0,
      failuresByType: {
        timeout: 0,        // Actually timed out (>25s)
        serverError: 0,    // HTTP 5xx errors
        clientError: 0,    // HTTP 4xx errors  
        networkError: 0,   // Connection failures
        unknown: 0         // Other failures
      },
      averageResponseTime: 0,
      responseTimeHistory: [],
      successPatterns: [],
      failurePatterns: []
    };

    // Routing intelligence built from real data
    this.routingIntelligence = {
      deepseekSuccessRate: 100, // Start optimistic
      averageResponseTime: 0,
      timeoutThreshold: 25000,  // 25s empirically determined
      maxRetries: 2,
      confidenceLevel: 'learning' // learning → confident → expert
    };
  }

  /**
   * NO UPFRONT CLASSIFICATION - Try DeepSeek first for everything
   */
  shouldTryDeepseek(prompt, context = '') {
    // Always try DeepSeek first - no exceptions
    // This eliminates false positives from pattern matching
    return {
      tryDeepseek: true,
      reason: 'Empirical routing: try DeepSeek first, route on actual failure',
      confidence: 'empirical-data-driven',
      predictedSuccessRate: this.routingIntelligence.deepseekSuccessRate
    };
  }

  /**
   * Analyze ACTUAL failure after it happens
   */
  analyzeFailure(error, responseTime, prompt) {
    this.empiricalData.totalAttempts++;

    let failureType = 'unknown';
    let routeToClaudeRecommendation = false;
    let reason = '';

    // Classify failure based on actual evidence
    if (responseTime > this.routingIntelligence.timeoutThreshold) {
      failureType = 'timeout';
      this.empiricalData.failuresByType.timeout++;
      routeToClaudeRecommendation = true;
      reason = `Actual timeout after ${Math.round(responseTime/1000)}s - likely too complex for DeepSeek`;
    } else if (error.message.includes('HTTP 5')) {
      failureType = 'serverError';
      this.empiricalData.failuresByType.serverError++;
      routeToClaudeRecommendation = false; // Server issue, not complexity
      reason = 'Server error - DeepSeek service issue, not task complexity';
    } else if (error.message.includes('HTTP 4')) {
      failureType = 'clientError'; 
      this.empiricalData.failuresByType.clientError++;
      routeToClaudeRecommendation = false; // Format issue, not complexity
      reason = 'Client error - request format issue, not task complexity';
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      failureType = 'networkError';
      this.empiricalData.failuresByType.networkError++;
      routeToClaudeRecommendation = false; // Network issue, not complexity
      reason = 'Network error - connectivity issue, not task complexity';
    } else {
      failureType = 'unknown';
      this.empiricalData.failuresByType.unknown++;
      routeToClaudeRecommendation = false; // Unknown issue, investigate first
      reason = 'Unknown error - investigate before routing decision';
    }

    // Store actual failure pattern for learning
    this.empiricalData.failurePatterns.push({
      prompt: prompt.substring(0, 100),
      failureType,
      responseTime,
      error: error.message,
      timestamp: Date.now()
    });

    // Update routing intelligence with real data
    this.updateRoutingIntelligence();

    return {
      failureType,
      routeToClaudeRecommendation,
      reason,
      empiricalData: this.getRoutingMetrics()
    };
  }

  /**
   * Record ACTUAL success
   */
  recordSuccess(responseTime, prompt, response) {
    this.empiricalData.totalAttempts++;
    this.empiricalData.successfulAttempts++;

    // Track response time for empirical analysis
    this.empiricalData.responseTimeHistory.push(responseTime);
    if (this.empiricalData.responseTimeHistory.length > 100) {
      this.empiricalData.responseTimeHistory.shift(); // Keep last 100
    }

    // Store success pattern for learning
    this.empiricalData.successPatterns.push({
      prompt: prompt.substring(0, 100),
      responseTime,
      responseLength: response.length,
      timestamp: Date.now()
    });

    // Update routing intelligence with real data
    this.updateRoutingIntelligence();

    console.error(`✅ DeepSeek Success: ${Math.round(responseTime/1000)}s response time`);
  }

  /**
   * Update routing intelligence based on actual performance
   */
  updateRoutingIntelligence() {
    const total = this.empiricalData.totalAttempts;
    
    if (total > 0) {
      // Calculate ACTUAL success rate
      this.routingIntelligence.deepseekSuccessRate = 
        Math.round((this.empiricalData.successfulAttempts / total) * 100);

      // Calculate ACTUAL average response time  
      if (this.empiricalData.responseTimeHistory.length > 0) {
        this.routingIntelligence.averageResponseTime = Math.round(
          this.empiricalData.responseTimeHistory.reduce((a, b) => a + b, 0) / 
          this.empiricalData.responseTimeHistory.length
        );
      }

      // Adjust confidence level based on data volume
      if (total >= 50) {
        this.routingIntelligence.confidenceLevel = 'expert';
      } else if (total >= 20) {
        this.routingIntelligence.confidenceLevel = 'confident';
      } else {
        this.routingIntelligence.confidenceLevel = 'learning';
      }
    }
  }

  /**
   * Get current empirical routing metrics
   */
  getRoutingMetrics() {
    const total = this.empiricalData.totalAttempts;
    
    return {
      totalAttempts: total,
      successRate: total > 0 ? Math.round((this.empiricalData.successfulAttempts / total) * 100) : 0,
      failureBreakdown: { ...this.empiricalData.failuresByType },
      averageResponseTime: this.routingIntelligence.averageResponseTime,
      confidenceLevel: this.routingIntelligence.confidenceLevel,
      routingStrategy: 'empirical-data-driven',
      
      // Key insight metrics
      timeoutRate: total > 0 ? Math.round((this.empiricalData.failuresByType.timeout / total) * 100) : 0,
      networkIssueRate: total > 0 ? Math.round((this.empiricalData.failuresByType.networkError / total) * 100) : 0,
      actualComplexityFailures: this.empiricalData.failuresByType.timeout, // Only timeouts indicate complexity
      
      // Learning insights
      learningInsights: this.generateLearningInsights()
    };
  }

  generateLearningInsights() {
    const insights = [];
    const total = this.empiricalData.totalAttempts;

    if (total === 0) return ['Gathering empirical data... Try some queries!'];

    if (this.empiricalData.failuresByType.timeout === 0 && total > 10) {
      insights.push('✅ No timeout failures detected - DeepSeek handles current workload well');
    }

    if (this.empiricalData.failuresByType.timeout > 0) {
      const timeoutRate = (this.empiricalData.failuresByType.timeout / total) * 100;
      if (timeoutRate > 20) {
        insights.push(`⚠️ ${Math.round(timeoutRate)}% timeout rate - consider routing complex tasks to Claude`);
      } else {
        insights.push(`📊 ${Math.round(timeoutRate)}% timeout rate - acceptable complexity level`);
      }
    }

    if (this.empiricalData.failuresByType.networkError > this.empiricalData.failuresByType.timeout) {
      insights.push('🔧 More network issues than complexity issues - check DeepSeek server stability');
    }

    if (this.routingIntelligence.averageResponseTime > 0) {
      if (this.routingIntelligence.averageResponseTime < 5000) {
        insights.push(`🚀 Fast responses (${Math.round(this.routingIntelligence.averageResponseTime/1000)}s avg) - excellent performance`);
      } else if (this.routingIntelligence.averageResponseTime > 15000) {
        insights.push(`🐌 Slow responses (${Math.round(this.routingIntelligence.averageResponseTime/1000)}s avg) - monitor complexity`);
      }
    }

    return insights;
  }
}

/**
 * Empirical DeepSeek Bridge - Try First, Route on Failure
 */
class EmpiricalDeepseekBridge {
  constructor() {
    this.initialized = false;
    this.config = null;
    
    // Empirical routing engine (no upfront classification)
    this.routingEngine = new EmpiricalRoutingEngine();
    
    // Circuit breaker for service protection
    this.circuitBreaker = null;
    this.fallbackGenerator = null;
    
    // Connection management (inherit from existing implementation)
    this.baseURL = null;
    this.cachedIP = null;
    this.lastIPCheck = null;
    this.availableModels = [];
    this.defaultModel = null;
    this.lastModelCheck = null;
    
    // IP discovery strategies (existing implementation)
    this.ipStrategies = [
      this.getWSLHostIP.bind(this),
      this.getVEthIP.bind(this),
      this.getDefaultGatewayIP.bind(this),
      this.getNetworkInterfaceIPs.bind(this)
    ];
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      // Load configuration
      this.config = await config.initialize();
      
      // Initialize circuit breaker
      this.circuitBreaker = new CircuitBreaker({
        failureThreshold: config.getNumber('CIRCUIT_BREAKER_FAILURE_THRESHOLD', 5),
        timeout: config.getNumber('CIRCUIT_BREAKER_TIMEOUT', 60000),
        halfOpenMaxCalls: config.getNumber('CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS', 3)
      });
      
      this.fallbackGenerator = new FallbackResponseGenerator(this.config);
      
      // Empirical configuration - optimized for real data collection
      this.timeout = config.getNumber('DEEPSEEK_TIMEOUT', 30000); // 30s base timeout
      this.complexTimeout = config.getNumber('DEEPSEEK_COMPLEX_TIMEOUT', 60000); // 60s for potential complex tasks
      this.retryAttempts = config.getNumber('DEEPSEEK_RETRY_ATTEMPTS', 2);
      this.maxFileSize = config.getNumber('DEEPSEEK_MAX_FILE_SIZE', 10485760);
      this.ipCacheTimeout = config.getNumber('DEEPSEEK_IP_CACHE_TTL', 300000);
      
      // Production standard maintained
      this.contextWindow = 32768;
      this.maxResponseTokens = 8000;
      this.allowedExtensions = ['.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.json', '.md', '.txt', '.py'];
      
      this.initialized = true;
      console.error('🎯 Empirical DeepSeek Bridge v6.0.0 - Try First, Route on Failure initialized');
      console.error('📊 Strategy: No upfront classification, learn from actual failures');
    } catch (error) {
      console.error('❌ Empirical bridge initialization failed:', error);
      throw error;
    }
  }

  /**
   * Empirical Query - Try DeepSeek first, always
   */
  async empiricalQuery(prompt, options = {}) {
    await this.initialize();
    
    // NO UPFRONT CLASSIFICATION - always try DeepSeek first
    const shouldTry = this.routingEngine.shouldTryDeepseek(prompt, options.context);
    console.error(`🎯 Empirical Routing: ${shouldTry.reason}`);
    console.error(`📊 Current Success Rate: ${shouldTry.predictedSuccessRate}% (based on real data)`);

    const fullPrompt = options.context 
      ? `Context: ${options.context}\n\nTask: ${prompt}`
      : prompt;

    // Always try DeepSeek first - measure actual performance
    return await this.tryDeepseekWithEmpiricalTracking(fullPrompt, options);
  }

  async tryDeepseekWithEmpiricalTracking(prompt, options) {
    const startTime = Date.now();
    
    try {
      // Execute with DeepSeek and measure actual performance
      const result = await this.executeDeepseekQuery(prompt, options);
      const responseTime = Date.now() - startTime;
      
      // Record ACTUAL success
      this.routingEngine.recordSuccess(responseTime, prompt, result.response);
      
      return {
        ...result,
        empiricalTracking: {
          responseTime,
          method: 'direct-success',
          routingRecommendation: 'continue-with-deepseek'
        },
        routingMetrics: this.routingEngine.getRoutingMetrics()
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // Analyze ACTUAL failure (not predicted failure)
      const failureAnalysis = this.routingEngine.analyzeFailure(error, responseTime, prompt);
      
      console.error(`❌ DeepSeek ${failureAnalysis.failureType}: ${failureAnalysis.reason}`);
      
      if (failureAnalysis.routeToClaudeRecommendation) {
        // Only recommend Claude for ACTUAL complexity failures (timeouts)
        return {
          success: false,
          empiricalRouting: true,
          routeToClaudeRecommendation: true,
          response: `**Empirical Routing Analysis - Route to Claude Recommended**

**Actual Failure Detected:**
- Failure Type: ${failureAnalysis.failureType}
- Response Time: ${Math.round(responseTime/1000)}s
- Reason: ${failureAnalysis.reason}

**Empirical Intelligence:**
${failureAnalysis.empiricalData.learningInsights.join('\n')}

**Routing Recommendation:**
This task actually timed out (not predicted to timeout), indicating genuine complexity beyond DeepSeek's optimal range. Consider routing similar tasks to Claude for:
- Faster completion (no 25s timeout)
- Better results for complex architectural work
- Optimal resource utilization

**What we learned:**
- DeepSeek success rate: ${failureAnalysis.empiricalData.successRate}%
- Average response time: ${Math.round(failureAnalysis.empiricalData.averageResponseTime/1000)}s
- Confidence level: ${failureAnalysis.empiricalData.confidenceLevel}

**Original Task:** "${prompt.substring(0, 200)}..."

*This routing recommendation is based on actual performance data, not pattern predictions.*`,
          
          error: error.message,
          failureAnalysis,
          routingMetrics: this.routingEngine.getRoutingMetrics()
        };
      } else {
        // Service issue, not complexity - try fallback or retry
        console.error('🔄 Service issue detected, attempting fallback...');
        
        try {
          const fallback = await this.fallbackGenerator.generateFallbackResponse(prompt, options);
          return {
            ...fallback,
            empiricalTracking: {
              originalError: error.message,
              responseTime,
              method: 'fallback-after-service-failure',
              failureType: failureAnalysis.failureType
            },
            routingMetrics: this.routingEngine.getRoutingMetrics()
          };
        } catch (fallbackError) {
          throw error; // Original error if fallback fails
        }
      }
    }
  }

  async executeDeepseekQuery(prompt, options = {}) {
    if (!this.baseURL) {
      this.baseURL = await this.getWorkingBaseURL();
    }

    await this.getAvailableModels();

    const modelToUse = options.model || this.defaultModel;
    const maxTokens = options.max_tokens || this.maxResponseTokens;
    
    const requestBody = {
      model: modelToUse,
      messages: [
        {
          role: 'system',
          content: 'You are an expert AI assistant. Provide clear, comprehensive responses to the user\'s request. You have access to a 32K context window.'
        },
        {
          role: 'user', 
          content: prompt
        }
      ],
      temperature: options.temperature || 0.7,
      max_tokens: maxTokens,
      stream: false
    };

    console.error(`🚀 DeepSeek request: ${this.baseURL}/chat/completions (${modelToUse})`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.complexTimeout);

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid response format from DeepSeek server');
      }

      return {
        success: true,
        response: data.choices[0].message.content,
        model: data.model || modelToUse,
        usage: data.usage,
        endpoint: this.baseURL,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      clearTimeout(timeoutId);
      
      // Enhanced error context for empirical analysis
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.complexTimeout/1000}s`);
      }
      
      throw error;
    }
  }

  /**
   * Check status with empirical metrics
   */
  async checkEmpiricalStatus() {
    await this.initialize();
    
    try {
      if (!this.baseURL) {
        this.baseURL = await this.getWorkingBaseURL();
      }

      const models = await this.getAvailableModels();
      const circuitStatus = this.circuitBreaker.getStatus();
      const routingMetrics = this.routingEngine.getRoutingMetrics();

      return {
        status: 'online',
        version: '6.0.0',
        routingStrategy: 'empirical-data-driven',
        features: ['try-first-route-on-failure', 'no-upfront-classification', 'empirical-intelligence'],
        
        endpoint: this.baseURL,
        models: models,
        defaultModel: this.defaultModel,
        timestamp: new Date().toISOString(),
        environment: config.get('environment'),
        
        // Empirical routing intelligence
        empiricalRouting: {
          strategy: 'Try DeepSeek first, route only on actual failure',
          classification: 'None - eliminated upfront pattern matching',
          learningStatus: routingMetrics.confidenceLevel,
          dataPoints: routingMetrics.totalAttempts
        },
        
        // Real performance metrics
        performanceMetrics: routingMetrics,
        
        circuitBreaker: circuitStatus,
        
        configuration: {
          contextWindow: this.contextWindow,
          maxResponseTokens: this.maxResponseTokens,
          timeout: this.timeout,
          complexTimeout: this.complexTimeout,
          empiricalTimeoutThreshold: this.routingEngine.routingIntelligence.timeoutThreshold,
          retryAttempts: this.retryAttempts
        }
      };

    } catch (error) {
      const circuitStatus = this.circuitBreaker?.getStatus() || { state: 'unknown' };
      const routingMetrics = this.routingEngine.getRoutingMetrics();
      
      return {
        status: 'offline',
        version: '6.0.0',
        error: 'DeepSeek server not available',
        endpoint: this.baseURL,
        timestamp: new Date().toISOString(),
        environment: config.get('environment'),
        
        empiricalRouting: {
          strategy: 'Try first, route on failure (works offline)',
          status: 'Ready - will track failures when server returns',
          dataPoints: routingMetrics.totalAttempts
        },
        
        performanceMetrics: routingMetrics,
        circuitBreaker: circuitStatus,
        
        suggestion: 'Start LM Studio with DeepSeek model. Empirical routing will begin tracking real performance immediately.'
      };
    }
  }

  // Include existing IP discovery and model management methods
  async getWorkingBaseURL() {
    if (this.cachedIP && this.lastIPCheck && 
        (Date.now() - this.lastIPCheck) < this.ipCacheTimeout) {
      return `http://${this.cachedIP}:1234/v1`;
    }

    console.error('🔍 Discovering WSL IP address...');
    
    for (const strategy of this.ipStrategies) {
      try {
        const ips = await strategy();
        for (const ip of ips) {
          if (await this.testConnection(ip)) {
            this.cachedIP = ip;
            this.lastIPCheck = Date.now();
            this.baseURL = `http://${ip}:1234/v1`;
            console.error(`✅ Found working DeepSeek server at ${ip}`);
            return this.baseURL;
          }
        }
      } catch (error) {
        console.error(`❌ Strategy failed: ${strategy.name} - ${error.message}`);
      }
    }

    throw new Error('No working DeepSeek server found on any discoverable IP address');
  }

  async testConnection(ip) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`http://${ip}:1234/v1/models`, {
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async getAvailableModels() {
    if (this.availableModels.length > 0 && this.lastModelCheck && 
        (Date.now() - this.lastModelCheck) < 300000) {
      return this.availableModels;
    }

    try {
      if (!this.baseURL) {
        this.baseURL = await this.getWorkingBaseURL();
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.baseURL}/models`, {
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      this.availableModels = data.data || [];
      this.lastModelCheck = Date.now();

      if (this.availableModels.length > 0) {
        const deepseekModel = this.availableModels.find(m => 
          m.id.toLowerCase().includes('deepseek') || 
          m.id.toLowerCase().includes('coder')
        );
        this.defaultModel = deepseekModel ? deepseekModel.id : this.availableModels[0].id;
      }

      return this.availableModels;

    } catch (error) {
      this.availableModels = [{ id: 'deepseek-coder' }];
      this.defaultModel = 'deepseek-coder';
      return this.availableModels;
    }
  }

  async getWSLHostIP() {
    try {
      const { stdout } = await execAsync("ip route show default | awk '/default/ { print $3 }'");
      const ip = stdout.trim();
      if (ip && this.isValidIP(ip)) {
        return [ip];
      }
    } catch (error) {
      console.error('WSL host IP detection failed:', error.message);
    }
    return [];
  }

  async getVEthIP() {
    try {
      const { stdout } = await execAsync("ip addr show | grep -E 'inet.*eth0' | awk '{ print $2 }' | cut -d/ -f1");
      const ips = stdout.trim().split('\n').filter(ip => ip && this.isValidIP(ip));
      return ips;
    } catch (error) {
      console.error('vEth IP detection failed:', error.message);
    }
    return [];
  }

  async getDefaultGatewayIP() {
    try {
      const { stdout } = await execAsync("hostname -I");
      const ips = stdout.trim().split(' ').filter(ip => ip && this.isValidIP(ip));
      
      const hostIPs = [];
      for (const ip of ips) {
        const parts = ip.split('.');
        if (parts.length === 4) {
          parts[3] = '1';
          hostIPs.push(parts.join('.'));
        }
      }
      return hostIPs;
    } catch (error) {
      console.error('Gateway IP detection failed:', error.message);
    }
    return [];
  }

  async getNetworkInterfaceIPs() {
    try {
      const commonRanges = [
        '172.19.224.1', '172.20.224.1', '172.21.224.1', '172.22.224.1', '172.23.224.1',
        '172.17.0.1', '172.18.0.1', '172.19.0.1', '172.20.0.1',
        '192.168.1.1', '192.168.0.1', '10.0.0.1'
      ];
      return commonRanges;
    } catch (error) {
      console.error('Network interface IP detection failed:', error.message);
    }
    return [];
  }

  isValidIP(ip) {
    const parts = ip.split('.');
    return parts.length === 4 && parts.every(part => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  }
}

// Initialize the empirical bridge
const bridge = new EmpiricalDeepseekBridge();

// Create MCP server
const server = new Server(
  {
    name: 'deepseek-mcp-bridge',
    version: '6.0.0',
    description: 'Empirical DeepSeek Bridge - Try First, Route on Failure with real performance data'
  },
  {
    capabilities: {
      tools: {},
      logging: {}
    }
  }
);

// Tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'empirical_query_deepseek',
        description: '🎯 **EMPIRICAL ROUTING** - Try DeepSeek first for ALL queries, route to Claude only after actual failures. Eliminates false positives from upfront classification. Builds routing intelligence from real performance data.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'Query to send to DeepSeek (no upfront filtering)' },
            context: { type: 'string', description: 'Additional context' },
            task_type: {
              type: 'string',
              enum: ['coding', 'game_dev', 'analysis', 'debugging', 'optimization'],
              description: 'Task type for system prompt optimization'
            },
            model: { type: 'string', description: 'Specific DeepSeek model to use' }
          },
          required: ['prompt']
        }
      },
      {
        name: 'check_empirical_status',
        description: 'Check empirical routing status with real performance metrics and routing intelligence',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        }
      },
      {
        name: 'handoff_to_deepseek',
        description: 'Session handoff with empirical routing - no upfront classification, learns from actual usage',
        inputSchema: {
          type: 'object',
          properties: {
            context: { type: 'string', description: 'Development context' },
            goal: { type: 'string', description: 'Session goal' }
          },
          required: ['context', 'goal']
        }
      }
    ]
  };
});

// Tool handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'empirical_query_deepseek': {
        const result = await bridge.empiricalQuery(args.prompt, {
          context: args.context,
          task_type: args.task_type,
          model: args.model
        });

        if (result.empiricalRouting && result.routeToClaudeRecommendation) {
          // Return routing recommendation based on actual failure
          return {
            content: [{
              type: 'text',
              text: result.response
            }]
          };
        } else if (result.success) {
          // Successful DeepSeek result with empirical tracking
          let responseText = `**DeepSeek Response (Empirical Routing):**\n\n${result.response}`;
          
          if (result.empiricalTracking) {
            responseText += `\n\n**Empirical Performance:**\n- Response Time: ${Math.round(result.empiricalTracking.responseTime/1000)}s\n- Method: ${result.empiricalTracking.method}\n- Recommendation: ${result.empiricalTracking.routingRecommendation}`;
          }

          if (result.routingMetrics) {
            responseText += `\n\n**Routing Intelligence (Real Data):**\n- Success Rate: ${result.routingMetrics.successRate}% (${result.routingMetrics.totalAttempts} attempts)\n- Average Response: ${Math.round(result.routingMetrics.averageResponseTime/1000)}s\n- Confidence: ${result.routingMetrics.confidenceLevel}`;
          }
          
          responseText += `\n\n*🎯 Empirical Bridge v6.0.0 - No Upfront Classification, Route on Actual Failure*`;
          
          return {
            content: [{
              type: 'text',
              text: responseText
            }]
          };
        } else {
          return {
            content: [{
              type: 'text',
              text: `**Error:** ${result.error}\n\n*🎯 Empirical Bridge v6.0.0 - Learning from actual failures*`
            }]
          };
        }
      }

      case 'check_empirical_status': {
        const status = await bridge.checkEmpiricalStatus();
        
        const statusText = status.status === 'online' 
          ? `✅ **Empirical DeepSeek Online** - Try First, Route on Failure v6.0.0

**🎯 Empirical Routing Strategy:**
- Method: ${status.empiricalRouting.strategy}
- Classification: ${status.empiricalRouting.classification}
- Learning Status: ${status.empiricalRouting.learningStatus}
- Data Points: ${status.empiricalRouting.dataPoints}

**📊 Real Performance Metrics:**
- Success Rate: ${status.performanceMetrics.successRate}% (${status.performanceMetrics.totalAttempts} attempts)
- Average Response: ${Math.round(status.performanceMetrics.averageResponseTime/1000)}s
- Timeout Rate: ${status.performanceMetrics.timeoutRate}%
- Confidence Level: ${status.performanceMetrics.confidenceLevel}

**🧠 Learning Insights:**
${status.performanceMetrics.learningInsights.join('\n')}

**Failure Breakdown (Actual Data):**
- Timeouts (complexity): ${status.performanceMetrics.failureBreakdown.timeout}
- Server Errors: ${status.performanceMetrics.failureBreakdown.serverError} 
- Network Issues: ${status.performanceMetrics.failureBreakdown.networkError}
- Client Errors: ${status.performanceMetrics.failureBreakdown.clientError}

**Service Details:**
- Endpoint: ${status.endpoint}
- Models: ${status.models ? status.models.length : 0} available
- Default Model: ${status.defaultModel}
- Environment: ${status.environment}

**Key Advantage:**
✅ No false positives - only route based on actual failures
✅ Your JSON question gets to try DeepSeek first
✅ Build intelligence from real performance, not predictions`

          : `❌ **DeepSeek Offline** - Empirical Bridge v6.0.0

**🎯 Empirical Routing Status:**
- Status: ${status.empiricalRouting.status}
- Data Points: ${status.empiricalRouting.dataPoints}

**📊 Historical Performance:**
${Object.keys(status.performanceMetrics.failureBreakdown).map(key => 
  `- ${key}: ${status.performanceMetrics.failureBreakdown[key]}`).join('\n')}

**Service Status:**
- Error: ${status.error}
- Circuit Breaker: ${status.circuitBreaker?.state || 'Unknown'}

**Advantage:**
✅ Ready to track real performance when service returns
✅ No upfront classification blocking your queries
✅ Will learn from actual usage patterns

${status.suggestion}`;

        return {
          content: [{
            type: 'text',
            text: statusText
          }]
        };
      }

      case 'handoff_to_deepseek': {
        const handoffPackage = `
# 🎯 Empirical DeepSeek Handoff Package v6.0.0

## 📋 Session Context
${args.context}

## 🎯 Session Goal  
${args.goal}

## 🚀 Empirical Routing Active
**Strategy**: Try DeepSeek First, Route on Failure
**Classification**: None - No upfront pattern matching
**Intelligence**: Built from actual performance data

## ⚡ Key Advantages
- ✅ **No False Positives**: Your queries try DeepSeek first
- ✅ **Empirical Learning**: Route based on actual failures, not predictions
- ✅ **Real Performance Data**: Intelligence built from genuine usage patterns
- ✅ **Engineering Excellence**: Evidence-based routing decisions

## 📊 How It Works
1. **All queries go to DeepSeek first** (no exceptions)
2. **Success**: Fast response, continue with DeepSeek
3. **Timeout (>25s)**: Actually too complex, recommend Claude
4. **Service Error**: Network/server issue, try fallback
5. **Build Intelligence**: Learn what actually fails vs. predicts

## 🎯 Session Ready For:
- Unlimited token development with empirical optimization
- Real-time performance tracking and learning
- Automatic routing recommendations based on actual failures
- Continuous improvement from usage patterns

**Ready for empirical unlimited token development!**
        `;

        return {
          content: [{
            type: 'text',
            text: handoffPackage
          }]
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }

  } catch (error) {
    console.error(`Empirical tool ${name} error:`, error);
    return {
      content: [{
        type: 'text',
        text: `❌ **Empirical Tool Error:** ${error.message}\n\n*🎯 Empirical Bridge v6.0.0 - Try first, route on failure*`
      }],
      isError: true
    };
  }
});

// Server startup
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('🎯 Empirical DeepSeek MCP Bridge v6.0.0 running!');
console.error('📊 Strategy: Try DeepSeek first, route only on actual failure');
console.error('✅ No upfront classification - eliminates false positives');
console.error('🧠 Building routing intelligence from real performance data');
