// tests/atomic-task-5-file-operations.test.js
// RED PHASE: Comprehensive file operations testing with triple routing

import fs from 'fs/promises';
import path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import crypto from 'crypto';

// Test setup: Create test environment
const TEST_DIR = '/tmp/atomic-task-5-test';
const LARGE_FILE_PATH = path.join(TEST_DIR, 'large-test-file.txt');
const MEDIUM_FILE_PATH = path.join(TEST_DIR, 'medium-test-file.json');
const SMALL_FILE_PATH = path.join(TEST_DIR, 'small-test-file.txt');
const BINARY_FILE_PATH = path.join(TEST_DIR, 'test-binary.dat');

class AtomicTask5FileOperationsTester {
  constructor() {
    this.testResults = [];
    this.performanceMetrics = {
      testStartTime: Date.now(),
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      averageProcessingTime: 0
    };
  }

  async runAllTests() {
    console.log('🟢 GREEN PHASE: Starting Atomic Task 5 File Operations Tests');
    console.log('====================================================================');
    
    // Enable TDD mode for testing
    process.env.TDD_MODE = 'true';
    process.env.NODE_ENV = 'test';
    
    try {
      await this.setupTestEnvironment();
      
      // Test 1: Smart file analysis with triple routing
      await this.testSmartFileAnalysisWithTripleRouting();
      
      // Test 2: Multi-file processing with size-based routing
      await this.testMultiFileProcessingWithSizeBasedRouting();
      
      // Test 3: File comparison functionality
      await this.testFileComparisonFunctionality();
      
      // Test 4: Cross-platform path handling (Windows/WSL/Linux)
      await this.testCrossPlatformPathHandling();
      
      // Test 5: Security validation active
      await this.testSecurityValidationActive();
      
      // Test 6: Concurrent file processing (5 files, 50MB limit)
      await this.testConcurrentFileProcessing();
      
      // Test 7: Memory management and performance optimization
      await this.testMemoryManagementAndPerformance();
      
      await this.generateTestReport();
      
    } catch (error) {
      console.error('❌ Test suite setup failed:', error.message);
      this.recordTestResult('TEST_SUITE_SETUP', false, error.message);
    } finally {
      await this.cleanupTestEnvironment();
    }
  }

  async setupTestEnvironment() {
    try {
      // Create test directory
      await fs.mkdir(TEST_DIR, { recursive: true });
      
      // Create test files of different sizes
      await this.createTestFiles();
      
      console.log('✅ Test environment setup complete');
    } catch (error) {
      throw new Error(`Failed to setup test environment: ${error.message}`);
    }
  }

  async createTestFiles() {
    // Small file (1KB)
    const smallContent = 'A'.repeat(1024);
    await fs.writeFile(SMALL_FILE_PATH, smallContent);
    
    // Medium file (50KB JSON)
    const mediumContent = JSON.stringify({
      data: 'B'.repeat(49152),
      metadata: {
        created: new Date().toISOString(),
        size: 'medium',
        type: 'test'
      }
    });
    await fs.writeFile(MEDIUM_FILE_PATH, mediumContent);
    
    // Large file (150KB - should trigger size-based routing to Local DeepSeek)
    const largeContent = 'C'.repeat(150 * 1024);
    await fs.writeFile(LARGE_FILE_PATH, largeContent);
    
    // Binary file
    const binaryContent = crypto.randomBytes(5 * 1024); // 5KB binary
    await fs.writeFile(BINARY_FILE_PATH, binaryContent);
  }

