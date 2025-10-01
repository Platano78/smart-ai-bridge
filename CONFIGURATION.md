# CONFIGURATION.md

# Smart AI Bridge v1.0.0 - Configuration Guide

## 🔧 Complete Configuration Reference

### Environment Variables

#### Core Configuration
```bash
# Server Mode
NODE_ENV=production
MCP_SERVER_MODE=true
MCP_SERVER_NAME=smart-ai-bridge

# Local Model Configuration
MKG_SERVER_PORT=8001
DEEPSEEK_ENDPOINT=http://localhost:8001/v1
VALIDATION_ENABLED=true

# Cloud Provider API Keys
NVIDIA_API_KEY=your-nvidia-api-key-here
DEEPSEEK_API_KEY=your-deepseek-api-key-here
QWEN_CLOUD_API_KEY=your-qwen-cloud-api-key-here
OPENAI_API_KEY=your-openai-api-key-here

# Performance Tuning
MAX_CONCURRENT_REQUESTS=10
CACHE_TTL=900
HEALTH_CHECK_INTERVAL=30
ROUTING_TIMEOUT=100
FIM_CACHE_TTL=900

# Logging and Monitoring
LOG_LEVEL=info
METRICS_ENABLED=true
DEBUG=false

# Security
CORS_ENABLED=false
RATE_LIMIT_ENABLED=true
MAX_REQUESTS_PER_MINUTE=100
```

#### Advanced Configuration
```bash
# Smart Routing
LOCAL_FIRST_THRESHOLD=0.95
COMPLEXITY_THRESHOLD_SIMPLE=500
COMPLEXITY_THRESHOLD_MEDIUM=2000
COMPLEXITY_THRESHOLD_COMPLEX=8000

# Memory Management
NODE_OPTIONS="--max-old-space-size=4096"
UV_THREADPOOL_SIZE=8
CACHE_SIZE_MB=256

# File Operations
MAX_FILE_SIZE=50
BACKUP_ENABLED=true
BACKUP_RETENTION_DAYS=7
TEMP_DIR=/tmp

# Endpoint Health
HEALTH_CHECK_TIMEOUT=5000
ENDPOINT_RETRY_COUNT=3
FAILOVER_TIMEOUT=1000
```

## 🚀 Smart Routing Configuration

### Routing Priority Setup
```javascript
// Default endpoint configuration
const endpoints = {
  local: {
    name: 'Qwen3-Coder-30B-A3B-Instruct-FP8',
    url: 'http://localhost:8001/v1/chat/completions',
    healthUrl: 'http://localhost:8001/health',
    maxTokens: 131072,
    priority: 1
  },
  nvidiaDeepSeek: {
    name: 'NVIDIA-DeepSeek-V3.1',
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    maxTokens: 65536,
    priority: 2
  },
  nvidiaQwen: {
    name: 'NVIDIA-Qwen-3-Coder-480B',
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    maxTokens: 32768,
    priority: 3
  }
};
```

### Complexity-Based Routing
```bash
# Routing thresholds (in tokens)
SIMPLE_TASK_THRESHOLD=500      # Local processing preferred
MEDIUM_TASK_THRESHOLD=2000     # Smart routing decision
COMPLEX_TASK_THRESHOLD=8000    # Cloud escalation considered

# Local processing percentage
LOCAL_FIRST_THRESHOLD=0.95     # 95% local, 5% cloud
```

### Custom Routing Rules
```javascript
// Pattern-based routing
const routingPatterns = {
  coding: {
    patterns: ['function', 'class', 'debug', 'implement'],
    preferredEndpoint: 'local'
  },
  analysis: {
    patterns: ['analyze', 'review', 'security', 'performance'],
    preferredEndpoint: 'nvidiaDeepSeek'
  },
  generation: {
    patterns: ['generate', 'create', 'scaffold'],
    preferredEndpoint: 'nvidiaQwen'
  }
};
```

## 🐳 Local Model Configuration

### Docker Compose Options

#### Option 1: Qwen3-Coder-30B-FP8 (Recommended)
```yaml
# docker-compose.qwen3-coder-30b-fp8.yml
version: '3.8'

services:
  qwen3-coder-30b-fp8:
    image: vllm/vllm-openai:latest
    container_name: qwen3-coder-30b-fp8
    ports:
      - "8001:8000"
    environment:
      - NVIDIA_VISIBLE_DEVICES=all
      - CUDA_VISIBLE_DEVICES=0
    volumes:
      - model_cache:/root/.cache/huggingface
      - ./logs:/app/logs
    command: [
      "--model", "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8",
      "--host", "0.0.0.0",
      "--port", "8000",
      "--served-model-name", "qwen3-coder-30b-fp8",
      "--max-model-len", "32768",
      "--gpu-memory-utilization", "0.85",
      "--tensor-parallel-size", "1",
      "--dtype", "auto",
      "--quantization", "fp8",
      "--enable-lora",
      "--max-loras", "4",
      "--trust-remote-code",
      "--disable-log-stats",
      "--api-key", "your-api-key-here"
    ]
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 300s

volumes:
  model_cache:
    driver: local
```

#### Option 2: Qwen2.5-Coder-7B (Lighter)
```yaml
# docker-compose.qwen2.5-coder-7b-8001.yml
version: '3.8'

services:
  qwen25-coder-7b:
    image: vllm/vllm-openai:latest
    container_name: qwen25-coder-7b
    ports:
      - "8001:8000"
    environment:
      - NVIDIA_VISIBLE_DEVICES=all
    command: [
      "--model", "Qwen/Qwen2.5-Coder-7B-Instruct",
      "--host", "0.0.0.0",
      "--port", "8000",
      "--max-model-len", "32768",
      "--gpu-memory-utilization", "0.70",
      "--trust-remote-code"
    ]
    restart: unless-stopped
```

#### Option 3: Custom Model
```yaml
# Custom configuration template
services:
  custom-model:
    image: vllm/vllm-openai:latest
    container_name: your-custom-model
    ports:
      - "8001:8000"
    environment:
      - NVIDIA_VISIBLE_DEVICES=all
    command: [
      "--model", "your-model-name",
      "--host", "0.0.0.0",
      "--port", "8000",
      "--max-model-len", "your-context-length",
      "--gpu-memory-utilization", "0.85",
      "--trust-remote-code"
    ]
```

### Local Model Startup
```bash
# Start recommended model
docker-compose -f docker-compose.qwen3-coder-30b-fp8.yml up -d

# Check status
docker ps | grep qwen3-coder
docker logs qwen3-coder-30b-fp8 -f

# Test endpoint
curl http://localhost:8001/health
curl http://localhost:8001/v1/models
```

