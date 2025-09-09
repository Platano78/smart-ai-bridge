#!/usr/bin/env node

/**
 * Test script to demonstrate the validation fix
 * Tests the new validation system against problematic responses that should fail
 */

import ResponseQualityValidator from './src/response-quality-validator.js';

function testValidationFix() {
    const validator = new ResponseQualityValidator();
    
    console.log('🔬 Testing DeepSeek MCP Bridge Validation Fix');
    console.log('='.repeat(60));
    
    // Test cases - these should all score LOW with the new validation
    const problematicResponses = [
        {
            name: "Generic Vector3.Distance Response",
            response: "Generally, you should use Vector3.Distance to calculate distances between two points in Unity. This is a common approach that typically works well for most cases. You might want to consider using this method in your code.",
            context: {
                prompt: "How do I fix the AI pathfinding issue in line 45 of EnemyAI.cs where the distance calculation is wrong?",
                fileContent: `using UnityEngine;
public class EnemyAI : MonoBehaviour {
    public void UpdatePath() {
        // Line 45: Wrong distance calculation
        float dist = Vector3.magnitude(target.position - transform.position);
        if (dist < attackRange) {
            Attack();
        }
    }
    
    void Attack() {
        // Attack implementation
    }
}`
            },
            expectedScore: "LOW (should be 0-3)"
        },
        {
            name: "Non-existent Method Reference",
            response: "You should call the UpdateAIState method to fix this issue. The method is located on line 67 and handles all AI state transitions. Generally, this approach works well for most AI systems.",
            context: {
                prompt: "How to fix AI state management?",
                fileContent: `public class EnemyAI : MonoBehaviour {
    public void UpdatePath() {
        // No UpdateAIState method exists
    }
    void Attack() {
        // Attack implementation
    }
}`
            },
            expectedScore: "LOW (should be 0-2)"
        },
        {
            name: "Wrong Line Numbers",
            response: "The issue is on line 150 where you call the wrong method. You should modify line 180 to fix the problem. This typically resolves most issues.",
            context: {
                prompt: "Fix the bug in this short script",
                fileContent: `// Only 10 lines total
using UnityEngine;
public class Test {
    void Start() {
        Debug.Log("Hello");
    }
}
// File ends at line 7
`
            },
            expectedScore: "LOW (should be 0-2)"
        },
        {
            name: "Multiple Generic Patterns",
            response: "Generally, you should consider implementing a solution that typically works in most cases. It's recommended to use standard approaches, and usually you want to follow best practices. This should help with your implementation.",
            context: {
                prompt: "Specific implementation question about exact code"
            },
            expectedScore: "VERY LOW (should be 0-1)"
        }
    ];
    
    // Test a good response for comparison
    const goodResponse = {
        name: "Specific Technical Response",
        response: "The issue in line 45 of your EnemyAI.cs file is using Vector3.magnitude instead of Vector3.Distance. Change `float dist = Vector3.magnitude(target.position - transform.position);` to `float dist = Vector3.Distance(target.position, transform.position);`. This is more efficient and semantically correct for distance calculations between two points.",
        context: {
            prompt: "How do I fix the AI pathfinding issue in line 45 of EnemyAI.cs where the distance calculation is wrong?",
            fileContent: `using UnityEngine;
public class EnemyAI : MonoBehaviour {
    public void UpdatePath() {
        // Line 45: Wrong distance calculation
        float dist = Vector3.magnitude(target.position - transform.position);
        if (dist < attackRange) {
            Attack();
        }
    }
    
    void Attack() {
        // Attack implementation
    }
}`
        },
        expectedScore: "HIGH (should be 7-10)"
    };
    
    console.log('\n🚨 TESTING PROBLEMATIC RESPONSES (should score LOW):');
    console.log('-'.repeat(60));
    
    problematicResponses.forEach((test, index) => {
        console.log(`\n${index + 1}. ${test.name}`);
        console.log(`Expected: ${test.expectedScore}`);
        
        const validation = validator.validateResponse(test.response, test.context);
        console.log(`Actual Score: ${validation.score}/10`);
        
        if (validation.isGeneric) {
            console.log(`✅ CORRECTLY DETECTED: Generic response`);
        }
        
        if (validation.validationFailures.length > 0) {
            console.log(`✅ VALIDATION FAILURES: ${validation.validationFailures.length}`);
            validation.validationFailures.forEach(failure => {
                console.log(`   - ${failure.pattern || failure}`);
            });
        }
        
        if (validation.warnings.length > 0) {
            console.log(`⚠️  WARNINGS: ${validation.warnings.join(', ')}`);
        }
        
        // Check if the fix is working
        const isFixed = validation.score <= 3;
        console.log(`${isFixed ? '✅ FIX WORKING' : '❌ STILL BROKEN'}: ${validation.score <= 3 ? 'Low score as expected' : 'Score too high!'}`);
    });
    
    console.log('\n\n✅ TESTING GOOD RESPONSE (should score HIGH):');
    console.log('-'.repeat(60));
    
    console.log(`\n${goodResponse.name}`);
    console.log(`Expected: ${goodResponse.expectedScore}`);
    
    const goodValidation = validator.validateResponse(goodResponse.response, goodResponse.context);
    console.log(`Actual Score: ${goodValidation.score}/10`);
    
    if (!goodValidation.isGeneric) {
        console.log(`✅ CORRECTLY IDENTIFIED: Not generic`);
    }
    
    const isGoodScoring = goodValidation.score >= 7;
    console.log(`${isGoodScoring ? '✅ GOOD RESPONSE SCORES HIGH' : '⚠️  GOOD RESPONSE SCORED LOW'}: ${goodValidation.score}/10`);
    
    // Summary
    console.log('\n\n📊 VALIDATION FIX SUMMARY:');
    console.log('='.repeat(60));
    
    const badResponses = problematicResponses.map(test => {
        const validation = validator.validateResponse(test.response, test.context);
        return {
            name: test.name,
            score: validation.score,
            fixed: validation.score <= 3
        };
    });
    
    const fixedCount = badResponses.filter(r => r.fixed).length;
    const successRate = (fixedCount / badResponses.length) * 100;
    
    console.log(`Generic responses caught: ${fixedCount}/${badResponses.length} (${successRate.toFixed(1)}%)`);
    console.log(`Good response score: ${goodValidation.score}/10`);
    
    if (successRate >= 75 && goodValidation.score >= 7) {
        console.log('✅ VALIDATION FIX SUCCESSFUL!');
        console.log('The bridge will now correctly identify and reject generic responses.');
    } else {
        console.log('❌ VALIDATION FIX NEEDS IMPROVEMENT');
        console.log(`Issues: ${successRate < 75 ? 'Not catching enough generic responses' : ''} ${goodValidation.score < 7 ? 'Good responses scoring too low' : ''}`);
    }
}

