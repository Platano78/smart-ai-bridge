# Smart AI Bridge v2.0.0 - Usage Examples

## Token-Saving File Operations

### analyze_file -- 90% Token Savings

Local LLM reads and analyzes files. Claude never sees full file content, only structured findings.

```javascript
// Security analysis
@analyze_file({
  filePath: "/src/auth.js",
  question: "What are the security vulnerabilities?",
  options: {
    analysisType: "security",
    backend: "auto"
  }
})

// Architecture analysis with context files
@analyze_file({
  filePath: "/src/server.js",
  question: "How does the request lifecycle work?",
  options: {
    analysisType: "architecture",
    includeContext: ["src/router.js", "src/handlers/index.js"],
    maxResponseTokens: 3000
  }
})

// Bug hunting
@analyze_file({
  filePath: "/src/utils/parser.js",
  question: "Are there any edge cases that could cause crashes?",
  options: { analysisType: "bug" }
})
```

### modify_file -- 95% Token Savings

Local LLM applies natural language edits. Claude reviews a small diff instead of the full file.

```javascript
// Add error handling
@modify_file({
  filePath: "/src/api.js",
  instructions: "Add try-catch error handling to all async route handlers",
  options: {
    review: true,
    backup: true,
    backend: "auto"
  }
})

// Refactor a function
@modify_file({
  filePath: "/src/utils/validator.js",
  instructions: "Convert the validateEmail function to use a regex pattern and add input type checking",
  options: {
    review: true,
    contextFiles: ["src/utils/types.js"]
  }
})

// Dry run (preview changes without writing)
@modify_file({
  filePath: "/src/config.js",
  instructions: "Add a new 'timeout' field with default value 30000",
  options: { dryRun: true }
})
```

### generate_file -- Code Generation

Generate code from natural language spec using local LLM.

```javascript
// Generate a utility module
@generate_file({
  spec: "Create a rate limiter module using a sliding window algorithm. Export a RateLimiter class with check(key) and reset(key) methods. Include JSDoc comments.",
  outputPath: "/src/utils/rate-limiter.js",
  options: {
    review: true,
    language: "javascript",
    includeTests: true
  }
})

// Generate with context files for style matching
@generate_file({
  spec: "Create a GroqAdapter class that follows the same pattern as the existing adapters",
  outputPath: "/src/backends/groq-adapter.js",
  options: {
    contextFiles: ["src/backends/openai-adapter.js", "src/backends/backend-adapter.js"],
    review: true
  }
})
```

### batch_analyze -- Multi-File Analysis

Analyze multiple files at once with aggregated findings.

```javascript
// Security audit across all handlers
@batch_analyze({
  filePatterns: ["src/handlers/**/*.js"],
  question: "Are there any unvalidated inputs or injection vulnerabilities?",
  options: {
    analysisType: "security",
    maxFiles: 20,
    aggregateResults: true,
    parallel: true
  }
})

// Performance review of backend adapters
@batch_analyze({
  filePatterns: ["src/backends/*.js"],
  question: "What are the potential performance bottlenecks and timeout risks?",
  options: {
    analysisType: "performance",
    backend: "nvidia_deepseek"
  }
})
```

### batch_modify -- Multi-File Edits

Apply the same instructions across multiple files atomically.

```javascript
// Add error handling to all handlers
@batch_modify({
  files: ["src/handlers/*.js"],
  instructions: "Add input validation at the top of the execute() method to check that required arguments are present",
  options: {
    review: true,
    transactionMode: "all_or_nothing",
    stopOnError: true
  }
})

// Update import paths
@batch_modify({
  files: ["src/**/*.js"],
  instructions: "Replace all imports from '../old-module.js' with '../new-module.js'",
  options: {
    parallel: true,
    transactionMode: "best_effort"
  }
})
```

### explore -- Codebase Exploration

Answer questions about the codebase using intelligent search. Returns a summary, never raw file contents.

```javascript
// Find where something is implemented
@explore({
  question: "Where is user authentication handled?",
  options: {
    scope: "src/**/*.js",
    depth: "deep",
    maxFiles: 30
  }
})

// Understand architecture
@explore({
  question: "How does the routing system decide which backend to use?",
  options: {
    scope: "src/router.js",
    depth: "deep"
  }
})

// Quick search
@explore({
  question: "Which files use the BackendRegistry?",
  options: {
    depth: "shallow",
    maxFiles: 50
  }
})
```

### refactor -- Cross-File Refactoring

