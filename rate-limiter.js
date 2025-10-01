/**
 * Rate Limiter Module
 * Prevents abuse through request throttling
 */

export class RateLimiter {
  constructor(options = {}) {
    this.limits = {
      perMinute: options.perMinute || 60,
      perHour: options.perHour || 500,
      perDay: options.perDay || 5000
    };

    this.counters = {
      perMinute: new Map(),
      perHour: new Map(),
      perDay: new Map()
    };

    // Cleanup intervals
    setInterval(() => this.cleanup('perMinute'), 60 * 1000);
    setInterval(() => this.cleanup('perHour'), 60 * 60 * 1000);
    setInterval(() => this.cleanup('perDay'), 24 * 60 * 60 * 1000);
  }

  /**
   * Check if request is allowed
   * @param {string} identifier - Client identifier (token, IP, etc.)
   * @returns {object} - { allowed: boolean, retryAfter: number|null }
   */
  checkLimit(identifier) {
    const now = Date.now();

    // Check each time window
    for (const [window, limit] of Object.entries(this.limits)) {
      const counter = this.counters[window];
      const key = `${identifier}:${this.getWindowKey(now, window)}`;

      const count = counter.get(key) || 0;

      if (count >= limit) {
        return {
          allowed: false,
          retryAfter: this.getRetryAfter(window, now),
          limit,
          window
        };
      }
    }

    // Increment counters
    this.increment(identifier, now);

    return { allowed: true };
  }

  /**
   * Increment request counters
   */
  increment(identifier, now = Date.now()) {
    for (const window of Object.keys(this.limits)) {
      const counter = this.counters[window];
      const key = `${identifier}:${this.getWindowKey(now, window)}`;
      counter.set(key, (counter.get(key) || 0) + 1);
    }
  }

  /**
   * Get window key for timestamp
   */
  getWindowKey(timestamp, window) {
    const date = new Date(timestamp);
    switch (window) {
      case 'perMinute':
      case 'minute':
        return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`;
      case 'perHour':
      case 'hour':
        return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
      case 'perDay':
      case 'day':
        return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      default:
        return timestamp;
    }
  }

  /**
   * Calculate retry-after seconds
   */
  getRetryAfter(window, now) {
    const date = new Date(now);
    switch (window) {
      case 'perMinute':
      case 'minute':
        return 60 - date.getSeconds();
      case 'perHour':
      case 'hour':
        return (60 - date.getMinutes()) * 60 - date.getSeconds();
      case 'perDay':
      case 'day':
        return (24 - date.getHours()) * 3600 - date.getMinutes() * 60 - date.getSeconds();
      default:
        return 60;
    }
  }

  /**
   * Cleanup old counters
   */
  cleanup(window) {
    const counter = this.counters[window];
    const now = Date.now();
    const currentKey = this.getWindowKey(now, window);

    for (const key of counter.keys()) {
      if (!key.endsWith(currentKey)) {
        counter.delete(key);
      }
    }
  }

  /**
   * Get usage statistics
   */
  getStats(identifier) {
    const now = Date.now();
    const stats = {};

    for (const [window, limit] of Object.entries(this.limits)) {
      const counter = this.counters[window];
      const key = `${identifier}:${this.getWindowKey(now, window)}`;
      const count = counter.get(key) || 0;

      stats[window] = {
        used: count,
        limit,
        remaining: Math.max(0, limit - count),
        percentage: Math.round((count / limit) * 100)
      };
    }

    return stats;
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter({
  perMinute: 60,   // 60 requests per minute
  perHour: 500,    // 500 requests per hour
  perDay: 5000     // 5000 requests per day
});
