#!/usr/bin/env node
/**
 * Test script for council tool
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function testCouncil() {
  console.log('Connecting to MKG server...');

  const transport = new StdioClientTransport({
    command: 'node',
    args: ['server-mecha-king-ghidorah-complete.js'],
    env: { ...process.env, ENABLE_DASHBOARD: 'false' }
  });

  const client = new Client({ name: 'test-client', version: '1.0.0' });

  await client.connect(transport);
  console.log('Connected!');

  // List tools to verify council is available
  const tools = await client.listTools();
  const councilTool = tools.tools.find(t => t.name === 'council');
  if (!councilTool) {
    console.error('Council tool NOT found!');
    console.log('Available tools:', tools.tools.map(t => t.name).join(', '));
    process.exit(1);
  }
  console.log('✅ Council tool found!');
  console.log('Tool count:', tools.tools.length);

  // Test council call with low confidence (2 backends - fast test)
  console.log('\nCalling council tool with coding topic...');
  const result = await client.callTool({
    name: 'council',
    arguments: {
      prompt: 'What is the best way to implement rate limiting in a Node.js API? Give a brief 2-sentence answer.',
      topic: 'coding',
      confidence_needed: 'low'
    }
  });

  console.log('\n=== COUNCIL RESULT ===');
  const content = result.content[0].text;

  try {
    const parsed = JSON.parse(content);
    console.log('Success:', parsed.success);
    console.log('Topic:', parsed.topic);
    console.log('Backends queried:', parsed.backends_queried || 'N/A');

    if (parsed.responses) {
      console.log('\nResponses from backends:');
      Object.entries(parsed.responses).forEach(([backend, response]) => {
        const preview = typeof response === 'string'
          ? response.substring(0, 200)
          : JSON.stringify(response).substring(0, 200);
        console.log(`\n[${backend}]: ${preview}...`);
      });
    }

    if (parsed.error) {
      console.log('Error:', parsed.error);
    }
  } catch (e) {
    console.log('Raw response:', content.substring(0, 500));
  }

  await client.close();
  console.log('\n✅ Test completed successfully!');
  process.exit(0);
}

testCouncil().catch(err => {
  console.error('Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
