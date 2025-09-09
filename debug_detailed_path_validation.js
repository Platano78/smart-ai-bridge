#!/usr/bin/env node

/**
 * (つ◉益◉)つ BUG-HUNT: DETAILED PATH VALIDATION DEBUG
 * 
 * This script will trace exactly what happens during validateAndExpandPaths
 * to find why test_enemy_ai.cs is being rejected
 */

import path from 'path';
import fs from 'fs/promises';

// Import the path normalizer class
class DeepSeekMCPPathNormalizer {
  constructor() {
    this.supportedPlatforms = ['Windows', 'Linux', 'WSL'];
  }

  async normalize(inputPath) {
    try {
      let normalizedPath;

      // WSL path: \\wsl.localhost\Ubuntu\path -> /path
      if (inputPath.startsWith('\\\\wsl.localhost\\Ubuntu')) {
        normalizedPath = this.normalizeWSLPath(inputPath);
      }
      // Mixed separators: C:\path\file.txt -> /path/file.txt
      else if (inputPath.includes('\\')) {
        normalizedPath = this.normalizeWindowsPath(inputPath);
      }
      // Already Linux format
      else {
        normalizedPath = this.normalizeLinuxPath(inputPath);
      }

      console.error(`📁 Path normalized: ${inputPath} -> ${normalizedPath}`);
      return normalizedPath;
    } catch (error) {
      console.error(`❌ Path normalization failed: ${error.message}`);
      throw new Error(`Failed to normalize path: ${inputPath}`);
    }
  }

  normalizeWSLPath(inputPath) {
    // \\wsl.localhost\Ubuntu\home\platano -> /home/platano
    return inputPath
      .replace(/\\\\wsl\.localhost\\Ubuntu/g, '')
      .replace(/\\/g, '/')
      .replace(/\/+/g, '/');
  }

  normalizeWindowsPath(inputPath) {
    // Replace backslashes and clean up
    return inputPath
      .replace(/\\/g, '/')
      .replace(/\/+/g, '/');
  }

  normalizeLinuxPath(inputPath) {
    // Clean redundant slashes
    return inputPath.replace(/\/+/g, '/');
  }
}

// Simulate the FileAnalysisManager class methods
class DebugFileAnalysisManager {
  constructor() {
    this.maxFileSize = 10 * 1024 * 1024; // 10MB limit
    this.maxFiles = 50; // Maximum files per analysis
    this.allowedExtensions = ['.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.json', '.md', '.txt', '.py', '.java', '.cpp', '.c', '.h', '.cs', '.yml', '.yaml', '.xml', '.sql'];
    this.maxDirectoryDepth = 10;
    this.dangerousPaths = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__'];
    this.pathNormalizer = new DeepSeekMCPPathNormalizer();
  }

  /**
   * Security validation for file paths
   */
  isValidPath(filePath) {
    console.log(`🔍 CHECKING isValidPath for: ${filePath}`);
    
    // Prevent directory traversal
    const normalizedPath = path.normalize(filePath);
    console.log(`🔍 path.normalize result: ${normalizedPath}`);
    
    if (normalizedPath.includes('..')) {
      console.log(`❌ REJECTED: Contains '..'`);
      return false;
    }
    
    if (normalizedPath.startsWith('/etc')) {
      console.log(`❌ REJECTED: Starts with '/etc'`);
      return false;
    }
    
    if (normalizedPath.startsWith('/proc')) {
      console.log(`❌ REJECTED: Starts with '/proc'`);
      return false;
    }

    // Check against dangerous paths
    for (const dangerous of this.dangerousPaths) {
      if (normalizedPath.includes(dangerous)) {
        console.log(`❌ REJECTED: Contains dangerous path '${dangerous}'`);
        return false;
      }
    }

    console.log(`✅ PASSED isValidPath`);
    return true;
  }

