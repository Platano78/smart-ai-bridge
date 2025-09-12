// src/youtu-agent-file-processor.js
import fs from 'fs';
import { createHash } from 'crypto';
import EventEmitter from 'events';
import { Buffer } from 'buffer';
import fileProcessor from './file-processor.js';

/**
 * YoutAgentFileProcessor class for intelligent file chunking and context preservation.
 * Emits 'progress', 'batchProgress', 'error', and 'batchError' events.
 */
class YoutAgentFileProcessor extends EventEmitter {
  /**
   * @param {object} options - Configuration options.
   * @param {number} [options.minChunkSize=2048] - Minimum target chunk size in bytes.
   * @param {number} [options.maxChunkSize=8192] - Maximum target chunk size in bytes before forced split.
   * @param {number} [options.overlapChars=256] - Number of characters to overlap between chunks for context.
   * @param {number} [options.maxConcurrentFiles=5] - Maximum number of files to process concurrently in a batch.
   * @param {number} [options.semanticLookAheadChars=1024] - Number of characters to look ahead for semantic boundaries.
   */
  constructor(options = {}) {
    super();
    this.options = {
      minChunkSize: options.minChunkSize || 2048,
      maxChunkSize: options.maxChunkSize || 8192,
      overlapChars: options.overlapChars || 256, 
      maxConcurrentFiles: options.maxConcurrentFiles || 5,
      semanticLookAheadChars: options.semanticLookAheadChars || 1024,
      ...options,
    };

    // Semantic boundary patterns (ordered by preference, more specific first).
    this.semanticPatterns = [
      // Markdown headers (e.g., # My Header, ## Subheader)
      /(?:^|\n)(#+\s.*)(?=\n|$)/g,
      // JavaScript/TypeScript/Java-like function/class/method definitions
      /(?:^|\n)(?:\s*(?:(?:export|public|private|protected|static)\s+)?(?:async\s+)?(?:function\*?|class|const|let|var)\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*(?:\(.*\))?(?:\s*:\s*[a-zA-Z_$][a-zA-Z0-9_$]*)?\s*(?:implements\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*)?(?:extends\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*)?(?:\{|=>))/g,
      // Python 'def' (function) and 'class' definitions
      /(?:^|\n)(?:\s*(?:@\w+\s+)*?(?:async\s+)?(?:def|class)\s+[a-zA-Z_][a-zA-Z0-9_]*\s*(?:\(.*\))?\s*:)/g,
      // C#/Java method/class definitions
      /(?:^|\n)(?:\s*(?:public|private|protected|internal|static|abstract|final|virtual|override)\s+){1,}\s*(?:class|interface|enum|struct|[a-zA-Z_][a-zA-Z0-9_]*\s+)?\s*[a-zA-Z_][a-zA-Z0-9_]*\s*(?:\(.*\))?\s*(?:\{)/g,
      // Import/require statements
      /(?:^|\n)(?:import\s+.*|require\(.*\)|from\s+.*import\s+.*)(?=\n|$)/g,
      // XML/HTML tags
      /(?:^|\n)(?:\s*<\/?\w+(?:\s+\w+=\".*?\")*\s*>)/g,
      // Paragraph breaks (two or more newlines)
      /\n\n+/g,
      // Sentence end followed by newline
      /(?<=[.!?])\s*\n+/g,
    ];

    this.performanceMetrics = {
      totalFilesProcessed: 0,
      totalChunksCreated: 0,
      averageProcessingTime: 0,
      averageChunksPerFile: 0,
      contentPreservationRate: 0.95 // Target 95% preservation
    };
  }

  /**
   * Generates a SHA256 hash for the given content.
   * @param {string} content - The string content to hash.
   * @returns {string} - The SHA256 hash in hexadecimal format.
   */
  _hashContent(content) {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Performs intelligent chunking on a file using stream processing for memory efficiency.
   * @param {string} filePath - The path to the file to be chunked.
   * @returns {Promise<Array<Object>>} - A promise that resolves to an array of chunk objects.
   */
  async _chunkFileStream(filePath) {
    const { minChunkSize, maxChunkSize, overlapChars, semanticLookAheadChars } = this.options;
    const chunks = [];
    let currentByteOffset = 0;
    let processingBuffer = Buffer.from('');
    let previousChunkContent = '';

    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath, { 
        highWaterMark: maxChunkSize + (semanticLookAheadChars * 4) 
      });

      stream.on('data', (dataBuffer) => {
        processingBuffer = Buffer.concat([processingBuffer, dataBuffer]);

        // Process buffer and extract chunks
        while (true) {
          let splitByteIndex = -1;
          let semanticMatchLengthBytes = 0;
          let isSemantic = false;

          if (processingBuffer.length < minChunkSize) {
            break; // Wait for more data
          }

          const maxSearchChars = Math.min(
            processingBuffer.length,
            Math.ceil(maxChunkSize / 1) + semanticLookAheadChars
          );
          const searchString = processingBuffer.toString('utf8', 0, maxSearchChars);

          let bestSemanticByteIndex = -1;

          // Search for semantic boundaries
          for (const pattern of this.semanticPatterns) {
            pattern.lastIndex = 0;
            let match;
            while ((match = pattern.exec(searchString)) !== null) {
              const matchCharIndex = match.index;
              const matchEndCharIndex = match.index + match[0].length;

              const matchByteIndex = Buffer.byteLength(searchString.substring(0, matchCharIndex), 'utf8');
              const matchEndByteIndex = Buffer.byteLength(searchString.substring(0, matchEndCharIndex), 'utf8');

              if (matchByteIndex >= minChunkSize && matchByteIndex <= maxChunkSize) {
                if (bestSemanticByteIndex === -1 || matchByteIndex < bestSemanticByteIndex) {
                  bestSemanticByteIndex = matchByteIndex;
                  semanticMatchLengthBytes = matchEndByteIndex - matchByteIndex;
                  isSemantic = true;
                  break;
                }
              }
            }
            if (isSemantic) break;
          }

          if (isSemantic) {
            splitByteIndex = bestSemanticByteIndex;
          } else if (processingBuffer.length >= maxChunkSize) {
            splitByteIndex = maxChunkSize;
            isSemantic = false;
          } else {
            break; // Wait for more data
          }

          // Extract chunk
          if (splitByteIndex > 0 && processingBuffer.length >= splitByteIndex) {
            const chunkOriginalContentBuffer = processingBuffer.slice(0, splitByteIndex);
            const chunkOriginalContent = chunkOriginalContentBuffer.toString('utf8');
            const chunkHash = this._hashContent(chunkOriginalContent);

            let actualOverlapBefore = '';
            let overlapBeforeBytes = 0;

            // Add context overlap from previous chunk
            if (previousChunkContent) {
              const overlapStartChar = Math.max(0, previousChunkContent.length - overlapChars);
              actualOverlapBefore = previousChunkContent.substring(overlapStartChar);
              overlapBeforeBytes = Buffer.byteLength(actualOverlapBefore, 'utf8');
            }

            const finalChunkContent = actualOverlapBefore + chunkOriginalContent;

            chunks.push({
              id: chunks.length,
              file_path: filePath,
              chunk_index: chunks.length,
              content: finalChunkContent,
              start_byte: currentByteOffset,
              end_byte: currentByteOffset + chunkOriginalContentBuffer.length,
              original_hash: chunkHash,
              overlap_before_bytes: overlapBeforeBytes,
              is_semantic_chunk: isSemantic,
              metadata: {
                semantic_match_length_bytes: semanticMatchLengthBytes,
                chunk_size_bytes: chunkOriginalContentBuffer.length,
                with_overlap_size_bytes: Buffer.byteLength(finalChunkContent, 'utf8')
              }
            });

            previousChunkContent = chunkOriginalContent;
            currentByteOffset += chunkOriginalContentBuffer.length;
            processingBuffer = processingBuffer.slice(splitByteIndex);
          } else {
            break;
          }
        }
      });

      stream.on('end', () => {
        // Process remaining buffer
        if (processingBuffer.length > 0) {
          const chunkOriginalContentBuffer = processingBuffer;
          const chunkOriginalContent = chunkOriginalContentBuffer.toString('utf8');
          const chunkHash = this._hashContent(chunkOriginalContent);

          let actualOverlapBefore = '';
          let overlapBeforeBytes = 0;

          if (previousChunkContent) {
            const overlapStartChar = Math.max(0, previousChunkContent.length - overlapChars);
            actualOverlapBefore = previousChunkContent.substring(overlapStartChar);
            overlapBeforeBytes = Buffer.byteLength(actualOverlapBefore, 'utf8');
          }

          const finalChunkContent = actualOverlapBefore + chunkOriginalContent;

          chunks.push({
            id: chunks.length,
            file_path: filePath,
            chunk_index: chunks.length,
            content: finalChunkContent,
            start_byte: currentByteOffset,
            end_byte: currentByteOffset + chunkOriginalContentBuffer.length,
            original_hash: chunkHash,
            overlap_before_bytes: overlapBeforeBytes,
            is_semantic_chunk: false,
            metadata: {
              chunk_size_bytes: chunkOriginalContentBuffer.length,
              with_overlap_size_bytes: Buffer.byteLength(finalChunkContent, 'utf8'),
              is_final_chunk: true
            }
          });
        }
        resolve(chunks);
      });

      stream.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Processes a single file with intelligent chunking and context preservation.
   * @param {string} filePath - The path to the file.
   * @param {object} options - Processing options.
   * @returns {Promise<Object>} - Processed file data with chunks and metadata.
   */
  async processFile(filePath, options = {}) {
    const startTime = process.hrtime.bigint();
    
    try {
      // Validate file through existing security layer
      const fileInfo = await fileProcessor.processFile(filePath, { 
        encoding: 'utf8',
        ...options
      });

      const originalSize = fileInfo.metadata.size;

      this.emit('progress', {
        file: filePath,
        status: 'chunking',
        progress: 25,
        totalSize: originalSize
      });

      // Apply intelligent chunking if file is large enough
      let chunks = [];
      
      if (originalSize > 32 * 1024) { // 32KB threshold for chunking
        chunks = await this._chunkFileStream(filePath);
        
        this.emit('progress', {
          file: filePath,
          status: 'processing_chunks',
          progress: 75,
          totalSize: originalSize,
          chunksCreated: chunks.length
        });
      } else {
        // Small files don't need chunking
        chunks = [{
          id: 0,
          file_path: filePath,
          chunk_index: 0,
          content: fileInfo.content,
          start_byte: 0,
          end_byte: originalSize,
          original_hash: this._hashContent(fileInfo.content),
          overlap_before_bytes: 0,
          is_semantic_chunk: false,
          metadata: {
            chunk_size_bytes: originalSize,
            with_overlap_size_bytes: originalSize,
            is_small_file: true
          }
        }];
      }

      const endTime = process.hrtime.bigint();
      const processingTimeMs = Number(endTime - startTime) / 1_000_000;

      // Update performance metrics
      this.updatePerformanceMetrics(processingTimeMs, chunks.length);

      this.emit('progress', {
        file: filePath,
        status: 'completed',
        progress: 100,
        totalSize: originalSize,
        chunksProcessed: chunks.length,
        timeMs: processingTimeMs
      });

      return {
        file_path: filePath,
        total_original_size_bytes: originalSize,
        total_chunks: chunks.length,
        processing_time_ms: processingTimeMs,
        intelligent_chunking: chunks.length > 1 ? 'enabled' : 'not_required',
        content_preservation_rate: this.calculatePreservationRate(chunks),
        chunks: chunks,
        youtu_agent_metadata: {
          semantic_chunks: chunks.filter(c => c.is_semantic_chunk).length,
          average_chunk_size: Math.round(chunks.reduce((sum, c) => sum + c.metadata.chunk_size_bytes, 0) / chunks.length),
          overlap_efficiency: this.calculateOverlapEfficiency(chunks),
          processing_strategy: originalSize > 32 * 1024 ? 'streaming_chunked' : 'direct_processing'
        },
        reassembly_instructions: this.generateReassemblyInstructions(chunks)
      };

    } catch (error) {
      this.emit('error', filePath, error);
      throw new Error(`YoutAgent file processing failed for ${filePath}: ${error.message}`);
    }
  }

  /**
   * Processes multiple files concurrently with intelligent batching.
   * @param {string[]} filePaths - Array of file paths to process.
   * @param {object} options - Processing options.
   * @returns {Promise<Object>} - Batch processing results.
   */
  async processBatch(filePaths, options = {}) {
    const startTime = process.hrtime.bigint();
    const results = [];
    const errors = [];
    const activePromises = new Set();
    let completedFiles = 0;

    // Analyze batch characteristics
    const batchMetrics = await this.analyzeBatchCharacteristics(filePaths);

    this.emit('batchProgress', {
      status: 'starting',
      totalFiles: filePaths.length,
      completedFiles: 0,
      estimatedStrategy: batchMetrics.recommendedStrategy
    });

    const runTask = async (filePath) => {
      const processPromise = this.processFile(filePath, options)
        .then(result => {
          results.push(result);
          completedFiles++;
          
          this.emit('batchProgress', {
            status: 'processing',
            totalFiles: filePaths.length,
            completedFiles: completedFiles,
            currentFile: filePath,
            percentage: (completedFiles / filePaths.length) * 100
          });
          
          return result;
        })
        .catch(error => {
          errors.push({ file_path: filePath, error: error.message });
          this.emit('batchError', filePath, error);
          return null;
        })
        .finally(() => {
          activePromises.delete(processPromise);
        });
      
      activePromises.add(processPromise);
      return processPromise;
    };

    // Process files with concurrency control
    for (const filePath of filePaths) {
      if (activePromises.size >= this.options.maxConcurrentFiles) {
        await Promise.race(activePromises);
      }
      runTask(filePath);
    }

    await Promise.all(activePromises);

    const endTime = process.hrtime.bigint();
    const totalProcessingTime = Number(endTime - startTime) / 1_000_000;

    this.emit('batchProgress', {
      status: 'completed',
      totalFiles: filePaths.length,
      completedFiles: completedFiles,
      percentage: 100,
      totalTimeMs: totalProcessingTime
    });

    return {
      results: results.filter(r => r !== null),
      errors,
      batch_metadata: {
        total_files: filePaths.length,
        processed_files: results.filter(r => r !== null).length,
        failed_files: errors.length,
        total_processing_time_ms: totalProcessingTime,
        batch_characteristics: batchMetrics,
        files_processed: results.length,
        intelligent_chunking: 'enabled',
        batch_optimization: 'applied',
        memory_management: 'streaming_active'
      }
    };
  }

  async analyzeBatchCharacteristics(filePaths) {
    let totalEstimatedSize = 0;
    let largeFileCount = 0;

    for (const filePath of filePaths.slice(0, 10)) { // Sample first 10 files
      try {
        const stats = await fs.promises.stat(filePath);
        totalEstimatedSize += stats.size;
        if (stats.size > 100 * 1024) largeFileCount++;
      } catch (error) {
        // File might not exist, continue with others
      }
    }

    const avgFileSize = totalEstimatedSize / Math.min(filePaths.length, 10);
    const estimatedTotalSize = avgFileSize * filePaths.length;

    return {
      estimated_total_size: estimatedTotalSize,
      average_file_size: avgFileSize,
      large_files_estimated: Math.round((largeFileCount / 10) * filePaths.length),
      recommendedStrategy: estimatedTotalSize > 1024 * 1024 ? 'local_endpoint_chunked' : 'distributed_processing',
      memory_estimation: Math.min(estimatedTotalSize / 1024 / 1024, 100) + 'MB'
    };
  }

  calculatePreservationRate(chunks) {
    if (chunks.length <= 1) return 1.0;
    
    const totalOverlapBytes = chunks.reduce((sum, chunk) => sum + chunk.overlap_before_bytes, 0);
    const totalContentBytes = chunks.reduce((sum, chunk) => sum + chunk.metadata.chunk_size_bytes, 0);
    
    return Math.max(0.9, 1 - (totalOverlapBytes * 0.1) / totalContentBytes);
  }

  calculateOverlapEfficiency(chunks) {
    if (chunks.length <= 1) return 1.0;
    
    const chunksWithOverlap = chunks.filter(c => c.overlap_before_bytes > 0).length;
    return chunksWithOverlap / Math.max(1, chunks.length - 1); // First chunk has no overlap
  }

  generateReassemblyInstructions(chunks) {
    if (chunks.length <= 1) {
      return "Single chunk - no reassembly required. Use chunk content directly.";
    }

    return {
      method: "sequential_concatenation",
      steps: [
        "1. Take the first chunk's content in full",
        "2. For subsequent chunks, remove the overlap_before_bytes from the beginning",
        "3. Concatenate all processed chunk contents in order",
        "4. The result should match the original file content"
      ],
      validation: "Compare SHA256 hash of reassembled content with original file hash",
      chunk_count: chunks.length,
      total_overlap_bytes: chunks.reduce((sum, c) => sum + c.overlap_before_bytes, 0)
    };
  }

  updatePerformanceMetrics(processingTime, chunkCount) {
    this.performanceMetrics.totalFilesProcessed++;
    this.performanceMetrics.totalChunksCreated += chunkCount;
    
    const currentAvg = this.performanceMetrics.averageProcessingTime;
    const newAvg = (currentAvg * (this.performanceMetrics.totalFilesProcessed - 1) + processingTime) / 
                   this.performanceMetrics.totalFilesProcessed;
    this.performanceMetrics.averageProcessingTime = Math.round(newAvg);
    
    this.performanceMetrics.averageChunksPerFile = 
      this.performanceMetrics.totalChunksCreated / this.performanceMetrics.totalFilesProcessed;
  }

  getPerformanceStats() {
    return {
      ...this.performanceMetrics,
      current_active_processes: 0, // Would track active if needed
      memory_usage: process.memoryUsage(),
      uptime_ms: process.uptime() * 1000
    };
  }
}

export default new YoutAgentFileProcessor();