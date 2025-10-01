/**
 * Circuit Breaker Implementation for Smart AI Bridge
 * Based on Netflix Hystrix, AWS patterns, and Microsoft Azure patterns
 * 
 * Reference implementations:
 * - AWS Circuit Breaker Pattern
 * - Microsoft .NET Circuit Breaker
 * - Netflix Hystrix design
 */

export class CircuitBreaker {
  constructor(options = {}) {
    // Configuration based on research findings
    this.failureThreshold = options.failureThreshold || 5;
    this.timeout = options.timeout || 60000; // 1 minute default
    this.halfOpenMaxCalls = options.halfOpenMaxCalls || 3;
    this.windowSize = options.windowSize || 10; // Sliding window
    
    // Circuit breaker state
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = [];
    this.lastFailureTime = null;
    this.halfOpenCalls = 0;
    this.successCount = 0;
    
    // Monitoring
    this.metrics = {
      totalRequests: 0,
      failedRequests: 0,
      successfulRequests: 0,
      circuitBreakerTrips: 0
    };
    
    console.error(`🔧 Circuit Breaker initialized: ${this.failureThreshold} failures in ${this.windowSize} requests`);
  }

  /**
   * Execute a function with circuit breaker protection
   * Based on AWS Circuit Breaker pattern
   */
  async execute(fn, fallbackFn = null) {
    this.metrics.totalRequests++;
    
    // Check circuit state before execution
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.state = 'HALF_OPEN';
        this.halfOpenCalls = 0;
        console.error('🔄 Circuit breaker entering HALF_OPEN state');
      } else {
        console.error('⚡ Circuit breaker OPEN - request rejected');
        if (fallbackFn) {
          return await fallbackFn();
        }
        throw new Error('Circuit breaker is OPEN - service unavailable');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      
      // In HALF_OPEN state, failure immediately opens circuit
      if (this.state === 'HALF_OPEN') {
        this.state = 'OPEN';
        this.lastFailureTime = Date.now();
        console.error('💥 Circuit breaker opened due to failure in HALF_OPEN state');
      }
      
      // Try fallback if available
      if (fallbackFn) {
        console.error('🔄 Executing fallback due to circuit breaker');
        return await fallbackFn();
      }
      
      throw error;
    }
  }

  /**
   * Handle successful execution
   * Based on Microsoft .NET pattern
   */
  onSuccess() {
    this.metrics.successfulRequests++;
    
    if (this.state === 'HALF_OPEN') {
      this.halfOpenCalls++;
      this.successCount++;
      
      // If enough successful calls in HALF_OPEN, close circuit
      if (this.halfOpenCalls >= this.halfOpenMaxCalls) {
        this.state = 'CLOSED';
        this.reset();
        console.error('✅ Circuit breaker CLOSED - service recovered');
      }
    } else if (this.state === 'CLOSED') {
      // Remove old failures from sliding window
      this.cleanupFailures();
    }
  }

  /**
   * Handle failed execution
   * Based on AWS resilience patterns
   */
  onFailure(error) {
    this.metrics.failedRequests++;
    this.lastFailureTime = Date.now();
    
    if (this.state === 'CLOSED') {
      this.failures.push({
        timestamp: Date.now(),
        error: error.message
      });
      
      // Clean up old failures
      this.cleanupFailures();
      
      // Check if we should open the circuit
      if (this.failures.length >= this.failureThreshold) {
        this.state = 'OPEN';
        this.metrics.circuitBreakerTrips++;
        console.error(`💥 Circuit breaker OPENED: ${this.failures.length} failures reached threshold`);
      }
    }
  }

  /**
   * Clean up old failures from sliding window
   * Based on sliding window pattern from research
   */
  cleanupFailures() {
    const windowStart = Date.now() - (this.windowSize * 1000);
    this.failures = this.failures.filter(failure => failure.timestamp > windowStart);
  }

  /**
   * Check if circuit should attempt reset
   * Based on timeout pattern from Netflix Hystrix
   */
  shouldAttemptReset() {
    return this.lastFailureTime && 
           (Date.now() - this.lastFailureTime) >= this.timeout;
  }

  /**
   * Reset circuit breaker state
   */
  reset() {
    this.state = 'CLOSED';
    this.failures = [];
    this.lastFailureTime = null;
    this.halfOpenCalls = 0;
    this.successCount = 0;
  }

  /**
   * Get current circuit breaker status
   * Based on monitoring patterns from research
   */
  getStatus() {
    return {
      state: this.state,
      failureCount: this.failures.length,
      lastFailureTime: this.lastFailureTime,
      metrics: { ...this.metrics },
      config: {
        failureThreshold: this.failureThreshold,
        timeout: this.timeout,
        halfOpenMaxCalls: this.halfOpenMaxCalls
      }
    };
  }

  /**
   * Force circuit open (for maintenance)
   * Based on Microsoft .NET Isolate pattern
   */
  forceOpen() {
    this.state = 'OPEN';
    this.lastFailureTime = Date.now();
    console.error('🔧 Circuit breaker forced OPEN for maintenance');
  }

  /**
   * Force circuit closed (for recovery)
   * Based on Microsoft .NET Reset pattern
   */
  forceClosed() {
    this.reset();
    console.error('🔧 Circuit breaker forced CLOSED');
  }
}

