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
 * Enhanced DeepSeek MCP Bridge with Dynamic IP Discovery + LM Studio Compatibility
 * 
 * 🚀 NEW: Automatically discovers WSL IP address at runtime
 * 🔧 NEW: Uses actual model names from LM Studio
 * ✅ Survives reboots and IP changes permanently
 * 📊 Built-in diagnostics and connection validation
 */

class EnhancedDeepseekBridge {
  constructor() {
    this.timeout = 30000;
    this.retryAttempts = 3;
    this.maxFileSize = 10 * 1024 * 1024; // 10MB max file size (increased for chunking)
    this.allowedExtensions = ['.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.json', '.md', '.txt', '.py'];
    
    // 🆕 INTELLIGENT CHUNKING SYSTEM
    this.chunkSize = 8000; // Safe chunk size for analysis
    this.maxTokensPerFile = 25000; // MCP response limit
    this.enableChunking = true;
    
    // 🆕 DYNAMIC IP MANAGEMENT
    this.baseURL = null; // Will be discovered dynamically
    this.cachedIP = null;
    this.lastIPCheck = null;
    this.ipCacheTimeout = 5 * 60 * 1000; // 5 minutes cache
    
    // 🆕 DYNAMIC MODEL MANAGEMENT
    this.availableModels = [];
    this.defaultModel = null;
    this.lastModelCheck = null;
    this.modelCacheTimeout = 10 * 60 * 1000; // 10 minutes cache for models
    
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

  /**
   * 🆕 DYNAMIC MODEL DISCOVERY
   */
  async getAvailableModels() {
    // Use cached models if still valid
    if (this.availableModels.length > 0 && this.lastModelCheck && 
        (Date.now() - this.lastModelCheck) < this.modelCacheTimeout) {
      return this.availableModels;
    }

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
      this.availableModels = data.data || [];
      this.lastModelCheck = Date.now();

      // Set default model to first available or look for deepseek models
      if (this.availableModels.length > 0) {
        // Prefer DeepSeek models
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
      // Use fallback model names
      this.availableModels = [{ id: 'deepseek-coder' }, { id: 'local-model' }];
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

  /**
   * 🚀 ENHANCED QUERY METHOD WITH DYNAMIC IP + MODEL DISCOVERY
   */

  async queryDeepseek(prompt, options = {}) {
    // Ensure we have a working base URL
    if (!this.baseURL) {
      this.baseURL = await this.getWorkingBaseURL();
    }

    // Ensure we have available models
    await this.getAvailableModels();

    // Use provided model or default
    const modelToUse = options.model || this.defaultModel;
    
    // Validate model exists
    if (!this.availableModels.find(m => m.id === modelToUse)) {
      console.error(`⚠️ Model ${modelToUse} not found, using ${this.defaultModel}`);
    }

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
      stream: false // Ensure we don't use streaming
    };

    console.error(`🚀 Sending request to ${this.baseURL}/chat/completions with model: ${modelToUse}`);

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

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
          console.error(`HTTP ${response.status} Error:`, errorText);
          throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
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
        console.error(`DeepSeek request attempt ${attempt} failed:`, error.message);
        
        // If connection fails, try rediscovering IP and models
        if (attempt === Math.floor(this.retryAttempts / 2)) {
          console.error('🔄 Connection failed, rediscovering IP and models...');
          this.baseURL = null;
          this.cachedIP = null;
          this.availableModels = [];
          this.defaultModel = null;
          try {
            this.baseURL = await this.getWorkingBaseURL();
            await this.getAvailableModels();
          } catch (discoveryError) {
            console.error('IP/Model rediscovery failed:', discoveryError.message);
          }
        }
        
        if (attempt === this.retryAttempts) {
          return {
            success: false,
            error: `Failed to connect to DeepSeek after ${this.retryAttempts} attempts: ${error.message}`,
            endpoint: this.baseURL,
            requestBody: JSON.stringify(requestBody, null, 2),
            suggestion: 'Ensure LM Studio is running with DeepSeek model loaded. Check model compatibility.',
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

      // Get available models
      const models = await this.getAvailableModels();

      return {
        status: 'online',
        endpoint: this.baseURL,
        cachedIP: this.cachedIP,
        models: models,
        defaultModel: this.defaultModel,
        modelsCount: models.length,
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
      modelDiscovery: {
        availableModels: this.availableModels.map(m => m.id),
        defaultModel: this.defaultModel,
        lastModelCheck: this.lastModelCheck,
        modelCacheAge: this.lastModelCheck ? Date.now() - this.lastModelCheck : null
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

  // FILE METHODS (Same as before)
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

  /**
   * 🧠 INTELLIGENT CHUNKING SYSTEM
   */

  estimateTokens(text) {
    // Rough estimation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }

  async analyzeFileIntelligently(filePath, prompt, taskType = 'analysis', options = {}) {
    console.error(`🔍 Starting intelligent analysis of: ${filePath}`);
    
    const fileResult = await this.readFile(filePath);
    if (!fileResult.success) {
      return {
        success: false,
        error: `File read failed: ${fileResult.error}`,
        strategy: 'failed'
      };
    }

    const tokenEstimate = this.estimateTokens(fileResult.content);
    console.error(`📊 File complexity: ${tokenEstimate} tokens`);
    
    // Strategy selection based on file size
    if (tokenEstimate < 15000) {
      return await this.directAnalysis(fileResult, prompt, taskType, options);
    } else if (tokenEstimate < 50000) {
      return await this.chunkedAnalysis(fileResult, prompt, taskType, options);
    } else {
      return await this.strategicAnalysis(fileResult, prompt, taskType, options);
    }
  }

  async directAnalysis(fileResult, prompt, taskType, options) {
    console.error('📄 Using direct analysis strategy');
    
    const fileContext = this.formatFileContext(fileResult);
    const fullPrompt = `${prompt}\n\n${fileContext}`;

    return await this.queryDeepseek(fullPrompt, {
      task_type: taskType,
      model: options.model
    });
  }

  async chunkedAnalysis(fileResult, prompt, taskType, options) {
    console.error('🔗 Using intelligent chunking strategy');
    
    const chunks = this.createIntelligentChunks(fileResult.content, fileResult.path);
    console.error(`📦 Created ${chunks.length} intelligent chunks`);
    
    // Process each chunk with targeted prompts
    const chunkResults = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.error(`🔍 Processing chunk ${i + 1}/${chunks.length} (${chunk.type})`);
      
      const chunkPrompt = this.buildChunkPrompt(prompt, taskType, chunk, i + 1, chunks.length);
      const result = await this.queryDeepseek(chunkPrompt, {
        task_type: taskType,
        model: options.model
      });
      
      chunkResults.push({
        chunkIndex: i + 1,
        chunkType: chunk.type,
        analysis: result.success ? result.response : result.error,
        success: result.success
      });
    }
    
    // Synthesize results
    return await this.synthesizeChunkResults(chunkResults, prompt, taskType, options);
  }

  async strategicAnalysis(fileResult, prompt, taskType, options) {
    console.error('🎯 Using strategic analysis for very large file');
    
    // First pass: Extract structural information
    const structuralPrompt = `Analyze the STRUCTURE of this file and provide a brief summary:\n\n- File type and purpose\n- Main components/functions/classes\n- Key imports and dependencies\n- Overall architecture pattern\n\nBe concise - max 500 words.\n\n${this.formatFileContext(fileResult).substring(0, 15000)}`;
    
    const structuralAnalysis = await this.queryDeepseek(structuralPrompt, {
      task_type: 'analysis',
      model: options.model
    });

    // Second pass: Targeted analysis based on prompt
    const targetedPrompt = `Based on this structural overview:\n\n${structuralAnalysis.success ? structuralAnalysis.response : 'Structural analysis failed'}\n\nNow perform this specific analysis: ${prompt}\n\nFocus on architectural recommendations and high-level improvements.`;
    
    const targetedAnalysis = await this.queryDeepseek(targetedPrompt, {
      task_type: taskType,
      model: options.model
    });

    return {
      success: true,
      strategy: 'strategic',
      structuralAnalysis: structuralAnalysis.success ? structuralAnalysis.response : 'Failed',
      targetedAnalysis: targetedAnalysis.success ? targetedAnalysis.response : 'Failed',
      response: `# Strategic Analysis Report\n\n## Structural Overview\n${structuralAnalysis.success ? structuralAnalysis.response : 'Analysis failed'}\n\n## Targeted Analysis\n${targetedAnalysis.success ? targetedAnalysis.response : 'Analysis failed'}\n\n*Strategy: Strategic analysis for large file (${this.estimateTokens(fileResult.content)} tokens)*`
    };
  }

  createIntelligentChunks(content, filePath) {
    const fileExtension = path.extname(filePath);
    
    switch (fileExtension) {
      case '.js':
      case '.jsx':
        return this.chunkJavaScriptFile(content);
      case '.ts':
      case '.tsx':
        return this.chunkTypeScriptFile(content);
      default:
        return this.chunkGenericFile(content);
    }
  }

  chunkJavaScriptFile(content) {
    const chunks = [];
    
    // Split by imports first
    const importEndIndex = this.findImportEnd(content);
    if (importEndIndex > 0) {
      chunks.push({
        type: 'imports',
        content: content.substring(0, importEndIndex),
        startLine: 1,
        endLine: this.getLineNumber(content, importEndIndex)
      });
    }
    
    // Split remaining content by React components and functions
    const remainingContent = content.substring(importEndIndex);
    const componentRegex = /(?:^|\n)(?:export\s+)?(?:default\s+)?(?:function|const|class)\s+[A-Z][a-zA-Z0-9]*(?:\s*=\s*(?:\([^)]*\)\s*=>\s*{|function\s*\([^)]*\)\s*{)|extends\s+[a-zA-Z0-9.]+\s*{)/gm;
    
    let lastIndex = 0;
    let match;
    
    while ((match = componentRegex.exec(remainingContent)) !== null) {
      // Add any utility code before this component
      if (lastIndex < match.index) {
        const preContent = remainingContent.slice(lastIndex, match.index).trim();
        if (preContent) {
          chunks.push({
            type: 'utilities',
            content: preContent,
            startLine: this.getLineNumber(content, importEndIndex + lastIndex),
            endLine: this.getLineNumber(content, importEndIndex + match.index)
          });
        }
      }
      
      // Find the end of this component
      const componentStart = match.index;
      const componentEnd = this.findComponentEnd(remainingContent, componentStart);
      
      chunks.push({
        type: 'component',
        content: remainingContent.slice(componentStart, componentEnd),
        name: this.extractComponentName(match[0]),
        startLine: this.getLineNumber(content, importEndIndex + componentStart),
        endLine: this.getLineNumber(content, importEndIndex + componentEnd)
      });
      
      lastIndex = componentEnd;
    }
    
    // Add any remaining content
    if (lastIndex < remainingContent.length) {
      const remaining = remainingContent.slice(lastIndex).trim();
      if (remaining) {
        chunks.push({
          type: 'exports',
          content: remaining,
          startLine: this.getLineNumber(content, importEndIndex + lastIndex),
          endLine: this.getLineNumber(content, content.length)
        });
      }
    }
    
    return this.optimizeChunkSizes(chunks);
  }

  chunkTypeScriptFile(content) {
    // For now, use JavaScript chunking for TypeScript files
    return this.chunkJavaScriptFile(content);
  }

  chunkGenericFile(content) {
    const lines = content.split('\n');
    const chunks = [];
    const linesPerChunk = Math.ceil(this.chunkSize / 50); // Rough estimate
    
    for (let i = 0; i < lines.length; i += linesPerChunk) {
      const chunkLines = lines.slice(i, i + linesPerChunk);
      chunks.push({
        type: 'section',
        content: chunkLines.join('\n'),
        startLine: i + 1,
        endLine: Math.min(i + linesPerChunk, lines.length)
      });
    }
    
    return chunks;
  }

  findImportEnd(content) {
    const lines = content.split('\n');
    let lastImportIndex = -1;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('import ') || line.startsWith('const ') && line.includes('require(')) {
        lastImportIndex = i;
      } else if (line && !line.startsWith('//') && !line.startsWith('/*')) {
        break;
      }
    }
    
    if (lastImportIndex >= 0) {
      return content.indexOf('\n', content.split('\n').slice(0, lastImportIndex + 1).join('\n').length);
    }
    
    return 0;
  }

  findComponentEnd(content, startIndex) {
    let braceCount = 0;
    let inFunction = false;
    
    for (let i = startIndex; i < content.length; i++) {
      const char = content[i];
      
      if (char === '{') {
        braceCount++;
        inFunction = true;
      } else if (char === '}') {
        braceCount--;
        if (inFunction && braceCount === 0) {
          return i + 1;
        }
      }
    }
    
    return content.length;
  }

  extractComponentName(declaration) {
    const match = declaration.match(/(?:function|const|class)\s+([A-Z][a-zA-Z0-9]*)/);    
    return match ? match[1] : 'Unknown';
  }

  getLineNumber(content, charIndex) {
    return content.substring(0, charIndex).split('\n').length;
  }

  optimizeChunkSizes(chunks) {
    // Merge small chunks, split large ones
    const optimized = [];
    
    for (const chunk of chunks) {
      const tokenCount = this.estimateTokens(chunk.content);
      
      if (tokenCount > this.chunkSize * 1.5) {
        // Split large chunk
        const lines = chunk.content.split('\n');
        const midPoint = Math.floor(lines.length / 2);
        
        optimized.push({
          ...chunk,
          content: lines.slice(0, midPoint).join('\n'),
          endLine: chunk.startLine + midPoint - 1
        });
        
        optimized.push({
          ...chunk,
          content: lines.slice(midPoint).join('\n'),
          startLine: chunk.startLine + midPoint,
          type: chunk.type + '_continued'
        });
      } else {
        optimized.push(chunk);
      }
    }
    
    return optimized;
  }

  buildChunkPrompt(originalPrompt, taskType, chunk, chunkIndex, totalChunks) {
    const basePrompt = `Analyzing chunk ${chunkIndex}/${totalChunks} (${chunk.type}):\n\n${originalPrompt}\n\nFocus ONLY on this chunk. Provide a concise, structured analysis in JSON format:\n{\n  "chunkType": "${chunk.type}",\n  "keyFindings": ["finding1", "finding2"],\n  "issues": ["issue1", "issue2"],\n  "components": ["component1", "component2"],\n  "recommendations": ["rec1", "rec2"]\n}`;

    // Add chunk-specific instructions
    switch (chunk.type) {
      case 'imports':
        return basePrompt + `\n\nFocus on: import statements, dependencies, potential unused imports.\n\n${chunk.content}`;
      case 'component':
        return basePrompt + `\n\nFocus on: React component structure, hooks usage, performance issues, props.\n\n${chunk.content}`;
      case 'utilities':
        return basePrompt + `\n\nFocus on: utility functions, constants, helper methods.\n\n${chunk.content}`;
      default:
        return basePrompt + `\n\n${chunk.content}`;
    }
  }

  async synthesizeChunkResults(chunkResults, originalPrompt, taskType, options) {
    console.error('🔄 Synthesizing chunk results...');
    
    const successfulResults = chunkResults.filter(r => r.success);
    
    if (successfulResults.length === 0) {
      return {
        success: false,
        error: 'All chunk analyses failed',
        strategy: 'chunked'
      };
    }
    
    const synthesisPrompt = `Synthesize the following chunk analyses into a comprehensive report:\n\nOriginal Request: ${originalPrompt}\n\nChunk Results:\n${JSON.stringify(successfulResults, null, 2)}\n\nProvide a unified analysis that:\n1. Combines all findings into coherent recommendations\n2. Identifies patterns across chunks\n3. Prioritizes issues by severity\n4. Suggests specific implementation improvements\n\nFormat as a clear, well-structured response.`;

    const synthesisResult = await this.queryDeepseek(synthesisPrompt, {
      task_type: taskType,
      model: options.model
    });

    return {
      success: true,
      strategy: 'chunked',
      chunkCount: chunkResults.length,
      successfulChunks: successfulResults.length,
      response: synthesisResult.success ? synthesisResult.response : 'Synthesis failed',
      chunkResults: chunkResults
    };
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

// Initialize the enhanced bridge with dynamic IP and model discovery
const bridge = new EnhancedDeepseekBridge();

// Create the MCP server
const server = new Server(
  {
    name: 'deepseek-mcp-bridge',
    version: '2.2.0',
    description: 'Enhanced bridge with dynamic WSL IP + LM Studio model compatibility'
  },
  {
    capabilities: {
      tools: {},
      logging: {}
    }
  }
);

// TOOL DEFINITIONS (Enhanced with model discovery)
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'query_deepseek',
        description: 'Send a query to local DeepSeek (auto-discovers IP and models)',
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
        description: 'Check DeepSeek status with automatic IP and model discovery',
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
        description: 'Send a file to DeepSeek for intelligent analysis (auto-discovers IP and models, handles large files with chunking)',
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
            model: { type: 'string', description: 'Specific DeepSeek model to use (auto-detected if not specified)' }
          },
          required: ['prompt', 'file_path']
        }
      },
      {
        name: 'query_deepseek_with_files',
        description: 'Send multiple files to DeepSeek for comprehensive analysis',
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
            model: { type: 'string', description: 'Specific DeepSeek model to use (auto-detected if not specified)' }
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
        name: 'analyze_large_file_intelligently',
        description: 'Analyze files of any size using intelligent chunking strategies (auto-selects direct/chunked/strategic based on file size)',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Path to the file to analyze (supports large files up to 10MB)' },
            prompt: { type: 'string', description: 'Analysis request - what you want to understand about the file' },
            task_type: {
              type: 'string',
              enum: ['coding', 'game_dev', 'analysis', 'architecture', 'debugging', 'optimization'],
              description: 'Type of analysis to perform'
            },
            model: { type: 'string', description: 'Specific DeepSeek model to use (auto-detected if not specified)' }
          },
          required: ['file_path', 'prompt']
        }
      }
    ]
  };
});

