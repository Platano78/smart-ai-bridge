/// SECURITY: Audit Logging & Security Monitoring
/// Comprehensive security event tracking without sensitive data exposure

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::{info, warn, error, debug};
use uuid::Uuid;

/// Security event types for audit logging
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SecurityEventType {
    Authentication,
    Authorization,
    RateLimiting,
    InputValidation,
    SuspiciousActivity,
    DataAccess,
    ConfigurationChange,
    SecurityViolation,
    SystemAccess,
}

/// Security event severity levels
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EventSeverity {
    Critical,
    High,
    Medium,
    Low,
    Info,
}

/// Audit log entry structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLogEntry {
    pub event_id: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub event_type: SecurityEventType,
    pub severity: EventSeverity,
    pub source_ip: Option<String>,
    pub user_agent: Option<String>,
    pub client_id: Option<String>,
    pub method: Option<String>,
    pub resource: Option<String>,
    pub action: String,
    pub result: String,
    pub details: HashMap<String, String>,
    pub risk_score: u32,
}

impl AuditLogEntry {
    pub fn new(event_type: SecurityEventType, severity: EventSeverity, action: String) -> Self {
        Self {
            event_id: Uuid::new_v4().to_string(),
            timestamp: chrono::Utc::now(),
            event_type,
            severity,
            source_ip: None,
            user_agent: None,
            client_id: None,
            method: None,
            resource: None,
            action,
            result: "pending".to_string(),
            details: HashMap::new(),
            risk_score: 0,
        }
    }
    
    pub fn with_source_ip(mut self, ip: String) -> Self {
        self.source_ip = Some(ip);
        self
    }
    
    pub fn with_user_agent(mut self, user_agent: String) -> Self {
        // Sanitize user agent - remove potentially sensitive info
        let sanitized_ua = user_agent
            .chars()
            .take(200)
            .collect::<String>()
            .replace("Bearer ", "[TOKEN]")
            .replace("Authorization:", "[AUTH]");
        self.user_agent = Some(sanitized_ua);
        self
    }
    
    pub fn with_client_id(mut self, client_id: String) -> Self {
        self.client_id = Some(client_id);
        self
    }
    
    pub fn with_method(mut self, method: String) -> Self {
        self.method = Some(method);
        self
    }
    
    pub fn with_resource(mut self, resource: String) -> Self {
        self.resource = Some(resource);
        self
    }
    
    pub fn with_result(mut self, result: String) -> Self {
        self.result = result;
        self
    }
    
    pub fn with_detail(mut self, key: String, value: String) -> Self {
        // Sanitize details to prevent sensitive data leakage
        let sanitized_value = self.sanitize_detail_value(&value);
        self.details.insert(key, sanitized_value);
        self
    }
    
    pub fn with_risk_score(mut self, score: u32) -> Self {
        self.risk_score = score;
        self
    }
    
