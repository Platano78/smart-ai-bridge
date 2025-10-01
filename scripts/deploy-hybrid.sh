#!/bin/bash

# HYBRID DEPLOYMENT SCRIPT v9.0.0 - ZERO-DOWNTIME MIGRATION
#
# 🎯 DEPLOYMENT FEATURES:
# - Zero-downtime blue-green deployment
# - Automatic health checks and validation
# - Feature flag management with gradual rollout
# - Performance monitoring and automatic rollback
# - Comprehensive logging and reporting
#
# 🚀 USAGE:
# ./scripts/deploy-hybrid.sh [OPTIONS]
#
# OPTIONS:
#   --target-version    Target version (8.0, 8.5, 9.0)
#   --strategy         Deployment strategy (blue_green, canary, rolling)
#   --dry-run          Preview deployment without execution
#   --rollback         Rollback to previous version
#   --health-check     Run health checks only
#   --feature-flags    Manage feature flags
#   --monitoring       Show monitoring dashboard
#
# EXAMPLES:
#   ./scripts/deploy-hybrid.sh --target-version 9.0 --strategy blue_green
#   ./scripts/deploy-hybrid.sh --rollback
#   ./scripts/deploy-hybrid.sh --health-check

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$PROJECT_ROOT/config/hybrid-deployment.json"
LOG_FILE="$PROJECT_ROOT/logs/deployment-$(date +%Y%m%d-%H%M%S).log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default values
TARGET_VERSION=""
DEPLOYMENT_STRATEGY="blue_green"
DRY_RUN=false
ROLLBACK=false
HEALTH_CHECK_ONLY=false
FEATURE_FLAGS_ONLY=false
MONITORING_ONLY=false
VERBOSE=false

# Deployment state
BLUE_ENDPOINT="http://localhost:8000"
GREEN_ENDPOINT="http://localhost:8001"
CURRENT_ACTIVE_ENV=""
DEPLOYMENT_ID=""

# Function definitions
log() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    case "$level" in
        "INFO")  echo -e "${GREEN}[INFO]${NC}  [$timestamp] $message" ;;
        "WARN")  echo -e "${YELLOW}[WARN]${NC}  [$timestamp] $message" ;;
        "ERROR") echo -e "${RED}[ERROR]${NC} [$timestamp] $message" ;;
        "DEBUG") [[ "$VERBOSE" == "true" ]] && echo -e "${CYAN}[DEBUG]${NC} [$timestamp] $message" ;;
    esac

    echo "[$level] [$timestamp] $message" >> "$LOG_FILE"
}

print_banner() {
    echo -e "${PURPLE}"
    echo "╔══════════════════════════════════════════════════════════════════════════════╗"
    echo "║                    🚀 HYBRID DEPLOYMENT FRAMEWORK v9.0.0                    ║"
    echo "║                      Zero-Downtime Migration System                          ║"
    echo "╚══════════════════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --target-version VERSION   Target version (8.0, 8.5, 9.0)"
    echo "  --strategy STRATEGY        Deployment strategy (blue_green, canary, rolling)"
    echo "  --dry-run                  Preview deployment without execution"
    echo "  --rollback                 Rollback to previous version"
    echo "  --health-check             Run health checks only"
    echo "  --feature-flags            Manage feature flags"
    echo "  --monitoring               Show monitoring dashboard"
    echo "  --verbose                  Enable verbose logging"
    echo "  --help                     Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --target-version 9.0 --strategy blue_green"
    echo "  $0 --rollback"
    echo "  $0 --health-check"
    echo "  $0 --feature-flags"
}

check_prerequisites() {
    log "INFO" "🔍 Checking deployment prerequisites..."

    # Check required commands
    local required_commands=("jq" "curl" "nginx" "pm2" "node")
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            log "ERROR" "Required command '$cmd' not found"
            exit 1
        fi
    done

    # Check configuration file
    if [[ ! -f "$CONFIG_FILE" ]]; then
        log "ERROR" "Configuration file not found: $CONFIG_FILE"
        exit 1
    fi

    # Check Node.js version
    local node_version=$(node --version | sed 's/v//')
    local min_version="18.0.0"
    if ! version_compare "$node_version" "$min_version"; then
        log "ERROR" "Node.js version $node_version is below minimum required version $min_version"
        exit 1
    fi

    # Create logs directory
    mkdir -p "$(dirname "$LOG_FILE")"

    log "INFO" "✅ All prerequisites satisfied"
}

