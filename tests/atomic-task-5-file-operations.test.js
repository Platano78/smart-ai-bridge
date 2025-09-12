#!/usr/bin/env node

/**
 * ATOMIC TASK 5: File Operations Enhancement - TDD Test Suite
 * 
 * RED PHASE: Create failing tests that define enhanced file operations requirements
 * 
 * Test Requirements:
 * 1. Smart file analysis with triple routing (size-based + content-based)
 * 2. Multi-file processing with size-based routing (5 files, 50MB limit)
 * 3. File comparison functionality with AI analysis
 * 4. Cross-platform path handling (Windows/WSL/Linux)
 * 5. Security validation active for all operations
 * 6. Concurrent file processing with memory limits
 */

console.error('🔴 ATOMIC TASK 5 - RED PHASE: Testing enhanced file operations with triple routing');

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Test Configuration
const FILE_PROCESSOR_PATH = path.join(projectRoot, 'src', 'file-processor.js');
const TRIPLE_ROUTING_PATH = path.join(projectRoot, 'src', 'triple-routing-integration.js');
const FILE_SECURITY_PATH = path.join(projectRoot, 'src', 'file-security.js');

let testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: []
};

let FileProcessor, tripleRoutingIntegration, fileSecurity;

// Test utility functions
function logTest(testName, passed, message = '') {
  testResults.total++;
  if (passed) {
    testResults.passed++;
    console.error(`✅ ${testName}: PASS ${message ? '- ' + message : ''}`);
  } else {
    testResults.failed++;
    testResults.errors.push(`${testName}: ${message}`);
    console.error(`❌ ${testName}: FAIL ${message ? '- ' + message : ''}`);
  }
}

async function cleanup() {
  // Clean up any test files
  const testFiles = [
    'test-small-file.txt',
    'test-medium-file.js', 
    'test-large-file.txt',
    'test-code-override.py',
    'test-batch-small1.txt',
    'test-batch-small2.js',
    'test-batch-medium1.py',
    'test-batch-medium2.json',
    'test-batch-large1.txt',
    'test-compare-1.js',
    'test-compare-2.js',
    'test-concurrent-concurrent1.txt',
    'test-concurrent-concurrent2.js',
    'test-concurrent-concurrent3.py',
    'test-concurrent-concurrent4.json',
    'test-concurrent-concurrent5.md'
  ];

  for (const file of testFiles) {
    await fs.unlink(path.join(projectRoot, file)).catch(() => {});
  }
}

// Module import test
async function testModuleImports() {
  console.error('\n📦 Testing module imports...');
  
  try {
    // Test file-processor.js exists
    await fs.access(FILE_PROCESSOR_PATH);
    logTest('File processor module exists', true);
    
    // Test triple-routing-integration.js exists
    await fs.access(TRIPLE_ROUTING_PATH);
    logTest('Triple routing integration module exists', true);
    
    // Test file-security.js exists
    await fs.access(FILE_SECURITY_PATH);
    logTest('File security module exists', true);
    
    // Import modules
    const fileProcessorModule = await import(FILE_PROCESSOR_PATH);
    FileProcessor = fileProcessorModule.default;
    logTest('FileProcessor import', !!FileProcessor, 'FileProcessor instance available');
    
    const tripleRoutingModule = await import(TRIPLE_ROUTING_PATH);
    tripleRoutingIntegration = tripleRoutingModule.default;
    logTest('Triple routing integration import', !!tripleRoutingIntegration, 'TripleRoutingIntegration instance available');
    
    const fileSecurityModule = await import(FILE_SECURITY_PATH);
    fileSecurity = fileSecurityModule.default;
    logTest('File security import', !!fileSecurity, 'FileSecurity instance available');
    
  } catch (error) {
    logTest('Module imports', false, error.message);
    return false;
  }
  
  return true;
}

