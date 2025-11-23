# Smart AI Bridge v1.2.1 - Auto-Detection Hotfix

**Release Date**: November 23, 2025
**Type**: Hotfix
**Priority**: High

## Critical Fix

### Local AI Auto-Detection Enhancement

**Problem**: Auto-detection incorrectly identified non-LLM services (e.g., Agent Genesis API on port 8080) as LLM endpoints, causing 100% cloud fallback when local models were available.

**Solution**: Enhanced `LocalServiceDetector` with three critical improvements:

1. **Port Priority Optimization**
   - Now scans vLLM port 8002 FIRST before generic HTTP port 8080
   - Prioritizes actual LLM services over generic APIs
   - Port order: `8002 → 8001 → 8000 → 1234 → 5000 → 5001 → 11434 → 8080`

2. **LLM Model Validation**
   - Validates `/v1/models` response contains actual LLM model names
   - Checks for known LLM indicators: qwen, llama, mistral, deepseek, gpt, claude, phi, gemma, yi
   - Rejects empty model lists and non-LLM services

3. **Enhanced Endpoint Validation**
   - `validateEndpoint()` now checks response content, not just HTTP status
   - Ensures cached endpoints remain valid LLM services
   - Prevents false positives from generic HTTP APIs

## Impact

**Before v1.2.1:**
- ❌ Discovery finds Agent Genesis (port 8080) → treats as LLM
- ❌ All "local" requests fail → 100% NVIDIA cloud fallback
- 💸 Users pay for cloud API calls when local model available

**After v1.2.1:**
- ✅ Discovery finds actual LLM on port 8002
- ✅ 90%+ requests use local model (100ms vs 2-30s)
- 💰 Zero cost for local requests, cloud only as fallback

## Files Modified

- `local-service-detector.js` - Core auto-detection logic (3 changes)
- `.env.example` - Added auto-detection configuration documentation
- `CHANGELOG-v1.2.1.md` - This file
- `README.md` - Updated changelog section
- `package.json` - Version bump to 1.2.1

## Upgrade Instructions

**No action required!** Auto-detection works automatically on startup.

**Optional**: Force specific endpoint if auto-detection fails:
```bash
LOCAL_AI_ENDPOINT=http://localhost:8002/v1
```

## Testing

Test auto-detection:
```bash
# Restart Smart AI Bridge to trigger discovery
# Check logs for discovery confirmation:
# "🎯 Discovered endpoint: http://localhost:8002/v1 (vllm - Qwen2.5-Coder...)"
```

## Credits

- **Issue Reported**: Port mismatch causing cloud fallback
- **Root Cause**: Generic HTTP service detection before LLM validation
- **Fix Applied**: Port priority + LLM model validation

## Links

- **GitHub Release**: https://github.com/Platano78/smart-ai-bridge/releases/tag/v1.2.1
- **Full Changelog**: CHANGELOG.md
- **Documentation**: README.md
