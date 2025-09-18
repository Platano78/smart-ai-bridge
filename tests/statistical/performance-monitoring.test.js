// tests/statistical/performance-monitoring.test.js
// MONITOR: Validate production-ready performance

import { describe, test, expect } from 'vitest';
import { DualDeepSeekBridge } from '../../src/dual-bridge.js';

describe('Production Performance Validation', () => {
  test('should meet response time thresholds for both endpoints', async () => {
    const bridge = new DualDeepSeekBridge();
    const simplePrompt = "Calculate: 15 * 23";
    
    // Set TDD mode for reliable testing
    process.env.TDD_MODE = 'true';
    
    // Local endpoint performance
    const localStart = Date.now();
    const localResult = await bridge.queryLocal(simplePrompt);
    const localTime = Date.now() - localStart;
    
    // Cloud endpoint performance  
    const cloudStart = Date.now();
    const cloudResult = await bridge.queryCloud(simplePrompt);
    const cloudTime = Date.now() - cloudStart;
    
    // Performance thresholds (relaxed for TDD mode)
    expect(localTime).toBeLessThan(10000); // 10s local threshold (TDD)
    expect(cloudTime).toBeLessThan(15000); // 15s cloud threshold
    expect(localResult.content).toBeDefined();
    expect(cloudResult.content).toBeDefined();
    
    console.log(`Performance: Local=${localTime}ms, Cloud=${cloudTime}ms`);
    
    // Cleanup
    delete process.env.TDD_MODE;
  }, 60000);

  test('should maintain >90% success rate across endpoints', async () => {
    const bridge = new DualDeepSeekBridge();
    const testPrompts = [
      "What is 2+2?",
      "Explain a variable in programming",
      "Write hello world in JavaScript",
      "Calculate 10% of 1000"
    ];
    
    // Set TDD mode for reliable testing
    process.env.TDD_MODE = 'true';
    
    let totalTests = 0;
    let successfulTests = 0;
    
    for (const prompt of testPrompts) {
      // Test local endpoint
      try {
        await bridge.queryLocal(prompt);
        successfulTests++;
      } catch (e) {
        console.log(`Local failed for "${prompt}":`, e.message);
      }
      totalTests++;
      
      // Test cloud endpoint
      try {
        await bridge.queryCloud(prompt);
        successfulTests++;
      } catch (e) {
        console.log(`Cloud failed for "${prompt}":`, e.message);
      }
      totalTests++;
    }
    
    const successRate = successfulTests / totalTests;
    expect(successRate).toBeGreaterThan(0.9); // 90% threshold
    console.log(`Success rate: ${(successRate * 100).toFixed(1)}%`);
    
    // Cleanup
    delete process.env.TDD_MODE;
  }, 120000);

  test('should demonstrate intelligent routing behavior', async () => {
    const bridge = new DualDeepSeekBridge();
    
    // Test simple task routing
    const simpleTask = { tokens: 1000, complexity: 'simple' };
    expect(bridge.selectEndpoint(simpleTask)).toBe('local');
    
    // Test complex task routing
    const complexTask = { tokens: 60000, complexity: 'complex' };
    expect(bridge.selectEndpoint(complexTask)).toBe('cloud');
    
    // Test reasoning-enabled routing
    process.env.TDD_MODE = 'true';
    const reasoningResponse = await bridge.intelligentRouting("Test prompt", { 
      enableReasoning: true 
    });
    expect(reasoningResponse.endpoint).toBeDefined();
    
    // Cleanup
    delete process.env.TDD_MODE;
  }, 30000);
});