# API Keys Configuration Template

This template shows how to configure API keys for Smart AI Bridge.

## 🔑 Required API Keys

### NVIDIA Cloud Integration (Recommended)

Sign up at: https://build.nvidia.com/

```bash
NVIDIA_API_KEY="nvapi-YOUR-KEY-HERE"
```

**Endpoints**:
- NVIDIA NVIDIA DeepSeek: For complex reasoning tasks
- NVIDIA Qwen 3 Coder 480B: For advanced coding tasks

**Features**:
- Free tier available
- 65,536 token context (DeepSeek)
- 32,768 token context (Qwen)

### Google Gemini (Optional)

Sign up at: https://makersuite.google.com/app/apikey

```bash
GEMINI_API_KEY="YOUR-GEMINI-KEY-HERE"
```

**Features**:
- 2M token context window
- Fast responses
- Good for analysis tasks

## 🔧 Configuration Methods

### Method 1: Environment File (.env)

Create `.env` in project root:

```bash
# Required for cloud features
NVIDIA_API_KEY=nvapi-YOUR-KEY-HERE

# Optional
GEMINI_API_KEY=YOUR-GEMINI-KEY-HERE

# Server configuration
NODE_ENV=production
MCP_SERVER_MODE=true
```

### Method 2: Claude Desktop MCP Configuration

Edit your Claude Desktop config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "smart-ai-bridge": {
      "command": "node",
      "args": ["/path/to/smart-ai-bridge/smart-ai-bridge.js"],
      "env": {
        "NVIDIA_API_KEY": "nvapi-YOUR-KEY-HERE",
        "GEMINI_API_KEY": "YOUR-GEMINI-KEY-HERE",
        "NODE_ENV": "production",
        "MCP_SERVER_MODE": "true"
      }
    }
  }
}
```

### Method 3: System Environment Variables

Add to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.):

```bash
export NVIDIA_API_KEY="nvapi-YOUR-KEY-HERE"
export GEMINI_API_KEY="YOUR-GEMINI-KEY-HERE"

# Reload shell
source ~/.bashrc
```

## 🔍 Validate Your Configuration

Test your API keys:

```bash
# Test NVIDIA API
curl -H "Authorization: Bearer nvapi-YOUR-KEY-HERE" \
     https://integrate.api.nvidia.com/v1/models

# Test Gemini API (if using)
curl "https://generativelanguage.googleapis.com/v1/models?key=YOUR-GEMINI-KEY-HERE"
```

## 🛡️ Security Best Practices

1. **Never commit API keys to version control**
   ```bash
   # Ensure .env is in .gitignore
   echo ".env" >> .gitignore
   ```

2. **Set restrictive file permissions**
   ```bash
   chmod 600 .env
   ```

3. **Use environment-specific keys**
   - Development keys for testing
   - Production keys for live deployment

4. **Rotate keys regularly**
   - Set calendar reminder for quarterly rotation
   - Revoke old keys after rotation

5. **Monitor usage**
   - Check provider dashboards for unusual activity
   - Set up usage alerts if available

## 📊 Free Tier Limits

### NVIDIA Cloud
- Rate limit: Varies by model
- Check current limits: https://docs.api.nvidia.com/

### Google Gemini
- Free tier: 15 requests/minute
- Paid tier available for higher limits

## 🆘 Troubleshooting

### "Invalid API Key" Error
1. Verify key is copied correctly (no extra spaces)
2. Check if key has been activated in provider dashboard
3. Ensure key has necessary permissions

### "Rate Limit Exceeded" Error
1. Wait 60 seconds and retry
2. Consider upgrading to paid tier
3. Implement request throttling

### "Unauthorized" Error
1. Check API key is set in environment
2. Verify environment variables are loaded
3. Restart your application/Claude Desktop

## 📚 Additional Resources

- [Smart AI Bridge Documentation](./README.md)
- [Configuration Guide](./CONFIGURATION.md)
- [Troubleshooting Guide](./TROUBLESHOOTING-GUIDE.md)

---

**Note**: This is a template file. Your actual API keys should be stored securely in `.env` file or system environment variables, never committed to version control.