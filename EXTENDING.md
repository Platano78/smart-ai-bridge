# EXTENDING.md

# Smart AI Bridge v1.6.0 - Extension Guide

## 🚀 Adding New AI Providers

### Provider Architecture Overview

The Smart AI Bridge uses a modular architecture that makes adding new AI providers straightforward. Each provider is defined in the `endpoints` configuration with specific capabilities and routing logic.

### Step 1: Define Provider Configuration

```javascript
// In smart-ai-bridge.js
// Add to the endpoints object in SmartAIBridgeRouter constructor

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
// Add provider-specific methods to SmartAIBridgeRouter class

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
    router = new SmartAIBridgeRouter();
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

Smart AI Bridge tools follow a consistent structure with schema definition and implementation:

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

### Current Tool Categories (v1.6.0)

| Category       | Tools                                                                                     | Version |
|----------------|-------------------------------------------------------------------------------------------|---------|
| Infrastructure | `health`, `backup_restore`, `write_files_atomic`, `rate_limit_status`, `system_metrics`   | v1.0+   |
| AI Routing     | `ask`, `spawn_subagent`                                                                   | v1.3.0  |
| Token-Saving   | `analyze_file`, `modify_file`, `batch_modify`                                             | v1.4.0  |
| Workflows      | `council`, `dual_iterate`, `parallel_agents`                                              | v1.5.0  |
| Intelligence   | `pattern_search`, `pattern_add`, `playbook_list`, `playbook_run`, `playbook_step`, `learning_summary` | v1.6.0  |

### Step 1: Define Tool Schema

Example using the token-saving `analyze_file` tool pattern (v1.4.0+):

```javascript
// Add to the tools array in the MCP server setup
{
  name: 'analyze_file',
  description: '📊 Local LLM File Analysis - Reads and analyzes files using local LLM. Claude never sees full file content, only structured findings. Token savings: 2000+ → ~150 tokens per file.',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Path to the file to analyze'
      },
      question: {
        type: 'string',
        description: 'Question about the file (e.g., "What are the security vulnerabilities?")'
      },
      options: {
        type: 'object',
        properties: {
          analysisType: {
            type: 'string',
            description: 'Type of analysis to perform',
            enum: ['general', 'bug', 'security', 'performance', 'architecture'],
            default: 'general'
          },
          backend: {
            type: 'string',
            description: 'AI backend to use for analysis',
            enum: ['auto', 'local', 'deepseek', 'qwen3', 'gemini', 'groq'],
            default: 'auto'
          },
          includeContext: {
            type: 'array',
            items: { type: 'string' },
            description: 'Related files to include for better analysis'
          },
          maxResponseTokens: {
            type: 'number',
            description: 'Maximum tokens for the analysis response',
            default: 2000
          }
        }
      }
    },
    required: ['filePath', 'question']
  }
}
```

### Step 2: Implement Tool Logic

```javascript
// Add tool implementation to the callTool handler
case 'analyze_file':
  try {
    // Read file content locally (never sent to Claude)
    const fileContent = await fs.readFile(args.filePath, 'utf-8');

    // Route to local LLM for analysis
    const analysisResult = await this.routeToLocalLLM({
      prompt: `Analyze this file and answer: ${args.question}\n\nFile content:\n${fileContent}`,
      options: args.options || {}
    });

    // Return only structured findings (saves ~90% tokens)
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          file: args.filePath,
          question: args.question,
          findings: analysisResult.findings,
          recommendations: analysisResult.recommendations,
          severity: analysisResult.severity,
          backendUsed: analysisResult.backend
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('File analysis error:', error);
    throw new McpError(
      ErrorCode.InternalError,
      `File analysis failed: ${error.message}`
    );
  }
