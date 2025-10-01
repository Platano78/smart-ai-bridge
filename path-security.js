import path from 'path';
import fs from 'fs/promises';

export async function validatePath(filePath, baseDir = process.cwd()) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Invalid file path: must be a non-empty string');
  }

  // Block Windows absolute paths on non-Windows platforms (cross-platform attack prevention)
  if (process.platform !== 'win32' && /^[A-Za-z]:[\\\/]/.test(filePath)) {
    throw new Error(`Invalid path: Windows-style absolute path not allowed on ${process.platform}`);
  }

  const absolutePath = path.resolve(baseDir, filePath);
  const normalizedBase = path.resolve(baseDir);

  if (!absolutePath.startsWith(normalizedBase + path.sep) && absolutePath !== normalizedBase) {
    throw new Error(`Path traversal detected: ${filePath} is outside allowed directory`);
  }

  const dangerous = ['..', '\0', '<', '>', '|', '?', '*'];
  if (dangerous.some(pattern => filePath.includes(pattern))) {
    throw new Error(`Invalid path: contains dangerous characters: ${filePath}`);
  }

  return absolutePath;
}

export async function validateFileExists(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

export async function validateDirExists(dirPath) {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

export async function validatePaths(paths, baseDir = process.cwd()) {
  if (!Array.isArray(paths)) {
    throw new Error('Paths must be an array');
  }
  
  return Promise.all(paths.map(p => validatePath(p, baseDir)));
}

export function safeJoin(base, ...segments) {
  const joined = path.join(base, ...segments);
  const resolved = path.resolve(joined);
  const baseResolved = path.resolve(base);
  
  if (!resolved.startsWith(baseResolved + path.sep) && resolved !== baseResolved) {
    throw new Error('Path traversal attempt detected');
  }
  
  return resolved;
}
