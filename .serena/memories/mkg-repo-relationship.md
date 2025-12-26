# MKG Repository Relationship

## Two Repositories - Different Purposes

| Repository | Path | GitHub | Purpose |
|------------|------|--------|---------|
| **deepseek-mcp-bridge** | `/home/platano/project/deepseek-mcp-bridge` | Platano78/deepseek-mcp-bridge | Private dev server (bleeding edge) |
| **smart-ai-bridge** | `/home/platano/project/smart-ai-bridge` | Platano78/smart-ai-bridge | Public shareable version |

## Key Differences

### smart-ai-bridge (Public)
- Has comprehensive **security suite** (OWASP, NIST compliance)
- Security tests and validation workflows
- User-configurable backends (users choose their own)
- Clean, documented API for public use
- Proper versioning with tags (v1.3.x)

### deepseek-mcp-bridge (Private Dev)
- Bleeding edge development
- May have experimental features
- Pre-configured for owner's setup
- Testing ground before porting to public

## CRITICAL RULES

1. **NEVER force push deepseek-mcp-bridge content to smart-ai-bridge**
   - This would overwrite the security suite
   - Always port specific fixes, not entire codebase

2. **When porting fixes:**
   - Identify the specific change needed
   - Apply only that change to smart-ai-bridge
   - Run security tests
   - Update version (patch for fixes)
   - Create proper tag

3. **Directory structure differs:**
   - deepseek-mcp-bridge: `src/backends/`, `src/handlers/`
   - smart-ai-bridge: `backends/`, `handlers/` (no src prefix)

## Git Remotes (from deepseek-mcp-bridge)

```
deepseek  -> deepseek-mcp-bridge.git (private dev)
origin    -> smart-ai-bridge.git (public)
```

## Architecture Philosophy

### deepseek-mcp-bridge (Private Dev)
- Owner's personal setup with pre-configured backends (NVIDIA, Groq, local LLMs)
- Testing ground for new features (MiniMax, WebUI, configuration system)
- Hardcoded for owner's specific infrastructure

### smart-ai-bridge (Public)
- **Blank canvas** - users bring their own API keys and backends
- WebUI + configuration system lets users add whatever backends they want
- No assumptions about what services users have access to
- Truly self-service: spin up and configure own stack without touching code

### Porting Strategy
- Develop and stabilize features in deepseek-mcp-bridge first
- Port the generic/configurable version to smart-ai-bridge
- WebUI/config work will be ported once stable, enabling users to set up any backend combination

## Version History

- v1.3.0: Backend Adapters, Learning Engine, Subagent System
- v1.3.1: Make subagent backends user-configurable
- v1.3.2: Fix reasoning_content parsing for reasoning models