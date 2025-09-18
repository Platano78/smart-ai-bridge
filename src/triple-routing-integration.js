// src/triple-routing-integration.js
// GREEN PHASE: Triple routing integration for file operations

import { TripleDeepSeekBridge } from './triple-bridge.js';

class TripleRoutingIntegration {
  constructor() {
    this.tripleBridge = new TripleDeepSeekBridge();
    this.routingRules = {
      smallFiles: 'nvidia_qwen',      // <10KB → Qwen 3 Coder (fast processing)
      mediumFiles: 'nvidia_deepseek', // 10KB-100KB → DeepSeek V3 (analysis)
      largeFiles: 'local'             // >100KB → Local DeepSeek (unlimited tokens)
    };
    this.performanceMetrics = {
      totalRoutingDecisions: 0,
      routingDistribution: {
        nvidia_qwen: 0,
        nvidia_deepseek: 0,
        local: 0
      },
      averageRoutingTime: 0
    };
  }

  // Determine optimal endpoint based on file size and content type
  determineOptimalEndpoint(fileStats, analysisType = 'general') {
    const startTime = Date.now();
    let selectedEndpoint;
    let routingReason;

    // Size-based routing (primary rule)
    if (fileStats.size > 100 * 1024) { // >100KB
      selectedEndpoint = this.routingRules.largeFiles;
      routingReason = 'large_file_unlimited_tokens';
    } else if (fileStats.size > 10 * 1024) { // 10KB-100KB
      selectedEndpoint = this.routingRules.mediumFiles;
      routingReason = 'medium_file_analysis';
    } else { // <10KB
      selectedEndpoint = this.routingRules.smallFiles;
      routingReason = 'small_file_fast_processing';
    }

    // Content-based routing overrides (secondary rules)
    if (analysisType === 'code_analysis' || analysisType === 'debugging') {
      selectedEndpoint = 'nvidia_qwen'; // Always use Qwen for coding tasks
      routingReason = 'code_specialization_override';
    } else if (analysisType === 'mathematical' || analysisType === 'research') {
      selectedEndpoint = 'nvidia_deepseek'; // Always use DeepSeek V3 for analysis
      routingReason = 'analysis_specialization_override';
    }

    const routingTime = Date.now() - startTime;
    
    // Update metrics
    this.performanceMetrics.totalRoutingDecisions++;
    this.performanceMetrics.routingDistribution[selectedEndpoint]++;
    
    const currentAvg = this.performanceMetrics.averageRoutingTime;
    const newAvg = (currentAvg * (this.performanceMetrics.totalRoutingDecisions - 1) + routingTime) / 
                   this.performanceMetrics.totalRoutingDecisions;
    this.performanceMetrics.averageRoutingTime = Math.round(newAvg);

    return {
      endpoint: selectedEndpoint,
      reason: routingReason,
      confidence: this.calculateRoutingConfidence(fileStats, analysisType),
      routingTime: `${routingTime}ms`,
      fileSize: fileStats.size,
      fileSizeCategory: this.categorizeFileSize(fileStats.size)
    };
  }

  categorizeFileSize(size) {
    if (size > 100 * 1024) return 'large';
    if (size > 10 * 1024) return 'medium';
    return 'small';
  }

  calculateRoutingConfidence(fileStats, analysisType) {
    // High confidence for clear size-based routing
    if (fileStats.size > 100 * 1024) return 'high';
    if (fileStats.size < 1024) return 'high';
    
    // High confidence for specialized analysis types
    if (analysisType === 'code_analysis' || analysisType === 'mathematical') {
      return 'high';
    }
    
    return 'medium';
  }

