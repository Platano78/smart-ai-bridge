# Branch Strategy

## Branches
- **main**: Production-ready DeepSeek MCP Bridge v6.2.0
- **feature/dual-endpoint-routing**: NVIDIA API integration with local fallback

## Safety Protocol
- All changes in feature branch first
- TDD validation required before merge
- Instant rollback capability maintained
- Zero regression guarantee

## Merge Criteria
- All TDD phases complete (RED→GREEN→REFACTOR→MONITOR)
- Statistical validation >95% success rate
- Existing tools fully functional
- Performance benchmarks met