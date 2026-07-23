import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { ModifyFileHandler } from '../src/handlers/modify-file-handler.js';
import { GenerateFileHandler } from '../src/handlers/generate-file-handler.js';

// Corrupts a write by dropping the trailing content, simulating the short/partial
// write scenario writeFileVerified exists to catch.
function corruptOnWrite(targetPath) {
  const realWriteFile = fs.writeFile.bind(fs);
  return vi.spyOn(fs, 'writeFile').mockImplementation(async (p, content, enc) => {
    if (p === targetPath) {
      const dropped = content.split('\n').slice(0, -2).join('\n');
      return realWriteFile(p, dropped, enc);
    }
    return realWriteFile(p, content, enc);
  });
}

describe('post-write readback verification (verified-write.js wired into auto-write paths)', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sab-write-verify-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('ModifyFileHandler auto-write', () => {
    const original = 'function old() {\n  return 1;\n}\n';
    const modifyResponse = {
      content: 'SUMMARY: bump return value\n\n<<<<<<< SEARCH\nreturn 1;\n=======\nreturn 2;\n>>>>>>> REPLACE'
    };

    function makeHandler() {
      const handler = new ModifyFileHandler({ router: {} });
      vi.spyOn(handler, 'getContextLimit').mockResolvedValue({ charLimit: 500000, model: 'test-model' });
      vi.spyOn(handler, 'makeRequest').mockResolvedValue(modifyResponse);
      return handler;
    }

    it('throws a write-verification error and never reports success on a corrupted write', async () => {
      const filePath = path.join(tmpDir, 'target.js');
      await fs.writeFile(filePath, original, 'utf8');
      corruptOnWrite(filePath);

      const handler = makeHandler();
      await expect(handler.execute({
        filePath,
        instructions: 'bump return value',
        options: { review: false, backup: false }
      })).rejects.toThrow(/WRITE_VERIFY_MISMATCH|Write verification FAILED/);
    });

    it('positive control: succeeds and disk matches intended content when the write is clean', async () => {
      const filePath = path.join(tmpDir, 'target-clean.js');
      await fs.writeFile(filePath, original, 'utf8');

      const handler = makeHandler();
      const result = await handler.execute({
        filePath,
        instructions: 'bump return value',
        options: { review: false, backup: false }
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('written');
      const onDisk = await fs.readFile(filePath, 'utf8');
      expect(onDisk).toContain('return 2;');
    });
  });

  describe('GenerateFileHandler auto-write', () => {
    const generateResponse = {
      content: "SUMMARY: hello module\n\nCODE:\n```js\nfunction hello() {\n  return 'hi there my friend';\n}\n```"
    };

    function makeHandler() {
      const handler = new GenerateFileHandler({ router: {} });
      vi.spyOn(handler, 'getContextLimit').mockResolvedValue({ charLimit: 500000, model: 'test-model' });
      vi.spyOn(handler, 'makeRequest').mockResolvedValue(generateResponse);
      return handler;
    }

    it('reports success:false (never true) on a corrupted write', async () => {
      const outputPath = path.join(tmpDir, 'generated.js');
      corruptOnWrite(outputPath);

      const handler = makeHandler();
      const result = await handler.execute({
        spec: 'a hello function',
        outputPath,
        options: { review: false }
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/WRITE_VERIFY_MISMATCH|Write verification FAILED/);
    });

    it('positive control: succeeds and disk matches intended content when the write is clean', async () => {
      const outputPath = path.join(tmpDir, 'generated-clean.js');

      const handler = makeHandler();
      const result = await handler.execute({
        spec: 'a hello function',
        outputPath,
        options: { review: false }
      });

      expect(result.success).toBe(true);
      const onDisk = await fs.readFile(outputPath, 'utf8');
      expect(onDisk).toContain('function hello()');
    });
  });
});
