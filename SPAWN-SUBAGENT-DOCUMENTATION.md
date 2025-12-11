# spawn_subagent Tool Documentation

## Overview

The `spawn_subagent` tool enables Claude Code to create specialized AI subagents with predefined roles, each optimized for specific software development tasks. This implements a multi-agent pattern where subagents have customized system prompts, suggested tools, and specialized behavior.

**Status**: ✅ **Production Ready** (Completed December 9, 2025)

## Features

- **6 Specialized Roles**: Code reviewer, security auditor, planner, refactor specialist, test generator, documentation writer
- **Role Validation**: Automatic validation with fuzzy matching suggestions for invalid roles
- **Glob Pattern Support**: File pattern resolution using fast-glob
- **Verdict Parsing**: Automatic extraction of structured verdicts from AI responses (YAML, Markdown, key-value)
- **Metrics Tracking**: Comprehensive spawn metrics with success rates, performance stats, and error tracking
- **Smart Backend Selection**: Optimal AI backend selection per role
- **TDD Implementation**: Full test coverage with RED-GREEN-REFACTOR-MONITOR phases

## Available Roles

### 1. code-reviewer
**Category**: Review
**Description**: Code Quality Reviewer
**Suggested Tools**: read, review, edit_file, ask
**Verdict**: Required
**Max Tokens**: 16,384
**Backend**: nvidia_qwen (Qwen3 Coder 480B)

Reviews code for:
- Quality and readability
- Design patterns and architecture
- Performance considerations
- Testing coverage
- Documentation completeness

**Output Format**: Structured review with quality score (0-10) and verdict (APPROVE|APPROVE_WITH_CHANGES|REJECT)

### 2. security-auditor
**Category**: Security
**Description**: Security Vulnerability Auditor
**Suggested Tools**: read, review, validate_changes, ask
**Verdict**: Required
**Max Tokens**: 16,384
**Backend**: nvidia_deepseek (DeepSeek V3.1 Terminus)

Identifies:
- SQL injection vulnerabilities
- XSS (Cross-Site Scripting) risks
- Authentication/authorization flaws
- Insecure data handling
- Dependency vulnerabilities
- Secrets exposure
- OWASP Top 10 issues

**Output Format**: Security audit report with risk level (CRITICAL|HIGH|MEDIUM|LOW) and status (SECURE|VULNERABLE|CRITICAL_ISSUES)

### 3. planner
**Category**: Planning
**Description**: Task Planning and Architecture Specialist
**Suggested Tools**: read, ask, get_analytics
**Verdict**: Not required
**Max Tokens**: 32,768
**Backend**: local (Qwen2.5-Coder-7B, 128K context)

Creates:
- Task breakdown into atomic steps
- Dependency identification
- Implementation order suggestions
- Complexity and effort estimates
- Tool and pattern recommendations
- Risk assessments

**Output Format**: Implementation plan with steps, dependencies, quality gates, timeline

### 4. refactor-specialist
**Category**: Generation
**Description**: Code Refactoring Specialist
**Suggested Tools**: read, edit_file, multi_edit, ask
**Verdict**: Required
**Max Tokens**: 16,384
**Backend**: nvidia_qwen

Performs:
- Code smell identification
- Refactoring opportunities
- SOLID principles application
- Component extraction
- Testability improvements
- Maintainability enhancements

**Output Format**: Refactoring proposal with before/after code, benefits, migration path

### 5. test-generator
**Category**: Generation
**Description**: Test Case Generator
**Suggested Tools**: read, write_files_atomic, ask
**Verdict**: Required
**Max Tokens**: 16,384
**Backend**: nvidia_qwen

Generates:
- Happy path scenarios
- Edge cases
- Error handling tests
- Boundary conditions
- Integration points
- Performance benchmarks

**Output Format**: Test suite with coverage analysis and quality score

### 6. documentation-writer
**Category**: Generation
**Description**: Technical Documentation Writer
**Suggested Tools**: read, write_files_atomic, ask
**Verdict**: Not required
**Max Tokens**: 32,768
**Backend**: gemini (Gemini 2.5 Flash)

