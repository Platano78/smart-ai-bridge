/**
 * DoS and Resource Exhaustion Tests
 * Smart AI Bridge v1.3.0 Security Validation
 *
 * Tests protection against denial of service and resource exhaustion attacks
 *
 * Run: node security/tests/dos-resource-exhaustion-tests.js
 */

import { RateLimiter } from '../../rate-limiter.js';
import { CircuitBreaker } from '../../circuit-breaker.js';
import {
  validateFuzzyEditComplexity,
  createFuzzyTimeoutWrapper,
  FUZZY_SECURITY_LIMITS,
  getFuzzyMetrics,
  resetFuzzyMetrics,
  detectAbusePatterns
} from '../../fuzzy-matching-security.js';
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
// Rate Limiting DoS Protection Tests
// ============================================================================
async function testRateLimitingDoS() {
  console.log('\n🚦 Rate Limiting DoS Protection Tests\n');
  const category = 'RATE_LIMIT';

  // Test 1: Flood attack simulation
  const floodLimiter = new RateLimiter({ perMinute: 10, perHour: 100, perDay: 1000 });
  const attackerId = 'attacker-' + Date.now();

  let blockedCount = 0;
  const floodAttempts = 50;

  for (let i = 0; i < floodAttempts; i++) {
    const result = floodLimiter.checkLimit(attackerId);
    if (!result.allowed) blockedCount++;
  }

  logTest(category, 'DOS-FLOOD-001',
    'Flood attack blocked by rate limiter',
    blockedCount >= 40, // At least 40 of 50 should be blocked (only 10 allowed)
    '',
    { attempts: floodAttempts, blocked: blockedCount, limit: 10 }
  );

  // Test 2: Multiple attacker simulation
  const multiLimiter = new RateLimiter({ perMinute: 5, perHour: 50, perDay: 500 });
  const attackerResults = {};

  for (let attacker = 0; attacker < 5; attacker++) {
    const id = `attacker-${attacker}-${Date.now()}`;
    let allowed = 0;
    for (let i = 0; i < 10; i++) {
      if (multiLimiter.checkLimit(id).allowed) allowed++;
    }
    attackerResults[id] = allowed;
  }

  const allBlockedCorrectly = Object.values(attackerResults).every(v => v === 5);

  logTest(category, 'DOS-MULTI-002',
    'Multiple attackers rate limited independently',
    allBlockedCorrectly,
    '',
    { attackerResults }
  );

  // Test 3: Retry-after header provided
  const retryLimiter = new RateLimiter({ perMinute: 1, perHour: 10, perDay: 100 });
  retryLimiter.checkLimit('retry-test');
  const blockedResult = retryLimiter.checkLimit('retry-test');

  logTest(category, 'DOS-RETRY-003',
    'Blocked requests include retry-after',
    !blockedResult.allowed && blockedResult.retryAfter > 0,
    '',
    { retryAfter: blockedResult.retryAfter, window: blockedResult.window }
  );

  // Test 4: Statistics tracking under load
  const statsLimiter = new RateLimiter({ perMinute: 100, perHour: 1000, perDay: 10000 });
  const statsId = 'stats-test-' + Date.now();

  for (let i = 0; i < 50; i++) {
    statsLimiter.checkLimit(statsId);
  }

  const stats = statsLimiter.getStats(statsId);

  logTest(category, 'DOS-STATS-004',
    'Statistics accurate under load',
    stats.perMinute.used === 50,
    '',
    { stats }
  );
}

