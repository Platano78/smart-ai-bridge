# YoutAgent File System Test Suite

This directory contains comprehensive test files for validating the YoutAgent MCP tool implementation.

## Test Structure

```
test-youtu-agent/
├── README.md                          # This file
├── config.json                        # Test configuration and scenarios
├── sample-javascript.js               # JavaScript test file with modern patterns
├── sample-python.py                   # Python test file with async/typing features
└── nested-directory/                  # Directory structure testing
    ├── component.ts                   # TypeScript file for nested scanning
    └── deep-level/                    # Deep nesting test
        └── utils.py                   # Python utilities in deep directory
```

## TDD Implementation Tests

### Core Requirements Validation:

1. **WSL/Windows Path Compatibility** ✅
   - Tests path normalization between WSL and Windows formats
   - Validates `C:\Users\Path` → `/mnt/c/Users/Path` conversion

2. **Security Validation** ✅
   - Directory traversal protection (`../../../etc/passwd`)
   - File extension filtering
   - File size validation (10MB limit)
   - Path sanitization

3. **Multi-file Batch Reading** ✅
   - Concurrent file reading (default: 5 concurrent)
   - Error handling for individual file failures
   - Memory-efficient batch processing

### Test Scenarios:

#### 1. Single File Analysis
- **File**: `sample-javascript.js`
- **Expected**: Successful read with content validation

#### 2. Multiple Files Analysis  
- **Files**: `[sample-javascript.js, sample-python.py, config.json]`
- **Expected**: Batch processing with individual success/failure tracking

#### 3. Directory Analysis
- **Directory**: `./` (current directory)
- **Expected**: Recursive file discovery with extension filtering

#### 4. Pattern Filtering
- **Pattern**: `*.js` or `*.py`
- **Expected**: Only matching files processed

#### 5. Nested Directory Scanning
- **Directory**: `nested-directory/`
- **Expected**: Recursive discovery including `deep-level/utils.py`

## File Types Included:

- **JavaScript** (`.js`): Modern ES6+ patterns, async/await, classes
- **Python** (`.py`): Type hints, dataclasses, async context managers
- **TypeScript** (`.ts`): Interfaces, enums, abstract classes
- **JSON** (`.json`): Configuration and structured data
- **Markdown** (`.md`): Documentation and text analysis

## Security Test Cases:

### Safe Paths (Should Succeed):
- `./sample-javascript.js`
- `nested-directory/component.ts`
- `/home/platano/project/deepseek-mcp-bridge/test-youtu-agent/config.json`

### Malicious Paths (Should Fail):
- `../../../etc/passwd`
- `..\\..\\Windows\\System32`
- Files with prohibited extensions (`.exe`, `.bin`)
- Files exceeding size limits (>10MB)

## Performance Benchmarks:

- **Concurrent Reads**: Up to 5 simultaneous files
- **Memory Management**: Batch processing to prevent overflow
- **File Size Limit**: 10MB per file
- **Directory Traversal**: Recursive with security validation

## Usage Examples:

### Single File Test:
```json
{
  "files": "sample-javascript.js"
}
```

### Multiple Files Test:
```json
{
  "files": ["sample-javascript.js", "sample-python.py", "config.json"]
}
```

### Directory Analysis:
```json
{
  "files": "./",
  "pattern": "*.js"
}
```

### Advanced Configuration:
```json
{
  "files": "./nested-directory",
  "max_file_size": 5242880,
  "allowed_extensions": [".ts", ".py"],
  "concurrency": 3
}
```

This test suite validates all TDD requirements and ensures the YoutAgent filesystem integration works correctly across different scenarios and security contexts.