  // Route file analysis to appropriate endpoint
  async routeFileAnalysis(filePath, content, metadata, options = {}) {
    const analysisType = options.analysisType || 'general';
    
    // Determine routing
    const routingDecision = this.determineOptimalEndpoint(metadata, analysisType);
    
    // Prepare analysis prompt
    const analysisPrompt = this.constructAnalysisPrompt(filePath, content, metadata, options);
    
    try {
      // Execute analysis on selected endpoint
      const analysisResult = await this.tripleBridge.queryEndpoint(
        routingDecision.endpoint, 
        analysisPrompt, 
        {
          temperature: options.temperature || 0.3,
          max_tokens: options.max_tokens || (routingDecision.endpoint === 'local' ? -1 : 4096)
        }
      );

      return {
        analysisResult: analysisResult.content,
        routingInfo: {
          ...routingDecision,
          endpointName: analysisResult.endpoint,
          model: analysisResult.model,
          specialization: analysisResult.specialization
        },
        metadata: {
          filePath,
          fileSize: metadata.size,
          analysisType,
          processingTime: new Date().toISOString()
        }
      };

    } catch (error) {
      // Fallback to local endpoint on failure
      if (routingDecision.endpoint !== 'local') {
        console.log(`Endpoint ${routingDecision.endpoint} failed, falling back to local...`);
        
        try {
          const fallbackResult = await this.tripleBridge.queryEndpoint('local', analysisPrompt);
          
          return {
            analysisResult: fallbackResult.content,
            routingInfo: {
              ...routingDecision,
              endpointName: fallbackResult.endpoint,
              model: fallbackResult.model,
              specialization: fallbackResult.specialization,
              fallbackReason: 'primary_endpoint_failed'
            },
            metadata: {
              filePath,
              fileSize: metadata.size,
              analysisType,
              processingTime: new Date().toISOString()
            }
          };
        } catch (fallbackError) {
          throw new Error(`All endpoints failed. Last error: ${fallbackError.message}`);
        }
      }
      throw error;
    }
  }

  constructAnalysisPrompt(filePath, content, metadata, options) {
    const analysisType = options.analysisType || 'general';
    const fileName = filePath.split('/').pop();
    
    let prompt = `Analyze the following file:\n\nFile: ${fileName}\n`;
    prompt += `Size: ${metadata.size} bytes\n`;
    prompt += `Type: ${metadata.type}\n`;
    prompt += `Analysis Type: ${analysisType}\n\n`;
    
    if (analysisType === 'code_analysis') {
      prompt += `Please provide a comprehensive code analysis including:\n`;
      prompt += `1. Code structure and architecture\n`;
      prompt += `2. Potential bugs or issues\n`;
      prompt += `3. Performance considerations\n`;
      prompt += `4. Best practices and recommendations\n\n`;
    } else if (analysisType === 'mathematical') {
      prompt += `Please provide a mathematical analysis including:\n`;
      prompt += `1. Mathematical concepts or formulas present\n`;
      prompt += `2. Statistical patterns or trends\n`;
      prompt += `3. Analytical insights\n`;
      prompt += `4. Recommendations for further analysis\n\n`;
    } else if (analysisType === 'comprehensive') {
      prompt += `Please provide a comprehensive analysis including:\n`;
      prompt += `1. Content summary and structure\n`;
      prompt += `2. Key insights and patterns\n`;
      prompt += `3. Quality assessment\n`;
      prompt += `4. Actionable recommendations\n\n`;
    }
    
    prompt += `Content:\n${content}`;
    
    return prompt;
  }

  // Route multiple files with intelligent load balancing
  async routeMultipleFiles(fileAnalysisRequests) {
    const routingPlan = [];
    const endpointLoads = {
      nvidia_qwen: 0,
      nvidia_deepseek: 0,
      local: 0
    };
    
    // Plan routing for all files
    for (const request of fileAnalysisRequests) {
      const routingDecision = this.determineOptimalEndpoint(request.metadata, request.analysisType);
      
      // Load balancing: if endpoint is heavily loaded, consider alternatives
      const currentLoad = endpointLoads[routingDecision.endpoint];
      if (currentLoad > 3 && routingDecision.confidence !== 'high') {
        // Find least loaded alternative
        const alternativeEndpoint = this.findLeastLoadedEndpoint(endpointLoads);
        routingDecision.endpoint = alternativeEndpoint;
        routingDecision.reason = 'load_balanced_' + routingDecision.reason;
      }
      
      endpointLoads[routingDecision.endpoint]++;
      routingPlan.push({
        ...request,
        routingDecision
      });
    }
    
    return routingPlan;
  }

  findLeastLoadedEndpoint(endpointLoads) {
    return Object.entries(endpointLoads)
      .sort(([,a], [,b]) => a - b)[0][0];
  }

