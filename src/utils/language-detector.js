import path from 'path';

/**
 * Mapping of file extensions to language names
 * @type {Object.<string, string>}
 */
export const EXTENSION_MAP = {
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
  '.h': 'c',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.md': 'markdown',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sql': 'sql',
  '.sh': 'shell',
  '.bash': 'shell'
};

/**
 * Detect language by file path
 * @param {string} filePath - Path of the file
 * @param {string} [fallback='unknown'] - Fallback language if not detected
 * @returns {string} Detected language or fallback
 */
export function detectLanguageByPath(filePath, fallback = 'unknown') {
  try {
    const ext = path.extname(filePath).toLowerCase();
    return EXTENSION_MAP[ext] || fallback;
  } catch (error) {
    console.error('Error detecting language by path:', error);
    return fallback;
  }
}

/**
 * Detect language by file content
 * @param {string} content - Content of the file
 * @returns {string} Detected language or 'unknown'
 */
export function detectLanguageByContent(content = '') {
  try {
    if (content.startsWith('//')) return 'javascript';
    if (content.includes('function') || content.includes('class')) return 'javascript';
    if (content.includes('def ') || content.includes('import ')) return 'python';
    if (content.includes('public class') || content.includes('public interface')) return 'java';
    if (content.includes('#include') || content.includes('using namespace')) return 'cpp';
    if (content.includes('function') || content.includes('const ')) return 'typescript';
    return 'unknown';
  } catch (error) {
    console.error('Error detecting language by content:', error);
    return 'unknown';
  }
}

/**
 * Detect language by input (file path or content)
 * @param {string} input - File path or content
 * @returns {string} Detected language
 */
export function detectLanguage(input = '') {
  try {
    return path.extname(input) ? detectLanguageByPath(input) : detectLanguageByContent(input);
  } catch (error) {
    console.error('Error detecting language:', error);
    return 'unknown';
  }
}