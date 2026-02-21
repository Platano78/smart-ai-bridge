/**
 * @fileoverview System Handlers - Health, Analytics, Validate, Conversation handlers
 * @module handlers/system-handlers
 *
 * Handlers for system-level tools that were missing from v2
 */

import { BaseHandler } from './base-handler.js';

/**
 * Health check handler
 */
class HealthHandler extends BaseHandler {
  async execute(args) {
    const { check_type = 'comprehensive', force_ip_rediscovery = false } = args;
    const startTime = Date.now();

    // Handle force IP rediscovery if requested
    if (force_ip_rediscovery && this.context.router) {
      try {
        console.error('🔄 Force IP rediscovery requested in health check');

        // Clear the detector cache first
        if (this.context.router.localDetector) {
          this.context.router.localDetector.cachedEndpoint = null;
          this.context.router.localDetector.cacheTimestamp = null;
        }

        // Re-run endpoint discovery
        if (this.context.router.initializeLocalEndpoint) {
          await this.context.router.initializeLocalEndpoint(true);
        }

        // Reset circuit breaker for local backend
        const localCircuitBreaker = this.context.router.circuitBreakers?.get('local');
        if (localCircuitBreaker) {
          localCircuitBreaker.failures = 0;
          localCircuitBreaker.lastFailure = 0;
          localCircuitBreaker.state = 'closed';
          console.error('✅ Circuit breaker reset for local backend');
        }

        // Reset health status
        if (this.context.router.backends?.local) {
          this.context.router.backends.local.health.failures = 0;
          this.context.router.backends.local.health.status = 'unknown';
        }

        console.error(`✅ Force IP rediscovery completed - new URL: ${this.context.router.backends?.local?.url}`);
      } catch (error) {
        console.error('❌ Force IP rediscovery failed:', error.message);
      }
    }

    const healthData = {
      success: true,
      check_type,
      timestamp: new Date().toISOString(),
      server_info: {
        name: 'Smart AI Bridge Multi-AI v2',
        version: '2.0.0',
        uptime: process.uptime(),
        memory_usage: process.memoryUsage(),
        multi_ai_integration: 'Modular Plugin Architecture',
        backends_configured: this.context.backendRegistry?.getBackendCount() || 0
      },
      tool_stats: this.context.aliasResolver?.getSystemStats() || {},
      multi_ai_status: {
        total_backends: this.context.backendRegistry?.getBackendCount() || 0,
        healthy_backends: 0,
        fallback_chains_active: 0,
        circuit_breakers: {}
      },
      backends: {}
    };

    // Get backend health from registry
    if (this.context.backendRegistry && check_type !== 'system') {
      const backends = this.context.backendRegistry.getAllBackends();
      for (const [key, backend] of Object.entries(backends)) {
        const isHealthy = backend.adapter?.isHealthy?.() ?? false;
        if (isHealthy) {
          healthData.multi_ai_status.healthy_backends++;
        }

        healthData.backends[key] = {
          name: backend.name,
          type: backend.type,
          priority: backend.priority,
          specialization: backend.specialization || 'general',
          overall_status: isHealthy ? 'operational' : 'degraded'
        };
      }
    }

    // Performance metrics from health monitor
    if (this.context.healthMonitor) {
      healthData.performance_metrics = this.context.healthMonitor.getMetrics();
    }

    // Router status check
    healthData.router_status = await this._checkRouterStatus();

    // Dual workflow manager status
    if (this.context.dualWorkflowManager) {
      const dualStatus = this.context.dualWorkflowManager.getStatus();
      const modeInfo = await this.context.dualWorkflowManager.detectMode();
      healthData.dual_workflow = {
        current_mode: modeInfo.mode,
        available_backends: modeInfo.backends,
        reasoning: modeInfo.reasoning,
        cached: modeInfo.cached,
        can_iterate: await this.context.dualWorkflowManager.canRunIterative(),
        fallback_chain: await this.context.dualWorkflowManager.getFallbackChain(),
        metrics: dualStatus.metrics
      };
    }

    healthData.total_check_time = Date.now() - startTime;
    return healthData;
  }

