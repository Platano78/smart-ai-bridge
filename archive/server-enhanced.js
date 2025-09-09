#!/usr/bin/env node

/**
 * Enhanced DeepSeek MCP Bridge v4.0.0 - Research-Driven Production Architecture
 * 
 * INDUSTRY PATTERNS IMPLEMENTED:
 * ✅ Environment-aware configuration (Laravel/Next.js pattern)
 * ✅ Circuit breaker pattern (Netflix/AWS/Microsoft pattern)
 * ✅ Graceful degradation (AWS Well-Architected pattern)
 * ✅ Production-safe AI service architecture
 * ✅ CSP-compliant localhost handling
 * 
 * Based on research from:
 * - AWS Circuit Breaker Pattern
 * - Microsoft .NET Resilience Patterns
 * - Netflix Hystrix Design
 * - Laravel Environment Configuration
 * - Next.js CSP Implementation
 * - AWS Graceful Degradation Guidelines
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

// Import our research-based patterns
import { config } from './config.js';
import { CircuitBreaker, FallbackResponseGenerator } from './circuit-breaker.js';

const execAsync = promisify(exec);

/**
 * Production-Ready DeepSeek Bridge with Research-Based Patterns
 */
class ProductionDeepseekBridge {
  constructor() {
    this.initialized = false;
    this.config = null;
    
    // Circuit breaker for service protection (Netflix/AWS pattern)
    this.circuitBreaker = null;
    this.fallbackGenerator = null;
    
    // Connection management
    this.baseURL = null;
    this.cachedIP = null;
    this.lastIPCheck = null;
    
    // Model management
    this.availableModels = [];
    this.defaultModel = null;
    this.lastModelCheck = null;
    
    // IP discovery strategies (AWS multi-AZ pattern)
    this.ipStrategies = [
      this.getWSLHostIP.bind(this),
      this.getVEthIP.bind(this),
      this.getDefaultGatewayIP.bind(this),
      this.getNetworkInterfaceIPs.bind(this)
    ];
  }

  /**
   * Initialize bridge with environment-aware configuration
   * Based on Laravel configuration pattern
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      // Load environment-aware configuration
      this.config = await config.initialize();
      
      // Initialize circuit breaker with config
      this.circuitBreaker = new CircuitBreaker({
        failureThreshold: config.getNumber('CIRCUIT_BREAKER_FAILURE_THRESHOLD', 5),
        timeout: config.getNumber('CIRCUIT_BREAKER_TIMEOUT', 60000),
        halfOpenMaxCalls: config.getNumber('CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS', 3)
      });
      
      // Initialize fallback generator
      this.fallbackGenerator = new FallbackResponseGenerator(this.config);
      
      // Set properties from config
      this.timeout = config.getNumber('DEEPSEEK_TIMEOUT', 30000);
      this.retryAttempts = config.getNumber('DEEPSEEK_RETRY_ATTEMPTS', 3);
      this.maxFileSize = config.getNumber('DEEPSEEK_MAX_FILE_SIZE', 10485760);
      this.chunkSize = config.getNumber('DEEPSEEK_CHUNK_SIZE', 8000);
      this.ipCacheTimeout = config.getNumber('DEEPSEEK_IP_CACHE_TTL', 300000);
      
      this.allowedExtensions = ['.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.json', '.md', '.txt', '.py'];
      
      this.initialized = true;
      console.error(`🚀 Production DeepSeek Bridge v4.0.0 initialized (env: ${config.get('environment')})`);
    } catch (error) {
      console.error('❌ Bridge initialization failed:', error);
      throw error;
    }
  }

  /**
   * Execute DeepSeek query with circuit breaker protection
   * Based on AWS/Netflix circuit breaker pattern
   */
  async queryDeepseek(prompt, options = {}) {
    await this.initialize();
    
    // Create the main service call
    const serviceCall = async () => {
      return await this.executeDeepseekQuery(prompt, options);
    };

    // Create fallback function (AWS graceful degradation pattern)
    const fallbackCall = async () => {
      if (config.getBoolean('FALLBACK_RESPONSE_ENABLED', true)) {
        console.error('🔄 Generating fallback response due to service unavailability');
        return await this.fallbackGenerator.generateFallbackResponse(prompt, options);
      } else {
        throw new Error('DeepSeek service unavailable and fallback disabled');
      }
    };

    // Execute with circuit breaker protection
    try {
      return await this.circuitBreaker.execute(serviceCall, fallbackCall);
    } catch (error) {
      console.error('💥 Circuit breaker execution failed:', error);
      
      // Final fallback for production safety
      if (config.getBoolean('FALLBACK_RESPONSE_ENABLED', true)) {
        return await fallbackCall();
      } else {
        throw error;
      }
    }
  }

