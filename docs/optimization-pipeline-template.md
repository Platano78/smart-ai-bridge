# Optimization Pipeline Template

**Discovery → Implementation → Validation** - Reusable patterns for consistent high-quality optimization results.

## 🎯 Overview

This template captures the proven workflow patterns from successful optimizations, focusing on specific analysis, quantified improvements, and measurable validation.

## Phase 1: Discovery (DeepSeek Analysis)

### Template Prompts

#### Performance Analysis
```
@query_deepseek(
  prompt="Analyze [SPECIFIC_FILE_PATH] for performance bottlenecks. Focus on:
  
  SPECIFIC REQUIREMENTS:
  - Identify exact line numbers with issues
  - Quantify performance impact (milliseconds, allocations, cache misses)
  - Analyze memory allocation patterns  
  - Identify cache efficiency opportunities
  - Look for redundant computations
  - Check for unnecessary object instantiations
  
  RESPONSE FORMAT:
  - Line X: [specific issue] - Impact: [quantified estimate]
  - Line Y: [specific issue] - Impact: [quantified estimate]
  
  Provide actionable, line-specific findings. No generic advice.",
  task_type="analysis",
  context="Performance optimization for [SYSTEM_TYPE]"
)
```

#### Code Quality Analysis
```
@query_deepseek(
  prompt="Review [SPECIFIC_FILE_PATH] for code quality issues. Focus on:
  
  SPECIFIC REQUIREMENTS:
  - Identify exact line numbers with problems
  - Flag potential null reference exceptions
  - Check for resource leak patterns
  - Analyze error handling completeness
  - Validate thread safety concerns
  
  RESPONSE FORMAT:
  - Line X: [specific issue] - Risk level: [High/Medium/Low]
  - Line Y: [specific issue] - Risk level: [High/Medium/Low]
  
  Provide concrete, actionable findings with line numbers.",
  task_type="analysis"
)
```

### Expected Discovery Output Quality

#### ✅ GOOD Discovery Response
- `Line 259: GetComponent<Rigidbody2D>() called in Update() - Impact: 0.3-0.4ms per frame`
- `Line 266: Vector2 instantiation in hot path - Impact: 24 bytes allocation per call`
- `Line 279: Redundant distance calculation - Impact: 0.1ms per enemy`

#### ❌ BAD Discovery Response
- "The code could be optimized"
- "Consider caching components"
- "Performance might be improved"

## Phase 2: Implementation (Specialist Handoff)

### Handoff Checklist

#### From DeepSeek Discovery to Implementation
1. **Findings Summary**: Line-specific issues with quantified impact
2. **Priority Ranking**: High-impact changes first (>0.2ms improvements)
3. **Implementation Strategy**: Specific technical approach per finding
4. **Measurement Plan**: ProfilerMarkers for validation

#### Implementation Guidelines
- Address findings in impact-priority order
- Implement one optimization at a time
- Add ProfilerMarkers around optimized sections
- Document expected performance gains

### Code Implementation Pattern
```csharp
// BEFORE (DeepSeek identified issue)
void Update() {
    var rb = GetComponent<Rigidbody2D>(); // Line 259 - 0.3ms impact
    // ...
}

// AFTER (Optimized implementation)
private Rigidbody2D cachedRigidbody; // Cache at start

void Start() {
    cachedRigidbody = GetComponent<Rigidbody2D>();
}

void Update() {
    using (Profiling.BeginSample("OptimizedMovement")) {
        // Use cachedRigidbody - Expected: 0.3ms reduction
    }
}
```

## Phase 3: Validation (DeepSeek Verification)

### Template Prompts

#### Optimization Review
```
@query_deepseek(
  prompt="Review the implemented optimizations in [UPDATED_CODE]:
  
  Original issues identified:
  [PASTE_ORIGINAL_FINDINGS]
  
  VERIFICATION REQUIREMENTS:
  - Check each optimized line addresses the original bottleneck
  - Estimate performance impact of each change
  - Identify any new issues introduced by changes
  - Verify ProfilerMarker placement for measurement
  - Flag any optimization opportunities missed
  
  RESPONSE FORMAT:
  ✅ Line X optimization: [verification] - Expected impact: [estimate]
  ⚠️ Line Y concern: [new issue] - Impact: [estimate]
  
  Focus on measurable validation.",
  task_type="debugging"
)
```

### Validation Metrics

#### Performance Validation
- ProfilerMarker measurements: Before vs After
- Frame time improvements: Quantified millisecond reductions  
- Memory allocation reduction: Bytes per frame
- Cache hit rate improvements: Percentage gains

#### Quality Validation
- No new bugs introduced
- Original functionality preserved
- Error handling maintained
- Thread safety preserved

## 🎯 Success Criteria

### Discovery Phase Success
- [ ] Line-specific findings with exact numbers
- [ ] Quantified performance impact estimates
- [ ] Actionable technical recommendations
- [ ] No generic advice or platitudes

### Implementation Phase Success  
- [ ] All high-impact findings addressed
- [ ] ProfilerMarkers added for measurement
- [ ] One optimization per commit/change
- [ ] Expected gains documented

### Validation Phase Success
- [ ] Measured performance improvements match estimates
- [ ] No new issues introduced
- [ ] Original functionality preserved
- [ ] Additional optimization opportunities identified

## 🔄 Workflow Integration

### Tool Chain
1. **DeepSeek**: Discovery analysis and validation review
2. **Claude Code**: Project coordination and documentation
3. **Unity/VS Code**: Implementation with profiling tools
4. **Git**: Track optimization commits with measured results

### Measurement Integration
```csharp
// ProfilerMarker template for validation
private static readonly ProfilerMarker s_OptimizationMarker = 
    new ProfilerMarker("OptimizationName");

void OptimizedMethod() {
    using (s_OptimizationMarker.Auto()) {
        // Optimized code here
        // Expected improvement: 0.3ms reduction
    }
}
```

## 📊 Quality Benchmarks

### High-Quality Discovery
- 5+ line-specific findings per 100 lines of code
- Quantified impact estimates (milliseconds, bytes, percentages)
- Technical depth: Implementation strategies included
- Zero generic advice or placeholder recommendations

### High-Quality Validation
- Each optimization verified against original finding
- Performance impact estimates refined
- New issues identified and addressed
- Clear measurement methodology provided

---

*Template validated through successful EnemyAI optimization achieving 0.3-0.4ms frame time reductions.*