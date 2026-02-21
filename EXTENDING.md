# Smart AI Bridge v2.0.0 - Extension Guide

## Adding New Backends

### Overview

Smart AI Bridge v2.0.0 uses a config-driven backend system. Adding a new backend requires:

1. Creating an adapter class (or reusing an existing one like `openai`)
2. Registering it in `src/config/backends.json`
3. Optionally adding to the adapter class mapping

### Method 1: OpenAI-Compatible Backends (No Code Required)

Any API that follows the OpenAI chat completions format can be added purely through configuration. The `openai` adapter type handles standard `/v1/chat/completions` endpoints.

**Step 1: Add to `src/config/backends.json`**

```json
{
  "backends": {
    "my_custom_api": {
      "type": "openai",
      "enabled": true,
      "priority": 7,
      "description": "My custom OpenAI-compatible endpoint",
      "capabilities": ["code_specialized"],
      "context_limit": 32768,
      "config": {
        "url": "https://api.example.com/v1/chat/completions",
        "apiKey": "$MY_CUSTOM_API_KEY",
        "model": "my-model-name",
        "maxTokens": 32768,
        "timeout": 60000
      }
    }
  }
}
```

**Step 2: Set the API key**

```bash
export MY_CUSTOM_API_KEY="your-api-key"
```

**Step 3: Restart Smart AI Bridge**

The `BackendRegistry` loads the new backend at startup. It will use the `OpenAIAdapter` class automatically.

### Method 2: Dynamic Registration via Dashboard/API

The `BackendRegistry` supports runtime backend addition:

```javascript
const registry = backendRegistry;

registry.addBackend({
  name: 'azure_openai',
  type: 'openai',
  url: 'https://my-resource.openai.azure.com/openai/deployments/gpt-4/chat/completions?api-version=2024-02-15-preview',
  apiKey: process.env.AZURE_OPENAI_KEY,
  model: 'gpt-4',
  maxTokens: 8192,
  timeout: 60000,
  priority: 7,
  description: 'Azure OpenAI GPT-4'
});
```

This persists the backend to `backends.json` automatically via `registry.saveConfig()`.

### Method 3: Custom Adapter Class

For APIs with non-standard formats, create a new adapter class.

**Step 1: Create the adapter in `src/backends/`**

```javascript
// src/backends/custom-adapter.js
import { BackendAdapter } from './backend-adapter.js';

export class CustomAdapter extends BackendAdapter {
  constructor(config = {}) {
    super(config);
    this.url = config.url || 'https://api.custom.com/generate';
    this.apiKey = config.apiKey || process.env.CUSTOM_API_KEY;
    this.model = config.model || 'custom-model';
  }

  /**
   * Execute a prompt against this backend
   * @param {string} prompt - The prompt to send
   * @param {Object} [options] - Request options
   * @returns {Promise<Object>} - { content, tokens, latency }
   */
  async execute(prompt, options = {}) {
    const startTime = Date.now();

    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: options.max_tokens || this.config.maxTokens || 4096,
        temperature: options.temperature || 0.1
      }),
      signal: AbortSignal.timeout(this.config.timeout || 60000)
    });

    if (!response.ok) {
      throw new Error(`Custom API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const latency = Date.now() - startTime;

    return {
      content: data.choices?.[0]?.message?.content || data.output || '',
      tokens: data.usage?.total_tokens || 0,
      latency
    };
  }

  /**
   * Check backend health
   * @returns {Promise<Object>} - { healthy, latency, model }
   */
  async checkHealth() {
    try {
      const startTime = Date.now();
      const response = await fetch(this.url.replace('/generate', '/health'), {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(5000)
      });
      const latency = Date.now() - startTime;

      this.lastHealth = {
        healthy: response.ok,
        latency,
        model: this.model,
        timestamp: Date.now()
      };
      return this.lastHealth;
    } catch (error) {
      this.lastHealth = { healthy: false, error: error.message, timestamp: Date.now() };
      return this.lastHealth;
    }
  }
}
```

**Step 2: Register the adapter type in `src/backends/backend-registry.js`**

Add the import and mapping:

```javascript
import { CustomAdapter } from './custom-adapter.js';

