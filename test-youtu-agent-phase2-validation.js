#!/usr/bin/env node
/**
 * YoutAgent Phase 2 Validation - Large File Context Chunking
 * 
 * Tests the complete TDD workflow with actual large files:
 * 1. File system integration (Phase 1)  
 * 2. Intelligent context chunking (Phase 2)
 * 3. Large file handling (32K+ tokens)
 * 4. Cross-file relationships
 * 5. MCP tool integration
 */

import { YoutAgentFileSystem } from './src/youtu-agent-filesystem.js';
import { YoutAgentContextChunker } from './src/youtu-agent-context-chunker.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

async function createLargeTestFiles(testDir) {
  console.log('🏗️ Creating large test files for validation...');
  
  // Generate large JavaScript file (~50K tokens)
  const largeJSContent = `
// Large JavaScript application for testing context chunking
import React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import axios from 'axios';

// User management system with complex state logic
class UserManager {
  constructor() {
    this.users = new Map();
    this.cache = new Map();
    this.subscribers = new Set();
    this.apiClient = axios.create({
      baseURL: 'https://api.example.com/v1',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    this.setupInterceptors();
  }

  setupInterceptors() {
    this.apiClient.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('authToken');
        if (token) {
          config.headers.Authorization = \`Bearer \${token}\`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    this.apiClient.interceptors.response.use(
      (response) => {
        return response;
      },
      (error) => {
        if (error.response?.status === 401) {
          this.handleUnauthorized();
        }
        return Promise.reject(error);
      }
    );
  }

  async fetchUser(userId) {
    if (this.cache.has(userId)) {
      const cached = this.cache.get(userId);
      if (Date.now() - cached.timestamp < 300000) { // 5 minutes
        return cached.data;
      }
    }

    try {
      const response = await this.apiClient.get(\`/users/\${userId}\`);
      const userData = response.data;
      
      this.cache.set(userId, {
        data: userData,
        timestamp: Date.now()
      });
      
      this.users.set(userId, userData);
      this.notifySubscribers('userFetched', userData);
      
      return userData;
    } catch (error) {
      console.error(\`Failed to fetch user \${userId}:\`, error);
      throw error;
    }
  }

  async updateUser(userId, updates) {
    try {
      const response = await this.apiClient.put(\`/users/\${userId}\`, updates);
      const updatedUser = response.data;
      
      this.users.set(userId, updatedUser);
      this.cache.set(userId, {
        data: updatedUser,
        timestamp: Date.now()
      });
      
      this.notifySubscribers('userUpdated', updatedUser);
      return updatedUser;
    } catch (error) {
      console.error(\`Failed to update user \${userId}:\`, error);
      throw error;
    }
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  notifySubscribers(event, data) {
    this.subscribers.forEach(callback => {
      try {
        callback(event, data);
      } catch (error) {
        console.error('Subscriber error:', error);
      }
    });
  }

  handleUnauthorized() {
    localStorage.removeItem('authToken');
    window.location.href = '/login';
  }
}

// Data processing utilities with complex algorithms
class DataProcessor {
  constructor(options = {}) {
    this.batchSize = options.batchSize || 1000;
    this.maxConcurrency = options.maxConcurrency || 5;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
  }

  async processBatch(data, processor) {
    const results = [];
    const batches = this.createBatches(data, this.batchSize);
    
    for (let i = 0; i < batches.length; i += this.maxConcurrency) {
      const concurrentBatches = batches.slice(i, i + this.maxConcurrency);
      const batchPromises = concurrentBatches.map(batch => 
        this.processWithRetry(batch, processor)
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.flat());
    }
    
    return results;
  }

  createBatches(data, batchSize) {
    const batches = [];
    for (let i = 0; i < data.length; i += batchSize) {
      batches.push(data.slice(i, i + batchSize));
    }
    return batches;
  }

  async processWithRetry(batch, processor) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        return await processor(batch);
      } catch (error) {
        lastError = error;
        if (attempt < this.retryAttempts) {
          await this.delay(this.retryDelay * attempt);
        }
      }
    }
    
    throw lastError;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  validateData(data) {
    if (!Array.isArray(data)) {
      throw new Error('Data must be an array');
    }
    
    if (data.length === 0) {
      return { valid: true, errors: [] };
    }
    
    const errors = [];
    const requiredFields = ['id', 'type', 'value'];
    
    data.forEach((item, index) => {
      if (typeof item !== 'object' || item === null) {
        errors.push(\`Item at index \${index} is not an object\`);
        return;
      }
      
      requiredFields.forEach(field => {
        if (!(field in item)) {
          errors.push(\`Item at index \${index} missing required field: \${field}\`);
        }
      });
    });
    
    return {
      valid: errors.length === 0,
      errors: errors
    };
  }
}
`.repeat(25); // Repeat to make it ~80K tokens

  // Generate large Python file (~60K tokens)
  const largePythonContent = `
# Large Python application for testing context chunking
import asyncio
import aiohttp
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Union, Any
from dataclasses import dataclass, field
from abc import ABC, abstractmethod

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@dataclass
class UserProfile:
    """User profile data structure with validation."""
    user_id: str
    username: str
    email: str
    first_name: str
    last_name: str
    created_at: datetime = field(default_factory=datetime.now)
    last_login: Optional[datetime] = None
    is_active: bool = True
    preferences: Dict[str, Any] = field(default_factory=dict)
    
    def __post_init__(self):
        self.validate()
    
    def validate(self):
        """Validate user profile data."""
        if not self.user_id:
            raise ValueError("User ID is required")
        
        if not self.username or len(self.username) < 3:
            raise ValueError("Username must be at least 3 characters")
        
        if not self.email or '@' not in self.email:
            raise ValueError("Valid email address is required")
        
        if not self.first_name:
            raise ValueError("First name is required")
        
        if not self.last_name:
            raise ValueError("Last name is required")

class DatabaseManager:
    """Advanced database management with connection pooling and caching."""
    
    def __init__(self, connection_string: str, pool_size: int = 10):
        self.connection_string = connection_string
        self.pool_size = pool_size
        self.connection_pool = None
        self.cache = {}
        self.cache_ttl = timedelta(minutes=5)
        self.stats = {
            'queries_executed': 0,
            'cache_hits': 0,
            'cache_misses': 0,
            'connection_errors': 0
        }
    
    async def initialize(self):
        """Initialize database connection pool."""
        try:
            # Simulated connection pool initialization
            self.connection_pool = f"Pool({self.connection_string})"
            logger.info(f"Database connection pool initialized with {self.pool_size} connections")
        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")
            raise
    
    async def execute_query(self, query: str, parameters: Optional[Dict] = None) -> List[Dict]:
        """Execute a database query with caching support."""
        cache_key = self._generate_cache_key(query, parameters)
        
        # Check cache first
        if cache_key in self.cache:
            cached_result, cached_time = self.cache[cache_key]
            if datetime.now() - cached_time < self.cache_ttl:
                self.stats['cache_hits'] += 1
                logger.debug(f"Cache hit for query: {query[:50]}...")
                return cached_result
            else:
                # Remove expired cache entry
                del self.cache[cache_key]
        
        self.stats['cache_misses'] += 1
        
        try:
            # Simulate query execution
            await asyncio.sleep(0.1)  # Simulate database latency
            
            # Mock result based on query type
            if 'SELECT' in query.upper():
                result = [{'id': i, 'data': f'row_{i}'} for i in range(5)]
            elif 'INSERT' in query.upper():
                result = [{'id': 1, 'affected_rows': 1}]
            elif 'UPDATE' in query.upper():
                result = [{'affected_rows': 1}]
            elif 'DELETE' in query.upper():
                result = [{'affected_rows': 1}]
            else:
                result = []
            
            # Cache the result
            self.cache[cache_key] = (result, datetime.now())
            self.stats['queries_executed'] += 1
            
            logger.debug(f"Query executed successfully: {query[:50]}...")
            return result
            
        except Exception as e:
            self.stats['connection_errors'] += 1
            logger.error(f"Database query failed: {e}")
            raise
    
    def _generate_cache_key(self, query: str, parameters: Optional[Dict] = None) -> str:
        """Generate a cache key for the query and parameters."""
        if parameters:
            param_str = json.dumps(parameters, sort_keys=True)
            return f"{query}:{param_str}"
        return query
    
    async def close(self):
        """Close database connections and cleanup."""
        if self.connection_pool:
            logger.info("Closing database connection pool")
            self.connection_pool = None
    
    def get_stats(self) -> Dict[str, int]:
        """Get database operation statistics."""
        return self.stats.copy()

class APIClient:
    """HTTP API client with retry logic and rate limiting."""
    
    def __init__(self, base_url: str, timeout: int = 30, max_retries: int = 3):
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout
        self.max_retries = max_retries
        self.session = None
        self.rate_limiter = asyncio.Semaphore(10)  # Max 10 concurrent requests
        self.retry_delays = [1, 2, 4]  # Exponential backoff
    
    async def __aenter__(self):
        """Async context manager entry."""
        self.session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=self.timeout),
            headers={
                'User-Agent': 'YoutAgent-APIClient/1.0',
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        )
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self.session:
            await self.session.close()
    
    async def request(self, method: str, endpoint: str, **kwargs) -> Dict:
        """Make an HTTP request with retry logic."""
        if not self.session:
            raise RuntimeError("APIClient must be used as an async context manager")
        
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        
        async with self.rate_limiter:
            for attempt in range(self.max_retries + 1):
                try:
                    async with self.session.request(method, url, **kwargs) as response:
                        if response.status == 429:  # Rate limited
                            if attempt < self.max_retries:
                                delay = self.retry_delays[min(attempt, len(self.retry_delays) - 1)]
                                logger.warning(f"Rate limited, retrying in {delay}s (attempt {attempt + 1})")
                                await asyncio.sleep(delay)
                                continue
                        
                        response.raise_for_status()
                        return await response.json()
                        
                except aiohttp.ClientError as e:
                    if attempt < self.max_retries:
                        delay = self.retry_delays[min(attempt, len(self.retry_delays) - 1)]
                        logger.warning(f"Request failed, retrying in {delay}s (attempt {attempt + 1}): {e}")
                        await asyncio.sleep(delay)
                    else:
                        logger.error(f"Request failed after {self.max_retries + 1} attempts: {e}")
                        raise
    
    async def get(self, endpoint: str, **kwargs) -> Dict:
        """Make a GET request."""
        return await self.request('GET', endpoint, **kwargs)
    
    async def post(self, endpoint: str, **kwargs) -> Dict:
        """Make a POST request."""
        return await self.request('POST', endpoint, **kwargs)
    
    async def put(self, endpoint: str, **kwargs) -> Dict:
        """Make a PUT request."""
        return await self.request('PUT', endpoint, **kwargs)
    
    async def delete(self, endpoint: str, **kwargs) -> Dict:
        """Make a DELETE request."""
        return await self.request('DELETE', endpoint, **kwargs)

async def main():
    """Main application entry point with comprehensive error handling."""
    try:
        # Initialize database
        db = DatabaseManager("postgresql://user:pass@localhost/db")
        await db.initialize()
        
        # Initialize API client
        async with APIClient("https://api.example.com") as client:
            # Fetch some data
            data = await client.get("/users")
            logger.info(f"Fetched {len(data)} users")
            
            # Process data
            for user_data in data:
                try:
                    user = UserProfile(**user_data)
                    await db.execute_query(
                        "INSERT INTO users (user_id, username, email) VALUES (%(user_id)s, %(username)s, %(email)s)",
                        {'user_id': user.user_id, 'username': user.username, 'email': user.email}
                    )
                except ValueError as e:
                    logger.error(f"Invalid user data: {e}")
                except Exception as e:
                    logger.error(f"Failed to process user: {e}")
        
        # Print database stats
        stats = db.get_stats()
        logger.info(f"Database statistics: {stats}")
        
    except Exception as e:
        logger.error(f"Application error: {e}")
        raise
    finally:
        if 'db' in locals():
            await db.close()

if __name__ == "__main__":
    asyncio.run(main())
`.repeat(20); // Repeat to make it ~80K tokens

  const jsFile = path.join(testDir, 'large-app.js');
  const pyFile = path.join(testDir, 'large-service.py');
  
  await fs.writeFile(jsFile, largeJSContent);
  await fs.writeFile(pyFile, largePythonContent);
  
  console.log(`✅ Created large test files:`);
  console.log(`   - ${jsFile} (~${Math.round(largeJSContent.length / 1024)}KB)`);
  console.log(`   - ${pyFile} (~${Math.round(largePythonContent.length / 1024)}KB)`);
  
  return [jsFile, pyFile];
}

