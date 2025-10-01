# EXAMPLES.md

# Smart AI Bridge v1.0.0 - Usage Examples

## 🎯 Real-World Usage Examples and Patterns

### Basic Tool Usage

#### Code Analysis Examples

**Security Analysis**
```javascript
// Analyze a JavaScript file for security vulnerabilities
await callTool('analyze', {
  content: `
const express = require('express');
const app = express();

app.get('/user/:id', (req, res) => {
  const userId = req.params.id;
  const query = \`SELECT * FROM users WHERE id = \${userId}\`;
  // Direct SQL injection vulnerability
  db.query(query, (err, results) => {
    res.json(results);
  });
});
`,
  analysis_type: 'security',
  language: 'javascript'
});

// Expected output: Detailed security analysis with SQL injection warning
```

**Performance Analysis**
```javascript
// Analyze Python code for performance bottlenecks
await callTool('analyze', {
  content: `
def inefficient_search(data, target):
    for i in range(len(data)):
        for j in range(len(data)):
            if data[i] == target:
                return i
    return -1

def process_large_dataset(dataset):
    results = []
    for item in dataset:
        # Inefficient nested loops
        for other_item in dataset:
            if item['value'] > other_item['value']:
                results.append(item)
    return results
`,
  analysis_type: 'performance',
  language: 'python'
});

// Expected output: Performance bottleneck identification with O(n²) complexity warnings
```

**Comprehensive Code Review**
```javascript
// Full code review with all aspects
await callTool('review', {
  content: `
class UserController {
  constructor(database) {
    this.db = database;
  }

  async createUser(userData) {
    // Missing input validation
    const user = await this.db.users.create(userData);
    return user;
  }

  async getUser(id) {
    // No error handling
    const user = await this.db.users.findById(id);
    return user.password; // Exposing sensitive data
  }
}
`,
  review_type: 'comprehensive',
  file_path: './controllers/UserController.js'
});

// Expected output: Security, performance, and quality issues with recommendations
```

#### Code Generation Examples

**Fill-in-the-Middle Completion**
```javascript
// Generate code completion for a React component
await callTool('generate', {
  prefix: `
import React, { useState, useEffect } from 'react';

const UserProfile = ({ userId }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
`,
  suffix: `
  }, [userId]);

  if (loading) return <div>Loading...</div>;
  if (!user) return <div>User not found</div>;

  return (
    <div className="user-profile">
      <h1>{user.name}</h1>
      <p>{user.email}</p>
    </div>
  );
};
`,
  language: 'javascript'
});

// Expected output: Complete useEffect implementation with API call and error handling
```

**Function Implementation**
```javascript
// Generate a complete sorting algorithm
await callTool('generate', {
  description: 'Implement a quick sort algorithm with optimizations for small arrays',
  language: 'javascript',
  requirements: [
    'Handle edge cases (empty arrays, single elements)',
    'Use insertion sort for small arrays (< 10 elements)',
    'Include performance comments',
    'Add unit test examples'
  ]
});

// Expected output: Complete quicksort implementation with optimizations
```

### Advanced File Operations

#### Intelligent File Editing

**Targeted Code Refactoring**
```javascript
await callTool('edit_file', {
  file_path: './src/components/UserList.jsx',
  edits: [{
    line_start: 15,
    line_end: 25,
    new_content: `
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await userService.getUsers();
      setUsers(response.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
`,
    description: 'Replace inefficient user fetching with proper error handling and loading states'
  }],
  validation_mode: 'comprehensive',
  language: 'javascript'
});

// Expected output: File successfully edited with validation results
```

**Multi-File Refactoring**
```javascript
await callTool('multi_edit', {
  file_operations: [
    {
      action: 'edit',
      file_path: './src/services/userService.js',
      content: `
export class UserService {
  constructor(apiClient) {
    this.api = apiClient;
  }

  async getUsers() {
    return await this.api.get('/users');
  }

  async getUserById(id) {
    return await this.api.get(\`/users/\${id}\`);
  }
}
`
    },
    {
      action: 'create',
      file_path: './src/hooks/useUsers.js',
      content: `
import { useState, useEffect } from 'react';
import { userService } from '../services/userService';

export const useUsers = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await userService.getUsers();
        setUsers(response.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  return { users, loading, error };
};
`
    }
  ],
  transaction_mode: true,
  parallel_processing: true
});

