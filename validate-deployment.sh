#!/bin/bash

# ┗(▀̿Ĺ̯▀̿ ̿)┓ CI-CD Deployment Validation Script
# DeepSeek MCP Bridge - Comprehensive Deployment Testing
# Production readiness verification and integration testing

set -euo pipefail

# =============================================================================
# CONFIGURATION
# =============================================================================

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$SCRIPT_DIR"
readonly LOG_DIR="${PROJECT_ROOT}/logs"
readonly VALIDATION_LOG="${LOG_DIR}/deployment-validation.log"

# Service Configuration
readonly SERVICE_NAME="deepseek-mcp-bridge"
readonly RUST_BIN_NAME="deepseek-mcp-bridge"
readonly DEFAULT_PORT=8080

# Test Configuration
readonly TEST_TIMEOUT=30
readonly MCP_TEST_ITERATIONS=5
readonly LOAD_TEST_DURATION=60
readonly LOAD_TEST_CONCURRENT=10

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly PURPLE='\033[0;35m'
readonly CYAN='\033[0;36m'
readonly WHITE='\033[1;37m'
readonly NC='\033[0m'

# Test Results
declare -A test_results
declare -A test_details
declare -g total_tests=0
declare -g passed_tests=0
declare -g failed_tests=0
declare -g warnings=0

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

log() {
    echo -e "${WHITE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$VALIDATION_LOG"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" | tee -a "$VALIDATION_LOG"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" | tee -a "$VALIDATION_LOG"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*" | tee -a "$VALIDATION_LOG"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" | tee -a "$VALIDATION_LOG"
}

log_step() {
    echo -e "${PURPLE}┗(▀̿Ĺ̯▀̿ ̿)┓${NC} ${CYAN}$*${NC}" | tee -a "$VALIDATION_LOG"
}

record_test() {
    local test_name="$1"
    local result="$2"
    local details="$3"
    
    test_results["$test_name"]="$result"
    test_details["$test_name"]="$details"
    ((total_tests++))
    
    case "$result" in
        "PASS") ((passed_tests++)) ;;
        "FAIL") ((failed_tests++)) ;;
        "WARN") ((warnings++)) ;;
    esac
}

# =============================================================================
# VALIDATION TESTS
# =============================================================================

test_service_status() {
    log_step "Testing service status and process health..."
    
    # Check if service is running
    if [[ -f "${LOG_DIR}/rust-server.pid" ]]; then
        local pid
        pid=$(cat "${LOG_DIR}/rust-server.pid" 2>/dev/null || echo "")
        
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            record_test "service_process" "PASS" "Rust service running with PID $pid"
        else
            record_test "service_process" "FAIL" "PID file exists but process not found"
            return
        fi
    else
        # Check for running process without PID file
        if pgrep -f "$RUST_BIN_NAME" > /dev/null; then
            local pid
            pid=$(pgrep -f "$RUST_BIN_NAME" | head -1)
            record_test "service_process" "WARN" "Process running without PID file (PID: $pid)"
        else
            record_test "service_process" "FAIL" "No Rust service process found"
            return
        fi
    fi
    
    # Check port binding
    if netstat -tuln 2>/dev/null | grep -q ":${DEFAULT_PORT} .*LISTEN" ||
       ss -tuln 2>/dev/null | grep -q ":${DEFAULT_PORT} .*LISTEN"; then
        record_test "port_binding" "PASS" "Service listening on port $DEFAULT_PORT"
    else
        record_test "port_binding" "FAIL" "Service not listening on port $DEFAULT_PORT"
    fi
}

test_basic_connectivity() {
    log_step "Testing basic network connectivity..."
    
    # Test TCP connection
    if timeout 10 bash -c "exec 3<>/dev/tcp/localhost/$DEFAULT_PORT && exec 3<&-"; then
        record_test "tcp_connectivity" "PASS" "TCP connection successful"
    else
        record_test "tcp_connectivity" "FAIL" "TCP connection failed"
        return
    fi
    
    # Test HTTP connectivity
    local http_response
    if http_response=$(curl -sf --max-time 10 "http://localhost:${DEFAULT_PORT}/" 2>&1); then
        record_test "http_connectivity" "PASS" "HTTP connection successful"
    else
        record_test "http_connectivity" "FAIL" "HTTP connection failed: $http_response"
    fi
}

