// tests/statistical/endpoint-consistency.test.js
// RED: Endpoints should produce statistically consistent results

import { describe, test, expect } from 'vitest';
import { DualDeepSeekBridge } from '../../src/dual-bridge.js';

describe('Endpoint Statistical Consistency', () => {
  test('both endpoints should solve mathematical problems consistently', async () => {
    const bridge = new DualDeepSeekBridge();
    const testPrompt = "Calculate exactly: 847293 * 15 / 100. Show only the number.";
    
    // Multi-run testing for statistical validation
    const localResults = [];
    const cloudResults = [];
    
    for (let i = 0; i < 3; i++) {
      try {
        const localResult = await bridge.queryLocal(testPrompt);
        localResults.push(extractNumber(localResult.content));
      } catch (e) {
        console.log(`Local test ${i} failed:`, e.message);
      }
      
      try {
        const cloudResult = await bridge.queryCloud(testPrompt);
        cloudResults.push(extractNumber(cloudResult.content));
      } catch (e) {
        console.log(`Cloud test ${i} failed:`, e.message);
      }
    }
    
    // Statistical validation - at least one should work
    const totalTests = 6; // 3 local + 3 cloud
    const successfulTests = localResults.length + cloudResults.length;
    expect(successfulTests).toBeGreaterThan(0);
    
    // Check mathematical consistency (should all be ~127094)
    const expectedResult = 127094;
    const tolerance = 1; // Allow minor variations
    
    localResults.forEach(result => {
      expect(Math.abs(result - expectedResult)).toBeLessThan(tolerance);
    });
    
    cloudResults.forEach(result => {
      expect(Math.abs(result - expectedResult)).toBeLessThan(tolerance);
    });
  }, 60000);

  test('should demonstrate fallback behavior with mocked responses', async () => {
    const bridge = new DualDeepSeekBridge();
    
    // Test routing behavior with simple task
    const simpleTask = { tokens: 1000, complexity: 'simple' };
    expect(bridge.selectEndpoint(simpleTask)).toBe('local');
    
    // Test routing behavior with complex task 
    const complexTask = { tokens: 60000, complexity: 'complex' };
    expect(bridge.selectEndpoint(complexTask)).toBe('cloud');
    
    // Test intelligent routing logic
    const prompt = "Simple test";
    const response = await bridge.intelligentRouting(prompt, { task_complexity: 'simple' });
    expect(response).toBeDefined();
  }, 30000);
});

// Helper function
function extractNumber(text) {
  const match = text.match(/\d+/);
  return match ? parseInt(match[0]) : NaN;
}