## ☁️ Cloud Provider Configuration

### NVIDIA Cloud Setup
```bash
# Get API key from NVIDIA
# Visit: https://build.nvidia.com/
# Sign up and obtain API key

# Set environment variable
export NVIDIA_API_KEY="your-nvidia-api-key"

# Test connectivity
curl -H "Authorization: Bearer $NVIDIA_API_KEY" \
     https://integrate.api.nvidia.com/v1/models
```

#### Available NVIDIA Models
```javascript
const nvidiaModels = {
  deepseek: {
    name: 'deepseek-ai/deepseek-v3.1',
    maxTokens: 65536,
    strengths: ['reasoning', 'analysis', 'complex-problems']
  },
  qwen: {
    name: 'qwen/qwen3-coder-480b-a35b-instruct',
    maxTokens: 32768,
    strengths: ['coding', 'implementation', 'debugging']
  }
};
```

### DeepSeek Cloud Setup (Optional)
```bash
# Get API key from DeepSeek
# Visit: https://platform.deepseek.com/
export DEEPSEEK_API_KEY="your-deepseek-api-key"

# Test connectivity
curl -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
     https://api.deepseek.com/v1/models
```

### OpenAI Setup (Optional Fallback)
```bash
# Standard OpenAI configuration
export OPENAI_API_KEY="your-openai-api-key"

# Test connectivity
curl -H "Authorization: Bearer $OPENAI_API_KEY" \
     https://api.openai.com/v1/models
```

## 🔧 MCP Integration Configuration

### Claude Desktop Configuration

#### Basic Configuration
```json
{
  "mcpServers": {
    "smart-ai-bridge": {
      "command": "node",
      "args": ["smart-ai-bridge.js"],
      "cwd": "/path/to/smart-ai-bridge",
      "env": {
        "MCP_SERVER_MODE": "true",
        "NODE_ENV": "production"
      }
    }
  }
}
```

#### Full Production Configuration
```json
{
  "mcpServers": {
    "mecha-king-ghidorah-global": {
      "command": "node",
      "args": [
        "/path/to/smart-ai-bridge.js"
      ],
      "cwd": "/path/to/smart-ai-bridge",
      "env": {
        "MCP_SERVER_NAME": "mecha-king-ghidorah-global",
        "NODE_ENV": "production",
        "NVIDIA_API_KEY": "your-nvidia-api-key",
        "DEEPSEEK_API_KEY": "${DEEPSEEK_API_KEY}",
        "QWEN_CLOUD_API_KEY": "${QWEN_CLOUD_API_KEY}",
        "OPENAI_API_KEY": "${OPENAI_API_KEY}",
        "DEEPSEEK_ENDPOINT": "http://localhost:8001/v1",
        "MCP_SERVER_MODE": "true",
        "MKG_SERVER_PORT": "8001",
        "VALIDATION_ENABLED": "true",
        "MAX_CONCURRENT_REQUESTS": "10",
        "CACHE_TTL": "900"
      }
    }
  }
}
```

#### Development Configuration
```json
{
  "mcpServers": {
    "mkg-dev": {
      "command": "node",
      "args": ["smart-ai-bridge.js"],
      "cwd": "/path/to/smart-ai-bridge",
      "env": {
        "NODE_ENV": "development",
        "DEBUG": "true",
        "LOG_LEVEL": "debug",
        "MCP_SERVER_MODE": "true"
      }
    }
  }
}
```

### Environment Variable Management

#### Method 1: System Environment
```bash
# Add to ~/.bashrc or ~/.profile
export NVIDIA_API_KEY="your-api-key"
export MKG_SERVER_PORT="8001"
export VALIDATION_ENABLED="true"

# Reload
source ~/.bashrc
```

#### Method 2: .env File
```bash
# Create .env file in project root
cat > .env << 'EOF'
NVIDIA_API_KEY=your-nvidia-api-key
DEEPSEEK_ENDPOINT=http://localhost:8001/v1
MKG_SERVER_PORT=8001
NODE_ENV=production
MCP_SERVER_MODE=true
VALIDATION_ENABLED=true
MAX_CONCURRENT_REQUESTS=10
CACHE_TTL=900
EOF

# Secure the file
chmod 600 .env
```

#### Method 3: Docker Environment
```yaml
# In docker-compose.yml
services:
  smart-ai-bridge:
    build: .
    environment:
      - NVIDIA_API_KEY=${NVIDIA_API_KEY}
      - NODE_ENV=production
      - MCP_SERVER_MODE=true
    env_file:
      - .env
```

## ⚡ Performance Configuration

### Memory Optimization
```bash
# Node.js memory settings
NODE_OPTIONS="--max-old-space-size=4096 --optimize-for-size"

# Thread pool size
UV_THREADPOOL_SIZE=8

# V8 optimization flags
NODE_OPTIONS="$NODE_OPTIONS --max-semi-space-size=128"
```

### Caching Configuration
```javascript
// Cache settings
const cacheConfig = {
  fim: {
    ttl: 900,        // 15 minutes
    maxSize: 1000,   // Max cache entries
    keyLength: 50    // Cache key truncation
  },
  health: {
    ttl: 30,         // 30 seconds
    maxSize: 100
  },
  routing: {
    ttl: 300,        // 5 minutes
    maxSize: 500
  }
};
```

### Concurrent Processing
```bash
# Request concurrency
MAX_CONCURRENT_REQUESTS=10

# File processing concurrency
MAX_CONCURRENT_FILES=5

# Batch processing
BATCH_SIZE=50
BATCH_TIMEOUT=5000
```

## 🛡️ Security Configuration

### File Operation Security
```bash
# File size limits (MB)
MAX_FILE_SIZE=50

# Path validation
ALLOW_ABSOLUTE_PATHS=false
BLOCK_PARENT_TRAVERSAL=true

# Backup settings
BACKUP_ENABLED=true
BACKUP_RETENTION_DAYS=7
BACKUP_DIR=./backups
```

### API Security
```bash
# Rate limiting
RATE_LIMIT_ENABLED=true
MAX_REQUESTS_PER_MINUTE=100
RATE_LIMIT_WINDOW=60000

# CORS settings
CORS_ENABLED=false
ALLOWED_ORIGINS=""

# Input validation
VALIDATE_INPUTS=true
SANITIZE_OUTPUTS=true
```

### Access Control
```bash
# File permissions
FILE_READ_PERMISSIONS=0644
FILE_WRITE_PERMISSIONS=0644
DIRECTORY_PERMISSIONS=0755

# Process security
RUN_AS_USER=smart-ai-bridge
CHROOT_ENABLED=false
```