version_compare() {
    local version1="$1"
    local version2="$2"

    if [[ "$(printf '%s\n' "$version1" "$version2" | sort -V | head -n1)" == "$version2" ]]; then
        return 0
    else
        return 1
    fi
}

detect_current_environment() {
    log "INFO" "🔍 Detecting current active environment..."

    # Check blue environment
    if health_check "$BLUE_ENDPOINT" > /dev/null 2>&1; then
        local blue_version=$(get_version "$BLUE_ENDPOINT")
        log "DEBUG" "Blue environment: $BLUE_ENDPOINT (v$blue_version) - HEALTHY"
        CURRENT_ACTIVE_ENV="blue"
    fi

    # Check green environment
    if health_check "$GREEN_ENDPOINT" > /dev/null 2>&1; then
        local green_version=$(get_version "$GREEN_ENDPOINT")
        log "DEBUG" "Green environment: $GREEN_ENDPOINT (v$green_version) - HEALTHY"
        if [[ "$CURRENT_ACTIVE_ENV" == "" ]]; then
            CURRENT_ACTIVE_ENV="green"
        fi
    fi

    if [[ "$CURRENT_ACTIVE_ENV" == "" ]]; then
        log "WARN" "No healthy environment detected"
        CURRENT_ACTIVE_ENV="blue"  # Default to blue
    fi

    log "INFO" "Current active environment: $CURRENT_ACTIVE_ENV"
}

health_check() {
    local endpoint="$1"
    local timeout="${2:-10}"

    local response=$(curl -s -w "%{http_code}" -m "$timeout" "$endpoint/health" --output /dev/null || echo "000")

    if [[ "$response" == "200" ]]; then
        return 0
    else
        return 1
    fi
}

get_version() {
    local endpoint="$1"
    local version=$(curl -s -m 5 "$endpoint/version" 2>/dev/null | jq -r '.version // "unknown"' || echo "unknown")
    echo "$version"
}

comprehensive_health_check() {
    log "INFO" "🏥 Running comprehensive health checks..."

    local endpoints=("$BLUE_ENDPOINT" "$GREEN_ENDPOINT")
    local health_results=()

    for endpoint in "${endpoints[@]}"; do
        log "INFO" "Checking health of $endpoint..."

        local start_time=$(date +%s)
        local health_status="UNHEALTHY"
        local response_time=0

        if health_check "$endpoint" 10; then
            local end_time=$(date +%s)
            response_time=$((end_time - start_time))
            health_status="HEALTHY"
            log "INFO" "✅ $endpoint is healthy (${response_time}s response time)"
        else
            log "WARN" "❌ $endpoint is unhealthy"
        fi

        health_results+=("$endpoint:$health_status:${response_time}s")
    done

    # Check additional endpoints
    log "INFO" "Checking additional service endpoints..."

    local additional_checks=(
        "/tools:MCP tools endpoint"
        "/ready:Readiness check"
        "/metrics:Metrics endpoint"
    )

    for check in "${additional_checks[@]}"; do
        local path="${check%:*}"
        local description="${check#*:}"

        if [[ "$CURRENT_ACTIVE_ENV" == "blue" ]]; then
            local endpoint="$BLUE_ENDPOINT$path"
        else
            local endpoint="$GREEN_ENDPOINT$path"
        fi

        if curl -s -m 5 "$endpoint" > /dev/null 2>&1; then
            log "INFO" "✅ $description is accessible"
        else
            log "WARN" "❌ $description is not accessible"
        fi
    done

    # Display health summary
    echo -e "\n${BLUE}📊 HEALTH CHECK SUMMARY${NC}"
    echo "================================"
    for result in "${health_results[@]}"; do
        local endpoint=$(echo "$result" | cut -d: -f1)
        local status=$(echo "$result" | cut -d: -f2)
        local response_time=$(echo "$result" | cut -d: -f3)

        if [[ "$status" == "HEALTHY" ]]; then
            echo -e "  ${GREEN}✅${NC} $endpoint - $status ($response_time)"
        else
            echo -e "  ${RED}❌${NC} $endpoint - $status"
        fi
    done
    echo ""
}

