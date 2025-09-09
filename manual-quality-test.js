#!/usr/bin/env node

/**
 * ╰( ͡° ͜ʖ ͡° )þ──☆ MANUAL QUALITY TEST
 * Quick validation of bridge response quality for specific file analysis
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';

async function testFileAnalysis(filePath) {
    console.log(`\n🔍 Testing analysis of: ${filePath}`);
    
    const request = {
        jsonrpc: '2.0',
        id: 'manual-test-' + Date.now(),
        method: 'tools/call',
        params: {
            name: 'analyze_files',
            arguments: {
                files: filePath,
                include_project_context: true
            }
        }
    };
    
    return new Promise((resolve, reject) => {
        const mcpProcess = spawn('node', ['server.js'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: process.cwd()
        });
        
        let responseData = '';
        let errorData = '';
        
        const timeout = setTimeout(() => {
            mcpProcess.kill();
            reject(new Error('Request timeout (30s)'));
        }, 30000);
        
        mcpProcess.stdout.on('data', (data) => {
            responseData += data.toString();
        });
        
        mcpProcess.stderr.on('data', (data) => {
            errorData += data.toString();
        });
        
        mcpProcess.on('exit', (code) => {
            clearTimeout(timeout);
            
            if (responseData) {
                try {
                    const lines = responseData.split('\n').filter(line => line.trim());
                    const validJsonLines = lines.filter(line => {
                        try {
                            JSON.parse(line);
                            return true;
                        } catch { return false; }
                    });
                    
                    if (validJsonLines.length > 0) {
                        const response = JSON.parse(validJsonLines[validJsonLines.length - 1]);
                        resolve(response);
                    } else {
                        resolve({ rawResponse: responseData });
                    }
                } catch (parseError) {
                    resolve({ rawResponse: responseData, parseError: parseError.message });
                }
            } else {
                reject(new Error(`No response. Code: ${code}, Error: ${errorData}`));
            }
        });
        
        // Send request
        mcpProcess.stdin.write(JSON.stringify(request) + '\n');
        mcpProcess.stdin.end();
    });
}

async function analyzeResponse(response, filePath) {
    console.log('\n📊 RESPONSE ANALYSIS:');
    
    if (!response.result || !response.result.content) {
        console.log('❌ No valid analysis content received');
        console.log('Raw response:', JSON.stringify(response, null, 2));
        return false;
    }
    
    const analysisText = JSON.stringify(response.result.content).toLowerCase();
    const fileName = filePath.split('/').pop();
    
    console.log(`📝 Response length: ${analysisText.length} characters`);
    
    // Check for specific code elements
    let hasSpecificElements = false;
    if (fileName === 'EnemyAI.cs') {
        const specificTerms = ['enemyai', 'patrol', 'aistate', 'chasing', 'attacking', 'monobehaviour'];
        hasSpecificElements = specificTerms.some(term => analysisText.includes(term));
        console.log(`🎯 Unity/Game Dev Specificity: ${hasSpecificElements ? '✅ Found specific elements' : '❌ Generic response'}`);
    } else if (fileName === 'SimpleCalculator.cs') {
        const specificTerms = ['calculator', 'add', 'subtract', 'multiply', 'divide', 'lastresult'];
        hasSpecificElements = specificTerms.some(term => analysisText.includes(term));
        console.log(`🎯 Calculator Specificity: ${hasSpecificElements ? '✅ Found specific elements' : '❌ Generic response'}`);
    } else if (fileName === 'sample.js') {
        const specificTerms = ['gameloop', 'updategame', 'rendergame', 'players'];
        hasSpecificElements = specificTerms.some(term => analysisText.includes(term));
        console.log(`🎯 JavaScript Specificity: ${hasSpecificElements ? '✅ Found specific elements' : '❌ Generic response'}`);
    }
    
    // Check for generic patterns
    const genericPatterns = ['best practices', 'common patterns', 'general programming', 'typically', 'usually'];
    const isGeneric = genericPatterns.some(pattern => analysisText.includes(pattern));
    console.log(`📋 Generic Response Detection: ${isGeneric ? '⚠️  Contains generic advice' : '✅ Specific analysis'}`);
    
    // Check for line references
    const hasLineReferences = /line\s+\d+/i.test(analysisText);
    console.log(`📍 Line-Specific Analysis: ${hasLineReferences ? '✅ References specific lines' : '❌ No line references'}`);
    
    console.log('\n📄 ANALYSIS CONTENT (first 200 chars):');
    console.log(JSON.stringify(response.result.content).substring(0, 200) + '...');
    
    return hasSpecificElements && !isGeneric;
}

async function runManualTest() {
    console.log('╰( ͡° ͜ʖ ͡° )þ──☆ MANUAL QUALITY TEST - Bridge Analysis Validation');
    console.log('═'.repeat(70));
    
    const testFiles = [
        '/home/platano/project/deepseek-mcp-bridge/test-files/EnemyAI.cs',
        '/home/platano/project/deepseek-mcp-bridge/test-files/SimpleCalculator.cs',
        '/home/platano/project/deepseek-mcp-bridge/test-files/sample.js'
    ];
    
    let passCount = 0;
    
    for (const filePath of testFiles) {
        try {
            const response = await testFileAnalysis(filePath);
            const passed = await analyzeResponse(response, filePath);
            
            if (passed) {
                passCount++;
                console.log('✅ QUALITY TEST: PASSED');
            } else {
                console.log('❌ QUALITY TEST: FAILED');
            }
            
        } catch (error) {
            console.log(`❌ TEST ERROR: ${error.message}`);
        }
        
        console.log('\n' + '─'.repeat(50));
        
        // Brief pause between tests
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log(`\n🎯 FINAL RESULTS: ${passCount}/${testFiles.length} tests passed`);
    
    if (passCount === testFiles.length) {
        console.log('✅ BRIDGE QUALITY: EXCELLENT - Providing specific file analysis!');
    } else if (passCount > 0) {
        console.log('⚠️  BRIDGE QUALITY: MIXED - Some files analyzed specifically, others generically');
    } else {
        console.log('❌ BRIDGE QUALITY: POOR - Giving generic programming advice instead of file analysis!');
    }
}

// Run the test
runManualTest().catch(console.error);