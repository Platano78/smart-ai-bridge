# EXTENDING.md

# Smart AI Bridge v1.0.0 - Extension Guide

## 🚀 Adding New AI Providers

### Provider Architecture Overview

The MKG Server uses a modular architecture that makes adding new AI providers straightforward. Each provider is defined in the `endpoints` configuration with specific capabilities and routing logic.

### Step 1: Define Provider Configuration

```javascript
// In smart-ai-bridge.js
// Add to the endpoints object in MechaKingGhidorahRouter constructor

this.endpoints = {
  // Existing endpoints...

  yourNewProvider: {
    name: 'Your-Provider-Name',
    url: 'https://api.yourprovider.com/v1/chat/completions',
    healthUrl: 'https://api.yourprovider.com/health', // Optional
    apiKey: process.env.YOUR_PROVIDER_API_KEY,
    maxTokens: 32768,
    isHealthy: true,
    lastHealthCheck: 0,
    priority: 4, // Set priority order

    // Provider-specific configuration
    specialization: 'your-specialty', // e.g., 'code-generation', 'analysis'
    supportedModels: ['model-1', 'model-2'],
    rateLimit: 100, // requests per minute
    features: ['streaming', 'function-calling'] // supported features
  }
};
```

### Step 2: Implement Provider-Specific Logic

```javascript
// Add provider-specific methods to MechaKingGhidorahRouter class

/**
 * Your Provider specific request formatting
 */
async formatYourProviderRequest(messages, options = {}) {
  return {
    messages: messages,
    model: options.model || 'your-default-model',
    max_tokens: options.max_tokens || this.endpoints.yourNewProvider.maxTokens,
    temperature: options.temperature || 0.1,
    // Add provider-specific parameters
    your_custom_param: options.customParam || 'default-value'
  };
}

/**
 * Your Provider response processing
 */
async processYourProviderResponse(response) {
  try {
    const data = await response.json();

    // Handle provider-specific response format
    if (data.choices && data.choices[0]) {
      return {
        content: data.choices[0].message?.content || data.choices[0].text,
        usage: data.usage,
        model: data.model,
        provider: 'yourNewProvider'
      };
    }

    throw new Error('Invalid response format from Your Provider');
  } catch (error) {
    console.error('Your Provider response processing error:', error);
    throw error;
  }
}
```

### Step 3: Add Health Check Logic

```javascript
// Extend the performComprehensiveHealthCheck method

async performComprehensiveHealthCheck() {
  const healthResults = {};

  for (const [key, endpoint] of Object.entries(this.endpoints)) {
    try {
      let healthUrl = endpoint.healthUrl || endpoint.url;
      let headers = {};

      // Provider-specific health check logic
      if (key === 'yourNewProvider') {
        headers = {
          'Authorization': `Bearer ${endpoint.apiKey}`,
          'Content-Type': 'application/json',
          'X-Custom-Header': 'your-value' // Provider-specific headers
        };

        // Custom health check endpoint
        healthUrl = healthUrl.replace('/v1/chat/completions', '/health');
      }

      const startTime = performance.now();
      const response = await fetch(healthUrl, {
        method: 'GET',
        headers,
        timeout: 5000
      });

      const responseTime = performance.now() - startTime;

      if (response.ok) {
        // Provider-specific health validation
        let details = {};
        if (key === 'yourNewProvider') {
          const healthData = await response.json();
          details = {
            status: healthData.status,
            version: healthData.version,
            available_models: healthData.models?.length || 0
          };
        }

        healthResults[key] = {
          status: 'healthy',
          responseTime: `${responseTime.toFixed(2)}ms`,
          lastCheck: new Date().toISOString(),
          details
        };

        endpoint.isHealthy = true;
        endpoint.lastHealthCheck = Date.now();
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      healthResults[key] = {
        status: 'unhealthy',
        error: error.message,
        lastCheck: new Date().toISOString()
      };
      endpoint.isHealthy = false;
      endpoint.lastHealthCheck = Date.now();
    }
  }

  return healthResults;
}
```

