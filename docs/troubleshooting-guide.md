# Troubleshooting Guide - DeepSeek MCP Bridge v7.0.0

## 🚨 Quick Diagnostic Commands

### System Status Check
```bash
# Check all endpoints and system status
@check_deepseek_status()

# Test specific endpoint
@route_to_endpoint(endpoint="local", prompt="Hello, are you working?")
@route_to_endpoint(endpoint="nvidia_qwen", prompt="Hello, are you working?")  
@route_to_endpoint(endpoint="nvidia_deepseek", prompt="Hello, are you working?")
```

### File System Testing
```bash
# Test file access (when implemented)
@diagnose_file_access(filePath="/path/to/test/file.js")

# Test file analysis with known good file
@analyze_files(files="package.json", analysis_type="basic")
```

## 🔧 Common Issues & Solutions

### 1. Triple Endpoint Connection Issues

#### **Local DeepSeek Not Responding**

**Symptoms:**
- "Local DeepSeek endpoint failed" errors
- Automatic fallback to NVIDIA endpoints
- Long response times for local queries

**Diagnostics:**
```bash
# Test local endpoint directly
curl http://172.23.16.1:1234/v1/models

# Check if LM Studio is running
ps aux | grep "LM Studio" # Linux/macOS
tasklist | findstr "LM Studio" # Windows
```

**Solutions:**
1. **Start LM Studio**:
   - Launch LM Studio application
   - Load DeepSeek Coder v2 Lite model
   - Start server on port 1234

2. **Fix Server Binding**:
   ```bash
   # In LM Studio settings:
   # Server URL: 0.0.0.0:1234 (NOT 127.0.0.1:1234)
   # Allow external connections: YES
   ```

3. **Network Configuration**:
   ```bash
   # Windows WSL2: Check IP address
   cat /etc/resolv.conf
   # Use the nameserver IP for DEEPSEEK_ENDPOINT
   
   # Linux: Use localhost
   export DEEPSEEK_ENDPOINT="http://127.0.0.1:1234/v1"
   
   # macOS: Use localhost  
   export DEEPSEEK_ENDPOINT="http://localhost:1234/v1"
   ```

4. **Firewall Issues (Windows)**:
   ```bash
   # Add firewall rule for LM Studio
   netsh advfirewall firewall add rule name="LM Studio" dir=in action=allow protocol=TCP localport=1234
   ```

#### **NVIDIA Endpoints Not Accessible**

**Symptoms:**
- "NVIDIA endpoint failed" errors
- API authentication failures
- Rate limit exceeded messages

**Diagnostics:**
```bash
# Test NVIDIA API directly
curl -H "Authorization: Bearer $NVIDIA_API_KEY" \
     https://integrate.api.nvidia.com/v1/models

# Check API key format
echo $NVIDIA_API_KEY | wc -c  # Should be ~80+ characters
```

**Solutions:**
1. **API Key Issues**:
   ```bash
   # Get NVIDIA API key from: https://build.nvidia.com/
   export NVIDIA_API_KEY="nvapi-your-actual-key-here"
   
   # Verify key is set correctly
   env | grep NVIDIA_API_KEY
   ```

2. **Model Access Issues**:
   ```bash
   # Check available models
   curl -H "Authorization: Bearer $NVIDIA_API_KEY" \
        https://integrate.api.nvidia.com/v1/models | jq .
   ```

3. **Rate Limiting**:
   ```bash
   # NVIDIA free tier has limits:
   # - 1000 requests per day
   # - 10 requests per minute
   # Solution: Use local DeepSeek for high-volume tasks
   ```

### 2. File Access & Processing Issues

#### **Cross-Platform Path Problems**

**Symptoms:**
- "File not found" errors with valid paths
- Path normalization failures  
- Permission denied errors

**Diagnostics:**
```javascript
// Test path resolution
@analyze_files(files="./package.json", analysis_type="basic")

// Check current working directory
console.log(process.cwd());
```

**Solutions:**
1. **Windows Path Issues**:
   ```javascript
   // ❌ Don't use backslashes
   files="C:\Users\project\file.js"
   
   // ✅ Use forward slashes  
   files="C:/Users/project/file.js"
   
   // ✅ Or use WSL paths
   files="/mnt/c/Users/project/file.js"
   ```

2. **Relative vs Absolute Paths**:
   ```bash
   # ✅ Use absolute paths when possible
   @analyze_files(files="/full/path/to/file.js")
   
   # ✅ Or relative from project root
   @analyze_files(files="./src/component.js")
   ```

3. **Permission Issues**:
   ```bash
   # Check file permissions
   ls -la /path/to/file.js
   
   # Fix permissions if needed
   chmod 644 /path/to/file.js
   ```

