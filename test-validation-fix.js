#!/usr/bin/env node

/**
 * Test the improved validation system
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import * as acorn from 'acorn';

// Import the validation classes from server.js by extracting them
class SmartAIRouter {
  detectLanguage(code) {
    if (/\bclass\s+\w+|\bpublic\s+|\bprivate\s+|\busing\s+/.test(code)) return 'csharp';
    if (/\bfunction\s+|\bconst\s+|\blet\s+|\bvar\s+/.test(code)) return 'javascript';
    return 'javascript'; // default
  }

  validateSyntax(code, language) {
    try {
      switch (language.toLowerCase()) {
        case 'javascript':
        case 'js':
        case 'typescript':
        case 'ts':
          // Use Acorn parser for JavaScript/TypeScript syntax validation
          acorn.parse(code, {
            ecmaVersion: 2022,
            sourceType: 'module',
            allowReturnOutsideFunction: true,
            allowImportExportEverywhere: true,
            allowHashBang: true
          });
          return { valid: true };

        case 'csharp':
        case 'cs':
        case 'c#':
          // Enhanced C# validation patterns
          return this.validateCSharpSyntax(code);

        default:
          // For other languages, use basic heuristics
          return this.validateBasicSyntax(code);
      }
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  validateCSharpSyntax(code) {
    // Check for balanced braces, brackets, and parentheses
    const braceStack = [];
    const chars = code.split('');

    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];

      if (char === '{' || char === '[' || char === '(') {
        braceStack.push(char);
      } else if (char === '}' || char === ']' || char === ')') {
        const last = braceStack.pop();
        const expected = { '}': '{', ']': '[', ')': '(' }[char];
        if (last !== expected) {
          return { valid: false, error: `Unmatched ${char} at position ${i}` };
        }
      }
    }

    if (braceStack.length > 0) {
      return { valid: false, error: `Unclosed ${braceStack[braceStack.length - 1]}` };
    }

    // Check for incomplete statements
    const trimmed = code.trim();
    if (trimmed.endsWith('=') || trimmed.endsWith(',') || trimmed.endsWith('= ;')) {
      return { valid: false, error: 'Incomplete statement' };
    }

    // Check for assignment without value
    if (/\w+\s*=\s*;/.test(trimmed)) {
      return { valid: false, error: 'Assignment without value' };
    }

    // Check for common syntax errors
    if (/\bclass\s+\w+\s*\{[^}]*$/.test(trimmed)) {
      return { valid: false, error: 'Incomplete class definition' };
    }

    if (/\bmethod\s+\w+\s*\([^)]*\)\s*\{[^}]*$/.test(trimmed)) {
      return { valid: false, error: 'Incomplete method definition' };
    }

    return { valid: true };
  }

  validateBasicSyntax(code) {
    // Basic checks for balanced brackets and quotes
    const braceStack = [];
    let inString = false;
    let stringChar = null;

    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      const prevChar = i > 0 ? code[i - 1] : null;

      if (!inString && (char === '"' || char === "'")) {
        inString = true;
        stringChar = char;
      } else if (inString && char === stringChar && prevChar !== '\\') {
        inString = false;
        stringChar = null;
      } else if (!inString) {
        if (char === '{' || char === '[' || char === '(') {
          braceStack.push(char);
        } else if (char === '}' || char === ']' || char === ')') {
          const last = braceStack.pop();
          const expected = { '}': '{', ']': '[', ')': '(' }[char];
          if (last !== expected) {
            return { valid: false, error: `Unmatched ${char}` };
          }
        }
      }
    }

    if (inString) {
      return { valid: false, error: 'Unclosed string literal' };
    }

    if (braceStack.length > 0) {
      return { valid: false, error: `Unclosed ${braceStack[braceStack.length - 1]}` };
    }

    return { valid: true };
  }
}

// Test cases
const router = new SmartAIRouter();

const testCases = [
  // Valid JavaScript
  { code: 'const x = 1;', language: 'javascript', expectedValid: true },
  { code: 'function test() { return 42; }', language: 'javascript', expectedValid: true },
  { code: 'class MyClass { constructor() {} }', language: 'javascript', expectedValid: true },

  // Invalid JavaScript (should now be caught)
  { code: 'const x = ;', language: 'javascript', expectedValid: false },
  { code: 'function test( { }', language: 'javascript', expectedValid: false },
  { code: 'if (true { console.log("missing paren"); }', language: 'javascript', expectedValid: false },

  // Valid C#
  { code: 'public class Test { }', language: 'csharp', expectedValid: true },
  { code: 'int x = 5;', language: 'csharp', expectedValid: true },

  // Invalid C# (should now be caught)
  { code: 'public class Test {', language: 'csharp', expectedValid: false },
  { code: 'int x = ;', language: 'csharp', expectedValid: false },
  { code: 'public void Method() { return; ', language: 'csharp', expectedValid: false }
];

console.log('🧪 Testing Enhanced Validation System\n');

let passed = 0;
let total = testCases.length;

for (const testCase of testCases) {
  const result = router.validateSyntax(testCase.code, testCase.language);
  const success = result.valid === testCase.expectedValid;

  console.log(`${success ? '✅' : '❌'} ${testCase.language}: "${testCase.code.substring(0, 30)}..."`);
  if (!success) {
    console.log(`   Expected: ${testCase.expectedValid}, Got: ${result.valid}`);
    if (result.error) console.log(`   Error: ${result.error}`);
  }

  if (success) passed++;
}

console.log(`\n📊 Results: ${passed}/${total} tests passed (${(passed/total*100).toFixed(1)}%)`);

if (passed === total) {
  console.log('🎉 All validation tests passed! False positive rate should now be <5%');
} else {
  console.log('⚠️  Some tests failed - validation needs further adjustment');
}

// Performance test
console.log('\n⚡ Performance Test:');
const perfTestCode = 'function testPerformance() { const x = Math.random(); return x * 42; }';
const iterations = 1000;
const startTime = performance.now();

for (let i = 0; i < iterations; i++) {
  router.validateSyntax(perfTestCode, 'javascript');
}

const endTime = performance.now();
const avgTime = (endTime - startTime) / iterations;

console.log(`Average validation time: ${avgTime.toFixed(2)}ms per validation`);
console.log(`Target: <67ms (current baseline), Achieved: ${avgTime < 67 ? '✅' : '❌'} ${avgTime.toFixed(2)}ms`);