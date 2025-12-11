# MKG Complete Feature Registry & Historical Record

**Project**: Mecha-King-Ghidorah (MKG) MCP Server  
**Original Name**: deepseek-mcp-bridge  
**Current Version**: V2 (v8.3.0+)  
**Last Updated**: December 9, 2025  
**Status**: PRODUCTION READY

---

## 🔖 Project Naming Evolution

### Historical Timeline
1. **deepseek-mcp-bridge** (Original name)
   - Focus: DeepSeek API integration via MCP
   - Single-purpose bridge to DeepSeek models
   
2. **Mecha-King-Ghidorah (MKG)** (Current name)
   - Evolved into multi-backend AI orchestration system
   - Named after the three-headed dragon from Godzilla
   - Represents the three core capabilities: Routing, Learning, Execution

### Why the Name Change?
- Original scope: Bridge to DeepSeek API
- Evolved scope: Universal AI backend orchestrator with learning
- MKG reflects the multi-headed (multi-backend) nature

---

## 📚 Complete Feature Inventory

### Core Architecture Components

#### 1. **Backend Adapters System** (6 backends)
**Location**: `src/backends/`

| Backend | Adapter File | Purpose | Key Features |
|---------|-------------|---------|--------------|
| **local** | `local-adapter.js` | Local Qwen2.5-Coder-7B via vLLM | Auto-discovery, 128K+ context |
| **gemini** | `gemini-adapter.js` | Google Gemini via gemini-enhanced MCP | Free tier, multi-modal |
| **nvidia_deepseek** | `nvidia-adapter.js` | NVIDIA DeepSeek V3.1 Terminus | Streaming, thinking mode, 8K tokens |
| **nvidia_qwen** | `nvidia-adapter.js` | NVIDIA Qwen3 Coder 480B | 32K context, code-specialized |
| **openai** | `openai-adapter.js` | OpenAI GPT-4.1 | 128K context, premium quality |
| **groq** | `groq-adapter.js` | Groq Llama 3.3 70B | Ultra-fast (500+ t/s) |

**Common Interface** (`backend-adapter.js`):
- `call(prompt, options)` - Unified API call
- `getHealth()` - Backend health check
- `getCapabilities()` - Feature detection
- `getMetrics()` - Usage statistics

**Registry** (`backend-registry.js`):
- Dynamic backend registration
- Health monitoring
- Capability negotiation
- Fallback chain management

#### 2. **Smart Routing System** (5-priority decision flow)

**Core Files**:
- `src/intelligence/compound-learning.js` - Learning engine
- `src/intelligence/playbook-system.js` - Reflection system
- `src/clients/orchestrator-client.js` - Orchestrator-8B integration

**Routing Priority**:
```
1. force_backend parameter → Direct override (confidence: 1.0)
2. Compound Learning → Learned patterns (confidence: >0.8)
3. Orchestrator-8B → AI-powered routing (confidence: varies)
4. Rule-based Router → Heuristic fallback (confidence: 0.6-0.8)
5. Health-based Router → Last resort (confidence: 0.3-0.5)
```

**Routing Metadata** (7 fields):
```json
{
  "source": "forced|compound_learning|orchestrator|rules|health",
  "decision": "backend_name",
  "confidence": 0.0-1.0,
  "orchestrator_healthy": true|false,
  "complexity": "0.0-1.0",
  "task_type": "analysis|coding|refactoring|...",
  "reasoning": "Human-readable explanation"
}
```

#### 3. **Compound Learning Engine** (V2 enhancement)

**Location**: `src/intelligence/compound-learning.js`  
**Storage**: `data/learning/learning-state.json` (31KB)

**What It Learns**:
```javascript
{
  toolMetrics: {
    // Per-backend confidence scores
    "local_qwen_coder": {
      confidence: 0.86,
      totalCalls: 20,
      successfulCalls: 17,
      byComplexity: {...},
      byTaskType: {...}
    }
  },
  taskPatterns: {
    // Pattern-to-backend mappings
    "high:analysis:single": {
      toolPerformance: {
        "nvidia_qwen480b": { calls: 8, successSum: 2.4 }
      }
    }
  },
  sourceMetrics: {
    // Confidence by routing source
    "orchestrator": { calls: 14, confidence: 0.825 }
  },
  routingHistory: [
    // Full decision history with timestamps
  ]
}
```

**V1 → V2 Migration**:
- ✅ 29 V1 patterns migrated from AdaptiveRouter
- ✅ Learning state preserved across upgrades
- ✅ Backward compatible with V1 data