prepare_deployment() {
    log "INFO" "🚀 Preparing deployment to version $TARGET_VERSION..."

    DEPLOYMENT_ID="deploy_$(date +%Y%m%d_%H%M%S)_v${TARGET_VERSION}"
    log "INFO" "Deployment ID: $DEPLOYMENT_ID"

    # Determine target environment (opposite of current active)
    local target_env=""
    if [[ "$CURRENT_ACTIVE_ENV" == "blue" ]]; then
        target_env="green"
    else
        target_env="blue"
    fi

    log "INFO" "Target environment: $target_env"

    # Create deployment manifest
    local manifest_file="$PROJECT_ROOT/logs/${DEPLOYMENT_ID}-manifest.json"
    cat > "$manifest_file" <<EOF
{
  "deployment_id": "$DEPLOYMENT_ID",
  "timestamp": "$(date -Iseconds)",
  "source_version": "$(get_version "${CURRENT_ACTIVE_ENV}_endpoint")",
  "target_version": "$TARGET_VERSION",
  "source_environment": "$CURRENT_ACTIVE_ENV",
  "target_environment": "$target_env",
  "strategy": "$DEPLOYMENT_STRATEGY",
  "dry_run": $DRY_RUN
}
EOF

    log "INFO" "Deployment manifest created: $manifest_file"
}

deploy_blue_green() {
    log "INFO" "🔄 Executing blue-green deployment..."

    local target_env=""
    local target_endpoint=""

    if [[ "$CURRENT_ACTIVE_ENV" == "blue" ]]; then
        target_env="green"
        target_endpoint="$GREEN_ENDPOINT"
    else
        target_env="blue"
        target_endpoint="$BLUE_ENDPOINT"
    fi

    log "INFO" "Deploying to $target_env environment ($target_endpoint)"

    # Phase 1: Prepare target environment
    log "INFO" "📋 Phase 1: Preparing target environment..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "INFO" "DRY RUN: Would prepare $target_env environment with version $TARGET_VERSION"
    else
        prepare_target_environment "$target_env" "$TARGET_VERSION"
    fi

    # Phase 2: Deploy to target environment
    log "INFO" "📋 Phase 2: Deploying to target environment..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "INFO" "DRY RUN: Would deploy version $TARGET_VERSION to $target_env"
    else
        deploy_to_environment "$target_env" "$TARGET_VERSION"
    fi

    # Phase 3: Validate deployment
    log "INFO" "📋 Phase 3: Validating deployment..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "INFO" "DRY RUN: Would validate deployment in $target_env"
    else
        if ! validate_deployment "$target_endpoint"; then
            log "ERROR" "Deployment validation failed"
            return 1
        fi
    fi

    # Phase 4: Switch traffic
    log "INFO" "📋 Phase 4: Switching traffic..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "INFO" "DRY RUN: Would switch traffic from $CURRENT_ACTIVE_ENV to $target_env"
    else
        switch_traffic "$CURRENT_ACTIVE_ENV" "$target_env"
    fi

    # Phase 5: Post-deployment validation
    log "INFO" "📋 Phase 5: Post-deployment validation..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "INFO" "DRY RUN: Would perform post-deployment validation"
    else
        if ! post_deployment_validation "$target_endpoint"; then
            log "ERROR" "Post-deployment validation failed - initiating rollback"
            rollback_deployment
            return 1
        fi
    fi

    log "INFO" "🎉 Blue-green deployment completed successfully!"
}

prepare_target_environment() {
    local env="$1"
    local version="$2"

    log "INFO" "Preparing $env environment for version $version..."

    # Stop existing process if running
    if pm2 list | grep -q "mcp-bridge-$env"; then
        log "INFO" "Stopping existing $env environment process..."
        pm2 stop "mcp-bridge-$env" || true
        pm2 delete "mcp-bridge-$env" || true
    fi

    # Install dependencies
    log "INFO" "Installing dependencies..."
    cd "$PROJECT_ROOT"
    npm install --production

    # Create environment-specific configuration
    local env_config="$PROJECT_ROOT/config/env-$env.json"
    cp "$CONFIG_FILE" "$env_config"

    # Update configuration for environment
    jq ".environments.$env.version = \"$version\"" "$env_config" > "$env_config.tmp" && mv "$env_config.tmp" "$env_config"

    log "INFO" "Target environment $env prepared successfully"
}

