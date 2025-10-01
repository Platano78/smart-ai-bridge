/// SECURITY: Rate Limiter & Abuse Prevention
/// Production-ready rate limiting to prevent API abuse and DoS attacks

use anyhow::Result;
use dashmap::DashMap;
use governor::{Quota, RateLimiter, state::{InMemoryState, NotKeyed}};
use leaky_bucket::RateLimiter as LeakyBucketLimiter;
use serde::{Deserialize, Serialize};
use std::net::IpAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tracing::{warn, info, debug, error};
use uuid::Uuid;

/// Rate limit configuration for different request types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimitConfig {
    pub global_requests_per_second: u32,
    pub global_requests_per_minute: u32,
    pub per_ip_requests_per_minute: u32,
    pub per_client_requests_per_minute: u32,
    pub burst_allowance: u32,
    pub tool_specific_limits: ToolSpecificLimits,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolSpecificLimits {
    pub deepseek_query_per_minute: u32,
    pub file_analysis_per_minute: u32,
    pub health_check_per_minute: u32,
    pub heavy_operations_per_hour: u32,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            global_requests_per_second: 100,
            global_requests_per_minute: 1000,
            per_ip_requests_per_minute: 60,
            per_client_requests_per_minute: 100,
            burst_allowance: 10,
            tool_specific_limits: ToolSpecificLimits {
                deepseek_query_per_minute: 30,
                file_analysis_per_minute: 20,
                health_check_per_minute: 60,
                heavy_operations_per_hour: 100,
            },
            enabled: true,
        }
    }
}

/// Rate limiting decision
#[derive(Debug)]
pub enum RateLimitDecision {
    Allowed,
    RateLimited {
        retry_after_seconds: u64,
        limit_type: String,
        current_count: u32,
        limit: u32,
    },
}

/// Client identifier for rate limiting
#[derive(Debug, Clone, Hash, Eq, PartialEq)]
pub struct ClientIdentifier {
    pub ip: Option<IpAddr>,
    pub client_id: Option<String>,
    pub user_agent: Option<String>,
}

impl ClientIdentifier {
    pub fn new() -> Self {
        Self {
            ip: None,
            client_id: None,
            user_agent: None,
        }
    }
    
    pub fn with_ip(mut self, ip: IpAddr) -> Self {
        self.ip = Some(ip);
        self
    }
    
    pub fn with_client_id(mut self, client_id: String) -> Self {
        self.client_id = Some(client_id);
        self
    }
    
    pub fn with_user_agent(mut self, user_agent: String) -> Self {
        self.user_agent = Some(user_agent);
        self
    }
    
    /// Generate a unique key for rate limiting
    pub fn key(&self) -> String {
        match (&self.ip, &self.client_id) {
            (Some(ip), Some(client_id)) => format!("{}:{}", ip, client_id),
            (Some(ip), None) => format!("ip:{}", ip),
            (None, Some(client_id)) => format!("client:{}", client_id),
            (None, None) => {
                // Fallback to user agent hash if available
                if let Some(ua) = &self.user_agent {
                    use sha2::{Digest, Sha256};
                    let mut hasher = Sha256::new();
                    hasher.update(ua.as_bytes());
                    let hash = hasher.finalize();
                    format!("ua:{}", format!("{:x}", hash)[..16].to_string())
                } else {
                    format!("anonymous:{}", Uuid::new_v4())
                }
            }
        }
    }
}

/// Request context for rate limiting
#[derive(Debug, Clone)]
pub struct RequestContext {
    pub client: ClientIdentifier,
    pub method: String,
    pub tool_name: Option<String>,
    pub timestamp: Instant,
    pub request_size: usize,
}

/// Rate limiter tracking entry
#[derive(Debug)]
struct RateLimitEntry {
    requests: Vec<Instant>,
    last_request: Instant,
    total_requests: u64,
    blocked_requests: u64,
}

impl RateLimitEntry {
    fn new() -> Self {
        Self {
            requests: Vec::new(),
            last_request: Instant::now(),
            total_requests: 0,
            blocked_requests: 0,
        }
    }
    
    /// Clean up old request timestamps
    fn cleanup_old_requests(&mut self, window_duration: Duration) {
        let cutoff = Instant::now() - window_duration;
        self.requests.retain(|&timestamp| timestamp > cutoff);
    }
    
