// server-enhanced.js (updated main entry point)
// REFACTOR: Update main server to use enhanced dual endpoint system

import { EnhancedMCPServer } from './src/enhanced-mcp-server.js';

async function main() {
  try {
    const server = new EnhancedMCPServer();
    await server.start();
  } catch (error) {
    console.error('Failed to start Enhanced DeepSeek MCP Bridge:', error);
    process.exit(1);
  }
}

main();