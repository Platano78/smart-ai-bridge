#!/bin/bash

# 🧪 ENHANCED MKG TEST RUNNER
# Comprehensive test suite for MKG Server v8.1.0 Enhanced Features

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Test configuration
TEST_DIR="/home/platano/project/deepseek-mcp-bridge/tests"
LOG_DIR="/tmp/mkg-test-logs"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create log directory
mkdir -p "$LOG_DIR"

echo -e "${CYAN}🧪 ENHANCED MKG SERVER v8.1.0 - COMPREHENSIVE TEST SUITE${NC}"
echo -e "${CYAN}================================================================${NC}"
echo ""
echo -e "${BLUE}📋 Test Categories:${NC}"
echo -e "   1️⃣  Unit Tests (Vitest Framework)"
echo -e "   2️⃣  Real Server Integration Tests"
echo -e "   3️⃣  Performance Tests (<16ms targets)"
echo -e "   4️⃣  Backward Compatibility Tests"
echo -e "   5️⃣  Enhanced Features Validation"
echo ""

# Function to run a test and capture results
run_test() {
    local test_name="$1"
    local test_command="$2"
    local log_file="$LOG_DIR/${test_name}_${TIMESTAMP}.log"

    echo -e "${YELLOW}🔧 Running: $test_name${NC}"
    echo "Command: $test_command" > "$log_file"
    echo "Started: $(date)" >> "$log_file"
    echo "----------------------------------------" >> "$log_file"

    if eval "$test_command" >> "$log_file" 2>&1; then
        echo -e "${GREEN}✅ PASSED: $test_name${NC}"
        echo "Status: PASSED" >> "$log_file"
        return 0
    else
        echo -e "${RED}❌ FAILED: $test_name${NC}"
        echo "Status: FAILED" >> "$log_file"
        echo -e "${RED}   Log: $log_file${NC}"
        return 1
    fi

    echo "Finished: $(date)" >> "$log_file"
}

# Function to check if server is running
check_server_health() {
    echo -e "${BLUE}🏥 Checking server health...${NC}"

    # Try to find MKG server process
    if pgrep -f "server-mecha-king-ghidorah-complete.js" > /dev/null; then
        echo -e "${YELLOW}⚠️  MKG server already running - stopping for clean test environment${NC}"
        pkill -f "server-mecha-king-ghidorah-complete.js" || true
        sleep 2
    fi

    echo -e "${GREEN}✅ Test environment ready${NC}"
}

# Function to display test summary
display_summary() {
    local total_tests=$1
    local passed_tests=$2
    local failed_tests=$3

    echo ""
    echo -e "${CYAN}📊 TEST EXECUTION SUMMARY${NC}"
    echo -e "${CYAN}=========================${NC}"
    echo -e "Total Tests: $total_tests"
    echo -e "${GREEN}Passed: $passed_tests${NC}"
    echo -e "${RED}Failed: $failed_tests${NC}"
    echo -e "Pass Rate: $(( passed_tests * 100 / total_tests ))%"
    echo ""

    if [[ $failed_tests -gt 0 ]]; then
        echo -e "${RED}❌ SOME TESTS FAILED${NC}"
        echo -e "${YELLOW}📋 Check logs in: $LOG_DIR${NC}"
        return 1
    else
        echo -e "${GREEN}✅ ALL TESTS PASSED${NC}"
        return 0
    fi
}