```javascript
// Rename a class across all files
@refactor({
  scope: "class",
  target: "OldService",
  instructions: "Rename to NewService and update all imports and references",
  options: {
    dryRun: true,
    findReferences: true
  }
})

// Module-level refactoring
@refactor({
  scope: "module",
  target: "src/utils/helpers.js",
  instructions: "Split this module into separate files: string-utils.js, date-utils.js, and math-utils.js",
  options: {
    review: true,
    backend: "nvidia_qwen"
  }
})

// Function extraction
@refactor({
  scope: "function",
  target: "processUserData",
  instructions: "Extract the validation logic into a separate validateUserData function",
  options: {
    files: ["src/controllers/user.js"],
    review: true
  }
})
```

## Multi-AI Workflow Tools

### ask -- Smart Multi-Backend Routing

```javascript
// Auto-routing (let the router decide)
@ask({
  model: "auto",
  prompt: "Implement a binary search tree with insert, delete, and search operations in JavaScript"
})

// Force specific backend
@ask({
  model: "nvidia_deepseek",
  prompt: "Analyze the time complexity of this algorithm and suggest optimizations",
  thinking: true
})

// Ultra-fast response via Groq
@ask({
  model: "groq",
  prompt: "Explain the difference between Promise.all and Promise.allSettled"
})

// Large context with local model
@ask({
  model: "local",
  prompt: "Here is a complete module [large code]. Summarize the architecture.",
  max_tokens: 16384
})

// OpenAI premium reasoning
@ask({
  model: "openai",
  prompt: "Design a distributed caching strategy for a microservices architecture with these constraints..."
})
```

### council -- Multi-AI Consensus

```javascript
// Architecture decision
@council({
  prompt: "Should we use microservices or a monolith for a real-time multiplayer game backend?",
  topic: "architecture",
  confidence_needed: "high"
})

// Security review
@council({
  prompt: "Review this authentication flow for vulnerabilities: [flow description]",
  topic: "security",
  confidence_needed: "high"
})

// Performance optimization
@council({
  prompt: "What is the best approach to optimize database queries for this schema?",
  topic: "performance",
  confidence_needed: "medium",
  max_tokens: 6000
})

// Creative solution
@council({
  prompt: "What are novel approaches to reduce token usage in LLM-powered tools?",
  topic: "creative",
  confidence_needed: "low"
})
```

### dual_iterate -- Generate->Review->Fix Loop

```javascript
// Code generation with quality gate
@dual_iterate({
  task: "Write a function that validates email addresses using RFC 5322 rules",
  quality_threshold: 0.8,
  max_iterations: 3,
  include_history: false
})

// Complex implementation
@dual_iterate({
  task: "Implement a connection pool manager with idle timeout, max connections, and health checking",
  quality_threshold: 0.7,
  max_iterations: 5,
  include_history: true
})
```

### parallel_agents -- TDD Workflow

```javascript
// Full TDD cycle
@parallel_agents({
  task: "Implement OAuth2 authentication with JWT tokens",
  max_parallel: 2,
  iterate_until_quality: true,
  max_iterations: 3,
  write_files: true,
  work_directory: "/tmp/oauth2-tdd"
})

// TDD without file writing (results only)
@parallel_agents({
  task: "Create a caching layer with TTL and LRU eviction",
  max_parallel: 2,
  iterate_until_quality: true,
  write_files: false
})
```

### spawn_subagent -- Specialized AI Roles

```javascript
// Code review
@spawn_subagent({
  role: "code-reviewer",
  task: "Review the authentication module for best practices and potential issues",
  file_patterns: ["src/auth/**/*.js"],
  verdict_mode: "full"
})

// Security audit
@spawn_subagent({
  role: "security-auditor",
  task: "Audit the API endpoints for OWASP Top 10 vulnerabilities",
  file_patterns: ["src/routes/**/*.js"],
  verdict_mode: "summary"
})

// Task planning
@spawn_subagent({
  role: "planner",
  task: "Break down the migration from REST to GraphQL into ordered subtasks with dependencies"
})

// Test generation with file output
@spawn_subagent({
  role: "test-generator",
  task: "Generate unit tests for the BackendRegistry class",
  file_patterns: ["src/backends/backend-registry.js"],
  write_files: true,
  work_directory: "/tmp/tests"
})

// TDD decomposition
@spawn_subagent({
  role: "tdd-decomposer",
  task: "Decompose 'Implement a notification system' into atomic TDD subtasks"
})
```

## Code Quality Tools

### review -- Code Review

```javascript
// Comprehensive review
@review({
  content: "function processPayment(amount, card) { ... }",
  file_path: "src/payments/processor.js",
  language: "javascript",
  review_type: "comprehensive"
})

// Security-focused review
@review({
  content: "[paste code here]",
  review_type: "security"
})

// Performance-focused review
@review({
  content: "[paste code here]",
  review_type: "performance"
})
```

### validate_changes -- Pre-Flight Validation

