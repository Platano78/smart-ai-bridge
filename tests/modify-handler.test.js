import { describe, it, expect } from 'vitest';
import { ModifyFileHandler } from '../src/handlers/modify-file-handler.js';

describe('ModifyFileHandler', () => {
  const handler = new ModifyFileHandler({ handlerName: 'ModifyFile' });

  describe('parseSearchReplaceBlocks', () => {
    it('parses valid blocks', () => {
      const text = 'SUMMARY: Fixed bug\n\n<<<<<<< SEARCH\nfunction old() {\n  return false;\n}\n=======\nfunction fixed() {\n  return true;\n}\n>>>>>>> REPLACE';
      const { blocks, summary } = handler.parseSearchReplaceBlocks(text);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].search).toContain('function old()');
      expect(blocks[0].replace).toContain('function fixed()');
      expect(summary).toBe('Fixed bug');
    });

    it('handles multiple blocks', () => {
      const text = '<<<<<<< SEARCH\nline1\n=======\nline1_new\n>>>>>>> REPLACE\n\n<<<<<<< SEARCH\nline2\n=======\nline2_new\n>>>>>>> REPLACE';
      const { blocks } = handler.parseSearchReplaceBlocks(text);
      expect(blocks).toHaveLength(2);
    });

    it('returns empty for plain text', () => {
      const { blocks } = handler.parseSearchReplaceBlocks('just some text');
      expect(blocks).toHaveLength(0);
    });
  });

  describe('applySearchReplaceBlocks', () => {
    it('applies exact match', () => {
      const original = 'function foo() {\n  return 1;\n}';
      const blocks = [{ search: 'return 1;', replace: 'return 2;' }];
      const { code, appliedCount } = handler.applySearchReplaceBlocks(original, blocks);
      expect(code).toContain('return 2;');
      expect(appliedCount).toBe(1);
    });

    it('reports failed blocks', () => {
      const original = 'hello world';
      const blocks = [{ search: 'not found', replace: 'replaced' }];
      const { failedBlocks } = handler.applySearchReplaceBlocks(original, blocks);
      expect(failedBlocks).toHaveLength(1);
    });
  });
});
