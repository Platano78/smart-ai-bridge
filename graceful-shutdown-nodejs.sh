#!/bin/bash

# ┗(▀̿Ĺ̯▀̿ ̿)┓ CI-CD Node.js Graceful Shutdown Script
# DeepSeek MCP Bridge - Safe Node.js to Rust Transition
# Zero-downtime service migration with connection draining

set -euo pipefail

# =============================================================================
# CONFIGURATION
# =============================================================================

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$SCRIPT_DIR"
readonly LOG_DIR="${PROJECT_ROOT}/logs"
readonly BACKUP_DIR="${PROJECT_ROOT}/backups"

# Service Configuration
readonly NODE_SERVER_NAME="server.js"
readonly RUST_BIN_NAME="deepseek-mcp-bridge"
readonly DEFAULT_PORT=8080
readonly HEALTH_PORT=8081

# Graceful shutdown settings
readonly GRACEFUL_TIMEOUT=60    # 60 seconds for graceful shutdown
readonly DRAIN_TIMEOUT=30       # 30 seconds for connection draining
readonly FORCE_TIMEOUT=10       # 10 seconds before force kill

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
    echo -e "${WHITE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "${LOG_DIR}/nodejs-shutdown.log"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" | tee -a "${LOG_DIR}/nodejs-shutdown.log"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" | tee -a "${LOG_DIR}/nodejs-shutdown.log"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*" | tee -a "${LOG_DIR}/nodejs-shutdown.log"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" | tee -a "${LOG_DIR}/nodejs-shutdown.log"
}

log_step() {
    echo -e "${PURPLE}┗(▀̿Ĺ̯▀̿ ̿)┓${NC} ${CYAN}$*${NC}" | tee -a "${LOG_DIR}/nodejs-shutdown.log"
}

# =============================================================================
# NODE.JS SERVICE MANAGEMENT
# =============================================================================

find_nodejs_processes() {
    local pids=()
    
    # Find by PID file first
    if [[ -f "${LOG_DIR}/nodejs-server.pid" ]]; then
        local pid
        pid=$(cat "${LOG_DIR}/nodejs-server.pid" 2>/dev/null || echo "")
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            pids+=("$pid")
        fi
    fi
    
    # Find by process name
    while IFS= read -r pid; do
        if [[ ! " ${pids[*]} " =~ " $pid " ]]; then
            pids+=("$pid")
        fi
    done < <(pgrep -f "$NODE_SERVER_NAME" || true)
    
    printf '%s\n' "${pids[@]}"
}

get_process_info() {
    local pid="$1"
    
    if ! kill -0 "$pid" 2>/dev/null; then
        echo "Process not found"
        return 1
    fi
    
    # Get process info
    local cmd=""
    local start_time=""
    local cpu_usage=""
    local mem_usage=""
    
    if [[ -r "/proc/$pid/cmdline" ]]; then
        cmd=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || echo "unknown")
    fi
    
    if command -v ps >/dev/null 2>&1; then
        local ps_info
        ps_info=$(ps -p "$pid" -o lstart=,pcpu=,pmem= 2>/dev/null || echo "")
        if [[ -n "$ps_info" ]]; then
            start_time=$(echo "$ps_info" | awk '{print $1,$2,$3,$4,$5}')
            cpu_usage=$(echo "$ps_info" | awk '{print $6}')
            mem_usage=$(echo "$ps_info" | awk '{print $7}')
        fi
    fi
    
    echo "Command: $cmd"
    echo "Start Time: $start_time"
    echo "CPU Usage: ${cpu_usage}%"
    echo "Memory Usage: ${mem_usage}%"
}

check_active_connections() {
    local port="$1"
    
    if command -v netstat >/dev/null 2>&1; then
        local connections
        connections=$(netstat -an 2>/dev/null | grep ":$port " | grep ESTABLISHED | wc -l)
        echo "$connections"
    elif command -v ss >/dev/null 2>&1; then
        local connections
        connections=$(ss -an 2>/dev/null | grep ":$port " | grep ESTAB | wc -l)
        echo "$connections"
    else
        echo "0"
    fi
}

