// youtu-agent-phase2.test.js - TDD RED PHASE: Intelligent Context Chunking Tests
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { YoutAgentContextChunker } from '../src/youtu-agent-context-chunker.js';
import { YoutAgentFileSystem } from '../src/youtu-agent-filesystem.js';

describe('YoutAgent Phase 2: Intelligent Context Chunking', () => {
  let contextChunker;
  let fileSystem;
  let testDir;
  
  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'youtu-agent-phase2-'));
    fileSystem = new YoutAgentFileSystem({
      maxFileSize: 50 * 1024 * 1024, // 50MB for large file testing
      allowedExtensions: ['.js', '.ts', '.py', '.md', '.json', '.txt'],
      securityValidation: true
    });
    
    contextChunker = new YoutAgentContextChunker({
      targetChunkSize: 20000, // 20K tokens per chunk
      maxChunkSize: 25000,    // 25K token limit
      minChunkSize: 5000,     // 5K minimum to avoid tiny chunks
      overlapTokens: 200,     // 200 token overlap for context preservation
      semanticBoundaries: true,
      preserveStructure: true,
      fileSystem: fileSystem
    });
  });
  
  afterEach(async () => {
    await fs.rm(testDir, { recursive: true });
  });

  describe('Core Chunking Functionality', () => {
    test('should chunk large content into optimal sizes (20K-25K tokens)', async () => {
      // Generate large content (~100K tokens)
      const largeContent = generateLargeJavaScriptContent(100000);
      
      const chunks = await contextChunker.chunkContent(largeContent, 'javascript');
      
      expect(chunks).toHaveLength(4); // ~25K each
      chunks.forEach((chunk, index) => {
        expect(chunk.tokenCount).toBeGreaterThanOrEqual(5000);
        expect(chunk.tokenCount).toBeLessThanOrEqual(25000);
        expect(chunk.chunkId).toBe(index);
        expect(chunk.type).toBe('javascript');
        expect(chunk.content).toBeDefined();
        expect(chunk.metadata).toBeDefined();
      });
    });

    test('should preserve semantic boundaries in JavaScript code', async () => {
      const jsContent = `
class UserManager {
  constructor() {
    this.users = [];
  }
  
  addUser(user) {
    this.users.push(user);
  }
  
  getUsers() {
    return this.users;
  }
}

function processData(data) {
  return data.map(item => {
    return {
      id: item.id,
      processed: true,
      timestamp: Date.now()
    };
  });
}

const config = {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
  retries: 3
};
`.repeat(200); // Make it large enough to require chunking
      
      const chunks = await contextChunker.chunkContent(jsContent, 'javascript');
      
      // Verify semantic boundaries are preserved
      chunks.forEach(chunk => {
        // Should not break in middle of class/function definitions
        expect(chunk.content).not.toMatch(/class\s+\w+\s*{[^}]*$/); // No incomplete classes
        expect(chunk.content).not.toMatch(/function\s+\w+[^{]*$/); // No incomplete functions
        expect(chunk.metadata.semanticBoundaries).toBeDefined();
        expect(chunk.metadata.preservedStructures).toContain('class');
      });
    });

    test('should preserve markdown structure and sections', async () => {
      const markdownContent = `
# Main Title

This is the introduction section with some content.

## Section 1: Getting Started

Here's how to get started with the project.

### Subsection 1.1

Details about subsection 1.1.

## Section 2: Advanced Usage

Advanced topics and examples.

### Subsection 2.1

More detailed information.

### Subsection 2.2

Additional examples and use cases.

## Section 3: API Reference

Complete API documentation.
`.repeat(300); // Make large enough for chunking
      
      const chunks = await contextChunker.chunkContent(markdownContent, 'markdown');
      
      chunks.forEach(chunk => {
        // Should not break markdown headers
        expect(chunk.content).not.toMatch(/^#+\s*$/m); // No orphaned headers
        expect(chunk.metadata.semanticBoundaries).toContain('markdown-section');
        expect(chunk.metadata.preservedStructures).toContain('heading');
      });
    });

    test('should track cross-chunk relationships and dependencies', async () => {
      const contentWithDependencies = `
import { DatabaseManager } from './database.js';
import { UserService } from './user-service.js';

class ApplicationController {
  constructor() {
    this.db = new DatabaseManager();
    this.userService = new UserService(this.db);
  }
  
  async handleRequest(req) {
    const user = await this.userService.getUser(req.userId);
    return this.processUserData(user);
  }
  
  processUserData(user) {
    // Large method that would span chunks
    ${'return user;'.repeat(5000)}
  }
}
`.repeat(50);
      
      const chunks = await contextChunker.chunkContent(contentWithDependencies, 'javascript');
      
      // Verify cross-chunk relationships are tracked
      expect(chunks.length).toBeGreaterThan(1);
      
      chunks.forEach((chunk, index) => {
        expect(chunk.relationships).toBeDefined();
        if (index > 0) {
          expect(chunk.relationships.dependencies).toBeDefined();
          expect(chunk.relationships.precedingChunk).toBe(index - 1);
        }
        if (index < chunks.length - 1) {
          expect(chunk.relationships.followingChunk).toBe(index + 1);
        }
      });
    });

    test('should maintain 95% content preservation after reconstruction', async () => {
      const originalContent = generateLargeJavaScriptContent(50000);
      
      const chunks = await contextChunker.chunkContent(originalContent, 'javascript');
      const reconstructedContent = await contextChunker.reconstructContent(chunks);
      
      const preservationRate = calculateContentSimilarity(originalContent, reconstructedContent);
      expect(preservationRate).toBeGreaterThanOrEqual(0.95);
      
      // Verify no critical content loss
      expect(reconstructedContent).toContain('function');
      expect(reconstructedContent).toContain('class');
      expect(reconstructedContent.length).toBeGreaterThanOrEqual(originalContent.length * 0.95);
    });

    test('should process chunks in under 2 seconds per 100K tokens', async () => {
      const largeContent = generateLargeJavaScriptContent(100000);
      
      const startTime = performance.now();
      const chunks = await contextChunker.chunkContent(largeContent, 'javascript');
      const endTime = performance.now();
      
      const processingTime = endTime - startTime;
      expect(processingTime).toBeLessThan(2000); // < 2 seconds
      expect(chunks).toBeDefined();
      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe('File Integration', () => {
    test('should integrate with YoutAgentFileSystem for large file chunking', async () => {
      // Create a large test file
      const largeTestFile = path.join(testDir, 'large-file.js');
      const largeContent = generateLargeJavaScriptContent(60000);
      await fs.writeFile(largeTestFile, largeContent);
      
      const fileResult = await fileSystem.readFile(largeTestFile);
      expect(fileResult.success).toBe(true);
      
      const chunks = await contextChunker.chunkFile(largeTestFile);
      
      expect(chunks.length).toBeGreaterThan(2);
      chunks.forEach(chunk => {
        expect(chunk.sourceFile).toBe(largeTestFile);
        expect(chunk.tokenCount).toBeGreaterThanOrEqual(5000);
        expect(chunk.tokenCount).toBeLessThanOrEqual(25000);
      });
    });

    test('should handle multiple file chunking with cross-file relationships', async () => {
      // Create related files
      const file1 = path.join(testDir, 'module1.js');
      const file2 = path.join(testDir, 'module2.js');
      
      await fs.writeFile(file1, `
export class DataProcessor {
  constructor() {
    this.data = [];
  }
  
  process(input) {
    ${'return input.map(x => x * 2);'.repeat(3000)}
  }
}
      `);
      
      await fs.writeFile(file2, `
import { DataProcessor } from './module1.js';

export class ApplicationService {
  constructor() {
    this.processor = new DataProcessor();
  }
  
  execute(data) {
    ${'return this.processor.process(data);'.repeat(3000)}
  }
}
      `);
      
      const multiFileChunks = await contextChunker.chunkMultipleFiles([file1, file2]);
      
      expect(multiFileChunks.chunks).toBeDefined();
      expect(multiFileChunks.crossFileRelationships).toBeDefined();
      expect(multiFileChunks.crossFileRelationships).toContainEqual({
        fromFile: file2,
        toFile: file1,
        type: 'import',
        dependency: 'DataProcessor'
      });
    });
  });

  describe('Statistical Validation', () => {
    test('should provide detailed chunking statistics', async () => {
      const content = generateLargeJavaScriptContent(75000);
      
      const result = await contextChunker.chunkContentWithStats(content, 'javascript');
      
      expect(result.chunks).toBeDefined();
      expect(result.statistics).toBeDefined();
      expect(result.statistics.totalTokens).toBeGreaterThan(70000);
      expect(result.statistics.chunkCount).toBeGreaterThan(2);
      expect(result.statistics.averageChunkSize).toBeGreaterThanOrEqual(20000);
      expect(result.statistics.averageChunkSize).toBeLessThanOrEqual(25000);
      expect(result.statistics.preservationRate).toBeGreaterThanOrEqual(0.95);
      expect(result.statistics.processingTimeMs).toBeLessThan(2000);
    });

    test('should optimize chunk boundaries for semantic coherence', async () => {
      const pythonContent = `
def complex_algorithm(data):
    """
    A complex algorithm that processes data
    """
    result = []
    
    for item in data:
        processed_item = {
            'id': item.get('id'),
            'value': item.get('value', 0) * 2,
            'processed': True
        }
        result.append(processed_item)
    
    return result

class DataAnalyzer:
    def __init__(self):
        self.results = []
    
    def analyze(self, dataset):
        """Analyze the dataset"""
        ${'        return {"status": "analyzed"}\\n'.repeat(2000)}
`.repeat(50);
      
      const chunks = await contextChunker.chunkContent(pythonContent, 'python');
      
      chunks.forEach(chunk => {
        expect(chunk.metadata.semanticCoherence).toBeGreaterThanOrEqual(0.8);
        expect(chunk.metadata.boundaryQuality).toBe('optimal');
      });
    });
  });

  describe('Integration with MCP Tool', () => {
    test('should prepare chunks for DeepSeek MCP integration', async () => {
      const testContent = generateLargeJavaScriptContent(45000);
      
      const mcpReadyChunks = await contextChunker.prepareMCPChunks(testContent, {
        contentType: 'javascript',
        analysisType: 'code-review',
        preserveContext: true
      });
      
      expect(mcpReadyChunks.chunks).toBeDefined();
      expect(mcpReadyChunks.metadata.totalChunks).toBeGreaterThan(1);
      expect(mcpReadyChunks.metadata.recommendedProcessingOrder).toBeDefined();
      expect(mcpReadyChunks.executionPlan).toBeDefined();
      expect(mcpReadyChunks.executionPlan.strategy).toBe('sequential-with-context');
      
      mcpReadyChunks.chunks.forEach(chunk => {
        expect(chunk.mcpPromptTemplate).toBeDefined();
        expect(chunk.contextWindow).toBeDefined();
        expect(chunk.expectedDeepSeekTokens).toBeLessThanOrEqual(25000);
      });
    });
  });
});

// Helper Functions
function generateLargeJavaScriptContent(approximateTokens) {
  const baseFunction = `
function processUserData${Math.random().toString(36).substring(7)}(userData) {
  const validatedData = validateUserInput(userData);
  const processedData = transformData(validatedData);
  const enrichedData = enrichWithMetadata(processedData);
  return enrichedData;
}

class UserService${Math.random().toString(36).substring(7)} {
  constructor(database) {
    this.db = database;
    this.cache = new Map();
  }
  
  async getUser(id) {
    if (this.cache.has(id)) {
      return this.cache.get(id);
    }
    
    const user = await this.db.findUser(id);
    this.cache.set(id, user);
    return user;
  }
  
  async updateUser(id, data) {
    const user = await this.getUser(id);
    const updatedUser = { ...user, ...data, updatedAt: new Date() };
    await this.db.updateUser(id, updatedUser);
    this.cache.set(id, updatedUser);
    return updatedUser;
  }
}
`;
  
  const tokensPerBlock = 250; // Approximate tokens per function block
  const blocksNeeded = Math.ceil(approximateTokens / tokensPerBlock);
  
  return Array(blocksNeeded).fill(baseFunction).join('\n\n');
}

function calculateContentSimilarity(original, reconstructed) {
  // Simple similarity calculation based on character overlap
  const originalLines = original.split('\n').filter(line => line.trim());
  const reconstructedLines = reconstructed.split('\n').filter(line => line.trim());
  
  const matchingLines = originalLines.filter(line => 
    reconstructedLines.some(reconstructedLine => 
      reconstructedLine.includes(line.trim()) || line.includes(reconstructedLine.trim())
    )
  );
  
  return matchingLines.length / originalLines.length;
}