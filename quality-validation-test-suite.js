#!/usr/bin/env node

/**
 * ╰( ͡° ͜ʖ ͡° )þ──☆ TESTER - DeepSeek MCP Bridge Quality Validation Suite
 * 
 * MAGICAL TESTING MISSION:
 * Tests if the bridge provides specific file content analysis vs generic programming advice
 * 
 * VALIDATION OBJECTIVES:
 * 1. Multi-run statistical validation (configurable runs)
 * 2. Quality scoring system with specific metrics
 * 3. Response specificity analysis
 * 4. Generic vs specific pattern detection
 * 5. Automated quality monitoring
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

class QualityValidationSuite {
    constructor() {
        this.testResults = [];
        this.qualityScores = [];
        this.bridgeProcess = null;
        this.testStartTime = Date.now();
        
        // Quality scoring weights
        this.weights = {
            specificCodeElements: 0.3,     // Mentions specific method/variable names
            lineSpecificAnalysis: 0.25,    // References line numbers or specific code blocks
            fileContentUnderstanding: 0.25, // Shows understanding of actual file content
            contextualRelevance: 0.2       // Analysis relevant to the specific code context
        };
        
        // Test configuration
        this.config = {
            testRuns: 8,                   // Number of validation runs
            timeout: 35000,                // 35 second timeout per test
            bridgePort: process.env.MCP_BRIDGE_PORT || 3000,
            testFiles: [
                'test-files/EnemyAI.cs',
                'test-files/SimpleCalculator.cs', 
                'test-files/sample.js'
            ]
        };
    }
    
    async runQualityValidation() {
        console.log('╰( ͡° ͜ʖ ͡° )þ──☆ TESTER: Starting Quality Validation Suite!');
        console.log(`\nTESTING CONFIGURATION:`);
        console.log(`📊 Test Runs: ${this.config.testRuns}`);
        console.log(`📁 Test Files: ${this.config.testFiles.length}`);
        console.log(`⏱️  Timeout per Test: ${this.config.timeout}ms`);
        console.log(`🎯 Quality Metrics: Specificity, Line Analysis, Content Understanding, Context Relevance\n`);
        
        try {
            // Start the bridge server
            await this.startBridgeServer();
            await this.waitForServerReady();
            
            // Run validation tests
            for (const testFile of this.config.testFiles) {
                console.log(`\n🧪 TESTING FILE: ${testFile}`)
                console.log('═'.repeat(60));
                
                for (let run = 1; run <= this.config.testRuns; run++) {
                    console.log(`\n📋 Run ${run}/${this.config.testRuns}:`);
                    
                    const result = await this.runSingleTest(testFile, run);
                    this.testResults.push(result);
                    this.qualityScores.push(result.qualityScore);
                    
                    // Brief pause between tests
                    await this.sleep(1000);
                }
                
                // File-specific analysis
                this.analyzeFileResults(testFile);
            }
            
            // Generate comprehensive report
            await this.generateQualityReport();
            
        } catch (error) {
            console.error('❌ Quality Validation Failed:', error.message);
        } finally {
            await this.cleanup();
        }
    }
    
    async startBridgeServer() {
        console.log('🚀 Starting MCP Bridge Server...');
        
        this.bridgeProcess = spawn('node', ['server.js'], {
            cwd: process.cwd(),
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, NODE_ENV: 'test' }
        });
        
        this.bridgeProcess.stdout.on('data', (data) => {
            const output = data.toString();
            if (output.includes('Server started') || output.includes('listening')) {
                console.log('✅ Bridge Server Ready');
            }
        });
        
        this.bridgeProcess.stderr.on('data', (data) => {
            console.log('Bridge Error:', data.toString());
        });
    }
    
    async waitForServerReady() {
        console.log('⏳ Waiting for server to be ready...');
        await this.sleep(3000); // Give server time to start
        
        // Test server connection
        try {
            await this.testConnection();
            console.log('✅ Server Connection Verified');
        } catch (error) {
            throw new Error(`Server not ready: ${error.message}`);
        }
    }
    
    async testConnection() {
        return new Promise((resolve, reject) => {
            const testProcess = spawn('node', ['-e', `
                const { spawn } = require('child_process');
                const mcpClient = spawn('node', ['server.js'], { stdio: ['pipe', 'pipe', 'pipe'] });
                
                mcpClient.stdin.write(JSON.stringify({
                    jsonrpc: '2.0',
                    id: 'test',
                    method: 'tools/list',
                    params: {}
                }) + '\\n');
                
                let response = '';
                mcpClient.stdout.on('data', (data) => {
                    response += data.toString();
                    if (response.includes('jsonrpc')) {
                        mcpClient.kill();
                        process.exit(0);
                    }
                });
                
                setTimeout(() => {
                    mcpClient.kill();
                    process.exit(1);
                }, 5000);
            `], { stdio: 'inherit' });
            
            testProcess.on('exit', (code) => {
                code === 0 ? resolve() : reject(new Error('Connection test failed'));
            });
        });
    }
    
    async runSingleTest(filePath, runNumber) {
        const startTime = Date.now();
        
        try {
            // Read the test file
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const fileName = path.basename(filePath);
            
            // Create analysis request
            const analysisRequest = {
                jsonrpc: '2.0',
                id: `quality-test-${runNumber}-${Date.now()}`,
                method: 'tools/call',
                params: {
                    name: 'analyze_file',
                    arguments: {
                        file_path: path.resolve(filePath),
                        analysis_type: 'comprehensive'
                    }
                }
            };
            
            console.log(`   🔍 Requesting analysis of ${fileName}...`);
            
            // Execute the test
            const response = await this.executeAnalysisRequest(analysisRequest);
            const executionTime = Date.now() - startTime;
            
            // Quality analysis
            const qualityMetrics = this.analyzeResponseQuality(response, fileContent, fileName);
            const qualityScore = this.calculateQualityScore(qualityMetrics);
            
            const result = {
                runNumber,
                filePath,
                fileName,
                executionTime,
                response,
                qualityMetrics,
                qualityScore,
                timestamp: new Date().toISOString()
            };
            
            // Display results
            console.log(`   ⏱️  Execution Time: ${executionTime}ms`);
            console.log(`   📊 Quality Score: ${qualityScore.toFixed(2)}/100`);
            console.log(`   🎯 Specificity: ${qualityMetrics.specificCodeElements ? '✅' : '❌'}`);
            console.log(`   📝 Line Analysis: ${qualityMetrics.lineSpecificAnalysis ? '✅' : '❌'}`);
            console.log(`   🧠 Content Understanding: ${qualityMetrics.fileContentUnderstanding ? '✅' : '❌'}`);
            
            return result;
            
        } catch (error) {
            console.log(`   ❌ Test Failed: ${error.message}`);
            
            return {
                runNumber,
                filePath,
                fileName: path.basename(filePath),
                executionTime: Date.now() - startTime,
                response: null,
                error: error.message,
                qualityScore: 0,
                timestamp: new Date().toISOString()
            };
        }
    }
    
    async executeAnalysisRequest(request) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                mcpProcess.kill();
                reject(new Error(`Request timeout (${this.config.timeout}ms)`));
            }, this.config.timeout);
            
            const mcpProcess = spawn('node', ['server.js'], {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            let responseData = '';
            let errorData = '';
            
            mcpProcess.stdout.on('data', (data) => {
                responseData += data.toString();
            });
            
            mcpProcess.stderr.on('data', (data) => {
                errorData += data.toString();
            });
            
            mcpProcess.on('exit', (code) => {
                clearTimeout(timeout);
                
                if (code === 0 && responseData) {
                    try {
                        // Parse JSON response (may be multiple lines)
                        const lines = responseData.split('\n').filter(line => line.trim());
                        const lastValidJson = lines.reverse().find(line => {
                            try {
                                JSON.parse(line);
                                return true;
                            } catch { return false; }
                        });
                        
                        if (lastValidJson) {
                            resolve(JSON.parse(lastValidJson));
                        } else {
                            reject(new Error('No valid JSON response found'));
                        }
                    } catch (parseError) {
                        reject(new Error(`JSON parse error: ${parseError.message}`));
                    }
                } else {
                    reject(new Error(`Process exited with code ${code}: ${errorData}`));
                }
            });
            
            // Send the request
            mcpProcess.stdin.write(JSON.stringify(request) + '\n');
            mcpProcess.stdin.end();
        });
    }
    
    analyzeResponseQuality(response, fileContent, fileName) {
        if (!response || !response.result || !response.result.content) {
            return {
                specificCodeElements: false,
                lineSpecificAnalysis: false,
                fileContentUnderstanding: false,
                contextualRelevance: false,
                responseLength: 0,
                isGeneric: true
            };
        }
        
        const analysisText = JSON.stringify(response.result.content).toLowerCase();
        
        // Extract specific elements from the file for validation
        const codeElements = this.extractCodeElements(fileContent, fileName);
        
        // Quality checks
        const specificCodeElements = this.checkSpecificCodeElements(analysisText, codeElements);
        const lineSpecificAnalysis = this.checkLineSpecificAnalysis(analysisText);
        const fileContentUnderstanding = this.checkFileContentUnderstanding(analysisText, codeElements);
        const contextualRelevance = this.checkContextualRelevance(analysisText, fileName);
        
        // Generic response detection
        const genericPatterns = [
            'general programming',
            'best practices',
            'common patterns',
            'typical implementation',
            'standard approach',
            'usually',
            'generally',
            'commonly'
        ];
        
        const isGeneric = genericPatterns.some(pattern => 
            analysisText.includes(pattern)
        ) && !specificCodeElements;
        
        return {
            specificCodeElements,
            lineSpecificAnalysis,
            fileContentUnderstanding,
            contextualRelevance,
            responseLength: analysisText.length,
            isGeneric,
            codeElements
        };
    }
    
    extractCodeElements(fileContent, fileName) {
        const elements = {
            methods: [],
            variables: [],
            classes: [],
            imports: [],
            keywords: []
        };
        
        const lines = fileContent.split('\n');
        
        // Extract based on file type
        if (fileName.endsWith('.cs')) {
            // C# specific extraction
            elements.methods = this.extractCSharpMethods(fileContent);
            elements.variables = this.extractCSharpVariables(fileContent);
            elements.classes = this.extractCSharpClasses(fileContent);
            elements.keywords = ['public', 'private', 'void', 'class', 'using'];
        } else if (fileName.endsWith('.js')) {
            // JavaScript specific extraction
            elements.methods = this.extractJavaScriptFunctions(fileContent);
            elements.variables = this.extractJavaScriptVariables(fileContent);
            elements.keywords = ['function', 'const', 'let', 'var'];
        }
        
        return elements;
    }
    
    extractCSharpMethods(content) {
        const methodRegex = /(public|private|protected)\s+[\w<>\[\]]+\s+(\w+)\s*\(/g;
        const methods = [];
        let match;
        while ((match = methodRegex.exec(content)) !== null) {
            methods.push(match[2]);
        }
        return methods;
    }
    
    extractCSharpVariables(content) {
        const variableRegex = /(public|private|protected)?\s+[\w<>\[\]]+\s+(\w+)\s*[=;]/g;
        const variables = [];
        let match;
        while ((match = variableRegex.exec(content)) !== null) {
            variables.push(match[2]);
        }
        return variables;
    }
    
    extractCSharpClasses(content) {
        const classRegex = /class\s+(\w+)/g;
        const classes = [];
        let match;
        while ((match = classRegex.exec(content)) !== null) {
            classes.push(match[1]);
        }
        return classes;
    }
    
    extractJavaScriptFunctions(content) {
        const functionRegex = /function\s+(\w+)\s*\(/g;
        const functions = [];
        let match;
        while ((match = functionRegex.exec(content)) !== null) {
            functions.push(match[1]);
        }
        return functions;
    }
    
    extractJavaScriptVariables(content) {
        const variableRegex = /(const|let|var)\s+(\w+)/g;
        const variables = [];
        let match;
        while ((match = variableRegex.exec(content)) !== null) {
            variables.push(match[2]);
        }
        return variables;
    }
    
    checkSpecificCodeElements(analysisText, codeElements) {
        const allElements = [
            ...codeElements.methods,
            ...codeElements.variables,
            ...codeElements.classes
        ];
        
        return allElements.some(element => 
            analysisText.includes(element.toLowerCase())
        );
    }
    
    checkLineSpecificAnalysis(analysisText) {
        const linePatterns = [
            /line\s+\d+/i,
            /on\s+line/i,
            /at\s+line/i,
            /lines?\s+\d+-\d+/i
        ];
        
        return linePatterns.some(pattern => pattern.test(analysisText));
    }
    
    checkFileContentUnderstanding(analysisText, codeElements) {
        // Check if analysis mentions file-specific concepts
        const contextualElements = [
            ...codeElements.classes,
            ...codeElements.keywords
        ];
        
        let matches = 0;
        for (const element of contextualElements) {
            if (analysisText.includes(element.toLowerCase())) {
                matches++;
            }
        }
        
        return matches >= 2; // At least 2 contextual matches
    }
    
    checkContextualRelevance(analysisText, fileName) {
        if (fileName.includes('Enemy')) {
            const gameDevTerms = ['ai', 'unity', 'gameobject', 'transform', 'patrol', 'attack'];
            return gameDevTerms.some(term => analysisText.includes(term));
        }
        
        if (fileName.includes('Calculator')) {
            const mathTerms = ['calculate', 'operation', 'math', 'result', 'number'];
            return mathTerms.some(term => analysisText.includes(term));
        }
        
        if (fileName.includes('sample.js')) {
            const jsTerms = ['function', 'javascript', 'game loop', 'render'];
            return jsTerms.some(term => analysisText.includes(term));
        }
        
        return false;
    }
    
    calculateQualityScore(metrics) {
        let score = 0;
        
        if (metrics.specificCodeElements) {
            score += this.weights.specificCodeElements * 100;
        }
        
        if (metrics.lineSpecificAnalysis) {
            score += this.weights.lineSpecificAnalysis * 100;
        }
        
        if (metrics.fileContentUnderstanding) {
            score += this.weights.fileContentUnderstanding * 100;
        }
        
        if (metrics.contextualRelevance) {
            score += this.weights.contextualRelevance * 100;
        }
        
        // Penalty for generic responses
        if (metrics.isGeneric) {
            score *= 0.5;
        }
        
        return Math.max(0, Math.min(100, score));
    }
    
    analyzeFileResults(filePath) {
        const fileResults = this.testResults.filter(r => r.filePath === filePath);
        const scores = fileResults.map(r => r.qualityScore);
        
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        const minScore = Math.min(...scores);
        const maxScore = Math.max(...scores);
        const consistencyScore = 100 - (maxScore - minScore);
        
        console.log(`\n📈 FILE ANALYSIS: ${path.basename(filePath)}`);
        console.log(`   Average Quality: ${avgScore.toFixed(2)}/100`);
        console.log(`   Score Range: ${minScore.toFixed(1)} - ${maxScore.toFixed(1)}`);
        console.log(`   Consistency: ${consistencyScore.toFixed(1)}/100`);
        console.log(`   Success Rate: ${fileResults.filter(r => r.qualityScore > 60).length}/${fileResults.length}`);
    }
    
    async generateQualityReport() {
        const totalTests = this.testResults.length;
        const successfulTests = this.testResults.filter(r => r.qualityScore > 0).length;
        const highQualityTests = this.testResults.filter(r => r.qualityScore >= 70).length;
        const avgQuality = this.qualityScores.reduce((a, b) => a + b, 0) / this.qualityScores.length;
        const totalTime = Date.now() - this.testStartTime;
        
        const report = {
            testSummary: {
                totalTests,
                successfulTests,
                highQualityTests,
                avgQuality: avgQuality.toFixed(2),
                totalTime: `${(totalTime / 1000).toFixed(1)}s`
            },
            qualityMetrics: {
                specificCodeElementsSuccess: this.testResults.filter(r => r.qualityMetrics?.specificCodeElements).length,
                lineSpecificAnalysisSuccess: this.testResults.filter(r => r.qualityMetrics?.lineSpecificAnalysis).length,
                contentUnderstandingSuccess: this.testResults.filter(r => r.qualityMetrics?.fileContentUnderstanding).length,
                contextualRelevanceSuccess: this.testResults.filter(r => r.qualityMetrics?.contextualRelevance).length
            },
            issuesDetected: {
                genericResponses: this.testResults.filter(r => r.qualityMetrics?.isGeneric).length,
                timeouts: this.testResults.filter(r => r.error && r.error.includes('timeout')).length,
                failures: this.testResults.filter(r => r.qualityScore === 0).length
            },
            detailedResults: this.testResults
        };
        
        // Save report
        const reportPath = '/home/platano/project/deepseek-mcp-bridge/quality-validation-report.json';
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
        
        // Display final results
        console.log(`\n╰( ͡° ͜ʖ ͡° )þ──☆ QUALITY VALIDATION COMPLETE!`);
        console.log(`\n📊 FINAL RESULTS:`);
        console.log(`   Total Tests: ${totalTests}`);
        console.log(`   Successful Tests: ${successfulTests}/${totalTests} (${((successfulTests/totalTests)*100).toFixed(1)}%)`);
        console.log(`   High Quality Tests: ${highQualityTests}/${totalTests} (${((highQualityTests/totalTests)*100).toFixed(1)}%)`);
        console.log(`   Average Quality Score: ${avgQuality.toFixed(2)}/100`);
        console.log(`   Total Execution Time: ${(totalTime / 1000).toFixed(1)}s`);
        
        console.log(`\n🎯 QUALITY METRICS SUCCESS RATES:`);
        console.log(`   Specific Code Elements: ${report.qualityMetrics.specificCodeElementsSuccess}/${totalTests} (${((report.qualityMetrics.specificCodeElementsSuccess/totalTests)*100).toFixed(1)}%)`);
        console.log(`   Line-Specific Analysis: ${report.qualityMetrics.lineSpecificAnalysisSuccess}/${totalTests} (${((report.qualityMetrics.lineSpecificAnalysisSuccess/totalTests)*100).toFixed(1)}%)`);
        console.log(`   Content Understanding: ${report.qualityMetrics.contentUnderstandingSuccess}/${totalTests} (${((report.qualityMetrics.contentUnderstandingSuccess/totalTests)*100).toFixed(1)}%)`);
        console.log(`   Contextual Relevance: ${report.qualityMetrics.contextualRelevanceSuccess}/${totalTests} (${((report.qualityMetrics.contextualRelevanceSuccess/totalTests)*100).toFixed(1)}%)`);
        
        console.log(`\n⚠️  ISSUES DETECTED:`);
        console.log(`   Generic Responses: ${report.issuesDetected.genericResponses}/${totalTests}`);
        console.log(`   Timeouts: ${report.issuesDetected.timeouts}/${totalTests}`);
        console.log(`   Complete Failures: ${report.issuesDetected.failures}/${totalTests}`);
        
        console.log(`\n📄 Detailed report saved to: ${reportPath}`);
        
        // Quality assessment
        if (avgQuality >= 80) {
            console.log(`\n✅ QUALITY ASSESSMENT: EXCELLENT - Bridge provides specific, detailed analysis!`);
        } else if (avgQuality >= 60) {
            console.log(`\n⚠️  QUALITY ASSESSMENT: GOOD - Some improvements needed for specificity.`);
        } else {
            console.log(`\n❌ QUALITY ASSESSMENT: POOR - Bridge giving generic responses instead of specific analysis!`);
        }
    }
    
    async cleanup() {
        if (this.bridgeProcess) {
            console.log('\n🧹 Cleaning up bridge process...');
            this.bridgeProcess.kill();
        }
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Run the quality validation if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const validator = new QualityValidationSuite();
    validator.runQualityValidation().catch(console.error);
}

export default QualityValidationSuite;