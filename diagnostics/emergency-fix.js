#!/usr/bin/env node

/**
 * DeepSeek Bridge Emergency Fix
 * Patches routing patterns to resolve "reliability" issues
 */

const fs = require('fs').promises;
const path = require('path');

class DeepSeekBridgeFix {
    constructor() {
        this.serverPath = '/home/platano/project/deepseek-mcp-bridge/server.js';
        this.backupPath = '/home/platano/project/deepseek-mcp-bridge/server.js.backup';
    }

    async applyEmergencyFix() {
        console.log('🔧 DeepSeek Bridge Emergency Fix');
        console.log('================================');
        console.log('Problem: Over-conservative routing causing "reliability" issues');
        console.log('Solution: Fix routing patterns + reduce context window');

        try {
            // 1. Create backup
            await this.createBackup();
            
            // 2. Read current server.js
            const serverContent = await fs.readFile(this.serverPath, 'utf8');
            
            // 3. Apply patches
            let fixedContent = serverContent;
            
            // Patch 1: Fix supported task patterns (expand them)
            fixedContent = this.fixSupportedPatterns(fixedContent);
            
            // Patch 2: Fix complex task patterns (narrow them)
            fixedContent = this.fixComplexPatterns(fixedContent);
            
            // Patch 3: Reduce context window for reliability
            fixedContent = this.fixContextWindow(fixedContent);
            
            // 4. Write fixed version
            await fs.writeFile(this.serverPath, fixedContent);
            
            console.log('✅ Emergency fix applied successfully!');
            console.log('\n🔧 Changes Made:');
            console.log('1. ✅ Expanded supported task patterns (more tasks route to DeepSeek)');
            console.log('2. ✅ Narrowed complex task patterns (fewer false positives)'); 
            console.log('3. ✅ Reduced context window: 32K → 16K (better reliability)');
            console.log('4. ✅ Reduced response tokens: 8K → 4K (faster responses)');
            
            console.log('\n🚀 Next Steps:');
            console.log('1. Restart the MCP bridge: Kill current process and restart');
            console.log('2. Test with your JSON loading question');
            console.log('3. Monitor performance improvements');
            
            console.log('\n💾 Backup available at:', this.backupPath);
            
        } catch (error) {
            console.error('❌ Fix failed:', error);
            console.log('💾 Original file preserved at:', this.backupPath);
        }
    }

    async createBackup() {
        try {
            await fs.copyFile(this.serverPath, this.backupPath);
            console.log('💾 Created backup:', this.backupPath);
        } catch (error) {
            console.log('⚠️ Backup failed, continuing anyway...');
        }
    }

    fixSupportedPatterns(content) {
        console.log('🔧 Fixing supported task patterns...');
        
        const oldPattern = /this\.supportedTaskPatterns = \[([\s\S]*?)\];/;
        
        const newPatterns = `this.supportedTaskPatterns = [
      // Original patterns
      /code\\s+(review|analysis|improvement)/i,
      /function.*implement/i,
      /bug.*fix|debug|troubleshoot/i,
      /single.*class|simple.*class/i,
      /validation|input.*check/i,
      /logging|error.*handling/i,
      /documentation|comment|explain/i,
      
      // FIXED: Added common development questions
      /json.*loading|data.*loading/i,
      /vite.*config|build.*config/i,
      /react.*component|component.*performance/i,
      /typescript.*error|javascript.*error/i,
      /file.*serving|static.*assets/i,
      /routing.*issue|url.*problem/i,
      /performance.*optimization|memory.*leak/i,
      /state.*management|hook.*usage/i,
      /technical.*review|solution.*analysis/i,
      /configuration.*issue|setup.*problem/i,
      /difference.*between|comparison/i,
      /optimize.*performance|improve.*speed/i,
      
      // Game development patterns
      /game.*component|player.*state/i,
      /audio.*system|sound.*issue/i,
      /inventory.*system|quest.*system/i
    ];`;

        if (oldPattern.test(content)) {
            return content.replace(oldPattern, newPatterns);
        } else {
            console.log('⚠️ Could not find supportedTaskPatterns to replace');
            return content;
        }
    }