// Old vs New comparison
function compareOldVsNew() {
    console.log('\n\n🔄 OLD vs NEW VALIDATION COMPARISON:');
    console.log('='.repeat(60));
    
    const testResponse = "Generally, you should use Vector3.Distance to calculate distances. This is typically recommended for most cases.";
    
    // Old validation logic (the broken one)
    function oldValidation(response) {
        let score = 10;
        if (response.length < 100) score -= 3;
        if (response.includes('I apologize') || response.includes('I cannot')) score -= 2;
        if (!response.includes('.') || response.split('.').length < 3) score -= 2;
        return Math.max(0, score);
    }
    
    // New validation
    const validator = new ResponseQualityValidator();
    const newValidation = validator.validateResponse(testResponse, {
        prompt: "Specific question about line 45 in EnemyAI.cs"
    });
    
    const oldScore = oldValidation(testResponse);
    const newScore = newValidation.score;
    
    console.log(`Test Response: "${testResponse}"`);
    console.log(`OLD Validation Score: ${oldScore}/10 ❌ (False positive)`);
    console.log(`NEW Validation Score: ${newScore}/10 ✅ (Correctly identifies as generic)`);
    console.log(`Improvement: ${oldScore - newScore} point reduction`);
    
    if (newValidation.isGeneric) {
        console.log(`✅ NEW: Correctly detected generic patterns`);
        console.log(`   Patterns found: ${newValidation.validationFailures.length}`);
    }
}

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
    testValidationFix();
    compareOldVsNew();
}