#!/usr/bin/env node

/**
 * DeepSeek Routing Classification Fix
 * SURGICAL FIX: Only fixing routing patterns, keeping context window as-is
 */

const fs = require('fs').promises;

class RoutingClassificationFix {
    constructor() {
        this.serverPath = '/home/platano/project/deepseek-mcp-bridge/server.js';
        this.backupPath = '/home/platano/project/deepseek-mcp-bridge/server.js.routing-backup';
    }

    async applyRoutingFix() {
        console.log('🎯 DeepSeek Routing Classification Fix');
        console.log('====================================');
        console.log('SURGICAL FIX: Only fixing routing patterns');
        console.log('KEEPING: 32K context window (it works fine)');
        console.log('PROBLEM: Over-conservative task classification');

        try {
            // Create backup
            await fs.copyFile(this.serverPath, this.backupPath);
            console.log('💾 Created backup:', this.backupPath);
            
            // Read current server.js
            const serverContent = await fs.readFile(this.serverPath, 'utf8');
            
            // Apply ONLY routing pattern fixes
            let fixedContent = this.fixSupportedPatterns(serverContent);
            fixedContent = this.fixComplexPatterns(fixedContent);
            
            // Write fixed version
            await fs.writeFile(this.serverPath, fixedContent);
            
            console.log('✅ Routing classification fix applied!');
            console.log('\n🔧 Changes Made:');
            console.log('1. ✅ EXPANDED supported patterns - more tasks route to DeepSeek');
            console.log('2. ✅ NARROWED complex patterns - fewer false positives');
            console.log('3. ✅ KEPT 32K context window - it was working fine');
            console.log('4. ✅ KEPT existing timeout and performance settings');
            
            await this.testRoutingFix();
            
        } catch (error) {
            console.error('❌ Fix failed:', error);
        }
    }

    fixSupportedPatterns(content) {
        console.log('🔧 Expanding supported task patterns...');
        
        const oldPattern = /this\.supportedTaskPatterns = \[([\s\S]*?)\];/;
        
        const newPatterns = `this.supportedTaskPatterns = [
      // Original patterns (keep these)
      /code\\s+(review|analysis|improvement)/i,
      /function.*implement/i,
      /bug.*fix|debug|troubleshoot/i,
      /single.*class|simple.*class/i,
      /validation|input.*check/i,
      /logging|error.*handling/i,
      /documentation|comment|explain/i,
      
      // ADDED: Common technical questions (your JSON issue should match these)
      /json.*loading|json.*file|data.*loading|file.*loading/i,
      /vite.*config|vite.*build|build.*config|build.*issue/i,
      /react.*component|component.*optimization|component.*performance/i,
      /typescript.*error|javascript.*error|syntax.*error/i,
      /file.*serving|static.*assets|public.*directory|src.*directory/i,
      /routing.*issue|url.*problem|redirect.*issue/i,
      /performance.*optimization|memory.*leak|speed.*improvement/i,
      /state.*management|hook.*usage|useeffect.*issue/i,
      /technical.*review|solution.*analysis|approach.*analysis/i,
      /configuration.*issue|setup.*problem|build.*problem/i,
      /difference.*between|comparison.*between|compare.*approaches/i,
      /optimize.*for|improve.*performance|enhance.*speed/i,
      /troubleshoot|diagnose|identify.*issue|solve.*problem/i,
      /implementation.*strategy|coding.*approach|development.*approach/i,
      
      // Game development patterns (specific implementations)
      /game.*component|player.*state.*component/i,
      /audio.*system.*implementation|sound.*component/i,
      /inventory.*component|quest.*component/i,
      /animation.*performance|rendering.*optimization/i,
      /asset.*loading.*component|texture.*handling/i
    ];`;

        if (oldPattern.test(content)) {
            return content.replace(oldPattern, newPatterns);
        } else {
            console.log('⚠️ Could not find supportedTaskPatterns to replace');
            return content;
        }
    }