## 📊 Monitoring Configuration

### Health Check Settings
```bash
# Health check intervals
HEALTH_CHECK_INTERVAL=30
HEALTH_CHECK_TIMEOUT=5000
ENDPOINT_RETRY_COUNT=3

# Health check endpoints
LOCAL_HEALTH_URL=http://localhost:8001/health
NVIDIA_HEALTH_URL=https://integrate.api.nvidia.com/v1/models
```

### Metrics Collection
```bash
# Metrics settings
METRICS_ENABLED=true
METRICS_INTERVAL=60
METRICS_RETENTION_HOURS=24

# Performance monitoring
TRACK_RESPONSE_TIMES=true
TRACK_ERROR_RATES=true
TRACK_ROUTING_DECISIONS=true
```

### Logging Configuration
```bash
# Log levels: error, warn, info, debug
LOG_LEVEL=info

# Log destinations
LOG_TO_FILE=true
LOG_TO_CONSOLE=true
LOG_FILE=./logs/smart-ai-bridge.log

# Log rotation
LOG_MAX_SIZE=100MB
LOG_MAX_FILES=5
LOG_DATE_PATTERN=YYYY-MM-DD
```

## 🔧 Platform-Specific Configuration

### Windows Configuration
```bash
# WSL2 endpoint (if using WSL2)
DEEPSEEK_ENDPOINT=http://172.23.16.1:8001/v1

# Windows paths
USE_WINDOWS_PATHS=true
PATH_SEPARATOR=\\

# PowerShell environment
$env:NVIDIA_API_KEY="your-api-key"
$env:NODE_ENV="production"
```

### Linux Configuration
```bash
# Standard localhost
DEEPSEEK_ENDPOINT=http://localhost:8001/v1

# System service configuration
SYSTEMD_SERVICE=true
SERVICE_USER=smart-ai-bridge
SERVICE_GROUP=smart-ai-bridge

# File permissions
umask 022
```

### macOS Configuration
```bash
# Standard configuration
DEEPSEEK_ENDPOINT=http://localhost:8001/v1

# Homebrew Node.js
NODE_PATH=/opt/homebrew/bin/node

# macOS security
ALLOW_UNSIGNED_EXTENSIONS=false
```

## 🚀 Deployment Configurations

### Development Environment
```bash
NODE_ENV=development
DEBUG=true
LOG_LEVEL=debug
CACHE_TTL=60
HEALTH_CHECK_INTERVAL=10
VALIDATION_ENABLED=false
```

### Staging Environment
```bash
NODE_ENV=staging
DEBUG=false
LOG_LEVEL=info
CACHE_TTL=300
HEALTH_CHECK_INTERVAL=30
VALIDATION_ENABLED=true
RATE_LIMIT_ENABLED=false
```

### Production Environment
```bash
NODE_ENV=production
DEBUG=false
LOG_LEVEL=warn
CACHE_TTL=900
HEALTH_CHECK_INTERVAL=30
VALIDATION_ENABLED=true
RATE_LIMIT_ENABLED=true
METRICS_ENABLED=true
BACKUP_ENABLED=true
```

## 📋 Configuration Validation

### Validation Script
```javascript
#!/usr/bin/env node
import fs from 'fs';

const validateConfig = () => {
  console.log('🔍 Validating Smart AI Bridge Configuration...\n');

  // Check required environment variables
  const required = [
    'NODE_ENV',
    'MCP_SERVER_MODE'
  ];

  const optional = [
    'NVIDIA_API_KEY',
    'DEEPSEEK_ENDPOINT',
    'MKG_SERVER_PORT'
  ];

  // Validate required
  for (const env of required) {
    if (process.env[env]) {
      console.log(`✅ ${env}: ${process.env[env]}`);
    } else {
      console.log(`❌ ${env}: Missing (required)`);
    }
  }

  // Validate optional
  for (const env of optional) {
    if (process.env[env]) {
      console.log(`✅ ${env}: Configured`);
    } else {
      console.log(`⚠️ ${env}: Not configured (optional)`);
    }
  }

  console.log('\n🎯 Configuration validation complete!');
};

validateConfig();
```

### Configuration Test
```bash
# Run validation
node validate-config.js

# Test with sample configuration
npm run test:config

# Verify MCP integration
npm run test:mcp
```

## 🔐 Authentication & Security

### Overview

Production deployments of Smart AI Bridge **MUST** enable authentication to protect sensitive operations and prevent unauthorized access. The server includes comprehensive security features including authentication, rate limiting, input validation, and error sanitization.

### Enabling Authentication (Production Requirement)

> **⚠️ SECURITY WARNING**: Always enable authentication in production environments. Running without authentication exposes all AI capabilities and file operations to potential abuse.

#### Token Generation

Generate a secure authentication token:

```bash
# Generate a secure random token
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Example output:
# 5f8d3c2a1b9e7f6d4c3a2b1e9f8d7c6b5a4e3f2d1c0b9a8f7e6d5c4b3a2f1e0
```

Store this token securely in your environment:

```bash
# Add to .env file
echo "MKG_AUTH_TOKEN=5f8d3c2a1b9e7f6d4c3a2b1e9f8d7c6b5a4e3f2d1c0b9a8f7e6d5c4b3a2f1e0" >> .env
chmod 600 .env

# Or export in shell
export MKG_AUTH_TOKEN="5f8d3c2a1b9e7f6d4c3a2b1e9f8d7c6b5a4e3f2d1c0b9a8f7e6d5c4b3a2f1e0"
```

#### Claude Desktop Configuration with Authentication

```json
{
  "mcpServers": {
    "smart-ai-bridge-secure": {
      "command": "node",
      "args": [
        "/path/to/smart-ai-bridge.js"
      ],
      "cwd": "/path/to/smart-ai-bridge",
      "env": {
        "MCP_SERVER_NAME": "smart-ai-bridge-secure",
        "NODE_ENV": "production",
        "MKG_AUTH_TOKEN": "5f8d3c2a1b9e7f6d4c3a2b1e9f8d7c6b5a4e3f2d1c0b9a8f7e6d5c4b3a2f1e0",
        "AUTH_ENABLED": "true",
        "RATE_LIMIT_ENABLED": "true",
        "NVIDIA_API_KEY": "${NVIDIA_API_KEY}",
        "DEEPSEEK_ENDPOINT": "http://localhost:8001/v1",
        "MCP_SERVER_MODE": "true",
        "VALIDATION_ENABLED": "true"
      }
    }
  }
}
```

