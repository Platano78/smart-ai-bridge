# API-KEYS.md

# MKG Server v8.0.0 - API Key Configuration Guide

## 🔑 Working API Key Configurations

### NVIDIA Cloud Integration (Primary)

#### Production NVIDIA API Key (Active)
```bash
NVIDIA_API_KEY="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"
```

**Status**: ✅ Active and validated
**Endpoints**:
- NVIDIA DeepSeek V3.1: `https://integrate.api.nvidia.com/v1/chat/completions`
- NVIDIA Qwen 3 Coder 480B: `https://integrate.api.nvidia.com/v1/chat/completions`

**Usage Limits**:
- Rate limit: 100 requests/minute
- Token limit: 65,536 tokens per request (DeepSeek), 32,768 (Qwen)
- Monthly quota: Check NVIDIA dashboard

#### Testing and Validation
```bash
# Test NVIDIA API connectivity
curl -H "Authorization: Bearer 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" \
     https://integrate.api.nvidia.com/v1/models

# Expected response: List of available models including DeepSeek and Qwen
```

### Local Model Configuration (Primary Processing)

#### Qwen2.5-Coder-7B-FP8-Dynamic Configuration
```bash
# No API key required for local model
DEEPSEEK_ENDPOINT="http://172.23.16.1:8001/v1"
MKG_SERVER_PORT="8001"

# Optional API key for enhanced security
LOCAL_MODEL_API_KEY="your-local-api-key-here"
```

**Container Configuration**:
- Model: `wordslab-org/Qwen2.5-Coder-7B-Instruct-FP8-Dynamic`
- Port: 8001 (internal), 8000 (container)
- Authentication: Optional API key in Docker command

### Optional Cloud Provider Keys

#### DeepSeek Official API (Optional)
```bash
# Optional for direct DeepSeek cloud access
DEEPSEEK_API_KEY="your-deepseek-api-key-here"
DEEPSEEK_ENDPOINT="https://api.deepseek.com/v1/chat/completions"
```

**Setup Instructions**:
1. Register at https://platform.deepseek.com/
2. Navigate to API Keys section
3. Generate new API key
4. Add to environment variables

#### Qwen Cloud API (Optional)
```bash
# Optional for Qwen cloud access
QWEN_CLOUD_API_KEY="your-qwen-cloud-key-here"
QWEN_CLOUD_ENDPOINT="https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation"
```

**Setup Instructions**:
1. Register at Alibaba Cloud DashScope
2. Enable Qwen model access
3. Generate API key
4. Configure endpoint

#### OpenAI API (Fallback)
```bash
# Optional fallback provider
OPENAI_API_KEY="your-openai-api-key-here"
OPENAI_ENDPOINT="https://api.openai.com/v1/chat/completions"
```

## 🔧 Environment Setup Methods

### Method 1: Environment File (.env)
Create `.env` file in project root:
```bash
# Primary NVIDIA Integration
NVIDIA_API_KEY=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

# Local Model Configuration
DEEPSEEK_ENDPOINT=http://172.23.16.1:8001/v1
MKG_SERVER_PORT=8001

# Optional Cloud Providers
DEEPSEEK_API_KEY=your-deepseek-key-here
QWEN_CLOUD_API_KEY=your-qwen-cloud-key-here
OPENAI_API_KEY=your-openai-api-key-here

# Server Configuration
NODE_ENV=production
MCP_SERVER_MODE=true
VALIDATION_ENABLED=true
```

### Method 2: System Environment Variables
```bash
# Add to ~/.bashrc or ~/.profile
export NVIDIA_API_KEY="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"
export DEEPSEEK_ENDPOINT="http://172.23.16.1:8001/v1"
export MKG_SERVER_PORT="8001"

# Reload shell
source ~/.bashrc
```

### Method 3: Docker Environment
```yaml
# In docker-compose.yml
services:
  mkg-server:
    environment:
      - NVIDIA_API_KEY=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
      - DEEPSEEK_ENDPOINT=http://172.23.16.1:8001/v1
      - MKG_SERVER_PORT=8001
```

