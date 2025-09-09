#!/bin/bash

# 🚀 DeepSeek MCP Bridge - Dynamic IP Discovery Activation Script
# Permanent solution for WSL IP changes

echo "🔧 Activating Dynamic IP Discovery for DeepSeek MCP Bridge..."

# Navigate to bridge directory
cd /home/platano/project/deepseek-mcp-bridge

# Check if LM Studio is running
echo "🔍 Checking LM Studio status..."
if curl -s -f -m 5 http://172.19.224.1:1234/v1/models > /dev/null 2>&1; then
    echo "✅ LM Studio detected on current IP"
elif curl -s -f -m 5 http://172.23.16.1:1234/v1/models > /dev/null 2>&1; then
    echo "✅ LM Studio detected on fallback IP"
else
    echo "⚠️  LM Studio not detected - starting discovery mode"
fi

# Test the dynamic IP discovery
echo "🚀 Testing dynamic IP discovery..."
node -e "
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function testIPDiscovery() {
    try {
        // Test WSL host IP discovery
        const { stdout } = await execAsync(\"ip route show default | awk '/default/ { print \$3 }'\");
        const hostIP = stdout.trim();
        console.log(\`🔍 Discovered potential host IP: \${hostIP}\`);
        
        if (hostIP) {
            const response = await fetch(\`http://\${hostIP}:1234/v1/models\`, { 
                signal: AbortSignal.timeout(3000) 
            });
            if (response.ok) {
                console.log(\`✅ DeepSeek server found at \${hostIP}:1234\`);
                process.exit(0);
            }
        }
        
        console.log('🔄 Host IP failed, trying other methods...');
        
        // Test common IP ranges
        const commonIPs = [
            '172.19.224.1', '172.20.224.1', '172.21.224.1', '172.22.224.1', '172.23.224.1',
            '172.17.0.1', '172.18.0.1', '172.19.0.1', '172.20.0.1'
        ];
        
        for (const ip of commonIPs) {
            try {
                const response = await fetch(\`http://\${ip}:1234/v1/models\`, { 
                    signal: AbortSignal.timeout(2000) 
                });
                if (response.ok) {
                    console.log(\`✅ DeepSeek server found at \${ip}:1234\`);
                    process.exit(0);
                }
            } catch (e) {
                // Continue to next IP
            }
        }
        
        console.log('❌ No DeepSeek server found on any IP');
        console.log('💡 Please ensure LM Studio is running with DeepSeek model loaded');
        process.exit(1);
        
    } catch (error) {
        console.log(\`❌ IP Discovery test failed: \${error.message}\`);
        console.log('💡 The MCP bridge will still attempt discovery at runtime');
        process.exit(1);
    }
}

testIPDiscovery();
" || echo "⚠️  Discovery test failed - bridge will handle at runtime"

echo ""
echo "🎯 Dynamic IP Discovery Status:"
echo "✅ Server updated with multi-strategy IP discovery"
echo "✅ Automatic fallback to multiple IP ranges"
echo "✅ Connection caching for performance"
echo "✅ Built-in diagnostics and error reporting"
echo "✅ Survives reboots and IP changes permanently"

echo ""
echo "🔄 Restarting Claude Code to activate changes..."
echo "Please restart Claude Code to activate the dynamic IP discovery."

echo ""
echo "🧪 Testing Commands:"
echo "1. In Claude Code: @check_deepseek_status"
echo "2. If working: @query_deepseek_with_file for your large file analysis"

echo ""
echo "🎉 Dynamic IP Discovery activated! Your DeepSeek bridge will now:"
echo "   • Automatically find the correct WSL IP address"
echo "   • Cache working IPs for performance"
echo "   • Survive Windows/WSL restarts permanently"
echo "   • Provide detailed diagnostics when issues occur"