```javascript
// Validate proposed changes before applying
@validate_changes({
  file_path: "src/auth/login.js",
  proposed_changes: [
    {
      find: "const token = jwt.sign(payload, secret)",
      replace: "const token = jwt.sign(payload, secret, { expiresIn: '1h' })"
    }
  ],
  language: "javascript",
  validation_rules: ["syntax", "security", "logic"]
})
```

## Infrastructure Tools

### check_backend_health -- Backend Health

```javascript
// Check specific backend
@check_backend_health({
  backend: "local",
  force: true
})

// Check cloud backend
@check_backend_health({
  backend: "nvidia_deepseek"
})
```

### backup_restore -- Backup Management

```javascript
// Create backup before major changes
@backup_restore({
  action: "create",
  file_path: "src/server.js",
  metadata: {
    description: "Before v2.1 refactor",
    tags: ["pre-refactor", "v2.1"]
  }
})

// List backups
@backup_restore({
  action: "list",
  file_path: "src/server.js"
})

// Restore from backup
@backup_restore({
  action: "restore",
  file_path: "src/server.js",
  backup_id: "backup_20260220_143022"
})

// Clean up old backups
@backup_restore({
  action: "cleanup",
  cleanup_options: {
    max_age_days: 30,
    max_count_per_file: 5,
    dry_run: true
  }
})
```

### write_files_atomic -- Atomic Multi-File Writes

```javascript
// Write multiple files with automatic backup
@write_files_atomic({
  file_operations: [
    {
      path: "src/models/user.js",
      content: "export class User { ... }",
      operation: "write"
    },
    {
      path: "src/models/index.js",
      content: "export { User } from './user.js';",
      operation: "write"
    }
  ],
  create_backup: true
})
```

### manage_conversation -- Conversation Threading

```javascript
// Start new conversation
@manage_conversation({
  action: "start",
  topic: "Backend refactoring discussion"
})

// Search conversations
@manage_conversation({
  action: "search",
  query: "authentication"
})

// Get analytics
@manage_conversation({
  action: "analytics"
})
```

### get_analytics -- Usage Analytics

```javascript
// Current session stats
@get_analytics({
  report_type: "current"
})

// Cost analysis
@get_analytics({
  report_type: "cost",
  time_range: "7d",
  format: "markdown"
})

// Optimization recommendations
@get_analytics({
  report_type: "recommendations"
})
```

## Common Workflows

### Code Review Workflow

```javascript
// Step 1: Analyze the file
@analyze_file({
  filePath: "src/auth/login.js",
  question: "What are the security issues and code quality problems?",
  options: { analysisType: "security" }
})

// Step 2: Get AI consensus on the approach
@council({
  prompt: "Given these security findings, what is the best remediation approach?",
  topic: "security",
  confidence_needed: "high"
})

// Step 3: Apply fixes
@modify_file({
  filePath: "src/auth/login.js",
  instructions: "Fix the SQL injection vulnerability by using parameterized queries, add input validation, and implement rate limiting",
  options: { review: true, backup: true }
})

// Step 4: Validate the changes
@validate_changes({
  file_path: "src/auth/login.js",
  proposed_changes: [{ find: "old code", replace: "new code" }],
  validation_rules: ["security", "logic", "performance"]
})
```

### Refactoring Workflow

```javascript
// Step 1: Backup
@backup_restore({
  action: "create",
  file_path: "src/legacy-module.js",
  metadata: { description: "Before refactoring" }
})

// Step 2: Analyze current structure
@analyze_file({
  filePath: "src/legacy-module.js",
  question: "What is the module structure and what are the dependencies?",
  options: { analysisType: "architecture" }
})

// Step 3: Generate replacement code
@dual_iterate({
  task: "Rewrite the legacy module using modern ES modules, async/await, and proper error handling",
  quality_threshold: 0.8
})

// Step 4: Apply refactoring across files
@refactor({
  scope: "module",
  target: "src/legacy-module.js",
  instructions: "Replace with the new implementation and update all imports",
  options: { review: true, findReferences: true }
})
```

### Multi-File Security Audit

```javascript
// Step 1: Batch analyze all source files
@batch_analyze({
  filePatterns: ["src/**/*.js"],
  question: "Are there any security vulnerabilities (injection, path traversal, auth bypass)?",
  options: {
    analysisType: "security",
    maxFiles: 50,
    aggregateResults: true
  }
})

// Step 2: Deep dive on flagged files
@spawn_subagent({
  role: "security-auditor",
  task: "Perform OWASP Top 10 audit on the flagged files",
  file_patterns: ["src/handlers/file-handlers.js", "src/file-security.js"]
})

// Step 3: Fix identified issues
@batch_modify({
  files: ["src/handlers/file-handlers.js", "src/handlers/read-handler.js"],
  instructions: "Add path validation using file-security.js before any file operations",
  options: { review: true, transactionMode: "all_or_nothing" }
})
```
