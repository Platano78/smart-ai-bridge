#!/usr/bin/env node

/**
 * Simple DeepSeek Context Window Test
 * Direct reliability test for context window issues
 */

const testDeepSeekReliability = async () => {
    console.log('🔬 DEEPSEEK CONTEXT WINDOW DIAGNOSTIC');
    console.log('=====================================');
    
    const baseUrl = 'http://172.19.224.1:1234/v1';
    const tests = [
        {
            name: 'Baseline Simple Request',
            prompt: 'What is TypeScript in one sentence?',
            expectedTime: 3000
        },
        {
            name: 'Medium Context Request',
            prompt: `Context: React application with useState and useEffect.
            
            Question: How do I optimize this component for performance?`,
            expectedTime: 5000
        },
        {
            name: 'Large Context Request',
            prompt: `Context: Building a cyberpunk RPG with React, TypeScript, and Vite. Components include GameEngine, PlayerState, WeaponSystem, InventoryManager, QuestTracker, and AudioSystem. Each component manages complex state with multiple useEffect hooks and performance optimizations.

            Technical Requirements:
            - Real-time combat system with frame-perfect timing
            - Inventory system supporting 500+ items with filtering
            - Quest system with branching narratives and state tracking
            - Audio system with 3D spatial sound and dynamic mixing
            - Performance targets: 60 FPS, <100ms input latency, <2GB memory
            
            Current Issues:
            - Memory leaks during rapid state changes in combat
            - Audio distortion during intense gameplay moments
            - Quest state sometimes not persisting across sessions
            - Inventory filtering performance degrades with large inventories
            - Component re-renders causing frame drops
            
            Question: What's the most critical performance optimization to implement first and provide detailed implementation steps?`,
            expectedTime: 15000
        }
    ];

    for (const test of tests) {
        console.log(`\n🧪 ${test.name}`);
        console.log('─'.repeat(50));
        
        const startTime = Date.now();
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000);
            
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'deepseek-coder-v2-lite-instruct',
                    messages: [{ role: 'user', content: test.prompt }],
                    max_tokens: 1000,
                    temperature: 0.1
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            const endTime = Date.now();
            const responseTime = endTime - startTime;
            const content = data.choices[0].message.content;
            
            console.log(`✅ SUCCESS`);
            console.log(`⏱️  Response Time: ${responseTime}ms (expected: ${test.expectedTime}ms)`);
            console.log(`📝 Response Length: ${content.length} chars (~${Math.ceil(content.length/4)} tokens)`);
            console.log(`🎯 Performance: ${responseTime < test.expectedTime ? 'GOOD' : 'CONCERNING'}`);
            
            if (responseTime > test.expectedTime * 2) {
                console.log(`🚨 CRITICAL: Response time ${responseTime}ms is ${Math.round(responseTime/test.expectedTime)}x expected`);
            }
            
            // Quality check
            const isHighQuality = content.length > 100 && !content.includes('I apologize');
            console.log(`📊 Quality: ${isHighQuality ? 'GOOD' : 'POOR'}`);
            
            if (!isHighQuality) {
                console.log(`⚠️  Response may indicate model stress or context window issues`);
            }
            
        } catch (error) {
            const endTime = Date.now();
            const responseTime = endTime - startTime;
            
            console.log(`❌ FAILED: ${error.message}`);
            console.log(`⏱️  Time to Failure: ${responseTime}ms`);
            
            if (error.name === 'AbortError' || error.message.includes('timeout')) {
                console.log(`🚨 TIMEOUT: Context window may be too large for reliable processing`);
            }
        }
        
        // Cool down between tests
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('\n📊 DIAGNOSTIC COMPLETE');
    console.log('=====================================');
    console.log('Recommendations based on results:');
    console.log('1. If all tests show >10s response times: Reduce context window to 16384');
    console.log('2. If large context fails consistently: Context window too large for hardware');
    console.log('3. If quality degrades with size: Model struggling with large contexts');
    console.log('4. Monitor LM Studio for memory/GPU usage during tests');
};

// Export for potential use as module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = testDeepSeekReliability;
}

// Run if executed directly
if (typeof require !== 'undefined' && require.main === module) {
    testDeepSeekReliability().catch(console.error);
}

// Also make available in browser/global context
if (typeof window !== 'undefined') {
    window.testDeepSeekReliability = testDeepSeekReliability;
}
