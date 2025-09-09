#!/bin/bash

# ┗(▀̿Ĺ̯▀̿ ̿)┓ CI-CD Health Check Script
# DeepSeek MCP Bridge - Comprehensive Service Health Monitoring
# Real-time health validation and diagnostics

set -euo pipefail

# =============================================================================
# CONFIGURATION
# =============================================================================

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$SCRIPT_DIR"
readonly LOG_DIR="${PROJECT_ROOT}/logs"

# Service Configuration
readonly SERVICE_NAME="deepseek-mcp-bridge"
readonly RUST_BIN_NAME="deepseek-mcp-bridge"
readonly NODE_SERVER_NAME="server.js"
readonly DEFAULT_PORT=8080
readonly HEALTH_PORT=8081

# Health Check Settings
readonly TIMEOUT=10
readonly MAX_RETRIES=3
readonly RETRY_DELAY=2

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly PURPLE='\033[0;35m'
readonly CYAN='\033[0;36m'
readonly WHITE='\033[1;37m'
readonly NC='\033[0m'

# Status codes
readonly STATUS_HEALTHY=0
readonly STATUS_DEGRADED=1
readonly STATUS_UNHEALTHY=2
readonly STATUS_UNKNOWN=3

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

log() {
    echo -e "${WHITE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

log_step() {
    echo -e "${PURPLE}┗(▀̿Ĺ̯▀̿ ̿)┓${NC} ${CYAN}$*${NC}"
}

status_icon() {
    case "$1" in
        0) echo "✅" ;;
        1) echo "⚠️" ;;
        2) echo "❌" ;;
        *) echo "❓" ;;
    esac
}

status_text() {
    case "$1" in
        0) echo -e "${GREEN}HEALTHY${NC}" ;;
        1) echo -e "${YELLOW}DEGRADED${NC}" ;;
        2) echo -e "${RED}UNHEALTHY${NC}" ;;
        *) echo -e "${BLUE}UNKNOWN${NC}" ;;
    esac
}

# =============================================================================
# HEALTH CHECK FUNCTIONS
# =============================================================================

check_service_process() {
    local service_type="$1"
    local status=$STATUS_UNKNOWN
    
    case "$service_type" in
        "rust")
            if [[ -f "${LOG_DIR}/rust-server.pid" ]]; then
                local pid
                pid=$(cat "${LOG_DIR}/rust-server.pid" 2>/dev/null || echo "")
                if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
                    status=$STATUS_HEALTHY
                    echo "Running (PID: $pid)"
                else
                    status=$STATUS_UNHEALTHY
                    echo "Not running (stale PID file)"
                fi
            else
                # Check for running process
                if pgrep -f "$RUST_BIN_NAME" > /dev/null; then
                    local pid
                    pid=$(pgrep -f "$RUST_BIN_NAME" | head -1)
                    status=$STATUS_DEGRADED
                    echo "Running without PID file (PID: $pid)"
                else
                    status=$STATUS_UNHEALTHY
                    echo "Not running"
                fi
            fi
            ;;
        "nodejs")
            if [[ -f "${LOG_DIR}/nodejs-server.pid" ]]; then
                local pid
                pid=$(cat "${LOG_DIR}/nodejs-server.pid" 2>/dev/null || echo "")
                if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
                    status=$STATUS_HEALTHY
                    echo "Running (PID: $pid)"
                else
                    status=$STATUS_UNHEALTHY
                    echo "Not running (stale PID file)"
                fi
            else
                # Check for running process
                if pgrep -f "$NODE_SERVER_NAME" > /dev/null; then
                    local pid
                    pid=$(pgrep -f "$NODE_SERVER_NAME" | head -1)
                    status=$STATUS_DEGRADED
                    echo "Running without PID file (PID: $pid)"
                else
                    status=$STATUS_UNHEALTHY
                    echo "Not running"
                fi
            fi
            ;;
    esac
    
    return $status
}