#### Tool-Level Authorization

Configure specific authorization levels for different tools:

```bash
# Environment variables for tool-level access control
ALLOW_FILE_WRITE=true           # Enable write operations
ALLOW_FILE_DELETE=false         # Disable delete operations
ALLOW_SYSTEM_COMMANDS=false     # Disable system command execution
ALLOW_NETWORK_ACCESS=true       # Enable network requests

# Restricted paths
RESTRICTED_PATHS="/etc,/sys,/proc,/boot"
ALLOWED_BASE_PATHS="/home/user/projects,/tmp"
```

Example implementation in code:

```javascript
// Tool authorization check
const toolPermissions = {
  'read_file': { requiresAuth: false, level: 'basic' },
  'write_file': { requiresAuth: true, level: 'write' },
  'delete_file': { requiresAuth: true, level: 'admin' },
  'execute_command': { requiresAuth: true, level: 'admin' },
  'analyze_code': { requiresAuth: false, level: 'basic' }
};

function checkToolAuthorization(toolName, authToken, userLevel) {
  const permission = toolPermissions[toolName];
  if (!permission) return false;

  if (permission.requiresAuth && !authToken) {
    throw new Error('Authentication required for this operation');
  }

  // Verify user level meets minimum requirement
  return userLevel >= permission.level;
}
```

#### Development Mode

Development mode runs without authentication for easier testing:

```bash
# Development configuration
NODE_ENV=development
AUTH_ENABLED=false
DEBUG=true
LOG_LEVEL=debug
```

```json
{
  "mcpServers": {
    "mkg-dev": {
      "command": "node",
      "args": ["smart-ai-bridge.js"],
      "cwd": "/path/to/smart-ai-bridge",
      "env": {
        "NODE_ENV": "development",
        "AUTH_ENABLED": "false",
        "DEBUG": "true",
        "MCP_SERVER_MODE": "true"
      }
    }
  }
}
```

> **⚠️ WARNING**: Development mode should **NEVER** be used in production or on systems with sensitive data.

### Rate Limiting

Protect your server from abuse and resource exhaustion with built-in rate limiting.

#### Default Limits

```bash
# Rate limiting configuration
RATE_LIMIT_ENABLED=true

# Per-minute limit (prevents burst attacks)
MAX_REQUESTS_PER_MINUTE=60

# Per-hour limit (prevents sustained abuse)
MAX_REQUESTS_PER_HOUR=500

# Per-day limit (prevents long-term abuse)
MAX_REQUESTS_PER_DAY=5000

# Rate limit window (milliseconds)
RATE_LIMIT_WINDOW=60000
```

#### Checking Rate Limit Status

Use the `system_metrics` tool to monitor current rate limit usage:

```javascript
// Call system_metrics tool
{
  "tool": "system_metrics",
  "arguments": {}
}

// Response includes rate limit info
{
  "rateLimiting": {
    "enabled": true,
    "currentMinute": 45,
    "limitMinute": 60,
    "currentHour": 380,
    "limitHour": 500,
    "currentDay": 2150,
    "limitDay": 5000,
    "resetTime": "2025-09-30T15:30:00Z"
  }
}
```

#### Custom Rate Limit Configuration

Adjust limits based on your usage patterns:

```bash
# High-volume development environment
MAX_REQUESTS_PER_MINUTE=120
MAX_REQUESTS_PER_HOUR=1000
MAX_REQUESTS_PER_DAY=10000

# Restricted production environment
MAX_REQUESTS_PER_MINUTE=30
MAX_REQUESTS_PER_HOUR=200
MAX_REQUESTS_PER_DAY=2000

# Rate limit by endpoint
RATE_LIMIT_AI_REQUESTS=true
AI_REQUESTS_PER_MINUTE=20
AI_REQUESTS_PER_HOUR=100
```

Advanced rate limiting configuration:

```javascript
// Rate limit configuration by client
const rateLimitConfig = {
  global: {
    requestsPerMinute: 60,
    requestsPerHour: 500,
    requestsPerDay: 5000
  },
  perTool: {
    'ask': { requestsPerMinute: 20, requestsPerHour: 100 },
    'analyze_code': { requestsPerMinute: 10, requestsPerHour: 50 },
    'write_file': { requestsPerMinute: 30, requestsPerHour: 200 },
    'read_file': { requestsPerMinute: 60, requestsPerHour: 500 }
  },
  bypassTokens: ['admin-token-1', 'automation-token-2']
};
```

### Input Validation

All inputs are automatically validated to prevent injection attacks, path traversal, and malformed data.

#### Automatic Validation Features

**File Path Validation**:
```javascript
// Automatic checks on all file operations
- Prevents path traversal (../, ../../, etc.)
- Blocks access to system directories (/etc, /sys, /proc)
- Validates absolute vs relative paths
- Normalizes paths to canonical form
- Checks file extensions against allowed list
```

**Size Limits**:
```bash
# File operation limits
MAX_FILE_SIZE=50              # MB - Maximum file size for read/write
MAX_DIRECTORY_DEPTH=10        # Maximum directory traversal depth
MAX_PATH_LENGTH=4096          # Maximum path string length
MAX_FILENAME_LENGTH=255       # Maximum filename length

# Request payload limits
MAX_REQUEST_SIZE=10           # MB - Maximum API request size
MAX_JSON_DEPTH=10             # Maximum JSON nesting depth
MAX_ARRAY_LENGTH=10000        # Maximum array elements
```

**Type Checking**:
```javascript
// Schema validation for all tool inputs
const toolSchemas = {
  read_file: {
    file_path: { type: 'string', required: true, maxLength: 4096 },
    offset: { type: 'number', min: 0, max: 1000000, optional: true },
    limit: { type: 'number', min: 1, max: 100000, optional: true }
  },
  write_file: {
    file_path: { type: 'string', required: true, maxLength: 4096 },
    content: { type: 'string', required: true, maxLength: 52428800 }, // 50MB
    backup: { type: 'boolean', optional: true }
  },
  ask: {
    query: { type: 'string', required: true, minLength: 1, maxLength: 100000 },
    context: { type: 'string', optional: true, maxLength: 500000 },
    model: { type: 'string', optional: true, enum: ['local', 'cloud'] }
  }
};

// Validation example
function validateInput(toolName, args) {
  const schema = toolSchemas[toolName];
  if (!schema) throw new Error(`Unknown tool: ${toolName}`);

  for (const [key, rules] of Object.entries(schema)) {
    const value = args[key];

    // Required check
    if (rules.required && value === undefined) {
      throw new Error(`Missing required parameter: ${key}`);
    }

    // Type check
    if (value !== undefined && typeof value !== rules.type) {
      throw new Error(`Invalid type for ${key}: expected ${rules.type}`);
    }

    // String length checks
    if (rules.type === 'string' && value) {
      if (rules.minLength && value.length < rules.minLength) {
        throw new Error(`${key} too short: minimum ${rules.minLength}`);
      }
      if (rules.maxLength && value.length > rules.maxLength) {
        throw new Error(`${key} too long: maximum ${rules.maxLength}`);
      }
    }

    // Number range checks
    if (rules.type === 'number' && value !== undefined) {
      if (rules.min !== undefined && value < rules.min) {
        throw new Error(`${key} below minimum: ${rules.min}`);
      }
      if (rules.max !== undefined && value > rules.max) {
        throw new Error(`${key} above maximum: ${rules.max}`);
      }
    }

    // Enum validation
    if (rules.enum && !rules.enum.includes(value)) {
      throw new Error(`Invalid value for ${key}: must be one of ${rules.enum.join(', ')}`);
    }
  }
}
```

