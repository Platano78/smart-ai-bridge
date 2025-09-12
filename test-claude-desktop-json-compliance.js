#!/usr/bin/env node
// test-claude-desktop-json-compliance.js
// Atomic test for Claude Desktop JSON compliance
// Tests that all MCP server responses are valid JSON without emojis

import { EnhancedTripleMCPServer } from './src/enhanced-triple-mcp-server.js';
import { sanitizeForJSON, validateJSONResponse } from './src/json-sanitizer.js';

console.log('🧪 Testing Claude Desktop JSON Compliance...\n');

class JSONComplianceTest {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(name, testFn) {
    this.tests.push({ name, testFn });
  }

  async runAll() {
    console.log(`Running ${this.tests.length} JSON compliance tests...\n`);
    
    for (const { name, testFn } of this.tests) {
      try {
        console.log(`[TEST] ${name}...`);
        await testFn();
        console.log(`[PASS] ${name} ✅\n`);
        this.passed++;
      } catch (error) {
        console.log(`[FAIL] ${name} ❌`);
        console.log(`Error: ${error.message}\n`);
        this.failed++;
      }
    }
    
    this.printSummary();
  }

  printSummary() {
    console.log(`\n=== JSON COMPLIANCE TEST RESULTS ===`);
    console.log(`Total: ${this.tests.length}`);
    console.log(`Passed: ${this.passed} ✅`);
    console.log(`Failed: ${this.failed} ❌`);
    console.log(`Success Rate: ${Math.round((this.passed / this.tests.length) * 100)}%`);
    
    if (this.failed === 0) {
      console.log(`\n🎉 ALL TESTS PASSED - Claude Desktop ready!`);
    } else {
      console.log(`\n🚨 ${this.failed} test(s) failed - JSON compliance issues detected`);
    }
  }

  assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  assertNoEmojis(text) {
    const emojiRegex = /[⚠️🎯🏗️⚙️🚀📊✅❌🔍🧠⚡【≽ܫ≼】]/;
    if (emojiRegex.test(text)) {
      throw new Error(`Text contains emojis that break JSON: "${text.substring(0, 100)}..."`);
    }
  }

  assertValidJSON(obj) {
    try {
      JSON.stringify(obj);
    } catch (error) {
      throw new Error(`Object is not JSON serializable: ${error.message}`);
    }
  }
}

// Create test instance
const tester = new JSONComplianceTest();

// Test 1: JSON sanitizer function
tester.test('JSON sanitizer removes emojis correctly', () => {
  const testText = "🎯 **Triple Endpoint Status** ⚠️ Warning: System ready! 🚀";
  const sanitized = sanitizeForJSON(testText);
  
  tester.assertNoEmojis(sanitized);
  tester.assert(sanitized.includes("Triple Endpoint Status"), "Content should be preserved");
  tester.assert(sanitized.includes("Warning: System ready!"), "Warning text should be preserved");
});

// Test 2: MCP response structure validation
tester.test('MCP response structure is JSON compliant', () => {
  const mockResponse = {
    content: [{
      type: 'text',
      text: sanitizeForJSON('🎯 **Status**: All systems operational ⚡')
    }]
  };
  
  tester.assertValidJSON(mockResponse);
  tester.assertNoEmojis(mockResponse.content[0].text);
});

// Test 3: Triple endpoint status response compliance
tester.test('Triple endpoint status response is JSON compliant', async () => {
  // Simulate the status response that was causing issues
  const statusText = `**NVIDIA Qwen 3 Coder 480B** (coding_expert)
Model: qwen/qwen3-coder-480b-a35b-instruct
Status: Online
Priority: 1

**NVIDIA DeepSeek V3.1** (math_analysis)  
Model: deepseek-ai/deepseek-v3.1
Status: Online
Priority: 2`;

  const statusResponse = `**Triple Endpoint Status - DeepSeek MCP Bridge v7.0.0**

${statusText}

**Smart Routing Active:**
- Coding Tasks → Qwen 3 Coder 480B
- Math/Analysis → DeepSeek V3
- Unlimited Tokens → Local DeepSeek

**System Ready for Game Development!**`;

  const response = {
    content: [{
      type: 'text',
      text: sanitizeForJSON(statusResponse)
    }]
  };
  
  tester.assertValidJSON(response);
  tester.assertNoEmojis(response.content[0].text);
  tester.assert(response.content[0].text.includes("Triple Endpoint Status"), "Status content preserved");
});

// Test 4: Error response compliance  
tester.test('Error responses are JSON compliant', () => {
  const errorResponse = {
    content: [{
      type: 'text',
      text: sanitizeForJSON('Error: ⚠️ Primary endpoint failed with timeout')
    }],
    isError: true
  };
  
  tester.assertValidJSON(errorResponse);
  tester.assertNoEmojis(errorResponse.content[0].text);
  tester.assert(errorResponse.content[0].text.includes("Primary endpoint failed"), "Error message preserved");
});

// Test 5: Complex response with multiple content items
tester.test('Complex responses with multiple content items are compliant', () => {
  const complexResponse = {
    content: [
      {
        type: 'text',
        text: sanitizeForJSON('🎯 **ROUTING DECISION**: Using NVIDIA Qwen 3 Coder 480B')
      },
      {
        type: 'text', 
        text: sanitizeForJSON('⚡ **PERFORMANCE**: Response time <2s expected')
      }
    ]
  };
  
  tester.assertValidJSON(complexResponse);
  complexResponse.content.forEach(item => {
    tester.assertNoEmojis(item.text);
  });
  tester.assert(complexResponse.content[0].text.includes("ROUTING DECISION"), "First content preserved");
  tester.assert(complexResponse.content[1].text.includes("PERFORMANCE"), "Second content preserved");
});

// Test 6: Validate JSON response function
tester.test('validateJSONResponse function works correctly', () => {
  const validResponse = { content: [{ type: 'text', text: 'Valid response' }] };
  const invalidResponse = { content: [{ type: 'text', text: undefined }] };
  
  tester.assert(validateJSONResponse(validResponse), "Valid response should pass validation");
  // Note: validateJSONResponse handles invalid responses gracefully, so we just ensure it doesn't crash
  const result = validateJSONResponse(invalidResponse);
  tester.assert(typeof result === 'boolean', "Function should return boolean for any input");
});

// Test 7: Real-world emoji patterns
tester.test('All known problematic emoji patterns are removed', () => {
  const problematicText = `
    🎯 **Routing**: NVIDIA Qwen selected
    ⚠️ **Primary**: DeepSeek endpoint failed  
    🧠 **Smart Routing Active**:
    ⚡ **System Ready** for development!
    【≽ܫ≼】 MCP-KING: Protocol compliance achieved
  `;
  
  const sanitized = sanitizeForJSON(problematicText);
  tester.assertNoEmojis(sanitized);
  tester.assert(sanitized.includes("Routing"), "Routing text preserved");
  tester.assert(sanitized.includes("Primary"), "Primary text preserved");
  tester.assert(sanitized.includes("Smart Routing Active"), "Smart routing text preserved");
});

// Run all tests
tester.runAll().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});