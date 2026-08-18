/**
 * @fileoverview Response-shape verification for `ask` — see
 * shape-write-restore-health.test.js for context on this test-file group.
 */
import { describe, it, expect } from 'vitest';
import { AskHandler } from '../src/handlers/ask-handler.js';

// getContextLimit() otherwise probes a real local router and can block for
// minutes when nothing is listening (see oversize-capacity.test.js).
function stubContextLimit(handler, charLimit = 500000) {
  handler.getContextLimit = async () => ({ charLimit, model: 'test-model' });
  return handler;
}

describe('ask: response shape', () => {
  it('matches the documented Returns clause on the success path', async () => {
    const handler = stubContextLimit(new AskHandler({
      router: {
        routeRequest: async () => 'local',
        makeRequest: async () => ({
          content: 'hello from local',
          metadata: { finishReason: 'stop' }
        })
      }
    }));

    const result = await handler.execute({ model: 'local', prompt: 'say hi' });

    for (const key of [
      'success', 'model', 'requested_backend', 'actual_backend', 'prompt',
      'response', 'backend_used', 'fallback_chain', 'response_time',
      'cache_status', 'thinking_enabled', 'max_tokens', 'was_truncated',
      'smart_routing_applied', 'routing', 'processing_time'
    ]) {
      expect(result).toHaveProperty(key);
    }
    expect(result.response).toBe('hello from local');
  });
});
