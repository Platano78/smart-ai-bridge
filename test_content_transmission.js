// (つ◉益◉)つ BUG-HUNT: CRITICAL TEST - Content Transmission Validation
// RED PHASE TEST: Validates that DeepSeek receives actual file content, not just filenames
// MISSION: This test MUST FAIL if DeepSeek only receives generic programming context

const fs = require('fs');
const path = require('path');
const assert = require('assert');

class ContentTransmissionTest {
  constructor() {
    this.testDir = path.join(__dirname, 'test_data');
    this.testFile = path.join(this.testDir, 'specific_test_code.cs');
    this.specificContent = null;
  }

  async setup() {
    // Create test directory if it doesn't exist
    if (!fs.existsSync(this.testDir)) {
      fs.mkdirSync(this.testDir, { recursive: true });
    }

    // Create a C# test file with HIGHLY SPECIFIC identifiable content
    this.specificContent = `using UnityEngine;
using System.Collections.Generic;

namespace BugHuntTestNamespace
{
    public class VerySpecificTestClass : MonoBehaviour
    {
        // ULTRA-SPECIFIC METHOD NAME - Should trigger specific analysis
        public void VeryUniqueMethodName_12345()
        {
            // Line 12: SPECIFIC variable with distinctive name
            int extremelySpecificVariable = 42;
            
            // Line 14: SPECIFIC Unity method call pattern
            Vector3 uniquePosition = Vector3.zero;
            
            // Line 16: SPECIFIC conditional with unique values
            if (extremelySpecificVariable == 42)
            {
                // Line 19: SPECIFIC Debug log with identifiable message
                Debug.Log("BUGHUNT_SPECIFIC_LOG_MESSAGE_98765");
                
                // Line 21: SPECIFIC method call chain
                transform.SetPositionAndRotation(uniquePosition, Quaternion.identity);
            }
            
            // Line 25: SPECIFIC array initialization
            string[] verySpecificArray = {"ITEM_ONE", "ITEM_TWO", "ITEM_THREE"};
        }
        
        // Line 29: ANOTHER specific method with unique signature
        private bool CheckSpecificCondition(int specificParam, string anotherSpecificParam)
        {
            return specificParam > 10 && anotherSpecificParam.Contains("SPECIFIC");
        }
    }
}`;

    fs.writeFileSync(this.testFile, this.specificContent, 'utf8');
    console.log(`✅ Created test file: ${this.testFile}`);
  }

  async testContentTransmission() {
    console.log('\n(つ◉益◉)つ BUG-HUNT: EXECUTING CONTENT TRANSMISSION TEST...');
    
    // Import the server's analyze_files functionality
    let bridge;
    try {
      // Try to load the bridge from server.js
      const serverPath = path.join(__dirname, 'server.js');
      if (fs.existsSync(serverPath)) {
        // This is a simplified test - in reality we'd need to mock the DeepSeek API
        console.log('⚠️  NOTE: This is a RED PHASE test - designed to expose transmission issues');
        console.log('    Real implementation would require mocking DeepSeek API responses');
      }
    } catch (error) {
      console.log(`⚠️  Could not load bridge: ${error.message}`);
    }

    // CRITICAL TEST: Validate that analysis would identify specific elements
    const requiredIdentifications = [
      'VerySpecificTestClass',
      'VeryUniqueMethodName_12345', 
      'extremelySpecificVariable',
      'BUGHUNT_SPECIFIC_LOG_MESSAGE_98765',
      'BugHuntTestNamespace',
      'CheckSpecificCondition',
      'specificParam',
      'verySpecificArray'
    ];

    console.log('\n🎯 REQUIRED IDENTIFICATIONS (for content transmission validation):');
    requiredIdentifications.forEach((item, index) => {
      console.log(`   ${index + 1}. ${item}`);
    });

    // SIMULATION: What DeepSeek response should contain if content is transmitted
    const expectedSpecificAnalysis = {
      identifiedClasses: ['VerySpecificTestClass'],
      identifiedMethods: ['VeryUniqueMethodName_12345', 'CheckSpecificCondition'],
      identifiedVariables: ['extremelySpecificVariable', 'uniquePosition', 'verySpecificArray'],
      identifiedNamespace: 'BugHuntTestNamespace',
      identifiedLogMessages: ['BUGHUNT_SPECIFIC_LOG_MESSAGE_98765'],
      lineNumbers: {
        'extremelySpecificVariable': 12,
        'BUGHUNT_SPECIFIC_LOG_MESSAGE_98765': 19,
        'verySpecificArray': 25
      }
    };

    // SIMULATION: What generic response would look like (THE BUG)
    const genericResponse = {
      suggestions: [
        'Use Vector3.Distance for distance calculations',
        'Consider using object pooling for performance',
        'Make sure to null-check your references',
        'Use SerializeField for inspector variables'
      ],
      generalAdvice: 'This appears to be Unity C# code. Consider following Unity coding conventions.'
    };

    console.log('\n✅ EXPECTED SPECIFIC ANALYSIS (if content transmitted):');
    console.log(JSON.stringify(expectedSpecificAnalysis, null, 2));

    console.log('\n❌ GENERIC RESPONSE PATTERN (indicates bug):');
    console.log(JSON.stringify(genericResponse, null, 2));

    return {
      testFile: this.testFile,
      requiredIdentifications,
      expectedSpecificAnalysis,
      genericResponsePattern: genericResponse
    };
  }