```

### Step 3: Implement Tool Method

```javascript
// Add the implementation method to SmartAIBridgeRouter class
async routeToLocalLLM(params) {
  try {
    const { prompt, options = {} } = params;

    // 1. Select backend based on options or auto-routing
    const backend = options.backend || 'auto';
    const endpoint = await this.selectBackend(backend, prompt);

    // 2. Prepare request for local LLM
    const request = {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: options.maxResponseTokens || 2000,
      temperature: 0.1
    };

    // 3. Make request to selected backend
    const startTime = performance.now();
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${endpoint.apiKey}`
      },
      body: JSON.stringify(request)
    });

    const responseTime = performance.now() - startTime;

    // 4. Parse and structure the response
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // 5. Parse structured findings from LLM response
    const findings = this.parseFindings(content, options.analysisType);

    return {
      findings: findings.issues,
      recommendations: findings.recommendations,
      severity: findings.severity,
      backend: endpoint.name,
      responseTime: `${responseTime.toFixed(0)}ms`,
      tokensUsed: data.usage?.total_tokens || 0
    };
  } catch (error) {
    console.error('Local LLM routing error:', error);
    throw error;
  }
}

// Helper method to parse structured findings
parseFindings(content, analysisType = 'general') {
  // Extract issues, recommendations, and severity from LLM response
  const lines = content.split('\n');
  const issues = [];
  const recommendations = [];
  let severity = 'info';

  for (const line of lines) {
    if (line.match(/error|critical|bug|vulnerability/i)) {
      issues.push(line.trim());
      severity = 'high';
    } else if (line.match(/warning|concern|issue/i)) {
      issues.push(line.trim());
      if (severity === 'info') severity = 'medium';
    } else if (line.match(/recommend|suggest|should|consider/i)) {
      recommendations.push(line.trim());
    }
  }

  return { issues, recommendations, severity };
}
```

### Step 4: Add Tool Tests

Create `tests/analyze-file.test.js`:
```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SmartAIBridgeRouter } from '../smart-ai-bridge.js';

describe('Analyze File Tool', () => {
  let router;

  beforeEach(() => {
    router = new SmartAIBridgeRouter();
  });

  it('should analyze file and return structured findings', async () => {
    // Mock file read and LLM response
    const mockFileContent = `
function processUserInput(input) {
  eval(input); // Security vulnerability
  return input;
}`;

    const result = await router.routeToLocalLLM({
      prompt: `Analyze this file for security issues:\n${mockFileContent}`,
      options: { analysisType: 'security' }
    });

    expect(result.findings).toBeDefined();
    expect(result.severity).toBeDefined();
    expect(result.backend).toBeDefined();
  });

  it('should route to correct backend based on options', async () => {
    const result = await router.routeToLocalLLM({
      prompt: 'Test prompt',
      options: { backend: 'local' }
    });

    expect(result.backend).toContain('local');
  });

  it('should parse findings correctly', () => {
    const content = `
Found critical error in line 5: SQL injection vulnerability.
Warning: Input not sanitized.
Recommend using parameterized queries.
`;

    const findings = router.parseFindings(content, 'security');

    expect(findings.issues.length).toBeGreaterThan(0);
    expect(findings.recommendations.length).toBeGreaterThan(0);
    expect(findings.severity).toBe('high');
  });
});
```

## 🔄 Extending Routing Logic

### Custom Routing Strategies

```javascript
// Add custom routing strategy to SmartAIBridgeRouter

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
// Add to SmartAIBridgeRouter constructor
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
class SmartAIBridgePlugin {
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
class ResponseCachingPlugin extends SmartAIBridgePlugin {
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

This extension guide provides a comprehensive framework for extending Smart AI Bridge v1.6.0 with new providers, tools, routing strategies, and plugins. Each section includes practical examples and test cases to ensure reliable implementation.

**Deprecated tools removed in v1.6.0:** `review`, `read`, `edit_file`, `validate_changes`, `multi_edit`. Use `analyze_file`, `modify_file`, and `batch_modify` instead for token-efficient operations.