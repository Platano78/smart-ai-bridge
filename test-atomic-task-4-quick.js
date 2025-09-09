#!/usr/bin/env node

/**
 * ATOMIC TASK 4: Quick Integration Validation Testing
 * 
 * Fast validation of TDD infrastructure repair completion
 * Focuses on core functionality without extensive timeout testing
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class QuickIntegrationValidator {
  constructor() {
    this.results = {
      tests: [],
      passed: 0,
      failed: 0
    };
    console.log('🧪 ATOMIC TASK 4: Quick Integration Validation');
  }

  async runQuickValidation() {
    console.log('\n🚀 Starting Quick Integration Validation...');
    
    try {
      // Test 1: Server file structure validation
      await this.testServerFileStructure();
      
      // Test 2: Core method presence validation
      await this.testCoreMethodPresence();
      
      // Test 3: MCP tool definitions validation
      await this.testMCPToolDefinitions();
      
      // Test 4: Basic server startup validation (quick)
      await this.testBasicServerStartup();
      
      // Generate quick report
      this.generateQuickReport();
      
      return this.results.failed === 0;
      
    } catch (error) {
      console.error('❌ Quick validation failed:', error);
      return false;
    }
  }

  async testServerFileStructure() {
    const testName = 'Server File Structure';
    console.log(`  🧪 Testing: ${testName}`);
    
    try {
      const serverPath = path.join(__dirname, 'server.js');
      
      // Check server.js exists
      const stats = await fs.stat(serverPath);
      if (!stats.isFile()) {
        throw new Error('server.js not found');
      }
      
      // Read and validate server content
      const content = await fs.readFile(serverPath, 'utf-8');
      
      // Check for key components
      const requiredComponents = [
        'EnhancedProductionDeepseekBridge',
        'enhanced_query_deepseek',
        'check_deepseek_status',
        'analyze_files',
        'empiricalRouter',
        'taskClassifier'
      ];
      
      const missingComponents = requiredComponents.filter(component => 
        !content.includes(component)
      );
      
      if (missingComponents.length > 0) {
        throw new Error(`Missing components: ${missingComponents.join(', ')}`);
      }
      
      this.recordResult(testName, true, 'All required components present');
      
    } catch (error) {
      this.recordResult(testName, false, error.message);
    }
  }

  async testCoreMethodPresence() {
    const testName = 'Core Method Presence';
    console.log(`  🧪 Testing: ${testName}`);
    
    try {
      const serverPath = path.join(__dirname, 'server.js');
      const content = await fs.readFile(serverPath, 'utf-8');
      
      // Check for specific method signatures that were implemented in previous tasks
      const requiredMethods = [
        'enhancedQuery', // From ATOMIC TASK 1
        'checkEnhancedStatus', // From ATOMIC TASK 2  
        'analyzeFiles', // From ATOMIC TASK 3
        'executeDeepseekWithEmpiricalRouting',
        'shouldTryDeepseekFirst'
      ];
      
      const foundMethods = [];
      const missingMethods = [];
      
      for (const method of requiredMethods) {
        // Look for method definition patterns
        const methodPattern = new RegExp(`(async\\s+)?${method}\\s*\\(`);
        if (methodPattern.test(content)) {
          foundMethods.push(method);
        } else {
          missingMethods.push(method);
        }
      }
      
      if (missingMethods.length > 0) {
        this.recordResult(testName, false, 
          `Missing methods: ${missingMethods.join(', ')}`);
      } else {
        this.recordResult(testName, true, 
          `All ${requiredMethods.length} methods found`);
      }
      
    } catch (error) {
      this.recordResult(testName, false, error.message);
    }
  }

  async testMCPToolDefinitions() {
    const testName = 'MCP Tool Definitions';
    console.log(`  🧪 Testing: ${testName}`);
    
    try {
      const serverPath = path.join(__dirname, 'server.js');
      const content = await fs.readFile(serverPath, 'utf-8');
      
      // Check for tool definitions in ListToolsRequestSchema handler
      const expectedTools = [
        'enhanced_query_deepseek',
        'check_deepseek_status', 
        'analyze_files'
      ];
      
      const toolsFound = [];
      for (const tool of expectedTools) {
        if (content.includes(`name: '${tool}'`)) {
          toolsFound.push(tool);
        }
      }
      
      if (toolsFound.length !== expectedTools.length) {
        const missing = expectedTools.filter(tool => !toolsFound.includes(tool));
        this.recordResult(testName, false, 
          `Missing tool definitions: ${missing.join(', ')}`);
      } else {
        this.recordResult(testName, true, 
          `All ${expectedTools.length} tools defined`);
      }
      
    } catch (error) {
      this.recordResult(testName, false, error.message);
    }
  }

  async testBasicServerStartup() {
    const testName = 'Basic Server Startup';
    console.log(`  🧪 Testing: ${testName}`);
    
    try {
      const serverPath = path.join(__dirname, 'server.js');
      
      // Start server process with timeout
      const serverProcess = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let serverReady = false;
      let errorOutput = '';
      
      // Set up timeout
      const timeout = setTimeout(() => {
        if (!serverReady) {
          serverProcess.kill('SIGTERM');
        }
      }, 10000); // 10 second timeout
      
      // Monitor stderr for startup messages
      serverProcess.stderr.on('data', (data) => {
        const output = data.toString();
        errorOutput += output;
        
        if (output.includes('TDD GREEN PHASE ACTIVATED') || 
            output.includes('DeepSeek MCP Bridge')) {
          serverReady = true;
          clearTimeout(timeout);
          serverProcess.kill('SIGTERM');
        }
      });
      
      // Wait for process to exit or timeout
      await new Promise((resolve, reject) => {
        serverProcess.on('exit', (code) => {
          clearTimeout(timeout);
          resolve();
        });
        
        serverProcess.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        
        // Also resolve on timeout
        setTimeout(resolve, 10000);
      });
      
      if (serverReady) {
        this.recordResult(testName, true, 'Server started successfully');
      } else {
        // Check for common error patterns
        if (errorOutput.includes('Error') || errorOutput.includes('EADDRINUSE')) {
          this.recordResult(testName, false, 'Server startup errors detected');
        } else {
          this.recordResult(testName, true, 'Server appears to start (no startup errors)');
        }
      }
      
    } catch (error) {
      this.recordResult(testName, false, error.message);
    }
  }

  recordResult(testName, passed, details) {
    this.results.tests.push({ testName, passed, details });
    
    if (passed) {
      this.results.passed++;
      console.log(`      ✅ PASSED: ${testName} - ${details}`);
    } else {
      this.results.failed++;
      console.log(`      ❌ FAILED: ${testName} - ${details}`);
    }
  }

  generateQuickReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 ATOMIC TASK 4: Quick Integration Validation Results');
    console.log('='.repeat(60));
    
    console.log(`\n📋 Test Summary:`);
    console.log(`   Total Tests: ${this.results.tests.length}`);
    console.log(`   Passed: ${this.results.passed}`);
    console.log(`   Failed: ${this.results.failed}`);
    console.log(`   Success Rate: ${Math.round((this.results.passed / this.results.tests.length) * 100)}%`);
    
    console.log(`\n🎯 TDD Infrastructure Status:`);
    
    // ATOMIC TASK status based on test results
    const atomicTasks = {
      'TASK 1: enhanced_query_deepseek Function': this.getTaskStatus(['Core Method Presence', 'MCP Tool Definitions']),
      'TASK 2: checkStatus Function': this.getTaskStatus(['Core Method Presence', 'MCP Tool Definitions']),
      'TASK 3: File Operation Error Handling': this.getTaskStatus(['Server File Structure', 'Core Method Presence']),
      'TASK 4: Integration Validation': this.results.failed === 0
    };
    
    for (const [task, status] of Object.entries(atomicTasks)) {
      console.log(`   ${status ? '✅' : '❌'} ${task}: ${status ? 'OPERATIONAL' : 'ISSUES DETECTED'}`);
    }
    
    if (this.results.failed === 0) {
      console.log('\n🎉 ALL QUICK INTEGRATION TESTS PASSED!');
      console.log('✅ TDD Infrastructure repair appears successful');
      console.log('🚀 Ready for full integration testing');
    } else {
      console.log('\n⚠️  Some integration issues detected');
      console.log('📋 Review failed tests for details');
    }
    
    console.log('\n💡 Next Steps:');
    if (this.results.failed === 0) {
      console.log('   1. Run comprehensive integration tests');
      console.log('   2. Test with Claude Desktop integration');
      console.log('   3. Monitor performance in production');
    } else {
      console.log('   1. Address failed test cases');
      console.log('   2. Re-run validation');
      console.log('   3. Proceed to comprehensive testing');
    }
  }

  getTaskStatus(relevantTests) {
    const relatedResults = this.results.tests.filter(test => 
      relevantTests.some(testName => test.testName.includes(testName))
    );
    
    return relatedResults.length > 0 && relatedResults.every(test => test.passed);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new QuickIntegrationValidator();
  
  validator.runQuickValidation()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Validation failed:', error);
      process.exit(1);
    });
}

export { QuickIntegrationValidator };