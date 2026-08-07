/**
 * @fileoverview Follow-up B — LocalAdapter.parseResponse recovers reasoning_content
 * when content is empty (truncated <think> block), instead of letting the caller see
 * an empty answer / the stringified result object.
 *
 * The trap: a fixture with reasoning_content at the TOP level (like
 * base-handler.test.js:22-23) passes for the wrong reason — a real adapter response
 * carries it inside choices[0].message. These fixtures are OpenAI-shaped raw responses
 * run through the REAL LocalAdapter.parseResponse, not hand-built flat objects.
 */
import { describe, it, expect } from 'vitest';
import { LocalAdapter } from '../src/backends/local-adapter.js';
import { BaseHandler } from '../src/handlers/base-handler.js';

function makeAdapter() {
  const adapter = new LocalAdapter({ skipAutodiscovery: true });
  adapter.modelId = 'test-model';
  return adapter;
}

describe('LocalAdapter.parseResponse empty-content guard', () => {
  it('recovers reasoning_content when content is empty', () => {
    const raw = { choices: [{ message: { content: '', reasoning_content: 'partial thought' } }] };
    const result = makeAdapter().parseResponse(raw);
    expect(result.content).toBe('partial thought');
  });

  it('does NOT let reasoning_content clobber a genuine answer', () => {
    const raw = { choices: [{ message: { content: 'real', reasoning_content: 'partial thought' } }] };
    const result = makeAdapter().parseResponse(raw);
    expect(result.content).toBe('real');
  });

  it('end-to-end: extractResponseText returns the recovered text, not a stringified fallback', () => {
    const raw = { choices: [{ message: { content: '', reasoning_content: 'partial thought' } }] };
    const result = makeAdapter().parseResponse(raw);

    const handler = Object.create(BaseHandler.prototype);
    const extracted = handler.extractResponseText(result);

    expect(extracted).toBe('partial thought');
    expect(extracted.startsWith('{')).toBe(false);
  });

  it('leaves a genuinely empty response (no reasoning_content either) as empty', () => {
    const raw = { choices: [{ message: { content: '' } }] };
    const result = makeAdapter().parseResponse(raw);
    expect(result.content).toBe('');
  });
});
