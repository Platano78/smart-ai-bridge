#!/usr/bin/env node

/**
 * Test the new ask tool
 */

import { MechaKingGhidorahServer } from './server.js';

async function testAskTool() {
  console.log('🧪 Testing MKG Ask Tool');
  console.log('=' * 50);

  // Simulate the ask tool call
  const mockArgs = {
    model: 'qwen3',
    prompt: 'Write a simple Python function to calculate factorial',
    max_tokens: 500
  };

  try {
    const server = new MechaKingGhidorahServer();

    // Test the handleAsk method directly
    const result = await server.handleAsk(mockArgs);

    console.log('📊 Result:', JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('✅ Ask tool working correctly!');
    } else {
      console.log('❌ Ask tool failed:', result.error);
    }

  } catch (error) {
    console.log('❌ Test failed:', error.message);
  }
}

testAskTool();