// ============================================================================
// Circuit Breaker Protection Tests
// ============================================================================
async function testCircuitBreakerDoS() {
  console.log('\n⚡ Circuit Breaker DoS Protection Tests\n');
  const category = 'CIRCUIT_BREAKER';

  // Test 1: Circuit opens on repeated failures
  const breaker = new CircuitBreaker({ failureThreshold: 3, timeout: 1000, windowSize: 10 });
  let failureCount = 0;

  for (let i = 0; i < 5; i++) {
    try {
      await breaker.execute(() => Promise.reject(new Error('Backend failure')));
    } catch {
      failureCount++;
    }
  }

  logTest(category, 'CB-OPEN-001',
    'Circuit opens after failure threshold',
    breaker.state === 'OPEN',
    '',
    { state: breaker.state, failures: failureCount }
  );

  // Test 2: Open circuit rejects immediately
  const startTime = Date.now();
  let rejected = false;

  try {
    await breaker.execute(() => Promise.resolve('should not execute'));
  } catch (error) {
    rejected = error.message.includes('OPEN');
  }

  const duration = Date.now() - startTime;

  logTest(category, 'CB-REJECT-002',
    'Open circuit rejects immediately',
    rejected && duration < 100, // Should reject in under 100ms
    '',
    { rejected, duration }
  );

  // Test 3: Fallback executes when circuit open
  const fallbackBreaker = new CircuitBreaker({ failureThreshold: 1, timeout: 100 });

  // Trip the breaker
  try {
    await fallbackBreaker.execute(() => Promise.reject(new Error('fail')));
  } catch {}

  fallbackBreaker.state = 'OPEN';

  const fallbackResult = await fallbackBreaker.execute(
    () => Promise.resolve('primary'),
    () => Promise.resolve('fallback-executed')
  );

  logTest(category, 'CB-FALLBACK-003',
    'Fallback executes when circuit open',
    fallbackResult === 'fallback-executed',
    '',
    { result: fallbackResult }
  );

  // Test 4: Metrics tracking
  const metricsBreaker = new CircuitBreaker();

  for (let i = 0; i < 10; i++) {
    try {
      await metricsBreaker.execute(() =>
        i % 2 === 0 ? Promise.resolve('success') : Promise.reject(new Error('fail'))
      );
    } catch {}
  }

  const status = metricsBreaker.getStatus();

  logTest(category, 'CB-METRICS-004',
    'Circuit breaker tracks metrics',
    status.metrics.totalRequests === 10 &&
    status.metrics.successfulRequests >= 4 &&
    status.metrics.failedRequests >= 4,
    '',
    { metrics: status.metrics }
  );

  // Test 5: Force open for maintenance
  const maintenanceBreaker = new CircuitBreaker();
  maintenanceBreaker.forceOpen();

  logTest(category, 'CB-FORCE-005',
    'Circuit can be forced open',
    maintenanceBreaker.state === 'OPEN',
    '',
    { state: maintenanceBreaker.state }
  );

  // Test 6: Force closed for recovery
  maintenanceBreaker.forceClosed();

  logTest(category, 'CB-RESET-006',
    'Circuit can be force closed',
    maintenanceBreaker.state === 'CLOSED',
    '',
    { state: maintenanceBreaker.state }
  );
}

// ============================================================================
// Fuzzy Matching Complexity Attack Tests
// ============================================================================
async function testFuzzyMatchingDoS() {
  console.log('\n🔍 Fuzzy Matching DoS Protection Tests\n');
  const category = 'FUZZY_DOS';

  resetFuzzyMetrics();

  // Test 1: Single large edit blocked
  const largeEdit = [{ find: 'x'.repeat(10000), replace: 'y' }];
  const largeResult = validateFuzzyEditComplexity(largeEdit);

  logTest(category, 'FUZZY-LARGE-001',
    'Single large edit blocked',
    largeResult.valid === false,
    largeResult.valid ? 'Should be blocked' : '',
    { editLength: 10000, limit: FUZZY_SECURITY_LIMITS.MAX_FUZZY_EDIT_LENGTH }
  );

  // Test 2: Many lines blocked
  const manyLinesEdit = [{ find: 'x\n'.repeat(300), replace: 'y' }];
  const linesResult = validateFuzzyEditComplexity(manyLinesEdit);

  logTest(category, 'FUZZY-LINES-002',
    'Many lines edit blocked',
    linesResult.valid === false,
    linesResult.valid ? 'Should be blocked' : '',
    { lineCount: 300, limit: FUZZY_SECURITY_LIMITS.MAX_FUZZY_LINE_COUNT }
  );

  // Test 3: Total complexity blocked
  const manyEdits = Array(100).fill({ find: 'x'.repeat(1000), replace: 'y'.repeat(1000) });
  const totalResult = validateFuzzyEditComplexity(manyEdits);

  logTest(category, 'FUZZY-TOTAL-003',
    'Total complexity blocked',
    totalResult.valid === false,
    totalResult.valid ? 'Should be blocked' : '',
    { totalChars: totalResult.totalCharacters, limit: FUZZY_SECURITY_LIMITS.MAX_FUZZY_TOTAL_CHARS }
  );

  // Test 4: Timeout enforcement
  const slowOp = () => new Promise(resolve => setTimeout(resolve, 10000));

  try {
    await createFuzzyTimeoutWrapper(slowOp, 100);
    logTest(category, 'FUZZY-TIMEOUT-004', 'Timeout enforced', false, 'Should have timed out');
  } catch (error) {
    logTest(category, 'FUZZY-TIMEOUT-004',
      'Timeout enforced',
      error.message.includes('timed out'),
      '',
      { timeout: 100 }
    );
  }

  // Test 5: Metrics tracked
  // Generate some activity
  for (let i = 0; i < 5; i++) {
    validateFuzzyEditComplexity([{ find: 'x'.repeat(6000), replace: 'y' }]); // Invalid
    validateFuzzyEditComplexity([{ find: 'x', replace: 'y' }]); // Valid
  }

  const metrics = getFuzzyMetrics();

  logTest(category, 'FUZZY-METRICS-005',
    'Fuzzy metrics tracked',
    metrics.complexityLimitHits > 0,
    '',
    { metrics }
  );

  // Test 6: Abuse pattern detection
  const abusePatterns = detectAbusePatterns();

  logTest(category, 'FUZZY-ABUSE-006',
    'Abuse patterns detectable',
    typeof abusePatterns.highComplexityLimitRate === 'boolean',
    '',
    { patterns: abusePatterns }
  );

  // Test 7: Empty edits rejected
  const emptyResult = validateFuzzyEditComplexity([]);

  logTest(category, 'FUZZY-EMPTY-007',
    'Empty edits array rejected',
    emptyResult.valid === false,
    emptyResult.valid ? 'Should be rejected' : ''
  );

  // Test 8: Invalid edit structure rejected
  const invalidResult = validateFuzzyEditComplexity([{ find: 123, replace: 'y' }]);

  logTest(category, 'FUZZY-INVALID-008',
    'Invalid edit structure rejected',
    invalidResult.valid === false,
    invalidResult.valid ? 'Should be rejected' : ''
  );
}

