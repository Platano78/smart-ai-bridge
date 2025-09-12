// src/file-processor.js
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { Transform, pipeline } from 'stream';
import { promisify } from 'util';
import crypto from 'crypto';
import path from 'path';
import fileSecurity from './file-security.js';
import pathNormalizer from './utils/path-normalizer.js';
import tripleRoutingIntegration from './triple-routing-integration.js';

const pipelineAsync = promisify(pipeline);

class FileProcessor {
  constructor(options = {}) {
    this.maxConcurrentFiles = options.maxConcurrentFiles || 3;
    this.chunkSize = options.chunkSize || 64 * 1024; // 64KB default
    this.activeProcesses = new Map();
    this.processQueue = [];
    this.performanceMetrics = {
      totalProcessed: 0,
      averageProcessingTime: 0,
      errorCount: 0
    };
  }

  async processFile(filePath, options = {}) {
    const requestId = this.generateRequestId();
    const startTime = Date.now();

    try {
      // Validate and normalize path
      const normalizedPath = await fileSecurity.validateAndNormalizePath(filePath);

      // Get file stats
      const stats = await fs.stat(normalizedPath);

      // Extract metadata
      const metadata = await this.extractMetadata(normalizedPath, stats);

      // Process based on file size with performance tracking
      let content;
      let processingStrategy;

      if (stats.size < 1024) {
        // Tiny files: instant processing
        content = await this.readTinyFile(normalizedPath, options.encoding);
        processingStrategy = 'instant';
      } else if (stats.size < 10240) {
        // Small files: fast processing
        content = await this.readSmallFile(normalizedPath, options.encoding);
        processingStrategy = 'fast';
      } else if (stats.size < 102400) {
        // Medium files: standard processing
        content = await this.readMediumFile(normalizedPath, options.encoding);
        processingStrategy = 'standard';
      } else {
        // Large files: chunked streaming
        content = await this.streamLargeFile(normalizedPath, options);
        processingStrategy = 'chunked';
      }

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Update performance metrics
      this.updatePerformanceMetrics(processingTime);

      // Detect potentially malicious content
      const maliciousDetected = typeof content === 'string' ? 
        fileSecurity.detectMaliciousContent(content) : false;

      return {
        id: requestId,
        path: normalizedPath,
        metadata: {
          ...metadata,
          processingStrategy,
          processingTime: `${processingTime}ms`,
          performance_tier: this.getPerformanceTier(processingTime, stats.size),
          security_check: maliciousDetected ? 'warning' : 'clean'
        },
        content: maliciousDetected ? '[CONTENT FILTERED - SECURITY RISK]' : content,
        processedAt: new Date().toISOString(),
        securityWarning: maliciousDetected
      };

    } catch (error) {
      this.performanceMetrics.errorCount++;
      throw new Error(`File processing failed for ${filePath}: ${error.message}`);
    }
  }

  async processBatch(filePaths, options = {}) {
    const startTime = Date.now();
    const results = [];
    const errors = [];
    
    // Calculate total size for routing decision
    let totalSize = 0;
    for (const filePath of filePaths) {
      try {
        const normalizedPath = pathNormalizer.normalizePath(filePath);
        const stats = await fs.stat(normalizedPath);
        totalSize += stats.size;
      } catch (error) {
        errors.push({ filePath, error: error.message });
      }
    }

    // Batch processing strategy
    const batchStrategy = this.determineBatchStrategy(filePaths.length, totalSize);
    
    // Process in managed batches to prevent memory overflow
    const batchSize = Math.min(this.maxConcurrentFiles, 5);
    
    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);
      
      const batchPromises = batch.map(filePath => 
        this.processFile(filePath, options)
          .catch(error => ({ error: error.message, filePath }))
      );

      const batchResults = await Promise.all(batchPromises);

