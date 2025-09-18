// src/enhanced-triple-mcp-server.js
// GREEN PHASE: Enhanced MCP Server with triple endpoint support

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { TripleDeepSeekBridge } from './triple-bridge.js';
import { sanitizeForJSON, createMCPResponse, validateJSONResponse } from './json-sanitizer.js';

export class EnhancedTripleMCPServer {
  constructor() {
    this.server = new Server({
      name: 'deepseek-mcp-bridge',
      version: '7.0.0'
    }, {
      capabilities: {
        tools: {}
      }
    });
    
    this.bridge = new TripleDeepSeekBridge();
    this.setupTools();
  }

  async getToolList() {
    const response = await this.server.request(ListToolsRequestSchema, {});
    return response.tools;
  }

  setupTools() {
    // Enhanced query_deepseek tool with triple endpoint support
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        let result;
        
        if (name === 'query_deepseek') {
          result = await this.handleEnhancedQuery(args);
        } else if (name === 'check_deepseek_status') {
          result = await this.handleTripleStatus();
        } else if (name === 'route_to_endpoint') {
          result = await this.handleDirectRouting(args);
        } else if (name === 'compare_endpoints') {
          result = await this.handleEndpointComparison(args);
        } else {
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
        
        // Ensure JSON compliance for Claude Desktop
        if (result && result.content && Array.isArray(result.content)) {
          result.content = result.content.map(item => {
            if (item.type === 'text' && item.text) {
              return {
                ...item,
                text: sanitizeForJSON(item.text)
              };
            }
            return item;
          });
        }
        
        // Validate the response is JSON-compliant
        if (!validateJSONResponse(result)) {
          throw new Error('Response failed JSON validation');
        }
        
        return result;
      } catch (error) {
        return createMCPResponse(`Tool execution failed: ${error.message}`, true);
      }
    });

    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'query_deepseek',
            description: 'Smart AI query with automatic endpoint routing based on task specialization. Routes coding tasks to Qwen 3 Coder 480B, math/analysis to DeepSeek V3, unlimited tokens to local DeepSeek.',
            inputSchema: {
              type: 'object',
              properties: {
                prompt: { 
                  type: 'string', 
                  description: 'Your question or task' 
                },
                context: {
                  type: 'string',
                  description: 'Additional context for the query'
                },
                task_type: { 
                  type: 'string', 
                  enum: ['coding', 'debugging', 'refactoring', 'game_dev', 'analysis', 'architecture', 'math', 'unlimited', 'general'],
                  description: 'Task type for optimal endpoint selection' 
                },
                endpoint_preference: {
                  type: 'string',
                  enum: ['local', 'nvidia_deepseek', 'nvidia_qwen', 'auto'],
                  description: 'Force specific endpoint (auto = smart routing)'
                },
                temperature: { 
                  type: 'number', 
                  description: 'Response creativity (0.1-1.0)' 
                }
              },
              required: ['prompt']
            }
          },
          {
            name: 'check_deepseek_status',
            description: 'Check status of all three AI endpoints: Local DeepSeek, NVIDIA DeepSeek V3, and NVIDIA Qwen 3 Coder 480B',
            inputSchema: { 
              type: 'object', 
              properties: {} 
            }
          },
          {
            name: 'route_to_endpoint',
            description: 'Directly query a specific endpoint with full control',
            inputSchema: {
              type: 'object',
              properties: {
                endpoint: { 
                  type: 'string', 
                  enum: ['local', 'nvidia_deepseek', 'nvidia_qwen'],
                  description: 'Specific endpoint to use' 
                },
                prompt: { 
                  type: 'string', 
                  description: 'Query for the endpoint' 
                }
              },
              required: ['endpoint', 'prompt']
            }
          },
          {
            name: 'compare_endpoints',
            description: 'Run the same prompt on multiple endpoints for comparison',
            inputSchema: {
              type: 'object',
              properties: {
                prompt: { 
                  type: 'string', 
                  description: 'Prompt to test on all endpoints' 
                },
                endpoints: {
                  type: 'array',
                  items: { 
                    type: 'string', 
                    enum: ['local', 'nvidia_deepseek', 'nvidia_qwen'] 
                  },
                  description: 'Endpoints to compare (default: all)'
                }
              },
              required: ['prompt']
            }
          }
        ]
      };
    });
  }

  async handleEnhancedQuery(args) {
    const { 
      prompt, 
      context, 
      task_type, 
      endpoint_preference,
      temperature 
    } = args;
    
    try {
      const fullPrompt = context ? `${context}\n\n${prompt}` : prompt;
      
      const response = await this.bridge.handleEnhancedQuery({
        prompt: fullPrompt,
        task_type,
        endpoint_preference,
        temperature
      });
      
      return response;
    } catch (error) {
      return createMCPResponse(`Error: ${error.message}`, true);
    }
  }

  async handleTripleStatus() {
    return await this.bridge.handleTripleStatus();
  }

  async handleDirectRouting(args) {
    return await this.bridge.handleDirectRouting(args);
  }

  async handleEndpointComparison(args) {
    return await this.bridge.handleEndpointComparison(args);
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    // Enhanced Triple Endpoint DeepSeek MCP Bridge v7.0.0 started
  }
}