    /// Sanitize detail values to prevent sensitive data exposure
    fn sanitize_detail_value(&self, value: &str) -> String {
        use regex::Regex;
        
        let patterns = [
            (r"api[_-]?key[s]?[:\s=]+[^\s]+", "[API_KEY]"),
            (r"token[s]?[:\s=]+[^\s]+", "[TOKEN]"),
            (r"password[s]?[:\s=]+[^\s]+", "[PASSWORD]"),
            (r"secret[s]?[:\s=]+[^\s]+", "[SECRET]"),
            (r"bearer\s+[^\s]+", "[BEARER_TOKEN]"),
            (r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", "[EMAIL]"),
            (r"\b(?:\d{1,3}\.){3}\d{1,3}\b", "[IP_ADDRESS]"),
        ];
        
        let mut sanitized = value.to_string();
        for (pattern, replacement) in &patterns {
            if let Ok(re) = Regex::new(pattern) {
                sanitized = re.replace_all(&sanitized, *replacement).to_string();
            }
        }
        
        // Truncate long values
        if sanitized.len() > 500 {
            sanitized.truncate(497);
            sanitized.push_str("...");
        }
        
        sanitized
    }
    
    /// Log this audit entry using structured logging
    pub fn log(&self) {
        let log_data = serde_json::json!({
            "event_id": self.event_id,
            "event_type": self.event_type,
            "severity": self.severity,
            "source_ip": self.source_ip,
            "client_id": self.client_id,
            "method": self.method,
            "resource": self.resource,
            "action": self.action,
            "result": self.result,
            "details": self.details,
            "risk_score": self.risk_score,
            "timestamp": self.timestamp.to_rfc3339()
        });
        
        match self.severity {
            EventSeverity::Critical => {
                error!(target: "audit", "{}", log_data);
            }
            EventSeverity::High => {
                error!(target: "audit", "{}", log_data);
            }
            EventSeverity::Medium => {
                warn!(target: "audit", "{}", log_data);
            }
            EventSeverity::Low => {
                info!(target: "audit", "{}", log_data);
            }
            EventSeverity::Info => {
                debug!(target: "audit", "{}", log_data);
            }
        }
    }
}

/// Security audit logger with event buffering and analysis
pub struct SecurityAuditor {
    enabled: bool,
    buffer: Vec<AuditLogEntry>,
    max_buffer_size: usize,
    security_patterns: SecurityPatternDetector,
}

impl SecurityAuditor {
    pub fn new(enabled: bool) -> Self {
        Self {
            enabled,
            buffer: Vec::new(),
            max_buffer_size: 1000,
            security_patterns: SecurityPatternDetector::new(),
        }
    }
    
    /// Log a security event
    pub fn log_event(&mut self, entry: AuditLogEntry) {
        if !self.enabled {
            return;
        }
        
        // Analyze for patterns
        let risk_adjustment = self.security_patterns.analyze_event(&entry);
        let mut adjusted_entry = entry;
        adjusted_entry.risk_score += risk_adjustment;
        
        // Log immediately
        adjusted_entry.log();
        
        // Add to buffer for pattern analysis
        self.buffer.push(adjusted_entry);
        
        // Maintain buffer size
        if self.buffer.len() > self.max_buffer_size {
            self.buffer.remove(0);
        }
    }
    
    /// Log authentication attempt
    pub fn log_authentication(&mut self, client_id: Option<String>, source_ip: Option<String>, success: bool, details: HashMap<String, String>) {
        let entry = AuditLogEntry::new(
            SecurityEventType::Authentication,
            if success { EventSeverity::Info } else { EventSeverity::Medium },
            if success { "authentication_success".to_string() } else { "authentication_failure".to_string() }
        )
        .with_result(if success { "success".to_string() } else { "failure".to_string() });
        
        let mut final_entry = entry;
        if let Some(cid) = client_id {
            final_entry = final_entry.with_client_id(cid);
        }
        if let Some(ip) = source_ip {
            final_entry = final_entry.with_source_ip(ip);
        }
        
        for (key, value) in details {
            final_entry = final_entry.with_detail(key, value);
        }
        
        self.log_event(final_entry);
    }
    
    /// Log rate limiting event
    pub fn log_rate_limiting(&mut self, client_id: String, source_ip: Option<String>, limit_type: String, current_count: u32, limit: u32) {
        let entry = AuditLogEntry::new(
            SecurityEventType::RateLimiting,
            EventSeverity::Medium,
            "rate_limit_exceeded".to_string()
        )
        .with_client_id(client_id)
        .with_result("blocked".to_string())
        .with_detail("limit_type".to_string(), limit_type)
        .with_detail("current_count".to_string(), current_count.to_string())
        .with_detail("limit".to_string(), limit.to_string())
        .with_risk_score(10);
        
        let final_entry = if let Some(ip) = source_ip {
            entry.with_source_ip(ip)
        } else {
            entry
        };
        
        self.log_event(final_entry);
    }
    