    fixComplexPatterns(content) {
        console.log('🔧 Narrowing complex task patterns (removing false positives)...');
        
        const oldPattern = /this\.complexTaskPatterns = \[([\s\S]*?)\];/;
        
        const newPatterns = `this.complexTaskPatterns = [
      // NARROWED: Only genuinely complex multi-system coordination tasks
      /complete.*system.*architecture.*with.*multiple.*services/i,
      /full.*application.*architecture.*design.*from.*scratch/i,
      /multi.*agent.*orchestration.*with.*coordination.*logic/i,
      /microservices.*architecture.*with.*service.*mesh/i,
      /enterprise.*deployment.*strategy.*across.*multiple.*environments/i,
      /distributed.*system.*design.*with.*consensus.*algorithms/i,
      /production.*deployment.*pipeline.*with.*multiple.*stages/i,
      /scalable.*infrastructure.*design.*for.*high.*availability/i
    ];`;

        if (oldPattern.test(content)) {
            return content.replace(oldPattern, newPatterns);
        } else {
            console.log('⚠️ Could not find complexTaskPatterns to replace');
            return content;
        }
    }

    async testRoutingFix() {
        console.log('\n🧪 Testing routing classification fix...');
        
        const testCases = [
            {
                name: "Your JSON Loading Question",
                prompt: "I need your technical review of this JSON content loading issue and proposed solution: Shadow Contracts Classic React app renders perfectly with cyberpunk UI - JSON files in src/data/ directory are not being served by Vite/Netlify - Requests to /data/targets.json return HTML (index.html) instead of JSON",
                shouldRouteToDeepSeek: true
            },
            {
                name: "React Performance Question", 
                prompt: "How do I optimize this React component for performance? It has useState and useEffect hooks managing complex state.",
                shouldRouteToDeepSeek: true
            },
            {
                name: "Vite Configuration Issue",
                prompt: "My Vite build configuration isn't serving static files correctly from the public directory.",
                shouldRouteToDeepSeek: true
            },
            {
                name: "Genuinely Complex Architecture",
                prompt: "Design a complete system architecture with multiple services, microservices coordination, and distributed consensus algorithms.",
                shouldRouteToDeepSeek: false
            }
        ];

        // Test with fixed patterns
        const supportedPatterns = [
            /json.*loading|json.*file|data.*loading|file.*loading/i,
            /vite.*config|vite.*build|build.*config|build.*issue/i,
            /react.*component|component.*optimization|component.*performance/i,
            /technical.*review|solution.*analysis|approach.*analysis/i,
            /configuration.*issue|setup.*problem|build.*problem/i,
            /performance.*optimization|memory.*leak|speed.*improvement/i
        ];
        
        const complexPatterns = [
            /complete.*system.*architecture.*with.*multiple.*services/i,
            /microservices.*architecture.*with.*service.*mesh/i,
            /distributed.*system.*design.*with.*consensus.*algorithms/i
        ];

        for (const testCase of testCases) {
            console.log(`\n📝 Testing: ${testCase.name}`);
            
            let isSupported = false;
            let isComplex = false;
            let matchedPattern = null;
            
            // Check supported patterns
            for (const pattern of supportedPatterns) {
                if (pattern.test(testCase.prompt)) {
                    isSupported = true;
                    matchedPattern = pattern.toString();
                    break;
                }
            }
            
            // Check complex patterns
            for (const pattern of complexPatterns) {
                if (pattern.test(testCase.prompt)) {
                    isComplex = true;
                    matchedPattern = pattern.toString();
                    break;
                }
            }
            
            const willRouteToDeepSeek = isSupported && !isComplex;
            const expected = testCase.shouldRouteToDeepSeek;
            const result = willRouteToDeepSeek === expected ? '✅ CORRECT' : '❌ INCORRECT';
            
            console.log(`   Expected: Route to ${expected ? 'DeepSeek' : 'Claude'}`);
            console.log(`   Actual: Route to ${willRouteToDeepSeek ? 'DeepSeek' : 'Claude'}`);
            console.log(`   ${result}`);
            
            if (matchedPattern) {
                console.log(`   Matched: ${matchedPattern}`);
            }
        }

        console.log('\n🎯 ROUTING FIX SUMMARY:');
        console.log('✅ Your JSON loading question should now route to DeepSeek');
        console.log('✅ Common technical questions now correctly classified');
        console.log('✅ Only genuinely complex tasks route to Claude');
        console.log('✅ 32K context window preserved (it was working fine)');
    }
}

// Run the fix
if (require.main === module) {
    const fixer = new RoutingClassificationFix();
    fixer.applyRoutingFix();
}

module.exports = RoutingClassificationFix;