// Expected output: Multiple files created/edited in a single transaction
```

#### Code Validation

**Change Validation**
```javascript
await callTool('validate_changes', {
  file_path: './src/utils/encryption.js',
  proposed_changes: `
// Changed from MD5 to bcrypt for password hashing
import bcrypt from 'bcrypt';

export const hashPassword = async (password) => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

export const verifyPassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};
`,
  validation_rules: ['security', 'performance', 'compatibility'],
  language: 'javascript'
});

// Expected output: Validation results with security improvement confirmation
```

### System Health and Monitoring

#### Comprehensive Health Check
```javascript
await callTool('health', {
  check_type: 'comprehensive'
});

// Expected output:
// {
//   "status": "healthy",
//   "version": "8.0.0",
//   "endpoints": {
//     "local": {
//       "status": "healthy",
//       "model": "Qwen3-Coder-30B-A3B-Instruct-FP8",
//       "responseTime": "45.23ms",
//       "priority": 1
//     },
//     "nvidiaDeepSeek": {
//       "status": "healthy",
//       "model": "NVIDIA-DeepSeek-V3.1",
//       "responseTime": "156.78ms",
//       "priority": 2
//     }
//   },
//   "routing": {
//     "localProcessing": "95%",
//     "cloudEscalation": "5%",
//     "totalRequests": 1247
//   }
// }
```

#### Endpoint-Specific Monitoring
```javascript
await callTool('health', {
  check_type: 'endpoints'
});

// Expected output: Detailed endpoint health with real-time metrics
```

### Backup and Recovery Operations

#### File Backup Management
```javascript
// Create backup before major changes
await callTool('backup_restore', {
  action: 'create',
  file_path: './src/critical-component.js',
  metadata: {
    reason: 'Major refactoring',
    version: '2.1.0',
    author: 'developer'
  }
});

// List available backups
await callTool('backup_restore', {
  action: 'list',
  file_path: './src/critical-component.js'
});

// Restore from backup if needed
await callTool('backup_restore', {
  action: 'restore',
  file_path: './src/critical-component.js',
  backup_id: 'backup_20240319_143022'
});

// Cleanup old backups
await callTool('backup_restore', {
  action: 'cleanup',
  cleanup_options: {
    retain_count: 5,
    max_age_days: 30
  }
});
```

## 🏗️ Configuration Examples

### Local Model Setups

#### Basic Qwen3-Coder Setup
```yaml
# docker-compose.basic.yml
version: '3.8'
services:
  qwen3-coder:
    image: vllm/vllm-openai:latest
    container_name: qwen3-coder-basic
    ports:
      - "8001:8000"
    environment:
      - NVIDIA_VISIBLE_DEVICES=all
    command: [
      "--model", "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8",
      "--host", "0.0.0.0",
      "--port", "8000",
      "--max-model-len", "32768"
    ]
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

#### High-Performance Setup
```yaml
# docker-compose.performance.yml
version: '3.8'
services:
  qwen3-coder-performance:
    image: vllm/vllm-openai:latest
    container_name: qwen3-coder-performance
    ports:
      - "8001:8000"
    environment:
      - NVIDIA_VISIBLE_DEVICES=all
      - CUDA_VISIBLE_DEVICES=0,1
    volumes:
      - model_cache:/root/.cache/huggingface
      - ./config:/app/config:ro
    command: [
      "--model", "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8",
      "--host", "0.0.0.0",
      "--port", "8000",
      "--max-model-len", "32768",
      "--gpu-memory-utilization", "0.90",
      "--tensor-parallel-size", "2",
      "--quantization", "fp8",
      "--enable-lora",
      "--max-loras", "8",
      "--swap-space", "4"
    ]
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "100m"
        max-file: "3"

volumes:
  model_cache:
    driver: local
```

#### Development Setup with Multiple Models
```yaml
# docker-compose.multi-model.yml
version: '3.8'
services:
  qwen3-coder:
    image: vllm/vllm-openai:latest
    container_name: qwen3-coder
    ports:
      - "8001:8000"
    command: ["--model", "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8"]

  qwen25-coder:
    image: vllm/vllm-openai:latest
    container_name: qwen25-coder
    ports:
      - "8002:8000"
    command: ["--model", "Qwen/Qwen2.5-Coder-7B-Instruct"]

  deepseek-lite:
    image: vllm/vllm-openai:latest
    container_name: deepseek-lite
    ports:
      - "8003:8000"
    command: ["--model", "deepseek-ai/deepseek-coder-6.7b-instruct"]
```

### Environment Configurations