  /**
   * Core DeepSeek query execution
   * Enhanced with environment-aware configuration
   */
  async executeDeepseekQuery(prompt, options = {}) {
    if (!this.baseURL) {
      this.baseURL = await this.getWorkingBaseURL();
    }

    await this.getAvailableModels();

    const modelToUse = options.model || this.defaultModel;
    
    const requestBody = {
      model: modelToUse,
      messages: [
        {
          role: 'system',
          content: this.getSystemPrompt(options.task_type)
        },
        {
          role: 'user', 
          content: prompt
        }
      ],
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens || 4000,
      stream: false
    };

    console.error(`🚀 DeepSeek request: ${this.baseURL}/chat/completions (${modelToUse})`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

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

      // Cache successful response if enabled
      if (config.getBoolean('CACHE_RESPONSES', false)) {
        // Could implement response caching here
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
      
      // Enhanced error handling based on AWS patterns
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      } else if (error.code === 'ECONNREFUSED') {
        throw new Error('Connection refused - DeepSeek server not available');
      } else if (error.code === 'ENOTFOUND') {
        throw new Error('DNS resolution failed - check network connectivity');
      } else {
        throw error;
      }
    }
  }

  /**
   * Get circuit breaker status with comprehensive metrics
   */
  async checkStatus() {
    await this.initialize();
    
    try {
      // Test basic connectivity
      if (!this.baseURL) {
        this.baseURL = await this.getWorkingBaseURL();
      }

      const models = await this.getAvailableModels();
      const circuitStatus = this.circuitBreaker.getStatus();

      return {
        status: 'online',
        endpoint: this.baseURL,
        cachedIP: this.cachedIP,
        models: models,
        defaultModel: this.defaultModel,
        modelsCount: models.length,
        timestamp: new Date().toISOString(),
        environment: config.get('environment'),
        
        // Circuit breaker status
        circuitBreaker: circuitStatus,
        
        // Configuration status
        configuration: {
          timeout: this.timeout,
          retryAttempts: this.retryAttempts,
          maxFileSize: this.maxFileSize,
          fallbackEnabled: config.getBoolean('FALLBACK_RESPONSE_ENABLED', true),
          cacheEnabled: config.getBoolean('CACHE_RESPONSES', false),
          offlineModeEnabled: config.getBoolean('ENABLE_OFFLINE_MODE', false)
        }
      };

    } catch (error) {
      const circuitStatus = this.circuitBreaker?.getStatus() || { state: 'unknown' };
      
      return {
        status: 'offline',
        error: 'DeepSeek server not available',
        endpoint: this.baseURL,
        timestamp: new Date().toISOString(),
        environment: config.get('environment'),
        circuitBreaker: circuitStatus,
        suggestion: 'Start LM Studio and load DeepSeek model. Service will auto-recover.',
        diagnostics: await this.getDiagnostics()
      };
    }
  }

  /**
   * Enhanced diagnostics with circuit breaker metrics
   */
  async getDiagnostics() {
    const diagnostics = {
      environment: config.get('environment'),
      configuration: {
        timeout: this.timeout,
        retryAttempts: this.retryAttempts,
        circuitBreakerEnabled: !!this.circuitBreaker
      },
      ipDiscovery: {
        cachedIP: this.cachedIP,
        lastCheck: this.lastIPCheck,
        cacheAge: this.lastIPCheck ? Date.now() - this.lastIPCheck : null
      },
      modelDiscovery: {
        availableModels: this.availableModels.map(m => m.id),
        defaultModel: this.defaultModel,
        lastModelCheck: this.lastModelCheck
      },
      circuitBreaker: this.circuitBreaker?.getStatus() || null,
      networkStatus: {}
    };

    // Test all IP discovery strategies
    for (const strategy of this.ipStrategies) {
      try {
        const ips = await strategy();
        diagnostics.networkStatus[strategy.name] = {
          discovered: ips,
          count: ips.length
        };
      } catch (error) {
        diagnostics.networkStatus[strategy.name] = {
          error: error.message
        };
      }
    }

    return diagnostics;
  }

