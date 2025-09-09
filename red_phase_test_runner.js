// (つ◉益◉)つ BUG-HUNT: RED PHASE TEST RUNNER - CRITICAL BUG VALIDATION SYSTEM
// MISSION: Execute all RED phase tests to expose DeepSeek content transmission failures
// This is the MASTER CONTROL for proving the bug exists

import { ContentTransmissionTest } from './test_content_transmission.js';
import { SpecificAnalysisTest } from './test_specific_analysis.js';
import { LineAnalysisTest } from './test_line_analysis.js';
import fs from 'fs';
import path from 'path';

class RedPhaseTestRunner {
  constructor() {
    this.tests = {
      contentTransmission: null,
      specificAnalysis: null,
      lineAnalysis: null
    };
    this.results = {
      contentTransmission: null,
      specificAnalysis: null,
      lineAnalysis: null
    };
    this.reportPath = path.join(__dirname, 'red_phase_test_report.json');
  }

  async initializeAllTests() {
    console.log('(つ◉益◉)つ BUG-HUNT: INITIALIZING ALL RED PHASE TESTS...');
    console.log('🎯 MISSION: Expose content transmission failures in DeepSeek pipeline');
    
    try {
      // Initialize content transmission test
      this.tests.contentTransmission = new ContentTransmissionTest();
      await this.tests.contentTransmission.setup();
      console.log('✅ Content transmission test initialized');

      // Initialize specific analysis test  
      this.tests.specificAnalysis = new SpecificAnalysisTest();
      await this.tests.specificAnalysis.setup();
      console.log('✅ Specific analysis test initialized');

      // Initialize line analysis test
      this.tests.lineAnalysis = new LineAnalysisTest();
      await this.tests.lineAnalysis.setup();
      console.log('✅ Line analysis test initialized');

      console.log('\n🚀 ALL RED PHASE TESTS READY FOR EXECUTION');
      return true;
    } catch (error) {
      console.error(`❌ TEST INITIALIZATION FAILED: ${error.message}`);
      throw error;
    }
  }

  listAllTestFiles() {
    console.log('\n📁 ALL GENERATED TEST FILES:');
    console.log('============================');
    
    console.log('\n1. CONTENT TRANSMISSION TEST:');
    console.log(`   File: ${this.tests.contentTransmission?.testFile}`);
    console.log('   Purpose: Validates DeepSeek receives actual file content');
    
    console.log('\n2. SPECIFIC ANALYSIS TESTS:');
    if (this.tests.specificAnalysis?.analysisTargets) {
      this.tests.specificAnalysis.analysisTargets.forEach((target, index) => {
        console.log(`   File ${index + 1}: ${target.file}`);
        console.log(`      Expected specifics: ${target.expectedSpecifics.length}`);
      });
    }
    console.log('   Purpose: Validates specific code element identification vs generic advice');
    
    console.log('\n3. LINE ANALYSIS TEST:');
    console.log(`   File: ${this.tests.lineAnalysis?.testFile}`);
    console.log('   Purpose: Validates line-by-line analysis capability');
    
    console.log('\n📊 TOTAL TEST FILES: ' + this.getTotalFileCount());
  }

  getTotalFileCount() {
    let count = 0;
    if (this.tests.contentTransmission?.testFile) count++;
    if (this.tests.specificAnalysis?.analysisTargets) count += this.tests.specificAnalysis.analysisTargets.length;
    if (this.tests.lineAnalysis?.testFile) count++;
    return count;
  }