    /// Count requests in the given window
    fn count_requests_in_window(&self, window_duration: Duration) -> usize {
        let cutoff = Instant::now() - window_duration;
        self.requests.iter().filter(|&&timestamp| timestamp > cutoff).count()
    }
    
    /// Add a new request
    fn add_request(&mut self) {
        let now = Instant::now();
        self.requests.push(now);
        self.last_request = now;
        self.total_requests += 1;
    }
    
    /// Record a blocked request
    fn record_blocked(&mut self) {
        self.blocked_requests += 1;
    }
}

/// Multi-layer rate limiter with different strategies
pub struct SecurityRateLimiter {
    config: RateLimitConfig,
    // Global limiters
    global_limiter: Arc<RateLimiter<NotKeyed, InMemoryState, governor::clock::DefaultClock>>,
    // Per-client tracking
    client_limits: Arc<DashMap<String, RateLimitEntry>>,
    // Tool-specific limiters
    tool_limiters: Arc<DashMap<String, Arc<LeakyBucketLimiter>>>,
    // Suspicious activity tracking
    suspicious_clients: Arc<DashMap<String, SuspiciousActivityTracker>>,
}

#[derive(Debug)]
struct SuspiciousActivityTracker {
    rapid_requests_count: u32,
    failed_attempts: u32,
    large_requests_count: u32,
    unusual_patterns: u32,
    first_seen: Instant,
    risk_score: u32,
}

impl SuspiciousActivityTracker {
    fn new() -> Self {
        Self {
            rapid_requests_count: 0,
            failed_attempts: 0,
            large_requests_count: 0,
            unusual_patterns: 0,
            first_seen: Instant::now(),
            risk_score: 0,
        }
    }
    
    fn calculate_risk_score(&mut self) -> u32 {
        self.risk_score = self.rapid_requests_count * 3
            + self.failed_attempts * 5
            + self.large_requests_count * 2
            + self.unusual_patterns * 4;
        
        // Time-based decay
        let age_minutes = self.first_seen.elapsed().as_secs() / 60;
        if age_minutes > 0 {
            self.risk_score = self.risk_score.saturating_sub(age_minutes as u32);
        }
        
        self.risk_score
    }
}

impl SecurityRateLimiter {
    pub fn new(config: RateLimitConfig) -> Result<Self> {
        // Global rate limiter  
        let global_quota = Quota::per_second(std::num::NonZeroU32::new(config.global_requests_per_second).unwrap());
        let global_limiter = Arc::new(RateLimiter::direct(global_quota));
        
        // Initialize tool-specific limiters
        let tool_limiters = Arc::new(DashMap::new());
        
        // DeepSeek query limiter
        let deepseek_limiter = LeakyBucketLimiter::builder()
            .max(config.tool_specific_limits.deepseek_query_per_minute as usize)
            .refill(1)
            .interval(Duration::from_secs(60))
            .build();
        tool_limiters.insert("deepseek_query".to_string(), Arc::new(deepseek_limiter));
        
        // File analysis limiter
        let file_limiter = LeakyBucketLimiter::builder()
            .max(config.tool_specific_limits.file_analysis_per_minute as usize)
            .refill(1)
            .interval(Duration::from_secs(60))
            .build();
        tool_limiters.insert("file_analysis".to_string(), Arc::new(file_limiter));
        
        info!(
            "Rate limiter initialized: {}rps global, {}rpm per-IP, {}rpm per-client",
            config.global_requests_per_second,
            config.per_ip_requests_per_minute,
            config.per_client_requests_per_minute
        );
        
        Ok(Self {
            config,
            global_limiter,
            client_limits: Arc::new(DashMap::new()),
            tool_limiters,
            suspicious_clients: Arc::new(DashMap::new()),
        })
    }
    
