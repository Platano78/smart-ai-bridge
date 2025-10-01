# Troubleshooting Guide

## Overview

This comprehensive troubleshooting guide covers common issues with Smart AI Bridge v1.0.0, focusing on the Smart Edit Prevention Strategy features, fuzzy matching capabilities, and performance optimization.

---

## 🔧 Smart Edit Prevention Issues

### "Text not found" Errors

#### Problem: Exact text not found despite being visible in file

**Symptoms:**
```
Error: Text not found in file: "function processUserData(userData) {"
```

**Diagnosis Steps:**

1. **Check for hidden characters:**
```javascript
// Use read tool with verification first
@read({
  file_paths: ["/path/to/file.js"],
  verify_texts: ["function processUserData"],
  verification_mode: "comprehensive"
})
```

2. **Try fuzzy matching:**
```javascript
@edit_file({
  file_path: "/path/to/file.js",
  validation_mode: "lenient",
  fuzzy_threshold: 0.7,
  suggest_alternatives: true,
  edits: [...]
})
```

**Solutions:**

**A. Use Fuzzy Matching (Recommended)**
```javascript
@edit_file({
  file_path: "/path/to/file.js",
  validation_mode: "lenient",     // Enable fuzzy matching
  fuzzy_threshold: 0.8,           // Adjust sensitivity
  suggest_alternatives: true,      // Get helpful suggestions
  edits: [
    {
      find: "function processUserData",  // Simplified pattern
      replace: "function processUserData",
      description: "Match with fuzzy logic"
    }
  ]
})
```

**B. Check Encoding and Whitespace**
```javascript
// Copy exact text from file, including whitespace
find: "function processUserData(userData) {    " // Note trailing spaces
```

**C. Use Dry Run for Investigation**
```javascript
@edit_file({
  validation_mode: "dry_run",      // No changes, just validation
  fuzzy_threshold: 0.6,            // More permissive
  suggest_alternatives: true,
  max_suggestions: 10,             // Get more alternatives
  edits: [...]
})
```

**D. Break Down Complex Patterns**
```javascript
// Instead of complex multi-line finds:
edits: [
  { find: "function processUserData", replace: "function processUserData" },
  { find: "(userData) {", replace: "(userData, options = {}) {" }
]
```

### Fuzzy Matching Too Permissive

#### Problem: Fuzzy matching finds incorrect text

**Symptoms:**
```
Warning: Fuzzy match found with low similarity (0.65): "function processOrderData"
Expected: "function processUserData"
```

**Solutions:**

**A. Increase Fuzzy Threshold**
```javascript
@edit_file({
  validation_mode: "lenient",
  fuzzy_threshold: 0.9,           // More strict (was 0.8)
  edits: [...]
})
```

**B. Use More Specific Patterns**
```javascript
// Instead of:
find: "function process"

// Use:
find: "function processUserData(userData)"
```

**C. Add Context for Better Matching**
```javascript
{
  find: "function processUserData(userData) {\n  const processed =",
  replace: "function processUserData(userData, options = {}) {\n  const processed =",
  description: "Add options parameter with more context"
}
```

**D. Use Strict Mode for Critical Changes**
```javascript
@edit_file({
  validation_mode: "strict",      // Exact matching only
  edits: [...]
})
```

### Fuzzy Matching Too Strict

#### Problem: Fuzzy matching fails on minor differences

**Symptoms:**
```
Error: No matches found even with fuzzy matching
Attempted: "const userName = 'alice';"
File contains: "const userName = 'alice'"  // Missing semicolon
```

**Solutions:**

**A. Lower Fuzzy Threshold**
```javascript
@edit_file({
  validation_mode: "lenient",
  fuzzy_threshold: 0.7,           // More permissive (was 0.8)
  edits: [...]
})
```

**B. Use Comprehensive Mode**
```javascript
@edit_file({
  validation_mode: "comprehensive", // Maximum fuzzy matching
  fuzzy_threshold: 0.6,
  suggest_alternatives: true,
  max_suggestions: 10,
  edits: [...]
})
```

