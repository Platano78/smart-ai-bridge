use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;
use tracing::{info, debug, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub server: ServerConfig,
    pub deepseek: DeepSeekConfig,
    pub mcp: McpConfig,
    pub logging: LoggingConfig,
    pub metrics: MetricsConfig,
    pub performance: PerformanceConfig,
    pub cache: CacheConfig,
    pub circuit_breaker: CircuitBreakerConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub workers: usize,
    pub timeout_seconds: u64,
    pub max_connections: usize,
    pub cors_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeepSeekConfig {
    pub api_key: String,
    pub base_url: String,
    pub model: String,
    pub max_tokens: u32,
    pub temperature: f32,
    pub timeout_seconds: u64,
    pub retry_attempts: usize,
    pub rate_limit_per_minute: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpConfig {
    pub protocol_version: String,
    pub capabilities: McpCapabilities,
    pub tools: Vec<String>,
    pub resources: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpCapabilities {
    pub tools: bool,
    pub resources: bool,
    pub prompts: bool,
    pub sampling: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoggingConfig {
    pub level: String,
    pub format: String,
    pub file: Option<PathBuf>,
    pub rotation: bool,
    pub max_size_mb: u64,
    pub max_files: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricsConfig {
    pub enabled: bool,
    pub port: u16,
    pub path: String,
    pub collect_detailed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceConfig {
    pub connection_pool_size: usize,
    pub max_concurrent_requests: usize,
    pub request_timeout_ms: u64,
    pub routing_timeout_ms: u64,
    pub file_processing_concurrency: usize,
    pub enable_request_deduplication: bool,
    pub enable_streaming: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheConfig {
    pub enabled: bool,
    pub ttl_seconds: u64,
    pub max_entries: usize,
    pub cache_response_bodies: bool,
    pub cache_file_contents: bool,
    pub invalidation_strategy: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CircuitBreakerConfig {
    pub enabled: bool,
    pub failure_threshold: usize,
    pub recovery_timeout_seconds: u64,
    pub half_open_max_calls: usize,
    pub timeout_duration_ms: u64,
}

impl Config {
    pub fn load(config_path: Option<PathBuf>, env: &str) -> Result<Self> {
        // Load environment variables
        if let Err(_) = dotenvy::dotenv() {
            debug!("No .env file found, using environment variables only");
        }

        let config = match config_path {
            Some(path) => {
                info!("Loading configuration from: {:?}", path);
                Self::load_from_file(&path)?
            }
            None => {
                info!("Loading configuration from environment");
                Self::load_from_env(env)?
            }
        };

        // Validate configuration
        config.validate()?;
        
        Ok(config)
    }

    fn load_from_file(path: &PathBuf) -> Result<Self> {
        let content = std::fs::read_to_string(path)?;
        let config: Config = serde_json::from_str(&content)?;
        Ok(config)
    }

    fn load_from_env(env: &str) -> Result<Self> {
        let deepseek_api_key = std::env::var("DEEPSEEK_API_KEY")
            .unwrap_or_else(|_| String::new());

        let config = Config {
            server: ServerConfig {
                host: std::env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string()),
                port: std::env::var("PORT")
                    .unwrap_or_else(|_| "8080".to_string())
                    .parse()
                    .unwrap_or(8080),
                workers: std::env::var("WORKERS")
                    .unwrap_or_else(|_| "4".to_string())
                    .parse()
                    .unwrap_or(4),
                timeout_seconds: std::env::var("TIMEOUT_SECONDS")
                    .unwrap_or_else(|_| "30".to_string())
                    .parse()
                    .unwrap_or(30),
                max_connections: std::env::var("MAX_CONNECTIONS")
                    .unwrap_or_else(|_| "1000".to_string())
                    .parse()
                    .unwrap_or(1000),
                cors_enabled: env != "production",
            },
            deepseek: DeepSeekConfig {
                api_key: deepseek_api_key.clone(),
                base_url: std::env::var("DEEPSEEK_BASE_URL")
                    .unwrap_or_else(|_| "https://api.deepseek.com".to_string()),
                model: std::env::var("DEEPSEEK_MODEL")
                    .unwrap_or_else(|_| "deepseek-chat".to_string()),
                max_tokens: std::env::var("DEEPSEEK_MAX_TOKENS")
                    .unwrap_or_else(|_| "4096".to_string())
                    .parse()
                    .unwrap_or(4096),
                temperature: std::env::var("DEEPSEEK_TEMPERATURE")
                    .unwrap_or_else(|_| "0.7".to_string())
                    .parse()
                    .unwrap_or(0.7),
                timeout_seconds: std::env::var("DEEPSEEK_TIMEOUT_SECONDS")
                    .unwrap_or_else(|_| "60".to_string())
                    .parse()
                    .unwrap_or(60),
                retry_attempts: std::env::var("DEEPSEEK_RETRY_ATTEMPTS")
                    .unwrap_or_else(|_| "3".to_string())
                    .parse()
                    .unwrap_or(3),
                rate_limit_per_minute: std::env::var("DEEPSEEK_RATE_LIMIT_PER_MINUTE")
                    .unwrap_or_else(|_| "60".to_string())
                    .parse()
                    .unwrap_or(60),
            },
            mcp: McpConfig {
                protocol_version: "2024-11-05".to_string(),
                capabilities: McpCapabilities {
                    tools: true,
                    resources: true,
                    prompts: true,
                    sampling: true,
                },
                tools: vec![
                    "search".to_string(),
                    "analyze".to_string(),
                    "generate".to_string(),
                ],
                resources: vec![
                    "files".to_string(),
                    "projects".to_string(),
                ],
            },
            logging: LoggingConfig {
                level: if env == "production" { "info".to_string() } else { "debug".to_string() },
                format: "json".to_string(),
                file: if env == "production" {
                    Some(PathBuf::from("/var/log/deepseek-mcp-bridge.log"))
                } else {
                    None
                },
                rotation: true,
                max_size_mb: 100,
                max_files: 10,
            },
            metrics: MetricsConfig {
                enabled: env == "production",
                port: 9090,
                path: "/metrics".to_string(),
                collect_detailed: env != "production",
            },
            performance: PerformanceConfig {
                connection_pool_size: std::env::var("CONNECTION_POOL_SIZE")
                    .unwrap_or_else(|_| "10".to_string())
                    .parse()
                    .unwrap_or(10),
                max_concurrent_requests: std::env::var("MAX_CONCURRENT_REQUESTS")
                    .unwrap_or_else(|_| "100".to_string())
                    .parse()
                    .unwrap_or(100),
                request_timeout_ms: std::env::var("REQUEST_TIMEOUT_MS")
                    .unwrap_or_else(|_| "30000".to_string())
                    .parse()
                    .unwrap_or(30000),
                routing_timeout_ms: std::env::var("ROUTING_TIMEOUT_MS")
                    .unwrap_or_else(|_| "100".to_string())
                    .parse()
                    .unwrap_or(100),
                file_processing_concurrency: std::env::var("FILE_PROCESSING_CONCURRENCY")
                    .unwrap_or_else(|_| "8".to_string())
                    .parse()
                    .unwrap_or(8),
                enable_request_deduplication: std::env::var("ENABLE_REQUEST_DEDUPLICATION")
                    .unwrap_or_else(|_| "true".to_string())
                    .parse()
                    .unwrap_or(true),
                enable_streaming: std::env::var("ENABLE_STREAMING")
                    .unwrap_or_else(|_| "true".to_string())
                    .parse()
                    .unwrap_or(true),
            },
            cache: CacheConfig {
                enabled: std::env::var("CACHE_ENABLED")
                    .unwrap_or_else(|_| "true".to_string())
                    .parse()
                    .unwrap_or(true),
                ttl_seconds: std::env::var("CACHE_TTL_SECONDS")
                    .unwrap_or_else(|_| "300".to_string())
                    .parse()
                    .unwrap_or(300),
                max_entries: std::env::var("CACHE_MAX_ENTRIES")
                    .unwrap_or_else(|_| "1000".to_string())
                    .parse()
                    .unwrap_or(1000),
                cache_response_bodies: std::env::var("CACHE_RESPONSE_BODIES")
                    .unwrap_or_else(|_| "true".to_string())
                    .parse()
                    .unwrap_or(true),
                cache_file_contents: std::env::var("CACHE_FILE_CONTENTS")
                    .unwrap_or_else(|_| "true".to_string())
                    .parse()
                    .unwrap_or(true),
                invalidation_strategy: std::env::var("CACHE_INVALIDATION_STRATEGY")
                    .unwrap_or_else(|_| "ttl".to_string()),
            },
            circuit_breaker: CircuitBreakerConfig {
                enabled: std::env::var("CIRCUIT_BREAKER_ENABLED")
                    .unwrap_or_else(|_| "true".to_string())
                    .parse()
                    .unwrap_or(true),
                failure_threshold: std::env::var("CIRCUIT_BREAKER_FAILURE_THRESHOLD")
                    .unwrap_or_else(|_| "5".to_string())
                    .parse()
                    .unwrap_or(5),
                recovery_timeout_seconds: std::env::var("CIRCUIT_BREAKER_RECOVERY_TIMEOUT")
                    .unwrap_or_else(|_| "60".to_string())
                    .parse()
                    .unwrap_or(60),
                half_open_max_calls: std::env::var("CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS")
                    .unwrap_or_else(|_| "3".to_string())
                    .parse()
                    .unwrap_or(3),
                timeout_duration_ms: std::env::var("CIRCUIT_BREAKER_TIMEOUT_MS")
                    .unwrap_or_else(|_| "5000".to_string())
                    .parse()
                    .unwrap_or(5000),
            },
        };

        Ok(config)
    }

    pub fn validate(&self) -> Result<()> {
        if self.deepseek.api_key.is_empty() {
            return Err(anyhow::anyhow!("DeepSeek API key is required"));
        }

        if self.server.port == 0 {
            return Err(anyhow::anyhow!("Server port must be greater than 0"));
        }

        if self.server.workers == 0 {
            return Err(anyhow::anyhow!("Server workers must be greater than 0"));
        }

        if self.deepseek.max_tokens == 0 {
            return Err(anyhow::anyhow!("DeepSeek max tokens must be greater than 0"));
        }

        if self.deepseek.temperature < 0.0 || self.deepseek.temperature > 2.0 {
            return Err(anyhow::anyhow!("DeepSeek temperature must be between 0.0 and 2.0"));
        }

        // Validate performance configuration
        if self.performance.connection_pool_size == 0 {
            return Err(anyhow::anyhow!("Connection pool size must be greater than 0"));
        }

        if self.performance.routing_timeout_ms > self.performance.request_timeout_ms {
            warn!("Routing timeout ({} ms) is greater than request timeout ({} ms)", 
                self.performance.routing_timeout_ms, self.performance.request_timeout_ms);
        }

        if self.cache.enabled && self.cache.max_entries == 0 {
            return Err(anyhow::anyhow!("Cache max entries must be greater than 0 when cache is enabled"));
        }

        if self.circuit_breaker.enabled && self.circuit_breaker.failure_threshold == 0 {
            return Err(anyhow::anyhow!("Circuit breaker failure threshold must be greater than 0 when enabled"));
        }

        Ok(())
    }

    pub fn deepseek_api_key(&self) -> &str {
        &self.deepseek.api_key
    }

    pub fn is_production(&self) -> bool {
        self.logging.level == "info" && self.metrics.enabled
    }

    pub fn get_routing_timeout(&self) -> Duration {
        Duration::from_millis(self.performance.routing_timeout_ms)
    }

    pub fn get_request_timeout(&self) -> Duration {
        Duration::from_millis(self.performance.request_timeout_ms)
    }

    pub fn get_circuit_breaker_timeout(&self) -> Duration {
        Duration::from_millis(self.circuit_breaker.timeout_duration_ms)
    }

    pub fn get_cache_ttl(&self) -> Duration {
        Duration::from_secs(self.cache.ttl_seconds)
    }

    pub fn performance_summary(&self) -> String {
        format!(
            "Performance Config - Pool: {}, Concurrent: {}, Routing: {}ms, Cache: {} (TTL: {}s), Circuit Breaker: {}",
            self.performance.connection_pool_size,
            self.performance.max_concurrent_requests,
            self.performance.routing_timeout_ms,
            if self.cache.enabled { "enabled" } else { "disabled" },
            self.cache.ttl_seconds,
            if self.circuit_breaker.enabled { "enabled" } else { "disabled" }
        )
    }
}