// Test 1: Smart file analysis with triple routing
async function testSmartFileAnalysis() {
  console.error('\n🎯 Testing smart file analysis with triple routing...');
  
  try {
    // Test small file routing
    const smallFilePath = path.join(projectRoot, 'test-small-file.txt');
    const smallContent = 'Hello world\nThis is a small test file.';
    await fs.writeFile(smallFilePath, smallContent);
    
    try {
      const result = await FileProcessor.analyzeFileWithTripleRouting(smallFilePath, {
        analysisType: 'general'
      });
      
      logTest('Small file analysis', !!result.id, 'Generated request ID');
      logTest('Small file routing info', !!result.routedTo, `Routed to: ${result.routedTo}`);
      logTest('Small file analysis result', !!result.analysis, 'Analysis completed');
      
    } catch (error) {
      logTest('Small file analysis', false, `Method not implemented: ${error.message}`);
    } finally {
      await fs.unlink(smallFilePath).catch(() => {});
    }
    
    // Test medium file routing  
    const mediumFilePath = path.join(projectRoot, 'test-medium-file.js');
    const mediumContent = Array(500).fill('console.log("test line");').join('\n');
    await fs.writeFile(mediumFilePath, mediumContent);
    
    try {
      const result = await FileProcessor.analyzeFileWithTripleRouting(mediumFilePath, {
        analysisType: 'code_analysis'
      });
      
      logTest('Medium file analysis', !!result.id, 'Generated request ID');
      logTest('Medium file routing', !!result.routedTo, `Routed to: ${result.routedTo}`);
      
    } catch (error) {
      logTest('Medium file analysis', false, `Method not implemented: ${error.message}`);
    } finally {
      await fs.unlink(mediumFilePath).catch(() => {});
    }
    
    // Test large file routing
    const largeFilePath = path.join(projectRoot, 'test-large-file.txt');
    const largeContent = Array(3000).fill('This is a line in a large test file for routing validation.\n').join('');
    await fs.writeFile(largeFilePath, largeContent);
    
    try {
      const result = await FileProcessor.analyzeFileWithTripleRouting(largeFilePath, {
        analysisType: 'comprehensive'
      });
      
      logTest('Large file analysis', !!result.id, 'Generated request ID');
      logTest('Large file routing', result.routingReason && result.routingReason.includes('large'), 
        `Large file routing applied: ${result.routingReason}`);
      
    } catch (error) {
      logTest('Large file analysis', false, `Method not implemented: ${error.message}`);
    } finally {
      await fs.unlink(largeFilePath).catch(() => {});
    }
    
  } catch (error) {
    logTest('Smart file analysis setup', false, error.message);
  }
}

// Test 2: Multi-file processing with size-based routing
async function testMultiFileProcessing() {
  console.error('\n📁 Testing multi-file processing with size-based routing...');
  
  const testFiles = [];
  
  try {
    // Create test files of different sizes
    const files = [
      { name: 'small1.txt', content: 'Small file 1' },
      { name: 'small2.js', content: 'console.log("small");' },
      { name: 'medium1.py', content: Array(300).fill('# Comment line').join('\n') },
      { name: 'medium2.json', content: JSON.stringify({data: Array(200).fill({id: 1, name: 'test'})}, null, 2) },
      { name: 'large1.txt', content: Array(2000).fill('Large file content line').join('\n') }
    ];

    for (const file of files) {
      const filePath = path.join(projectRoot, `test-batch-${file.name}`);
      await fs.writeFile(filePath, file.content);
      testFiles.push(filePath);
    }
    
    // Test batch processing
    try {
      const filePaths = testFiles;
      const options = {
        maxConcurrent: 5,
        memoryLimit: 50 * 1024 * 1024, // 50MB
        routingRules: {
          smallFiles: 'nvidia_qwen',
          mediumFiles: 'nvidia_deepseek',
          largeFiles: 'local'
        }
      };

      const result = await FileProcessor.processBatchWithRouting(filePaths, options);
      
      logTest('Batch processing structure', !!(result.results && result.errors), 'Has results and errors arrays');
      logTest('Batch metadata', !!result.batchMetadata, 'Has batch metadata');
      logTest('Routing log', !!result.routingLog, 'Has routing log');
      logTest('Memory limit respected', result.batchMetadata?.memoryLimit === 50 * 1024 * 1024, 'Memory limit set correctly');
      
    } catch (error) {
      logTest('Batch processing with routing', false, `Method not implemented: ${error.message}`);
    }
    
  } catch (error) {
    logTest('Multi-file processing setup', false, error.message);
  } finally {
    // Cleanup
    for (const filePath of testFiles) {
      await fs.unlink(filePath).catch(() => {});
    }
  }
}

