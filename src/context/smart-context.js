/**
 * SmartContext - Intelligent Context Gathering for LLM File Operations
 *
 * Features:
 * - Parse imports/exports using regex patterns
 * - Resolve relative imports to actual files
 * - Score relevance by import depth
 * - Cache parsed imports for performance
 * - Respect maxContextTokens limit
 */

import { promises as fs } from 'fs';
import path from 'path';

// Import patterns for various languages
const IMPORT_PATTERNS = {
  javascript: [
    // ES6 imports
    /import\s+(?:{[^}]+}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g,
    // CommonJS require
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    // Dynamic import
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  ],
  typescript: [
    /import\s+(?:{[^}]+}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g,
    /import\s+type\s+{[^}]+}\s+from\s+['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  ],
  python: [
    /from\s+(\S+)\s+import/g,
    /import\s+(\S+)/g
  ],
  go: [
    /import\s+"([^"]+)"/g,
    /import\s+\(\s*(?:"([^"]+)"\s*)+\)/g
  ],
  rust: [
    /use\s+([^;]+);/g,
    /mod\s+(\w+);/g
  ],
  java: [
    /import\s+(?:static\s+)?([^;]+);/g
  ]
};

// Export patterns for various languages
const EXPORT_PATTERNS = {
  javascript: [
    /export\s+(?:default\s+)?(?:class|function|const|let|var)\s+(\w+)/g,
    /export\s+{([^}]+)}/g,
    /module\.exports\s*=\s*{([^}]+)}/g
  ],
  typescript: [
    /export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type|enum)\s+(\w+)/g,
    /export\s+{([^}]+)}/g
  ],
  python: [
    /__all__\s*=\s*\[([^\]]+)\]/g,
    /^def\s+(\w+)/gm,
    /^class\s+(\w+)/gm
  ]
};

// Cache for parsed imports
const importCache = new Map();
const CACHE_TTL = 300000; // 5 minutes

export class SmartContextManager {
  constructor(options = {}) {
    this.maxContextTokens = options.maxContextTokens || 32000;
    this.mode = options.mode || 'smart'; // minimal | smart | full
    this.cacheAST = options.cacheAST !== false;
    this.maxDepth = options.maxDepth || 2;
    this.maxFiles = options.maxFiles || 10;
  }

  async gatherContext(targetFile, options = {}) {
    const {
      mode = this.mode,
      maxTokens = this.maxContextTokens,
      additionalFiles = []
    } = options;

    const absolutePath = path.isAbsolute(targetFile) ? targetFile : path.resolve(targetFile);

    switch (mode) {
      case 'minimal':
        return [];
      case 'full':
        return this.gatherFullDirectoryContext(path.dirname(absolutePath), maxTokens);
      case 'smart':
      default:
        return this.gatherSmartContext(absolutePath, maxTokens, additionalFiles);
    }
  }

  async gatherSmartContext(targetFile, maxTokens, additionalFiles = []) {
    const contextFiles = [];
    let totalTokens = 0;
    const visited = new Set();

    const imports = await this.parseImports(targetFile);

    const scoredImports = imports.map(imp => ({
      path: imp,
      score: this.scoreImport(imp, targetFile)
    })).sort((a, b) => b.score - a.score);

    for (const { path: importPath, score } of scoredImports) {
      if (totalTokens >= maxTokens) break;
      if (visited.has(importPath)) continue;

      const resolvedPath = await this.resolveImport(importPath, path.dirname(targetFile));
      if (!resolvedPath) continue;

      try {
        const content = await fs.readFile(resolvedPath, 'utf8');
        const tokens = this.estimateTokens(content);

        if (totalTokens + tokens <= maxTokens) {
          contextFiles.push({
            path: resolvedPath,
            relativePath: path.relative(path.dirname(targetFile), resolvedPath),
            content,
            tokens,
            score,
            reason: 'direct_import'
          });
          totalTokens += tokens;
          visited.add(importPath);
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }

    for (const additionalFile of additionalFiles) {
      if (totalTokens >= maxTokens) break;
      if (visited.has(additionalFile)) continue;

      try {
        const absPath = path.isAbsolute(additionalFile) ? additionalFile : path.resolve(additionalFile);
        const content = await fs.readFile(absPath, 'utf8');
        const tokens = this.estimateTokens(content);

        if (totalTokens + tokens <= maxTokens) {
          contextFiles.push({
            path: absPath,
            relativePath: path.relative(path.dirname(targetFile), absPath),
            content,
            tokens,
            score: 100,
            reason: 'explicitly_requested'
          });
          totalTokens += tokens;
          visited.add(additionalFile);
        }
      } catch (error) {
        console.error(`[SmartContext] Warning: Could not read ${additionalFile}: ${error.message}`);
      }
    }

    console.error(`[SmartContext] Gathered ${contextFiles.length} files, ~${totalTokens} tokens`);
    return contextFiles;
  }

  async gatherFullDirectoryContext(directory, maxTokens) {
    const contextFiles = [];
    let totalTokens = 0;

    try {
      const files = await fs.readdir(directory, { withFileTypes: true });

      for (const file of files) {
        if (totalTokens >= maxTokens) break;
        if (file.isDirectory()) continue;
        if (!this.isCodeFile(file.name)) continue;

        const filePath = path.join(directory, file.name);
        try {
          const content = await fs.readFile(filePath, 'utf8');
          const tokens = this.estimateTokens(content);

          if (totalTokens + tokens <= maxTokens) {
            contextFiles.push({
              path: filePath,
              relativePath: file.name,
              content,
              tokens,
              score: 50,
              reason: 'directory_file'
            });
            totalTokens += tokens;
          }
        } catch (error) {
          // Skip
        }
      }
    } catch (error) {
      console.error(`[SmartContext] Could not read directory: ${error.message}`);
    }

    return contextFiles;
  }

  async parseImports(filePath) {
    const cacheKey = filePath;
    const cached = importCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.imports;
    }

    const imports = [];

    try {
      const content = await fs.readFile(filePath, 'utf8');
      const language = this.detectLanguage(filePath);
      const patterns = IMPORT_PATTERNS[language] || IMPORT_PATTERNS.javascript;

      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const importPath = match[1];
          if (importPath && !this.isExternalPackage(importPath)) {
            imports.push(importPath);
          }
        }
      }

      if (this.cacheAST) {
        importCache.set(cacheKey, {
          imports,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error(`[SmartContext] Could not parse imports from ${filePath}: ${error.message}`);
    }

    return imports;
  }

  async parseExports(filePath) {
    const exports = [];

    try {
      const content = await fs.readFile(filePath, 'utf8');
      const language = this.detectLanguage(filePath);
      const patterns = EXPORT_PATTERNS[language] || EXPORT_PATTERNS.javascript;

      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const exportName = match[1];
          if (exportName) {
            const names = exportName.split(',').map(n => n.trim()).filter(Boolean);
            exports.push(...names);
          }
        }
      }
    } catch (error) {
      // Ignore errors
    }

    return exports;
  }

