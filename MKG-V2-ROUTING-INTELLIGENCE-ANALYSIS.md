# MKG V2 Routing Intelligence Analysis

**Date**: December 9, 2025  
**Question 1**: Were V1 learned lessons transplanted to V2?  
**Question 2**: Does the system know when to route to spawn_subagent vs cloud API vs file operations?

---

## Question 1: V1 → V2 Learning Migration ✅

### Answer: YES - V1 Lessons Were Transplanted

**Evidence from `data/learning/learning-state.json` (31KB)**:

#### Migrated Data Points
- **29 entries** marked with `"source": "adaptive_router_migration"`
- These represent V1's AdaptiveRouter learned patterns
- Migration timestamp: ~January 2025

#### Example Migrated Patterns
```json
{
  "timestamp": 1759765435110,
  "task": "[Migrated from AdaptiveRouter] analysis",
  "tool": "nvidia_qwen480b",
  "source": "adaptive_router_migration",
  "success": 0.3,
  "context": {
    "complexity": "high",
    "taskType": "analysis",
    "fileCount": 1
  }
}
```

#### V1 Learning Categories Preserved
1. **Task Types**: analysis, coding, general, game_dev, unknown
2. **Backends**: nvidia_qwen480b, nvidia_deepseek_v3, local_qwen_coder
3. **Complexity Levels**: high, medium, low
4. **Success Patterns**: Performance data for each backend per task type

#### New V2 Learning (Post-Migration)
- **20 new entries** from orchestrator and orchestrator_fallback
- Learning from live V2 usage:
  - Code generation tasks: 5 samples (0.90 avg success)
  - Analysis tasks: 8 samples (0.68 avg success)
  - Refactoring: 5 samples (0.86 avg success)
  - Architecture: 2 samples (0.90 avg success)

### Current Learning State Summary

**Tool Performance (Confidence Scores)**:
- `local_qwen_coder`: 0.86 confidence (20 calls, 17 successful)
- `local`: 0.52 confidence (2 calls, 0 successful)
- Migrated from V1: nvidia backends, various confidence levels

**Task Patterns Learned** (15 unique patterns):
- `low:code_generation:single` → local_qwen_coder (90% success)
- `low:testing:single` → local_qwen_coder (83% success)
- `high:analysis:single` → nvidia_qwen480b preferred
- `medium:refactoring:*` → local_qwen_coder (80% success)
- Plus 11 more pattern-to-backend mappings

**Source Metrics**:
- Orchestrator: 14 calls, 82.5% confidence
- Orchestrator fallback: 6 calls, 85% confidence
- Adaptive router migration: 29 calls, 75% confidence
- Forced: 2 calls, 55% confidence

### Verdict: NOT Starting from Scratch ✅

V2 inherited:
- 29 V1 task patterns
- Backend performance history
- Task complexity classifications
- Success/failure patterns

V2 is building on V1's foundation, not replacing it.

---

## Question 2: Routing Intelligence by Operation Type

### Answer: PARTIALLY - Route by Tool Handler, NOT by Execution Method

The routing system understands **tool types** but routes ALL of them through the **same backend selection logic** (cloud APIs). It does NOT have separate routing logic for:
- spawn_subagent vs ask
- File operations vs AI queries
- Local operations vs cloud APIs

### Architecture Analysis

#### Tool Handler Organization
```
MKG V2 has separate handlers for different operations:
├── ask-handler.js       → AI queries (model routing)
├── subagent-handler.js  → spawn_subagent (delegates to ask-handler)
├── read-handler.js      → File reading
├── file-handlers.js     → write_files_atomic, edit_file, multi_edit
├── review-handler.js    → Code review
└── system-handlers.js   → health, analytics, manage_conversation
```

#### Current Routing Flow

**For ALL handlers that need AI**:
1. Tool called (ask, spawn_subagent, edit_file, review, etc.)
2. Handler processes request
3. **Same routing decision engine** consulted:
   - Priority 1: `force_backend` parameter
   - Priority 2: Compound learning recommendations
   - Priority 3: Orchestrator-8B (if healthy)
   - Priority 4: Rule-based fallback
   - Priority 5: Health-based last resort
4. Backend selected (local/gemini/deepseek/qwen3/chatgpt/groq)
5. Cloud API called

**Key Issue**: spawn_subagent, edit_file, and ask all use the SAME backend pool (cloud APIs)

### What V2 Does NOT Route Separately

#### 1. spawn_subagent vs ask
**Current behavior**:
- Both use the same backend selection (local/gemini/deepseek/qwen/chatgpt/groq)
- spawn_subagent is just ask with a specialized role template
- No separate "subagent backend pool"

**What's missing**:
```javascript
// This logic doesn't exist:
if (tool === 'spawn_subagent' && role === 'planner') {
  // Route to specialized planning backend
  return 'nvidia_qwen480b'; // Good at planning
} else if (tool === 'ask' && isQuickQuery) {
  // Route to fast local backend
  return 'local';
}
```

#### 2. File Operations vs AI Queries
**Current behavior**:
- File operations (read, write, edit) don't need backend routing
- They execute locally on the MKG server
- Only when `edit_file` needs AI assistance for fuzzy matching does it query backends

**What's present**:
- read-handler.js: Pure file I/O (no backend routing)
- write_files_atomic: Pure file I/O (no backend routing)
- edit_file: File I/O + optional AI fuzzy matching (uses routing)

