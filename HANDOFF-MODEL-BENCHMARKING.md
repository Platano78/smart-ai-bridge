# Handoff: Model Benchmarking Experiment

**Date**: 2025-12-26  
**Status**: In Progress  
**Branch**: `feature/mkg-v9-local-llm-ops`  
**Last Commit**: `ff902ad` - fix(learning): pass modelId through routing pipeline

---

## Results Summary

| Model | Size | Test 1 (Coding) | Test 2 (Analysis) | Test 3 (Reasoning) | Avg Time | Quality |
|-------|------|-----------------|-------------------|--------------------|---------|---------|
| coding-reap25b | 25B | 54.3s | 24.0s | 67.2s | **48.5s** | ⭐⭐⭐⭐⭐ |
| coding-seed-coder | 8B | 12.5s | 10.4s | - | **~11s** | ⭐⭐⭐⭐ |
| coding-qwen-7b | 7B | 8.4s | 9.0s | 13.0s | **10.1s** | ⭐⭐⭐⭐ |
| agents-nemotron | 14B | - | - | - | ? | Pending |
| fast-qwen14b | 14B | ❌ | ❌ | ❌ | - | FILE MISSING |

---

## Remaining Work

### 1. Test agents-nemotron (14B) - NOW LOADED
Model is loaded and ready. Run these 3 tests:

```bash
# Test 1 - Coding
mcp__mecha-king-ghidorah-global__ask model=local model_profile=agents-nemotron prompt="Write a TypeScript debounce function with proper generic types..."

# Test 2 - Analysis  
mcp__mecha-king-ghidorah-global__ask model=local model_profile=agents-nemotron prompt="Find all bugs in this code: [paste code]"

# Test 3 - Reasoning
mcp__mecha-king-ghidorah-global__ask model=local model_profile=agents-nemotron prompt="Explain when to use callbacks vs Promises vs async/await..."
```

### 2. Fix fast-qwen14b
**Problem**: Model file missing at:
```
/mnt/d/ai-workspace/models/bartowski/Qwen2.5-Coder-14B-Instruct-abliterated-GGUF/Qwen2.5-Coder-14B-Instruct-abliterated-Q4_K_M.gguf
```
Either download or remove from llama-swap config.

### 3. Verify Learning Data
```bash
cat data/learning/learning-state.json | jq '.modelMetrics | keys'
cat data/learning/learning-state.json | jq '.routingHistory[-10:] | .[] | {tool, modelId}'
```

---

## Key Findings

1. **Speed vs Quality Tradeoff**: 25B is ~5x slower but more comprehensive
2. **7B-8B Sweet Spot**: ~10s response, good quality for most tasks
3. **Model-aware learning working**: modelId being recorded correctly
4. **llama-swap auto-swap**: Works correctly, just needs time for model loading

---

## Test Prompts (for consistency)

**Coding**:
```
Write a TypeScript debounce function with proper generic types. The function should accept any function and a delay in milliseconds, returning a debounced version that preserves the original function's type signature.
```

**Analysis**:
```javascript
async function fetchUserData(userId) {
  const response = await fetch('/api/users/' + userId);
  const data = response.json();  // BUG: missing await
  localStorage.setItem('user', data);  // BUG: needs JSON.stringify
  return data;
}
function processUsers(users) {
  for (var i = 0; i <= users.length; i++) {  // BUG: <= should be <
    console.log(users[i].name);  // BUG: var should be let
  }
}
// Also missing: error handling
```

**Reasoning**:
```
Explain when to use callbacks vs Promises vs async/await in JavaScript. Give one example for each.
```
