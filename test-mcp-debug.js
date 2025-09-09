#!/usr/bin/env node

/**
 * Debug MCP Communication
 * Simple test to see what's happening with MCP requests
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function debugMCPCommunication() {
  console.log('🐛 Starting MCP Communication Debug...');
  
  const serverPath = path.join(__dirname, 'server.js');
  const serverProcess = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  // Monitor all output
  serverProcess.stdout.on('data', (data) => {
    console.log('📤 STDOUT:', data.toString());
  });
  
  serverProcess.stderr.on('data', (data) => {
    console.log('📤 STDERR:', data.toString());
  });
  
  serverProcess.on('exit', (code) => {
    console.log(`🔚 Server exited with code: ${code}`);
  });
  
  // Wait a moment for server to start
  setTimeout(() => {
    console.log('📨 Sending initialize request...');
    
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'debug-client', version: '1.0.0' }
      }
    };
    
    serverProcess.stdin.write(JSON.stringify(initRequest) + '\n');
    
    // After 3 seconds, send tools/list
    setTimeout(() => {
      console.log('📨 Sending tools/list request...');
      
      const toolsRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      };
      
      serverProcess.stdin.write(JSON.stringify(toolsRequest) + '\n');
    }, 3000);
    
    // Kill after 10 seconds
    setTimeout(() => {
      console.log('🔚 Terminating server...');
      serverProcess.kill('SIGTERM');
    }, 10000);
    
  }, 2000);
}

debugMCPCommunication();