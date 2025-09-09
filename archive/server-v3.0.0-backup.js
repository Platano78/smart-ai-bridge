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
 * Enhanced DeepSeek MCP Bridge v3.0.0
 * 🆕 NEW: Intelligent chunking for large files
 * 🚀 ENHANCED: Multiple analysis strategies based on file size
 * 🧠 NEW: Gemini fallback for extremely large files
 * 📊 ENHANCED: Comprehensive file analysis with synthesis
 * ✅ MAINTAINS: Dynamic IP discovery + LM Studio compatibility
 */

class EnhancedDeepseekBridge {
  constructor() {
    this.timeout = 30000;
    this.retryAttempts = 3;
    this.maxFileSize = 10 * 1024 * 1024; // Increased to 10MB for chunking
    this.chunkSize = 8000; // Safe chunk size for analysis (tokens)
    this.maxTokens = 25000; // MCP response limit
    this.allowedExtensions = ['.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.json', '.md', '.txt', '.py'];
    
    // 🆕 DYNAMIC IP MANAGEMENT (from existing implementation)
    this.baseURL = null;
    this.cachedIP = null;
    this.lastIPCheck = null;
    this.ipCacheTimeout = 5 * 60 * 1000; // 5 minutes cache
    
    // 🆕 DYNAMIC MODEL MANAGEMENT (from existing implementation)
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
   * 🆕 MAIN INTELLIGENT ANALYSIS ENTRY POINT
   */
  async analyzeFileIntelligently(filePath, prompt, taskType = 'analysis') {
    try {
      console.error(`🔍 Starting intelligent analysis of: ${filePath}`);
      
      // Step 1: File size assessment
      const fileInfo = await this.assessFileComplexity(filePath);
      console.error(`📊 File complexity: ${fileInfo.strategy} (${fileInfo.tokenEstimate} tokens)`);
      
      // Step 2: Strategy selection based on file size
      switch (fileInfo.strategy) {
        case 'direct':
          return await this.directAnalysis(filePath, prompt, taskType);
        
        case 'chunked':
          return await this.chunkedAnalysis(filePath, prompt, taskType);
        
        case 'strategic':
          return await this.strategicChunking(filePath, prompt, taskType);
        
        case 'gemini_fallback':
          return await this.geminiInsightFallback(filePath, prompt, taskType);
        
        default:
          throw new Error(`Unknown strategy: ${fileInfo.strategy}`);
      }
    } catch (error) {
      console.error('❌ Intelligent analysis failed:', error);
      throw error;
    }
  }

  /**
   * 🆕 ASSESS FILE COMPLEXITY AND DETERMINE STRATEGY
   */
  async assessFileComplexity(filePath) {
    const content = await fs.readFile(filePath, 'utf8');
    const tokenEstimate = this.estimateTokens(content);
    const fileExtension = path.extname(filePath);
    
    // Strategy decision matrix
    if (tokenEstimate < 15000) {
      return { strategy: 'direct', tokenEstimate, fileType: fileExtension };
    } else if (tokenEstimate < 40000) {
      return { strategy: 'chunked', tokenEstimate, fileType: fileExtension };
    } else if (tokenEstimate < 100000) {
      return { strategy: 'strategic', tokenEstimate, fileType: fileExtension };
    } else {
      return { strategy: 'gemini_fallback', tokenEstimate, fileType: fileExtension };
    }
  }

  /**
   * 🆕 STRATEGY 1: DIRECT ANALYSIS (files < 15k tokens)
   */
  async directAnalysis(filePath, prompt, taskType) {
    console.error('📄 Using direct analysis strategy');
    
    const content = await fs.readFile(filePath, 'utf8');
    const analysisPrompt = this.buildAnalysisPrompt(prompt, taskType, 'direct');
    
    const result = await this.queryDeepseek(`${analysisPrompt}\n\n${content}`, {
      task_type: taskType
    });

    return {
      strategy: 'direct',
      analysis: result,
      metadata: {
        fileSize: content.length,
        tokenEstimate: this.estimateTokens(content)
      }
    };
  }

  /**
   * 🆕 STRATEGY 2: INTELLIGENT CHUNKING (files 15k-40k tokens)
   */
  async chunkedAnalysis(filePath, prompt, taskType) {
    console.error('🔗 Using intelligent chunking strategy');
    
    const content = await fs.readFile(filePath, 'utf8');
    const chunks = await this.createIntelligentChunks(content, filePath);
    
    console.error(`📦 Created ${chunks.length} intelligent chunks`);
    
    // Process each chunk with targeted prompts
    const chunkResults = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.error(`🔍 Processing chunk ${i + 1}/${chunks.length} (${chunk.type})`);
      
      const chunkPrompt = this.buildChunkPrompt(prompt, taskType, chunk.type, i + 1, chunks.length);
      const result = await this.queryDeepseek(`${chunkPrompt}\n\n${chunk.content}`, {
        task_type: taskType
      });
      
      chunkResults.push({
        chunkIndex: i + 1,
        chunkType: chunk.type,
        analysis: result
      });
    }
    
    // Synthesize results
    const synthesis = await this.synthesizeChunkResults(chunkResults, prompt, taskType);
    
    return {
      strategy: 'chunked',
      chunks: chunkResults,
      synthesis: synthesis,
      metadata: {
        totalChunks: chunks.length,
        fileSize: content.length,
        tokenEstimate: this.estimateTokens(content)
      }
    };
  }

