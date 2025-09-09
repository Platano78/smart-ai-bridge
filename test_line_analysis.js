// (つ◉益◉)つ BUG-HUNT: LINE-BY-LINE ANALYSIS VALIDATION TEST
// RED PHASE TEST: Validates DeepSeek can reference specific line numbers and code structure
// MISSION: This test MUST FAIL if DeepSeek cannot see actual file line structure

const fs = require('fs');
const path = require('path');

class LineAnalysisTest {
  constructor() {
    this.testDir = path.join(__dirname, 'test_data');
    this.testFile = path.join(this.testDir, 'line_specific_test.cs');
    this.lineMap = {};
  }

  async setup() {
    if (!fs.existsSync(this.testDir)) {
      fs.mkdirSync(this.testDir, { recursive: true });
    }

    await this.createLineSpecificTestFile();
  }

  async createLineSpecificTestFile() {
    // Create a file with very specific line-by-line patterns
    const lines = [
      '// Line 1: File header comment',
      'using UnityEngine;',
      'using System.Collections;',
      '',
      '// Line 5: Class declaration comment', 
      'public class LineTestClass : MonoBehaviour',
      '{',
      '    // Line 8: Field declarations section',
      '    public float speedValue = 10.0f;',
      '    private bool isActive = false;',
      '    public string playerName = "TestPlayer";',
      '',
      '    // Line 13: Critical method starts here',
      '    void Start()',
      '    {',
      '        // Line 16: Initialization logic',
      '        Debug.Log("INITIALIZATION_START_LINE_16");',
      '        speedValue = CalculateSpeed();',
      '        isActive = true;',
      '    }',
      '',
      '    // Line 22: Update method with specific logic',
      '    void Update()',
      '    {',
      '        // Line 25: Condition check',
      '        if (isActive && speedValue > 5.0f)',
      '        {',
      '            // Line 28: Transform operation',
      '            transform.Translate(Vector3.forward * speedValue * Time.deltaTime);',
      '            Debug.Log($"MOVING_AT_SPEED_{speedValue}_LINE_28");',
      '        }',
      '        // Line 31: Alternative condition',
      '        else if (speedValue <= 0)',
      '        {',
      '            Debug.LogWarning("ZERO_SPEED_WARNING_LINE_34");',
      '        }',
      '    }',
      '',
      '    // Line 38: Utility method',
      '    private float CalculateSpeed()',
      '    {',
      '        // Line 41: Complex calculation',
      '        float baseSpeed = 5.0f;',
      '        float multiplier = Random.Range(0.8f, 2.0f);',
      '        // Line 44: Return statement',
      '        return baseSpeed * multiplier;',
      '    }',
      '',
      '    // Line 48: Event handler method',
      '    public void OnCollisionEnter(Collision collision)',
      '    {',
      '        // Line 51: Specific collision logic',
      '        if (collision.gameObject.tag == "Enemy")',
      '        {',
      '            Debug.LogError("ENEMY_COLLISION_LINE_53");',
      '            speedValue = 0;',
      '            // Line 56: Disable functionality',
      '            isActive = false;',
      '        }',
      '    }',
      '}',
      '// Line 61: End of file marker'
    ];

    const content = lines.join('\n');
    fs.writeFileSync(this.testFile, content, 'utf8');

    // Build line mapping for validation
    this.lineMap = {
      1: 'File header comment',
      5: 'Class declaration comment',
      6: 'public class LineTestClass : MonoBehaviour',
      8: 'Field declarations section',
      9: 'speedValue = 10.0f',
      10: 'isActive = false', 
      11: 'playerName = "TestPlayer"',
      13: 'Critical method starts here',
      14: 'void Start()',
      16: 'Initialization logic',
      17: 'Debug.Log("INITIALIZATION_START_LINE_16")',
      18: 'speedValue = CalculateSpeed()',
      22: 'Update method with specific logic',
      23: 'void Update()',
      25: 'if (isActive && speedValue > 5.0f)',
      28: 'transform.Translate(Vector3.forward * speedValue * Time.deltaTime)',
      29: 'Debug.Log($"MOVING_AT_SPEED_{speedValue}_LINE_28")',
      31: 'Alternative condition',
      32: 'else if (speedValue <= 0)',
      34: 'Debug.LogWarning("ZERO_SPEED_WARNING_LINE_34")',
      38: 'Utility method',
      39: 'private float CalculateSpeed()',
      41: 'Complex calculation',
      42: 'float baseSpeed = 5.0f',
      43: 'float multiplier = Random.Range(0.8f, 2.0f)',
      44: 'return baseSpeed * multiplier',
      48: 'Event handler method',
      49: 'public void OnCollisionEnter(Collision collision)',
      51: 'Specific collision logic',
      52: 'if (collision.gameObject.tag == "Enemy")',
      53: 'Debug.LogError("ENEMY_COLLISION_LINE_53")',
      56: 'isActive = false',
      61: 'End of file marker'
    };

    console.log(`✅ Created line-specific test file: ${this.testFile}`);
    console.log(`📊 Total lines: ${lines.length}, Mapped lines: ${Object.keys(this.lineMap).length}`);
  }

