#!/usr/bin/env node

/**
 * (つ◉益◉)つ BUG-HUNT: EXACT PIPELINE BUG REPLICATOR
 * 
 * This replicates the EXACT flow: filePaths → validateAndExpandPaths → analyzeFile
 * to find where the bug is happening that causes "0 files processed"
 */

import path from 'path';
import fs from 'fs/promises';

// Exact copy of the DeepSeekMCPPathNormalizer
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

// Exact copy of the FileAnalysisManager methods
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
   * Security validation for file paths - EXACT COPY
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
   * Check if file extension is allowed - EXACT COPY
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
   * EXACT COPY of validateAndExpandPaths method
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
        console.log(`🔍 CHECKING IF NORMALIZED PATH EXISTS...`);
        const stats = await fs.stat(normalizedPath);
        console.log(`✅ Normalized path exists, isFile: ${stats.isFile()}, size: ${stats.size}`);
        
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

  /**
   * EXACT COPY of analyzeFile method
   */
  async analyzeFile(filePath, options = {}) {
    console.log(`\n🧪 ANALYZING FILE: ${filePath}`);
    try {
      console.log(`🔍 Calling fs.stat(${filePath})...`);
      const stats = await fs.stat(filePath);
      console.log(`✅ fs.stat successful: ${stats.size} bytes`);
      
      console.log(`🔍 Calling fs.readFile(${filePath}, 'utf-8')...`);
      const content = await fs.readFile(filePath, 'utf-8');
      console.log(`✅ fs.readFile successful: ${content.length} characters`);
      
      const result = {
        success: true,
        path: filePath,
        metadata: {
          name: path.basename(filePath),
          extension: path.extname(filePath),
          size: stats.size,
          modified: stats.mtime,
          lines: content.split('\n').length
        },
        content: content.substring(0, 200) + (content.length > 200 ? '...' : ''), // Truncate for debug
        analysis: {
          language: 'csharp', // Simplified for debug
          complexity: { complexity: 'medium' },
          imports: [],
          functions: [],
          classes: []
        }
      };

      console.log(`✅ analyzeFile SUCCESS for ${filePath}`);
      return result;
    } catch (error) {
      console.error(`❌ analyzeFile FAILED for ${filePath}: ${error.message}`);
      return {
        success: false,
        path: filePath,
        error: error.message
      };
    }
  }

  /**
   * Simplified version of the analyzeFiles processing loop
   */
  async simulateAnalyzeFiles(filePaths) {
    console.log(`\n🎬 SIMULATING ANALYZE FILES PIPELINE`);
    console.log('=' .repeat(60));
    
    // Step 1: Validate and expand paths
    const validPaths = await this.validateAndExpandPaths(filePaths);
    console.log(`\n📋 VALID PATHS COUNT: ${validPaths.length}`);
    
    // Step 2: Process each valid path
    let validFiles = 0;
    const errors = [];
    
    for (const filePath of validPaths) {
      try {
        const fileResult = await this.analyzeFile(filePath);
        if (fileResult.success) {
          validFiles++;
          console.log(`✅ Successfully processed: ${filePath}`);
        } else {
          errors.push({
            path: filePath,
            error: fileResult.error
          });
          console.error(`❌ Failed to process: ${filePath} - ${fileResult.error}`);
        }
      } catch (error) {
        errors.push({
          path: filePath,
          error: error.message
        });
        console.error(`❌ Exception processing: ${filePath} - ${error.message}`);
      }
    }
    
    console.log(`\n🏆 FINAL RESULT:`);
    console.log(`   Valid files processed: ${validFiles}`);
    console.log(`   Errors: ${errors.length}`);
    
    if (errors.length > 0) {
      console.error(`❌ ERRORS FOUND:`);
      errors.forEach(err => console.error(`   ${err.path}: ${err.error}`));
    }
    
    return {
      validFiles,
      totalFiles: filePaths.length,
      validPaths: validPaths.length,
      errors
    };
  }
}

async function debugExactPipelineBug() {
  console.log('🔍 (つ◉益◉)つ BUG-HUNT: EXACT PIPELINE BUG REPLICATOR');
  console.log('=' .repeat(80));
  
  const testFiles = ['/home/platano/project/deepseek-mcp-bridge/test_enemy_ai.cs'];
  const debugManager = new DebugFileAnalysisManager();
  
  console.log(`🎯 Testing files:`, testFiles);
  
  const result = await debugManager.simulateAnalyzeFiles(testFiles);
  
  console.log('\n🏁 FINAL ANALYSIS:');
  console.log('=' .repeat(50));
  console.log(`Files processed: ${result.validFiles}/${result.totalFiles}`);
  console.log(`Valid paths found: ${result.validPaths}`);
  console.log(`Errors: ${result.errors.length}`);
  
  if (result.validFiles === 0 && result.validPaths > 0) {
    console.error('🚨 BUG CONFIRMED: validateAndExpandPaths finds files but analyzeFile fails!');
    console.error('The normalized paths from validateAndExpandPaths are breaking analyzeFile!');
  } else if (result.validPaths === 0) {
    console.error('🚨 BUG CONFIRMED: validateAndExpandPaths is rejecting valid files!');
  } else if (result.validFiles > 0) {
    console.log('✅ Pipeline working correctly');
  }
  
  return result;
}

debugExactPipelineBug().catch(console.error);