  async simulateDeepSeekResponse(testType = 'generic') {
    console.log(`\n🎭 SIMULATING DEEPSEEK RESPONSE (${testType.toUpperCase()})...`);
    
    // Simulate different response types for testing the test suite itself
    switch (testType) {
      case 'generic':
        return {
          analysis: 'This appears to be Unity C# code. Here are some general recommendations:',
          suggestions: [
            'Use Vector3.Distance for distance calculations',
            'Consider using object pooling for performance optimization',
            'Make sure to null-check your references to avoid null reference exceptions',
            'Use SerializeField attribute for private fields that need to appear in inspector',
            'Follow Unity naming conventions for better code readability'
          ],
          codeReview: 'The code follows standard Unity patterns. Consider implementing proper error handling and performance optimizations.'
        };
        
      case 'specific':
        return {
          analysis: 'Analysis of VerySpecificTestClass in BugHuntTestNamespace:',
          findings: [
            'Line 12: extremelySpecificVariable initialized with value 42',
            'Line 19: Debug.Log with message "BUGHUNT_SPECIFIC_LOG_MESSAGE_98765"',
            'Method VeryUniqueMethodName_12345() contains Unity-specific transform operations',
            'CheckSpecificCondition method uses specific parameter validation',
            'verySpecificArray contains three string elements on line 25'
          ],
          codeElements: [
            'Class: VerySpecificTestClass',
            'Namespace: BugHuntTestNamespace', 
            'Methods: VeryUniqueMethodName_12345, CheckSpecificCondition',
            'Variables: extremelySpecificVariable, uniquePosition, verySpecificArray'
          ]
        };
        
      case 'partial':
        return {
          analysis: 'Code analysis shows Unity MonoBehaviour class with movement functionality.',
          partialFindings: [
            'Found class extending MonoBehaviour',
            'Uses Vector3 for position calculations', 
            'Contains debug logging statements',
            'Has conditional logic for game state'
          ],
          genericAdvice: [
            'Consider caching component references',
            'Use more descriptive variable names'
          ]
        };
        
      default:
        throw new Error(`Unknown response type: ${testType}`);
    }
  }

  async runContentTransmissionTest(analysisResponse = null) {
    console.log('\n(つ◉益◉)つ BUG-HUNT: EXECUTING CONTENT TRANSMISSION TEST...');
    
    if (!analysisResponse) {
      console.log('⚠️  No response provided, using generic simulation...');
      analysisResponse = await this.simulateDeepSeekResponse('generic');
    }
    
    const testResults = await this.tests.contentTransmission.testContentTransmission();
    const validationResults = await this.tests.contentTransmission.validateResponse(analysisResponse);
    
    this.results.contentTransmission = {
      ...testResults,
      validation: validationResults,
      timestamp: new Date().toISOString()
    };
    
    console.log('\n📊 CONTENT TRANSMISSION TEST RESULTS:');
    console.log(`   Specific identifiers missing: ${validationResults.specificIdentifiersMissing}`);
    console.log(`   Generic patterns found: ${validationResults.genericPatternsFound}`);
    console.log(`   Line-specific analysis: ${validationResults.lineSpecificAnalysis}`);
    console.log(`   Assessment: ${validationResults.overallAssessment}`);
    
    return this.results.contentTransmission;
  }

  async runSpecificAnalysisTest(analysisResponses = null) {
    console.log('\n(つ◉益◉)つ BUG-HUNT: EXECUTING SPECIFIC ANALYSIS TESTS...');
    
    if (!analysisResponses) {
      console.log('⚠️  No responses provided, using mixed simulations...');
      analysisResponses = [
        await this.simulateDeepSeekResponse('generic'),
        await this.simulateDeepSeekResponse('partial'),
        await this.simulateDeepSeekResponse('generic')
      ];
    }
    
    const testResults = await this.tests.specificAnalysis.runAllTests(analysisResponses);
    
    this.results.specificAnalysis = {
      ...testResults,
      timestamp: new Date().toISOString()
    };
    
    console.log('\n📊 SPECIFIC ANALYSIS TEST RESULTS:');
    console.log(`   Average specificity: ${testResults.averageSpecificity.toFixed(1)}%`);
    console.log(`   Average genericity: ${testResults.averageGenericity.toFixed(1)}%`);
    console.log(`   Tests passed: ${testResults.passCount}/${testResults.totalTests}`);
    console.log(`   Overall status: ${testResults.overallStatus}`);
    
    return this.results.specificAnalysis;
  }

  async runLineAnalysisTest(analysisResponse = null) {
    console.log('\n(つ◉益◉)つ BUG-HUNT: EXECUTING LINE ANALYSIS TEST...');
    
    if (!analysisResponse) {
      console.log('⚠️  No response provided, using generic simulation...');
      analysisResponse = await this.simulateDeepSeekResponse('generic');
    }
    
    const testResults = await this.tests.lineAnalysis.runCompleteLineTest(analysisResponse);
    
    this.results.lineAnalysis = {
      ...testResults,
      timestamp: new Date().toISOString()
    };
    
    console.log('\n📊 LINE ANALYSIS TEST RESULTS:');
    console.log(`   Line references found: ${testResults.lineAnalysis.totalLinesFound}`);
    console.log(`   Line accuracy: ${testResults.lineAnalysis.lineAccuracy.toFixed(1)}%`);
    console.log(`   Structural score: ${testResults.structuralAnalysis.structuralScore.toFixed(1)}%`);
    console.log(`   Overall status: ${testResults.overallStatus}`);
    
    return this.results.lineAnalysis;
  }