### Step 4: Update Routing Logic

```javascript
// Add routing patterns for your provider
const routingPatterns = {
  // Existing patterns...

  yourSpecialty: {
    patterns: ['your-keyword', 'another-keyword', 'specialty-pattern'],
    preferredEndpoint: 'yourNewProvider',
    minComplexity: 1000, // Token threshold
    description: 'Your provider specialization description'
  }
};

// Update the smart routing logic in selectOptimalEndpoint method
async selectOptimalEndpoint(prompt, options = {}) {
  const complexity = await this.analyzeComplexity(prompt);

  // Check for your provider patterns
  const yourSpecialtyPattern = /your-keyword|another-keyword|specialty-pattern/i;
  if (yourSpecialtyPattern.test(prompt) && this.endpoints.yourNewProvider.isHealthy) {
    console.error(`🎯 Routing to Your Provider for specialty task`);
    return this.endpoints.yourNewProvider;
  }

  // Existing routing logic...
}
```

### Step 5: Environment Configuration

```bash
# Add environment variables for your provider
YOUR_PROVIDER_API_KEY=your-api-key-here
YOUR_PROVIDER_ENDPOINT=https://api.yourprovider.com/v1
YOUR_PROVIDER_MODEL=your-default-model
YOUR_PROVIDER_ENABLED=true
```

### Step 6: Add Provider Tests

Create `tests/your-provider.test.js`:
```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { SmartAIBridgeRouter } from '../smart-ai-bridge.js';

describe('Your Provider Integration', () => {
  let router;

  beforeEach(() => {
    router = new MechaKingGhidorahRouter();
  });

  it('should configure your provider endpoint correctly', () => {
    expect(router.endpoints.yourNewProvider).toBeDefined();
    expect(router.endpoints.yourNewProvider.name).toBe('Your-Provider-Name');
    expect(router.endpoints.yourNewProvider.url).toContain('yourprovider.com');
  });

  it('should format requests for your provider', async () => {
    const messages = [{ role: 'user', content: 'Test message' }];
    const formatted = await router.formatYourProviderRequest(messages);

    expect(formatted.messages).toEqual(messages);
    expect(formatted.model).toBeDefined();
    expect(formatted.max_tokens).toBeGreaterThan(0);
  });

  it('should process your provider responses', async () => {
    const mockResponse = {
      json: async () => ({
        choices: [{
          message: { content: 'Test response' }
        }],
        usage: { total_tokens: 100 },
        model: 'your-model'
      })
    };

    const result = await router.processYourProviderResponse(mockResponse);
    expect(result.content).toBe('Test response');
    expect(result.provider).toBe('yourNewProvider');
  });

  it('should route specialty tasks to your provider', async () => {
    const prompt = 'This is a your-keyword task';
    const endpoint = await router.selectOptimalEndpoint(prompt);

    expect(endpoint.name).toBe('Your-Provider-Name');
  });
});
```

## 🛠️ Adding New Tools

### Tool Structure

MKG Server tools follow a consistent structure with schema definition and implementation:

```javascript
// Tool definition in the tools array
{
  name: 'your_new_tool',
  description: '🔧 Your tool description with capabilities and use cases',
  inputSchema: {
    type: 'object',
    properties: {
      input_param: {
        type: 'string',
        description: 'Description of the parameter'
      },
      optional_param: {
        type: 'string',
        description: 'Optional parameter description',
        default: 'default-value'
      }
    },
    required: ['input_param']
  }
}
```

### Step 1: Define Tool Schema

