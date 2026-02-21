# Smart AI Bridge v2.0.0 - Troubleshooting Guide

## Overview

This guide covers common issues when running Smart AI Bridge v2.0.0, the modular MCP server with 20 tools, 6 backends, and the intelligence layer. The server entry point is `src/server.js` and it communicates via stdio transport.

---

## Server Startup Issues

### Server Won't Start

**Symptoms:**
```
SyntaxError: Cannot use import statement outside a module
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
```

**Diagnosis and Solutions:**

1. **Check Node.js version** -- v2.0.0 requires Node.js 18.0.0 or later (ESM support).
   ```bash
   node --version
   # Must be >= 18.0.0
   ```

2. **Verify package.json has `"type": "module"`** -- The project uses ESM imports throughout. If this field is missing, Node will treat .js files as CommonJS and fail on `import` statements.

3. **Run npm install** -- Missing dependencies cause module resolution failures.
   ```bash
   cd /home/platano/project/smart-ai-bridge
   npm install
   ```

4. **Check the entry point path** -- The v2.0.0 entry point is `src/server.js`, not the legacy monolithic file.
   ```bash
   # Correct
   node src/server.js

   # Also correct (uses package.json "start" script)
   npm start
   ```

5. **Verify all source files exist** -- The modular architecture requires ~53 files in src/. If files are missing (incomplete clone or checkout), the server will fail on import.
   ```bash
   # Quick check: count source files
   find src -name '*.js' | wc -l
   # Expected: approximately 53
   ```

### Server Starts But No Tools Available

**Symptoms:**
```
[SAB] ListTools: 0 tools available
```

**Solutions:**

1. **Check tool-definitions.js** -- The file `src/tools/tool-definitions.js` exports `CORE_TOOL_DEFINITIONS`. If this file has a syntax error or missing export, no tools will register.

2. **Check handler registration** -- The HandlerFactory at `src/handlers/index.js` must map every handler name referenced in tool definitions. A mismatch between `def.handler` and the factory's registry causes "Unknown tool" errors at call time, but tools will still list.

3. **Check stderr output** -- The server logs to stderr. Look for initialization errors:
   ```bash
   node src/server.js 2>server.log
   cat server.log
   ```

---

## Backend Connection Failures

### Local LLM Not Detected

**Symptoms:**
```
Error: connect ECONNREFUSED 127.0.0.1:8081
Error: Local backend health check failed
```

The local backend expects an OpenAI-compatible API at `http://127.0.0.1:8081/v1/chat/completions` (configured in `src/config/backends.json`).

**Solutions:**

1. **Verify your local LLM server is running** -- Smart AI Bridge supports any OpenAI-compatible server:
   - **LM Studio**: Start the server, check the port in LM Studio settings
   - **llama.cpp server**: `./llama-server -m model.gguf --port 8081`
   - **vLLM**: `python -m vllm.entrypoints.openai.api_server --port 8081`
   - **Ollama**: `ollama serve` (default port 11434, update backends.json accordingly)

2. **Check the port** -- The default in backends.json is 8081. If your LLM server runs on a different port, update the config:
   ```json
   // src/config/backends.json -> backends.local.config.url
   "url": "http://127.0.0.1:YOUR_PORT/v1/chat/completions"
   ```

3. **Test the endpoint directly:**
   ```bash
   curl http://127.0.0.1:8081/v1/models
   ```

4. **WSL networking** -- If running the LLM server on Windows and Smart AI Bridge in WSL, use the Windows host IP instead of 127.0.0.1:
   ```bash
   # Find your Windows host IP
   cat /etc/resolv.conf | grep nameserver
   # Update backends.json with that IP
   ```

5. **Model discovery** -- The local backend uses dynamic model discovery (`src/utils/model-discovery.js`). If the `/v1/models` endpoint is not available on your LLM server, the backend may fail even if `/v1/chat/completions` works. Check that your server exposes the models endpoint.

### NVIDIA API Errors

**Symptoms:**
```
Error: 401 Unauthorized
Error: 429 Too Many Requests
Error: Model not found: deepseek-ai/deepseek-v3.2
```

**Solutions:**

1. **Check API key** -- The NVIDIA backends require `NVIDIA_API_KEY` in your environment:
   ```bash
   echo $NVIDIA_API_KEY
   # Should output your key. If empty:
   export NVIDIA_API_KEY="nvapi-xxxxx"
   ```

