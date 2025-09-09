#!/usr/bin/env node

/**
 * Production Session Management MCP Server
 * Simplified, reliable, Claude Code/Desktop compatible
 * MCP 2025-06-18 specification compliant
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

class ProductionSessionManagement {
  constructor() {
    this.server = new Server(
      {
        name: "session-management",
        version: "2.1.0",
        description: "Production session management for Claude Code and Claude Desktop"
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "monitor_session_health",
            description: "[PURPOSE] Monitor session health with real-time token tracking and platform optimization for seamless development workflow. [DOMAIN_TERMS] Token usage, context limits, session continuity, platform handoff. [WHEN_TO_USE] Use when approaching token limits or need session health assessment. [OUTPUT_FORMAT] Returns JSON with usage analysis, recommendations, and health metrics. [WORKFLOW] RECOMMENDED WORKFLOW: 1. Call monitor_session_health to check current status 2. If usage >80%, use preserve_development_context 3. If handoff needed, use generate_platform_handoff.",
            inputSchema: {
              type: "object",
              properties: {
                platform: {
                  type: "string",
                  enum: ["claude", "chatgpt", "gemini", "generic"],
                  description: "Target AI platform for monitoring"
                },
                current_usage: {
                  type: "number",
                  description: "Current token usage",
                  minimum: 0,
                  maximum: 1000000
                },
                conversation_content: {
                  type: "string",
                  description: "Current conversation content for analysis (optional)"
                },
                session_data: {
                  type: "object",
                  description: "Additional session metadata (optional)"
                }
              },
              required: ["platform", "current_usage"],
              additionalProperties: false
            }
          },
          {
            name: "preserve_development_context",
            description: "[PURPOSE] Preserve comprehensive development context for seamless platform handoffs and session continuity. [DOMAIN_TERMS] Context preservation, session state, development artifacts, cross-platform compatibility. [WHEN_TO_USE] Use before switching platforms or when context is critical to preserve. [OUTPUT_FORMAT] Returns preserved context package with metadata. [WORKFLOW] RECOMMENDED WORKFLOW: 1. Monitor session health first 2. Use preserve_development_context when usage >80% 3. Store returned package for handoff or recovery.",
            inputSchema: {
              type: "object",
              properties: {
                target_platform: {
                  type: "string",
                  enum: ["claude", "chatgpt", "gemini", "generic"],
                  description: "Target platform for context preservation"
                },
                context_data: {
                  type: "object",
                  description: "Current development context to preserve"
                }
              },
              required: ["target_platform"],
              additionalProperties: false
            }
          },
          {
            name: "generate_platform_handoff",
            description: "[PURPOSE] Generate optimized platform handoff package for seamless AI platform transitions. [DOMAIN_TERMS] Platform migration, context transfer, session handoff, cross-platform development. [WHEN_TO_USE] Use when switching between AI platforms while preserving development context. [OUTPUT_FORMAT] Returns handoff package with platform-specific instructions. [WORKFLOW] RECOMMENDED WORKFLOW: 1. Monitor session health 2. Preserve context if needed 3. Generate platform handoff with source and target platforms 4. Use returned handoff package for seamless transition.",
            inputSchema: {
              type: "object",
              properties: {
                source_platform: {
                  type: "string",
                  enum: ["claude", "chatgpt", "gemini", "generic"]
                },
                target_platform: {
                  type: "string",
                  enum: ["claude", "chatgpt", "gemini", "generic"]
                },
                handoff_context: {
                  type: "object",
                  description: "Context data for handoff generation"
                }
              },
              required: ["source_platform", "target_platform"],
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
          case "monitor_session_health":
            return await this.handleMonitorSessionHealth(args);
          case "preserve_development_context":
            return await this.handlePreserveDevelopmentContext(args);
          case "generate_platform_handoff":
            return await this.handleGeneratePlatformHandoff(args);
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

  async handleMonitorSessionHealth(args) {
    // Input validation
    this.validateRequired(args, ['platform', 'current_usage']);
    this.validateEnum(args.platform, ['claude', 'chatgpt', 'gemini', 'generic'], 'platform');
    this.validateNumber(args.current_usage, 'current_usage', 0, 1000000);

    const { platform, current_usage, conversation_content, session_data = {} } = args;

    // Calculate usage metrics
    const platformLimits = {
      claude: 200000,
      chatgpt: 128000,
      gemini: 2000000,
      generic: 100000
    };

    const tokenLimit = platformLimits[platform] || 100000;
    const usagePercentage = Math.min((current_usage / tokenLimit) * 100, 100);
    const thresholdExceeded = usagePercentage > 80;

    // Analyze conversation complexity if provided
    let complexity = 0;
    let patterns = [];
    if (conversation_content) {
      const lines = conversation_content.split('\n').length;
      const codeBlocks = (conversation_content.match(/```/g) || []).length / 2;
      const questions = (conversation_content.match(/\?/g) || []).length;
      
      complexity = Math.min(100, (lines / 10) + (codeBlocks * 5) + questions);
      
      if (codeBlocks > 5) patterns.push('code_heavy');
      if (questions > 10) patterns.push('iterative_discussion');
      if (lines > 100) patterns.push('extended_session');
    }

    // Generate recommendations
    const recommendations = [];
    if (usagePercentage > 85) {
      recommendations.push({
        type: "urgent",
        message: "Context usage critical - immediate handoff recommended",
        action: "preserve_development_context"
      });
    } else if (usagePercentage > 70) {
      recommendations.push({
        type: "warning", 
        message: "Context usage high - consider handoff preparation",
        action: "monitor_closely"
      });
    }

    if (complexity > 80) {
      recommendations.push({
        type: "complexity",
        message: "High session complexity detected - context preservation recommended",
        action: "preserve_development_context"
      });
    }

    return {
      content: [
        {
          type: "text",
          text: `🔍 **Session Health Monitoring**\n\n**Platform:** ${platform}\n**Token Usage:** ${current_usage.toLocaleString()} / ${tokenLimit.toLocaleString()} (${usagePercentage.toFixed(1)}%)\n**Status:** ${thresholdExceeded ? '🔴 Critical' : usagePercentage > 70 ? '🟡 Warning' : '🟢 Healthy'}\n\n**Analysis:**\n- Complexity Score: ${complexity.toFixed(1)}/100\n- Patterns: ${patterns.join(', ') || 'standard_conversation'}\n- Session ID: session-${Date.now()}\n\n**Recommendations:**\n${recommendations.map(r => `- **${r.type.toUpperCase()}**: ${r.message}`).join('\n')}\n\n**Next Actions:**\n${recommendations.length > 0 ? recommendations.map(r => `- Use tool: ${r.action}`).join('\n') : '- Continue normal operation'}\n\n*Monitoring active - call again for updated metrics*`
        }
      ]
    };
  }

  async handlePreserveDevelopmentContext(args) {
    this.validateRequired(args, ['target_platform']);
    this.validateEnum(args.target_platform, ['claude', 'chatgpt', 'gemini', 'generic'], 'target_platform');

    const { target_platform, context_data = {} } = args;
    const preservationId = `preserve-${Date.now()}`;

    // Create preservation package
    const preservationPackage = {
      id: preservationId,
      targetPlatform: target_platform,
      timestamp: new Date().toISOString(),
      contextData: context_data,
      metadata: {
        preservationMethod: 'json_structured',
        compatibility: ['claude', 'chatgpt', 'gemini'],
        version: '2.1.0'
      }
    };

    // Calculate preservation quality score
    const qualityFactors = {
      hasCodeContext: context_data.code ? 20 : 0,
      hasConversationHistory: context_data.conversation ? 20 : 0,
      hasProjectContext: context_data.project ? 20 : 0,
      hasDecisions: context_data.decisions ? 20 : 0,
      hasGoals: context_data.goals ? 20 : 0
    };

    const qualityScore = Object.values(qualityFactors).reduce((sum, score) => sum + score, 0);

    return {
      content: [
        {
          type: "text",
          text: `💾 **Development Context Preserved**\n\n**Preservation ID:** ${preservationId}\n**Target Platform:** ${target_platform}\n**Quality Score:** ${qualityScore}/100\n\n**Package Contents:**\n- Context Data: ${Object.keys(context_data).length} fields\n- Compatibility: Universal format\n- Format: Structured JSON\n\n**Quality Assessment:**\n${Object.entries(qualityFactors).map(([factor, score]) => `- ${factor.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${score > 0 ? '✅' : '❌'} (${score}pts)`).join('\n')}\n\n**Next Steps:**\n1. Use \`generate_platform_handoff\` for platform-specific transition\n2. Package is ready for manual transfer if needed\n3. Preservation timestamp: ${new Date().toISOString()}\n\n**Preserved Package:**\n\`\`\`json\n${JSON.stringify(preservationPackage, null, 2)}\n\`\`\``
        }
      ]
    };
  }

  async handleGeneratePlatformHandoff(args) {
    this.validateRequired(args, ['source_platform', 'target_platform']);
    this.validateEnum(args.source_platform, ['claude', 'chatgpt', 'gemini', 'generic'], 'source_platform');
    this.validateEnum(args.target_platform, ['claude', 'chatgpt', 'gemini', 'generic'], 'target_platform');

    const { source_platform, target_platform, handoff_context = {} } = args;
    const handoffId = `handoff-${Date.now()}`;

    // Platform-specific instructions
    const platformInstructions = {
      claude: {
        contextFormat: "Use detailed technical discussion format with structured thinking",
        bestPractices: ["Include complete code context", "Maintain conversation thread", "Use artifacts for substantial content"],
        limitations: "200k token context window"
      },
      chatgpt: {
        contextFormat: "Use clear system message with structured context",
        bestPractices: ["Break complex tasks into steps", "Use code interpreter for analysis", "Maintain session continuity"],
        limitations: "128k token context window"
      },
      gemini: {
        contextFormat: "Use comprehensive context with multimedia support",
        bestPractices: ["Leverage large context window", "Include visual elements", "Use structured prompts"],
        limitations: "2M token context window"
      },
      generic: {
        contextFormat: "Use standard markdown format with clear structure",
        bestPractices: ["Keep context concise", "Use universal formatting", "Include essential information only"],
        limitations: "Variable token limits"
      }
    };

    const sourceInfo = platformInstructions[source_platform];
    const targetInfo = platformInstructions[target_platform];

    // Generate handoff package
    const handoffPackage = {
      id: handoffId,
      sourcePlatform: source_platform,
      targetPlatform: target_platform,
      timestamp: new Date().toISOString(),
      context: handoff_context,
      instructions: {
        source: sourceInfo,
        target: targetInfo,
        transition: `Transitioning from ${source_platform} to ${target_platform}`
      },
      handoffScript: this.generateHandoffScript(source_platform, target_platform, handoff_context)
    };

    // Calculate handoff quality
    const qualityScore = this.calculateHandoffQuality(source_platform, target_platform, handoff_context);

    return {
      content: [
        {
          type: "text",
          text: `🔄 **Platform Handoff Generated**\n\n**Handoff ID:** ${handoffId}\n**Transition:** ${source_platform} → ${target_platform}\n**Quality Score:** ${qualityScore}/100\n\n**Source Platform (${source_platform}):**\n- Context Format: ${sourceInfo.contextFormat}\n- Limitations: ${sourceInfo.limitations}\n\n**Target Platform (${target_platform}):**\n- Context Format: ${targetInfo.contextFormat}\n- Limitations: ${targetInfo.limitations}\n\n**Handoff Instructions:**\n${targetInfo.bestPractices.map(practice => `- ${practice}`).join('\n')}\n\n**Ready-to-Use Handoff Script:**\n\`\`\`\n${handoffPackage.handoffScript}\n\`\`\`\n\n**Complete Handoff Package:**\n\`\`\`json\n${JSON.stringify(handoffPackage, null, 2)}\n\`\`\`\n\n✅ **Handoff package ready for platform transition**`
        }
      ]
    };
  }

  generateHandoffScript(source, target, context) {
    const contextSummary = Object.keys(context).length > 0 
      ? `Context includes: ${Object.keys(context).join(', ')}`
      : 'Minimal context provided';

    return `# Development Session Handoff

## Transition: ${source} → ${target}

## Context Summary
${contextSummary}

## Previous Session State
- Source Platform: ${source}
- Session Goals: ${context.goals || 'Continue development work'}
- Key Decisions: ${context.decisions || 'None specified'}

## Context for ${target}
${JSON.stringify(context, null, 2)}

## Instructions for ${target}
Continue the development session with full context preservation. 
Key focus areas: ${context.focus || 'general development'}

Session handoff completed at: ${new Date().toISOString()}`;
  }

  calculateHandoffQuality(source, target, context) {
    let quality = 60; // Base quality

    // Platform compatibility
    if (source === target) quality -= 20; // Same platform reduces quality
    if (target === 'claude' || target === 'gemini') quality += 15; // Better target platforms
    
    // Context richness
    quality += Object.keys(context).length * 5; // 5 points per context field
    
    // Specific context types
    if (context.code) quality += 10;
    if (context.conversation) quality += 10;
    if (context.goals) quality += 10;
    if (context.decisions) quality += 10;
    
    return Math.min(100, Math.max(0, quality));
  }

  // Validation helpers
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
      console.error("Session Management MCP Server error:", error);
    };

    process.on("SIGINT", async () => {
      console.error("🛑 Session Management server shutting down...");
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
      console.error("🚀 Production Session Management MCP Server started");
      console.error("📊 Ready for session monitoring and platform handoffs");
    } catch (error) {
      console.error("Failed to start Session Management server:", error);
      throw error;
    }
  }
}

// Start server
const server = new ProductionSessionManagement();
server.run().catch((error) => {
  console.error("Session Management server startup failed:", error);
  process.exit(1);
});
