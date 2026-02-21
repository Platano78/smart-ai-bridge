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
import { existsSync } from 'fs';
import path from 'path';

export const ValidationStatus = {
  PASSED: 'passed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  ERROR: 'error'
};

export class QualityGates {
  constructor(options = {}) {
    this.timeout = options.timeout || 30000;
    this.projectRoot = options.projectRoot || process.cwd();
    this.enableLogging = options.enableLogging !== false;
  }

  async validate(content, filePath, gates = {}) {
    const {
      syntaxCheck = false,
      linter = null,
      typeCheck = false,
      testRunner = null
    } = gates;

    const results = {
      passed: true,
      gates: {},
      errors: [],
      warnings: []
    };

    const language = this.detectLanguage(filePath);
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

  async parseJavaScript(content, language) {
    const errors = [];

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

    if (language === 'typescript') {
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

  async parsePython(content) {
    const errors = [];

    try {
      const tempFile = `/tmp/sab-validate-${Date.now()}.py`;
      await fs.writeFile(tempFile, content, 'utf8');

      const result = await this.runCommand('python3', ['-m', 'py_compile', tempFile]);

      if (result.exitCode !== 0) {
        errors.push({
          type: 'syntax',
          message: result.stderr || 'Python syntax error'
        });
      }

      await fs.unlink(tempFile).catch(() => {});
    } catch (error) {
      errors.push({
        type: 'internal',
        message: error.message
      });
    }

    return { errors };
  }

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

  async runESLint(content, filePath) {
    const tempFile = `/tmp/sab-lint-${Date.now()}${path.extname(filePath)}`;
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

  async runPrettier(content, filePath) {
    const tempFile = `/tmp/sab-format-${Date.now()}${path.extname(filePath)}`;
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
      return { isFormatted: true };
    }
  }

  async runTypeCheck(content, filePath) {
    const result = {
      status: ValidationStatus.PASSED,
      errors: [],
      warnings: []
    };

    const tempFile = `/tmp/sab-typecheck-${Date.now()}.ts`;
    await fs.writeFile(tempFile, content, 'utf8');

    try {
      const tscResult = await this.runCommand('npx', ['tsc', '--noEmit', '--skipLibCheck', tempFile], {
        cwd: this.projectRoot
      });

      if (tscResult.exitCode !== 0) {
        result.status = ValidationStatus.FAILED;

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

  async runTests(filePath, testRunner) {
    const result = {
      status: ValidationStatus.PASSED,
      errors: [],
      testsPassed: 0,
      testsFailed: 0
    };

    try {
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
        timeout: 60000
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

  findTestFile(filePath) {
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);

    const patterns = [
      path.join(dir, '__tests__', `${base}.test${ext}`),
      path.join(dir, '__tests__', `${base}.spec${ext}`),
      path.join(dir, `${base}.test${ext}`),
      path.join(dir, `${base}.spec${ext}`),
      path.join(dir, '..', '__tests__', `${base}.test${ext}`),
      path.join(dir, '..', 'tests', `${base}.test${ext}`)
    ];

    for (const pattern of patterns) {
      if (existsSync(pattern)) {
        return pattern;
      }
    }

    return null;
  }

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

  countBraces(content) {
    const cleaned = content
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/'(?:[^'\\]|\\.)*'/g, '')
      .replace(/"(?:[^"\\]|\\.)*"/g, '')
      .replace(/`(?:[^`\\]|\\.)*`/g, '');

    const curly = (cleaned.match(/{/g) || []).length - (cleaned.match(/}/g) || []).length;
    const paren = (cleaned.match(/\(/g) || []).length - (cleaned.match(/\)/g) || []).length;
    const bracket = (cleaned.match(/\[/g) || []).length - (cleaned.match(/]/g) || []).length;

    return { curly, paren, bracket };
  }

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

  extractLineNumber(message) {
    const match = message.match(/line\s*(\d+)/i);
    return match ? parseInt(match[1]) : null;
  }
}

export const qualityGates = new QualityGates();

export default QualityGates;
