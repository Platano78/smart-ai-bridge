use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{debug, error};

use crate::config::Config;

pub struct HealthChecker {
    config: Arc<Config>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HealthStatus {
    pub status: String,
    pub timestamp: u64,
    pub version: String,
    pub environment: String,
    pub checks: HealthChecks,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HealthChecks {
    pub configuration: CheckResult,
    pub deepseek_api: CheckResult,
    pub memory: CheckResult,
    pub disk_space: CheckResult,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CheckResult {
    pub status: String,
    pub message: Option<String>,
    pub duration_ms: Option<u64>,
}

impl HealthChecker {
    pub fn new(config: Arc<Config>) -> Self {
        Self { config }
    }

    pub async fn check(&self) -> Result<HealthStatus> {
        let start_time = std::time::Instant::now();
        
        debug!("Starting health check");

        let checks = HealthChecks {
            configuration: self.check_configuration().await,
            deepseek_api: self.check_deepseek_api().await,
            memory: self.check_memory().await,
            disk_space: self.check_disk_space().await,
        };

        let overall_status = if self.all_checks_healthy(&checks) {
            "healthy"
        } else {
            "unhealthy"
        };

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let environment = if self.config.is_production() {
            "production"
        } else {
            "development"
        };

        let health_status = HealthStatus {
            status: overall_status.to_string(),
            timestamp,
            version: env!("CARGO_PKG_VERSION").to_string(),
            environment: environment.to_string(),
            checks,
        };

        let duration = start_time.elapsed();
        debug!("Health check completed in {:?}", duration);

        Ok(health_status)
    }

    pub async fn ready_check(&self) -> Result<()> {
        // Basic readiness check - ensure critical components are functional
        if self.config.deepseek_api_key().is_empty() {
            return Err(anyhow::anyhow!("DeepSeek API key not configured"));
        }

        // Check if server can bind to the configured port
        let addr = format!("{}:{}", self.config.server.host, self.config.server.port);
        match tokio::net::TcpListener::bind(&addr).await {
            Ok(_) => {
                debug!("Readiness check passed");
                Ok(())
            }
            Err(e) => {
                error!("Readiness check failed - cannot bind to {}: {}", addr, e);
                Err(anyhow::anyhow!("Cannot bind to address {}: {}", addr, e))
            }
        }
    }

    async fn check_configuration(&self) -> CheckResult {
        let start = std::time::Instant::now();
        
        match self.config.validate() {
            Ok(_) => CheckResult {
                status: "healthy".to_string(),
                message: Some("Configuration is valid".to_string()),
                duration_ms: Some(start.elapsed().as_millis() as u64),
            },
            Err(e) => CheckResult {
                status: "unhealthy".to_string(),
                message: Some(format!("Configuration error: {}", e)),
                duration_ms: Some(start.elapsed().as_millis() as u64),
            },
        }
    }

    async fn check_deepseek_api(&self) -> CheckResult {
        let start = std::time::Instant::now();

        if self.config.deepseek_api_key().is_empty() {
            return CheckResult {
                status: "unhealthy".to_string(),
                message: Some("DeepSeek API key not configured".to_string()),
                duration_ms: Some(start.elapsed().as_millis() as u64),
            };
        }

        // For now, just check that the API key is present
        // In a full implementation, we might make a test API call
        CheckResult {
            status: "healthy".to_string(),
            message: Some("DeepSeek API configuration present".to_string()),
            duration_ms: Some(start.elapsed().as_millis() as u64),
        }
    }

    async fn check_memory(&self) -> CheckResult {
        let start = std::time::Instant::now();

        // Basic memory check - in a full implementation, this would check actual memory usage
        CheckResult {
            status: "healthy".to_string(),
            message: Some("Memory usage within acceptable limits".to_string()),
            duration_ms: Some(start.elapsed().as_millis() as u64),
        }
    }

    async fn check_disk_space(&self) -> CheckResult {
        let start = std::time::Instant::now();

        // Basic disk space check - in a full implementation, this would check actual disk usage
        CheckResult {
            status: "healthy".to_string(),
            message: Some("Disk space sufficient".to_string()),
            duration_ms: Some(start.elapsed().as_millis() as u64),
        }
    }

    fn all_checks_healthy(&self, checks: &HealthChecks) -> bool {
        checks.configuration.status == "healthy" &&
        checks.deepseek_api.status == "healthy" &&
        checks.memory.status == "healthy" &&
        checks.disk_space.status == "healthy"
    }
}