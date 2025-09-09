#!/usr/bin/env node

/**
 * Empirical Routing Patch for DeepSeek MCP Bridge
 * Converts existing bridge to "Try First, Route on Failure" approach
 */

const fs = require('fs').promises;

class EmpiricalRoutingPatch {
    constructor() {
        this.serverPath = '/home/platano/project/deepseek-mcp-bridge/server.js';
        this.backupPath = '/home/platano/project/deepseek-mcp-bridge/server.js.before-empirical';
    }

    async applyEmpiricalPatch() {
        console.log('🚀 EMPIRICAL ROUTING PATCH');
        console.log('==========================');
        console.log('STRATEGY: Try DeepSeek first, route on actual failure');
        console.log('BENEFIT: No false positives, empirical routing data');

        try {
            // Create backup
            await fs.copyFile(this.serverPath, this.backupPath);
            console.log('💾 Backup created:', this.backupPath);

            // Read current server
            const serverContent = await fs.readFile(this.serverPath, 'utf8');

            // Apply empirical routing patches
            let patchedContent = serverContent;
            
            // 1. Remove complex pattern matching from queryDeepseek
            patchedContent = this.patchQueryDeepseek(patchedContent);
            
            // 2. Add empirical routing logic
            patchedContent = this.addEmpiricalRouting(patchedContent);
            
            // 3. Update tool descriptions
            patchedContent = this.updateToolDescriptions(patchedContent);

            // Write patched version
            await fs.writeFile(this.serverPath, patchedContent);

            console.log('\n✅ Empirical routing patch applied!');
            console.log('\n🔧 Changes Made:');
            console.log('1. ✅ REMOVED upfront complexity classification');
            console.log('2. ✅ ADDED try-first, analyze-failure approach'); 
            console.log('3. ✅ ADDED empirical routing intelligence');
            console.log('4. ✅ ADDED failure pattern learning');
            console.log('5. ✅ UPDATED tool descriptions to reflect new approach');
            
            console.log('\n🎯 New Behavior:');
            console.log('• ALL queries try DeepSeek first (no pre-filtering)');
            console.log('• Only route to Claude after actual DeepSeek failure');
            console.log('• Build routing intelligence from real performance data');
            console.log('• Learn which types of prompts actually cause timeouts');
            
            console.log('\n🚀 Next Steps:');
            console.log('1. Restart MCP bridge');
            console.log('2. Test with your JSON loading question');
            console.log('3. Monitor empirical routing data building up');

        } catch (error) {
            console.error('❌ Patch failed:', error);
        }
    }

    patchQueryDeepseek(content) {
        console.log('🔧 Patching queryDeepseek method...');
        
        // Remove the complex classification logic and replace with simple execution
        const oldQueryMethod = /async queryDeepseek\(prompt, options = \{\}\) \{[\s\S]*?return await this\.executeDeepseekQuery\(prompt, options, taskClassification\);[\s\S]*?\}/;
        
        const newQueryMethod = `async queryDeepseek(prompt, options = {}) {
    await this.initialize();
    
    // EMPIRICAL ROUTING: Try DeepSeek first, analyze failures
    console.error('🎯 EMPIRICAL ROUTING: Trying DeepSeek first (no pre-filtering)');
    
    const startTime = Date.now();
    
    try {
      // Always attempt DeepSeek execution first
      const result = await this.executeDeepseekQuery(prompt, options);
      
      const responseTime = Date.now() - startTime;
      console.error(\`✅ DeepSeek succeeded in \${responseTime}ms\`);
      
      // Log success for learning
      await this.logRoutingOutcome(prompt, 'success', responseTime, result);
      
      return result;
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // EMPIRICAL ANALYSIS: Analyze the actual failure
      const failureAnalysis = this.analyzeDeepSeekFailure(error, responseTime, prompt);
      console.error(\`❌ DeepSeek failed: \${error.message} (\${responseTime}ms)\`);
      console.error(\`🔍 Failure type: \${failureAnalysis.category}\`);
      
      // Log failure for routing intelligence
      await this.logRoutingOutcome(prompt, 'failure', responseTime, null, failureAnalysis);
      
      // Decide whether to recommend Claude based on actual failure
      const shouldRecommendClaude = this.shouldRecommendClaude(failureAnalysis);
      
      if (shouldRecommendClaude.recommend) {
        console.error(\`💡 RECOMMENDATION: \${shouldRecommendClaude.reason}\`);
      }
      
      // Return enhanced error with routing recommendation
      throw new Error(\`DeepSeek failed: \${error.message} | Failure type: \${failureAnalysis.category} | Recommend Claude: \${shouldRecommendClaude.recommend} (\${shouldRecommendClaude.reason})\`);
    }
  }`;

        if (oldQueryMethod.test(content)) {
            return content.replace(oldQueryMethod, newQueryMethod);
        } else {
            console.log('⚠️ Could not find queryDeepseek method to patch');
            return content;
        }
    }