### Method 4: Claude Desktop MCP Configuration
```json
{
  "mcpServers": {
    "mecha-king-ghidorah-global": {
      "command": "node",
      "args": [
        "/home/platano/project/deepseek-mcp-bridge/server-mecha-king-ghidorah-simplified.js"
      ],
      "cwd": "/home/platano/project/deepseek-mcp-bridge",
      "env": {
        "MCP_SERVER_NAME": "mecha-king-ghidorah-global",
        "NODE_ENV": "production",
        "NVIDIA_API_KEY": "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",
        "DEEPSEEK_API_KEY": "${DEEPSEEK_API_KEY}",
        "QWEN_CLOUD_API_KEY": "${QWEN_CLOUD_API_KEY}",
        "OPENAI_API_KEY": "${OPENAI_API_KEY}",
        "DEEPSEEK_ENDPOINT": "http://172.23.16.1:8001/v1",
        "MCP_SERVER_MODE": "true",
        "MKG_SERVER_PORT": "8001",
        "VALIDATION_ENABLED": "true"
      }
    }
  }
}
```

## 🔍 API Key Validation

### Automated Validation Script
Create `validate-api-keys.js`:
```javascript
#!/usr/bin/env node

import fetch from 'node-fetch';

const validateKeys = async () => {
  console.log('🔍 Validating API Keys...\n');

  // Test NVIDIA API
  try {
    const nvidiaKey = process.env.NVIDIA_API_KEY;
    if (nvidiaKey) {
      const response = await fetch('https://integrate.api.nvidia.com/v1/models', {
        headers: { 'Authorization': `Bearer ${nvidiaKey}` }
      });

      if (response.ok) {
        const models = await response.json();
        console.log('✅ NVIDIA API Key: Valid');
        console.log(`   Available models: ${models.data?.length || 0}`);
      } else {
        console.log('❌ NVIDIA API Key: Invalid or expired');
      }
    } else {
      console.log('⚠️ NVIDIA API Key: Not configured');
    }
  } catch (error) {
    console.log(`❌ NVIDIA API Key: Error - ${error.message}`);
  }

  // Test Local Model
  try {
    const localEndpoint = process.env.DEEPSEEK_ENDPOINT || 'http://172.23.16.1:8001';
    const healthUrl = localEndpoint.replace('/v1', '/health');

    const response = await fetch(healthUrl, { timeout: 5000 });

    if (response.ok) {
      console.log('✅ Local Model: Available');
      console.log(`   Endpoint: ${localEndpoint}`);
    } else {
      console.log('❌ Local Model: Unavailable');
    }
  } catch (error) {
    console.log(`❌ Local Model: Error - ${error.message}`);
  }

  // Test Optional Keys
  const optionalKeys = [
    { name: 'DeepSeek', env: 'DEEPSEEK_API_KEY' },
    { name: 'Qwen Cloud', env: 'QWEN_CLOUD_API_KEY' },
    { name: 'OpenAI', env: 'OPENAI_API_KEY' }
  ];

  for (const key of optionalKeys) {
    if (process.env[key.env]) {
      console.log(`✅ ${key.name} API Key: Configured`);
    } else {
      console.log(`⚠️ ${key.name} API Key: Not configured (optional)`);
    }
  }

  console.log('\n🎯 Validation complete!');
};

validateKeys().catch(console.error);
```

Run validation:
```bash
node validate-api-keys.js
```

## 🛡️ Security Best Practices

### 1. API Key Security
```bash
# Set restrictive permissions on .env file
chmod 600 .env
chown $USER:$USER .env

# Never commit API keys to version control
echo ".env" >> .gitignore
echo "*.key" >> .gitignore
echo "secrets/" >> .gitignore
```

### 2. Key Rotation Strategy
```bash
# Create backup of current configuration
cp .env .env.backup.$(date +%Y%m%d)

# Update keys in environment
# Test new configuration
# Remove old backup after verification
```

### 3. Access Control
```bash
# Create restricted user for MKG server
sudo useradd -r -s /bin/false mkg-server
sudo mkdir -p /etc/mkg-server
sudo chown mkg-server:mkg-server /etc/mkg-server
sudo chmod 700 /etc/mkg-server

# Store sensitive configuration
sudo tee /etc/mkg-server/secrets.env << 'EOF'
NVIDIA_API_KEY=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
EOF

sudo chown mkg-server:mkg-server /etc/mkg-server/secrets.env
sudo chmod 600 /etc/mkg-server/secrets.env
```

## 📊 Usage Monitoring

