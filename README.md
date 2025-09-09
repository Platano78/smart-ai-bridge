# Deepseek MCP Bridge

**Seamless integration between Claude Code and local Deepseek LLM for unlimited token conversations.**

## 🎯 What This Enables

- **Token Handoff**: When Claude Code approaches limits, continue seamlessly with Deepseek
- **Unlimited Sessions**: No token restrictions for complex development tasks  
- **Local Privacy**: Sensitive code stays on your machine
- **Specialized Tasks**: Route coding tasks to Deepseek, planning tasks to Claude Code

## 🚀 Quick Setup

### 1. Install Dependencies
```bash
cd /home/platano/project/deepseek-mcp-bridge
npm install
```

### 2. Test Connection
```bash
npm test
```

### 3. Add to Claude Code Configuration

Add this to your `~/.claude.json` MCP servers:

```json
{
  "mcpServers": {
    "deepseek-bridge": {
      "command": "node",
      "args": ["server.js"],
      "cwd": "/home/platano/project/deepseek-mcp-bridge"
    }
  }
}
```

### 4. Restart Claude Code

## 🛠️ Available Tools

### `query_deepseek`
Send queries to Deepseek for unlimited token responses.

**Example:**
```
@query_deepseek(
  prompt="Implement a complete game inventory system with drag-and-drop, item stacking, and persistence",
  task_type="game_dev",
  context="Building RPG game with React and Node.js"
)
```

### `check_deepseek_status`
Verify Deepseek server is online and responsive.

**Example:**
```
@check_deepseek_status()
```

### `handoff_to_deepseek`
Initiate unlimited token session handoff.

**Example:**
```
@handoff_to_deepseek(
  context="Working on Empire's Edge game architecture refactor",
  goal="Complete the combat system implementation"
)
```

## 📋 Task Types

- `coding`: General programming tasks
- `game_dev`: Game development specific tasks  
- `analysis`: Code review and technical analysis
- `architecture`: System design and architecture
- `debugging`: Troubleshooting and bug fixes

## 🔧 Configuration

### Deepseek Endpoint
- **URL**: `http://172.19.224.1:1234/v1`
- **Models**: 
  - `deepseek-coder-v2-lite-instruct` (default)
  - `local/deepseek-coder@q4_k_m`

### Requirements
- LM Studio running with Deepseek model loaded
- Server bound to `0.0.0.0:1234` (not `127.0.0.1`)
- Windows firewall allowing connections

## 🎮 Optimization Pipeline Workflow

**Discovery → Implementation → Validation** - The proven pattern for high-quality results:

### 1. **Discovery Phase** (DeepSeek Analysis)
```
@query_deepseek(
  prompt="Analyze [specific code file] for performance bottlenecks. Focus on:
  - Line-specific issues with exact line numbers
  - Quantified performance impact estimates  
  - Memory allocation patterns
  - Cache efficiency opportunities
  Provide actionable findings, not generic advice.",
  task_type="analysis"
)
```

### 2. **Implementation Phase** (Specialist Handoff)
- DeepSeek provides line-specific findings
- Unity/React/Backend specialist implements changes
- Focus on measurable improvements (0.3-0.4ms reductions)

### 3. **Validation Phase** (DeepSeek Verification)
```
@query_deepseek(
  prompt="Review the implemented optimizations in [code]:
  - Verify changes address identified bottlenecks
  - Estimate performance impact of each change
  - Identify any new issues introduced
  - Suggest ProfilerMarker placement for measurement",
  task_type="debugging"
)
```

### 🎯 Success Patterns
- **Specific Analysis**: Line numbers, exact metrics, concrete findings
- **Quantified Impact**: "0.3ms reduction", "30% fewer allocations"
- **Measurable Results**: ProfilerMarkers, before/after comparisons

## 🔄 Usage Templates

### Performance Analysis Template
```bash
@query_deepseek(
  prompt="Analyze [YourFile.cs] for performance bottlenecks. Focus on:
  - Line-specific issues with exact line numbers
  - Quantified performance impact estimates
  - Memory allocation patterns  
  - Cache efficiency opportunities
  Provide actionable findings, not generic advice.",
  task_type="analysis"
)
```

### Code Review Template
```bash
@query_deepseek(
  prompt="Review [YourController.cs] for potential issues. Focus on:
  - Exact line numbers with null reference risks
  - Resource leak patterns with impact estimates
  - Thread safety concerns with scenarios
  - Error handling completeness gaps
  Provide line-specific findings with risk levels.",
  task_type="analysis"
)
```

### Optimization Validation Template
```bash
@query_deepseek(
  prompt="Review the implemented optimizations in [UpdatedFile.cs]:
  Original issues: [paste DeepSeek findings here]
  
  Verify each optimization addresses the original bottleneck.
  Estimate performance impact of each change.
  Identify any new issues introduced.
  Suggest ProfilerMarker placement for measurement.",
  task_type="debugging"
)
```

### Complex Implementation Template
```bash
@query_deepseek(
  prompt="Implement [specific system] with these requirements:
  [detailed requirements list]
  
  Provide complete, production-ready code with:
  - Error handling and edge cases
  - Performance considerations  
  - Unit test examples
  - Integration patterns",
  task_type="game_dev"
)
```

## 🐛 Troubleshooting

### Connection Issues
1. Verify LM Studio is running
2. Check Deepseek model is loaded
3. Ensure server binding is `0.0.0.0:1234`
4. Test manually: `curl http://172.19.224.1:1234/v1/models`

### MCP Server Issues
1. Check Node.js version (>=18)
2. Run `npm install` to install dependencies
3. Test server: `npm test`
4. Restart Claude Code after configuration changes

## 📁 Project Structure

```
deepseek-mcp-bridge/
├── server.js                              # Main MCP server
├── test-connection.js                      # Connection verification  
├── package.json                           # Dependencies and scripts
├── README.md                              # This file
└── docs/
    ├── optimization-pipeline-template.md  # Reusable Discovery→Implementation→Validation patterns
    └── deepseek-quality-examples.md       # Good vs bad response examples
```

## 📚 Documentation Resources

### [Optimization Pipeline Template](docs/optimization-pipeline-template.md)
Complete reusable workflow for Discovery→Implementation→Validation optimization cycles. Includes:
- Template prompts for each phase
- Code implementation patterns
- Validation metrics and success criteria
- ProfilerMarker integration examples

### [DeepSeek Quality Examples](docs/deepseek-quality-examples.md)  
Learn to identify high-quality vs poor DeepSeek responses. Includes:
- Side-by-side good vs bad examples
- Quality assessment checklists
- Prompt engineering patterns
- Response validation techniques

## 🎯 Success Criteria

- ✅ Connection test passes
- ✅ MCP tools available in Claude Code
- ✅ Unlimited token conversations working
- ✅ Smooth handoff between Claude Code and Deepseek

---

*Built with the Critical Pragmatist Agent approach - fast, working solutions without BS.*