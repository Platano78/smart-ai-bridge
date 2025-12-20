#!/usr/bin/env node
/**
 * Comprehensive test for all 15 MKG core tools
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'fs/promises';

const TESTS = [
  {
    name: 'review',
    args: {
      content: 'function add(a, b) { return a + b; }',
      language: 'javascript',
      review_type: 'comprehensive'
    }
  },
  {
    name: 'read',
    args: {
      file_paths: ['package.json'],
      analysis_type: 'content'
    }
  },
  {
    name: 'health',
    args: {
      check_type: 'comprehensive'
    }
  },
  {
    name: 'write_files_atomic',
    args: {
      file_operations: [
        { path: '/tmp/mkg-test-write.txt', content: 'Test content from MKG', operation: 'write' }
      ],
      create_backup: false
    }
  },
  {
    name: 'edit_file',
    args: {
      file_path: '/tmp/mkg-test-write.txt',
      edits: [
        { find: 'Test content', replace: 'Modified content' }
      ],
      validation_mode: 'lenient'
    }
  },
  {
    name: 'validate_changes',
    args: {
      file_path: '/tmp/mkg-test-write.txt',
      proposed_changes: [
        { find: 'Modified', replace: 'Validated' }
      ],
      validation_rules: ['syntax']
    }
  },
  {
    name: 'multi_edit',
    args: {
      file_operations: [
        {
          file_path: '/tmp/mkg-test-write.txt',
          edits: [{ find: 'Modified content', replace: 'Multi-edit content' }]
        }
      ],
      transaction_mode: 'best_effort',
      validation_level: 'lenient'
    }
  },
  {
    name: 'backup_restore',
    args: {
      action: 'list'
    }
  },
  {
    name: 'ask',
    args: {
      model: 'qwen3',
      prompt: 'Say "test passed" in exactly 2 words',
      max_tokens: 50
    }
  },
  {
    name: 'manage_conversation',
    args: {
      action: 'analytics'
    }
  },
  {
    name: 'get_analytics',
    args: {
      report_type: 'current'
    }
  },
  {
    name: 'check_backend_health',
    args: {
      backend: 'nvidia_qwen',
      force: false
    }
  },
  {
    name: 'spawn_subagent',
    args: {
      role: 'planner',
      task: 'List 3 steps to make coffee',
      verdict_mode: 'summary'
    }
  },
  {
    name: 'parallel_agents',
    args: {
      task: 'Create a simple hello world function',
      max_parallel: 1,
      max_iterations: 1,
      iterate_until_quality: false
    }
  },
  {
    name: 'council',
    args: {
      prompt: 'Is TypeScript better than JavaScript? Answer in one sentence.',
      topic: 'coding',
      confidence_needed: 'low'
    }
  }
];

async function runTests() {
  console.log('🦖 MKG Tool Test Suite - Testing all 15 core tools\n');
  console.log('=' .repeat(60));

  // Create test file first
  await fs.writeFile('/tmp/mkg-test-write.txt', 'Initial content for testing');

  const transport = new StdioClientTransport({
    command: 'node',
    args: ['server-mkg-v2.js'],
    env: { ...process.env, ENABLE_DASHBOARD: 'false' }
  });

  const client = new Client({ name: 'test-suite', version: '1.0.0' });

  try {
    await client.connect(transport);
    console.log('✅ Connected to MKG server\n');

    // Verify tool count
    const tools = await client.listTools();
    console.log(`📋 Tools available: ${tools.tools.length}`);
    console.log(`   Core tools: ${tools.tools.filter(t => !t.name.includes('_')).length}`);
    console.log(`   Aliases: ${tools.tools.filter(t => t.name.includes('_')).length}\n`);
    console.log('=' .repeat(60) + '\n');

    const results = [];

    for (const test of TESTS) {
      process.stdout.write(`Testing ${test.name.padEnd(20)}... `);
      const startTime = Date.now();

      try {
        const result = await client.callTool({
          name: test.name,
          arguments: test.args
        });

        const duration = Date.now() - startTime;
        const content = result.content[0]?.text || '';

        // Check if it's a success response
        let success = false;
        let errorMsg = null;

        try {
          const parsed = JSON.parse(content);
          success = parsed.success !== false;
          if (!success) {
            errorMsg = parsed.error || 'Unknown error';
          }
        } catch {
          // Non-JSON response, check if it contains error indicators
          success = !content.toLowerCase().includes('error');
          if (!success) {
            errorMsg = content.substring(0, 100);
          }
        }

        if (success) {
          console.log(`✅ PASS (${duration}ms)`);
          results.push({ tool: test.name, status: 'PASS', duration });
        } else {
          console.log(`❌ FAIL: ${errorMsg}`);
          results.push({ tool: test.name, status: 'FAIL', error: errorMsg, duration });
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        console.log(`❌ ERROR: ${error.message}`);
        results.push({ tool: test.name, status: 'ERROR', error: error.message, duration });
      }
    }

    // Summary
    console.log('\n' + '=' .repeat(60));
    console.log('📊 TEST SUMMARY\n');

    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    const errors = results.filter(r => r.status === 'ERROR').length;

    console.log(`   ✅ Passed: ${passed}/${TESTS.length}`);
    console.log(`   ❌ Failed: ${failed}/${TESTS.length}`);
    console.log(`   💥 Errors: ${errors}/${TESTS.length}`);

    if (failed > 0 || errors > 0) {
      console.log('\n❌ FAILED/ERROR TOOLS:');
      results.filter(r => r.status !== 'PASS').forEach(r => {
        console.log(`   - ${r.tool}: ${r.error}`);
      });
    }

    console.log('\n' + '=' .repeat(60));

    await client.close();

    // Cleanup
    await fs.unlink('/tmp/mkg-test-write.txt').catch(() => {});

    process.exit(passed === TESTS.length ? 0 : 1);

  } catch (error) {
    console.error('Connection error:', error.message);
    process.exit(1);
  }
}

runTests();
