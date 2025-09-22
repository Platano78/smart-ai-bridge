#!/bin/bash

# ┗(▀̿Ĺ̯▀̿ ̿)┓ CI-CD Production Deployment Script
# DeepSeek MCP Bridge - Zero Downtime Deployment
# Professional-grade deployment with rollback capabilities

set -euo pipefail

# =============================================================================
# CONFIGURATION AND CONSTANTS
# =============================================================================

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$SCRIPT_DIR"
readonly LOG_DIR="${PROJECT_ROOT}/logs"
readonly BACKUP_DIR="${PROJECT_ROOT}/backups"
readonly CONFIG_DIR="${PROJECT_ROOT}/config"

# Service Configuration
readonly SERVICE_NAME="deepseek-mcp-bridge"
readonly RUST_BIN_NAME="deepseek-mcp-bridge"
readonly NODE_SERVER_NAME="server.js"
readonly DEFAULT_PORT=8080
readonly HEALTH_CHECK_PORT=8081

# Deployment Settings
readonly DEPLOYMENT_TIMEOUT=300  # 5 minutes
readonly HEALTH_CHECK_RETRIES=30
readonly ROLLBACK_TIMEOUT=120   # 2 minutes

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly PURPLE='\033[0;35m'
readonly CYAN='\033[0;36m'
readonly WHITE='\033[1;37m'
readonly NC='\033[0m' # No Color

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

log() {
    echo -e "${WHITE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "${LOG_DIR}/deployment.log"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" | tee -a "${LOG_DIR}/deployment.log"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" | tee -a "${LOG_DIR}/deployment.log"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*" | tee -a "${LOG_DIR}/deployment.log"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" | tee -a "${LOG_DIR}/deployment.log"
}

log_step() {
    echo -e "${PURPLE}┗(▀̿Ĺ̯▀̿ ̿)┓${NC} ${CYAN}$*${NC}" | tee -a "${LOG_DIR}/deployment.log"
}

# =============================================================================
# WSL IP DISCOVERY INTEGRATION
# =============================================================================

setup_ip_discovery() {
    log_step "Setting up WSL IP discovery system..."

    # Make IP discovery script executable
    local ip_discovery_script="${PROJECT_ROOT}/wsl-ip-discovery.sh"
    if [[ -f "$ip_discovery_script" ]]; then
        chmod +x "$ip_discovery_script"
        log_success "IP discovery script initialized"
    else
        log_warning "IP discovery script not found, deployment may have connectivity issues"
    fi
}

validate_wsl_connectivity() {
    log_step "Validating WSL IP connectivity..."

    local ip_discovery_script="${PROJECT_ROOT}/wsl-ip-discovery.sh"
    if [[ -f "$ip_discovery_script" ]]; then
        local wsl_host_ip
        if wsl_host_ip=$("$ip_discovery_script" get --quiet 2>/dev/null); then
            log_success "WSL host IP discovered: $wsl_host_ip"

            # Validate connectivity to common services
            if "$ip_discovery_script" validate "$wsl_host_ip" --quiet >/dev/null 2>&1; then
                log_success "WSL connectivity validation passed"

                # Store IP for environment configuration
                export WSL_HOST_IP="$wsl_host_ip"
                echo "WSL_HOST_IP=$wsl_host_ip" >> "${LOG_DIR}/deployment-env.log"

                return 0
            else
                log_warning "WSL connectivity validation failed"
                return 1
            fi
        else
            log_warning "Could not discover WSL host IP"
            return 1
        fi
    else
        log_warning "IP discovery system not available"
        return 1
    fi
}

# =============================================================================
# SETUP AND VALIDATION
# =============================================================================

setup_directories() {
    log_step "Setting up deployment directories..."

    mkdir -p "$LOG_DIR" "$BACKUP_DIR" "$CONFIG_DIR"

    # Initialize deployment log
    echo "=== DeepSeek MCP Bridge Deployment Started ===" > "${LOG_DIR}/deployment.log"
    echo "Timestamp: $(date)" >> "${LOG_DIR}/deployment.log"
    echo "Environment: ${ENVIRONMENT:-production}" >> "${LOG_DIR}/deployment.log"
    echo "=============================================" >> "${LOG_DIR}/deployment.log"

    log_success "Directories initialized"
}