### API Usage Tracking
Create `monitor-api-usage.js`:
```javascript
#!/usr/bin/env node

import fs from 'fs';

class APIUsageMonitor {
  constructor() {
    this.logFile = './logs/api-usage.log';
    this.stats = {
      nvidia: { requests: 0, tokens: 0, errors: 0 },
      local: { requests: 0, tokens: 0, errors: 0 },
      total: { requests: 0, tokens: 0, errors: 0 }
    };
  }

  logRequest(provider, tokens, success = true) {
    const entry = {
      timestamp: new Date().toISOString(),
      provider,
      tokens,
      success
    };

    // Update stats
    this.stats[provider].requests++;
    this.stats[provider].tokens += tokens;
    this.stats.total.requests++;
    this.stats.total.tokens += tokens;

    if (!success) {
      this.stats[provider].errors++;
      this.stats.total.errors++;
    }

    // Log to file
    fs.appendFileSync(this.logFile, JSON.stringify(entry) + '\n');
  }

  getStats() {
    return {
      ...this.stats,
      nvidia: {
        ...this.stats.nvidia,
        successRate: this.calculateSuccessRate('nvidia')
      },
      local: {
        ...this.stats.local,
        successRate: this.calculateSuccessRate('local')
      },
      total: {
        ...this.stats.total,
        successRate: this.calculateSuccessRate('total')
      }
    };
  }

  calculateSuccessRate(provider) {
    const { requests, errors } = this.stats[provider];
    return requests > 0 ? ((requests - errors) / requests * 100).toFixed(2) + '%' : '0%';
  }
}

export { APIUsageMonitor };
```

### Rate Limiting Configuration
```javascript
// In server configuration
const rateLimits = {
  nvidia: {
    requestsPerMinute: 90, // Buffer below 100 limit
    tokensPerHour: 500000
  },
  local: {
    requestsPerMinute: 1000, // Higher for local model
    tokensPerHour: 10000000
  }
};
```

## 🔧 Troubleshooting API Keys

### Common Issues

#### 1. NVIDIA API Key Issues
```bash
# Test key validity
curl -H "Authorization: Bearer $NVIDIA_API_KEY" \
     https://integrate.api.nvidia.com/v1/models

# Check quota status
curl -H "Authorization: Bearer $NVIDIA_API_KEY" \
     https://integrate.api.nvidia.com/v1/usage

# Common error responses:
# 401: Invalid API key
# 429: Rate limit exceeded
# 403: Quota exceeded
```

#### 2. Local Model Connection Issues
```bash
# Check container status
docker ps | grep qwen3-coder

# Test local endpoint
curl http://localhost:8001/health
curl http://localhost:8001/v1/models

# Check logs
docker logs qwen3-coder-30b-fp8 -f
```

#### 3. Environment Variable Issues
```bash
# Check if variables are loaded
env | grep -E "(NVIDIA|DEEPSEEK|MKG)"

# Test in Node.js
node -e "console.log(process.env.NVIDIA_API_KEY)"

# Verify MCP configuration
node test-claude-desktop-config.js
```

### Emergency Fallback Configuration
```bash
# Minimal working configuration (NVIDIA only)
export NVIDIA_API_KEY="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"
export MCP_SERVER_MODE="true"
export NODE_ENV="production"

# Start with cloud-only mode
node server-mecha-king-ghidorah-simplified.js --cloud-only
```

## 📋 Configuration Checklist

### Pre-Deployment
- [ ] NVIDIA API key configured and validated
- [ ] Local model container running and accessible
- [ ] Environment variables properly set
- [ ] MCP configuration updated
- [ ] API key permissions secured

### Runtime Validation
- [ ] All endpoints responding to health checks
- [ ] Smart routing functioning correctly
- [ ] Rate limits not being exceeded
- [ ] Error handling working for failed requests
- [ ] Fallback mechanisms operational

### Security Verification
- [ ] API keys not exposed in logs
- [ ] File permissions restricted
- [ ] Environment variables not in version control
- [ ] Access controls implemented
- [ ] Key rotation plan documented

## 🎯 Key Management Summary

### Active Configuration
- **Primary**: NVIDIA Cloud API (working key provided)
- **Local**: Qwen2.5-Coder-7B-FP8-Dynamic container on port 8001
- **Fallback**: Optional cloud providers (keys needed)
- **Security**: Environment-based configuration with file restrictions

### Performance Expectations
- **95% Local Processing**: Fast responses from local model
- **5% Cloud Escalation**: Complex tasks to NVIDIA cloud
- **<100ms Routing**: Smart endpoint selection
- **Rate Limit Management**: Automatic throttling and fallback

**API configuration complete - The enhanced monster has its keys!** 🔑🦖