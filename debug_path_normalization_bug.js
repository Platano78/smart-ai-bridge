#!/usr/bin/env node

/**
 * (つ◉益◉)つ BUG-HUNT: PATH NORMALIZATION BUG TRACER
 * 
 * This will trace the exact path normalization issue that's causing
 * validateAndExpandPaths to return normalized paths that don't work
 * with fs.stat() and fs.readFile() in analyzeFile()
 */

import path from 'path';
import fs from 'fs/promises';

// Import the exact path normalizer from the server
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

async function testPathNormalizationBug() {
  console.log('🔍 (つ◉益◉)つ BUG-HUNT: PATH NORMALIZATION BUG TRACER');
  console.log('=' .repeat(80));
  
  const testFile = '/home/platano/project/deepseek-mcp-bridge/test_enemy_ai.cs';
  const normalizer = new DeepSeekMCPPathNormalizer();
  
  console.log(`🎯 Original path: ${testFile}`);
  
  try {
    // Step 1: Test original path
    console.log('\n📋 STEP 1: Testing original path');
    const originalStats = await fs.stat(testFile);
    console.log(`✅ Original path works: ${originalStats.isFile()}`);
    console.log(`   Size: ${originalStats.size} bytes`);
    
    // Step 2: Test normalization
    console.log('\n📋 STEP 2: Testing path normalization');
    const normalizedPath = await normalizer.normalize(testFile);
    console.log(`🔄 Normalized path: ${normalizedPath}`);
    
    // Step 3: Test normalized path accessibility
    console.log('\n📋 STEP 3: Testing normalized path accessibility');
    try {
      const normalizedStats = await fs.stat(normalizedPath);
      console.log(`✅ Normalized path works: ${normalizedStats.isFile()}`);
      console.log(`   Size: ${normalizedStats.size} bytes`);
      
      // Compare the two paths
      if (originalStats.size === normalizedStats.size) {
        console.log(`✅ Both paths point to the same file`);
      } else {
        console.error(`❌ DIFFERENT FILES! Original: ${originalStats.size}B vs Normalized: ${normalizedStats.size}B`);
      }
      
    } catch (normalizedError) {
      console.error(`❌ CRITICAL BUG FOUND!`);
      console.error(`❌ Normalized path is inaccessible: ${normalizedError.message}`);
      console.error(`❌ Original: ${testFile} (works)`);
      console.error(`❌ Normalized: ${normalizedPath} (broken)`);
      
      return { 
        bug: true, 
        original: testFile, 
        normalized: normalizedPath,
        error: normalizedError.message
      };
    }
    
    // Step 4: Test reading content with both paths
    console.log('\n📋 STEP 4: Testing file content reading');
    try {
      const originalContent = await fs.readFile(testFile, 'utf-8');
      const normalizedContent = await fs.readFile(normalizedPath, 'utf-8');
      
      if (originalContent === normalizedContent) {
        console.log(`✅ Content matches: ${originalContent.length} characters`);
        return { bug: false };
      } else {
        console.error(`❌ CONTENT MISMATCH!`);
        return { bug: true, reason: 'content_mismatch' };
      }
      
    } catch (readError) {
      console.error(`❌ FILE READ ERROR: ${readError.message}`);
      return { bug: true, reason: 'read_error', error: readError.message };
    }
    
  } catch (error) {
    console.error(`❌ ORIGINAL PATH ERROR: ${error.message}`);
    return { bug: true, reason: 'original_path_error', error: error.message };
  }
}

// Test multiple path formats
async function testMultipleFormats() {
  console.log('\n🔍 TESTING MULTIPLE PATH FORMATS');
  console.log('=' .repeat(50));
  
  const testPaths = [
    '/home/platano/project/deepseek-mcp-bridge/test_enemy_ai.cs',
    './test_enemy_ai.cs',
    'test_enemy_ai.cs',
    path.resolve('test_enemy_ai.cs')
  ];
  
  for (const testPath of testPaths) {
    console.log(`\n🎯 Testing: ${testPath}`);
    const result = await testSinglePath(testPath);
    console.log(`   Result: ${result.works ? '✅' : '❌'} ${result.message}`);
  }
}

async function testSinglePath(inputPath) {
  try {
    const normalizer = new DeepSeekMCPPathNormalizer();
    const normalizedPath = await normalizer.normalize(inputPath);
    
    // Try to access the normalized path
    const stats = await fs.stat(normalizedPath);
    return { works: true, message: `Normalized to ${normalizedPath}, size: ${stats.size}B` };
    
  } catch (error) {
    return { works: false, message: error.message };
  }
}

async function runBugHunt() {
  const result = await testPathNormalizationBug();
  
  if (result.bug) {
    console.log('\n🚨 BUG CONFIRMED!');
    console.log('=' .repeat(40));
    console.log('The path normalization is breaking file access!');
    console.log('This explains why validateAndExpandPaths accepts files but analyzeFile fails!');
  } else {
    console.log('\n✅ NO BUG DETECTED IN PATH NORMALIZATION');
    console.log('The issue must be elsewhere in the pipeline...');
  }
  
  await testMultipleFormats();
}

runBugHunt().catch(console.error);