/**
 * Fallback Response Generator
 * Based on graceful degradation patterns from research
 */
export class FallbackResponseGenerator {
  constructor(config) {
    this.config = config;
    this.cachedResponses = new Map();
  }

  /**
   * Generate fallback response for DeepSeek queries
   * Based on AWS graceful degradation pattern
   */
  async generateFallbackResponse(prompt, context = {}) {
    const cacheKey = this.generateCacheKey(prompt);
    
    // Try cached response first
    if (this.cachedResponses.has(cacheKey)) {
      const cached = this.cachedResponses.get(cacheKey);
      console.error('📦 Returning cached fallback response');
      return {
        success: true,
        response: cached.response,
        model: 'fallback-cache',
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        endpoint: 'fallback-cache',
        timestamp: new Date().toISOString(),
        fallback: true
      };
    }

    // Generate context-aware fallback
    const fallbackResponse = this.generateContextualFallback(prompt, context);
    
    // Cache the fallback for future use
    this.cachedResponses.set(cacheKey, {
      response: fallbackResponse,
      timestamp: Date.now()
    });

    return {
      success: true,
      response: fallbackResponse,
      model: 'fallback-generated',
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      endpoint: 'fallback-service',
      timestamp: new Date().toISOString(),
      fallback: true
    };
  }

  /**
   * Generate contextual fallback based on prompt analysis
   */
  generateContextualFallback(prompt, context) {
    const promptLower = prompt.toLowerCase();
    
    // Code analysis requests
    if (promptLower.includes('analyze') || promptLower.includes('review')) {
      return `**Service Temporarily Unavailable**

I apologize, but the DeepSeek analysis service is currently unavailable. Here's what I can provide as a fallback:

**General Code Analysis Guidance:**
- Check for proper error handling and edge cases
- Review performance implications of algorithms used
- Ensure consistent naming conventions and documentation
- Validate input sanitization and security considerations

**Next Steps:**
- The service should be back online shortly
- You can try your request again in a few moments
- For urgent analysis needs, consider breaking down your request into smaller components

*This is a fallback response. The full AI analysis will be available when the service recovers.*`;
    }

    // File processing requests
    if (promptLower.includes('file') || promptLower.includes('process')) {
      return `**File Processing Service Unavailable**

The DeepSeek file processing service is temporarily unavailable. 

**Alternative Actions:**
- Save your file and try again in a few minutes
- For large files, consider using the intelligent chunking feature when service returns
- Break down complex file analysis into smaller, focused requests

**Service Status:** The service is being automatically monitored and should recover shortly.

*This is a fallback response generated while the primary service recovers.*`;
    }

    // General development requests
    return `**AI Development Service Temporarily Unavailable**

The DeepSeek AI service is currently experiencing connectivity issues.

**What's happening:**
- The local DeepSeek server may be starting up or temporarily unresponsive
- Network connectivity between the bridge and DeepSeek is interrupted
- The service is automatically attempting to reconnect

**What you can do:**
- Wait 1-2 minutes and try your request again
- Check that LM Studio is running with the DeepSeek model loaded
- The bridge will automatically reconnect when the service is available

**Your request:** "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"

*This fallback response ensures you receive immediate feedback while the service recovers.*`;
  }

  generateCacheKey(prompt) {
    // Simple hash for cache key
    let hash = 0;
    for (let i = 0; i < prompt.length; i++) {
      const char = prompt.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `fallback_${Math.abs(hash)}`;
  }

  /**
   * Clean up old cached responses
   */
  cleanupCache(maxAge = 3600000) { // 1 hour
    const now = Date.now();
    for (const [key, value] of this.cachedResponses.entries()) {
      if (now - value.timestamp > maxAge) {
        this.cachedResponses.delete(key);
      }
    }
  }
}
