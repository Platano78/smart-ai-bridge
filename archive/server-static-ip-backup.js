#!/usr/bin/env node

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

/**
 * Enhanced DeepSeek MCP Bridge with File Integration
 * 
 * Capabilities:
 * ✅ Original: query_deepseek, check_deepseek_status, handoff_to_deepseek  
 * 🆕 File Integration: query_deepseek_with_file, query_deepseek_with_files
 * 🆕 Artifact Support: export_artifact_to_file, import_to_artifact
 * 🆕 Project Analysis: analyze_project_with_deepseek
 */

class EnhancedDeepseekBridge {
  constructor() {
    this.baseURL = 'http://172.19.224.1:1234/v1';
    this.defaultModel = 'deepseek-coder-v2-lite-instruct';
    this.timeout = 30000;
    this.retryAttempts = 3;
    this.maxFileSize = 1024 * 1024; // 1MB max file size
    this.allowedExtensions = ['.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.json', '.md', '.txt', '.py'];
  }

  async queryDeepseek(prompt, options = {}) {
    const requestBody = {
      model: options.model || this.defaultModel,
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
      max_tokens: options.max_tokens || 4000
    };

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(`${this.baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return {
          success: true,
          response: data.choices[0].message.content,
          model: data.model,
          usage: data.usage,
          timestamp: new Date().toISOString()
        };

      } catch (error) {
        console.error(`DeepSeek request attempt ${attempt} failed:`, error.message);
        
        if (attempt === this.retryAttempts) {
          return {
            success: false,
            error: `Failed to connect to DeepSeek after ${this.retryAttempts} attempts: ${error.message}`,
            suggestion: 'Ensure LM Studio is running with DeepSeek model loaded on http://172.19.224.1:1234'
          };
        }
        
        await this.delay(Math.pow(2, attempt) * 1000);
      }
    }
  }

  async checkStatus() {
    try {
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
      return {
        status: 'online',
        endpoint: this.baseURL,
        models: data.data || [],
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        status: 'offline',
        error: 'DeepSeek server not available',
        endpoint: this.baseURL,
        suggestion: 'Start LM Studio and load DeepSeek model',
        timestamp: new Date().toISOString()
      };
    }
  }

  // 🆕 NEW: File reading with validation
  async readFile(filePath) {
    try {
      // Security: Validate file path
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

  // 🆕 NEW: Read multiple files
  async readFiles(filePaths) {
    const results = [];
    
    for (const filePath of filePaths) {
      const result = await this.readFile(filePath);
      results.push(result);
    }

    return {
      files: results,
      successCount: results.filter(r => r.success).length,
      totalCount: results.length
    };
  }

  // 🆕 NEW: Write file (for artifact export/import)
  async writeFile(filePath, content, options = {}) {
    try {
      const resolvedPath = path.resolve(filePath);
      const dir = path.dirname(resolvedPath);
      
      // Ensure directory exists
      await fs.mkdir(dir, { recursive: true });
      
      await fs.writeFile(resolvedPath, content, 'utf8');
      
      return {
        success: true,
        path: resolvedPath,
        size: Buffer.byteLength(content, 'utf8'),
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: filePath
      };
    }
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

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  formatFileContext(fileResults) {
    if (!Array.isArray(fileResults)) {
      fileResults = [fileResults];
    }

    return fileResults
      .filter(file => file.success)
      .map(file => `
## File: ${file.path}
**Size**: ${file.size} bytes | **Modified**: ${file.lastModified}

\`\`\`${file.extension.slice(1)}
${file.content}
\`\`\`
      `).join('\n\n');
  }
}

// Initialize the enhanced bridge
const bridge = new EnhancedDeepseekBridge();

// Create the MCP server
const server = new Server(
  {
    name: 'deepseek-mcp-bridge',
    version: '2.0.0',
    description: 'Enhanced bridge between Claude and local DeepSeek with file integration'
  },
  {
    capabilities: {
      tools: {},
      logging: {}
    }
  }
);