wait_for_connections_to_drain() {
    local port="$1"
    local timeout="$2"
    local start_time end_time
    
    start_time=$(date +%s)
    end_time=$((start_time + timeout))
    
    log_step "Draining active connections on port $port..."
    
    while [[ $(date +%s) -lt $end_time ]]; do
        local active_connections
        active_connections=$(check_active_connections "$port")
        
        if [[ $active_connections -eq 0 ]]; then
            log_success "All connections drained"
            return 0
        fi
        
        log_info "Active connections: $active_connections - waiting..."
        sleep 5
    done
    
    local remaining_connections
    remaining_connections=$(check_active_connections "$port")
    log_warning "Connection drain timeout - $remaining_connections connections remaining"
    return 1
}

send_graceful_shutdown_signal() {
    local pid="$1"
    
    log_step "Sending graceful shutdown signal to Node.js process (PID: $pid)..."
    
    # Send SIGTERM for graceful shutdown
    if kill -TERM "$pid" 2>/dev/null; then
        log_success "SIGTERM sent successfully"
        return 0
    else
        log_error "Failed to send SIGTERM"
        return 1
    fi
}

wait_for_graceful_shutdown() {
    local pid="$1"
    local timeout="$2"
    local start_time end_time
    
    start_time=$(date +%s)
    end_time=$((start_time + timeout))
    
    log_step "Waiting for graceful shutdown (timeout: ${timeout}s)..."
    
    while [[ $(date +%s) -lt $end_time ]]; do
        if ! kill -0 "$pid" 2>/dev/null; then
            local elapsed=$(($(date +%s) - start_time))
            log_success "Process shut down gracefully in ${elapsed}s"
            return 0
        fi
        
        log_info "Process still running - waiting..."
        sleep 2
    done
    
    log_warning "Graceful shutdown timeout exceeded"
    return 1
}

force_shutdown() {
    local pid="$1"
    
    log_step "Initiating force shutdown for PID: $pid"
    
    # First try SIGKILL
    if kill -KILL "$pid" 2>/dev/null; then
        sleep 2
        if ! kill -0 "$pid" 2>/dev/null; then
            log_success "Process force terminated"
            return 0
        fi
    fi
    
    log_error "Failed to force terminate process"
    return 1
}

create_shutdown_backup() {
    log_step "Creating pre-shutdown backup..."
    
    local timestamp
    timestamp=$(date +"%Y%m%d_%H%M%S")
    local backup_path="${BACKUP_DIR}/nodejs_shutdown_backup_${timestamp}"
    
    mkdir -p "$backup_path"
    
    # Backup Node.js server
    if [[ -f "$NODE_SERVER_NAME" ]]; then
        cp "$NODE_SERVER_NAME" "$backup_path/"
        log_info "Backed up Node.js server"
    fi
    
    # Backup configuration
    if [[ -f ".env" ]]; then
        cp ".env" "$backup_path/"
    fi
    
    if [[ -f ".env.production" ]]; then
        cp ".env.production" "$backup_path/"
    fi
    
    if [[ -f "package.json" ]]; then
        cp "package.json" "$backup_path/"
    fi
    
    # Backup current logs
    if [[ -d "$LOG_DIR" ]]; then
        cp -r "$LOG_DIR" "$backup_path/logs_snapshot" 2>/dev/null || true
    fi
    
    echo "$backup_path" > "${BACKUP_DIR}/nodejs_shutdown_latest.txt"
    log_success "Backup created: $backup_path"
}

update_process_status() {
    local status="$1"
    local message="$2"
    
    cat > "${LOG_DIR}/nodejs-shutdown-status.json" << EOF
{
    "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "status": "$status",
    "message": "$message",
    "port": $DEFAULT_PORT,
    "script": "graceful-shutdown-nodejs.sh"
}
EOF
}

# =============================================================================
# RUST SERVICE READINESS
# =============================================================================

verify_rust_binary() {
    log_step "Verifying Rust binary readiness..."
    
    local rust_binary="target/release/$RUST_BIN_NAME"
    
    if [[ ! -f "$rust_binary" ]]; then
        log_error "Rust binary not found: $rust_binary"
        return 1
    fi
    
    if [[ ! -x "$rust_binary" ]]; then
        log_error "Rust binary not executable: $rust_binary"
        return 1
    fi
    
    # Quick binary test
    if timeout 5 "$rust_binary" --help > /dev/null 2>&1; then
        log_success "Rust binary verified and ready"
    else
        log_warning "Rust binary test failed (may be normal for server binaries)"
    fi
    
    # Check binary size and info
    local binary_size
    binary_size=$(ls -lh "$rust_binary" | awk '{print $5}')
    log_info "Rust binary size: $binary_size"
    
    return 0
}