```javascript
// Add to the tools array in the MCP server setup
{
  name: 'advanced_code_optimizer',
  description: '⚡ Advanced code optimization tool - AI-powered performance analysis with optimization suggestions, memory profiling, and benchmark comparisons.',
  inputSchema: {
    type: 'object',
    properties: {
      code_content: {
        type: 'string',
        description: 'Source code to optimize'
      },
      language: {
        type: 'string',
        description: 'Programming language (auto-detected if not provided)',
        enum: ['javascript', 'python', 'java', 'cpp', 'rust', 'go']
      },
      optimization_focus: {
        type: 'string',
        description: 'Optimization focus area',
        enum: ['performance', 'memory', 'readability', 'maintainability', 'all'],
        default: 'performance'
      },
      target_metrics: {
        type: 'array',
        description: 'Target metrics to improve',
        items: {
          type: 'string',
          enum: ['execution_time', 'memory_usage', 'cpu_usage', 'io_operations']
        }
      },
      include_benchmarks: {
        type: 'boolean',
        description: 'Include performance benchmarks',
        default: false
      }
    },
    required: ['code_content']
  }
}
```

### Step 2: Implement Tool Logic

```javascript
// Add tool implementation to the callTool handler
case 'advanced_code_optimizer':
  try {
    const optimizationResult = await this.performAdvancedOptimization(
      args.code_content,
      args.language,
      args.optimization_focus || 'performance',
      args.target_metrics || [],
      args.include_benchmarks || false
    );

    return {
      content: [{
        type: 'text',
        text: `⚡ **ADVANCED CODE OPTIMIZATION RESULTS**\n\n${optimizationResult}`
      }]
    };
  } catch (error) {
    console.error('Code optimization error:', error);
    throw new McpError(
      ErrorCode.InternalError,
      `Advanced code optimization failed: ${error.message}`
    );
  }
```

### Step 3: Implement Tool Method

```javascript
// Add the implementation method to MechaKingGhidorahRouter class
async performAdvancedOptimization(codeContent, language, optimizationFocus, targetMetrics, includeBenchmarks) {
  try {
    // 1. Detect language if not provided
    const detectedLang = language || await this.detectLanguageWithAI(codeContent);

    // 2. Analyze code complexity and structure
    const complexityAnalysis = await this.analyzeCodeComplexity(codeContent, detectedLang);

    // 3. Generate optimization prompt
    const optimizationPrompt = `
Perform advanced ${optimizationFocus} optimization analysis for this ${detectedLang} code:

\`\`\`${detectedLang}
${codeContent}
\`\`\`

Analysis Requirements:
- Focus: ${optimizationFocus}
- Target Metrics: ${targetMetrics.join(', ') || 'All performance metrics'}
- Language: ${detectedLang}
- Include Benchmarks: ${includeBenchmarks}

Provide:
1. **Performance Bottleneck Analysis**:
   - Line-specific issues with exact line numbers
   - Quantified impact estimates (time, memory, CPU)
   - Algorithmic complexity assessment

2. **Optimization Recommendations**:
   - Specific code improvements with before/after examples
   - Alternative algorithms or data structures
   - Compiler/runtime optimization hints

3. **Implementation Plan**:
   - Priority order for optimizations
   - Expected performance gains
   - Risk assessment for each change

${includeBenchmarks ? `
4. **Benchmark Suggestions**:
   - Performance test scenarios
   - Metrics collection points
   - Before/after measurement strategies
` : ''}

Focus on measurable, actionable improvements with concrete implementation examples.
`;

    // 4. Route to optimal endpoint based on complexity
    const response = await this.routeRequest({
      messages: [{ role: 'user', content: optimizationPrompt }],
      max_tokens: this.calculateOptimalTokens(optimizationPrompt, 'analysis')
    }, 'analysis');

    // 5. Process and enhance response
    const optimizationResult = response.choices[0]?.message?.content || 'Optimization analysis failed';

    // 6. Add tool-specific enhancements
    const enhancedResult = await this.enhanceOptimizationResult(
      optimizationResult,
      detectedLang,
      complexityAnalysis,
      targetMetrics
    );

    return enhancedResult;
  } catch (error) {
    console.error('Advanced optimization error:', error);
    throw error;
  }
}