test_health_endpoints() {
    log_step "Testing health and status endpoints..."
    
    # Test health endpoint
    local health_response
    local health_status
    
    if health_response=$(curl -sf --max-time 10 "http://localhost:${DEFAULT_PORT}/health" 2>&1); then
        if command -v jq >/dev/null 2>&1; then
            health_status=$(echo "$health_response" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")
            
            if [[ "$health_status" == "healthy" || "$health_status" == "ok" ]]; then
                record_test "health_endpoint" "PASS" "Health endpoint reports: $health_status"
            else
                record_test "health_endpoint" "WARN" "Health endpoint reports: $health_status"
            fi
        else
            record_test "health_endpoint" "PASS" "Health endpoint responding (JSON parser unavailable)"
        fi
    else
        record_test "health_endpoint" "FAIL" "Health endpoint not responding: $health_response"
    fi
    
    # Test metrics endpoint
    if curl -sf --max-time 10 "http://localhost:${DEFAULT_PORT}/metrics" >/dev/null 2>&1; then
        record_test "metrics_endpoint" "PASS" "Metrics endpoint responding"
    else
        record_test "metrics_endpoint" "WARN" "Metrics endpoint not available"
    fi
}

test_mcp_protocol() {
    log_step "Testing MCP protocol endpoints..."
    
    # Test MCP initialize
    local init_response
    if init_response=$(curl -sf --max-time 15 \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"validation-test","version":"1.0"}}}' \
        "http://localhost:${DEFAULT_PORT}/mcp/initialize" 2>&1); then
        
        if command -v jq >/dev/null 2>&1; then
            local protocol_version
            protocol_version=$(echo "$init_response" | jq -r '.result.protocolVersion // "unknown"' 2>/dev/null || echo "unknown")
            record_test "mcp_initialize" "PASS" "MCP initialize successful (protocol: $protocol_version)"
        else
            record_test "mcp_initialize" "PASS" "MCP initialize endpoint responding"
        fi
    else
        record_test "mcp_initialize" "FAIL" "MCP initialize failed: $init_response"
    fi
    
    # Test MCP tools list
    if curl -sf --max-time 15 \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
        "http://localhost:${DEFAULT_PORT}/mcp/tools" >/dev/null 2>&1; then
        record_test "mcp_tools" "PASS" "MCP tools endpoint responding"
    else
        record_test "mcp_tools" "WARN" "MCP tools endpoint not responding"
    fi
    
    # Test MCP resources list
    if curl -sf --max-time 15 \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","id":3,"method":"resources/list","params":{}}' \
        "http://localhost:${DEFAULT_PORT}/mcp/resources" >/dev/null 2>&1; then
        record_test "mcp_resources" "PASS" "MCP resources endpoint responding"
    else
        record_test "mcp_resources" "WARN" "MCP resources endpoint not responding"
    fi
}

test_deepseek_integration() {
    log_step "Testing DeepSeek API integration..."
    
    # Test DeepSeek health
    if curl -sf --max-time 15 "http://localhost:${DEFAULT_PORT}/deepseek/health" >/dev/null 2>&1; then
        record_test "deepseek_health" "PASS" "DeepSeek health endpoint responding"
    else
        record_test "deepseek_health" "WARN" "DeepSeek health endpoint not available"
    fi
    
    # Test simple query (if API key is available)
    if [[ -n "${DEEPSEEK_API_KEY:-}" ]]; then
        local query_response
        if query_response=$(curl -sf --max-time 30 \
            -H "Content-Type: application/json" \
            -d '{"query":"test connection","max_tokens":10}' \
            "http://localhost:${DEFAULT_PORT}/deepseek/query" 2>&1); then
            
            record_test "deepseek_query" "PASS" "DeepSeek query test successful"
        else
            record_test "deepseek_query" "WARN" "DeepSeek query test failed: $query_response"
        fi
    else
        record_test "deepseek_query" "WARN" "DeepSeek API key not configured - skipping query test"
    fi
}