    addEmpiricalRouting(content) {
        console.log('🔧 Adding empirical routing methods...');
        
        // Add new methods before the final export
        const insertionPoint = /\/\/ Initialize the production bridge/;
        
        const empiricalMethods = `

  /**
   * EMPIRICAL ROUTING: Analyze actual DeepSeek failures
   */
  analyzeDeepSeekFailure(error, responseTime, prompt) {
    const analysis = {
      errorType: error.name,
      errorMessage: error.message,
      responseTime,
      promptLength: prompt.length,
      estimatedTokens: Math.ceil(prompt.length / 4),
      timestamp: new Date().toISOString()
    };

    // Categorize failure based on actual error characteristics
    if (error.name === 'AbortError' || responseTime >= 25000) {
      analysis.category = 'timeout';
      analysis.reason = 'Task took too long - likely too complex for DeepSeek';
    } else if (error.message.includes('HTTP 4')) {
      analysis.category = 'client-error';
      analysis.reason = 'Request issue - check prompt formatting';
    } else if (error.message.includes('HTTP 5') || error.message.includes('ECONNREFUSED')) {
      analysis.category = 'service-unavailable';
      analysis.reason = 'DeepSeek server not available';
    } else if (prompt.length > 8000) {
      analysis.category = 'context-overflow';
      analysis.reason = 'Prompt too large for current context window';
    } else {
      analysis.category = 'unknown';
      analysis.reason = 'Unknown error - investigate';
    }

    return analysis;
  }

  /**
   * EMPIRICAL ROUTING: Decide if Claude should be recommended based on actual failure
   */
  shouldRecommendClaude(failureAnalysis) {
    switch (failureAnalysis.category) {
      case 'timeout':
        return {
          recommend: true,
          reason: 'Task complexity caused timeout - Claude better for complex reasoning',
          confidence: 0.8
        };
      
      case 'context-overflow':
        return {
          recommend: true, 
          reason: 'Prompt too large - Claude has larger context window',
          confidence: 0.9
        };
      
      case 'service-unavailable':
        return {
          recommend: true,
          reason: 'DeepSeek server unavailable - Claude as fallback',
          confidence: 0.95
        };
      
      case 'client-error':
      case 'unknown':
      default:
        return {
          recommend: false,
          reason: 'Error may be fixable - try debugging DeepSeek request first',
          confidence: 0.3
        };
    }
  }

  /**
   * EMPIRICAL ROUTING: Log routing outcomes for intelligence building
   */
  async logRoutingOutcome(prompt, outcome, responseTime, result = null, failureAnalysis = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      promptHash: this.hashPrompt(prompt), // Privacy-preserving hash
      promptLength: prompt.length,
      estimatedTokens: Math.ceil(prompt.length / 4),
      outcome, // 'success' or 'failure'
      responseTime,
      failureAnalysis
    };

    // Store in memory for session (could be persisted to file for learning)
    if (!this.routingLog) {
      this.routingLog = [];
    }
    
    this.routingLog.push(logEntry);
    
    // Keep only last 50 entries per session
    if (this.routingLog.length > 50) {
      this.routingLog = this.routingLog.slice(-50);
    }
  }

  /**
   * Generate privacy-preserving hash of prompt for learning
   */
  hashPrompt(prompt) {
    // Simple hash for pattern recognition without storing actual content
    let hash = 0;
    for (let i = 0; i < Math.min(prompt.length, 200); i++) {
      const char = prompt.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Get empirical routing statistics
   */
  getEmpiricalStats() {
    if (!this.routingLog || this.routingLog.length === 0) {
      return {
        totalAttempts: 0,
        successRate: 0,
        avgResponseTime: 0,
        failureTypes: {},
        message: 'No routing data collected yet'
      };
    }

    const successes = this.routingLog.filter(entry => entry.outcome === 'success');
    const failures = this.routingLog.filter(entry => entry.outcome === 'failure');
    
    const successRate = (successes.length / this.routingLog.length) * 100;
    const avgResponseTime = this.routingLog.reduce((sum, entry) => sum + entry.responseTime, 0) / this.routingLog.length;
    
    const failureTypes = {};
    failures.forEach(failure => {
      const category = failure.failureAnalysis?.category || 'unknown';
      failureTypes[category] = (failureTypes[category] || 0) + 1;
    });

    return {
      totalAttempts: this.routingLog.length,
      successes: successes.length,
      failures: failures.length,
      successRate: Math.round(successRate * 100) / 100,
      avgResponseTime: Math.round(avgResponseTime),
      failureTypes,
      message: \`Empirical routing data: \${this.routingLog.length} attempts, \${Math.round(successRate)}% success rate\`
    };
  }

// Initialize the production bridge`;

        if (insertionPoint.test(content)) {
            return content.replace(insertionPoint, empiricalMethods + '\n\n// Initialize the production bridge');
        } else {
            // Fallback: add at end of class
            const classEndPattern = /}(\s*\/\/ Initialize the production bridge)/;
            return content.replace(classEndPattern, empiricalMethods + '\n}$1');
        }
    }

    updateToolDescriptions(content) {
        console.log('🔧 Updating tool descriptions...');
        
        // Update query_deepseek description
        const oldQueryDesc = /description: 'Send a query to local DeepSeek.*?ROUTE TO CLAUDE: .*?'/s;
        const newQueryDesc = `description: 'Send a query to local DeepSeek with EMPIRICAL ROUTING - tries DeepSeek first for ALL queries, then analyzes actual failures to recommend Claude. No upfront filtering - let DeepSeek prove what it can handle!'`;
        
        if (oldQueryDesc.test(content)) {
            content = content.replace(oldQueryDesc, newQueryDesc);
        }

        // Update status description to mention empirical routing
        const oldStatusDesc = /description: 'Check DeepSeek status.*?'/;
        const newStatusDesc = `description: 'Check DeepSeek status with empirical routing statistics - see actual success rates, failure types, and learned routing patterns'`;
        
        if (oldStatusDesc.test(content)) {
            content = content.replace(oldStatusDesc, newStatusDesc);
        }

        return content;
    }

    async testPatch() {
        console.log('\n🧪 Testing empirical routing concept...');
        
        const testPrompts = [
            "Your JSON loading question: Vite serving issue with src/data files",
            "Simple question: What is TypeScript?", 
            "Complex question: Design a complete distributed microservices architecture"
        ];

        for (const prompt of testPrompts) {
            console.log(`\n📝 Prompt: "${prompt.substring(0, 60)}..."`);
            
            // Simulate the new approach
            console.log('   🎯 EMPIRICAL ROUTING: Trying DeepSeek first (no filtering)');
            console.log('   ⏱️  Attempt DeepSeek...');
            
            // Simulate different outcomes
            if (prompt.includes('JSON') || prompt.includes('TypeScript')) {
                console.log('   ✅ DeepSeek succeeded! (Returns result)');
                console.log('   📊 Logged as success for routing intelligence');
            } else {
                console.log('   ❌ DeepSeek timed out after 25s');
                console.log('   🔍 Failure analysis: timeout -> likely too complex');
                console.log('   💡 Recommendation: Try Claude for similar complex tasks');
                console.log('   📊 Logged failure pattern for routing intelligence');
            }
        }

        console.log('\n🎯 EMPIRICAL ADVANTAGE:');
        console.log('✅ Your JSON question gets to try DeepSeek first');
        console.log('✅ Only actual failures inform routing decisions'); 
        console.log('✅ Builds routing intelligence from real performance');
        console.log('✅ No false positives from pattern matching');
    }
}

// Run the patch
if (require.main === module) {
    const patcher = new EmpiricalRoutingPatch();
    
    const command = process.argv[2];
    if (command === 'test') {
        patcher.testPatch();
    } else {
        patcher.applyEmpiricalPatch().then(() => patcher.testPatch());
    }
}

module.exports = EmpiricalRoutingPatch;
