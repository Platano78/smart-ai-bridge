#!/usr/bin/env node

/**
 * DeepSeek Real-Time Monitor
 * Continuous monitoring of DeepSeek reliability patterns
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ResponseQualityValidator from '../src/response-quality-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DeepSeekMonitor {
    constructor() {
        this.baseUrl = 'http://172.19.224.1:1234/v1';
        this.logFile = path.join(__dirname, 'deepseek-monitor-log.json');
        this.monitoring = false;
        this.interval = null;
        this.testCount = 0;
        this.results = [];
        this.qualityValidator = new ResponseQualityValidator();
    }

    async startMonitoring(intervalMinutes = 10) {
        console.log('📡 Starting DeepSeek Reliability Monitor...');
        console.log(`⏰ Testing every ${intervalMinutes} minutes`);
        console.log(`💾 Logging to: ${this.logFile}`);
        
        this.monitoring = true;
        
        // Run initial test
        await this.runMonitorTest();
        
        // Set up recurring tests
        this.interval = setInterval(async () => {
            if (this.monitoring) {
                await this.runMonitorTest();
            }
        }, intervalMinutes * 60 * 1000);

        // Keep process alive
        process.on('SIGINT', () => {
            console.log('\n🛑 Stopping monitor...');
            this.stopMonitoring();
            process.exit(0);
        });

        console.log('✅ Monitor active. Press Ctrl+C to stop.');
    }

    async runMonitorTest() {
        this.testCount++;
        const timestamp = new Date().toISOString();
        console.log(`\n🧪 Monitor Test #${this.testCount} - ${timestamp}`);
        
        const testPrompt = `Simple diagnostic test: What are the 3 main benefits of using TypeScript in React development?`;
        
        const startTime = Date.now();
        let testResult = {
            testNumber: this.testCount,
            timestamp,
            prompt: testPrompt,
            status: 'PENDING',
            responseTime: null,
            tokenCount: null,
            errorType: null,
            responseQuality: null
        };

        try {
            const response = await Promise.race([
                this.makeRequest(testPrompt),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('TIMEOUT')), 15000)
                )
            ]);

            const endTime = Date.now();
            testResult.responseTime = endTime - startTime;
            testResult.status = 'SUCCESS';
            testResult.tokenCount = Math.ceil(response.length / 4);
            testResult.responseQuality = this.assessQuality(response);

            console.log(`✅ Success: ${testResult.responseTime}ms | Tokens: ~${testResult.tokenCount} | Quality: ${testResult.responseQuality}/10`);

            // Alert for concerning patterns
            if (testResult.responseTime > 12000) {
                console.log(`🚨 PERFORMANCE ALERT: Response time ${testResult.responseTime}ms is concerning`);
            }

        } catch (error) {
            const endTime = Date.now();
            testResult.responseTime = endTime - startTime;
            testResult.status = 'FAILED';
            testResult.errorType = error.message;

            console.log(`❌ Failed: ${error.message} after ${testResult.responseTime}ms`);
            
            if (error.message === 'TIMEOUT') {
                console.log(`🚨 TIMEOUT ALERT: DeepSeek not responding within 15 seconds`);
            }
        }

        // Store result and update log file
        this.results.push(testResult);
        await this.updateLogFile();
        
        // Generate trend analysis every 5 tests
        if (this.testCount % 5 === 0) {
            this.generateTrendAnalysis();
        }
    }

    async makeRequest(prompt) {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'deepseek-coder-v2-lite-instruct',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 500,
                temperature: 0.1
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP_${response.status}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    assessQuality(response) {
        // Use the new comprehensive validation system
        const context = {
            prompt: 'Simple diagnostic test: What are the 3 main benefits of using TypeScript in React development?'
        };
        
        const validation = this.qualityValidator.validateResponse(response, context);
        
        // Log validation issues for monitoring
        if (validation.isGeneric || validation.score < 7) {
            console.log(`⚠️  QUALITY DEGRADATION: Score ${validation.score}/10`);
            if (validation.isGeneric) {
                console.log(`   Generic response detected`);
            }
            if (validation.warnings.length > 0) {
                console.log(`   Issues: ${validation.warnings.join(', ')}`);
            }
        }
        
        return validation.score;
    }

    async updateLogFile() {
        const logData = {
            startTime: this.results[0]?.timestamp,
            lastUpdate: new Date().toISOString(),
            testCount: this.testCount,
            results: this.results
        };

        await fs.promises.writeFile(this.logFile, JSON.stringify(logData, null, 2));
    }

    generateTrendAnalysis() {
        console.log('\n📈 TREND ANALYSIS:');
        
        const recent = this.results.slice(-5);
        const successful = recent.filter(r => r.status === 'SUCCESS');
        const failed = recent.filter(r => r.status === 'FAILED');
        
        console.log(`Success Rate (last 5): ${successful.length}/5 (${(successful.length/5*100).toFixed(1)}%)`);
        
        if (successful.length > 0) {
            const avgTime = Math.round(successful.reduce((sum, r) => sum + r.responseTime, 0) / successful.length);
            console.log(`Avg Response Time: ${avgTime}ms`);
            
            const avgQuality = (successful.reduce((sum, r) => sum + r.responseQuality, 0) / successful.length).toFixed(1);
            console.log(`Avg Quality Score: ${avgQuality}/10`);
        }

        if (failed.length > 0) {
            const timeouts = failed.filter(r => r.errorType === 'TIMEOUT').length;
            const httpErrors = failed.filter(r => r.errorType?.startsWith('HTTP_')).length;
            
            console.log(`Failure Analysis: ${timeouts} timeouts, ${httpErrors} HTTP errors`);
        }

        // Performance trend
        if (successful.length >= 3) {
            const times = successful.map(r => r.responseTime);
            const isGettingSlower = times[times.length-1] > times[0] * 1.5;
            if (isGettingSlower) {
                console.log('🚨 PERFORMANCE DEGRADING: Response times increasing');
            }
        }
    }

    stopMonitoring() {
        this.monitoring = false;
        if (this.interval) {
            clearInterval(this.interval);
        }
        console.log('🛑 Monitoring stopped');
    }
}

// Command line interface
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    const intervalMinutes = args[0] ? parseInt(args[0]) : 10;
    
    const monitor = new DeepSeekMonitor();
    monitor.startMonitoring(intervalMinutes);
}

export default DeepSeekMonitor;
