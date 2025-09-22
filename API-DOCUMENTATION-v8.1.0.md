# API Documentation - Enhanced MKG Server v8.1.0

## Overview

The Enhanced MKG Server v8.1.0 introduces revolutionary Smart Edit Prevention Strategy features with advanced fuzzy matching capabilities, enhanced error handling, and intelligent validation modes. This documentation covers all enhanced tools and their new parameters.

---

## 🎯 SmartAliasResolver System

### Tool Organization

The v8.1.0 system uses a SmartAliasResolver that provides:
- **9 Core Tools** with comprehensive functionality
- **5 MKG Aliases** for backward compatibility
- **5 DeepSeek Aliases** for legacy support
- **100% Backward Compatibility** with existing implementations

#### Core Tools
- `review` - Comprehensive code review and analysis
- `read` - Enhanced file operations with verification
- `health` - Smart differentiated health monitoring
- `write_files_atomic` - Atomic multi-file operations
- `edit_file` - Enhanced intelligent file editing
- `validate_changes` - Pre-flight validation
- `multi_edit` - Multi-file editing operations
- `backup_restore` - Backup and restore management
- `ask` - AI query and assistance

#### Alias Mapping
```javascript
// MKG Aliases → Core Tools
MKG_analyze → review
MKG_generate → ask
MKG_review → review
MKG_edit → edit_file
MKG_health → health

// DeepSeek Aliases → Core Tools
deepseek_analyze → review
deepseek_generate → ask
deepseek_review → review
deepseek_edit → edit_file
deepseek_health → health
```

---

## 🔧 Enhanced `edit_file` Tool

### Schema

```typescript
interface EditFileRequest {
  file_path: string;                    // Target file path
  edits: EditOperation[];               // Array of edit operations
  language?: string;                    // Programming language hint
  validation_mode?: 'strict' | 'lenient' | 'dry_run';  // Default: 'strict'
  fuzzy_threshold?: number;             // 0.1-1.0, default: 0.8
  suggest_alternatives?: boolean;       // Default: true
  max_suggestions?: number;             // 1-10, default: 3
}

interface EditOperation {
  find: string;                         // Text to find
  replace: string;                      // Replacement text
  description?: string;                 // Optional description
}
```

### Enhanced Parameters

#### `validation_mode` (New)
Controls the matching strategy for edit operations:

- **`strict`** (Default): Exact string matching only
  - Fastest performance (<5ms)
  - Fails immediately on mismatch
  - Best for known exact patterns

- **`lenient`**: Exact matching first, then fuzzy matching
  - Balanced performance (<20ms)
  - Automatic correction with fuzzy matching
  - Recommended for most use cases

- **`dry_run`**: Validation only, no file changes
  - Safe pattern testing
  - Comprehensive analysis and reporting
  - Returns detailed match information

#### `fuzzy_threshold` (New)
Similarity threshold for fuzzy matching (0.1-1.0):

- **0.9-1.0**: Very strict (minor differences like punctuation)
- **0.8-0.9**: Moderate (recommended range)
- **0.7-0.8**: Permissive (structural differences)
- **0.1-0.7**: Very permissive (use with caution)

#### `suggest_alternatives` (New)
Include fuzzy match suggestions in error messages:
- `true`: Provides helpful suggestions when exact match fails
- `false`: Faster performance, no suggestions generated

#### `max_suggestions` (New)
Limit the number of fuzzy match suggestions (1-10):
- Higher values: More options, slower performance
- Lower values: Faster response, fewer alternatives

### Usage Examples

#### Basic Enhanced Usage
```javascript
@edit_file({
  file_path: "/src/user.js",
  edits: [
    {
      find: "const userName = 'alice'",
      replace: "const userName = 'bob'",
      description: "Update default username"
    }
  ],
  validation_mode: "lenient",           // Enable fuzzy matching
  fuzzy_threshold: 0.8                  // Standard threshold
})
```

#### Advanced Configuration
```javascript
@edit_file({
  file_path: "/src/complex-service.js",
  language: "javascript",               // Language hint for better matching
  validation_mode: "lenient",
  fuzzy_threshold: 0.85,                // Slightly more strict
  suggest_alternatives: true,
  max_suggestions: 5,                   // More alternatives
  edits: [
    {
      find: "function processUserData(userData) {",
      replace: "async function processUserData(userData, options = {}) {",
      description: "Make function async and add options parameter"
    }
  ]
})
```