prepare_rust_startup() {
    log_step "Preparing Rust service startup configuration..."
    
    # Ensure production environment is ready
    if [[ ! -f ".env.production" ]]; then
        log_warning "Production environment file missing, creating minimal version"
        cat > .env.production << 'EOF'
ENVIRONMENT=production
PORT=8080
LOG_LEVEL=info
RUST_LOG=info
EOF
    fi
    
    # Create startup script for coordinated launch
    cat > "${LOG_DIR}/rust-startup-prepared.sh" << 'EOF'
#!/bin/bash
set -euo pipefail

LOG_DIR="logs"
RUST_BIN="target/release/deepseek-mcp-bridge"

echo "[$(date)] Starting Rust MCP Bridge..."

# Load production environment
set -a
source .env.production
set +a

# Start the service
RUST_LOG=info "$RUST_BIN" --config .env.production > "${LOG_DIR}/rust-transition.log" 2>&1 &
echo $! > "${LOG_DIR}/rust-server.pid"

echo "[$(date)] Rust service started with PID: $(cat ${LOG_DIR}/rust-server.pid)"
EOF
    
    chmod +x "${LOG_DIR}/rust-startup-prepared.sh"
    log_success "Rust startup preparation complete"
}

# =============================================================================
# COORDINATED TRANSITION
# =============================================================================

execute_coordinated_transition() {
    local nodejs_pids=("$@")
    
    log_step "Executing coordinated Node.js to Rust transition..."
    
    # Phase 1: Signal Node.js for graceful shutdown
    log_info "Phase 1: Initiating Node.js graceful shutdown"
    
    local shutdown_initiated=true
    for pid in "${nodejs_pids[@]}"; do
        if ! send_graceful_shutdown_signal "$pid"; then
            shutdown_initiated=false
        fi
    done
    
    if [[ "$shutdown_initiated" == "false" ]]; then
        log_error "Failed to initiate graceful shutdown for some processes"
        return 1
    fi
    
    # Phase 2: Connection draining
    log_info "Phase 2: Connection draining"
    wait_for_connections_to_drain "$DEFAULT_PORT" "$DRAIN_TIMEOUT"
    
    # Phase 3: Wait for graceful shutdown
    log_info "Phase 3: Waiting for graceful shutdown"
    
    local all_shutdown=true
    for pid in "${nodejs_pids[@]}"; do
        if ! wait_for_graceful_shutdown "$pid" "$GRACEFUL_TIMEOUT"; then
            all_shutdown=false
            log_warning "Process $pid did not shut down gracefully"
        fi
    done
    
    # Phase 4: Force shutdown if necessary
    if [[ "$all_shutdown" == "false" ]]; then
        log_info "Phase 4: Force shutdown of remaining processes"
        
        for pid in "${nodejs_pids[@]}"; do
            if kill -0 "$pid" 2>/dev/null; then
                log_warning "Force terminating process $pid"
                force_shutdown "$pid"
            fi
        done
        
        # Wait a moment for cleanup
        sleep 3
    fi
    
    # Phase 5: Verify port is free
    log_info "Phase 5: Port availability verification"
    
    local port_free_attempts=0
    while netstat -tuln 2>/dev/null | grep -q ":${DEFAULT_PORT} " && [[ $port_free_attempts -lt 10 ]]; do
        log_info "Port $DEFAULT_PORT still occupied, waiting..."
        sleep 1
        ((port_free_attempts++))
    done
    
    if netstat -tuln 2>/dev/null | grep -q ":${DEFAULT_PORT} "; then
        log_error "Port $DEFAULT_PORT is still occupied after shutdown"
        return 1
    fi
    
    log_success "Node.js shutdown completed - port $DEFAULT_PORT is free"
    
    # Phase 6: Start Rust service (optional, controlled by parameter)
    if [[ "${1:-}" == "--start-rust" ]]; then
        log_info "Phase 6: Starting Rust service"
        
        if [[ -f "${LOG_DIR}/rust-startup-prepared.sh" ]]; then
            if bash "${LOG_DIR}/rust-startup-prepared.sh"; then
                log_success "Rust service startup initiated"
                
                # Quick verification
                sleep 5
                if [[ -f "${LOG_DIR}/rust-server.pid" ]]; then
                    local rust_pid
                    rust_pid=$(cat "${LOG_DIR}/rust-server.pid")
                    if kill -0 "$rust_pid" 2>/dev/null; then
                        log_success "Rust service running (PID: $rust_pid)"
                    else
                        log_error "Rust service failed to start properly"
                        return 1
                    fi
                else
                    log_error "Rust service PID file not created"
                    return 1
                fi
            else
                log_error "Rust service startup failed"
                return 1
            fi
        else
            log_error "Rust startup script not prepared"
            return 1
        fi
    fi
    
    return 0
}

