/**
 * @fileoverview GeminiRateLimiter - Proactive rate limiting with circuit breaker
 * @module utils/gemini-rate-limiter
 *
 * Prevents hitting hard Gemini API limits by opening circuit breaker
 * at configurable thresholds (default 80% of quota).
 *
 * Free Tier Limits:
 * - 15 requests per minute (RPM)
 * - 1,500 requests per day (RPD)
 * - 1,000,000 tokens per minute (TPM)
 *
 * Circuit opens at 80% to prevent cliff-edge failures
 */

class GeminiRateLimiter {
  /**
   * @param {Object} [options] - Rate limiter configuration
   * @param {number} [options.rpmLimit=15] - Requests per minute limit
   * @param {number} [options.rpdLimit=1500] - Requests per day limit
   * @param {number} [options.tpmLimit=1000000] - Tokens per minute limit
   * @param {number} [options.threshold=0.8] - Circuit opens at this % of limit
   * @param {boolean} [options.enabled=true] - Enable rate limiting
   */
  constructor(options = {}) {
    // Limits (Free tier defaults)
    this.limits = {
      rpm: options.rpmLimit || 15,
      rpd: options.rpdLimit || 1500,
      tpm: options.tpmLimit || 1000000
    };

    // Threshold to open circuit (default 80% of limit)
    this.threshold = options.threshold || 0.8;

    // Enable/disable limiter
    this.enabled = options.enabled !== false;

    // Current minute tracking
    this.currentMinute = {
      window: this.getCurrentMinuteWindow(),
      requests: 0,
      tokens: 0
    };

    // Current day tracking
    this.currentDay = {
      window: this.getCurrentDayWindow(),
      requests: 0
    };

    // Metrics
    this.metrics = {
      totalRequests: 0,
      totalTokens: 0,
      circuitOpenCount: 0,
      lastCircuitOpen: null,
      limitReachedCount: 0
    };

    // Circuit breaker state (integrates with BackendAdapter)
    this.circuitOpen = false;
    this.circuitOpenReason = null;

    console.error('[GeminiRateLimiter] Initialized with limits:', {
      rpm: this.limits.rpm,
      rpd: this.limits.rpd,
      tpm: this.limits.tpm,
      threshold: `${this.threshold * 100}%`,
      enabled: this.enabled
    });
  }

  /**
   * Get current minute window (truncated to minute)
   * @private
   * @returns {number} Timestamp of current minute
   */
  getCurrentMinuteWindow() {
    const now = new Date();
    now.setSeconds(0, 0);
    return now.getTime();
  }