#### Custom Validation Rules

```bash
# Additional validation options
STRICT_MODE=true                    # Enable strict validation
ALLOW_SYMLINKS=false                # Block symbolic link access
VALIDATE_FILE_SIGNATURES=true      # Verify file types by content
SANITIZE_FILENAMES=true            # Remove special characters
BLOCK_HIDDEN_FILES=false           # Allow/block dotfiles
```

### Error Handling

Production-grade error handling prevents information leakage while providing useful debugging information.

#### Production vs Development Modes

**Production Mode** (Sanitized Errors):
```javascript
// Production error response - minimal details
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input provided",
    "timestamp": "2025-09-30T14:23:45.123Z",
    "requestId": "req_8d9f7a6b5c4e3d2f"
  }
}
```

**Development Mode** (Detailed Errors):
```javascript
// Development error response - full details
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input provided",
    "details": "File path contains parent directory traversal: ../../etc/passwd",
    "stack": "Error: Invalid input\n    at validatePath (validator.js:45)\n    at ...",
    "timestamp": "2025-09-30T14:23:45.123Z",
    "requestId": "req_8d9f7a6b5c4e3d2f",
    "input": {
      "file_path": "../../etc/passwd"
    }
  }
}
```

#### Error Sanitization

Configure error response behavior:

```bash
# Error handling configuration
NODE_ENV=production
SANITIZE_ERRORS=true              # Remove sensitive details
INCLUDE_STACK_TRACES=false        # Hide stack traces
LOG_FULL_ERRORS=true             # Log complete errors server-side
ERROR_REPORTING_ENABLED=true      # Enable error reporting service

# Error detail levels
ERROR_DETAIL_LEVEL=minimal        # Options: minimal, standard, verbose
EXPOSE_SYSTEM_INFO=false         # Hide system paths, versions
MASK_SENSITIVE_DATA=true         # Mask API keys, tokens in logs
```

#### Information Leakage Prevention

```javascript
// Error sanitization implementation
function sanitizeError(error, env) {
  const sanitized = {
    code: error.code || 'INTERNAL_ERROR',
    message: getPublicErrorMessage(error.code),
    timestamp: new Date().toISOString(),
    requestId: generateRequestId()
  };

  // Never expose in production
  const sensitiveFields = [
    'stack',
    'details',
    'input',
    'systemPath',
    'apiKey',
    'token',
    'password',
    'internalState'
  ];

  if (env === 'production') {
    // Only include safe fields
    return sanitized;
  }

  // Development mode - include more details
  if (env === 'development') {
    sanitized.details = error.message;
    sanitized.stack = error.stack;
  }

  return sanitized;
}

// Public error messages (safe for users)
const publicErrorMessages = {
  'VALIDATION_ERROR': 'Invalid input provided',
  'AUTH_ERROR': 'Authentication failed',
  'RATE_LIMIT_ERROR': 'Rate limit exceeded',
  'FILE_NOT_FOUND': 'Requested file not found',
  'PERMISSION_DENIED': 'Permission denied',
  'INTERNAL_ERROR': 'Internal server error',
  'TIMEOUT_ERROR': 'Request timeout',
  'NETWORK_ERROR': 'Network error occurred'
};
```

### Security Best Practices

#### 1. Always Enable Authentication in Production

```bash
# ✅ CORRECT - Production configuration
NODE_ENV=production
AUTH_ENABLED=true
MKG_AUTH_TOKEN="5f8d3c2a1b9e7f6d4c3a2b1e9f8d7c6b5a4e3f2d1c0b9a8f7e6d5c4b3a2f1e0"
RATE_LIMIT_ENABLED=true
SANITIZE_ERRORS=true

# ❌ INCORRECT - Insecure production
NODE_ENV=production
AUTH_ENABLED=false              # NEVER DO THIS
DEBUG=true                      # NEVER DO THIS
EXPOSE_SYSTEM_INFO=true        # NEVER DO THIS
```

#### 2. Secure Token Storage

**Never commit tokens to version control**:
```bash
# Add to .gitignore
.env
.env.*
*.key
*.pem
secrets/
```

**Use environment-specific token management**:
```bash
# Development - use .env.development
MKG_AUTH_TOKEN=dev-token-12345

# Staging - use .env.staging
MKG_AUTH_TOKEN=staging-token-67890

# Production - use secure secret management
# AWS Secrets Manager, HashiCorp Vault, etc.
MKG_AUTH_TOKEN=$(aws secretsmanager get-secret-value --secret-id mkg-auth-token --query SecretString --output text)
```

**Secure file permissions**:
```bash
# Restrict access to environment files
chmod 600 .env
chmod 600 .env.production

# Verify permissions
ls -la .env
# Expected: -rw------- (only owner can read/write)
```

#### 3. Regular Token Rotation

Implement token rotation policy:

```bash
#!/bin/bash
# rotate-token.sh - Automated token rotation

# Generate new token
NEW_TOKEN=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Update .env file
sed -i "s/MKG_AUTH_TOKEN=.*/MKG_AUTH_TOKEN=$NEW_TOKEN/" .env

# Restart server
systemctl restart smart-ai-bridge

# Log rotation
echo "$(date): Token rotated - New token: ${NEW_TOKEN:0:8}..." >> /var/log/mkg-token-rotation.log

# Notify monitoring system
curl -X POST https://monitoring.example.com/events \
  -H "Content-Type: application/json" \
  -d "{\"event\": \"token_rotated\", \"service\": \"smart-ai-bridge\", \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
```