#### 4. **Playbook Reflection System** (Self-improvement)

**Location**: `src/intelligence/playbook-system.js`

**Features**:
- Post-execution reflection
- Pattern extraction from successful/failed runs
- Confidence adjustment over time
- Lesson learning from errors

**Reflection Triggers**:
- Execution time > threshold
- Execution errors
- Unexpected results
- Performance anomalies

#### 5. **Tool Handlers System** (8 core handlers)

**Location**: `src/handlers/`

| Handler | File | Purpose | Routes to Backend? |
|---------|------|---------|-------------------|
| **ask** | `ask-handler.js` | Multi-AI queries | ✅ Yes |
| **spawn_subagent** | `subagent-handler.js` | Specialized subagents | ✅ Yes (via ask) |
| **read** | `read-handler.js` | File reading | ❌ No (local) |
| **write_files_atomic** | `file-handlers.js` | Atomic file writes | ❌ No (local) |
| **edit_file** | `file-handlers.js` | Single file edits | ⚠️ Optional (fuzzy matching) |
| **multi_edit** | `file-handlers.js` | Batch edits | ⚠️ Optional (AI validation) |
| **review** | `review-handler.js` | Code review | ✅ Yes |
| **health** | `system-handlers.js` | System health | ❌ No (local) |

**Handler Inheritance**:
```
BaseHandler (base-handler.js)
├── AskHandler
├── SubagentHandler
├── ReadHandler
├── FileHandler
├── ReviewHandler
└── SystemHandler
```

#### 6. **spawn_subagent System** (6 specialized roles)

**Location**: `src/handlers/subagent-handler.js`  
**Role Templates**: `src/config/role-templates.js`

**Roles**:
```javascript
{
  'code-reviewer': {
    systemPrompt: 'Expert code reviewer focusing on...',
    temperature: 0.3,
    preferredBackends: ['nvidia_deepseek', 'nvidia_qwen']
  },
  'security-auditor': {
    systemPrompt: 'Security expert identifying vulnerabilities...',
    temperature: 0.2,
    preferredBackends: ['nvidia_deepseek', 'openai']
  },
  'planner': {
    systemPrompt: 'Task decomposition and planning expert...',
    temperature: 0.5,
    preferredBackends: ['nvidia_qwen', 'nvidia_deepseek']
  },
  'refactor-specialist': {
    systemPrompt: 'Code refactoring and optimization expert...',
    temperature: 0.4,
    preferredBackends: ['nvidia_deepseek', 'local']
  },
  'test-generator': {
    systemPrompt: 'Test case generation expert...',
    temperature: 0.3,
    preferredBackends: ['nvidia_deepseek', 'local']
  },
  'documentation-writer': {
    systemPrompt: 'Technical documentation expert...',
    temperature: 0.4,
    preferredBackends: ['openai', 'gemini']
  }
}
```

**Verdict Parser** (`src/utils/verdict-parser.js`):
- Extracts structured data from subagent responses
- Modes: summary (key fields only) vs full (complete data)

**Metrics Tracking** (`src/monitoring/spawn-metrics.js`):
- Per-role success rates
- Processing times (avg, min, max, p50, p95, p99)
- Error tracking
- Role distribution

#### 7. **File Operations with AI Enhancement**

**Fuzzy Matching System**:
- Pre-flight validation before edits
- Finds similar text when exact match fails
- Configurable similarity threshold (0.1-1.0)
- Provides suggestions with match scores

**Location**: `src/handlers/file-handlers.js`

**Features**:
```javascript
// edit_file with fuzzy matching
{
  fuzzy_threshold: 0.8,
  suggest_alternatives: true,
  max_suggestions: 3,
  verification_mode: 'comprehensive'
}

// multi_edit with atomic transactions
{
  transaction_mode: 'all_or_nothing',
  validation_level: 'strict',
  parallel_processing: true
}
```

#### 8. **Health Monitoring System**

**Location**: `src/monitoring/health-monitor.js`

**Monitors**:
- Backend availability (local, cloud APIs)
- Response times per backend
- Error rates and patterns
- Resource usage (if available)
- Orchestrator connectivity

**Health Check Modes**:
- Quick ping (3s timeout) for cloud APIs
- Full inference test (10s timeout) for local
- Smart differentiated monitoring

#### 9. **Tool Alias System** (Multi-naming support)

**Location**: `src/tools/smart-alias-resolver.js`  
**Definitions**: `src/tools/tool-definitions.js`