#### Development Environment
```bash
# .env.development
NODE_ENV=development
MCP_SERVER_MODE=true
DEBUG=true
LOG_LEVEL=debug

# Local model (development)
DEEPSEEK_ENDPOINT=http://localhost:8001/v1
MKG_SERVER_PORT=8001

# Optional cloud providers for testing
NVIDIA_API_KEY=your-dev-api-key

# Development settings
CACHE_TTL=60
HEALTH_CHECK_INTERVAL=10
VALIDATION_ENABLED=false
MAX_CONCURRENT_REQUESTS=5
```

#### Staging Environment
```bash
# .env.staging
NODE_ENV=staging
MCP_SERVER_MODE=true
DEBUG=false
LOG_LEVEL=info

# Staging model endpoint
DEEPSEEK_ENDPOINT=http://staging-model:8001/v1
MKG_SERVER_PORT=8001

# Cloud providers
NVIDIA_API_KEY=your-staging-api-key
DEEPSEEK_API_KEY=your-staging-deepseek-key

# Staging settings
CACHE_TTL=300
HEALTH_CHECK_INTERVAL=30
VALIDATION_ENABLED=true
MAX_CONCURRENT_REQUESTS=8
RATE_LIMIT_ENABLED=true
```

#### Production Environment
```bash
# .env.production
NODE_ENV=production
MCP_SERVER_MODE=true
DEBUG=false
LOG_LEVEL=warn

# Production model endpoint
DEEPSEEK_ENDPOINT=http://production-model:8001/v1
MKG_SERVER_PORT=8001

# Cloud providers with production keys
NVIDIA_API_KEY=your-production-nvidia-key
DEEPSEEK_API_KEY=your-production-deepseek-key
OPENAI_API_KEY=your-production-openai-key

# Production settings
CACHE_TTL=900
HEALTH_CHECK_INTERVAL=30
VALIDATION_ENABLED=true
MAX_CONCURRENT_REQUESTS=20
RATE_LIMIT_ENABLED=true
MAX_REQUESTS_PER_MINUTE=200
METRICS_ENABLED=true
BACKUP_ENABLED=true
```

### Claude Desktop Configurations

#### Basic Setup
```json
{
  "mcpServers": {
    "mkg-server": {
      "command": "node",
      "args": ["smart-ai-bridge.js"],
      "cwd": "/path/to/mkg-server"
    }
  }
}
```

#### Development Setup
```json
{
  "mcpServers": {
    "mkg-dev": {
      "command": "node",
      "args": ["smart-ai-bridge.js"],
      "cwd": "/home/developer/mkg-server",
      "env": {
        "NODE_ENV": "development",
        "DEBUG": "true",
        "LOG_LEVEL": "debug",
        "MCP_SERVER_MODE": "true",
        "DEEPSEEK_ENDPOINT": "http://localhost:8001/v1"
      }
    }
  }
}
```

#### Production Setup with Multiple Endpoints
```json
{
  "mcpServers": {
    "mkg-production": {
      "command": "node",
      "args": [
        "/opt/smart-ai-bridge/smart-ai-bridge.js"
      ],
      "cwd": "/opt/mkg-server",
      "env": {
        "MCP_SERVER_NAME": "mkg-production",
        "NODE_ENV": "production",
        "NVIDIA_API_KEY": "${NVIDIA_API_KEY}",
        "DEEPSEEK_API_KEY": "${DEEPSEEK_API_KEY}",
        "OPENAI_API_KEY": "${OPENAI_API_KEY}",
        "DEEPSEEK_ENDPOINT": "http://localhost:8001/v1",
        "MCP_SERVER_MODE": "true",
        "MKG_SERVER_PORT": "8001",
        "VALIDATION_ENABLED": "true",
        "MAX_CONCURRENT_REQUESTS": "20",
        "CACHE_TTL": "900",
        "METRICS_ENABLED": "true"
      }
    }
  }
}
```

#### Team Setup with Shared Configuration
```json
{
  "mcpServers": {
    "mkg-team": {
      "command": "node",
      "args": [
        "/shared/smart-ai-bridge/smart-ai-bridge.js"
      ],
      "cwd": "/shared/mkg-server",
      "env": {
        "MCP_SERVER_NAME": "mkg-team",
        "NODE_ENV": "production",
        "NVIDIA_API_KEY": "team-nvidia-key",
        "DEEPSEEK_ENDPOINT": "http://team-model-server:8001/v1",
        "MCP_SERVER_MODE": "true",
        "VALIDATION_ENABLED": "true",
        "BACKUP_ENABLED": "true",
        "TEAM_MODE": "true"
      }
    }
  }
}
```