  // Get routing statistics
  getRoutingStatistics() {
    const total = this.performanceMetrics.totalRoutingDecisions;
    const distribution = this.performanceMetrics.routingDistribution;
    
    return {
      totalRoutingDecisions: total,
      routingDistribution: {
        nvidia_qwen: {
          count: distribution.nvidia_qwen,
          percentage: total > 0 ? Math.round((distribution.nvidia_qwen / total) * 100) : 0
        },
        nvidia_deepseek: {
          count: distribution.nvidia_deepseek,
          percentage: total > 0 ? Math.round((distribution.nvidia_deepseek / total) * 100) : 0
        },
        local: {
          count: distribution.local,
          percentage: total > 0 ? Math.round((distribution.local / total) * 100) : 0
        }
      },
      averageRoutingTime: this.performanceMetrics.averageRoutingTime,
      optimization: 'active',
      loadBalancing: 'enabled'
    };
  }

  // Compare files using different endpoints for diverse perspectives
  async routeFileComparison(file1Data, file2Data, options = {}) {
    // Use different endpoints for diverse analysis perspectives
    const comparisonPrompt1 = this.constructComparisonPrompt(file1Data, file2Data, 'structural');
    const comparisonPrompt2 = this.constructComparisonPrompt(file1Data, file2Data, 'semantic');
    
    try {
      // Route structural analysis to Qwen 3 Coder (excellent at code/structure)
      const structuralAnalysis = await this.tripleBridge.queryEndpoint(
        'nvidia_qwen', 
        comparisonPrompt1
      );
      
      // Route semantic analysis to DeepSeek V3 (excellent at meaning/context)
      const semanticAnalysis = await this.tripleBridge.queryEndpoint(
        'nvidia_deepseek', 
        comparisonPrompt2
      );
      
      return {
        structuralAnalysis: {
          content: structuralAnalysis.content,
          endpoint: structuralAnalysis.endpoint,
          focus: 'structural_differences'
        },
        semanticAnalysis: {
          content: semanticAnalysis.content,
          endpoint: semanticAnalysis.endpoint,
          focus: 'semantic_differences'
        },
        combinedInsights: this.combineComparisonResults(structuralAnalysis, semanticAnalysis)
      };
      
    } catch (error) {
      // Fallback to single endpoint comparison
      const fallbackPrompt = this.constructComparisonPrompt(file1Data, file2Data, 'comprehensive');
      const fallbackResult = await this.tripleBridge.queryEndpoint('local', fallbackPrompt);
      
      return {
        fallbackAnalysis: {
          content: fallbackResult.content,
          endpoint: fallbackResult.endpoint,
          reason: 'multi_endpoint_comparison_failed'
        }
      };
    }
  }

  constructComparisonPrompt(file1Data, file2Data, analysisType) {
    let prompt = `Compare the following two files:\n\n`;
    prompt += `File 1: ${file1Data.path}\n`;
    prompt += `File 2: ${file2Data.path}\n\n`;
    
    if (analysisType === 'structural') {
      prompt += `Focus on structural differences:\n`;
      prompt += `1. Code organization and architecture\n`;
      prompt += `2. Function/method signatures\n`;
      prompt += `3. Data structures and classes\n`;
      prompt += `4. Import/export statements\n\n`;
    } else if (analysisType === 'semantic') {
      prompt += `Focus on semantic differences:\n`;
      prompt += `1. Meaning and purpose of changes\n`;
      prompt += `2. Functional behavior differences\n`;
      prompt += `3. Logic and algorithm changes\n`;
      prompt += `4. Impact assessment\n\n`;
    } else {
      prompt += `Provide a comprehensive comparison including both structural and semantic differences.\n\n`;
    }
    
    prompt += `File 1 Content:\n${file1Data.content}\n\n`;
    prompt += `File 2 Content:\n${file2Data.content}`;
    
    return prompt;
  }

  combineComparisonResults(structuralResult, semanticResult) {
    return `**Combined Analysis Summary:**

**Structural Perspective (${structuralResult.endpoint}):**
${structuralResult.content.substring(0, 500)}...

**Semantic Perspective (${semanticResult.endpoint}):**
${semanticResult.content.substring(0, 500)}...

**Key Insights:**
- Multi-endpoint analysis provides comprehensive coverage
- Structural and semantic perspectives offer complementary insights
- Enhanced accuracy through specialized AI expertise`;
  }
}

export default new TripleRoutingIntegration();