// ENHANCED TOOL HANDLERS
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
              ? `**DeepSeek Response:**\n\n${result.response}\n\n*Model: ${result.model} | Endpoint: ${result.endpoint} | Usage: ${JSON.stringify(result.usage || {})}\n\n🎉 Dynamic IP + Model Discovery Working!*`
              : `**Error:** ${result.error}\n\n*Endpoint: ${result.endpoint}*\n*Request Body:*\n\`\`\`json\n${result.requestBody}\n\`\`\`\n*Suggestion: ${result.suggestion}*\n\n**Diagnostics:**\n\`\`\`json\n${JSON.stringify(result.diagnostics, null, 2)}\n\`\`\``
          }]
        };
      }

      case 'check_deepseek_status': {
        const status = await bridge.checkStatus();
        
        return {
          content: [{
            type: 'text',
            text: status.status === 'online'
              ? `✅ **DeepSeek Online** (Auto-Discovery Active)\n\n**Endpoint:** ${status.endpoint}\n**Cached IP:** ${status.cachedIP}\n**Models Available:** ${status.modelsCount}\n**Default Model:** ${status.defaultModel}\n**Available Models:**\n${status.models.map(m => `- ${m.id}`).join('\n')}\n**IP Discovery:** ${status.ipDiscovery}\n**Timestamp:** ${status.timestamp}`
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
- Dynamic IP + Model discovery ensures reliable connection

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
        // Use intelligent analysis for files of any size
        const result = await bridge.analyzeFileIntelligently(args.file_path, args.prompt, args.task_type, {
          model: args.model
        });

        let responseText;
        
        if (!result.success) {
          responseText = `❌ **File Analysis Error:** ${result.error}\n\n**Strategy:** ${result.strategy}`;
        } else {
          responseText = `✅ **File Analysis Complete (${result.strategy || 'direct'} strategy)**\n\n${result.response}`;
          
          // Add strategy-specific metadata
          if (result.strategy === 'chunked') {
            responseText += `\n\n📊 **Analysis Details:**\n- Strategy: Intelligent chunking\n- Chunks processed: ${result.chunkCount}\n- Successful chunks: ${result.successfulChunks}\n- File: ${args.file_path}`;
          } else if (result.strategy === 'strategic') {
            responseText += `\n\n📊 **Analysis Details:**\n- Strategy: Strategic analysis (large file)\n- File: ${args.file_path}`;
          } else {
            responseText += `\n\n📊 **Analysis Details:**\n- Strategy: Direct analysis\n- File: ${args.file_path}`;
          }
          
          // Add model and endpoint info if available
          if (result.model) {
            responseText += `\n- Model: ${result.model}`;
          }
          if (result.endpoint) {
            responseText += `\n- Endpoint: ${result.endpoint}`;
          }
        }

        return {
          content: [{
            type: 'text',
            text: responseText
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

        summary += `\n\n*Analyzed: ${successfulFiles.length}/${filesResult.totalCount} files | Model: ${result.model} | Endpoint: ${result.endpoint || 'Discovery failed'}*`;

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

      case 'analyze_large_file_intelligently': {
        // This is the same as query_deepseek_with_file but with explicit chunking focus
        const result = await bridge.analyzeFileIntelligently(args.file_path, args.prompt, args.task_type, {
          model: args.model
        });

        let responseText;
        
        if (!result.success) {
          responseText = `❌ **Intelligent Analysis Failed:** ${result.error}\n\n**Strategy Attempted:** ${result.strategy}`;
        } else {
          responseText = `🧠 **Intelligent Analysis Complete**\n\n**Strategy Used:** ${result.strategy || 'direct'}\n\n${result.response}`;
          
          // Add detailed strategy information
          responseText += `\n\n📊 **Analysis Strategy Details:**`;
          
          if (result.strategy === 'chunked') {
            responseText += `\n- 📎 **Chunked Analysis**: File split into ${result.chunkCount} intelligent chunks\n- ✅ **Success Rate**: ${result.successfulChunks}/${result.chunkCount} chunks analyzed successfully\n- 🔗 **Synthesis**: Results combined into unified analysis`;
          } else if (result.strategy === 'strategic') {
            responseText += `\n- 🎯 **Strategic Analysis**: Large file analyzed in phases\n- 🏗️ **Structural Overview**: Architecture and component analysis\n- 🔍 **Targeted Analysis**: Focused examination based on request`;
          } else {
            responseText += `\n- 📄 **Direct Analysis**: File analyzed as single unit\n- ⚡ **Performance**: Optimal for files under 15k tokens`;
          }
          
          responseText += `\n- 📁 **File**: ${args.file_path}`;
          
          if (result.model) {
            responseText += `\n- 🤖 **Model**: ${result.model}`;
          }
        }

        return {
          content: [{
            type: 'text',
            text: responseText
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
console.error('Enhanced DeepSeek MCP Bridge v2.2.0 with Dynamic IP + Model Discovery running!');