2. **Rate limits** -- NVIDIA's free tier has strict rate limits. If you hit 429 errors, the circuit breaker will trip (threshold: 5 failures, reset: 30 seconds per backends.json). Wait for the reset or reduce request frequency.

3. **Model availability** -- Model names change. If `deepseek-ai/deepseek-v3.2` or the Qwen model is unavailable, check the NVIDIA API catalog for current model IDs and update backends.json:
   ```bash
   curl -H "Authorization: Bearer $NVIDIA_API_KEY" \
        https://integrate.api.nvidia.com/v1/models
   ```

4. **Token limits** -- nvidia_deepseek is configured for 8192 max tokens, nvidia_qwen for 32768. Requests exceeding these limits will be rejected by the API. The router should handle this, but forced backend selection can bypass routing limits.

### OpenAI Connection Issues

**Symptoms:**
```
Error: 401 Invalid API key
Error: Connection refused to api.openai.com
```

**Solutions:**

1. **Check API key:**
   ```bash
   echo $OPENAI_API_KEY
   # Must be set. If empty:
   export OPENAI_API_KEY="sk-xxxxx"
   ```

2. **Verify the model exists** -- backends.json specifies `gpt-5.2`. If this model is not available on your OpenAI plan, update the model field in backends.json.

3. **Network access** -- Ensure your environment can reach `api.openai.com`:
   ```bash
   curl https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"
   ```

4. **Billing** -- OpenAI API requires an active billing account. A valid API key with no credits will return 429 or 402 errors.

### Groq Connection Issues

**Symptoms:**
```
Error: 401 Unauthorized (Groq)
Error: Model not available on Groq
```

**Solutions:**

1. **Check API key:**
   ```bash
   echo $GROQ_API_KEY
   # Must be set. If empty:
   export GROQ_API_KEY="gsk_xxxxx"
   ```

2. **Model availability** -- backends.json specifies `llama-3.3-70b-versatile`. Groq periodically rotates available models. Check https://console.groq.com/docs/models for current options and update backends.json if needed.

3. **Rate limits** -- Groq's free tier has aggressive rate limits (requests per minute and tokens per minute). The circuit breaker will trip after 5 consecutive failures.

### Gemini Rate Limiting

**Symptoms:**
```
Error: 429 Resource exhausted
Error: Gemini rate limit exceeded
```

**Solutions:**

1. **Check API key:**
   ```bash
   echo $GEMINI_API_KEY
   # or
   echo $GOOGLE_API_KEY
   ```

2. **Built-in rate limiter** -- Smart AI Bridge includes a Gemini-specific rate limiter at `src/utils/gemini-rate-limiter.js`. If you are hitting limits despite this, the configured rate may be too aggressive for your API tier. The rate limiter parameters can be adjusted in the Gemini adapter.

3. **Quota** -- The Gemini free tier has daily request limits. Check your Google AI Studio dashboard for current quota usage.

---

## Tool Errors

### "Unknown tool" Error

**Symptoms:**
```
McpError: Unknown tool: my_tool. Available: ask, review, analyze_file, ...
```

**Solutions:**

1. **Check tool name** -- v2.0.0 has 20 tools. The complete list:
   - `ask`, `review`, `analyze_file`, `modify_file`, `batch_modify`
   - `explore`, `generate_file`, `refactor`, `write_files_atomic`, `validate_changes`
   - `backup_restore`, `batch_analyze`, `check_backend_health`, `read`
   - `dual_iterate`, `council`, `spawn_subagent`, `parallel_agents`
   - `health`, `clear_all_caches`

2. **Tool names are exact** -- No aliases, no prefixes. Use exactly the names listed above.

### Handler Not Found

**Symptoms:**
```
Error: No handler registered for: someHandler
```

This means the tool definition references a handler name that the HandlerFactory does not recognize.

**Solutions:**

1. Check `src/tools/tool-definitions.js` for the tool's `handler` field.
2. Check `src/handlers/index.js` to confirm that handler name is registered in the factory.
3. If you added a custom tool, ensure both the tool definition and handler registration are in sync.

### Backend Unavailable for Tool

**Symptoms:**
```
Error: No available backend for this request
Error: All backends failed
```

**Solutions:**

1. **Check backend health:**
   ```
   Use the check_backend_health tool to see which backends are online.
   ```