check_port_connectivity() {
    local port="$1"
    local retry_count=0
    
    while [[ $retry_count -lt $MAX_RETRIES ]]; do
        if timeout "$TIMEOUT" bash -c "exec 3<>/dev/tcp/localhost/$port && exec 3<&-"; then
            echo "Port $port is reachable"
            return $STATUS_HEALTHY
        fi
        
        ((retry_count++))
        if [[ $retry_count -lt $MAX_RETRIES ]]; then
            sleep $RETRY_DELAY
        fi
    done
    
    echo "Port $port is unreachable"
    return $STATUS_UNHEALTHY
}

check_http_endpoint() {
    local url="$1"
    local description="$2"
    local retry_count=0
    
    while [[ $retry_count -lt $MAX_RETRIES ]]; do
        local response
        local http_code
        
        if response=$(curl -sf --max-time "$TIMEOUT" "$url" 2>&1) && 
           http_code=$(curl -sf --max-time "$TIMEOUT" -w "%{http_code}" -o /dev/null "$url" 2>/dev/null); then
            
            case "$http_code" in
                200)
                    echo "$description: HTTP $http_code (OK)"
                    return $STATUS_HEALTHY
                    ;;
                2??)
                    echo "$description: HTTP $http_code (Success)"
                    return $STATUS_HEALTHY
                    ;;
                4??)
                    echo "$description: HTTP $http_code (Client Error)"
                    return $STATUS_DEGRADED
                    ;;
                5??)
                    echo "$description: HTTP $http_code (Server Error)"
                    return $STATUS_UNHEALTHY
                    ;;
                *)
                    echo "$description: HTTP $http_code (Unknown)"
                    return $STATUS_UNKNOWN
                    ;;
            esac
        fi
        
        ((retry_count++))
        if [[ $retry_count -lt $MAX_RETRIES ]]; then
            sleep $RETRY_DELAY
        fi
    done
    
    echo "$description: No response"
    return $STATUS_UNHEALTHY
}