#### **Large File Processing Issues**

**Symptoms:**
- Memory exceeded errors
- File processing timeouts
- Incomplete file content

**Solutions:**
1. **Use Chunked Processing**:
   ```javascript
   // For files >100KB, use youtu_agent
   @youtu_agent_analyze_files(
     files="large_file.js",
     chunk_strategy="semantic"
   )
   ```

2. **Memory Management**:
   ```bash
   # Increase Node.js memory limit
   node --max-old-space-size=8192 server-enhanced-triple.js
   ```

3. **File Size Limits**:
   ```javascript
   // Current limits:
   // - Individual files: 50MB max
   // - Batch processing: 100MB total max
   // - Streaming chunks: 64KB per chunk
   ```

### 3. MCP Server & Tool Issues

#### **Tools Not Available in Claude Code**

**Symptoms:**
- Tools not showing in Claude Code
- "Unknown tool" errors
- MCP server not responding

**Diagnostics:**
```bash
# Check Node.js version
node --version  # Should be >= 18

# Test server startup
npm test

# Check server logs
tail -f ~/.claude-code/logs/server.log
```

**Solutions:**
1. **Configuration Issues**:
   ```json
   // Check Claude Code config file
   // Location: ~/.config/claude-code/config.json
   {
     "mcpServers": {
       "deepseek-mcp-bridge": {
         "command": "node",
         "args": ["server-enhanced-triple.js"],  // ← Correct filename
         "cwd": "/home/platano/project/deepseek-mcp-bridge",
         "env": {
           "DEEPSEEK_ENDPOINT": "http://172.23.16.1:1234/v1",
           "NVIDIA_API_KEY": "your-key-here"
         }
       }
     }
   }
   ```

2. **Server Startup Issues**:
   ```bash
   # Install dependencies
   npm install
   
   # Check for missing modules
   npm ls
   
   # Test server directly
   node server-enhanced-triple.js
   ```

3. **Full Restart Required**:
   ```bash
   # Claude Code must be completely restarted after config changes
   # 1. Close Claude Code completely
   # 2. Wait 5 seconds
   # 3. Restart Claude Code
   # 4. Test: @check_deepseek_status()
   ```

#### **JSON Compliance Issues (Claude Desktop)**

**Symptoms:**
- Responses appear truncated
- Special characters causing errors
- Tool responses not displaying properly

**Solutions:**
1. **Built-in JSON Sanitization**:
   ```javascript
   // The system automatically sanitizes responses
   // No user action needed - handled by json-sanitizer.js
   ```

2. **Manual Testing**:
   ```bash
   # Test JSON compliance
   node test-claude-desktop-json-compliance.js
   ```

### 4. Routing & Performance Issues

#### **Incorrect Endpoint Selection**

**Symptoms:**
- Coding tasks going to analysis endpoints
- Large files not routing to local DeepSeek
- Poor response quality for specialized tasks

**Diagnostics:**
```javascript
// Check routing decision
@query_deepseek(
  prompt="Your task here",
  task_type="coding",  // Be explicit about task type
  endpoint_preference="auto"
)

// Compare endpoints for same task
@compare_endpoints(
  prompt="Your task here",
  endpoints=["local", "nvidia_qwen", "nvidia_deepseek"]
)
```

**Solutions:**
1. **Use Explicit Task Types**:
   ```javascript
   // ✅ Be specific about task type
   task_type="coding"        // → Routes to Qwen 3 Coder
   task_type="analysis"      // → Routes to DeepSeek V3
   task_type="unlimited"     // → Routes to Local DeepSeek
   ```

2. **Override Routing When Needed**:
   ```javascript
   // Force specific endpoint
   @route_to_endpoint(
     endpoint="nvidia_qwen",  // Force Qwen 3 Coder
     prompt="Your coding task"
   )
   ```

3. **Optimize Content for Better Routing**:
   ```javascript
   // Include routing hints in prompt
   prompt="Debug this JavaScript function: [code here]"  // Clear coding context
   prompt="Analyze game balance statistics: [data here]" // Clear analysis context
   ```

#### **Slow Response Times**

**Symptoms:**
- Long delays before responses
- Timeouts on complex queries
- Poor performance with file operations

**Solutions:**
1. **Check Endpoint Health**:
   ```javascript
   @check_deepseek_status()  // View response times and status
   ```

2. **Optimize File Operations**:
   ```javascript
   // Use batch processing for multiple files
   @analyze_files(
     files=["file1.js", "file2.js", "file3.js"],  // Batch
     analysis_type="basic"
   )
   
   // Instead of individual calls
   ```

3. **Use Appropriate Endpoints**:
   ```javascript
   // Large context → Local DeepSeek (unlimited tokens)
   // Complex coding → Qwen 3 Coder (specialized)
   // Analysis/math → DeepSeek V3 (reasoning)
   ```