const ADAPTER_CLASSES = {
  'local': LocalAdapter,
  'nvidia_deepseek': NvidiaDeepSeekAdapter,
  'nvidia_qwen': NvidiaQwenAdapter,
  'gemini': GeminiAdapter,
  'openai': OpenAIAdapter,
  'groq': GroqAdapter,
  'custom': CustomAdapter        // Add this line
};
```

**Step 3: Add configuration to `backends.json`**

```json
{
  "my_custom": {
    "type": "custom",
    "enabled": true,
    "priority": 7,
    "description": "My custom backend",
    "config": {
      "url": "https://api.custom.com/generate",
      "apiKey": "$CUSTOM_API_KEY",
      "model": "custom-model",
      "maxTokens": 16384,
      "timeout": 60000
    }
  }
}
```

## Adding New Tools

Adding a new tool requires three steps: define the tool schema, implement the handler, and register the mapping.

### Step 1: Define the Tool Schema

Add a new entry to the `CORE_TOOL_DEFINITIONS` array in `src/tools/tool-definitions.js`:

```javascript
{
  name: 'my_new_tool',
  description: 'Description of what the tool does -- shown to Claude for tool selection.',
  handler: 'handleMyNewTool',
  schema: {
    type: 'object',
    properties: {
      input_param: {
        type: 'string',
        description: 'Description of this parameter'
      },
      optional_param: {
        type: 'number',
        default: 10,
        description: 'Optional parameter with default'
      },
      options: {
        type: 'object',
        properties: {
          backend: {
            type: 'string',
            enum: ['auto', 'local', 'nvidia_deepseek', 'nvidia_qwen', 'gemini', 'openai', 'groq'],
            default: 'auto',
            description: 'AI backend to use'
          }
        }
      }
    },
    required: ['input_param']
  }
}
```

The `handler` field maps this tool to a handler name in the `HANDLER_REGISTRY`.

### Step 2: Implement the Handler

Create a new handler class extending `BaseHandler` in `src/handlers/`:

```javascript
// src/handlers/my-new-tool-handler.js
import { BaseHandler } from './base-handler.js';

export class MyNewToolHandler extends BaseHandler {
  /**
   * Execute the tool
   * @param {Object} args - Arguments matching the tool schema
   * @returns {Promise<Object>}
   */
  async execute(args) {
    const { input_param, optional_param = 10, options = {} } = args;

    // Use the router to make AI requests
    const backend = options.backend || 'auto';
    const selectedBackend = await this.routeRequest(input_param, {
      backend,
      forceBackend: backend !== 'auto' ? backend : undefined
    });

    // Make the AI request
    const result = await this.makeRequest(
      `Process this: ${input_param}`,
      selectedBackend,
      { max_tokens: optional_param * 100 }
    );

    // Record for learning engine
    await this.recordLearningOutcome(
      true,
      result.content?.length || 0,
      result.backend,
      { taskType: 'my_task_type' }
    );

    // Return structured response
    return this.buildSuccessResponse({
      result: result.content,
      backend_used: result.backend,
      tokens_saved: this.estimateTokens(input_param) - this.estimateTokens(result.content)
    });
  }
}
```

### BaseHandler Capabilities

Every handler inherits these methods from `BaseHandler`:

| Method | Description |
|--------|-------------|
| `this.routeRequest(prompt, options)` | Route through 4-tier MultiAIRouter |
| `this.makeRequest(prompt, backend, options)` | Send prompt to specific backend with fallback |
| `this.estimateTokens(text)` | Estimate token count (4 chars = 1 token) |
| `this.detectLanguage(content)` | Detect programming language from content |
| `this.calculateStringSimilarity(a, b)` | Levenshtein-based similarity score (0-1) |
| `this.recordExecution(result, context)` | Record execution for playbook learning |
| `this.recordLearningOutcome(success, length, backend, ctx)` | Feed into compound learning engine |
| `this.buildSuccessResponse(data)` | Build standardized success response |
| `this.buildErrorResponse(error, context)` | Build standardized error response |

Handler context properties:

| Property | Description |
|----------|-------------|
| `this.router` | MultiAIRouter instance |
| `this.server` | Server instance (backendRegistry, VERSION) |
| `this.playbook` | PlaybookSystem instance |
| `this.context` | Full handler context object |

### Step 3: Register the Handler

Add the import and registry mapping in `src/handlers/index.js`:

```javascript
// Add import
import { MyNewToolHandler } from './my-new-tool-handler.js';

// Add to HANDLER_REGISTRY
const HANDLER_REGISTRY = {
  // ... existing handlers ...
  'handleMyNewTool': MyNewToolHandler
};

// Add to exports
export {
  // ... existing exports ...
  MyNewToolHandler
};
```

That is the complete process. The `server.js` entry point automatically:
1. Reads `CORE_TOOL_DEFINITIONS` to build the tool list for `ListTools`
2. Maps each tool's `name` to its `handler` string
3. Uses `HandlerFactory.execute(handlerName, args)` to instantiate and run the handler

### How the Wiring Works

```
Tool Call: "my_new_tool"
    |
    v
server.js: toolToHandler.get("my_new_tool") -> "handleMyNewTool"
    |
    v
HandlerFactory.execute("handleMyNewTool", args)
    |
    v
HANDLER_REGISTRY["handleMyNewTool"] -> MyNewToolHandler
    |
    v