// Helper method for optimization result enhancement
async enhanceOptimizationResult(result, language, complexity, targetMetrics) {
  const enhancement = `
## 📊 Code Analysis Summary
- **Language**: ${language}
- **Complexity Score**: ${complexity.score}/10
- **Target Metrics**: ${targetMetrics.join(', ') || 'General performance'}
- **Analysis Timestamp**: ${new Date().toISOString()}

${result}

## 🛠️ Tool Integration Suggestions
- Use with \`edit_file\` tool to apply optimizations
- Validate changes with \`validate_changes\` tool
- Monitor improvements with performance profiling
`;

  return enhancement;
}
```

### Step 4: Add Tool Tests

Create `tests/advanced-code-optimizer.test.js`:
```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { SmartAIBridgeRouter } from '../smart-ai-bridge.js';

describe('Advanced Code Optimizer Tool', () => {
  let router;

  beforeEach(() => {
    router = new MechaKingGhidorahRouter();
  });

  it('should optimize JavaScript code', async () => {
    const testCode = `
function inefficientSort(arr) {
  for (let i = 0; i < arr.length; i++) {
    for (let j = 0; j < arr.length - 1; j++) {
      if (arr[j] > arr[j + 1]) {
        let temp = arr[j];
        arr[j] = arr[j + 1];
        arr[j + 1] = temp;
      }
    }
  }
  return arr;
}`;

    const result = await router.performAdvancedOptimization(
      testCode,
      'javascript',
      'performance',
      ['execution_time'],
      true
    );

    expect(result).toContain('optimization');
    expect(result).toContain('performance');
    expect(result).toContain('JavaScript');
  });

  it('should handle different optimization focuses', async () => {
    const testCode = 'console.log("test");';

    const performanceResult = await router.performAdvancedOptimization(
      testCode,
      'javascript',
      'performance',
      []
    );

    const memoryResult = await router.performAdvancedOptimization(
      testCode,
      'javascript',
      'memory',
      []
    );

    expect(performanceResult).toContain('performance');
    expect(memoryResult).toContain('memory');
  });
});
```

## 🔄 Extending Routing Logic

### Custom Routing Strategies

```javascript
// Add custom routing strategy to MechaKingGhidorahRouter

/**
 * Custom routing strategy based on file type and content
 */
async customFileTypeRouting(content, filePath, options = {}) {
  const fileExtension = path.extname(filePath).toLowerCase();
  const fileSize = content.length;

  // Define file-type specific routing
  const fileTypeRouting = {
    '.py': {
      preferredEndpoint: 'nvidiaDeepSeek', // Python analysis specialist
      minTokens: 1000,
      features: ['data-science', 'ml-analysis']
    },
    '.js': {
      preferredEndpoint: 'local', // Fast local processing
      minTokens: 500,
      features: ['web-development', 'node-js']
    },
    '.rs': {
      preferredEndpoint: 'nvidiaQwen', // Systems programming
      minTokens: 1500,
      features: ['systems', 'performance']
    },
    '.sql': {
      preferredEndpoint: 'nvidiaDeepSeek', // Database analysis
      minTokens: 800,
      features: ['database', 'query-optimization']
    }
  };

  const routing = fileTypeRouting[fileExtension];
  if (routing && fileSize > routing.minTokens) {
    const endpoint = this.endpoints[routing.preferredEndpoint];
    if (endpoint && endpoint.isHealthy) {
      console.error(`🎯 Custom file routing: ${fileExtension} → ${endpoint.name}`);
      return endpoint;
    }
  }

  // Fallback to standard routing
  return await this.selectOptimalEndpoint(content, options);
}
```

### Load Balancing Strategy

```javascript
/**
 * Load balancing routing strategy
 */