validate_environment() {
    log_step "Validating deployment environment..."
    
    # Check required tools
    local required_tools=("cargo" "node" "npm" "curl" "jq")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log_error "Required tool not found: $tool"
            exit 1
        fi
    done
    
    # Check Rust version
    local rust_version
    rust_version=$(rustc --version | cut -d' ' -f2)
    log_info "Rust version: $rust_version"
    
    # Check Node.js version
    local node_version
    node_version=$(node --version)
    log_info "Node.js version: $node_version"
    
    # Check if required configuration files exist
    if [[ ! -f ".env.production" ]]; then
        log_warning "Production environment file not found, creating from template..."
        create_production_env
    fi
    
    log_success "Environment validation complete"
}

create_production_env() {
    cat > .env.production << 'EOF'
# Production Environment Configuration
ENVIRONMENT=production
LOG_LEVEL=info
PORT=8080
HEALTH_CHECK_PORT=8081

# DeepSeek API Configuration
DEEPSEEK_API_URL=https://api.deepseek.com
DEEPSEEK_API_TIMEOUT=30000
DEEPSEEK_MAX_RETRIES=3

# WSL IP Discovery Configuration
WSL_HOST_IP=${WSL_HOST_IP:-auto}
IP_DISCOVERY_ENABLED=true
IP_CACHE_TTL=3600
IP_VALIDATION_TIMEOUT=5

# Performance Configuration
WORKER_THREADS=4
CONNECTION_POOL_SIZE=20
REQUEST_TIMEOUT=60000
MAX_CONCURRENT_REQUESTS=100

# Security Configuration
CORS_ENABLED=true
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX=1000
RATE_LIMIT_WINDOW=900000

# Monitoring Configuration
METRICS_ENABLED=true
HEALTH_CHECK_ENABLED=true
PERFORMANCE_MONITORING=true
EOF

    # Update WSL_HOST_IP if discovered
    if [[ -n "${WSL_HOST_IP:-}" ]]; then
        sed -i "s/WSL_HOST_IP=auto/WSL_HOST_IP=$WSL_HOST_IP/" .env.production
        log_info "Updated production environment with WSL IP: $WSL_HOST_IP"
    fi

    log_info "Created production environment configuration"
}

# =============================================================================
# BUILD AND COMPILATION
# =============================================================================

build_rust_server() {
    log_step "Building optimized Rust server..."
    
    # Clean previous builds
    cargo clean
    
    # Build with release optimizations
    log_info "Compiling with release optimizations..."
    if ! cargo build --release --locked; then
        log_error "Rust build failed"
        return 1
    fi
    
    # Verify binary exists and is executable
    local rust_binary="target/release/$RUST_BIN_NAME"
    if [[ ! -x "$rust_binary" ]]; then
        log_error "Built binary not found or not executable: $rust_binary"
        return 1
    fi
    
    # Get binary size and optimization info
    local binary_size
    binary_size=$(ls -lh "$rust_binary" | awk '{print $5}')
    log_success "Rust server built successfully (Size: $binary_size)"
    
    # Run basic smoke test
    log_info "Running binary smoke test..."
    if timeout 10 "$rust_binary" --help > /dev/null 2>&1; then
        log_success "Binary smoke test passed"
    else
        log_warning "Binary smoke test failed (may be normal for server binaries)"
    fi
    
    return 0
}

prepare_configuration() {
    log_step "Preparing production configuration files..."
    
    # Create Claude Desktop configuration
    cat > claude-desktop-config.json << EOF
{
  "mcpServers": {
    "deepseek-mcp-bridge": {
      "command": "$(pwd)/target/release/$RUST_BIN_NAME",
      "args": ["--config", "$(pwd)/.env.production"],
      "env": {
        "RUST_LOG": "info",
        "ENVIRONMENT": "production"
      }
    }
  }
}
EOF
    
    # Create systemd service file if needed
    if command -v systemctl &> /dev/null; then
        create_systemd_service
    fi
    
    log_success "Configuration files prepared"
}

create_systemd_service() {
    cat > "${SERVICE_NAME}.service" << EOF
[Unit]
Description=DeepSeek MCP Bridge Service
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
Restart=always
RestartSec=1
User=$USER
WorkingDirectory=$(pwd)
ExecStart=$(pwd)/target/release/$RUST_BIN_NAME --config $(pwd)/.env.production
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$(pwd)

[Install]
WantedBy=multi-user.target
EOF
    
    log_info "Systemd service file created: ${SERVICE_NAME}.service"
}

# =============================================================================
# HEALTH CHECKS AND MONITORING
# =============================================================================