### 5. Development & Testing Issues

#### **TDD Mode Issues**

**Symptoms:**
- Tests failing in development
- Mock responses not working
- Development mode not activating

**Solutions:**
1. **Enable TDD Mode**:
   ```bash
   export TDD_MODE="true"
   export NODE_ENV="test"
   
   # Run tests
   npm test
   ```

2. **Test Individual Components**:
   ```bash
   # Test specific functionality
   node tests/triple-endpoint/triple-endpoint.test.js
   ```

#### **Backup & Rollback Issues**

**Symptoms:**
- Need to revert to previous version
- Configuration problems after upgrade
- System instability

**Solutions:**
1. **Use Rollback Script**:
   ```bash
   # Automatic rollback to previous version
   ./rollback-triple-endpoint.sh
   ```

2. **Manual Backup Restoration**:
   ```bash
   # Restore from timestamp backups
   cp server.js.backup.20250910_174550 server.js
   cp src/triple-bridge.js.backup.20250910_174530 src/triple-bridge.js
   ```

## 🔍 Advanced Diagnostics

### System Health Monitoring

```bash
# Check system resources
free -h        # Memory usage (Linux)
df -h         # Disk space
top           # CPU usage

# Check Node.js process
ps aux | grep node
netstat -tlnp | grep :1234  # Check LM Studio port
```

### Logging & Debug Information

```bash
# Enable debug logging
export DEBUG="deepseek-mcp:*"
node server-enhanced-triple.js

# Check Claude Code logs
tail -f ~/.claude-code/logs/mcp-server.log

# Monitor file access
tail -f /var/log/syslog | grep "file access"  # Linux
```

### Network Diagnostics

```bash
# Test local network connectivity
ping 172.23.16.1  # WSL2 host IP
ping 127.0.0.1    # Localhost

# Test NVIDIA API connectivity
curl -I https://integrate.api.nvidia.com/v1/models

# Check DNS resolution
nslookup integrate.api.nvidia.com
```

## 🚑 Emergency Recovery

### Complete System Reset

```bash
# 1. Stop all servers
pkill -f "node.*server"

# 2. Reset configuration
cp config.json.backup config.json

# 3. Reinstall dependencies
rm -rf node_modules
npm install

# 4. Test basic functionality
npm test

# 5. Restart Claude Code
# (Manual restart required)
```

### Factory Reset

```bash
# 1. Backup current work
cp -r . ../deepseek-mcp-bridge-backup-$(date +%Y%m%d)

# 2. Reset to known good state
git reset --hard HEAD~1  # Go back one commit
git clean -fd            # Remove untracked files

# 3. Reinstall
npm install
npm test

# 4. Reconfigure
export NVIDIA_API_KEY="your-key"
export DEEPSEEK_ENDPOINT="http://172.23.16.1:1234/v1"
```

## 📞 Support & Resources

### Self-Diagnostic Checklist

1. **Environment Check**:
   - [ ] Node.js >= 18 installed
   - [ ] Dependencies installed (`npm install`)
   - [ ] Environment variables set correctly
   - [ ] LM Studio running (for local endpoint)

2. **Network Check**:
   - [ ] Local endpoint accessible
   - [ ] NVIDIA API key valid  
   - [ ] Internet connectivity working
   - [ ] Firewall not blocking connections

3. **Configuration Check**:
   - [ ] Claude Code config file correct
   - [ ] File paths absolute and valid
   - [ ] Server file names match config
   - [ ] Environment variables properly exported

4. **Functionality Check**:
   - [ ] `@check_deepseek_status()` works
   - [ ] Basic file analysis works
   - [ ] All three endpoints accessible
   - [ ] Routing working correctly

### Getting Help

If issues persist after following this guide:

1. **Collect System Information**:
   ```bash
   # Run diagnostics
   @check_deepseek_status()
   npm test > test-results.log 2>&1
   node --version > system-info.log
   env | grep -E "(NVIDIA|DEEPSEEK|NODE)" >> system-info.log
   ```

2. **Document Issue**:
   - Exact error messages
   - Steps to reproduce
   - System information
   - Configuration files (sanitized)

3. **Test with Minimal Configuration**:
   ```json
   // Try simplest possible config first
   {
     "mcpServers": {
       "deepseek-bridge": {
         "command": "node",
         "args": ["server.js"],  // Fallback server
         "cwd": "/home/platano/project/deepseek-mcp-bridge"
       }
     }
   }
   ```

---

*This troubleshooting guide covers the most common issues and solutions. For complex system issues, start with the Quick Diagnostic Commands and work through the relevant sections systematically.*