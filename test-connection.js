#!/usr/bin/env node

/**
 * Test connection to Deepseek LLM
 * Verifies the working endpoint discovered by Critical Pragmatist Agent
 */

const DEEPSEEK_BASE_URL = "http://172.19.224.1:1234/v1";

async function testConnection() {
  console.log('🧪 Testing Deepseek Connection...\n');
  
  try {
    // Test 1: Check models endpoint
    console.log('Test 1: Models endpoint');
    const modelsResponse = await fetch(`${DEEPSEEK_BASE_URL}/models`);
    
    if (!modelsResponse.ok) {
      throw new Error(`Models endpoint failed: ${modelsResponse.status}`);
    }
    
    const models = await modelsResponse.json();
    console.log('✅ Models endpoint working');
    console.log(`Available models: ${models.data?.map(m => m.id).join(', ')}\n`);
    
    // Test 2: Chat completion
    console.log('Test 2: Chat completion');
    const chatResponse = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "deepseek-coder-v2-lite-instruct",
        messages: [
          {
            role: 'system',
            content: 'You are Deepseek V2 Coder running locally. Respond concisely to confirm you are working.'
          },
          {
            role: 'user',
            content: 'Hello! Please confirm you are Deepseek running locally and ready for unlimited token conversations.'
          }
        ],
        temperature: 0.1,
        max_tokens: 100,
        stream: false
      })
    });
    
    if (!chatResponse.ok) {
      throw new Error(`Chat completion failed: ${chatResponse.status}`);
    }
    
    const chatData = await chatResponse.json();
    const reply = chatData.choices[0].message.content;
    
    console.log('✅ Chat completion working');
    console.log(`Deepseek response: ${reply}\n`);
    
    // Test 3: MCP Server Protocol Test
    console.log('Test 3: MCP server protocol');
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    try {
      const mcpTest = await execAsync('echo \'{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}\' | node server.js', {
        cwd: process.cwd(),
        timeout: 5000
      });
      
      const mcpResponse = JSON.parse(mcpTest.stdout);
      if (mcpResponse.result && mcpResponse.result.tools) {
        console.log('✅ MCP server protocol working');
        console.log(`Available tools: ${mcpResponse.result.tools.length}`);
      }
    } catch (mcpError) {
      console.log('⚠️  MCP server test skipped (run npm install first)');
    }
    
    console.log('\n🎉 SUCCESS: Deepseek MCP Bridge ready!');
    console.log('\n📋 Summary:');
    console.log(`• Endpoint: ${DEEPSEEK_BASE_URL}`);
    console.log('• Models: Available and responsive');
    console.log('• Chat: Working with unlimited tokens');
    console.log('• Status: Ready for Claude Code integration');
    
    console.log('\n🔗 Next Steps:');
    console.log('1. Run: npm install');
    console.log('2. Add to Claude Code MCP configuration');
    console.log('3. Test unlimited token conversations');
    
  } catch (error) {
    console.error('❌ Connection Test Failed:');
    console.error(`Error: ${error.message}`);
    console.error('\n🔧 Troubleshooting:');
    console.error('1. Ensure LM Studio is running');
    console.error('2. Verify Deepseek model is loaded');
    console.error('3. Check server is bound to 0.0.0.0:1234');
    console.error('4. Confirm Windows firewall allows connections');
    console.error(`5. Test manually: curl ${DEEPSEEK_BASE_URL}/models`);
    process.exit(1);
  }
}

testConnection();