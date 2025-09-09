#!/usr/bin/env node

// Simple debug test to check path validation
import path from 'path';
import fs from 'fs/promises';

console.log('🔍 DEBUG: File Detection Issue Analysis');

async function debugPaths() {
  const testFile = 'test_enemy_ai.cs';
  const absolutePath = path.resolve(testFile);
  
  console.log('\n📍 PATH ANALYSIS:');
  console.log('Current directory:', process.cwd());
  console.log('Test file (relative):', testFile);
  console.log('Test file (absolute):', absolutePath);
  
  try {
    const stats = await fs.stat(testFile);
    console.log('✅ File exists:', stats.isFile());
    console.log('File size:', stats.size, 'bytes');
  } catch (error) {
    console.log('❌ File access error:', error.message);
  }
  
  try {
    const statsAbs = await fs.stat(absolutePath);
    console.log('✅ Absolute path exists:', statsAbs.isFile());
  } catch (error) {
    console.log('❌ Absolute path error:', error.message);
  }
  
  // Check extension
  const ext = path.extname(testFile);
  console.log('File extension:', ext);
  
  // Test allowed extensions
  const allowedExtensions = ['.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.json', '.md', '.txt', '.py', '.java', '.cpp', '.c', '.h', '.cs', '.yml', '.yaml', '.xml', '.sql'];
  console.log('Extension allowed:', allowedExtensions.includes(ext));
}

debugPaths().catch(console.error);