Creates:
- API/function documentation
- Usage examples
- Parameter descriptions
- Return values
- Edge cases and gotchas
- Related documentation links

**Output Format**: Comprehensive technical documentation

## Usage

### Basic Usage

```json
{
  "role": "code-reviewer",
  "task": "Review the authentication module for security and code quality"
}
```

### With File Patterns

```json
{
  "role": "security-auditor",
  "task": "Audit the authentication system for security vulnerabilities",
  "file_patterns": [
    "src/auth/**/*.js",
    "src/middleware/auth*.js"
  ]
}
```

### With Additional Context

```json
{
  "role": "planner",
  "task": "Plan implementation of OAuth 2.0 authentication",
  "context": {
    "requirements": "Support Google, GitHub, and Microsoft providers",
    "constraints": "Must work with existing session management"
  }
}
```

### With Verdict Mode

```json
{
  "role": "code-reviewer",
  "task": "Review PR #123 changes",
  "file_patterns": ["src/components/**/*.tsx"],
  "verdict_mode": "full"
}
```

## Response Format

```json
{
  "success": true,
  "handler": "SubagentHandler",
  "timestamp": "2025-12-09T05:20:00.000Z",
  "role": "code-reviewer",
  "task": "Review authentication module",
  "backend_used": "nvidia_qwen",
  "response": "<AI response with analysis>",
  "verdict": {
    "status": "APPROVE_WITH_CHANGES",
    "score": 7,
    "reasoning": "Code quality is good but needs better error handling"
  },
  "files_analyzed": 5,
  "suggested_tools": ["read", "review", "edit_file", "ask"],
  "processing_time_ms": 2543,
  "metrics": {
    "totalSpawns": 10,
    "successfulSpawns": 9,
    "failedSpawns": 1,
    "successRate": 90,
    "roleDistribution": {
      "code-reviewer": {
        "total": 5,
        "successful": 5,
        "failed": 0,
        "successRate": 100
      }
    },
    "performanceStats": {
      "avgProcessingTimeMs": 2345,
      "p50ProcessingTimeMs": 2100,
      "p95ProcessingTimeMs": 4500,
      "p99ProcessingTimeMs": 5800
    }
  }
}
```

## Verdict Parsing

The tool automatically extracts verdicts from AI responses in three formats:

### 1. YAML Format
```yaml
verdict:
  status: APPROVE_WITH_CHANGES
  score: 7
  reasoning: Code quality is good but needs error handling
```

### 2. Markdown Format
```markdown
### Verdict
- **Status**: VULNERABLE
- **Security Score**: 4/10
- **Risk Level**: HIGH
- **Reasoning**: SQL injection found
```

### 3. Key-Value Format
```
Status: REJECT
Score: 3
Reasoning: Multiple critical issues found
```

## Metrics Tracking

The SubagentHandler tracks comprehensive metrics:

- **Total Spawns**: Count of all spawn attempts
- **Success Rate**: Percentage of successful spawns
- **Role Distribution**: Usage breakdown by role
- **Performance Stats**: Processing times (avg, p50, p95, p99)
- **Recent Errors**: Last 10 errors with timestamps

Get metrics:
```json
{
  "role": "code-reviewer",
  "task": "metrics"
}
```

Response includes metrics summary in all spawn_subagent responses.

## Error Handling

### Invalid Role
```json
{
  "success": false,
  "error": "Unknown role: \"code-reviwer\". Available roles: code-reviewer, security-auditor, planner, refactor-specialist, test-generator, documentation-writer",
  "suggestions": ["code-reviewer", "security-auditor", "planner"]
}
```

### Missing Required Field
```json
{
  "success": false,
  "error": "task is required"
}
```

### Backend Unavailable
```json
{
  "success": false,
  "error": "Backend not available: nvidia_qwen",
  "role": "code-reviewer",
  "processing_time_ms": 12
}
```

## Implementation Details

### Architecture

