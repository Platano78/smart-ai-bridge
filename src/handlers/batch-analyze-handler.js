/**
 * BatchAnalyzeHandler - Multi-File Analysis
 *
 * Purpose: Analyze multiple files with Local LLM using glob patterns
 * Token savings: Massive reduction by aggregating results
 *
 * Features:
 * - Glob pattern support
 * - Parallel or sequential processing
 * - Result aggregation
 * - Smart file filtering
 */

import { BaseHandler } from './base-handler.js';
import { AnalyzeFileHandler } from './analyze-file-handler.js';
import { smartContext } from '../context/smart-context.js';
import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';

export class BatchAnalyzeHandler extends BaseHandler {

  constructor(context) {
    super(context);
    // Create an AnalyzeFileHandler instance for delegating
    this.analyzeHandler = new AnalyzeFileHandler(context);
  }

  /**
   * Execute batch analysis using local LLM
   * @param {Object} args - Analysis arguments
   * @param {string[]} args.filePatterns - Glob patterns or file paths
   * @param {string} args.question - Question to ask about each file
   * @param {Object} [args.options] - Optional configuration
   * @param {number} [args.options.maxFiles] - Maximum files to analyze (default: 20)
   * @param {boolean} [args.options.aggregateResults] - Combine findings (default: true)
   * @param {boolean} [args.options.parallel] - Parallel processing (default: true)
   * @param {string} [args.options.backend] - Force specific backend
   * @param {string} [args.options.analysisType] - Type of analysis
   * @returns {Promise<Object>} Aggregated analysis results
   */
  async execute(args) {
    const { filePatterns, question, options = {} } = args;

    if (!filePatterns || filePatterns.length === 0) {
      throw new Error('filePatterns is required');
    }
    if (!question) {
      throw new Error('question is required');
    }

    const {
      maxFiles = 20,
      aggregateResults = true,
      parallel = true,
      backend = 'auto',
      analysisType = 'general'
    } = options;

    const startTime = Date.now();

    try {
      // 1. Expand glob patterns to actual files
      const files = await this.expandPatterns(filePatterns, maxFiles);

      if (files.length === 0) {
        return this.buildSuccessResponse({
          status: 'no_files',
          message: 'No files matched the provided patterns',
          patterns: filePatterns
        });
      }

      console.error(`[BatchAnalyze] 📂 Found ${files.length} files matching patterns`);
      console.error(`[BatchAnalyze] 🎯 Backend: ${backend}, Parallel: ${parallel}`);

      // 2. Analyze each file
      const results = parallel
        ? await this.analyzeParallel(files, question, { backend, analysisType })
        : await this.analyzeSequential(files, question, { backend, analysisType });

      const processingTime = Date.now() - startTime;

      // 3. Aggregate results if requested
      if (aggregateResults) {
        const aggregated = this.aggregateFindings(results, question);

        // 4. Record execution
        this.recordExecution(
          {
            success: true,
            backend,
            processingTime,
            fileCount: files.length
          },
          {
            tool: 'batch_analyze',
            taskType: analysisType,
            patterns: filePatterns.join(', ')
          }
        );

        return this.buildSuccessResponse({
          status: 'completed',
          filesAnalyzed: files.length,
          patterns: filePatterns,
          question,
          aggregatedSummary: aggregated.summary,
          aggregatedFindings: aggregated.findings,
          aggregatedActions: aggregated.suggestedActions,
          overallConfidence: aggregated.confidence,
          perFileResults: results.map(r => ({
            filePath: r.filePath,
            summary: r.summary,
            findingCount: r.findings?.length || 0,
            confidence: r.confidence
          })),
          processing_time: processingTime,
          tokens_saved: this.estimateBatchTokensSaved(files.length)
        });
      }

      // Return individual results
      return this.buildSuccessResponse({
        status: 'completed',
        filesAnalyzed: files.length,
        patterns: filePatterns,
        question,
        results,
        processing_time: processingTime
      });

    } catch (error) {
      console.error(`[BatchAnalyze] ❌ Error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Expand glob patterns to actual file paths
   */
  async expandPatterns(patterns, maxFiles) {
    const files = new Set();

    for (const pattern of patterns) {
      // Check if it's a direct file path
      if (!pattern.includes('*') && !pattern.includes('?')) {
        try {
          const stat = await fs.stat(pattern);
          if (stat.isFile()) {
            files.add(path.resolve(pattern));
          } else if (stat.isDirectory()) {
            // If directory, get code files in it
            const dirFiles = await glob(path.join(pattern, '**/*.{js,ts,jsx,tsx,py,go,rs}'), {
              ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**']
            });
            dirFiles.forEach(f => files.add(path.resolve(f)));
          }
        } catch {
          // Path doesn't exist, skip
        }
        continue;
      }

      // Expand glob pattern
      const matches = await glob(pattern, {
        ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
        nodir: true
      });

      matches.forEach(f => files.add(path.resolve(f)));

      if (files.size >= maxFiles) break;
    }

    // Convert to array and limit
    return Array.from(files).slice(0, maxFiles);
  }

  /**
   * Analyze files in parallel
   */
  async analyzeParallel(files, question, options) {
    const { backend, analysisType } = options;
    const concurrency = 3; // Limit concurrent requests
    const results = [];

    for (let i = 0; i < files.length; i += concurrency) {
      const batch = files.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(filePath =>
          this.analyzeHandler.execute({
            filePath,
            question,
            options: { backend, analysisType }
          }).catch(error => ({
            filePath,
            error: error.message,
            summary: `Error: ${error.message}`,
            findings: [],
            confidence: 0
          }))
        )
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Analyze files sequentially
   */
  async analyzeSequential(files, question, options) {
    const { backend, analysisType } = options;
    const results = [];

    for (const filePath of files) {
      try {
        const result = await this.analyzeHandler.execute({
          filePath,
          question,
          options: { backend, analysisType }
        });
        results.push(result);
      } catch (error) {
        results.push({
          filePath,
          error: error.message,
          summary: `Error: ${error.message}`,
          findings: [],
          confidence: 0
        });
      }
    }

    return results;
  }

  /**
   * Aggregate findings from multiple file analyses
   */
  aggregateFindings(results, question) {
    // Collect all findings
    const allFindings = [];
    const allActions = [];
    let totalConfidence = 0;
    let validResults = 0;

    for (const result of results) {
      if (result.error) continue;

      validResults++;
      totalConfidence += result.confidence || 0;

      // Extract findings with file context
      if (result.findings) {
        for (const finding of result.findings) {
          allFindings.push({
            file: path.basename(result.filePath || ''),
            finding: typeof finding === 'string' ? finding : finding.message || finding
          });
        }
      }

      // Extract suggested actions
      if (result.suggestedActions) {
        allActions.push(...result.suggestedActions);
      }
    }

    // Deduplicate and prioritize findings
    const uniqueFindings = this.deduplicateFindings(allFindings);
    const uniqueActions = [...new Set(allActions)];

    // Generate summary
    const summary = this.generateBatchSummary(results, question, uniqueFindings);

    return {
      summary,
      findings: uniqueFindings.slice(0, 20), // Top 20 findings
      suggestedActions: uniqueActions.slice(0, 10), // Top 10 actions
      confidence: validResults > 0 ? (totalConfidence / validResults) : 0
    };
  }

  /**
   * Deduplicate similar findings
   */
  deduplicateFindings(findings) {
    const unique = [];
    const seen = new Set();

    for (const { file, finding } of findings) {
      // Create a simplified key for deduplication
      const key = finding.toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 50);

      if (!seen.has(key)) {
        seen.add(key);
        unique.push(`[${file}] ${finding}`);
      }
    }

    return unique;
  }

  /**
   * Generate batch analysis summary
   */
  generateBatchSummary(results, question, findings) {
    const totalFiles = results.length;
    const successFiles = results.filter(r => !r.error).length;
    const errorFiles = results.filter(r => r.error).length;
    const findingCount = findings.length;

    let summary = `Analyzed ${totalFiles} files for: "${question.substring(0, 50)}...".\n`;
    summary += `${successFiles} files successfully analyzed`;

    if (errorFiles > 0) {
      summary += `, ${errorFiles} files had errors`;
    }

    summary += `. Found ${findingCount} unique findings.`;

    // Add top-level insight
    if (findingCount === 0) {
      summary += ' No significant issues detected.';
    } else if (findingCount <= 5) {
      summary += ' Minor issues found.';
    } else if (findingCount <= 15) {
      summary += ' Moderate number of issues found.';
    } else {
      summary += ' Significant issues detected - review recommended.';
    }

    return summary;
  }

  /**
   * Estimate tokens saved by batch processing
   */
  estimateBatchTokensSaved(fileCount) {
    // Average file = 2000 tokens
    // Without MKG: Claude sees all files = 2000 * fileCount
    // With MKG: Claude sees only aggregated results = ~500 tokens
    return Math.max(0, (2000 * fileCount) - 500);
  }
}

export default BatchAnalyzeHandler;