**C. Remove Punctuation from Patterns**
```javascript
// Instead of:
find: "const userName = 'alice';"

// Use:
find: "const userName = 'alice'"
```

**D. Use Core Text Only**
```javascript
// Focus on the essential part
find: "userName = 'alice'"
```

---

## 📖 Enhanced Read Tool Issues

### Verification Failures

#### Problem: Text verification fails unexpectedly

**Symptoms:**
```
Verification failed for: "function calculateScore"
File: "/src/user.js"
Mode: fuzzy
```

**Solutions:**

**A. Use Comprehensive Verification**
```javascript
@read({
  file_paths: ["/src/user.js"],
  verify_texts: ["function calculateScore"],
  verification_mode: "comprehensive",  // Maximum analysis
  fuzzy_threshold: 0.7
})
```

**B. Check Multiple Variations**
```javascript
@read({
  verify_texts: [
    "function calculateScore",      // Basic form
    "calculateScore",              // Just function name
    "function calculate_score",     // Alternative naming
    "calculateScore(userData)"      // With parameters
  ],
  verification_mode: "fuzzy"
})
```

**C. Use Basic Mode for Exact Checks**
```javascript
@read({
  verify_texts: ["function calculateScore(userData, weights) {"],
  verification_mode: "basic"        // Exact matching only
})
```

### Performance Issues with Large Text Arrays

#### Problem: Verification slow with many texts

**Symptoms:**
```
Warning: Verification taking >100ms for 20 text patterns
Performance target: <50ms
```

**Solutions:**

**A. Limit Text Array Size**
```javascript
@read({
  verify_texts: ["text1", "text2", "text3"], // Max 5-10 items
  verification_mode: "fuzzy"
})
```

**B. Use Basic Mode for Large Arrays**
```javascript
@read({
  verify_texts: ["text1", "text2", ...], // Many items
  verification_mode: "basic"              // Faster exact matching
})
```

**C. Batch Process in Chunks**
```javascript
// Process in smaller batches
const batch1 = await read({ verify_texts: texts.slice(0, 5) });
const batch2 = await read({ verify_texts: texts.slice(5, 10) });
```

**D. Optimize Fuzzy Threshold**
```javascript
@read({
  verification_mode: "fuzzy",
  fuzzy_threshold: 0.85,          // Higher threshold = faster
  verify_texts: [...]
})
```

---

## ⚡ Performance Optimization Issues

### Slow Response Times

#### Problem: Operations exceeding performance targets

**Target Performance:**
- Exact matching: <5ms
- Fuzzy matching: <50ms
- Comprehensive verification: <100ms

**Diagnosis:**

Check performance metrics in response:
```javascript
{
  "performance": {
    "total_time": 150,              // Target: <50ms
    "fuzzy_match_time": 140,        // Too slow
    "exact_match_time": 5
  }
}
```

**Solutions:**

**A. Optimize Fuzzy Threshold**
```javascript
// Increase threshold for faster matching
fuzzy_threshold: 0.85,           // Up from 0.7
max_suggestions: 1               // Reduce suggestion generation
```

**B. Disable Suggestions in Production**
```javascript
@edit_file({
  validation_mode: "lenient",
  suggest_alternatives: false,    // Faster without suggestions
  edits: [...]
})
```

**C. Use Strict Mode for Known Patterns**
```javascript
@edit_file({
  validation_mode: "strict",      // Fastest mode
  edits: [...]
})
```

**D. Optimize Edit Patterns**
```javascript
// Use shorter, more specific patterns
edits: [
  { find: "userName", replace: "userName" },  // Shorter
  { find: "= 'alice'", replace: "= 'bob'" }   // Specific
]
```

### Memory Usage Spikes

#### Problem: High memory consumption during fuzzy matching

**Symptoms:**
```
Warning: Memory usage spike detected: 15MB delta
Operation: fuzzy_matching_comprehensive
Target: <10MB
```

**Solutions:**

**A. Limit Suggestion Generation**
```javascript
@edit_file({
  max_suggestions: 1,             // Reduce memory footprint
  suggest_alternatives: false,     // Disable if not needed
  edits: [...]
})
```

