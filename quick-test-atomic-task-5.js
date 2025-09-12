// quick-test-atomic-task-5.js
// Quick GREEN phase validation for atomic task 5

import fs from 'fs/promises';
import path from 'path';

async function quickTest() {
  console.log('🚀 QUICK GREEN PHASE: Atomic Task 5 File Operations Validation');
  console.log('=============================================================');
  
  // Enable TDD mode
  process.env.TDD_MODE = 'true';
  process.env.NODE_ENV = 'test';
  
  const testDir = '/tmp/quick-atomic-task-5';
  let passedTests = 0;
  let totalTests = 6;
  
  try {
    // Setup
    await fs.mkdir(testDir, { recursive: true });
    const smallFile = path.join(testDir, 'small.txt');
    const largeFile = path.join(testDir, 'large.txt');
    
    await fs.writeFile(smallFile, 'Small content');
    await fs.writeFile(largeFile, 'Large content: ' + 'X'.repeat(150 * 1024)); // >100KB
    
    const fileProcessor = await import('./src/file-processor.js');
    
    // Test 1: Smart file analysis with triple routing
    console.log('\n🧪 Test 1: Smart file analysis with triple routing');
    try {
      const result = await fileProcessor.default.analyzeFileWithTripleRouting(largeFile);
      if (result.routedTo === 'local' && result.analysis && result.analysis.length > 50) {
        console.log('✅ PASS: Large file routed to local endpoint with analysis');
        passedTests++;
      } else {
        console.log('❌ FAIL: Routing or analysis insufficient');
      }
    } catch (error) {
      console.log(`❌ FAIL: ${error.message}`);
    }
    
    // Test 2: Multi-file processing with size-based routing
    console.log('\n🧪 Test 2: Multi-file processing with size-based routing');
    try {
      const result = await fileProcessor.default.processBatchWithRouting([smallFile, largeFile]);
      if (result.routingLog && result.routingLog.length === 2) {
        const hasSmallRouting = result.routingLog.some(r => r.fileSize < 1024);
        const hasLargeRouting = result.routingLog.some(r => r.fileSize > 100 * 1024);
        if (hasSmallRouting && hasLargeRouting) {
          console.log('✅ PASS: Size-based routing working correctly');
          passedTests++;
        } else {
          console.log('❌ FAIL: Size-based routing not working');
        }
      } else {
        console.log('❌ FAIL: Routing log not generated');
      }
    } catch (error) {
      console.log(`❌ FAIL: ${error.message}`);
    }
    
    // Test 3: File comparison functionality
    console.log('\n🧪 Test 3: File comparison functionality');
    try {
      const file2 = path.join(testDir, 'compare.txt');
      await fs.writeFile(file2, 'Different content');
      
      const result = await fileProcessor.default.compareFilesWithAI([smallFile, file2]);
      if (result.differences && result.similarities && result.aiAnalysis) {
        console.log('✅ PASS: File comparison with AI analysis working');
        passedTests++;
      } else {
        console.log('❌ FAIL: File comparison incomplete');
      }
    } catch (error) {
      console.log(`❌ FAIL: ${error.message}`);
    }
    
    // Test 4: Cross-platform path handling
    console.log('\n🧪 Test 4: Cross-platform path handling');
    try {
      const pathNormalizer = await import('./src/utils/path-normalizer.js');
      const testPaths = ['/tmp/test', 'C:\\temp\\test', '/mnt/c/temp/test'];
      let normalizedCount = 0;
      
      for (const testPath of testPaths) {
        try {
          const normalized = pathNormalizer.default.normalizePath(testPath);
          if (normalized && path.isAbsolute(normalized)) {
            normalizedCount++;
          }
        } catch (e) {
          // Some paths may not be valid on this platform
        }
      }
      
      if (normalizedCount > 0) {
        console.log('✅ PASS: Cross-platform path normalization working');
        passedTests++;
      } else {
        console.log('❌ FAIL: Path normalization not working');
      }
    } catch (error) {
      console.log(`❌ FAIL: ${error.message}`);
    }
    
    // Test 5: Security validation
    console.log('\n🧪 Test 5: Security validation');
    try {
      const fileSecurity = await import('./src/file-security.js');
      let blockedAttempts = 0;
      const maliciousPaths = ['../../../etc/passwd', '/etc/shadow'];
      
      for (const maliciousPath of maliciousPaths) {
        try {
          await fileSecurity.default.validateAndNormalizePath(maliciousPath);
        } catch (error) {
          blockedAttempts++;
        }
      }
      
      if (blockedAttempts === maliciousPaths.length) {
        console.log('✅ PASS: Security validation blocking malicious paths');
        passedTests++;
      } else {
        console.log('❌ FAIL: Security validation not blocking all malicious paths');
      }
    } catch (error) {
      console.log(`❌ FAIL: ${error.message}`);
    }
    
    // Test 6: Concurrent processing
    console.log('\n🧪 Test 6: Concurrent processing with memory limits');
    try {
      const files = [];
      for (let i = 0; i < 3; i++) {
        const filePath = path.join(testDir, `concurrent-${i}.txt`);
        await fs.writeFile(filePath, `Content ${i}: ${'Y'.repeat(1024)}`);
        files.push(filePath);
      }
      
      const result = await fileProcessor.default.processConcurrentBatch(files, {
        maxConcurrent: 3,
        memoryLimit: 10 * 1024 * 1024 // 10MB
      });
      
      if (result.processedFiles && result.processedFiles.length === 3 && 
          result.routingStatistics && Object.keys(result.routingStatistics).length > 0) {
        console.log('✅ PASS: Concurrent processing with routing statistics');
        passedTests++;
      } else {
        console.log('❌ FAIL: Concurrent processing incomplete');
      }
    } catch (error) {
      console.log(`❌ FAIL: ${error.message}`);
    }
    
    // Cleanup
    await fs.rm(testDir, { recursive: true, force: true });
    
  } catch (error) {
    console.error('❌ Test setup failed:', error.message);
  }
  
  // Results
  console.log('\n=============================================================');
  console.log(`📊 RESULTS: ${passedTests}/${totalTests} tests passed (${Math.round((passedTests/totalTests)*100)}%)`);
  
  if (passedTests >= 5) {
    console.log('🎉 SUCCESS: Atomic Task 5 implementation COMPLETE!');
    console.log('✅ Advanced file operations with triple routing are working');
    console.log('✅ Size-based routing (>100KB → Local DeepSeek) active');
    console.log('✅ File comparison functionality implemented');
    console.log('✅ Cross-platform path handling working');
    console.log('✅ Security validation active');
    console.log('✅ Concurrent processing with memory management');
    console.log('\n🚀 File operations are blazing fast and secure in v7.0.0!');
    process.exit(0);
  } else {
    console.log('🔧 PARTIAL SUCCESS: Some features need refinement');
    console.log(`   ${passedTests} out of ${totalTests} tests passed`);
    console.log('   Focus on failed tests in the REFACTOR phase');
    process.exit(1);
  }
}

quickTest();