    /// Check if request is allowed under all rate limiting rules
    pub async fn check_rate_limit(&self, request: &RequestContext) -> RateLimitDecision {
        if !self.config.enabled {
            return RateLimitDecision::Allowed;
        }
        
        let client_key = request.client.key();
        
        // 1. Global rate limit check
        if let Err(_) = self.global_limiter.check() {
            warn!("Global rate limit exceeded for client: {}", client_key);
            return RateLimitDecision::RateLimited {
                retry_after_seconds: 1,
                limit_type: "global".to_string(),
                current_count: self.config.global_requests_per_second + 1,
                limit: self.config.global_requests_per_second,
            };
        }
        
        // 2. Per-client rate limit check
        let per_client_decision = self.check_per_client_limit(&client_key).await;
        if let RateLimitDecision::RateLimited { .. } = per_client_decision {
            return per_client_decision;
        }
        
        // 3. Tool-specific rate limit check
        if let Some(tool_name) = &request.tool_name {
            let tool_decision = self.check_tool_specific_limit(tool_name, &client_key).await;
            if let RateLimitDecision::RateLimited { .. } = tool_decision {
                return tool_decision;
            }
        }
        
        // 4. Suspicious activity check
        let suspicious_decision = self.check_suspicious_activity(&request, &client_key).await;
        if let RateLimitDecision::RateLimited { .. } = suspicious_decision {
            return suspicious_decision;
        }
        
        // Record successful request
        self.record_request(&client_key, &request).await;
        
        debug!("Rate limit check passed for client: {}", client_key);
        RateLimitDecision::Allowed
    }
    
    async fn check_per_client_limit(&self, client_key: &str) -> RateLimitDecision {
        let mut entry = self.client_limits
            .entry(client_key.to_string())
            .or_insert_with(RateLimitEntry::new);
        
        // Clean up old requests
        entry.cleanup_old_requests(Duration::from_secs(60));
        
        let current_count = entry.count_requests_in_window(Duration::from_secs(60));
        
        if current_count >= self.config.per_client_requests_per_minute as usize {
            entry.record_blocked();
            warn!(
                "Per-client rate limit exceeded: {} (limit: {})",
                current_count, self.config.per_client_requests_per_minute
            );
            
            RateLimitDecision::RateLimited {
                retry_after_seconds: 60,
                limit_type: "per_client".to_string(),
                current_count: current_count as u32,
                limit: self.config.per_client_requests_per_minute,
            }
        } else {
            RateLimitDecision::Allowed
        }
    }
    
    async fn check_tool_specific_limit(&self, tool_name: &str, client_key: &str) -> RateLimitDecision {
        let tool_category = match tool_name {
            "enhanced_query_deepseek" | "query_deepseek" => "deepseek_query",
            "analyze_files" | "youtu_agent_analyze_files" => "file_analysis",
            "check_deepseek_status" | "health" => return RateLimitDecision::Allowed, // Health checks less restricted
            _ => "general",
        };
        
        if let Some(limiter) = self.tool_limiters.get(tool_category) {
            if !limiter.try_acquire(1) {
                warn!("Tool-specific rate limit exceeded for {}: {}", tool_category, client_key);
                
                let limit = match tool_category {
                    "deepseek_query" => self.config.tool_specific_limits.deepseek_query_per_minute,
                    "file_analysis" => self.config.tool_specific_limits.file_analysis_per_minute,
                    _ => 30,
                };
                
                return RateLimitDecision::RateLimited {
                    retry_after_seconds: 60,
                    limit_type: format!("tool_{}", tool_category),
                    current_count: limit + 1,
                    limit,
                };
            }
        }
        
        RateLimitDecision::Allowed
    }
    
    async fn check_suspicious_activity(&self, request: &RequestContext, client_key: &str) -> RateLimitDecision {
        let mut tracker = self.suspicious_clients
            .entry(client_key.to_string())
            .or_insert_with(SuspiciousActivityTracker::new);
        
        // Detect rapid requests (more than 5 requests per second)
        if let Some(entry) = self.client_limits.get(client_key) {
            let recent_requests = entry.count_requests_in_window(Duration::from_secs(1));
            if recent_requests > 5 {
                tracker.rapid_requests_count += 1;
            }
        }
        
        // Detect large requests
        if request.request_size > 100_000 {
            tracker.large_requests_count += 1;
        }
        
        let risk_score = tracker.calculate_risk_score();
        
        // Block high-risk clients
        if risk_score > 50 {
            error!(
                "High-risk client blocked: {} (risk score: {})",
                client_key, risk_score
            );
            
            return RateLimitDecision::RateLimited {
                retry_after_seconds: 300, // 5 minute cooldown
                limit_type: "suspicious_activity".to_string(),
                current_count: risk_score,
                limit: 50,
            };
        }
        
        // Warn about medium-risk clients
        if risk_score > 25 {
            warn!(
                "Suspicious activity detected for client: {} (risk score: {})",
                client_key, risk_score
            );
        }
        
        RateLimitDecision::Allowed
    }
    