#### 3. Local vs Cloud Operations
**Current behavior**:
- "local" backend IS a cloud API call (to local Qwen2.5-Coder-7B via vLLM)
- No distinction between "truly local" operations and "cloud API calls"

**What's missing**:
- No "zero-network" operation mode
- No caching layer to avoid repeated API calls
- No offline fallback

### Task Patterns: What V2 DOES Learn

**From `learning-state.json` taskPatterns**:

V2 learns correlations between:
```
{complexity}:{taskType}:{fileCount} → Backend preference

Examples:
- low:code_generation:single → local_qwen_coder (90% success)
- high:analysis:multi → nvidia_qwen480b (60% success)
- medium:refactoring:multi → local_qwen_coder (80% success)
```

**What's missing**:
- No learning for `{tool}:{role}:{complexity}` patterns
- spawn_subagent role-specific routing not learned
- No file operation complexity patterns (all local anyway)

### What Would Full Routing Intelligence Look Like?

#### Ideal: Tool-Aware Routing

```javascript
// Hypothetical routing logic:

// 1. Operation Type Detection
if (tool === 'read' || tool === 'write_files_atomic') {
  // Pure file ops → Execute locally, no routing needed
  return executeFileOperation();
}

// 2. Tool-Specific Backend Pools
if (tool === 'spawn_subagent') {
  switch (role) {
    case 'planner':
      // Route to planning-optimized backends
      return routeToPlanningBackend(); // Qwen3, DeepSeek
    case 'code-reviewer':
      // Route to code analysis backends
      return routeToReviewBackend(); // DeepSeek, Qwen3
    case 'security-auditor':
      // Route to security-focused backends
      return routeToSecurityBackend(); // DeepSeek
  }
}

// 3. Execution Method Routing
if (tool === 'ask') {
  if (isLongRunning) {
    // Route to high-context backends
    return routeToHighContext(); // Qwen3 (128K), ChatGPT (128K)
  } else if (isQuickQuery) {
    // Route to fast local backends
    return routeToFast(); // local, Groq (500+ t/s)
  }
}

// 4. Cost-Aware Routing
if (estimatedTokens > 10000 && costSensitive) {
  // Route to free/cheap backends
  return routeToLocal(); // local, Gemini
} else if (qualityRequired) {
  // Route to premium backends
  return routeToPremium(); // ChatGPT, DeepSeek
}
```

### Summary: What V2 Currently Routes On

**Routes based on**:
✅ Task complexity (low/medium/high)
✅ Task type (analysis, coding, refactoring, etc.)
✅ File count (single/multi)
✅ force_backend parameter
✅ Backend health status
✅ Historical success patterns

**Does NOT route based on**:
❌ Tool type (ask vs spawn_subagent vs edit_file)
❌ Subagent role (planner vs code-reviewer)
❌ Execution method (local vs cloud vs cached)
❌ Cost optimization (free vs paid backends)
❌ Response speed requirements (fast vs thorough)
❌ Token budget constraints

---

## Recommendations for Enhanced Routing

### 1. Add Tool-Aware Routing
```javascript
// In compound-learning.js or playbook-system.js
const TOOL_BACKEND_PREFERENCES = {
  'spawn_subagent': {
    'planner': ['nvidia_qwen', 'nvidia_deepseek'],
    'code-reviewer': ['nvidia_deepseek', 'nvidia_qwen'],
    'security-auditor': ['nvidia_deepseek', 'chatgpt']
  },
  'ask': {
    'quick_query': ['local', 'groq'],
    'deep_analysis': ['nvidia_qwen', 'chatgpt'],
    'code_generation': ['nvidia_deepseek', 'local']
  }
};
```

### 2. Learn Role-Specific Patterns
Extend taskPatterns to include:
```json
{
  "spawn_subagent:planner:high": {
    "toolPerformance": {
      "nvidia_qwen": { "calls": 10, "successSum": 8.5 }
    }
  }
}
```

### 3. Add Cost/Speed Metadata
```javascript
const BACKEND_PROFILES = {
  local: { cost: 0, speed: 'medium', quality: 'good' },
  groq: { cost: 0.27, speed: 'ultra_fast', quality: 'good' },
  nvidia_qwen: { cost: 0.30, speed: 'medium', quality: 'excellent' },
  chatgpt: { cost: 5.00, speed: 'slow', quality: 'premium' }
};
```

### 4. Implement Execution Method Detection
```javascript
// Detect if operation needs network
if (isFileOperation && !needsAI) {
  return executeLocally(); // No routing needed
}

if (canUseCachedResult) {
  return getCachedResult(); // No API call
}

// Then proceed to backend routing
```

---

## Conclusion

### Question 1: V1 Lessons Transplanted? ✅ YES
- 29 V1 patterns migrated
- Building on V1 foundation, not starting over
- Compound learning extends V1's adaptive routing

### Question 2: Routes by Operation Type? ⚠️ PARTIAL
- Routes by **task patterns** (complexity, type, file count)
- Does NOT route by **tool type** (ask vs spawn_subagent)
- Does NOT route by **execution method** (local vs cloud)
- All AI tools share the same backend pool

**Bottom line**: V2 has intelligent routing for backend selection, but treats all AI tools (ask, spawn_subagent, edit_file) the same. No special routing logic for subagents or file operations.

---

**Status**: Analysis Complete  
**Date**: December 9, 2025  
**Next Steps**: Consider implementing tool-aware routing for V2.1
