# Issue: spawn_subagent Cannot Read Files or Execute Tools

**Created**: 2025-12-17  
**Priority**: High  
**Component**: `src/handlers/` (SubagentHandler)  
**Status**: Open  

---

## Problem Summary

`mcp__mecha-king-ghidorah-global__spawn_subagent` agents cannot read files or execute tools. They only return text responses that *describe* tool usage rather than actually performing operations.

## Observed Behavior

When spawning a code-reviewer agent with file patterns:

```javascript
mcp__mecha-king-ghidorah-global__spawn_subagent({
  role: "code-reviewer",
  task: "Review the VoiceAgentWidget C# project...",
  file_patterns: ["/home/platano/project/WigiDash_Scripts/VoiceAgentWidget/*.cs"]
})
```

**Expected**: Agent reads files and provides code review with actual file contents.

**Actual**: Agent returns literal text like:
```
I will start by reading the files...
read /home/platano/project/WigiDash_Scripts/VoiceAgentWidget/WidgetInstanceBase.cs
read /home/platano/project/WigiDash_Scripts/VoiceAgentWidget/WidgetInstance.cs
```

The `read /path/to/file` is printed as **text output**, not executed as a tool call.

## Root Cause

MKG's `spawn_subagent` routes requests to external AI backends (Gemini, DeepSeek, Qwen3, etc.) that:

1. **Don't have MCP tool access** - They're raw API calls, not MCP clients
2. **Can only generate text responses** - No tool execution capability
3. **Have no filesystem access** - Running on remote servers

The `file_patterns` parameter is accepted in the schema but **never used** to pre-fetch file contents before sending the prompt to the AI backend.

## Affected Tools

| Tool | Impact |
|------|--------|
| `spawn_subagent` | All roles affected (code-reviewer, security-auditor, planner, etc.) |
| `parallel_agents` | Likely same issue (uses spawn_subagent internally) |

## Current Workaround

Use Claude Code's native `Task` tool with specialized agent types, which have full MCP tool access:

```javascript
Task({
  subagent_type: "general-purpose",
  prompt: "Review the code at /path/to/files...",
  description: "Code review task"
})
```

## Proposed Fix

### Option 1: Pre-fetch Files (Recommended)

Modify the SubagentHandler to:

1. Accept `file_patterns` parameter
2. Glob match files in the filesystem
3. Read file contents
4. Inject contents into the prompt before sending to AI backend

```javascript
// Pseudocode for fix
async handleSpawnSubagent(params) {
  let enrichedPrompt = params.task;
  
  if (params.file_patterns && params.file_patterns.length > 0) {
    const files = await globMatch(params.file_patterns);
    const contents = await Promise.all(files.map(f => fs.readFile(f, 'utf8')));
    
    enrichedPrompt = `## Files to Review\n\n`;
    files.forEach((file, i) => {
      enrichedPrompt += `### ${file}\n\`\`\`\n${contents[i]}\n\`\`\`\n\n`;
    });
    enrichedPrompt += `## Task\n\n${params.task}`;
  }
  
  return await this.callBackend(params.role, enrichedPrompt);
}
```

### Option 2: Tool Simulation Loop

Parse AI responses for tool-like patterns and execute them:

1. Send initial prompt to AI backend
2. Parse response for patterns like `read /path/to/file`
3. Execute the implied tool
4. Feed results back to AI
5. Repeat until AI provides final answer

**Pros**: More flexible, supports any tool  
**Cons**: Complex, multiple API calls, harder to debug

### Option 3: Hybrid Delegation

Use MKG for routing decisions only, delegate actual tool execution to Claude Code:

1. MKG selects backend and constructs prompt
2. Returns "needs_tools" flag with tool requests
3. Claude Code executes tools
4. Results fed back to MKG for final synthesis

**Pros**: Leverages existing tool infrastructure  
**Cons**: Requires protocol changes, more complex integration

### Option 4: Documentation Only

Clarify in documentation that `spawn_subagent` is for **text-only analysis** and cannot execute tools. Users should pre-read files and include contents in the task description.

**Pros**: No code changes  
**Cons**: Poor UX, doesn't solve the underlying limitation

## Files to Modify

```
/home/platano/project/deepseek-mcp-bridge/
├── src/handlers/
│   └── subagent-handler.js (or similar)  # Main fix location
├── src/tools/
│   └── smart-alias-resolver.js           # Tool schema definitions
└── server-mkg-v2.js                       # Entry point (if handler registration needs changes)
```

## Implementation Checklist

- [ ] Locate SubagentHandler in `src/handlers/`
- [ ] Add glob matching for `file_patterns` parameter
- [ ] Implement file reading with size limits (prevent token overflow)
- [ ] Add file content injection into prompt
- [ ] Add truncation/chunking for large files
- [ ] Update tool schema to document `file_patterns` behavior
- [ ] Add tests for file pre-fetching
- [ ] Update `parallel_agents` if it uses same pattern
- [ ] Document the fix in README

## Testing

```javascript
// Test case: Code review with file patterns
mcp__mecha-king-ghidorah-global__spawn_subagent({
  role: "code-reviewer",
  task: "Review this code for security issues",
  file_patterns: ["/home/platano/project/test-project/*.js"]
})

// Expected: Response includes actual code analysis, not "read /path" text
```

## Related Issues

- Orphan process accumulation (separate issue, fixed by killing stale processes)
- MKG health check caching (working correctly)

## Notes

- The `verdict_mode` parameter works correctly (summary vs full)
- Backend routing (Gemini, DeepSeek, etc.) works correctly
- The issue is specifically about **tool execution capability**, not routing
