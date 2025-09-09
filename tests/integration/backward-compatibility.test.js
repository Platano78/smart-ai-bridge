// tests/integration/backward-compatibility.test.js
// REFACTOR: Ensure existing MCP functionality preserved

import { describe, test, expect, beforeEach } from 'vitest';
import { EnhancedMCPServer } from '../../src/enhanced-mcp-server.js';

describe('Backward Compatibility Validation', () => {
  let server;
  
  beforeEach(() => {
    server = new EnhancedMCPServer();
  });

  test('should preserve existing query_deepseek tool interface', async () => {
    // Test original tool usage still works
    const result = await server.handleQueryDeepSeek({
      prompt: "What is 5 + 5?",
      task_type: "coding"
    });
    
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('10');
  }, 30000);

  test('should enhance tool with new dual endpoint features', async () => {
    // Test new endpoint preference feature
    const result = await server.handleQueryDeepSeek({
      prompt: "Simple calculation test",
      endpoint_preference: "local-only"
    });
    
    expect(result.metadata.endpoint_used).toBeDefined();
  }, 30000);

  test('should provide comprehensive status check', async () => {
    const status = await server.handleStatusCheck();
    
    expect(status.content[0].text).toContain('Local Endpoint');
    expect(status.content[0].text).toContain('Cloud Endpoint');
    expect(status.content[0].text).toContain('NVIDIA');
  }, 30000);
});