#### Dry Run Validation
```javascript
@edit_file({
  file_path: "/src/critical-module.js",
  validation_mode: "dry_run",           // No changes, just validation
  fuzzy_threshold: 0.7,                 // More permissive for testing
  suggest_alternatives: true,
  max_suggestions: 10,                  // Maximum feedback
  edits: [
    {
      find: "function calculateScore(user, data) {",
      replace: "function calculateScore(user, data, weights = {}) {",
      description: "Add weights parameter"
    }
  ]
})
```

### Response Format

#### Successful Response
```javascript
{
  "success": true,
  "changes_made": 1,
  "edits_applied": [
    {
      "operation": 1,
      "status": "success",
      "match_type": "exact",              // or "fuzzy"
      "similarity": 1.0,                  // For fuzzy matches
      "location": "line 15, column 1"
    }
  ],
  "performance": {
    "total_time": 12,
    "exact_match_time": 2,
    "fuzzy_match_time": 10,
    "suggestion_generation_time": 0
  }
}
```

#### Error Response with Suggestions
```javascript
{
  "success": false,
  "error": "Text not found in file",
  "details": {
    "failed_edit": {
      "find": "function processUserData(userdata) {",
      "replace": "function processUserData(userData, options) {"
    },
    "exact_match": false,
    "fuzzy_matches": [
      {
        "text": "function processUserData(userData) {",
        "similarity": 0.87,
        "location": "line 15, column 1",
        "context": "function processUserData(userData) {\n  return userData.processed;\n}"
      }
    ],
    "suggestions": [
      "Try using: 'function processUserData(userData) {'",
      "Check parameter name spelling: 'userData' vs 'userdata'",
      "Verify exact spacing and punctuation"
    ]
  }
}
```

#### Dry Run Response
```javascript
{
  "success": true,
  "validation_only": true,
  "analysis": {
    "total_edits": 1,
    "exact_matches": 0,
    "fuzzy_matches": 1,
    "failed_matches": 0
  },
  "match_details": [
    {
      "edit_index": 0,
      "status": "fuzzy_match",
      "similarity": 0.87,
      "suggested_find": "function processUserData(userData) {",
      "original_find": "function processUserData(userdata) {",
      "recommendation": "Consider using the suggested find pattern for exact matching"
    }
  ]
}
```

---

## 📖 Enhanced `read` Tool

### Schema

```typescript
interface ReadRequest {
  file_paths: string[];                 // Array of file paths to read
  max_files?: number;                   // Default: 10
  analysis_type?: 'content' | 'structure' | 'relationships' | 'summary';  // Default: 'content'
  verify_texts?: string[];              // NEW: Array of texts to verify
  verification_mode?: 'basic' | 'fuzzy' | 'comprehensive';  // NEW: Default: 'fuzzy'
  fuzzy_threshold?: number;             // NEW: 0.1-1.0, default: 0.8
}
```

### Enhanced Parameters

#### `verify_texts` (New)
Array of text strings to verify existence in files:
- Useful for pre-flight validation before editing
- Supports multiple text patterns in single operation
- Returns detailed match information for each text

#### `verification_mode` (New)
Controls text verification strategy:

- **`basic`**: Exact string matching only
  - Fastest performance (<5ms)
  - Simple substring search
  - Best for known exact text

- **`fuzzy`** (Default): Includes similarity-based matching
  - Balanced performance (<20ms)
  - Handles minor variations and typos
  - Recommended for most use cases

- **`comprehensive`**: Fuzzy matching + detailed suggestions
  - Enhanced analysis (<50ms)
  - Maximum feedback and alternatives
  - Best for thorough validation

### Usage Examples

#### Basic File Reading
```javascript
@read({
  file_paths: ["/src/user.js", "/src/admin.js"],
  analysis_type: "content"
})
```

#### Text Verification
```javascript
@read({
  file_paths: ["/src/user-service.js"],
  verify_texts: [
    "function getUserById",
    "const userCache",
    "return user.data"
  ],
  verification_mode: "fuzzy",
  fuzzy_threshold: 0.8
})
```

#### Comprehensive Pre-flight Validation
```javascript
@read({
  file_paths: ["/src/critical-module.js"],
  verify_texts: [
    "function calculateScore(user, data) {",
    "const DEFAULT_WEIGHTS",
    "return score.total"
  ],
  verification_mode: "comprehensive",    // Maximum analysis
  fuzzy_threshold: 0.7,                  // More permissive
  analysis_type: "content"
})
```

