// youtu-agent-phase1.test.js - TDD RED PHASE: File System Integration Tests
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { YoutAgentFileSystem } from '../src/youtu-agent-filesystem.js';

describe('YoutAgent Phase 1: File System Integration', () => {
  let youtAgent;
  let testDir;
  
  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'youtu-agent-test-'));
    youtAgent = new YoutAgentFileSystem({
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
      allowedExtensions: ['.js', '.ts', '.py', '.md', '.json', '.txt'],
      securityValidation: true
    });
  });
  
  afterEach(async () => {
    await fs.rm(testDir, { recursive: true });
  });

  test('should detect files in directory', async () => {
    const testFile = path.join(testDir, 'test.js');
    await fs.writeFile(testFile, 'console.log("test");');
    
    const files = await youtAgent.detectFiles(testDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('test.js');
  });

  test('should read file contents safely', async () => {
    const testFile = path.join(testDir, 'content.js');
    const testContent = 'const data = "test";';
    await fs.writeFile(testFile, testContent);
    
    const result = await youtAgent.readFile(testFile);
    expect(result.success).toBe(true);
    expect(result.content).toBe(testContent);
  });

  test('should handle WSL/Windows paths', async () => {
    const windowsPath = 'C:\\Users\\test\\project';
    const normalized = youtAgent.normalizePath(windowsPath);
    expect(normalized).toBeDefined();
  });
});