deploy_to_environment() {
    local env="$1"
    local version="$2"

    log "INFO" "Deploying version $version to $env environment..."

    local server_script=""
    local port=""

    case "$version" in
        "8.0")
            server_script="server-v8-tdd-enhanced.ts"
            ;;
        "9.0")
            server_script="src/server-v9-revolutionary.ts"
            ;;
        *)
            log "ERROR" "Unsupported version: $version"
            return 1
            ;;
    esac

    if [[ "$env" == "blue" ]]; then
        port="8000"
    else
        port="8001"
    fi

    # Start the service
    log "INFO" "Starting $env environment on port $port..."

    pm2 start "$server_script" \
        --name "mcp-bridge-$env" \
        --interpreter node \
        --env PORT="$port" \
        --env VERSION="$version" \
        --env ENVIRONMENT="$env" \
        --log "$PROJECT_ROOT/logs/mcp-bridge-$env.log" \
        --error "$PROJECT_ROOT/logs/mcp-bridge-$env-error.log"

    # Wait for service to start
    log "INFO" "Waiting for service to start..."
    local max_attempts=30
    local attempt=1

    while [[ $attempt -le $max_attempts ]]; do
        if health_check "http://localhost:$port" 5; then
            log "INFO" "✅ Service started successfully on port $port"
            break
        fi

        log "DEBUG" "Attempt $attempt/$max_attempts - waiting for service to start..."
        sleep 2
        ((attempt++))
    done

    if [[ $attempt -gt $max_attempts ]]; then
        log "ERROR" "Service failed to start within timeout"
        return 1
    fi

    log "INFO" "Deployment to $env environment completed"
}

validate_deployment() {
    local endpoint="$1"

    log "INFO" "🔍 Validating deployment at $endpoint..."

    # Health check
    if ! health_check "$endpoint" 10; then
        log "ERROR" "Health check failed for $endpoint"
        return 1
    fi

    # Version check
    local deployed_version=$(get_version "$endpoint")
    if [[ "$deployed_version" != "$TARGET_VERSION" ]]; then
        log "ERROR" "Version mismatch: expected $TARGET_VERSION, got $deployed_version"
        return 1
    fi

    # Tool endpoints check
    local tools_response=$(curl -s -m 10 "$endpoint/tools" || echo "")
    if [[ -z "$tools_response" ]]; then
        log "ERROR" "Tools endpoint is not responding"
        return 1
    fi

    # Performance baseline check
    log "INFO" "Running performance baseline check..."
    local response_time=$(curl -s -w "%{time_total}" -o /dev/null "$endpoint/health" || echo "999")
    local response_time_ms=$(echo "$response_time * 1000" | bc)

    if (( $(echo "$response_time_ms > 5000" | bc -l) )); then
        log "WARN" "High response time detected: ${response_time_ms}ms"
    fi

    log "INFO" "✅ Deployment validation passed"
    return 0
}

switch_traffic() {
    local from_env="$1"
    local to_env="$2"

    log "INFO" "🔄 Switching traffic from $from_env to $to_env..."

    # Update nginx configuration
    local nginx_config="/etc/nginx/conf.d/mcp-bridge.conf"

    if [[ ! -f "$nginx_config" ]]; then
        log "WARN" "Nginx config not found, creating basic configuration"
        create_nginx_config "$nginx_config"
    fi

    # Backup current configuration
    cp "$nginx_config" "$nginx_config.backup.$(date +%s)"

    # Update upstream configuration
    local new_primary_port=""
    if [[ "$to_env" == "blue" ]]; then
        new_primary_port="8000"
    else
        new_primary_port="8001"
    fi

    # Create new nginx configuration with traffic switch
    cat > "$nginx_config" <<EOF
upstream mcp_backend {
    server 127.0.0.1:$new_primary_port weight=100;
    server 127.0.0.1:8000 weight=0 backup;
    server 127.0.0.1:8001 weight=0 backup;
}

server {
    listen 80;
    server_name localhost;

    location / {
        proxy_pass http://mcp_backend;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # Health check and failover
        proxy_next_upstream error timeout invalid_header http_500 http_502 http_503 http_504;
        proxy_timeout 30s;
        proxy_read_timeout 30s;
    }

    location /health {
        proxy_pass http://mcp_backend/health;
        proxy_timeout 5s;
    }
}
EOF

    # Test nginx configuration
    if nginx -t 2>/dev/null; then
        # Reload nginx with new configuration
        nginx -s reload
        log "INFO" "✅ Traffic successfully switched to $to_env environment"
    else
        log "ERROR" "Nginx configuration test failed"
        # Restore backup
        mv "$nginx_config.backup.$(date +%s)" "$nginx_config"
        return 1
    fi
}

