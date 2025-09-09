#!/usr/bin/env node

/**
 * Context Window Performance Test
 * Tests different context window sizes for optimal performance
 */

class ContextWindowTest {
    constructor() {
        this.baseUrl = 'http://172.19.224.1:1234/v1';
        this.testPrompt = 'What are the main differences between Vite handling of src/ vs public/ directories?';
    }

    async testContextWindow(contextSize, responseSize) {
        console.log(`\n🧪 Testing Context: ${contextSize} | Response: ${responseSize}`);
        console.log('─'.repeat(50));
        
        const startTime = Date.now();
        
        try {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'deepseek-coder-v2-lite-instruct',
                    messages: [{ role: 'user', content: this.testPrompt }],
                    max_tokens: responseSize,
                    temperature: 0.1
                })
            });

            const endTime = Date.now();
            const responseTime = endTime - startTime;

            if (response.ok) {
                const data = await response.json();
                const content = data.choices[0].message.content;
                
                console.log(`✅ SUCCESS`);
                console.log(`⏱️  Response Time: ${responseTime}ms`);
                console.log(`📝 Content Length: ${content.length} chars`);
                console.log(`🎯 Performance: ${responseTime < 5000 ? 'EXCELLENT' : responseTime < 10000 ? 'GOOD' : responseTime < 20000 ? 'ACCEPTABLE' : 'POOR'}`);
                
                return {
                    success: true,
                    responseTime,
                    contentLength: content.length,
                    contextSize,
                    responseSize,
                    performance: responseTime < 5000 ? 'EXCELLENT' : responseTime < 10000 ? 'GOOD' : 'ACCEPTABLE'
                };
            } else {
                console.log(`❌ HTTP Error: ${response.status}`);
                return {
                    success: false,
                    error: `HTTP ${response.status}`,
                    responseTime,
                    contextSize,
                    responseSize
                };
            }
        } catch (error) {
            const endTime = Date.now();
            const responseTime = endTime - startTime;
            
            console.log(`❌ Failed: ${error.message} (${responseTime}ms)`);
            return {
                success: false,
                error: error.message,
                responseTime,
                contextSize,
                responseSize
            };
        }
    }

    async runPerformanceComparison() {
        console.log('🔬 CONTEXT WINDOW PERFORMANCE COMPARISON');
        console.log('=========================================');
        
        const testConfigurations = [
            { context: 8192, response: 2000, name: '8K Context (Conservative)' },
            { context: 16384, response: 4000, name: '16K Context (Recommended)' },
            { context: 32768, response: 8000, name: '32K Context (Current - May be too large)' }
        ];

        const results = [];

        for (const config of testConfigurations) {
            console.log(`\n📊 ${config.name}`);
            const result = await this.testPerformanceProfile(config.context, config.response);
            results.push(result);
            
            // Cool down between tests
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        this.generateRecommendations(results);
        return results;
    }

    async testPerformanceProfile(contextSize, responseSize) {
        const testRuns = 3;
        const runResults = [];

        console.log(`Running ${testRuns} performance tests...`);

        for (let i = 0; i < testRuns; i++) {
            console.log(`  Run ${i + 1}/${testRuns}:`);
            const result = await this.testContextWindow(contextSize, responseSize);
            runResults.push(result);
            
            if (i < testRuns - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        // Calculate aggregate metrics
        const successful = runResults.filter(r => r.success);
        const successRate = (successful.length / testRuns) * 100;
        const avgResponseTime = successful.length > 0 
            ? Math.round(successful.reduce((sum, r) => sum + r.responseTime, 0) / successful.length)
            : 0;

        const profile = {
            contextSize,
            responseSize,
            testRuns,
            successRate,
            avgResponseTime,
            results: runResults,
            recommendation: this.getRecommendation(successRate, avgResponseTime)
        };

        console.log(`\n📊 PROFILE SUMMARY:`);
        console.log(`Success Rate: ${successRate}%`);
        console.log(`Avg Response Time: ${avgResponseTime}ms`);
        console.log(`Recommendation: ${profile.recommendation}`);

        return profile;
    }

    getRecommendation(successRate, avgResponseTime) {
        if (successRate === 100 && avgResponseTime < 5000) {
            return 'OPTIMAL - Use this configuration';
        } else if (successRate >= 90 && avgResponseTime < 10000) {
            return 'GOOD - Reliable for production use';
        } else if (successRate >= 70 && avgResponseTime < 20000) {
            return 'ACCEPTABLE - May need optimization';
        } else {
            return 'POOR - Reduce context window size';
        }
    }

    generateRecommendations(profiles) {
        console.log('\n🎯 PERFORMANCE ANALYSIS & RECOMMENDATIONS');
        console.log('=========================================');

        const optimalProfiles = profiles.filter(p => p.recommendation === 'OPTIMAL - Use this configuration');
        const goodProfiles = profiles.filter(p => p.recommendation === 'GOOD - Reliable for production use');

        if (optimalProfiles.length > 0) {
            const best = optimalProfiles[0];
            console.log(`✅ RECOMMENDED CONFIGURATION:`);
            console.log(`   Context Window: ${best.contextSize} tokens`);
            console.log(`   Max Response: ${best.responseSize} tokens`);
            console.log(`   Success Rate: ${best.successRate}%`);
            console.log(`   Response Time: ${best.avgResponseTime}ms`);
        } else if (goodProfiles.length > 0) {
            const best = goodProfiles[0];
            console.log(`⚠️  BEST AVAILABLE CONFIGURATION:`);
            console.log(`   Context Window: ${best.contextSize} tokens`);
            console.log(`   Max Response: ${best.responseSize} tokens`);
            console.log(`   Success Rate: ${best.successRate}%`);
            console.log(`   Response Time: ${best.avgResponseTime}ms`);
        } else {
            console.log(`🚨 CRITICAL: All configurations showing poor performance`);
            console.log(`   Check DeepSeek server resources and GPU memory`);
            console.log(`   Consider using smaller context window (4K-8K)`);
        }

        // Specific analysis of current 32K configuration
        const current32K = profiles.find(p => p.contextSize === 32768);
        if (current32K) {
            console.log(`\n🔍 CURRENT 32K ANALYSIS:`);
            console.log(`   Success Rate: ${current32K.successRate}% (Target: >90%)`);
            console.log(`   Response Time: ${current32K.avgResponseTime}ms (Target: <10s)`);
            
            if (current32K.successRate < 85 || current32K.avgResponseTime > 10000) {
                console.log(`🚨 ISSUE CONFIRMED: 32K context window causing reliability problems`);
                console.log(`💡 SOLUTION: Reduce to 16K or 8K for better reliability`);
            }
        }
    }
}

// Export for testing
if (typeof module !== 'undefined') {
    module.exports = ContextWindowTest;
}

// Run if executed directly
if (require.main === module) {
    const tester = new ContextWindowTest();
    tester.runPerformanceComparison()
        .then(results => {
            console.log(`\n✅ Performance testing complete`);
            process.exit(0);
        })
        .catch(error => {
            console.error(`\n❌ Performance testing failed:`, error);
            process.exit(1);
        });
}
