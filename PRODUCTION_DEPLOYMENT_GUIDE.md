# ┗(▀̿Ĺ̯▀̿ ̿)┓ DeepSeek MCP Bridge - Production Deployment Guide

**Professional CI/CD Pipeline for Zero-Downtime Rust MCP Server Deployment**

## 🚀 Quick Start

```bash
# 1. Deploy Rust MCP server with professional automation
./deploy-mcp-server.sh

# 2. Validate deployment comprehensively
./validate-deployment.sh

# 3. Monitor service health
./health-check.sh --watch
```

## 📋 Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Deployment Scripts](#deployment-scripts)
- [Configuration Management](#configuration-management)
- [Production Operations](#production-operations)
- [Monitoring & Health Checks](#monitoring--health-checks)
- [Rollback Procedures](#rollback-procedures)
- [Troubleshooting](#troubleshooting)
- [Security Considerations](#security-considerations)

## 🏗️ Architecture Overview

### Service Architecture
```
┌─────────────────┐    Zero-Downtime     ┌─────────────────┐
│   Node.js MCP   │ ──── Transition ───► │   Rust MCP      │
│   Server        │                      │   Bridge        │
│   (Legacy)      │                      │   (Production)  │
└─────────────────┘                      └─────────────────┘
         │                                         │
         ▼                                         ▼
┌─────────────────────────────────────────────────────────┐
│                DeepSeek API                             │
└─────────────────────────────────────────────────────────┘
```

### Deployment Pipeline
```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│   Build      │──►│   Deploy     │──►│   Validate   │──►│   Monitor    │
│   & Test     │   │   & Backup   │   │   & Health   │   │   & Alert    │
└──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
        │                   │                   │                   │
        ▼                   ▼                   ▼                   ▼
   Cargo Build       Graceful Stop      Health Checks      Continuous
   Optimization      Service Backup     MCP Protocol       Monitoring
   Binary Strip      Config Update      Performance        Log Analysis
```

## 🔧 Prerequisites

### System Requirements
- **Operating System**: Linux (Ubuntu 20.04+, CentOS 8+, or similar)
- **Memory**: Minimum 2GB RAM, Recommended 4GB+
- **Storage**: 1GB free space for builds and logs
- **Network**: Port 8080 available (configurable)

### Required Software
```bash
# Rust toolchain (1.70+)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Node.js (for transition from existing server)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Essential utilities
sudo apt-get install -y curl jq netstat-nat bc
```

### DeepSeek API Configuration
```bash
# Set your DeepSeek API credentials
export DEEPSEEK_API_KEY="your_api_key_here"
export DEEPSEEK_API_URL="https://api.deepseek.com"
```

## 📦 Deployment Scripts

### Core Scripts Overview

| Script | Purpose | Usage |
|--------|---------|-------|
| `deploy-mcp-server.sh` | Main deployment pipeline | `./deploy-mcp-server.sh` |
| `rollback-mcp-server.sh` | Emergency rollback | `./rollback-mcp-server.sh --interactive` |
| `health-check.sh` | Service health monitoring | `./health-check.sh --comprehensive` |
| `graceful-shutdown-nodejs.sh` | Node.js transition | `./graceful-shutdown-nodejs.sh --start-rust` |
| `validate-deployment.sh` | Post-deployment validation | `./validate-deployment.sh --full` |

### 1. Main Deployment Script

**`./deploy-mcp-server.sh`**

Features:
- 🏗️ **Optimized Rust Build**: Release optimization with LTO and symbol stripping
- 🔄 **Zero-Downtime Deployment**: Graceful service transitions
- 💾 **Automatic Backup**: Pre-deployment backup with rollback capability
- 🏥 **Health Validation**: Comprehensive post-deployment health checks
- 📊 **Detailed Reporting**: JSON reports and deployment metrics

```bash
# Standard deployment
./deploy-mcp-server.sh

# View deployment logs
tail -f logs/deployment.log
```

### 2. Health Check Script

**`./health-check.sh`**

Monitoring capabilities:
- 🔍 **Service Process**: PID monitoring and process health
- 🌐 **Network Connectivity**: Port binding and HTTP response tests
- 🧬 **MCP Protocol**: JSON-RPC endpoint validation
- 🔗 **DeepSeek Integration**: API connectivity and query testing
- 📊 **Performance Metrics**: Response time and resource usage
- 📝 **Log Analysis**: Error detection and log health

```bash
# Comprehensive health check
./health-check.sh --comprehensive

# Quick status check
./health-check.sh --quick

# Continuous monitoring
./health-check.sh --watch

# JSON output for automation
./health-check.sh --quick --json
```

### 3. Rollback Script

**`./rollback-mcp-server.sh`**

Rollback features:
- 📂 **Backup Management**: List and select from available backups
- ⚡ **Quick Recovery**: Fast rollback with minimal downtime
- 🔄 **Service Restoration**: Automatic service startup after rollback
- 🎯 **Interactive Mode**: User-friendly backup selection
- 📊 **Status Reporting**: Rollback success verification

```bash
# Interactive rollback with backup selection
./rollback-mcp-server.sh --interactive

# Use latest backup automatically
./rollback-mcp-server.sh --latest --service auto

# Use specific backup
./rollback-mcp-server.sh --backup /path/to/backup
```

## ⚙️ Configuration Management

### Production Environment Configuration

**`.env.production`**
```bash
# Core Settings
ENVIRONMENT=production
PORT=8080
LOG_LEVEL=info

# DeepSeek API Configuration
DEEPSEEK_API_URL=https://api.deepseek.com
DEEPSEEK_API_TIMEOUT=30000
DEEPSEEK_MAX_RETRIES=3

# Performance Tuning
WORKER_THREADS=4
CONNECTION_POOL_SIZE=20
REQUEST_TIMEOUT=60000
MAX_CONCURRENT_REQUESTS=100

# Security Settings
CORS_ENABLED=true
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX=1000
RATE_LIMIT_WINDOW=900000

# Monitoring
METRICS_ENABLED=true
HEALTH_CHECK_ENABLED=true
PERFORMANCE_MONITORING=true
```

### Claude Desktop Integration

**`claude-desktop-config.json`**
```json
{
  "mcpServers": {
    "deepseek-mcp-bridge": {
      "command": "/absolute/path/to/target/release/deepseek-mcp-bridge",
      "args": ["--config", "/absolute/path/to/.env.production"],
      "env": {
        "RUST_LOG": "info",
        "ENVIRONMENT": "production"
      }
    }
  }
}
```

## 🚀 Production Operations

### Standard Deployment Workflow

1. **Pre-Deployment Validation**
   ```bash
   # Ensure clean working directory
   git status
   
   # Verify prerequisites
   cargo --version
   node --version
   ```

2. **Execute Deployment**
   ```bash
   # Full deployment with validation
   ./deploy-mcp-server.sh
   ```

3. **Post-Deployment Validation**
   ```bash
   # Comprehensive validation
   ./validate-deployment.sh --full
   
   # Start continuous monitoring
   ./health-check.sh --watch
   ```

### Zero-Downtime Node.js to Rust Transition

For environments with existing Node.js servers:

```bash
# Graceful transition with Rust startup
./graceful-shutdown-nodejs.sh --start-rust

# Or manual two-step process
./graceful-shutdown-nodejs.sh       # Stop Node.js
./deploy-mcp-server.sh               # Start Rust
```

### Service Management Commands

```bash
# Check service status
./health-check.sh --quick

# View service logs
tail -f logs/rust-server.log

# Restart service
pkill -f deepseek-mcp-bridge
./deploy-mcp-server.sh

# Emergency stop
pkill -9 -f deepseek-mcp-bridge
```

## 📊 Monitoring & Health Checks

### Health Check Categories

1. **Service Health**
   - Process existence and responsiveness
   - Port binding verification
   - Resource utilization monitoring

2. **Protocol Compliance**
   - MCP JSON-RPC endpoint testing
   - DeepSeek API integration verification
   - Error rate monitoring

3. **Performance Monitoring**
   - Response time measurement
   - Concurrent request handling
   - Memory and CPU usage

### Monitoring Integration

```bash
# Automated health checks (cron)
*/5 * * * * /path/to/health-check.sh --quick --json > /tmp/mcp-health.json

# Log rotation setup
echo "logs/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
}" > /etc/logrotate.d/mcp-bridge
```

## 🔄 Rollback Procedures

### Automatic Rollback Triggers

The deployment system automatically triggers rollback when:
- Health checks fail after deployment
- Service fails to start within timeout
- MCP protocol endpoints don't respond

### Manual Rollback Scenarios

1. **Interactive Rollback** (Recommended)
   ```bash
   ./rollback-mcp-server.sh --interactive
   ```

2. **Emergency Quick Rollback**
   ```bash
   ./rollback-mcp-server.sh --latest --service auto --force
   ```

3. **Specific Backup Restoration**
   ```bash
   ./rollback-mcp-server.sh --backup backups/deployment_backup_20241205_143022
   ```

### Rollback Validation

After any rollback:
```bash
# Verify service restoration
./health-check.sh --comprehensive

# Check specific functionality
curl http://localhost:8080/health
curl -X POST http://localhost:8080/mcp/initialize
```

## 🔧 Troubleshooting

### Common Issues and Solutions

#### 1. Build Failures
```bash
# Clean build environment
cargo clean
rm -rf target/

# Update dependencies
cargo update

# Rebuild with verbose output
cargo build --release --verbose
```

#### 2. Port Already in Use
```bash
# Find process using port
netstat -tulnp | grep :8080
lsof -i :8080

# Kill process if needed
pkill -f deepseek-mcp-bridge
pkill -f server.js
```

#### 3. Permission Issues
```bash
# Fix binary permissions
chmod +x target/release/deepseek-mcp-bridge

# Fix log directory permissions
chmod 755 logs/
chmod 644 logs/*.log
```

#### 4. Service Won't Start
```bash
# Check detailed logs
tail -50 logs/rust-server.log

# Test binary directly
./target/release/deepseek-mcp-bridge --help

# Verify configuration
cat .env.production
```

#### 5. Health Check Failures
```bash
# Manual endpoint testing
curl -v http://localhost:8080/health
curl -v http://localhost:8080/mcp/initialize

# Check service logs for errors
grep -i error logs/rust-server.log
```

### Diagnostic Commands

```bash
# Service status overview
./health-check.sh --comprehensive

# Network connectivity test
telnet localhost 8080

# Process information
ps aux | grep deepseek
pstree -p $(pgrep deepseek)

# System resources
free -h
df -h .
```

## 🔒 Security Considerations

### File Permissions
```bash
# Secure configuration files
chmod 600 .env.production

# Secure binary
chmod 755 target/release/deepseek-mcp-bridge

# Secure log directory
chmod 755 logs/
```

### Network Security
- Service binds to localhost by default (change in production if needed)
- No sensitive information exposed via web endpoints
- API keys secured in environment files

### Operational Security
- Regular log rotation and cleanup
- Automated backup retention policies
- Service monitoring and alerting

## 📈 Performance Optimization

### Rust Build Optimization

The `Cargo.toml` includes production-optimized settings:
```toml
[profile.release]
opt-level = 3
lto = true
codegen-units = 1
panic = "abort"
strip = true
```

### Runtime Configuration

Environment variables for performance tuning:
```bash
# Increase worker threads for high load
WORKER_THREADS=8

# Optimize connection pooling
CONNECTION_POOL_SIZE=50

# Adjust timeouts based on API response times
REQUEST_TIMEOUT=120000
DEEPSEEK_API_TIMEOUT=60000
```

## 🚨 Emergency Procedures

### Service Unresponsive
```bash
# 1. Check process status
./health-check.sh --quick

# 2. Force restart if needed
pkill -9 -f deepseek-mcp-bridge
./deploy-mcp-server.sh

# 3. Fallback to Node.js if available
node server.js &
```

### Deployment Failure Recovery
```bash
# 1. Immediate rollback
./rollback-mcp-server.sh --latest --force

# 2. Validate rollback
./validate-deployment.sh --quick

# 3. Check logs for root cause
tail -100 logs/deployment.log
tail -100 logs/rust-server.log
```

### System Resource Issues
```bash
# 1. Check resource usage
df -h
free -h
top -p $(pgrep deepseek)

# 2. Clean up logs if needed
find logs/ -name "*.log" -mtime +7 -delete
find backups/ -name "*backup*" -mtime +30 -delete

# 3. Restart with resource limits
ulimit -m 1048576  # Limit memory to 1GB
./deploy-mcp-server.sh
```

## 📞 Support and Maintenance

### Log Files Location
- **Deployment Logs**: `logs/deployment.log`
- **Service Logs**: `logs/rust-server.log`
- **Health Check Logs**: `logs/health-check.log`
- **Rollback Logs**: `logs/rollback.log`

### Backup Location
- **Deployment Backups**: `backups/deployment_backup_*`
- **Configuration Backups**: Included in deployment backups

### Monitoring Endpoints
- **Health**: `http://localhost:8080/health`
- **Metrics**: `http://localhost:8080/metrics`
- **MCP Initialize**: `http://localhost:8080/mcp/initialize`

---

**┗(▀̿Ĺ̯▀̿ ̿)┓ Professional deployment pipeline - making production deployments as smooth as butter since day one.**

For additional support or advanced configuration, refer to the comprehensive validation and monitoring scripts provided in this deployment package.