#!/bin/bash

# DeepSeek MCP Bridge - Build Script
# ┗(▀̿Ĺ̯▀̿ ̿)┓ CI-CD Production Build Pipeline

set -euo pipefail

# Configuration
PROJECT_NAME="deepseek-mcp-bridge"
BUILD_DIR="target"
RELEASE_DIR="release"
LOG_FILE="build.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

# Parse command line arguments
BUILD_TYPE="release"
SKIP_TESTS=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --debug)
            BUILD_TYPE="debug"
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --debug       Build in debug mode"
            echo "  --skip-tests  Skip running tests"
            echo "  --verbose     Enable verbose output"
            echo "  -h, --help    Show this help message"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Initialize build
init_build() {
    log_info "┗(▀̿Ĺ̯▀̿ ̿)┓ Starting $PROJECT_NAME build process..."
    
    # Clear previous build log
    > "$LOG_FILE"
    
    # Create release directory
    mkdir -p "$RELEASE_DIR"
    
    # Display build information
    log_info "Build type: $BUILD_TYPE"
    log_info "Skip tests: $SKIP_TESTS"
    log_info "Verbose: $VERBOSE"
    log_info "Rust version: $(rustc --version)"
    log_info "Cargo version: $(cargo --version)"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Rust installation
    if ! command -v rustc >/dev/null 2>&1; then
        log_error "Rust is not installed"
        exit 1
    fi
    
    # Check Cargo installation
    if ! command -v cargo >/dev/null 2>&1; then
        log_error "Cargo is not installed"
        exit 1
    fi
    
    # Check Cargo.toml exists
    if [[ ! -f "Cargo.toml" ]]; then
        log_error "Cargo.toml not found. Run this script from the project root."
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Clean previous builds
clean_build() {
    log_info "Cleaning previous builds..."
    
    if [[ -d "$BUILD_DIR" ]]; then
        rm -rf "$BUILD_DIR"
        log_info "Cleaned build directory"
    fi
    
    cargo clean >/dev/null 2>&1 || true
    log_success "Build clean completed"
}

# Run tests
run_tests() {
    if [[ "$SKIP_TESTS" == true ]]; then
        log_warning "Skipping tests as requested"
        return 0
    fi
    
    log_info "Running test suite..."
    
    local test_cmd="cargo test"
    if [[ "$VERBOSE" == true ]]; then
        test_cmd="$test_cmd -- --nocapture"
    fi
    
    if $test_cmd 2>&1 | tee -a "$LOG_FILE"; then
        log_success "All tests passed"
    else
        log_error "Tests failed"
        exit 1
    fi
}

# Build binary
build_binary() {
    log_info "Building $BUILD_TYPE binary..."
    
    local build_cmd="cargo build"
    local output_suffix=""
    
    if [[ "$BUILD_TYPE" == "release" ]]; then
        build_cmd="$build_cmd --release"
        output_suffix="/release"
    else
        output_suffix="/debug"
    fi
    
    if [[ "$VERBOSE" == true ]]; then
        build_cmd="$build_cmd --verbose"
    fi
    
    if $build_cmd 2>&1 | tee -a "$LOG_FILE"; then
        log_success "Binary build completed"
        
        # Copy binary to release directory
        local binary_path="$BUILD_DIR$output_suffix/$PROJECT_NAME"
        if [[ -f "$binary_path" ]]; then
            cp "$binary_path" "$RELEASE_DIR/"
            chmod +x "$RELEASE_DIR/$PROJECT_NAME"
            log_success "Binary copied to release directory"
        else
            log_error "Binary not found at $binary_path"
            exit 1
        fi
    else
        log_error "Binary build failed"
        exit 1
    fi
}

# Generate build artifacts
generate_artifacts() {
    log_info "Generating build artifacts..."
    
    # Create build info file
    local build_info="$RELEASE_DIR/build-info.json"
    cat > "$build_info" << EOF
{
    "project": "$PROJECT_NAME",
    "version": "$(cargo pkgid | cut -d# -f2)",
    "build_type": "$BUILD_TYPE",
    "build_time": "$(date -Iseconds)",
    "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
    "git_branch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')",
    "rust_version": "$(rustc --version)",
    "cargo_version": "$(cargo --version)"
}
EOF
    
    # Copy configuration files
    cp .env.production "$RELEASE_DIR/" 2>/dev/null || log_warning "Production env file not found"
    cp claude-desktop-config.json "$RELEASE_DIR/" 2>/dev/null || log_warning "Claude config not found"
    
    # Create checksums
    cd "$RELEASE_DIR"
    sha256sum "$PROJECT_NAME" > "$PROJECT_NAME.sha256"
    cd - >/dev/null
    
    log_success "Build artifacts generated"
}

# Validate build
validate_build() {
    log_info "Validating build..."
    
    local binary="$RELEASE_DIR/$PROJECT_NAME"
    
    # Check binary exists and is executable
    if [[ ! -f "$binary" ]]; then
        log_error "Binary not found: $binary"
        exit 1
    fi
    
    if [[ ! -x "$binary" ]]; then
        log_error "Binary is not executable: $binary"
        exit 1
    fi
    
    # Test binary execution (help command)
    if "$binary" --help >/dev/null 2>&1; then
        log_success "Binary validation passed"
    else
        log_error "Binary validation failed"
        exit 1
    fi
    
    # Verify checksum
    cd "$RELEASE_DIR"
    if sha256sum -c "$PROJECT_NAME.sha256" >/dev/null 2>&1; then
        log_success "Checksum validation passed"
    else
        log_error "Checksum validation failed"
        exit 1
    fi
    cd - >/dev/null
}

# Display build summary
build_summary() {
    local binary_size=$(du -h "$RELEASE_DIR/$PROJECT_NAME" | cut -f1)
    local build_time=$(date)
    
    log_success "┗(▀̿Ĺ̯▀̿ ̿)┓ Build completed successfully!"
    echo
    echo "Build Summary:"
    echo "=============="
    echo "Project: $PROJECT_NAME"
    echo "Build Type: $BUILD_TYPE"
    echo "Binary Size: $binary_size"
    echo "Build Time: $build_time"
    echo "Output Directory: $RELEASE_DIR/"
    echo
    echo "Files generated:"
    ls -la "$RELEASE_DIR/"
    echo
    echo "Ready for deployment! 🚀"
}

# Error handling
cleanup_on_error() {
    log_error "Build failed. Check $LOG_FILE for details."
    exit 1
}

trap cleanup_on_error ERR

# Main execution
main() {
    init_build
    check_prerequisites
    clean_build
    run_tests
    build_binary
    generate_artifacts
    validate_build
    build_summary
}

# Run main function
main "$@"