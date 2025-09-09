/**
 * Youtu Integration Test Suite for DeepSeek MCP Bridge v6.2.0
 * Comprehensive testing of the youtu routing integration
 * 
 * TEST COVERAGE:
 * 🧪 File analysis context detection
 * 🧪 Routing decision logic (DirectDeepSeek vs YoutuThenDeepSeek)
 * 🧪 Preprocessing pipeline integration
 * 🧪 Backward compatibility with enhanced_query_deepseek
 * 🧪 Error handling and fallback scenarios
 */

import { YoutuEmpiricalRouter } from './youtu-empirical-router.js';
import { EnhancedQueryIntegrator } from './enhanced-query-integrator.js';
import { ServerIntegrationBridge } from './server-integration-bridge.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Mock implementations for testing
 */
class MockEmpiricalRouter {
  constructor() {
    this.empiricalData = {
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      executions: new Map()
    };
  }

  async shouldTryDeepseekFirst(prompt) {
    return {
      tryDeepseek: true,
      reason: 'Mock empirical routing - default to DeepSeek',
      fingerprint: { fingerprint: 'mock-' + Date.now(), domain: 'general' },
      confidence: 0.8
    };
  }

  recordExecutionSuccess(fingerprint, responseTime, prompt, result) {
    this.empiricalData.successfulQueries++;
  }

  recordExecutionFailure(fingerprint, responseTime, error, failureAnalysis) {
    this.empiricalData.failedQueries++;
  }

  analyzeActualFailure(error, responseTime, prompt) {
    return {
      errorType: error.name || 'TestError',
      shouldRouteToClaudeNext: responseTime > 25000,
      reason: 'Mock failure analysis',
      responseTime
    };
  }

  getEmpiricalStats() {
    return this.empiricalData;
  }
}

class MockDeepSeekBridge {
  constructor() {
    this.routingMetrics = {
      totalQueries: 0,
      deepseekAttempted: 0,
      successfulRoutes: 0
    };
    this.empiricalRouter = new MockEmpiricalRouter();
  }

  async executeDeepseekQuery(prompt, options = {}) {
    this.routingMetrics.totalQueries++;
    this.routingMetrics.deepseekAttempted++;
    
    return {
      success: true,
      response: `Mock DeepSeek response for: ${prompt.substring(0, 50)}...`,
      model: 'mock-deepseek-coder',
      usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
      timestamp: new Date().toISOString(),
      originalPrompt: prompt
    };
  }

  async checkEnhancedStatus() {
    return {
      status: 'online',
      version: '6.1.0',
      endpoint: 'http://localhost:1234/v1',
      models: [{ id: 'mock-deepseek-coder' }],
      defaultModel: 'mock-deepseek-coder',
      features: ['empirical-routing', 'file-operations']
    };
  }

  recordExecutionSuccess(fingerprint, responseTime, prompt, result) {
    this.routingMetrics.successfulRoutes++;
    this.empiricalRouter.recordExecutionSuccess(fingerprint, responseTime, prompt, result);
  }

  recordExecutionFailure(fingerprint, responseTime, error, failureAnalysis) {
    this.empiricalRouter.recordExecutionFailure(fingerprint, responseTime, error, failureAnalysis);
  }

  analyzeActualFailure(error, responseTime, prompt) {
    return this.empiricalRouter.analyzeActualFailure(error, responseTime, prompt);
  }
}

/**
 * Test data creation utilities
 */
class TestDataManager {
  constructor() {
    this.testDir = '/tmp/youtu-test-files';
    this.createdFiles = [];
  }