new MyNewToolHandler(context).execute(args)
```

## Adding New Subagent Roles

Subagent roles are defined in `src/config/role-templates.js`. Each role has a system prompt, output format, and default backend.

### Step 1: Add Role Template

```javascript
// In src/config/role-templates.js
export const ROLE_TEMPLATES = {
  // ... existing roles ...

  'my-custom-role': {
    name: 'My Custom Role',
    description: 'What this role does',
    systemPrompt: `You are a specialized AI agent focused on [specialty].
Your task is to [detailed instructions].
Return your analysis as structured JSON with the following fields:
- findings: array of specific findings
- severity: overall severity (low/medium/high/critical)
- recommendations: array of actionable recommendations`,
    outputFormat: 'structured',
    defaultBackend: 'nvidia_deepseek',
    verdictFields: ['findings', 'severity', 'recommendations']
  }
};
```

### Step 2: Update Tool Schema

Add the new role to the `spawn_subagent` tool's `role` enum in `src/tools/tool-definitions.js`:

```javascript
role: {
  type: 'string',
  enum: [
    'code-reviewer', 'security-auditor', 'planner',
    'refactor-specialist', 'test-generator', 'documentation-writer',
    'tdd-decomposer', 'tdd-test-writer', 'tdd-implementer',
    'tdd-quality-reviewer',
    'my-custom-role'  // Add here
  ]
}
```

## Extending the Router

### Custom Routing Rules

The `MultiAIRouter` in `src/router.js` applies rule-based routing in Tier 3. To add custom rules:

```javascript
// In src/router.js, extend _applyRuleBasedRouting
async _applyRuleBasedRouting(context) {
  const backends = await this.registry.checkHealth();

  // Custom rule: Security tasks -> nvidia_deepseek
  if (context.taskType === 'security' && backends.nvidia_deepseek?.healthy) {
    return 'nvidia_deepseek';
  }

  // Custom rule: Documentation -> gemini (fast)
  if (context.taskType === 'documentation' && backends.gemini?.healthy) {
    return 'gemini';
  }

  // Existing rules
  if (context.complexity === 'complex' && backends.nvidia_qwen?.healthy) {
    return 'nvidia_qwen';
  }
  if (context.taskType === 'code' && backends.nvidia_deepseek?.healthy) {
    return 'nvidia_deepseek';
  }

  return null;
}
```

### Custom Context Extraction

Extend `_extractContext` to detect additional task types:

```javascript
_extractContext(prompt, options) {
  // ... existing logic ...

  // Add custom task type detection
  if (lower.includes('security') || lower.includes('vulnerability') || lower.includes('audit')) {
    taskType = 'security';
  } else if (lower.includes('document') || lower.includes('readme') || lower.includes('guide')) {
    taskType = 'documentation';
  }

  return { complexity, taskType, promptLength: prompt.length, maxTokens: options.max_tokens || 2048 };
}
```

## Current Tool Categories (v2.0.0)

| Category | Tools | Count |
|----------|-------|-------|
| Token-Saving | `analyze_file`, `modify_file`, `batch_analyze`, `batch_modify`, `generate_file`, `explore`, `read` | 7 |
| Multi-AI Workflows | `ask`, `council`, `dual_iterate`, `parallel_agents`, `spawn_subagent` | 5 |
| Code Quality | `review`, `refactor`, `validate_changes` | 3 |
| Infrastructure | `check_backend_health`, `backup_restore`, `write_files_atomic`, `manage_conversation`, `get_analytics` | 5 |
| **Total** | | **20** |

## Current Adapter Types

| Type | Adapter Class | File |
|------|---------------|------|
| `local` | LocalAdapter | `src/backends/local-adapter.js` |
| `nvidia_deepseek` | NvidiaDeepSeekAdapter | `src/backends/nvidia-adapter.js` |
| `nvidia_qwen` | NvidiaQwenAdapter | `src/backends/nvidia-adapter.js` |
| `gemini` | GeminiAdapter | `src/backends/gemini-adapter.js` |
| `openai` | OpenAIAdapter | `src/backends/openai-adapter.js` |
| `groq` | GroqAdapter | `src/backends/groq-adapter.js` |

Any type not in this mapping defaults to `OpenAIAdapter`, which works for standard OpenAI-compatible APIs.

## Testing Extensions

### Testing a New Handler

```javascript
import { MyNewToolHandler } from '../src/handlers/my-new-tool-handler.js';

// Create mock context
const mockContext = {
  router: {
    routeRequest: async () => 'local',
    makeRequest: async (prompt) => ({
      content: 'Mock response',
      backend: 'local',
      tokens: 50
    }),
    makeRequestWithFallback: async (prompt) => ({
      content: 'Mock response',
      backend: 'local',
      tokens: 50
    })
  },
  server: { backendRegistry: {}, VERSION: '2.0.0' },
  playbook: { postExecutionReflection: async () => {} }
};

const handler = new MyNewToolHandler(mockContext);
const result = await handler.execute({ input_param: 'test' });
console.log(result);
```

### Testing a New Backend

```bash
# Verify the backend loads
node -e "
  import('./src/backends/backend-registry.js').then(m => {
    const registry = new m.BackendRegistry();
    console.log('Backends:', registry.getEnabledBackends());
    console.log('Stats:', registry.getStats());
  });
"
```