# =============================================================================
# MAIN SHUTDOWN ORCHESTRATION
# =============================================================================

usage() {
    echo "┗(▀̿Ĺ̯▀̿ ̿)┓ Node.js Graceful Shutdown Script"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -s, --start-rust     Start Rust service after Node.js shutdown"
    echo "  -f, --force          Force immediate shutdown (skip graceful period)"
    echo "  -t, --timeout SEC    Override graceful shutdown timeout (default: 60s)"
    echo "  -d, --drain-time SEC Override connection drain timeout (default: 30s)"
    echo "  -b, --backup         Create backup before shutdown"
    echo "  -q, --quiet          Minimal output"
    echo "  -h, --help           Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                           # Graceful Node.js shutdown only"
    echo "  $0 --start-rust              # Shutdown Node.js and start Rust"
    echo "  $0 --force --start-rust      # Quick transition to Rust"
    echo "  $0 --timeout 120 --backup    # Extended graceful period with backup"
    echo ""
}

main() {
    local start_rust=false
    local force=false
    local custom_timeout=""
    local custom_drain=""
    local create_backup=false
    local quiet=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -s|--start-rust)
                start_rust=true
                shift
                ;;
            -f|--force)
                force=true
                shift
                ;;
            -t|--timeout)
                custom_timeout="$2"
                shift 2
                ;;
            -d|--drain-time)
                custom_drain="$2"
                shift 2
                ;;
            -b|--backup)
                create_backup=true
                shift
                ;;
            -q|--quiet)
                quiet=true
                shift
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
    
    # Override timeouts if specified
    if [[ -n "$custom_timeout" ]]; then
        readonly GRACEFUL_TIMEOUT="$custom_timeout"
    fi
    
    if [[ -n "$custom_drain" ]]; then
        readonly DRAIN_TIMEOUT="$custom_drain"
    fi
    
    if [[ "$force" == "true" ]]; then
        readonly GRACEFUL_TIMEOUT=5
        readonly DRAIN_TIMEOUT=5
    fi
    
    # Setup
    mkdir -p "$LOG_DIR" "$BACKUP_DIR"
    
    echo ""
    echo "┗(▀̿Ĺ̯▀̿ ̿)┓ =============================================="
    echo "                NODE.JS GRACEFUL SHUTDOWN"
    echo "             DeepSeek MCP Bridge Transition"
    echo "┗(▀̿Ĺ̯▀̿ ̿)┓ =============================================="
    echo ""
    
    # Initialize shutdown log
    echo "=== Node.js Graceful Shutdown Started ===" > "${LOG_DIR}/nodejs-shutdown.log"
    echo "Timestamp: $(date)" >> "${LOG_DIR}/nodejs-shutdown.log"
    echo "Graceful Timeout: ${GRACEFUL_TIMEOUT}s" >> "${LOG_DIR}/nodejs-shutdown.log"
    echo "Connection Drain: ${DRAIN_TIMEOUT}s" >> "${LOG_DIR}/nodejs-shutdown.log"
    echo "Start Rust: $start_rust" >> "${LOG_DIR}/nodejs-shutdown.log"
    echo "==========================================" >> "${LOG_DIR}/nodejs-shutdown.log"
    
    # Find Node.js processes
    log_step "Discovering Node.js processes..."
    
    local nodejs_pids
    mapfile -t nodejs_pids < <(find_nodejs_processes)
    
    if [[ ${#nodejs_pids[@]} -eq 0 ]]; then
        log_info "No Node.js MCP server processes found"
        
        if [[ "$start_rust" == "true" ]]; then
            log_info "Proceeding with Rust service startup..."
            verify_rust_binary || exit 1
            prepare_rust_startup
            
            if bash "${LOG_DIR}/rust-startup-prepared.sh"; then
                log_success "Rust service started successfully"
                exit 0
            else
                log_error "Rust service startup failed"
                exit 1
            fi
        else
            log_success "No action needed - Node.js server not running"
            exit 0
        fi
    fi
    
    # Display process information
    echo ""
    log_info "Found ${#nodejs_pids[@]} Node.js process(es):"
    for pid in "${nodejs_pids[@]}"; do
        echo ""
        log_info "Process ID: $pid"
        get_process_info "$pid" | sed 's/^/  /'
    done
    echo ""
    
    # Check active connections
    local active_connections
    active_connections=$(check_active_connections "$DEFAULT_PORT")
    log_info "Active connections on port $DEFAULT_PORT: $active_connections"
    
    # Create backup if requested
    if [[ "$create_backup" == "true" ]]; then
        create_shutdown_backup
    fi
    
    # Prepare Rust service if needed
    if [[ "$start_rust" == "true" ]]; then
        verify_rust_binary || exit 1
        prepare_rust_startup
    fi
    
    # Update status
    update_process_status "shutting_down" "Initiating graceful shutdown of Node.js processes"
    
    # Execute coordinated transition
    local transition_args=()
    if [[ "$start_rust" == "true" ]]; then
        transition_args+=("--start-rust")
    fi
    
    if execute_coordinated_transition "${nodejs_pids[@]}" "${transition_args[@]}"; then
        update_process_status "completed" "Node.js graceful shutdown completed successfully"
        
        echo ""
        echo "┗(▀̿Ĺ̯▀̿ ̿)┓ ============================================="
        echo "               SHUTDOWN SUCCESSFUL"
        echo "┗(▀̿Ĺ̯▀̿ ̿)┓ ============================================="
        echo ""
        
        if [[ "$start_rust" == "true" ]]; then
            echo "🔄 Transition Complete:"
            echo "   • Node.js MCP Server: Stopped"
            echo "   • Rust MCP Bridge: Running"
            echo "   • Port: $DEFAULT_PORT (now serving Rust service)"
        else
            echo "🛑 Node.js Shutdown Complete:"
            echo "   • All Node.js processes stopped gracefully"
            echo "   • Port $DEFAULT_PORT is now available"
        fi
        
        echo ""
        echo "📁 Logs and Status:"
        echo "   • Shutdown Log: ${LOG_DIR}/nodejs-shutdown.log"
        echo "   • Status File: ${LOG_DIR}/nodejs-shutdown-status.json"
        
        if [[ "$start_rust" == "true" ]] && [[ -f "${LOG_DIR}/rust-server.pid" ]]; then
            echo "   • Rust Service PID: $(cat "${LOG_DIR}/rust-server.pid")"
            echo "   • Rust Service Log: ${LOG_DIR}/rust-transition.log"
        fi
        
        echo ""
        echo "┗(▀̿Ĺ̯▀̿ ̿)┓ Graceful transition completed successfully!"
        echo "=============================================="
        
        exit 0
    else
        update_process_status "failed" "Node.js graceful shutdown failed"
        
        echo ""
        echo "┗(▀̿Ĺ̯▀̿ ̿)┓ ============================================="
        echo "                SHUTDOWN FAILED"
        echo "┗(▀̿Ĺ̯▀̿ ̿)┓ ============================================="
        echo ""
        echo "❌ Graceful shutdown was not fully successful"
        echo "📁 Check logs for details: ${LOG_DIR}/nodejs-shutdown.log"
        echo "🛠️  Manual intervention may be required"
        echo ""
        echo "🚨 Emergency options:"
        echo "   • Force kill remaining processes: pkill -9 -f '$NODE_SERVER_NAME'"
        echo "   • Check port usage: netstat -tuln | grep :$DEFAULT_PORT"
        echo "   • Rollback if needed: ./rollback-mcp-server.sh --interactive"
        echo ""
        
        exit 1
    fi
}

# Handle script interruption
trap 'update_process_status "interrupted" "Shutdown process was interrupted"; exit 130' INT TERM

# Execute main function
main "$@"