2. **Circuit breaker tripped** -- If a backend has failed 5 consecutive times (configurable in backends.json `fallbackPolicy.circuitBreakerThreshold`), it enters an open state for 30 seconds (`circuitBreakerResetMs`). Wait for the reset or fix the underlying backend issue.

3. **All cloud backends down** -- If your local LLM is not running and all API keys are missing/invalid, no backends will be available. Ensure at least one backend is properly configured.

4. **Forced backend unavailable** -- If a request forces a specific backend (e.g., `backend: "groq"`) and that backend is down, routing cannot fall back. Remove the forced backend or fix the backend.

---

## Module and Import Errors

### ESM Import Failures

**Symptoms:**
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/path/to/src/handlers/index'
SyntaxError: The requested module does not provide an export named 'X'
```

**Solutions:**

1. **File extensions required** -- ESM requires explicit `.js` extensions in import paths. All internal imports should use full paths like `./handlers/index.js`, not `./handlers/index`.

2. **Check for missing files** -- If a git operation or file move left a file missing, imports will fail. Verify the file exists at the expected path.

3. **Circular imports** -- The modular architecture has many cross-references. If you see "Cannot access 'X' before initialization", there may be a circular import. Check the import chain between the affected modules.

### Missing Dependencies

**Symptoms:**
```
Error: Cannot find package '@modelcontextprotocol/sdk'
Error: Cannot find package 'openai'
```

**Solutions:**

```bash
cd /home/platano/project/smart-ai-bridge
npm install
```

Key dependencies and their purposes:
- `@modelcontextprotocol/sdk` -- MCP protocol server and transport
- `openai` -- OpenAI and Groq API client (Groq uses OpenAI-compatible SDK)
- `express` -- Dashboard web server
- `ws` -- WebSocket support
- `diff` -- Diff generation for modify/refactor operations
- `glob` -- File pattern matching for explore/batch tools
- `string-similarity` -- Fuzzy matching in routing and tool resolution
- `tiktoken` -- Token counting for context management
- `acorn` -- JavaScript AST parsing for code analysis

---

## Dashboard Issues

### Dashboard Not Loading

**Symptoms:**
```
Error: listen EADDRINUSE :::3000
Error: Cannot find module 'express'
```

**Solutions:**

1. **Port conflict** -- The dashboard (src/dashboard/dashboard-server.js) binds to a port (default 3000). If another process is using that port:
   ```bash
   # Find what's using the port
   lsof -i :3000
   # Kill it or change the dashboard port
   ```

2. **Express not installed:**
   ```bash
   npm install
   # express is in package.json dependencies
   ```

3. **Dashboard is separate from MCP server** -- The MCP server runs on stdio. The dashboard is an optional Express HTTP server. They are independent processes. Starting the MCP server via `npm start` does not automatically start the dashboard.

---

## Configuration Issues

### backends.json Format Errors

**Symptoms:**
```
SyntaxError: Unexpected token in JSON
Error: Invalid backend configuration
```

**Solutions:**

1. **Validate JSON** -- backends.json must be valid JSON. Common mistakes: trailing commas, unquoted keys, comments (JSON does not support comments).
   ```bash
   node -e "JSON.parse(require('fs').readFileSync('src/config/backends.json'))"
   ```

2. **Required fields per backend:**
   ```json
   {
     "type": "string",       // Backend type identifier
     "enabled": true,        // Must be true to be used
     "priority": 1,          // Lower = higher priority
     "config": {
       "timeout": 60000      // Milliseconds
     }
   }
   ```

3. **Adding a custom backend** -- Add a new entry to `backends.backends` in backends.json, create a corresponding adapter class extending BackendAdapter (`src/backends/backend-adapter.js`), and register it in the BackendRegistry.

### Fallback Policy Tuning

The `fallbackPolicy` section in backends.json controls retry and circuit breaker behavior:

```json
{
  "fallbackPolicy": {
    "maxRetries": 3,                  // Retries per backend before moving to next
    "retryDelayMs": 1000,             // Delay between retries
    "circuitBreakerThreshold": 5,     // Failures before circuit opens
    "circuitBreakerResetMs": 30000    // Time before circuit half-opens
  }
}
```

If you experience cascading failures (one backend down causing slow responses as all retries exhaust), reduce `maxRetries` or `retryDelayMs`. If backends are flapping (briefly failing then recovering), increase `circuitBreakerThreshold`.

---

## Performance Issues

### Slow Tool Responses

**Symptoms:**
- Tool calls taking >30 seconds
- Timeouts on specific backends

**Solutions:**

1. **Check which backend is being used** -- Use `check_backend_health` to see latency per backend. The router may be sending requests to a slow or overloaded backend.

2. **Timeout tuning** -- Each backend has a configurable timeout in backends.json:
   ```json
   "config": {
     "timeout": 60000    // 60 seconds for local
   }
   ```
   Reduce timeouts for backends that should be fast (groq: 30s is already set) and increase for backends that handle large contexts (local: 120s, openai: 120s).

3. **Local LLM performance** -- If the local backend is slow, check GPU utilization. Large models on insufficient VRAM will offload to CPU and become very slow.
   ```bash
   nvidia-smi   # Check GPU memory usage and utilization
   ```

4. **Circuit breaker stuck open** -- If a backend's circuit breaker is open, requests skip it entirely. This can concentrate load on remaining backends. Check health status and wait for reset.

### High Memory Usage

**Solutions:**

1. **Learning engine accumulation** -- The in-memory learning engine, pattern RAG store, and compound learning system accumulate data over time. Restart the server to clear in-memory state.

2. **Conversation threading** -- Long sessions accumulate thread context. The `clear_all_caches` tool can help reset in-memory state.

3. **Background analysis queue** -- The background analysis queue (`src/intelligence/background-analysis-queue.js`) may accumulate pending work. Monitor queue depth and consider rate-limiting background analysis.

---

## Routing Issues

### Wrong Backend Selected

**Symptoms:**
- Simple requests going to expensive cloud backends
- Complex requests routed to local when it cannot handle them

**Solutions:**

1. **Understand the 4-tier routing:**
   - **Forced** -- If the request specifies `backend: "name"`, that backend is used directly
   - **Learning** -- The learning engine suggests a backend based on past success patterns
   - **Rules** -- Complexity thresholds and capability matching determine the backend
   - **Fallback** -- The default backend (local) is used as last resort

2. **Check complexity thresholds** in backends.json:
   ```json
   "routing": {
     "complexityThresholds": {
       "simple": 0.3,
       "medium": 0.6,
       "complex": 0.8
     }
   }
   ```

3. **Force a specific backend** -- For testing, pass `backend: "groq"` (or any backend name) in the tool arguments to bypass routing.

4. **Learning engine interference** -- If the learning engine has learned incorrect patterns (e.g., always preferring a specific backend), restart the server to clear learned data. Persistent learning (planned future feature) will need explicit reset commands.

---

## Environment Variable Reference

All API keys the server may need, depending on which backends are enabled:

```bash
# NVIDIA backends (nvidia_deepseek, nvidia_qwen)
export NVIDIA_API_KEY="nvapi-xxxxx"