  /**
   * Check if file extension is allowed
   */
  isAllowedFile(filePath) {
    console.log(`🔍 CHECKING isAllowedFile for: ${filePath}`);
    const ext = path.extname(filePath).toLowerCase();
    console.log(`🔍 Extension detected: '${ext}'`);
    console.log(`🔍 Allowed extensions:`, this.allowedExtensions);
    const isAllowed = this.allowedExtensions.includes(ext);
    console.log(`🔍 Extension allowed: ${isAllowed}`);
    return isAllowed;
  }

  /**
   * Validate file paths and expand patterns - DEBUG VERSION
   */
  async validateAndExpandPaths(filePaths) {
    console.log(`🚀 STARTING validateAndExpandPaths with:`, filePaths);
    
    const validPaths = [];
    const pathArray = Array.isArray(filePaths) ? filePaths : [filePaths];
    console.log(`🔍 Path array:`, pathArray);

    for (const filePath of pathArray) {
      console.log(`\n🎯 PROCESSING: ${filePath}`);
      let normalizedPath = null;
      
      try {
        // Security validation
        if (!this.isValidPath(filePath)) {
          console.error(`⚠️ Invalid path rejected: ${filePath}`);
          continue;
        }

        // Normalize the path first
        console.log(`🔄 NORMALIZING PATH...`);
        normalizedPath = await this.pathNormalizer.normalize(filePath);
        console.error(`🔄 Path normalized: ${filePath} -> ${normalizedPath}`);
        
        // Check if path exists
        console.log(`🔍 CHECKING IF PATH EXISTS...`);
        const stats = await fs.stat(normalizedPath);
        console.log(`✅ Path exists, isFile: ${stats.isFile()}, size: ${stats.size}`);
        
        if (stats.isFile()) {
          // Single file
          console.log(`🔍 PROCESSING SINGLE FILE...`);
          
          const isAllowed = this.isAllowedFile(normalizedPath);
          const sizeOk = stats.size <= this.maxFileSize;
          console.log(`🔍 Extension check: ${isAllowed}, Size check: ${sizeOk} (${stats.size} <= ${this.maxFileSize})`);
          
          if (isAllowed && sizeOk) {
            console.log(`✅ FILE ACCEPTED: Adding to validPaths`);
            validPaths.push(normalizedPath);
          } else {
            console.error(`⚠️ File rejected: ${normalizedPath} (extension: ${isAllowed}, size: ${sizeOk})`);
          }
        } else if (stats.isDirectory()) {
          console.log(`📁 DIRECTORY DETECTED - would expand files here`);
          // Directory - find files with patterns
          // Note: We're not implementing directory expansion in this debug script
        }
      } catch (error) {
        console.error(`❌ Path validation failed: ${filePath} -> ${normalizedPath || 'normalization failed'} - ${error.message}`);
        console.error(`❌ Error details:`, error);
      }
    }

    console.log(`\n🏁 FINAL RESULT: ${validPaths.length} valid paths`);
    console.log(`📋 Valid paths:`, validPaths);
    return validPaths.slice(0, this.maxFiles);
  }
}

async function debugPathValidation() {
  console.log('🔍 (つ◉益◉)つ BUG-HUNT: DETAILED PATH VALIDATION DEBUG');
  console.log('=' .repeat(80));
  
  const debugManager = new DebugFileAnalysisManager();
  const testFile = '/home/platano/project/deepseek-mcp-bridge/test_enemy_ai.cs';
  
  console.log(`🎯 Testing file: ${testFile}`);
  
  try {
    const validPaths = await debugManager.validateAndExpandPaths([testFile]);
    
    console.log('\n🏁 FINAL ANALYSIS:');
    console.log('=' .repeat(50));
    console.log(`Valid paths returned: ${validPaths.length}`);
    console.log('Paths:', validPaths);
    
    if (validPaths.length === 0) {
      console.error('❌ BUG CONFIRMED: File should be valid but was rejected!');
    } else {
      console.log('✅ File validation working correctly');
    }
    
  } catch (error) {
    console.error('❌ DEBUG SCRIPT ERROR:', error);
  }
}

// Run the debug
debugPathValidation();