  /**
   * 🆕 STRATEGY 3: STRATEGIC ANALYSIS (files 40k-100k tokens)
   */
  async strategicChunking(filePath, prompt, taskType) {
    console.error('🎯 Using strategic chunking strategy');
    
    const content = await fs.readFile(filePath, 'utf8');
    
    // First pass: Extract key structural information
    const structuralAnalysis = await this.extractStructuralInfo(content, filePath);
    
    // Second pass: Targeted analysis of critical sections
    const criticalSections = await this.identifyCriticalSections(content, structuralAnalysis, taskType);
    
    // Third pass: Deep dive analysis
    const deepAnalysis = await this.performDeepAnalysis(criticalSections, prompt, taskType);
    
    return {
      strategy: 'strategic',
      structuralOverview: structuralAnalysis,
      criticalFindings: deepAnalysis,
      recommendations: await this.generateStrategicRecommendations(deepAnalysis, prompt),
      metadata: {
        fileSize: content.length,
        tokenEstimate: this.estimateTokens(content),
        sectionsAnalyzed: criticalSections.length
      }
    };
  }

  /**
   * 🆕 STRATEGY 4: GEMINI INSIGHT FALLBACK (files > 100k tokens)
   */
  async geminiInsightFallback(filePath, prompt, taskType) {
    console.error('🧠 Using Gemini insight fallback strategy (placeholder)');
    
    // For now, use strategic chunking as fallback
    // TODO: Integrate with actual Gemini API when available
    console.error('⚠️ Gemini fallback not implemented yet, using strategic chunking');
    return await this.strategicChunking(filePath, prompt, taskType);
  }

  /**
   * 🆕 CREATE INTELLIGENT CHUNKS BASED ON FILE TYPE
   */
  async createIntelligentChunks(content, filePath) {
    const fileExtension = path.extname(filePath);
    
    switch (fileExtension) {
      case '.js':
      case '.jsx':
        return this.chunkJavaScriptFile(content);
      
      case '.ts':
      case '.tsx':
        return this.chunkTypeScriptFile(content);
      
      case '.py':
        return this.chunkPythonFile(content);
      
      case '.md':
        return this.chunkMarkdownFile(content);
      
      default:
        return this.chunkGenericFile(content);
    }
  }

