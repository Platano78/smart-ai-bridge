#!/usr/bin/env node

/**
 * MCP-Compliant Deepseek Bridge Server
 * Fully compliant with MCP 2025-06-18 specification
 * Enhanced with expert tool descriptions and workflow patterns
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

const DEEPSEEK_BASE_URL = "http://172.19.224.1:1234/v1";

class DeepseekBridge {
  constructor() {
    this.baseURL = DEEPSEEK_BASE_URL;
    this.availableModels = [
      "deepseek-coder-v2-lite-instruct",
      "local/deepseek-coder@q4_k_m"
    ];
    this.connectionStatus = 'unknown';
  }

  async validateConnection() {
    try {
      const response = await fetch(`${this.baseURL.replace('/v1', '')}/v1/models`, {
        signal: AbortSignal.timeout(5000)
      });
      
      if (!response.ok) {
        this.connectionStatus = 'error';
        throw new McpError(
          ErrorCode.InternalError,
          `Deepseek server returned ${response.status}: ${response.statusText}`
        );
      }
      
      this.connectionStatus = 'connected';
      return await response.json();
    } catch (error) {
      this.connectionStatus = 'offline';
      if (error.name === 'TimeoutError') {
        throw new McpError(
          ErrorCode.InternalError,
          'Connection timeout - ensure LM Studio is running and accessible'
        );
      }
      throw new McpError(
        ErrorCode.InternalError,
        `Connection failed: ${error.message}`
      );
    }
  }

  async queryDeepseek(prompt, options = {}) {
    const {
      model = "deepseek-coder-v2-lite-instruct",
      temperature = 0.1,
      maxTokens = -1,
      context = "",
      taskType = "coding"
    } = options;

    // Validate inputs
    if (!prompt || typeof prompt !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Prompt must be a non-empty string'
      );
    }

    if (!this.availableModels.includes(model)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Model "${model}" not available. Valid models: ${this.availableModels.join(', ')}`
      );
    }

    try {
      const systemPrompt = this.getSystemPrompt(taskType);
      const fullPrompt = context ? `Context: ${context}\n\nQuery: ${prompt}` : prompt;

      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: fullPrompt }
          ],
          temperature: Math.max(0, Math.min(2, temperature)), // Clamp temperature
          max_tokens: maxTokens,
          stream: false
        }),
        signal: AbortSignal.timeout(60000) // 60s timeout for complex queries
      });

      if (!response.ok) {
        throw new McpError(
          ErrorCode.InternalError,
          `Deepseek API error: ${response.status} - ${response.statusText}`
        );
      }

      const data = await response.json();
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new McpError(
          ErrorCode.InternalError,
          'Invalid response format from Deepseek API'
        );
      }

      const reply = data.choices[0].message.content;

      return {
        content: [
          {
            type: 'text',
            text: `🤖 **Deepseek Response** (${model})\n\n${reply}\n\n---\n*Generated locally with unlimited tokens*`
          }
        ]
      };
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      
      // Convert other errors to MCP errors
      throw new McpError(
        ErrorCode.InternalError,
        `Deepseek query failed: ${error.message}`
      );
    }
  }

  async checkStatus() {
    try {
      const data = await this.validateConnection();
      
      return {
        content: [
          {
            type: 'text',
            text: `✅ **Deepseek Status: ONLINE**\n\nEndpoint: ${this.baseURL}\nModels Available:\n${data.data?.map(m => `• ${m.id}`).join('\n') || 'No models found'}\n\n🚀 Ready for unlimited token conversations!\n\n**Connection Status:** ${this.connectionStatus}\n**Network:** WSL → Windows bridge operational`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ **Deepseek Status: OFFLINE**\n\nError: ${error.message}\nEndpoint: ${this.baseURL}\n\n🔧 **Troubleshooting Steps:**\n1. Start LM Studio\n2. Load Deepseek model\n3. Start server with binding 0.0.0.0:1234\n4. Verify Windows firewall allows connections\n5. Test connection: curl ${this.baseURL}/models`
          }
        ]
      };
    }
  }

  async startUnlimitedSession(context, goal) {
    if (!context || !goal) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Both context and goal are required for session handoff'
      );
    }

    try {
      // Validate connection before handoff
      await this.validateConnection();

      const handoffPrompt = `**SESSION HANDOFF FROM CLAUDE CODE**

**Goal:** ${goal}

**Context:**
${context}

**Instructions:** You are now taking over from Claude Code for unlimited token development. Continue this session with comprehensive, detailed responses without any token limitations.

**Your Capabilities:**
- Unlimited response length
- Deep architectural discussions  
- Complete code implementations
- Thorough debugging sessions
- Detailed design decisions

Please acknowledge this handoff and indicate your readiness to continue.`;

      const response = await this.queryDeepseek(handoffPrompt, {
        taskType: 'handoff',
        maxTokens: -1
      });

      return {
        content: [
          {
            type: 'text',
            text: `🔄 **Session Handoff to Deepseek Initiated**\n\n**Goal:** ${goal}\n\n${response.content[0].text}\n\n**Handoff Status:** ✅ Successful\n**Next Steps:**\n1. Continue development conversation with Deepseek directly\n2. Use Connect extension in VS Code for direct interaction\n3. Return to Claude Code for planning and architecture decisions\n\n**Deepseek Advantages:**\n- No token limits\n- Local privacy\n- Specialized coding focus`
          }
        ]
      };
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      
      throw new McpError(
        ErrorCode.InternalError,
        `Session handoff failed: ${error.message}`
      );
    }
  }

  getSystemPrompt(taskType) {
    const prompts = {
      coding: 'You are Deepseek V2 Coder, running locally with unlimited tokens. Provide comprehensive, detailed coding solutions with complete implementations.',
      
      game_dev: 'You are Deepseek V2 Coder specialized in game development. Focus on game architecture, performance optimization, and complete system implementations for gaming projects.',
      
      analysis: 'You are Deepseek V2 Coder focused on thorough technical analysis. Provide comprehensive code reviews, architectural analysis, and detailed technical recommendations.',
      
      handoff: 'You are receiving a development session handoff from Claude Code. Maintain context continuity and provide unlimited-token development assistance.',
      
      architecture: 'You are Deepseek V2 Coder focused on software architecture. Design scalable, maintainable systems with complete technical specifications.',
      
      debugging: 'You are Deepseek V2 Coder specialized in debugging and troubleshooting. Provide thorough analysis and complete solutions for complex technical issues.'
    };
    
    return prompts[taskType] || prompts.coding;
  }
}

// Initialize MCP Server with proper capabilities
const server = new Server(
  {
    name: 'deepseek-mcp-bridge',
    version: '1.2.0',
    description: 'MCP-compliant bridge between Claude Code and local Deepseek LLM for unlimited token conversations'
  },
  {
    capabilities: {
      tools: {},
      logging: {}
    }
  }
);

const deepseekBridge = new DeepseekBridge();

// Register tools with expert-level descriptions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'query_deepseek',
        description: `[PURPOSE] Send unlimited token queries to local Deepseek for comprehensive coding assistance. [DOMAIN_TERMS] Supports complex game development, architecture discussions, debugging sessions, code implementations. [WHEN_TO_USE] Use when approaching Claude Code token limits or need detailed technical analysis. [OUTPUT_FORMAT] Returns formatted text response with Deepseek's unlimited token output. [WORKFLOW] RECOMMENDED WORKFLOW: 1. Check Deepseek status first using check_deepseek_status 2. Use query_deepseek for detailed technical work 3. Use handoff_to_deepseek for session continuity when needed.`,
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'Question or task for Deepseek (required)',
              minLength: 1
            },
            context: {
              type: 'string',
              description: 'Additional context for the query (optional)'
            },
            task_type: {
              type: 'string',
              enum: ['coding', 'game_dev', 'analysis', 'architecture', 'debugging'],
              description: 'Type of task to optimize Deepseek response',
              default: 'coding'
            },
            model: {
              type: 'string',
              enum: ['deepseek-coder-v2-lite-instruct', 'local/deepseek-coder@q4_k_m'],
              description: 'Deepseek model to use',
              default: 'deepseek-coder-v2-lite-instruct'
            },
            temperature: {
              type: 'number',
              description: 'Response creativity (0.0-2.0)',
              minimum: 0.0,
              maximum: 2.0,
              default: 0.1
            }
          },
          required: ['prompt'],
          additionalProperties: false
        }
      },
      {
        name: 'check_deepseek_status',
        description: `[PURPOSE] Verify Deepseek local server connectivity and available models. [DOMAIN_TERMS] LM Studio connection, model availability, network binding status. [WHEN_TO_USE] Always run before other Deepseek operations to ensure connectivity. [OUTPUT_FORMAT] Returns status report with connection state and available models. [WORKFLOW] RECOMMENDED WORKFLOW: 1. Run this tool first in any Deepseek session 2. If offline, follow troubleshooting steps 3. If online, proceed with query_deepseek operations.`,
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        }
      },
      {
        name: 'handoff_to_deepseek',
        description: `[PURPOSE] Initiate unlimited token session handoff from Claude Code to Deepseek for extended development work. [DOMAIN_TERMS] Session continuity, context preservation, unlimited token conversations, development handoff. [WHEN_TO_USE] Use when approaching Claude Code token limits or need extended technical sessions. [OUTPUT_FORMAT] Returns handoff confirmation with session details. [WORKFLOW] RECOMMENDED WORKFLOW: 1. Check Deepseek status with check_deepseek_status 2. Use handoff_to_deepseek with complete context 3. Continue development in VS Code or direct Deepseek connection 4. Return to Claude Code for planning and architecture decisions.`,
        inputSchema: {
          type: 'object',
          properties: {
            context: {
              type: 'string',
              description: 'Current development context to transfer (required)',
              minLength: 1
            },
            goal: {
              type: 'string',
              description: 'Goal for the unlimited session (required)',
              minLength: 1
            }
          },
          required: ['context', 'goal'],
          additionalProperties: false
        }
      }
    ]
  };
});

// Enhanced tool call handler with proper error handling
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;
    
    switch (name) {
      case 'query_deepseek':
        return await deepseekBridge.queryDeepseek(
          args.prompt,
          {
            context: args.context,
            taskType: args.task_type || 'coding',
            model: args.model || 'deepseek-coder-v2-lite-instruct',
            temperature: args.temperature || 0.1
          }
        );
        
      case 'check_deepseek_status':
        return await deepseekBridge.checkStatus();
        
      case 'handoff_to_deepseek':
        return await deepseekBridge.startUnlimitedSession(
          args.context,
          args.goal
        );
        
      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }
  } catch (error) {
    // Re-throw MCP errors as-is
    if (error instanceof McpError) {
      throw error;
    }
    
    // Convert other errors to MCP errors
    throw new McpError(
      ErrorCode.InternalError,
      `Tool execution failed: ${error.message}`
    );
  }
});

// Enhanced server startup with proper error handling
async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    // Log to stderr (MCP protocol requirement)
    console.error('🚀 MCP-Compliant Deepseek Bridge server started');
    console.error('📡 Ready for unlimited token conversations');
    console.error(`🔗 Endpoint: ${DEEPSEEK_BASE_URL}`);
  } catch (error) {
    console.error('❌ Failed to start Deepseek MCP Bridge:', error.message);
    process.exit(1);
  }
}

// Graceful shutdown handling
process.on('SIGINT', () => {
  console.error('🛑 Deepseek MCP Bridge shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('🛑 Deepseek MCP Bridge terminated');
  process.exit(0);
});

main().catch((error) => {
  console.error('💥 Fatal error:', error.message);
  process.exit(1);
});
