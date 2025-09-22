#!/usr/bin/env node

/**
 * 🚀 ENHANCED MKG REAL SERVER INTEGRATION TESTS
 *
 * Tests the actual MKG server v8.1.0 with real tool calls and validation
 * Validates enhanced features work correctly with the actual server implementation
 */

import fs from 'fs/promises';
import path from 'path';
import { performance } from 'perf_hooks';
import { spawn } from 'child_process';

class RealMKGServerTester {
  constructor() {
    this.serverProcess = null;
    this.testResults = [];
    this.performanceMetrics = [];
    this.testFiles = [];
  }

  async startServer() {
    console.log('🚀 Starting MKG Server for integration testing...');

    const serverPath = '/home/platano/project/deepseek-mcp-bridge/server-mecha-king-ghidorah-complete.js';

    return new Promise((resolve, reject) => {
      this.serverProcess = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: '/home/platano/project/deepseek-mcp-bridge'
      });

      let startupOutput = '';
      let startupTimeout = setTimeout(() => {
        reject(new Error('Server startup timeout'));
      }, 10000);

      this.serverProcess.stderr.on('data', (data) => {
        const output = data.toString();
        startupOutput += output;

        // Look for server ready message
        if (output.includes('Mecha King Ghidorah server ready')) {
          clearTimeout(startupTimeout);
          console.log('✅ MKG Server started successfully');
          resolve();
        }
      });

      this.serverProcess.on('error', (error) => {
        clearTimeout(startupTimeout);
        reject(error);
      });
    });
  }

  async stopServer() {
    if (this.serverProcess) {
      console.log('🛑 Stopping MKG Server...');
      this.serverProcess.kill('SIGTERM');

      return new Promise((resolve) => {
        this.serverProcess.on('exit', () => {
          console.log('✅ MKG Server stopped');
          resolve();
        });

        // Force kill after 5 seconds
        setTimeout(() => {
          if (this.serverProcess) {
            this.serverProcess.kill('SIGKILL');
            resolve();
          }
        }, 5000);
      });
    }
  }

  async sendMCPRequest(method, params) {
    if (!this.serverProcess) {
      throw new Error('Server not started');
    }

    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    };

    const startTime = performance.now();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 30000);

      let responseData = '';

      const dataHandler = (data) => {
        responseData += data.toString();

        try {
          // Try to parse complete JSON response
          const lines = responseData.split('\n').filter(line => line.trim());
          for (const line of lines) {
            if (line.trim()) {
              const response = JSON.parse(line);
              if (response.id === request.id) {
                clearTimeout(timeout);
                this.serverProcess.stdout.removeListener('data', dataHandler);

                const duration = performance.now() - startTime;
                resolve({ response, duration });
                return;
              }
            }
          }
        } catch (e) {
          // Not complete JSON yet, continue collecting
        }
      };

      this.serverProcess.stdout.on('data', dataHandler);

      // Send request
      this.serverProcess.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  async createTestFile(filename, content) {
    const filePath = path.join('/tmp', `mkg_test_${filename}`);
    await fs.writeFile(filePath, content);
    this.testFiles.push(filePath);
    return filePath;
  }

  async cleanup() {
    for (const filePath of this.testFiles) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        // File might already be deleted
      }
    }
    this.testFiles = [];
  }

  logResult(testName, success, duration, details = {}) {
    const result = {
      testName,
      success,
      duration,
      timestamp: new Date().toISOString(),
      ...details
    };

    this.testResults.push(result);

    const status = success ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${testName} (${duration.toFixed(2)}ms)`);

    if (!success && details.error) {
      console.log(`   Error: ${details.error}`);
    }

    return result;
  }

  async runTest(testName, testFunction) {
    const startTime = performance.now();

    try {
      const result = await testFunction();
      const duration = performance.now() - startTime;

      return this.logResult(testName, true, duration, result);
    } catch (error) {
      const duration = performance.now() - startTime;

      return this.logResult(testName, false, duration, {
        error: error.message,
        stack: error.stack
      });
    }
  }

  generateReport() {
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(t => t.success).length;
    const failedTests = totalTests - passedTests;

    const avgDuration = this.testResults.reduce((sum, t) => sum + t.duration, 0) / totalTests;
    const fastTests = this.testResults.filter(t => t.duration < 16).length;

    console.log('\n📊 REAL SERVER TEST RESULTS:');
    console.log(`Tests: ${passedTests}/${totalTests} passed`);
    console.log(`Performance: ${fastTests}/${totalTests} under 16ms`);
    console.log(`Average Duration: ${avgDuration.toFixed(2)}ms`);

    if (failedTests > 0) {
      console.log('\n❌ FAILED TESTS:');
      this.testResults.filter(t => !t.success).forEach(t => {
        console.log(`   ${t.testName}: ${t.error}`);
      });
    }

    return {
      summary: {
        total: totalTests,
        passed: passedTests,
        failed: failedTests,
        passRate: Math.round((passedTests / totalTests) * 100),
        avgDuration: avgDuration,
        fastTests: fastTests
      },
      results: this.testResults
    };
  }
}

async function runRealServerTests() {
  const tester = new RealMKGServerTester();

  try {
    // Start server
    await tester.startServer();

    console.log('\n🧪 Running Enhanced MKG Server Real Integration Tests...\n');

    // Test 1: List Tools - Verify all 19 tools are available
    await tester.runTest('list_tools_all_19_available', async () => {
      const { response, duration } = await tester.sendMCPRequest('tools/list', {});

      if (response.error) {
        throw new Error(response.error.message);
      }

      const tools = response.result.tools;
      const toolCount = tools.length;

      if (toolCount !== 19) {
        throw new Error(`Expected 19 tools, got ${toolCount}`);
      }

      // Verify core tools exist
      const coreTools = ['review', 'read', 'health', 'write_files_atomic', 'edit_file', 'validate_changes', 'multi_edit', 'backup_restore', 'ask'];
      const mkgAliases = ['MKG_analyze', 'MKG_generate', 'MKG_review', 'MKG_edit', 'MKG_health'];
      const deepseekAliases = ['deepseek_analyze', 'deepseek_generate', 'deepseek_review', 'deepseek_edit', 'deepseek_health'];

      const allExpectedTools = [...coreTools, ...mkgAliases, ...deepseekAliases];
      const actualToolNames = tools.map(t => t.name);

      for (const expectedTool of allExpectedTools) {
        if (!actualToolNames.includes(expectedTool)) {
          throw new Error(`Missing expected tool: ${expectedTool}`);
        }
      }

      return {
        toolCount,
        coreTools: coreTools.length,
        mkgAliases: mkgAliases.length,
        deepseekAliases: deepseekAliases.length,
        allToolsPresent: true
      };
    });

    // Test 2: Health Check - Verify server health with OPTIMIZER features
    await tester.runTest('health_check_comprehensive', async () => {
      const { response, duration } = await tester.sendMCPRequest('tools/call', {
        name: 'health',
        arguments: {
          check_type: 'comprehensive',
          force_ip_rediscovery: false
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = JSON.parse(response.result.content[0].text);

      if (!result.success) {
        throw new Error('Health check failed');
      }

      return {
        healthStatus: result.all_systems_operational,
        serverVersion: result.health.server.version,
        optimizerEnabled: result.health.optimizer_status?.localhost_priority_enabled,
        cacheInvalidationAvailable: result.health.optimizer_status?.cache_invalidation_available
      };
    });

    // Test 3: Backward Compatibility - Basic edit_file
    await tester.runTest('backward_compatibility_edit_file', async () => {
      const filePath = await tester.createTestFile('backward_compat.js',
        'const oldValue = 42;\nconst message = "Hello World";'
      );

      const { response, duration } = await tester.sendMCPRequest('tools/call', {
        name: 'edit_file',
        arguments: {
          file_path: filePath,
          edits: [
            { find: 'const oldValue = 42;', replace: 'const newValue = 43;' }
          ]
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = JSON.parse(response.result.content[0].text);

      if (!result.success) {
        throw new Error('Edit failed');
      }

      // Verify file was actually modified
      const modifiedContent = await fs.readFile(filePath, 'utf8');
      if (!modifiedContent.includes('const newValue = 43;')) {
        throw new Error('File was not actually modified');
      }

      return {
        editsApplied: result.editsApplied,
        totalEdits: result.totalEdits,
        fileModified: true,
        validationMode: result.mode || 'strict'
      };
    });

    // Test 4: Enhanced Features - Fuzzy Matching in Lenient Mode
    await tester.runTest('enhanced_fuzzy_matching_lenient', async () => {
      const filePath = await tester.createTestFile('fuzzy_test.js',
        'const userName = "alice";\nconst userAge = 25;'
      );

      const { response, duration } = await tester.sendMCPRequest('tools/call', {
        name: 'edit_file',
        arguments: {
          file_path: filePath,
          edits: [
            { find: 'const userName = "alice"', replace: 'const userName = "bob"' } // Missing semicolon - should fuzzy match
          ],
          validation_mode: 'lenient',
          fuzzy_threshold: 0.8,
          suggest_alternatives: true,
          max_suggestions: 3
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = JSON.parse(response.result.content[0].text);

      if (!result.success) {
        throw new Error('Fuzzy matching failed');
      }

      return {
        fuzzyMatches: result.fuzzyMatches?.length || 0,
        editsApplied: result.editsApplied,
        validationMode: result.mode,
        fuzzyThreshold: result.performance?.fuzzyThreshold
      };
    });

    // Test 5: Enhanced Features - Dry Run Mode
    await tester.runTest('enhanced_dry_run_mode', async () => {
      const filePath = await tester.createTestFile('dry_run_test.js',
        'function calculate(a, b) {\n  return a + b;\n}'
      );

      const { response, duration } = await tester.sendMCPRequest('tools/call', {
        name: 'edit_file',
        arguments: {
          file_path: filePath,
          edits: [
            { find: 'function calculate(', replace: 'function calculateTotal(' }
          ],
          validation_mode: 'dry_run',
          fuzzy_threshold: 0.8
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = JSON.parse(response.result.content[0].text);

      if (!result.success) {
        throw new Error('Dry run failed');
      }

      // Verify file was NOT actually modified (dry run)
      const originalContent = await fs.readFile(filePath, 'utf8');
      if (originalContent.includes('calculateTotal')) {
        throw new Error('File was modified during dry run');
      }

      return {
        mode: result.mode,
        preflightAnalysis: !!result.preflightAnalysis,
        fileUnmodified: true,
        editsValidated: result.totalEdits
      };
    });

    // Test 6: Enhanced Read with Verification
    await tester.runTest('enhanced_read_with_verification', async () => {
      const filePath = await tester.createTestFile('verification_test.js',
        'function processData(data) {\n  const result = data.filter(x => x > 0);\n  return data.map(x => x * 2);\n}'
      );

      const { response, duration } = await tester.sendMCPRequest('tools/call', {
        name: 'read',
        arguments: {
          file_paths: [filePath],
          verify_texts: ['function processData', 'const result =', 'return data.map'],
          verification_mode: 'comprehensive',
          fuzzy_threshold: 0.8
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = JSON.parse(response.result.content[0].text);

      if (!result.success) {
        throw new Error('Read with verification failed');
      }

      const verification = result.results[0].verification;
      if (!verification) {
        throw new Error('Verification not performed');
      }

      return {
        verificationEnabled: result.verification_enabled,
        verificationMode: result.verification_mode,
        exactMatches: verification.exact_matches?.length || 0,
        fuzzyMatches: verification.fuzzy_matches?.length || 0,
        noMatches: verification.no_matches?.length || 0,
        totalTextsVerified: verification.requested_texts?.length || 0
      };
    });

    // Test 7: Alias Functionality - MKG_edit
    await tester.runTest('alias_functionality_mkg_edit', async () => {
      const filePath = await tester.createTestFile('mkg_alias_test.js',
        'let count = 0;\nlet total = 100;'
      );

      const { response, duration } = await tester.sendMCPRequest('tools/call', {
        name: 'MKG_edit',
        arguments: {
          file_path: filePath,
          edits: [
            { find: 'let count = 0;', replace: 'let count = 1;' }
          ]
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = JSON.parse(response.result.content[0].text);

      if (!result.success) {
        throw new Error('MKG_edit alias failed');
      }

      return {
        aliasWorking: true,
        editsApplied: result.editsApplied,
        totalEdits: result.totalEdits
      };
    });

    // Test 8: Alias Functionality - deepseek_edit
    await tester.runTest('alias_functionality_deepseek_edit', async () => {
      const filePath = await tester.createTestFile('deepseek_alias_test.js',
        'const API_URL = "localhost";\nconst PORT = 3000;'
      );

      const { response, duration } = await tester.sendMCPRequest('tools/call', {
        name: 'deepseek_edit',
        arguments: {
          file_path: filePath,
          edits: [
            { find: 'const API_URL = "localhost";', replace: 'const API_URL = "production";' }
          ]
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = JSON.parse(response.result.content[0].text);

      if (!result.success) {
        throw new Error('deepseek_edit alias failed');
      }

      return {
        aliasWorking: true,
        editsApplied: result.editsApplied,
        totalEdits: result.totalEdits
      };
    });

    // Test 9: Error Handling with Suggestions
    await tester.runTest('error_handling_with_suggestions', async () => {
      const filePath = await tester.createTestFile('error_suggestions_test.js',
        'const notFoundValue = 123;\nconst anotherValue = 456;\nconst someValue = 789;'
      );

      const { response, duration } = await tester.sendMCPRequest('tools/call', {
        name: 'edit_file',
        arguments: {
          file_path: filePath,
          edits: [
            { find: 'const notFound = 123;', replace: 'const found = 456;' } // Intentionally wrong to trigger suggestions
          ],
          validation_mode: 'strict',
          suggest_alternatives: true,
          max_suggestions: 3
        }
      });

      // We expect this to fail with helpful suggestions
      if (!response.error) {
        throw new Error('Expected error with suggestions, but got success');
      }

      const errorMessage = response.error.message;
      const hasSuggestions = errorMessage.includes('Did you mean') || errorMessage.includes('match');

      if (!hasSuggestions) {
        throw new Error('Error message should include suggestions');
      }

      return {
        errorOccurred: true,
        hasSuggestions: true,
        errorMessage: errorMessage.substring(0, 200) + '...'
      };
    });

    // Test 10: Performance Test - Simple Operations Under 16ms
    await tester.runTest('performance_simple_operations', async () => {
      const filePath = await tester.createTestFile('perf_test.js',
        'const simple = true;'
      );

      // Test simple read
      const readStart = performance.now();
      const readResponse = await tester.sendMCPRequest('tools/call', {
        name: 'read',
        arguments: {
          file_paths: [filePath]
        }
      });
      const readDuration = performance.now() - readStart;

      if (readResponse.error) {
        throw new Error('Read failed: ' + readResponse.error.message);
      }

      // Test simple edit
      const editStart = performance.now();
      const editResponse = await tester.sendMCPRequest('tools/call', {
        name: 'edit_file',
        arguments: {
          file_path: filePath,
          edits: [
            { find: 'const simple = true;', replace: 'const simple = false;' }
          ]
        }
      });
      const editDuration = performance.now() - editStart;

      if (editResponse.error) {
        throw new Error('Edit failed: ' + editResponse.error.message);
      }

      const readUnder16ms = readDuration < 16;
      const editUnder16ms = editDuration < 16;

      return {
        readDuration: Math.round(readDuration * 100) / 100,
        editDuration: Math.round(editDuration * 100) / 100,
        readUnder16ms,
        editUnder16ms,
        bothUnder16ms: readUnder16ms && editUnder16ms
      };
    });

    // Generate and display results
    const report = tester.generateReport();

    console.log('\n🎯 ENHANCED FEATURE VALIDATION:');
    console.log(`✅ All 19 tools available: ${tester.testResults.find(t => t.testName === 'list_tools_all_19_available')?.success ? 'YES' : 'NO'}`);
    console.log(`✅ Fuzzy matching working: ${tester.testResults.find(t => t.testName === 'enhanced_fuzzy_matching_lenient')?.success ? 'YES' : 'NO'}`);
    console.log(`✅ Dry run mode working: ${tester.testResults.find(t => t.testName === 'enhanced_dry_run_mode')?.success ? 'YES' : 'NO'}`);
    console.log(`✅ Read verification working: ${tester.testResults.find(t => t.testName === 'enhanced_read_with_verification')?.success ? 'YES' : 'NO'}`);
    console.log(`✅ Error suggestions working: ${tester.testResults.find(t => t.testName === 'error_handling_with_suggestions')?.success ? 'YES' : 'NO'}`);
    console.log(`✅ MKG aliases working: ${tester.testResults.find(t => t.testName === 'alias_functionality_mkg_edit')?.success ? 'YES' : 'NO'}`);
    console.log(`✅ DeepSeek aliases working: ${tester.testResults.find(t => t.testName === 'alias_functionality_deepseek_edit')?.success ? 'YES' : 'NO'}`);

    if (report.summary.failed > 0) {
      process.exit(1);
    }

  } catch (error) {
    console.error('🚨 Test suite failed:', error.message);
    process.exit(1);
  } finally {
    await tester.cleanup();
    await tester.stopServer();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runRealServerTests().catch(console.error);
}

export { RealMKGServerTester };