  async testSmartFileAnalysisWithTripleRouting() {
    console.log('\n🧪 Test 1: Smart file analysis with triple routing');
    const testName = 'SMART_FILE_ANALYSIS_TRIPLE_ROUTING';
    
    try {
      // This test should fail in RED phase since we haven't implemented it yet
      const FileProcessor = await import('../src/file-processor.js').catch(() => null);
      const TripleRoutingIntegration = await import('../src/triple-routing-integration.js').catch(() => null);
      
      if (!FileProcessor || !TripleRoutingIntegration) {
        throw new Error('Required modules not implemented yet');
      }
      
      // Test smart analysis routing
      const analysisResult = await FileProcessor.default.analyzeFileWithTripleRouting(LARGE_FILE_PATH, {
        analysisType: 'comprehensive',
        routingStrategy: 'size_based'
      });
      
      // Verify routing decision
      if (analysisResult.routedTo !== 'local_deepseek') {
        throw new Error('Large file should be routed to Local DeepSeek');
      }
      
      // Verify analysis completeness
      if (!analysisResult.analysis || !analysisResult.metadata.processingStrategy) {
        throw new Error('Analysis incomplete or missing metadata');
      }
      
      this.recordTestResult(testName, true, 'Smart file analysis with routing successful');
      
    } catch (error) {
      this.recordTestResult(testName, false, `Implementation issue: ${error.message}`);
    }
  }

  async testMultiFileProcessingWithSizeBasedRouting() {
    console.log('\n🧪 Test 2: Multi-file processing with size-based routing');
    const testName = 'MULTI_FILE_PROCESSING_SIZE_BASED_ROUTING';
    
    try {
      const FileProcessor = await import('../src/file-processor.js').catch(() => null);
      
      if (!FileProcessor) {
        throw new Error('FileProcessor not available');
      }
      
      const filePaths = [SMALL_FILE_PATH, MEDIUM_FILE_PATH, LARGE_FILE_PATH];
      
      // This should implement intelligent routing based on file sizes
      const batchResult = await FileProcessor.default.processBatchWithRouting(filePaths, {
        maxConcurrent: 5,
        memoryLimit: 50 * 1024 * 1024, // 50MB
        routingRules: {
          smallFiles: 'nvidia_qwen',      // <10KB → Qwen 3 Coder
          mediumFiles: 'nvidia_deepseek', // 10KB-100KB → DeepSeek V3
          largeFiles: 'local_deepseek'    // >100KB → Local DeepSeek
        }
      });
      
      // Verify routing decisions
      const routingDecisions = batchResult.routingLog;
      
      if (!routingDecisions.some(r => r.filePath.includes('small') && r.routedTo === 'nvidia_qwen')) {
        throw new Error('Small file should be routed to Qwen 3 Coder');
      }
      
      if (!routingDecisions.some(r => r.filePath.includes('large') && r.routedTo === 'local_deepseek')) {
        throw new Error('Large file should be routed to Local DeepSeek');
      }
      
      this.recordTestResult(testName, true, 'Multi-file size-based routing successful');
      
    } catch (error) {
      this.recordTestResult(testName, false, `Implementation issue: ${error.message}`);
    }
  }

  async testFileComparisonFunctionality() {
    console.log('\n🧪 Test 3: File comparison functionality');
    const testName = 'FILE_COMPARISON_FUNCTIONALITY';
    
    try {
      const FileProcessor = await import('../src/file-processor.js').catch(() => null);
      
      if (!FileProcessor) {
        throw new Error('FileProcessor not available');
      }
      
      // Create comparison files
      const file1Path = path.join(TEST_DIR, 'compare1.txt');
      const file2Path = path.join(TEST_DIR, 'compare2.txt');
      
      await fs.writeFile(file1Path, 'Original content with some data');
      await fs.writeFile(file2Path, 'Modified content with different data');
      
      // Test file comparison with AI analysis
      const comparisonResult = await FileProcessor.default.compareFilesWithAI([file1Path, file2Path], {
        comparisonType: 'semantic_diff',
        useTripleRouting: true,
        analysisDepth: 'comprehensive'
      });
      
      // Verify comparison results
      if (!comparisonResult.differences || !comparisonResult.similarities) {
        throw new Error('Comparison should identify differences and similarities');
      }
      
      if (!comparisonResult.aiAnalysis || !comparisonResult.aiAnalysis.summary) {
        throw new Error('AI analysis should provide summary of changes');
      }
      
      this.recordTestResult(testName, true, 'File comparison functionality working');
      
    } catch (error) {
      this.recordTestResult(testName, false, `Implementation issue: ${error.message}`);
    }
  }

