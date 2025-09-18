// src/utils/path-normalizer.js
import path from 'path';
import os from 'os';
import fs from 'fs';

class PathNormalizer {
  constructor() {
    this.isWindows = os.platform() === 'win32';
    this.isWSL = this.detectWSL();
  }

  detectWSL() {
    try {
      return fs.existsSync('/proc/version') && 
             fs.readFileSync('/proc/version', 'utf8').includes('Microsoft');
    } catch {
      return false;
    }
  }

  normalizePath(inputPath) {
    if (!inputPath || typeof inputPath !== 'string') {
      throw new Error('Invalid path provided');
    }

    // Remove null bytes and dangerous characters
    let cleanPath = inputPath.replace(/\0/g, '').trim();

    // Decode URI components if present
    try {
      cleanPath = decodeURIComponent(cleanPath);
    } catch (e) {
      // If decoding fails, use original
    }

    // Convert Windows paths to WSL if needed
    if (this.isWSL && this.isWindowsPath(cleanPath)) {
      cleanPath = this.windowsToWSLPath(cleanPath);
    }

    // Normalize path separators
    cleanPath = cleanPath.replace(/\\/g, '/');

    // Check for directory traversal attempts before resolving
    if (cleanPath.includes('../') || cleanPath.includes('..\\')) {
      throw new Error('Directory traversal attempt detected');
    }

    // Resolve to absolute path
    try {
      cleanPath = path.resolve(cleanPath);
    } catch (error) {
      throw new Error(`Invalid path format: ${error.message}`);
    }

    return cleanPath;
  }

  isWindowsPath(pathStr) {
    return /^[A-Za-z]:[\\/]/.test(pathStr) || pathStr.startsWith('\\\\');
  }

  windowsToWSLPath(winPath) {
    // Handle drive letters (C:\folder\file -> /mnt/c/folder/file)
    const driveMatch = winPath.match(/^([A-Za-z]):/);
    if (driveMatch) {
      const driveLetter = driveMatch[1].toLowerCase();
      return `/mnt/${driveLetter}${winPath.substring(2).replace(/\\/g, '/')}`;
    }

    // Handle network paths (\\server\share -> /mnt/server/share)
    if (winPath.startsWith('\\\\')) {
      return `/mnt${winPath.substring(1).replace(/\\/g, '/')}`;
    }

    return winPath;
  }

  validatePathSecurity(normalizedPath) {
    const forbiddenPaths = [
      '/etc/passwd',
      '/etc/shadow', 
      '/etc/hosts',
      '/etc/sudoers',
      '/root/',
      '/var/log/',
      '/proc/',
      '/sys/',
      '/dev/',
      '/mnt/c/windows/system32/config',
      '/mnt/c/windows/system32/drivers/etc'
    ];

    const lowerPath = normalizedPath.toLowerCase();
    
    for (const forbidden of forbiddenPaths) {
      if (lowerPath.includes(forbidden.toLowerCase())) {
        throw new Error(`Access to restricted system files is denied: ${forbidden}`);
      }
    }

    // Additional security checks
    if (normalizedPath.includes('\0')) {
      throw new Error('Null byte injection attempt detected');
    }

    if (normalizedPath.length > 4096) {
      throw new Error('Path too long - potential buffer overflow attempt');
    }

    return true;
  }

  sanitizeFileName(fileName) {
    if (!fileName || typeof fileName !== 'string') {
      throw new Error('Invalid filename provided');
    }

    // Remove dangerous characters
    return fileName
      .replace(/[<>:"|?*\x00-\x1f]/g, '_')
      .replace(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i, '_$1$2')
      .substring(0, 255); // Limit filename length
  }
}

export default new PathNormalizer();