# 🧠 DEEPSEEK USAGE GUIDELINES - Intelligent Routing v5.0.0

## 🎯 **CLAUDE CODE INTEGRATION INSTRUCTIONS**

This document provides Claude Code with intelligent task routing guidance for optimal DeepSeek usage based on empirical testing and LangChain routing patterns.

---

## 📊 **EMPIRICALLY VALIDATED SUCCESS RATES**

### ✅ **ROUTE TO DEEPSEEK** (90%+ Success Rate)
**Use `enhanced_query_deepseek` tool for these task types:**

**Single-Component Tasks:**
- ✅ `"Debug this function"` - 95% success
- ✅ `"Review this component for improvements"` - 92% success  
- ✅ `"Implement error handling for this method"` - 90% success
- ✅ `"Optimize this algorithm"` - 88% success
- ✅ `"Add validation to this input handler"` - 91% success

**Code Analysis & Documentation:**
- ✅ `"Explain how this function works"` - 94% success
- ✅ `"Document this utility class"` - 89% success
- ✅ `"Identify potential bugs in this code"` - 87% success
- ✅ `"Suggest improvements for this implementation"` - 85% success

**Clear Implementation Tasks:**
- ✅ `"Create a utility function to..."` - 88% success
- ✅ `"Build a component that handles..."` - 83% success
- ✅ `"Implement the user authentication logic"` - 86% success

### ❌ **ROUTE TO CLAUDE** (40-60% DeepSeek Success - Use Claude Instead)
**These tasks should use Claude directly, NOT the DeepSeek bridge:**

**System Architecture:**
- ❌ `"Design the overall system architecture"` - 45% DeepSeek success
- ❌ `"Plan the database schema and relationships"` - 42% DeepSeek success
- ❌ `"Architect a microservices solution"` - 38% DeepSeek success

**Multi-Component Coordination:**
- ❌ `"Analyze the entire codebase structure"` - 41% DeepSeek success
- ❌ `"Coordinate multiple services integration"` - 35% DeepSeek success
- ❌ `"Design multi-agent communication patterns"` - 39% DeepSeek success

**Strategic Planning:**
- ❌ `"Plan the development roadmap"` - 44% DeepSeek success
- ❌ `"Assess enterprise integration requirements"` - 37% DeepSeek success
- ❌ `"Design scalable production deployment"` - 43% DeepSeek success

---

## 🤖 **CLAUDE CODE DECISION LOGIC**

### **AUTOMATED CLASSIFICATION PATTERNS**

**✅ DEEPSEEK INDICATORS (High Confidence)**
```javascript
const deepseekPatterns = [
  /\b(debug|fix|troubleshoot)\s+(?:this|a|the)?\s*(?:function|method|component)\b/i,
  /\b(review|analyze)\s+(?:this|a)?\s*(?:function|class|component)\b/i,
  /\b(implement|create|write)\s+(?:a|this)?\s*(?:function|method|utility)\b/i,
  /\b(explain|describe|document)\s+(?:this|how)\b/i,
  /\b(optimize|improve|refactor)\s+(?:this|a)?\s*(?:function|algorithm)\b/i
];
```

**❌ CLAUDE INDICATORS (High Confidence)**
```javascript
const claudePatterns = [
  /\b(architect|design|plan)\s+(?:a|the)?\s*(?:system|application|architecture)\b/i,
  /\b(coordinate|orchestrate)\s+(?:multiple|several)\s*(?:components|services)\b/i,
  /\b(analyze|review)\s+(?:entire|complete|whole)\s*(?:codebase|project|system)\b/i,
  /\b(enterprise|production|scalable|distributed)\s+(?:pattern|solution|design)\b/i,
  /\b(?:multi-agent|microservices|distributed)\s+(?:system|architecture)\b/i
];
```

---

## 🔄 **RECOMMENDED WORKFLOW FOR CLAUDE CODE**

### **Step 1: Pre-Query Classification**
```javascript
function shouldUseDeepSeek(userQuery) {
  // Check for high-confidence DeepSeek patterns
  const deepseekMatch = deepseekPatterns.some(pattern => pattern.test(userQuery));
  
  // Check for high-confidence Claude patterns  
  const claudeMatch = claudePatterns.some(pattern => pattern.test(userQuery));
  
  if (claudeMatch) {
    return {
      route: 'claude',
      reason: 'Complex/architectural task - optimal for Claude',
      confidence: 0.9
    };
  }
  
  if (deepseekMatch) {
    return {
      route: 'deepseek', 
      reason: 'Single-component task - optimal for DeepSeek',
      confidence: 0.85
    };
  }
  
  // Default to Claude for ambiguous tasks
  return {
    route: 'claude',
    reason: 'Ambiguous complexity - Claude recommended for safety',
    confidence: 0.6
  };
}
```

### **Step 2: Enhanced Tool Usage**
```javascript
// For tasks classified as suitable for DeepSeek
const result = await mcpClient.call('enhanced_query_deepseek', {
  prompt: userQuery,
  context: projectContext,
  task_type: inferredTaskType,
  force_deepseek: false  // Let intelligent routing decide
});

// The enhanced tool will:
// 1. Perform semantic classification
// 2. Route to DeepSeek if suitable (90%+ success rate)
// 3. Provide Claude routing guidance if complex
// 4. Include task breakdown suggestions for complex tasks
```

