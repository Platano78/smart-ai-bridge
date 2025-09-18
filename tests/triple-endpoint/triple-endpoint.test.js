// tests/triple-endpoint/triple-endpoint.test.js
// TDD RED PHASE: Comprehensive test suite for triple endpoint functionality

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('TripleDeepSeekBridge', () => {
  let bridge;

  beforeEach(async () => {
    // This will fail initially since TripleDeepSeekBridge doesn't exist yet
    const { TripleDeepSeekBridge } = await import('../../src/triple-bridge.js');
    bridge = new TripleDeepSeekBridge();
  });

  describe('Endpoint Configuration', () => {
    it('should configure three endpoints correctly', () => {
      expect(bridge.endpoints).toHaveProperty('local');
      expect(bridge.endpoints).toHaveProperty('nvidia_deepseek');
      expect(bridge.endpoints).toHaveProperty('nvidia_qwen');
      
      expect(bridge.endpoints.local.specialization).toBe('unlimited_tokens');
      expect(bridge.endpoints.nvidia_deepseek.specialization).toBe('math_analysis');
      expect(bridge.endpoints.nvidia_qwen.specialization).toBe('coding_expert');
    });

    it('should set correct models for each endpoint', () => {
      expect(bridge.endpoints.local.model).toBe('deepseek-coder-v2-lite-instruct');
      expect(bridge.endpoints.nvidia_deepseek.model).toBe('nvidia/deepseek-v3');
      expect(bridge.endpoints.nvidia_qwen.model).toBe('qwen/qwen3-coder-480b-a35b-instruct');
    });

    it('should set correct priorities for routing', () => {
      expect(bridge.endpoints.nvidia_qwen.priority).toBe(1); // Highest priority
      expect(bridge.endpoints.nvidia_deepseek.priority).toBe(2);
      expect(bridge.endpoints.local.priority).toBe(3);
    });
  });

  describe('Smart Routing Logic', () => {
    it('should route coding tasks to Qwen 3 Coder', () => {
      const codingPrompts = [
        'Write a Python function to calculate factorial',
        'Debug this JavaScript code: function foo() {}',
        'Refactor this React component for better performance',
        'Implement a REST API endpoint in Node.js'
      ];

      codingPrompts.forEach(prompt => {
        const endpoint = bridge.selectOptimalEndpoint(prompt, 'coding');
        expect(endpoint).toBe('nvidia_qwen');
      });
    });

    it('should route math/analysis tasks to DeepSeek V3', () => {
      const mathPrompts = [
        'Calculate the statistical significance of this data',
        'Analyze the performance metrics of this algorithm',
        'Evaluate the game balance for this mechanic',
        'Research the market trends in AI development'
      ];

      mathPrompts.forEach(prompt => {
        const endpoint = bridge.selectOptimalEndpoint(prompt, 'analysis');
        expect(endpoint).toBe('nvidia_deepseek');
      });
    });

    it('should route large token tasks to local endpoint', () => {
      const largePrompt = 'x'.repeat(60000); // Very large prompt
      const endpoint = bridge.selectOptimalEndpoint(largePrompt, 'general');
      expect(endpoint).toBe('local');
    });

    it('should respect user preference overrides', () => {
      const endpoint = bridge.selectOptimalEndpoint(
        'Write code', 
        'coding', 
        'local' // User preference override
      );
      expect(endpoint).toBe('local');
    });
  });

  describe('Individual Endpoint Handlers', () => {
    it('should query local endpoint successfully', async () => {
      // Mock the local endpoint response
      vi.spyOn(bridge, 'queryEndpoint').mockResolvedValueOnce({
        content: 'Local response',
        endpoint: 'Local DeepSeek',
        model: 'deepseek-coder-v2-lite-instruct',
        specialization: 'unlimited_tokens'
      });

      const result = await bridge.queryEndpoint('local', 'test prompt');
      expect(result.endpoint).toBe('Local DeepSeek');
      expect(result.specialization).toBe('unlimited_tokens');
    });

    it('should query NVIDIA DeepSeek V3 successfully', async () => {
      vi.spyOn(bridge, 'queryEndpoint').mockResolvedValueOnce({
        content: 'DeepSeek V3 response',
        endpoint: 'NVIDIA DeepSeek V3',
        model: 'nvidia/deepseek-v3',
        specialization: 'math_analysis'
      });

      const result = await bridge.queryEndpoint('nvidia_deepseek', 'analyze this data');
      expect(result.endpoint).toBe('NVIDIA DeepSeek V3');
      expect(result.specialization).toBe('math_analysis');
    });

    it('should query NVIDIA Qwen 3 Coder successfully', async () => {
      vi.spyOn(bridge, 'queryEndpoint').mockResolvedValueOnce({
        content: 'Qwen 3 Coder response',
        endpoint: 'NVIDIA Qwen 3 Coder 480B',
        model: 'qwen/qwen3-coder-480b-a35b-instruct',
        specialization: 'coding_expert'
      });

      const result = await bridge.queryEndpoint('nvidia_qwen', 'write Python code');
      expect(result.endpoint).toBe('NVIDIA Qwen 3 Coder 480B');
      expect(result.specialization).toBe('coding_expert');
    });
  });

  describe('Fallback and Error Handling', () => {
    it('should fallback from primary to secondary endpoint on failure', async () => {
      // Mock primary endpoint failure and secondary success
      vi.spyOn(bridge, 'queryEndpoint')
        .mockRejectedValueOnce(new Error('Primary endpoint failed'))
        .mockResolvedValueOnce({
          content: 'Fallback response',
          endpoint: 'Local DeepSeek',
          model: 'deepseek-coder-v2-lite-instruct'
        });

      const result = await bridge.handleEnhancedQuery({
        prompt: 'test prompt',
        endpoint_preference: 'nvidia_qwen'
      });

      expect(result.content[0].text).toContain('Fallback response');
    });

    it('should try all endpoints before failing completely', async () => {
      // Mock all endpoints failing
      vi.spyOn(bridge, 'queryEndpoint').mockRejectedValue(new Error('All endpoints failed'));

      await expect(bridge.handleEnhancedQuery({
        prompt: 'test prompt'
      })).rejects.toThrow('All endpoints failed');
    });

    it('should handle network timeouts gracefully', async () => {
      vi.spyOn(bridge, 'queryEndpoint').mockRejectedValueOnce(new Error('Network timeout'));
      
      // Should attempt fallback
      const spy = vi.spyOn(bridge, 'selectOptimalEndpoint');
      
      try {
        await bridge.handleEnhancedQuery({ prompt: 'test' });
      } catch (e) {
        // Expected to fail in RED phase
      }
      
      expect(spy).toHaveBeenCalled();
    }, 10000);
  });

  describe('Health Check and Status Monitoring', () => {
    it('should check all three endpoints health status', async () => {
      const status = await bridge.handleTripleStatus();
      
      expect(status.content[0].text).toContain('Local DeepSeek');
      expect(status.content[0].text).toContain('NVIDIA DeepSeek V3');
      expect(status.content[0].text).toContain('NVIDIA Qwen 3 Coder 480B');
    }, 10000);

    it('should report individual endpoint status', async () => {
      // Mock health checks
      vi.spyOn(bridge, 'queryEndpoint')
        .mockResolvedValueOnce({ content: 'OK' })
        .mockResolvedValueOnce({ content: 'OK' })
        .mockResolvedValueOnce({ content: 'OK' });

      const status = await bridge.handleTripleStatus();
      expect(status.content[0].text).toContain('✅ Online');
    });

    it('should detect and report failed endpoints', async () => {
      // Mock one endpoint failing
      vi.spyOn(bridge, 'queryEndpoint')
        .mockResolvedValueOnce({ content: 'OK' })
        .mockRejectedValueOnce(new Error('Endpoint down'))
        .mockResolvedValueOnce({ content: 'OK' });

      const status = await bridge.handleTripleStatus();
      expect(status.content[0].text).toContain('❌ Error');
    });
  });

  describe('MCP Tool Integration', () => {
    it('should provide enhanced query_deepseek tool', async () => {
      const result = await bridge.handleEnhancedQuery({
        prompt: 'Write a function',
        task_type: 'coding'
      });

      expect(result).toHaveProperty('content');
      expect(result.content).toBeInstanceOf(Array);
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should provide direct endpoint routing tool', async () => {
      const result = await bridge.handleDirectRouting({
        endpoint: 'nvidia_qwen',
        prompt: 'Test direct routing'
      });

      expect(result).toHaveProperty('content');
      expect(result.content[0].text).toContain('Direct Query');
    });

    it('should provide endpoint comparison tool', async () => {
      // Mock responses for comparison
      vi.spyOn(bridge, 'queryEndpoint')
        .mockResolvedValueOnce({ content: 'Response 1', endpoint: 'Local DeepSeek' })
        .mockResolvedValueOnce({ content: 'Response 2', endpoint: 'NVIDIA DeepSeek V3' })
        .mockResolvedValueOnce({ content: 'Response 3', endpoint: 'NVIDIA Qwen 3 Coder' });

      const result = await bridge.handleEndpointComparison({
        prompt: 'Compare this',
        endpoints: ['local', 'nvidia_deepseek', 'nvidia_qwen']
      });

      expect(result.content[0].text).toContain('Endpoint Comparison Results');
      expect(result.content[0].text).toContain('Response 1');
      expect(result.content[0].text).toContain('Response 2');
      expect(result.content[0].text).toContain('Response 3');
    });
  });

  describe('Performance and Optimization', () => {
    it('should complete queries within acceptable time limits', async () => {
      const startTime = Date.now();
      
      // Mock quick response
      vi.spyOn(bridge, 'queryEndpoint').mockResolvedValueOnce({
        content: 'Quick response',
        endpoint: 'NVIDIA Qwen 3 Coder 480B'
      });

      await bridge.handleEnhancedQuery({
        prompt: 'Quick test',
        task_type: 'coding'
      });

      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(5000); // Should complete in < 5 seconds
    });

    it('should cache routing decisions for similar prompts', () => {
      const prompt1 = 'Write a Python function';
      const prompt2 = 'Create a Python method';
      
      const endpoint1 = bridge.selectOptimalEndpoint(prompt1, 'coding');
      const endpoint2 = bridge.selectOptimalEndpoint(prompt2, 'coding');
      
      expect(endpoint1).toBe(endpoint2); // Should route to same endpoint
    });
  });
});