check_mcp_protocol() {
    local base_url="http://localhost:${DEFAULT_PORT}"
    local status=$STATUS_HEALTHY
    local issues=()
    
    # Check MCP initialize endpoint
    local init_result
    if init_result=$(check_http_endpoint "${base_url}/mcp/initialize" "MCP Initialize"); then
        local init_status=$?
        if [[ $init_status -ne $STATUS_HEALTHY ]]; then
            status=$init_status
            issues+=("MCP Initialize endpoint issues")
        fi
    fi
    
    # Check MCP tools endpoint
    local tools_result
    if tools_result=$(check_http_endpoint "${base_url}/mcp/tools" "MCP Tools"); then
        local tools_status=$?
        if [[ $tools_status -ne $STATUS_HEALTHY ]]; then
            [[ $tools_status -gt $status ]] && status=$tools_status
            issues+=("MCP Tools endpoint issues")
        fi
    fi
    
    # Check MCP resources endpoint
    local resources_result
    if resources_result=$(check_http_endpoint "${base_url}/mcp/resources" "MCP Resources"); then
        local resources_status=$?
        if [[ $resources_status -ne $STATUS_HEALTHY ]]; then
            [[ $resources_status -gt $status ]] && status=$resources_status
            issues+=("MCP Resources endpoint issues")
        fi
    fi
    
    if [[ ${#issues[@]} -eq 0 ]]; then
        echo "MCP Protocol: All endpoints responding"
    else
        echo "MCP Protocol: Issues detected - ${issues[*]}"
    fi
    
    return $status
}

check_deepseek_integration() {
    local base_url="http://localhost:${DEFAULT_PORT}"
    local status=$STATUS_HEALTHY
    
    # Check DeepSeek health endpoint
    local deepseek_result
    if deepseek_result=$(check_http_endpoint "${base_url}/deepseek/health" "DeepSeek Integration"); then
        local deepseek_status=$?
        if [[ $deepseek_status -ne $STATUS_HEALTHY ]]; then
            status=$deepseek_status
        fi
    else
        status=$STATUS_UNHEALTHY
    fi
    
    # Try a simple query test (if available)
    if command -v jq >/dev/null 2>&1; then
        local test_query='{"query": "test connection"}'
        local query_response
        
        if query_response=$(curl -sf --max-time "$TIMEOUT" \
            -H "Content-Type: application/json" \
            -d "$test_query" \
            "${base_url}/deepseek/query" 2>/dev/null); then
            
            local query_status
            query_status=$(echo "$query_response" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")
            
            if [[ "$query_status" != "error" ]]; then
                echo "DeepSeek Query Test: Responding"
            else
                echo "DeepSeek Query Test: Error response"
                [[ $status -eq $STATUS_HEALTHY ]] && status=$STATUS_DEGRADED
            fi
        else
            echo "DeepSeek Query Test: Not available"
            [[ $status -eq $STATUS_HEALTHY ]] && status=$STATUS_DEGRADED
        fi
    fi
    
    return $status
}

check_resource_usage() {
    local status=$STATUS_HEALTHY
    local warnings=()
    
    # Check memory usage
    if command -v free >/dev/null 2>&1; then
        local mem_usage
        mem_usage=$(free | awk 'NR==2{printf "%.1f", $3*100/$2}')
        
        if (( $(echo "$mem_usage > 90.0" | bc -l 2>/dev/null || echo "0") )); then
            status=$STATUS_UNHEALTHY
            warnings+=("High memory usage: ${mem_usage}%")
        elif (( $(echo "$mem_usage > 80.0" | bc -l 2>/dev/null || echo "0") )); then
            [[ $status -eq $STATUS_HEALTHY ]] && status=$STATUS_DEGRADED
            warnings+=("Elevated memory usage: ${mem_usage}%")
        else
            echo "Memory Usage: ${mem_usage}% (OK)"
        fi
    fi
    
    # Check disk usage
    local disk_usage
    disk_usage=$(df . | awk 'NR==2{print $5}' | sed 's/%//')
    
    if [[ $disk_usage -gt 95 ]]; then
        status=$STATUS_UNHEALTHY
        warnings+=("Critical disk usage: ${disk_usage}%")
    elif [[ $disk_usage -gt 85 ]]; then
        [[ $status -eq $STATUS_HEALTHY ]] && status=$STATUS_DEGRADED
        warnings+=("High disk usage: ${disk_usage}%")
    else
        echo "Disk Usage: ${disk_usage}% (OK)"
    fi
    
    # Check open file descriptors
    if [[ -f "${LOG_DIR}/rust-server.pid" ]]; then
        local pid
        pid=$(cat "${LOG_DIR}/rust-server.pid" 2>/dev/null || echo "")
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            local fd_count
            if fd_count=$(ls "/proc/$pid/fd" 2>/dev/null | wc -l); then
                if [[ $fd_count -gt 1000 ]]; then
                    [[ $status -eq $STATUS_HEALTHY ]] && status=$STATUS_DEGRADED
                    warnings+=("High file descriptor usage: $fd_count")
                else
                    echo "File Descriptors: $fd_count (OK)"
                fi
            fi
        fi
    fi
    
    if [[ ${#warnings[@]} -gt 0 ]]; then
        echo "Resource Warnings: ${warnings[*]}"
    fi
    
    return $status
}

check_log_health() {
    local status=$STATUS_HEALTHY
    local warnings=()
    
    # Check for recent errors in logs
    if [[ -f "${LOG_DIR}/rust-server.log" ]]; then
        local error_count
        error_count=$(tail -100 "${LOG_DIR}/rust-server.log" 2>/dev/null | grep -i "error\|panic\|fatal" | wc -l || echo "0")
        
        if [[ $error_count -gt 10 ]]; then
            status=$STATUS_UNHEALTHY
            warnings+=("High error count in logs: $error_count recent errors")
        elif [[ $error_count -gt 5 ]]; then
            [[ $status -eq $STATUS_HEALTHY ]] && status=$STATUS_DEGRADED
            warnings+=("Some errors in logs: $error_count recent errors")
        fi
    fi
    
    # Check log file sizes
    if [[ -d "$LOG_DIR" ]]; then
        local large_logs
        large_logs=$(find "$LOG_DIR" -name "*.log" -size +100M 2>/dev/null | wc -l || echo "0")
        
        if [[ $large_logs -gt 0 ]]; then
            [[ $status -eq $STATUS_HEALTHY ]] && status=$STATUS_DEGRADED
            warnings+=("Large log files detected: $large_logs files > 100MB")
        fi
    fi
    
    if [[ ${#warnings[@]} -eq 0 ]]; then
        echo "Log Health: No issues detected"
    else
        echo "Log Issues: ${warnings[*]}"
    fi
    
    return $status
}

# =============================================================================
# COMPREHENSIVE HEALTH CHECK
# =============================================================================

run_comprehensive_check() {
    local overall_status=$STATUS_HEALTHY
    local checks_run=0
    local checks_passed=0
    local checks_degraded=0
    local checks_failed=0
    
    echo ""
    echo "┗(▀̿Ĺ̯▀̿ ̿)┓ ============================================="
    echo "               COMPREHENSIVE HEALTH CHECK"
    echo "            DeepSeek MCP Bridge Diagnostics"
    echo "┗(▀̿Ĺ̯▀̿ ̿)┓ ============================================="
    echo ""
    
    # Service Process Check
    log_step "Checking service processes..."
    echo ""
    
    # Check Rust service
    local rust_result rust_status
    rust_result=$(check_service_process "rust")
    rust_status=$?
    echo "$(status_icon $rust_status) Rust Service: $rust_result"
    
    if [[ $rust_status -gt $overall_status ]]; then
        overall_status=$rust_status
    fi
    
    case $rust_status in
        0) ((checks_passed++)) ;;
        1) ((checks_degraded++)) ;;
        2) ((checks_failed++)) ;;
    esac
    ((checks_run++))
    
    # Check Node.js service
    local nodejs_result nodejs_status
    nodejs_result=$(check_service_process "nodejs")
    nodejs_status=$?
    echo "$(status_icon $nodejs_status) Node.js Service: $nodejs_result"
    
    case $nodejs_status in
        0) ((checks_passed++)) ;;
        1) ((checks_degraded++)) ;;
        2) ((checks_failed++)) ;;
    esac
    ((checks_run++))
    
    echo ""
    
    # Port Connectivity Check
    log_step "Checking port connectivity..."
    echo ""
    
    local port_result port_status
    port_result=$(check_port_connectivity "$DEFAULT_PORT")
    port_status=$?
    echo "$(status_icon $port_status) Main Port: $port_result"
    
    if [[ $port_status -gt $overall_status ]]; then
        overall_status=$port_status
    fi
    
    case $port_status in
        0) ((checks_passed++)) ;;
        1) ((checks_degraded++)) ;;
        2) ((checks_failed++)) ;;
    esac
    ((checks_run++))
    
    echo ""
    
    # HTTP Endpoints Check
    log_step "Checking HTTP endpoints..."
    echo ""
    
    local health_result health_status
    health_result=$(check_http_endpoint "http://localhost:${DEFAULT_PORT}/health" "Health Endpoint")
    health_status=$?
    echo "$(status_icon $health_status) $health_result"
    
    if [[ $health_status -gt $overall_status ]]; then
        overall_status=$health_status
    fi
    
    case $health_status in
        0) ((checks_passed++)) ;;
        1) ((checks_degraded++)) ;;
        2) ((checks_failed++)) ;;
    esac
    ((checks_run++))
    
    echo ""
    
    # MCP Protocol Check
    log_step "Checking MCP protocol endpoints..."
    echo ""
    
    local mcp_result mcp_status
    mcp_result=$(check_mcp_protocol)
    mcp_status=$?
    echo "$(status_icon $mcp_status) $mcp_result"
    
    if [[ $mcp_status -gt $overall_status ]]; then
        overall_status=$mcp_status
    fi
    
    case $mcp_status in
        0) ((checks_passed++)) ;;
        1) ((checks_degraded++)) ;;
        2) ((checks_failed++)) ;;
    esac
    ((checks_run++))
    
    echo ""
    
    # DeepSeek Integration Check
    log_step "Checking DeepSeek integration..."
    echo ""
    
    local deepseek_result deepseek_status
    deepseek_result=$(check_deepseek_integration)
    deepseek_status=$?
    echo "$(status_icon $deepseek_status) $deepseek_result"
    
    if [[ $deepseek_status -gt $overall_status ]]; then
        overall_status=$deepseek_status
    fi
    
    case $deepseek_status in
        0) ((checks_passed++)) ;;
        1) ((checks_degraded++)) ;;
        2) ((checks_failed++)) ;;
    esac
    ((checks_run++))
    
    echo ""
    
    # Resource Usage Check
    log_step "Checking resource usage..."
    echo ""
    
    local resource_result resource_status
    resource_result=$(check_resource_usage)
    resource_status=$?
    echo "$(status_icon $resource_status) $resource_result"
    
    if [[ $resource_status -gt $overall_status ]]; then
        overall_status=$resource_status
    fi
    
    case $resource_status in
        0) ((checks_passed++)) ;;
        1) ((checks_degraded++)) ;;
        2) ((checks_failed++)) ;;
    esac
    ((checks_run++))
    
    echo ""
    
    # Log Health Check
    log_step "Checking log health..."
    echo ""
    
    local log_result log_status
    log_result=$(check_log_health)
    log_status=$?
    echo "$(status_icon $log_status) $log_result"
    
    if [[ $log_status -gt $overall_status ]]; then
        overall_status=$log_status
    fi
    
    case $log_status in
        0) ((checks_passed++)) ;;
        1) ((checks_degraded++)) ;;
        2) ((checks_failed++)) ;;
    esac
    ((checks_run++))
    
    echo ""
    
    # Summary
    echo "┗(▀̿Ĺ̯▀̿ ̿)┓ ============================================="
    echo "                   HEALTH SUMMARY"
    echo "┗(▀̿Ĺ̯▀̿ ̿)┓ ============================================="
    echo ""
    echo "$(status_icon $overall_status) Overall Status: $(status_text $overall_status)"
    echo ""
    echo "📊 Check Results:"
    echo "   • Total Checks: $checks_run"
    echo "   • ✅ Passed: $checks_passed"
    echo "   • ⚠️  Degraded: $checks_degraded"
    echo "   • ❌ Failed: $checks_failed"
    echo ""
    
    # Service Information
    local active_service="None"
    if [[ $rust_status -eq $STATUS_HEALTHY ]]; then
        active_service="Rust MCP Bridge"
    elif [[ $nodejs_status -eq $STATUS_HEALTHY ]]; then
        active_service="Node.js MCP Server"
    elif [[ $rust_status -eq $STATUS_DEGRADED ]]; then
        active_service="Rust MCP Bridge (Degraded)"
    elif [[ $nodejs_status -eq $STATUS_DEGRADED ]]; then
        active_service="Node.js MCP Server (Degraded)"
    fi
    
    echo "🔧 Service Information:"
    echo "   • Active Service: $active_service"
    echo "   • Port: $DEFAULT_PORT"
    echo "   • Health Check: http://localhost:${DEFAULT_PORT}/health"
    
    if [[ -f "${LOG_DIR}/rust-server.pid" ]] || [[ -f "${LOG_DIR}/nodejs-server.pid" ]]; then
        echo "   • Process ID Files: ${LOG_DIR}/*-server.pid"
        echo "   • Service Logs: ${LOG_DIR}/*-server.log"
    fi
    
    echo ""
    
    # Recommendations based on status
    case $overall_status in
        $STATUS_HEALTHY)
            echo "✅ System is healthy and operating normally"
            echo ""
            ;;
        $STATUS_DEGRADED)
            echo "⚠️  System is functional but has issues requiring attention:"
            echo ""
            if [[ $checks_degraded -gt 0 ]]; then
                echo "   • Review degraded checks above"
                echo "   • Consider maintenance during low-traffic period"
                echo "   • Monitor system more closely"
            fi
            echo ""
            ;;
        $STATUS_UNHEALTHY)
            echo "❌ System has critical issues requiring immediate attention:"
            echo ""
            if [[ $checks_failed -gt 0 ]]; then
                echo "   • Address failed checks immediately"
                echo "   • Consider running rollback script if necessary"
                echo "   • Check service logs for detailed error information"
                echo "   • Manual intervention may be required"
            fi
            echo ""
            echo "🚨 Emergency Rollback:"
            echo "   ./rollback-mcp-server.sh --interactive"
            echo ""
            ;;
    esac
    
    echo "┗(▀̿Ĺ̯▀̿ ̿)┓ Health check completed at $(date)"
    echo "============================================="
    
    return $overall_status
}