test_performance() {
    log_step "Testing basic performance characteristics..."
    
    # Response time test
    local start_time end_time response_time
    start_time=$(date +%s%3N)
    
    if curl -sf --max-time 10 "http://localhost:${DEFAULT_PORT}/health" >/dev/null 2>&1; then
        end_time=$(date +%s%3N)
        response_time=$((end_time - start_time))
        
        if [[ $response_time -lt 1000 ]]; then
            record_test "response_time" "PASS" "Health endpoint response time: ${response_time}ms"
        elif [[ $response_time -lt 3000 ]]; then
            record_test "response_time" "WARN" "Slow response time: ${response_time}ms"
        else
            record_test "response_time" "FAIL" "Very slow response time: ${response_time}ms"
        fi
    else
        record_test "response_time" "FAIL" "Response time test failed"
    fi
    
    # Memory usage check
    if command -v ps >/dev/null 2>&1 && [[ -f "${LOG_DIR}/rust-server.pid" ]]; then
        local pid
        pid=$(cat "${LOG_DIR}/rust-server.pid" 2>/dev/null || echo "")
        
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            local mem_usage
            mem_usage=$(ps -p "$pid" -o rss= 2>/dev/null | tr -d ' ' || echo "0")
            
            if [[ $mem_usage -lt 102400 ]]; then  # < 100MB
                record_test "memory_usage" "PASS" "Memory usage: $((mem_usage / 1024))MB"
            elif [[ $mem_usage -lt 512000 ]]; then  # < 500MB
                record_test "memory_usage" "WARN" "Elevated memory usage: $((mem_usage / 1024))MB"
            else
                record_test "memory_usage" "FAIL" "High memory usage: $((mem_usage / 1024))MB"
            fi
        else
            record_test "memory_usage" "WARN" "Could not check memory usage - process not found"
        fi
    else
        record_test "memory_usage" "WARN" "Memory usage check not available"
    fi
}

test_concurrent_requests() {
    log_step "Testing concurrent request handling..."
    
    if ! command -v curl >/dev/null 2>&1; then
        record_test "concurrent_requests" "WARN" "curl not available for concurrent test"
        return
    fi
    
    # Create background requests
    local temp_dir
    temp_dir=$(mktemp -d)
    local success_count=0
    local total_requests=10
    
    for i in $(seq 1 $total_requests); do
        (
            if curl -sf --max-time 10 "http://localhost:${DEFAULT_PORT}/health" >/dev/null 2>&1; then
                echo "success" > "${temp_dir}/request_${i}.result"
            else
                echo "failure" > "${temp_dir}/request_${i}.result"
            fi
        ) &
    done
    
    # Wait for all background jobs
    wait
    
    # Count successes
    for i in $(seq 1 $total_requests); do
        if [[ -f "${temp_dir}/request_${i}.result" ]] && 
           [[ "$(cat "${temp_dir}/request_${i}.result")" == "success" ]]; then
            ((success_count++))
        fi
    done
    
    # Cleanup
    rm -rf "$temp_dir"
    
    if [[ $success_count -eq $total_requests ]]; then
        record_test "concurrent_requests" "PASS" "All $total_requests concurrent requests succeeded"
    elif [[ $success_count -gt $((total_requests * 80 / 100)) ]]; then
        record_test "concurrent_requests" "WARN" "$success_count/$total_requests concurrent requests succeeded"
    else
        record_test "concurrent_requests" "FAIL" "Only $success_count/$total_requests concurrent requests succeeded"
    fi
}