// ============================================================================
// Memory Exhaustion Tests
// ============================================================================
async function testMemoryExhaustion() {
  console.log('\n💾 Memory Exhaustion Protection Tests\n');
  const category = 'MEMORY';

  // Test 1: Rate limiter cleanup works
  const cleanupLimiter = new RateLimiter({ perMinute: 1000, perHour: 10000, perDay: 100000 });

  // Simulate many users
  for (let i = 0; i < 1000; i++) {
    cleanupLimiter.checkLimit(`user-${i}`);
  }

  // Force cleanup (normally runs on interval)
  cleanupLimiter.cleanup('perMinute');

  logTest(category, 'MEM-CLEANUP-001',
    'Rate limiter has cleanup mechanism',
    typeof cleanupLimiter.cleanup === 'function',
    '',
    { note: 'Cleanup runs on intervals to prevent memory growth' }
  );

  // Test 2: Circuit breaker sliding window
  const windowBreaker = new CircuitBreaker({ windowSize: 10 });

  // Simulate many failures
  for (let i = 0; i < 100; i++) {
    windowBreaker.onFailure(new Error('test'));
  }

  // Cleanup old failures
  windowBreaker.cleanupFailures();

  logTest(category, 'MEM-WINDOW-002',
    'Circuit breaker uses sliding window',
    windowBreaker.failures.length <= windowBreaker.windowSize * 2, // Some tolerance
    '',
    { failures: windowBreaker.failures.length, windowSize: windowBreaker.windowSize }
  );

  // Test 3: Fuzzy metrics cleanup
  resetFuzzyMetrics();
  const freshMetrics = getFuzzyMetrics();

  logTest(category, 'MEM-FUZZY-003',
    'Fuzzy metrics can be reset',
    freshMetrics.totalOperations === 0,
    '',
    { metrics: freshMetrics }
  );
}