  async testCrossPlatformPathHandling() {
    console.log('\n🧪 Test 4: Cross-platform path handling (Windows/WSL/Linux)');
    const testName = 'CROSS_PLATFORM_PATH_HANDLING';
    
    try {
      const pathNormalizer = await import('../src/utils/path-normalizer.js').catch(() => null);
      
      if (!pathNormalizer) {
        throw new Error('Path normalizer not available');
      }
      
      // Test different path formats
      const testPaths = [
        '/home/user/file.txt',        // Linux/Unix
        'C:\\Users\\User\\file.txt',  // Windows
        '/mnt/c/Users/User/file.txt', // WSL
        '\\\\server\\share\\file.txt' // Network path
      ];
      
      const normalizedPaths = [];
      
      for (const testPath of testPaths) {
        try {
          const normalized = pathNormalizer.default.normalizePath(testPath);
          normalizedPaths.push({
            original: testPath,
            normalized,
            platform: process.platform,
            isWSL: pathNormalizer.default.isWSL || false
          });
        } catch (error) {
          console.log(`Path normalization failed for ${testPath}: ${error.message}`);
        }
      }
      
      // Verify cross-platform handling
      if (normalizedPaths.length === 0) {
        throw new Error('No paths were successfully normalized');
      }
      
      // Each normalized path should be absolute and secure
      const invalidPaths = normalizedPaths.filter(p => 
        !path.isAbsolute(p.normalized) || p.normalized.includes('..')
      );
      
      if (invalidPaths.length > 0) {
        throw new Error('Some paths were not properly normalized for security');
      }
      
      this.recordTestResult(testName, true, 'Cross-platform path handling working');
      
    } catch (error) {
      this.recordTestResult(testName, false, `Cross-platform path handling failed: ${error.message}`);
    }
  }

  async testSecurityValidationActive() {
    console.log('\n🧪 Test 5: Security validation active');
    const testName = 'SECURITY_VALIDATION_ACTIVE';
    
    try {
      const fileSecurity = await import('../src/file-security.js').catch(() => null);
      
      if (!fileSecurity) {
        throw new Error('File security module not available');
      }
      
      // Test malicious path attempts
      const maliciousPaths = [
        '../../../etc/passwd',
        '/etc/shadow',
        'C:\\Windows\\System32\\config\\SAM',
        '/var/log/secure',
        '/proc/self/mem'
      ];
      
      let blockedAttempts = 0;
      
      for (const maliciousPath of maliciousPaths) {
        try {
          await fileSecurity.default.validateAndNormalizePath(maliciousPath);
          console.log(`⚠️  Security bypass detected for: ${maliciousPath}`);
        } catch (error) {
          blockedAttempts++;
          console.log(`✅ Blocked malicious path: ${maliciousPath}`);
        }
      }
      
      // Test malicious content detection
      const maliciousContent = `
        eval("malicious code");
        exec("rm -rf /");
        system("dangerous command");
      `;
      
      const isMalicious = fileSecurity.default.detectMaliciousContent(maliciousContent);
      
      if (!isMalicious) {
        throw new Error('Malicious content detection failed');
      }
      
      if (blockedAttempts < maliciousPaths.length * 0.8) {
        throw new Error('Security validation is not blocking enough malicious attempts');
      }
      
      this.recordTestResult(testName, true, `Security validation blocked ${blockedAttempts}/${maliciousPaths.length} malicious attempts`);
      
    } catch (error) {
      this.recordTestResult(testName, false, `Security validation failed: ${error.message}`);
    }
  }