#### Multi-file Pattern Verification
```javascript
@read({
  file_paths: [
    "/src/user.js",
    "/src/admin.js",
    "/src/guest.js"
  ],
  verify_texts: [
    "function validatePermissions",
    "const PERMISSION_LEVELS",
    "export { checkAccess }"
  ],
  verification_mode: "fuzzy",
  fuzzy_threshold: 0.85
})
```

### Response Format

#### Successful Response with Verification
```javascript
{
  "success": true,
  "files_read": 1,
  "file_contents": [
    {
      "path": "/src/user.js",
      "content": "...",
      "size": 1024,
      "encoding": "utf-8"
    }
  ],
  "verification": {
    "total_texts": 3,
    "exact_matches": 2,
    "fuzzy_matches": 1,
    "failed_matches": 0,
    "results": [
      {
        "text": "function getUserById",
        "status": "exact_match",
        "location": "line 15, column 1",
        "similarity": 1.0
      },
      {
        "text": "const userCache",
        "status": "fuzzy_match",
        "found_text": "const user_cache",
        "location": "line 3, column 1",
        "similarity": 0.85
      }
    ]
  },
  "performance": {
    "read_time": 5,
    "verification_time": 15,
    "total_time": 20
  }
}
```

#### Verification with Suggestions
```javascript
{
  "success": true,
  "verification": {
    "total_texts": 2,
    "exact_matches": 1,
    "fuzzy_matches": 0,
    "failed_matches": 1,
    "results": [
      {
        "text": "function processUserData",
        "status": "exact_match",
        "location": "line 20, column 1"
      },
      {
        "text": "function calculateUserScore",
        "status": "failed",
        "suggestions": [
          {
            "text": "function calculateScore",
            "similarity": 0.75,
            "location": "line 45, column 1"
          },
          {
            "text": "function calculateUserRating",
            "similarity": 0.70,
            "location": "line 67, column 1"
          }
        ]
      }
    ]
  }
}
```

---

## 🏥 Enhanced `health` Tool

### Schema

```typescript
interface HealthRequest {
  check_type?: 'system' | 'performance' | 'endpoints' | 'comprehensive';  // Default: 'comprehensive'
  force_ip_rediscovery?: boolean;       // NEW: Default: false
}
```

### Enhanced Parameters

#### `force_ip_rediscovery` (New)
Force cache invalidation and rediscover IP addresses:
- Useful when localhost connection fails
- Clears cached endpoint configurations
- Performs fresh network discovery
- Helpful for WSL/Docker connectivity issues

### Usage Examples

#### Standard Health Check
```javascript
@health({
  check_type: "comprehensive"
})
```

#### Force Network Rediscovery
```javascript
@health({
  check_type: "comprehensive",
  force_ip_rediscovery: true            // Clear caches and rediscover
})
```

#### Quick System Check
```javascript
@health({
  check_type: "system"                  // Basic system status only
})
```

### Response Format

#### Comprehensive Health Response
```javascript
{
  "success": true,
  "timestamp": "2025-09-22T10:30:00Z",
  "system_status": "healthy",
  "endpoints": {
    "local": {
      "status": "healthy",
      "url": "http://172.23.16.1:1234/v1",
      "response_time": 8,
      "check_type": "comprehensive_inference",  // 10s timeout
      "last_check": "2025-09-22T10:30:00Z"
    },
    "nvidia_qwen": {
      "status": "healthy",
      "response_time": 2,
      "check_type": "quick_ping",               // 3s timeout
      "last_check": "2025-09-22T10:30:00Z"
    },
    "nvidia_deepseek": {
      "status": "healthy",
      "response_time": 3,
      "check_type": "quick_ping",
      "last_check": "2025-09-22T10:30:00Z"
    }
  },
  "performance_metrics": {
    "avg_response_time": 12,
    "total_requests": 156,
    "success_rate": 0.98,
    "cache_hit_rate": 0.85
  },
  "smart_routing_analytics": {
    "local_usage": 0.65,
    "nvidia_qwen_usage": 0.25,
    "nvidia_deepseek_usage": 0.10,
    "routing_accuracy": 0.94
  },
  "tools_status": {
    "core_tools": 9,
    "total_aliases": 10,
    "registration_status": "complete"
  }
}
```

