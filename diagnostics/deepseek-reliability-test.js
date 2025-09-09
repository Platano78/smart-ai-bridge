#!/usr/bin/env node

/**
 * DeepSeek Reliability Diagnostic Suite
 * Monitors performance, context window handling, and error patterns
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ResponseQualityValidator from '../src/response-quality-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DeepSeekDiagnostics {
    constructor() {
        this.testResults = [];
        this.baseUrl = 'http://172.19.224.1:1234/v1';
        this.logFile = path.join(__dirname, 'deepseek-diagnostics.json');
        this.currentContextWindow = 32768; // Current setting to monitor
        this.qualityValidator = new ResponseQualityValidator();
    }

    async runDiagnosticSuite() {
        console.log('🔬 DeepSeek Reliability Diagnostic Suite Starting...');
        console.log(`📊 Context Window: ${this.currentContextWindow} tokens`);
        console.log(`🔗 Endpoint: ${this.baseUrl}`);
        
        const testCases = [
            {
                name: 'Simple Technical Query',
                complexity: 'LOW',
                expectedTokens: 200,
                prompt: 'Explain the difference between const and let in JavaScript in 2 sentences.',
                timeout: 5000
            },
            {
                name: 'Moderate Code Analysis',
                complexity: 'MEDIUM', 
                expectedTokens: 500,
                prompt: 'Analyze this React component for potential issues:\n```jsx\nfunction App() {\n  const [data, setData] = useState();\n  useEffect(() => {\n    fetch("/api/data").then(res => setData(res.json()));\n  });\n  return <div>{data?.name}</div>;\n}\n```',
                timeout: 10000
            },
            {
                name: 'Complex System Design',
                complexity: 'HIGH',
                expectedTokens: 1000,
                prompt: 'Design a scalable architecture for a real-time multiplayer game with the following requirements: WebSocket communication, player state synchronization, anti-cheat measures, and horizontal scaling. Provide detailed technical analysis with specific technology recommendations.',
                timeout: 20000
            },
            {
                name: 'Large Context Test',
                complexity: 'CONTEXT_STRESS',
                expectedTokens: 1500,
                prompt: this.generateLargeContextPrompt(),
                timeout: 30000
            }
        ];

        for (const testCase of testCases) {
            console.log(`\n🧪 Running: ${testCase.name} (${testCase.complexity})`);
            await this.runSingleTest(testCase);
            await this.sleep(2000); // 2 second cooldown between tests
        }

        await this.generateDiagnosticReport();
    }

    async runSingleTest(testCase) {
        const startTime = Date.now();
        const testResult = {
            ...testCase,
            timestamp: new Date().toISOString(),
            status: 'PENDING',
            responseTime: null,
            actualTokens: null,
            errorDetails: null,
            qualityScore: null
        };

        try {
            console.log(`⏱️  Timeout: ${testCase.timeout}ms`);
            
            const response = await Promise.race([
                this.makeDeepSeekRequest(testCase.prompt),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('TIMEOUT')), testCase.timeout)
                )
            ]);

            const endTime = Date.now();
            testResult.responseTime = endTime - startTime;
            testResult.status = 'SUCCESS';
            testResult.actualTokens = this.estimateTokens(response);
            testResult.qualityScore = this.assessResponseQuality(response, testCase);
            
            console.log(`✅ Success: ${testResult.responseTime}ms | Tokens: ~${testResult.actualTokens} | Quality: ${testResult.qualityScore}/10`);

            // Log concerning patterns
            if (testResult.responseTime > testCase.timeout * 0.8) {
                console.log(`⚠️  SLOW: Response time approaching timeout (${testResult.responseTime}ms)`);
            }
            
            if (testResult.qualityScore < 6) {
                console.log(`⚠️  QUALITY: Low quality response detected (${testResult.qualityScore}/10)`);
            }

        } catch (error) {
            const endTime = Date.now();
            testResult.responseTime = endTime - startTime;
            testResult.status = 'FAILED';
            testResult.errorDetails = {
                type: error.message,
                responseTime: testResult.responseTime,
                contextWindow: this.currentContextWindow
            };
            
            console.log(`❌ Failed: ${error.message} after ${testResult.responseTime}ms`);
            
            // Specific error pattern analysis
            if (error.message === 'TIMEOUT') {
                console.log(`🚨 TIMEOUT PATTERN: Request exceeded ${testCase.timeout}ms - possible context window issue`);
            }
        }

        this.testResults.push(testResult);
    }

    async makeDeepSeekRequest(prompt) {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'deepseek-coder-v2-lite-instruct',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 2000,
                temperature: 0.1
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP_ERROR_${response.status}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    generateLargeContextPrompt() {
        // Generate a prompt that tests context window handling
        const basePrompt = `
        Context: You are analyzing a complex React application with the following components and issues:

        Component 1: UserDashboard.tsx - Manages user state, authentication, and navigation
        Component 2: GameEngine.tsx - Handles game logic, physics, and rendering
        Component 3: NetworkManager.tsx - WebSocket communication and state synchronization
        Component 4: AudioSystem.tsx - Dynamic audio management and spatial sound
        Component 5: AssetLoader.tsx - Handles texture loading, caching, and optimization

        Current Issues:
        - Memory leaks in GameEngine during rapid state changes
        - WebSocket reconnection failures in NetworkManager
        - Audio distortion during high-intensity gameplay
        - Slow asset loading causing gameplay interruptions
        - User authentication state not persisting across sessions

        Technical Context:
        - React 18 with TypeScript
        - Vite build system
        - WebGL for rendering
        - Web Audio API for sound
        - WebSocket for multiplayer
        - IndexedDB for offline storage
        `;

        // Add repetitive context to test window limits
        let extendedContext = basePrompt;
        for (let i = 0; i < 3; i++) {
            extendedContext += `\n\nAdditional Context Block ${i + 1}: This application serves 10,000+ concurrent players in a cyberpunk-themed RPG environment with real-time combat, voice chat, and persistent world state.`;
        }

        return extendedContext + '\n\nQuestion: Provide a comprehensive technical analysis of the most critical issue to fix first and a detailed implementation plan.';
    }

    estimateTokens(text) {
        // Rough estimation: ~4 characters per token
        return Math.ceil(text.length / 4);
    }

    assessResponseQuality(response, testCase) {
        // Use the new comprehensive validation system
        const context = {
            prompt: testCase.prompt || '',
            complexity: testCase.complexity
        };
        
        const validation = this.qualityValidator.validateResponse(response, context);
        
        // Log validation details for debugging
        if (validation.isGeneric || validation.validationFailures.length > 0) {
            console.log(`🚨 QUALITY ISSUE DETECTED:`);
            if (validation.isGeneric) {
                console.log(`   Generic patterns found: ${validation.validationFailures.length}`);
                validation.validationFailures.forEach(failure => {
                    console.log(`   - ${failure.pattern || failure}`);
                });
            }
            if (validation.warnings.length > 0) {
                console.log(`   Warnings: ${validation.warnings.join(', ')}`);
            }
        }
        
        return validation.score;
    }

    async generateDiagnosticReport() {
        const report = {
            timestamp: new Date().toISOString(),
            contextWindow: this.currentContextWindow,
            endpoint: this.baseUrl,
            summary: this.generateSummary(),
            testResults: this.testResults,
            recommendations: this.generateRecommendations()
        };

        await fs.promises.writeFile(this.logFile, JSON.stringify(report, null, 2));
        
        console.log('\n📊 DIAGNOSTIC REPORT SUMMARY:');
        console.log(`Context Window: ${this.currentContextWindow} tokens`);
        console.log(`Tests Run: ${this.testResults.length}`);
        console.log(`Success Rate: ${report.summary.successRate}%`);
        console.log(`Avg Response Time: ${report.summary.avgResponseTime}ms`);
        console.log(`Quality Issues: ${report.summary.qualityIssues}`);
        
        if (report.recommendations.length > 0) {
            console.log('\n🔧 RECOMMENDATIONS:');
            report.recommendations.forEach(rec => console.log(`- ${rec}`));
        }
        
        console.log(`\n💾 Full report saved to: ${this.logFile}`);
    }

    generateSummary() {
        const successful = this.testResults.filter(r => r.status === 'SUCCESS');
        const failed = this.testResults.filter(r => r.status === 'FAILED');
        
        const avgResponseTime = successful.length > 0 
            ? Math.round(successful.reduce((sum, r) => sum + r.responseTime, 0) / successful.length)
            : 0;

        const qualityIssues = successful.filter(r => r.qualityScore < 7).length;

        return {
            successRate: Math.round((successful.length / this.testResults.length) * 100),
            avgResponseTime,
            qualityIssues,
            timeoutErrors: failed.filter(r => r.errorDetails?.type === 'TIMEOUT').length,
            httpErrors: failed.filter(r => r.errorDetails?.type.startsWith('HTTP_ERROR')).length
        };
    }

    generateRecommendations() {
        const recommendations = [];
        const summary = this.generateSummary();

        if (summary.successRate < 80) {
            recommendations.push('SUCCESS RATE CRITICAL: Consider reducing context window or checking DeepSeek server resources');
        }

        if (summary.avgResponseTime > 10000) {
            recommendations.push('PERFORMANCE CRITICAL: Average response time >10s indicates context window or model loading issues');
        }

        if (summary.timeoutErrors > 0) {
            recommendations.push(`TIMEOUT PATTERN: ${summary.timeoutErrors} timeout errors suggest context window too large for current hardware`);
        }

        if (summary.qualityIssues > 0) {
            recommendations.push(`QUALITY DEGRADATION: ${summary.qualityIssues} low-quality responses may indicate model stress`);
        }

        // Context window specific recommendations
        if (this.currentContextWindow > 16384 && (summary.avgResponseTime > 8000 || summary.timeoutErrors > 0)) {
            recommendations.push('CONTEXT WINDOW: Consider reducing from 32768 to 16384 tokens for better reliability');
        }

        return recommendations;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Run diagnostics if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const diagnostics = new DeepSeekDiagnostics();
    diagnostics.runDiagnosticSuite()
        .then(() => {
            console.log('\n✅ Diagnostic suite completed successfully');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n❌ Diagnostic suite failed:', error);
            process.exit(1);
        });
}

export default DeepSeekDiagnostics;