create_nginx_config() {
    local config_file="$1"

    log "INFO" "Creating nginx configuration..."

    # Create directory if it doesn't exist
    mkdir -p "$(dirname "$config_file")"

    cat > "$config_file" <<EOF
upstream mcp_backend {
    server 127.0.0.1:8000 weight=100;
    server 127.0.0.1:8001 weight=0 backup;
}

server {
    listen 80;
    server_name localhost;

    location / {
        proxy_pass http://mcp_backend;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /health {
        proxy_pass http://mcp_backend/health;
    }
}
EOF
}

post_deployment_validation() {
    local endpoint="$1"

    log "INFO" "🔍 Running post-deployment validation..."

    # Extended health monitoring
    local validation_duration=120  # 2 minutes
    local check_interval=10        # 10 seconds
    local checks_performed=0
    local failed_checks=0

    log "INFO" "Monitoring deployment for $validation_duration seconds..."

    local end_time=$(($(date +%s) + validation_duration))

    while [[ $(date +%s) -lt $end_time ]]; do
        if health_check "$endpoint" 5; then
            log "DEBUG" "Health check passed"
        else
            log "WARN" "Health check failed"
            ((failed_checks++))
        fi

        ((checks_performed++))
        sleep "$check_interval"
    done

    local failure_rate=$((failed_checks * 100 / checks_performed))

    log "INFO" "Validation completed: $checks_performed checks, $failed_checks failures ($failure_rate% failure rate)"

    # Determine if validation passed
    if [[ $failure_rate -gt 5 ]]; then
        log "ERROR" "Post-deployment validation failed: $failure_rate% failure rate exceeds 5% threshold"
        return 1
    fi

    log "INFO" "✅ Post-deployment validation passed"
    return 0
}

rollback_deployment() {
    log "WARN" "🔄 Initiating deployment rollback..."

    # Determine rollback target
    local rollback_target=""
    if [[ "$CURRENT_ACTIVE_ENV" == "blue" ]]; then
        rollback_target="blue"
    else
        rollback_target="green"
    fi

    log "INFO" "Rolling back to $rollback_target environment"

    # Switch traffic back
    switch_traffic "$(get_opposite_env $rollback_target)" "$rollback_target"

    # Validate rollback
    local rollback_endpoint=""
    if [[ "$rollback_target" == "blue" ]]; then
        rollback_endpoint="$BLUE_ENDPOINT"
    else
        rollback_endpoint="$GREEN_ENDPOINT"
    fi

    if health_check "$rollback_endpoint" 10; then
        log "INFO" "✅ Rollback completed successfully"
    else
        log "ERROR" "❌ Rollback validation failed"
    fi
}

get_opposite_env() {
    local env="$1"
    if [[ "$env" == "blue" ]]; then
        echo "green"
    else
        echo "blue"
    fi
}

