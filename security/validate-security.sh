#!/bin/bash
#
# Smart AI Bridge v1.3.0 - Security Validation Master Script
# Runs all security tests and generates consolidated report
#
# Usage: ./security/validate-security.sh [--quick|--full|--ci]
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
REPORT_DIR="$PROJECT_ROOT/security/reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="$REPORT_DIR/security-report-$TIMESTAMP.json"

# Test configuration
TEST_MODE="${1:-full}"
PASS_THRESHOLD=95
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Initialize
mkdir -p "$REPORT_DIR"

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}Smart AI Bridge Security Validation${NC}"
echo -e "${BLUE}Version: 1.3.0${NC}"
echo -e "${BLUE}Mode: $TEST_MODE${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# Function to run a test file and capture results
run_test() {
    local test_file=$1
    local test_name=$2
    local result=0
    
    echo -e "${YELLOW}Running: $test_name${NC}"
    
    if [ -f "$test_file" ]; then
        if node "$test_file" > /dev/null 2>&1; then
            echo -e "  ${GREEN}✓ PASSED${NC}"
            ((PASSED_TESTS++))
        else
            echo -e "  ${RED}✗ FAILED${NC}"
            ((FAILED_TESTS++))
            result=1
        fi
        ((TOTAL_TESTS++))
    else
        echo -e "  ${YELLOW}! SKIPPED (file not found)${NC}"
    fi
    
    return $result
}

# Function to run npm audit
run_npm_audit() {
    echo -e "${YELLOW}Running: npm audit${NC}"
    
    cd "$PROJECT_ROOT"
    local audit_result
    
    if npm audit --audit-level=high > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓ No high/critical vulnerabilities${NC}"
        ((PASSED_TESTS++))
    else
        echo -e "  ${RED}✗ Vulnerabilities found (run 'npm audit' for details)${NC}"
        ((FAILED_TESTS++))
    fi
    ((TOTAL_TESTS++))
}

# Function to check for secrets in code
check_secrets() {
    echo -e "${YELLOW}Running: Secret detection${NC}"
    
    cd "$PROJECT_ROOT"
    
    # Check for common secret patterns
    local secrets_found=0
    
    # API keys
    if grep -rE "(api[_-]?key|apikey)\s*[:=]\s*['\"][^'\"]{20,}" --include="*.js" . 2>/dev/null | grep -v node_modules | grep -v test; then
        secrets_found=1
    fi
    
    # Private keys
    if grep -rE "-----BEGIN (RSA |EC |)PRIVATE KEY-----" --include="*.js" --include="*.pem" . 2>/dev/null | grep -v node_modules; then
        secrets_found=1
    fi
    
    # AWS credentials
    if grep -rE "(aws_access_key_id|aws_secret_access_key)\s*=" --include="*.js" --include="*.env*" . 2>/dev/null | grep -v node_modules | grep -v ".example"; then
        secrets_found=1
    fi
    
    if [ $secrets_found -eq 0 ]; then
        echo -e "  ${GREEN}✓ No secrets detected${NC}"
        ((PASSED_TESTS++))
    else
        echo -e "  ${RED}✗ Potential secrets found in code${NC}"
        ((FAILED_TESTS++))
    fi
    ((TOTAL_TESTS++))
}

# Quick mode - essential tests only
run_quick_tests() {
    echo -e "${BLUE}--- Quick Security Validation ---${NC}"
    echo ""
    
    run_test "$PROJECT_ROOT/security-tests.js" "Core Security Tests"
    run_npm_audit
    check_secrets
}

# Full mode - all tests
run_full_tests() {
    echo -e "${BLUE}--- Full Security Validation ---${NC}"
    echo ""
    
    # Core tests
    run_test "$PROJECT_ROOT/security-tests.js" "Core Security Tests"
    run_test "$PROJECT_ROOT/security-hardening-tests.js" "Security Hardening Tests"
    run_test "$PROJECT_ROOT/validate-security-score.js" "Security Score Validation"
    
    echo ""
    
    # OWASP tests
    run_test "$SCRIPT_DIR/tests/owasp-api-security-tests.js" "OWASP API Security Tests"
    run_test "$SCRIPT_DIR/tests/input-validation-attacks.js" "Input Validation Attack Tests"
    run_test "$SCRIPT_DIR/tests/dos-resource-exhaustion-tests.js" "DoS Protection Tests"
    
    echo ""
    
    # Dependency and secret checks
    run_npm_audit
    check_secrets
}

# CI mode - optimized for CI/CD pipelines
run_ci_tests() {
    echo -e "${BLUE}--- CI/CD Security Validation ---${NC}"
    echo ""
    
    run_test "$PROJECT_ROOT/security-tests.js" "Core Security Tests"
    run_test "$PROJECT_ROOT/security-hardening-tests.js" "Security Hardening Tests"
    run_test "$SCRIPT_DIR/tests/owasp-api-security-tests.js" "OWASP API Security Tests"
    run_npm_audit
    check_secrets
}

# Generate JSON report
generate_report() {
    local pass_rate=0
    if [ $TOTAL_TESTS -gt 0 ]; then
        pass_rate=$(echo "scale=2; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc)
    fi
    
    cat > "$REPORT_FILE" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "version": "1.3.0",
  "mode": "$TEST_MODE",
  "results": {
    "total_tests": $TOTAL_TESTS,
    "passed": $PASSED_TESTS,
    "failed": $FAILED_TESTS,
    "pass_rate": $pass_rate,
    "threshold": $PASS_THRESHOLD
  },
  "status": "$([ $pass_rate -ge $PASS_THRESHOLD ] && echo "PASSED" || echo "FAILED")"
}
EOF
    
    echo ""
    echo -e "${BLUE}Report saved to: $REPORT_FILE${NC}"
}

# Main execution
case $TEST_MODE in
    --quick|-q)
        TEST_MODE="quick"
        run_quick_tests
        ;;
    --ci)
        TEST_MODE="ci"
        run_ci_tests
        ;;
    --full|-f|*)
        TEST_MODE="full"
        run_full_tests
        ;;
esac

# Calculate pass rate
if [ $TOTAL_TESTS -gt 0 ]; then
    PASS_RATE=$(echo "scale=2; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc)
else
    PASS_RATE=0
fi

# Generate report
generate_report

# Summary
echo ""
echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}SECURITY VALIDATION SUMMARY${NC}"
echo -e "${BLUE}======================================${NC}"
echo -e "Total Tests:  $TOTAL_TESTS"
echo -e "Passed:       ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed:       ${RED}$FAILED_TESTS${NC}"
echo -e "Pass Rate:    $PASS_RATE%"
echo -e "Threshold:    $PASS_THRESHOLD%"
echo ""

# Exit with appropriate code
if (( $(echo "$PASS_RATE >= $PASS_THRESHOLD" | bc -l) )); then
    echo -e "${GREEN}✓ SECURITY VALIDATION PASSED${NC}"
    exit 0
else
    echo -e "${RED}✗ SECURITY VALIDATION FAILED${NC}"
    exit 1
fi
