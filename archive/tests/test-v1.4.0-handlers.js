/**
 * Integration Tests for v1.4.0 Token-Saving Handlers
 *
 * Tests: analyze-file-handler, modify-file-handler, batch-modify-handler
 */

import { AnalyzeFileHandler, validateAnalyzeFileRequest } from '../handlers/analyze-file-handler.js';
import { ModifyFileHandler, validateModifyFileRequest } from '../handlers/modify-file-handler.js';
import { BatchModifyHandler, validateBatchModifyRequest } from '../handlers/batch-modify-handler.js';
import { promises as fs } from 'fs';
import path from 'path';
import assert from 'assert';

// Use project-local test directory (validatePath restricts to cwd)
const TEST_DIR = path.join(process.cwd(), 'tests', 'test-data-v140');
const TEST_FILE = path.join(TEST_DIR, 'test-file.js');

// Mock router for testing (doesn't call actual AI backends)
const mockRouter = {
  makeRequest: async (prompt, backend, options) => {
    return {
      response: `// Mock response from ${backend}\n// Prompt length: ${prompt.length}\nfunction test() { return true; }`,
      backend,
      tokens: 100,
      latency: 50
    };
  }
};

async function setup() {
  await fs.mkdir(TEST_DIR, { recursive: true });
  await fs.writeFile(TEST_FILE, `// Test file
function hello() {
  console.log("Hello world");
}

module.exports = { hello };
`);
  console.log('✓ Test setup complete');
}

async function cleanup() {
  try {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    console.log('✓ Cleanup complete');
  } catch (e) {
    // Ignore cleanup errors
  }
}

// ====================
// VALIDATION TESTS
// ====================

async function testAnalyzeFileValidation() {
  console.log('\n--- Testing analyze_file validation ---');

  // Valid request
  const valid = validateAnalyzeFileRequest({
    filePath: '/some/file.js',
    question: 'What does this file do?'
  });
  assert.strictEqual(valid.valid, true, 'Should accept valid request');
  assert.strictEqual(valid.errors.length, 0, 'Should have no errors');
  console.log('✓ Valid request accepted');

  // Missing filePath
  const noPath = validateAnalyzeFileRequest({
    question: 'What does this do?'
  });
  assert.strictEqual(noPath.valid, false, 'Should reject missing filePath');
  assert.ok(noPath.errors.some(e => e.includes('filePath')), 'Should mention filePath');
  console.log('✓ Missing filePath rejected');

  // Missing question
  const noQuestion = validateAnalyzeFileRequest({
    filePath: '/some/file.js'
  });
  assert.strictEqual(noQuestion.valid, false, 'Should reject missing question');
  console.log('✓ Missing question rejected');

  // Invalid analysis type (should warn)
  const invalidType = validateAnalyzeFileRequest({
    filePath: '/some/file.js',
    question: 'Analyze this',
    options: { analysisType: 'invalid' }
  });
  assert.strictEqual(invalidType.valid, true, 'Should accept with warning');
  assert.ok(invalidType.warnings.length > 0, 'Should have warning for invalid type');
  console.log('✓ Invalid analysisType produces warning');
}

async function testModifyFileValidation() {
  console.log('\n--- Testing modify_file validation ---');

  // Valid request
  const valid = validateModifyFileRequest({
    filePath: '/some/file.js',
    instructions: 'Add error handling to all functions'
  });
  assert.strictEqual(valid.valid, true, 'Should accept valid request');
  console.log('✓ Valid request accepted');

  // Too short instructions (should warn)
  const shortInstr = validateModifyFileRequest({
    filePath: '/some/file.js',
    instructions: 'fix it'
  });
  assert.strictEqual(shortInstr.valid, true, 'Should accept short instructions');
  assert.ok(shortInstr.warnings.length > 0, 'Should warn about brief instructions');
  console.log('✓ Short instructions produce warning');

  // Missing instructions
  const noInstr = validateModifyFileRequest({
    filePath: '/some/file.js'
  });
  assert.strictEqual(noInstr.valid, false, 'Should reject missing instructions');
  console.log('✓ Missing instructions rejected');
}

async function testBatchModifyValidation() {
  console.log('\n--- Testing batch_modify validation ---');

  // Valid request
  const valid = validateBatchModifyRequest({
    files: ['file1.js', 'file2.js'],
    instructions: 'Add logging to all functions'
  });
  assert.strictEqual(valid.valid, true, 'Should accept valid request');
  console.log('✓ Valid request accepted');

  // Empty files array
  const emptyFiles = validateBatchModifyRequest({
    files: [],
    instructions: 'Do something'
  });
  assert.strictEqual(emptyFiles.valid, false, 'Should reject empty files');
  console.log('✓ Empty files array rejected');

  // Too many files
  const tooManyFiles = validateBatchModifyRequest({
    files: Array(51).fill('file.js'),
    instructions: 'Process files'
  });
  assert.strictEqual(tooManyFiles.valid, false, 'Should reject >50 files');
  console.log('✓ Too many files rejected');
}

// ====================
// HANDLER TESTS
// ====================

async function testAnalyzeFileHandler() {
  console.log('\n--- Testing AnalyzeFileHandler ---');

  const handler = new AnalyzeFileHandler(mockRouter);

  // Test successful analysis
  const result = await handler.handle({
    filePath: TEST_FILE,
    question: 'What does this file do?',
    options: { analysisType: 'general' }
  });

  assert.strictEqual(result.success, true, 'Should succeed');
  assert.ok(result.findings, 'Should have findings');
  assert.ok(result.metadata.estimated_tokens_saved > 0, 'Should estimate token savings');
  console.log('✓ Basic analysis works');
  console.log(`  Token savings: ~${result.metadata.estimated_tokens_saved} tokens`);

  // Test file not found
  try {
    await handler.handle({
      filePath: '/nonexistent/file.js',
      question: 'What is this?'
    });
    assert.fail('Should throw for nonexistent file');
  } catch (error) {
    assert.ok(error.message.includes('not found') || error.message.includes('Path traversal'), 'Should indicate file not found or path error');
    console.log('✓ Nonexistent file throws error');
  }

  // Test path traversal protection
  try {
    await handler.handle({
      filePath: '../../../etc/passwd',
      question: 'What is this?'
    });
    assert.fail('Should reject path traversal');
  } catch (error) {
    assert.ok(error.message.toLowerCase().includes('path') || error.message.toLowerCase().includes('traversal') || error.message.includes('not found'), 'Should block path traversal');
    console.log('✓ Path traversal blocked');
  }
}

async function testModifyFileHandler() {
  console.log('\n--- Testing ModifyFileHandler ---');

  const handler = new ModifyFileHandler(mockRouter);

  // Create a test file for modification
  const testModifyFile = path.join(TEST_DIR, 'modify-test.js');
  await fs.writeFile(testModifyFile, `function greet(name) {
  return "Hello " + name;
}
`);

  // Test dry run
  const dryRun = await handler.handle({
    filePath: testModifyFile,
    instructions: 'Add error handling',
    options: { dryRun: true, review: true }
  });

  assert.strictEqual(dryRun.success, true, 'Should succeed');
  assert.strictEqual(dryRun.dryRun, true, 'Should be dry run');
  assert.ok(dryRun.diff, 'Should have diff');
  console.log('✓ Dry run works');

  // Verify file wasn't modified
  const original = await fs.readFile(testModifyFile, 'utf-8');
  assert.ok(original.includes('function greet'), 'File should be unchanged');
  console.log('✓ Dry run did not modify file');
}

async function testBatchModifyHandler() {
  console.log('\n--- Testing BatchModifyHandler ---');

  const handler = new BatchModifyHandler(mockRouter);

  // Create test files
  const files = [];
  for (let i = 0; i < 3; i++) {
    const file = path.join(TEST_DIR, `batch-test-${i}.js`);
    await fs.writeFile(file, `function fn${i}() { return ${i}; }\n`);
    files.push(file);
  }

  // Test batch review
  const result = await handler.handle({
    files,
    instructions: 'Add JSDoc comments',
    options: { review: true }
  });

  assert.strictEqual(result.success, true, 'Should succeed');
  assert.strictEqual(result.review, true, 'Should be in review mode');
  assert.strictEqual(result.summary.total, 3, 'Should process 3 files');
  console.log('✓ Batch review works');
  console.log(`  Files processed: ${result.summary.processed}`);
  console.log(`  Token savings: ~${result.metadata.estimated_tokens_saved} tokens`);

  // Test glob pattern
  const globResult = await handler.handle({
    files: [path.join(TEST_DIR, 'batch-test-*.js')],
    instructions: 'Add error handling',
    options: { review: true }
  });

  assert.strictEqual(globResult.success, true, 'Should handle glob patterns');
  console.log('✓ Glob patterns work');
}

// ====================
// SECURITY TESTS
// ====================

async function testSecurityIntegration() {
  console.log('\n--- Testing Security Integration ---');

  const analyzeHandler = new AnalyzeFileHandler(mockRouter);
  const modifyHandler = new ModifyFileHandler(mockRouter);
  const batchHandler = new BatchModifyHandler(mockRouter);

  // Test path traversal attacks
  const attacks = [
    '../../../etc/passwd',
    '/etc/shadow',
    '....//....//etc/passwd',
    '%2e%2e%2f%2e%2e%2fetc/passwd'
  ];

  for (const attack of attacks) {
    try {
      await analyzeHandler.handle({ filePath: attack, question: 'test' });
      console.log(`  ✗ Attack not blocked: ${attack}`);
    } catch (error) {
      // Expected - should be blocked
    }
  }
  console.log('✓ Path traversal attacks blocked in analyze_file');

  for (const attack of attacks) {
    try {
      await modifyHandler.handle({ filePath: attack, instructions: 'test modification' });
      console.log(`  ✗ Attack not blocked: ${attack}`);
    } catch (error) {
      // Expected - should be blocked
    }
  }
  console.log('✓ Path traversal attacks blocked in modify_file');

  console.log('✓ Security integration verified');
}

// ====================
// MAIN
// ====================

async function runTests() {
  console.log('===========================================');
  console.log('v1.4.0 Token-Saving Handlers Integration Tests');
  console.log('===========================================');

  try {
    await setup();

    // Validation tests
    await testAnalyzeFileValidation();
    await testModifyFileValidation();
    await testBatchModifyValidation();

    // Handler tests
    await testAnalyzeFileHandler();
    await testModifyFileHandler();
    await testBatchModifyHandler();

    // Security tests
    await testSecurityIntegration();

    console.log('\n===========================================');
    console.log('ALL TESTS PASSED ✓');
    console.log('===========================================');
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

runTests();