  async testLineAnalysis(analysisResponse) {
    console.log('\n(つ◉益◉)つ BUG-HUNT: TESTING LINE-BY-LINE ANALYSIS CAPABILITY...');
    
    const responseText = typeof analysisResponse === 'string' ? analysisResponse : JSON.stringify(analysisResponse);
    const results = {
      lineReferencesFound: [],
      specificLineContent: [],
      criticalLineMisses: [],
      lineAccuracy: 0,
      contentAccuracy: 0
    };

    // Test 1: Check for line number references
    const lineNumberPatterns = [
      /line\s+(\d+)/gi,
      /Line\s+(\d+)/g,
      /at\s+line\s+(\d+)/gi,
      /on\s+line\s+(\d+)/gi,
      /:(\d+):/g  // Common format like "file.cs:25:"
    ];

    const foundLineNumbers = new Set();
    
    for (const pattern of lineNumberPatterns) {
      let match;
      while ((match = pattern.exec(responseText)) !== null) {
        const lineNum = parseInt(match[1]);
        if (lineNum >= 1 && lineNum <= 61) { // Valid line range
          foundLineNumbers.add(lineNum);
          results.lineReferencesFound.push({
            line: lineNum,
            context: match[0],
            fullMatch: responseText.substr(Math.max(0, match.index - 50), 100)
          });
        }
      }
    }

    console.log(`📍 Line number references found: ${foundLineNumbers.size}`);

    // Test 2: Check for specific line content mentions
    const criticalLines = [16, 17, 28, 29, 34, 53]; // Lines with specific debug messages
    const criticalContent = [
      'INITIALIZATION_START_LINE_16',
      'MOVING_AT_SPEED_',
      'ZERO_SPEED_WARNING_LINE_34', 
      'ENEMY_COLLISION_LINE_53'
    ];

    let contentMatches = 0;
    for (const content of criticalContent) {
      if (responseText.includes(content)) {
        contentMatches++;
        results.specificLineContent.push(content);
        console.log(`   ✅ Found specific content: ${content}`);
      } else {
        console.log(`   ❌ Missing specific content: ${content}`);
      }
    }

    // Test 3: Validate line accuracy
    let accurateReferences = 0;
    for (const lineRef of results.lineReferencesFound) {
      const lineNum = lineRef.line;
      if (this.lineMap[lineNum]) {
        // Check if the context mentions something related to that line
        const expectedContent = this.lineMap[lineNum].toLowerCase();
        const contextLower = lineRef.fullMatch.toLowerCase();
        
        // Simple keyword matching
        const keywords = expectedContent.match(/\w+/g) || [];
        let keywordMatches = 0;
        for (const keyword of keywords) {
          if (contextLower.includes(keyword)) {
            keywordMatches++;
          }
        }
        
        if (keywordMatches >= Math.ceil(keywords.length * 0.4)) {
          accurateReferences++;
          console.log(`   ✅ Accurate line ${lineNum} reference: ${expectedContent}`);
        } else {
          console.log(`   ⚠️  Inaccurate line ${lineNum} reference`);
        }
      }
    }

    // Test 4: Check for critical line misses
    const criticalMisses = criticalLines.filter(lineNum => !foundLineNumbers.has(lineNum));
    results.criticalLineMisses = criticalMisses;

    // Calculate scores
    results.lineAccuracy = foundLineNumbers.size > 0 ? (accurateReferences / foundLineNumbers.size) * 100 : 0;
    results.contentAccuracy = (contentMatches / criticalContent.length) * 100;

    console.log(`\n📊 LINE ANALYSIS RESULTS:`);
    console.log(`   Line References Found: ${foundLineNumbers.size}`);
    console.log(`   Accurate References: ${accurateReferences}`);
    console.log(`   Line Accuracy: ${results.lineAccuracy.toFixed(1)}%`);
    console.log(`   Content Accuracy: ${results.contentAccuracy.toFixed(1)}%`);
    console.log(`   Critical Lines Missed: ${results.criticalLineMisses.length}`);

    // FAILURE CONDITIONS (expected in RED phase)
    let analysisCapability = 'UNKNOWN';
    if (foundLineNumbers.size === 0) {
      analysisCapability = 'NO_LINE_ANALYSIS';
      console.log('   ❌ CRITICAL: No line number references found - cannot see file structure');
    } else if (results.lineAccuracy < 30) {
      analysisCapability = 'INACCURATE_LINE_ANALYSIS';
      console.log('   ❌ CRITICAL: Low line accuracy - seeing wrong content for line numbers');
    } else if (results.contentAccuracy < 50) {
      analysisCapability = 'MISSING_SPECIFIC_CONTENT';
      console.log('   ⚠️  WARNING: Missing specific line content - may be getting generic advice');
    } else {
      analysisCapability = 'GOOD_LINE_ANALYSIS';
      console.log('   ✅ SUCCESS: Good line-by-line analysis capability');
    }

    return {
      ...results,
      totalLinesFound: foundLineNumbers.size,
      accurateReferences,
      analysisCapability,
      overallAssessment: foundLineNumbers.size > 3 && results.lineAccuracy > 50 ? 'PASS' : 'FAIL'
    };
  }