**B. Process Files Sequentially**
```javascript
// Instead of batch processing
for (const file of files) {
  await edit_file({ file_path: file, ... });
}
```

**C. Use Basic Verification Mode**
```javascript
@read({
  verification_mode: "basic",     // Lower memory usage
  verify_texts: [...]
})
```

**D. Optimize Text Patterns**
```javascript
// Use shorter find patterns
find: "function calc",            // Instead of long multi-line patterns
replace: "function calculate"
```

---

## 🛠️ Configuration Issues

### SmartAliasResolver Problems

#### Problem: Tool not found or alias resolution failing

**Symptoms:**
```
Error: Tool not found: MKG_analyze
Available tools: review, read, health, write_files_atomic, edit_file, ...
```

**Solutions:**

**A. Check Tool Registration**
```javascript
// Use the health tool to verify all tools are registered
@health({ check_type: "comprehensive" })
```

**B. Use Core Tool Names**
```javascript
// Instead of alias:
@MKG_analyze(...)

// Use core tool:
@review(...)
```

**C. Restart MCP Server**
```bash
# Restart Claude Code completely to reload MCP servers
```

**D. Verify Server Configuration**
```json
{
  "mcpServers": {
    "mkg-server": {
      "command": "node",
      "args": ["smart-ai-bridge.js"],
      "cwd": "."
    }
  }
}
```

### Health Check Failures

#### Problem: Endpoint health checks failing or timing out

**Symptoms:**
```
Error: Health check timeout for local endpoint (>10s)
Error: NVIDIA API connectivity failed (>3s)
```

**Solutions:**

**A. Force IP Rediscovery**
```javascript
@health({
  check_type: "comprehensive",
  force_ip_rediscovery: true      // Invalidate cache and rediscover
})
```

**B. Check Local Endpoint Configuration**
```bash
# Verify local DeepSeek endpoint is running
curl http://172.23.16.1:1234/v1/models

# Check if bound to correct interface
netstat -an | grep 1234
```

**C. Verify NVIDIA API Access**
```bash
# Test NVIDIA API directly
curl -H "Authorization: Bearer $NVIDIA_API_KEY" \
     https://integrate.api.nvidia.com/v1/models
```

**D. Check Network Connectivity**
```bash
# Test WSL to Windows host connectivity
ping 172.23.16.1

# Test internet connectivity
ping 8.8.8.8
```

---

## 🔍 Debugging Strategies

### Systematic Troubleshooting Process

#### 1. **Use Dry Run Mode**
```javascript
// Always start with dry run for complex operations
@edit_file({
  validation_mode: "dry_run",
  suggest_alternatives: true,
  max_suggestions: 5,
  edits: [...]
})
```

#### 2. **Enable Comprehensive Logging**
```javascript
@health({ check_type: "comprehensive" })  // Get full system status
```

#### 3. **Test with Simple Patterns First**
```javascript
// Start with simple patterns
find: "function",
replace: "function"

// Then gradually increase complexity
find: "function processUserData",
replace: "function processUserData"
```

#### 4. **Use Verification Before Editing**
```javascript
// Step 1: Verify text exists
const verification = await read({
  file_paths: ["/path/to/file.js"],
  verify_texts: ["target text"],
  verification_mode: "comprehensive"
});

// Step 2: Edit if verification successful
if (verification.success) {
  await edit_file({...});
}
```

### Debug Mode Configuration

#### Enable Detailed Logging
```javascript
// Maximum debugging information
@edit_file({
  validation_mode: "comprehensive",
  fuzzy_threshold: 0.6,
  suggest_alternatives: true,
  max_suggestions: 10,
  edits: [...]
})
```

#### Performance Profiling
```javascript
// Monitor performance metrics
const start = Date.now();
const result = await edit_file({...});
const duration = Date.now() - start;

console.log(`Operation took ${duration}ms`);
console.log(`Performance data:`, result.performance);
```

---

## 📊 Common Error Patterns and Solutions

### Error Pattern Matrix