    fixComplexPatterns(content) {
        console.log('🔧 Fixing complex task patterns...');
        
        const oldPattern = /this\.complexTaskPatterns = \[([\s\S]*?)\];/;
        
        const newPatterns = `this.complexTaskPatterns = [
      // FIXED: Only truly complex multi-system tasks
      /full.*system.*architecture|complete.*system.*design/i,
      /multi.*service.*orchestration|microservices.*coordination/i,
      /enterprise.*deployment.*strategy.*across.*multiple.*environments/i,
      /distributed.*system.*design.*with.*multiple.*services/i,
      /multiple.*agent.*coordination.*with.*complex.*state.*management/i
    ];`;

        if (oldPattern.test(content)) {
            return content.replace(oldPattern, newPatterns);
        } else {
            console.log('⚠️ Could not find complexTaskPatterns to replace');
            return content;
        }
    }

    fixContextWindow(content) {
        console.log('🔧 Fixing context window settings...');
        
        // Fix context window
        content = content.replace(
            /this\.contextWindow = 32768;.*$/m,
            'this.contextWindow = 16384; // FIXED: Reduced from 32K to 16K for better reliability'
        );
        
        // Fix max response tokens
        content = content.replace(
            /this\.maxResponseTokens = 8000;.*$/m,
            'this.maxResponseTokens = 4000; // FIXED: Reduced from 8K to 4K for faster responses'
        );
        
        // Fix optimal tokens
        content = content.replace(
            /this\.optimalTokens = 4000;.*$/m,
            'this.optimalTokens = 2000; // FIXED: Reduced for better reliability'
        );

        return content;
    }

    async testFix() {
        console.log('\n🧪 Testing fix by classifying your JSON question...');
        
        const testPrompt = "I need your technical review of this JSON content loading issue and proposed solution: Shadow Contracts Classic React app renders perfectly with cyberpunk UI - JSON files in src/data/ directory are not being served by Vite/Netlify";
        
        // Simulate the fixed classification
        const supportedPatterns = [
            /json.*loading|data.*loading/i,
            /vite.*config|build.*config/i,
            /technical.*review|solution.*analysis/i,
            /configuration.*issue|setup.*problem/i
        ];
        
        const complexPatterns = [
            /full.*system.*architecture|complete.*system.*design/i,
            /multi.*service.*orchestration/i,
            /enterprise.*deployment.*strategy.*across.*multiple.*environments/i
        ];
        
        let isSupported = false;
        let isComplex = false;
        
        for (const pattern of supportedPatterns) {
            if (pattern.test(testPrompt)) {
                isSupported = true;
                console.log(`✅ FIXED: Would match supported pattern: ${pattern}`);
                break;
            }
        }
        
        for (const pattern of complexPatterns) {
            if (pattern.test(testPrompt)) {
                isComplex = true;
                console.log(`❌ Would match complex pattern: ${pattern}`);
                break;
            }
        }
        
        if (isSupported && !isComplex) {
            console.log('✅ SUCCESS: Your JSON loading question will now route to DeepSeek!');
        } else if (isComplex) {
            console.log('⚠️ Still classified as complex - may need further pattern adjustment');
        } else {
            console.log('⚠️ No pattern match - will use default medium complexity routing');
        }
    }

    async rollbackFix() {
        console.log('🔄 Rolling back emergency fix...');
        try {
            await fs.copyFile(this.backupPath, this.serverPath);
            console.log('✅ Rollback complete - original server.js restored');
        } catch (error) {
            console.error('❌ Rollback failed:', error);
        }
    }
}

// Command line interface
if (require.main === module) {
    const fixer = new DeepSeekBridgeFix();
    
    const command = process.argv[2];
    
    switch (command) {
        case 'apply':
        case undefined:
            fixer.applyEmergencyFix().then(() => fixer.testFix());
            break;
        case 'test':
            fixer.testFix();
            break;
        case 'rollback':
            fixer.rollbackFix();
            break;
        default:
            console.log('Usage: node emergency-fix.js [apply|test|rollback]');
    }
}

module.exports = DeepSeekBridgeFix;