  /**
   * Get current day window (truncated to day)
   * @private
   * @returns {number} Timestamp of current day
   */
  getCurrentDayWindow() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now.getTime();
  }

  /**
   * Reset counters if time window has passed
   * @private
   */
  resetIfNeeded() {
    const currentMinute = this.getCurrentMinuteWindow();
    const currentDay = this.getCurrentDayWindow();

    // Reset minute window
    if (currentMinute > this.currentMinute.window) {
      console.error('[GeminiRateLimiter] Minute window reset', {
        previousRequests: this.currentMinute.requests,
        previousTokens: this.currentMinute.tokens
      });

      this.currentMinute = {
        window: currentMinute,
        requests: 0,
        tokens: 0
      };

      // Auto-close circuit if it was opened due to RPM/TPM
      if (this.circuitOpen &&
          (this.circuitOpenReason === 'rpm_threshold' ||
           this.circuitOpenReason === 'tpm_threshold')) {
        this.closeCircuit();
      }
    }

    // Reset day window
    if (currentDay > this.currentDay.window) {
      console.error('[GeminiRateLimiter] Day window reset', {
        previousRequests: this.currentDay.requests
      });

      this.currentDay = {
        window: currentDay,
        requests: 0
      };

      // Auto-close circuit if it was opened due to RPD
      if (this.circuitOpen && this.circuitOpenReason === 'rpd_threshold') {
        this.closeCircuit();
      }
    }
  }

  /**
   * Check if request should be allowed
   * @param {number} [estimatedTokens=0] - Estimated tokens for this request
   * @returns {{allowed: boolean, reason: string, usage: Object}}
   */
  checkLimit(estimatedTokens = 0) {
    if (!this.enabled) {
      return { allowed: true, reason: 'Rate limiting disabled', usage: {} };
    }

    this.resetIfNeeded();

    // Check if circuit is already open
    if (this.circuitOpen) {
      return {
        allowed: false,
        reason: `Circuit open: ${this.circuitOpenReason}`,
        usage: this.getUsage()
      };
    }

    // Calculate current usage percentages
    const rpmUsage = this.currentMinute.requests / this.limits.rpm;
    const rpdUsage = this.currentDay.requests / this.limits.rpd;
    const tpmUsage = (this.currentMinute.tokens + estimatedTokens) / this.limits.tpm;

    // Check thresholds
    if (rpmUsage >= this.threshold) {
      this.openCircuit('rpm_threshold');
      return {
        allowed: false,
        reason: `RPM threshold reached (${Math.round(rpmUsage * 100)}% of ${this.limits.rpm})`,
        usage: this.getUsage()
      };
    }

    if (rpdUsage >= this.threshold) {
      this.openCircuit('rpd_threshold');
      return {
        allowed: false,
        reason: `RPD threshold reached (${Math.round(rpdUsage * 100)}% of ${this.limits.rpd})`,
        usage: this.getUsage()
      };
    }

    if (tpmUsage >= this.threshold) {
      this.openCircuit('tpm_threshold');
      return {
        allowed: false,
        reason: `TPM threshold reached (${Math.round(tpmUsage * 100)}% of ${this.limits.tpm})`,
        usage: this.getUsage()
      };
    }

    // Warnings at 50%, 60%, 70%
    const warningLevels = [0.5, 0.6, 0.7];
    for (const level of warningLevels) {
      if (rpmUsage >= level && rpmUsage < level + 0.05) {
        console.warn(`[GeminiRateLimiter] RPM at ${Math.round(rpmUsage * 100)}% (${this.currentMinute.requests}/${this.limits.rpm})`);
      }
      if (rpdUsage >= level && rpdUsage < level + 0.001) {
        console.warn(`[GeminiRateLimiter] RPD at ${Math.round(rpdUsage * 100)}% (${this.currentDay.requests}/${this.limits.rpd})`);
      }
    }

    return {
      allowed: true,
      reason: 'Within limits',
      usage: this.getUsage()
    };
  }

  /**
   * Record a successful request
   * @param {number} tokensUsed - Actual tokens consumed
   */
  recordRequest(tokensUsed = 0) {
    this.resetIfNeeded();

    this.currentMinute.requests++;
    this.currentMinute.tokens += tokensUsed;
    this.currentDay.requests++;

    this.metrics.totalRequests++;
    this.metrics.totalTokens += tokensUsed;

    // Log significant requests
    if (this.currentMinute.requests % 5 === 0) {
      console.error('[GeminiRateLimiter] Usage update:', this.getUsage());
    }
  }

  /**
   * Open circuit breaker
   * @private
   * @param {string} reason - Why circuit was opened
   */
  openCircuit(reason) {
    if (this.circuitOpen) return; // Already open

    this.circuitOpen = true;
    this.circuitOpenReason = reason;
    this.metrics.circuitOpenCount++;
    this.metrics.lastCircuitOpen = new Date();

    console.error(`[GeminiRateLimiter] CIRCUIT BREAKER OPENED: ${reason}`);
    console.error('[GeminiRateLimiter] Current usage:', this.getUsage());
    console.error('[GeminiRateLimiter] Will auto-reset on next time window');
  }

  /**
   * Close circuit breaker
   * @private
   */
  closeCircuit() {
    if (!this.circuitOpen) return;

    console.error('[GeminiRateLimiter] Circuit breaker closed (window reset)');
    this.circuitOpen = false;
    this.circuitOpenReason = null;
  }

  /**
   * Force reset (for testing or manual intervention)
   */
  forceReset() {
    console.error('[GeminiRateLimiter] Force reset requested');

    this.currentMinute = {
      window: this.getCurrentMinuteWindow(),
      requests: 0,
      tokens: 0
    };

    this.currentDay = {
      window: this.getCurrentDayWindow(),
      requests: 0
    };

    this.closeCircuit();
  }

  /**
   * Get current usage statistics
   * @returns {Object} Usage stats
   */
  getUsage() {
    return {
      minute: {
        requests: this.currentMinute.requests,
        tokens: this.currentMinute.tokens,
        requestsPercent: Math.round((this.currentMinute.requests / this.limits.rpm) * 100),
        tokensPercent: Math.round((this.currentMinute.tokens / this.limits.tpm) * 100)
      },
      day: {
        requests: this.currentDay.requests,
        requestsPercent: Math.round((this.currentDay.requests / this.limits.rpd) * 100)
      },
      limits: this.limits,
      circuitOpen: this.circuitOpen,
      circuitOpenReason: this.circuitOpenReason
    };
  }

  /**
   * Get metrics for monitoring
   * @returns {Object} Metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      currentUsage: this.getUsage()
    };
  }

  /**
   * Update limits (e.g., when switching from Free to Pro tier)
   * @param {Object} newLimits
   * @param {number} [newLimits.rpm]
   * @param {number} [newLimits.rpd]
   * @param {number} [newLimits.tpm]
   */
  updateLimits(newLimits) {
    if (newLimits.rpm) this.limits.rpm = newLimits.rpm;
    if (newLimits.rpd) this.limits.rpd = newLimits.rpd;
    if (newLimits.tpm) this.limits.tpm = newLimits.tpm;

    console.error('[GeminiRateLimiter] Limits updated:', this.limits);

    // Check if circuit can be closed with new limits
    if (this.circuitOpen) {
      const check = this.checkLimit(0);
      if (check.allowed) {
        this.closeCircuit();
      }
    }
  }

  /**
   * Disable rate limiting (use with caution)
   */
  disable() {
    this.enabled = false;
    this.closeCircuit();
    console.warn('[GeminiRateLimiter] Rate limiting DISABLED');
  }

  /**
   * Enable rate limiting
   */
  enable() {
    this.enabled = true;
    console.error('[GeminiRateLimiter] Rate limiting ENABLED');
  }
}

export { GeminiRateLimiter };
