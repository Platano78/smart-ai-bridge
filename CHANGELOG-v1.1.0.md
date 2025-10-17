# Changelog - Smart AI Bridge v1.1.0

## [1.1.0] - 2025-10-16

### Added

#### LocalServiceDetector
- Auto-discovery of local AI services (vLLM, LM Studio, Ollama, Text-Generation-WebUI)
- WSL IP detection with 3 fallback strategies
- 5-minute intelligent caching with manual invalidation
- Parallel endpoint testing (<6 seconds for 28 candidates)
- New MCP tool: `discover_local_services`

#### ConversationThreading
- Multi-turn conversation management with thread IDs
- Thread creation, continuation, and resume capabilities
- Full-text search across conversations
- Conversation analytics and history tracking
- New MCP tool: `manage_conversation`

#### UsageAnalytics
- Session statistics and backend performance metrics
- Cost analysis and optimization recommendations
- Historical analytics with time ranges (1h, 24h, 7d, 30d)
- JSON and Markdown export formats
- New MCP tool: `get_analytics`

#### Dashboard Server (Optional)
- Real-time web-based monitoring interface
- WebSocket updates for live metrics
- Backend management capabilities
- Default: DISABLED (opt-in via ENABLE_DASHBOARD=true)

### Changed
- Main entry point updated to `smart-ai-bridge-v1.1.0.js`
- Package description updated to include new features
- Added version-specific npm scripts

### Environment Variables (New)
```bash
LOCAL_AI_DISCOVERY_ENABLED=true           # Default: true
LOCAL_AI_DISCOVERY_CACHE_TTL=300000       # 5 minutes
ENABLE_DASHBOARD=false                     # Default: false
DASHBOARD_PORT=3456                        # Default: 3456
```

### Backward Compatibility
- 100% compatible with v1.0.0
- All existing tools and APIs unchanged
- Legacy v1.0.0 server available via `npm run start:v1.0.0`

---

## [1.0.0] - 2025-09-30

Initial production release of Smart AI Bridge with multi-backend orchestration, intelligent routing, and fuzzy matching capabilities.
