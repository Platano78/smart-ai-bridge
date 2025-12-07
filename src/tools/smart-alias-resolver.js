/**
 * @fileoverview SmartAliasResolver - Intelligent tool alias resolution
 * @module tools/smart-alias-resolver
 *
 * Single source of truth for all tools with intelligent alias routing
 * Extracted from server-mecha-king-ghidorah-complete.js (lines 471-1040)
 */

import { CORE_TOOL_DEFINITIONS, ALIAS_GROUP_DEFINITIONS } from './tool-definitions.js';

/**
 * @typedef {Object} ResolvedTool
 * @property {string} name - Tool name
 * @property {string} handler - Handler function name
 * @property {Object} schema - Input schema
 * @property {string} description - Tool description
 */

class SmartAliasResolver {
  constructor() {
    /** @type {Map<string, Object>} */
    this.coreTools = new Map();

    /** @type {Map<string, Object>} */
    this.aliasGroups = new Map();

    /** @type {Map<string, string>} */
    this.toolHandlers = new Map();

    /** @type {Map<string, Object>} */
    this.aliasSchemas = new Map();

    console.error('🎯 SmartAliasResolver initialized');
    this.initializeCoreTools();
    this.initializeAliasGroups();
  }

  /**
   * Initialize core tools from definitions
   * @private
   */
  initializeCoreTools() {
    CORE_TOOL_DEFINITIONS.forEach(tool => {
      this.coreTools.set(tool.name, tool);
      this.toolHandlers.set(tool.name, tool.handler);
    });

    console.error(`🎯 Initialized ${CORE_TOOL_DEFINITIONS.length} core tools`);
  }

  /**
   * Initialize alias groups and create handler mappings
   * @private
   */
  initializeAliasGroups() {
    ALIAS_GROUP_DEFINITIONS.forEach(group => {
      this.aliasGroups.set(group.groupName, group);

      group.aliases.forEach(alias => {
        // Map alias to appropriate handler
        if (alias.coreTool === 'analyze') {
          this.toolHandlers.set(alias.alias, 'handleAnalyze');
        } else if (alias.coreTool === 'generate') {
          this.toolHandlers.set(alias.alias, 'handleGenerate');
        } else {
          // Use core tool handler for direct mappings
          const coreTool = this.coreTools.get(alias.coreTool);
          if (coreTool) {
            this.toolHandlers.set(alias.alias, coreTool.handler);
          }
        }

        // Store custom schema if provided
        if (alias.customSchema) {
          this.aliasSchemas.set(alias.alias, {
            description: alias.customDescription,
            schema: alias.customSchema
          });
        }
      });
    });

    console.error(`🔗 Initialized ${ALIAS_GROUP_DEFINITIONS.length} alias groups with smart routing`);
  }

  /**
   * Generate complete tool list for ListToolsRequestSchema
   * @returns {Array<{name: string, description: string, inputSchema: Object}>}
   */
  generateToolList() {
    const tools = [];

    // Add ONLY core tools for ListToolsRequestSchema
    for (const [name, tool] of this.coreTools) {
      tools.push({
        name,
        description: tool.description,
        inputSchema: tool.schema
      });
    }

    return tools;
  }

  /**
   * Generate full tool list including aliases
   * @returns {Array<{name: string, description: string, inputSchema: Object}>}
   */
  generateFullToolList() {
    const tools = this.generateToolList();

    // Add alias tools
    for (const [groupName, group] of this.aliasGroups) {
      for (const alias of group.aliases) {
        const aliasInfo = this.aliasSchemas.get(alias.alias);
        if (aliasInfo) {
          tools.push({
            name: alias.alias,
            description: aliasInfo.description,
            inputSchema: aliasInfo.schema
          });
        } else {
          // Use core tool schema for simple aliases
          const coreTool = this.coreTools.get(alias.coreTool);
          if (coreTool) {
            tools.push({
              name: alias.alias,
              description: `${group.description} ${coreTool.description}`,
              inputSchema: coreTool.schema
            });
          }
        }
      }
    }

    return tools;
  }

  /**
   * Resolve tool name to handler
   * @param {string} toolName - Tool name or alias
   * @returns {string|null} Handler function name
   */
  resolveToolHandler(toolName) {
    return this.toolHandlers.get(toolName) || null;
  }

  /**
   * Get tool schema
   * @param {string} toolName - Tool name or alias
   * @returns {Object|null} Tool schema
   */
  getToolSchema(toolName) {
    // Check core tools first
    const coreTool = this.coreTools.get(toolName);
    if (coreTool) {
      return coreTool.schema;
    }

    // Check aliases
    const aliasInfo = this.aliasSchemas.get(toolName);
    if (aliasInfo) {
      return aliasInfo.schema;
    }

    // Check if alias maps to core tool
    for (const [groupName, group] of this.aliasGroups) {
      const alias = group.aliases.find(a => a.alias === toolName);
      if (alias) {
        const coreTool = this.coreTools.get(alias.coreTool);
        if (coreTool) {
          return coreTool.schema;
        }
      }
    }

    return null;
  }

  /**
   * Check if tool exists
   * @param {string} toolName - Tool name or alias
   * @returns {boolean}
   */
  hasTools(toolName) {
    return this.toolHandlers.has(toolName);
  }

  /**
   * Get core tool by name
   * @param {string} name - Core tool name
   * @returns {Object|undefined}
   */
  getCoreTool(name) {
    return this.coreTools.get(name);
  }

  /**
   * Get all core tool names
   * @returns {string[]}
   */
  getCoreToolNames() {
    return Array.from(this.coreTools.keys());
  }

  /**
   * Get all alias names
   * @returns {string[]}
   */
  getAliasNames() {
    const aliases = [];
    for (const [groupName, group] of this.aliasGroups) {
      for (const alias of group.aliases) {
        aliases.push(alias.alias);
      }
    }
    return aliases;
  }

  /**
   * Get system statistics
   * @returns {{coreTools: number, aliases: number, totalTools: number, aliasGroups: number, compressionRatio: string}}
   */
  getSystemStats() {
    const coreToolCount = this.coreTools.size;
    const aliasCount = Array.from(this.aliasGroups.values())
      .reduce((total, group) => total + group.aliases.length, 0);

    return {
      coreTools: coreToolCount,
      aliases: aliasCount,
      totalTools: coreToolCount + aliasCount,
      aliasGroups: this.aliasGroups.size,
      compressionRatio: `${Math.round((aliasCount / (coreToolCount + aliasCount)) * 100)}% aliases auto-generated`
    };
  }

  /**
   * Resolve a tool call to its normalized form
   * @param {string} toolName - Tool name or alias
   * @param {Object} args - Tool arguments
   * @returns {{handler: string, args: Object, originalTool: string, isAlias: boolean}|null}
   */
  resolveToolCall(toolName, args) {
    const handler = this.resolveToolHandler(toolName);
    if (!handler) {
      return null;
    }

    const isAlias = !this.coreTools.has(toolName);

    return {
      handler,
      args,
      originalTool: toolName,
      isAlias
    };
  }
}

export { SmartAliasResolver };
