// tests/triple-endpoint/mcp-integration.test.js
// TDD RED PHASE: Test suite for MCP tool integration with triple endpoints

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

describe('TripleEndpoint MCP Integration', () => {
  let mcpServer;
  let bridge;

  beforeEach(async () => {
    const { EnhancedTripleMCPServer } = await import('../../src/enhanced-triple-mcp-server.js');
    mcpServer = new EnhancedTripleMCPServer();
    bridge = mcpServer.bridge;
  });

  describe('Tool Registration', () => {
    it('should register all triple endpoint tools', async () => {
      const tools = await mcpServer.getToolList();
      
      const expectedTools = [
        'query_deepseek',
        'check_deepseek_status', 
        'route_to_endpoint',
        'compare_endpoints'
      ];

      expectedTools.forEach(toolName => {
        const tool = tools.find(t => t.name === toolName);
        expect(tool).toBeDefined();
      });
    });

    it('should provide correct tool schemas', async () => {
      const tools = await mcpServer.getToolList();
      const queryTool = tools.find(t => t.name === 'query_deepseek');
      
      expect(queryTool.inputSchema.properties).toHaveProperty('prompt');
      expect(queryTool.inputSchema.properties).toHaveProperty('task_type');
      expect(queryTool.inputSchema.properties).toHaveProperty('endpoint_preference');
      
      // Check task_type enum includes new coding specialization
      expect(queryTool.inputSchema.properties.task_type.enum).toContain('coding');
      expect(queryTool.inputSchema.properties.task_type.enum).toContain('analysis');
      expect(queryTool.inputSchema.properties.task_type.enum).toContain('unlimited');
    });
  });

  describe('Enhanced Query Tool', () => {
    it('should handle enhanced queries with task specialization', async () => {
      vi.spyOn(bridge, 'queryEndpoint').mockResolvedValueOnce({
        content: 'Qwen 3 Coder response for Python function',
        endpoint: 'NVIDIA Qwen 3 Coder 480B',
        model: 'qwen/qwen3-coder-480b-a35b-instruct',
        specialization: 'coding_expert'
      });

      const result = await mcpServer.handleEnhancedQuery({
        prompt: 'Write a Python function to parse JSON',
        task_type: 'coding',
        endpoint_preference: 'auto'
      });

      expect(result.content[0].text).toContain('NVIDIA Qwen 3 Coder 480B');
      expect(result.content[0].text).toContain('coding_expert');
      expect(result.metadata.endpoint_used).toBe('NVIDIA Qwen 3 Coder 480B');
    });

    it('should handle analysis tasks with DeepSeek V3', async () => {
      vi.spyOn(bridge, 'queryEndpoint').mockResolvedValueOnce({
        content: 'DeepSeek V3 analysis of game balance metrics',
        endpoint: 'NVIDIA DeepSeek V3',
        model: 'nvidia/deepseek-v3',
        specialization: 'math_analysis'
      });

      const result = await mcpServer.handleEnhancedQuery({
        prompt: 'Analyze game balance for weapon damage values',
        task_type: 'analysis',
        endpoint_preference: 'auto'
      });

      expect(result.content[0].text).toContain('NVIDIA DeepSeek V3');
      expect(result.content[0].text).toContain('math_analysis');
    });

    it('should include fallback metadata when endpoints fail', async () => {
      vi.spyOn(bridge, 'queryEndpoint')
        .mockRejectedValueOnce(new Error('Primary endpoint failed'))
        .mockResolvedValueOnce({
          content: 'Fallback response from local',
          endpoint: 'Local DeepSeek',
          model: 'deepseek-coder-v2-lite-instruct'
        });

      bridge.lastFallbackReason = 'primary_endpoint_failed';

      const result = await mcpServer.handleEnhancedQuery({
        prompt: 'Test prompt',
        endpoint_preference: 'nvidia_qwen'
      });

      expect(result.metadata.fallback_reason).toBe('primary_endpoint_failed');
    });
  });

  describe('Direct Endpoint Routing Tool', () => {
    it('should route directly to specified endpoint', async () => {
      vi.spyOn(bridge, 'queryEndpoint').mockResolvedValueOnce({
        content: 'Direct response from Qwen 3 Coder',
        endpoint: 'NVIDIA Qwen 3 Coder 480B',
        model: 'qwen/qwen3-coder-480b-a35b-instruct'
      });

      const result = await mcpServer.handleDirectRouting({
        endpoint: 'nvidia_qwen',
        prompt: 'Direct query to Qwen 3 Coder'
      });

      expect(result.content[0].text).toContain('Direct Query - NVIDIA Qwen 3 Coder 480B');
      expect(result.content[0].text).toContain('Direct response from Qwen 3 Coder');
    });

    it('should handle direct routing failures', async () => {
      vi.spyOn(bridge, 'queryEndpoint').mockRejectedValueOnce(
        new Error('Direct endpoint unavailable')
      );

      await expect(mcpServer.handleDirectRouting({
        endpoint: 'nvidia_qwen',
        prompt: 'Test direct routing failure'
      })).rejects.toThrow('Direct routing to nvidia_qwen failed');
    });
  });

  describe('Endpoint Comparison Tool', () => {
    it('should compare responses from multiple endpoints', async () => {
      // Mock responses from all three endpoints
      vi.spyOn(bridge, 'queryEndpoint')
        .mockResolvedValueOnce({
          content: 'Local DeepSeek response',
          endpoint: 'Local DeepSeek',
          model: 'deepseek-coder-v2-lite-instruct'
        })
        .mockResolvedValueOnce({
          content: 'DeepSeek V3 analysis response',
          endpoint: 'NVIDIA DeepSeek V3',
          model: 'nvidia/deepseek-v3'
        })
        .mockResolvedValueOnce({
          content: 'Qwen 3 Coder implementation',
          endpoint: 'NVIDIA Qwen 3 Coder 480B',
          model: 'qwen/qwen3-coder-480b-a35b-instruct'
        });

      const result = await mcpServer.handleEndpointComparison({
        prompt: 'Compare implementation approaches',
        endpoints: ['local', 'nvidia_deepseek', 'nvidia_qwen']
      });

      expect(result.content[0].text).toContain('Endpoint Comparison Results');
      expect(result.content[0].text).toContain('Local DeepSeek response');
      expect(result.content[0].text).toContain('DeepSeek V3 analysis response');
      expect(result.content[0].text).toContain('Qwen 3 Coder implementation');
    });

    it('should handle partial endpoint failures in comparison', async () => {
      vi.spyOn(bridge, 'queryEndpoint')
        .mockResolvedValueOnce({
          content: 'Success response',
          endpoint: 'Local DeepSeek',
          model: 'deepseek-coder-v2-lite-instruct'
        })
        .mockRejectedValueOnce(new Error('Endpoint failed'))
        .mockResolvedValueOnce({
          content: 'Another success response',
          endpoint: 'NVIDIA Qwen 3 Coder 480B',
          model: 'qwen/qwen3-coder-480b-a35b-instruct'
        });

      const result = await mcpServer.handleEndpointComparison({
        prompt: 'Test with partial failure',
        endpoints: ['local', 'nvidia_deepseek', 'nvidia_qwen']
      });

      expect(result.content[0].text).toContain('Success response');
      expect(result.content[0].text).toContain('Error: Endpoint failed');
      expect(result.content[0].text).toContain('Another success response');
    });
  });

  describe('Status Monitoring Tool', () => {
    it('should provide comprehensive status for all endpoints', async () => {
      // Mock successful health checks
      vi.spyOn(bridge, 'queryEndpoint')
        .mockResolvedValue({ content: 'OK' });

      const result = await mcpServer.handleTripleStatus();
      
      expect(result.content[0].text).toContain('Triple Endpoint Status');
      expect(result.content[0].text).toContain('Local DeepSeek');
      expect(result.content[0].text).toContain('NVIDIA DeepSeek V3');
      expect(result.content[0].text).toContain('NVIDIA Qwen 3 Coder 480B');
      expect(result.content[0].text).toContain('Smart Routing Active');
    });

    it('should show priority ordering in status', async () => {
      vi.spyOn(bridge, 'queryEndpoint').mockResolvedValue({ content: 'OK' });

      const result = await mcpServer.handleTripleStatus();
      
      // Status should be ordered by priority (1 = highest)
      const statusText = result.content[0].text;
      const qwenIndex = statusText.indexOf('Qwen 3 Coder');
      const deepseekIndex = statusText.indexOf('DeepSeek V3');
      const localIndex = statusText.indexOf('Local DeepSeek');
      
      expect(qwenIndex).toBeLessThan(deepseekIndex);
      expect(deepseekIndex).toBeLessThan(localIndex);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle MCP tool call errors gracefully', async () => {
      vi.spyOn(bridge, 'queryEndpoint').mockRejectedValue(
        new Error('Critical system failure')
      );

      const result = await mcpServer.handleEnhancedQuery({
        prompt: 'Test error handling'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error: Critical system failure');
    });

    it('should validate tool input parameters', async () => {
      await expect(mcpServer.handleDirectRouting({
        endpoint: 'invalid_endpoint',
        prompt: 'Test validation'
      })).rejects.toThrow();

      await expect(mcpServer.handleEnhancedQuery({
        // Missing required prompt parameter
      })).rejects.toThrow();
    });
  });

  describe('Performance Monitoring', () => {
    it('should track endpoint usage statistics', async () => {
      vi.spyOn(bridge, 'queryEndpoint').mockResolvedValue({
        content: 'Response',
        endpoint: 'NVIDIA Qwen 3 Coder 480B'
      });

      // Make several queries
      await mcpServer.handleEnhancedQuery({ prompt: 'Query 1', task_type: 'coding' });
      await mcpServer.handleEnhancedQuery({ prompt: 'Query 2', task_type: 'coding' });
      
      // Should have usage statistics
      expect(bridge.usageStats).toBeDefined();
      expect(bridge.usageStats.nvidia_qwen).toBeGreaterThan(0);
    });

    it('should measure response times', async () => {
      const startTime = Date.now();
      
      vi.spyOn(bridge, 'queryEndpoint').mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ content: 'Test' }), 100))
      );

      await mcpServer.handleEnhancedQuery({ prompt: 'Test timing' });
      
      expect(bridge.lastResponseTime).toBeGreaterThan(0);
      expect(bridge.lastResponseTime).toBeLessThan(1000);
    });
  });
});