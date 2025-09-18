// src/enhanced-mcp-server.js
// REFACTOR: Integrate dual bridge with existing MCP infrastructure

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { DualDeepSeekBridge } from './dual-bridge.js';

export class EnhancedMCPServer {
  constructor() {
    this.server = new Server({
      name: 'deepseek-mcp-bridge',
      version: '6.3.0-beta'
    }, {
      capabilities: {
        tools: {}
      }
    });
    
    this.bridge = new DualDeepSeekBridge();
    this.setupTools();
  }

  setupTools() {
    // Enhanced query_deepseek tool with dual endpoint support
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      if (name === 'query_deepseek') {
        return await this.handleQueryDeepSeek(args);
      }
      
      if (name === 'check_deepseek_status') {
        return await this.handleStatusCheck();
      }
      
      // Handle other existing tools...
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    });

    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'query_deepseek',
            description: 'Query DeepSeek with intelligent dual-endpoint routing (local LM Studio + NVIDIA cloud)',
            inputSchema: {
              type: 'object',
              properties: {
                prompt: {
                  type: 'string',
                  description: 'The query or task for DeepSeek'
                },
                context: {
                  type: 'string',
                  description: 'Additional context for the query'
                },
                task_type: {
                  type: 'string',
                  enum: ['coding', 'game_dev', 'analysis', 'architecture', 'debugging'],
                  description: 'Type of task for optimization'
                },
                endpoint_preference: {
                  type: 'string',
                  enum: ['local-first', 'cloud-first', 'local-only', 'cloud-only', 'intelligent'],
                  default: 'intelligent',
                  description: 'Routing preference for dual endpoint system'
                },
                enable_reasoning: {
                  type: 'boolean',
                  default: false,
                  description: 'Enable NVIDIA DeepSeek V3.1 reasoning capabilities'
                }
              },
              required: ['prompt']
            }
          },
          {
            name: 'check_deepseek_status',
            description: 'Check health status of both local and NVIDIA cloud DeepSeek endpoints',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          }
          // ... other existing tools
        ]
      };
    });
  }

  async handleQueryDeepSeek(args) {
    const { 
      prompt, 
      context, 
      task_type, 
      endpoint_preference,
      enable_reasoning 
    } = args;
    
    try {
      const fullPrompt = context ? `${context}\n\n${prompt}` : prompt;
      
      const response = await this.bridge.queryDeepSeek(fullPrompt, {
        endpoint_preference,
        task_complexity: this.classifyTaskComplexity(task_type),
        temperature: this.getTemperatureForTask(task_type),
        enableReasoning: enable_reasoning,
        stream: enable_reasoning // Use streaming for reasoning
      });
      
      const result = {
        content: [{
          type: 'text',
          text: response.content
        }],
        metadata: {
          endpoint_used: response.endpoint,
          has_reasoning: response.hasReasoning,
          fallback_reason: this.bridge.lastFallbackReason
        }
      };
      
      // Include reasoning if available
      if (response.hasReasoning && response.reasoning) {
        result.content.push({
          type: 'text',
          text: `\n\n**Reasoning Process:**\n${response.reasoning}`
        });
      }
      
      return result;
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error: ${error.message}`
        }],
        isError: true
      };
    }
  }

  async handleStatusCheck() {
    const localHealth = await this.bridge.checkLocalHealth();
    const cloudHealth = await this.bridge.checkCloudHealth();
    
    return {
      content: [{
        type: 'text',
        text: `**DeepSeek Dual Endpoint Status**

**Local Endpoint (LM Studio):**
- Status: ${localHealth.status}
- URL: http://172.23.16.1:1234/v1
- Model: deepseek-coder-v2-lite-instruct
${localHealth.error ? `- Error: ${localHealth.error}` : ''}

**Cloud Endpoint (NVIDIA):**
- Status: ${cloudHealth.status}
- URL: https://integrate.api.nvidia.com/v1
- Model: deepseek-ai/deepseek-v3.1
- Features: Reasoning capabilities available
${cloudHealth.error ? `- Error: ${cloudHealth.error}` : ''}

**Routing Strategy:** ${this.bridge.routingStrategy}
**Last Used:** ${this.bridge.lastUsedEndpoint || 'none'}`
      }]
    };
  }

  classifyTaskComplexity(task_type) {
    const complexityMap = {
      'coding': 'moderate',
      'game_dev': 'complex',
      'analysis': 'complex',
      'architecture': 'complex',
      'debugging': 'simple'
    };
    return complexityMap[task_type] || 'moderate';
  }

  getTemperatureForTask(task_type) {
    const temperatureMap = {
      'coding': 0.1,
      'game_dev': 0.3,
      'analysis': 0.2,
      'architecture': 0.2,
      'debugging': 0.1
    };
    return temperatureMap[task_type] || 0.2;
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('Enhanced DeepSeek MCP Bridge with dual endpoints started');
  }
}