async loadBalancedRouting(content, options = {}) {
  const healthyEndpoints = Object.entries(this.endpoints)
    .filter(([key, endpoint]) => endpoint.isHealthy)
    .sort((a, b) => a[1].priority - b[1].priority);

  if (healthyEndpoints.length === 0) {
    throw new Error('No healthy endpoints available');
  }

  // Simple round-robin load balancing
  if (!this.lastUsedEndpoint) {
    this.lastUsedEndpoint = 0;
  }

  this.lastUsedEndpoint = (this.lastUsedEndpoint + 1) % healthyEndpoints.length;
  const [key, endpoint] = healthyEndpoints[this.lastUsedEndpoint];

  console.error(`⚖️ Load balanced routing: → ${endpoint.name}`);
  return endpoint;
}
```

## 📊 Adding Metrics and Monitoring

### Custom Metrics Collection

```javascript
// Add to MechaKingGhidorahRouter constructor
this.customMetrics = {
  toolUsage: {},
  providerPerformance: {},
  errorRates: {},
  userPatterns: {}
};

// Method to track tool usage
trackToolUsage(toolName, executionTime, success = true) {
  if (!this.customMetrics.toolUsage[toolName]) {
    this.customMetrics.toolUsage[toolName] = {
      count: 0,
      totalTime: 0,
      successCount: 0,
      errorCount: 0
    };
  }

  const metrics = this.customMetrics.toolUsage[toolName];
  metrics.count++;
  metrics.totalTime += executionTime;

  if (success) {
    metrics.successCount++;
  } else {
    metrics.errorCount++;
  }
}

// Method to get comprehensive metrics
getCustomMetrics() {
  return {
    toolUsage: Object.entries(this.customMetrics.toolUsage).map(([tool, metrics]) => ({
      tool,
      usage: metrics.count,
      averageTime: metrics.count > 0 ? (metrics.totalTime / metrics.count).toFixed(2) + 'ms' : '0ms',
      successRate: metrics.count > 0 ? ((metrics.successCount / metrics.count) * 100).toFixed(1) + '%' : '0%'
    })),
    totalRequests: this.metrics.totalRequests,
    routingDecisions: this.metrics.routingDecisions,
    timestamp: new Date().toISOString()
  };
}
```

## 🔌 Plugin System

### Plugin Architecture

```javascript
// Plugin interface
class MKGPlugin {
  constructor(config = {}) {
    this.config = config;
    this.name = 'base-plugin';
    this.version = '1.0.0';
  }

  // Plugin lifecycle methods
  async init(router) {
    this.router = router;
  }

  async beforeRequest(request) {
    return request;
  }

  async afterResponse(response) {
    return response;
  }

  async onError(error) {
    return error;
  }
}

// Example plugin: Response Caching
class ResponseCachingPlugin extends MKGPlugin {
  constructor(config = {}) {
    super(config);
    this.name = 'response-caching';
    this.cache = new Map();
    this.ttl = config.ttl || 300000; // 5 minutes
  }

  async beforeRequest(request) {
    const cacheKey = this.generateCacheKey(request);
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.ttl) {
      console.log(`🔄 Cache hit for request: ${cacheKey}`);
      request.cachedResponse = cached.response;
    }

    return request;
  }

  async afterResponse(response, request) {
    if (!request.cachedResponse) {
      const cacheKey = this.generateCacheKey(request);
      this.cache.set(cacheKey, {
        response: response,
        timestamp: Date.now()
      });
    }

    return response;
  }

  generateCacheKey(request) {
    const content = JSON.stringify(request.messages || request);
    return crypto.createHash('md5').update(content).digest('hex');
  }
}

// Plugin registration
class PluginManager {
  constructor() {
    this.plugins = [];
  }

  register(plugin) {
    this.plugins.push(plugin);
  }

  async init(router) {
    for (const plugin of this.plugins) {
      await plugin.init(router);
    }
  }

  async beforeRequest(request) {
    for (const plugin of this.plugins) {
      request = await plugin.beforeRequest(request);
    }
    return request;
  }

  async afterResponse(response, request) {
    for (const plugin of this.plugins) {
      response = await plugin.afterResponse(response, request);
    }
    return response;
  }
}
```

This extension guide provides a comprehensive framework for extending the MKG Server with new providers, tools, routing strategies, and plugins. Each section includes practical examples and test cases to ensure reliable implementation.