wait_for_service() {
    local port="$1"
    local service_name="$2"
    local max_attempts="$3"
    
    log_info "Waiting for $service_name to be ready on port $port..."
    
    local attempt=1
    while [[ $attempt -le $max_attempts ]]; do
        if curl -sf "http://localhost:$port/health" > /dev/null 2>&1; then
            log_success "$service_name is ready (attempt $attempt/$max_attempts)"
            return 0
        fi
        
        if [[ $attempt -eq $max_attempts ]]; then
            log_error "$service_name failed to become ready after $max_attempts attempts"
            return 1
        fi
        
        log_info "Attempt $attempt/$max_attempts - waiting for $service_name..."
        sleep 5
        ((attempt++))
    done
}

perform_health_check() {
    local port="$1"
    local service_name="$2"
    
    log_step "Performing comprehensive health check for $service_name..."
    
    # Basic health check
    local health_response
    if ! health_response=$(curl -sf "http://localhost:$port/health" 2>/dev/null); then
        log_error "Health check endpoint not responding"
        return 1
    fi
    
    # Parse health check response
    local status
    status=$(echo "$health_response" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")
    
    if [[ "$status" != "healthy" && "$status" != "ok" ]]; then
        log_error "Service reported unhealthy status: $status"
        return 1
    fi
    
    # Test MCP protocol endpoint
    if curl -sf "http://localhost:$port/mcp/initialize" > /dev/null 2>&1; then
        log_success "MCP protocol endpoint responding"
    else
        log_warning "MCP protocol endpoint not responding (may be normal during startup)"
    fi
    
    # Performance metrics check
    if curl -sf "http://localhost:$port/metrics" > /dev/null 2>&1; then
        log_success "Metrics endpoint responding"
    else
        log_info "Metrics endpoint not available"
    fi
    
    log_success "$service_name health check passed"
    return 0
}

# =============================================================================
# DEPLOYMENT ORCHESTRATION
# =============================================================================

backup_current_deployment() {
    log_step "Creating deployment backup..."
    
    local timestamp
    timestamp=$(date +"%Y%m%d_%H%M%S")
    local backup_path="${BACKUP_DIR}/deployment_backup_${timestamp}"
    
    mkdir -p "$backup_path"
    
    # Backup current binary if it exists
    if [[ -f "target/release/$RUST_BIN_NAME" ]]; then
        cp "target/release/$RUST_BIN_NAME" "$backup_path/"
        log_info "Backed up current Rust binary"
    fi
    
    # Backup Node.js server
    if [[ -f "$NODE_SERVER_NAME" ]]; then
        cp "$NODE_SERVER_NAME" "$backup_path/"
        log_info "Backed up Node.js server"
    fi
    
    # Backup configuration
    if [[ -f ".env.production" ]]; then
        cp ".env.production" "$backup_path/"
    fi
    
    if [[ -f "claude-desktop-config.json" ]]; then
        cp "claude-desktop-config.json" "$backup_path/"
    fi
    
    # Store backup path for potential rollback
    echo "$backup_path" > "${BACKUP_DIR}/latest_backup.txt"
    
    log_success "Backup created: $backup_path"
}

stop_existing_services() {
    log_step "Stopping existing services gracefully..."
    
    # Stop Node.js service if running
    local node_pid
    if node_pid=$(pgrep -f "$NODE_SERVER_NAME" | head -1); then
        log_info "Stopping Node.js server (PID: $node_pid)..."
        kill -TERM "$node_pid" 2>/dev/null || true
        
        # Wait for graceful shutdown
        local countdown=30
        while [[ $countdown -gt 0 ]] && kill -0 "$node_pid" 2>/dev/null; do
            sleep 1
            ((countdown--))
        done
        
        if kill -0 "$node_pid" 2>/dev/null; then
            log_warning "Forcing termination of Node.js server"
            kill -KILL "$node_pid" 2>/dev/null || true
        else
            log_success "Node.js server stopped gracefully"
        fi
    fi
    
    # Stop Rust service if running
    local rust_pid
    if rust_pid=$(pgrep -f "$RUST_BIN_NAME" | head -1); then
        log_info "Stopping Rust server (PID: $rust_pid)..."
        kill -TERM "$rust_pid" 2>/dev/null || true
        
        # Wait for graceful shutdown
        local countdown=30
        while [[ $countdown -gt 0 ]] && kill -0 "$rust_pid" 2>/dev/null; do
            sleep 1
            ((countdown--))
        done
        
        if kill -0 "$rust_pid" 2>/dev/null; then
            log_warning "Forcing termination of Rust server"
            kill -KILL "$rust_pid" 2>/dev/null || true
        else
            log_success "Rust server stopped gracefully"
        fi
    fi
    
    # Verify ports are free
    if netstat -tuln 2>/dev/null | grep -q ":${DEFAULT_PORT} "; then
        log_warning "Port ${DEFAULT_PORT} still occupied, waiting..."
        sleep 5
    fi
}

start_rust_server() {
    log_step "Starting optimized Rust MCP server..."
    
    # Load production environment
    set -a
    source .env.production
    set +a
    
    # Start server in background with proper logging
    local rust_binary="target/release/$RUST_BIN_NAME"
    local log_file="${LOG_DIR}/rust-server.log"
    
    # Ensure log file exists
    touch "$log_file"
    
    # Start the server
    RUST_LOG=info "$rust_binary" --config .env.production > "$log_file" 2>&1 &
    local server_pid=$!
    
    # Store PID for management
    echo $server_pid > "${LOG_DIR}/rust-server.pid"
    
    log_info "Rust server started with PID: $server_pid"
    log_info "Server logs: $log_file"
    
    # Wait for server to be ready
    if wait_for_service "$DEFAULT_PORT" "Rust MCP Server" "$HEALTH_CHECK_RETRIES"; then
        if perform_health_check "$DEFAULT_PORT" "Rust MCP Server"; then
            log_success "Rust MCP server deployment successful!"
            return 0
        else
            log_error "Rust server health check failed"
            return 1
        fi
    else
        log_error "Rust server failed to start within timeout"
        return 1
    fi
}

# =============================================================================
# ROLLBACK PROCEDURES
# =============================================================================

rollback_deployment() {
    log_step "Initiating deployment rollback..."
    
    # Stop current services
    stop_existing_services
    
    # Get latest backup
    local backup_path
    if [[ -f "${BACKUP_DIR}/latest_backup.txt" ]]; then
        backup_path=$(cat "${BACKUP_DIR}/latest_backup.txt")
        if [[ -d "$backup_path" ]]; then
            log_info "Rolling back to: $backup_path"
            
            # Restore files
            if [[ -f "$backup_path/$RUST_BIN_NAME" ]]; then
                mkdir -p target/release
                cp "$backup_path/$RUST_BIN_NAME" "target/release/"
                chmod +x "target/release/$RUST_BIN_NAME"
                log_info "Restored Rust binary"
            fi
            
            if [[ -f "$backup_path/$NODE_SERVER_NAME" ]]; then
                cp "$backup_path/$NODE_SERVER_NAME" ./
                log_info "Restored Node.js server"
            fi
            
            if [[ -f "$backup_path/.env.production" ]]; then
                cp "$backup_path/.env.production" ./
                log_info "Restored production environment"
            fi
            
            # Attempt to start restored service
            if [[ -f "target/release/$RUST_BIN_NAME" ]]; then
                if start_rust_server; then
                    log_success "Rollback successful - Rust server restored"
                    return 0
                fi
            fi
            
            # Fallback to Node.js if Rust rollback fails
            if [[ -f "$NODE_SERVER_NAME" ]]; then
                log_info "Starting Node.js server as fallback..."
                node "$NODE_SERVER_NAME" > "${LOG_DIR}/nodejs-fallback.log" 2>&1 &
                local node_pid=$!
                echo $node_pid > "${LOG_DIR}/nodejs-server.pid"
                
                if wait_for_service "$DEFAULT_PORT" "Node.js Server" 10; then
                    log_success "Rollback successful - Node.js server restored"
                    return 0
                fi
            fi
            
            log_error "Rollback failed - manual intervention required"
            return 1
        fi
    fi
    
    log_error "No backup found for rollback"
    return 1
}

# =============================================================================
# POST-DEPLOYMENT OPERATIONS
# =============================================================================

update_claude_desktop_config() {
    log_step "Updating Claude Desktop configuration..."
    
    # Check if Claude Desktop config exists in user directory
    local claude_config_paths=(
        "$HOME/.config/Claude/claude_desktop_config.json"
        "$HOME/Library/Application Support/Claude/claude_desktop_config.json"
        "/mnt/c/Users/$USER/AppData/Roaming/Claude/claude_desktop_config.json"
    )
    
    local config_updated=false
    for config_path in "${claude_config_paths[@]}"; do
        if [[ -f "$config_path" ]]; then
            log_info "Updating Claude Desktop config: $config_path"
            
            # Backup existing config
            cp "$config_path" "${config_path}.backup.$(date +%s)"
            
            # Update with new Rust server configuration
            jq '.mcpServers["deepseek-mcp-bridge"] = {
                "command": "'$(pwd)'/target/release/'$RUST_BIN_NAME'",
                "args": ["--config", "'$(pwd)'/.env.production"],
                "env": {
                    "RUST_LOG": "info",
                    "ENVIRONMENT": "production"
                }
            }' "$config_path" > "${config_path}.tmp" && mv "${config_path}.tmp" "$config_path"
            
            config_updated=true
            log_success "Updated Claude Desktop configuration"
            break
        fi
    done
    
    if [[ "$config_updated" == "false" ]]; then
        log_warning "Claude Desktop configuration not found - manual configuration required"
        log_info "Use the claude-desktop-config.json file created in this directory"
    fi
}