**Alias Categories**:
```javascript
// MKG-branded aliases
MKG_health → health
MKG_analyze → read
MKG_generate → ask
MKG_edit → edit_file

// DeepSeek-branded aliases (historical)
deepseek_analyze → read
deepseek_edit → edit_file
deepseek_health → health

// Analysis aliases
analyze_files → read
analyze_file_with_triple_routing → read

// Generation aliases
generate_code → ask
generate_docs → ask
```

**Purpose**:
- Backward compatibility with old tool names
- Multi-branding support
- User-friendly naming conventions

#### 10. **Analytics System**

**Location**: `src/handlers/system-handlers.js`

**Metrics Collected**:
```json
{
  "current": {
    "sessionStartTime": "timestamp",
    "totalRequests": 123,
    "byTool": {...},
    "byBackend": {...},
    "errors": [...]
  },
  "performance": {
    "avgResponseTime": 450,
    "p50": 320,
    "p95": 890,
    "p99": 1250
  },
  "cost": {
    "byBackend": {...},
    "totalEstimated": "$X.XX"
  }
}
```

**Report Formats**:
- JSON (machine-readable)
- Markdown (human-readable)

---

## 🏗️ Architecture Evolution

### V1 (deepseek-mcp-bridge era)

**Focus**: Single-purpose DeepSeek API bridge

**Key Features**:
- AdaptiveRouter learning system
- Basic backend fallback
- Simple tool set (ask, analyze, generate)
- Learning stored in `data/test_adaptive_routing/`

**Routing**: 3-level
1. Health check
2. Heuristics
3. Last successful backend

### V2 (Current MKG)

**Focus**: Universal AI orchestration with learning

