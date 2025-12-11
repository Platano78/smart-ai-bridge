#!/usr/bin/env node
/**
 * MCP 2025-11-25 Compliance Test Script
 * Tests mecha-king-ghidorah-global server for protocol compliance
 */

import { spawn } from 'child_process';
import readline from 'readline';

const TESTS = {
  passed: 0,
  failed: 0,
  results: []
};

function log(msg) {
  console.log(`[TEST] ${msg}`);
}

function pass(testName) {
  TESTS.passed++;
  TESTS.results.push({ test: testName, status: 'PASS' });
  console.log(`  ✅ PASS: ${testName}`);
}

function fail(testName, reason) {
  TESTS.failed++;
  TESTS.results.push({ test: testName, status: 'FAIL', reason });
  console.log(`  ❌ FAIL: ${testName} - ${reason}`);
}

async function runTests() {
  log('Starting MCP 2025-11-25 Compliance Tests for mecha-king-ghidorah-global');
  log('=' .repeat(70));
  
  // Start the MCP server
  const server = spawn('node', ['server-mecha-king-ghidorah-complete.js'], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  const rl = readline.createInterface({ input: server.stdout });
  let responseBuffer = '';
  let requestId = 1;
  
  const sendRequest = (method, params = {}) => {
    const id = requestId++;
    const request = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params
    });
    server.stdin.write(request + '\n');
    return id;
  };
  
  const waitForResponse = (expectedId, timeout = 5000) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout')), timeout);
      
      const handler = (line) => {
        try {
          const response = JSON.parse(line);
          if (response.id === expectedId) {
            clearTimeout(timer);
            rl.removeListener('line', handler);
            resolve(response);
          }
        } catch (e) {
          // Not JSON, skip
        }
      };
      
      rl.on('line', handler);
    });
  };
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  try {
    // Test 1: Initialize handshake
    log('\nTest 1: Initialize Handshake');
    const initId = sendRequest('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    });
    
    const initResponse = await waitForResponse(initId);
    
    if (initResponse.result) {
      pass('Initialize returns result');
      
      // Check protocol version
      if (initResponse.result.protocolVersion === '2025-11-25') {
        pass('Protocol version is 2025-11-25');
      } else {
        fail('Protocol version check', `Got ${initResponse.result.protocolVersion}`);
      }
      
      // Check capabilities
      if (initResponse.result.capabilities) {
        pass('Capabilities object present');
        
        if (initResponse.result.capabilities.tools) {
          pass('Tools capability declared');
        } else {
          fail('Tools capability', 'Missing tools capability');
        }
        
        if (initResponse.result.capabilities.resources) {
          pass('Resources capability declared');
        } else {
          fail('Resources capability', 'Missing resources capability');
        }
        
        if (initResponse.result.capabilities.prompts) {
          pass('Prompts capability declared');
        } else {
          fail('Prompts capability', 'Missing prompts capability');
        }
      } else {
        fail('Capabilities object', 'Missing capabilities');
      }
    } else {
      fail('Initialize handshake', initResponse.error?.message || 'No result');
    }
    
    // Test 2: List Tools
    log('\nTest 2: Tools Discovery');
    const toolsId = sendRequest('tools/list', {});
    const toolsResponse = await waitForResponse(toolsId);
    
    if (toolsResponse.result?.tools) {
      pass(`Tools list returned (${toolsResponse.result.tools.length} tools)`);
      
      // Check for expected tools
      const toolNames = toolsResponse.result.tools.map(t => t.name);
      const expectedTools = ['review', 'read', 'health', 'edit_file', 'ask'];
      
      for (const expected of expectedTools) {
        if (toolNames.includes(expected)) {
          pass(`Tool '${expected}' present`);
        } else {
          fail(`Tool '${expected}'`, 'Not found in tools list');
        }
      }
    } else {
      fail('Tools list', toolsResponse.error?.message || 'No tools returned');
    }
    
    // Test 3: List Resources
    log('\nTest 3: Resources Discovery');
    const resourcesId = sendRequest('resources/list', {});
    const resourcesResponse = await waitForResponse(resourcesId);
    
    if (resourcesResponse.result?.resources) {
      pass(`Resources list returned (${resourcesResponse.result.resources.length} resources)`);
      
      const resourceUris = resourcesResponse.result.resources.map(r => r.uri);
      const expectedResources = ['mkg://health', 'mkg://analytics'];
      
      for (const expected of expectedResources) {
        if (resourceUris.includes(expected)) {
          pass(`Resource '${expected}' present`);
        } else {
          fail(`Resource '${expected}'`, 'Not found in resources list');
        }
      }
    } else {
      fail('Resources list', resourcesResponse.error?.message || 'No resources returned');
    }
    
    // Test 4: List Prompts
    log('\nTest 4: Prompts Discovery');
    const promptsId = sendRequest('prompts/list', {});
    const promptsResponse = await waitForResponse(promptsId);
    
    if (promptsResponse.result?.prompts) {
      pass(`Prompts list returned (${promptsResponse.result.prompts.length} prompts)`);
      
      const promptNames = promptsResponse.result.prompts.map(p => p.name);
      const expectedPrompts = ['code-review', 'file-operations'];
      
      for (const expected of expectedPrompts) {
        if (promptNames.includes(expected)) {
          pass(`Prompt '${expected}' present`);
        } else {
          fail(`Prompt '${expected}'`, 'Not found in prompts list');
        }
      }
    } else {
      fail('Prompts list', promptsResponse.error?.message || 'No prompts returned');
    }
    
  } catch (error) {
    fail('Test execution', error.message);
  } finally {
    server.kill();
  }
  
  // Summary
  log('\n' + '=' .repeat(70));
  log('TEST SUMMARY');
  log(`  Passed: ${TESTS.passed}`);
  log(`  Failed: ${TESTS.failed}`);
  log(`  Total:  ${TESTS.passed + TESTS.failed}`);
  log('=' .repeat(70));
  
  process.exit(TESTS.failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
