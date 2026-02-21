/**
 * BackgroundAnalysisQueue - Priority ring buffer for async orchestrator analysis
 * Part of the tri-mode orchestrator system for SAB
 *
 * Priority ordering: failures (3) > playbook_misses (2) > random (1)
 * Features:
 * - Head-of-line insertion for failures
 * - TTL expiry (configurable, default 10 min)
 * - Drip-feed: max items per dequeue
 * - Smart eviction of lowest priority items
 */

import { EventEmitter } from 'events';

// Priority constants
const PRIORITY = {
  FAILURE: 3,
  PLAYBOOK_MISS: 2,
  RANDOM_SAMPLE: 1
};

class BackgroundAnalysisQueue extends EventEmitter {
  constructor(config = {}) {
    super();
    // T7: Increased capacity from 25 to 100
    this.capacity = config.queueCapacity || config.capacity || 100;
    this.sampleRate = config.sampleRate || 0.02;
    this.itemTTLMs = config.itemTTLMs || 600000; // 10 minutes
    this.maxItemsPerWake = config.maxItemsPerWake || 5;
    this.idleThresholdMs = config.idleThresholdMs || 60000; // 60 seconds

    // T7: Max retries before poison pill treatment
    this.maxRetries = config.maxRetries || 3;

    this.queue = [];
    this.processing = false;
    this.lastActivityTime = Date.now();

    // T7: Dead letter queue for poison pills
    this.deadLetterQueue = [];
    this.maxDeadLetterSize = config.maxDeadLetterSize || 20;

    // T7: Metrics
    this.metrics = {
      itemsEnqueued: 0,
      itemsProcessed: 0,
      itemsDropped: 0,
      itemsDeadLettered: 0,
      poisonPillsDetected: 0
    };

    console.error(`[BackgroundAnalysisQueue] Initialized: capacity=${this.capacity}, sampleRate=${this.sampleRate}, TTL=${this.itemTTLMs}ms, maxRetries=${this.maxRetries}`);
  }

  /**
   * Determine priority based on routing context
   */
  getPriority(ctx, item = null) {
    // Base priority from type
    let basePriority;
    if (ctx.wasFailure || ctx.error) {
      basePriority = PRIORITY.FAILURE;
    } else if (ctx.wasPlaybookMiss || ctx.playbookMiss) {
      basePriority = PRIORITY.PLAYBOOK_MISS;
    } else {
      basePriority = PRIORITY.RANDOM_SAMPLE;
    }

    // T7: If item provided, apply TTL decay and retry penalty
    if (item) {
      const age = Date.now() - (item.timestamp || Date.now());
      const ageFactor = Math.max(0, 1 - (age / this.itemTTLMs));
      const retryCount = item.retryCount || 0;
      const retryPenalty = retryCount * 0.5;

      return Math.max(0, basePriority * ageFactor - retryPenalty);
    }

    return basePriority;
  }

  /**
   * Decide whether to enqueue based on sampling rules
   */
  shouldEnqueue(ctx) {
    // Always enqueue failures and playbook misses
    if (ctx.wasFailure || ctx.error || ctx.wasPlaybookMiss || ctx.playbookMiss) {
      return true;
    }

    // Sample random requests at configured rate
    return Math.random() < this.sampleRate;
  }

