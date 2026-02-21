// src/file-security.js
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import pathNormalizer from './utils/path-normalizer.js';

class FileSecurity {
  constructor() {
    this.dangerousPatterns = [
      /;\s*(rm|del|erase|rd|rmdir)/gi,
      /&&\s*(cat|type|more|less)/gi,
      /\|\s*(cat|type|more|less)/gi,
      /`[^`]*`/g,
      /\$\([^)]+\)/g,
      /%[^%]+%/g,
      /\b(eval|exec|system|popen|spawn)\b/i
    ];

    this.xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /on\w+\s*=\s*["'][^"']*["']/gi,
      /javascript:/gi,
      /vbscript:/gi,
      /data:\s*text\/html/gi
    ];

    this.maxFileSize = 1024 * 1024 * 100; // 100MB limit
  }

  async validateAndNormalizePath(inputPath) {
    try {
      // Sanitize input against command injection
      this.sanitizeInput(inputPath);

      // Normalize path
      const normalizedPath = pathNormalizer.normalizePath(inputPath);

      // Security validation
      pathNormalizer.validatePathSecurity(normalizedPath);

      // Check if file exists and is accessible
      await this.validateFileAccess(normalizedPath);

      return normalizedPath;
    } catch (error) {
      throw new Error(`Path validation failed: ${error.message}`);
    }
  }

  sanitizeInput(input) {
    if (typeof input !== 'string') {
      throw new Error('Input must be a string');
    }

    if (input.length > 4096) {
      throw new Error('Input too long - potential attack detected');
    }

    // Check for command injection patterns
    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(input)) {
        throw new Error('Potential command injection attempt detected');
      }
    }

    // Check for XSS patterns
    for (const pattern of this.xssPatterns) {
      if (pattern.test(input)) {
        throw new Error('Malicious content detected in input');
      }
    }

    return input;
  }

  async validateFileAccess(filePath) {
    try {
      // Check if file exists
      await fs.access(filePath, fs.constants.F_OK);

      // Check read permissions
      await fs.access(filePath, fs.constants.R_OK);

      // Get file stats for additional validation
      const stats = await fs.stat(filePath);

      // Prevent access to directories
      if (stats.isDirectory()) {
        throw new Error('Directory access not allowed - use specific file paths');
      }

      // Prevent access to special files
      if (stats.isBlockDevice() || stats.isCharacterDevice() || 
          stats.isFIFO() || stats.isSocket() || stats.isSymbolicLink()) {
        throw new Error('Access to special files is denied');
      }

      // Check file size
      if (!this.isSafeFileSize(stats)) {
        throw new Error(`File too large (${Math.round(stats.size / 1024 / 1024)}MB). Maximum allowed: ${this.maxFileSize / 1024 / 1024}MB`);
      }

      return stats;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      } else if (error.code === 'EACCES') {
        throw new Error(`Permission denied: ${filePath}`);
      } else if (error.code === 'EISDIR') {
        throw new Error(`Path is a directory, not a file: ${filePath}`);
      } else {
        throw error;
      }
    }
  }

  isSafeFileSize(stats) {
    return stats.size <= this.maxFileSize;
  }

  validateAndNormalizePathSync(inputPath) {
    this.sanitizeInput(inputPath);
    const normalizedPath = pathNormalizer.normalizePath(inputPath);
    pathNormalizer.validatePathSecurity(normalizedPath);
    return normalizedPath;
  }

  createSecureContext(filePath, options = {}) {
    return {
      path: filePath,
      sanitized: true,
      securityLevel: 'validated',
      timestamp: new Date().toISOString(),
      options
    };
  }

  detectMaliciousContent(content) {
    if (typeof content !== 'string') return false;

    // Check for potential malware signatures
    const malwarePatterns = [
      /eval\s*\(/gi,
      /exec\s*\(/gi,
      /system\s*\(/gi,
      /shell_exec/gi,
      /passthru/gi,
      /\$_POST\[.*\]/gi,
      /\$_GET\[.*\]/gi,
      /base64_decode/gi
    ];

    return malwarePatterns.some(pattern => pattern.test(content));
  }

  generateSecurityReport(filePath, stats, validationResults) {
    return {
      filePath,
      securityStatus: 'validated',
      fileSize: stats.size,
      permissions: {
        readable: true,
        writable: false,
        executable: false
      },
      riskLevel: 'low',
      validationPassed: true,
      timestamp: new Date().toISOString(),
      ...validationResults
    };
  }
}

export default new FileSecurity();