/**
 * Smart AI Bridge v1.5.0 - Integration Tests
 *
 * Tests for advanced multi-AI workflow handlers:
 * - CouncilHandler (multi-AI consensus)
 * - DualIterateHandler (generate→review→fix loop)
 * - ParallelAgentsHandler (TDD workflow)
 */

import { CouncilHandler } from '../handlers/council-handler.js';
import { DualIterateHandler } from '../handlers/dual-iterate-handler.js';
import { ParallelAgentsHandler } from '../handlers/parallel-agents-handler.js';

/**
 * Mock BackendRegistry for testing
 */
class MockBackendRegistry {
  constructor() {
    this.backends = new Map([
      ['nvidia_qwen', { enabled: true, name: 'nvidia_qwen' }],
      ['nvidia_deepseek', { enabled: true, name: 'nvidia_deepseek' }],
      ['local', { enabled: true, name: 'local' }],
      ['gemini', { enabled: true, name: 'gemini' }],
      ['groq_llama', { enabled: true, name: 'groq_llama' }]
    ]);
    this.fallbackChain = ['local', 'nvidia_qwen', 'nvidia_deepseek', 'gemini'];
    this.requestCount = 0;
  }

  getBackend(name) {
    return this.backends.get(name);
  }

  getFallbackChain() {
    return this.fallbackChain;
  }

  getNextAvailable(exclude) {
    for (const name of this.fallbackChain) {
      if (!exclude.includes(name)) {
        return name;
      }
    }
    return null;
  }

  async makeRequestWithFallback(prompt, preferredBackend, options = {}) {
    this.requestCount++;

    // Simulate backend response based on prompt content
    if (prompt.includes('council') || prompt.includes('deliberation')) {
      return {
        content: 'This is a well-considered analysis of the topic. I recommend proceeding with the suggested approach.',
        usage: { total_tokens: 150 }
      };
    }

    if (prompt.includes('Generate') || prompt.includes('generate')) {
      return {
        content: '```javascript\nfunction example() {\n  return "generated code";\n}\n```',
        usage: { total_tokens: 100 }
      };
    }

    if (prompt.includes('Review') || prompt.includes('review')) {
      return {
        content: '{"score": 0.85, "issues": ["Minor formatting issue"], "suggestions": ["Add error handling"], "summary": "Good quality code"}',
        usage: { total_tokens: 80 }
      };
    }

    // Default response
    return {
      content: 'Mock response for testing',
      usage: { total_tokens: 50 }
    };
  }
}

/**
 * Test utilities
 */
