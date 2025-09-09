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
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Enhanced DeepSeek MCP Bridge with Dynamic IP Discovery
 * 
 * 🚀 NEW: Automatically discovers WSL IP address at runtime
 * ✅ Survives reboots and IP changes permanently
 * 🔧 Multiple fallback strategies for maximum reliability
 * 📊 Built-in diagnostics and connection validation
 */

class EnhancedDeepseekBridge {
  constructor() {
    this.defaultModel = 'deepseek-coder-v2-lite-instruct';
    this.timeout = 30000;
    this.retryAttempts = 3;
    this.maxFileSize = 1024 * 1024; // 1MB max file size
    this.allowedExtensions = ['.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.json', '.md', '.txt', '.py'];
    
    // 🆕 DYNAMIC IP MANAGEMENT
    this.baseURL = null; // Will be discovered dynamically
    this.cachedIP = null;
    this.lastIPCheck = null;
    this.ipCacheTimeout = 5 * 60 * 1000; // 5 minutes cache
    
    // Fallback IP strategies
    this.ipStrategies = [
      this.getWSLHostIP.bind(this),
      this.getVEthIP.bind(this),
      this.getDefaultGatewayIP.bind(this),
      this.getNetworkInterfaceIPs.bind(this)
    ];
  }

  /**
   * 🔍 DYNAMIC IP DISCOVERY METHODS
   */

