# Handoff: Model-Aware Learning Enhancement

**Session Date**: December 26, 2025
**Branch**: `feature/mkg-v9-local-llm-ops`
**Status**: Implementation Complete, Needs Testing

---

## Summary

Enhanced the MKG compound learning system to track **which local model** performs best for which task types. Previously, learning only tracked backend (local/nvidia/etc) - now it tracks the specific model ID (e.g., `coding-seed-coder`, `coding-qwen-7b`).

---

## What Was Implemented

### 1. compound-learning.js

**New Data Structures:**
```javascript
this.modelMetrics = {};    // Per-model performance (EMA confidence, by task type)
this.modelPatterns = {};   // Task type + model → success patterns
```

**Enhanced Methods:**

| Method | Change |
|--------|--------|
| `constructor()` | Added `modelMetrics`, `modelPatterns` initialization |
| `recordOutcome()` | Extracts `routing.modelId`, calls `_updateModelMetrics()` |
| `_learnTaskPattern()` | Now accepts `modelId`, stores model-specific patterns |
| `_updateModelMetrics()` | **NEW** - EMA tracking per model, by task type |
| `_calculateModelTrend()` | **NEW** - Trend detection for specific models |
| `getRecommendation()` | Returns `modelRecommendation` with best model for task |
| `_getModelRecommendation()` | **NEW** - Finds best model for task type |
| `getSummary()` | Includes `modelPerformance`, `modelPatternCount` |
| `_getBestTaskTypesForModel()` | **NEW** - Top 3 task types per model |
| `_saveState()` / `_loadState()` | Persists new model data |
| `reset()` | Clears model data |

### 2. base-handler.js

**Updated Methods:**

| Method | Change |
|--------|--------|
| `recordLearningOutcome()` | Auto-extracts `modelId` from router context or local adapter |
| `recordExecution()` | Extracts `modelId` from response metadata |

**ModelId Extraction Priority:**
1. `taskContext.modelId` (explicit)
2. `router._lastRoutingContext.modelId`
3. `router.backends.getAdapter('local').modelId` (for local backend)

### 3. ask-handler.js

**Updated Call:**
```javascript
this.recordRoutingOutcome(true, responseContent.length, selectedBackend, {
  modelId: response?.metadata?.model || response?.metadata?.detectedModel,
  taskType: this.router?._lastRoutingContext?.taskType || 'general'
});
```

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                     REQUEST FLOW                                │
├─────────────────────────────────────────────────────────────────┤
│ 1. Handler makes request to local backend                      │
│ 2. LocalAdapter detects model: this.modelId = "coding-seed-coder" │
│ 3. Response includes metadata.model                            │
│ 4. Handler calls recordLearningOutcome() with modelId          │
│ 5. CompoundLearning stores:                                    │
│    - modelMetrics["coding-seed-coder"].byTaskType["security"]  │
│    - modelPatterns["security:coding-seed-coder"]               │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     RECOMMENDATION FLOW                         │
├─────────────────────────────────────────────────────────────────┤
│ 1. getRecommendation({ taskType: "security" })                 │
│ 2. Finds best tool for pattern                                 │
│ 3. _getModelRecommendation("security") finds:                  │
│    - coding-seed-coder: 92% success (15 samples)               │
│    - coding-qwen-7b: 45% success (8 samples)                   │
│ 4. Returns:                                                    │
│    {                                                           │
│      tool: "local",                                            │
│      modelRecommendation: {                                    │
│        modelId: "coding-seed-coder",                           │
│        confidence: 0.92,                                       │
│        reason: "Best for security: coding-seed-coder"          │
│      }                                                         │
│    }                                                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Files Changed

```
src/intelligence/compound-learning.js   (major enhancements)
src/handlers/base-handler.js            (modelId extraction)
src/handlers/ask-handler.js             (explicit modelId passing)
```

**Syntax validated**: All files pass `node --check`

---

## What This Enables

1. **Model Performance Visibility**: See which models excel at which tasks
2. **Informed Model Selection**: Learning recommends best model for task type
3. **No Forced Defaults**: Still respects your loaded model, just provides data
4. **Persistent Learning**: Model patterns saved to `data/learning/learning-state.json`

---

## Testing Checklist

- [x] Fix `ask-handler.js` recordRoutingOutcome to accept and pass modelId (was dropping 4th param)
- [x] Fix `server-mkg-v2.js` router.recordRoutingOutcome to extract and pass modelId to learning
- [ ] Restart MKG server to pick up changes
- [ ] Load different models and run tasks
- [ ] Check `data/learning/learning-state.json` for `modelMetrics`
- [ ] Verify `getSummary()` includes model performance
- [ ] Confirm recommendations include `modelRecommendation`
- [ ] Test with `/local-agents` - should record model used
- [ ] Test with `spawn_subagent` - should record model used

## Fixes Applied (Dec 26, 2025)

### Issue Found
The `ask-handler.js` `recordRoutingOutcome` method only accepted 3 parameters, but was being called with 4 (the 4th being `taskContext` with `modelId`). The 4th parameter was silently dropped.

### Fix 1: ask-handler.js (line 305)
```javascript
// BEFORE: Only 3 params, dropped taskContext
async recordRoutingOutcome(success, outputLength, selectedBackend) {

// AFTER: Accepts and passes modelId
async recordRoutingOutcome(success, outputLength, selectedBackend, taskContext = {}) {
  await this.router?.recordRoutingOutcome?.({
    success,
    outputLength: outputLength || 0,
    backend: selectedBackend,
    modelId: taskContext.modelId || null,  // NEW
    taskType: taskContext.taskType || 'general',
    timestamp: Date.now()
  });
}
```

### Fix 2: server-mkg-v2.js (line 242)
```javascript
// Added modelId extraction and passing to learning engine
const modelId = outcome.modelId || 
                routingContext?.modelId ||
                (outcome.backend === 'local' ? server.backendRegistry?.getAdapter?.('local')?.modelId : null);

// Pass in routing object
routing: {
  tool: outcome.backend,
  source: source,
  modelId: modelId  // NEW
}
```

---

## Example Learning State After Use

```json
{
  "modelMetrics": {
    "coding-seed-coder": {
      "confidence": 0.85,
      "totalCalls": 25,
      "successfulCalls": 22,
      "byTaskType": {
        "security": { "calls": 8, "successSum": 7.2 },
        "refactoring": { "calls": 12, "successSum": 10.1 }
      },
      "trend": "stable"
    },
    "coding-qwen-7b": {
      "confidence": 0.72,
      "totalCalls": 15,
      "byTaskType": {
        "quick_fix": { "calls": 10, "successSum": 8.5 }
      }
    }
  },
  "modelPatterns": {
    "security:coding-seed-coder": { "calls": 8, "successSum": 7.2 },
    "quick_fix:coding-qwen-7b": { "calls": 10, "successSum": 8.5 }
  }
}
```

---

## Related Context

- Previous handoff: `HANDOFF-MKG-V9-LOCAL-OPS.md` (modelProfile discussion)
- Branch has 3 prior commits for v9 local LLM operations
- Decision: Keep `modelProfile` optional, use learning to inform (not force)

---

## Next Steps

1. **Test the implementation** with real model swaps
2. **Consider UI/CLI** to show model recommendations
3. **Optional**: Add model recommendation to routing decision output
4. **Optional**: Warn when using a model with low success for task type

---

**End of Handoff**