| Error Type | Symptoms | Solution | Prevention |
|------------|----------|----------|------------|
| **Exact Match Failure** | "Text not found" despite visible | Use `lenient` mode | Start with `dry_run` |
| **False Positive Fuzzy** | Wrong text matched | Increase `fuzzy_threshold` | Use more specific patterns |
| **Performance Timeout** | >50ms fuzzy matching | Reduce `max_suggestions` | Optimize pattern length |
| **Memory Spike** | >10MB delta | Disable suggestions | Process files sequentially |
| **Tool Not Found** | Alias resolution failed | Use core tool names | Check server registration |
| **Health Check Fail** | Endpoint timeout | Force IP rediscovery | Verify network connectivity |

### Quick Fix Commands

#### Reset and Rediscover
```javascript
// Full system health check with cache reset
@health({
  check_type: "comprehensive",
  force_ip_rediscovery: true
})
```

#### Safe Pattern Testing
```javascript
// Test pattern without making changes
@edit_file({
  validation_mode: "dry_run",
  fuzzy_threshold: 0.7,
  suggest_alternatives: true,
  max_suggestions: 5,
  edits: [{ find: "your-pattern", replace: "replacement" }]
})
```

#### Performance Optimization
```javascript
// Optimize for speed
@edit_file({
  validation_mode: "lenient",
  fuzzy_threshold: 0.85,
  suggest_alternatives: false,
  max_suggestions: 1,
  edits: [...]
})
```

#### Maximum Debugging
```javascript
// Get all available information
@edit_file({
  validation_mode: "comprehensive",
  fuzzy_threshold: 0.6,
  suggest_alternatives: true,
  max_suggestions: 10,
  edits: [...]
})
```

---

## 🎯 Best Practices for Troubleshooting

### 1. **Progressive Complexity**
Start simple and gradually increase complexity:

```javascript
// Step 1: Test basic pattern
find: "function"

// Step 2: Add function name
find: "function processUserData"

// Step 3: Add parameters
find: "function processUserData(userData)"

// Step 4: Add full signature
find: "function processUserData(userData) {"
```

### 2. **Use Appropriate Modes**
Match validation mode to use case:

```javascript
// Development/testing
validation_mode: "comprehensive"

// Production/known patterns
validation_mode: "lenient"

// Critical operations
validation_mode: "strict"
```

### 3. **Monitor Performance**
Track and optimize performance metrics:

```javascript
// Set reasonable thresholds
fuzzy_threshold: 0.8,     // Balance accuracy and performance
max_suggestions: 3,       // Limit for faster response
suggest_alternatives: true // Only when needed
```

### 4. **Implement Fallback Strategies**
```javascript
// Try strict first, then lenient
try {
  await edit_file({ validation_mode: "strict", ... });
} catch (error) {
  await edit_file({ validation_mode: "lenient", ... });
}
```

### 5. **Use Health Checks Proactively**
```javascript
// Regular health monitoring
const health = await health({ check_type: "system" });
if (!health.all_endpoints_healthy) {
  // Handle degraded performance
}
```

---

## 📞 Support Resources

### Log Analysis
- Check Claude Code logs: `~/.claude-code/logs/`
- Monitor MCP server output for error details
- Use browser developer tools for client-side issues

### Performance Monitoring
- Track response times with performance metrics
- Monitor memory usage patterns
- Analyze fuzzy matching effectiveness

### Community Support
- Review test suite examples in `/tests` directory
- Check existing issues and solutions in project documentation
- Reference the Smart Edit Prevention Guide for detailed usage patterns

### Escalation Process
1. **Try dry_run mode** to understand the issue
2. **Use comprehensive verification** to get detailed analysis
3. **Check health status** to rule out system issues
4. **Review performance metrics** to identify bottlenecks
5. **Implement fallback strategies** for resilient operation

This troubleshooting guide covers the most common issues and provides systematic approaches to resolution. For additional support, refer to the [Smart Edit Prevention Guide](SMART-EDIT-PREVENTION-GUIDE.md) and the comprehensive test suite examples.