// Test 3: File comparison functionality
async function testFileComparison() {
  console.error('\n🔍 Testing file comparison functionality...');
  
  const file1Path = path.join(projectRoot, 'test-compare-1.js');
  const file2Path = path.join(projectRoot, 'test-compare-2.js');
  
  try {
    const file1Content = `
function oldFunction() {
  console.log("Old implementation");
  return "old";
}
module.exports = oldFunction;
`;

    const file2Content = `
function newFunction() {
  console.log("New implementation");
  // Added documentation
  return "new";
}
module.exports = newFunction;
`;

    await fs.writeFile(file1Path, file1Content);
    await fs.writeFile(file2Path, file2Content);
    
    try {
      const result = await FileProcessor.compareFilesWithAI([file1Path, file2Path], {
        comparisonType: 'comprehensive',
        analysisDepth: 'detailed'
      });
      
      logTest('File comparison structure', !!(result.differences && result.similarities), 'Has differences and similarities');
      logTest('AI analysis included', !!result.aiAnalysis, 'Has AI analysis');
      logTest('Comparison metadata', !!result.metadata, 'Has comparison metadata');
      
    } catch (error) {
      logTest('File comparison with AI', false, `Method not implemented: ${error.message}`);
    }
    
    // Test error handling
    try {
      await FileProcessor.compareFilesWithAI([file1Path]);
      logTest('File comparison error handling', false, 'Should require exactly 2 files');
    } catch (error) {
      logTest('File comparison error handling', error.message.includes('exactly 2 files'), 'Validates file count');
    }
    
  } catch (error) {
    logTest('File comparison setup', false, error.message);
  } finally {
    await fs.unlink(file1Path).catch(() => {});
    await fs.unlink(file2Path).catch(() => {});
  }
}

// Test 4: Cross-platform path handling
async function testCrossPlatformPaths() {
  console.error('\n🌍 Testing cross-platform path handling...');
  
  try {
    // Test Windows path
    const windowsPath = 'C:\\Users\\test\\file.txt';
    try {
      fileSecurity.validateAndNormalizePathSync(windowsPath);
      logTest('Windows path format', true, 'Path format recognized');
    } catch (error) {
      logTest('Windows path handling', error.message.includes('validation failed') || error.message.includes('not found'), 
        'Handles Windows format (file not found expected)');
    }
    
    // Test WSL path
    const wslPath = '\\\\wsl.localhost\\Ubuntu\\home\\user\\file.txt';
    try {
      fileSecurity.validateAndNormalizePathSync(wslPath);
      logTest('WSL path format', true, 'Path format recognized');
    } catch (error) {
      logTest('WSL path handling', error.message.includes('validation failed') || error.message.includes('not found'), 
        'Handles WSL format (file not found expected)');
    }
    
    // Test Linux path with actual file
    const linuxPath = '/tmp/test-file.txt';
    await fs.writeFile(linuxPath, 'test content').catch(() => {});
    
    try {
      const normalizedPath = fileSecurity.validateAndNormalizePathSync(linuxPath);
      logTest('Linux path handling', normalizedPath === linuxPath, 'Linux paths remain unchanged');
    } catch (error) {
      logTest('Linux path validation', false, `Error: ${error.message}`);
    } finally {
      await fs.unlink(linuxPath).catch(() => {});
    }
    
  } catch (error) {
    logTest('Cross-platform path test setup', false, error.message);
  }
}

// Test 5: Security validation
async function testSecurityValidation() {
  console.error('\n🔒 Testing security validation...');
  
  try {
    // Test malicious paths
    const maliciousPaths = [
      '../../../etc/passwd',
      '/etc/shadow',
      '..\\..\\..\\Windows\\System32\\config\\SAM',
      '/proc/version',
      './test; rm -rf /'
    ];

    let blockedCount = 0;
    for (const maliciousPath of maliciousPaths) {
      try {
        await fileSecurity.validateAndNormalizePath(maliciousPath);
      } catch (error) {
        if (error.message.includes('validation failed') || 
            error.message.includes('security') ||
            error.message.includes('not found')) {
          blockedCount++;
        }
      }
    }
    
    logTest('Malicious path blocking', blockedCount === maliciousPaths.length, 
      `Blocked ${blockedCount}/${maliciousPaths.length} malicious paths`);
    
    // Test file size validation
    const mockStats = { size: 1024 * 1024 * 200 }; // 200MB - over limit
    const isValid = fileSecurity.isSafeFileSize(mockStats);
    logTest('File size validation', isValid === false, 'Rejects files over 100MB limit');
    
    // Test malicious content detection
    const maliciousContent = `
        eval(dangerous_code);
        system("rm -rf /");
        $_POST['exploit'];
        base64_decode($malicious);
    `;
    
    const isDetected = fileSecurity.detectMaliciousContent(maliciousContent);
    logTest('Malicious content detection', isDetected === true, 'Detects malicious patterns');
    
  } catch (error) {
    logTest('Security validation test', false, error.message);
  }
}