    /// Log input validation failure
    pub fn log_validation_failure(&mut self, client_id: Option<String>, source_ip: Option<String>, field: String, error: String) {
        let entry = AuditLogEntry::new(
            SecurityEventType::InputValidation,
            EventSeverity::Medium,
            "input_validation_failed".to_string()
        )
        .with_result("rejected".to_string())
        .with_detail("field".to_string(), field)
        .with_detail("error".to_string(), error)
        .with_risk_score(15);
        
        let mut final_entry = entry;
        if let Some(cid) = client_id {
            final_entry = final_entry.with_client_id(cid);
        }
        if let Some(ip) = source_ip {
            final_entry = final_entry.with_source_ip(ip);
        }
        
        self.log_event(final_entry);
    }
    
    /// Log suspicious activity
    pub fn log_suspicious_activity(&mut self, client_id: String, source_ip: Option<String>, activity_type: String, risk_score: u32, details: HashMap<String, String>) {
        let severity = match risk_score {
            0..=25 => EventSeverity::Low,
            26..=50 => EventSeverity::Medium,
            51..=75 => EventSeverity::High,
            _ => EventSeverity::Critical,
        };
        
        let entry = AuditLogEntry::new(
            SecurityEventType::SuspiciousActivity,
            severity,
            format!("suspicious_activity_{}", activity_type)
        )
        .with_client_id(client_id)
        .with_result("detected".to_string())
        .with_risk_score(risk_score);
        
        let mut final_entry = if let Some(ip) = source_ip {
            entry.with_source_ip(ip)
        } else {
            entry
        };
        
        for (key, value) in details {
            final_entry = final_entry.with_detail(key, value);
        }
        
        self.log_event(final_entry);
    }
    
    /// Log data access event
    pub fn log_data_access(&mut self, client_id: Option<String>, source_ip: Option<String>, method: String, resource: String, success: bool) {
        let entry = AuditLogEntry::new(
            SecurityEventType::DataAccess,
            EventSeverity::Info,
            "data_access".to_string()
        )
        .with_method(method)
        .with_resource(resource)
        .with_result(if success { "success".to_string() } else { "failure".to_string() });
        
        let mut final_entry = entry;
        if let Some(cid) = client_id {
            final_entry = final_entry.with_client_id(cid);
        }
        if let Some(ip) = source_ip {
            final_entry = final_entry.with_source_ip(ip);
        }
        
        self.log_event(final_entry);
    }
    
    /// Get recent security events for analysis
    pub fn get_recent_events(&self, limit: Option<usize>) -> Vec<&AuditLogEntry> {
        let limit = limit.unwrap_or(100);
        self.buffer.iter().rev().take(limit).collect()
    }
    
    /// Generate security summary
    pub fn generate_security_summary(&self) -> serde_json::Value {
        let mut event_counts = HashMap::new();
        let mut severity_counts = HashMap::new();
        let mut total_risk_score = 0u32;
        let mut high_risk_events = 0;
        
        for entry in &self.buffer {
            let event_type_key = format!("{:?}", entry.event_type);
            *event_counts.entry(event_type_key).or_insert(0) += 1;
            
            let severity_key = format!("{:?}", entry.severity);
            *severity_counts.entry(severity_key).or_insert(0) += 1;
            
            total_risk_score += entry.risk_score;
            
            if entry.risk_score > 50 {
                high_risk_events += 1;
            }
        }
        
        let avg_risk_score = if !self.buffer.is_empty() {
            total_risk_score as f64 / self.buffer.len() as f64
        } else {
            0.0
        };
        
        serde_json::json!({
            "total_events": self.buffer.len(),
            "event_types": event_counts,
            "severity_distribution": severity_counts,
            "average_risk_score": avg_risk_score,
            "high_risk_events": high_risk_events,
            "patterns_detected": self.security_patterns.get_pattern_summary(),
            "enabled": self.enabled
        })
    }
}

/// Security pattern detector for behavioral analysis
struct SecurityPatternDetector {
    client_patterns: HashMap<String, ClientPattern>,
}

#[derive(Debug)]
struct ClientPattern {
    request_count: u32,
    failed_attempts: u32,
    suspicious_activities: u32,
    last_activity: chrono::DateTime<chrono::Utc>,
    pattern_score: u32,
}

impl SecurityPatternDetector {
    fn new() -> Self {
        Self {
            client_patterns: HashMap::new(),
        }
    }
    
