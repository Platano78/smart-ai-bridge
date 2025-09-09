#!/usr/bin/env node

/**
 * ╰( ͡° ͜ʖ ͡° )þ──☆ DIRECT ANALYSIS TEST
 * Test analysis functionality bypassing the optimizer to validate core functionality
 */

import { spawn } from 'child_process';

async function testDirectFileAnalysis() {
    console.log('╰( ͡° ͜ʖ ͡° )þ──☆ TESTING: Direct Bridge Analysis (bypassing optimizer)');
    console.log('═'.repeat(70));
    
    // Test the enhanced_query_deepseek with file content directly
    const filePath = '/home/platano/project/deepseek-mcp-bridge/test-files/SimpleCalculator.cs';
    
    const request = {
        jsonrpc: '2.0',
        id: 'direct-test-' + Date.now(),
        method: 'tools/call',
        params: {
            name: 'enhanced_query_deepseek',
            arguments: {
                prompt: `Analyze this C# code file in detail. Focus on the specific methods, classes, and functionality:

using System;

namespace MathUtilities
{
    public class SimpleCalculator
    {
        private double lastResult;
        private string lastOperation;
        
        public double LastResult 
        { 
            get { return lastResult; } 
            private set { lastResult = value; }
        }
        
        public double Add(double firstNumber, double secondNumber)
        {
            lastResult = firstNumber + secondNumber;
            lastOperation = \`\${firstNumber} + \${secondNumber} = \${lastResult}\`;
            return lastResult;
        }
        
        public double Divide(double firstNumber, double secondNumber)
        {
            if (secondNumber == 0)
            {
                throw new DivideByZeroException("Cannot divide by zero!");
            }
            
            lastResult = firstNumber / secondNumber;
            lastOperation = \`\${firstNumber} / \${secondNumber} = \${lastResult}\`;
            return lastResult;
        }
    }
}`,
                task_type: 'analysis',
                context: 'Analyzing specific C# calculator class implementation'
            }
        }
    };
    
    console.log('🔍 Sending direct analysis request...');
    
    return new Promise((resolve, reject) => {
        const mcpProcess = spawn('node', ['server.js'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: process.cwd()
        });
        
        let responseData = '';
        let errorData = '';
        
        const timeout = setTimeout(() => {
            mcpProcess.kill();
            reject(new Error('Request timeout (40s)'));
        }, 40000);
        
        mcpProcess.stdout.on('data', (data) => {
            const output = data.toString();
            responseData += output;
            console.log('📡 Received data chunk...');
        });
        
        mcpProcess.stderr.on('data', (data) => {
            errorData += data.toString();
        });
        
        mcpProcess.on('exit', (code) => {
            clearTimeout(timeout);
            
            console.log(`\n📊 RESPONSE ANALYSIS:`);
            console.log(`   Process exit code: ${code}`);
            console.log(`   Response data length: ${responseData.length}`);
            console.log(`   Error data length: ${errorData.length}`);
            
            if (responseData) {
                try {
                    const lines = responseData.split('\n').filter(line => line.trim());
                    console.log(`   Found ${lines.length} response lines`);
                    
                    // Look for JSON responses
                    const validJsonLines = lines.filter(line => {
                        try {
                            JSON.parse(line);
                            return true;
                        } catch { return false; }
                    });
                    
                    console.log(`   Valid JSON lines: ${validJsonLines.length}`);
                    
                    if (validJsonLines.length > 0) {
                        const response = JSON.parse(validJsonLines[validJsonLines.length - 1]);
                        console.log(`\n✅ VALID RESPONSE RECEIVED:`);
                        
                        if (response.result && response.result.content) {
                            const content = response.result.content;
                            let analysisText = '';
                            
                            if (Array.isArray(content)) {
                                analysisText = content.map(c => c.text || '').join(' ').toLowerCase();
                            } else if (content.text) {
                                analysisText = content.text.toLowerCase();
                            } else {
                                analysisText = JSON.stringify(content).toLowerCase();
                            }
                            
                            console.log(`   Analysis length: ${analysisText.length} characters`);
                            
                            // Quality checks
                            const hasCalculatorTerms = ['calculator', 'add', 'divide', 'lastresult'].some(term => 
                                analysisText.includes(term)
                            );
                            
                            const hasCSharpTerms = ['namespace', 'class', 'method', 'property'].some(term => 
                                analysisText.includes(term)
                            );
                            
                            const hasSpecificMethods = ['add', 'divide'].some(method => 
                                analysisText.includes(method)
                            );
                            
                            const isGeneric = ['general programming', 'best practices', 'common patterns'].some(pattern => 
                                analysisText.includes(pattern)
                            );
                            
                            console.log(`\n🎯 QUALITY ANALYSIS:`);
                            console.log(`   Calculator-specific terms: ${hasCalculatorTerms ? '✅' : '❌'}`);
                            console.log(`   C# language terms: ${hasCSharpTerms ? '✅' : '❌'}`);
                            console.log(`   Specific methods mentioned: ${hasSpecificMethods ? '✅' : '❌'}`);
                            console.log(`   Generic response: ${isGeneric ? '⚠️  Yes' : '✅ No'}`);
                            
                            console.log(`\n📄 CONTENT PREVIEW (first 300 chars):`);
                            console.log(analysisText.substring(0, 300) + '...');
                            
                            const qualityScore = (
                                (hasCalculatorTerms ? 25 : 0) +
                                (hasCSharpTerms ? 25 : 0) +
                                (hasSpecificMethods ? 25 : 0) +
                                (isGeneric ? 0 : 25)
                            );
                            
                            console.log(`\n📊 FINAL QUALITY SCORE: ${qualityScore}/100`);
                            
                            if (qualityScore >= 75) {
                                console.log('✅ BRIDGE ANALYSIS: EXCELLENT - Specific and detailed!');
                            } else if (qualityScore >= 50) {
                                console.log('⚠️  BRIDGE ANALYSIS: GOOD - Some specificity present');
                            } else {
                                console.log('❌ BRIDGE ANALYSIS: POOR - Generic or non-specific');
                            }
                            
                            resolve({ qualityScore, response, analysisText });
                        } else {
                            console.log('❌ No analysis content found in response');
                            resolve({ qualityScore: 0, response });
                        }
                    } else {
                        console.log('❌ No valid JSON responses found');
                        console.log('Raw response data:');
                        console.log(responseData.substring(0, 500) + '...');
                        resolve({ qualityScore: 0, rawResponse: responseData });
                    }
                } catch (parseError) {
                    console.log(`❌ JSON parsing failed: ${parseError.message}`);
                    console.log('Raw response:');
                    console.log(responseData.substring(0, 500) + '...');
                    resolve({ qualityScore: 0, parseError: parseError.message, rawResponse: responseData });
                }
            } else {
                console.log('❌ No response data received');
                if (errorData) {
                    console.log('Error data:');
                    console.log(errorData);
                }
                reject(new Error(`No response. Code: ${code}`));
            }
        });
        
        // Send request
        console.log('📤 Sending request to bridge...');
        mcpProcess.stdin.write(JSON.stringify(request) + '\n');
        mcpProcess.stdin.end();
    });
}

// Run the test
testDirectFileAnalysis().catch(error => {
    console.error('❌ TEST FAILED:', error.message);
    process.exit(1);
});