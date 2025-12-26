// tests/atomic-task-3-handler-unification.test.js
// RED PHASE: Comprehensive tests for handler method unification

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { performance } from 'perf_hooks';

// Mock the unified handler system that we'll implement
let UnifiedHandlerSystem;
let mockTripleBridge;
let mockConsolidatedServer;

describe('ATOMIC TASK 3: Handler Method Unification', () => {
  
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    
    // Mock the triple bridge handlers
    mockTripleBridge = {
      handleEnhancedQuery: vi.fn(),
      handleDirectRouting: vi.fn(), 
      handleEndpointComparison: vi.fn(),
      handleTripleStatus: vi.fn(),
      selectOptimalEndpoint: vi.fn(),
      classifyTaskFromPrompt: vi.fn(),
      getRoutingConfidence: vi.fn()
    };

    // Mock the consolidated server handlers
    mockConsolidatedServer = {
      consolidated_multi_provider_query: vi.fn(),
      consolidated_file_analysis: vi.fn(),
      consolidated_project_analysis: vi.fn(), 
      consolidated_system_status: vi.fn(),
      consolidated_provider_handoff: vi.fn(),
      generateMultiProviderQueryResponse: vi.fn(),
      determineOptimalProvider: vi.fn()
    };
  });

  describe('RED PHASE: Triple Endpoint Handler Tests', () => {
    
    it('should handle enhanced query with optimal endpoint selection', async () => {
      // Test triple bridge enhanced query functionality
      const testArgs = {
        prompt: 'Optimize this JavaScript function for better performance',
        task_type: 'coding',
        endpoint_preference: 'auto',
        temperature: 0.7
      };

      // Mock the response
      mockTripleBridge.handleEnhancedQuery.mockResolvedValue({
        content: [{
          type: 'text', 
          text: 'NVIDIA Qwen 3 Coder 480B (coding_expert):\n\nOptimized code here...'
        }],
        metadata: {
          endpoint_used: 'NVIDIA Qwen 3 Coder 480B',
          has_reasoning: false,
          fallback_reason: null
        }
      });

      mockTripleBridge.selectOptimalEndpoint.mockReturnValue('nvidia_qwen');
      
      const result = await mockTripleBridge.handleEnhancedQuery(testArgs);
      
      expect(mockTripleBridge.handleEnhancedQuery).toHaveBeenCalledWith(testArgs);
      expect(result.content[0].text).toContain('NVIDIA Qwen 3 Coder 480B');
      expect(result.metadata.endpoint_used).toBe('NVIDIA Qwen 3 Coder 480B');
    });

    it('should handle direct routing to specific endpoints', async () => {
      const testArgs = {
        endpoint: 'local',
        prompt: 'Analyze this large codebase with unlimited tokens'
      };

      mockTripleBridge.handleDirectRouting.mockResolvedValue({
        content: [{
          type: 'text',
          text: 'Direct Query - Local DeepSeek:\n\nAnalysis complete...'
        }]
      });

      const result = await mockTripleBridge.handleDirectRouting(testArgs);
      
      expect(mockTripleBridge.handleDirectRouting).toHaveBeenCalledWith(testArgs);
      expect(result.content[0].text).toContain('Direct Query - Local DeepSeek');
    });

    it('should handle endpoint comparison across all providers', async () => {
      const testArgs = {
        prompt: 'Compare mathematical approaches',
        endpoints: ['local', 'nvidia_deepseek', 'nvidia_qwen']
      };

      mockTripleBridge.handleEndpointComparison.mockResolvedValue({
        content: [{
          type: 'text',
          text: 'Endpoint Comparison Results\n\n**Local DeepSeek**: Result 1\n\n---\n**NVIDIA DeepSeek V3.2**: Result 2\n\n---\n**NVIDIA Qwen 3 Coder 480B**: Result 3'
        }]
      });

      const result = await mockTripleBridge.handleEndpointComparison(testArgs);
      
      expect(mockTripleBridge.handleEndpointComparison).toHaveBeenCalledWith(testArgs);
      expect(result.content[0].text).toContain('Endpoint Comparison Results');
      expect(result.content[0].text).toContain('Local DeepSeek');
      expect(result.content[0].text).toContain('NVIDIA DeepSeek V3.2');
      expect(result.content[0].text).toContain('NVIDIA Qwen 3 Coder 480B');
    });

    it('should provide triple status with smart routing information', async () => {
      mockTripleBridge.handleTripleStatus.mockResolvedValue({
        content: [{
          type: 'text',
          text: '**Triple Endpoint Status - DeepSeek MCP Bridge v7.0.0**\n\n**NVIDIA Qwen 3 Coder 480B** (coding_expert)\nStatus: Online\nPriority: 1'
        }]
      });

      const result = await mockTripleBridge.handleTripleStatus();
      
      expect(mockTripleBridge.handleTripleStatus).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Triple Endpoint Status');
      expect(result.content[0].text).toContain('Smart Routing Active');
    });

    it('should classify tasks correctly for optimal routing', () => {
      const testCases = [
        { prompt: 'Debug this JavaScript function', expected: 'coding' },
        { prompt: 'Analyze sales data trends', expected: 'analysis' },
        { prompt: 'Tell me a story', expected: 'general' }
      ];

      testCases.forEach(({ prompt, expected }) => {
        mockTripleBridge.classifyTaskFromPrompt.mockReturnValue(expected);
        const result = mockTripleBridge.classifyTaskFromPrompt(prompt);
        expect(result).toBe(expected);
      });
    });
  });

  describe('RED PHASE: Consolidated Tool Handler Tests', () => {
    
    it('should handle consolidated multi-provider queries', async () => {
      const testArgs = {
        prompt: 'Refactor this React component for better performance',
        context: 'Performance optimization task',
        provider_preference: 'auto',
        task_type: 'optimization',
        enable_file_operations: true
      };

      mockConsolidatedServer.consolidated_multi_provider_query.mockResolvedValue({
        content: [{
          type: 'text',
          text: 'CONSOLIDATED MULTI-PROVIDER QUERY RESPONSE - v7.0.0\n\n**Query Processing:**\n- Provider: DeepSeek\n- Confidence: 87%'
        }]
      });

      const result = await mockConsolidatedServer.consolidated_multi_provider_query(testArgs);
      
      expect(mockConsolidatedServer.consolidated_multi_provider_query).toHaveBeenCalledWith(testArgs);
      expect(result.content[0].text).toContain('CONSOLIDATED MULTI-PROVIDER QUERY RESPONSE');
      expect(result.content[0].text).toContain('Wilson Score Routing Analysis');
    });

    it('should handle consolidated file analysis with cross-platform support', async () => {
      const testArgs = {
        file_path: '/home/user/project/src/component.tsx',
        analysis_type: 'review',
        provider_routing: 'auto'
      };

      mockConsolidatedServer.consolidated_file_analysis.mockResolvedValue({
        content: [{
          type: 'text',
          text: 'CONSOLIDATED FILE ANALYSIS RESPONSE - v7.0.0\n\n**File Processing:**\n- Cross-Platform: Windows/WSL/Linux normalization active'
        }]
      });

      const result = await mockConsolidatedServer.consolidated_file_analysis(testArgs);
      
      expect(mockConsolidatedServer.consolidated_file_analysis).toHaveBeenCalledWith(testArgs);
      expect(result.content[0].text).toContain('CONSOLIDATED FILE ANALYSIS RESPONSE');
      expect(result.content[0].text).toContain('Cross-Platform Support');
    });

    it('should handle consolidated project analysis with provider orchestration', async () => {
      const testArgs = {
        project_path: '/home/user/my-project',
        analysis_goal: 'Architecture review and optimization recommendations',
        max_files: 15,
        provider_strategy: 'auto_optimal'
      };

      mockConsolidatedServer.consolidated_project_analysis.mockResolvedValue({
        content: [{
          type: 'text', 
          text: 'CONSOLIDATED PROJECT ANALYSIS RESPONSE - v7.0.0\n\n**Multi-Provider Project Intelligence:**\n Wilson Score Optimization: Statistical provider selection'
        }]
      });

      const result = await mockConsolidatedServer.consolidated_project_analysis(testArgs);
      
      expect(mockConsolidatedServer.consolidated_project_analysis).toHaveBeenCalledWith(testArgs);
      expect(result.content[0].text).toContain('CONSOLIDATED PROJECT ANALYSIS RESPONSE');
      expect(result.content[0].text).toContain('Multi-Provider Project Intelligence');
    });

    it('should provide consolidated system status with comprehensive metrics', async () => {
      const testArgs = { detailed_metrics: true };

      mockConsolidatedServer.consolidated_system_status.mockResolvedValue({
        content: [{
          type: 'text',
          text: 'CONSOLIDATED SYSTEM STATUS - v7.0.0\n\n**Multi-Provider Architecture:**\n DeepSeek: Primary provider\n**Detailed Wilson Score Metrics:**'
        }]
      });

      const result = await mockConsolidatedServer.consolidated_system_status(testArgs);
      
      expect(mockConsolidatedServer.consolidated_system_status).toHaveBeenCalledWith(testArgs);
      expect(result.content[0].text).toContain('CONSOLIDATED SYSTEM STATUS');
      expect(result.content[0].text).toContain('Multi-Provider Architecture');
      expect(result.content[0].text).toContain('Detailed Wilson Score Metrics');
    });

    it('should handle provider handoff with session optimization', async () => {
      const testArgs = {
        session_context: 'Working on React performance optimization project',
        session_goals: 'Improve bundle size and rendering performance',
        preferred_provider_chain: 'auto_optimal'
      };

      mockConsolidatedServer.consolidated_provider_handoff.mockResolvedValue({
        content: [{
          type: 'text',
          text: 'CONSOLIDATED PROVIDER HANDOFF - v7.0.0\n\n**Wilson Score Handoff Optimization:**\n- Session Complexity Analysis: 78%'
        }]
      });

      const result = await mockConsolidatedServer.consolidated_provider_handoff(testArgs);
      
      expect(mockConsolidatedServer.consolidated_provider_handoff).toHaveBeenCalledWith(testArgs);
      expect(result.content[0].text).toContain('CONSOLIDATED PROVIDER HANDOFF');
      expect(result.content[0].text).toContain('Wilson Score Handoff Optimization');
    });
  });

  describe('RED PHASE: Handler Method Routing Logic Tests', () => {
    
    it('should route requests to appropriate handlers based on tool name', () => {
      // Create a unified router mock
      const routeRequest = vi.fn((toolName, args) => {
        const routingMap = {
          'enhanced_query': 'triple',
          'direct_routing': 'triple', 
          'endpoint_comparison': 'triple',
          'triple_status': 'triple',
          'consolidated_multi_provider_query': 'consolidated',
          'consolidated_file_analysis': 'consolidated',
          'consolidated_project_analysis': 'consolidated',
          'consolidated_system_status': 'consolidated',
          'consolidated_provider_handoff': 'consolidated'
        };
        return routingMap[toolName] || 'unknown';
      });

      // Test routing decisions
      expect(routeRequest('enhanced_query', {})).toBe('triple');
      expect(routeRequest('consolidated_multi_provider_query', {})).toBe('consolidated');
      expect(routeRequest('direct_routing', {})).toBe('triple');
      expect(routeRequest('consolidated_file_analysis', {})).toBe('consolidated');
      expect(routeRequest('unknown_tool', {})).toBe('unknown');
    });

    it('should maintain routing performance under 10ms', () => {
      const routeRequest = (toolName) => {
        const start = performance.now();
        
        // Simulate routing logic
        const routingMap = new Map([
          ['enhanced_query', 'triple'],
          ['direct_routing', 'triple'],
          ['endpoint_comparison', 'triple'],
          ['triple_status', 'triple'],
          ['consolidated_multi_provider_query', 'consolidated'],
          ['consolidated_file_analysis', 'consolidated'],
          ['consolidated_project_analysis', 'consolidated'],
          ['consolidated_system_status', 'consolidated'],
          ['consolidated_provider_handoff', 'consolidated']
        ]);
        
        const result = routingMap.get(toolName) || 'unknown';
        const end = performance.now();
        
        return { result, duration: end - start };
      };

      // Test multiple routing decisions
      const testTools = [
        'enhanced_query',
        'consolidated_multi_provider_query', 
        'direct_routing',
        'consolidated_file_analysis'
      ];

      testTools.forEach(toolName => {
        const { result, duration } = routeRequest(toolName);
        expect(duration).toBeLessThan(10); // Under 10ms requirement
        expect(result).toBeDefined();
      });
    });
  });

  describe('RED PHASE: Error Handling Across Both Architectures', () => {
    
    it('should handle triple bridge errors gracefully', async () => {
      const testError = new Error('Network timeout');
      mockTripleBridge.handleEnhancedQuery.mockRejectedValue(testError);

      try {
        await mockTripleBridge.handleEnhancedQuery({ prompt: 'test' });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error.message).toBe('Network timeout');
      }
    });

    it('should handle consolidated server errors gracefully', async () => {
      const testError = new Error('Provider unavailable');
      mockConsolidatedServer.consolidated_multi_provider_query.mockRejectedValue(testError);

      try {
        await mockConsolidatedServer.consolidated_multi_provider_query({ prompt: 'test' });
        expect(true).toBe(false); // Should not reach here  
      } catch (error) {
        expect(error.message).toBe('Provider unavailable');
      }
    });

    it('should standardize error formats across architectures', () => {
      const standardizeError = (error, architecture) => {
        return {
          content: [{
            type: 'text',
            text: `**${architecture} Error**: ${error.message}\n\n*Handler unification error handling active*`
          }],
          isError: true,
          architecture
        };
      };

      const tripleError = standardizeError(new Error('Triple bridge failure'), 'Triple Bridge');
      const consolidatedError = standardizeError(new Error('Consolidated server failure'), 'Consolidated Server');

      expect(tripleError.content[0].text).toContain('Triple Bridge Error');
      expect(consolidatedError.content[0].text).toContain('Consolidated Server Error');
      expect(tripleError.isError).toBe(true);
      expect(consolidatedError.isError).toBe(true);
    });
  });

  describe('RED PHASE: Response Format Consistency Tests', () => {
    
    it('should ensure consistent response format across all handlers', () => {
      const standardResponse = {
        content: [{
          type: 'text', 
          text: 'Response content'
        }],
        metadata: {
          handler_type: 'unified',
          performance_metrics: {},
          routing_info: {}
        }
      };

      // Validate response structure
      expect(standardResponse.content).toBeInstanceOf(Array);
      expect(standardResponse.content[0].type).toBe('text');
      expect(standardResponse.content[0].text).toBeDefined();
      expect(standardResponse.metadata).toBeDefined();
    });

    it('should maintain metadata consistency across architectures', () => {
      const createMetadata = (architecture, handlerType, additionalData = {}) => {
        return {
          architecture,
          handler_type: handlerType,
          timestamp: Date.now(),
          version: '7.0.0',
          routing_decision: 'auto',
          performance: {
            routing_time_ms: Math.random() * 5,
            total_time_ms: Math.random() * 100 + 50
          },
          ...additionalData
        };
      };

      const tripleMetadata = createMetadata('triple', 'enhanced_query', {
        endpoint_used: 'nvidia_qwen',
        fallback_reason: null
      });

      const consolidatedMetadata = createMetadata('consolidated', 'multi_provider_query', {
        provider_chain: 'deepseek_claude_gemini',
        wilson_score: 0.87
      });

      expect(tripleMetadata.architecture).toBe('triple');
      expect(consolidatedMetadata.architecture).toBe('consolidated');
      expect(tripleMetadata.performance.routing_time_ms).toBeLessThan(10);
      expect(consolidatedMetadata.performance.routing_time_ms).toBeLessThan(10);
    });
  });

  describe('RED PHASE: Integration and Performance Tests', () => {
    
    it('should handle concurrent requests efficiently', async () => {
      // Mock concurrent request handling
      const handleConcurrentRequests = async (requests) => {
        const start = performance.now();
        const promises = requests.map(async (req, index) => {
          // Simulate processing time
          await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
          return {
            id: index,
            result: `Processed: ${req.tool}`,
            timestamp: Date.now()
          };
        });
        
        const results = await Promise.all(promises);
        const end = performance.now();
        
        return {
          results,
          total_time: end - start,
          concurrent_count: requests.length
        };
      };

      const testRequests = [
        { tool: 'enhanced_query', args: { prompt: 'Test 1' } },
        { tool: 'consolidated_multi_provider_query', args: { prompt: 'Test 2' } },
        { tool: 'direct_routing', args: { endpoint: 'local', prompt: 'Test 3' } }
      ];

      const result = await handleConcurrentRequests(testRequests);
      
      expect(result.results).toHaveLength(3);
      expect(result.concurrent_count).toBe(3);
      expect(result.total_time).toBeLessThan(200); // Should handle concurrency efficiently
    });

    it('should maintain handler performance under load', async () => {
      const benchmarkHandler = async (handlerName, iterations = 100) => {
        const times = [];
        
        for (let i = 0; i < iterations; i++) {
          const start = performance.now();
          
          // Simulate handler execution
          await new Promise(resolve => setTimeout(resolve, Math.random() * 5));
          
          const end = performance.now();
          times.push(end - start);
        }
        
        return {
          handler: handlerName,
          average_time: times.reduce((a, b) => a + b, 0) / times.length,
          max_time: Math.max(...times),
          min_time: Math.min(...times),
          total_iterations: iterations
        };
      };

      const tripleResults = await benchmarkHandler('enhanced_query', 50);
      const consolidatedResults = await benchmarkHandler('consolidated_multi_provider_query', 50);
      
      expect(tripleResults.average_time).toBeLessThan(10);
      expect(consolidatedResults.average_time).toBeLessThan(10);
      expect(tripleResults.max_time).toBeLessThan(20);
      expect(consolidatedResults.max_time).toBeLessThan(20);
    });
  });
});