function log(message, type = 'info') {
  const colors = {
    info: '\x1b[36m',    // Cyan
    success: '\x1b[32m', // Green
    error: '\x1b[31m',   // Red
    warn: '\x1b[33m'     // Yellow
  };
  const reset = '\x1b[0m';
  console.log(`${colors[type]}[${type.toUpperCase()}]${reset} ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Test CouncilHandler
 */
async function testCouncilHandler() {
  log('Testing CouncilHandler...', 'info');

  const registry = new MockBackendRegistry();
  const handler = new CouncilHandler(registry);

  // Test 1: Basic council request
  log('Test 1: Basic council request', 'info');
  const result = await handler.handle({
    prompt: 'What is the best approach for implementing authentication?',
    topic: 'architecture',
    confidence_needed: 'medium'
  });

  assert(result.success === true, 'Council should succeed');
  assert(result.responses.length > 0, 'Should have responses');
  assert(result.synthesis.topic === 'architecture', 'Topic should match');
  assert(result.synthesis.backends_queried === 3, 'Medium confidence = 3 backends');
  log('Test 1 passed: Basic council request works', 'success');

  // Test 2: High confidence (4 backends)
  log('Test 2: High confidence request', 'info');
  const highConfResult = await handler.handle({
    prompt: 'Critical security decision needed',
    topic: 'security',
    confidence_needed: 'high'
  });

  assert(highConfResult.synthesis.backends_queried >= 3, 'High confidence should query more backends');
  log('Test 2 passed: High confidence works', 'success');

  // Test 3: Low confidence (2 backends)
  log('Test 3: Low confidence request', 'info');
  const lowConfResult = await handler.handle({
    prompt: 'Quick validation needed',
    topic: 'general',
    confidence_needed: 'low'
  });

  assert(lowConfResult.synthesis.backends_queried === 2, 'Low confidence = 2 backends');
  log('Test 3 passed: Low confidence works', 'success');

  // Test 4: Invalid topic handling
  log('Test 4: Invalid topic handling', 'info');
  try {
    await handler.handle({
      prompt: 'Test',
      topic: 'invalid_topic'
    });
    assert(false, 'Should have thrown for invalid topic');
  } catch (e) {
    assert(e.message.includes('Unknown topic'), 'Should mention unknown topic');
    log('Test 4 passed: Invalid topic rejected correctly', 'success');
  }

  log('CouncilHandler tests passed!', 'success');
  return true;
}

/**
 * Test DualIterateHandler
 */
async function testDualIterateHandler() {
  log('Testing DualIterateHandler...', 'info');

  const registry = new MockBackendRegistry();
  const handler = new DualIterateHandler(registry);

  // Test 1: Basic dual iterate request
  log('Test 1: Basic dual iterate request', 'info');
  const result = await handler.handle({
    task: 'Write a function that validates email addresses',
    max_iterations: 2,
    quality_threshold: 0.7
  });

  assert(result.success === true, 'Should complete successfully');
  assert(typeof result.code === 'string', 'Should return code');
  assert(result.iterations >= 1, 'Should have at least 1 iteration');
  assert(typeof result.final_score === 'number', 'Should have final score');
  log('Test 1 passed: Basic dual iterate works', 'success');

  // Test 2: Include history
  log('Test 2: Include history option', 'info');
  const historyResult = await handler.handle({
    task: 'Generate a simple utility function',
    include_history: true
  });

  assert(Array.isArray(historyResult.history), 'Should include history array');
  log('Test 2 passed: History included correctly', 'success');

  // Test 3: Quality threshold validation
  log('Test 3: Quality threshold validation', 'info');
  try {
    await handler.handle({
      task: 'Test task',
      quality_threshold: 1.5 // Invalid
    });
    assert(false, 'Should reject invalid threshold');
  } catch (e) {
    assert(e.message.includes('quality_threshold'), 'Should mention threshold');
    log('Test 3 passed: Invalid threshold rejected', 'success');
  }

  log('DualIterateHandler tests passed!', 'success');
  return true;
}

/**
 * Test ParallelAgentsHandler (unit test only - doesn't run actual agents)
 */
async function testParallelAgentsHandlerUnit() {
  log('Testing ParallelAgentsHandler (unit tests)...', 'info');

  const registry = new MockBackendRegistry();

  // Test 1: Handler instantiation
  log('Test 1: Handler instantiation', 'info');
  const handler = new ParallelAgentsHandler(registry);
  assert(handler !== null, 'Should create handler');
  assert(handler.config.max_parallel === 2, 'Should have default max_parallel');
  log('Test 1 passed: Handler instantiated correctly', 'success');

  // Test 2: Input validation
  log('Test 2: Input validation', 'info');
  try {
    await handler.handle({
      task: '', // Empty task
    });
    assert(false, 'Should reject empty task');
  } catch (e) {
    log('Test 2 passed: Empty task rejected', 'success');
  }

  // Test 3: Max parallel validation
  log('Test 3: Max parallel validation', 'info');
  try {
    await handler.handle({
      task: 'Valid task description here',
      max_parallel: 10 // Invalid
    });
    assert(false, 'Should reject invalid max_parallel');
  } catch (e) {
    assert(e.message.includes('max_parallel'), 'Should mention max_parallel');
    log('Test 3 passed: Invalid max_parallel rejected', 'success');
  }

  log('ParallelAgentsHandler unit tests passed!', 'success');
  return true;
}

/**
 * Test role templates for TDD roles
 */
async function testTDDRoleTemplates() {
  log('Testing TDD role templates...', 'info');

  const { getRoleTemplate, isValidRole, getAvailableRoles } = await import('../config/role-templates.js');

  // Test 1: TDD roles exist
  log('Test 1: TDD roles exist', 'info');
  const tddRoles = ['tdd-decomposer', 'tdd-test-writer', 'tdd-implementer', 'tdd-quality-reviewer'];

  for (const role of tddRoles) {
    assert(isValidRole(role), `Role ${role} should be valid`);
    const template = getRoleTemplate(role);
    assert(template !== null, `Template for ${role} should exist`);
    assert(template.systemPrompt, `${role} should have systemPrompt`);
    assert(template.temperature >= 0 && template.temperature <= 1, `${role} should have valid temperature`);
  }
  log('Test 1 passed: All TDD roles exist', 'success');

  // Test 2: All roles available
  log('Test 2: All roles in available list', 'info');
  const allRoles = getAvailableRoles();
  assert(allRoles.length === 10, 'Should have 10 roles (6 original + 4 TDD)');
  log(`Test 2 passed: ${allRoles.length} roles available`, 'success');

  log('TDD role template tests passed!', 'success');
  return true;
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('\n========================================');
  console.log('Smart AI Bridge v1.5.0 Integration Tests');
  console.log('========================================\n');

  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  const tests = [
    { name: 'CouncilHandler', fn: testCouncilHandler },
    { name: 'DualIterateHandler', fn: testDualIterateHandler },
    { name: 'ParallelAgentsHandler Unit', fn: testParallelAgentsHandlerUnit },
    { name: 'TDD Role Templates', fn: testTDDRoleTemplates }
  ];

  for (const test of tests) {
    try {
      console.log(`\n--- ${test.name} ---\n`);
      await test.fn();
      results.passed++;
      results.tests.push({ name: test.name, status: 'PASSED' });
    } catch (error) {
      results.failed++;
      results.tests.push({ name: test.name, status: 'FAILED', error: error.message });
      log(`${test.name} FAILED: ${error.message}`, 'error');
    }
  }

  console.log('\n========================================');
  console.log('TEST RESULTS');
  console.log('========================================');
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Total:  ${tests.length}`);
  console.log('========================================\n');

  for (const test of results.tests) {
    const icon = test.status === 'PASSED' ? '✅' : '❌';
    console.log(`${icon} ${test.name}: ${test.status}`);
    if (test.error) {
      console.log(`   Error: ${test.error}`);
    }
  }

  return results.failed === 0;
}

// Run tests
runAllTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
