// FILE ENHANCEMENT TOOLS FOR DEEPSEEK MCP BRIDGE
// Add these tools to your existing server.js ListToolsRequestSchema

const fileEnhancedTools = [
  {
    name: 'analyze_file_with_deepseek',
    description: 'Read a specific file and send it to DeepSeek for analysis, code review, or improvement suggestions. Handles all common code file types.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { 
          type: 'string', 
          description: 'Path to the file to analyze (relative to project root or absolute)' 
        },
        analysis_type: {
          type: 'string',
          enum: ['review', 'debug', 'improve', 'explain', 'optimize'],
          description: 'Type of analysis to perform on the file'
        },
        focus_area: {
          type: 'string',
          description: 'Specific area to focus on (e.g., "error handling", "performance", "security")'
        }
      },
      required: ['file_path']
    }
  },
  {
    name: 'analyze_project_with_deepseek', 
    description: 'Analyze multiple files from your project with DeepSeek. Automatically filters and chunks content to fit within 32K context window.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to project directory to analyze'
        },
        file_patterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'File patterns to include (e.g., ["*.js", "*.ts", "*.jsx"])',
          default: ['*.js', '*.ts', '*.jsx', '*.tsx']
        },
        analysis_goal: {
          type: 'string',
          description: 'What you want to achieve with the analysis (e.g., "find bugs", "improve architecture", "optimize performance")'
        },
        max_files: {
          type: 'number',
          description: 'Maximum number of files to analyze in one request',
          default: 5
        }
      },
      required: ['project_path', 'analysis_goal']
    }
  },
  {
    name: 'deepseek_code_modification',
    description: 'Have DeepSeek suggest specific code modifications for a file, with the ability to apply changes.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to file that needs modification'
        },
        modification_request: {
          type: 'string',
          description: 'Specific changes you want DeepSeek to make or suggest'
        },
        apply_changes: {
          type: 'boolean',
          description: 'Whether to apply suggested changes automatically (false = suggestions only)',
          default: false
        },
        backup_original: {
          type: 'boolean',
          description: 'Create backup of original file before modifications',
          default: true
        }
      },
      required: ['file_path', 'modification_request']
    }
  }
];

// FILE OPERATION HANDLERS
// Add these to your existing CallToolRequestSchema handler

const fileHandlers = {
  'analyze_file_with_deepseek': async (args) => {
    // Read the file
    const fileResult = await bridge.readFile(args.file_path);
    
    if (!fileResult.success) {
      throw new Error(`Cannot read file: ${fileResult.error}`);
    }

    // Prepare DeepSeek prompt with file context
    const analysisPrompt = `
# File Analysis Request

**File**: ${args.file_path}
**Analysis Type**: ${args.analysis_type || 'general review'}
**Focus Area**: ${args.focus_area || 'overall code quality'}

**File Content**:
\`\`\`${fileResult.extension.substring(1)}
${fileResult.content}
\`\`\`

**Instructions**: 
${getAnalysisInstructions(args.analysis_type)}
${args.focus_area ? `Focus specifically on: ${args.focus_area}` : ''}

Provide specific, actionable feedback with line numbers when relevant.
    `;

    // Send to DeepSeek
    const result = await bridge.queryDeepseek(analysisPrompt, {
      task_type: 'coding'
    });

    return {
      content: [{
        type: 'text',
        text: `**DeepSeek Analysis of ${args.file_path}**\n\n${result.response}\n\n*File size: ${fileResult.size} bytes | Last modified: ${fileResult.lastModified}*`
      }]
    };
  },

  'analyze_project_with_deepseek': async (args) => {
    // Get project structure
    const projectFiles = await getProjectFiles(args.project_path, args.file_patterns);
    
    // Limit files to respect context window
    const filesToAnalyze = projectFiles.slice(0, args.max_files || 5);
    
    // Read and combine file contents
    let combinedContent = `# Project Analysis Request\n\n**Goal**: ${args.analysis_goal}\n**Project**: ${args.project_path}\n\n`;
    
    for