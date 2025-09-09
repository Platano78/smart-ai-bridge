#!/usr/bin/env node

// Simple RED phase test to validate DeepSeek bridge content transmission
// This bypasses ES module issues and directly tests the bridge

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

console.log('🚨 RED PHASE SIMPLE TEST - Direct Bridge Validation');
console.log('Testing if DeepSeek receives actual file content or generic patterns\n');

// Create a simple test file with highly specific content
const testFileContent = `using UnityEngine;

public class SpecificTestClass : MonoBehaviour 
{
    public float uniqueVariable = 42.0f;
    private string specificMethod = "TEST_PATTERN_12345";
    
    void UniqueMethodName() 
    {
        Debug.Log("This is line 10 with specific content");
        transform.position = new Vector3(uniqueVariable, 0, 0);
        // This comment contains UNIQUE_IDENTIFIER_67890
    }
}`;

async function runRedPhaseTest() {
  try {
    // Write test file
    const testFilePath = './test_specific_content.cs';
    await fs.writeFile(testFilePath, testFileContent);
    console.log('✅ Created test file with specific identifiers');
    
    // Test 1: Direct analyze_files call
    console.log('\n🎯 TEST 1: Running analyze_files on specific content...');
    
    // We'll use the bridge directly here - this is the critical test
    const { McpBridge } = await import('./server.js');
    
    const bridge = new McpBridge();
    
    // Try to analyze the file
    const result = await bridge.fileAnalyzer.analyzeFiles([testFilePath], {
      maxFiles: 1,
      includeProjectContext: false
    });
    
    console.log('\n📊 ANALYSIS RESULT:');
    console.log('Files processed:', result.files?.length || 0);
    
    if (result.files && result.files.length > 0) {
      const file = result.files[0];
      console.log('Success:', file.success);
      console.log('Content length:', file.content?.length || 0);
      console.log('Has analysis:', !!file.analysis);
      
      // CRITICAL TEST: Does the result contain our specific identifiers?
      const hasSpecificContent = file.content && (
        file.content.includes('SpecificTestClass') &&
        file.content.includes('uniqueVariable') &&
        file.content.includes('UniqueMethodName') &&
        file.content.includes('UNIQUE_IDENTIFIER_67890')
      );
      
      console.log('\n🔍 CONTENT TRANSMISSION TEST:');
      console.log('Contains SpecificTestClass:', file.content?.includes('SpecificTestClass') || false);
      console.log('Contains uniqueVariable:', file.content?.includes('uniqueVariable') || false);
      console.log('Contains UniqueMethodName:', file.content?.includes('UniqueMethodName') || false);
      console.log('Contains UNIQUE_IDENTIFIER_67890:', file.content?.includes('UNIQUE_IDENTIFIER_67890') || false);
      
      if (hasSpecificContent) {
        console.log('✅ CONTENT TRANSMISSION: File content properly read and stored');
      } else {
        console.log('❌ CONTENT TRANSMISSION FAILED: Missing specific file content');
      }
      
      // Display actual content preview
      if (file.content) {
        console.log('\n📄 CONTENT PREVIEW (first 200 chars):');
        console.log(file.content.substring(0, 200));
      }
    }
    
    // Clean up
    await fs.unlink(testFilePath);
    
    console.log('\n🎯 RED PHASE TEST COMPLETE');
    console.log('Key Finding: analyze_files reads and processes content locally');
    console.log('Next Test Needed: Does this content reach DeepSeek API for analysis?');
    
  } catch (error) {
    console.error('❌ RED PHASE TEST FAILED:', error.message);
    console.error('This confirms there are issues with the bridge setup');
  }
}

runRedPhaseTest().catch(console.error);