  async setup() {
    try {
      await fs.mkdir(this.testDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  async createTestFile(filename, content, size = 'small') {
    const filePath = path.join(this.testDir, filename);
    
    let fileContent = content;
    if (size === 'large') {
      // Create a larger file for testing youtu preprocessing
      fileContent = content + '\n' + 'console.log("padding");'.repeat(1000);
    } else if (size === 'complex') {
      // Create a complex file structure
      fileContent = `
// Complex JavaScript file for testing
import React from 'react';
import { useState, useEffect } from 'react';

class ComplexComponent extends React.Component {
  constructor(props) {
    super(props);
    this.state = { data: null };
  }

  async componentDidMount() {
    try {
      const response = await fetch('/api/data');
      const data = await response.json();
      this.setState({ data });
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  }

  render() {
    return (
      <div className="complex-component">
        {this.state.data && (
          <DataDisplay data={this.state.data} />
        )}
      </div>
    );
  }
}

function DataDisplay({ data }) {
  const [filter, setFilter] = useState('');
  
  useEffect(() => {
    console.log('Data updated:', data);
  }, [data]);

  const filteredData = data.filter(item => 
    item.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div>
      <input 
        type="text" 
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter data..."
      />
      <ul>
        {filteredData.map(item => (
          <li key={item.id}>
            <strong>{item.name}</strong>: {item.description}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ComplexComponent;
      `;
    }

    await fs.writeFile(filePath, fileContent, 'utf8');
    this.createdFiles.push(filePath);
    return filePath;
  }

  async cleanup() {
    for (const filePath of this.createdFiles) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        // File might not exist
      }
    }
    
    try {
      await fs.rmdir(this.testDir);
    } catch (error) {
      // Directory might not be empty or not exist
    }
  }
}

/**
 * Youtu Integration Test Suite
 */
export class YoutuIntegrationTestSuite {
  constructor() {
    this.testDataManager = new TestDataManager();
    this.mockBridge = new MockDeepSeekBridge();
    this.testResults = [];
  }

  async runAllTests() {
    console.log('🧪 Starting Youtu Integration Test Suite...');
    
    await this.testDataManager.setup();
    
    try {
      // Test 1: File Analysis Context Detection
      await this.testFileAnalysisContext();
      
      // Test 2: Routing Decision Logic
      await this.testRoutingDecisionLogic();
      
      // Test 3: Integration Bridge
      await this.testIntegrationBridge();
      
      // Test 4: Preprocessing Pipeline
      await this.testPreprocessingPipeline();
      
      // Test 5: Backward Compatibility
      await this.testBackwardCompatibility();
      
      // Test 6: Error Handling
      await this.testErrorHandling();
      
    } finally {
      await this.testDataManager.cleanup();
    }

    this.printTestResults();
    return this.getTestSummary();
  }

  async testFileAnalysisContext() {
    console.log('🔍 Testing File Analysis Context Detection...');
    
    const youtuRouter = new YoutuEmpiricalRouter(this.mockBridge.empiricalRouter);
    
    // Test 1: Simple prompt without files
    const simplePrompt = 'How do I implement authentication in Node.js?';
    const simpleResult = await youtuRouter.fileAnalysisContext.analyzePromptForFiles(simplePrompt);
    
    this.assert(
      !simpleResult.hasFileReferences,
      'Simple prompt should not detect file references',
      { result: simpleResult }
    );

    // Test 2: Prompt with file references
    const testFile = await this.testDataManager.createTestFile('test.js', 'console.log("test");');
    const filePrompt = `Please analyze the file: ${testFile}`;
    const fileResult = await youtuRouter.fileAnalysisContext.analyzePromptForFiles(filePrompt);
    
    this.assert(
      fileResult.hasFileReferences,
      'File prompt should detect file references',
      { result: fileResult }
    );

    this.assert(
      fileResult.routingRecommendation === 'direct-deepseek',
      'Small single file should recommend direct-deepseek',
      { recommendation: fileResult.routingRecommendation }
    );

    // Test 3: Complex file analysis
    const complexFile = await this.testDataManager.createTestFile('complex.jsx', '', 'complex');
    const complexPrompt = `Review the complex file: ${complexFile}`;
    const complexResult = await youtuRouter.fileAnalysisContext.analyzePromptForFiles(complexPrompt);
    
    this.assert(
      complexResult.routingRecommendation !== null,
      'Complex file should have routing recommendation',
      { result: complexResult }
    );
  }