  async resolveImport(importPath, fromDirectory) {
    if (importPath.startsWith('.')) {
      const resolved = path.resolve(fromDirectory, importPath);

      const extensions = ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs', ''];
      for (const ext of extensions) {
        const fullPath = resolved + ext;
        try {
          await fs.access(fullPath);
          return fullPath;
        } catch {
          const indexPath = path.join(resolved, `index${ext}`);
          try {
            await fs.access(indexPath);
            return indexPath;
          } catch {
            // Continue
          }
        }
      }
    }

    const localPaths = [
      path.join(fromDirectory, 'node_modules', importPath),
      path.join(fromDirectory, '..', importPath),
      path.join(process.cwd(), 'src', importPath)
    ];

    for (const localPath of localPaths) {
      try {
        await fs.access(localPath);
        return localPath;
      } catch {
        // Continue
      }
    }

    return null;
  }

  scoreImport(importPath, targetFile) {
    let score = 50;

    if (importPath.startsWith('./')) {
      score += 30;
    } else if (importPath.startsWith('../')) {
      const depth = (importPath.match(/\.\.\//g) || []).length;
      score += Math.max(0, 20 - depth * 5);
    }

    const targetBase = path.basename(targetFile, path.extname(targetFile));
    const importBase = path.basename(importPath, path.extname(importPath));
    if (importBase.includes(targetBase) || targetBase.includes(importBase)) {
      score += 25;
    }

    if (importPath.includes('types') || importPath.includes('interfaces')) {
      score += 15;
    }

    if (importPath.includes('utils') || importPath.includes('helpers')) {
      score += 10;
    }

    return score;
  }

  isExternalPackage(importPath) {
    if (importPath.startsWith('.') || importPath.startsWith('/')) {
      return false;
    }

    const externalPatterns = [
      /^@[\w-]+\/[\w-]+/,
      /^[\w-]+$/,
      /^node:/,
    ];

    return externalPatterns.some(p => p.test(importPath));
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
      '.go': 'go',
      '.rs': 'rust',
      '.java': 'java',
      '.kt': 'kotlin',
      '.swift': 'swift',
      '.rb': 'ruby',
      '.php': 'php',
      '.cs': 'csharp',
      '.cpp': 'cpp',
      '.c': 'c',
      '.h': 'c'
    };
    return languageMap[ext] || 'javascript';
  }

  isCodeFile(filename) {
    const codeExtensions = [
      '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
      '.py', '.go', '.rs', '.java', '.kt', '.swift',
      '.rb', '.php', '.cs', '.cpp', '.c', '.h'
    ];
    return codeExtensions.some(ext => filename.endsWith(ext));
  }

  estimateTokens(content) {
    return Math.ceil(content.length / 4);
  }

  clearCache() {
    importCache.clear();
  }

  getCacheStats() {
    return {
      size: importCache.size,
      entries: Array.from(importCache.keys())
    };
  }
}

export const smartContext = new SmartContextManager();

export default SmartContextManager;
