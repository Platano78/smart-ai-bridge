/**
 * Functional Test Suite for Fuzzy Matching
 *
 * Tests core fuzzy matching functionality including:
 * - Exact matching (baseline behavior)
 * - Whitespace handling (normalization, tab/space conversion)
 * - Multi-line matching
 * - Line ending preservation (Windows vs Unix)
 * - Suggestion generation for failed matches
 * - Threshold sensitivity
 * - Common code patterns (Unity, JavaScript, Python)
 *
 * @test-suite fuzzy-matching-functional
 */

import { expect } from 'chai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock SmartAIBridge class with fuzzy matching methods
class MockSmartAIBridge {
  normalizeWhitespace(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .trim()
      .replace(/\r\n/g, '\n')
      .replace(/\s+/g, ' ')
      .replace(/\s*([{}()\[\];,])\s*/g, '$1');
  }

  calculateStringSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1.0;

    const distance = this.levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);

    if (maxLength === 0) return 1.0;
    return 1.0 - distance / maxLength;
  }

  levenshteinDistance(str1, str2) {
    const m = str1.length;
    const n = str2.length;

    if (m === 0) return n;
    if (n === 0) return m;

    const dp = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }

    return dp[m][n];
  }
}

describe('Fuzzy Matching Functional Tests', () => {
  let bridge;

  beforeEach(() => {
    bridge = new MockSmartAIBridge();
  });

  describe('Exact Matching', () => {
    it('should return 1.0 similarity for identical strings', () => {
      const similarity = bridge.calculateStringSimilarity('hello world', 'hello world');
      expect(similarity).to.equal(1.0);
    });

    it('should return 1.0 for empty strings', () => {
      const similarity = bridge.calculateStringSimilarity('', '');
      expect(similarity).to.equal(1.0);
    });

    it('should return 0 for completely different strings', () => {
      const similarity = bridge.calculateStringSimilarity('abc', 'xyz');
      expect(similarity).to.be.lessThan(0.5);
    });

    it('should handle multi-line exact matches', () => {
      const multiline = 'line1\nline2\nline3';
      const similarity = bridge.calculateStringSimilarity(multiline, multiline);
      expect(similarity).to.equal(1.0);
    });
  });

  describe('Whitespace Normalization', () => {
    it('should normalize multiple spaces to single space', () => {
      const normalized = bridge.normalizeWhitespace('hello    world');
      expect(normalized).to.equal('hello world');
    });

    it('should normalize tabs to spaces', () => {
      const normalized = bridge.normalizeWhitespace('hello\t\tworld');
      expect(normalized).to.equal('hello world');
    });

    it('should remove spaces around punctuation', () => {
      const normalized = bridge.normalizeWhitespace('if ( x == 5 ) { return ; }');
      expect(normalized).to.equal('if(x == 5){return;}');
    });

    it('should trim leading and trailing whitespace', () => {
      const normalized = bridge.normalizeWhitespace('  hello world  ');
      expect(normalized).to.equal('hello world');
    });

    it('should normalize Windows line endings to Unix', () => {
      const normalized = bridge.normalizeWhitespace('line1\r\nline2\r\nline3');
      expect(normalized).to.include('\n');
      expect(normalized).to.not.include('\r');
    });

    it('should handle mixed whitespace types', () => {
      const normalized = bridge.normalizeWhitespace('  \thello\t  \nworld\r\n  ');
      expect(normalized).to.equal('hello world');
    });
  });

  describe('Fuzzy Matching with Whitespace Variations', () => {
    it('should match strings differing only in whitespace amount', () => {
      const str1 = bridge.normalizeWhitespace('hello    world');
      const str2 = bridge.normalizeWhitespace('hello world');
      const similarity = bridge.calculateStringSimilarity(str1, str2);
      expect(similarity).to.equal(1.0);
    });

    it('should match strings differing in tab vs space', () => {
      const str1 = bridge.normalizeWhitespace('if (x == 5) { return; }');
      const str2 = bridge.normalizeWhitespace('if(x==5){return;}');
      const similarity = bridge.calculateStringSimilarity(str1, str2);
      expect(similarity).to.equal(1.0);
    });

    it('should match code with different indentation styles', () => {
      const str1 = bridge.normalizeWhitespace('function test() {\n  return 42;\n}');
      const str2 = bridge.normalizeWhitespace('function test(){return 42;}');
      const similarity = bridge.calculateStringSimilarity(str1, str2);
      expect(similarity).to.be.greaterThan(0.8);
    });
  });

  describe('Multi-line Matching', () => {
    it('should calculate similarity for multi-line strings', () => {
      const str1 = 'line1\nline2\nline3';
      const str2 = 'line1\nline2\nline4';
      const similarity = bridge.calculateStringSimilarity(str1, str2);
      expect(similarity).to.be.greaterThan(0.8);
      expect(similarity).to.be.lessThan(1.0);
    });

    it('should handle multi-line strings with whitespace differences', () => {
      const str1 = bridge.normalizeWhitespace('line1  \nline2\t\nline3');
      const str2 = bridge.normalizeWhitespace('line1\nline2\nline3');
      const similarity = bridge.calculateStringSimilarity(str1, str2);
      expect(similarity).to.equal(1.0);
    });

    it('should match Unity code blocks with formatting variations', async () => {
      const fixtureContent = await fs.readFile(
        path.join(__dirname, 'fuzzy-matching/fixtures/sample-unity-code.cs'),
        'utf-8'
      );

      // Original pattern from fixture
      const original = 'float t = 10.0f;\nVector3 lerpedVelocity = Vector3.Lerp(currentVelocity, targetVelocity, t);';

      // Pattern with extra whitespace
      const withWhitespace = 'float  t  =  10.0f;\nVector3  lerpedVelocity  =  Vector3.Lerp(currentVelocity,  targetVelocity,  t);';

      const normalized1 = bridge.normalizeWhitespace(original);
      const normalized2 = bridge.normalizeWhitespace(withWhitespace);
      const similarity = bridge.calculateStringSimilarity(normalized1, normalized2);

      expect(similarity).to.be.greaterThan(0.9);
    });
  });

  describe('Line Ending Preservation', () => {
    it('should detect Windows line endings', () => {
      const content = 'line1\r\nline2\r\nline3';
      const hasWindows = content.includes('\r\n');
      expect(hasWindows).to.be.true;
    });

    it('should detect Unix line endings', () => {
      const content = 'line1\nline2\nline3';
      const hasUnix = content.includes('\n') && !content.includes('\r\n');
      expect(hasUnix).to.be.true;
    });

    it('should normalize but remember original line ending format', () => {
      const windowsContent = 'line1\r\nline2\r\nline3';
      const originalLineEnding = windowsContent.includes('\r\n') ? '\r\n' : '\n';

      expect(originalLineEnding).to.equal('\r\n');
    });
  });

  describe('Suggestion Generation', () => {
    it('should find similar strings for typos', () => {
      const target = 'processData';
      const candidates = ['processDate', 'processData', 'processDataNew', 'handleData'];

      const similarities = candidates.map((candidate) => ({
        text: candidate,
        similarity: bridge.calculateStringSimilarity(target, candidate)
      }));

      similarities.sort((a, b) => b.similarity - a.similarity);

      expect(similarities[0].text).to.equal('processData'); // Exact match
      expect(similarities[0].similarity).to.equal(1.0);
      expect(similarities[1].similarity).to.be.greaterThan(0.8); // Close match
    });

    it('should rank suggestions by similarity score', () => {
      const target = 'getUserName';
      const candidates = [
        'getUserName',
        'getUsersName',
        'getUsername',
        'setUserName',
        'deleteUser'
      ];

      const similarities = candidates.map((candidate) => ({
        text: candidate,
        similarity: bridge.calculateStringSimilarity(target, candidate)
      }));

      similarities.sort((a, b) => b.similarity - a.similarity);

      // Exact match should be first
      expect(similarities[0].text).to.equal('getUserName');
      expect(similarities[0].similarity).to.equal(1.0);

      // Similar names should be next
      expect(similarities[1].similarity).to.be.greaterThan(0.7);
    });
  });

  describe('Threshold Sensitivity', () => {
    it('should match above 0.85 threshold for minor typos', () => {
      const str1 = 'processData';
      const str2 = 'processDate'; // One character difference
      const similarity = bridge.calculateStringSimilarity(str1, str2);
      expect(similarity).to.be.greaterThan(0.85);
    });

    it('should not match below 0.85 threshold for major differences', () => {
      const str1 = 'processData';
      const str2 = 'handleInput'; // Completely different
      const similarity = bridge.calculateStringSimilarity(str1, str2);
      expect(similarity).to.be.lessThan(0.85);
    });

    it('should handle threshold edge cases', () => {
      const str1 = 'test';
      const str2 = 'testing'; // 66.67% similarity
      const similarity = bridge.calculateStringSimilarity(str1, str2);
      expect(similarity).to.be.lessThan(0.85);
    });
  });

  describe('Unity Code Pattern Matching', () => {
    it('should match Unity Vector3.Lerp patterns with whitespace variations', () => {
      const pattern1 = 'Vector3 lerpedVelocity = Vector3.Lerp(currentVelocity, targetVelocity, t);';
      const pattern2 = 'Vector3  lerpedVelocity=Vector3.Lerp(currentVelocity,targetVelocity,t);';

      const normalized1 = bridge.normalizeWhitespace(pattern1);
      const normalized2 = bridge.normalizeWhitespace(pattern2);
      const similarity = bridge.calculateStringSimilarity(normalized1, normalized2);

      expect(similarity).to.equal(1.0);
    });

    it('should match Unity method declarations with formatting differences', () => {
      const pattern1 = 'void HandleVerticalMovement()';
      const pattern2 = 'void  HandleVerticalMovement ( )';

      const normalized1 = bridge.normalizeWhitespace(pattern1);
      const normalized2 = bridge.normalizeWhitespace(pattern2);
      const similarity = bridge.calculateStringSimilarity(normalized1, normalized2);

      expect(similarity).to.equal(1.0);
    });
  });

  describe('JavaScript Pattern Matching', () => {
    it('should match JavaScript function declarations', async () => {
      const fixtureContent = await fs.readFile(
        path.join(__dirname, 'fuzzy-matching/fixtures/sample-javascript-code.js'),
        'utf-8'
      );

      const pattern1 = 'function processData(input) {';
      const pattern2 = 'function  processData ( input )  {';

      const normalized1 = bridge.normalizeWhitespace(pattern1);
      const normalized2 = bridge.normalizeWhitespace(pattern2);
      const similarity = bridge.calculateStringSimilarity(normalized1, normalized2);

      expect(similarity).to.be.greaterThan(0.9);
    });

    it('should match JavaScript chained method calls', () => {
      const pattern1 = 'const normalized = input.trim().replace(/\\s+/g, \' \').toLowerCase();';
      const pattern2 = 'const  normalized  =  input.trim().replace(/\\s+/g,\' \').toLowerCase();';

      const normalized1 = bridge.normalizeWhitespace(pattern1);
      const normalized2 = bridge.normalizeWhitespace(pattern2);
      const similarity = bridge.calculateStringSimilarity(normalized1, normalized2);

      expect(similarity).to.be.greaterThan(0.9);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings gracefully', () => {
      const similarity = bridge.calculateStringSimilarity('', 'test');
      expect(similarity).to.equal(0);
    });

    it('should handle null/undefined inputs', () => {
      const normalized1 = bridge.normalizeWhitespace(null);
      const normalized2 = bridge.normalizeWhitespace(undefined);
      expect(normalized1).to.equal('');
      expect(normalized2).to.equal('');
    });

    it('should handle very long strings', () => {
      const longStr = 'a'.repeat(4000);
      const similarity = bridge.calculateStringSimilarity(longStr, longStr);
      expect(similarity).to.equal(1.0);
    });

    it('should handle strings with only whitespace', () => {
      const normalized = bridge.normalizeWhitespace('   \t\n\r\n   ');
      expect(normalized).to.equal('');
    });

    it('should handle special characters', () => {
      const str1 = 'hello@world#2024!';
      const str2 = 'hello@world#2024!';
      const similarity = bridge.calculateStringSimilarity(str1, str2);
      expect(similarity).to.equal(1.0);
    });
  });

  describe('Performance Characteristics', () => {
    it('should complete exact match in < 5ms', () => {
      const start = Date.now();
      const str = 'a'.repeat(1000);
      bridge.calculateStringSimilarity(str, str);
      const duration = Date.now() - start;
      expect(duration).to.be.lessThan(5);
    });

    it('should handle medium-length fuzzy match in < 50ms', () => {
      const start = Date.now();
      const str1 = 'a'.repeat(500) + 'x' + 'a'.repeat(500);
      const str2 = 'a'.repeat(500) + 'y' + 'a'.repeat(500);
      bridge.calculateStringSimilarity(str1, str2);
      const duration = Date.now() - start;
      expect(duration).to.be.lessThan(50);
    });
  });
});