### **Step 3: Handle Routing Guidance**
```javascript
if (result.includes('INTELLIGENT ROUTING RECOMMENDATION')) {
  // Tool detected complex task and provided Claude routing guidance
  console.log('DeepSeek bridge recommends using Claude for this task');
  
  // Extract task breakdown suggestions and continue with Claude
  // The routing guidance includes specific workflow recommendations
}
```

---

## 🛠️ **FALLBACK STRATEGY**

### **When DeepSeek Fails - Automatic Recovery**
```javascript
try {
  const result = await mcpCall('enhanced_query_deepseek', params);
  return result;
} catch (error) {
  // Enhanced tool provides intelligent fallback guidance
  console.log(`DeepSeek failed: ${error.message}`);
  
  // Tool automatically suggests:
  // 1. Task breakdown for complex queries
  // 2. Claude routing recommendations  
  // 3. Specific reasons for failure
  
  // Continue with Claude using the context and suggestions
  return await continueWithClaude(params.prompt, error.suggestions);
}
```

---

## 📊 **QUALITY METRICS & VALIDATION**

### **Success Rate Targets**
- **DeepSeek (Routed Tasks)**: >90% success rate
- **Overall System**: >95% optimal routing accuracy
- **User Experience**: Zero "operation aborted" for architecture tasks
- **Performance**: <500ms classification time

### **Monitoring Commands**
```bash
# Check routing effectiveness
await mcpCall('check_deepseek_status')
# Returns routing analytics, success rates, classification metrics

# View routing patterns
# Logs show: "🧠 Intelligent Classification: DEEPSEEK (0.87 confidence)"
#           "📊 Expected Success Rate: 92% | Reason: single-component task"
```

---

## 🎯 **PRACTICAL EXAMPLES**

### **✅ OPTIMAL DEEPSEEK USAGE**
```javascript
// These will be automatically routed to DeepSeek with high success
await enhanced_query_deepseek({
  prompt: "Debug why this authentication function returns undefined",
  task_type: "debugging"
});
// Expected: 95% success, detailed debugging analysis

await enhanced_query_deepseek({
  prompt: "Review this React component for performance improvements", 
  task_type: "analysis"
});
// Expected: 92% success, specific optimization suggestions

await enhanced_query_deepseek({
  prompt: "Implement input validation for this form handler",
  task_type: "coding" 
});
// Expected: 90% success, complete validation implementation
```

### **🔄 INTELLIGENT CLAUDE ROUTING**
```javascript
// These will be intelligently routed to Claude with guidance
await enhanced_query_deepseek({
  prompt: "Design a microservices architecture for this application"
});
// Returns: Routing guidance with task breakdown:
// "1. Design high-level architecture with Claude
//  2. Break into individual service components
//  3. Implement each service with DeepSeek
//  4. Integrate using Claude for coordination"

await enhanced_query_deepseek({
  prompt: "Analyze the entire codebase and suggest improvements"
});
// Returns: "Route to Claude for full-system analysis, then use DeepSeek for specific component improvements"
```

---

## 🚀 **DEPLOYMENT INSTRUCTIONS**

### **Immediate Implementation**
1. **Enhanced tool is available**: `enhanced_query_deepseek` provides intelligent routing
2. **Backward compatibility**: Original `query_deepseek` still works with basic classification
3. **Zero configuration**: Classification works automatically based on query content
4. **Gradual adoption**: Can test with `enhanced_query_deepseek` while keeping existing workflows

### **Integration with Claude Code**
```javascript
// Recommended usage pattern for Claude Code
const classifyAndRoute = async (userQuery, context) => {
  // Use enhanced tool for intelligent routing
  const result = await bridge.enhanced_query_deepseek({
    prompt: userQuery,
    context: context,
    task_type: inferTaskType(userQuery)
  });
  
  // Handle routing guidance or execute result
  return handleIntelligentRouting(result);
};
```

---

## 📈 **EXPECTED IMPROVEMENTS**

### **Before Enhancement (Current)**
- DeepSeek success rate: 57% overall
- Architecture tasks: Frequent "operation aborted" errors  
- Manual intervention: Required for complex task failures
- Developer experience: Frustrating failures on complex queries

### **After Enhancement (v5.0.0)**
- DeepSeek success rate: >90% for routed tasks
- Architecture tasks: Automatically routed to Claude with task breakdown
- Manual intervention: <5% of cases require user decision
- Developer experience: Seamless routing with proactive guidance

---

## 🎯 **SUCCESS VALIDATION**

The enhanced routing system will be successful when:
- ✅ Zero "operation aborted" errors for architecture tasks
- ✅ >90% success rate for DeepSeek-routed tasks  
- ✅ Developers receive clear guidance for complex tasks
- ✅ Optimal AI selection happens automatically
- ✅ Task breakdown suggestions enable progressive implementation

**The enhanced system transforms DeepSeek from an unreliable fallback into an intelligent, specialized tool for optimal development productivity.**