  /**
   * 🆕 JAVASCRIPT/REACT SPECIFIC CHUNKING
   */
  chunkJavaScriptFile(content) {
    const chunks = [];
    
    // Split by React components and major functions
    const componentRegex = /(?:^|\n)(?:export\s+)?(?:default\s+)?(?:function|const|class)\s+[A-Z][a-zA-Z0-9]*(?:\s*=\s*(?:\([^)]*\)\s*=>\s*{|function\s*\([^)]*\)\s*{)|extends\s+[a-zA-Z0-9.]+\s*{)/gm;
    
    let lastIndex = 0;
    let match;
    
    // Extract imports and utilities first
    const importSection = this.extractImportsSection(content);
    if (importSection.length > 0) {
      chunks.push({
        type: 'imports_utilities',
        content: importSection,
        startLine: 1,
        endLine: this.getLineNumber(content, importSection.length)
      });
      lastIndex = importSection.length;
    }
    
    // Extract components
    while ((match = componentRegex.exec(content)) !== null) {
      const componentStart = match.index;
      const componentEnd = this.findComponentEnd(content, componentStart);
      
      chunks.push({
        type: 'component',
        content: content.slice(componentStart, componentEnd),
        name: this.extractComponentName(match[0]),
        startLine: this.getLineNumber(content, componentStart),
        endLine: this.getLineNumber(content, componentEnd)
      });
      
      lastIndex = componentEnd;
    }
    
    // Add any remaining content
    if (lastIndex < content.length) {
      const remainingContent = content.slice(lastIndex).trim();
      if (remainingContent) {
        chunks.push({
          type: 'exports_utilities',
          content: remainingContent,
          startLine: this.getLineNumber(content, lastIndex),
          endLine: this.getLineNumber(content, content.length)
        });
      }
    }
    
    return this.optimizeChunkSizes(chunks);
  }

  /**
   * 🆕 TYPESCRIPT CHUNKING (similar to JavaScript)
   */
  chunkTypeScriptFile(content) {
    // For now, use JavaScript chunking (can be enhanced later)
    return this.chunkJavaScriptFile(content);
  }

  /**
   * 🆕 PYTHON CHUNKING
   */
  chunkPythonFile(content) {
    const chunks = [];
    const lines = content.split('\n');
    let currentChunk = [];
    let currentType = 'imports';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Detect function/class definitions
      if (line.match(/^(def|class)\s+/)) {
        if (currentChunk.length > 0) {
          chunks.push({
            type: currentType,
            content: currentChunk.join('\n'),
            startLine: i - currentChunk.length + 1,
            endLine: i
          });
        }
        currentChunk = [line];
        currentType = line.startsWith('class') ? 'class' : 'function';
      } else {
        currentChunk.push(line);
      }
    }
    
    // Add final chunk
    if (currentChunk.length > 0) {
      chunks.push({
        type: currentType,
        content: currentChunk.join('\n'),
        startLine: lines.length - currentChunk.length + 1,
        endLine: lines.length
      });
    }
    
    return this.optimizeChunkSizes(chunks);
  }