## 🎮 Game Development Examples

### Unity C# Analysis
```javascript
await callTool('analyze', {
  content: `
using UnityEngine;
using System.Collections.Generic;

public class PlayerController : MonoBehaviour
{
    public float moveSpeed = 5f;
    private List<GameObject> enemies = new List<GameObject>();

    void Update()
    {
        // Performance issue: Find all enemies every frame
        enemies = new List<GameObject>(GameObject.FindGameObjectsWithTag("Enemy"));

        Vector3 movement = new Vector3(Input.GetAxis("Horizontal"), 0, Input.GetAxis("Vertical"));
        transform.Translate(movement * moveSpeed * Time.deltaTime);

        // Inefficient distance checking
        foreach(GameObject enemy in enemies)
        {
            if(Vector3.Distance(transform.position, enemy.transform.position) < 2f)
            {
                // Handle collision
                Debug.Log("Hit enemy!");
            }
        }
    }
}
`,
  analysis_type: 'performance',
  language: 'csharp'
});
```

### React Component Generation
```javascript
await callTool('generate', {
  description: 'Create a reusable data table component with sorting, filtering, and pagination',
  language: 'javascript',
  framework: 'react',
  requirements: [
    'TypeScript support',
    'Sortable columns',
    'Search/filter functionality',
    'Pagination with page size options',
    'Responsive design',
    'Accessibility features'
  ]
});
```

## 🔧 Workflow Examples

### Code Review Workflow
```javascript
// Step 1: Analyze code for issues
const analysis = await callTool('analyze', {
  content: sourceCode,
  analysis_type: 'comprehensive',
  language: 'javascript'
});

// Step 2: Review with specific focus
const review = await callTool('review', {
  content: sourceCode,
  review_type: 'security',
  file_path: './src/auth.js'
});

// Step 3: Generate improvements
const improvements = await callTool('generate', {
  description: 'Fix the security issues identified in the review',
  context: review,
  language: 'javascript'
});

// Step 4: Apply changes
const editResult = await callTool('edit_file', {
  file_path: './src/auth.js',
  edits: improvements.edits,
  validation_mode: 'comprehensive'
});

// Step 5: Validate changes
const validation = await callTool('validate_changes', {
  file_path: './src/auth.js',
  proposed_changes: editResult.content,
  validation_rules: ['security', 'functionality']
});
```

### Refactoring Workflow
```javascript
// Step 1: Backup original files
await callTool('backup_restore', {
  action: 'create',
  file_path: './src/legacy-component.js',
  metadata: { reason: 'Major refactoring to hooks' }
});

// Step 2: Analyze current implementation
const analysis = await callTool('analyze', {
  content: legacyCode,
  analysis_type: 'structure',
  language: 'javascript'
});

// Step 3: Generate modern implementation
const modernCode = await callTool('generate', {
  description: 'Convert class component to functional component with hooks',
  context: analysis,
  language: 'javascript'
});

// Step 4: Apply changes with validation
await callTool('edit_file', {
  file_path: './src/legacy-component.js',
  edits: [{
    line_start: 1,
    line_end: -1, // Replace entire file
    new_content: modernCode
  }],
  validation_mode: 'comprehensive'
});

// Step 5: Verify the refactoring
const validation = await callTool('validate_changes', {
  file_path: './src/legacy-component.js',
  validation_rules: ['functionality', 'performance', 'maintainability']
});
```

### Team Development Workflow
```javascript
// Developer 1: Initial analysis
const requirements = await callTool('analyze', {
  content: projectSpec,
  analysis_type: 'dependencies',
  language: 'javascript'
});

// Developer 2: Implementation planning
const architecture = await callTool('generate', {
  description: 'Design component architecture based on requirements',
  context: requirements,
  language: 'javascript'
});

// Developer 3: Code implementation
const implementation = await callTool('multi_edit', {
  file_operations: [
    {
      action: 'create',
      file_path: './src/components/FeatureA.jsx',
      content: architectureA
    },
    {
      action: 'create',
      file_path: './src/components/FeatureB.jsx',
      content: architectureB
    }
  ],
  parallel_processing: true
});

// Code review by team lead
const teamReview = await callTool('review', {
  content: implementation.results,
  review_type: 'comprehensive',
  context: 'Team code review for new features'
});
```

These examples demonstrate the full range of Smart AI Bridge capabilities, from simple code analysis to complex multi-file operations and team workflows.