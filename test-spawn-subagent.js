#!/usr/bin/env node
/**
 * Test spawn_subagent System in Smart AI Bridge v1.3.0
 * 
 * Tests all 6 specialized roles:
 * 1. code-reviewer
 * 2. security-auditor
 * 3. planner
 * 4. refactor-specialist
 * 5. test-generator
 * 6. documentation-writer
 */

import { SubagentHandler } from './handlers/subagent-handler.js';
import { getAvailableRoles } from './config/role-templates.js';
import { validateSpawnSubagentRequest, assessTaskQuality } from './utils/role-validator.js';
import { parseVerdict, hasVerdict } from './utils/verdict-parser.js';

// Mock BackendRouter for testing
class MockBackendRouter {
  async makeRequest(prompt, backend, options) {
    // Simulate AI response with verdict
    const verdict = {
      quality_score: 7,
      issues: [
        {
          severity: "medium",
          category: "naming",
          description: "Variable x is not descriptive",
          location: "test.js:10",
          suggestion: "Use meaningful names like counter or index"
        }
      ],
      strengths: ["Clean structure", "Good use of async await"],
      overall_assessment: "Code is functional but could benefit from improved naming and error handling"
    };
    
    const mockResponse = `Analysis of the provided code/task:

The code demonstrates several patterns that require attention:
- Variable naming could be more descriptive
- Error handling is minimal
- Documentation is sparse

VERDICT:
${JSON.stringify(verdict, null, 2)}`;

    return {
      success: true,
      backend: backend,
      response: mockResponse,
      tokens: 500,
      latency: 1200
    };
  }
}

async function runTests() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 SMART AI BRIDGE v1.3.0 - SPAWN_SUBAGENT TEST');
  console.log('='.repeat(70) + '\n');

  const mockRouter = new MockBackendRouter();
  const handler = new SubagentHandler(mockRouter);
  let passCount = 0;
  let failCount = 0;

  function test(name, fn) {
    return async () => {
      try {
        await fn();
        console.log(`✅ ${name}`);
        passCount++;
      } catch (error) {
        console.error(`❌ ${name}`);
        console.error(`   Error: ${error.message}`);
        failCount++;
      }
    };
  }

  // Test 1: Available roles
  await test('Get Available Roles', async () => {
    const roles = getAvailableRoles();
    if (roles.length !== 6) throw new Error(`Expected 6 roles, got ${roles.length}`);
    console.log(`   Roles: ${roles.join(', ')}`);
  })();

  // Test 2: Request validation
  await test('Request Validation - Valid', async () => {
    const validation = validateSpawnSubagentRequest({
      role: 'code-reviewer',
      task: 'Review the authentication module for security issues'
    });
    if (!validation.valid) throw new Error('Valid request marked as invalid');
  })();

  await test('Request Validation - Missing Role', async () => {
    const validation = validateSpawnSubagentRequest({
      task: 'Some task'
    });
    if (validation.valid) throw new Error('Should be invalid');
    if (!validation.errors.some(e => e.includes('role'))) {
      throw new Error('Should have role error');
    }
  })();

  await test('Request Validation - Invalid Role', async () => {
    const validation = validateSpawnSubagentRequest({
      role: 'non-existent-role',
      task: 'Some task'
    });
    if (validation.valid) throw new Error('Should be invalid');
  })();

  // Test 3: Task quality assessment
  await test('Task Quality Assessment - Good', async () => {
    const assessment = assessTaskQuality('Review the user authentication module for SQL injection vulnerabilities');
    console.log(`   Quality: ${assessment.quality}`);
  })();

  await test('Task Quality Assessment - Poor', async () => {
    const assessment = assessTaskQuality('review code');
    if (assessment.quality === 'good') throw new Error('Should be poor quality');
    console.log(`   Suggestions: ${assessment.suggestions.length}`);
  })();

  // Test 4: Verdict parsing
  await test('Verdict Parsing', async () => {
    const mockResponse = `VERDICT:\n{\n  "quality_score": 8,\n  "issues": []\n}`;
    const verdict = parseVerdict(mockResponse, 'full');
    if (!verdict) throw new Error('Failed to parse verdict');
    if (verdict.quality_score !== 8) throw new Error('Wrong quality score');
  })();

  await test('Verdict Detection', async () => {
    const withVerdict = 'Some text VERDICT: { "score": 5 }';
    const withoutVerdict = 'Some text without verdict';
    if (!hasVerdict(withVerdict)) throw new Error('Should detect verdict');
    if (hasVerdict(withoutVerdict)) throw new Error('Should not detect verdict');
  })();

  // Test 5: Role execution (mock)
  await test('Execute code-reviewer Role', async () => {
    const result = await handler.handle({
      role: 'code-reviewer',
      task: 'Review this simple function for quality issues',
      verdict_mode: 'summary'
    });

    if (!result.success) throw new Error('Handler failed');
    // Note: Verdict parsing may have warnings but handler still succeeds
    console.log(`   Backend: ${result.backend_used}`);
    console.log(`   Has verdict: ${result.has_verdict}`);
    if (result.verdict) {
      console.log(`   Quality score: ${result.verdict.quality_score || 'N/A'}`);
    }
  })();

  await test('Execute security-auditor Role', async () => {
    const result = await handler.handle({
      role: 'security-auditor',
      task: 'Audit this authentication code for vulnerabilities'
    });

    if (!result.success) throw new Error('Handler failed');
    console.log(`   Role: ${result.role_name}`);
  })();

  await test('Execute planner Role', async () => {
    const result = await handler.handle({
      role: 'planner',
      task: 'Break down the task of implementing OAuth2 authentication'
    });

    if (!result.success) throw new Error('Handler failed');
    console.log(`   Task quality: ${result.metadata.task_quality}`);
  })();

  await test('Execute refactor-specialist Role', async () => {
    const result = await handler.handle({
      role: 'refactor-specialist',
      task: 'Suggest refactorings for this legacy code'
    });

    if (!result.success) throw new Error('Handler failed');
  })();

  await test('Execute test-generator Role', async () => {
    const result = await handler.handle({
      role: 'test-generator',
      task: 'Generate unit tests for the calculateTotal function'
    });

    if (!result.success) throw new Error('Handler failed');
  })();

  await test('Execute documentation-writer Role', async () => {
    const result = await handler.handle({
      role: 'documentation-writer',
      task: 'Write API documentation for the User service'
    });

    if (!result.success) throw new Error('Handler failed');
  })();

  // Results
  console.log('\n' + '='.repeat(70));
  console.log('TEST RESULTS');
  console.log('='.repeat(70));
  console.log(`✅ Passed: ${passCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`📊 Success Rate: ${((passCount / (passCount + failCount)) * 100).toFixed(1)}%`);
  console.log('='.repeat(70) + '\n');

  if (failCount === 0) {
    console.log('🎉 ALL TESTS PASSED - spawn_subagent system is working correctly!\n');
  } else {
    console.log('⚠️  Some tests failed - Review implementation\n');
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('❌ Test suite crashed:', error.message);
  console.error(error.stack);
  process.exit(1);
});
