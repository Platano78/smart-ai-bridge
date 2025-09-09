#!/usr/bin/env node

/**
 * ╰( ͡° ͜ʖ ͡° )þ──☆ BRIDGE QUALITY FIX
 * Patches the performance optimizer initialization issue
 */

import fs from 'fs/promises';

async function applyQualityFix() {
    console.log('╰( ͡° ͜ʖ ͡° )þ──☆ APPLYING BRIDGE QUALITY FIX');
    console.log('═'.repeat(60));
    
    try {
        // Read the current server.js
        const serverContent = await fs.readFile('server.js', 'utf-8');
        
        console.log('📖 Current server.js read successfully');
        
        // Create the fix by making performance optimizer optional during startup
        const fixedContent = serverContent.replace(
            // Find the problematic safety check
            `    // ⚡ SAFETY CHECK: Ensure performance optimizer is initialized
    if (!performanceOptimizer) {
      throw new Error('Performance optimizer not yet initialized - system startup in progress');
    }`,
            // Replace with graceful fallback
            `    // ⚡ GRACEFUL STARTUP: Use direct bridge if optimizer not ready yet
    if (!performanceOptimizer) {
      console.error('⚠️  Performance optimizer starting up, using direct bridge execution');
      return await executeDirectBridgeCall(name, args);
    }`
        );
        
        // Add the direct bridge execution function
        const directExecutionFunction = `
// ⚡ DIRECT BRIDGE EXECUTION - Fallback during optimizer startup
async function executeDirectBridgeCall(toolName, args) {
  const startTime = Date.now();
  
  try {
    switch (toolName) {
      case 'enhanced_query_deepseek': {
        const { prompt, context, task_type, model, force_deepseek } = args;
        const result = await bridge.routeQuery(prompt, {
          context,
          task_type,
          model,
          force_deepseek
        });
        
        return {
          content: [{
            type: 'text',
            text: result.response || result.content || 'No response received'
          }],
          executionTime: Date.now() - startTime
        };
      }
      
      case 'analyze_files': {
        const { files, pattern, include_project_context, max_files } = args;
        const filePaths = Array.isArray(files) ? files : [files];
        
        const analysisResults = [];
        for (const filePath of filePaths.slice(0, max_files || 20)) {
          try {
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const analysisPrompt = `Analyze this file in detail:
            
File: ${filePath}
Content:
${fileContent}`;
            
            const result = await bridge.routeQuery(analysisPrompt, {
              task_type: 'analysis',
              context: `File analysis for ${filePath}`
            });
            
            analysisResults.push({
              file: filePath,
              analysis: result.response || result.content || 'Analysis failed'
            });
          } catch (fileError) {
            analysisResults.push({
              file: filePath,
              error: fileError.message
            });
          }
        }
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              results: analysisResults,
              total_files: analysisResults.length,
              execution_time: Date.now() - startTime
            }, null, 2)
          }],
          executionTime: Date.now() - startTime
        };
      }
      
      case 'query_deepseek': {
        const { prompt, context, task_type, model } = args;
        const result = await bridge.routeQuery(prompt, {
          context,
          task_type,
          model
        });
        
        return {
          content: [{
            type: 'text',
            text: result.response || result.content || 'No response received'
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
        throw new Error(`Unknown tool: ${toolName}`);
    }
  } catch (error) {
    console.error(`Direct execution error for ${toolName}:`, error);
    return {
      content: [{
        type: 'text',
        text: `❌ **Direct Bridge Error:** ${error.message}\n\n*Tool: ${toolName}*`
      }],
      isError: true,
      executionTime: Date.now() - startTime
    };
  }
}

`;
        
        // Insert the function before the server setup
        const finalContent = fixedContent.replace(
            '// Initialize the enhanced bridge',
            directExecutionFunction + '// Initialize the enhanced bridge'
        );
        
        if (finalContent === serverContent) {
            console.log('⚠️  No changes made - pattern not found or already fixed');
            return false;
        }
        
        // Create backup
        await fs.writeFile('server.js.backup-quality-fix', serverContent);
        console.log('📦 Backup created: server.js.backup-quality-fix');
        
        // Apply the fix
        await fs.writeFile('server.js', finalContent);
        console.log('✅ Quality fix applied successfully!');
        
        console.log('\n🔧 CHANGES MADE:');
        console.log('   • Made performance optimizer optional during startup');
        console.log('   • Added direct bridge execution fallback');
        console.log('   • Graceful degradation during system initialization');
        console.log('   • File analysis now works immediately on server start');
        
        return true;
        
    } catch (error) {
        console.error('❌ Fix application failed:', error.message);
        return false;
    }
}

async function testAfterFix() {
    console.log('\n🧪 TESTING AFTER FIX:');
    console.log('─'.repeat(40));
    
    // Import required modules for test
    const { spawn } = require('child_process');
    
    const testRequest = {
        jsonrpc: '2.0',
        id: 'post-fix-test',
        method: 'tools/call',
        params: {
            name: 'enhanced_query_deepseek',
            arguments: {
                prompt: 'Analyze this simple calculator method: public double Add(double a, double b) { return a + b; }',
                task_type: 'analysis'
            }
        }
    };
    
    return new Promise((resolve) => {
        console.log('🚀 Starting test...');
        
        const testProcess = spawn('node', ['server.js'], {
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let responseData = '';
        
        const timeout = setTimeout(() => {
            testProcess.kill();
            console.log('⏱️  Test timeout - server may still be initializing');
            resolve(false);
        }, 15000);
        
        testProcess.stdout.on('data', (data) => {
            responseData += data.toString();
        });
        
        testProcess.on('exit', () => {
            clearTimeout(timeout);
            
            const hasValidResponse = responseData.includes('"jsonrpc"') && 
                                   !responseData.includes('Performance optimizer not yet initialized');
            
            if (hasValidResponse) {
                console.log('✅ Test passed - bridge now responds without optimizer errors!');
                resolve(true);
            } else {
                console.log('❌ Test failed - still seeing initialization issues');
                console.log('Response preview:', responseData.substring(0, 200));
                resolve(false);
            }
        });
        
        setTimeout(() => {
            testProcess.stdin.write(JSON.stringify(testRequest) + '\n');
            testProcess.stdin.end();
        }, 2000);
    });
}

// Apply the fix
if (import.meta.url === `file://${process.argv[1]}`) {
    applyQualityFix().then(async (success) => {
        if (success) {
            console.log('\n⏳ Waiting for server stabilization...');
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const testResult = await testAfterFix();
            
            if (testResult) {
                console.log('\n╰( ͡° ͜ʖ ͡° )þ──☆ QUALITY FIX SUCCESSFUL!');
                console.log('🎯 Bridge now provides immediate file analysis without optimizer delays!');
            } else {
                console.log('\n⚠️  Fix applied but additional testing needed');
            }
        }
    }).catch(console.error);
}