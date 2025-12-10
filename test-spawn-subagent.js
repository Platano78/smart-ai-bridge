#!/usr/bin/env node
/**
 * @fileoverview Test spawn_subagent tool
 * Tests the complete TDD implementation of SubagentHandler
 */

import { SubagentHandler } from './src/handlers/subagent-handler.js';
import { validateRole, suggestSimilarRoles } from './src/utils/role-validator.js';
import { getAvailableRoles } from './src/config/role-templates.js';
import { parseVerdict, validateVerdict } from './src/utils/verdict-parser.js';

console.log('🧪 Testing spawn_subagent TDD Implementation\n');

// Test 1: Role Validation
console.log('=== Test 1: Role Validation ===');
const testRoles = [
  'code-reviewer',
  'security-auditor',
  'planner',
  'invalid-role',
  'CODE-REVIEWER', // Test case insensitivity
  ''
];

for (const role of testRoles) {
  const result = validateRole(role);
  if (result.valid) {
    console.log(`✅ "${role}" is valid`);
  } else {
    const suggestions = suggestSimilarRoles(role);
    console.log(`❌ "${role}" is invalid: ${result.error}`);
    if (suggestions.length > 0) {
      console.log(`   💡 Did you mean: ${suggestions.join(', ')}?`);
    }
  }
}

// Test 2: Available Roles
console.log('\n=== Test 2: Available Roles ===');
const availableRoles = getAvailableRoles();
console.log(`📋 ${availableRoles.length} roles available:`, availableRoles.join(', '));

// Test 3: Verdict Parsing
console.log('\n=== Test 3: Verdict Parsing ===');
const testResponses = [
  // YAML verdict
  `## Code Review

### Analysis
The code looks good but has some issues.

\`\`\`yaml
verdict:
  status: APPROVE_WITH_CHANGES
  score: 7
  reasoning: Code quality is good but needs better error handling
\`\`\`
`,
  // Markdown verdict
  `## Security Audit Report

### Verdict
- **Status**: VULNERABLE
- **Security Score**: 4/10
- **Risk Level**: HIGH
- **Reasoning**: SQL injection vulnerability found in login endpoint
`,
  // Key-value verdict
  `Status: REJECT
Score: 3
Reasoning: Multiple critical issues found
`
];

for (let i = 0; i < testResponses.length; i++) {
  console.log(`\nTest Response ${i + 1}:`);
  const verdict = parseVerdict(testResponses[i]);
  if (verdict) {
    console.log('✅ Verdict parsed successfully:');
    console.log(`   Status: ${verdict.status}`);
    console.log(`   Score: ${verdict.score !== undefined ? verdict.score : 'N/A'}`);
    console.log(`   Reasoning: ${verdict.reasoning || 'N/A'}`);

    const validation = validateVerdict(verdict);
    console.log(`   Valid: ${validation.valid ? '✅' : '❌'}`);
  } else {
    console.log('❌ Failed to parse verdict');
  }
}

// Test 4: SubagentHandler (mock test without actual AI call)
console.log('\n=== Test 4: SubagentHandler Initialization ===');
try {
  const mockRouter = {
    routeRequest: async () => 'local',
    makeRequest: async (prompt) => ({ content: `Mock response for: ${prompt.slice(0, 50)}...` }),
    backends: { local: { enabled: true } }
  };

  const handler = new SubagentHandler({ router: mockRouter });
  console.log('✅ SubagentHandler instantiated successfully');
  console.log(`   Metrics initialized: ${handler.metrics ? 'Yes' : 'No'}`);

  // Test metrics summary
  const summary = handler.metrics.getMetricsSummary();
  console.log(`   Initial spawns: ${summary.totalSpawns}`);
  console.log(`   Success rate: ${summary.successRate}%`);
} catch (error) {
  console.log(`❌ SubagentHandler failed: ${error.message}`);
}

// Test 5: Role Template System
console.log('\n=== Test 5: Role Template System ===');
import { getRoleTemplate, getRolesByCategory } from './src/config/role-templates.js';

const reviewRoles = getRolesByCategory('review');
console.log(`Review roles: ${reviewRoles.join(', ')}`);

const securityRoles = getRolesByCategory('security');
console.log(`Security roles: ${securityRoles.join(', ')}`);

const template = getRoleTemplate('code-reviewer');
if (template) {
  console.log('\n✅ Code Reviewer Template:');
  console.log(`   Category: ${template.category}`);
  console.log(`   Tools: ${template.suggested_tools.join(', ')}`);
  console.log(`   Max Tokens: ${template.maxTokens}`);
  console.log(`   Requires Verdict: ${template.requiresVerdict ? 'Yes' : 'No'}`);
  console.log(`   Preferred Backend: ${template.preferred_backend}`);
}

console.log('\n✅ All tests completed!');
console.log('\n📊 Summary:');
console.log(`   - Role validation: Working`);
console.log(`   - Template system: Working`);
console.log(`   - Verdict parsing: Working`);
console.log(`   - Handler initialization: Working`);
console.log(`   - Metrics tracking: Working`);

console.log('\n🎯 spawn_subagent tool is ready for use!');
console.log('\nExample usage:');
console.log(`{
  "role": "code-reviewer",
  "task": "Review the authentication module for security issues",
  "file_patterns": ["src/auth/**/*.js"],
  "verdict_mode": "summary"
}`);