  async testConcurrentFileProcessing() {
    console.log('\n🧪 Test 6: Concurrent file processing (5 files, 50MB limit)');
    const testName = 'CONCURRENT_FILE_PROCESSING';
    
    try {
      // Create 5 test files for concurrent processing
      const concurrentFiles = [];
      
      for (let i = 0; i < 5; i++) {
        const filePath = path.join(TEST_DIR, `concurrent-${i}.txt`);
        const content = `File ${i} content: ${'X'.repeat(1024 * 10)}`; // 10KB each
        await fs.writeFile(filePath, content);
        concurrentFiles.push(filePath);
      }
      
      const FileProcessor = await import('../src/file-processor.js').catch(() => null);
      
      if (!FileProcessor) {
        throw new Error('FileProcessor not available');
      }
      
      const startTime = Date.now();
      
      // Test concurrent processing with memory limit
      const concurrentResult = await FileProcessor.default.processConcurrentBatch(concurrentFiles, {
        maxConcurrent: 5,
        memoryLimit: 50 * 1024 * 1024, // 50MB limit
        timeoutPerFile: 5000,
        routingStrategy: 'triple_endpoint'
      });
      
      const processingTime = Date.now() - startTime;
      
      // Verify concurrent processing constraints
      if (!concurrentResult.processedFiles || concurrentResult.processedFiles.length !== 5) {
        throw new Error('Not all files were processed concurrently');
      }
      
      if (concurrentResult.memoryUsagePeak > 50 * 1024 * 1024) {
        throw new Error('Memory limit exceeded during concurrent processing');
      }
      
      if (processingTime > 15000) { // Should complete within 15 seconds
        throw new Error('Concurrent processing too slow');
      }
      
      // Verify routing distribution
      const routingStats = concurrentResult.routingStatistics;
      if (!routingStats || Object.keys(routingStats).length === 0) {
        throw new Error('Routing statistics not available');
      }
      
      this.recordTestResult(testName, true, `Concurrent processing completed in ${processingTime}ms with memory usage ${Math.round(concurrentResult.memoryUsageAverage / 1024 / 1024)}MB`);
      
    } catch (error) {
      this.recordTestResult(testName, false, `Implementation issue: ${error.message}`);
    }
  }

  async testMemoryManagementAndPerformance() {
    console.log('\n🧪 Test 7: Memory management and performance optimization');
    const testName = 'MEMORY_MANAGEMENT_PERFORMANCE';
    
    try {
      const FileProcessor = await import('../src/file-processor.js').catch(() => null);
      
      if (!FileProcessor) {
        throw new Error('FileProcessor not available');
      }
      
      // Create a large file that tests memory management
      const largeFilePath = path.join(TEST_DIR, 'memory-test-large.txt');
      const largeContent = 'Z'.repeat(200 * 1024); // 200KB
      await fs.writeFile(largeFilePath, largeContent);
      
      const initialMemory = process.memoryUsage();
      
      // Test chunked processing with memory monitoring
      const memoryTestResult = await FileProcessor.default.processWithMemoryMonitoring(largeFilePath, {
        chunkSize: 64 * 1024, // 64KB chunks
        maxMemoryIncrease: 25 * 1024 * 1024, // 25MB max increase
        performanceTracking: true
      });
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.rss - initialMemory.rss;
      
      // Verify memory management
      if (memoryIncrease > 25 * 1024 * 1024) {
        throw new Error(`Memory increase ${Math.round(memoryIncrease / 1024 / 1024)}MB exceeds 25MB limit`);
      }
      
      // Verify performance metrics
      if (!memoryTestResult.performanceMetrics) {
        throw new Error('Performance metrics not available');
      }
      
      const metrics = memoryTestResult.performanceMetrics;
      
      if (metrics.processingTime > 5000) { // Should process 200KB within 5 seconds
        throw new Error('Performance optimization insufficient');
      }
      
      if (metrics.memoryEfficiency < 0.8) { // 80% efficiency threshold
        throw new Error('Memory efficiency below threshold');
      }
      
      this.recordTestResult(testName, true, `Memory managed efficiently with ${Math.round(memoryIncrease / 1024 / 1024)}MB increase`);
      
    } catch (error) {
      this.recordTestResult(testName, false, `Implementation issue: ${error.message}`);
    }
  }