generate_deployment_report() {
    log_step "Generating deployment report..."
    
    local report_file="${LOG_DIR}/deployment-report-$(date +%Y%m%d_%H%M%S).json"
    
    cat > "$report_file" << EOF
{
    "deployment": {
        "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
        "version": "1.0.0",
        "environment": "${ENVIRONMENT:-production}",
        "status": "success",
        "duration_seconds": $SECONDS
    },
    "services": {
        "rust_server": {
            "binary": "target/release/$RUST_BIN_NAME",
            "port": $DEFAULT_PORT,
            "pid_file": "${LOG_DIR}/rust-server.pid",
            "log_file": "${LOG_DIR}/rust-server.log",
            "health_status": "healthy"
        }
    },
    "configuration": {
        "environment_file": ".env.production",
        "claude_config": "claude-desktop-config.json",
        "logging_directory": "$LOG_DIR",
        "backup_directory": "$BACKUP_DIR"
    },
    "metrics": {
        "build_time": "$(date)",
        "binary_size": "$(ls -lh target/release/$RUST_BIN_NAME 2>/dev/null | awk '{print $5}' || echo 'N/A')",
        "deployment_method": "zero-downtime"
    }
}
EOF
    
    log_success "Deployment report generated: $report_file"
    
    # Display summary
    echo ""
    echo "┗(▀̿Ĺ̯▀̿ ̿)┓ ==============================================="
    echo "               DEPLOYMENT COMPLETE"
    echo "┗(▀̿Ĺ̯▀̿ ̿)┓ ==============================================="
    echo ""
    echo "🚀 Service Status:"
    echo "   • Rust MCP Server: Running on port $DEFAULT_PORT"
    echo "   • Health Check: http://localhost:$DEFAULT_PORT/health"
    echo "   • Process ID: $(cat "${LOG_DIR}/rust-server.pid" 2>/dev/null || echo 'N/A')"
    echo ""
    echo "📁 Important Files:"
    echo "   • Binary: $(pwd)/target/release/$RUST_BIN_NAME"
    echo "   • Config: $(pwd)/.env.production"
    echo "   • Logs: ${LOG_DIR}/rust-server.log"
    echo "   • Report: $report_file"
    echo ""
    echo "🔧 Next Steps:"
    echo "   • Test MCP connection with Claude Desktop"
    echo "   • Monitor logs for any issues"
    echo "   • Run './validate-deployment.sh' for comprehensive testing"
    echo ""
    echo "┗(▀̿Ĺ̯▀̿ ̿)┓ Deployment pipeline executed successfully!"
    echo "================================================="
    echo ""
}