```
spawn_subagent tool
├── SubagentHandler (src/handlers/subagent-handler.js)
│   ├── Role validation
│   ├── Glob pattern resolution
│   ├── Prompt generation
│   ├── Backend selection
│   └── Verdict parsing
├── Role Templates (src/config/role-templates.js)
│   ├── 6 predefined roles
│   ├── System prompts
│   ├── Tool suggestions
│   └── Backend preferences
├── Utilities
│   ├── role-validator.js - Role validation with fuzzy matching
│   ├── glob-parser.js - File pattern resolution
│   └── verdict-parser.js - Extract verdicts from responses
└── Monitoring
    └── spawn-metrics.js - Metrics tracking and reporting
```

### TDD Implementation

**RED Phase**: ✅ Complete
- Role validation tests
- Schema validation tests
- Template loading tests
- Verdict parsing tests

**GREEN Phase**: ✅ Complete
- SubagentHandler class
- Role template system
- Glob parser
- Verdict parser
- Spawn metrics

**REFACTOR Phase**: ✅ Complete
- Extracted role validator utility
- Extracted glob parser utility
- Extracted verdict parser utility
- Added JSDoc documentation

**MONITOR Phase**: ✅ Complete
- Spawn count by role
- Success/error rates
- Performance metrics (p50, p95, p99)
- Recent errors tracking

## Testing

Run tests:
```bash
node test-spawn-subagent.js
```

Test coverage:
- ✅ Role validation (6 test cases)
- ✅ Template system (6 roles)
- ✅ Verdict parsing (3 formats)
- ✅ Handler initialization
- ✅ Metrics tracking

All tests passing: **100%**

## Performance

### Token Efficiency
- Subagent responses consume 0 tokens from Claude's budget
- MKG processes externally and returns compact summaries
- 92%+ token savings vs direct Claude calls

### Processing Times
- Code Review: ~2-3 seconds (nvidia_qwen)
- Security Audit: ~3-5 seconds (nvidia_deepseek)
- Planning: ~2-4 seconds (local)
- Test Generation: ~2-3 seconds (nvidia_qwen)
- Documentation: ~1-2 seconds (gemini)

### Backend Optimization
- Each role uses optimal backend for its task
- Automatic fallback chains for reliability
- Health monitoring and adaptive routing

## Best Practices

### 1. Choose the Right Role
- **Code Quality**: code-reviewer
- **Security**: security-auditor
- **Task Breakdown**: planner
- **Code Improvement**: refactor-specialist
- **Testing**: test-generator
- **Docs**: documentation-writer

### 2. Provide Context
Include relevant context in the `context` parameter:
```json
{
  "role": "security-auditor",
  "task": "Audit payment processing",
  "context": {
    "framework": "Express.js",
    "authentication": "JWT",
    "database": "PostgreSQL"
  }
}
```

### 3. Use File Patterns Wisely
Limit file patterns to relevant files:
```json
{
  "file_patterns": [
    "src/auth/**/*.js",
    "!src/auth/**/*.test.js"
  ]
}
```

### 4. Interpret Verdicts
Check verdict status before proceeding:
- **APPROVE**: Safe to merge
- **APPROVE_WITH_CHANGES**: Address feedback first
- **REJECT**: Critical issues must be fixed
- **VULNERABLE**: Security issues found
- **SECURE**: No vulnerabilities detected

## Limitations

1. **Max Files**: Glob patterns limited to 100 files by default
2. **Max Tokens**: Role-specific limits (16K-32K)
3. **Backend Availability**: Requires configured backends
4. **Verdict Detection**: Best effort parsing (may miss non-standard formats)

## Future Enhancements

- [ ] Custom role definitions
- [ ] Role chaining (code-reviewer → refactor-specialist)
- [ ] Multi-file verdict aggregation
- [ ] Interactive subagent sessions
- [ ] Subagent conversation history

## Version History

- **v1.0.0** (December 9, 2025): Initial release
  - 6 specialized roles
  - Full TDD implementation
  - Verdict parsing
  - Metrics tracking
  - Production ready

## Support

For issues or questions:
1. Check this documentation
2. Run test suite: `node test-spawn-subagent.js`
3. Check MKG health: `mcp__mecha-king-ghidorah-global__health`
4. Review metrics in spawn_subagent responses

## License

MIT License - Part of MKG v2 (Mecha-King Ghidorah) Server