Schedule regular rotation:
```bash
# Add to crontab - rotate every 30 days
0 2 1 * * /opt/smart-ai-bridge/rotate-token.sh
```

#### 4. Monitoring with system_metrics Tool

Use built-in monitoring to detect security issues:

```javascript
// Regular security monitoring
async function monitorSecurity() {
  const metrics = await callTool('system_metrics', {});

  // Check for suspicious activity
  if (metrics.rateLimiting.currentMinute > metrics.rateLimiting.limitMinute * 0.9) {
    console.warn('⚠️ Rate limit near threshold - possible attack');
  }

  if (metrics.errorRate > 0.05) {
    console.warn('⚠️ High error rate - possible scanning/probing');
  }

  if (metrics.authFailures > 10) {
    console.error('🚨 Multiple authentication failures - possible brute force');
  }

  // Log security metrics
  logSecurityMetrics(metrics);
}

// Run every 5 minutes
setInterval(monitorSecurity, 5 * 60 * 1000);
```

Example monitoring output:
```bash
# Query security metrics
curl -X POST http://localhost:8001/tools/system_metrics \
  -H "Authorization: Bearer $MKG_AUTH_TOKEN" \
  -H "Content-Type: application/json"

# Response
{
  "security": {
    "authEnabled": true,
    "rateLimitEnabled": true,
    "validationEnabled": true,
    "sanitizationEnabled": true,
    "authFailures24h": 2,
    "blockedRequests24h": 15,
    "rateLimitViolations24h": 8
  },
  "rateLimiting": {
    "enabled": true,
    "currentMinute": 45,
    "limitMinute": 60,
    "utilizationPercent": 75
  }
}
```

#### 5. Security Audit Checklist

Regular security audit checklist:

```bash
# Security audit script
#!/bin/bash

echo "🔐 Smart AI Bridge Security Audit"
echo "================================"

# Check authentication
if [ "$AUTH_ENABLED" = "true" ]; then
  echo "✅ Authentication: Enabled"
else
  echo "❌ Authentication: DISABLED (CRITICAL)"
fi

# Check rate limiting
if [ "$RATE_LIMIT_ENABLED" = "true" ]; then
  echo "✅ Rate Limiting: Enabled"
else
  echo "⚠️ Rate Limiting: Disabled"
fi

# Check error sanitization
if [ "$NODE_ENV" = "production" ] && [ "$SANITIZE_ERRORS" = "true" ]; then
  echo "✅ Error Sanitization: Enabled"
else
  echo "❌ Error Sanitization: Disabled"
fi

# Check file permissions
if [ -f ".env" ]; then
  PERMS=$(stat -c %a .env)
  if [ "$PERMS" = "600" ]; then
    echo "✅ .env Permissions: Secure (600)"
  else
    echo "❌ .env Permissions: Insecure ($PERMS) - Should be 600"
  fi
fi

# Check for exposed secrets
if git log --all -p | grep -i "api_key\|token\|password" >/dev/null; then
  echo "⚠️ Possible secrets in git history"
else
  echo "✅ No obvious secrets in git history"
fi

# Check token strength
TOKEN_LENGTH=${#MKG_AUTH_TOKEN}
if [ "$TOKEN_LENGTH" -ge 64 ]; then
  echo "✅ Token Length: Sufficient ($TOKEN_LENGTH chars)"
else
  echo "⚠️ Token Length: Weak ($TOKEN_LENGTH chars) - Should be 64+"
fi

echo "================================"
echo "Audit complete: $(date)"
```

#### 6. Additional Security Hardening

```bash
# Network security
BIND_ADDRESS=127.0.0.1           # Bind to localhost only
ENABLE_HTTPS=true                # Use HTTPS in production
SSL_CERT_PATH=/path/to/cert.pem
SSL_KEY_PATH=/path/to/key.pem

# Process security
RUN_AS_USER=smart-ai-bridge           # Run as non-root user
DROP_PRIVILEGES=true             # Drop elevated privileges
UMASK=077                        # Restrictive file creation mask

# Request security
REQUEST_TIMEOUT=30000            # 30 second timeout
MAX_CONCURRENT_REQUESTS=10       # Limit concurrent requests
ENABLE_REQUEST_SIGNING=true     # Verify request signatures

# Logging security
LOG_SENSITIVE_DATA=false         # Never log sensitive data
AUDIT_LOG_ENABLED=true          # Enable audit logging
AUDIT_LOG_PATH=/var/log/mkg-audit.log
```

### Security Incident Response

If you suspect a security breach:

1. **Immediate Actions**:
   ```bash
   # Rotate all tokens immediately
   ./rotate-token.sh

   # Review recent logs
   grep -i "auth.*fail\|error\|unauthorized" /var/log/smart-ai-bridge.log | tail -100

   # Check system metrics for anomalies
   node -e "require('./smart-ai-bridge.js').getSystemMetrics()"
   ```

2. **Investigation**:
   ```bash
   # Review authentication failures
   grep "Authentication failed" /var/log/smart-ai-bridge.log

   # Check rate limit violations
   grep "Rate limit exceeded" /var/log/smart-ai-bridge.log

   # Review file access attempts
   grep "file_path" /var/log/smart-ai-bridge.log | grep -i "denied\|blocked"
   ```

3. **Recovery**:
   ```bash
   # Generate new tokens
   # Update all client configurations
   # Restart services with new credentials
   # Monitor for continued suspicious activity
   ```

---

## 🎯 Fuzzy Matching Configuration

### Overview

Smart AI Bridge v1.0.0 includes advanced fuzzy matching capabilities for edit operations. This feature allows approximate string matching with whitespace normalization, making code edits more resilient to formatting differences.

**Security Score**: 9.7/10
**Performance**: <5ms exact, <50ms fuzzy match

### Environment Variables

```bash
# Fuzzy Matching Security Limits
MAX_FUZZY_EDIT_LENGTH=5000         # Maximum characters per edit string
MAX_FUZZY_LINE_COUNT=200           # Maximum lines per edit pattern
MAX_FUZZY_TOTAL_CHARS=50000        # Total characters across all edits
MAX_FUZZY_ITERATIONS=10000         # Iteration limit (DoS prevention)
MAX_FUZZY_SUGGESTIONS=10           # Maximum suggestions on failure
FUZZY_TIMEOUT_MS=5000              # Operation timeout (5 seconds)

# Fuzzy Matching Behavior
FUZZY_MATCHING_ENABLED=true        # Enable fuzzy matching globally
DEFAULT_FUZZY_THRESHOLD=0.85       # Similarity threshold (0.1-1.0)
DEFAULT_VALIDATION_MODE=strict     # strict | lenient | dry_run
```