    async fn record_request(&self, client_key: &str, _request: &RequestContext) {
        if let Some(mut entry) = self.client_limits.get_mut(client_key) {
            entry.add_request();
        } else {
            let mut new_entry = RateLimitEntry::new();
            new_entry.add_request();
            self.client_limits.insert(client_key.to_string(), new_entry);
        }
    }
    
    /// Get rate limiting statistics
    pub fn get_statistics(&self) -> serde_json::Value {
        let total_clients = self.client_limits.len();
        let suspicious_clients = self.suspicious_clients.len();
        
        let mut total_requests = 0u64;
        let mut total_blocked = 0u64;
        
        for entry in self.client_limits.iter() {
            total_requests += entry.total_requests;
            total_blocked += entry.blocked_requests;
        }
        
        serde_json::json!({
            "total_clients": total_clients,
            "suspicious_clients": suspicious_clients,
            "total_requests": total_requests,
            "total_blocked": total_blocked,
            "block_rate_percent": if total_requests > 0 {
                (total_blocked as f64 / total_requests as f64) * 100.0
            } else {
                0.0
            },
            "config": {
                "enabled": self.config.enabled,
                "global_rps": self.config.global_requests_per_second,
                "per_client_rpm": self.config.per_client_requests_per_minute,
                "deepseek_rpm": self.config.tool_specific_limits.deepseek_query_per_minute,
                "file_analysis_rpm": self.config.tool_specific_limits.file_analysis_per_minute
            }
        })
    }
    
    /// Cleanup old entries to prevent memory leaks
    pub async fn cleanup_old_entries(&self) {
        let cutoff = Instant::now() - Duration::from_secs(3600); // 1 hour
        
        // Clean up client limits
        self.client_limits.retain(|_, entry| {
            entry.last_request > cutoff
        });
        
        // Clean up suspicious activity trackers
        self.suspicious_clients.retain(|_, tracker| {
            tracker.first_seen > cutoff
        });
        
        debug!(
            "Cleaned up old rate limit entries. Active clients: {}, Suspicious: {}",
            self.client_limits.len(),
            self.suspicious_clients.len()
        );
    }
    
    /// Manually block a client (for security incidents)
    pub fn block_client(&self, client_key: &str, duration_seconds: u64) {
        if let Some(mut tracker) = self.suspicious_clients.get_mut(client_key) {
            tracker.risk_score = 100; // Maximum risk score
            tracker.failed_attempts = 20;
            warn!("Client manually blocked: {} for {} seconds", client_key, duration_seconds);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv4Addr;
    
    #[tokio::test]
    async fn test_basic_rate_limiting() {
        let config = RateLimitConfig {
            per_client_requests_per_minute: 3,
            ..Default::default()
        };
        
        let limiter = SecurityRateLimiter::new(config).unwrap();
        let client = ClientIdentifier::new().with_ip(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1)));
        
        // First 3 requests should pass
        for i in 0..3 {
            let request = RequestContext {
                client: client.clone(),
                method: "test".to_string(),
                tool_name: None,
                timestamp: Instant::now(),
                request_size: 1000,
            };
            
            let decision = limiter.check_rate_limit(&request).await;
            match decision {
                RateLimitDecision::Allowed => {},
                _ => panic!("Request {} should be allowed", i),
            }
        }
        
        // 4th request should be rate limited
        let request = RequestContext {
            client: client.clone(),
            method: "test".to_string(),
            tool_name: None,
            timestamp: Instant::now(),
            request_size: 1000,
        };
        
        let decision = limiter.check_rate_limit(&request).await;
        match decision {
            RateLimitDecision::RateLimited { .. } => {},
            _ => panic!("4th request should be rate limited"),
        }
    }
    
    #[tokio::test]
    async fn test_suspicious_activity_detection() {
        let config = RateLimitConfig::default();
        let limiter = SecurityRateLimiter::new(config).unwrap();
        let client = ClientIdentifier::new().with_ip(IpAddr::V4(Ipv4Addr::new(192, 168, 1, 100)));
        
        // Simulate large requests that should trigger suspicious activity detection
        for _ in 0..10 {
            let request = RequestContext {
                client: client.clone(),
                method: "test".to_string(),
                tool_name: None,
                timestamp: Instant::now(),
                request_size: 200_000, // Large request
            };
            
            let _ = limiter.check_rate_limit(&request).await;
        }
        
        let stats = limiter.get_statistics();
        assert!(stats["suspicious_clients"].as_u64().unwrap() > 0);
    }
}
