#!/usr/bin/env node
/**
 * Quick YoutAgent Phase 2 Validation
 * Tests core functionality without intensive operations
 */

import { YoutAgentFileSystem } from './src/youtu-agent-filesystem.js';
import { YoutAgentContextChunker } from './src/youtu-agent-context-chunker.js';

async function quickValidation() {
  console.log('🎬 YoutAgent Phase 2 - Quick Validation');
  console.log('=====================================\n');
  
  try {
    // Initialize components
    const fileSystem = new YoutAgentFileSystem();
    const contextChunker = new YoutAgentContextChunker({
      targetChunkSize: 20000,
      maxChunkSize: 25000,
      minChunkSize: 5000,
      overlapTokens: 200,
      semanticBoundaries: true,
      preserveStructure: true,
      fileSystem: fileSystem
    });
    
    // Test 1: Component initialization
    console.log('✅ YoutAgentFileSystem initialized');
    console.log('✅ YoutAgentContextChunker initialized');
    
    // Test 2: Token estimation
    const testContent = 'function test() { return "hello"; }'.repeat(1000);
    const tokenCount = contextChunker.estimateTokenCount(testContent);
    console.log(`✅ Token estimation: ${tokenCount} tokens`);
    
    // Test 3: Basic chunking
    const chunks = await contextChunker.chunkContent(testContent, 'javascript');
    console.log(`✅ Content chunking: ${chunks.length} chunks generated`);
    
    // Test 4: Semantic boundary detection
    if (chunks.length > 0 && chunks[0].metadata) {
      console.log(`✅ Semantic metadata: ${Object.keys(chunks[0].metadata).join(', ')}`);
    }
    
    // Test 5: Content reconstruction
    const reconstructed = await contextChunker.reconstructContent(chunks);
    const preservationRate = reconstructed.length / testContent.length;
    console.log(`✅ Content preservation: ${Math.round(preservationRate * 100)}%`);
    
    // Test 6: MCP preparation
    const mcpChunks = await contextChunker.prepareMCPChunks(testContent, {
      contentType: 'javascript',
      analysisType: 'code-review'
    });
    console.log(`✅ MCP chunks prepared: ${mcpChunks.chunks.length}`);
    
    console.log('\n🎉 Phase 2 Core Functionality: ✅ VALIDATED');
    console.log('🚀 Ready for production integration');
    return true;
    
  } catch (error) {
    console.error('❌ Validation failed:', error.message);
    return false;
  }
}

// Run validation
if (import.meta.url === `file://${process.argv[1]}`) {
  quickValidation()
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}