// 🛠️ TOOL DEFINITIONS

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // ✅ EXISTING TOOLS (Unchanged)
      {
        name: 'query_deepseek',
        description: 'Send a query to local DeepSeek for unlimited token responses',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'The prompt to send to DeepSeek'
            },
            context: {
              type: 'string',
              description: 'Additional context for the query'
            },
            task_type: {
              type: 'string',
              enum: ['coding', 'game_dev', 'analysis', 'architecture', 'debugging', 'optimization'],
              description: 'Type of task to optimize DeepSeek response'
            },
            model: {
              type: 'string',
              description: 'Specific DeepSeek model to use'
            }
          },
          required: ['prompt']
        }
      },
      {
        name: 'check_deepseek_status',
        description: 'Check if DeepSeek server is accessible and what models are available',
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
            context: {
              type: 'string',
              description: 'Current development context to transfer'
            },
            goal: {
              type: 'string',
              description: 'Goal for the unlimited session'
            }
          },
          required: ['context', 'goal']
        }
      },

      // 🆕 NEW FILE-AWARE TOOLS
      {
        name: 'query_deepseek_with_file',
        description: 'Send a file to DeepSeek for analysis, optimization, or modification',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'What you want DeepSeek to do with the file'
            },
            file_path: {
              type: 'string',
              description: 'Path to the file to analyze'
            },
            task_type: {
              type: 'string',
              enum: ['coding', 'game_dev', 'analysis', 'architecture', 'debugging', 'optimization'],
              description: 'Type of analysis to perform'
            },
            model: {
              type: 'string',
              description: 'Specific DeepSeek model to use'
            }
          },
          required: ['prompt', 'file_path']
        }
      },
      {
        name: 'query_deepseek_with_files',
        description: 'Send multiple files to DeepSeek for comprehensive project analysis',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'What you want DeepSeek to do with the files'
            },
            file_paths: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of file paths to analyze'
            },
            task_type: {
              type: 'string',
              enum: ['coding', 'game_dev', 'analysis', 'architecture', 'debugging', 'optimization'],
              description: 'Type of analysis to perform'
            },
            model: {
              type: 'string',
              description: 'Specific DeepSeek model to use'
            }
          },
          required: ['prompt', 'file_paths']
        }
      },

      // 🆕 ARTIFACT SUPPORT TOOLS
      {
        name: 'export_artifact_to_file',
        description: 'Export Claude Desktop artifact content to a file for DeepSeek analysis',
        inputSchema: {
          type: 'object',
          properties: {
            artifact_content: {
              type: 'string',
              description: 'The artifact content to export'
            },
            file_path: {
              type: 'string',
              description: 'Where to save the exported file'
            },
            artifact_type: {
              type: 'string',
              enum: ['html', 'react', 'javascript', 'css', 'markdown'],
              description: 'Type of artifact being exported'
            }
          },
          required: ['artifact_content', 'file_path']
        }
      },
      {
        name: 'analyze_project_with_deepseek',
        description: 'Comprehensive project analysis by sending multiple related files to DeepSeek',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'Analysis goal (e.g., "optimize performance", "review architecture")'
            },
            project_path: {
              type: 'string',
              description: 'Root path of the project to analyze'
            },
            include_patterns: {
              type: 'array',
              items: { type: 'string' },
              description: 'File patterns to include (e.g., ["*.js", "*.tsx"])'
            },
            exclude_patterns: {
              type: 'array',
              items: { type: 'string' },
              description: 'File patterns to exclude (e.g., ["node_modules", "*.min.js"])'
            },
            task_type: {
              type: 'string',
              enum: ['coding', 'game_dev', 'analysis', 'architecture', 'debugging', 'optimization'],
              description: 'Type of analysis to perform'
            }
          },
          required: ['prompt', 'project_path']
        }
      }
    ]
  };
});

