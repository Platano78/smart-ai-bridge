import { logger } from './mcp-logger.js';

/**
 * Security Hardening Test Suite
 * Tests all HIGH, MEDIUM, LOW fixes
 */

import { authManager } from './auth-manager.js';
import { RateLimiter } from './rate-limiter.js';
import { InputValidator } from './input-validator.js';
import { ErrorSanitizer } from './error-sanitizer.js';

async function runAllTests() {
  logger.info('🧪 Running Security Hardening Test Suite\n');

  let passed = 0;
  let failed = 0;
  const results = [];

  // Authentication Tests
  logger.info('📋 Testing Authentication...');
  try {
    // Test 1: Should reject invalid token
    if (!authManager.isValidToken('invalid-token-12345')) {
      logger.info('  ✅ Invalid token rejected');
      passed++;
      results.push({ test: 'AUTH-001', status: 'PASS', description: 'Invalid token rejected' });
    } else {
      logger.info('  ❌ Invalid token accepted (should reject)');
      failed++;
      results.push({ test: 'AUTH-001', status: 'FAIL', description: 'Invalid token accepted' });
    }

    // Test 2: Should accept master token
    process.env.MCP_AUTH_TOKEN = 'test-master-token-123';
    authManager.initializeMasterToken();
    if (authManager.isValidToken('test-master-token-123')) {
      logger.info('  ✅ Valid master token accepted');
      passed++;
      results.push({ test: 'AUTH-002', status: 'PASS', description: 'Master token accepted' });
    } else {
      logger.info('  ❌ Valid token rejected (should accept)');
      failed++;
      results.push({ test: 'AUTH-002', status: 'FAIL', description: 'Master token rejected' });
    }

    // Test 3: Tool permission check
    if (authManager.hasToolPermission('test-master-token-123', 'review')) {
      logger.info('  ✅ Tool permission granted correctly');
      passed++;
      results.push({ test: 'AUTH-003', status: 'PASS', description: 'Tool permission granted' });
    } else {
      logger.info('  ❌ Tool permission denied (should grant)');
      failed++;
      results.push({ test: 'AUTH-003', status: 'FAIL', description: 'Tool permission denied' });
    }

    // Test 4: Token generation
    const newToken = authManager.generateToken(['read', 'write']);
    if (authManager.isValidToken(newToken)) {
      logger.info('  ✅ Token generation works');
      passed++;
      results.push({ test: 'AUTH-004', status: 'PASS', description: 'Token generation successful' });
    } else {
      logger.info('  ❌ Token generation failed');
      failed++;
      results.push({ test: 'AUTH-004', status: 'FAIL', description: 'Token generation failed' });
    }
  } catch (error) {
    console.error('  ❌ Authentication test failed:', error.message);
    failed++;
    results.push({ test: 'AUTH-XXX', status: 'FAIL', description: `Exception: ${error.message}` });
  }

  // Rate Limiting Tests
  logger.info('\n📋 Testing Rate Limiting...');
  try {
    // Create a fresh rate limiter instance
    const testLimiter = new RateLimiter({ perMinute: 2, perHour: 10, perDay: 100 });

    // Give it a moment to initialize
    await new Promise(resolve => setTimeout(resolve, 100));

    // Test 5: First request allowed
    let result = testLimiter.checkLimit('test-user-1');
    if (result.allowed) {
      logger.info('  ✅ First request allowed');
      passed++;
      results.push({ test: 'RATE-001', status: 'PASS', description: 'First request allowed' });
    } else {
      logger.info('  ❌ First request blocked (should allow)');
      failed++;
      results.push({ test: 'RATE-001', status: 'FAIL', description: 'First request blocked' });
    }

    // Test 6: Within limit requests allowed
    result = testLimiter.checkLimit('test-user-1');
    if (result.allowed) {
      logger.info('  ✅ Second request allowed (within limit)');
      passed++;
      results.push({ test: 'RATE-002', status: 'PASS', description: 'Within-limit request allowed' });
    } else {
      logger.info('  ❌ Second request blocked (should allow)');
      failed++;
      results.push({ test: 'RATE-002', status: 'FAIL', description: 'Within-limit request blocked' });
    }

    // Test 7: Exceeded limit blocked
    result = testLimiter.checkLimit('test-user-1');
    if (!result.allowed) {
      logger.info('  ✅ Request blocked after limit exceeded');
      passed++;
      results.push({ test: 'RATE-003', status: 'PASS', description: 'Over-limit request blocked' });
    } else {
      logger.info('  ❌ Request allowed after limit (should block)');
      failed++;
      results.push({ test: 'RATE-003', status: 'FAIL', description: 'Over-limit request allowed' });
    }

    // Test 8: Stats retrieval
    const stats = testLimiter.getStats('test-user-1');
    if (stats.perMinute && stats.perMinute.used >= 2) {
      logger.info('  ✅ Rate limit statistics correct');
      passed++;
      results.push({ test: 'RATE-004', status: 'PASS', description: 'Statistics tracking works' });
    } else {
      logger.info('  ❌ Rate limit statistics incorrect');
      failed++;
      results.push({ test: 'RATE-004', status: 'FAIL', description: 'Statistics tracking failed' });
    }
  } catch (error) {
    console.error('  ❌ Rate limiting test failed:', error.message);
    failed++;
    results.push({ test: 'RATE-XXX', status: 'FAIL', description: `Exception: ${error.message}` });
  }

  // Input Validation Tests
  logger.info('\n📋 Testing Input Validation...');
  try {
    // Test 9: Valid string
    const validStr = InputValidator.validateString('valid-string', { required: true, maxLength: 100 });
    if (validStr === 'valid-string') {
      logger.info('  ✅ Valid string accepted');
      passed++;
      results.push({ test: 'VALID-001', status: 'PASS', description: 'Valid string accepted' });
    } else {
      logger.info('  ❌ Valid string validation failed');
      failed++;
      results.push({ test: 'VALID-001', status: 'FAIL', description: 'Valid string rejected' });
    }

    // Test 10: Oversized string rejected
    try {
      InputValidator.validateString('x'.repeat(10000), { maxLength: 100 });
      logger.info('  ❌ Oversized string accepted (should reject)');
      failed++;
      results.push({ test: 'VALID-002', status: 'FAIL', description: 'Oversized string accepted' });
    } catch {
      logger.info('  ✅ Oversized string rejected');
      passed++;
      results.push({ test: 'VALID-002', status: 'PASS', description: 'Oversized string rejected' });
    }

    // Test 11: Integer validation
    const num = InputValidator.validateInteger('42', { min: 0, max: 100 });
    if (num === 42) {
      logger.info('  ✅ Valid integer parsed correctly');
      passed++;
      results.push({ test: 'VALID-003', status: 'PASS', description: 'Integer parsing works' });
    } else {
      logger.info('  ❌ Integer parsing failed');
      failed++;
      results.push({ test: 'VALID-003', status: 'FAIL', description: 'Integer parsing failed' });
    }

    // Test 12: Boolean validation
    const bool = InputValidator.validateBoolean('true');
    if (bool === true) {
      logger.info('  ✅ Boolean validation works');
      passed++;
      results.push({ test: 'VALID-004', status: 'PASS', description: 'Boolean validation works' });
    } else {
      logger.info('  ❌ Boolean validation failed');
      failed++;
      results.push({ test: 'VALID-004', status: 'FAIL', description: 'Boolean validation failed' });
    }

    // Test 13: Array validation
    const arr = InputValidator.validateArray(['a', 'b', 'c'], { minLength: 1, maxLength: 5 });
    if (Array.isArray(arr) && arr.length === 3) {
      logger.info('  ✅ Array validation works');
      passed++;
      results.push({ test: 'VALID-005', status: 'PASS', description: 'Array validation works' });
    } else {
      logger.info('  ❌ Array validation failed');
      failed++;
      results.push({ test: 'VALID-005', status: 'FAIL', description: 'Array validation failed' });
    }

    // Test 14: Enum validation
    const enumVal = InputValidator.validateEnum('option1', ['option1', 'option2', 'option3']);
    if (enumVal === 'option1') {
      logger.info('  ✅ Enum validation works');
      passed++;
      results.push({ test: 'VALID-006', status: 'PASS', description: 'Enum validation works' });
    } else {
      logger.info('  ❌ Enum validation failed');
      failed++;
      results.push({ test: 'VALID-006', status: 'FAIL', description: 'Enum validation failed' });
    }

    // Test 15: Object validation
    const obj = InputValidator.validateObject(
      { name: 'test', count: '5' },
      {
        name: (val) => InputValidator.validateString(val, { required: true }),
        count: (val) => InputValidator.validateInteger(val, { min: 0 })
      }
    );
    if (obj.name === 'test' && obj.count === 5) {
      logger.info('  ✅ Object validation works');
      passed++;
      results.push({ test: 'VALID-007', status: 'PASS', description: 'Object validation works' });
    } else {
      logger.info('  ❌ Object validation failed');
      failed++;
      results.push({ test: 'VALID-007', status: 'FAIL', description: 'Object validation failed' });
    }
  } catch (error) {
    console.error('  ❌ Input validation test failed:', error.message);
    failed++;
    results.push({ test: 'VALID-XXX', status: 'FAIL', description: `Exception: ${error.message}` });
  }

  // Error Sanitization Tests
  logger.info('\n📋 Testing Error Sanitization...');
  try {
    // Test 16: File path sanitization
    const pathError = new Error('/home/user/secret/file.txt not found');
    const sanitized = ErrorSanitizer.sanitize(pathError, false);

    if (!sanitized.includes('/home/user')) {
      logger.info('  ✅ File path sanitized correctly');
      passed++;
      results.push({ test: 'ERROR-001', status: 'PASS', description: 'File path sanitized' });
    } else {
      logger.info('  ❌ File path not sanitized');
      failed++;
      results.push({ test: 'ERROR-001', status: 'FAIL', description: 'File path not sanitized' });
    }

    // Test 17: Error classification
    const errorResponse = ErrorSanitizer.createErrorResponse(
      new Error('ENOENT: file not found'),
      'read operation'
    );

    if (errorResponse.error.type === 'NOT_FOUND') {
      logger.info('  ✅ Error classified correctly');
      passed++;
      results.push({ test: 'ERROR-002', status: 'PASS', description: 'Error classification works' });
    } else {
      logger.info('  ❌ Error classification failed');
      failed++;
      results.push({ test: 'ERROR-002', status: 'FAIL', description: 'Error classification failed' });
    }

    // Test 18: Development mode shows details
    const devError = ErrorSanitizer.sanitize(new Error('detailed error'), true);
    if (devError.includes('detailed error')) {
      logger.info('  ✅ Development mode shows details');
      passed++;
      results.push({ test: 'ERROR-003', status: 'PASS', description: 'Dev mode shows details' });
    } else {
      logger.info('  ❌ Development mode hiding details');
      failed++;
      results.push({ test: 'ERROR-003', status: 'FAIL', description: 'Dev mode not working' });
    }

    // Test 19: Production mode sanitizes
    const prodError = ErrorSanitizer.sanitize(
      new Error('Error: /home/user/secret\nStack trace here'),
      false
    );
    if (!prodError.includes('Stack trace')) {
      logger.info('  ✅ Production mode removes stack traces');
      passed++;
      results.push({ test: 'ERROR-004', status: 'PASS', description: 'Stack traces removed' });
    } else {
      logger.info('  ❌ Production mode leaking stack traces');
      failed++;
      results.push({ test: 'ERROR-004', status: 'FAIL', description: 'Stack traces leaked' });
    }

    // Test 20: Request ID generation
    if (errorResponse.error.requestId && errorResponse.error.requestId.startsWith('ERR-')) {
      logger.info('  ✅ Request ID generated correctly');
      passed++;
      results.push({ test: 'ERROR-005', status: 'PASS', description: 'Request ID generation works' });
    } else {
      logger.info('  ❌ Request ID generation failed');
      failed++;
      results.push({ test: 'ERROR-005', status: 'FAIL', description: 'Request ID generation failed' });
    }
  } catch (error) {
    console.error('  ❌ Error sanitization test failed:', error.message);
    failed++;
    results.push({ test: 'ERROR-XXX', status: 'FAIL', description: `Exception: ${error.message}` });
  }

  // Report
  logger.info('\n' + '='.repeat(70));
  logger.info(`📊 Test Results: ${passed} passed, ${failed} failed`);
  logger.info(`✅ Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);
  logger.info('='.repeat(70));

  // Detailed results
  logger.info('\n📋 Detailed Test Results:\n');
  for (const result of results) {
    const icon = result.status === 'PASS' ? '✅' : '❌';
    logger.info(`${icon} ${result.test}: ${result.description}`);
  }

  if (failed === 0) {
    logger.info('\n🎉 ALL SECURITY HARDENING TESTS PASSED! 🎉\n');
  } else {
    logger.info(`\n⚠️  ${failed} test(s) failed. Review and fix before deployment.\n`);
  }

  return failed === 0;
}

// Run tests
runAllTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('❌ Test suite crashed:', error);
  process.exit(1);
});
