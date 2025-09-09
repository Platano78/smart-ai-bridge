#!/bin/bash

# ┗(▀̿Ĺ̯▀̿ ̿)┓ CI-CD Emergency Rollback Script
# DeepSeek MCP Bridge - Safe Rollback Procedures
# Rapid recovery with minimal downtime

set -euo pipefail

# =============================================================================
# CONFIGURATION
# =============================================================================

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$SCRIPT_DIR"
readonly LOG_DIR="${PROJECT_ROOT}/logs"
readonly BACKUP_DIR="${PROJECT_ROOT}/backups"

# Service Configuration
readonly SERVICE_NAME="deepseek-mcp-bridge"
readonly RUST_BIN_NAME="deepseek-mcp-bridge"
readonly NODE_SERVER_NAME="server.js"
readonly DEFAULT_PORT=8080

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly PURPLE='\033[0;35m'
readonly CYAN='\033[0;36m'
readonly WHITE='\033[1;37m'
readonly NC='\033[0m'

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

log() {
    echo -e "${WHITE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "${LOG_DIR}/rollback.log"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" | tee -a "${LOG_DIR}/rollback.log"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" | tee -a "${LOG_DIR}/rollback.log"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*" | tee -a "${LOG_DIR}/rollback.log"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" | tee -a "${LOG_DIR}/rollback.log"
}

log_step() {
    echo -e "${PURPLE}┗(▀̿Ĺ̯▀̿ ̿)┓${NC} ${CYAN}$*${NC}" | tee -a "${LOG_DIR}/rollback.log"
}

# =============================================================================
# ROLLBACK FUNCTIONS
# =============================================================================

initialize_rollback() {
    log_step "Initializing emergency rollback procedure..."
    
    mkdir -p "$LOG_DIR"
    
    echo "=== Emergency Rollback Started ===" > "${LOG_DIR}/rollback.log"
    echo "Timestamp: $(date)" >> "${LOG_DIR}/rollback.log"
    echo "Reason: ${1:-Manual rollback requested}" >> "${LOG_DIR}/rollback.log"
    echo "====================================" >> "${LOG_DIR}/rollback.log"
    
    log_success "Rollback logging initialized"
}

stop_current_services() {
    log_step "Stopping all current services immediately..."
    
    # Stop Rust server
    if [[ -f "${LOG_DIR}/rust-server.pid" ]]; then
        local rust_pid
        rust_pid=$(cat "${LOG_DIR}/rust-server.pid" 2>/dev/null || echo "")
        if [[ -n "$rust_pid" ]] && kill -0 "$rust_pid" 2>/dev/null; then
            log_info "Terminating Rust server (PID: $rust_pid)..."
            kill -TERM "$rust_pid" 2>/dev/null || true
            sleep 3
            if kill -0 "$rust_pid" 2>/dev/null; then
                kill -KILL "$rust_pid" 2>/dev/null || true
            fi
            log_success "Rust server terminated"
        fi
    fi
    
    # Stop any running Rust processes
    if pgrep -f "$RUST_BIN_NAME" > /dev/null; then
        log_info "Killing remaining Rust server processes..."
        pkill -f "$RUST_BIN_NAME" || true
        sleep 2
        pkill -9 -f "$RUST_BIN_NAME" 2>/dev/null || true
    fi
    
    # Stop Node.js server if running
    if [[ -f "${LOG_DIR}/nodejs-server.pid" ]]; then
        local node_pid
        node_pid=$(cat "${LOG_DIR}/nodejs-server.pid" 2>/dev/null || echo "")
        if [[ -n "$node_pid" ]] && kill -0 "$node_pid" 2>/dev/null; then
            log_info "Terminating Node.js server (PID: $node_pid)..."
            kill -TERM "$node_pid" 2>/dev/null || true
            sleep 3
            if kill -0 "$node_pid" 2>/dev/null; then
                kill -KILL "$node_pid" 2>/dev/null || true
            fi
        fi
    fi
    
    # Kill any remaining Node.js processes for this server
    if pgrep -f "$NODE_SERVER_NAME" > /dev/null; then
        log_info "Killing remaining Node.js server processes..."
        pkill -f "$NODE_SERVER_NAME" || true
        sleep 2
        pkill -9 -f "$NODE_SERVER_NAME" 2>/dev/null || true
    fi
    
    # Verify port is free
    local port_check=0
    while netstat -tuln 2>/dev/null | grep -q ":${DEFAULT_PORT} " && [[ $port_check -lt 10 ]]; do
        log_info "Waiting for port ${DEFAULT_PORT} to be released..."
        sleep 1
        ((port_check++))
    done
    
    log_success "All services stopped"
}

