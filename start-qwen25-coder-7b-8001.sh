#!/bin/bash

# Qwen2.5-Coder-7B Container Setup Script for Port 8001
# This script replaces any existing container on port 8001 with the proven working configuration

set -e

echo "=== Qwen2.5-Coder-7B Container Setup for Port 8001 ==="
echo "Model: wordslab-org/Qwen2.5-Coder-7B-Instruct-FP8-Dynamic"
echo "Configuration: YARN 131K context, 90% GPU utilization"
echo "Target: RTX 5080 16GB VRAM"
echo

# Configuration
PROJECT_DIR="/home/platano/project/deepseek-mcp-bridge"
COMPOSE_FILE="docker-compose.qwen2.5-coder-7b-8001.yml"
ENV_FILE=".env.qwen25-coder-7b-8001"
CONTAINER_NAME="qwen25-coder-7b-8001"
HOST_PORT="8001"

# Change to project directory
cd "$PROJECT_DIR"

# Function to check if Docker is available
check_docker() {
    if ! command -v docker &> /dev/null; then
        echo "❌ Docker not found. Please ensure Docker Desktop is running and WSL integration is enabled."
        echo "   Follow: https://docs.docker.com/go/wsl2/"
        exit 1
    fi
}

# Function to stop existing containers on port 8001
stop_existing_containers() {
    echo "🔍 Checking for existing containers on port 8001..."

    # Find containers using port 8001
    EXISTING_CONTAINERS=$(docker ps --filter "publish=8001" --format "{{.Names}}" 2>/dev/null || true)

    if [ ! -z "$EXISTING_CONTAINERS" ]; then
        echo "🛑 Stopping existing containers on port 8001:"
        echo "$EXISTING_CONTAINERS"

        for container in $EXISTING_CONTAINERS; do
            echo "   Stopping $container..."
            docker stop "$container" || true
            echo "   Removing $container..."
            docker rm "$container" || true
        done
    else
        echo "✅ No existing containers found on port 8001"
    fi
}

# Function to create necessary directories and networks
setup_environment() {
    echo "🔧 Setting up environment..."

    # Create model cache directory if it doesn't exist
    if [ ! -d "model_cache" ]; then
        echo "   Creating model cache directory..."
        mkdir -p model_cache
    fi

    # Create or ensure vllm-network exists
    echo "   Setting up Docker network..."
    docker network create vllm-network 2>/dev/null || echo "   Network vllm-network already exists"
}

# Function to pull the latest vLLM image
pull_image() {
    echo "📥 Pulling latest vLLM image..."
    docker pull vllm/vllm-openai:latest
}

# Function to start the new container
start_container() {
    echo "🚀 Starting Qwen2.5-Coder-7B container..."

    # Load environment variables
    if [ -f "$ENV_FILE" ]; then
        echo "   Loading environment from $ENV_FILE"
        export $(cat "$ENV_FILE" | grep -v '^#' | xargs)
    fi

    # Start the container using docker-compose
    docker-compose -f "$COMPOSE_FILE" up -d

    echo "   Container started: $CONTAINER_NAME"
}

# Function to wait for container health
wait_for_health() {
    echo "⏳ Waiting for container to be healthy..."

    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        echo "   Health check attempt $attempt/$max_attempts..."

        # Check if container is running
        if docker ps --filter "name=$CONTAINER_NAME" --filter "status=running" | grep -q "$CONTAINER_NAME"; then
            # Check health endpoint
            if curl -s -f "http://localhost:$HOST_PORT/health" >/dev/null 2>&1; then
                echo "✅ Container is healthy and responding on port $HOST_PORT"
                return 0
            fi
        fi

        sleep 10
        ((attempt++))
    done

    echo "❌ Container failed to become healthy within $(($max_attempts * 10)) seconds"
    echo "📋 Container logs:"
    docker logs "$CONTAINER_NAME" --tail 50
    return 1
}

# Function to verify model loading
verify_model() {
    echo "🔍 Verifying model is loaded..."

    # Test the models endpoint
    if curl -s "http://localhost:$HOST_PORT/v1/models" | grep -q "qwen2.5-coder-7b-fp8-dynamic"; then
        echo "✅ Model qwen2.5-coder-7b-fp8-dynamic is loaded and available"

        # Show model info
        echo "📊 Model information:"
        curl -s "http://localhost:$HOST_PORT/v1/models" | jq '.' 2>/dev/null || curl -s "http://localhost:$HOST_PORT/v1/models"
    else
        echo "❌ Model verification failed"
        return 1
    fi
}

# Function to show container status
show_status() {
    echo
    echo "=== Container Status ==="
    docker ps --filter "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

    echo
    echo "=== Quick Test ==="
    echo "Model API: http://localhost:$HOST_PORT/v1/models"
    echo "Health endpoint: http://localhost:$HOST_PORT/health"
    echo "OpenAI-compatible endpoint: http://localhost:$HOST_PORT/v1/chat/completions"

    echo
    echo "=== Resource Usage ==="
    docker stats "$CONTAINER_NAME" --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"
}

# Main execution
main() {
    echo "Starting container replacement process..."

    check_docker
    stop_existing_containers
    setup_environment
    pull_image
    start_container

    if wait_for_health; then
        verify_model
        show_status
        echo
        echo "🎉 Successfully deployed Qwen2.5-Coder-7B on port 8001!"
        echo "   The container is using the proven YARN 131K context configuration"
        echo "   Optimized for RTX 5080 16GB VRAM with 90% GPU utilization"
    else
        echo "❌ Deployment failed. Check the logs above for details."
        exit 1
    fi
}

# Run main function
main "$@"