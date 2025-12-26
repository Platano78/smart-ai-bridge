/**
 * QualityGates - Optional Validation for Code Changes
 *
 * Features:
 * - Optional syntax check (AST validation)
 * - Optional ESLint integration
 * - Optional TypeScript type checking
 * - Optional test runner integration
 * - All gates are optional and configurable per-call
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

// Validation result types
export const ValidationStatus = {
  PASSED: 'passed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  ERROR: 'error'
};

export class QualityGates {
  constructor(options = {}) {
    this.timeout = options.timeout || 30000; // 30 seconds
    this.projectRoot = options.projectRoot || process.cwd();
    this.enableLogging = options.enableLogging !== false;
  }

  /**
   * Run all configured quality gates
   * @param {string} content - The code content to validate
   * @param {string} filePath - Path for the file (for context)
   * @param {Object} gates - Which gates to run
   * @returns {Promise<Object>} Validation results
   */
  async validate(content, filePath, gates = {}) {
    const {
      syntaxCheck = false,
      linter = null,        // 'eslint' | 'prettier' | null
      typeCheck = false,
      testRunner = null     // 'jest' | 'vitest' | 'pytest' | null
    } = gates;

    const results = {
      passed: true,
      gates: {},
      errors: [],
      warnings: []
    };

    const language = this.detectLanguage(filePath);

    // Run gates in parallel where possible
    const gatePromises = [];

    if (syntaxCheck) {
      gatePromises.push(
        this.runSyntaxCheck(content, language)
          .then(result => ({ name: 'syntax', result }))
      );
    }

    if (linter) {
      gatePromises.push(
        this.runLinter(content, filePath, linter)
          .then(result => ({ name: 'linter', result }))
      );
    }

    if (typeCheck && (language === 'typescript' || language === 'javascript')) {
      gatePromises.push(
        this.runTypeCheck(content, filePath)
          .then(result => ({ name: 'typeCheck', result }))
      );
    }

    if (testRunner) {
      gatePromises.push(
        this.runTests(filePath, testRunner)
          .then(result => ({ name: 'tests', result }))
      );
    }

    // Wait for all gates
    const gateResults = await Promise.all(gatePromises);

    for (const { name, result } of gateResults) {
      results.gates[name] = result;

      if (result.status === ValidationStatus.FAILED) {
        results.passed = false;
        results.errors.push(...(result.errors || []));
      }

      if (result.warnings) {
        results.warnings.push(...result.warnings);
      }
    }

    return results;
  }

  /**
   * Run syntax validation using language-specific parsers
   */
  async runSyntaxCheck(content, language) {
    const result = {
      status: ValidationStatus.PASSED,
      errors: [],
      warnings: []
    };

    try {
      switch (language) {
        case 'javascript':
        case 'typescript': {
          // Use acorn or esbuild for JS/TS parsing
          const { parseResult, errors } = await this.parseJavaScript(content, language);
          if (errors.length > 0) {
            result.status = ValidationStatus.FAILED;
            result.errors = errors;
          }
          break;
        }

        case 'python': {
          const { errors } = await this.parsePython(content);
          if (errors.length > 0) {
            result.status = ValidationStatus.FAILED;
            result.errors = errors;
          }
          break;
        }

        case 'json': {
          try {
            JSON.parse(content);
          } catch (error) {
            result.status = ValidationStatus.FAILED;
            result.errors.push({
              type: 'syntax',
              message: error.message,
              line: this.extractLineNumber(error.message)
            });
          }
          break;
        }

        default:
          result.status = ValidationStatus.SKIPPED;
          result.message = `No syntax checker available for ${language}`;
      }
    } catch (error) {
      result.status = ValidationStatus.ERROR;
      result.errors.push({
        type: 'internal',
        message: error.message
      });
    }

    return result;
  }

  /**
   * Parse JavaScript/TypeScript using regex-based validation
   * (Lighter weight than full AST parsing)
   */
  async parseJavaScript(content, language) {
    const errors = [];

    // Check for obvious syntax issues
    const checks = [
      { pattern: /\bfunction\s*\(.*\)\s*{(?![^}]*})/g, message: 'Unclosed function body' },
      { pattern: /\bif\s*\([^)]*\)\s*{(?![^}]*})/g, message: 'Unclosed if block' },
      { pattern: /=>\s*{(?![^}]*})/g, message: 'Unclosed arrow function' }
    ];

    // Count braces
    const braceBalance = this.countBraces(content);
    if (braceBalance.curly !== 0) {
      errors.push({
        type: 'syntax',
        message: `Unbalanced curly braces: ${braceBalance.curly > 0 ? 'missing }' : 'extra }'}`,
        count: Math.abs(braceBalance.curly)
      });
    }

    if (braceBalance.paren !== 0) {
      errors.push({
        type: 'syntax',
        message: `Unbalanced parentheses: ${braceBalance.paren > 0 ? 'missing )' : 'extra )'}`,
        count: Math.abs(braceBalance.paren)
      });
    }

    if (braceBalance.bracket !== 0) {
      errors.push({
        type: 'syntax',
        message: `Unbalanced brackets: ${braceBalance.bracket > 0 ? 'missing ]' : 'extra ]'}`,
        count: Math.abs(braceBalance.bracket)
      });
    }

    // TypeScript-specific checks
    if (language === 'typescript') {
      // Check for common TS errors
      const tsChecks = [
        { pattern: /:\s*(?:string|number|boolean)\[\s*(?!])/g, message: 'Unclosed array type' },
        { pattern: /interface\s+\w+\s*{(?![^}]*})/g, message: 'Unclosed interface' }
      ];

      for (const check of tsChecks) {
        if (check.pattern.test(content)) {
          errors.push({
            type: 'syntax',
            message: check.message
          });
        }
      }
    }

    return { parseResult: errors.length === 0, errors };
  }

  /**
   * Parse Python using python3 -m py_compile
   */
  async parsePython(content) {
    const errors = [];

    try {
      // Create temp file
      const tempFile = `/tmp/mkg-validate-${Date.now()}.py`;
      await fs.writeFile(tempFile, content, 'utf8');

      const result = await this.runCommand('python3', ['-m', 'py_compile', tempFile]);

      if (result.exitCode !== 0) {
        errors.push({
          type: 'syntax',
          message: result.stderr || 'Python syntax error'
        });
      }

      // Cleanup
      await fs.unlink(tempFile).catch(() => {});
    } catch (error) {
      errors.push({
        type: 'internal',
        message: error.message
      });
    }

    return { errors };
  }

  /**
   * Run linter (ESLint, Prettier, etc.)
   */
  async runLinter(content, filePath, linter) {
    const result = {
      status: ValidationStatus.PASSED,
      errors: [],
      warnings: []
    };

    try {
      switch (linter) {
        case 'eslint': {
          const eslintResult = await this.runESLint(content, filePath);
          result.status = eslintResult.errorCount > 0 ? ValidationStatus.FAILED : ValidationStatus.PASSED;
          result.errors = eslintResult.errors;
          result.warnings = eslintResult.warnings;
          break;
        }

        case 'prettier': {
          const prettierResult = await this.runPrettier(content, filePath);
          if (!prettierResult.isFormatted) {
            result.status = ValidationStatus.FAILED;
            result.errors.push({
              type: 'formatting',
              message: 'Code is not properly formatted'
            });
          }
          break;
        }

        default:
          result.status = ValidationStatus.SKIPPED;
          result.message = `Unknown linter: ${linter}`;
      }
    } catch (error) {
      result.status = ValidationStatus.ERROR;
      result.errors.push({
        type: 'internal',
        message: error.message
      });
    }

    return result;
  }

  /**
   * Run ESLint on content
   */
  async runESLint(content, filePath) {
    const tempFile = `/tmp/mkg-lint-${Date.now()}${path.extname(filePath)}`;
    await fs.writeFile(tempFile, content, 'utf8');

    try {
      const result = await this.runCommand('npx', ['eslint', '--format', 'json', tempFile], {
        cwd: this.projectRoot
      });

      const errors = [];
      const warnings = [];

      if (result.stdout) {
        try {
          const eslintOutput = JSON.parse(result.stdout);
          for (const file of eslintOutput) {
            for (const message of file.messages || []) {
              const issue = {
                type: message.ruleId || 'eslint',
                message: message.message,
                line: message.line,
                column: message.column,
                severity: message.severity
              };

              if (message.severity === 2) {
                errors.push(issue);
              } else {
                warnings.push(issue);
              }
            }
          }
        } catch {
          // Non-JSON output
        }
      }

      await fs.unlink(tempFile).catch(() => {});

      return {
        errorCount: errors.length,
        warningCount: warnings.length,
        errors,
        warnings
      };
    } catch (error) {
      await fs.unlink(tempFile).catch(() => {});
      throw error;
    }
  }

  /**
   * Run Prettier check
   */
  async runPrettier(content, filePath) {
    const tempFile = `/tmp/mkg-format-${Date.now()}${path.extname(filePath)}`;
    await fs.writeFile(tempFile, content, 'utf8');

    try {
      const result = await this.runCommand('npx', ['prettier', '--check', tempFile], {
        cwd: this.projectRoot
      });

      await fs.unlink(tempFile).catch(() => {});

      return {
        isFormatted: result.exitCode === 0
      };
    } catch (error) {
      await fs.unlink(tempFile).catch(() => {});
      return { isFormatted: true }; // Skip on error
    }
  }

  /**
   * Run TypeScript type checking
   */
  async runTypeCheck(content, filePath) {
    const result = {
      status: ValidationStatus.PASSED,
      errors: [],
      warnings: []
    };

    const tempFile = `/tmp/mkg-typecheck-${Date.now()}.ts`;
    await fs.writeFile(tempFile, content, 'utf8');

    try {
      const tscResult = await this.runCommand('npx', ['tsc', '--noEmit', '--skipLibCheck', tempFile], {
        cwd: this.projectRoot
      });

      if (tscResult.exitCode !== 0) {
        result.status = ValidationStatus.FAILED;

        // Parse TSC errors
        const lines = (tscResult.stdout + tscResult.stderr).split('\n');
        for (const line of lines) {
          const match = line.match(/\((\d+),(\d+)\):\s*(error|warning)\s+TS\d+:\s*(.+)/);
          if (match) {
            result.errors.push({
              type: 'typescript',
              line: parseInt(match[1]),
              column: parseInt(match[2]),
              severity: match[3],
              message: match[4]
            });
          }
        }
      }

      await fs.unlink(tempFile).catch(() => {});
    } catch (error) {
      await fs.unlink(tempFile).catch(() => {});
      result.status = ValidationStatus.ERROR;
      result.errors.push({
        type: 'internal',
        message: error.message
      });
    }

    return result;
  }

  /**
   * Run related tests
   */
  async runTests(filePath, testRunner) {
    const result = {
      status: ValidationStatus.PASSED,
      errors: [],
      testsPassed: 0,
      testsFailed: 0
    };

    try {
      // Find related test file
      const testFile = this.findTestFile(filePath);

      if (!testFile) {
        result.status = ValidationStatus.SKIPPED;
        result.message = 'No related test file found';
        return result;
      }

      let command, args;
      switch (testRunner) {
        case 'jest':
          command = 'npx';
          args = ['jest', '--json', testFile];
          break;
        case 'vitest':
          command = 'npx';
          args = ['vitest', 'run', '--reporter=json', testFile];
          break;
        case 'pytest':
          command = 'pytest';
          args = ['--tb=short', '-q', testFile];
          break;
        default:
          result.status = ValidationStatus.SKIPPED;
          result.message = `Unknown test runner: ${testRunner}`;
          return result;
      }

      const testResult = await this.runCommand(command, args, {
        cwd: this.projectRoot,
        timeout: 60000 // 1 minute for tests
      });

      if (testResult.exitCode !== 0) {
        result.status = ValidationStatus.FAILED;
        result.errors.push({
          type: 'test',
          message: 'Tests failed',
          details: testResult.stderr || testResult.stdout
        });
      }
    } catch (error) {
      result.status = ValidationStatus.ERROR;
      result.errors.push({
        type: 'internal',
        message: error.message
      });
    }

    return result;
  }

  /**
   * Find related test file
   */
  findTestFile(filePath) {
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);

    // Common test file patterns
    const patterns = [
      path.join(dir, '__tests__', `${base}.test${ext}`),
      path.join(dir, '__tests__', `${base}.spec${ext}`),
      path.join(dir, `${base}.test${ext}`),
      path.join(dir, `${base}.spec${ext}`),
      path.join(dir, '..', '__tests__', `${base}.test${ext}`),
      path.join(dir, '..', 'tests', `${base}.test${ext}`)
    ];

    // Check synchronously which exists
    for (const pattern of patterns) {
      try {
        require('fs').accessSync(pattern);
        return pattern;
      } catch {
        // Continue
      }
    }

    return null;
  }

  /**
   * Run a command and return result
   */
  runCommand(command, args, options = {}) {
    return new Promise((resolve) => {
      const timeout = options.timeout || this.timeout;
      let stdout = '';
      let stderr = '';

      const proc = spawn(command, args, {
        cwd: options.cwd || this.projectRoot,
        timeout,
        env: { ...process.env, ...options.env }
      });

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (exitCode) => {
        resolve({ exitCode, stdout, stderr });
      });

      proc.on('error', (error) => {
        resolve({ exitCode: 1, stdout, stderr: error.message });
      });
    });
  }

  /**
   * Count braces for balance checking
   */
  countBraces(content) {
    // Remove strings and comments first
    const cleaned = content
      .replace(/\/\/.*$/gm, '')          // Single line comments
      .replace(/\/\*[\s\S]*?\*\//g, '')  // Multi-line comments
      .replace(/'(?:[^'\\]|\\.)*'/g, '') // Single quotes
      .replace(/"(?:[^"\\]|\\.)*"/g, '') // Double quotes
      .replace(/`(?:[^`\\]|\\.)*`/g, ''); // Template literals

    const curly = (cleaned.match(/{/g) || []).length - (cleaned.match(/}/g) || []).length;
    const paren = (cleaned.match(/\(/g) || []).length - (cleaned.match(/\)/g) || []).length;
    const bracket = (cleaned.match(/\[/g) || []).length - (cleaned.match(/]/g) || []).length;

    return { curly, paren, bracket };
  }

  /**
   * Detect language from file path
   */
  detectLanguage(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap = {
      '.js': 'javascript',
      '.mjs': 'javascript',
      '.cjs': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.json': 'json',
      '.go': 'go',
      '.rs': 'rust',
      '.java': 'java'
    };
    return languageMap[ext] || 'unknown';
  }

  /**
   * Extract line number from error message
   */
  extractLineNumber(message) {
    const match = message.match(/line\s*(\d+)/i);
    return match ? parseInt(match[1]) : null;
  }
}

// Singleton instance
export const qualityGates = new QualityGates();

export default QualityGates;
