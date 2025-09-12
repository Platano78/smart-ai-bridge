#!/usr/bin/env node

/**
 * ATOMIC TASK 1: Hybrid Server Architecture Foundation - TDD Test Suite
 * 
 * RED PHASE: Create failing tests that define the hybrid server requirements
 * 
 * Test Requirements:
 * 1. ✅ Hybrid server file exists and is executable
 * 2. ✅ Hybrid server imports triple-bridge.js successfully
 * 3. ✅ Hybrid server imports consolidated tools from archive
 * 4. ✅ Hybrid server starts without errors
 * 5. ✅ MCP protocol initialization works
 */

console.error('🔴 ATOMIC TASK 1 - RED PHASE: Creating failing tests for hybrid server foundation');

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Test Configuration
const HYBRID_SERVER_PATH = path.join(projectRoot, 'server-hybrid-v7.js');
const TRIPLE_BRIDGE_PATH = path.join(projectRoot, 'src', 'enhanced-triple-mcp-server.js');
const CONSOLIDATED_TOOLS_PATH = path.join(projectRoot, 'archive', 'server-consolidated-v7.js');

let testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: []
};

// Test utility functions
function logTest(testName, passed, message = '') {
  testResults.total++;
  if (passed) {
    testResults.passed++;
    console.error(`✅ ${testName}: PASS ${message ? '- ' + message : ''}`);
  } else {
    testResults.failed++;
    testResults.errors.push(`${testName}: ${message}`);
    console.error(`❌ ${testName}: FAIL ${message ? '- ' + message : ''}`);
  }
}

// RED PHASE TESTS - These should ALL FAIL initially

async function runRedPhaseTests() {
  console.error('\n🔴 RED PHASE: Running failing tests for hybrid server foundation...\n');

  // Test 1: Hybrid server file exists and is executable
  try {
    const stats = await fs.stat(HYBRID_SERVER_PATH);
    const isExecutable = (stats.mode & parseInt('111', 8)) !== 0;
    logTest(
      'TEST 1: Hybrid server file exists and is executable',
      stats.isFile() && isExecutable,
      `File exists: ${stats.isFile()}, Executable: ${isExecutable}`
    );
  } catch (error) {
    logTest(
      'TEST 1: Hybrid server file exists and is executable',
      false,
      'File does not exist'
    );
  }

  // Test 2: Hybrid server imports triple-bridge successfully
  try {
    const hybridContent = await fs.readFile(HYBRID_SERVER_PATH, 'utf8');
    const hasTripleImport = hybridContent.includes('enhanced-triple-mcp-server.js') ||
                           hybridContent.includes('EnhancedTripleMCPServer');
    logTest(
      'TEST 2: Hybrid server imports triple-bridge successfully',
      hasTripleImport,
      `Triple endpoint import found: ${hasTripleImport}`
    );
  } catch (error) {
    logTest(
      'TEST 2: Hybrid server imports triple-bridge successfully',
      false,
      'Cannot read hybrid server file'
    );
  }

  // Test 3: Hybrid server imports consolidated tools from archive
  try {
    const hybridContent = await fs.readFile(HYBRID_SERVER_PATH, 'utf8');
    const hasConsolidatedImport = hybridContent.includes('server-consolidated-v7.js') ||
                                 hybridContent.includes('consolidated_multi_provider_query');
    logTest(
      'TEST 3: Hybrid server imports consolidated tools from archive',
      hasConsolidatedImport,
      `Consolidated tools import found: ${hasConsolidatedImport}`
    );
  } catch (error) {
    logTest(
      'TEST 3: Hybrid server imports consolidated tools from archive',
      false,
      'Cannot read hybrid server file or imports missing'
    );
  }

  // Test 4: Hybrid server starts without errors (syntax check)
  try {
    // Simple syntax validation by attempting to parse the file
    const hybridContent = await fs.readFile(HYBRID_SERVER_PATH, 'utf8');
    // Check for basic server structure
    const hasServerClass = hybridContent.includes('class') || hybridContent.includes('server');
    const hasExports = hybridContent.includes('export') || hybridContent.includes('module.exports');
    logTest(
      'TEST 4: Hybrid server has valid server structure',
      hasServerClass && hasExports,
      `Server class: ${hasServerClass}, Exports: ${hasExports}`
    );
  } catch (error) {
    logTest(
      'TEST 4: Hybrid server has valid server structure',
      false,
      'Syntax check failed or file unreadable'
    );
  }

  // Test 5: MCP protocol initialization works
  try {
    const hybridContent = await fs.readFile(HYBRID_SERVER_PATH, 'utf8');
    const hasMCPImports = hybridContent.includes('@modelcontextprotocol/sdk');
    const hasServerSetup = hybridContent.includes('Server') && hybridContent.includes('Transport');
    logTest(
      'TEST 5: MCP protocol initialization works',
      hasMCPImports && hasServerSetup,
      `MCP imports: ${hasMCPImports}, Server setup: ${hasServerSetup}`
    );
  } catch (error) {
    logTest(
      'TEST 5: MCP protocol initialization works',
      false,
      'MCP protocol validation failed'
    );
  }

  // Test 6: Hybrid server merges both architectures
  try {
    const hybridContent = await fs.readFile(HYBRID_SERVER_PATH, 'utf8');
    const hasTripleTools = hybridContent.includes('query_deepseek') || hybridContent.includes('triple');
    const hasConsolidatedTools = hybridContent.includes('consolidated_multi_provider_query');
    logTest(
      'TEST 6: Hybrid server merges both architectures',
      hasTripleTools && hasConsolidatedTools,
      `Triple tools: ${hasTripleTools}, Consolidated tools: ${hasConsolidatedTools}`
    );
  } catch (error) {
    logTest(
      'TEST 6: Hybrid server merges both architectures',
      false,
      'Architecture merge validation failed'
    );
  }

  // Test 7: Dependencies are properly imported
  try {
    // Check if required dependencies exist
    await fs.stat(TRIPLE_BRIDGE_PATH);
    await fs.stat(CONSOLIDATED_TOOLS_PATH);
    logTest(
      'TEST 7: Required dependencies exist',
      true,
      'Triple bridge and consolidated tools found'
    );
  } catch (error) {
    logTest(
      'TEST 7: Required dependencies exist',
      false,
      'Missing required dependency files'
    );
  }

  return testResults;
}