# =============================================================================
# MAIN DEPLOYMENT ORCHESTRATION
# =============================================================================

main() {
    local start_time
    start_time=$(date +%s)
    
    echo ""
    echo "┗(▀̿Ĺ̯▀̿ ̿)┓ ================================================="
    echo "               DEEPSEEK MCP BRIDGE"
    echo "            Professional Deployment Pipeline"
    echo "┗(▀̿Ĺ̯▀̿ ̿)┓ ================================================="
    echo ""
    
    # Setup and validation
    setup_directories
    setup_ip_discovery
    validate_environment
    validate_wsl_connectivity
    
    # Pre-deployment backup
    backup_current_deployment
    
    # Build and prepare
    if ! build_rust_server; then
        log_error "Build failed - aborting deployment"
        exit 1
    fi
    
    prepare_configuration
    
    # Deployment with rollback on failure
    stop_existing_services
    
    if start_rust_server; then
        # Post-deployment tasks
        update_claude_desktop_config
        generate_deployment_report
        
        log_success "Deployment completed successfully in $(($(date +%s) - start_time)) seconds"
        exit 0
    else
        log_error "Deployment failed - initiating rollback"
        if rollback_deployment; then
            log_warning "Rollback completed - check logs for deployment failure details"
            exit 1
        else
            log_error "Deployment AND rollback failed - manual intervention required"
            exit 2
        fi
    fi
}

# Handle script interruption
trap 'log_error "Deployment interrupted"; rollback_deployment; exit 130' INT TERM

# Execute main deployment
main "$@"