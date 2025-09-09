#!/bin/bash

echo "🚀 Installing and Testing Deepseek MCP Bridge"
echo "=============================================="

# Navigate to the bridge directory
cd /home/platano/project/deepseek-mcp-bridge

echo ""
echo "📦 Installing dependencies..."
npm install

echo ""
echo "🧪 Testing bridge connection..."
npm test

echo ""
echo "🔧 Testing MCP server protocol..."
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}' | node server.js

echo ""
echo "✅ Deepseek MCP Bridge installation complete!"
echo ""
echo "🎯 Next Steps:"
echo "1. Restart Claude Code to load the new MCP server"
echo "2. Test with: @check_deepseek_status()"
echo "3. Try unlimited tokens: @query_deepseek(prompt=\"Hello, test unlimited tokens\")"
echo "4. When approaching limits: @handoff_to_deepseek(context=\"current work\", goal=\"continue development\")"
echo ""
echo "🔥 Bridge Status: Ready for unlimited token conversations!"