  /**
   * Add item to queue with appropriate priority handling
   * @param {Object} request - The original request
   * @param {Object} response - The response (may be null initially)
   * @param {Object} routingContext - Context with wasFailure, wasPlaybookMiss, selectedBackend, taskType
   */
  maybeEnqueue(request, response, routingContext) {
    this.lastActivityTime = Date.now();

    if (!this.shouldEnqueue(routingContext)) {
      return false;
    }

    const item = {
      request,
      response,
      routingContext,
      priority: 0,  // Will be calculated
      timestamp: Date.now(),  // Capture BEFORE any analysis
      retryCount: 0  // T7: Track retries for poison pill detection
    };

    // Calculate priority with item context
    item.priority = this.getPriority(routingContext, item);

    // Head-of-line insertion for failures
    if (routingContext.wasFailure || routingContext.error) {
      this.queue.unshift(item);
      console.error(`[BackgroundAnalysisQueue] Inserted FAILURE at head. Queue size: ${this.queue.length}`);
    } else {
      this.queue.push(item);
      console.error(`[BackgroundAnalysisQueue] Added item priority=${item.priority.toFixed(2)}. Queue size: ${this.queue.length}`);
    }

    // T7: Metrics
    this.metrics.itemsEnqueued++;

    // Maintain priority order
    this.sortByPriority();

    // Evict if over capacity
    while (this.queue.length > this.capacity) {
      this.evictLowestPriority();
    }

    this.emit('enqueue', item);
    return true;
  }

  /**
   * T7: Requeue a failed item with retry tracking
   * Items exceeding maxRetries go to dead letter queue
   * @param {Object} item - The failed item to requeue
   * @returns {boolean} True if requeued, false if dead-lettered
   */
  requeueWithRetry(item) {
    item.retryCount = (item.retryCount || 0) + 1;

    // T7: Poison pill detection - too many retries
    if (item.retryCount > this.maxRetries) {
      console.error(`[BackgroundAnalysisQueue] Poison pill detected! Item failed ${item.retryCount} times, moving to dead letter queue`);
      this.metrics.poisonPillsDetected++;
      this.metrics.itemsDeadLettered++;

      // Add to dead letter queue with failure metadata
      this.deadLetterQueue.push({
        ...item,
        deadLetteredAt: Date.now(),
        reason: `Exceeded max retries (${this.maxRetries})`
      });

      // Keep dead letter queue bounded
      while (this.deadLetterQueue.length > this.maxDeadLetterSize) {
        this.deadLetterQueue.shift();
      }

      this.emit('deadLetter', item);
      return false;
    }

    // Recalculate priority with retry penalty
    item.priority = this.getPriority(item.routingContext, item);
    item.lastRetryAt = Date.now();

    // Add back to queue
    this.queue.push(item);
    this.sortByPriority();

    console.error(`[BackgroundAnalysisQueue] Requeued item (retry ${item.retryCount}/${this.maxRetries}, priority=${item.priority.toFixed(2)})`);

    // Evict if over capacity
    while (this.queue.length > this.capacity) {
      this.evictLowestPriority();
    }

    return true;
  }

  /**
   * T7: Get dead letter queue contents
   * @returns {Array} Dead-lettered items
   */
  getDeadLetterQueue() {
    return [...this.deadLetterQueue];
  }

  /**
   * T7: Clear dead letter queue
   */
  clearDeadLetterQueue() {
    const count = this.deadLetterQueue.length;
    this.deadLetterQueue = [];
    console.error(`[BackgroundAnalysisQueue] Cleared ${count} items from dead letter queue`);
    return count;
  }