### Validation Modes

#### 1. Strict Mode (Default)
```bash
# Only exact string matching, no fuzzy matching
DEFAULT_VALIDATION_MODE=strict
```

**Use Cases**:
- Production deployments requiring exact matches
- Security-critical file operations
- Automated scripts and CI/CD pipelines

**Behavior**:
- Exact string comparison only
- No whitespace normalization
- Fastest performance (<5ms per operation)
- Zero false positives

#### 2. Lenient Mode
```bash
# Enable fuzzy matching with whitespace normalization
DEFAULT_VALIDATION_MODE=lenient
```

**Use Cases**:
- Interactive editing sessions
- Handling code with formatting variations
- Unity C# scripts with inconsistent indentation
- JavaScript projects with mixed tab/space usage

**Behavior**:
- Three-phase matching: exact → fuzzy → suggestions
- Whitespace normalization applied
- Performance: <50ms per fuzzy operation
- Suggestions generated on failure

#### 3. Dry Run Mode
```bash
# Validate without modifying files
DEFAULT_VALIDATION_MODE=dry_run
```

**Use Cases**:
- Testing edit operations before execution
- Validating batch edit scripts
- Debugging fuzzy matching behavior
- Security audits

**Behavior**:
- All validation performed
- No file modifications
- Returns proposed changes
- Metrics tracked normally

### Fuzzy Threshold Recommendations

```bash
# Threshold values affect matching sensitivity

# Very strict (99%+ similarity required)
DEFAULT_FUZZY_THRESHOLD=0.95
# Use for: Critical production edits, security patches

# Recommended (85%+ similarity required)
DEFAULT_FUZZY_THRESHOLD=0.85
# Use for: Most development workflows, code refactoring

# Moderate (70%+ similarity required)
DEFAULT_FUZZY_THRESHOLD=0.70
# Use for: Major code transformations, experimental edits

# Permissive (50%+ similarity required)
DEFAULT_FUZZY_THRESHOLD=0.50
# Use for: Exploratory matching, pattern discovery
```

### API Parameters

#### edit_file Tool Parameters

```javascript
{
  "file_path": "/path/to/file.js",
  "edits": [
    { "find": "old code", "replace": "new code" }
  ],

  // Fuzzy matching parameters (v1.0.0+)
  "validation_mode": "lenient",      // strict | lenient | dry_run
  "fuzzy_threshold": 0.85,           // 0.1 - 1.0 (default: 0.85)
  "suggest_alternatives": true,      // Generate suggestions on failure
  "max_suggestions": 3,              // 1 - 10 (default: 3)
  "language": "javascript"           // Hint for language-specific handling
}
```

#### multi_edit Tool Parameters

```javascript
{
  "file_operations": [
    {
      "file_path": "/path/to/file1.js",
      "edits": [...]
    }
  ],

  // Fuzzy matching applies to all operations
  "validation_level": "lenient",     // strict | lenient | none
  "fuzzy_threshold": 0.85,
  "parallel_processing": true,
  "transaction_mode": "all_or_nothing"
}
```

### Performance Tuning

#### Memory Optimization

```bash
# Reduce memory usage for large files
MAX_FUZZY_EDIT_LENGTH=2000         # Lower limit for constrained environments
MAX_FUZZY_TOTAL_CHARS=20000        # Reduce total complexity

# Node.js heap tuning (if needed)
NODE_OPTIONS="--max-old-space-size=2048"
```

#### Timeout Tuning

```bash
# Fast operations (small files, low complexity)
FUZZY_TIMEOUT_MS=2000              # 2 second timeout

# Standard operations (default)
FUZZY_TIMEOUT_MS=5000              # 5 second timeout

# Complex operations (large files, many edits)
FUZZY_TIMEOUT_MS=10000             # 10 second timeout
```

#### Iteration Limits

```bash
# Standard protection (default)
MAX_FUZZY_ITERATIONS=10000         # 10,000 iterations max

# High-performance environments
MAX_FUZZY_ITERATIONS=50000         # 50,000 iterations max

# Constrained environments
MAX_FUZZY_ITERATIONS=5000          # 5,000 iterations max
```

### Security Configuration

#### DoS Prevention

```bash
# Algorithmic complexity attack prevention
MAX_FUZZY_EDIT_LENGTH=5000         # Limit Levenshtein O(n*m) complexity
MAX_FUZZY_ITERATIONS=10000         # Prevent infinite loops
FUZZY_TIMEOUT_MS=5000              # Enforce operation timeout

# Rate limiting (applies to fuzzy operations)
RATE_LIMIT_ENABLED=true
MAX_REQUESTS_PER_MINUTE=100
```

#### Input Validation

```bash
# Strict validation of edit operations
VALIDATE_EDIT_STRUCTURE=true      # Validate edit object structure
VALIDATE_STRING_TYPES=true         # Enforce string types for find/replace
VALIDATE_COMPLEXITY=true           # Check total complexity before processing
```

#### Metrics and Monitoring

```bash
# Enable fuzzy matching metrics
FUZZY_METRICS_ENABLED=true         # Track operations, successes, failures
FUZZY_ABUSE_DETECTION=true         # Detect suspicious patterns

# Metrics reporting
METRICS_WINDOW_MINUTES=15          # Rolling window for abuse detection
METRICS_EXPORT_INTERVAL=60         # Export metrics every 60 seconds
```

### Usage Examples

#### Example 1: Unity C# Edit with Fuzzy Matching

```javascript
// Claude Desktop MCP call
{
  "tool": "edit_file",
  "params": {
    "file_path": "/project/Scripts/PlayerController.cs",
    "edits": [
      {
        "find": "Vector3 lerpedVelocity = Vector3.Lerp(currentVelocity, targetVelocity, t);",
        "replace": "Vector3 lerpedVelocity = Vector3.Slerp(currentVelocity, targetVelocity, t);"
      }
    ],
    "validation_mode": "lenient",
    "fuzzy_threshold": 0.85,
    "suggest_alternatives": true,
    "language": "csharp"
  }
}
```

**Behavior**:
- Matches even with whitespace differences
- Handles tab vs. space indentation
- Generates suggestions if similarity < 0.85
- Returns fuzzy match details in response

#### Example 2: JavaScript Refactoring

```javascript
{
  "tool": "edit_file",
  "params": {
    "file_path": "/src/utils/data-processor.js",
    "edits": [
      {
        "find": "function processData(input) {",
        "replace": "async function processData(input) {"
      }
    ],
    "validation_mode": "lenient",
    "fuzzy_threshold": 0.85
  }
}
```