---

## 🛠️ Migration Guide

### Upgrading from v7.0.0 to v8.1.0

#### No Breaking Changes
All existing tool calls will continue to work without modification:

```javascript
// v7.0.0 syntax (still works)
@edit_file({
  file_path: "/src/file.js",
  edits: [{ find: "old", replace: "new" }]
})

// Enhanced v8.1.0 syntax (optional)
@edit_file({
  file_path: "/src/file.js",
  validation_mode: "lenient",     // NEW: fuzzy matching
  fuzzy_threshold: 0.8,           // NEW: configurable threshold
  edits: [{ find: "old", replace: "new" }]
})
```

#### Recommended Enhancements

1. **Enable Fuzzy Matching for Reliability**
```javascript
// Add to existing edit_file calls
validation_mode: "lenient",
fuzzy_threshold: 0.8
```

2. **Use Pre-flight Validation**
```javascript
// Verify text before editing
const verification = await read({
  file_paths: ["/path/to/file.js"],
  verify_texts: ["target text"],
  verification_mode: "fuzzy"
});

if (verification.success) {
  await edit_file({...});
}
```

3. **Optimize for Performance**
```javascript
// For production environments
@edit_file({
  validation_mode: "lenient",
  fuzzy_threshold: 0.85,          // Slightly more strict
  suggest_alternatives: false,     // Faster performance
  max_suggestions: 1
})
```

#### Tool Alias Updates

All existing aliases work unchanged:

```javascript
// These all work identically:
@MKG_edit({...})          // MKG alias
@deepseek_edit({...})     // DeepSeek alias
@edit_file({...})         // Core tool
```

---

## 📊 Performance Targets

### Response Time Targets
- **Exact matching**: <5ms
- **Fuzzy matching**: <50ms
- **Comprehensive verification**: <100ms
- **Dry run validation**: <30ms
- **Health checks**: 3-10s (differentiated by endpoint type)

### Memory Usage Targets
- **Standard operations**: <5MB delta
- **Fuzzy matching**: <10MB delta
- **Batch operations**: <50MB total

### Optimization Guidelines

#### For Speed
```javascript
validation_mode: "strict",        // Fastest
suggest_alternatives: false,      // No suggestion overhead
fuzzy_threshold: 0.9              // Minimal fuzzy processing
```

#### For Reliability
```javascript
validation_mode: "lenient",       // Fuzzy fallback
fuzzy_threshold: 0.8,             // Balanced threshold
suggest_alternatives: true        // Helpful error messages
```

#### For Development
```javascript
validation_mode: "comprehensive", // Maximum information
fuzzy_threshold: 0.7,             // More permissive
max_suggestions: 10               // All available alternatives
```

---

## 🔧 Error Handling

### Common Error Responses

#### Text Not Found
```javascript
{
  "success": false,
  "error": "Text not found in file",
  "error_code": "TEXT_NOT_FOUND",
  "details": {
    "file_path": "/src/file.js",
    "search_text": "function processData",
    "fuzzy_matches": [...],
    "suggestions": [...]
  }
}
```

#### Performance Timeout
```javascript
{
  "success": false,
  "error": "Operation timeout",
  "error_code": "TIMEOUT",
  "details": {
    "operation": "fuzzy_matching",
    "timeout": 50,
    "actual_time": 75
  }
}
```

#### Validation Error
```javascript
{
  "success": false,
  "error": "Validation failed",
  "error_code": "VALIDATION_ERROR",
  "details": {
    "validation_mode": "strict",
    "failed_edits": [0, 2],
    "suggestions": "Try using lenient mode with fuzzy matching"
  }
}
```

### Error Recovery Strategies

1. **Use suggested matches from fuzzy matching**
2. **Adjust fuzzy threshold for different sensitivity**
3. **Switch to lenient mode for automatic correction**
4. **Use dry_run mode to investigate patterns**
5. **Break complex patterns into smaller, specific parts**

---

This API documentation provides comprehensive coverage of all enhanced features in MKG Server v8.1.0. For practical usage examples, see the [Smart Edit Prevention Guide](SMART-EDIT-PREVENTION-GUIDE.md). For troubleshooting, refer to the [Troubleshooting Guide](TROUBLESHOOTING-GUIDE.md).