# Port 8001 Container Replacement Setup

This documentation covers the complete setup and validation system for replacing the container on port 8001 with optimized configurations.

## Quick Start

```bash
# Run complete setup and testing
node startup-and-testing-procedures.js

# Quick restart container
node startup-and-testing-procedures.js quick-restart

# Quick health check
node startup-and-testing-procedures.js quick-health

# View container logs
node startup-and-testing-procedures.js logs 100
```

## Files Created

### Environment Configuration
- **`.env.port-8001-production`** - Combined YARN 128K + NVIDIA API configuration
- **`.mcp.json`** - Updated Claude Code configuration with NVIDIA API key

### Validation Scripts
- **`validate-port-8001-container.js`** - Container health validation
- **`test-model-inference-port-8001.js`** - Model inference testing
- **`test-mkg-server-connectivity.js`** - MKG server connectivity validation
- **`test-nvidia-api-integration.js`** - NVIDIA API integration testing
- **`startup-and-testing-procedures.js`** - Main orchestrator

## Configuration Details

### Environment Variables
```env
# Container Configuration
CONTAINER_PORT=8001
MODEL_NAME=wordslab-org/Qwen2.5-Coder-7B-Instruct-FP8-Dynamic

# YARN 128K Settings
VLLM_MAX_MODEL_LEN=131072
VLLM_ROPE_SCALING_FACTOR=4.0
VLLM_GPU_MEMORY_UTILIZATION=0.90

# NVIDIA API (Working Key)
NVIDIA_API_KEY=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
```

### Claude Code Integration
The `.mcp.json` has been updated with:
- Working NVIDIA API key
- Port 8001 endpoint configuration
- Validation enabled flag

## Validation Process

### 1. Container Health Validation
- ✅ Container running status
- ✅ Health endpoint response
- ✅ Models API availability
- ✅ Basic inference test
- ✅ NVIDIA API fallback

### 2. Model Inference Testing
- ✅ Basic mathematical reasoning
- ✅ Code generation capability
- ✅ Long context handling (YARN 128K)
- ✅ Streaming response support
- ⏱️ Performance benchmarking

### 3. MKG Server Connectivity
- ✅ Triple endpoint status
- ✅ Local endpoint routing (port 8001)
- ✅ NVIDIA endpoints connectivity
- ✅ Smart routing logic
- ✅ Fallback mechanism testing

### 4. NVIDIA API Integration
- ✅ API key validation
- ✅ Model availability check
- ✅ DeepSeek V3 inference
- ✅ Qwen 3 Coder inference
- ✅ Streaming support
- ✅ Rate limiting behavior
- ✅ Error handling

## Usage Examples

### Manual Container Management
```bash
# Start container
docker compose -f docker-compose.yarn-128k-production.yml up -d

# Check status
docker ps --filter "name=yarn-128k-production"

# View logs
docker logs yarn-128k-production

# Stop container
docker stop yarn-128k-production
```

### Individual Test Scripts
```bash
# Test container health
node validate-port-8001-container.js

# Test model inference
node test-model-inference-port-8001.js

# Test MKG connectivity
node test-mkg-server-connectivity.js

# Test NVIDIA API
node test-nvidia-api-integration.js
```

### Test API Endpoints Directly
```bash
# Health check
curl http://localhost:8001/health

# Models list
curl http://localhost:8001/v1/models

# Simple inference
curl -X POST http://localhost:8001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen2.5-coder-7b-fp8-dynamic",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 50
  }'
```

## Troubleshooting

### Container Won't Start
1. Check Docker and GPU drivers: `nvidia-smi`
2. Verify model cache directory exists
3. Check port 8001 is not in use: `lsof -i :8001`
4. Review Docker logs: `docker logs yarn-128k-production`

### Model Loading Issues
1. Allow 2-5 minutes for initial model download/loading
2. Monitor GPU memory usage: `nvidia-smi`
3. Check available disk space in model cache
4. Verify VLLM configuration parameters

### MKG Server Issues
1. Check Claude Code MCP server status
2. Verify environment variables in `.mcp.json`
3. Test endpoints individually
4. Review MCP server logs

### NVIDIA API Issues
1. Verify API key is valid and has quota
2. Check network connectivity to NVIDIA servers
3. Monitor rate limiting (429 errors)
4. Test with simpler prompts first

## Performance Expectations

### Container Startup Time
- **Cold start**: 3-5 minutes (model download + loading)
- **Warm start**: 30-60 seconds (model already cached)

### Inference Performance
- **Simple queries**: 100-500ms
- **Code generation**: 1-3 seconds
- **Long context**: 5-15 seconds
- **Streaming**: Real-time token generation

### Resource Usage
- **GPU Memory**: ~6-8GB (90% utilization configured)
- **System RAM**: ~4-6GB
- **Disk Space**: ~15-20GB for model cache

## Reports Generated

All test scripts generate detailed JSON reports:
- `port-8001-validation-report.json` - Container health
- `model-inference-test-report.json` - Model performance
- `mkg-connectivity-test-report.json` - MKG server status
- `nvidia-api-integration-report.json` - NVIDIA API status
- `startup-testing-comprehensive-report.json` - Overall summary

## Next Steps

After successful validation:
1. **Monitor Performance**: Set up monitoring for the container
2. **Load Testing**: Test with realistic workloads
3. **Backup Strategy**: Configure model cache backups
4. **Scaling**: Consider horizontal scaling if needed
5. **Alerting**: Set up alerts for failures

## Support

For issues with:
- **Container**: Check Docker and NVIDIA driver setup
- **Model**: Verify GPU resources and model configuration
- **MKG Server**: Review Claude Code MCP configuration
- **NVIDIA API**: Check API key and quota status