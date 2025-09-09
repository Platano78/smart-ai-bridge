#!/bin/bash

# DeepSeek MCP Bridge Safe Startup Script
# Prevents multiple instance conflicts and ensures clean startup

set -e

echo "🚀 DeepSeek MCP Bridge Safe Startup"
echo "=================================="

# Change to script directory
cd "$(dirname "$0")"

# Run startup safety check
echo "🔍 Running startup safety validation..."
node startup-safety.js

if [ $? -ne 0 ]; then
  echo ""
  echo "❌ Startup validation failed!"
  echo "💡 Try: node startup-safety.js --force (to auto-resolve conflicts)"
  echo "💡 Or:  pkill -f 'node.*server.js' (manual cleanup)"
  exit 1
fi

echo ""
echo "✅ Safety validation passed - starting server..."

# Start the server
echo "🎯 Starting DeepSeek MCP Bridge v6.1.1..."
node server.js