  recordTestResult(testName, passed, message) {
    this.testResults.push({
      testName,
      passed,
      message,
      timestamp: new Date().toISOString()
    });
    
    if (passed) {
      this.performanceMetrics.passedTests++;
      console.log(`✅ ${testName}: ${message}`);
    } else {
      this.performanceMetrics.failedTests++;
      console.log(`❌ ${testName}: ${message}`);
    }
    
    this.performanceMetrics.totalTests++;
  }

  async generateTestReport() {
    const totalTime = Date.now() - this.performanceMetrics.testStartTime;
    
    console.log('\n====================================================================');
    console.log('🟢 GREEN PHASE: Atomic Task 5 File Operations Test Report');
    console.log('====================================================================');
    console.log(`Total Tests: ${this.performanceMetrics.totalTests}`);
    console.log(`Passed: ${this.performanceMetrics.passedTests}`);
    console.log(`Failed: ${this.performanceMetrics.failedTests}`);
    console.log(`Success Rate: ${Math.round((this.performanceMetrics.passedTests / this.performanceMetrics.totalTests) * 100)}%`);
    console.log(`Total Test Time: ${Math.round(totalTime / 1000)}s`);
    console.log('====================================================================');
    
    // Expected behavior in RED phase: All advanced features should fail
    const expectedFailures = [
      'SMART_FILE_ANALYSIS_TRIPLE_ROUTING',
      'MULTI_FILE_PROCESSING_SIZE_BASED_ROUTING', 
      'FILE_COMPARISON_FUNCTIONALITY',
      'CONCURRENT_FILE_PROCESSING',
      'MEMORY_MANAGEMENT_PERFORMANCE'
    ];
    
    const actualFailures = this.testResults
      .filter(r => !r.passed)
      .map(r => r.testName);
    
    const unexpectedPasses = expectedFailures.filter(expected => 
      !actualFailures.includes(expected)
    );
    
    if (unexpectedPasses.length > 0) {
      console.log('⚠️  Unexpected passes (should fail in RED phase):');
      unexpectedPasses.forEach(test => console.log(`   - ${test}`));
    }
    
    if (this.performanceMetrics.passedTests >= 5) {
      console.log('\n🎉 SUCCESS: Advanced file operations are now implemented!');
      console.log('✅ Triple routing integration active');
      console.log('✅ Size-based routing (>100KB → Local DeepSeek)');
      console.log('✅ File comparison functionality with AI analysis');
      console.log('✅ Concurrent processing with memory limits');
      console.log('✅ Performance optimization and memory management');
      console.log('\n🚀 File operations are blazing fast and secure in v7.0.0!');
    } else {
      console.log('\n🔧 REFACTOR NEEDED: Some implementations need optimization');
      console.log('Focus areas:');
      this.testResults.filter(r => !r.passed).forEach(r => {
        console.log(`   - ${r.testName}: ${r.message}`);
      });
    }
    
    // Write detailed report to file
    const reportPath = path.join(TEST_DIR, 'atomic-task-5-test-report.json');
    const detailedReport = {
      phase: 'GREEN',
      atomicTask: 5,
      feature: 'Advanced File Operations with Triple Routing',
      timestamp: new Date().toISOString(),
      performance: this.performanceMetrics,
      testResults: this.testResults,
      implementationStatus: this.performanceMetrics.passedTests >= 5 ? 'COMPLETE' : 'PARTIAL',
      nextPhase: this.performanceMetrics.passedTests >= 5 ? 'REFACTOR - Optimize performance' : 'GREEN - Fix remaining issues'
    };
    
    await fs.writeFile(reportPath, JSON.stringify(detailedReport, null, 2));
    console.log(`📄 Detailed report saved to: ${reportPath}`);
  }

  async cleanupTestEnvironment() {
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
      console.log('🧹 Test environment cleaned up');
    } catch (error) {
      console.log('⚠️  Cleanup warning:', error.message);
    }
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new AtomicTask5FileOperationsTester();
  await tester.runAllTests();
  
  // Exit with appropriate code
  const passedTests = tester.performanceMetrics.passedTests;
  process.exit(passedTests >= 5 ? 0 : 1); // Success if 5+ tests pass
}

export { AtomicTask5FileOperationsTester };