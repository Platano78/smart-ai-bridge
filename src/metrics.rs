use anyhow::Result;
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::debug;

use crate::config::Config;

pub struct MetricsCollector {
    config: Arc<Config>,
    request_counts: DashMap<String, AtomicU64>,
    success_counts: DashMap<String, AtomicU64>,
    error_counts: DashMap<String, AtomicU64>,
    response_times: DashMap<String, ResponseTimeMetrics>,
    start_time: u64,
}

#[derive(Debug)]
struct ResponseTimeMetrics {
    total_ms: AtomicU64,
    count: AtomicU64,
    min_ms: AtomicU64,
    max_ms: AtomicU64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MetricsSnapshot {
    pub timestamp: u64,
    pub uptime_seconds: u64,
    pub version: String,
    pub requests: MetricsSummary,
    pub endpoints: Vec<EndpointMetrics>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MetricsSummary {
    pub total_requests: u64,
    pub total_successes: u64,
    pub total_errors: u64,
    pub success_rate: f64,
    pub error_rate: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EndpointMetrics {
    pub name: String,
    pub request_count: u64,
    pub success_count: u64,
    pub error_count: u64,
    pub success_rate: f64,
    pub avg_response_time_ms: f64,
    pub min_response_time_ms: u64,
    pub max_response_time_ms: u64,
}

impl MetricsCollector {
    pub fn new(config: Arc<Config>) -> Self {
        let start_time = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        Self {
            config,
            request_counts: DashMap::new(),
            success_counts: DashMap::new(),
            error_counts: DashMap::new(),
            response_times: DashMap::new(),
            start_time,
        }
    }

    pub async fn increment_request_count(&self, endpoint: &str) {
        if !self.config.metrics.enabled {
            return;
        }

        self.request_counts
            .entry(endpoint.to_string())
            .or_insert_with(|| AtomicU64::new(0))
            .fetch_add(1, Ordering::Relaxed);

        debug!("Request count incremented for endpoint: {}", endpoint);
    }

    pub async fn increment_success_count(&self, endpoint: &str) {
        if !self.config.metrics.enabled {
            return;
        }

        self.success_counts
            .entry(endpoint.to_string())
            .or_insert_with(|| AtomicU64::new(0))
            .fetch_add(1, Ordering::Relaxed);

        debug!("Success count incremented for endpoint: {}", endpoint);
    }

    pub async fn increment_error_count(&self, endpoint: &str) {
        if !self.config.metrics.enabled {
            return;
        }

        self.error_counts
            .entry(endpoint.to_string())
            .or_insert_with(|| AtomicU64::new(0))
            .fetch_add(1, Ordering::Relaxed);

        debug!("Error count incremented for endpoint: {}", endpoint);
    }

    pub async fn record_response_time(&self, endpoint: &str, duration_ms: u64) {
        if !self.config.metrics.enabled {
            return;
        }

        let metrics = self.response_times
            .entry(endpoint.to_string())
            .or_insert_with(|| ResponseTimeMetrics {
                total_ms: AtomicU64::new(0),
                count: AtomicU64::new(0),
                min_ms: AtomicU64::new(u64::MAX),
                max_ms: AtomicU64::new(0),
            });

        metrics.total_ms.fetch_add(duration_ms, Ordering::Relaxed);
        metrics.count.fetch_add(1, Ordering::Relaxed);

        // Update min
        let mut current_min = metrics.min_ms.load(Ordering::Relaxed);
        while duration_ms < current_min {
            match metrics.min_ms.compare_exchange_weak(
                current_min, 
                duration_ms, 
                Ordering::Relaxed, 
                Ordering::Relaxed
            ) {
                Ok(_) => break,
                Err(x) => current_min = x,
            }
        }

        // Update max
        let mut current_max = metrics.max_ms.load(Ordering::Relaxed);
        while duration_ms > current_max {
            match metrics.max_ms.compare_exchange_weak(
                current_max, 
                duration_ms, 
                Ordering::Relaxed, 
                Ordering::Relaxed
            ) {
                Ok(_) => break,
                Err(x) => current_max = x,
            }
        }

        debug!("Response time recorded for endpoint {}: {}ms", endpoint, duration_ms);
    }

    pub async fn export(&self) -> Result<String> {
        if !self.config.metrics.enabled {
            return Ok("# Metrics disabled\n".to_string());
        }

        let snapshot = self.create_snapshot().await;
        
        if self.config.metrics.collect_detailed {
            self.export_prometheus_format(&snapshot).await
        } else {
            Ok(serde_json::to_string_pretty(&snapshot)?)
        }
    }

    async fn create_snapshot(&self) -> MetricsSnapshot {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let uptime_seconds = now.saturating_sub(self.start_time);

        let mut total_requests = 0u64;
        let mut total_successes = 0u64;
        let mut total_errors = 0u64;
        let mut endpoints = Vec::new();

        // Collect all unique endpoint names
        let mut endpoint_names: std::collections::HashSet<String> = std::collections::HashSet::new();
        
        for entry in self.request_counts.iter() {
            endpoint_names.insert(entry.key().clone());
        }
        for entry in self.success_counts.iter() {
            endpoint_names.insert(entry.key().clone());
        }
        for entry in self.error_counts.iter() {
            endpoint_names.insert(entry.key().clone());
        }

        for endpoint in endpoint_names {
            let request_count = self.request_counts
                .get(&endpoint)
                .map(|v| v.load(Ordering::Relaxed))
                .unwrap_or(0);

            let success_count = self.success_counts
                .get(&endpoint)
                .map(|v| v.load(Ordering::Relaxed))
                .unwrap_or(0);

            let error_count = self.error_counts
                .get(&endpoint)
                .map(|v| v.load(Ordering::Relaxed))
                .unwrap_or(0);

            let success_rate = if request_count > 0 {
                (success_count as f64 / request_count as f64) * 100.0
            } else {
                0.0
            };

            let (avg_response_time_ms, min_response_time_ms, max_response_time_ms) = 
                if let Some(metrics) = self.response_times.get(&endpoint) {
                    let total = metrics.total_ms.load(Ordering::Relaxed);
                    let count = metrics.count.load(Ordering::Relaxed);
                    let min = metrics.min_ms.load(Ordering::Relaxed);
                    let max = metrics.max_ms.load(Ordering::Relaxed);

                    let avg = if count > 0 {
                        total as f64 / count as f64
                    } else {
                        0.0
                    };

                    (avg, if min == u64::MAX { 0 } else { min }, max)
                } else {
                    (0.0, 0, 0)
                };

            endpoints.push(EndpointMetrics {
                name: endpoint,
                request_count,
                success_count,
                error_count,
                success_rate,
                avg_response_time_ms,
                min_response_time_ms,
                max_response_time_ms,
            });

            total_requests += request_count;
            total_successes += success_count;
            total_errors += error_count;
        }

        let success_rate = if total_requests > 0 {
            (total_successes as f64 / total_requests as f64) * 100.0
        } else {
            0.0
        };

        let error_rate = if total_requests > 0 {
            (total_errors as f64 / total_requests as f64) * 100.0
        } else {
            0.0
        };

        MetricsSnapshot {
            timestamp: now,
            uptime_seconds,
            version: env!("CARGO_PKG_VERSION").to_string(),
            requests: MetricsSummary {
                total_requests,
                total_successes,
                total_errors,
                success_rate,
                error_rate,
            },
            endpoints,
        }
    }

    async fn export_prometheus_format(&self, snapshot: &MetricsSnapshot) -> Result<String> {
        let mut output = String::new();

        output.push_str("# HELP deepseek_mcp_requests_total Total number of requests\n");
        output.push_str("# TYPE deepseek_mcp_requests_total counter\n");
        for endpoint in &snapshot.endpoints {
            output.push_str(&format!(
                "deepseek_mcp_requests_total{{endpoint=\"{}\"}} {}\n",
                endpoint.name, endpoint.request_count
            ));
        }

        output.push_str("\n# HELP deepseek_mcp_successes_total Total number of successful requests\n");
        output.push_str("# TYPE deepseek_mcp_successes_total counter\n");
        for endpoint in &snapshot.endpoints {
            output.push_str(&format!(
                "deepseek_mcp_successes_total{{endpoint=\"{}\"}} {}\n",
                endpoint.name, endpoint.success_count
            ));
        }

        output.push_str("\n# HELP deepseek_mcp_errors_total Total number of failed requests\n");
        output.push_str("# TYPE deepseek_mcp_errors_total counter\n");
        for endpoint in &snapshot.endpoints {
            output.push_str(&format!(
                "deepseek_mcp_errors_total{{endpoint=\"{}\"}} {}\n",
                endpoint.name, endpoint.error_count
            ));
        }

        output.push_str("\n# HELP deepseek_mcp_response_time_ms Average response time in milliseconds\n");
        output.push_str("# TYPE deepseek_mcp_response_time_ms gauge\n");
        for endpoint in &snapshot.endpoints {
            output.push_str(&format!(
                "deepseek_mcp_response_time_ms{{endpoint=\"{}\"}} {:.2}\n",
                endpoint.name, endpoint.avg_response_time_ms
            ));
        }

        output.push_str("\n# HELP deepseek_mcp_uptime_seconds Server uptime in seconds\n");
        output.push_str("# TYPE deepseek_mcp_uptime_seconds gauge\n");
        output.push_str(&format!("deepseek_mcp_uptime_seconds {}\n", snapshot.uptime_seconds));

        Ok(output)
    }
}