/**
 * @fileoverview calculateDynamicTokens sized the OUTPUT budget by dividing the
 * context by the slot count — the same double division that was fixed on the 65%
 * input side in model-discovery. localSlotInfo.context carries the RAW nCtx, so a
 * /props source reporting an already-per-request 32768 with total_slots 4 was
 * divided a second time. This pins the output side to the per-request window.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AnalyzeFileHandler } from '../src/handlers/analyze-file-handler.js';

const handler = new AnalyzeFileHandler({});

// calculateDynamicTokens logs to stderr on every call; keep the suite output readable.
afterEach(() => vi.restoreAllMocks());

describe('calculateDynamicTokens - local output budget', () => {
  it('sizes the output budget from the per-request window, without dividing by slots', async () => {
    // 32768 is already per-request. 32768 * 0.35 = 11468, clamped to the 8000 ceiling.
    // The bug divided by slots first: 8192 * 0.35 = 2867 — a 2.8x under-allocation.
    const limit = handler.calculateDynamicTokens('local', 5000, 'general', {
      contextPerRequest: 32768,
      context: 32768,
      slots: 4
    });

    expect(limit).toBe(8000);
    expect(limit).not.toBe(2867);
  });

  it('applies the 1000 floor on a tiny per-request window', async () => {
    // 2048 * 0.35 = 716, below the floor.
    const limit = handler.calculateDynamicTokens('local', 5000, 'general', {
      contextPerRequest: 2048,
      context: 2048,
      slots: 1
    });

    expect(limit).toBe(1000);
  });

  it('applies the 8000 ceiling on a large per-request window', async () => {
    const limit = handler.calculateDynamicTokens('local', 5000, 'general', {
      contextPerRequest: 262144,
      context: 262144,
      slots: 1
    });

    expect(limit).toBe(8000);
  });

  it('scales between the floor and the ceiling', async () => {
    // 16384 * 0.35 = 5734, inside both bounds - proves the budget actually tracks
    // the window rather than always landing on a clamp.
    const limit = handler.calculateDynamicTokens('local', 5000, 'general', {
      contextPerRequest: 16384,
      context: 16384,
      slots: 2
    });

    expect(limit).toBe(5734);
  });

  it('falls back to the conservative fixed limit when localSlotInfo is null', async () => {
    expect(handler.calculateDynamicTokens('local', 5000, 'general', null)).toBe(4000);
  });

  it('falls back to the conservative fixed limit rather than NaN on a partial object', async () => {
    // An older/partial object with no contextPerRequest must not produce NaN.
    expect(handler.calculateDynamicTokens('local', 5000, 'general', { context: 32768, slots: 4 })).toBe(4000);
    expect(handler.calculateDynamicTokens('local', 5000, 'general', { contextPerRequest: 0, slots: 4 })).toBe(4000);
  });

  it('leaves cloud backends on their fixed limits', async () => {
    expect(handler.calculateDynamicTokens('nvidia_glm', 5000, 'general', null)).toBe(8000);
    expect(handler.calculateDynamicTokens('groq_llama', 5000, 'general', null)).toBe(6000);
  });
});