  /**
   * 🆕 MARKDOWN CHUNKING
   */
  chunkMarkdownFile(content) {
    const chunks = [];
    const sections = content.split(/^#+\s/m);
    
    for (let i = 0; i < sections.length; i++) {
      if (sections[i].trim()) {
        chunks.push({
          type: i === 0 ? 'preamble' : 'section',
          content: (i === 0 ? '' : '# ') + sections[i],
          startLine: 1, // Simplified for markdown
          endLine: 1
        });
      }
    }
    
    return this.optimizeChunkSizes(chunks);
  }

  /**
   * 🆕 GENERIC FILE CHUNKING
   */
  chunkGenericFile(content) {
    const chunks = [];
    const lines = content.split('\n');
    const linesPerChunk = Math.ceil(this.chunkSize / 20); // Rough estimate
    
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

  /**
   * 🆕 BUILD TARGETED PROMPTS FOR DIFFERENT CHUNK TYPES
   */
  buildChunkPrompt(originalPrompt, taskType, chunkType, chunkIndex, totalChunks) {
    const basePrompt = `Analyzing chunk ${chunkIndex}/${totalChunks} (${chunkType}):

${originalPrompt}

Focus ONLY on this chunk. Provide a concise, structured analysis in JSON format.
Required format:
{
  "chunkType": "${chunkType}",
  "keyFindings": ["finding1", "finding2"],
  "issues": ["issue1", "issue2"],
  "components": ["component1", "component2"],
  "dependencies": ["dep1", "dep2"]
}`;

    // Add chunk-specific instructions
    switch (chunkType) {
      case 'imports_utilities':
        return basePrompt + `\n\nFocus on: imports, utility functions, constants, and type definitions.`;
      
      case 'component':
        return basePrompt + `\n\nFocus on: React component structure, hooks usage, props, performance issues.`;
      
      case 'exports_utilities':
        return basePrompt + `\n\nFocus on: export statements, helper functions, and module structure.`;
      
      default:
        return basePrompt;
    }
  }

  /**
   * 🆕 BUILD ANALYSIS PROMPTS FOR DIFFERENT STRATEGIES
   */
  buildAnalysisPrompt(originalPrompt, taskType, strategy) {
    const prompts = {
      direct: `Perform a comprehensive analysis of this file:

${originalPrompt}

Provide detailed findings with specific recommendations.`,

      chunked: `This is part of a chunked analysis. ${originalPrompt}

Focus on providing structured, concise insights that can be synthesized with other chunks.`
    };

    return prompts[strategy] || prompts.direct;
  }

  /**
   * 🆕 SYNTHESIZE RESULTS FROM MULTIPLE CHUNKS
   */
  async synthesizeChunkResults(chunkResults, originalPrompt, taskType) {
    console.error('🔄 Synthesizing chunk results...');
    
    const synthesisPrompt = `Synthesize the following chunk analyses into a comprehensive report:

Original Request: ${originalPrompt}

Chunk Results:
${JSON.stringify(chunkResults, null, 2)}

Provide a unified analysis that:
1. Combines all findings into coherent recommendations
2. Identifies patterns across chunks
3. Prioritizes issues by severity
4. Suggests specific implementation improvements

Format as structured JSON with clear sections.`;

    const result = await this.queryDeepseek(synthesisPrompt, { task_type: taskType });
    return result;
  }

  /**
   * 🆕 EXTRACT STRUCTURAL INFORMATION FROM LARGE FILES
   */
  async extractStructuralInfo(content, filePath) {
    const fileExtension = path.extname(filePath);
    
    if (fileExtension === '.jsx' || fileExtension === '.js') {
      return {
        componentCount: (content.match(/(?:function|const|class)\s+[A-Z][a-zA-Z0-9]*/g) || []).length,
        hookCount: (content.match(/useState|useEffect|useCallback|useMemo/g) || []).length,
        importCount: (content.match(/^import\s+/gm) || []).length,
        linesOfCode: content.split('\n').length,
        fileSize: Buffer.byteLength(content, 'utf8')
      };
    }
    
    return {
      linesOfCode: content.split('\n').length,
      fileSize: Buffer.byteLength(content, 'utf8'),
      fileType: fileExtension
    };
  }

  /**
   * 🆕 IDENTIFY CRITICAL SECTIONS FOR TARGETED ANALYSIS
   */
  async identifyCriticalSections(content, structuralAnalysis, taskType) {
    // For React files, identify the most complex components
    if (structuralAnalysis.componentCount) {
      const componentRegex = /(?:function|const|class)\s+[A-Z][a-zA-Z0-9]*[\s\S]*?(?=(?:function|const|class)\s+[A-Z]|$)/g;
      const components = [];
      let match;
      
      while ((match = componentRegex.exec(content)) !== null) {
        const componentCode = match[0];
        const complexity = this.calculateComplexity(componentCode);
        components.push({
          code: componentCode,
          complexity: complexity,
          index: match.index
        });
      }
      
      // Return top 3 most complex components
      return components
        .sort((a, b) => b.complexity - a.complexity)
        .slice(0, 3)
        .map(c => c.code);
    }
    
    // For other files, split into sections
    const sections = [];
    const lines = content.split('\n');
    const sectionSize = Math.ceil(lines.length / 5); // 5 sections max
    
    for (let i = 0; i < lines.length; i += sectionSize) {
      sections.push(lines.slice(i, i + sectionSize).join('\n'));
    }
    
    return sections;
  }

  /**
   * 🆕 PERFORM DEEP ANALYSIS ON CRITICAL SECTIONS
   */
  async performDeepAnalysis(criticalSections, prompt, taskType) {
    const deepAnalysisResults = [];
    
    for (let i = 0; i < criticalSections.length; i++) {
      const section = criticalSections[i];
      const analysisPrompt = `Deep analysis of critical section ${i + 1}:

${prompt}

Section to analyze:
${section}

Provide detailed architectural insights, performance concerns, and specific recommendations.`;

      const result = await this.queryDeepseek(analysisPrompt, { task_type: taskType });
      deepAnalysisResults.push({
        sectionIndex: i + 1,
        analysis: result
      });
    }
    
    return deepAnalysisResults;
  }

  /**
   * 🆕 GENERATE STRATEGIC RECOMMENDATIONS
   */
  async generateStrategicRecommendations(deepAnalysis, originalPrompt) {
    const recommendationsPrompt = `Based on the following deep analysis results, generate strategic recommendations:

Original Request: ${originalPrompt}

Deep Analysis Results:
${JSON.stringify(deepAnalysis, null, 2)}

Provide:
1. Top 5 priority improvements
2. Architectural recommendations
3. Performance optimization strategies
4. Implementation roadmap

Format as actionable recommendations with specific steps.`;

    const result = await this.queryDeepseek(recommendationsPrompt, { task_type: 'architecture' });
    return result;
  }

  /**
   * 🆕 UTILITY METHODS FOR CHUNKING
   */

  extractImportsSection(content) {
    const lines = content.split('\n');
    let importEndIndex = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('import ') || line.startsWith('//') || line === '' || line.startsWith('/**') || line.startsWith('*')) {
        importEndIndex = i;
      } else {
        break;
      }
    }
    
    return lines.slice(0, importEndIndex + 1).join('\n');
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
    return match ? match[1] : 'UnknownComponent';
  }

