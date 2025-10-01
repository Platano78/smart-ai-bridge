#!/bin/bash

# Universal Coding Monster v8.0 Deployment Script
# Production deployment with comprehensive validation and monitoring

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="${PROJECT_DIR}/logs/deployment.log"
COMPOSE_FILE="${PROJECT_DIR}/docker-compose.ucm-v8.yml"
ENV_FILE="${PROJECT_DIR}/.env.ucm-v8"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration
VALIDATE_BEFORE_DEPLOY=true
PULL_IMAGES=true
BUILD_IMAGES=true
START_MONITORING=false
CLEANUP_ON_FAILURE=true
DEPLOYMENT_TIMEOUT=600  # 10 minutes

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --no-validate)
                VALIDATE_BEFORE_DEPLOY=false
                shift
                ;;
            --no-pull)
                PULL_IMAGES=false
                shift
                ;;
            --no-build)
                BUILD_IMAGES=false
                shift
                ;;
            --with-monitoring)
                START_MONITORING=true
                shift
                ;;
            --no-cleanup)
                CLEANUP_ON_FAILURE=false
                shift
                ;;
            --timeout)
                DEPLOYMENT_TIMEOUT="$2"
                shift 2
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                echo "Unknown argument: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

show_help() {
    cat << EOF
Universal Coding Monster v8.0 Deployment Script

Usage: $0 [OPTIONS]

Options:
    --no-validate       Skip pre-deployment validation
    --no-pull          Skip pulling latest images
    --no-build         Skip building custom images
    --with-monitoring  Start monitoring services (Prometheus, Grafana)
    --no-cleanup       Don't cleanup on deployment failure
    --timeout SECONDS  Deployment timeout (default: 600)
    --help             Show this help message

Examples:
    $0                              # Standard deployment
    $0 --with-monitoring           # Deploy with monitoring stack
    $0 --no-validate --no-pull     # Quick deployment (dev mode)
EOF
}

# Logging function
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}" | tee -a "$LOG_FILE"
}