test_configuration() {
    log_step "Testing configuration and environment..."
    
    # Check production environment file
    if [[ -f ".env.production" ]]; then
        record_test "production_config" "PASS" "Production environment configuration exists"
        
        # Check for required variables
        local required_vars=("ENVIRONMENT" "PORT" "LOG_LEVEL")
        local missing_vars=()
        
        for var in "${required_vars[@]}"; do
            if ! grep -q "^${var}=" ".env.production"; then
                missing_vars+=("$var")
            fi
        done
        
        if [[ ${#missing_vars[@]} -eq 0 ]]; then
            record_test "config_completeness" "PASS" "All required configuration variables present"
        else
            record_test "config_completeness" "WARN" "Missing configuration variables: ${missing_vars[*]}"
        fi
    else
        record_test "production_config" "FAIL" "Production environment configuration missing"
    fi
    
    # Check binary exists and is optimized
    if [[ -f "target/release/$RUST_BIN_NAME" ]]; then
        local binary_size
        binary_size=$(ls -lh "target/release/$RUST_BIN_NAME" | awk '{print $5}')
        record_test "optimized_binary" "PASS" "Release binary exists (size: $binary_size)"
    else
        record_test "optimized_binary" "FAIL" "Release binary not found"
    fi
    
    # Check Claude Desktop configuration
    if [[ -f "claude-desktop-config.json" ]]; then
        if command -v jq >/dev/null 2>&1; then
            if jq -e '.mcpServers."deepseek-mcp-bridge"' "claude-desktop-config.json" >/dev/null 2>&1; then
                record_test "claude_config" "PASS" "Claude Desktop configuration valid"
            else
                record_test "claude_config" "WARN" "Claude Desktop configuration incomplete"
            fi
        else
            record_test "claude_config" "PASS" "Claude Desktop configuration exists (validation limited)"
        fi
    else
        record_test "claude_config" "WARN" "Claude Desktop configuration not found"
    fi
}

test_logging() {
    log_step "Testing logging and monitoring..."
    
    # Check log directory and files
    if [[ -d "$LOG_DIR" ]]; then
        record_test "log_directory" "PASS" "Log directory exists"
        
        # Check for recent log entries
        if [[ -f "${LOG_DIR}/rust-server.log" ]]; then
            local log_size
            log_size=$(wc -l < "${LOG_DIR}/rust-server.log" 2>/dev/null || echo "0")
            
            if [[ $log_size -gt 0 ]]; then
                record_test "service_logging" "PASS" "Service logging active ($log_size log lines)"
            else
                record_test "service_logging" "WARN" "Service log file empty"
            fi
            
            # Check for errors in recent logs
            local recent_errors
            recent_errors=$(tail -50 "${LOG_DIR}/rust-server.log" 2>/dev/null | grep -i "error\|panic\|fatal" | wc -l || echo "0")
            
            if [[ $recent_errors -eq 0 ]]; then
                record_test "log_errors" "PASS" "No recent errors in service logs"
            elif [[ $recent_errors -lt 5 ]]; then
                record_test "log_errors" "WARN" "$recent_errors recent errors in service logs"
            else
                record_test "log_errors" "FAIL" "$recent_errors recent errors in service logs"
            fi
        else
            record_test "service_logging" "WARN" "Service log file not found"
        fi
    else
        record_test "log_directory" "FAIL" "Log directory not found"
    fi
}

test_security() {
    log_step "Testing security configuration..."
    
    # Check file permissions
    if [[ -f "target/release/$RUST_BIN_NAME" ]]; then
        local perms
        perms=$(ls -l "target/release/$RUST_BIN_NAME" | cut -d' ' -f1)
        
        if [[ "$perms" == "-rwxr-xr-x" ]] || [[ "$perms" == "-rwx------" ]]; then
            record_test "binary_permissions" "PASS" "Binary has appropriate permissions: $perms"
        else
            record_test "binary_permissions" "WARN" "Binary permissions may be too permissive: $perms"
        fi
    fi
    
    # Check configuration file permissions
    if [[ -f ".env.production" ]]; then
        local env_perms
        env_perms=$(ls -l ".env.production" | cut -d' ' -f1)
        
        if [[ "$env_perms" =~ ^-rw-------$ ]] || [[ "$env_perms" =~ ^-rw-r-----$ ]]; then
            record_test "config_permissions" "PASS" "Configuration has secure permissions: $env_perms"
        else
            record_test "config_permissions" "WARN" "Configuration permissions should be more restrictive: $env_perms"
        fi
    fi
    
    # Test for sensitive information exposure
    if curl -sf --max-time 10 "http://localhost:${DEFAULT_PORT}/config" 2>/dev/null | grep -q "API_KEY\|SECRET\|TOKEN"; then
        record_test "info_exposure" "FAIL" "Sensitive configuration exposed via web interface"
    else
        record_test "info_exposure" "PASS" "No sensitive information exposed"
    fi
}

# =============================================================================
# RESULTS AND REPORTING
# =============================================================================

generate_validation_report() {
    local report_file="${LOG_DIR}/validation-report-$(date +%Y%m%d_%H%M%S).json"
    local overall_status
    
    if [[ $failed_tests -eq 0 ]]; then
        if [[ $warnings -eq 0 ]]; then
            overall_status="EXCELLENT"
        else
            overall_status="GOOD"
        fi
    else
        if [[ $failed_tests -le 2 ]]; then
            overall_status="FAIR"
        else
            overall_status="POOR"
        fi
    fi
    
    # Create JSON report
    cat > "$report_file" << EOF
{
    "validation": {
        "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
        "overall_status": "$overall_status",
        "total_tests": $total_tests,
        "passed_tests": $passed_tests,
        "failed_tests": $failed_tests,
        "warnings": $warnings,
        "success_rate": "$(( (passed_tests * 100) / total_tests ))%"
    },
    "test_results": {
EOF
    
    local first=true
    for test_name in "${!test_results[@]}"; do
        [[ "$first" == "false" ]] && echo "," >> "$report_file"
        first=false
        
        cat >> "$report_file" << EOF
        "$test_name": {
            "result": "${test_results[$test_name]}",
            "details": "${test_details[$test_name]}"
        }
EOF
    done
    
    cat >> "$report_file" << 'EOF'
    },
    "recommendations": {
        "immediate_actions": [],
        "monitoring": [],
        "optimization": []
    }
}
EOF
    
    echo "$report_file"
}

display_results() {
    local report_file="$1"
    
    echo ""
    echo "┗(▀̿Ĺ̯▀̿ ̿)┓ ============================================="
    echo "               VALIDATION RESULTS"
    echo "┗(▀̿Ĺ̯▀̿ ̿)┓ ============================================="
    echo ""
    
    # Overall status
    local overall_status
    if [[ $failed_tests -eq 0 ]]; then
        if [[ $warnings -eq 0 ]]; then
            overall_status="✅ EXCELLENT - Production Ready"
        else
            overall_status="✅ GOOD - Minor Issues to Address"
        fi
    else
        if [[ $failed_tests -le 2 ]]; then
            overall_status="⚠️  FAIR - Some Issues Need Attention"
        else
            overall_status="❌ POOR - Critical Issues Must Be Resolved"
        fi
    fi
    
    echo "🎯 Overall Status: $overall_status"
    echo ""
    
    # Test summary
    echo "📊 Test Summary:"
    echo "   • Total Tests: $total_tests"
    echo "   • ✅ Passed: $passed_tests"
    echo "   • ⚠️  Warnings: $warnings"
    echo "   • ❌ Failed: $failed_tests"
    echo "   • Success Rate: $(( (passed_tests * 100) / total_tests ))%"
    echo ""
    
    # Detailed results
    echo "📋 Detailed Results:"
    echo "===================="
    
    for test_name in "${!test_results[@]}"; do
        local result="${test_results[$test_name]}"
        local details="${test_details[$test_name]}"
        local icon
        
        case "$result" in
            "PASS") icon="✅" ;;
            "WARN") icon="⚠️" ;;
            "FAIL") icon="❌" ;;
        esac
        
        printf "%-25s %s %s\n" "$test_name" "$icon" "$details"
    done
    
    echo ""
    
    # Recommendations
    echo "🔧 Recommendations:"
    echo "==================="
    
    if [[ $failed_tests -eq 0 && $warnings -eq 0 ]]; then
        echo "   ✅ Deployment is production-ready!"
        echo "   • All tests passed successfully"
        echo "   • No immediate action required"
        echo "   • Continue with regular monitoring"
    elif [[ $failed_tests -eq 0 ]]; then
        echo "   ⚠️  Deployment is functional with minor issues:"
        echo "   • Address warning items when convenient"
        echo "   • Monitor system performance"
        echo "   • Consider optimization opportunities"
    elif [[ $failed_tests -le 2 ]]; then
        echo "   🚨 Address failed tests before production use:"
        echo "   • Fix critical issues identified"
        echo "   • Re-run validation after fixes"
        echo "   • Monitor closely after deployment"
    else
        echo "   🚨 CRITICAL: Do not use in production!"
        echo "   • Multiple critical failures detected"
        echo "   • Consider rolling back deployment"
        echo "   • Review logs and configuration"
        echo "   • Contact support if issues persist"
    fi
    
    echo ""
    echo "📁 Report Files:"
    echo "   • Validation Log: $VALIDATION_LOG"
    echo "   • JSON Report: $report_file"
    echo "   • Service Logs: ${LOG_DIR}/"
    echo ""
    echo "┗(▀̿Ĺ̯▀̿ ̿)┓ Validation completed at $(date)"
    echo "============================================="
    echo ""
}

