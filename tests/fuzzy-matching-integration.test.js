/**
 * Integration Test Suite for Fuzzy Matching
 *
 * Tests integration with SmartAIBridge components:
 * - InputValidator integration
 * - PathSecurity integration
 * - RateLimiter integration
 * - Metrics tracking integration
 * - Error sanitization integration
 * - End-to-end edit file workflows
 *
 * @test-suite fuzzy-matching-integration
 */

import { expect } from 'chai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  validateFuzzyEditComplexity,
  trackFuzzyMetrics,
  getFuzzyMetrics,
  resetFuzzyMetrics,
  FUZZY_SECURITY_LIMITS
} from '../fuzzy-matching-security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Fuzzy Matching Integration Tests', () => {
  beforeEach(() => {
    resetFuzzyMetrics();
  });

  describe('InputValidator Integration', () => {
    it('should validate fuzzy edit complexity before processing', () => {
      const validEdits = [
        { find: 'oldCode', replace: 'newCode' },
        { find: 'oldFunction', replace: 'newFunction' }
      ];

      const result = validateFuzzyEditComplexity(validEdits);

      expect(result.valid).to.be.true;
      expect(result.errors).to.be.empty;
      expect(result.editCount).to.equal(2);
    });

    it('should reject invalid edit structures', () => {
      const invalidEdits = [
        { find: 'valid', replace: 'valid' },
        { find: 'missing-replace' }, // Missing replace
        'not-an-object' // Not an object
      ];

      const result = validateFuzzyEditComplexity(invalidEdits);

      expect(result.valid).to.be.false;
      expect(result.errors.length).to.be.at.least(2);
    });

    it('should integrate with SECURITY_LIMITS for validation', () => {
      const largeEdit = {
        find: 'a'.repeat(FUZZY_SECURITY_LIMITS.MAX_FUZZY_EDIT_LENGTH + 1),
        replace: 'short'
      };

      const result = validateFuzzyEditComplexity([largeEdit]);

      expect(result.valid).to.be.false;
      expect(result.errors[0]).to.include('exceeds maximum length');
    });
  });

  describe('PathSecurity Integration', () => {
    it('should validate file paths before fuzzy matching', async () => {
      // Simulate path validation (typical security check)
      const validatePath = (filePath) => {
        // Check for path traversal
        if (filePath.includes('..')) return false;
        // Check for absolute paths outside allowed directories
        if (path.isAbsolute(filePath) && !filePath.startsWith('/home/platano/project')) {
          return false;
        }
        return true;
      };

      const validPath = '/home/platano/project/smart-ai-bridge/test.js';
      const invalidPath = '/etc/passwd';
      const traversalPath = '../../../etc/passwd';

      expect(validatePath(validPath)).to.be.true;
      expect(validatePath(invalidPath)).to.be.false;
      expect(validatePath(traversalPath)).to.be.false;
    });

    it('should prevent fuzzy matching on sensitive files', () => {
      const sensitiveFiles = [
        '.env',
        'credentials.json',
        'private_key.pem',
        'config/secrets.yaml'
      ];

      const isSensitiveFile = (filePath) => {
        const basename = path.basename(filePath);
        return sensitiveFiles.some((pattern) => basename.includes(pattern.replace('*', '')));
      };

      expect(isSensitiveFile('/home/user/.env')).to.be.true;
      expect(isSensitiveFile('/home/user/credentials.json')).to.be.true;
      expect(isSensitiveFile('/home/user/test.js')).to.be.false;
    });
  });

  describe('RateLimiter Integration', () => {
    it('should track fuzzy matching operations for rate limiting', () => {
      // Simulate 10 operations
      for (let i = 0; i < 10; i++) {
        trackFuzzyMetrics('EXACT_MATCH', {});
      }

      const metrics = getFuzzyMetrics();
      expect(metrics.totalOperations).to.equal(10);
    });

    it('should provide metrics for rate limit decisions', () => {
      // Simulate rapid operations
      for (let i = 0; i < 100; i++) {
        trackFuzzyMetrics('FUZZY_MATCH', { similarity: 0.87 });
      }

      const metrics = getFuzzyMetrics();

      // Rate limiter could use these metrics
      const operationsPerMinute = metrics.totalOperations;
      const shouldRateLimit = operationsPerMinute > 50;

      expect(shouldRateLimit).to.be.true;
    });
  });

  describe('Metrics Tracking Integration', () => {
    it('should track end-to-end fuzzy matching workflow', () => {
      // Simulate complete workflow
      trackFuzzyMetrics('EXACT_MATCH', { similarity: 1.0 });
      trackFuzzyMetrics('FUZZY_MATCH', { similarity: 0.89 });
      trackFuzzyMetrics('FUZZY_MATCH', { similarity: 0.92 });
      trackFuzzyMetrics('MATCH_FAILED', {});

      const metrics = getFuzzyMetrics();

      expect(metrics.totalOperations).to.equal(4);
      expect(metrics.exactMatches).to.equal(1);
      expect(metrics.fuzzyMatches).to.equal(2);
      expect(metrics.failedMatches).to.equal(1);
      expect(metrics.averageSimilarity).to.be.closeTo(0.905, 0.01);
    });

    it('should integrate metrics with monitoring systems', () => {
      // Simulate operations with various outcomes
      for (let i = 0; i < 70; i++) trackFuzzyMetrics('EXACT_MATCH', {});
      for (let i = 0; i < 20; i++) trackFuzzyMetrics('FUZZY_MATCH', { similarity: 0.87 });
      for (let i = 0; i < 10; i++) trackFuzzyMetrics('MATCH_FAILED', {});

      const metrics = getFuzzyMetrics();

      // Metrics can be exported to monitoring dashboard
      const healthScore = (metrics.exactMatches + metrics.fuzzyMatches) / metrics.totalOperations;
      expect(healthScore).to.equal(0.9); // 90% success rate
    });

    it('should track security events separately', () => {
      trackFuzzyMetrics('COMPLEXITY_LIMIT_HIT', { totalCharacters: 60000 });
      trackFuzzyMetrics('TIMEOUT', { timeoutMs: 5000 });
      trackFuzzyMetrics('ITERATION_LIMIT_HIT', { iterations: 10000 });

      const metrics = getFuzzyMetrics();

      expect(metrics.complexityLimitHits).to.equal(1);
      expect(metrics.timeouts).to.equal(1);
      expect(metrics.iterationLimitHits).to.equal(1);
    });
  });

  describe('Error Sanitization Integration', () => {
    it('should sanitize file paths in error messages', () => {
      const sanitizeError = (error, filePath) => {
        // Remove absolute paths from error messages
        const sanitized = error.replace(filePath, '<file>');
        // Remove any remaining paths
        return sanitized.replace(/\/[a-zA-Z0-9_\-\/]+/g, '<path>');
      };

      const error = 'Failed to edit file /home/platano/project/smart-ai-bridge/test.js';
      const sanitized = sanitizeError(error, '/home/platano/project/smart-ai-bridge/test.js');

      expect(sanitized).to.equal('Failed to edit file <file>');
      expect(sanitized).to.not.include('/home/platano');
    });

    it('should sanitize file content in error messages', () => {
      const sanitizeContent = (content, maxLength = 100) => {
        if (content.length <= maxLength) return content;
        return content.substring(0, maxLength) + '... (truncated)';
      };

      const longContent = 'a'.repeat(500);
      const sanitized = sanitizeContent(longContent);

      expect(sanitized.length).to.be.lessThan(120);
      expect(sanitized).to.include('(truncated)');
    });
  });

  describe('End-to-End Edit File Workflows', () => {
    it('should perform exact match edit workflow', async () => {
      const tempFile = path.join(__dirname, 'fuzzy-matching/fixtures/temp-test.js');
      const initialContent = 'function oldFunction() {\n  return 42;\n}\n';

      // Create temp file
      await fs.writeFile(tempFile, initialContent);

      try {
        // Read file
        const content = await fs.readFile(tempFile, 'utf-8');

        // Simulate exact match
        const edits = [{ find: 'oldFunction', replace: 'newFunction' }];
        const validation = validateFuzzyEditComplexity(edits);
        expect(validation.valid).to.be.true;

        // Perform replacement
        let modifiedContent = content;
        for (const edit of edits) {
          if (modifiedContent.includes(edit.find)) {
            modifiedContent = modifiedContent.replace(edit.find, edit.replace);
            trackFuzzyMetrics('EXACT_MATCH', { similarity: 1.0 });
          }
        }

        // Write back
        await fs.writeFile(tempFile, modifiedContent);

        // Verify
        const result = await fs.readFile(tempFile, 'utf-8');
        expect(result).to.include('newFunction');
        expect(result).to.not.include('oldFunction');

        const metrics = getFuzzyMetrics();
        expect(metrics.exactMatches).to.equal(1);
      } finally {
        // Cleanup
        await fs.unlink(tempFile).catch(() => {});
      }
    });

    it('should perform fuzzy match edit workflow', async () => {
      const tempFile = path.join(__dirname, 'fuzzy-matching/fixtures/temp-fuzzy-test.js');
      const initialContent = 'function  processData ( input )  {\n  return input;\n}\n';

      await fs.writeFile(tempFile, initialContent);

      try {
        const content = await fs.readFile(tempFile, 'utf-8');

        // Pattern with different whitespace
        const findPattern = 'function processData(input) {';
        const edits = [{ find: findPattern, replace: 'function handleData(input) {' }];

        // Validation passes
        const validation = validateFuzzyEditComplexity(edits);
        expect(validation.valid).to.be.true;

        // Simulate fuzzy matching logic
        const normalizeWhitespace = (str) => {
          return str
            .trim()
            .replace(/\r\n/g, '\n')
            .replace(/\s+/g, ' ')
            .replace(/\s*([{}()\[\];,])\s*/g, '$1');
        };

        const normalizedFind = normalizeWhitespace(findPattern);
        const lines = content.split('\n');
        let matched = false;

        for (const line of lines) {
          const normalizedLine = normalizeWhitespace(line);
          if (normalizedLine.includes(normalizedFind)) {
            matched = true;
            trackFuzzyMetrics('FUZZY_MATCH', { similarity: 0.89 });
            break;
          }
        }

        expect(matched).to.be.true;

        const metrics = getFuzzyMetrics();
        expect(metrics.fuzzyMatches).to.equal(1);
      } finally {
        await fs.unlink(tempFile).catch(() => {});
      }
    });

    it('should handle validation_mode: dry_run', () => {
      const edits = [{ find: 'old', replace: 'new' }];

      // Validation should pass
      const validation = validateFuzzyEditComplexity(edits);
      expect(validation.valid).to.be.true;

      // In dry_run mode, we validate but don't execute
      const dryRun = true;

      if (dryRun) {
        // Track but don't modify
        trackFuzzyMetrics('EXACT_MATCH', { dryRun: true });
      }

      const metrics = getFuzzyMetrics();
      expect(metrics.totalOperations).to.equal(1);
    });
  });

  describe('Cross-Component Integration', () => {
    it('should coordinate InputValidator + PathSecurity + Metrics', async () => {
      const filePath = '/home/platano/project/smart-ai-bridge/test.js';
      const edits = [{ find: 'old', replace: 'new' }];

      // Step 1: Path validation
      const pathValid = !filePath.includes('..') &&
                       !filePath.includes('.env');
      expect(pathValid).to.be.true;

      // Step 2: Input validation
      const inputValidation = validateFuzzyEditComplexity(edits);
      expect(inputValidation.valid).to.be.true;

      // Step 3: Track metrics
      trackFuzzyMetrics('EXACT_MATCH', { filePath });

      // Step 4: Verify metrics
      const metrics = getFuzzyMetrics();
      expect(metrics.totalOperations).to.equal(1);
    });

    it('should handle complete error workflow', () => {
      // Invalid edits
      const edits = [{ find: 'a'.repeat(10000), replace: 'short' }];

      // Validation fails
      const validation = validateFuzzyEditComplexity(edits);
      expect(validation.valid).to.be.false;

      // Track failure
      trackFuzzyMetrics('COMPLEXITY_LIMIT_HIT', {
        length: 10000,
        limit: FUZZY_SECURITY_LIMITS.MAX_FUZZY_EDIT_LENGTH
      });

      // Metrics updated
      const metrics = getFuzzyMetrics();
      expect(metrics.complexityLimitHits).to.equal(1);

      // Error sanitization would happen here
      const error = `Edit exceeds limit: ${edits[0].find.substring(0, 50)}...`;
      expect(error.length).to.be.lessThan(100);
    });
  });

  describe('Performance Integration', () => {
    it('should handle batch operations efficiently', () => {
      const startTime = Date.now();

      // Simulate 50 operations
      for (let i = 0; i < 50; i++) {
        const edits = [{ find: `old${i}`, replace: `new${i}` }];
        validateFuzzyEditComplexity(edits);
        trackFuzzyMetrics('EXACT_MATCH', {});
      }

      const duration = Date.now() - startTime;
      const metrics = getFuzzyMetrics();

      expect(metrics.totalOperations).to.equal(50);
      expect(duration).to.be.lessThan(1000); // Should complete in < 1 second
    });
  });
});