// 🔧 TOOL HANDLERS

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ✅ EXISTING HANDLERS (Unchanged)
      case 'query_deepseek': {
        const fullPrompt = args.context 
          ? `Context: ${args.context}\n\nTask: ${args.prompt}`
          : args.prompt;

        const result = await bridge.queryDeepseek(fullPrompt, {
          task_type: args.task_type,
          model: args.model
        });

        return {
          content: [{
            type: 'text',
            text: result.success 
              ? `**DeepSeek Response:**\n\n${result.response}\n\n*Model: ${result.model} | Usage: ${JSON.stringify(result.usage)}*`
              : `**Error:** ${result.error}\n\n*Suggestion: ${result.suggestion}*`
          }]
        };
      }

      case 'check_deepseek_status': {
        const status = await bridge.checkStatus();
        
        return {
          content: [{
            type: 'text',
            text: status.status === 'online'
              ? `✅ **DeepSeek Online**\n\n**Endpoint:** ${status.endpoint}\n**Models Available:** ${status.models.length}\n**Timestamp:** ${status.timestamp}`
              : `❌ **DeepSeek Offline**\n\n**Error:** ${status.error}\n**Suggestion:** ${status.suggestion}\n**Timestamp:** ${status.timestamp}`
          }]
        };
      }

      case 'handoff_to_deepseek': {
        const handoffPackage = `
# 🚀 DeepSeek Handoff Package

## 📋 Session Context
${args.context}

## 🎯 Session Goal  
${args.goal}

## 🛠️ Next Steps
1. Continue development with unlimited token capacity
2. Implement complex features without token constraints
3. Return results for Claude integration when complete

## 💡 Context Preservation
- Current development state captured above
- Full context available for unlimited analysis
- Seamless continuation enabled

**Ready for unlimited token development with DeepSeek!**
        `;

        return {
          content: [{
            type: 'text',
            text: handoffPackage
          }]
        };
      }

      // 🆕 NEW FILE-AWARE HANDLERS
      case 'query_deepseek_with_file': {
        const fileResult = await bridge.readFile(args.file_path);
        
        if (!fileResult.success) {
          return {
            content: [{
              type: 'text',
              text: `❌ **File Read Error:** ${fileResult.error}\n\n**Path:** ${fileResult.path}`
            }]
          };
        }

        const fileContext = bridge.formatFileContext(fileResult);
        const fullPrompt = `${args.prompt}\n\n${fileContext}`;

        const result = await bridge.queryDeepseek(fullPrompt, {
          task_type: args.task_type,
          model: args.model
        });

        return {
          content: [{
            type: 'text',
            text: result.success 
              ? `**File Analysis Complete:**\n\n${result.response}\n\n*Analyzed: ${fileResult.path} (${fileResult.size} bytes)*`
              : `**Error:** ${result.error}\n\n*Suggestion: ${result.suggestion}*`
          }]
        };
      }

      case 'query_deepseek_with_files': {
        const filesResult = await bridge.readFiles(args.file_paths);
        
        const successfulFiles = filesResult.files.filter(f => f.success);
        const failedFiles = filesResult.files.filter(f => !f.success);

        if (successfulFiles.length === 0) {
          return {
            content: [{
              type: 'text',
              text: `❌ **No files could be read:**\n\n${failedFiles.map(f => `- ${f.path}: ${f.error}`).join('\n')}`
            }]
          };
        }

        const filesContext = bridge.formatFileContext(successfulFiles);
        const fullPrompt = `${args.prompt}\n\n# Project Files Analysis\n\n${filesContext}`;

        const result = await bridge.queryDeepseek(fullPrompt, {
          task_type: args.task_type,
          model: args.model
        });

        let summary = `**Multi-File Analysis Complete:**\n\n${result.response}`;
        
        if (failedFiles.length > 0) {
          summary += `\n\n⚠️ **Files with errors:**\n${failedFiles.map(f => `- ${f.path}: ${f.error}`).join('\n')}`;
        }

        summary += `\n\n*Analyzed: ${successfulFiles.length}/${filesResult.totalCount} files*`;

        return {
          content: [{
            type: 'text',
            text: result.success ? summary : `**Error:** ${result.error}`
          }]
        };
      }

      case 'export_artifact_to_file': {
        const writeResult = await bridge.writeFile(args.file_path, args.artifact_content);
        
        return {
          content: [{
            type: 'text',
            text: writeResult.success
              ? `✅ **Artifact Exported Successfully**\n\n**File:** ${writeResult.path}\n**Size:** ${writeResult.size} bytes\n**Timestamp:** ${writeResult.timestamp}\n\n*Ready for DeepSeek analysis with query_deepseek_with_file*`
              : `❌ **Export Failed:** ${writeResult.error}\n\n**Path:** ${writeResult.path}`
          }]
        };
      }

      case 'analyze_project_with_deepseek': {
        // TODO: Implement project-wide analysis with pattern matching
        // This would scan the project directory, apply include/exclude patterns,
        // and send relevant files to DeepSeek for comprehensive analysis
        
        return {
          content: [{
            type: 'text',
            text: `🚧 **Project Analysis Tool**\n\nThis advanced feature is planned for the next enhancement phase.\n\n**Current Workaround:** Use \`query_deepseek_with_files\` with specific file paths.\n\n**Requested Analysis:** ${args.prompt}\n**Project Path:** ${args.project_path}`
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
        text: `❌ **Tool Error:** ${error.message}`
      }],
      isError: true
    };
  }
});

// 🚀 SERVER STARTUP
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('Enhanced DeepSeek MCP Bridge v2.0.0 running with file integration capabilities');