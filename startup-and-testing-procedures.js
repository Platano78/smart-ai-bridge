#!/usr/bin/env node

/**
 * Startup and Testing Procedures for Port 8001 Container Replacement
 * Orchestrates container startup, validation, and comprehensive testing
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { Port8001ContainerValidator } from './validate-port-8001-container.js';
import { ModelInferenceTester } from './test-model-inference-port-8001.js';
import { MKGServerConnectivityTester } from './test-mkg-server-connectivity.js';
import { NVIDIAAPIIntegrationTester } from './test-nvidia-api-integration.js';

class StartupTestingOrchestrator {
    constructor() {
        this.containerName = 'yarn-128k-production';
        this.composeFile = 'docker-compose.yarn-128k-production.yml';
        this.envFile = '.env.port-8001-production';

        this.results = {
            environmentSetup: false,
            containerStartup: false,
            containerValidation: false,
            modelInference: false,
            mkgConnectivity: false,
            nvidiaIntegration: false,
            overallSuccess: false,
            errors: [],
            reports: {}
        };

        this.startTime = Date.now();
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
        const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'startup' ? '🚀' : type === 'test' ? '🧪' : '📋';
        console.log(`${prefix} [${elapsed}s] ${message}`);
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Load environment from file
    loadEnvironment() {
        this.log('Loading environment configuration...', 'startup');

        try {
            const envPath = path.join(process.cwd(), this.envFile);

            if (!fs.existsSync(envPath)) {
                throw new Error(`Environment file not found: ${envPath}`);
            }

            const envContent = fs.readFileSync(envPath, 'utf8');
            const envVars = {};

            envContent.split('\n').forEach(line => {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                    const [key, ...valueParts] = trimmed.split('=');
                    const value = valueParts.join('=').replace(/^['"]|['"]$/g, '');
                    envVars[key] = value;
                    process.env[key] = value;
                }
            });

            this.log(`Loaded ${Object.keys(envVars).length} environment variables`, 'success');
            this.results.environmentSetup = true;
            return true;

        } catch (error) {
            this.log(`Environment setup failed: ${error.message}`, 'error');
            this.results.errors.push(`Environment: ${error.message}`);
            return false;
        }
    }

    // Check prerequisites
    checkPrerequisites() {
        this.log('Checking prerequisites...', 'startup');

        const checks = [
            { name: 'Docker', command: 'docker --version' },
            { name: 'Docker Compose', command: 'docker compose version' },
            { name: 'Node.js', command: 'node --version' },
            { name: 'NVIDIA Docker', command: 'nvidia-docker version || echo "Optional: NVIDIA Docker not found"' }
        ];

        let passed = 0;

        for (const check of checks) {
            try {
                const output = execSync(check.command, { encoding: 'utf8', stdio: 'pipe' });
                this.log(`${check.name}: ${output.trim().split('\n')[0]}`, 'success');
                passed++;
            } catch (error) {
                if (check.name === 'NVIDIA Docker') {
                    this.log(`${check.name}: Not available (optional)`, 'info');
                    passed++; // Don't fail for optional prereq
                } else {
                    this.log(`${check.name}: Failed - ${error.message}`, 'error');
                    this.results.errors.push(`${check.name} not available`);
                }
            }
        }

        return passed >= 3; // Require at least Docker, Compose, and Node.js
    }

    // Stop any existing container
    stopExistingContainer() {
        this.log('Stopping any existing container...', 'startup');

        try {
            // Check if container exists and is running
            const psOutput = execSync(`docker ps -q --filter "name=${this.containerName}"`,
                { encoding: 'utf8', stdio: 'pipe' }).trim();

            if (psOutput) {
                this.log(`Found running container: ${this.containerName}`, 'info');
                execSync(`docker stop ${this.containerName}`, { stdio: 'pipe' });
                this.log('Existing container stopped', 'success');
            }

            // Check if container exists but is stopped
            const psAllOutput = execSync(`docker ps -aq --filter "name=${this.containerName}"`,
                { encoding: 'utf8', stdio: 'pipe' }).trim();

            if (psAllOutput) {
                execSync(`docker rm ${this.containerName}`, { stdio: 'pipe' });
                this.log('Existing container removed', 'success');
            }

            return true;

        } catch (error) {
            // Not necessarily an error if container doesn't exist
            this.log(`Container cleanup completed (${error.message})`, 'info');
            return true;
        }
    }

    // Start the container
    async startContainer() {
        this.log('Starting container with Docker Compose...', 'startup');

        try {
            // Verify compose file exists
            if (!fs.existsSync(this.composeFile)) {
                throw new Error(`Docker Compose file not found: ${this.composeFile}`);
            }

            // Start container in detached mode
            execSync(`docker compose -f ${this.composeFile} up -d`, {
                stdio: 'pipe',
                env: { ...process.env }
            });

            this.log('Container startup command completed', 'success');

            // Wait for container to be in running state
            let attempts = 0;
            const maxAttempts = 30;

            while (attempts < maxAttempts) {
                try {
                    const status = execSync(`docker ps --filter "name=${this.containerName}" --format "{{.Status}}"`,
                        { encoding: 'utf8', stdio: 'pipe' }).trim();

                    if (status && status.includes('Up')) {
                        this.log(`Container is running: ${status}`, 'success');
                        this.results.containerStartup = true;
                        return true;
                    }

                    this.log(`Waiting for container... (${attempts + 1}/${maxAttempts})`, 'startup');
                    await this.sleep(5000);
                    attempts++;

                } catch (error) {
                    attempts++;
                    await this.sleep(5000);
                }
            }

            throw new Error('Container failed to start within timeout period');

        } catch (error) {
            this.log(`Container startup failed: ${error.message}`, 'error');
            this.results.errors.push(`Container startup: ${error.message}`);
            return false;
        }
    }

    // Wait for model loading
    async waitForModelLoading() {
        this.log('Waiting for model loading to complete...', 'startup');

        let attempts = 0;
        const maxAttempts = 60; // 5 minutes maximum
        const healthUrl = 'http://localhost:8001/health';

        while (attempts < maxAttempts) {
            try {
                // Try to reach the health endpoint
                const { default: fetch } = await import('node-fetch');
                const response = await fetch(healthUrl, { timeout: 5000 });

                if (response.ok) {
                    this.log('Model loading completed - health endpoint responding', 'success');
                    return true;
                }

                this.log(`Model loading... (${attempts + 1}/${maxAttempts})`, 'startup');
                await this.sleep(5000);
                attempts++;

            } catch (error) {
                attempts++;
                await this.sleep(5000);
            }
        }

        this.log('Model loading timeout - proceeding with tests anyway', 'error');
        this.results.errors.push('Model loading timeout');
        return false;
    }

    // Run all validation tests
    async runValidationTests() {
        this.log('Starting comprehensive validation tests...', 'test');

        const tests = [
            {
                name: 'Container Health Validation',
                tester: Port8001ContainerValidator,
                key: 'containerValidation'
            },
            {
                name: 'Model Inference Testing',
                tester: ModelInferenceTester,
                key: 'modelInference'
            },
            {
                name: 'MKG Server Connectivity',
                tester: MKGServerConnectivityTester,
                key: 'mkgConnectivity'
            },
            {
                name: 'NVIDIA API Integration',
                tester: NVIDIAAPIIntegrationTester,
                key: 'nvidiaIntegration'
            }
        ];

        for (const test of tests) {
            this.log(`\n${'='.repeat(60)}`);
            this.log(`Running ${test.name}...`, 'test');
            this.log(`${'='.repeat(60)}`);

            try {
                const tester = new test.tester();
                const results = await tester.runFullTestSuite();

                // Determine if test passed based on critical criteria
                let testPassed = false;

                if (test.key === 'containerValidation') {
                    testPassed = results.containerRunning && results.healthCheck;
                } else if (test.key === 'modelInference') {
                    testPassed = results.basicInference && results.codingCapability;
                } else if (test.key === 'mkgConnectivity') {
                    testPassed = results.tripleStatus && results.localEndpoint;
                } else if (test.key === 'nvidiaIntegration') {
                    testPassed = results.apiKeyValid && results.modelsAvailable;
                }

                this.results[test.key] = testPassed;
                this.results.reports[test.key] = results;

                if (testPassed) {
                    this.log(`${test.name} PASSED`, 'success');
                } else {
                    this.log(`${test.name} FAILED`, 'error');
                    this.results.errors.push(`${test.name} failed critical tests`);
                }

            } catch (error) {
                this.log(`${test.name} crashed: ${error.message}`, 'error');
                this.results[test.key] = false;
                this.results.errors.push(`${test.name} crashed: ${error.message}`);
            }

            // Small delay between test suites
            await this.sleep(3000);
        }
    }

    // Generate comprehensive final report
    generateFinalReport() {
        const totalTime = ((Date.now() - this.startTime) / 1000).toFixed(1);

        this.log('\n' + '='.repeat(80), 'startup');
        this.log('FINAL STARTUP AND TESTING REPORT', 'startup');
        this.log('='.repeat(80), 'startup');

        // Overall status
        const criticalTests = [
            this.results.environmentSetup,
            this.results.containerStartup,
            this.results.containerValidation,
            this.results.modelInference
        ];

        const allCriticalPassed = criticalTests.every(test => test === true);
        this.results.overallSuccess = allCriticalPassed;

        this.log(`Total Execution Time: ${totalTime} seconds`);
        this.log(`Overall Status: ${allCriticalPassed ? 'SUCCESS ✅' : 'FAILED ❌'}`);

        // Test results summary
        this.log('\nTEST RESULTS SUMMARY:');
        this.log(`Environment Setup: ${this.results.environmentSetup ? '✅' : '❌'}`);
        this.log(`Container Startup: ${this.results.containerStartup ? '✅' : '❌'}`);
        this.log(`Container Validation: ${this.results.containerValidation ? '✅' : '❌'}`);
        this.log(`Model Inference: ${this.results.modelInference ? '✅' : '❌'}`);
        this.log(`MKG Connectivity: ${this.results.mkgConnectivity ? '✅' : '❌'}`);
        this.log(`NVIDIA Integration: ${this.results.nvidiaIntegration ? '✅' : '❌'}`);

        // Recommendations
        this.log('\nRECOMMENDATIONS:');

        if (allCriticalPassed) {
            this.log('🎉 EXCELLENT! Port 8001 container replacement is ready for production use.');
            this.log('All critical systems are operational and validated.');
        } else {
            this.log('⚠️  ATTENTION REQUIRED: Some critical tests failed.');

            if (!this.results.containerValidation) {
                this.log('- Container health issues detected. Check logs and configuration.');
            }
            if (!this.results.modelInference) {
                this.log('- Model inference problems. Verify model loading and GPU resources.');
            }
            if (!this.results.mkgConnectivity) {
                this.log('- MKG server connectivity issues. Check routing configuration.');
            }
        }

        // Non-critical recommendations
        if (!this.results.nvidiaIntegration) {
            this.log('- NVIDIA API issues detected. Fallback will use local model only.');
        }

        // Error summary
        if (this.results.errors.length > 0) {
            this.log('\nERRORS ENCOUNTERED:');
            this.results.errors.forEach((error, index) => {
                this.log(`${index + 1}. ${error}`);
            });
        }

        // Save comprehensive report
        const reportPath = path.join(process.cwd(), 'startup-testing-comprehensive-report.json');
        const reportData = {
            timestamp: new Date().toISOString(),
            executionTimeSeconds: parseFloat(totalTime),
            overallSuccess: this.results.overallSuccess,
            results: this.results,
            environment: {
                containerName: this.containerName,
                composeFile: this.composeFile,
                envFile: this.envFile
            },
            nextSteps: allCriticalPassed ? [
                'Container is ready for production use',
                'Monitor container health and performance',
                'Test with actual workloads'
            ] : [
                'Address failed tests before production deployment',
                'Review error logs and configuration',
                'Re-run tests after fixes'
            ]
        };

        fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
        this.log(`\n📄 Comprehensive report saved to: ${reportPath}`);

        return this.results.overallSuccess;
    }

    // Main orchestration method
    async executeFullStartupAndTesting() {
        this.log('🚀 Starting Port 8001 Container Replacement Startup and Testing...', 'startup');

        try {
            // Phase 1: Prerequisites and Environment
            this.log('\n--- PHASE 1: Prerequisites and Environment ---', 'startup');

            if (!this.checkPrerequisites()) {
                throw new Error('Prerequisites check failed');
            }

            if (!this.loadEnvironment()) {
                throw new Error('Environment setup failed');
            }

            // Phase 2: Container Management
            this.log('\n--- PHASE 2: Container Management ---', 'startup');

            this.stopExistingContainer();

            if (!await this.startContainer()) {
                throw new Error('Container startup failed');
            }

            // Phase 3: Model Loading
            this.log('\n--- PHASE 3: Model Loading ---', 'startup');

            await this.waitForModelLoading();

            // Phase 4: Comprehensive Testing
            this.log('\n--- PHASE 4: Comprehensive Testing ---', 'startup');

            await this.runValidationTests();

            // Phase 5: Final Report
            this.log('\n--- PHASE 5: Final Report ---', 'startup');

            const success = this.generateFinalReport();

            return success;

        } catch (error) {
            this.log(`CRITICAL FAILURE: ${error.message}`, 'error');
            this.results.errors.push(`Critical failure: ${error.message}`);
            this.generateFinalReport();
            return false;
        }
    }
}

// Utility functions for manual operations
class ManualOperations {
    static log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : '📋';
        console.log(`${prefix} [${timestamp}] ${message}`);
    }

    // Quick container restart
    static async quickRestart() {
        ManualOperations.log('Performing quick container restart...');

        try {
            execSync('docker stop yarn-128k-production', { stdio: 'pipe' });
            execSync('docker rm yarn-128k-production', { stdio: 'pipe' });
            execSync('docker compose -f docker-compose.yarn-128k-production.yml up -d', { stdio: 'pipe' });

            ManualOperations.log('Quick restart completed', 'success');
            return true;
        } catch (error) {
            ManualOperations.log(`Quick restart failed: ${error.message}`, 'error');
            return false;
        }
    }

    // Quick health check
    static async quickHealthCheck() {
        ManualOperations.log('Performing quick health check...');

        try {
            const { default: fetch } = await import('node-fetch');
            const response = await fetch('http://localhost:8001/health', { timeout: 5000 });

            if (response.ok) {
                ManualOperations.log('Health check passed', 'success');
                return true;
            } else {
                ManualOperations.log(`Health check failed: ${response.status}`, 'error');
                return false;
            }
        } catch (error) {
            ManualOperations.log(`Health check error: ${error.message}`, 'error');
            return false;
        }
    }

    // View container logs
    static viewLogs(lines = 50) {
        ManualOperations.log(`Showing last ${lines} lines of container logs...`);

        try {
            const logs = execSync(`docker logs --tail ${lines} yarn-128k-production`, { encoding: 'utf8' });
            console.log(logs);
            return true;
        } catch (error) {
            ManualOperations.log(`Failed to get logs: ${error.message}`, 'error');
            return false;
        }
    }
}

// Command line interface
if (import.meta.url === `file://${process.argv[1]}`) {
    const command = process.argv[2];

    if (command === 'quick-restart') {
        ManualOperations.quickRestart()
            .then(success => process.exit(success ? 0 : 1));
    } else if (command === 'quick-health') {
        ManualOperations.quickHealthCheck()
            .then(success => process.exit(success ? 0 : 1));
    } else if (command === 'logs') {
        const lines = parseInt(process.argv[3]) || 50;
        const success = ManualOperations.viewLogs(lines);
        process.exit(success ? 0 : 1);
    } else {
        // Default: run full startup and testing
        const orchestrator = new StartupTestingOrchestrator();

        orchestrator.executeFullStartupAndTesting()
            .then(success => {
                process.exit(success ? 0 : 1);
            })
            .catch(error => {
                console.error('Startup and testing orchestrator crashed:', error);
                process.exit(2);
            });
    }
}

export { StartupTestingOrchestrator, ManualOperations };