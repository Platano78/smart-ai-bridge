/**
 * @fileoverview Response-shape verification for `spawn_subagent` and
 * `parallel_agents` — see shape-write-restore-health.test.js for context on
 * this test-file group.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import { SubagentHandler } from '../src/handlers/subagent-handler.js';
import { ParallelAgentsHandler } from '../src/handlers/parallel-agents-handler.js';

describe('spawn_subagent: response shape', () => {
  it('matches the documented Returns clause on the success path', async () => {
    const handler = new SubagentHandler({
      router: {
        makeRequest: async () => ({
          content: 'VERDICT: PASS\nDetails: the code looks correct.',
          backend: 'local'
        })
      }
    });

    const result = await handler.execute({
      role: 'code-reviewer',
      task: 'Review this snippet for quality issues',
      file_patterns: [],
      write_files: false
    });

    expect(result).toHaveProperty('success', true);
    expect(result).toHaveProperty('role', 'code-reviewer');
    expect(result).toHaveProperty('task');
    expect(result).toHaveProperty('backend_used');
    expect(result).toHaveProperty('response');
    expect(result).toHaveProperty('verdict');
    expect(result).toHaveProperty('files_analyzed', 0);
    expect(result).toHaveProperty('files_written');
    expect(result).toHaveProperty('work_directory', null);
    expect(result).toHaveProperty('suggested_tools');
    expect(result).toHaveProperty('processing_time_ms');
    expect(result).toHaveProperty('metrics');
  });
});

describe('parallel_agents: response shape', () => {
  let tmpDir;
  afterEach(async () => {
    if (tmpDir) await fsp.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  it('matches the documented Returns clause on the success path', async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-shape-parallel-'));

    const handler = new ParallelAgentsHandler({});
    // Stub every subagentHandler.execute call (decompose, RED-phase task,
    // quality review) — the seam parallel_agents itself calls directly.
    handler.subagentHandler.execute = async (args) => {
      if (args.role === 'tdd-decomposer') {
        return {
          success: true,
          response: JSON.stringify({
            parallel_groups: [
              { group: 1, name: 'tests', tasks: [{ id: 'T1', phase: 'RED', task: 'write a failing test for add()' }] }
            ]
          })
        };
      }
      if (args.role === 'tdd-quality-reviewer') {
        return {
          success: true,
          response: JSON.stringify({ verdict: 'pass', score: 90, summary: 'looks good' })
        };
      }
      return {
        success: true,
        response: 'test("adds", () => { expect(add(1,2)).toBe(3); });',
        backend_used: 'local',
        processing_time_ms: 5
      };
    };

    const result = await handler.execute({
      task: 'Implement an add(a, b) function with tests',
      max_parallel: 2,
      write_files: false,
      work_directory: tmpDir
    });

    expect(result).toHaveProperty('success', true);
    expect(result).toHaveProperty('task');
    expect(result).toHaveProperty('decomposition');
    expect(result.execution).toHaveProperty('groups_executed');
    expect(result.execution).toHaveProperty('tasks_completed');
    expect(result.execution).toHaveProperty('tasks_failed');
    expect(result.execution).toHaveProperty('max_parallel_used', 2);
    expect(result.execution).toHaveProperty('files_written');
    expect(result.execution).toHaveProperty('write_files_enabled', false);
    expect(result.router_info).toHaveProperty('slots');
    expect(result.router_info).toHaveProperty('model');
    expect(result.router_info).toHaveProperty('status');
    expect(result.quality).toHaveProperty('verdict');
    expect(result.quality).toHaveProperty('score');
    expect(result.quality).toHaveProperty('iterations');
    expect(result).toHaveProperty('synthesis');
    expect(result).toHaveProperty('files');
    expect(result).toHaveProperty('work_directory', tmpDir);
    expect(result).toHaveProperty('processing_time_ms');
    expect(result).toHaveProperty('metrics');
  });
});