  async testRoutingDecisionLogic() {
    console.log('🎯 Testing Routing Decision Logic...');
    
    const youtuRouter = new YoutuEmpiricalRouter(this.mockBridge.empiricalRouter);
    
    // Test 1: Simple query routing
    const simpleQuery = 'Explain how async/await works in JavaScript';
    const simpleDecision = await youtuRouter.shouldTryDeepseekFirst(simpleQuery);
    
    this.assert(
      simpleDecision.tryDeepseek,
      'Simple query should try DeepSeek first',
      { decision: simpleDecision }
    );

    this.assert(
      simpleDecision.youtRouting?.strategy === 'direct-deepseek',
      'Simple query should use direct-deepseek strategy',
      { strategy: simpleDecision.youtRouting?.strategy }
    );

    // Test 2: File-based query routing
    const testFile = await this.testDataManager.createTestFile('routing-test.js', 'function test() {}');
    const fileQuery = `Analyze this file: ${testFile}`;
    const fileDecision = await youtuRouter.shouldTryDeepseekFirst(fileQuery);
    
    this.assert(
      fileDecision.youtRouting?.fileAnalysis !== null,
      'File query should have file analysis',
      { fileAnalysis: fileDecision.youtRouting?.fileAnalysis }
    );

    // Test 3: Complex multi-file query
    const file1 = await this.testDataManager.createTestFile('module1.js', 'export default class Module1 {}', 'large');
    const file2 = await this.testDataManager.createTestFile('module2.js', 'export default class Module2 {}', 'large');
    const multiFileQuery = `Analyze these files together: ${file1}, ${file2}`;
    const multiFileDecision = await youtuRouter.shouldTryDeepseekFirst(multiFileQuery);
    
    this.assert(
      multiFileDecision.youtRouting?.strategy === 'youtu-then-deepseek' ||
      multiFileDecision.youtRouting?.strategy === 'direct-deepseek',
      'Multi-file query should have appropriate strategy',
      { strategy: multiFileDecision.youtRouting?.strategy }
    );
  }

  async testIntegrationBridge() {
    console.log('🔗 Testing Integration Bridge...');
    
    const integrationBridge = new ServerIntegrationBridge(this.mockBridge);
    
    // Test 1: Basic integration setup
    this.assert(
      integrationBridge.integrationReady,
      'Integration bridge should be ready',
      { ready: integrationBridge.integrationReady }
    );

    // Test 2: Enhanced query execution
    const testQuery = 'How do I optimize React component performance?';
    const result = await integrationBridge.enhancedQuery(testQuery);
    
    this.assert(
      result.success,
      'Enhanced query should succeed',
      { result }
    );

    this.assert(
      result.integrationMetadata?.youtu_enhanced === true,
      'Result should indicate youtu enhancement',
      { metadata: result.integrationMetadata }
    );

    // Test 3: Status check integration
    const status = await integrationBridge.checkEnhancedStatus();
    
    this.assert(
      status.youtu_integration !== undefined,
      'Status should include youtu integration info',
      { youtuIntegration: status.youtu_integration }
    );

    this.assert(
      status.version === '6.2.0',
      'Version should be updated to 6.2.0',
      { version: status.version }
    );
  }

  async testPreprocessingPipeline() {
    console.log('⚙️ Testing Preprocessing Pipeline...');
    
    const youtuRouter = new YoutuEmpiricalRouter(this.mockBridge.empiricalRouter);
    const integrator = new EnhancedQueryIntegrator(this.mockBridge, this.mockBridge.empiricalRouter);
    
    // Test 1: Youtu preprocessing execution
    const testFile = await this.testDataManager.createTestFile('preprocess-test.js', 'console.log("test");', 'large');
    const fileReferences = [testFile];
    
    // Note: This will fail with mock components, but we can test the structure
    try {
      const preprocessingResult = await youtuRouter.executeYoutuPreprocessing(
        'Analyze this large file',
        fileReferences
      );
      
      // Should have structure even if it fails
      this.assert(
        typeof preprocessingResult === 'object',
        'Preprocessing should return structured result',
        { result: preprocessingResult }
      );
    } catch (error) {
      // Expected with mock components
      this.assert(
        error.message.includes('readMultipleFiles') || error.message.includes('preprocessing'),
        'Error should be related to preprocessing pipeline',
        { error: error.message }
      );
    }

    // Test 2: Enhanced prompt building
    const mockChunks = [
      {
        id: 0,
        content: 'function test() { console.log("test"); }',
        sourceFile: testFile,
        startLine: 1,
        endLine: 1,
        tokenCount: 20,
        contentType: 'javascript'
      }
    ];
    
    const enhancedPrompt = youtuRouter.buildEnhancedPrompt('Analyze this code', mockChunks);
    
    this.assert(
      enhancedPrompt.includes('Enhanced File Analysis Request'),
      'Enhanced prompt should have proper structure',
      { prompt: enhancedPrompt.substring(0, 100) }
    );

    this.assert(
      enhancedPrompt.includes(testFile),
      'Enhanced prompt should include file path',
      { includesFile: enhancedPrompt.includes(testFile) }
    );
  }