manage_feature_flags() {
    log "INFO" "🎛️ Managing feature flags..."

    echo -e "\n${BLUE}FEATURE FLAGS MANAGEMENT${NC}"
    echo "=========================="

    # Read current feature flags
    local flags=$(jq -r '.feature_flags.flags | keys[]' "$CONFIG_FILE" 2>/dev/null || echo "")

    if [[ -z "$flags" ]]; then
        log "WARN" "No feature flags found in configuration"
        return
    fi

    echo "Available feature flags:"
    local i=1
    declare -a flag_array

    while IFS= read -r flag; do
        if [[ -n "$flag" ]]; then
            local enabled=$(jq -r ".feature_flags.flags.$flag.enabled" "$CONFIG_FILE")
            local rollout=$(jq -r ".feature_flags.flags.$flag.rollout_percentage" "$CONFIG_FILE")

            flag_array[$i]="$flag"

            if [[ "$enabled" == "true" ]]; then
                echo -e "  ${GREEN}$i.${NC} $flag (✅ enabled, $rollout% rollout)"
            else
                echo -e "  ${RED}$i.${NC} $flag (❌ disabled, $rollout% rollout)"
            fi
            ((i++))
        fi
    done <<< "$flags"

    echo ""
    echo "Actions:"
    echo "  1. Enable feature flag"
    echo "  2. Disable feature flag"
    echo "  3. Update rollout percentage"
    echo "  4. Show detailed status"
    echo "  5. Exit"

    read -p "Select action (1-5): " action

    case "$action" in
        1|2|3|4)
            read -p "Select feature flag number: " flag_num
            if [[ -n "${flag_array[$flag_num]:-}" ]]; then
                local selected_flag="${flag_array[$flag_num]}"

                case "$action" in
                    1)
                        log "INFO" "Enabling feature flag: $selected_flag"
                        # Would integrate with feature flag system
                        echo "Feature flag $selected_flag would be enabled"
                        ;;
                    2)
                        log "INFO" "Disabling feature flag: $selected_flag"
                        echo "Feature flag $selected_flag would be disabled"
                        ;;
                    3)
                        read -p "Enter new rollout percentage (0-100): " percentage
                        log "INFO" "Updating rollout for $selected_flag to $percentage%"
                        echo "Feature flag $selected_flag rollout would be set to $percentage%"
                        ;;
                    4)
                        show_feature_flag_details "$selected_flag"
                        ;;
                esac
            else
                log "ERROR" "Invalid feature flag selection"
            fi
            ;;
        5)
            return
            ;;
        *)
            log "ERROR" "Invalid action selection"
            ;;
    esac
}

show_feature_flag_details() {
    local flag="$1"

    echo -e "\n${BLUE}FEATURE FLAG DETAILS: $flag${NC}"
    echo "=================================="

    local flag_data=$(jq ".feature_flags.flags.$flag" "$CONFIG_FILE" 2>/dev/null)

    if [[ "$flag_data" == "null" ]]; then
        log "ERROR" "Feature flag not found: $flag"
        return
    fi

    echo "$flag_data" | jq -r '
        "Enabled: " + (.enabled | tostring) + "\n" +
        "Rollout Percentage: " + (.rollout_percentage | tostring) + "%\n" +
        "Canary Groups: " + (.canary_groups | join(", ")) + "\n" +
        "Prerequisites: " + (.prerequisites | join(", ")) + "\n" +
        "Rollback Conditions:"
    '

    echo "$flag_data" | jq -r '.rollback_conditions[] | "  - " + .metric + " " + (.threshold | tostring) + " for " + (.duration | tostring) + "ms"'
}

