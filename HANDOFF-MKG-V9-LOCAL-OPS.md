# Handoff: MKG v9 Local LLM File Operations

**Session Date**: December 26, 2025
**Branch**: `feature/mkg-v9-local-llm-ops`
**Status**: Testing Complete, Architecture Questions Pending

---

## What Was Done This Session

### 1. Live Testing of MKG v9 Local LLM Handlers

All 6 v9 handlers tested and working:

| Handler | Status | Notes |
|---------|--------|-------|
| `analyze_file` | ✅ Working | Reads file, sends to LLM, returns structured analysis |
| `generate_file` | ✅ Working | Generates code from spec, review mode works |
| `modify_file` | ✅ Working | Edits files with diff output |
| `batch_analyze` | ✅ Working | Multi-file analysis with aggregation |
| `batch_modify` | ✅ Working | Atomic multi-file edits |
| `refactor` | ✅ Working | Cross-file refactoring with scope detection |

### 2. Bug Fix Applied (Committed)

**Commit `e463892`**: Fixed handlers using `routeRequest()` instead of `makeRequest()`
- `routeRequest()` returns backend name string
- `makeRequest()` returns actual AI response
- All handlers now correctly call `makeRequest()`

### 3. Added modelProfile Support (Committed)

**Commit `9769f4d`**: Added `modelProfile` option to all v9 handlers
```javascript
options: {
  backend: "local",
  modelProfile: "coding-seed-coder"  // Select llama-swap model
}
```

### 4. Local Model Performance Testing

| Model | Size | analyze_file Time | Quality |
|-------|------|-------------------|---------|
| `coding-qwen-7b` | 7B | 16s | Basic, no validation |
| `coding-seed-coder` | 8B | 21s | **Better** - input validation, edge cases |
| `agents-nemotron` | 14B | 7s* | Reasoning model (OpenReasoning) |
| `coding-reap25b` | 25B MoE | 41s | Highest quality |
| `agents-qwen3-14b` (Q6) | 14B | 98s | Heavy quant, too slow |

*Nemotron tested with simpler prompt

### 5. Quality Comparison: qwen-7b vs seed-coder

**Task**: Generate debounce function

| Model | Time | Output Quality |
|-------|------|----------------|
| coding-qwen-7b | 2s | Basic implementation, no validation |
| coding-seed-coder | 8s | Input validation, `immediate` option, proper error handling |

**Verdict**: seed-coder worth the extra 6s for production code

---

## Reverted Change - Needs Discussion

I started adding a `defaultModelProfile` to LocalAdapter to make seed-coder the default, but **reverted** because:

### Questions to Resolve

1. **Auto-loading**: Will setting a default model cause it to auto-load?
   - Currently: llama-swap loads model on first request
   - Your scripts manually control which model is loaded

2. **Interaction with /local-agents**:
   - You have a `/local-agents` slash command for parallel agent orchestration
   - How should MKG's model selection interact with this?

3. **Interaction with spawn_subagent**:
   - MKG has `spawn_subagent` for specialized agents
   - Does it need independent model selection?

4. **Your Scripts**:
   - You have `start-*.sh` scripts in llama-cpp-native
   - `start-reap25b.sh`, `start-qwen14b.sh`, etc.
   - Should MKG respect whatever you've loaded, or force its own?

---

## Your Existing Architecture

```
Port 8081 - llama-swap router (GPU)
├── 8 model profiles available
├── Only ONE loaded at a time
├── Swaps on request (via model= parameter)
└── Controlled by your start-*.sh scripts

Port 8085 - Orchestrator (CPU, -ngl 0)
├── nvidia_Orchestrator-8B-Q4_K_M.gguf
├── For routing decisions
└── Separate from inference models

/local-agents slash command
├── Parallel agent orchestration
├── Uses llama-cpp-native models
└── [Need to check: does it pick models?]

spawn_subagent (MKG)
├── Launches specialist agents
├── roles: code-reviewer, security-auditor, etc.
└── [Need to check: model selection?]
```

---

## Commits on Branch

```
e463892 fix(mkg-v9): use makeRequest instead of routeRequest for AI queries
5a84dee feat(mkg): v9.0 Local LLM File Operations
9769f4d feat(mkg-v9): add modelProfile support for llama-swap router
```

---

## Agent Genesis Context

Previous sessions covered:
- `/local-agents` R&D session (Dec 11)
- Local Agents + MKG Dynamic Selection handoff
- llama.cpp router analysis (Dec 18)
- Spawn subagent analysis (Dec 9)

Search query: `local agents spawn subagent llama-swap model selection scenarios`

---

## Files Changed (Uncommitted)

The v9 handlers are committed. No uncommitted changes to core functionality.

Test fixtures created:
- `tests/fixtures/generated-duration-utils.js`
- `tests/fixtures/generated-string-utils.js`

---

## Recommended Next Steps

1. **Clarify Model Selection Philosophy**
   - Should MKG have a default, or always use what's loaded?
   - Should modelProfile be required or optional?

2. **Check /local-agents Integration**
   - Review how it selects models
   - Ensure MKG v9 doesn't conflict

3. **Test spawn_subagent with v9**
   - Do subagents use local models?
   - Should they have independent model selection?

4. **Consider Configuration Options**
   ```javascript
   // Option A: Explicit only (current)
   options.modelProfile = "coding-seed-coder"

   // Option B: Default with override
   LocalAdapter.defaultModelProfile = "coding-seed-coder"
   options.modelProfile = "coding-reap25b"  // override

   // Option C: Use whatever is loaded
   // No model= sent, router uses current model
   ```

---

## Quick Test Commands

```bash
# Check what's loaded
curl -s http://127.0.0.1:8081/v1/models | jq '.data[] | select(.status.value == "loaded") | .id'

# Test with specific model
mcp__mecha-king-ghidorah-global__ask model=local model_profile=coding-seed-coder prompt="test"

# List all models
curl -s http://127.0.0.1:8081/v1/models | jq '.data[] | {id, status: .status.value}'
```

---

**End of Handoff**