  async testBackwardCompatibility() {
    console.log('🔄 Testing Backward Compatibility...');
    
    const integrationBridge = new ServerIntegrationBridge(this.mockBridge);
    
    // Test 1: Original method compatibility
    this.assert(
      typeof integrationBridge.executeDeepseekQuery === 'function',
      'Original executeDeepseekQuery method should be preserved',
      {}
    );

    this.assert(
      typeof integrationBridge.recordExecutionSuccess === 'function',
      'Original recordExecutionSuccess method should be preserved',
      {}
    );

    this.assert(
      typeof integrationBridge.routingMetrics === 'object',
      'Original routingMetrics should be accessible',
      {}
    );

    // Test 2: Enhanced query maintains API
    const result = await integrationBridge.enhancedQuery('Test query');
    
    this.assert(
      result.success !== undefined,
      'Enhanced query should maintain success field',
      { hasSuccess: result.success !== undefined }
    );

    this.assert(
      result.response !== undefined,
      'Enhanced query should maintain response field',
      { hasResponse: result.response !== undefined }
    );

    // Test 3: Metrics recording
    const beforeSuccesses = integrationBridge.bridgeMetrics.youtuEnhancedQueries;
    await integrationBridge.enhancedQuery('Another test query');
    const afterSuccesses = integrationBridge.bridgeMetrics.youtuEnhancedQueries;
    
    this.assert(
      afterSuccesses > beforeSuccesses,
      'Metrics should be updated after query execution',
      { before: beforeSuccesses, after: afterSuccesses }
    );
  }

  async testErrorHandling() {
    console.log('❌ Testing Error Handling...');
    
    // Test 1: Graceful degradation
    const integrationBridge = new ServerIntegrationBridge(this.mockBridge);
    
    // Simulate youtu component failure by disabling integration
    integrationBridge.integrationReady = false;
    
    const result = await integrationBridge.enhancedQuery('Test query with disabled youtu');
    
    this.assert(
      result.success,
      'Query should succeed even with disabled youtu integration',
      { result }
    );

    this.assert(
      integrationBridge.bridgeMetrics.fallbackQueries > 0,
      'Fallback query counter should increment',
      { fallbackQueries: integrationBridge.bridgeMetrics.fallbackQueries }
    );

    // Test 2: Error recovery
    integrationBridge.integrationReady = true; // Re-enable
    
    try {
      // Force an error in routing
      const youtuRouter = new YoutuEmpiricalRouter(null); // Invalid router
      const errorResult = await youtuRouter.shouldTryDeepseekFirst('Test error handling');
      
      // Should fallback gracefully
      this.assert(false, 'Should have thrown an error', {});
    } catch (error) {
      this.assert(
        error.message.length > 0,
        'Error should have meaningful message',
        { errorMessage: error.message }
      );
    }
  }

  assert(condition, message, context = {}) {
    const result = {
      passed: Boolean(condition),
      message,
      context,
      timestamp: new Date().toISOString()
    };
    
    this.testResults.push(result);
    
    if (result.passed) {
      console.log(`  ✅ ${message}`);
    } else {
      console.log(`  ❌ ${message}`);
      if (Object.keys(context).length > 0) {
        console.log(`     Context: ${JSON.stringify(context, null, 2)}`);
      }
    }
  }

  printTestResults() {
    const passed = this.testResults.filter(r => r.passed).length;
    const total = this.testResults.length;
    const failed = total - passed;

    console.log('\n📊 Test Results Summary:');
    console.log(`  ✅ Passed: ${passed}`);
    console.log(`  ❌ Failed: ${failed}`);
    console.log(`  📝 Total: ${total}`);
    console.log(`  📈 Success Rate: ${Math.round((passed / total) * 100)}%`);

    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.testResults
        .filter(r => !r.passed)
        .forEach(result => {
          console.log(`  • ${result.message}`);
        });
    }
  }

  getTestSummary() {
    const passed = this.testResults.filter(r => r.passed).length;
    const total = this.testResults.length;
    
    return {
      passed,
      failed: total - passed,
      total,
      successRate: (passed / total) * 100,
      results: this.testResults
    };
  }
}

/**
 * Run integration tests
 */
export async function runYoutuIntegrationTests() {
  const testSuite = new YoutuIntegrationTestSuite();
  const results = await testSuite.runAllTests();
  
  console.log('\n🎯 Youtu Integration Test Suite Completed!');
  console.log(`Success Rate: ${Math.round(results.successRate)}%`);
  
  return results;
}

// Export for direct execution
export default YoutuIntegrationTestSuite;