  async validateResponse(response) {
    console.log('\n(つ◉益◉)つ BUG-HUNT: VALIDATING RESPONSE FOR CONTENT TRANSMISSION...');
    
    const failures = [];
    const responseText = typeof response === 'string' ? response : JSON.stringify(response);
    
    // Test 1: Check for specific identifiers from our test file
    const requiredIdentifications = [
      'VerySpecificTestClass',
      'VeryUniqueMethodName_12345', 
      'extremelySpecificVariable',
      'BUGHUNT_SPECIFIC_LOG_MESSAGE_98765'
    ];

    for (const identifier of requiredIdentifications) {
      if (!responseText.includes(identifier)) {
        failures.push(`Missing specific identifier: ${identifier}`);
      }
    }

    // Test 2: Check for generic programming advice (indicates bug)
    const genericPatterns = [
      'Vector3.Distance',
      'object pooling',
      'Unity coding conventions',
      'SerializeField',
      'null-check'
    ];

    let genericCount = 0;
    for (const pattern of genericPatterns) {
      if (responseText.toLowerCase().includes(pattern.toLowerCase())) {
        genericCount++;
      }
    }

    // Test 3: Line number specificity
    const lineNumbers = ['12', '19', '25'];
    let lineNumberCount = 0;
    for (const lineNum of lineNumbers) {
      if (responseText.includes(`line ${lineNum}`) || responseText.includes(`Line ${lineNum}`)) {
        lineNumberCount++;
      }
    }

    // FAILURE CONDITIONS (what we expect in RED phase)
    if (failures.length > 2) {
      console.log(`❌ CONTENT TRANSMISSION FAILURE: ${failures.length} specific identifiers missing`);
      console.log('   This indicates DeepSeek is NOT receiving actual file content');
    }

    if (genericCount > 2) {
      console.log(`❌ GENERIC RESPONSE DETECTED: ${genericCount} generic patterns found`);
      console.log('   This indicates DeepSeek is using generic programming knowledge instead of analyzing content');
    }

    if (lineNumberCount === 0) {
      console.log(`❌ NO LINE-SPECIFIC ANALYSIS: No specific line numbers referenced`);
      console.log('   This indicates DeepSeek cannot see actual file structure');
    }

    return {
      specificIdentifiersMissing: failures.length,
      genericPatternsFound: genericCount,
      lineSpecificAnalysis: lineNumberCount,
      overallAssessment: failures.length > 2 ? 'CONTENT_TRANSMISSION_FAILED' : 'CONTENT_TRANSMITTED',
      failures
    };
  }

  cleanup() {
    if (fs.existsSync(this.testFile)) {
      fs.unlinkSync(this.testFile);
      console.log(`🧹 Cleaned up test file: ${this.testFile}`);
    }
    if (fs.existsSync(this.testDir)) {
      fs.rmdirSync(this.testDir);
      console.log(`🧹 Cleaned up test directory: ${this.testDir}`);
    }
  }
}

// EXECUTION SECTION
async function runContentTransmissionTest() {
  console.log('(つ◉益◉)つ BUG-HUNT: RED PHASE TEST EXECUTION STARTING...');
  console.log('🎯 MISSION: Expose content transmission failures in DeepSeek analysis pipeline');
  
  const test = new ContentTransmissionTest();
  
  try {
    await test.setup();
    const results = await test.testContentTransmission();
    
    console.log('\n📊 TEST RESULTS:');
    console.log('===============');
    console.log(`Test File Created: ${results.testFile}`);
    console.log(`Required Identifications: ${results.requiredIdentifications.length}`);
    console.log('');
    console.log('⚠️  TO COMPLETE THIS TEST:');
    console.log('   1. Run analyze_files on the generated test file');
    console.log('   2. Pass the response to test.validateResponse(response)');
    console.log('   3. Check for content transmission vs generic response patterns');
    
    return results;
  } catch (error) {
    console.error(`❌ TEST EXECUTION FAILED: ${error.message}`);
    throw error;
  } finally {
    // Comment out cleanup for now so file persists for manual testing
    // test.cleanup();
  }
}

if (require.main === module) {
  runContentTransmissionTest()
    .then(results => {
      console.log('\n(つ◉益◉)つ BUG-HUNT: CONTENT TRANSMISSION TEST READY');
      console.log('Use the generated test file to validate DeepSeek content analysis!');
    })
    .catch(error => {
      console.error('💥 CRITICAL TEST FAILURE:', error);
      process.exit(1);
    });
}

module.exports = { ContentTransmissionTest, runContentTransmissionTest };