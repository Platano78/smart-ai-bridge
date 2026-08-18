/**
 * @fileoverview Response-shape verification for `council` and `dual_iterate`
 * — see shape-write-restore-health.test.js for context on this test-file group.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { CouncilHandler } from '../src/handlers/council-handler.js';
import { setBackendRegistry } from '../src/config/council-config-manager.js';
import { DualIterateHandler } from '../src/handlers/dual-iterate-handler.js';

function stubContextLimit(handler, charLimit = 500000) {
  handler.getContextLimit = async () => ({ charLimit, model: 'test-model' });
  return handler;
}

describe('council: response shape', () => {
  afterEach(() => setBackendRegistry(null));

  it('parallel strategy matches the documented Returns clause', async () => {
    // council-config.json ships with empty per-topic backend rosters by
    // design (see its _comment) — the roster is derived live from the wired
    // registry's getUsableBackends(), so a fake registry is wired here to
    // give the 'general' topic >=2 candidates.
    setBackendRegistry({
      getUsableBackends: () => ['local', 'nvidia_glm'],
      getStats: () => ({ backends: [] })
    });

    const handler = stubContextLimit(new CouncilHandler({}));
    handler.makeRequest = async (prompt, backend) => ({ content: `response from ${backend}` });

    const result = await handler.execute({
      prompt: 'what is the best approach here',
      topic: 'general',
      confidence_needed: 'low'
    });

    expect(result).toHaveProperty('success', true);
    expect(result).toHaveProperty('topic', 'general');
    expect(result).toHaveProperty('strategy');
    expect(result).toHaveProperty('confidence_needed', 'low');
    expect(result).toHaveProperty('backends_queried');
    expect(result).toHaveProperty('backends_responded');
    expect(result.responses[0]).toHaveProperty('backend');
    expect(result.responses[0]).toHaveProperty('success');
    expect(result.responses[0]).toHaveProperty('content');
    expect(result).toHaveProperty('processing_time_ms');
    expect(result).toHaveProperty('metrics');
    expect(result).toHaveProperty('synthesis_hint');
  });
});

describe('dual_iterate: response shape', () => {
  it('matches the documented Returns clause on the success path', async () => {
    const handler = stubContextLimit(new DualIterateHandler({}));
    // Pre-set the executor so _getExecutor() uses it directly rather than
    // constructing a real DualIterateExecutor (requires a wired
    // DualWorkflowManager).
    handler.executor = {
      execute: async () => ({
        success: true,
        code: 'function add(a, b) { return a + b; }',
        mode: 'dual_iterative',
        iterations: 2,
        executionTime: 1234,
        history: [{ iteration: 1, note: 'first pass' }],
        finalReview: { status: 'accepted', critique: 'looks correct and complete' },
        selfReviewApplied: true
      })
    };

    const result = await handler.execute({
      task: 'Write a function that adds two numbers together',
      include_history: true
    });

    expect(result).toHaveProperty('success', true);
    expect(result).toHaveProperty('code');
    expect(result).toHaveProperty('mode');
    expect(result).toHaveProperty('iterations');
    expect(result).toHaveProperty('execution_time_ms');
    expect(result.metadata).toHaveProperty('task_preview');
    expect(result.metadata).toHaveProperty('code_length');
    expect(result.metadata).toHaveProperty('timestamp');
    expect(result).toHaveProperty('history');
    expect(result.final_review).toHaveProperty('status');
    expect(result.final_review).toHaveProperty('notes');
    expect(result).toHaveProperty('self_review_applied', true);
  });
});