  /**
   * Sort queue by priority (highest first), then by timestamp (oldest first within same priority)
   */
  sortByPriority() {
    this.queue.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority; // Higher priority first
      }
      return a.timestamp - b.timestamp; // Older items first within same priority
    });
  }

  /**
   * Remove lowest priority item from queue (from tail, oldest within lowest priority)
   */
  evictLowestPriority() {
    if (this.queue.length === 0) return null;

    // Find lowest priority
    const lowestPriority = Math.min(...this.queue.map(item => item.priority));

    // Find indices of items with lowest priority
    const indices = this.queue.reduce((acc, item, index) => {
      if (item.priority === lowestPriority) {
        acc.push(index);
      }
      return acc;
    }, []);

    // Among items with lowest priority, find the oldest one
    let oldestIndex = indices[0];
    for (let i = 1; i < indices.length; i++) {
      if (this.queue[indices[i]].timestamp < this.queue[oldestIndex].timestamp) {
        oldestIndex = indices[i];
      }
    }

    const evictedItem = this.queue.splice(oldestIndex, 1)[0];
    console.error(`[BackgroundAnalysisQueue] Evicted item priority=${evictedItem.priority}. Queue size: ${this.queue.length}`);
    this.emit('evict', evictedItem);
    return evictedItem;
  }

  /**
   * Check if queue should process items based on idle threshold
   */
  shouldProcess() {
    if (this.processing) return false;
    if (this.queue.length === 0) return false;

    const idleTime = Date.now() - this.lastActivityTime;
    return idleTime >= this.idleThresholdMs;
  }

  /**
   * Get items for processing (respects maxItemsPerWake and TTL)
   * @returns {Array} Items to process
   */
  dequeueItems() {
    const now = Date.now();
    const validItems = [];
    const expiredCount = { count: 0 };

    // Separate valid and expired items
    const newQueue = [];
    for (const item of this.queue) {
      if (now - item.timestamp > this.itemTTLMs) {
        expiredCount.count++;
        console.error(`[BackgroundAnalysisQueue] Skipping expired item (age: ${Math.round((now - item.timestamp) / 1000)}s)`);
        this.emit('expire', item);
      } else {
        newQueue.push(item);
      }
    }

    // Update queue without expired items
    this.queue = newQueue;

    // Take up to maxItemsPerWake items from the front (highest priority)
    const itemsToProcess = this.queue.splice(0, this.maxItemsPerWake);

    if (itemsToProcess.length > 0) {
      console.error(`[BackgroundAnalysisQueue] Dequeued ${itemsToProcess.length} items. Remaining: ${this.queue.length}`);
    }

    this.emit('dequeue', itemsToProcess);
    return itemsToProcess;
  }

  /**
   * Update an existing queued item with response/outcome
   * @param {Object} request - The request to find
   * @param {Object} response - The response to add
   */
  updateItemWithResponse(request, response) {
    const item = this.queue.find(i => i.request === request);
    if (item) {
      item.response = response;
      item.routingContext.wasFailure = !response?.success;

      // Re-prioritize if it became a failure
      if (item.routingContext.wasFailure && item.priority !== PRIORITY.FAILURE) {
        item.priority = PRIORITY.FAILURE;
        this.sortByPriority();
        console.error(`[BackgroundAnalysisQueue] Updated item to FAILURE priority`);
      }
    }
  }

  /**
   * Get queue statistics
   */
  getStats() {
    const now = Date.now();
    const priorityCounts = { failures: 0, misses: 0, random: 0 };
    let expiredCount = 0;
    let totalRetries = 0;

    for (const item of this.queue) {
      if (now - item.timestamp > this.itemTTLMs) {
        expiredCount++;
      }
      totalRetries += item.retryCount || 0;

      // Priority is now a float, categorize by base type
      if (item.routingContext?.wasFailure || item.routingContext?.error) {
        priorityCounts.failures++;
      } else if (item.routingContext?.wasPlaybookMiss || item.routingContext?.playbookMiss) {
        priorityCounts.misses++;
      } else {
        priorityCounts.random++;
      }
    }

    return {
      length: this.queue.length,
      capacity: this.capacity,
      processing: this.processing,
      maxItemsPerWake: this.maxItemsPerWake,
      idleSinceMs: now - this.lastActivityTime,
      priorityCounts,
      expiredCount,
      sampleRate: this.sampleRate,
      ttlMs: this.itemTTLMs,
      // T7: New metrics
      maxRetries: this.maxRetries,
      totalRetries,
      deadLetterQueueSize: this.deadLetterQueue.length,
      metrics: { ...this.metrics }
    };
  }

  /**
   * Clear the queue
   */
  clear() {
    this.queue = [];
    console.error(`[BackgroundAnalysisQueue] Queue cleared`);
  }
}

// Attach priority constants for external use
BackgroundAnalysisQueue.PRIORITY = PRIORITY;

export default BackgroundAnalysisQueue;
export { PRIORITY };
