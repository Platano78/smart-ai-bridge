#!/bin/bash
# rollback-triple-endpoint.sh
# Rollback script for triple endpoint system

echo "🛡️ TRIPLE ENDPOINT ROLLBACK SYSTEM"
echo "=================================="

# Check if running in correct directory
if [ ! -f "package.json" ] || [ ! -d "src" ]; then
    echo "❌ Error: Please run from project root directory"
    exit 1
fi

echo "📁 Available backups:"
ls -la server-enhanced.js.backup.* 2>/dev/null | head -5
ls -la src/enhanced-mcp-server.js.backup.* 2>/dev/null | head -5

echo ""
read -p "🔄 Do you want to rollback to dual endpoint system? (y/N): " confirm

if [[ $confirm == [yY] || $confirm == [yY][eE][sS] ]]; then
    # Find latest backup
    LATEST_SERVER_BACKUP=$(ls -t server-enhanced.js.backup.* 2>/dev/null | head -1)
    LATEST_MCP_BACKUP=$(ls -t src/enhanced-mcp-server.js.backup.* 2>/dev/null | head -1)
    
    if [ -n "$LATEST_SERVER_BACKUP" ] && [ -n "$LATEST_MCP_BACKUP" ]; then
        echo "🔄 Restoring from backups..."
        cp "$LATEST_SERVER_BACKUP" server-enhanced.js
        cp "$LATEST_MCP_BACKUP" src/enhanced-mcp-server.js
        
        # Update Claude Code config back to dual endpoint
        CONFIG_FILE="$HOME/.config/claude-code/config.json"
        if [ -f "${CONFIG_FILE}.backup.triple.$(date +%Y%m%d)*" ]; then
            LATEST_CONFIG_BACKUP=$(ls -t "${CONFIG_FILE}.backup.triple."* 2>/dev/null | head -1)
            if [ -n "$LATEST_CONFIG_BACKUP" ]; then
                cp "$LATEST_CONFIG_BACKUP" "$CONFIG_FILE"
                echo "✅ Claude Code configuration restored"
            fi
        fi
        
        echo "✅ Rollback complete!"
        echo "📋 Restored files:"
        echo "   - server-enhanced.js (from $LATEST_SERVER_BACKUP)"
        echo "   - src/enhanced-mcp-server.js (from $LATEST_MCP_BACKUP)"
        echo ""
        echo "🔄 **RESTART CLAUDE CODE** to apply changes"
    else
        echo "❌ No backup files found. Cannot rollback."
        exit 1
    fi
else
    echo "❌ Rollback cancelled."
fi