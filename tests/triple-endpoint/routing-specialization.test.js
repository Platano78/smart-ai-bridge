// tests/triple-endpoint/routing-specialization.test.js
// TDD RED PHASE: Test suite for intelligent routing and task specialization

import { describe, it, expect, beforeEach } from 'vitest';

describe('TripleEndpoint Routing Specialization', () => {
  let bridge;

  beforeEach(async () => {
    const { TripleDeepSeekBridge } = await import('../../src/triple-bridge.js');
    bridge = new TripleDeepSeekBridge();
  });

  describe('Coding Task Detection', () => {
    const codingPatterns = [
      // Programming languages
      { prompt: 'Write a JavaScript function to sort arrays', expected: 'nvidia_qwen' },
      { prompt: 'Create a Python class for data processing', expected: 'nvidia_qwen' },
      { prompt: 'Debug this C++ code with memory leaks', expected: 'nvidia_qwen' },
      { prompt: 'Refactor this TypeScript React component', expected: 'nvidia_qwen' },
      
      // Development tasks
      { prompt: 'Implement REST API endpoints', expected: 'nvidia_qwen' },
      { prompt: 'Fix the bug in user authentication', expected: 'nvidia_qwen' },
      { prompt: 'Optimize database query performance', expected: 'nvidia_qwen' },
      { prompt: 'Add unit tests for the payment module', expected: 'nvidia_qwen' },
      
      // Technical implementation
      { prompt: 'Design algorithm for pathfinding', expected: 'nvidia_qwen' },
      { prompt: 'Code review for security vulnerabilities', expected: 'nvidia_qwen' },
      { prompt: 'Implement caching mechanism', expected: 'nvidia_qwen' }
    ];

    codingPatterns.forEach(({ prompt, expected }) => {
      it(`should route "${prompt}" to ${expected}`, () => {
        const result = bridge.selectOptimalEndpoint(prompt, 'coding');
        expect(result).toBe(expected);
      });
    });
  });

  describe('Math and Analysis Task Detection', () => {
    const mathAnalysisPatterns = [
      // Mathematical calculations
      { prompt: 'Calculate statistical significance of A/B test', expected: 'nvidia_deepseek' },
      { prompt: 'Analyze correlation between user engagement metrics', expected: 'nvidia_deepseek' },
      { prompt: 'Solve differential equations for physics simulation', expected: 'nvidia_deepseek' },
      
      // Game balance and economics
      { prompt: 'Balance game economy for in-app purchases', expected: 'nvidia_deepseek' },
      { prompt: 'Analyze player progression curves', expected: 'nvidia_deepseek' },
      { prompt: 'Calculate optimal pricing strategy', expected: 'nvidia_deepseek' },
      
      // Research and strategy
      { prompt: 'Research market trends in mobile gaming', expected: 'nvidia_deepseek' },
      { prompt: 'Analyze performance benchmarks', expected: 'nvidia_deepseek' },
      { prompt: 'Evaluate user behavior patterns', expected: 'nvidia_deepseek' }
    ];

    mathAnalysisPatterns.forEach(({ prompt, expected }) => {
      it(`should route "${prompt}" to ${expected}`, () => {
        const result = bridge.selectOptimalEndpoint(prompt, 'analysis');
        expect(result).toBe(expected);
      });
    });
  });

  describe('Large Context Task Detection', () => {
    it('should route very large prompts to local endpoint', () => {
      const largePrompt = 'Analyze this large codebase: ' + 'x'.repeat(100000);
      const result = bridge.selectOptimalEndpoint(largePrompt, 'general');
      expect(result).toBe('local');
    });

    it('should consider token limits for routing decisions', () => {
      // Simulate a prompt that would exceed cloud endpoint limits
      const contextHeavyPrompt = 'Process this entire documentation: ' + 'text '.repeat(20000);
      const result = bridge.selectOptimalEndpoint(contextHeavyPrompt, 'general');
      expect(result).toBe('local');
    });
  });

  describe('Task Type Classification', () => {
    it('should classify coding tasks correctly', () => {
      expect(bridge.classifyTaskFromPrompt('Write a Python function')).toBe('coding');
      expect(bridge.classifyTaskFromPrompt('Debug this JavaScript error')).toBe('coding');
      expect(bridge.classifyTaskFromPrompt('Refactor this component')).toBe('coding');
    });

    it('should classify analysis tasks correctly', () => {
      expect(bridge.classifyTaskFromPrompt('Analyze user metrics')).toBe('analysis');
      expect(bridge.classifyTaskFromPrompt('Calculate game balance')).toBe('analysis');
      expect(bridge.classifyTaskFromPrompt('Research market trends')).toBe('analysis');
    });

    it('should classify mixed tasks appropriately', () => {
      // Should default to most specific classification
      expect(bridge.classifyTaskFromPrompt('Write code to analyze data')).toBe('coding');
      expect(bridge.classifyTaskFromPrompt('Analyze and fix performance issues')).toBe('analysis');
    });
  });

  describe('Priority-Based Routing', () => {
    it('should respect endpoint priorities for equal specialization', () => {
      // When multiple endpoints could handle a task, choose by priority
      const ambiguousPrompt = 'Help with general development task';
      const result = bridge.selectOptimalEndpoint(ambiguousPrompt, 'general');
      
      // Should use highest priority endpoint (Qwen 3 Coder = priority 1)
      expect(result).toBe('nvidia_qwen');
    });

    it('should override priority when specialization is clear', () => {
      const mathPrompt = 'Calculate statistical significance';
      const result = bridge.selectOptimalEndpoint(mathPrompt, 'analysis');
      
      // Should use DeepSeek V3 despite lower priority due to specialization
      expect(result).toBe('nvidia_deepseek');
    });
  });

  describe('Context-Aware Routing', () => {
    it('should consider context in routing decisions', () => {
      const contextualPrompts = [
        {
          prompt: 'function',
          context: 'I need help debugging a JavaScript function that handles user authentication',
          expected: 'nvidia_qwen'
        },
        {
          prompt: 'analyze',
          context: 'Statistical analysis of user engagement data from mobile game',
          expected: 'nvidia_deepseek'
        },
        {
          prompt: 'process large file',
          context: 'Need to process a 500MB log file with unlimited token capacity',
          expected: 'local'
        }
      ];

      contextualPrompts.forEach(({ prompt, context, expected }) => {
        const fullPrompt = `${context}\n\n${prompt}`;
        const result = bridge.selectOptimalEndpoint(fullPrompt, 'general');
        expect(result).toBe(expected);
      });
    });
  });

  describe('Routing Decision Confidence', () => {
    it('should provide confidence scores for routing decisions', () => {
      const decisions = [
        { prompt: 'Write Python function', expectedConfidence: 'high' },
        { prompt: 'Calculate statistics', expectedConfidence: 'high' },
        { prompt: 'General help needed', expectedConfidence: 'low' }
      ];

      decisions.forEach(({ prompt, expectedConfidence }) => {
        const confidence = bridge.getRoutingConfidence(prompt);
        expect(confidence).toBe(expectedConfidence);
      });
    });
  });
});