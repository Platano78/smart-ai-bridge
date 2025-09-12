// debug-atomic-task-5.js
// Quick debug test for atomic task 5

import fs from 'fs/promises';
import path from 'path';

async function debugTest() {
  console.log('🔧 Debug Test: Atomic Task 5 Components');
  
  try {
    // Test 1: Import triple routing integration
    console.log('\n1. Testing triple routing integration import...');
    const tripleRouting = await import('./src/triple-routing-integration.js');
    console.log('✅ Triple routing integration imported successfully');
    
    // Test 2: Import file processor
    console.log('\n2. Testing file processor import...');
    const fileProcessor = await import('./src/file-processor.js');
    console.log('✅ File processor imported successfully');
    
    // Test 3: Create a simple test file
    console.log('\n3. Creating test file...');
    const testDir = '/tmp/debug-atomic-task-5';
    await fs.mkdir(testDir, { recursive: true });
    const testFile = path.join(testDir, 'test.txt');
    await fs.writeFile(testFile, 'Hello World Test Content');
    console.log(`✅ Test file created: ${testFile}`);
    
    // Test 4: Simple file processing
    console.log('\n4. Testing basic file processing...');
    const basicResult = await fileProcessor.default.processFile(testFile);
    console.log(`✅ Basic processing successful: ${basicResult.id}`);
    console.log(`   Content preview: ${basicResult.content.substring(0, 50)}`);
    
    // Test 5: Test method availability
    console.log('\n5. Testing method availability...');
    const methods = [
      'analyzeFileWithTripleRouting',
      'processBatchWithRouting', 
      'compareFilesWithAI',
      'processConcurrentBatch',
      'processWithMemoryMonitoring'
    ];
    
    for (const method of methods) {
      if (typeof fileProcessor.default[method] === 'function') {
        console.log(`✅ Method available: ${method}`);
      } else {
        console.log(`❌ Method missing: ${method}`);
      }
    }
    
    // Test 6: Simple triple routing test (mock mode)
    console.log('\n6. Testing triple routing in mock mode...');
    process.env.TDD_MODE = 'true';
    
    try {
      const tripleResult = await fileProcessor.default.analyzeFileWithTripleRouting(testFile, {
        analysisType: 'general'
      });
      console.log(`✅ Triple routing test successful: ${tripleResult.id}`);
      console.log(`   Routed to: ${tripleResult.routedTo}`);
      console.log(`   Analysis preview: ${tripleResult.analysis.substring(0, 100)}`);
    } catch (error) {
      console.log(`❌ Triple routing failed: ${error.message}`);
    }
    
    // Cleanup
    await fs.rm(testDir, { recursive: true, force: true });
    console.log('\n✅ Debug test completed successfully!');
    
  } catch (error) {
    console.error('❌ Debug test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run debug test
debugTest();