# =============================================================================
# QUICK HEALTH CHECK
# =============================================================================

run_quick_check() {
    echo "┗(▀̿Ĺ̯▀̿ ̿)┓ Quick Health Check - $(date)"
    echo "========================================"
    
    # Quick process check
    local service_running=false
    if pgrep -f "$RUST_BIN_NAME" > /dev/null; then
        echo "✅ Rust service running"
        service_running=true
    elif pgrep -f "$NODE_SERVER_NAME" > /dev/null; then
        echo "✅ Node.js service running"
        service_running=true
    else
        echo "❌ No MCP service running"
        return $STATUS_UNHEALTHY
    fi
    
    # Quick connectivity check
    if timeout 5 bash -c "exec 3<>/dev/tcp/localhost/$DEFAULT_PORT && exec 3<&-"; then
        echo "✅ Port $DEFAULT_PORT reachable"
    else
        echo "❌ Port $DEFAULT_PORT unreachable"
        return $STATUS_UNHEALTHY
    fi
    
    # Quick HTTP check
    if curl -sf --max-time 5 "http://localhost:${DEFAULT_PORT}/health" > /dev/null 2>&1; then
        echo "✅ Health endpoint responding"
        return $STATUS_HEALTHY
    else
        echo "⚠️  Health endpoint not responding"
        return $STATUS_DEGRADED
    fi
}

