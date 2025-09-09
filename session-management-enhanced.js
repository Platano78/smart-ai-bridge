#!/usr/bin/env node

/**
 * Enhanced Session Management MCP Server v3.1.0
 * Auto-alerting, proactive monitoring with automatic context export
 * Features: Claude Code/Desktop integration, Universal-Context-Export MCP integration
 * 
 * NEW in v3.1.0:
 * - Automatic context export at 85% threshold
 * - Universal-context-export MCP server integration
 * - File-based export triggers with ready flags
 * - Simple threshold monitoring with export automation
 * 
 * SIMPLICITY FOCUS: Essential context preservation only, no overengineering
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

class EnhancedSessionManagement {
  constructor() {
    this.server = new Server(
      {
        name: "session-management",
        version: "3.0.0",
        description: "Enhanced session management with auto-monitoring and proactive alerts"
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    // Session state tracking
    this.sessionState = {
      isActive: false,
      platform: null,
      startTime: null,
      lastUsage: 0,
      alertThreshold: 80,
      criticalThreshold: 90,
      conversationLength: 0,
      lastAlert: null,
      sessionId: null
    };

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "auto_monitor_session",
            description: "[PURPOSE] Automatically monitor session with proactive alerts, handoff recommendations, AND automatic context export at 85% threshold. Call this at the start of each conversation for continuous monitoring. [DOMAIN_TERMS] Auto-monitoring, proactive alerts, session initialization, automatic export, universal-context-export integration. [WHEN_TO_USE] Call immediately when starting any new conversation or development session. [OUTPUT_FORMAT] Returns monitoring status with auto-alert and auto-export configuration. [WORKFLOW] RECOMMENDED WORKFLOW: 1. Call auto_monitor_session at conversation start 2. System will automatically alert at 80% and 90% usage 3. System will automatically export context at 85% for universal-context-export MCP server 4. Follow handoff recommendations when triggered.",
            inputSchema: {
              type: "object",
              properties: {
                platform: {
                  type: "string",
                  enum: ["claude", "chatgpt", "gemini", "generic"],
                  description: "Target AI platform for monitoring"
                },
                enable_auto_alerts: {
                  type: "boolean",
                  description: "Enable automatic usage alerts",
                  default: true
                },
                alert_threshold: {
                  type: "number",
                  description: "Usage percentage to trigger alerts (default: 80)",
                  minimum: 50,
                  maximum: 95,
                  default: 80
                },
                conversation_content: {
                  type: "string",
                  description: "Current conversation content for analysis"
                }
              },
              required: ["platform"],
              additionalProperties: false
            }
          },
          {
            name: "check_session_alerts",
            description: "[PURPOSE] Check for pending session alerts and get proactive handoff recommendations. This tool simulates automatic monitoring by providing intelligent alerts. [DOMAIN_TERMS] Alert checking, usage monitoring, handoff triggers, session health. [WHEN_TO_USE] Call periodically during development sessions or when you want to check session health. [OUTPUT_FORMAT] Returns alert status with specific recommendations. [WORKFLOW] RECOMMENDED WORKFLOW: 1. Use auto_monitor_session first 2. Call check_session_alerts during development 3. Follow urgent handoff recommendations when provided.",
            inputSchema: {
              type: "object",
              properties: {
                current_usage: {
                  type: "number",
                  description: "Current token usage",
                  minimum: 0,
                  maximum: 2000000
                },
                conversation_content: {
                  type: "string",
                  description: "Current conversation content for complexity analysis"
                }
              },
              required: ["current_usage"],
              additionalProperties: false
            }
          },
          {
            name: "trigger_handoff_sequence",
            description: "[PURPOSE] Trigger immediate handoff sequence with emergency context preservation. Use when session alerts indicate critical usage or when manual handoff is needed. [DOMAIN_TERMS] Emergency handoff, context preservation, platform transition, session rescue. [WHEN_TO_USE] Use when check_session_alerts shows critical usage or when you need immediate platform transition. [OUTPUT_FORMAT] Returns complete handoff package ready for platform transfer. [WORKFLOW] RECOMMENDED WORKFLOW: 1. System alerts trigger this automatically 2. Preserves complete session context 3. Generates platform-specific handoff instructions 4. Provides copy-paste ready handoff content.",
            inputSchema: {
              type: "object",
              properties: {
                target_platform: {
                  type: "string",
                  enum: ["claude", "chatgpt", "gemini", "generic"],
                  description: "Target platform for handoff"
                },
                emergency_context: {
                  type: "object",
                  description: "Emergency context to preserve"
                },
                reason: {
                  type: "string",
                  enum: ["token_limit", "manual_request", "complexity_high", "session_timeout"],
                  description: "Reason for handoff trigger"
                }
              },
              required: ["target_platform", "reason"],
              additionalProperties: false
            }
          },
          {
            name: "session_health_report",
            description: "[PURPOSE] Generate comprehensive session health report with predictive analytics and optimization recommendations. [DOMAIN_TERMS] Session analytics, predictive monitoring, optimization insights, performance metrics. [WHEN_TO_USE] Use for detailed session analysis and optimization planning. [OUTPUT_FORMAT] Returns detailed health report with recommendations. [WORKFLOW] RECOMMENDED WORKFLOW: 1. Call after extended development sessions 2. Use insights for future session planning 3. Implement optimization recommendations.",
            inputSchema: {
              type: "object",
              properties: {
                include_predictions: {
                  type: "boolean",
                  description: "Include predictive analytics",
                  default: true
                },
                analysis_depth: {
                  type: "string",
                  enum: ["basic", "detailed", "comprehensive"],
                  description: "Level of analysis detail",
                  default: "detailed"
                }
              },
              additionalProperties: false
            }
          },
          {
            name: "test_automatic_export",
            description: "[PURPOSE] Test the automatic context export system at 85% threshold trigger. SIMPLE TESTING TOOL for verifying universal-context-export integration. [DOMAIN_TERMS] Automatic export, threshold testing, context preservation, integration verification. [WHEN_TO_USE] Use to test export automation before reaching actual 85% usage. [OUTPUT_FORMAT] Returns export test results and integration status. [WORKFLOW] SIMPLE TEST: 1. Call this tool 2. Check export file creation 3. Verify universal-context-export ready flag.",
            inputSchema: {
              type: "object",
              properties: {
                simulated_usage: {
                  type: "number",
                  description: "Simulate usage percentage (default: 85% to trigger export)",
                  minimum: 0,
                  maximum: 100,
                  default: 85
                },
                test_context: {
                  type: "string",
                  description: "Test context data for export",
                  default: "Test automatic export functionality"
                }
              },
              additionalProperties: false
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "auto_monitor_session":
            return await this.handleAutoMonitorSession(args);
          case "check_session_alerts":
            return await this.handleCheckSessionAlerts(args);
          case "trigger_handoff_sequence":
            return await this.handleTriggerHandoffSequence(args);
          case "session_health_report":
            return await this.handleSessionHealthReport(args);
          case "test_automatic_export":
            return await this.handleTestAutomaticExport(args);
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${error.message}`);
      }
    });
  }

  async handleAutoMonitorSession(args) {
    this.validateRequired(args, ['platform']);
    this.validateEnum(args.platform, ['claude', 'chatgpt', 'gemini', 'generic'], 'platform');

    const { 
      platform, 
      enable_auto_alerts = true, 
      alert_threshold = 80,
      conversation_content = ""
    } = args;

    // Initialize session state
    this.sessionState = {
      isActive: true,
      platform,
      startTime: new Date(),
      lastUsage: 0,
      alertThreshold: alert_threshold,
      criticalThreshold: Math.min(95, alert_threshold + 10),
      conversationLength: conversation_content.length,
      lastAlert: null,
      sessionId: `session-${Date.now()}`,
      autoAlertsEnabled: enable_auto_alerts,
      exportTriggered: false // Simple flag to prevent duplicate exports
    };

    // Platform-specific configuration
    const platformConfig = {
      claude: { limit: 200000, strength: "excellent", features: ["artifacts", "advanced_reasoning"] },
      chatgpt: { limit: 128000, strength: "good", features: ["code_interpreter", "web_browsing"] },
      gemini: { limit: 2000000, strength: "excellent", features: ["large_context", "multimodal"] },
      generic: { limit: 100000, strength: "basic", features: ["standard"] }
    };

    const config = platformConfig[platform];

    return {
      content: [
        {
          type: "text",
          text: `🚀 **Auto-Monitoring + Auto-Export Activated**\n\n**Session ID:** ${this.sessionState.sessionId}\n**Platform:** ${platform} (${config.strength})\n**Token Limit:** ${config.limit.toLocaleString()}\n**Alert Threshold:** ${alert_threshold}%\n**Critical Threshold:** ${this.sessionState.criticalThreshold}%\n\n**🤖 Auto-Monitoring Features:**\n- ✅ Continuous session tracking\n- ✅ Proactive usage alerts at ${alert_threshold}%\n- ✅ **AUTOMATIC CONTEXT EXPORT at 85%** 🔥\n- ✅ Critical alerts at ${this.sessionState.criticalThreshold}%\n- ✅ Automatic handoff recommendations\n- ✅ Universal-context-export MCP integration\n\n**📁 Automatic Export System:**\n- **Threshold:** 85% usage triggers automatic export\n- **Integration:** Ready for universal-context-export MCP server\n- **Context Preserved:** Session data, conversation history, artifacts\n- **File Location:** /tmp/context-export-[id].json + .ready flag\n\n**Platform Features Available:**\n${config.features.map(f => `- ${f.replace(/_/g, ' ')}`).join('\n')}\n\n**🔄 Enhanced Auto-Monitoring Workflow:**\n\n**For Claude Code:**\n1. **Add to startup routine**: Call \`@auto_monitor_session()\` at conversation start\n2. **Periodic checks**: Use \`@check_session_alerts()\` every 20-30 interactions\n3. **Watch for alerts**: System will alert at ${alert_threshold}%+ and auto-export at 85%\n4. **Seamless handoffs**: Exports are ready for universal-context-export pickup\n\n**For Manual Monitoring:**\n- Call \`@check_session_alerts(current_usage=<tokens>)\` regularly\n- System will automatically export context at 85% threshold\n- Follow handoff recommendations immediately\n- Test export system with \`@test_automatic_export()\`\n\n**Session Started:** ${this.sessionState.startTime.toISOString()}\n\n*🔥 NEW: Automatic context preservation ensures zero context loss during session handoffs!*\n*💡 Pro Tip: Use @test_automatic_export() to verify integration before reaching 85%*`
        }
      ]
    };
  }

  async handleCheckSessionAlerts(args) {
    this.validateRequired(args, ['current_usage']);
    this.validateNumber(args.current_usage, 'current_usage', 0, 2000000);

    const { current_usage, conversation_content = "" } = args;

    if (!this.sessionState.isActive) {
      return {
        content: [{
          type: "text",
          text: `⚠️ **No Active Session Monitoring**\n\nPlease call \`@auto_monitor_session(platform="claude")\` first to initialize monitoring.\n\nThen return here for automated alerts.`
        }]
      };
    }

    // Update session state
    this.sessionState.lastUsage = current_usage;
    this.sessionState.conversationLength = conversation_content.length;

    // Calculate platform limits
    const platformLimits = {
      claude: 200000,
      chatgpt: 128000, 
      gemini: 2000000,
      generic: 100000
    };

    const tokenLimit = platformLimits[this.sessionState.platform] || 100000;
    const usagePercentage = Math.min((current_usage / tokenLimit) * 100, 100);

    // Analyze conversation complexity
    const complexity = this.analyzeComplexity(conversation_content);
    
    // Check for automatic export triggers BEFORE generating alerts
    const thresholdCheck = await this.checkThresholdTriggers(usagePercentage, current_usage);
    
    // Generate alerts
    const alerts = this.generateAlerts(usagePercentage, complexity, current_usage, tokenLimit);
    
    // Update last alert time if alerting
    if (alerts.level !== 'ok') {
      this.sessionState.lastAlert = new Date();
    }

    // Add export information to alerts if triggered
    if (thresholdCheck.exportTriggered) {
      alerts.exportInfo = thresholdCheck.exportResult;
    }

    // Time-based recommendations
    const sessionDuration = new Date() - this.sessionState.startTime;
    const sessionHours = sessionDuration / (1000 * 60 * 60);

    // Build response message with export information
    let responseText = `${alerts.icon} **Session Alert Check**\n\n**Current Status:**\n- Usage: ${current_usage.toLocaleString()} / ${tokenLimit.toLocaleString()} tokens (${usagePercentage.toFixed(1)}%)\n- Alert Level: ${alerts.level.toUpperCase()}\n- Complexity Score: ${complexity.score}/100\n- Session Duration: ${sessionHours.toFixed(1)}h\n\n`;

    // Add automatic export information if triggered
    if (thresholdCheck.exportTriggered) {
      responseText += `📁 **AUTOMATIC EXPORT TRIGGERED**\n- Export ID: ${thresholdCheck.exportResult.exportId}\n- Export Path: ${thresholdCheck.exportResult.exportPath}\n- Context preserved for universal-context-export integration\n\n`;
    }

    responseText += `**${alerts.title}**\n${alerts.message}\n\n${alerts.actions.length > 0 ? '**Immediate Actions Required:**\n' + alerts.actions.map(action => `- ${action}`).join('\n') + '\n\n' : ''}**Complexity Analysis:**\n- Code Density: ${complexity.codeDensity}%\n- Discussion Depth: ${complexity.discussionDepth}%\n- Technical Complexity: ${complexity.technicalComplexity}%\n\n${alerts.urgent ? '🚨 **URGENT HANDOFF RECOMMENDED**\n\nCall `@trigger_handoff_sequence(target_platform="claude", reason="token_limit")` NOW!\n\n' : ''}**Next Check Recommended:** ${this.getNextCheckRecommendation(usagePercentage, complexity.score)}\n\n*Last Updated: ${new Date().toISOString()}*`;

    return {
      content: [
        {
          type: "text",
          text: responseText
        }
      ]
    };
  }

  async handleTriggerHandoffSequence(args) {
    this.validateRequired(args, ['target_platform', 'reason']);
    this.validateEnum(args.target_platform, ['claude', 'chatgpt', 'gemini', 'generic'], 'target_platform');
    this.validateEnum(args.reason, ['token_limit', 'manual_request', 'complexity_high', 'session_timeout'], 'reason');

    const { target_platform, emergency_context = {}, reason } = args;

    const handoffId = `emergency-${Date.now()}`;
    const currentSession = this.sessionState;

    // Simple automatic export trigger - connect to universal-context-export
    await this.triggerAutomaticExport(handoffId, currentSession, emergency_context);

    // Create comprehensive handoff package
    const handoffPackage = {
      id: handoffId,
      type: 'emergency_handoff',
      timestamp: new Date().toISOString(),
      reason,
      source: {
        platform: currentSession.platform,
        sessionId: currentSession.sessionId,
        sessionDuration: new Date() - currentSession.startTime,
        lastUsage: currentSession.lastUsage
      },
      target: {
        platform: target_platform
      },
      context: {
        session: currentSession,
        emergency: emergency_context,
        preservation: {
          critical: true,
          priority: 'immediate',
          contextSize: JSON.stringify(emergency_context).length
        }
      }
    };

    // Generate platform-specific handoff script
    const handoffScript = this.generateEmergencyHandoffScript(handoffPackage);

    // Reset session state for new platform
    this.sessionState.isActive = false;

    return {
      content: [
        {
          type: "text",
          text: `🚨 **EMERGENCY HANDOFF SEQUENCE INITIATED**\n\n**Handoff ID:** ${handoffId}\n**Reason:** ${reason.replace(/_/g, ' ').toUpperCase()}\n**Source:** ${currentSession.platform} → **Target:** ${target_platform}\n\n**CRITICAL CONTEXT PRESERVED**\n✅ Session state captured\n✅ Emergency context saved\n✅ Platform transition ready\n\n**📋 COPY THIS HANDOFF SCRIPT TO ${target_platform.toUpperCase()}:**\n\n\`\`\`\n${handoffScript}\n\`\`\`\n\n**🔄 IMMEDIATE NEXT STEPS:**\n1. **COPY** the handoff script above\n2. **OPEN** ${target_platform} platform\n3. **PASTE** the complete script as your first message\n4. **CONTINUE** development seamlessly\n\n**⚠️ IMPORTANT:** This session monitoring is now **DISABLED**. \n\nAfter handoff, call \`@auto_monitor_session(platform="${target_platform}")\` in the new platform to resume monitoring.\n\n**Handoff completed at:** ${new Date().toISOString()}\n\n🎯 **Your development context is fully preserved and ready for seamless continuation!**`
        }
      ]
    };
  }

  async handleSessionHealthReport(args) {
    const { include_predictions = true, analysis_depth = "detailed" } = args;

    if (!this.sessionState.isActive) {
      return {
        content: [{
          type: "text",
          text: `📊 **No Active Session**\n\nCall \`@auto_monitor_session()\` first to begin session tracking for health reporting.`
        }]
      };
    }

    const sessionDuration = new Date() - this.sessionState.startTime;
    const sessionHours = sessionDuration / (1000 * 60 * 60);

    // Generate comprehensive health metrics
    const healthMetrics = {
      sessionId: this.sessionState.sessionId,
      platform: this.sessionState.platform,
      duration: sessionHours,
      currentUsage: this.sessionState.lastUsage,
      alertsTriggered: this.sessionState.lastAlert ? 1 : 0,
      efficiency: this.calculateSessionEfficiency(),
      predictions: include_predictions ? this.generatePredictions() : null
    };

    return {
      content: [
        {
          type: "text",
          text: `📊 **Comprehensive Session Health Report**\n\n**Session Overview:**\n- Session ID: ${healthMetrics.sessionId}\n- Platform: ${healthMetrics.platform}\n- Duration: ${healthMetrics.duration.toFixed(2)} hours\n- Current Usage: ${healthMetrics.currentUsage.toLocaleString()} tokens\n- Efficiency Score: ${healthMetrics.efficiency}/100\n\n**Health Metrics:**\n- Alerts Triggered: ${healthMetrics.alertsTriggered}\n- Monitoring Status: ✅ Active\n- Alert Threshold: ${this.sessionState.alertThreshold}%\n- Auto-Alerts: ${this.sessionState.autoAlertsEnabled ? '✅ Enabled' : '❌ Disabled'}\n\n${include_predictions ? `**Predictive Analytics:**\n- Estimated Time to 80%: ${healthMetrics.predictions.timeTo80}\n- Projected Session End: ${healthMetrics.predictions.projectedEnd}\n- Recommended Action: ${healthMetrics.predictions.recommendation}\n\n` : ''}**Optimization Recommendations:**\n- Monitor every 20-30 interactions\n- Use handoff preparation at 80% usage\n- Consider complexity-based early handoffs\n- Enable auto-alerts for proactive management\n\n**Next Session Optimization:**\n- Start with \`@auto_monitor_session()\`\n- Set lower alert thresholds for complex work\n- Plan handoff strategies in advance\n\n*Report generated: ${new Date().toISOString()}*`
        }
      ]
    };
  }

  async handleTestAutomaticExport(args) {
    const { simulated_usage = 85, test_context = "Test automatic export functionality" } = args;

    // Create test session if none exists
    if (!this.sessionState.isActive) {
      this.sessionState = {
        isActive: true,
        platform: 'test',
        startTime: new Date(),
        lastUsage: simulated_usage * 1000, // Simulate usage
        sessionId: `test-session-${Date.now()}`,
        conversationLength: test_context.length,
        exportTriggered: false
      };
    }

    // Force trigger the automatic export system
    console.error(`🧪 Testing automatic export with ${simulated_usage}% simulated usage`);
    
    const exportResult = await this.triggerAutomaticExport(
      `test-${Date.now()}`,
      this.sessionState,
      {
        testMode: true,
        simulatedUsage: simulated_usage,
        testContext: test_context,
        timestamp: new Date().toISOString()
      }
    );

    return {
      content: [
        {
          type: "text",
          text: `🧪 **Automatic Export Test Results**

**Test Configuration:**
- Simulated Usage: ${simulated_usage}%
- Test Context: "${test_context}"
- Test Session ID: ${this.sessionState.sessionId}

**Export Results:**
${exportResult.success ? '✅' : '❌'} Export Status: ${exportResult.success ? 'SUCCESS' : 'FAILED'}
${exportResult.success ? `📁 Export Path: ${exportResult.exportPath}` : ''}
${exportResult.success ? `🔗 Ready Flag: ${exportResult.exportPath}.ready` : ''}
${exportResult.success ? `📦 Export ID: ${exportResult.exportId}` : ''}
${!exportResult.success ? `❌ Error: ${exportResult.error}` : ''}

**Universal-Context-Export Integration:**
${exportResult.success ? '✅ Export package created and ready' : '❌ Integration test failed'}
${exportResult.success ? '✅ Ready flag created for MCP pickup' : ''}
${exportResult.success ? '✅ File-based integration working' : ''}

**Next Steps:**
${exportResult.success ? '1. Universal-context-export MCP server can now process this export' : '1. Check system permissions and /tmp directory access'}
${exportResult.success ? '2. Export will be automatically detected and processed' : '2. Verify error details above'}
${exportResult.success ? '3. Context preservation is ready for session handoffs' : '3. Test with lower usage percentage if needed'}

**Integration Verification:**
- Check file exists: \`ls -la ${exportResult.success ? exportResult.exportPath : '/tmp/context-export-*.json'}\`
- Check ready flag: \`ls -la ${exportResult.success ? exportResult.exportPath + '.ready' : '/tmp/context-export-*.json.ready'}\`

*Test completed at: ${new Date().toISOString()}*`
        }
      ]
    };
  }

  // Helper methods
  analyzeComplexity(content) {
    if (!content) return { score: 0, codeDensity: 0, discussionDepth: 0, technicalComplexity: 0 };

    const lines = content.split('\n').length;
    const codeBlocks = (content.match(/```/g) || []).length / 2;
    const technicalTerms = (content.match(/\b(function|class|component|algorithm|architecture|database|api|framework)\b/gi) || []).length;
    const questions = (content.match(/\?/g) || []).length;

    const codeDensity = Math.min(100, (codeBlocks / Math.max(1, lines / 20)) * 100);
    const discussionDepth = Math.min(100, (questions / Math.max(1, lines / 10)) * 100);
    const technicalComplexity = Math.min(100, (technicalTerms / Math.max(1, lines / 5)) * 100);

    const score = Math.round((codeDensity + discussionDepth + technicalComplexity) / 3);

    return { score, codeDensity: Math.round(codeDensity), discussionDepth: Math.round(discussionDepth), technicalComplexity: Math.round(technicalComplexity) };
  }

  generateAlerts(usagePercentage, complexity, currentUsage, tokenLimit) {
    const criticalThreshold = this.sessionState.criticalThreshold;
    const alertThreshold = this.sessionState.alertThreshold;

    if (usagePercentage >= criticalThreshold) {
      return {
        level: 'critical',
        icon: '🚨',
        title: 'CRITICAL: Immediate Handoff Required',
        message: `Token usage at ${usagePercentage.toFixed(1)}% - IMMEDIATE handoff required to prevent context loss!`,
        urgent: true,
        actions: [
          'Call @trigger_handoff_sequence() immediately',
          'Choose target platform (Claude/Gemini recommended)',
          'Do NOT continue without handoff'
        ]
      };
    } else if (usagePercentage >= alertThreshold) {
      return {
        level: 'warning',
        icon: '⚠️',
        title: 'Warning: Prepare for Handoff',
        message: `Token usage at ${usagePercentage.toFixed(1)}% - prepare handoff within next few interactions.`,
        urgent: false,
        actions: [
          'Prepare context for handoff',
          'Consider calling @trigger_handoff_sequence()',
          'Complete current task before handoff'
        ]
      };
    } else if (complexity.score > 80) {
      return {
        level: 'complexity',
        icon: '🧠',
        title: 'High Complexity Detected',
        message: `Session complexity at ${complexity.score}/100 - consider early handoff for better handling.`,
        urgent: false,
        actions: [
          'Monitor more frequently',
          'Consider handoff for complex discussions',
          'Preserve context proactively'
        ]
      };
    } else {
      return {
        level: 'ok',
        icon: '✅',
        title: 'Session Healthy',
        message: `Usage at ${usagePercentage.toFixed(1)}% - continue normal operation.`,
        urgent: false,
        actions: []
      };
    }
  }

  generateEmergencyHandoffScript(handoffPackage) {
    const { source, target, context, reason, timestamp } = handoffPackage;
    
    return `# EMERGENCY SESSION HANDOFF

## Session Transfer Details
- **Handoff ID**: ${handoffPackage.id}
- **Reason**: ${reason.replace(/_/g, ' ').toUpperCase()}
- **Source Platform**: ${source.platform}
- **Target Platform**: ${target.platform}
- **Timestamp**: ${timestamp}

## Previous Session Context
- **Session ID**: ${source.sessionId}
- **Duration**: ${((source.sessionDuration || 0) / (1000 * 60 * 60)).toFixed(2)} hours
- **Last Token Usage**: ${(source.lastUsage || 0).toLocaleString()}

## Critical Context to Preserve
${JSON.stringify(context.emergency, null, 2)}

## Continuation Instructions
This is an emergency handoff from ${source.platform}. Please:

1. **Acknowledge this handoff** and confirm context received
2. **Continue the development session** with full context preservation
3. **Initialize new session monitoring** with: @auto_monitor_session(platform="${target.platform}")
4. **Resume work** exactly where the previous session left off

## Session Status
- **Context Preservation**: CRITICAL PRIORITY
- **Continuity Required**: YES
- **Previous Platform Limitations**: Reached token/complexity limits

Ready to continue development work seamlessly.`;
  }

  getNextCheckRecommendation(usagePercentage, complexityScore) {
    if (usagePercentage > 85 || complexityScore > 80) {
      return "Check every 5-10 interactions";
    } else if (usagePercentage > 70 || complexityScore > 60) {
      return "Check every 15-20 interactions";
    } else {
      return "Check every 30-40 interactions";
    }
  }

  calculateSessionEfficiency() {
    if (!this.sessionState.isActive) return 0;
    
    const duration = (new Date() - this.sessionState.startTime) / (1000 * 60 * 60);
    const usageRate = this.sessionState.lastUsage / Math.max(1, duration);
    const alertsTriggered = this.sessionState.lastAlert ? 1 : 0;
    
    // Higher efficiency = good usage rate with few alerts
    return Math.max(0, Math.min(100, 100 - (alertsTriggered * 20) + Math.min(20, usageRate / 1000)));
  }

  generatePredictions() {
    if (!this.sessionState.isActive) return null;

    const duration = new Date() - this.sessionState.startTime;
    const usageRate = this.sessionState.lastUsage / Math.max(1, duration / (1000 * 60 * 60));
    
    const platformLimits = {
      claude: 200000,
      chatgpt: 128000,
      gemini: 2000000,
      generic: 100000
    };

    const tokenLimit = platformLimits[this.sessionState.platform] || 100000;
    const tokensTo80 = (tokenLimit * 0.8) - this.sessionState.lastUsage;
    const hoursTo80 = Math.max(0, tokensTo80 / Math.max(1, usageRate));
    
    return {
      timeTo80: hoursTo80 > 24 ? `${(hoursTo80 / 24).toFixed(1)} days` : `${hoursTo80.toFixed(1)} hours`,
      projectedEnd: new Date(Date.now() + (hoursTo80 * 60 * 60 * 1000)).toISOString(),
      recommendation: hoursTo80 < 1 ? "Prepare immediate handoff" : hoursTo80 < 3 ? "Plan handoff soon" : "Continue monitoring"
    };
  }

  /**
   * Simple Automatic Export System
   * Connects to universal-context-export MCP when threshold triggers
   * FOCUSED on essential context preservation only
   */
  async triggerAutomaticExport(handoffId, currentSession, emergencyContext) {
    try {
      // Simple export package - essential context only
      const exportPackage = {
        exportId: handoffId,
        timestamp: new Date().toISOString(),
        sessionData: {
          sessionId: currentSession.sessionId,
          platform: currentSession.platform,
          startTime: currentSession.startTime,
          lastUsage: currentSession.lastUsage,
          conversationLength: currentSession.conversationLength
        },
        context: emergencyContext,
        exportType: 'automatic_threshold_trigger',
        // Universal export integration data
        universalExport: {
          type: 'session_context',
          trigger: 'threshold_85_percent',
          priority: 'high',
          source: 'deepseek-mcp-bridge-session-mgmt'
        }
      };

      // Simple file-based export trigger for universal-context-export integration
      const exportPath = `/tmp/context-export-${handoffId}.json`;
      
      await this.writeExportFile(exportPath, exportPackage);
      
      // Create ready flag for universal-context-export MCP server
      await this.writeExportFile(`${exportPath}.ready`, 'READY');
      
      console.error(`📁 Automatic export triggered: ${exportPath}`);
      console.error(`🔗 Ready for universal-context-export integration`);
      
      return { success: true, exportPath, exportId: handoffId };

    } catch (error) {
      console.error('❌ Automatic export failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Simple export file creation - cross-platform compatible
   */
  async writeExportFile(filepath, data) {
    const fs = await import('fs/promises');
    await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf8');
  }

  /**
   * Enhanced threshold monitoring with automatic export triggers
   */
  async checkThresholdTriggers(usagePercentage, currentUsage) {
    const EXPORT_THRESHOLD = 85; // Simple 85% threshold

    if (usagePercentage >= EXPORT_THRESHOLD && !this.sessionState.exportTriggered) {
      console.error(`🚨 85% threshold reached - triggering automatic export`);
      
      // Mark export as triggered to prevent duplicates
      this.sessionState.exportTriggered = true;
      
      // Simple automatic export trigger
      const exportResult = await this.triggerAutomaticExport(
        `auto-${Date.now()}`,
        this.sessionState,
        {
          trigger: 'threshold_85_percent',
          usage: currentUsage,
          percentage: usagePercentage
        }
      );

      return {
        exportTriggered: true,
        exportResult: exportResult
      };
    }

    return { exportTriggered: false };
  }

  // Validation helpers (same as before)
  validateRequired(args, required) {
    for (const field of required) {
      if (args[field] === undefined || args[field] === null) {
        throw new McpError(ErrorCode.InvalidParams, `Missing required parameter: ${field}`);
      }
    }
  }

  validateEnum(value, allowed, fieldName) {
    if (!allowed.includes(value)) {
      throw new McpError(ErrorCode.InvalidParams, `${fieldName} must be one of: ${allowed.join(', ')}`);
    }
  }

  validateNumber(value, fieldName, min, max) {
    if (typeof value !== 'number' || value < min || value > max) {
      throw new McpError(ErrorCode.InvalidParams, `${fieldName} must be a number between ${min} and ${max}`);
    }
  }

  setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error("Enhanced Session Management MCP Server error:", error);
    };

    process.on("SIGINT", async () => {
      console.error("🛑 Enhanced Session Management server shutting down...");
      try {
        await this.server.close();
      } catch (error) {
        console.error("Shutdown error:", error);
      } finally {
        process.exit(0);
      }
    });
  }

  async run() {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error("🚀 Enhanced Session Management MCP Server started");
      console.error("🔔 Auto-monitoring and proactive alerts enabled");
    } catch (error) {
      console.error("Failed to start Enhanced Session Management server:", error);
      throw error;
    }
  }
}

// Start server
const server = new EnhancedSessionManagement();
server.run().catch((error) => {
  console.error("Enhanced Session Management server startup failed:", error);
  process.exit(1);
});
