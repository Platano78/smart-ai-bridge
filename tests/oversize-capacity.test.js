/**
 * @fileoverview Every handler that finds a payload too big for `local` used to
 * escalate straight to nvidia_glm without checking whether it fits there
 * either — a 636K-char file would still get sent to a 128K-char backend.
 * findBackendWithCapacity() picks a backend that actually fits (or throws a
 * clear, actionable error when nothing does), replacing "attempt anyway".
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { AnalyzeFileHandler } from '../src/handlers/analyze-file-handler.js';
import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';

afterEach(() => vi.restoreAllMocks());

function stubbedAnalyzeHandler() {
  const handler = new AnalyzeFileHandler({});
  handler.getContextLimit = async () => ({ charLimit: 85196, model: 'test-model' });
  return handler;
}

describe('findBackendWithCapacity', () => {
  it('picks local when the dynamic local limit fits', async () => {
    const handler = stubbedAnalyzeHandler();
    const result = await handler.findBackendWithCapacity(50000);
    expect(result).toEqual({ name: 'local', cap: 85196 });
  });

  it('picks a cloud backend when local is too small but a cloud one fits', async () => {
    const handler = stubbedAnalyzeHandler();
    const result = await handler.findBackendWithCapacity(100000, ['local']);
    expect(result).not.toBeNull();
    expect(result.cap).toBeGreaterThanOrEqual(100000);
    expect(result.name).not.toBe('local');
  });

  it('returns null when the payload exceeds every cap', async () => {
    const handler = stubbedAnalyzeHandler();
    const result = await handler.findBackendWithCapacity(999999999);
    expect(result).toBeNull();
  });

  it('works with no registry (fallback list path)', async () => {
    const handler = stubbedAnalyzeHandler();
    expect(handler.backendRegistry).toBeUndefined();
    const result = await handler.findBackendWithCapacity(50000);
    expect(result).toEqual({ name: 'local', cap: 85196 });
  });
});

describe('getBackendContextLimit', () => {
  it('resolves openai_chatgpt to 512000, and the dead "chatgpt" alias to the 128000 default', () => {
    const handler = stubbedAnalyzeHandler();
    expect(handler.getBackendContextLimit('openai_chatgpt')).toBe(512000);
    expect(handler.getBackendContextLimit('chatgpt')).toBe(128000);
  });
});

describe('analyze_file oversize handling', () => {
  let tmpDir;

  afterEach(async () => {
    if (tmpDir) {
      await fsp.rm(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it('throws with the payload size and largest capacity when nothing fits', async () => {
    const content = 'x'.repeat(700000); // exceeds every backend cap
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-oversize-'));
    const filePath = path.join(tmpDir, 'huge.js');
    await fsp.writeFile(filePath, content, 'utf8');

    const handler = stubbedAnalyzeHandler();

    await expect(handler.execute({
      filePath,
      question: 'what does this do',
      options: { backend: 'local' }
    })).rejects.toThrow(/700\d+ chars.*no configured backend can hold it/s);
  });

  it('succeeds on the escalated backend when the payload fits after escalation', async () => {
    const content = 'x'.repeat(100000); // exceeds local (85196) but fits nvidia_glm/others
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sab-escalate-'));
    const filePath = path.join(tmpDir, 'big.js');
    await fsp.writeFile(filePath, content, 'utf8');

    const handler = stubbedAnalyzeHandler();
    let usedBackend = null;
    handler.router = {
      makeRequest: async (prompt, backend) => {
        usedBackend = backend;
        return { content: '{"summary":"ok","findings":[],"confidence":0.8,"suggestedActions":[]}' };
      }
    };

    const result = await handler.execute({
      filePath,
      question: 'what does this do',
      options: { backend: 'local' }
    });

    expect(result.isError).not.toBe(true);
    expect(usedBackend).not.toBe('local');
    expect(usedBackend).not.toBeNull();
  });
});