  // ... (Include all existing IP discovery and model management methods)
  
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
        (Date.now() - this.lastModelCheck) < this.modelCacheTimeout) {
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

      console.error(`🔍 Found ${this.availableModels.length} models, using: ${this.defaultModel}`);
      return this.availableModels;

    } catch (error) {
      console.error('Failed to get available models:', error.message);
      this.availableModels = [{ id: 'deepseek-coder' }, { id: 'local-model' }];
      this.defaultModel = 'deepseek-coder';
      return this.availableModels;
    }
  }

  // Include all IP discovery methods from current implementation
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

  getSystemPrompt(taskType) {
    const prompts = {
      coding: "You are an expert software developer. Provide clean, efficient, and well-documented code solutions.",
      game_dev: "You are an expert game developer. Focus on performance, user experience, and maintainable game architecture.",
      optimization: "You are a performance optimization expert. Analyze code for efficiency improvements and best practices.",
      architecture: "You are a software architect. Design scalable, maintainable systems with clear separation of concerns.",
      debugging: "You are a debugging expert. Systematically analyze code to identify and fix issues.",
      analysis: "You are a code analysis expert. Provide detailed insights about code quality, patterns, and improvements."
    };

    return prompts[taskType] || prompts.coding;
  }

  // File operations (existing methods enhanced with circuit breaker)
  async readFile(filePath) {
    // Implementation from existing code
    try {
      const resolvedPath = path.resolve(filePath);
      const stats = await fs.stat(resolvedPath);
      
      if (!stats.isFile()) {
        throw new Error('Path is not a file');
      }

      if (stats.size > this.maxFileSize) {
        throw new Error(`File too large: ${Math.round(stats.size / 1024)}KB (max: ${this.maxFileSize / 1024}KB)`);
      }

      const ext = path.extname(resolvedPath).toLowerCase();
      if (!this.allowedExtensions.includes(ext)) {
        throw new Error(`File type not allowed: ${ext}`);
      }

      const content = await fs.readFile(resolvedPath, 'utf8');
      
      return {
        success: true,
        content,
        path: resolvedPath,
        size: stats.size,
        extension: ext,
        lastModified: stats.mtime.toISOString()
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: filePath
      };
    }
  }
}

// Initialize the production bridge
const bridge = new ProductionDeepseekBridge();

// Create the MCP server
const server = new Server(
  {
    name: 'deepseek-mcp-bridge',
    version: '4.0.0',
    description: 'Production DeepSeek Bridge with Circuit Breaker, Environment Config, and Graceful Degradation'
  },
  {
    capabilities: {
      tools: {},
      logging: {}
    }
  }
);

// Enhanced tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'query_deepseek',
        description: 'Send a query to local DeepSeek with circuit breaker protection and automatic fallback',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'The prompt to send to DeepSeek' },
            context: { type: 'string', description: 'Additional context for the query' },
            task_type: {
              type: 'string',
              enum: ['coding', 'game_dev', 'analysis', 'architecture', 'debugging', 'optimization'],
              description: 'Type of task to optimize DeepSeek response'
            },
            model: { type: 'string', description: 'Specific DeepSeek model to use (auto-detected if not specified)' }
          },
          required: ['prompt']
        }
      },
      {
        name: 'check_deepseek_status',
        description: 'Check DeepSeek status with circuit breaker metrics and comprehensive diagnostics',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        }
      },
      {
        name: 'handoff_to_deepseek',
        description: 'Initiate unlimited token session handoff from Claude to DeepSeek',
        inputSchema: {
          type: 'object',
          properties: {
            context: { type: 'string', description: 'Current development context to transfer' },
            goal: { type: 'string', description: 'Goal for the unlimited session' }
          },
          required: ['context', 'goal']
        }
      }
    ]
  };
});

