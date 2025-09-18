# Branch Strategy

## Branches
- **main**: Production-ready DeepSeek MCP Bridge v7.0.0 hybrid server foundation
- **feature/dual-endpoint-routing**: NVIDIA API integration with local fallback
- **feature/file-modification**: File modification capabilities for MKG server (write_file, edit_file, multi_edit, backup_restore, validate_changes)

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