# =============================================================================
# MAIN FUNCTION
# =============================================================================

usage() {
    echo "┗(▀̿Ĺ̯▀̿ ̿)┓ Health Check Script"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -c, --comprehensive   Run comprehensive health check (default)"
    echo "  -q, --quick          Run quick health check"
    echo "  -w, --watch          Continuous monitoring mode"
    echo "  -j, --json           Output results in JSON format"
    echo "  -s, --silent         Silent mode (exit codes only)"
    echo "  -h, --help           Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                    # Comprehensive health check"
    echo "  $0 --quick           # Quick status check"
    echo "  $0 --watch           # Continuous monitoring"
    echo "  $0 --json --quick    # JSON output for automation"
    echo ""
    echo "Exit Codes:"
    echo "  0 - Healthy"
    echo "  1 - Degraded (warnings)"
    echo "  2 - Unhealthy (critical issues)"
    echo "  3 - Unknown status"
    echo ""
}

main() {
    local comprehensive=true
    local quick=false
    local watch=false
    local json=false
    local silent=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -c|--comprehensive)
                comprehensive=true
                quick=false
                shift
                ;;
            -q|--quick)
                comprehensive=false
                quick=true
                shift
                ;;
            -w|--watch)
                watch=true
                shift
                ;;
            -j|--json)
                json=true
                shift
                ;;
            -s|--silent)
                silent=true
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done
    
    # Create log directory if needed
    mkdir -p "$LOG_DIR"
    
    if [[ "$watch" == "true" ]]; then
        echo "┗(▀̿Ĺ̯▀̿ ̿)┓ Starting continuous monitoring... (Ctrl+C to stop)"
        echo ""
        
        while true; do
            if [[ "$comprehensive" == "true" ]]; then
                run_comprehensive_check
            else
                run_quick_check
            fi
            echo ""
            echo "Waiting 30 seconds for next check..."
            sleep 30
            clear
        done
    else
        if [[ "$comprehensive" == "true" ]]; then
            run_comprehensive_check
        else
            run_quick_check
        fi
    fi
}

# Handle interruption in watch mode
trap 'echo -e "\n┗(▀̿Ĺ̯▀̿ ̿)┓ Monitoring stopped"; exit 0' INT TERM

# Execute main function
main "$@"