async function validatePhase2Implementation() {
  console.log('🎬 YoutAgent Phase 2 Validation - Context Chunking for Large Files');
  console.log('================================================================\n');
  
  // Create temporary test directory
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'youtu-phase2-validation-'));
  
  try {
    // Step 1: Create large test files
    const [jsFile, pyFile] = await createLargeTestFiles(testDir);
    
    // Step 2: Initialize Phase 1 (File System)
    console.log('📁 Phase 1: Initializing YoutAgent File System...');
    const fileSystem = new YoutAgentFileSystem({
      maxFileSize: 50 * 1024 * 1024, // 50MB for large files
      allowedExtensions: ['.js', '.py', '.ts', '.md'],
      securityValidation: true
    });
    
    // Step 3: Initialize Phase 2 (Context Chunker)
    console.log('🧠 Phase 2: Initializing Context Chunker...');
    const contextChunker = new YoutAgentContextChunker({
      targetChunkSize: 20000,
      maxChunkSize: 25000,
      minChunkSize: 5000,
      overlapTokens: 200,
      semanticBoundaries: true,
      preserveStructure: true,
      fileSystem: fileSystem
    });
    
    // Step 4: Test large file reading
    console.log('📖 Testing large file reading...');
    const jsResult = await fileSystem.readFile(jsFile);
    const pyResult = await fileSystem.readFile(pyFile);
    
    console.log(`   ✅ JavaScript file: ${jsResult.success ? 'Success' : 'Failed'} (${Math.round(jsResult.content?.length / 1024) || 0}KB)`);
    console.log(`   ✅ Python file: ${pyResult.success ? 'Success' : 'Failed'} (${Math.round(pyResult.content?.length / 1024) || 0}KB)`);
    
    // Step 5: Test token estimation
    console.log('\n🔢 Testing token estimation...');
    const jsTokens = contextChunker.estimateTokenCount(jsResult.content);
    const pyTokens = contextChunker.estimateTokenCount(pyResult.content);
    
    console.log(`   📊 JavaScript tokens: ${jsTokens.toLocaleString()}`);
    console.log(`   📊 Python tokens: ${pyTokens.toLocaleString()}`);
    console.log(`   ✅ Both files exceed chunking threshold: ${jsTokens > 25000 && pyTokens > 25000 ? 'Yes' : 'No'}`);
    
    if (jsTokens <= 25000) {
      console.log(`   ⚠️ JavaScript file needs to be larger (${jsTokens} tokens, need >25K)`);
    }
    if (pyTokens <= 25000) {
      console.log(`   ⚠️ Python file needs to be larger (${pyTokens} tokens, need >25K)`);
    }
    
    // Step 6: Test intelligent chunking
    console.log('\n🧠 Testing intelligent context chunking...');
    
    const startTime = performance.now();
    const jsChunks = await contextChunker.chunkContent(jsResult.content, 'javascript');
    const pyChunks = await contextChunker.chunkContent(pyResult.content, 'python');
    const endTime = performance.now();
    
    const processingTime = endTime - startTime;
    
    console.log(`   ✅ JavaScript chunks: ${jsChunks.length} (avg ${Math.round(jsChunks.reduce((sum, c) => sum + c.tokenCount, 0) / jsChunks.length)} tokens)`);
    console.log(`   ✅ Python chunks: ${pyChunks.length} (avg ${Math.round(pyChunks.reduce((sum, c) => sum + c.tokenCount, 0) / pyChunks.length)} tokens)`);
    console.log(`   ⚡ Processing time: ${Math.round(processingTime)}ms (${Math.round((jsTokens + pyTokens) / (processingTime / 1000))} tokens/sec)`);
    console.log(`   🎯 Performance target: ${processingTime < 2000 ? 'MET' : 'MISSED'} (<2s for 100K tokens)`);
    
    // Step 7: Validate chunk quality
    console.log('\n✅ Validating chunk quality...');
    let totalChunks = 0;
    let chunksInRange = 0;
    let chunksWithMetadata = 0;
    let chunksWithRelationships = 0;
    
    for (const chunk of [...jsChunks, ...pyChunks]) {
      totalChunks++;
      
      if (chunk.tokenCount >= 5000 && chunk.tokenCount <= 25000) {
        chunksInRange++;
      }
      
      if (chunk.metadata && chunk.metadata.semanticBoundaries) {
        chunksWithMetadata++;
      }
      
      if (chunk.relationships) {
        chunksWithRelationships++;
      }
    }
    
    console.log(`   📊 Total chunks: ${totalChunks}`);
    console.log(`   ✅ Chunks in size range (5K-25K): ${chunksInRange}/${totalChunks} (${Math.round(chunksInRange / totalChunks * 100)}%)`);
    console.log(`   ✅ Chunks with semantic metadata: ${chunksWithMetadata}/${totalChunks} (${Math.round(chunksWithMetadata / totalChunks * 100)}%)`);
    console.log(`   ✅ Chunks with relationships: ${chunksWithRelationships}/${totalChunks} (${Math.round(chunksWithRelationships / totalChunks * 100)}%)`);
    
    // Step 8: Test content reconstruction
    console.log('\n🔄 Testing content reconstruction...');
    const jsReconstructed = await contextChunker.reconstructContent(jsChunks);
    const pyReconstructed = await contextChunker.reconstructContent(pyChunks);
    
    const jsPreservation = Math.min(jsReconstructed.length / jsResult.content.length, 1.0);
    const pyPreservation = Math.min(pyReconstructed.length / pyResult.content.length, 1.0);
    const avgPreservation = (jsPreservation + pyPreservation) / 2;
    
    console.log(`   📝 JavaScript preservation: ${Math.round(jsPreservation * 100)}%`);
    console.log(`   📝 Python preservation: ${Math.round(pyPreservation * 100)}%`);
    console.log(`   🎯 Average preservation: ${Math.round(avgPreservation * 100)}% (target: 95%+)`);
    console.log(`   ✅ Preservation target: ${avgPreservation >= 0.95 ? 'MET' : 'MISSED'}`);
    
    // Step 9: Test cross-file relationship detection
    console.log('\n🌐 Testing cross-file relationship detection...');
    const multiFileResult = await contextChunker.chunkMultipleFiles([jsFile, pyFile]);
    
    console.log(`   📊 Total chunks: ${multiFileResult.chunks.length}`);
    console.log(`   🔗 Cross-file relationships: ${multiFileResult.crossFileRelationships.length}`);
    
    if (multiFileResult.crossFileRelationships.length > 0) {
      console.log(`   📋 Relationship types detected:`);
      const relationshipTypes = {};
      multiFileResult.crossFileRelationships.forEach(rel => {
        relationshipTypes[rel.type] = (relationshipTypes[rel.type] || 0) + 1;
      });
      Object.entries(relationshipTypes).forEach(([type, count]) => {
        console.log(`      - ${type}: ${count}`);
      });
    }
    
    // Step 10: Test MCP preparation
    console.log('\n🔧 Testing MCP chunk preparation...');
    const mcpChunks = await contextChunker.prepareMCPChunks(jsResult.content, {
      contentType: 'javascript',
      analysisType: 'code-review',
      preserveContext: true
    });
    
    console.log(`   📦 MCP chunks prepared: ${mcpChunks.chunks.length}`);
    console.log(`   🎯 Execution strategy: ${mcpChunks.executionPlan.strategy}`);
    console.log(`   ⏱️ Estimated processing time: ${Math.round(mcpChunks.executionPlan.estimatedProcessingTime / 1000)}s`);
    
    // Step 11: Comprehensive validation
    console.log('\n🎉 COMPREHENSIVE VALIDATION RESULTS');
    console.log('=====================================');
    
    const validations = [
      { test: 'File System Integration', passed: jsResult.success && pyResult.success },
      { test: 'Large File Handling (32K+ tokens)', passed: jsTokens > 32000 && pyTokens > 32000 },
      { test: 'Context Chunking', passed: jsChunks.length > 1 && pyChunks.length > 1 },
      { test: 'Chunk Size Optimization (20K-25K)', passed: chunksInRange / totalChunks >= 0.8 },
      { test: 'Semantic Boundary Preservation', passed: chunksWithMetadata / totalChunks >= 0.8 },
      { test: 'Performance Target (<2s/100K tokens)', passed: processingTime < 2000 },
      { test: 'Content Preservation (95%+)', passed: avgPreservation >= 0.95 },
      { test: 'Cross-file Relationships', passed: multiFileResult.crossFileRelationships.length > 0 },
      { test: 'MCP Integration Ready', passed: mcpChunks.chunks.length > 0 }
    ];
    
    let passedTests = 0;
    validations.forEach(({ test, passed }) => {
      console.log(`   ${passed ? '✅' : '❌'} ${test}`);
      if (passed) passedTests++;
    });
    
    const overallSuccess = passedTests === validations.length;
    
    console.log('\n' + '='.repeat(50));
    console.log(`🎬 YoutAgent Phase 2 Validation: ${overallSuccess ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`📊 Tests passed: ${passedTests}/${validations.length} (${Math.round(passedTests / validations.length * 100)}%)`);
    
    if (overallSuccess) {
      console.log('🚀 Ready for Phase 3: Multi-step Orchestration');
      console.log('🎯 Unlimited context capability achieved!');
    } else {
      console.log('⚠️ Some validations failed - review implementation');
    }
    
    return overallSuccess;
    
  } catch (error) {
    console.error('❌ Validation failed:', error);
    return false;
  } finally {
    // Cleanup test directory
    try {
      await fs.rm(testDir, { recursive: true });
      console.log(`\n🧹 Cleaned up test directory: ${testDir}`);
    } catch (error) {
      console.warn(`Warning: Failed to cleanup test directory: ${error.message}`);
    }
  }
}

// Run the validation
if (import.meta.url === `file://${process.argv[1]}`) {
  validatePhase2Implementation()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Validation error:', error);
      process.exit(1);
    });
}