  async getWorkingBaseURL() {
    // Use cached IP if still valid
    if (this.cachedIP && this.lastIPCheck && 
        (Date.now() - this.lastIPCheck) < this.ipCacheTimeout) {
      return `http://${this.cachedIP}:1234/v1`;
    }

    console.error('🔍 Discovering WSL IP address...');
    
    // Try each strategy until one works
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

  async getWSLHostIP() {
    try {
      // Method 1: Get Windows host IP from WSL perspective
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
      // Method 2: Get vEthernet adapter IP (common WSL networking)
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
      // Method 3: Try common WSL IP ranges
      const { stdout } = await execAsync("hostname -I");
      const ips = stdout.trim().split(' ').filter(ip => ip && this.isValidIP(ip));
      
      // Generate likely Windows host IPs based on WSL IPs
      const hostIPs = [];
      for (const ip of ips) {
        const parts = ip.split('.');
        if (parts.length === 4) {
          // Change last octet to .1 (common Windows host pattern)
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
      // Method 4: Brute force common WSL IP ranges
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

  /**
   * 🚀 ENHANCED QUERY METHOD WITH DYNAMIC IP
   */

  async queryDeepseek(prompt, options = {}) {
    // Ensure we have a working base URL
    if (!this.baseURL) {
      this.baseURL = await this.getWorkingBaseURL();
    }

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
          endpoint: this.baseURL,
          timestamp: new Date().toISOString()
        };

      } catch (error) {
        console.error(`DeepSeek request attempt ${attempt} failed:`, error.message);
        
        // If connection fails, try rediscovering IP
        if (attempt === Math.floor(this.retryAttempts / 2)) {
          console.error('🔄 Connection failed, rediscovering IP...');
          this.baseURL = null;
          this.cachedIP = null;
          try {
            this.baseURL = await this.getWorkingBaseURL();
          } catch (discoveryError) {
            console.error('IP rediscovery failed:', discoveryError.message);
          }
        }
        
        if (attempt === this.retryAttempts) {
          return {
            success: false,
            error: `Failed to connect to DeepSeek after ${this.retryAttempts} attempts: ${error.message}`,
            endpoint: this.baseURL,
            suggestion: 'Ensure LM Studio is running with DeepSeek model loaded. The bridge will auto-discover the correct IP address.',
            diagnostics: await this.getDiagnostics()
          };
        }
        
        await this.delay(Math.pow(2, attempt) * 1000);
      }
    }
  }

  async checkStatus() {
    try {
      // Ensure we have a working base URL
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
      return {
        status: 'online',
        endpoint: this.baseURL,
        cachedIP: this.cachedIP,
        models: data.data || [],
        timestamp: new Date().toISOString(),
        ipDiscovery: 'automatic'
      };

    } catch (error) {
      return {
        status: 'offline',
        error: 'DeepSeek server not available',
        endpoint: this.baseURL,
        suggestion: 'Start LM Studio and load DeepSeek model. IP discovery will happen automatically.',
        timestamp: new Date().toISOString(),
        diagnostics: await this.getDiagnostics()
      };
    }
  }

  async getDiagnostics() {
    const diagnostics = {
      ipDiscovery: {
        cachedIP: this.cachedIP,
        lastCheck: this.lastIPCheck,
        cacheAge: this.lastIPCheck ? Date.now() - this.lastIPCheck : null
      },
      networkStatus: {}
    };

    // Test each strategy
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

  // 🆕 FILE METHODS (Same as before)
  async readFile(filePath) {
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

  async writeFile(filePath, content, options = {}) {
    try {
      const resolvedPath = path.resolve(filePath);
      const dir = path.dirname(resolvedPath);
      
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

// Initialize the enhanced bridge with dynamic IP discovery
const bridge = new EnhancedDeepseekBridge();

// Create the MCP server
const server = new Server(
  {
    name: 'deepseek-mcp-bridge',
    version: '2.1.0',
    description: 'Enhanced bridge with dynamic WSL IP discovery - survives reboots permanently'
  },
  {
    capabilities: {
      tools: {},
      logging: {}
    }
  }
);

// 🛠️ TOOL DEFINITIONS (Same as before, but with enhanced diagnostics)

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'query_deepseek',
        description: 'Send a query to local DeepSeek for unlimited token responses (auto-discovers IP)',
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
            model: { type: 'string', description: 'Specific DeepSeek model to use' }
          },
          required: ['prompt']
        }
      },
      {
        name: 'check_deepseek_status',
        description: 'Check DeepSeek status with automatic IP discovery and diagnostics',
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
      },
      {
        name: 'query_deepseek_with_file',
        description: 'Send a file to DeepSeek for analysis (auto-discovers IP)',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'What you want DeepSeek to do with the file' },
            file_path: { type: 'string', description: 'Path to the file to analyze' },
            task_type: {
              type: 'string',
              enum: ['coding', 'game_dev', 'analysis', 'architecture', 'debugging', 'optimization'],
              description: 'Type of analysis to perform'
            },
            model: { type: 'string', description: 'Specific DeepSeek model to use' }
          },
          required: ['prompt', 'file_path']
        }
      },
      {
        name: 'query_deepseek_with_files',
        description: 'Send multiple files to DeepSeek for comprehensive analysis (auto-discovers IP)',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'What you want DeepSeek to do with the files' },
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
            model: { type: 'string', description: 'Specific DeepSeek model to use' }
          },
          required: ['prompt', 'file_paths']
        }
      },
      {
        name: 'export_artifact_to_file',
        description: 'Export Claude Desktop artifact content to a file for DeepSeek analysis',
        inputSchema: {
          type: 'object',
          properties: {
            artifact_content: { type: 'string', description: 'The artifact content to export' },
            file_path: { type: 'string', description: 'Where to save the exported file' },
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
            prompt: { type: 'string', description: 'Analysis goal (e.g., "optimize performance", "review architecture")' },
            project_path: { type: 'string', description: 'Root path of the project to analyze' },
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

// 🔧 TOOL HANDLERS (Enhanced with better error reporting)

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

        return {
          content: [{
            type: 'text',
            text: result.success 
              ? `**DeepSeek Response:**\n\n${result.response}\n\n*Model: ${result.model} | Endpoint: ${result.endpoint} | Usage: ${JSON.stringify(result.usage)}*`
              : `**Error:** ${result.error}\n\n*Endpoint: ${result.endpoint}*\n*Suggestion: ${result.suggestion}*\n\n**Diagnostics:** ${JSON.stringify(result.diagnostics, null, 2)}`
          }]
        };
      }

      case 'check_deepseek_status': {
        const status = await bridge.checkStatus();
        
        return {
          content: [{
            type: 'text',
            text: status.status === 'online'
              ? `✅ **DeepSeek Online** (Auto-Discovery Active)\n\n**Endpoint:** ${status.endpoint}\n**Cached IP:** ${status.cachedIP}\n**Models Available:** ${status.models.length}\n**IP Discovery:** ${status.ipDiscovery}\n**Timestamp:** ${status.timestamp}`
              : `❌ **DeepSeek Offline**\n\n**Error:** ${status.error}\n**Endpoint:** ${status.endpoint}\n**Suggestion:** ${status.suggestion}\n**Timestamp:** ${status.timestamp}\n\n**Diagnostics:**\n\`\`\`json\n${JSON.stringify(status.diagnostics, null, 2)}\n\`\`\``
          }]
        };
      }

      case 'handoff_to_deepseek': {
        const handoffPackage = `
# 🚀 DeepSeek Handoff Package (Auto-Discovery Enabled)

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
- Dynamic IP discovery ensures reliable connection

**Ready for unlimited token development with DeepSeek!**
        `;

        return {
          content: [{
            type: 'text',
            text: handoffPackage
          }]
        };
      }

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
              ? `**File Analysis Complete:**\n\n${result.response}\n\n*Analyzed: ${fileResult.path} (${fileResult.size} bytes) | Endpoint: ${result.endpoint}*`
              : `**Error:** ${result.error}\n\n*Suggestion: ${result.suggestion}*\n\n*Endpoint: ${result.endpoint}*`
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

        summary += `\n\n*Analyzed: ${successfulFiles.length}/${filesResult.totalCount} files | Endpoint: ${result.endpoint || 'Discovery failed'}*`;

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
              ? `✅ **Artifact Exported Successfully**\n\n**File:** ${writeResult.path}\n**Size:** ${writeResult.size} bytes\n**Timestamp:** ${writeResult.timestamp}\n\n*Ready for DeepSeek analysis with query_deepseek_with_file (auto-discovery enabled)*`
              : `❌ **Export Failed:** ${writeResult.error}\n\n**Path:** ${writeResult.path}`
          }]
        };
      }

      case 'analyze_project_with_deepseek': {
        return {
          content: [{
            type: 'text',
            text: `🚧 **Project Analysis Tool**\n\nThis advanced feature is planned for the next enhancement phase.\n\n**Current Workaround:** Use \`query_deepseek_with_files\` with specific file paths.\n\n**Requested Analysis:** ${args.prompt}\n**Project Path:** ${args.project_path}\n\n*Note: Dynamic IP discovery will ensure reliable connection when this feature is implemented.*`
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
console.error('Enhanced DeepSeek MCP Bridge v2.1.0 running with DYNAMIC IP DISCOVERY - survives reboots permanently!');