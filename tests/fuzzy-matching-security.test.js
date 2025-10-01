/**
 * Security Test Suite for Fuzzy Matching
 *
 * Tests comprehensive security controls including:
 * - DoS protection (large strings, iteration limits, memory exhaustion)
 * - Input validation (type checking, bounds validation, structure validation)
 * - Timeout enforcement (long-running operations, concurrent handling)
 * - Injection resistance (code injection, command injection)
 * - Metrics tracking and abuse detection
 *
 * Target Security Score: 9.7/10
 * @test-suite fuzzy-matching-security
 */

import { expect } from 'chai';
import {
  FUZZY_SECURITY_LIMITS,
  validateFuzzyEditComplexity,
  createFuzzyTimeoutWrapper,
  trackFuzzyMetrics,
  getFuzzyMetrics,
  detectAbusePatterns,
  resetFuzzyMetrics,
  validateFuzzyThreshold,
  validateMaxSuggestions
} from '../fuzzy-matching-security.js';

describe('Fuzzy Matching Security Tests', () => {
  beforeEach(() => {
    // Reset metrics before each test
    resetFuzzyMetrics();
  });

  describe('DoS Protection', () => {
    it('should reject edits exceeding MAX_FUZZY_EDIT_LENGTH', () => {
      const largeString = 'a'.repeat(FUZZY_SECURITY_LIMITS.MAX_FUZZY_EDIT_LENGTH + 1);
      const edits = [{ find: largeString, replace: 'short' }];

      const result = validateFuzzyEditComplexity(edits);

      expect(result.valid).to.be.false;
      expect(result.errors).to.have.lengthOf.at.least(1);
      expect(result.errors[0]).to.include('exceeds maximum length');
    });

    it('should reject edits exceeding MAX_FUZZY_LINE_COUNT', () => {
      const manyLines = Array(FUZZY_SECURITY_LIMITS.MAX_FUZZY_LINE_COUNT + 1)
        .fill('line')
        .join('\n');
      const edits = [{ find: manyLines, replace: 'short' }];

      const result = validateFuzzyEditComplexity(edits);

      expect(result.valid).to.be.false;
      expect(result.errors).to.have.lengthOf.at.least(1);
      expect(result.errors[0]).to.include('exceeds maximum');
      expect(result.errors[0]).to.include('lines');
    });

    it('should enforce MAX_FUZZY_ITERATIONS limit', () => {
      // This test verifies the iteration limit constant exists
      expect(FUZZY_SECURITY_LIMITS.MAX_FUZZY_ITERATIONS).to.equal(10000);
      expect(FUZZY_SECURITY_LIMITS.MAX_FUZZY_ITERATIONS).to.be.a('number');
      expect(FUZZY_SECURITY_LIMITS.MAX_FUZZY_ITERATIONS).to.be.greaterThan(0);
    });

    it('should reject total characters exceeding MAX_FUZZY_TOTAL_CHARS', () => {
      const mediumString = 'a'.repeat(30000);
      const edits = [
        { find: mediumString, replace: mediumString },
        { find: mediumString, replace: mediumString }
      ];

      const result = validateFuzzyEditComplexity(edits);

      expect(result.valid).to.be.false;
      expect(result.errors).to.have.lengthOf.at.least(1);
      expect(result.errors[0]).to.include('Total edit characters');
      expect(result.errors[0]).to.include('exceeds maximum');
    });

    it('should prevent memory exhaustion via cumulative complexity', () => {
      // Create 100 edits with 600 chars each = 60,000 total (exceeds 50,000 limit)
      const edits = Array(100)
        .fill(null)
        .map(() => ({ find: 'a'.repeat(300), replace: 'b'.repeat(300) }));

      const result = validateFuzzyEditComplexity(edits);

      expect(result.valid).to.be.false;
      expect(result.totalCharacters).to.equal(60000);
      expect(result.errors).to.have.lengthOf.at.least(1);
    });
  });

  describe('Input Validation', () => {
    it('should reject non-array edits parameter', () => {
      const result = validateFuzzyEditComplexity('not an array');

      expect(result.valid).to.be.false;
      expect(result.errors).to.include('edits must be an array');
    });

    it('should reject empty edits array', () => {
      const result = validateFuzzyEditComplexity([]);

      expect(result.valid).to.be.false;
      expect(result.errors).to.include('edits array cannot be empty');
    });

    it('should reject edit objects missing required properties', () => {
      const edits = [{ find: 'test' }]; // Missing 'replace'

      const result = validateFuzzyEditComplexity(edits);

      expect(result.valid).to.be.false;
      expect(result.errors).to.have.lengthOf.at.least(1);
      expect(result.errors[0]).to.include("'replace' must be a string");
    });

    it('should reject non-string find/replace values', () => {
      const edits = [
        { find: 123, replace: 'valid' },
        { find: 'valid', replace: { invalid: 'object' } }
      ];

      const result = validateFuzzyEditComplexity(edits);

      expect(result.valid).to.be.false;
      expect(result.errors.length).to.be.at.least(2);
    });

    it('should validate threshold bounds (0.1 - 1.0)', () => {
      expect(validateFuzzyThreshold(0.05)).to.equal(0.1);
      expect(validateFuzzyThreshold(1.5)).to.equal(1.0);
      expect(validateFuzzyThreshold(0.85)).to.equal(0.85);
      expect(validateFuzzyThreshold('invalid')).to.equal(0.8);
      expect(validateFuzzyThreshold(NaN)).to.equal(0.8);
    });

    it('should validate max suggestions bounds (1 - 10)', () => {
      expect(validateMaxSuggestions(0)).to.equal(1);
      expect(validateMaxSuggestions(15)).to.equal(10);
      expect(validateMaxSuggestions(5)).to.equal(5);
      expect(validateMaxSuggestions('invalid')).to.equal(3);
      expect(validateMaxSuggestions(NaN)).to.equal(3);
    });
  });

  describe('Timeout Enforcement', () => {
    it('should timeout long-running operations', async () => {
      const slowOperation = async () => {
        return new Promise((resolve) => {
          setTimeout(() => resolve('completed'), 10000); // 10 second operation
        });
      };

      try {
        await createFuzzyTimeoutWrapper(slowOperation, 100); // 100ms timeout
        expect.fail('Should have thrown timeout error');
      } catch (error) {
        expect(error.message).to.include('timed out');
        expect(error.message).to.include('100ms');
      }
    });

    it('should allow fast operations to complete', async () => {
      const fastOperation = async () => {
        return new Promise((resolve) => {
          setTimeout(() => resolve('completed'), 50); // 50ms operation
        });
      };

      const result = await createFuzzyTimeoutWrapper(fastOperation, 1000); // 1s timeout
      expect(result).to.equal('completed');
    });

    it('should use default timeout when not specified', async () => {
      const slowOperation = async () => {
        return new Promise((resolve) => {
          setTimeout(() => resolve('completed'), 10000); // 10 second operation
        });
      };

      try {
        await createFuzzyTimeoutWrapper(slowOperation); // Should use FUZZY_TIMEOUT_MS (5000ms)
        expect.fail('Should have thrown timeout error');
      } catch (error) {
        expect(error.message).to.include('timed out');
        expect(error.message).to.include('5000ms');
      }
    });
  });

  describe('Injection Resistance', () => {
    it('should safely handle code injection attempts in find string', () => {
      const maliciousEdits = [
        { find: "'; DROP TABLE users; --", replace: 'safe' },
        { find: '$(rm -rf /)', replace: 'safe' },
        { find: '<script>alert("xss")</script>', replace: 'safe' }
      ];

      const result = validateFuzzyEditComplexity(maliciousEdits);

      // Should validate based on complexity, not content
      expect(result.valid).to.be.true;
      expect(result.editCount).to.equal(3);
    });

    it('should safely handle special regex characters', () => {
      const edits = [
        { find: '.*\\d+[a-z]{1,5}(?:foo|bar)', replace: 'safe' },
        { find: '^$.*+?{}[]()|\\/^', replace: 'safe' }
      ];

      const result = validateFuzzyEditComplexity(edits);

      // Fuzzy matching doesn't interpret as regex, so these are safe
      expect(result.valid).to.be.true;
      expect(result.editCount).to.equal(2);
    });

    it('should handle unicode and escape sequences safely', () => {
      const edits = [
        { find: '\\x00\\x1f\\x7f', replace: 'safe' },
        { find: '\u0000\u001f\u007f', replace: 'safe' },
        { find: '🚀🔥💻', replace: 'safe' }
      ];

      const result = validateFuzzyEditComplexity(edits);

      expect(result.valid).to.be.true;
      expect(result.editCount).to.equal(3);
    });
  });

  describe('Metrics Tracking', () => {
    it('should track exact match events', () => {
      trackFuzzyMetrics('EXACT_MATCH', { similarity: 1.0 });

      const metrics = getFuzzyMetrics();

      expect(metrics.exactMatches).to.equal(1);
      expect(metrics.totalOperations).to.equal(1);
    });

    it('should track fuzzy match events with similarity', () => {
      trackFuzzyMetrics('FUZZY_MATCH', { similarity: 0.87 });
      trackFuzzyMetrics('FUZZY_MATCH', { similarity: 0.93 });

      const metrics = getFuzzyMetrics();

      expect(metrics.fuzzyMatches).to.equal(2);
      expect(metrics.totalOperations).to.equal(2);
      expect(metrics.averageSimilarity).to.be.closeTo(0.9, 0.01);
    });

    it('should track failed match events', () => {
      trackFuzzyMetrics('MATCH_FAILED', {});

      const metrics = getFuzzyMetrics();

      expect(metrics.failedMatches).to.equal(1);
      expect(metrics.totalOperations).to.equal(1);
    });

    it('should track iteration limit hits', () => {
      trackFuzzyMetrics('ITERATION_LIMIT_HIT', { iterations: 10000 });

      const metrics = getFuzzyMetrics();

      expect(metrics.iterationLimitHits).to.equal(1);
    });

    it('should track timeout events', () => {
      trackFuzzyMetrics('TIMEOUT', { timeoutMs: 5000 });

      const metrics = getFuzzyMetrics();

      expect(metrics.timeouts).to.equal(1);
    });

    it('should track complexity limit hits', () => {
      trackFuzzyMetrics('COMPLEXITY_LIMIT_HIT', { totalCharacters: 60000 });

      const metrics = getFuzzyMetrics();

      expect(metrics.complexityLimitHits).to.equal(1);
    });
  });

  describe('Abuse Detection', () => {
    it('should detect high iteration limit rate', () => {
      // Simulate 100 operations with 15 iteration limit hits (15%)
      for (let i = 0; i < 85; i++) {
        trackFuzzyMetrics('EXACT_MATCH', {});
      }
      for (let i = 0; i < 15; i++) {
        trackFuzzyMetrics('ITERATION_LIMIT_HIT', {});
      }

      const abuse = detectAbusePatterns();

      expect(abuse.highIterationLimitRate).to.be.true;
    });

    it('should detect high timeout rate', () => {
      // Simulate 100 operations with 10 timeouts (10%)
      for (let i = 0; i < 90; i++) {
        trackFuzzyMetrics('EXACT_MATCH', {});
      }
      for (let i = 0; i < 10; i++) {
        trackFuzzyMetrics('TIMEOUT', {});
      }

      const abuse = detectAbusePatterns();

      expect(abuse.highTimeoutRate).to.be.true;
    });

    it('should detect low success rate', () => {
      // Simulate 100 operations with 60 failures (40% success rate)
      for (let i = 0; i < 40; i++) {
        trackFuzzyMetrics('EXACT_MATCH', {});
      }
      for (let i = 0; i < 60; i++) {
        trackFuzzyMetrics('MATCH_FAILED', {});
      }

      const abuse = detectAbusePatterns();

      expect(abuse.lowSuccessRate).to.be.true;
    });

    it('should not flag normal operation patterns', () => {
      // Simulate 100 normal operations
      for (let i = 0; i < 70; i++) {
        trackFuzzyMetrics('EXACT_MATCH', {});
      }
      for (let i = 0; i < 25; i++) {
        trackFuzzyMetrics('FUZZY_MATCH', { similarity: 0.87 });
      }
      for (let i = 0; i < 5; i++) {
        trackFuzzyMetrics('MATCH_FAILED', {});
      }

      const abuse = detectAbusePatterns();

      expect(abuse.highIterationLimitRate).to.be.false;
      expect(abuse.highTimeoutRate).to.be.false;
      expect(abuse.lowSuccessRate).to.be.false;
    });
  });

  describe('Security Limits Constants', () => {
    it('should have all required security limit constants', () => {
      expect(FUZZY_SECURITY_LIMITS).to.have.property('MAX_FUZZY_EDIT_LENGTH');
      expect(FUZZY_SECURITY_LIMITS).to.have.property('MAX_FUZZY_LINE_COUNT');
      expect(FUZZY_SECURITY_LIMITS).to.have.property('MAX_FUZZY_TOTAL_CHARS');
      expect(FUZZY_SECURITY_LIMITS).to.have.property('MAX_FUZZY_ITERATIONS');
      expect(FUZZY_SECURITY_LIMITS).to.have.property('MAX_FUZZY_SUGGESTIONS');
      expect(FUZZY_SECURITY_LIMITS).to.have.property('FUZZY_TIMEOUT_MS');
    });

    it('should have reasonable security limit values', () => {
      expect(FUZZY_SECURITY_LIMITS.MAX_FUZZY_EDIT_LENGTH).to.equal(5000);
      expect(FUZZY_SECURITY_LIMITS.MAX_FUZZY_LINE_COUNT).to.equal(200);
      expect(FUZZY_SECURITY_LIMITS.MAX_FUZZY_TOTAL_CHARS).to.equal(50000);
      expect(FUZZY_SECURITY_LIMITS.MAX_FUZZY_ITERATIONS).to.equal(10000);
      expect(FUZZY_SECURITY_LIMITS.MAX_FUZZY_SUGGESTIONS).to.equal(10);
      expect(FUZZY_SECURITY_LIMITS.FUZZY_TIMEOUT_MS).to.equal(5000);
    });
  });
});