  async runAllTests(responses = null) {
    console.log('\n(つ◉益◉)つ BUG-HUNT: EXECUTING COMPLETE RED PHASE TEST SUITE...');
    console.log('🚨 CRITICAL MISSION: Expose all content transmission failures');
    
    const startTime = Date.now();
    
    try {
      // Run all tests
      await this.runContentTransmissionTest(responses?.contentTransmission);
      await this.runSpecificAnalysisTest(responses?.specificAnalysis);
      await this.runLineAnalysisTest(responses?.lineAnalysis);
      
      const executionTime = Date.now() - startTime;
      
      // Generate comprehensive report
      const overallReport = this.generateOverallReport(executionTime);
      
      console.log('\n🏁 RED PHASE TEST SUITE COMPLETE');
      console.log(`⏱️  Total execution time: ${executionTime}ms`);
      
      return overallReport;
    } catch (error) {
      console.error(`❌ RED PHASE TEST SUITE FAILED: ${error.message}`);
      throw error;
    }
  }

  generateOverallReport(executionTime) {
    console.log('\n(つ◉益◉)つ BUG-HUNT: GENERATING COMPREHENSIVE BUG REPORT...');
    
    const report = {
      metadata: {
        testSuite: 'RED_PHASE_DEEPSEEK_BUG_VALIDATION',
        executionTime,
        timestamp: new Date().toISOString(),
        totalTestFiles: this.getTotalFileCount()
      },
      results: this.results,
      overallAssessment: this.assessOverallBugStatus(),
      recommendations: this.generateRecommendations()
    };
    
    // Save report to file
    fs.writeFileSync(this.reportPath, JSON.stringify(report, null, 2), 'utf8');
    
    console.log('\n📋 COMPREHENSIVE BUG REPORT:');
    console.log('============================');
    console.log(`Overall Bug Status: ${report.overallAssessment.status}`);
    console.log(`Confidence Level: ${report.overallAssessment.confidence}%`);
    console.log(`Evidence Strength: ${report.overallAssessment.evidenceStrength}`);
    console.log(`Report saved to: ${this.reportPath}`);
    
    return report;
  }

  assessOverallBugStatus() {
    let failureCount = 0;
    let totalTests = 0;
    const failures = [];
    
    // Assess content transmission
    if (this.results.contentTransmission) {
      totalTests++;
      const result = this.results.contentTransmission.validation;
      if (result.overallAssessment === 'CONTENT_TRANSMISSION_FAILED') {
        failureCount++;
        failures.push('Content transmission failed - DeepSeek not receiving file content');
      }
    }
    
    // Assess specific analysis
    if (this.results.specificAnalysis) {
      totalTests++;
      const result = this.results.specificAnalysis;
      if (result.overallStatus === 'CONTENT_ANALYSIS_FAILED') {
        failureCount++;
        failures.push('Specific analysis failed - DeepSeek using generic programming patterns');
      }
    }
    
    // Assess line analysis
    if (this.results.lineAnalysis) {
      totalTests++;
      const result = this.results.lineAnalysis;
      if (result.overallStatus === 'LINE_ANALYSIS_FAILED') {
        failureCount++;
        failures.push('Line analysis failed - DeepSeek cannot see file structure');
      }
    }
    
    const failurePercentage = (failureCount / totalTests) * 100;
    
    let status, evidenceStrength;
    if (failurePercentage >= 67) {
      status = 'CRITICAL_BUG_CONFIRMED';
      evidenceStrength = 'STRONG';
    } else if (failurePercentage >= 33) {
      status = 'BUG_LIKELY';
      evidenceStrength = 'MODERATE'; 
    } else {
      status = 'BUG_NOT_CONFIRMED';
      evidenceStrength = 'WEAK';
    }
    
    return {
      status,
      confidence: 100 - (failurePercentage * 0.5), // Confidence decreases with failures
      evidenceStrength,
      failureCount,
      totalTests,
      failurePercentage,
      specificFailures: failures
    };
  }