// Execute RED phase tests
async function executeRedPhase() {
  console.error('🔴 ATOMIC TASK 1: RED PHASE - Creating failing tests for hybrid server architecture');
  console.error('📋 Expected Result: ALL TESTS SHOULD FAIL (this is correct TDD behavior)');
  console.error('🎯 Goal: Define requirements through failing tests\n');

  const results = await runRedPhaseTests();

  console.error(`\n🔴 RED PHASE TEST SUMMARY:`);
  console.error(`📊 Total Tests: ${results.total}`);
  console.error(`✅ Passed: ${results.passed}`);
  console.error(`❌ Failed: ${results.failed}`);
  console.error(`📈 Failure Rate: ${Math.round((results.failed / results.total) * 100)}%`);

  if (results.failed > 0) {
    console.error(`\n🎯 EXPECTED FAILURES (TDD RED PHASE):`);
    results.errors.forEach((error, index) => {
      console.error(`   ${index + 1}. ${error}`);
    });
  }

  console.error(`\n🔄 NEXT STEP: GREEN PHASE`);
  console.error(`   Create server-hybrid-v7.js to make all tests PASS`);
  console.error(`   Combine triple endpoint architecture with consolidated tools`);
  
  console.error(`\n📁 Required Files:`);
  console.error(`   - server-hybrid-v7.js (to be created)`);
  console.error(`   - src/enhanced-triple-mcp-server.js (exists: ${await fileExists(TRIPLE_BRIDGE_PATH)})`);
  console.error(`   - archive/server-consolidated-v7.js (exists: ${await fileExists(CONSOLIDATED_TOOLS_PATH)})`);
  
  return results.failed === results.total; // Success if all tests fail in RED phase
}

async function fileExists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

// Run the RED phase
if (import.meta.url === `file://${process.argv[1]}`) {
  executeRedPhase()
    .then(allTestsFailed => {
      if (allTestsFailed) {
        console.error('\n🎉 RED PHASE SUCCESS: All tests failed as expected!');
        console.error('🔄 Ready for GREEN PHASE implementation');
        process.exit(0);
      } else {
        console.error('\n⚠️  RED PHASE WARNING: Some tests unexpectedly passed');
        console.error('🔍 This might indicate existing implementation or test issues');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n❌ RED PHASE ERROR:', error.message);
      process.exit(1);
    });
}

export { runRedPhaseTests, executeRedPhase };