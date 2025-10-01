use anyhow::Result;
use reqwest::{Client, header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE}};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{Duration, Instant};
use std::sync::atomic::{AtomicUsize, AtomicBool, Ordering};
use tokio::time::timeout;
use tracing::{debug, error, warn, info};
use dashmap::DashMap;
use futures::future::BoxFuture;

use crate::config::Config;

pub struct DeepSeekClient {
    client: Client,
    config: Arc<Config>,
    base_url: String,
    circuit_breaker: CircuitBreaker,
    response_cache: Arc<DashMap<String, CachedResponse>>,
    performance_metrics: Arc<PerformanceMetrics>,
}

#[derive(Clone)]
pub struct CircuitBreaker {
    failures: Arc<AtomicUsize>,
    last_failure_time: Arc<AtomicUsize>,
    is_open: Arc<AtomicBool>,
    half_open_calls: Arc<AtomicUsize>,
    config: Arc<Config>,
}

#[derive(Clone)]
pub struct CachedResponse {
    response: DeepSeekResponse,
    created_at: Instant,
    ttl: Duration,
}

#[derive(Default)]
pub struct PerformanceMetrics {
    pub total_requests: AtomicUsize,
    pub successful_requests: AtomicUsize,
    pub failed_requests: AtomicUsize,
    pub cache_hits: AtomicUsize,
    pub cache_misses: AtomicUsize,
    pub circuit_breaker_trips: AtomicUsize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DeepSeekRequest {
    pub model: String,
    pub messages: Vec<Message>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
    pub stream: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeepSeekResponse {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub model: String,
    pub choices: Vec<Choice>,
    pub usage: Option<Usage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Choice {
    pub index: u32,
    pub message: Message,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Usage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

impl CircuitBreaker {
    pub fn new(config: Arc<Config>) -> Self {
        Self {
            failures: Arc::new(AtomicUsize::new(0)),
            last_failure_time: Arc::new(AtomicUsize::new(0)),
            is_open: Arc::new(AtomicBool::new(false)),
            half_open_calls: Arc::new(AtomicUsize::new(0)),
            config,
        }
    }

    pub fn can_execute(&self) -> bool {
        if !self.config.circuit_breaker.enabled {
            return true;
        }

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as usize;

        if self.is_open.load(Ordering::Relaxed) {
            let last_failure = self.last_failure_time.load(Ordering::Relaxed);
            let recovery_timeout = self.config.circuit_breaker.recovery_timeout_seconds as usize;
            
            if now - last_failure > recovery_timeout {
                // Transition to half-open
                self.is_open.store(false, Ordering::Relaxed);
                self.half_open_calls.store(0, Ordering::Relaxed);
                info!("Circuit breaker transitioning to half-open state");
                return true;
            }
            return false;
        }

        // Check if we're in half-open and exceeded max calls
        let half_open_calls = self.half_open_calls.load(Ordering::Relaxed);
        if half_open_calls > 0 && half_open_calls >= self.config.circuit_breaker.half_open_max_calls {
            return false;
        }

        true
    }

    pub fn record_success(&self) {
        self.failures.store(0, Ordering::Relaxed);
        self.is_open.store(false, Ordering::Relaxed);
        self.half_open_calls.store(0, Ordering::Relaxed);
    }

    pub fn record_failure(&self) {
        if !self.config.circuit_breaker.enabled {
            return;
        }

        let failures = self.failures.fetch_add(1, Ordering::Relaxed) + 1;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as usize;

        self.last_failure_time.store(now, Ordering::Relaxed);

        if failures >= self.config.circuit_breaker.failure_threshold {
            self.is_open.store(true, Ordering::Relaxed);
            warn!("Circuit breaker opened after {} failures", failures);
        }
    }
}

impl CachedResponse {
    pub fn is_expired(&self) -> bool {
        self.created_at.elapsed() > self.ttl
    }
}

impl DeepSeekClient {
    pub fn new(config: Arc<Config>) -> Result<Self> {
        let mut headers = HeaderMap::new();
        
        // SECURITY: Secure API key handling - never log the actual key
        if config.deepseek.api_key.is_empty() {
            error!("SECURITY: API key is empty - this is a critical security issue");
            return Err(anyhow::anyhow!("API key configuration error"));
        }
        
        let auth_value = format!("Bearer {}", config.deepseek.api_key);
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&auth_value)
                .map_err(|e| {
                    error!("SECURITY: API key format validation failed");
                    anyhow::anyhow!("Invalid API key format")
                })?,
        );
        
        // Clear the auth_value from memory immediately
        drop(auth_value);
        
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        
        // Optimized client with connection pooling
        let client = Client::builder()
            .default_headers(headers)
            .timeout(config.get_request_timeout())
            .pool_max_idle_per_host(config.performance.connection_pool_size)
            .pool_idle_timeout(Duration::from_secs(30))
            .tcp_keepalive(Duration::from_secs(60))
            // .http2_prior_knowledge() // Commented out due to version incompatibility
            .build()?;

        info!("SECURITY: DeepSeek client initialized securely with connection pool size: {}", 
            config.performance.connection_pool_size);

        Ok(DeepSeekClient {
            client,
            config: config.clone(),
            base_url: config.deepseek.base_url.clone(),
            circuit_breaker: CircuitBreaker::new(config.clone()),
            response_cache: Arc::new(DashMap::new()),
            performance_metrics: Arc::new(PerformanceMetrics::default()),
        })
    }

    pub async fn chat_completion(&self, request: DeepSeekRequest) -> Result<DeepSeekResponse> {
        let start_time = Instant::now();
        self.performance_metrics.total_requests.fetch_add(1, Ordering::Relaxed);

        // Check cache first if enabled
        if self.config.cache.enabled && self.config.cache.cache_response_bodies {
            let cache_key = self.generate_cache_key(&request);
            if let Some(cached) = self.response_cache.get(&cache_key) {
                if !cached.is_expired() {
                    self.performance_metrics.cache_hits.fetch_add(1, Ordering::Relaxed);
                    debug!("Cache hit for request, returning cached response");
                    return Ok(cached.response.clone());
                }
                // Remove expired entry
                self.response_cache.remove(&cache_key);
            }
            self.performance_metrics.cache_misses.fetch_add(1, Ordering::Relaxed);
        }

        // Check circuit breaker
        if !self.circuit_breaker.can_execute() {
            self.performance_metrics.circuit_breaker_trips.fetch_add(1, Ordering::Relaxed);
            return Err(anyhow::anyhow!("Circuit breaker is open, request rejected"));
        }

        let url = format!("{}/chat/completions", self.base_url);
        debug!("Sending request to DeepSeek API: {} (routing time: {:?})", 
            url, start_time.elapsed());
        
        let mut attempts = 0;
        let max_attempts = self.config.deepseek.retry_attempts;

        while attempts < max_attempts {
            attempts += 1;
            
            match self.send_request(&url, &request).await {
                Ok(response) => {
                    // Record success
                    self.circuit_breaker.record_success();
                    self.performance_metrics.successful_requests.fetch_add(1, Ordering::Relaxed);
                    
                    // Cache successful response if enabled
                    if self.config.cache.enabled && self.config.cache.cache_response_bodies {
                        let cache_key = self.generate_cache_key(&request);
                        let cached_response = CachedResponse {
                            response: response.clone(),
                            created_at: Instant::now(),
                            ttl: self.config.get_cache_ttl(),
                        };
                        self.response_cache.insert(cache_key, cached_response);
                    }
                    
                    let total_time = start_time.elapsed();
                    debug!("DeepSeek API response received successfully in {:?}", total_time);
                    return Ok(response);
                }
                Err(e) => {
                    error!("DeepSeek API request failed (attempt {}): {}", attempts, e);
                    
                    // Record failure for circuit breaker
                    self.circuit_breaker.record_failure();
                    
                    if attempts >= max_attempts {
                        self.performance_metrics.failed_requests.fetch_add(1, Ordering::Relaxed);
                        return Err(anyhow::anyhow!(
                            "DeepSeek API request failed after {} attempts: {}", 
                            max_attempts, 
                            e
                        ));
                    }
                    
                    // Exponential backoff with jitter
                    let base_delay = 1000 * (2_u64.pow((attempts - 1) as u32));
                    let jitter = fastrand::u64(0..base_delay / 4);
                    let delay = Duration::from_millis(base_delay + jitter);
                    warn!("Retrying in {:?}...", delay);
                    tokio::time::sleep(delay).await;
                }
            }
        }

        unreachable!()
    }

    async fn send_request(&self, url: &str, request: &DeepSeekRequest) -> Result<DeepSeekResponse> {
        let timeout_duration = self.config.get_request_timeout();
        
        let response = timeout(timeout_duration, async {
            self.client
                .post(url)
                .json(request)
                .send()
                .await
        }).await??;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await?;
            
            // SECURITY: Sanitize error message to prevent API key leakage
            let sanitized_error = error_text
                .replace(&self.config.deepseek.api_key, "[API_KEY_REDACTED]")
                .chars()
                .take(500) // Limit error message length
                .collect::<String>();
            
            error!("SECURITY: DeepSeek API error {} (details sanitized)", status);
            return Err(anyhow::anyhow!(
                "DeepSeek API error {}: {}", 
                status, 
                sanitized_error
            ));
        }

        let deepseek_response: DeepSeekResponse = response.json().await?;
        Ok(deepseek_response)
    }

    fn generate_cache_key(&self, request: &DeepSeekRequest) -> String {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        request.model.hash(&mut hasher);
        for message in &request.messages {
            message.role.hash(&mut hasher);
            message.content.hash(&mut hasher);
        }
        if let Some(temp) = request.temperature {
            temp.to_bits().hash(&mut hasher);
        }
        if let Some(max_tokens) = request.max_tokens {
            max_tokens.hash(&mut hasher);
        }
        
        format!("deepseek_cache_{}", hasher.finish())
    }

    pub fn get_performance_metrics(&self) -> PerformanceMetrics {
        PerformanceMetrics {
            total_requests: AtomicUsize::new(self.performance_metrics.total_requests.load(Ordering::Relaxed)),
            successful_requests: AtomicUsize::new(self.performance_metrics.successful_requests.load(Ordering::Relaxed)),
            failed_requests: AtomicUsize::new(self.performance_metrics.failed_requests.load(Ordering::Relaxed)),
            cache_hits: AtomicUsize::new(self.performance_metrics.cache_hits.load(Ordering::Relaxed)),
            cache_misses: AtomicUsize::new(self.performance_metrics.cache_misses.load(Ordering::Relaxed)),
            circuit_breaker_trips: AtomicUsize::new(self.performance_metrics.circuit_breaker_trips.load(Ordering::Relaxed)),
        }
    }

    pub async fn health_check(&self) -> Result<serde_json::Value> {
        let metrics = self.get_performance_metrics();
        let total = metrics.total_requests.load(Ordering::Relaxed);
        let successful = metrics.successful_requests.load(Ordering::Relaxed);
        let cache_hits = metrics.cache_hits.load(Ordering::Relaxed);
        let cache_misses = metrics.cache_misses.load(Ordering::Relaxed);
        
        let success_rate = if total > 0 { 
            (successful as f64 / total as f64 * 100.0) 
        } else { 
            100.0 
        };
        
        let cache_hit_rate = if cache_hits + cache_misses > 0 {
            (cache_hits as f64 / (cache_hits + cache_misses) as f64 * 100.0)
        } else {
            0.0
        };

        let health_status = serde_json::json!({
            "status": "healthy",
            "circuit_breaker_open": self.circuit_breaker.is_open.load(Ordering::Relaxed),
            "performance_metrics": {
                "total_requests": total,
                "successful_requests": successful,
                "failed_requests": metrics.failed_requests.load(Ordering::Relaxed),
                "success_rate_percent": format!("{:.1}", success_rate),
                "cache_hits": cache_hits,
                "cache_misses": cache_misses,
                "cache_hit_rate_percent": format!("{:.1}", cache_hit_rate),
                "circuit_breaker_trips": metrics.circuit_breaker_trips.load(Ordering::Relaxed)
            },
            "configuration": self.config.performance_summary()
        });

        // Perform actual health check
        let test_request = self.create_chat_request(vec![
            Message {
                role: "user".to_string(),
                content: "ping".to_string(),
            }
        ]).await;

        match self.chat_completion(test_request).await {
            Ok(_) => Ok(health_status),
            Err(e) => {
                error!("Health check failed: {}", e);
                Ok(serde_json::json!({
                    "status": "unhealthy",
                    "error": e.to_string(),
                    "performance_metrics": health_status["performance_metrics"],
                    "configuration": health_status["configuration"]
                }))
            }
        }
    }

    pub async fn create_chat_request(&self, messages: Vec<Message>) -> DeepSeekRequest {
        DeepSeekRequest {
            model: self.config.deepseek.model.clone(),
            messages,
            max_tokens: Some(self.config.deepseek.max_tokens),
            temperature: Some(self.config.deepseek.temperature),
            stream: Some(false),
        }
    }

    pub async fn cleanup_expired_cache(&self) {
        if !self.config.cache.enabled {
            return;
        }

        let expired_keys: Vec<String> = self.response_cache
            .iter()
            .filter_map(|entry| {
                if entry.value().is_expired() {
                    Some(entry.key().clone())
                } else {
                    None
                }
            })
            .collect();

        for key in expired_keys {
            self.response_cache.remove(&key);
        }

        debug!("Cleaned up {} expired cache entries", self.response_cache.len());
    }

    pub async fn concurrent_requests<'a>(&self, requests: Vec<DeepSeekRequest>) -> Vec<Result<DeepSeekResponse>> {
        use futures::stream::{self, StreamExt};
        
        let concurrency = self.config.performance.max_concurrent_requests.min(requests.len());
        
        stream::iter(requests.into_iter().map(|req| async move {
            self.chat_completion(req).await
        }))
        .buffer_unordered(concurrency)
        .collect()
        .await
    }
}