# =============================================================================
# MAIN VALIDATION ORCHESTRATION
# =============================================================================

usage() {
    echo "┗(▀̿Ĺ̯▀̿ ̿)┓ Deployment Validation Script"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -f, --full           Run comprehensive validation (default)"
    echo "  -q, --quick          Run basic validation only"
    echo "  -p, --performance    Include performance tests"
    echo "  -s, --security       Include security tests"
    echo "  -c, --concurrent     Include concurrent load tests"
    echo "  -j, --json           Output JSON report only"
    echo "  --timeout SECONDS    Set test timeout (default: 30)"
    echo "  -h, --help           Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                   # Full validation"
    echo "  $0 --quick           # Basic checks only"
    echo "  $0 --performance     # Include performance tests"
    echo "  $0 --json            # JSON output for automation"
    echo ""
}

main() {
    local full_validation=true
    local quick_only=false
    local include_performance=false
    local include_security=false
    local include_concurrent=false
    local json_only=false
    local custom_timeout=""
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -f|--full)
                full_validation=true
                shift
                ;;
            -q|--quick)
                full_validation=false
                quick_only=true
                shift
                ;;
            -p|--performance)
                include_performance=true
                shift
                ;;
            -s|--security)
                include_security=true
                shift
                ;;
            -c|--concurrent)
                include_concurrent=true
                shift
                ;;
            -j|--json)
                json_only=true
                shift
                ;;
            --timeout)
                custom_timeout="$2"
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
    
    # Override timeout if specified
    if [[ -n "$custom_timeout" ]]; then
        readonly TEST_TIMEOUT="$custom_timeout"
    fi
    
    # Setup
    mkdir -p "$LOG_DIR"
    
    if [[ "$json_only" == "false" ]]; then
        echo ""
        echo "┗(▀̿Ĺ̯▀̿ ̿)┓ ============================================="
        echo "               DEPLOYMENT VALIDATION"
        echo "            DeepSeek MCP Bridge Testing"
        echo "┗(▀̿Ĺ̯▀̿ ̿)┓ ============================================="
        echo ""
    fi
    
    # Initialize validation log
    echo "=== Deployment Validation Started ===" > "$VALIDATION_LOG"
    echo "Timestamp: $(date)" >> "$VALIDATION_LOG"
    echo "Mode: $([ "$quick_only" == "true" ] && echo "Quick" || echo "Full")" >> "$VALIDATION_LOG"
    echo "=======================================" >> "$VALIDATION_LOG"
    
    # Run test suites
    test_service_status
    test_basic_connectivity
    test_health_endpoints
    
    if [[ "$quick_only" == "false" ]]; then
        test_mcp_protocol
        test_deepseek_integration
        test_configuration
        test_logging
        
        if [[ "$full_validation" == "true" ]] || [[ "$include_performance" == "true" ]]; then
            test_performance
        fi
        
        if [[ "$full_validation" == "true" ]] || [[ "$include_security" == "true" ]]; then
            test_security
        fi
        
        if [[ "$full_validation" == "true" ]] || [[ "$include_concurrent" == "true" ]]; then
            test_concurrent_requests
        fi
    fi
    
    # Generate report
    local report_file
    report_file=$(generate_validation_report)
    
    if [[ "$json_only" == "true" ]]; then
        cat "$report_file"
    else
        display_results "$report_file"
    fi
    
    # Exit with appropriate code
    if [[ $failed_tests -eq 0 ]]; then
        exit 0  # Success
    elif [[ $failed_tests -le 2 ]]; then
        exit 1  # Warning
    else
        exit 2  # Critical issues
    fi
}

# Execute main function
main "$@"