log_info() {
    log "INFO" "$@"
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    log "SUCCESS" "$@"
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warning() {
    log "WARNING" "$@"
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

log_error() {
    log "ERROR" "$@"
    echo -e "${RED}[ERROR]${NC} $*"
}

# Cleanup function for signal handling
cleanup() {
    local exit_code=$?
    if [[ $exit_code -ne 0 && $CLEANUP_ON_FAILURE == true ]]; then
        log_warning "Deployment failed, cleaning up..."
        docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down --remove-orphans || true
    fi
    exit $exit_code
}

# Set up signal handlers
trap cleanup EXIT INT TERM

# Pre-deployment validation
run_validation() {
    if [[ $VALIDATE_BEFORE_DEPLOY == true ]]; then
        log_info "Running pre-deployment validation..."

        if [[ -x "$SCRIPT_DIR/validate-ucm-deployment.sh" ]]; then
            if "$SCRIPT_DIR/validate-ucm-deployment.sh"; then
                log_success "Pre-deployment validation passed"
            else
                log_error "Pre-deployment validation failed"
                exit 1
            fi
        else
            log_warning "Validation script not found or not executable, skipping validation"
        fi
    else
        log_info "Skipping pre-deployment validation (--no-validate)"
    fi
}

# Pull latest images
pull_images() {
    if [[ $PULL_IMAGES == true ]]; then
        log_info "Pulling latest images..."

        # Pull base images
        docker pull node:18-alpine || log_warning "Failed to pull node:18-alpine"
        docker pull prom/prometheus:latest || log_warning "Failed to pull prometheus"
        docker pull grafana/grafana:latest || log_warning "Failed to pull grafana"
        docker pull nvcr.io/nvidia/k8s/dcgm-exporter:3.1.7-3.1.4-ubuntu20.04 || log_warning "Failed to pull dcgm-exporter"

        log_success "Image pull completed"
    else
        log_info "Skipping image pull (--no-pull)"
    fi
}

# Build custom images
build_images() {
    if [[ $BUILD_IMAGES == true ]]; then
        log_info "Building custom images..."

        # Build Qwen3-Coder-30B-FP8 image
        log_info "Building Qwen3-Coder-30B-FP8 image..."
        if docker build -f "$PROJECT_DIR/Dockerfile.qwen3-coder-30b-fp8" -t ucm-qwen3-coder-30b-fp8:latest "$PROJECT_DIR"; then
            log_success "Qwen3-Coder-30B-FP8 image built successfully"
        else
            log_error "Failed to build Qwen3-Coder-30B-FP8 image"
            exit 1
        fi

        # Build MCP Server image
        log_info "Building UCM MCP Server image..."
        if docker build -f "$PROJECT_DIR/Dockerfile.ucm-mcp-server" -t ucm-mcp-server:latest "$PROJECT_DIR"; then
            log_success "UCM MCP Server image built successfully"
        else
            log_error "Failed to build UCM MCP Server image"
            exit 1
        fi

        # Build Tester image
        log_info "Building UCM Tester image..."
        if docker build -f "$PROJECT_DIR/Dockerfile.ucm-tester" -t ucm-tester:latest "$PROJECT_DIR"; then
            log_success "UCM Tester image built successfully"
        else
            log_error "Failed to build UCM Tester image"
            exit 1
        fi

        log_success "All custom images built successfully"
    else
        log_info "Skipping image build (--no-build)"
    fi
}

# Deploy core services
deploy_core_services() {
    log_info "Deploying UCM v8.0 core services..."

    # Create necessary directories
    mkdir -p "$PROJECT_DIR"/{logs/{qwen,mcp},workspace,test-results}

    # Start core services
    local compose_cmd="docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE"

    log_info "Starting Qwen3-Coder-30B-FP8 model..."
    if $compose_cmd up -d qwen3-coder-30b-fp8; then
        log_success "Qwen3-Coder-30B-FP8 service started"
    else
        log_error "Failed to start Qwen3-Coder-30B-FP8 service"
        exit 1
    fi

    # Wait for model to be ready
    log_info "Waiting for Qwen3 model to be ready..."
    local retries=0
    local max_retries=30
    while [[ $retries -lt $max_retries ]]; do
        if curl -s -f "http://localhost:8001/health" >/dev/null 2>&1; then
            log_success "Qwen3 model is ready"
            break
        fi

        retries=$((retries + 1))
        log_info "Waiting for Qwen3 model... ($retries/$max_retries)"
        sleep 10
    done

    if [[ $retries -eq $max_retries ]]; then
        log_error "Qwen3 model failed to start within timeout"
        exit 1
    fi

    # Start MCP Server
    log_info "Starting UCM MCP Server..."
    if $compose_cmd up -d ucm-mcp-server; then
        log_success "UCM MCP Server started"
    else
        log_error "Failed to start UCM MCP Server"
        exit 1
    fi

    # Wait for MCP Server to be ready
    log_info "Waiting for MCP Server to be ready..."
    retries=0
    max_retries=20
    while [[ $retries -lt $max_retries ]]; do
        if curl -s -f "http://localhost:3001/health" >/dev/null 2>&1; then
            log_success "MCP Server is ready"
            break
        fi

        retries=$((retries + 1))
        log_info "Waiting for MCP Server... ($retries/$max_retries)"
        sleep 5
    done

    if [[ $retries -eq $max_retries ]]; then
        log_error "MCP Server failed to start within timeout"
        exit 1
    fi

    log_success "Core services deployed successfully"
}

# Deploy monitoring services
deploy_monitoring() {
    if [[ $START_MONITORING == true ]]; then
        log_info "Deploying monitoring stack..."

        local compose_cmd="docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE"

        # Start monitoring services
        if $compose_cmd --profile monitoring up -d; then
            log_success "Monitoring stack deployed"

            # Wait for services to be ready
            log_info "Waiting for monitoring services..."
            sleep 30

            # Check Prometheus
            if curl -s -f "http://localhost:9090/-/ready" >/dev/null 2>&1; then
                log_success "Prometheus is ready at http://localhost:9090"
            else
                log_warning "Prometheus may not be ready yet"
            fi

            # Check Grafana
            if curl -s -f "http://localhost:3000/api/health" >/dev/null 2>&1; then
                log_success "Grafana is ready at http://localhost:3000"
            else
                log_warning "Grafana may not be ready yet"
            fi
        else
            log_error "Failed to deploy monitoring stack"
            return 1
        fi
    else
        log_info "Monitoring stack not requested (use --with-monitoring to enable)"
    fi
}

# Post-deployment verification
verify_deployment() {
    log_info "Verifying deployment..."

    local compose_cmd="docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE"

    # Check service status
    log_info "Checking service status..."
    if $compose_cmd ps | grep -q "Up"; then
        log_success "Services are running"
    else
        log_error "Some services are not running"
        $compose_cmd ps
        exit 1
    fi

    # Test MCP Server endpoints
    log_info "Testing MCP Server endpoints..."

    # Health check
    if curl -s -f "http://localhost:3001/health" >/dev/null; then
        log_success "MCP Server health check passed"
    else
        log_error "MCP Server health check failed"
        exit 1
    fi

    # Test basic MCP functionality
    local test_payload='{"method": "tools/list", "params": {}}'
    if curl -s -X POST -H "Content-Type: application/json" \
            -d "$test_payload" \
            "http://localhost:3001/mcp" | jq -e '.result.tools' >/dev/null; then
        log_success "MCP Server tools endpoint working"
    else
        log_warning "MCP Server tools endpoint test failed"
    fi

    log_success "Deployment verification completed"
}

# Show deployment summary
show_summary() {
    echo ""
    echo "========================================="
    echo "UCM v8.0 Deployment Summary"
    echo "========================================="
    echo "Deployment completed successfully!"
    echo ""
    echo "Services:"
    echo "  • Qwen3-Coder-30B-FP8: http://localhost:8001"
    echo "  • UCM MCP Server: http://localhost:3001"

    if [[ $START_MONITORING == true ]]; then
        echo "  • Prometheus: http://localhost:9090"
        echo "  • Grafana: http://localhost:3000"
        echo "    - Default login: admin/admin123"
    fi

    echo ""
    echo "Logs:"
    echo "  • Deployment: $LOG_FILE"
    echo "  • Service logs: docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE logs"
    echo ""
    echo "Management:"
    echo "  • Stop services: docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE down"
    echo "  • View status: docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE ps"
    echo "  • Run tests: docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE --profile testing up ucm-tester"
    echo ""
}

# Main deployment function
main() {
    echo "Universal Coding Monster v8.0 Deployment"
    echo "========================================"

    # Parse command line arguments
    parse_args "$@"

    # Create logs directory
    mkdir -p "$(dirname "$LOG_FILE")"

    # Check if environment file exists
    if [[ ! -f "$ENV_FILE" ]]; then
        log_error "Environment file $ENV_FILE not found"
        log_info "Please copy .env.example to .env.ucm-v8 and configure it"
        exit 1
    fi

    # Check if Docker Compose file exists
    if [[ ! -f "$COMPOSE_FILE" ]]; then
        log_error "Docker Compose file $COMPOSE_FILE not found"
        exit 1
    fi

    log_info "Starting deployment with timeout: ${DEPLOYMENT_TIMEOUT}s"

    # Run deployment steps
    run_validation
    pull_images
    build_images
    deploy_core_services
    deploy_monitoring
    verify_deployment

    # Show summary
    show_summary

    log_success "UCM v8.0 deployment completed successfully!"
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi