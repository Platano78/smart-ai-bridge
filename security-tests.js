/**
 * Security Testing Suite for Smart AI Bridge v1.0.0
 * Tests all CRITICAL security fixes
 */

import { validatePath, validateFileExists, validateDirExists, validatePaths, safeJoin } from './path-security.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test results tracking
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function logTest(testName, passed, details = '') {
  totalTests++;
  if (passed) {
    passedTests++;
    console.log(`✅ PASSED: ${testName}`);
  } else {
    failedTests++;
    console.error(`❌ FAILED: ${testName}`);
    if (details) console.error(`   Details: ${details}`);
  }
}

// ============================================================================
// TEST 1: Path Traversal Protection
// ============================================================================
async function testPathTraversalProtection() {
  console.log('\n🔒 TEST 1: Path Traversal Protection');
  console.log('Testing malicious path patterns...\n');

  const maliciousPaths = [
    '../../../etc/passwd',
    '..\\..\\..\\Windows\\System32\\config\\sam',
    '/etc/shadow',
    'C:\\Windows\\System32\\config\\sam',
    'normal/path/../../../etc/passwd',
    './\0hidden',
    'test/../../outside/file.txt',
    '../../.ssh/id_rsa',
    '../../../root/.bashrc',
    'file.txt\0.jpg',
    '<script>alert("xss")</script>',
    'file|with|pipes',
    'file?with?questions',
    'file*with*wildcards'
  ];

  for (const malPath of maliciousPaths) {
    try {
      await validatePath(malPath);
      logTest(`Block malicious path: ${malPath}`, false, 'Path was NOT blocked!');
    } catch (error) {
      logTest(`Block malicious path: ${malPath}`, true);
    }
  }
}

// ============================================================================
// TEST 2: Valid Path Acceptance
// ============================================================================
async function testValidPathAcceptance() {
  console.log('\n✅ TEST 2: Valid Path Acceptance');
  console.log('Testing legitimate path patterns...\n');

  const validPaths = [
    './test-file.txt',
    'src/index.js',
    'package.json',
    './src/components/Button.jsx',
    'README.md'
  ];

  for (const validPath of validPaths) {
    try {
      const result = await validatePath(validPath, __dirname);
      logTest(`Accept valid path: ${validPath}`, typeof result === 'string' && result.length > 0);
    } catch (error) {
      logTest(`Accept valid path: ${validPath}`, false, `Valid path was rejected: ${error.message}`);
    }
  }
}

// ============================================================================
// TEST 3: validatePaths Batch Validation
// ============================================================================
async function testBatchValidation() {
  console.log('\n📦 TEST 3: Batch Path Validation');
  console.log('Testing multiple path validation...\n');

  // Test valid batch
  try {
    const validBatch = ['./test1.txt', './test2.txt', './test3.txt'];
    const results = await validatePaths(validBatch, __dirname);
    logTest('Batch validate valid paths', Array.isArray(results) && results.length === 3);
  } catch (error) {
    logTest('Batch validate valid paths', false, error.message);
  }

  // Test batch with malicious path
  try {
    const maliciousBatch = ['./test1.txt', '../../../etc/passwd', './test3.txt'];
    await validatePaths(maliciousBatch, __dirname);
    logTest('Batch reject with malicious path', false, 'Malicious batch was accepted!');
  } catch (error) {
    logTest('Batch reject with malicious path', true);
  }
}

// ============================================================================
// TEST 4: safeJoin Protection
// ============================================================================
async function testSafeJoin() {
  console.log('\n🔗 TEST 4: Safe Path Joining');
  console.log('Testing secure path concatenation...\n');

  // Test valid join
  try {
    const result = safeJoin(__dirname, 'src', 'index.js');
    logTest('Safe join valid segments', typeof result === 'string' && result.includes('src'));
  } catch (error) {
    logTest('Safe join valid segments', false, error.message);
  }

  // Test join with traversal attempt
  try {
    safeJoin(__dirname, 'src', '../../../etc/passwd');
    logTest('Safe join blocks traversal', false, 'Traversal attempt was not blocked!');
  } catch (error) {
    logTest('Safe join blocks traversal', true);
  }
}

// ============================================================================
// TEST 5: File/Directory Existence Checks
// ============================================================================
async function testExistenceChecks() {
  console.log('\n📁 TEST 5: File/Directory Existence Checks');
  console.log('Testing file system validation...\n');

  // Test file exists (package.json should exist)
  const packageJsonPath = await validatePath('./package.json', __dirname);
  const fileExists = await validateFileExists(packageJsonPath);
  logTest('Detect existing file (package.json)', fileExists);

  // Test file doesn't exist
  const nonExistentPath = await validatePath('./this-file-does-not-exist.txt', __dirname);
  const fileNotExists = await validateFileExists(nonExistentPath);
  logTest('Detect non-existent file', !fileNotExists);

  // Test directory exists (current directory)
  const dirExists = await validateDirExists(__dirname);
  logTest('Detect existing directory', dirExists);

  // Test directory doesn't exist
  const nonExistentDir = await validatePath('./non-existent-directory', __dirname);
  const dirNotExists = await validateDirExists(nonExistentDir);
  logTest('Detect non-existent directory', !dirNotExists);
}

// ============================================================================
// TEST 6: Null Byte Injection Protection
// ============================================================================
async function testNullByteProtection() {
  console.log('\n🚫 TEST 6: Null Byte Injection Protection');
  console.log('Testing null byte attack prevention...\n');

  const nullBytePaths = [
    'file.txt\0.jpg',
    'test\0hidden',
    './valid/path\0/../../etc/passwd'
  ];

  for (const nullPath of nullBytePaths) {
    try {
      await validatePath(nullPath);
      logTest(`Block null byte: ${nullPath.replace(/\0/g, '\\0')}`, false, 'Null byte was not blocked!');
    } catch (error) {
      logTest(`Block null byte: ${nullPath.replace(/\0/g, '\\0')}`, true);
    }
  }
}

// ============================================================================
// TEST 7: Dangerous Character Filtering
// ============================================================================
async function testDangerousCharacters() {
  console.log('\n⚠️  TEST 7: Dangerous Character Filtering');
  console.log('Testing special character blocking...\n');

  const dangerousChars = [
    { path: 'file<test>.txt', char: '<>' },
    { path: 'file|test.txt', char: '|' },
    { path: 'file?test.txt', char: '?' },
    { path: 'file*test.txt', char: '*' }
  ];

  for (const { path, char } of dangerousChars) {
    try {
      await validatePath(path);
      logTest(`Block dangerous char ${char}`, false, `Character ${char} was not blocked!`);
    } catch (error) {
      logTest(`Block dangerous char ${char}`, true);
    }
  }
}

// ============================================================================
// TEST 8: Input Type Validation
// ============================================================================
async function testInputValidation() {
  console.log('\n🔤 TEST 8: Input Type Validation');
  console.log('Testing input validation...\n');

  // Test null input
  try {
    await validatePath(null);
    logTest('Reject null input', false, 'Null was accepted!');
  } catch (error) {
    logTest('Reject null input', true);
  }

  // Test undefined input
  try {
    await validatePath(undefined);
    logTest('Reject undefined input', false, 'Undefined was accepted!');
  } catch (error) {
    logTest('Reject undefined input', true);
  }

  // Test empty string
  try {
    await validatePath('');
    logTest('Reject empty string', false, 'Empty string was accepted!');
  } catch (error) {
    logTest('Reject empty string', true);
  }

  // Test non-string input
  try {
    await validatePath(123);
    logTest('Reject number input', false, 'Number was accepted!');
  } catch (error) {
    logTest('Reject number input', true);
  }

  // Test object input
  try {
    await validatePath({ path: 'test.txt' });
    logTest('Reject object input', false, 'Object was accepted!');
  } catch (error) {
    logTest('Reject object input', true);
  }
}

// ============================================================================
// TEST 9: Absolute Path Outside Base Directory
// ============================================================================
async function testAbsolutePathRestriction() {
  console.log('\n🔐 TEST 9: Absolute Path Restriction');
  console.log('Testing absolute path blocking...\n');

  const absolutePaths = [
    '/etc/passwd',
    '/var/log/syslog',
    '/root/.ssh/id_rsa',
    'C:\\Windows\\System32\\config\\sam',
    '/usr/bin/sudo'
  ];

  for (const absPath of absolutePaths) {
    try {
      await validatePath(absPath, __dirname);
      logTest(`Block absolute path: ${absPath}`, false, 'Absolute path was accepted!');
    } catch (error) {
      logTest(`Block absolute path: ${absPath}`, true);
    }
  }
}

// ============================================================================
// TEST 10: Complex Traversal Patterns
// ============================================================================
async function testComplexTraversalPatterns() {
  console.log('\n🔄 TEST 10: Complex Traversal Patterns');
  console.log('Testing sophisticated attack patterns...\n');

  const complexPatterns = [
    './valid/../../../etc/passwd',
    'src/../../etc/../../../root/.bashrc',
    'test/./../.././../../etc/shadow',
    'valid/path/../../../../../../etc/passwd',
    './../.env',
    'node_modules/../../.git/config'
  ];

  for (const pattern of complexPatterns) {
    try {
      await validatePath(pattern, __dirname);
      logTest(`Block complex traversal: ${pattern}`, false, 'Complex traversal accepted!');
    } catch (error) {
      logTest(`Block complex traversal: ${pattern}`, true);
    }
  }
}

// ============================================================================
// RUN ALL TESTS
// ============================================================================
async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  SMART AI BRIDGE v1.0.0 - SECURITY TEST SUITE                 ║');
  console.log('║  Testing CRITICAL-001: Path Traversal Vulnerability Fixes     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  const startTime = Date.now();

  await testPathTraversalProtection();
  await testValidPathAcceptance();
  await testBatchValidation();
  await testSafeJoin();
  await testExistenceChecks();
  await testNullByteProtection();
  await testDangerousCharacters();
  await testInputValidation();
  await testAbsolutePathRestriction();
  await testComplexTraversalPatterns();

  const endTime = Date.now();
  const duration = endTime - startTime;

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  TEST RESULTS SUMMARY                                          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`\n📊 Total Tests: ${totalTests}`);
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`⏱️  Duration: ${duration}ms`);
  console.log(`📈 Success Rate: ${((passedTests / totalTests) * 100).toFixed(2)}%`);

  if (failedTests === 0) {
    console.log('\n🎉 ALL SECURITY TESTS PASSED! 🎉');
    console.log('✅ Path traversal protection is working correctly.');
    console.log('✅ Smart AI Bridge v1.0.0 is secure for public release.');
    process.exit(0);
  } else {
    console.log('\n⚠️  SECURITY TESTS FAILED!');
    console.log(`❌ ${failedTests} test(s) failed. Review and fix before release.`);
    process.exit(1);
  }
}

// Run the test suite
runAllTests().catch(error => {
  console.error('\n💥 FATAL ERROR IN TEST SUITE:');
  console.error(error);
  process.exit(1);
});
