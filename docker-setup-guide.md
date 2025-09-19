# Docker Setup Guide for WSL2

This guide helps you set up Docker Desktop with WSL2 integration to run the Qwen2.5-Coder-7B container.

## Current Status

Docker Desktop is installed but WSL2 integration needs to be enabled.

## Setup Steps

### 1. Enable WSL2 Integration in Docker Desktop

1. **Open Docker Desktop** on Windows
2. Go to **Settings** (gear icon)
3. Navigate to **Resources** → **WSL Integration**
4. Enable **"Enable integration with my default WSL distro"**
5. Enable integration for your specific WSL2 distribution
6. Click **"Apply & Restart"**

### 2. Verify Docker is Working

After Docker Desktop restarts, test in WSL2:

```bash
# Test basic Docker command
docker --version

# Test Docker daemon
docker ps

# Test Docker Compose
docker-compose --version
```

### 3. Start the Qwen2.5-Coder-7B Container

Once Docker is working, run:

```bash
# Navigate to project directory
cd /home/platano/project/deepseek-mcp-bridge

# Start the container
./start-qwen25-coder-7b-8001.sh

# Verify it's working
./verify-qwen25-coder-7b-8001.sh
```

## Container Configuration

The new container configuration includes:

- **Model**: `wordslab-org/Qwen2.5-Coder-7B-Instruct-FP8-Dynamic`
- **Port**: 8001 (maps to container port 8000)
- **Context**: 131K tokens with YARN scaling
- **GPU**: 90% utilization optimized for RTX 5080 16GB
- **Quantization**: FP8 for optimal VRAM usage

## Files Created

1. **docker-compose.qwen2.5-coder-7b-8001.yml** - Main container configuration
2. **.env.qwen25-coder-7b-8001** - Environment variables
3. **start-qwen25-coder-7b-8001.sh** - Automated startup script
4. **verify-qwen25-coder-7b-8001.sh** - Verification and testing script

## Troubleshooting

### If Docker commands still fail:

1. **Restart WSL2**:
   ```bash
   # From Windows PowerShell (as Administrator)
   wsl --shutdown
   wsl
   ```

2. **Restart Docker Desktop** completely

3. **Check WSL2 integration** is enabled for the correct distribution

4. **Alternative**: Use Docker commands through Windows:
   ```bash
   # From WSL2, call Windows Docker directly
   /mnt/c/Program\ Files/Docker/Docker/resources/bin/docker.exe ps
   ```

### If container fails to start:

1. Check GPU availability: `nvidia-smi`
2. Verify port 8001 is free: `ss -tulpn | grep 8001`
3. Check Docker logs: `docker logs qwen25-coder-7b-8001`
4. Ensure model cache directory exists: `ls -la model_cache/`

## Next Steps

Once Docker is working:

1. Run `./start-qwen25-coder-7b-8001.sh` to start the container
2. Run `./verify-qwen25-coder-7b-8001.sh` to verify everything is working
3. The API will be available at `http://localhost:8001`
4. Test with the verification script's built-in tests

## Configuration Details

The container uses the proven configuration from `docker-compose.yarn-128k-production.yml` with these optimizations:

- **YARN rope scaling** for 131K context window
- **FP8 quantization** for memory efficiency
- **Prefix caching** for performance
- **90% GPU utilization** for RTX 5080 16GB VRAM
- **Health checks** and automatic restart
- **Persistent model caching** to avoid re-downloads