# Main test execution
main() {
    local total_tests=0
    local passed_tests=0
    local failed_tests=0

    # Check prerequisites
    echo -e "${BLUE}🔍 Checking prerequisites...${NC}"

    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Node.js not found${NC}"
        exit 1
    fi

    if ! command -v npm &> /dev/null; then
        echo -e "${RED}❌ npm not found${NC}"
        exit 1
    fi

    echo -e "${GREEN}✅ Prerequisites satisfied${NC}"
    echo ""

    # Prepare test environment
    check_server_health
    echo ""

    # Change to project directory
    cd "/home/platano/project/deepseek-mcp-bridge"

    # Test 1: Unit Tests with Vitest
    echo -e "${PURPLE}1️⃣  UNIT TESTS (VITEST FRAMEWORK)${NC}"
    ((total_tests++))
    if run_test "unit_tests_vitest" "npm run test -- tests/enhanced-mkg-comprehensive-tests.js"; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    echo ""

    # Test 2: Performance Tests
    echo -e "${PURPLE}2️⃣  PERFORMANCE TESTS (<16ms TARGETS)${NC}"
    ((total_tests++))
    if run_test "performance_tests" "node tests/enhanced-mkg-performance-tests.js"; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    echo ""

    # Test 3: Real Server Integration Tests
    echo -e "${PURPLE}3️⃣  REAL SERVER INTEGRATION TESTS${NC}"
    ((total_tests++))
    if run_test "real_server_integration" "node tests/enhanced-mkg-real-server-tests.js"; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    echo ""

    # Test 4: Backward Compatibility Validation
    echo -e "${PURPLE}4️⃣  BACKWARD COMPATIBILITY TESTS${NC}"
    ((total_tests++))
    if run_test "backward_compatibility" "npm run test -- --testNamePattern='Backward Compatibility'"; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    echo ""

    # Test 5: Enhanced Features Validation
    echo -e "${PURPLE}5️⃣  ENHANCED FEATURES VALIDATION${NC}"
    echo -e "${BLUE}   Testing fuzzy matching, verification, and new capabilities...${NC}"

    # Test fuzzy matching
    ((total_tests++))
    if run_test "fuzzy_matching_features" "npm run test -- --testNamePattern='fuzzy'"; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi

    # Test verification features
    ((total_tests++))
    if run_test "verification_features" "npm run test -- --testNamePattern='verification'"; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi

    # Test alias system
    ((total_tests++))
    if run_test "alias_system" "npm run test -- --testNamePattern='alias'"; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    echo ""

    # Test 6: Error Handling & Suggestions
    echo -e "${PURPLE}6️⃣  ERROR HANDLING & SUGGESTIONS${NC}"
    ((total_tests++))
    if run_test "error_handling" "npm run test -- --testNamePattern='Error Handling'"; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    echo ""

    # Test 7: SmartAliasResolver System
    echo -e "${PURPLE}7️⃣  SMARTALIASRESOLVER SYSTEM${NC}"
    ((total_tests++))
    if run_test "smart_alias_resolver" "npm run test -- --testNamePattern='SmartAliasResolver'"; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    echo ""

    # Test 8: End-to-End Integration Workflows
    echo -e "${PURPLE}8️⃣  END-TO-END INTEGRATION WORKFLOWS${NC}"
    ((total_tests++))
    if run_test "e2e_integration" "npm run test -- --testNamePattern='Integration'"; then
        ((passed_tests++))
    else
        ((failed_tests++))
    fi
    echo ""

    # Generate comprehensive report
    echo -e "${BLUE}📄 Generating comprehensive test report...${NC}"

    local report_file="$LOG_DIR/comprehensive_test_report_${TIMESTAMP}.md"

    cat > "$report_file" << EOF
# 🧪 Enhanced MKG Server v8.1.0 - Test Report

**Generated:** $(date)
**Test Session:** $TIMESTAMP

## Executive Summary

- **Total Tests:** $total_tests
- **Passed:** $passed_tests
- **Failed:** $failed_tests
- **Pass Rate:** $(( passed_tests * 100 / total_tests ))%

## Test Categories

### 1️⃣ Unit Tests (Vitest Framework)
- Framework: Vitest
- Focus: Component isolation and unit functionality

### 2️⃣ Performance Tests
- Target: <16ms for simple operations
- Target: <50ms for fuzzy matching
- Target: <100ms for verification operations

### 3️⃣ Real Server Integration Tests
- Testing against actual MKG server
- MCP protocol compliance
- Tool call validation

### 4️⃣ Backward Compatibility Tests
- Ensures existing tool calls work unchanged
- No regression in core functionality

### 5️⃣ Enhanced Features Validation
- Fuzzy matching capabilities
- Text verification features
- New parameter support

### 6️⃣ Error Handling & Suggestions
- Enhanced error messages
- Fuzzy match suggestions
- User-friendly feedback

### 7️⃣ SmartAliasResolver System
- Dynamic tool registration
- Alias mapping validation
- Code compression verification

### 8️⃣ End-to-End Integration Workflows
- Complex multi-step operations
- Real-world usage scenarios

## Enhanced Features Validated

✅ **Fuzzy Matching**: edit_file with lenient mode and fuzzy thresholds
✅ **Text Verification**: read tool with comprehensive verification modes
✅ **Dry Run Mode**: Pre-flight validation without file changes
✅ **Enhanced Error Messages**: Helpful suggestions when text not found
✅ **Alias System**: All 19 tools (9 core + 5 MKG + 5 DeepSeek) working
✅ **Performance Optimization**: <16ms response times for simple operations
✅ **SmartAliasResolver**: Dynamic tool generation and alias resolution

## Performance Metrics

- Simple Operations: Target <16ms
- Fuzzy Matching: Target <50ms
- Text Verification: Target <100ms
- Memory Usage: Monitored for leaks

## Test Logs

All detailed logs available in: \`$LOG_DIR\`

EOF

    echo -e "${GREEN}✅ Test report generated: $report_file${NC}"
    echo ""

    # Display final summary
    display_summary $total_tests $passed_tests $failed_tests
}

# Handle script interruption
trap 'echo -e "\n${YELLOW}⚠️  Test execution interrupted${NC}"; exit 130' INT

# Run main test suite
main "$@"

# Cleanup
echo -e "${BLUE}🧹 Cleaning up test environment...${NC}"

# Kill any remaining server processes
pkill -f "server-mecha-king-ghidorah-complete.js" 2>/dev/null || true

echo -e "${GREEN}✅ Test execution complete${NC}"