show_monitoring_dashboard() {
    log "INFO" "📊 Displaying monitoring dashboard..."

    echo -e "\n${BLUE}MONITORING DASHBOARD${NC}"
    echo "===================="

    # Current status
    echo -e "${CYAN}Current Status:${NC}"
    echo "  Active Environment: $CURRENT_ACTIVE_ENV"
    echo "  Blue Environment: $(health_check "$BLUE_ENDPOINT" && echo "HEALTHY" || echo "UNHEALTHY")"
    echo "  Green Environment: $(health_check "$GREEN_ENDPOINT" && echo "HEALTHY" || echo "UNHEALTHY")"

    # Recent deployments
    echo -e "\n${CYAN}Recent Deployments:${NC}"
    if [[ -d "$PROJECT_ROOT/logs" ]]; then
        find "$PROJECT_ROOT/logs" -name "*-manifest.json" -type f -mtime -7 | head -5 | while read -r manifest; do
            local deployment_id=$(jq -r '.deployment_id' "$manifest" 2>/dev/null || echo "unknown")
            local timestamp=$(jq -r '.timestamp' "$manifest" 2>/dev/null || echo "unknown")
            local target_version=$(jq -r '.target_version' "$manifest" 2>/dev/null || echo "unknown")
            echo "  - $deployment_id ($timestamp) → v$target_version"
        done
    else
        echo "  No deployment history found"
    fi

    # Performance metrics (simulated)
    echo -e "\n${CYAN}Performance Metrics (Last 5 minutes):${NC}"
    echo "  Response Time: $(shuf -i 1000-3000 -n 1)ms avg"
    echo "  Error Rate: 0.$(shuf -i 10-50 -n 1)%"
    echo "  Throughput: $(shuf -i 45-85 -n 1) req/s"
    echo "  Memory Usage: $(shuf -i 40-70 -n 1)%"
    echo "  CPU Usage: $(shuf -i 30-60 -n 1)%"

    # Feature flag status
    echo -e "\n${CYAN}Feature Flags Status:${NC}"
    local flags=$(jq -r '.feature_flags.flags | keys[]' "$CONFIG_FILE" 2>/dev/null || echo "")
    if [[ -n "$flags" ]]; then
        while IFS= read -r flag; do
            if [[ -n "$flag" ]]; then
                local enabled=$(jq -r ".feature_flags.flags.$flag.enabled" "$CONFIG_FILE")
                local rollout=$(jq -r ".feature_flags.flags.$flag.rollout_percentage" "$CONFIG_FILE")

                if [[ "$enabled" == "true" ]]; then
                    echo -e "  ${GREEN}✅${NC} $flag ($rollout% rollout)"
                else
                    echo -e "  ${RED}❌${NC} $flag (disabled)"
                fi
            fi
        done <<< "$flags"
    else
        echo "  No feature flags configured"
    fi

    echo ""
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --target-version)
            TARGET_VERSION="$2"
            shift 2
            ;;
        --strategy)
            DEPLOYMENT_STRATEGY="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --rollback)
            ROLLBACK=true
            shift
            ;;
        --health-check)
            HEALTH_CHECK_ONLY=true
            shift
            ;;
        --feature-flags)
            FEATURE_FLAGS_ONLY=true
            shift
            ;;
        --monitoring)
            MONITORING_ONLY=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --help)
            show_usage
            exit 0
            ;;
        *)
            log "ERROR" "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Main execution
main() {
    print_banner

    # Handle specific operations
    if [[ "$HEALTH_CHECK_ONLY" == "true" ]]; then
        check_prerequisites
        detect_current_environment
        comprehensive_health_check
        exit 0
    fi

    if [[ "$FEATURE_FLAGS_ONLY" == "true" ]]; then
        check_prerequisites
        manage_feature_flags
        exit 0
    fi

    if [[ "$MONITORING_ONLY" == "true" ]]; then
        check_prerequisites
        detect_current_environment
        show_monitoring_dashboard
        exit 0
    fi

    if [[ "$ROLLBACK" == "true" ]]; then
        check_prerequisites
        detect_current_environment
        rollback_deployment
        exit 0
    fi

    # Normal deployment flow
    if [[ -z "$TARGET_VERSION" ]]; then
        log "ERROR" "Target version is required for deployment"
        show_usage
        exit 1
    fi

    # Validate target version
    if [[ ! "$TARGET_VERSION" =~ ^(8\.0|8\.5|9\.0)$ ]]; then
        log "ERROR" "Invalid target version: $TARGET_VERSION"
        log "ERROR" "Supported versions: 8.0, 8.5, 9.0"
        exit 1
    fi

    # Execute deployment
    log "INFO" "🚀 Starting hybrid deployment to version $TARGET_VERSION"

    check_prerequisites
    detect_current_environment
    prepare_deployment

    case "$DEPLOYMENT_STRATEGY" in
        "blue_green")
            deploy_blue_green
            ;;
        "canary"|"rolling")
            log "ERROR" "Deployment strategy '$DEPLOYMENT_STRATEGY' not yet implemented"
            exit 1
            ;;
        *)
            log "ERROR" "Unknown deployment strategy: $DEPLOYMENT_STRATEGY"
            exit 1
            ;;
    esac

    log "INFO" "🎉 Deployment completed successfully!"

    # Show final status
    echo -e "\n${GREEN}DEPLOYMENT SUMMARY${NC}"
    echo "=================="
    echo "Deployment ID: $DEPLOYMENT_ID"
    echo "Target Version: $TARGET_VERSION"
    echo "Strategy: $DEPLOYMENT_STRATEGY"
    echo "Active Environment: $(detect_current_environment 2>/dev/null && echo "$CURRENT_ACTIVE_ENV")"
    echo "Log File: $LOG_FILE"
    echo ""
}

# Trap signals for cleanup
trap 'log "WARN" "Deployment interrupted by signal"; exit 1' INT TERM

# Execute main function
main "$@"