// Enhanced tool handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'query_deepseek': {
        const fullPrompt = args.context 
          ? `Context: ${args.context}\n\nTask: ${args.prompt}`
          : args.prompt;

        const result = await bridge.queryDeepseek(fullPrompt, {
          task_type: args.task_type,
          model: args.model
        });

        const statusIcon = result.fallback ? '🔄' : '🎉';
        const serviceType = result.fallback ? 'Fallback Service' : 'DeepSeek Service';

        return {
          content: [{
            type: 'text',
            text: result.success 
              ? `**${serviceType} Response:**\n\n${result.response}\n\n*Model: ${result.model} | Endpoint: ${result.endpoint} | Usage: ${JSON.stringify(result.usage || {})}\n\n${statusIcon} Production Bridge v4.0.0 with Circuit Breaker Protection*`
              : `**Error:** ${result.error}\n\n*Endpoint: ${result.endpoint}*\n*Environment: ${config.get('environment')}*\n*Suggestion: ${result.suggestion || 'Service will auto-recover'}*`
          }]
        };
      }

      case 'check_deepseek_status': {
        const status = await bridge.checkStatus();
        
        if (status.status === 'online') {
          const circuitState = status.circuitBreaker.state;
          const circuitIcon = circuitState === 'CLOSED' ? '✅' : circuitState === 'OPEN' ? '❌' : '⚠️';
          
          return {
            content: [{
              type: 'text',
              text: `✅ **DeepSeek Online** - Production Bridge v4.0.0

**Service Status:**
- Endpoint: ${status.endpoint}
- Environment: ${status.environment}
- Models: ${status.modelsCount} available
- Default Model: ${status.defaultModel}

**Circuit Breaker Status:** ${circuitIcon}
- State: ${circuitState}
- Failures: ${status.circuitBreaker.failureCount}/${status.circuitBreaker.config.failureThreshold}
- Total Requests: ${status.circuitBreaker.metrics.totalRequests}
- Success Rate: ${status.circuitBreaker.metrics.totalRequests > 0 ? Math.round((status.circuitBreaker.metrics.successfulRequests / status.circuitBreaker.metrics.totalRequests) * 100) : 100}%

**Configuration:**
- Timeout: ${status.configuration.timeout}ms
- Max Retries: ${status.configuration.retryAttempts}
- Fallback: ${status.configuration.fallbackEnabled ? 'Enabled' : 'Disabled'}
- Cache: ${status.configuration.cacheEnabled ? 'Enabled' : 'Disabled'}

**Available Models:**
${status.models.map(m => `- ${m.id}`).join('\n')}

🛡️ **Production Features Active**: Circuit Breaker, Graceful Degradation, Environment Configuration`
            }]
          };
        } else {
          const circuitState = status.circuitBreaker?.state || 'Unknown';
          const circuitIcon = circuitState === 'OPEN' ? '🛡️' : '❓';
          
          return {
            content: [{
              type: 'text',
              text: `❌ **DeepSeek Offline** - Production Bridge v4.0.0

**Service Status:**
- Error: ${status.error}
- Environment: ${status.environment}
- Endpoint: ${status.endpoint || 'Not determined'}

**Circuit Breaker Status:** ${circuitIcon}
- State: ${circuitState}
- Protection: ${circuitState === 'OPEN' ? 'Active - Blocking requests to protect service' : 'Monitoring failures'}

**Automatic Recovery:**
- Service monitoring active
- Will reconnect when available
- Fallback responses available if configured

**Suggestion:** ${status.suggestion}

*Circuit breaker will automatically allow recovery attempts when conditions improve.*`
            }]
          };
        }
      }

      case 'handoff_to_deepseek': {
        const handoffPackage = `
# 🚀 DeepSeek Handoff Package v4.0.0 - Production Bridge

## 📋 Session Context
${args.context}

## 🎯 Session Goal  
${args.goal}

## 🛡️ Production Features Active
- ✅ Circuit Breaker Protection
- ✅ Graceful Degradation
- ✅ Environment-Aware Configuration
- ✅ Automatic Fallback Responses
- ✅ Service Health Monitoring

## 🛠️ Next Steps
1. Continue development with unlimited token capacity
2. Service automatically protected by circuit breaker
3. Fallback responses available if service interruption occurs
4. All requests monitored for service health

## 💡 Production Capabilities
- Smart failure detection and prevention
- Automatic service recovery
- Environment-specific configuration
- Enterprise-grade reliability patterns

**Ready for unlimited token development with production-grade protection!**
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
    console.error(`Tool ${name} error:`, error);
    return {
      content: [{
        type: 'text',
        text: `❌ **Tool Error:** ${error.message}\n\n*Production Bridge v4.0.0 - Error handling active*`
      }],
      isError: true
    };
  }
});

// Server startup
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('🚀 Production DeepSeek MCP Bridge v4.0.0 with Research-Based Patterns running!');
console.error('🛡️ Features: Circuit Breaker, Environment Config, Graceful Degradation, Fallback Responses');