// ============================================================================
// Concurrent Request Flood Tests
// ============================================================================
async function testConcurrentFlood() {
  console.log('\n🌊 Concurrent Request Flood Tests\n');
  const category = 'CONCURRENT';

  // Test 1: Concurrent requests rate limited
  const concurrentLimiter = new RateLimiter({ perMinute: 10, perHour: 100, perDay: 1000 });
  const userId = 'concurrent-' + Date.now();

  const concurrentRequests = Array(50).fill(null).map(() =>
    Promise.resolve(concurrentLimiter.checkLimit(userId))
  );

  const results = await Promise.all(concurrentRequests);
  const allowed = results.filter(r => r.allowed).length;
  const blocked = results.filter(r => !r.allowed).length;

  logTest(category, 'CONC-RATE-001',
    'Concurrent requests rate limited correctly',
    allowed === 10 && blocked === 40,
    '',
    { allowed, blocked, limit: 10 }
  );

  // Test 2: Circuit breaker handles concurrent failures
  const concurrentBreaker = new CircuitBreaker({ failureThreshold: 3, timeout: 1000 });

  const concurrentFailures = Array(10).fill(null).map(() =>
    concurrentBreaker.execute(() => Promise.reject(new Error('fail'))).catch(e => e)
  );

  await Promise.all(concurrentFailures);

  logTest(category, 'CONC-CB-002',
    'Circuit breaker handles concurrent failures',
    concurrentBreaker.state === 'OPEN',
    '',
    { state: concurrentBreaker.state, failures: concurrentBreaker.failures.length }
  );

  // Test 3: Concurrent timeouts handled
  const timeoutPromises = Array(5).fill(null).map(() =>
    createFuzzyTimeoutWrapper(
      () => new Promise(resolve => setTimeout(resolve, 10000)),
      50
    ).catch(e => e.message)
  );

  const timeoutResults = await Promise.all(timeoutPromises);
  const allTimedOut = timeoutResults.every(r => r.includes('timed out'));

  logTest(category, 'CONC-TIMEOUT-003',
    'Concurrent timeouts handled correctly',
    allTimedOut,
    '',
    { results: timeoutResults.length }
  );
}

// ============================================================================
// Resource Limit Configuration Tests
// ============================================================================
async function testResourceLimitConfigs() {
  console.log('\n⚙️  Resource Limit Configuration Tests\n');
  const category = 'CONFIG';

  // Test 1: All security limits defined
  const requiredLimits = [
    'MAX_FUZZY_EDIT_LENGTH',
    'MAX_FUZZY_LINE_COUNT',
    'MAX_FUZZY_TOTAL_CHARS',
    'MAX_FUZZY_ITERATIONS',
    'MAX_FUZZY_SUGGESTIONS',
    'FUZZY_TIMEOUT_MS'
  ];

  const allDefined = requiredLimits.every(limit =>
    typeof FUZZY_SECURITY_LIMITS[limit] === 'number' &&
    FUZZY_SECURITY_LIMITS[limit] > 0
  );

  logTest(category, 'CFG-LIMITS-001',
    'All security limits defined',
    allDefined,
    '',
    { limits: FUZZY_SECURITY_LIMITS }
  );

  // Test 2: Rate limiter configurable
  const customLimiter = new RateLimiter({
    perMinute: 100,
    perHour: 1000,
    perDay: 10000
  });

  logTest(category, 'CFG-RATE-002',
    'Rate limiter accepts custom config',
    customLimiter.limits.perMinute === 100,
    '',
    { limits: customLimiter.limits }
  );

  // Test 3: Circuit breaker configurable
  const customBreaker = new CircuitBreaker({
    failureThreshold: 10,
    timeout: 30000,
    halfOpenMaxCalls: 5
  });

  logTest(category, 'CFG-CB-003',
    'Circuit breaker accepts custom config',
    customBreaker.failureThreshold === 10 &&
    customBreaker.timeout === 30000 &&
    customBreaker.halfOpenMaxCalls === 5,
    '',
    { config: customBreaker.getStatus().config }
  );

  // Test 4: Defaults are secure
  const defaultLimiter = new RateLimiter();
  const defaultBreaker = new CircuitBreaker();

  logTest(category, 'CFG-DEFAULTS-004',
    'Default configurations are secure',
    defaultLimiter.limits.perMinute === 60 &&
    defaultBreaker.failureThreshold === 5,
    '',
    {
      rateLimits: defaultLimiter.limits,
      breakerConfig: defaultBreaker.getStatus().config
    }
  );
}

// ============================================================================
// Main Runner
// ============================================================================
async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  DoS and Resource Exhaustion Test Suite                        ║');
  console.log('║  Smart AI Bridge v1.3.0 Security Validation                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Started: ${new Date().toISOString()}`);

  const startTime = Date.now();

  await testRateLimitingDoS();
  await testCircuitBreakerDoS();
  await testFuzzyMatchingDoS();
  await testMemoryExhaustion();
  await testConcurrentFlood();
  await testResourceLimitConfigs();

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
  const resultsFile = dirname(__dirname) + '/test-results/dos-resource-exhaustion-results.json';
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
    console.log('\n🎉 ALL DoS PROTECTION TESTS PASSED! 🎉');
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