**Key Features**:
- ✅ 6 backend adapters (local, gemini, nvidia×2, openai, groq)
- ✅ 5-priority routing system
- ✅ Compound learning (extends V1's AdaptiveRouter)
- ✅ Orchestrator-8B integration
- ✅ Playbook reflection system
- ✅ spawn_subagent with 6 roles
- ✅ Fuzzy matching validation
- ✅ Health monitoring
- ✅ Analytics and metrics
- ✅ Tool aliases
- ✅ Modular handler architecture

**Routing**: 5-priority with AI
1. Force backend override
2. Compound learning recommendations
3. Orchestrator-8B AI routing
4. Rule-based heuristics
5. Health-based fallback

**V1 → V2 Migration**:
- ✅ 29 learned patterns preserved
- ✅ Learning state imported
- ✅ Backward compatible
- ✅ Enhanced with new capabilities

### v8.0.0 Release

**Major Features Added**:
- NVIDIA Cloud API integration
- Multi-backend routing
- Tool aliases
- Enhanced error handling
- Performance optimization

### v8.3.0 Release

**Major Features Added**:
- Dynamic token scaling
- Smart AI Bridge extraction
- Security audit (100% pass)
- Modular architecture
- GitHub release preparation

---

## 📂 File Structure

```
deepseek-mcp-bridge/
├── server-mkg-v2.js              # Main MCP server (V2)
├── src/
│   ├── backends/
│   │   ├── backend-adapter.js    # Base adapter interface
│   │   ├── backend-registry.js   # Backend management
│   │   ├── local-adapter.js      # Local Qwen adapter
│   │   ├── gemini-adapter.js     # Gemini adapter
│   │   ├── nvidia-adapter.js     # NVIDIA adapters
│   │   ├── openai-adapter.js     # OpenAI adapter
│   │   └── groq-adapter.js       # Groq adapter
│   ├── clients/
│   │   └── orchestrator-client.js # Orchestrator-8B client
│   ├── config/
│   │   ├── backends.json         # Backend configurations
│   │   └── role-templates.js     # Subagent role definitions
│   ├── handlers/
│   │   ├── base-handler.js       # Base handler class
│   │   ├── ask-handler.js        # AI query handler
│   │   ├── subagent-handler.js   # Subagent spawner
│   │   ├── read-handler.js       # File reading
│   │   ├── file-handlers.js      # File operations
│   │   ├── review-handler.js     # Code review
│   │   ├── system-handlers.js    # System tools
│   │   └── index.js              # Handler registry
│   ├── intelligence/
│   │   ├── compound-learning.js  # Learning engine
│   │   └── playbook-system.js    # Reflection system
│   ├── monitoring/
│   │   ├── health-monitor.js     # Health monitoring
│   │   └── spawn-metrics.js      # Subagent metrics
│   ├── tools/
│   │   ├── tool-definitions.js   # MCP tool schemas
│   │   └── smart-alias-resolver.js # Tool aliasing
│   └── utils/
│       ├── glob-parser.js        # File pattern parsing
│       ├── verdict-parser.js     # Subagent response parsing
│       └── local-service-detector.js # Local backend discovery
├── data/
│   └── learning/
│       ├── learning-state.json   # Persistent learning (31KB)
│       └── learning-state.backup.*.json # Backups
├── scripts/
│   ├── migrate-adaptive-to-compound.js # V1→V2 migration
│   └── test-*.js                 # Integration tests
└── docs/
    ├── MKG-*.md                  # Feature documentation
    ├── HANDOFF-*.md              # Handoff guides
    └── *-COMPLETE.md             # Completion reports
```

---

## 🔑 Key Implementation Patterns

### 1. Backend Adapter Pattern
All backends implement unified interface:
```javascript
class BackendAdapter {
  async call(prompt, options) { }
  async getHealth() { }
  getCapabilities() { }
  getMetrics() { }
}
```

### 2. Handler Pattern
All tools extend BaseHandler:
```javascript
class SpecificHandler extends BaseHandler {
  async execute(args) {
    // Validation
    // Processing
    // Backend routing (if needed)
    // Response formatting
  }
}
```

### 3. Learning Pattern
Compound learning tracks:
- Tool success rates
- Task pattern mappings
- Routing decision history
- Confidence scores

### 4. Graceful Degradation
Every routing decision has fallback:
```
force_backend → compound_learning → orchestrator → rules → health
```

---

## 📊 Metrics & Performance

### Learning State Size
- **Current**: 31KB
- **Patterns**: 15 unique task patterns
- **History**: 60+ routing decisions
- **Backends**: 2 active (local_qwen_coder, local) + 29 migrated

### Response Times
- **Local backend**: ~45ms average
- **Cloud APIs**: ~100ms average (with pooling)
- **Orchestrator-8B**: <50ms routing decision

### Success Rates (from learning state)
- `local_qwen_coder`: 86% confidence (20 calls, 17 successful)
- Code generation (low complexity): 90% success
- Testing tasks: 83% success
- Analysis tasks: 60-90% (varies by complexity)

---

## 🔄 Version History

| Version | Date | Major Changes |
|---------|------|---------------|
| deepseek-mcp-bridge V1 | 2025-09 | Initial release, AdaptiveRouter |
| MKG v8.0.0 | 2025-10 | Multi-backend, NVIDIA integration |
| MKG v8.3.0 | 2025-11 | Dynamic tokens, security audit |
| MKG V2 | 2025-12 | Modular architecture, compound learning |

---

## 🚀 Future Roadmap

### V2.1 Enhancements (Proposed)
1. **Tool-aware routing** - Route spawn_subagent roles to specialized backends
2. **Cost optimization** - Factor in API costs when routing
3. **Speed optimization** - Route quick queries to fast backends (Groq)
4. **Caching layer** - Reduce repeated API calls
5. **Offline mode** - Work without network for file operations
6. **Extended learning** - Learn from tool type + role combinations

### Known Limitations
- All AI tools share same backend pool (no tool-specific routing)
- spawn_subagent doesn't route by role
- No cost-based routing decisions
- No speed-based routing (fast vs thorough)

---

## 📖 Critical Knowledge Preservation

### Where Knowledge Lives
1. **Development Context MCP** - Decisions and breakthroughs
2. **This Document** - Comprehensive feature registry
3. **Serena Memory** - Project-specific patterns
4. **Git History** - Implementation evolution
5. **Inline Documentation** - Code-level details

### Recovery Plan
If knowledge is lost:
1. Check `MKG-COMPLETE-FEATURE-REGISTRY.md` (this file)
2. Query development-context-mcp: "MKG features"
3. Read Serena memory: "MKG architecture"
4. Search Agent Genesis: "mkg implementation"
5. Review git log: `git log --grep="MKG\|mecha-king-ghidorah"`

---

## ✅ Production Readiness

### Deployment Checklist
- ✅ V1 learning state migrated (29 patterns)
- ✅ All 6 backends operational
- ✅ 5-priority routing verified
- ✅ spawn_subagent 6 roles tested
- ✅ Integration tests passing (5/5)
- ✅ Health monitoring active
- ✅ Analytics tracking enabled
- ✅ Documentation complete
- ✅ Backward compatibility maintained

### Status: PRODUCTION READY ✅

---

**Last Updated**: December 9, 2025  
**Maintained By**: Development Team  
**Critical**: Do NOT delete or lose this file
**Backup Locations**: 
- dev-context-mcp (decision ID: d160f915-3895-44b8-8267-6c35b12d7c80)
- git repository
- Serena memory system