list_available_backups() {
    log_step "Scanning for available backups..."
    
    if [[ ! -d "$BACKUP_DIR" ]]; then
        log_error "No backup directory found"
        return 1
    fi
    
    local backups=()
    while IFS= read -r -d '' backup; do
        backups+=("$backup")
    done < <(find "$BACKUP_DIR" -maxdepth 1 -name "deployment_backup_*" -type d -print0 | sort -rz)
    
    if [[ ${#backups[@]} -eq 0 ]]; then
        log_error "No deployment backups found"
        return 1
    fi
    
    echo ""
    echo "┗(▀̿Ĺ̯▀̿ ̿)┓ Available Backups:"
    echo "================================"
    for i in "${!backups[@]}"; do
        local backup="${backups[$i]}"
        local backup_name=$(basename "$backup")
        local backup_date="${backup_name#deployment_backup_}"
        local formatted_date
        
        # Convert timestamp to readable format
        if [[ ${#backup_date} -eq 15 ]]; then
            formatted_date="${backup_date:0:4}-${backup_date:4:2}-${backup_date:6:2} ${backup_date:9:2}:${backup_date:11:2}:${backup_date:13:2}"
        else
            formatted_date="$backup_date"
        fi
        
        echo "$((i+1)). $formatted_date"
        
        # Show what's in the backup
        local contents=""
        [[ -f "$backup/$RUST_BIN_NAME" ]] && contents+=" Rust"
        [[ -f "$backup/$NODE_SERVER_NAME" ]] && contents+=" Node.js"
        [[ -f "$backup/.env.production" ]] && contents+=" Config"
        
        echo "   Contents:$contents"
        echo "   Path: $backup"
        echo ""
    done
    
    return 0
}

select_backup_interactive() {
    list_available_backups || return 1
    
    local backups=()
    while IFS= read -r -d '' backup; do
        backups+=("$backup")
    done < <(find "$BACKUP_DIR" -maxdepth 1 -name "deployment_backup_*" -type d -print0 | sort -rz)
    
    echo -n "Select backup to restore (1-${#backups[@]}, or 'q' to quit): "
    read -r selection
    
    if [[ "$selection" == "q" ]]; then
        log_info "Rollback cancelled by user"
        exit 0
    fi
    
    if [[ ! "$selection" =~ ^[0-9]+$ ]] || [[ $selection -lt 1 ]] || [[ $selection -gt ${#backups[@]} ]]; then
        log_error "Invalid selection: $selection"
        return 1
    fi
    
    echo "${backups[$((selection-1))]}"
}

restore_from_backup() {
    local backup_path="$1"
    
    if [[ ! -d "$backup_path" ]]; then
        log_error "Backup directory not found: $backup_path"
        return 1
    fi
    
    log_step "Restoring from backup: $(basename "$backup_path")"
    
    local restored_services=()
    
    # Restore Rust binary
    if [[ -f "$backup_path/$RUST_BIN_NAME" ]]; then
        log_info "Restoring Rust binary..."
        mkdir -p target/release
        cp "$backup_path/$RUST_BIN_NAME" "target/release/"
        chmod +x "target/release/$RUST_BIN_NAME"
        restored_services+=("Rust")
        log_success "Rust binary restored"
    fi
    
    # Restore Node.js server
    if [[ -f "$backup_path/$NODE_SERVER_NAME" ]]; then
        log_info "Restoring Node.js server..."
        cp "$backup_path/$NODE_SERVER_NAME" ./
        chmod +x "$NODE_SERVER_NAME"
        restored_services+=("Node.js")
        log_success "Node.js server restored"
    fi
    
    # Restore configuration files
    if [[ -f "$backup_path/.env.production" ]]; then
        log_info "Restoring production configuration..."
        cp "$backup_path/.env.production" ./
        log_success "Configuration restored"
    fi
    
    if [[ -f "$backup_path/claude-desktop-config.json" ]]; then
        cp "$backup_path/claude-desktop-config.json" ./
        log_info "Claude Desktop configuration restored"
    fi
    
    if [[ ${#restored_services[@]} -eq 0 ]]; then
        log_error "No services found in backup to restore"
        return 1
    fi
    
    log_success "Backup restoration complete - Services: ${restored_services[*]}"
    return 0
}

start_service() {
    local service_type="$1"
    
    case "$service_type" in
        "rust")
            start_rust_service
            ;;
        "nodejs")
            start_nodejs_service
            ;;
        "auto")
            # Try Rust first, fallback to Node.js
            if start_rust_service; then
                return 0
            else
                log_warning "Rust service failed, falling back to Node.js..."
                start_nodejs_service
            fi
            ;;
        *)
            log_error "Unknown service type: $service_type"
            return 1
            ;;
    esac
}

start_rust_service() {
    log_step "Starting restored Rust service..."
    
    if [[ ! -f "target/release/$RUST_BIN_NAME" ]]; then
        log_error "Rust binary not found"
        return 1
    fi
    
    if [[ ! -f ".env.production" ]]; then
        log_warning "Production environment file not found - using defaults"
        create_minimal_env
    fi
    
    # Load environment
    set -a
    source .env.production 2>/dev/null || true
    set +a
    
    # Start service
    local log_file="${LOG_DIR}/rust-rollback.log"
    RUST_LOG=info "./target/release/$RUST_BIN_NAME" --config .env.production > "$log_file" 2>&1 &
    local server_pid=$!
    
    echo $server_pid > "${LOG_DIR}/rust-server.pid"
    log_info "Rust service started with PID: $server_pid"
    
    # Quick health check
    sleep 5
    if kill -0 "$server_pid" 2>/dev/null; then
        # Try a simple connection test
        if curl -sf "http://localhost:${DEFAULT_PORT}/health" > /dev/null 2>&1; then
            log_success "Rust service is responding"
            return 0
        else
            log_warning "Rust service started but not responding to health checks"
            return 1
        fi
    else
        log_error "Rust service failed to start"
        return 1
    fi
}

start_nodejs_service() {
    log_step "Starting Node.js fallback service..."
    
    if [[ ! -f "$NODE_SERVER_NAME" ]]; then
        log_error "Node.js server file not found"
        return 1
    fi
    
    # Load environment if available
    if [[ -f ".env.production" ]]; then
        set -a
        source .env.production
        set +a
    fi
    
    # Start Node.js server
    local log_file="${LOG_DIR}/nodejs-rollback.log"
    node "$NODE_SERVER_NAME" > "$log_file" 2>&1 &
    local server_pid=$!
    
    echo $server_pid > "${LOG_DIR}/nodejs-server.pid"
    log_info "Node.js service started with PID: $server_pid"
    
    # Quick health check
    sleep 5
    if kill -0 "$server_pid" 2>/dev/null; then
        if curl -sf "http://localhost:${DEFAULT_PORT}/" > /dev/null 2>&1; then
            log_success "Node.js service is responding"
            return 0
        else
            log_warning "Node.js service started but not responding"
            return 1
        fi
    else
        log_error "Node.js service failed to start"
        return 1
    fi
}

create_minimal_env() {
    cat > .env.production << 'EOF'
ENVIRONMENT=production
PORT=8080
LOG_LEVEL=info
EOF
    log_info "Created minimal production environment"
}

# =============================================================================
# MAIN ROLLBACK ORCHESTRATION
# =============================================================================

usage() {
    echo "┗(▀̿Ĺ̯▀̿ ̿)┓ Emergency Rollback Script"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -i, --interactive     Interactive backup selection"
    echo "  -l, --latest          Use latest backup automatically"
    echo "  -b, --backup PATH     Use specific backup directory"
    echo "  -s, --service TYPE    Service type to start (rust|nodejs|auto)"
    echo "  -f, --force           Force rollback without confirmation"
    echo "  -h, --help            Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --interactive                 # Select backup interactively"
    echo "  $0 --latest --service auto       # Use latest backup, auto-select service"
    echo "  $0 --backup /path/to/backup      # Use specific backup"
    echo ""
}

main() {
    local interactive=false
    local use_latest=false
    local backup_path=""
    local service_type="auto"
    local force=false
    local reason="Manual rollback requested"
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -i|--interactive)
                interactive=true
                shift
                ;;
            -l|--latest)
                use_latest=true
                shift
                ;;
            -b|--backup)
                backup_path="$2"
                shift 2
                ;;
            -s|--service)
                service_type="$2"
                shift 2
                ;;
            -f|--force)
                force=true
                shift
                ;;
            -r|--reason)
                reason="$2"
                shift 2
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done
    
    echo ""
    echo "┗(▀̿Ĺ̯▀̿ ̿)┓ ========================================="
    echo "                 EMERGENCY ROLLBACK"
    echo "            DeepSeek MCP Bridge Recovery"
    echo "┗(▀̿Ĺ̯▀̿ ̿)┓ ========================================="
    echo ""
    
    # Initialize rollback logging
    initialize_rollback "$reason"
    
    # Confirmation unless forced
    if [[ "$force" == "false" ]]; then
        echo -n "⚠️  This will stop current services and restore from backup. Continue? (y/N): "
        read -r confirmation
        if [[ ! "$confirmation" =~ ^[Yy]$ ]]; then
            log_info "Rollback cancelled by user"
            exit 0
        fi
    fi
    
    # Stop current services immediately
    stop_current_services
    
    # Determine backup to use
    if [[ -n "$backup_path" ]]; then
        if [[ ! -d "$backup_path" ]]; then
            log_error "Specified backup directory not found: $backup_path"
            exit 1
        fi
    elif [[ "$use_latest" == "true" ]]; then
        if [[ -f "${BACKUP_DIR}/latest_backup.txt" ]]; then
            backup_path=$(cat "${BACKUP_DIR}/latest_backup.txt")
        else
            # Find the most recent backup
            backup_path=$(find "$BACKUP_DIR" -maxdepth 1 -name "deployment_backup_*" -type d | sort -r | head -1)
        fi
        
        if [[ -z "$backup_path" || ! -d "$backup_path" ]]; then
            log_error "No latest backup found"
            exit 1
        fi
        
        log_info "Using latest backup: $(basename "$backup_path")"
    elif [[ "$interactive" == "true" ]]; then
        backup_path=$(select_backup_interactive)
        if [[ $? -ne 0 ]]; then
            log_error "No backup selected"
            exit 1
        fi
    else
        # Default to latest backup
        if [[ -f "${BACKUP_DIR}/latest_backup.txt" ]]; then
            backup_path=$(cat "${BACKUP_DIR}/latest_backup.txt")
        else
            backup_path=$(find "$BACKUP_DIR" -maxdepth 1 -name "deployment_backup_*" -type d | sort -r | head -1)
        fi
        
        if [[ -z "$backup_path" || ! -d "$backup_path" ]]; then
            log_error "No backup available for automatic rollback"
            exit 1
        fi
        
        log_info "Using backup: $(basename "$backup_path")"
    fi
    
    # Restore from backup
    if ! restore_from_backup "$backup_path"; then
        log_error "Failed to restore from backup"
        exit 1
    fi
    
    # Start service
    if start_service "$service_type"; then
        echo ""
        echo "┗(▀̿Ĺ̯▀̿ ̿)┓ ========================================"
        echo "               ROLLBACK SUCCESSFUL"
        echo "┗(▀̿Ĺ̯▀̿ ̿)┓ ========================================"
        echo ""
        echo "🔄 Service Status:"
        if [[ -f "${LOG_DIR}/rust-server.pid" ]] && kill -0 "$(cat "${LOG_DIR}/rust-server.pid")" 2>/dev/null; then
            echo "   • Rust Server: Running (PID: $(cat "${LOG_DIR}/rust-server.pid"))"
        elif [[ -f "${LOG_DIR}/nodejs-server.pid" ]] && kill -0 "$(cat "${LOG_DIR}/nodejs-server.pid")" 2>/dev/null; then
            echo "   • Node.js Server: Running (PID: $(cat "${LOG_DIR}/nodejs-server.pid"))"
        fi
        echo "   • Port: $DEFAULT_PORT"
        echo "   • Health Check: http://localhost:$DEFAULT_PORT/health"
        echo ""
        echo "📁 Logs:"
        echo "   • Rollback Log: ${LOG_DIR}/rollback.log"
        echo "   • Service Log: ${LOG_DIR}/*-rollback.log"
        echo ""
        echo "┗(▀̿Ĺ̯▀̿ ̿)┓ System restored and operational!"
        echo "========================================="
        
        log_success "Rollback completed successfully"
        exit 0
    else
        echo ""
        echo "┗(▀̿Ĺ̯▀̿ ̿)┓ ========================================"
        echo "               ROLLBACK FAILED"
        echo "┗(▀̿Ĺ̯▀̿ ̿)┓ ========================================"
        echo ""
        echo "❌ Service failed to start after rollback"
        echo "📁 Check logs in: $LOG_DIR"
        echo "🛠️  Manual intervention required"
        echo ""
        
        log_error "Rollback failed - service could not be started"
        exit 1
    fi
}

# Handle interruption
trap 'log_error "Rollback interrupted"; exit 130' INT TERM

# Execute main rollback
main "$@"