    fn analyze_event(&mut self, entry: &AuditLogEntry) -> u32 {
        if let Some(client_id) = &entry.client_id {
            let pattern = self.client_patterns
                .entry(client_id.clone())
                .or_insert_with(|| ClientPattern {
                    request_count: 0,
                    failed_attempts: 0,
                    suspicious_activities: 0,
                    last_activity: chrono::Utc::now(),
                    pattern_score: 0,
                });
            
            pattern.request_count += 1;
            pattern.last_activity = entry.timestamp;
            
            match entry.event_type {
                SecurityEventType::Authentication if entry.result == "failure" => {
                    pattern.failed_attempts += 1;
                }
                SecurityEventType::SuspiciousActivity => {
                    pattern.suspicious_activities += 1;
                }
                SecurityEventType::InputValidation if entry.result == "rejected" => {
                    pattern.suspicious_activities += 1;
                }
                _ => {}
            }
            
            // Calculate pattern-based risk adjustment
            let risk_adjustment = match (pattern.failed_attempts, pattern.suspicious_activities) {
                (f, s) if f > 5 || s > 3 => 20,
                (f, s) if f > 3 || s > 1 => 10,
                (f, s) if f > 1 || s > 0 => 5,
                _ => 0,
            };
            
            pattern.pattern_score = risk_adjustment;
            risk_adjustment
        } else {
            0
        }
    }
    
    fn get_pattern_summary(&self) -> serde_json::Value {
        let high_risk_clients = self.client_patterns
            .iter()
            .filter(|(_, pattern)| pattern.pattern_score > 15)
            .count();
        
        let total_failed_attempts: u32 = self.client_patterns
            .values()
            .map(|p| p.failed_attempts)
            .sum();
        
        let total_suspicious: u32 = self.client_patterns
            .values()
            .map(|p| p.suspicious_activities)
            .sum();
        
        serde_json::json!({
            "total_clients_tracked": self.client_patterns.len(),
            "high_risk_clients": high_risk_clients,
            "total_failed_attempts": total_failed_attempts,
            "total_suspicious_activities": total_suspicious,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_audit_entry_creation() {
        let entry = AuditLogEntry::new(
            SecurityEventType::Authentication,
            EventSeverity::Medium,
            "test_action".to_string()
        )
        .with_client_id("test_client".to_string())
        .with_detail("test_key".to_string(), "test_value".to_string());
        
        assert_eq!(entry.action, "test_action");
        assert_eq!(entry.client_id, Some("test_client".to_string()));
        assert_eq!(entry.details.get("test_key"), Some(&"test_value".to_string()));
    }
    
    #[test] 
    fn test_sensitive_data_sanitization() {
        let entry = AuditLogEntry::new(
            SecurityEventType::Authentication,
            EventSeverity::Medium,
            "test".to_string()
        )
        .with_detail("api_key".to_string(), "api_key: sk-1234567890".to_string())
        .with_detail("email".to_string(), "user@example.com".to_string());
        
        assert_eq!(entry.details.get("api_key"), Some(&"[API_KEY]".to_string()));
        assert_eq!(entry.details.get("email"), Some(&"[EMAIL]".to_string()));
    }
    
    #[test]
    fn test_security_auditor() {
        let mut auditor = SecurityAuditor::new(true);
        
        auditor.log_authentication(
            Some("test_client".to_string()),
            Some("127.0.0.1".to_string()),
            false,
            HashMap::from([("reason".to_string(), "invalid_credentials".to_string())])
        );
        
        let summary = auditor.generate_security_summary();
        assert!(summary["total_events"].as_u64().unwrap() > 0);
    }
}
