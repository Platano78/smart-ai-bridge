#!/usr/bin/env node

/**
 * ╰( ͡° ͜ʖ ͡° )þ──☆ SIMPLE BRIDGE FIX
 * Patches the performance optimizer initialization issue with minimal changes
 */

import fs from 'fs/promises';

async function applySimpleFix() {
    console.log('╰( ͡° ͜ʖ ͡° )þ──☆ APPLYING SIMPLE BRIDGE QUALITY FIX');
    console.log('═'.repeat(60));
    
    try {
        // Read the current server.js
        const serverContent = await fs.readFile('server.js', 'utf-8');
        console.log('📖 Current server.js read successfully');
        
        // Simple fix: Replace the hard error with a graceful fallback
        const fixedContent = serverContent.replace(
            `    // ⚡ SAFETY CHECK: Ensure performance optimizer is initialized
    if (!performanceOptimizer) {
      throw new Error('Performance optimizer not yet initialized - system startup in progress');
    }`,
            `    // ⚡ GRACEFUL STARTUP: Allow basic functionality during optimizer startup
    if (!performanceOptimizer) {
      console.error('⚠️  Performance optimizer starting up, using basic bridge functionality');
      // Basic fallback - execute tool directly without optimization
      const basicResult = await executeBasicTool(name, args);
      return basicResult;
    }`
        );
        
        if (fixedContent === serverContent) {
            console.log('⚠️  Target pattern not found - server may already be fixed');
            return false;
        }
        
        // Add the basic tool execution function
        const basicToolFunction = `
// Basic tool execution fallback during optimizer startup
async function executeBasicTool(toolName, args) {
  const startTime = Date.now();
  
  try {
    switch (toolName) {
      case 'enhanced_query_deepseek':
      case 'query_deepseek': {
        const { prompt, context, task_type, model } = args;
        const result = await bridge.routeQuery(prompt, {
          context: context || '',
          task_type: task_type || 'coding',
          model: model
        });
        
        return {
          content: [{
            type: 'text',
            text: result.response || result.content || 'Analysis complete'
          }],
          executionTime: Date.now() - startTime
        };
      }
      
      case 'analyze_files': {
        const { files } = args;
        const filePaths = Array.isArray(files) ? files : [files];
        
        let analysisResult = 'File Analysis:\\n\\n';
        
        for (const filePath of filePaths.slice(0, 5)) {
          try {
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const analysisPrompt = \`Analyze this code file with focus on specific methods, classes, and functionality:\\n\\nFile: \${filePath}\\nContent:\\n\${fileContent}\`;
            
            const result = await bridge.routeQuery(analysisPrompt, {
              task_type: 'analysis',
              context: \`Code analysis for \${filePath}\`
            });
            
            analysisResult += \`📁 \${filePath}:\\n\${result.response || result.content}\\n\\n\`;
          } catch (error) {
            analysisResult += \`📁 \${filePath}: Error - \${error.message}\\n\\n\`;
          }
        }
        
        return {
          content: [{
            type: 'text',
            text: analysisResult
          }],
          executionTime: Date.now() - startTime
        };
      }
      
      case 'check_deepseek_status': {
        const status = await bridge.checkStatus();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(status, null, 2)
          }],
          executionTime: Date.now() - startTime
        };
      }
      
      default:
        return {
          content: [{
            type: 'text',
            text: \`Tool \${toolName} not available during startup - please try again in a few moments\`
          }],
          executionTime: Date.now() - startTime
        };
    }
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: \`Basic execution error: \${error.message}\`
      }],
      isError: true,
      executionTime: Date.now() - startTime
    };
  }
}

`;
        
        // Insert the function before the bridge initialization
        const finalContent = fixedContent.replace(
            '// Initialize the enhanced bridge',
            basicToolFunction + '// Initialize the enhanced bridge'
        );
        
        // Create backup
        await fs.writeFile('server.js.backup-simple-fix', serverContent);
        console.log('📦 Backup created: server.js.backup-simple-fix');
        
        // Apply the fix
        await fs.writeFile('server.js', finalContent);
        console.log('✅ Simple quality fix applied successfully!');
        
        console.log('\\n🔧 CHANGES MADE:');
        console.log('   • Replaced optimizer startup error with graceful fallback');
        console.log('   • Added basic tool execution during startup phase');
        console.log('   • File analysis now works immediately');
        
        return true;
        
    } catch (error) {
        console.error('❌ Fix application failed:', error.message);
        return false;
    }
}

// Apply the fix
applySimpleFix().then((success) => {
    if (success) {
        console.log('\\n╰( ͡° ͜ʖ ͡° )þ──☆ SIMPLE FIX COMPLETE!');
        console.log('🎯 Now run the quality validation tests to verify!');
        console.log('\\n📝 Next steps:');
        console.log('   1. node manual-quality-test.js');
        console.log('   2. node quality-validation-test-suite.js');
    }
}).catch(console.error);