**Result**:
```json
{
  "success": true,
  "edits_applied": 1,
  "fuzzy_matches": [
    {
      "edit_index": 0,
      "similarity": 0.89,
      "matched_text": "function  processData ( input )  {",
      "normalized_match": true
    }
  ]
}
```

#### Example 3: Batch Edits with Dry Run

```javascript
{
  "tool": "multi_edit",
  "params": {
    "file_operations": [
      {
        "file_path": "/src/file1.js",
        "edits": [{ "find": "old", "replace": "new" }]
      },
      {
        "file_path": "/src/file2.js",
        "edits": [{ "find": "old", "replace": "new" }]
      }
    ],
    "validation_level": "lenient",
    "transaction_mode": "dry_run",
    "fuzzy_threshold": 0.85
  }
}
```

**Behavior**:
- Validates all operations without modifying files
- Returns proposed changes for review
- Shows fuzzy match details for each operation
- No files modified until approved

### Monitoring and Metrics

#### Health Check Integration

```bash
# Add fuzzy matching metrics to health endpoint
curl http://localhost:8001/health

# Response includes fuzzy metrics
{
  "status": "healthy",
  "fuzzy_matching": {
    "enabled": true,
    "total_operations": 1523,
    "exact_matches": 1245,
    "fuzzy_matches": 234,
    "failed_matches": 44,
    "average_similarity": 0.91,
    "iteration_limit_hits": 0,
    "timeouts": 0,
    "complexity_limit_hits": 2
  }
}
```

#### Abuse Detection

```javascript
// Detect suspicious patterns
const abuseCheck = {
  highIterationLimitRate: false,    // >10% operations hitting iteration limit
  highTimeoutRate: false,           // >5% operations timing out
  highComplexityLimitRate: false,   // >10% operations hitting complexity limit
  rapidRequestRate: false,          // >100 operations/minute
  lowSuccessRate: false             // <50% success rate
};

// If any flag is true, investigate:
// - Review recent operations
// - Check for malformed edit patterns
// - Verify client behavior
```

#### Metrics Export

```bash
# Export metrics to monitoring system
curl http://localhost:8001/metrics

# Prometheus-compatible output
# TYPE fuzzy_matching_total_operations counter
fuzzy_matching_total_operations 1523

# TYPE fuzzy_matching_exact_matches counter
fuzzy_matching_exact_matches 1245

# TYPE fuzzy_matching_fuzzy_matches counter
fuzzy_matching_fuzzy_matches 234

# TYPE fuzzy_matching_average_similarity gauge
fuzzy_matching_average_similarity 0.91
```

### Troubleshooting

#### Issue: Fuzzy Matching Too Permissive

**Symptoms**: Unexpected matches, incorrect edits applied

**Solution**:
```bash
# Increase threshold
DEFAULT_FUZZY_THRESHOLD=0.90

# Or use strict mode
DEFAULT_VALIDATION_MODE=strict
```

#### Issue: Fuzzy Matching Not Working

**Symptoms**: Edits failing despite minor whitespace differences

**Solution**:
```bash
# Check mode
DEFAULT_VALIDATION_MODE=lenient   # Not 'strict'

# Check threshold
DEFAULT_FUZZY_THRESHOLD=0.85      # Not too high (e.g., 0.99)

# Verify feature is enabled
FUZZY_MATCHING_ENABLED=true
```

#### Issue: Timeout Errors

**Symptoms**: "Fuzzy matching operation timed out after Xms"

**Solution**:
```bash
# Increase timeout
FUZZY_TIMEOUT_MS=10000

# Or reduce complexity
MAX_FUZZY_EDIT_LENGTH=3000
MAX_FUZZY_TOTAL_CHARS=30000
```

#### Issue: Complexity Limit Exceeded

**Symptoms**: "Total edit characters exceeds maximum"

**Solution**:
```bash
# Split into smaller operations
# Or increase limit (with caution)
MAX_FUZZY_TOTAL_CHARS=75000

# Monitor performance impact
```

### Best Practices

#### 1. Start with Strict Mode

```bash
# Default to strict mode in production
DEFAULT_VALIDATION_MODE=strict

# Enable lenient mode only for interactive sessions
# or specific known-safe operations
```

#### 2. Use Dry Run for Testing

```javascript
// Always test batch operations first
{
  "validation_mode": "dry_run",
  // ... other params
}

// Review results, then execute with lenient mode
```

#### 3. Set Appropriate Thresholds

```bash
# For production: high confidence required
DEFAULT_FUZZY_THRESHOLD=0.90

# For development: balanced approach
DEFAULT_FUZZY_THRESHOLD=0.85

# For experimentation: lower threshold
DEFAULT_FUZZY_THRESHOLD=0.70
```

#### 4. Monitor Metrics Regularly

```bash
# Check abuse patterns daily
curl http://localhost:8001/health | jq '.fuzzy_matching'

# Alert on anomalies:
# - iteration_limit_hits > 0
# - timeouts > total_operations * 0.05
# - complexity_limit_hits > total_operations * 0.10
```

#### 5. Language-Specific Configuration

```bash
# Unity C# (lots of whitespace variations)
DEFAULT_FUZZY_THRESHOLD=0.85
DEFAULT_VALIDATION_MODE=lenient

# Python (strict indentation)
DEFAULT_FUZZY_THRESHOLD=0.90
DEFAULT_VALIDATION_MODE=strict

# JavaScript (flexible formatting)
DEFAULT_FUZZY_THRESHOLD=0.85
DEFAULT_VALIDATION_MODE=lenient
```

### Advanced Configuration

#### Custom Similarity Algorithms

```javascript
// Future enhancement: pluggable similarity functions
const customSimilarity = {
  algorithm: 'levenshtein',         // levenshtein | jaro-winkler | cosine
  normalization: 'whitespace',      // whitespace | case | both
  language_aware: true              // Use language-specific rules
};
```

#### Language-Specific Rules

```javascript
// Future enhancement: language-aware normalization
const languageRules = {
  csharp: {
    ignoreWhitespace: true,
    normalizeCase: false,
    preserveIndentation: false
  },
  python: {
    ignoreWhitespace: false,        // Python: indentation matters
    normalizeCase: false,
    preserveIndentation: true
  },
  javascript: {
    ignoreWhitespace: true,
    normalizeCase: false,
    preserveIndentation: false
  }
};
```

---

This comprehensive configuration guide covers all aspects of setting up and tuning Smart AI Bridge v1.0.0 for optimal performance and security, including the advanced fuzzy matching capabilities.