  /**
   * Check router status and get loaded models
   * @private
   * @returns {Promise<Object>} Router status information
   */
  async _checkRouterStatus() {
    const routerBaseUrl = 'http://localhost:8081';
    const routerStatus = {
      status: 'offline',
      models: [],
      available_presets: 0,
      error: null
    };

    try {
      // Check router health endpoint
      const healthResponse = await fetch(`${routerBaseUrl}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      if (!healthResponse.ok) {
        routerStatus.error = `Router health check failed with status ${healthResponse.status}`;
        return routerStatus;
      }

      const healthData = await healthResponse.json();
      routerStatus.status = healthData.status || 'online';

      // Get models from router
      const modelsResponse = await fetch(`${routerBaseUrl}/models`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000)
      });

      if (modelsResponse.ok) {
        const modelsData = await modelsResponse.json();

        // Extract loaded models
        if (modelsData.data && Array.isArray(modelsData.data)) {
          routerStatus.models = modelsData.data
            .filter(model => model.status?.value === 'loaded')
            .map(model => ({
              id: model.id,
              name: model.name || model.id,
              size: model.size,
              quantization: model.quantization
            }));

          // Total available presets (all models regardless of status)
          routerStatus.available_presets = modelsData.data.length;
        }
      } else {
        routerStatus.error = `Failed to fetch models: status ${modelsResponse.status}`;
      }

    } catch (error) {
      routerStatus.error = error.message;

      // More specific error messages
      if (error.name === 'AbortError') {
        routerStatus.error = 'Router request timed out after 5 seconds';
      } else if (error.code === 'ECONNREFUSED') {
        routerStatus.error = 'Router connection refused - service may not be running';
      }
    }

    return routerStatus;
  }
}

/**
 * Validate changes handler
 */
class ValidateChangesHandler extends BaseHandler {
  async execute(args) {
    const { file_path, proposed_changes, validation_rules = ['syntax'] } = args;

    const validationResults = [];

    for (const change of proposed_changes) {
      const result = {
        find: change.find,
        replace: change.replace,
        valid: true,
        warnings: [],
        suggestions: []
      };

      // Basic validation
      if (validation_rules.includes('syntax')) {
        if (change.replace.includes('undefined') || change.replace.includes('null')) {
          result.warnings.push('Potential null/undefined values detected');
        }
      }

      validationResults.push(result);
    }

    return {
      success: true,
      file_path,
      total_changes: proposed_changes.length,
      valid_changes: validationResults.filter(r => r.valid).length,
      validation_results: validationResults
    };
  }
}

/**
 * Manage conversation handler
 */
class ManageConversationHandler extends BaseHandler {
  async execute(args) {
    const {
      action,
      thread_id,
      continuation_id,
      topic = 'general',
      query,
      user_id = 'default',
      platform = 'claude_code',
      limit = 10
    } = args;

    try {
      let result;

      // Check if conversation threading is available
      if (!this.context.conversationThreading) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              action,
              error: 'Conversation threading not initialized in v2'
            }, null, 2)
          }],
          isError: true
        };
      }

      switch (action) {
        case 'start':
          result = await this.context.conversationThreading.startOrContinueThread({
            topic,
            user_id,
            platform
          });
          break;

        case 'continue':
          if (!continuation_id) {
            throw new Error('continuation_id is required for continue action');
          }
          result = await this.context.conversationThreading.continueThread(continuation_id);
          break;

        case 'resume':
          if (!thread_id) {
            throw new Error('thread_id is required for resume action');
          }
          result = await this.context.conversationThreading.resumeThread(thread_id);
          break;

        case 'history':
          if (!thread_id) {
            throw new Error('thread_id is required for history action');
          }
          result = await this.context.conversationThreading.getThreadHistory(thread_id, limit);
          break;

        case 'search':
          if (!query) {
            throw new Error('query is required for search action');
          }
          result = await this.context.conversationThreading.searchConversations(query);
          break;

        case 'analytics':
          result = await this.context.conversationThreading.getConversationAnalytics();
          break;

        default:
          throw new Error(`Unknown action: ${action}`);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            action,
            data: result
          }, null, 2)
        }]
      };
    } catch (error) {
      console.error(`Error in handleManageConversation (${action}):`, error);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            action,
            error: error.message
          }, null, 2)
        }],
        isError: true
      };
    }
  }
}

/**
 * Get analytics handler
 */
class GetAnalyticsHandler extends BaseHandler {
  async execute(args) {
    const {
      report_type = 'current',
      time_range = '7d',
      format = 'json'
    } = args;

    try {
      let result;

      // Check if usage analytics is available
      if (!this.context.usageAnalytics) {
        // Return basic stats if analytics not initialized
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              report_type,
              data: {
                message: 'Analytics module not fully initialized in v2',
                basic_stats: {
                  uptime: process.uptime(),
                  memory: process.memoryUsage(),
                  timestamp: new Date().toISOString()
                }
              }
            }, null, 2)
          }]
        };
      }

      switch (report_type) {
        case 'current':
          result = this.context.usageAnalytics.getSessionStats();
          break;

        case 'historical':
          result = await this.context.usageAnalytics.getHistoricalAnalytics(time_range);
          break;

        case 'cost':
          result = await this.context.usageAnalytics.getCostAnalysis();
          break;

        case 'recommendations':
          result = await this.context.usageAnalytics.getOptimizationRecommendations();
          break;

        case 'full_report':
          const reportStr = await this.context.usageAnalytics.exportReport(format, time_range);
          if (format === 'markdown') {
            return {
              content: [{
                type: 'text',
                text: reportStr
              }]
            };
          }
          result = JSON.parse(reportStr);
          break;

        default:
          result = this.context.usageAnalytics.getSessionStats();
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            report_type,
            data: result
          }, null, 2)
        }]
      };
    } catch (error) {
      console.error(`Error in handleGetAnalytics (${report_type}):`, error);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            report_type,
            error: error.message
          }, null, 2)
        }],
        isError: true
      };
    }
  }
}

export {
  HealthHandler,
  ValidateChangesHandler,
  ManageConversationHandler,
  GetAnalyticsHandler
};