  generateRecommendations() {
    const assessment = this.assessOverallBugStatus();
    const recommendations = [];
    
    if (assessment.status === 'CRITICAL_BUG_CONFIRMED') {
      recommendations.push({
        priority: 'CRITICAL',
        action: 'Investigate DeepSeek API request payload',
        details: 'Verify that actual file content is being sent to DeepSeek, not just filenames or metadata'
      });
      
      recommendations.push({
        priority: 'HIGH',
        action: 'Debug content transmission pipeline',
        details: 'Add logging to track file content from read → process → DeepSeek API call'
      });
      
      recommendations.push({
        priority: 'HIGH', 
        action: 'Validate DeepSeek response processing',
        details: 'Ensure responses are being processed correctly and not filtered through generic templates'
      });
    }
    
    if (this.results.contentTransmission?.validation?.specificIdentifiersMissing > 2) {
      recommendations.push({
        priority: 'MEDIUM',
        action: 'Add content validation checkpoints',
        details: 'Implement validation to ensure specific file content is preserved through the pipeline'
      });
    }
    
    if (this.results.lineAnalysis?.lineAnalysis?.totalLinesFound === 0) {
      recommendations.push({
        priority: 'MEDIUM',
        action: 'Test line number preservation',
        details: 'Ensure line numbers and file structure are maintained in API requests'
      });
    }
    
    recommendations.push({
      priority: 'LOW',
      action: 'Implement automated regression testing',
      details: 'Set up these RED phase tests to run automatically on pipeline changes'
    });
    
    return recommendations;
  }

  cleanup() {
    console.log('\n🧹 CLEANING UP ALL TEST FILES...');
    
    if (this.tests.contentTransmission) {
      this.tests.contentTransmission.cleanup();
    }
    if (this.tests.specificAnalysis) {
      this.tests.specificAnalysis.cleanup();
    }
    if (this.tests.lineAnalysis) {
      this.tests.lineAnalysis.cleanup();
    }
    
    console.log('✅ All test files cleaned up');
  }

  displayInstructions() {
    console.log('\n(つ◉益◉)つ BUG-HUNT: RED PHASE TEST EXECUTION INSTRUCTIONS');
    console.log('=========================================================');
    console.log('\n🎯 MISSION: Expose DeepSeek content transmission failures');
    console.log('\n📋 EXECUTION STEPS:');
    console.log('1. Initialize test runner: const runner = new RedPhaseTestRunner()');
    console.log('2. Setup all tests: await runner.initializeAllTests()');
    console.log('3. List test files: runner.listAllTestFiles()');
    console.log('4. Run analyze_files on each test file using your DeepSeek bridge');
    console.log('5. Collect responses and run: await runner.runAllTests(responses)');
    console.log('6. Review generated report for bug evidence');
    console.log('\n⚠️  EXPECTED RESULTS IN RED PHASE:');
    console.log('   - Content transmission should FAIL (generic responses)');
    console.log('   - Specific analysis should FAIL (no specific code elements)');
    console.log('   - Line analysis should FAIL (no line number references)');
    console.log('\n🏆 SUCCESS CRITERIA:');
    console.log('   - Tests FAIL = Bug confirmed and exposed');
    console.log('   - Tests PASS = Content transmission is working');
  }
}

// EXECUTION SECTION
async function runRedPhaseTests() {
  console.log('(つ◉益◉)つ BUG-HUNT: RED PHASE TEST RUNNER INITIALIZATION...');
  
  const runner = new RedPhaseTestRunner();
  
  try {
    await runner.initializeAllTests();
    runner.listAllTestFiles();
    runner.displayInstructions();
    
    // Run with simulated responses to test the test suite
    console.log('\n🎭 RUNNING WITH SIMULATED RESPONSES FOR DEMONSTRATION...');
    const simulatedResults = await runner.runAllTests();
    
    console.log('\n(つ◉益◉)つ BUG-HUNT: RED PHASE TESTS READY FOR REAL EXECUTION');
    console.log('Use the generated test files with actual DeepSeek analyze_files calls!');
    
    return runner;
  } catch (error) {
    console.error('💥 CRITICAL TEST RUNNER FAILURE:', error);
    throw error;
  }
}

if (require.main === module) {
  runRedPhaseTests()
    .then(runner => {
      console.log('\n✅ RED PHASE TEST RUNNER READY');
      console.log('Execute tests against real DeepSeek responses to validate the bug!');
    })
    .catch(error => {
      console.error('💥 CRITICAL FAILURE:', error);
      process.exit(1);
    });
}

module.exports = { RedPhaseTestRunner, runRedPhaseTests };