# OpenAI backend
export OPENAI_API_KEY="sk-xxxxx"

# Groq backend
export GROQ_API_KEY="gsk_xxxxx"

# Gemini backend
export GEMINI_API_KEY="xxxxx"
# or
export GOOGLE_API_KEY="xxxxx"
```

The local backend requires no API key -- it connects to a local HTTP endpoint.

If a backend's API key is missing, that backend will fail on first use and the circuit breaker will eventually open. The router will then skip it and use other available backends.

---

## Diagnostic Checklist

When something is not working, run through this checklist:

1. **Node.js version** -- `node --version` must be >= 18.0.0
2. **Dependencies installed** -- `npm install` in the project root
3. **Entry point** -- `node src/server.js` (not legacy file)
4. **Environment variables** -- Set API keys for the backends you want to use
5. **Local LLM** -- If using local backend, verify the server is running and accessible
6. **stderr output** -- Run `node src/server.js 2>debug.log` and check debug.log for errors
7. **Backend health** -- Use the `check_backend_health` tool to see per-backend status
8. **Config syntax** -- Validate `src/config/backends.json` is valid JSON
9. **File completeness** -- Verify all src/ files are present (`find src -name '*.js' | wc -l`)
10. **Port conflicts** -- If using dashboard, check port availability with `lsof -i :3000`

---

## Getting Help

- Check stderr output -- the server logs all tool calls, backend selections, and errors to stderr
- Use `check_backend_health` tool for real-time backend status
- Use `health` tool for overall system status
- Review `src/config/backends.json` for all configurable parameters
- Check the project README and CHANGELOG for version-specific notes

---

*Last Updated: February 2026*
*System Version: v2.0.0*