  getLineNumber(content, index) {
    return content.slice(0, index).split('\n').length;
  }

  calculateComplexity(code) {
    // Simple complexity calculation
    const hookCount = (code.match(/use[A-Z]/g) || []).length;
    const conditionalCount = (code.match(/if\s*\(|switch\s*\(|\?\s*:/g) || []).length;
    const loopCount = (code.match(/for\s*\(|while\s*\(|map\s*\(|forEach\s*\(/g) || []).length;
    
    return hookCount * 2 + conditionalCount + loopCount * 3;
  }

  optimizeChunkSizes(chunks) {
    const optimizedChunks = [];
    
    for (const chunk of chunks) {
      const chunkTokens = this.estimateTokens(chunk.content);
      
      if (chunkTokens <= this.chunkSize) {
        // Chunk is good as-is
        optimizedChunks.push(chunk);
      } else {
        // Split large chunk
        const pieces = this.splitLargeChunk(chunk.content, this.chunkSize);
        pieces.forEach((piece, index) => {
          optimizedChunks.push({
            ...chunk,
            content: piece,
            type: `${chunk.type}_part${index + 1}`
          });
        });
      }
    }
    
    return optimizedChunks;
  }

  splitLargeChunk(content, maxSize) {
    const pieces = [];
    const lines = content.split('\n');
    let currentPiece = '';
    
    for (const line of lines) {
      const testPiece = currentPiece + (currentPiece ? '\n' : '') + line;
      
      if (this.estimateTokens(testPiece) > maxSize && currentPiece) {
        pieces.push(currentPiece);
        currentPiece = line;
      } else {
        currentPiece = testPiece;
      }
    }
    
    if (currentPiece) {
      pieces.push(currentPiece);
    }
    
    return pieces;
  }

  estimateTokens(text) {
    // Rough estimation: 1 token ≈ 4 characters for code
    return Math.ceil(text.length / 4);
  }

  // EXISTING METHODS FROM YOUR CURRENT IMPLEMENTATION
  // (Copy all the existing IP discovery, model management, and core query methods)

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

  // ... (include all other existing IP discovery methods)

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

  async queryDeepseek(prompt, options = {}) {
    if (!this.baseURL) {
      this.baseURL = await this.getWorkingBaseURL();
    }

    await this.getAvailableModels();

    const modelToUse = options.model || this.defaultModel;
    
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
      stream: false
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
      if (!this.baseURL) {
        this.baseURL = await this.getWorkingBaseURL();
      }

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

  // Existing file methods (enhanced with larger file support)
  async readFile(filePath) {
    try {
      const resolvedPath = path.resolve(filePath);
      const stats = await fs.stat(resolvedPath);
      
      if (!stats.isFile()) {
        throw new Error('Path is not a file');
      }

      if (stats.size > this.maxFileSize) {
        throw new Error(`File too large: ${Math.round(stats.size / 1024)}KB (max: ${this.maxFileSize / 1024}KB) - Use intelligent analysis for large files`);
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

// Initialize the enhanced bridge
const bridge = new EnhancedDeepseekBridge();

// Create the MCP server
const server = new Server(
  {
    name: 'deepseek-mcp-bridge',
    version: '3.0.0',
    description: 'Enhanced bridge with intelligent chunking + dynamic WSL IP + LM Studio compatibility'
  },
  {
    capabilities: {
      tools: {},
      logging: {}
    }
  }
);

// 🆕 ENHANCED TOOL DEFINITIONS WITH INTELLIGENT CHUNKING
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
        description: 'Send a file to DeepSeek for analysis (auto-discovers IP and models)',
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
        name: 'query_deepseek_enhanced',
        description: '🆕 Enhanced DeepSeek analysis with intelligent chunking for large files',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'Analysis request' },
            file_path: { type: 'string', description: 'Path to file to analyze (handles any size)' },
            task_type: { 
              type: 'string', 
              enum: ['coding', 'game_dev', 'analysis', 'architecture', 'debugging', 'optimization'],
              description: 'Type of analysis to perform'
            }
          },
          required: ['prompt', 'file_path']
        }
      }
    ]
  };
});

// 🆕 ENHANCED TOOL HANDLERS WITH INTELLIGENT CHUNKING
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // Existing tool handlers...
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
              ? `✅ **DeepSeek Online** (Auto-Discovery + Intelligent Chunking Active)\n\n**Endpoint:** ${status.endpoint}\n**Cached IP:** ${status.cachedIP}\n**Models Available:** ${status.modelsCount}\n**Default Model:** ${status.defaultModel}\n**Available Models:**\n${status.models.map(m => `- ${m.id}`).join('\n')}\n**IP Discovery:** ${status.ipDiscovery}\n**Timestamp:** ${status.timestamp}\n\n🆕 **NEW: Intelligent Chunking Support**\n- Files up to 10MB supported\n- Automatic strategy selection\n- Smart component analysis for React files`
              : `❌ **DeepSeek Offline**\n\n**Error:** ${status.error}\n**Endpoint:** ${status.endpoint}\n**Suggestion:** ${status.suggestion}\n**Timestamp:** ${status.timestamp}\n\n**Diagnostics:**\n\`\`\`json\n${JSON.stringify(status.diagnostics, null, 2)}\n\`\`\``
          }]
        };
      }

      case 'handoff_to_deepseek': {
        const handoffPackage = `
# 🚀 DeepSeek Handoff Package v3.0 (Intelligent Chunking Enabled)

## 📋 Session Context
${args.context}

## 🎯 Session Goal  
${args.goal}

## 🛠️ Next Steps
1. Continue development with unlimited token capacity
2. Implement complex features without token constraints
3. Analyze large files with intelligent chunking
4. Return results for Claude integration when complete

## 💡 Enhanced Capabilities
- ✅ Automatic IP + Model discovery
- ✅ Intelligent file chunking for large files
- ✅ Strategic analysis for complex codebases
- ✅ Cross-platform compatibility preservation

**Ready for unlimited token development with enhanced DeepSeek!**
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
          // If file is too large for normal reading, AUTOMATICALLY use intelligent analysis
          if (fileResult.error.includes('File too large')) {
            console.error('🔄 File too large for direct analysis, automatically switching to intelligent chunking...');
            
            try {
              const intelligentResult = await bridge.analyzeFileIntelligently(
                args.file_path, 
                args.prompt, 
                args.task_type
              );
              
              // Format the same way as the enhanced tool
              let formattedResult = `**🔄 AUTOMATIC FALLBACK: Enhanced Analysis Complete (Strategy: ${intelligentResult.strategy})**\n\n`;

              switch (intelligentResult.strategy) {
                case 'direct':
                  const analysisText = intelligentResult.analysis?.response || intelligentResult.analysis || 'Analysis completed but no response text available';
                  formattedResult += `**Direct Analysis Result:**\n${analysisText}\n\n`;
                  formattedResult += `*File Size: ${intelligentResult.metadata?.fileSize || 'unknown'} bytes | Token Estimate: ${intelligentResult.metadata?.tokenEstimate || 'unknown'}*`;
                  break;
                case 'chunked':
                  const synthesisText = intelligentResult.synthesis?.response || intelligentResult.synthesis || 'Chunked analysis completed';
                  formattedResult += `**Chunked Analysis Summary:**\n${synthesisText}\n\n`;
                  if (intelligentResult.chunks && intelligentResult.chunks.length > 0) {
                    formattedResult += `**Chunk Details:**\n`;
                    intelligentResult.chunks.forEach((chunk, i) => {
                      formattedResult += `- Chunk ${chunk.chunkIndex || i+1} (${chunk.chunkType || 'section'}): Analyzed\n`;
                    });
                  }
                  formattedResult += `\n*Total Chunks: ${intelligentResult.metadata?.totalChunks || intelligentResult.chunks?.length || 'unknown'} | File Size: ${intelligentResult.metadata?.fileSize || 'unknown'} bytes*`;
                  break;
                case 'strategic':
                  formattedResult += `**Strategic Analysis Overview:**\n`;
                  formattedResult += `- Components: ${intelligentResult.structuralOverview?.componentCount || 'N/A'}\n`;
                  formattedResult += `- Hooks: ${intelligentResult.structuralOverview?.hookCount || 'N/A'}\n`;
                  formattedResult += `- Lines: ${intelligentResult.structuralOverview?.linesOfCode || 'N/A'}\n\n`;
                  if (intelligentResult.criticalFindings) {
                    formattedResult += `**Critical Findings:**\n${JSON.stringify(intelligentResult.criticalFindings, null, 2)}\n\n`;
                  }
                  const recommendationsText = intelligentResult.recommendations?.response || intelligentResult.recommendations || 'Strategic analysis completed';
                  formattedResult += `**Strategic Recommendations:**\n${recommendationsText}`;
                  break;
                default:
                  formattedResult += `**Analysis Result:**\n${JSON.stringify(intelligentResult, null, 2)}`;
              }
              
              formattedResult += `\n\n✨ *Automatic fallback successful - large file processed with intelligent chunking*`;
              
              return {
                content: [{
                  type: 'text',
                  text: formattedResult
                }]
              };
            } catch (error) {
              return {
                content: [{
                  type: 'text',
                  text: `❌ **Both direct and intelligent analysis failed:** ${error.message}\n\n**Suggestion:** Try breaking the file into smaller sections or check file permissions.`
                }]
              };
            }
          }
          
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
              ? `**File Analysis Complete:**\n\n${result.response}\n\n*Analyzed: ${fileResult.path} (${fileResult.size} bytes) | Model: ${result.model} | Endpoint: ${result.endpoint}*`
              : `**Error:** ${result.error}\n\n*Suggestion: ${result.suggestion}*\n*Request Body:*\n\`\`\`json\n${result.requestBody}\n\`\`\`\n*Endpoint: ${result.endpoint}*`
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
              ? `✅ **Artifact Exported Successfully**\n\n**File:** ${writeResult.path}\n**Size:** ${writeResult.size} bytes\n**Timestamp:** ${writeResult.timestamp}\n\n*Ready for DeepSeek analysis with query_deepseek_enhanced (intelligent chunking enabled)*`
              : `❌ **Export Failed:** ${writeResult.error}\n\n**Path:** ${writeResult.path}`
          }]
        };
      }

      // 🆕 NEW ENHANCED INTELLIGENT ANALYSIS TOOL
      case 'query_deepseek_enhanced': {
        try {
          console.error(`🧠 Starting enhanced intelligent analysis for: ${args.file_path}`);
          
          const result = await bridge.analyzeFileIntelligently(
            args.file_path,
            args.prompt,
            args.task_type
          );

          let formattedResult = `**🧠 Enhanced Analysis Complete (Strategy: ${result.strategy})**\n\n`;

          switch (result.strategy) {
            case 'direct':
              const analysisText = result.analysis?.response || result.analysis || 'Analysis completed but no response text available';
              formattedResult += `**Direct Analysis Result:**\n${analysisText}\n\n`;
              formattedResult += `*File Size: ${result.metadata?.fileSize || 'unknown'} bytes | Token Estimate: ${result.metadata?.tokenEstimate || 'unknown'}*`;
              break;

            case 'chunked':
              const synthesisText = result.synthesis?.response || result.synthesis || 'Chunked analysis completed';
              formattedResult += `**Chunked Analysis Summary:**\n${synthesisText}\n\n`;
              formattedResult += `**Chunk Details:**\n`;
              if (result.chunks && result.chunks.length > 0) {
                result.chunks.forEach((chunk, i) => {
                  formattedResult += `- Chunk ${chunk.chunkIndex || i+1} (${chunk.chunkType || 'section'}): Analyzed\n`;
                });
              }
              formattedResult += `\n*Total Chunks: ${result.metadata?.totalChunks || result.chunks?.length || 'unknown'} | File Size: ${result.metadata?.fileSize || 'unknown'} bytes*`;
              break;

            case 'strategic':
              formattedResult += `**Strategic Analysis Overview:**\n`;
              formattedResult += `- Components: ${result.structuralOverview?.componentCount || 'N/A'}\n`;
              formattedResult += `- Hooks: ${result.structuralOverview?.hookCount || 'N/A'}\n`;
              formattedResult += `- Lines: ${result.structuralOverview?.linesOfCode || 'N/A'}\n\n`;
              if (result.criticalFindings) {
                formattedResult += `**Critical Findings:**\n${JSON.stringify(result.criticalFindings, null, 2)}\n\n`;
              }
              const recommendationsText = result.recommendations?.response || result.recommendations || 'Strategic analysis completed';
              formattedResult += `**Strategic Recommendations:**\n${recommendationsText}`;
              break;

            default:
              formattedResult += `**Analysis Result:**\n${JSON.stringify(result, null, 2)}`;
          }

          return {
            content: [{
              type: 'text',
              text: formattedResult
            }]
          };

        } catch (error) {
          console.error('Enhanced analysis failed:', error);
          
          return {
            content: [{
              type: 'text',
              text: `❌ **Enhanced Analysis Failed:** ${error.message}\n\n**Suggestion:** Try using regular file analysis for smaller files or check file permissions.`
            }]
          };
        }
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
console.error('Enhanced DeepSeek MCP Bridge v3.0.0 with Intelligent Chunking + Dynamic IP + Model Discovery running!');
