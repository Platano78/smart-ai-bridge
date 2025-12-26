/**
 * GenerateFileHandler - Local LLM Code Generation
 *
 * Purpose: Local LLM generates code from spec. Claude reviews or auto-approves.
 * Token savings: 500+ → ~50 tokens (spec only)
 *
 * Flow:
 * 1. Claude sends: generate_file("JWT auth middleware with rate limiting", "src/middleware/auth.ts")
 * 2. Local LLM generates production code
 * 3. If review=true → returns content for Claude approval
 * 4. If review=false → writes directly, returns summary
 */

import { BaseHandler } from './base-handler.js';
import { promises as fs } from 'fs';
import path from 'path';

// Backend selection based on code complexity/type
const GENERATION_BACKEND_MAP = {
  simple: 'local',           // Quick scaffolding
  standard: 'nvidia_qwen',   // Production code
  complex: 'nvidia_deepseek', // Complex logic
  test: 'nvidia_qwen'        // Test generation
};

export class GenerateFileHandler extends BaseHandler {

  /**
   * Execute file generation using local LLM
   * @param {Object} args - Generation arguments
   * @param {string} args.spec - Natural language specification
   * @param {string} args.outputPath - Where to write the file
   * @param {Object} [args.options] - Optional configuration
   * @param {string} [args.options.backend] - Force specific backend
   * @param {string} [args.options.modelProfile] - Local router model profile (coding-qwen-7b|coding-seed-coder|fast-qwen14b|etc)
   * @param {boolean} [args.options.review] - Return for approval (default: true)
   * @param {string[]} [args.options.contextFiles] - Related files for style/patterns
   * @param {string} [args.options.language] - Language (auto-detect if not specified)
   * @param {boolean} [args.options.includeTests] - Also generate tests
   * @returns {Promise<Object>} Generation result
   */
  async execute(args) {
    const { spec, outputPath, options = {} } = args;

    if (!spec) {
      throw new Error('spec is required');
    }
    if (!outputPath) {
      throw new Error('outputPath is required');
    }

    const {
      backend = 'auto',
      modelProfile = null,  // For local router model selection
      review = true,
      contextFiles = [],
      language = null,
      includeTests = false
    } = options;

    const startTime = Date.now();

    try {
      // 1. Resolve output path
      const absolutePath = path.isAbsolute(outputPath) ? outputPath : path.resolve(outputPath);

      // 2. Detect language from path or explicit setting
      const detectedLanguage = language || this.detectLanguage(outputPath);

      // 3. Check if file already exists
      let existingContent = null;
      try {
        existingContent = await fs.readFile(absolutePath, 'utf8');
        console.error(`[GenerateFile] ⚠️ File exists, will overwrite: ${outputPath}`);
      } catch {
        // File doesn't exist, that's fine
      }

      // 4. Gather context from related files
      const contextContents = await this.gatherContextFiles(contextFiles);

      // 5. Estimate complexity for backend selection
      const complexity = this.estimateComplexity(spec, includeTests);

      // 6. Build the generation prompt
      const prompt = this.buildGenerationPrompt(spec, {
        outputPath,
        language: detectedLanguage,
        contextContents,
        includeTests,
        existingContent
      });

      // 7. Determine the backend
      const selectedBackend = this.selectBackend(backend, complexity);

      console.error(`[GenerateFile] 📝 Generating ${outputPath}`);
      console.error(`[GenerateFile] 🎯 Backend: ${selectedBackend}, Language: ${detectedLanguage}${modelProfile ? `, Model: ${modelProfile}` : ''}`);
      console.error(`[GenerateFile] 📋 Spec: ${spec.substring(0, 100)}...`);

      // 8. Make request to LLM for generation
      const response = await this.makeRequest(prompt, selectedBackend, {
        maxTokens: 8000,  // Allow large generation
        routerModel: modelProfile  // Pass model profile for llama-swap router
      });

      const processingTime = Date.now() - startTime;

      // 9. Parse the generated code
      const generated = this.parseGeneratedCode(response.content || response, detectedLanguage);

      // 10. Handle review mode (default)
      if (review) {
        this.recordExecution(
          {
            success: true,
            backend: selectedBackend,
            processingTime,
            mode: 'review'
          },
          {
            tool: 'generate_file',
            taskType: 'generation',
            outputPath
          }
        );

        return this.buildSuccessResponse({
          status: 'pending_review',
          outputPath: absolutePath,
          content: generated.code,
          summary: generated.summary,
          linesOfCode: generated.code.split('\n').length,
          language: detectedLanguage,
          tests: generated.tests,
          backend_used: selectedBackend,
          processing_time: processingTime,
          instructions: 'Review the generated code. Use write_files_atomic to save or modify as needed.'
        });
      }

      // 11. Auto-write mode (review=false)
      // Ensure directory exists
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, generated.code, 'utf8');

      // Write tests if generated
      if (includeTests && generated.tests) {
        const testPath = this.getTestPath(absolutePath);
        await fs.mkdir(path.dirname(testPath), { recursive: true });
        await fs.writeFile(testPath, generated.tests, 'utf8');
      }

      this.recordExecution(
        {
          success: true,
          backend: selectedBackend,
          processingTime,
          mode: 'write'
        },
        {
          tool: 'generate_file',
          taskType: 'generation',
          outputPath
        }
      );

      return this.buildSuccessResponse({
        status: 'written',
        outputPath: absolutePath,
        summary: generated.summary,
        linesOfCode: generated.code.split('\n').length,
        language: detectedLanguage,
        testPath: includeTests && generated.tests ? this.getTestPath(absolutePath) : null,
        backend_used: selectedBackend,
        processing_time: processingTime
      });

    } catch (error) {
      console.error(`[GenerateFile] ❌ Error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Gather content from context files for style matching
   */
  async gatherContextFiles(contextPaths) {
    if (!contextPaths || contextPaths.length === 0) {
      return [];
    }

    const contextContents = [];
    for (const contextPath of contextPaths.slice(0, 3)) { // Limit to 3 context files
      try {
        const absPath = path.isAbsolute(contextPath) ? contextPath : path.resolve(contextPath);
        const content = await fs.readFile(absPath, 'utf8');
        contextContents.push({
          path: contextPath,
          content: content.substring(0, 8000) // Limit per-file context
        });
      } catch (error) {
        console.error(`[GenerateFile] Warning: Could not read context file ${contextPath}: ${error.message}`);
      }
    }
    return contextContents;
  }

  /**
   * Build the generation prompt for the LLM
   */
  buildGenerationPrompt(spec, options) {
    const { outputPath, language, contextContents, includeTests, existingContent } = options;

    let prompt = `You are a senior software engineer. Generate production-ready code based on this specification.

SPECIFICATION: ${spec}

OUTPUT FILE: ${outputPath}
LANGUAGE: ${language}
${includeTests ? 'GENERATE TESTS: Yes' : ''}
`;

    if (existingContent) {
      prompt += `
--- EXISTING FILE (will be replaced) ---
${existingContent.substring(0, 5000)}
--- END EXISTING ---
`;
    }

    if (contextContents && contextContents.length > 0) {
      prompt += '\n--- STYLE REFERENCE FILES ---\n';
      prompt += 'Match the coding style, patterns, and conventions from these files:\n';
      for (const ctx of contextContents) {
        prompt += `\n=== ${ctx.path} ===\n${ctx.content}\n`;
      }
      prompt += '--- END REFERENCE ---\n';
    }

    prompt += `
REQUIREMENTS:
1. Generate complete, working, production-ready code
2. Include necessary imports and dependencies
3. Add appropriate error handling
4. Include JSDoc/docstrings for public APIs
5. Follow best practices for ${language}
6. Code should be ready to use without modification

Respond with the following structure:

SUMMARY: [1-2 sentence description of what was generated]

CODE:
\`\`\`${language}
[Your generated code here]
\`\`\`
`;

    if (includeTests) {
      prompt += `
TESTS:
\`\`\`${language}
[Your generated test code here]
\`\`\`
`;
    }

    return prompt;
  }

  /**
   * Estimate complexity for backend selection
   */
  estimateComplexity(spec, includeTests) {
    const lowerSpec = spec.toLowerCase();

    // Check for complex patterns
    const complexPatterns = [
      'algorithm', 'oauth', 'authentication', 'encryption',
      'database', 'migration', 'websocket', 'real-time',
      'concurrent', 'async', 'streaming', 'cache'
    ];

    const simplePatterns = [
      'utility', 'helper', 'constant', 'config',
      'type', 'interface', 'enum', 'model'
    ];

    const hasComplex = complexPatterns.some(p => lowerSpec.includes(p));
    const hasSimple = simplePatterns.some(p => lowerSpec.includes(p));

    if (hasComplex || includeTests) return 'complex';
    if (hasSimple) return 'simple';
    return 'standard';
  }

  /**
   * Select the appropriate backend
   */
  selectBackend(requestedBackend, complexity) {
    if (requestedBackend && requestedBackend !== 'auto') {
      const backendMap = {
        local: 'local',
        deepseek: 'nvidia_deepseek',
        qwen3: 'nvidia_qwen',
        gemini: 'gemini',
        groq: 'groq_llama'
      };
      return backendMap[requestedBackend] || requestedBackend;
    }

    return GENERATION_BACKEND_MAP[complexity] || 'local';
  }

  /**
   * Parse the LLM response to extract code and tests
   */
  parseGeneratedCode(responseText, language) {
    let summary = 'Code generated successfully';
    let code = '';
    let tests = null;

    // Extract summary
    const summaryMatch = responseText.match(/SUMMARY:\s*(.+?)(?=\n\nCODE:|CODE:|\n```)/is);
    if (summaryMatch) {
      summary = summaryMatch[1].trim();
    }

    // Extract main code block
    const codePattern = new RegExp(`CODE:\\s*\`\`\`(?:${language})?\\n([\\s\\S]*?)\`\`\``, 'i');
    const codeMatch = responseText.match(codePattern);
    if (codeMatch) {
      code = codeMatch[1].trim();
    } else {
      // Try to find any code block
      const anyCodeMatch = responseText.match(/```(?:\w+)?\n([\s\S]*?)```/);
      if (anyCodeMatch) {
        code = anyCodeMatch[1].trim();
      } else {
        // Last resort: treat entire response as code (excluding SUMMARY line)
        code = responseText.replace(/SUMMARY:.*\n?/i, '').trim();
      }
    }

    // Extract test code block
    const testPattern = new RegExp(`TESTS:\\s*\`\`\`(?:${language})?\\n([\\s\\S]*?)\`\`\``, 'i');
    const testMatch = responseText.match(testPattern);
    if (testMatch) {
      tests = testMatch[1].trim();
    }

    return { summary, code, tests };
  }

  /**
   * Get the test file path based on source file
   */
  getTestPath(sourcePath) {
    const dir = path.dirname(sourcePath);
    const ext = path.extname(sourcePath);
    const base = path.basename(sourcePath, ext);

    // Common test file naming conventions
    return path.join(dir, '__tests__', `${base}.test${ext}`);
  }
}

export default GenerateFileHandler;