  async testStructuralAwareness(analysisResponse) {
    console.log('\n(つ◉益◉)つ BUG-HUNT: TESTING STRUCTURAL AWARENESS...');
    
    const responseText = typeof analysisResponse === 'string' ? analysisResponse : JSON.stringify(analysisResponse);
    
    const structuralElements = [
      { element: 'class declaration', expected: 'LineTestClass', lineRange: [6, 6] },
      { element: 'Start method', expected: 'void Start()', lineRange: [14, 19] },
      { element: 'Update method', expected: 'void Update()', lineRange: [23, 35] },
      { element: 'CalculateSpeed method', expected: 'CalculateSpeed', lineRange: [39, 45] },
      { element: 'OnCollisionEnter method', expected: 'OnCollisionEnter', lineRange: [49, 58] },
      { element: 'field declarations', expected: 'speedValue', lineRange: [9, 11] }
    ];

    let structuralMatches = 0;
    const foundStructures = [];

    for (const structure of structuralElements) {
      if (responseText.includes(structure.expected)) {
        structuralMatches++;
        foundStructures.push(structure.element);
        console.log(`   ✅ Found structural element: ${structure.element}`);
        
        // Check if line range is mentioned
        const hasLineRange = structure.lineRange.some(lineNum => 
          responseText.includes(`line ${lineNum}`) || responseText.includes(`Line ${lineNum}`)
        );
        
        if (hasLineRange) {
          console.log(`      💡 Includes line number context`);
        }
      } else {
        console.log(`   ❌ Missing structural element: ${structure.element}`);
      }
    }

    const structuralScore = (structuralMatches / structuralElements.length) * 100;
    
    console.log(`\n📐 STRUCTURAL AWARENESS RESULTS:`);
    console.log(`   Structural Elements Found: ${structuralMatches}/${structuralElements.length}`);
    console.log(`   Structural Awareness Score: ${structuralScore.toFixed(1)}%`);

    return {
      structuralMatches,
      totalStructures: structuralElements.length,
      foundStructures,
      structuralScore,
      hasStructuralAwareness: structuralScore > 60
    };
  }

  displayLineMap() {
    console.log('\n📋 LINE MAP FOR REFERENCE:');
    console.log('==========================');
    for (const [lineNum, content] of Object.entries(this.lineMap)) {
      console.log(`   Line ${lineNum.padStart(2)}: ${content}`);
    }
  }

  async runCompleteLineTest(analysisResponse) {
    console.log('\n(つ◉益◉)つ BUG-HUNT: RUNNING COMPLETE LINE ANALYSIS TEST...');
    
    const lineResults = await this.testLineAnalysis(analysisResponse);
    const structuralResults = await this.testStructuralAwareness(analysisResponse);
    
    const overallScore = (lineResults.lineAccuracy * 0.6) + (structuralResults.structuralScore * 0.4);
    const overallStatus = overallScore > 50 ? 'LINE_ANALYSIS_WORKING' : 'LINE_ANALYSIS_FAILED';
    
    console.log(`\n🏁 COMPLETE LINE ANALYSIS RESULTS:`);
    console.log(`   Overall Score: ${overallScore.toFixed(1)}%`);
    console.log(`   Status: ${overallStatus}`);
    
    return {
      lineAnalysis: lineResults,
      structuralAnalysis: structuralResults,
      overallScore,
      overallStatus,
      testFile: this.testFile
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

// EXECUTION
async function runLineAnalysisTest() {
  console.log('(つ◉益◉)つ BUG-HUNT: LINE ANALYSIS TEST INITIALIZATION...');
  
  const test = new LineAnalysisTest();
  
  try {
    await test.setup();
    test.displayLineMap();
    
    console.log('\n⚠️  TO COMPLETE THIS TEST:');
    console.log('   1. Run analyze_files on the generated line-specific test file');
    console.log('   2. Pass the response to test.runCompleteLineTest(response)');
    console.log('   3. Check for line number references and structural awareness');
    console.log('   4. Validate that analysis can see specific line content vs generic patterns');
    
    return test;
  } catch (error) {
    console.error(`❌ TEST SETUP FAILED: ${error.message}`);
    throw error;
  }
}

if (require.main === module) {
  runLineAnalysisTest()
    .then(test => {
      console.log('\n(つ◉益◉)つ BUG-HUNT: LINE ANALYSIS TEST READY');
      console.log('Use the generated test file to validate DeepSeek line-by-line analysis!');
    })
    .catch(error => {
      console.error('💥 CRITICAL TEST FAILURE:', error);
      process.exit(1);
    });
}

module.exports = { LineAnalysisTest, runLineAnalysisTest };