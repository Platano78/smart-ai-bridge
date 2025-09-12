#!/usr/bin/env node
// server-enhanced-triple.js
// Production entry point for Triple Endpoint DeepSeek MCP Bridge v7.0.0

import { EnhancedTripleMCPServer } from './src/enhanced-triple-mcp-server.js';

async function main() {
  try {
    const server = new EnhancedTripleMCPServer();
    await server.start();
  } catch (error) {
    console.error('Failed to start Triple Endpoint DeepSeek MCP Bridge:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  process.exit(0);
});

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});