// Test 6: Concurrent processing with memory limits
async function testConcurrentProcessing() {
  console.error('\n⚡ Testing concurrent file processing...');
  
  const concurrentTestFiles = [];
  
  try {
    // Create multiple test files for concurrent processing
    const files = [
      { name: 'concurrent1.txt', content: 'File 1 content' },
      { name: 'concurrent2.js', content: 'console.log("File 2");' },
      { name: 'concurrent3.py', content: 'print("File 3")' },
      { name: 'concurrent4.json', content: '{"file": 4}' },
      { name: 'concurrent5.md', content: '# File 5\nMarkdown content' }
    ];

    for (const file of files) {
      const filePath = path.join(projectRoot, `test-concurrent-${file.name}`);
      await fs.writeFile(filePath, file.content);
      concurrentTestFiles.push(filePath);
    }
    
    try {
      const options = {
        maxConcurrent: 5,
        memoryLimit: 50 * 1024 * 1024, // 50MB limit
        timeoutPerFile: 5000, // 5s per file
        routingStrategy: 'triple_endpoint'
      };

      const result = await FileProcessor.processConcurrentBatch(concurrentTestFiles, options);
      
      logTest('Concurrent processing structure', !!(result.processedFiles && result.failedFiles), 'Has processed and failed files');
      logTest('Memory tracking', result.memoryUsagePeak !== undefined && result.memoryUsageAverage !== undefined, 
        'Tracks memory usage');
      logTest('Routing statistics', !!result.routingStatistics, 'Has routing statistics');
      
    } catch (error) {
      logTest('Concurrent processing', false, `Method not implemented: ${error.message}`);
    }
    
  } catch (error) {
    logTest('Concurrent processing setup', false, error.message);
  } finally {
    for (const filePath of concurrentTestFiles) {
      await fs.unlink(filePath).catch(() => {});
    }
  }
}

// Test 7: Performance metrics
async function testPerformanceMetrics() {
  console.error('\n📊 Testing performance metrics...');
  
  try {
    // Test routing statistics
    const routingStats = tripleRoutingIntegration.getRoutingStatistics();
    
    logTest('Routing statistics structure', 
      typeof routingStats.totalRoutingDecisions === 'number' && 
      !!routingStats.routingDistribution, 
      'Has routing metrics');
    
    logTest('Load balancing enabled', routingStats.loadBalancing === 'enabled', 
      'Load balancing is active');
    
    // Test file processor statistics
    const perfStats = FileProcessor.getPerformanceStats();
    
    logTest('Performance statistics structure',
      typeof perfStats.totalProcessed === 'number' &&
      typeof perfStats.averageProcessingTime === 'number',
      'Has performance metrics');
    
    logTest('Memory usage tracking', !!perfStats.memoryUsage, 'Tracks memory usage');
    
  } catch (error) {
    logTest('Performance metrics', false, `Method not implemented: ${error.message}`);
  }
}

// Main test runner
async function runTests() {
  console.error('🧪 ATOMIC TASK 5: File Operations Enhancement with Triple Routing');
  console.error('='.repeat(80));
  
  await cleanup(); // Start clean
  
  const moduleImported = await testModuleImports();
  
  if (moduleImported) {
    await testSmartFileAnalysis();
    await testMultiFileProcessing();
    await testFileComparison();
    await testCrossPlatformPaths();
    await testSecurityValidation();
    await testConcurrentProcessing();
    await testPerformanceMetrics();
  }
  
  await cleanup(); // Clean up after tests
  
  // Final results
  console.error('\n' + '='.repeat(80));
  console.error('🏁 TEST RESULTS:');
  console.error(`✅ PASSED: ${testResults.passed}`);
  console.error(`❌ FAILED: ${testResults.failed}`);
  console.error(`📊 TOTAL: ${testResults.total}`);
  
  if (testResults.failed > 0) {
    console.error('\n🔴 FAILED TESTS:');
    testResults.errors.forEach(error => console.error(`   • ${error}`));
  }
  
  console.error('\n🎯 RED PHASE COMPLETE - Now implement GREEN phase to make tests pass!');
  
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run the tests
runTests().catch(error => {
  console.error('Fatal test error:', error);
  process.exit(1);
});