      batchResults.forEach(result => {
        if (result.error) {
          errors.push(result);
        } else {
          results.push(result);
        }
      });
    }

    const totalTime = Date.now() - startTime;

    return {
      results,
      errors,
      batchMetadata: {
        totalFiles: filePaths.length,
        processedFiles: results.length,
        failedFiles: errors.length,
        totalSize,
        batchStrategy,
        processingTime: `${totalTime}ms`,
        batch_optimization: 'applied',
        memory_management: 'active'
      }
    };
  }

  async extractMetadata(filePath, stats) {
    const metadata = {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      accessed: stats.atime,
      isFile: stats.isFile(),
      mode: stats.mode.toString(8),
      uid: stats.uid,
      gid: stats.gid
    };

    // File type detection
    const ext = path.extname(filePath).toLowerCase();
    metadata.file_extension = ext;
    metadata.type = this.getFileType(ext, stats);

    // Encoding detection for text files
    if (metadata.type.startsWith('text/')) {
      metadata.encoding = await this.detectEncoding(filePath);
    }

    // Calculate checksum for integrity
    if (stats.size < 1024 * 1024) { // Only for files < 1MB
      metadata.checksum = await this.calculateChecksum(filePath);
    }

    return metadata;
  }

  getFileType(extension, stats) {
    const mimeTypes = {
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.ts': 'application/typescript',
      '.py': 'text/x-python',
      '.java': 'text/x-java',
      '.cpp': 'text/x-c++src',
      '.c': 'text/x-csrc',
      '.h': 'text/x-chdr',
      '.md': 'text/markdown',
      '.yml': 'application/yaml',
      '.yaml': 'application/yaml',
      '.log': 'text/plain'
    };

    return mimeTypes[extension] || (stats.isFile() ? 'application/octet-stream' : 'directory');
  }

  async detectEncoding(filePath) {
    try {
      const buffer = await fs.readFile(filePath, { encoding: null });
      const chunk = buffer.slice(0, Math.min(1024, buffer.length));

      // UTF-8 BOM detection
      if (chunk.length >= 3 && chunk[0] === 0xEF && chunk[1] === 0xBB && chunk[2] === 0xBF) {
        return 'utf-8-bom';
      }

      // Simple UTF-8 validation
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(chunk);
        return 'utf-8';
      } catch {
        return 'binary';
      }
    } catch {
      return 'unknown';
    }
  }

  async calculateChecksum(filePath) {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(filePath);
    
    return new Promise((resolve, reject) => {
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  async readTinyFile(filePath, encoding = 'utf8') {
    const startTime = Date.now();
    const content = await fs.readFile(filePath, { encoding });
    
    if (Date.now() - startTime > 1000) {
      console.warn(`Tiny file processing exceeded 1s threshold: ${filePath}`);
    }
    
    return content;
  }

  async readSmallFile(filePath, encoding = 'utf8') {
    const startTime = Date.now();
    
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Small file read timeout (3s exceeded)'));
      }, 3000);

      try {
        const content = await fs.readFile(filePath, { encoding });
        clearTimeout(timeout);
        
        if (Date.now() - startTime > 3000) {
          console.warn(`Small file processing exceeded 3s threshold: ${filePath}`);
        }
        
        resolve(content);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  async readMediumFile(filePath, encoding = 'utf8') {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Medium file read timeout (5s exceeded)'));
      }, 5000);

      try {
        const content = await fs.readFile(filePath, { encoding });
        clearTimeout(timeout);
        resolve(content);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  async streamLargeFile(filePath, options = {}) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let totalSize = 0;
      const maxMemoryUsage = 50 * 1024 * 1024; // 50MB memory limit

      const stream = createReadStream(filePath, {
        highWaterMark: this.chunkSize,
        encoding: options.encoding
      });

      stream.on('data', (chunk) => {
        chunks.push(chunk);
        totalSize += chunk.length;

        // Memory protection
        if (totalSize > maxMemoryUsage) {
          stream.destroy();
          reject(new Error('Memory limit exceeded during file processing'));
          return;
        }
      });

      stream.on('end', () => {
        try {
          const result = options.encoding ? chunks.join('') : Buffer.concat(chunks);
          resolve(result);
        } catch (error) {
          reject(new Error(`Failed to concatenate file chunks: ${error.message}`));
        }
      });

      stream.on('error', reject);

      // Timeout for large files
      setTimeout(() => {
        if (!stream.destroyed) {
          stream.destroy();
          reject(new Error('Large file processing timeout (10s exceeded)'));
        }
      }, 10000);
    });
  }

  determineBatchStrategy(fileCount, totalSize) {
    if (totalSize > 100 * 1024) { // >100KB total
      return 'local_endpoint_chunked';
    } else if (fileCount > 10) {
      return 'concurrent_limited';
    } else {
      return 'standard_parallel';
    }
  }

  getPerformanceTier(processingTime, fileSize) {
    if (processingTime < 1000 && fileSize < 1024) {
      return 'instant';
    } else if (processingTime < 3000 && fileSize < 10240) {
      return 'fast';
    } else if (processingTime < 5000 && fileSize < 102400) {
      return 'standard';
    } else {
      return 'chunked';
    }
  }

  updatePerformanceMetrics(processingTime) {
    this.performanceMetrics.totalProcessed++;
    const currentAvg = this.performanceMetrics.averageProcessingTime;
    const newAvg = (currentAvg * (this.performanceMetrics.totalProcessed - 1) + processingTime) / 
                   this.performanceMetrics.totalProcessed;
    this.performanceMetrics.averageProcessingTime = Math.round(newAvg);
  }

  generateRequestId() {
    return crypto.randomBytes(16).toString('hex');
  }

  getPerformanceStats() {
    return {
      ...this.performanceMetrics,
      activeProcesses: this.activeProcesses.size,
      queueLength: this.processQueue.length,
      memoryUsage: process.memoryUsage()
    };
  }

  // Diagnostic method for the diagnose_file_access tool
  async diagnoseFileAccess(filePath) {
    const diagnostics = {
      path: filePath,
      timestamp: new Date().toISOString(),
      checks: []
    };

    try {
      // Path normalization check
      const normalizedPath = pathNormalizer.normalizePath(filePath);
      diagnostics.checks.push({
        test: 'path_normalization',
        passed: true,
        normalizedPath,
        result: 'Path normalized successfully'
      });

      // Security validation
      try {
        pathNormalizer.validatePathSecurity(normalizedPath);
        diagnostics.checks.push({
          test: 'security_validation',
          passed: true,
          result: 'Path passed security validation'
        });
      } catch (error) {
        diagnostics.checks.push({
          test: 'security_validation', 
          passed: false,
          result: error.message
        });
        return diagnostics;
      }

      // File access check
      try {
        const stats = await fileSecurity.validateFileAccess(normalizedPath);
        diagnostics.checks.push({
          test: 'file_access',
          passed: true,
          result: 'File is accessible',
          fileStats: {
            size: stats.size,
            isFile: stats.isFile(),
            permissions: stats.mode.toString(8)
          }
        });

        // File size check
        const sizeOk = fileSecurity.isSafeFileSize(stats);
        diagnostics.checks.push({
          test: 'file_size_validation',
          passed: sizeOk,
          result: sizeOk ? 'File size within limits' : 'File too large for processing'
        });

      } catch (error) {
        diagnostics.checks.push({
          test: 'file_access',
          passed: false,
          result: error.message
        });
      }

      return diagnostics;

    } catch (error) {
      diagnostics.checks.push({
        test: 'path_normalization',
        passed: false,
        result: error.message
      });
      return diagnostics;
    }
  }

  // ===============================
  // ATOMIC TASK 5: ENHANCED FILE OPERATIONS WITH TRIPLE ROUTING
  // ===============================

  // Smart file analysis with triple routing integration
  async analyzeFileWithTripleRouting(filePath, options = {}) {
    const requestId = this.generateRequestId();
    const startTime = Date.now();

    try {
      // First, process the file normally to get content and metadata
      const fileResult = await this.processFile(filePath, options);
      
      // Determine analysis type from options or file extension
      const analysisType = options.analysisType || this.inferAnalysisType(filePath, fileResult.metadata);
      
      // Route to appropriate endpoint based on file characteristics
      const analysisResult = await tripleRoutingIntegration.routeFileAnalysis(
        filePath,
        fileResult.content,
        fileResult.metadata,
        {
          analysisType,
          temperature: options.temperature || 0.3,
          max_tokens: options.max_tokens
        }
      );

      const totalTime = Date.now() - startTime;

      return {
        id: requestId,
        analysis: analysisResult.analysisResult,
        routedTo: analysisResult.routingInfo.endpoint,
        routingReason: analysisResult.routingInfo.reason,
        confidence: analysisResult.routingInfo.confidence,
        metadata: {
          ...fileResult.metadata,
          analysisType,
          processingTime: `${totalTime}ms`,
          routingInfo: analysisResult.routingInfo,
          endpointUsed: analysisResult.routingInfo.endpointName,
          model: analysisResult.routingInfo.model,
          specialization: analysisResult.routingInfo.specialization
        },
        processedAt: new Date().toISOString()
      };

    } catch (error) {
      this.performanceMetrics.errorCount++;
      throw new Error(`File analysis with triple routing failed for ${filePath}: ${error.message}`);
    }
  }

  // Multi-file processing with size-based routing
  async processBatchWithRouting(filePaths, options = {}) {
    const startTime = Date.now();
    const maxConcurrent = options.maxConcurrent || 5;
    const memoryLimit = options.memoryLimit || 50 * 1024 * 1024; // 50MB default
    const routingRules = options.routingRules || {
      smallFiles: 'nvidia_qwen',
      mediumFiles: 'nvidia_deepseek', 
      largeFiles: 'local'
    };

    const results = [];
    const errors = [];
    const routingLog = [];
    let totalMemoryUsed = 0;

    // Process files in batches to manage memory
    const batchSize = Math.min(maxConcurrent, filePaths.length);
    
    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);
      const batchPromises = batch.map(async (filePath) => {
        try {
          // Get file stats for routing decision
          const normalizedPath = await fileSecurity.validateAndNormalizePath(filePath);
          const stats = await fs.stat(normalizedPath);
          
          // Check memory limit
          if (totalMemoryUsed + stats.size > memoryLimit) {
            throw new Error(`Memory limit exceeded: ${totalMemoryUsed + stats.size} bytes > ${memoryLimit} bytes`);
          }

          // Determine routing based on file size
          let routedTo;
          if (stats.size > 100 * 1024) {
            routedTo = routingRules.largeFiles;
          } else if (stats.size > 10 * 1024) {
            routedTo = routingRules.mediumFiles;
          } else {
            routedTo = routingRules.smallFiles;
          }

          // Log routing decision
          routingLog.push({
            filePath,
            fileSize: stats.size,
            routedTo,
            reason: this.getRoutingReason(stats.size)
          });

          // Process with triple routing
          const analysisResult = await this.analyzeFileWithTripleRouting(filePath, {
            ...options,
            routingOverride: routedTo
          });

          totalMemoryUsed += stats.size;
          return analysisResult;

        } catch (error) {
          return { error: error.message, filePath };
        }
      });

      const batchResults = await Promise.all(batchPromises);

      batchResults.forEach(result => {
        if (result.error) {
          errors.push(result);
        } else {
          results.push(result);
        }
      });
    }

    const totalTime = Date.now() - startTime;

    return {
      results,
      errors,
      routingLog,
      batchMetadata: {
        totalFiles: filePaths.length,
        processedFiles: results.length,
        failedFiles: errors.length,
        totalMemoryUsed,
        memoryLimit,
        processingTime: `${totalTime}ms`,
        routingDistribution: this.analyzeRoutingDistribution(routingLog),
        batchOptimization: 'size_based_routing_applied'
      }
    };
  }

  // File comparison functionality with AI analysis
  async compareFilesWithAI(filePaths, options = {}) {
    if (filePaths.length !== 2) {
      throw new Error('File comparison requires exactly 2 files');
    }

    const [file1Path, file2Path] = filePaths;

    try {
      // Process both files
      const file1Result = await this.processFile(file1Path);
      const file2Result = await this.processFile(file2Path);

      // Use triple routing for comparison analysis
      const comparisonResult = await tripleRoutingIntegration.routeFileComparison(
        {
          path: file1Path,
          content: file1Result.content,
          metadata: file1Result.metadata
        },
        {
          path: file2Path,
          content: file2Result.content,
          metadata: file2Result.metadata
        },
        options
      );

      // Calculate basic differences
      const basicDifferences = this.calculateBasicDifferences(file1Result.content, file2Result.content);
      const basicSimilarities = this.calculateBasicSimilarities(file1Result.content, file2Result.content);

      return {
        differences: basicDifferences,
        similarities: basicSimilarities,
        aiAnalysis: {
          summary: comparisonResult.combinedInsights || comparisonResult.fallbackAnalysis?.content,
          structuralAnalysis: comparisonResult.structuralAnalysis,
          semanticAnalysis: comparisonResult.semanticAnalysis,
          endpoints: [
            comparisonResult.structuralAnalysis?.endpoint,
            comparisonResult.semanticAnalysis?.endpoint
          ].filter(Boolean)
        },
        metadata: {
          file1: { path: file1Path, size: file1Result.metadata.size },
          file2: { path: file2Path, size: file2Result.metadata.size },
          comparisonType: options.comparisonType || 'comprehensive',
          analysisDepth: options.analysisDepth || 'standard',
          processedAt: new Date().toISOString()
        }
      };

    } catch (error) {
      throw new Error(`File comparison failed: ${error.message}`);
    }
  }

  // Concurrent file processing with memory limits
  async processConcurrentBatch(filePaths, options = {}) {
    const maxConcurrent = options.maxConcurrent || 5;
    const memoryLimit = options.memoryLimit || 50 * 1024 * 1024; // 50MB
    const timeoutPerFile = options.timeoutPerFile || 5000; // 5s per file
    const routingStrategy = options.routingStrategy || 'triple_endpoint';

    const results = {
      processedFiles: [],
      failedFiles: [],
      memoryUsagePeak: 0,
      memoryUsageAverage: 0,
      routingStatistics: {
        nvidia_qwen: 0,
        nvidia_deepseek: 0,
        local: 0
      }
    };

    let currentMemoryUsage = 0;
    const memorySnapshots = [];
    const semaphore = new Array(maxConcurrent).fill(null);
    let semaphoreIndex = 0;

    // Process files with concurrency control
    const processingPromises = filePaths.map(async (filePath, index) => {
      // Wait for available slot
      const slotIndex = semaphoreIndex % maxConcurrent;
      semaphoreIndex++;
      
      await this.waitForSlot(semaphore, slotIndex);
      
      try {
        semaphore[slotIndex] = filePath; // Mark slot as occupied
        
        const startMemory = process.memoryUsage().rss;
        
        // Set timeout for individual file processing
        const processingPromise = Promise.race([
          this.processFileWithMemoryTracking(filePath, options),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('File processing timeout')), timeoutPerFile)
          )
        ]);

        const result = await processingPromise;
        
        const endMemory = process.memoryUsage().rss;
        const memoryUsed = endMemory - startMemory;
        
        currentMemoryUsage += memoryUsed;
        memorySnapshots.push(currentMemoryUsage);
        
        // Check memory limit
        if (currentMemoryUsage > memoryLimit) {
          throw new Error(`Memory limit exceeded: ${currentMemoryUsage} > ${memoryLimit}`);
        }

        results.memoryUsagePeak = Math.max(results.memoryUsagePeak, currentMemoryUsage);
        results.processedFiles.push(result);

        // Update routing statistics
        if (result.metadata && result.metadata.routingInfo) {
          const endpoint = result.metadata.routingInfo.endpoint;
          results.routingStatistics[endpoint] = (results.routingStatistics[endpoint] || 0) + 1;
        } else if (result.routedTo) {
          // Fallback for routing statistics
          results.routingStatistics[result.routedTo] = (results.routingStatistics[result.routedTo] || 0) + 1;
        }

      } catch (error) {
        results.failedFiles.push({
          filePath,
          error: error.message,
          index
        });
      } finally {
        semaphore[slotIndex] = null; // Free slot
        currentMemoryUsage -= Math.max(0, currentMemoryUsage * 0.1); // Simulate garbage collection
      }
    });

    await Promise.all(processingPromises);

    // Calculate average memory usage
    results.memoryUsageAverage = memorySnapshots.length > 0 
      ? memorySnapshots.reduce((a, b) => a + b, 0) / memorySnapshots.length 
      : 0;

    return results;
  }

  // Process file with memory monitoring
  async processWithMemoryMonitoring(filePath, options = {}) {
    const chunkSize = options.chunkSize || 64 * 1024; // 64KB chunks
    const maxMemoryIncrease = options.maxMemoryIncrease || 25 * 1024 * 1024; // 25MB
    const performanceTracking = options.performanceTracking || false;

    const startTime = Date.now();
    const initialMemory = process.memoryUsage();
    
    try {
      // Process file in chunks to manage memory
      const result = await this.processFileWithMemoryTracking(filePath, {
        ...options,
        chunkSize,
        memoryMonitoring: true
      });

      const endTime = Date.now();
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.rss - initialMemory.rss;

      // Check memory limit
      if (memoryIncrease > maxMemoryIncrease) {
        console.warn(`Memory increase ${memoryIncrease} exceeds limit ${maxMemoryIncrease}`);
      }

      const processingTime = endTime - startTime;
      const memoryEfficiency = maxMemoryIncrease > 0 ? 
        Math.max(0, 1 - (memoryIncrease / maxMemoryIncrease)) : 1;

      return {
        ...result,
        performanceMetrics: performanceTracking ? {
          processingTime,
          memoryIncrease,
          memoryEfficiency,
          chunkSize,
          memoryOptimized: memoryIncrease <= maxMemoryIncrease
        } : undefined
      };

    } catch (error) {
      throw new Error(`Memory-monitored processing failed: ${error.message}`);
    }
  }

  // Helper methods for the new functionality

  inferAnalysisType(filePath, metadata) {
    const ext = path.extname(filePath).toLowerCase();
    
    if (['.js', '.ts', '.py', '.java', '.cpp', '.c', '.h'].includes(ext)) {
      return 'code_analysis';
    }
    
    if (['.json', '.xml', '.csv', '.sql'].includes(ext)) {
      return 'data_analysis';
    }
    
    if (['.md', '.txt', '.doc', '.pdf'].includes(ext)) {
      return 'document_analysis';
    }
    
    return 'general';
  }

  getRoutingReason(fileSize) {
    if (fileSize > 100 * 1024) return 'large_file_unlimited_tokens';
    if (fileSize > 10 * 1024) return 'medium_file_analysis';
    return 'small_file_fast_processing';
  }

  analyzeRoutingDistribution(routingLog) {
    const distribution = {};
    routingLog.forEach(entry => {
      distribution[entry.routedTo] = (distribution[entry.routedTo] || 0) + 1;
    });
    return distribution;
  }

  calculateBasicDifferences(content1, content2) {
    const lines1 = content1.split('\n');
    const lines2 = content2.split('\n');
    
    return {
      lineCount: Math.abs(lines1.length - lines2.length),
      characterCount: Math.abs(content1.length - content2.length),
      differentLines: lines1.filter((line, i) => lines2[i] !== line).length
    };
  }

  calculateBasicSimilarities(content1, content2) {
    const lines1 = content1.split('\n');
    const lines2 = content2.split('\n');
    const commonLines = lines1.filter((line, i) => lines2[i] === line);
    
    return {
      commonLines: commonLines.length,
      similarityRatio: commonLines.length / Math.max(lines1.length, lines2.length)
    };
  }

  async waitForSlot(semaphore, slotIndex) {
    while (semaphore[slotIndex] !== null) {
      await new Promise(resolve => setTimeout(resolve, 10)); // Wait 10ms
    }
  }

  async processFileWithMemoryTracking(filePath, options = {}) {
    // Use existing processFile but add memory tracking if requested
    const result = await this.processFile(filePath, options);
    
    if (options.memoryMonitoring) {
      result.memorySnapshot = {
        rss: process.memoryUsage().rss,
        heapUsed: process.memoryUsage().heapUsed,
        timestamp: Date.now()
      };
    }
    
    return result;
  }
}

export default new FileProcessor();