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
import { parseLLMJSON } from '../utils/llm-json-parser.js';

import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..', '..');

// Same shape AnalyzeFileHandler asks the LLM for — batch_analyze's singlePass
// mode asks for one aggregated version of the identical JSON contract.
const SINGLE_PASS_FIELD_SPECS = {
  summary: 'string',
  findings: 'array',
  confidence: 'number',
  suggestedActions: 'array'
};

export class BatchAnalyzeHandler extends BaseHandler {

  constructor(context) {
    super(context);
    this.handlerType = 'batch-analyze';
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

    // Normalize patterns: accept string or array
    const normalizedPatterns = Array.isArray(filePatterns)
      ? filePatterns
      : (typeof filePatterns === 'string' && filePatterns.trim() ? [filePatterns] : []);

    if (normalizedPatterns.length === 0) {
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
      analysisType = 'general',
      grepFilter = null,
      singlePass = false
    } = options;

    // Plain-substring terms, never regex — a term like "a.b" or "x(y" must match
    // those literal characters. Accept string or string[]; empty/blank terms are dropped.
    const grepTerms = grepFilter == null
      ? null
      : (Array.isArray(grepFilter) ? grepFilter : [grepFilter])
          .map(t => String(t))
          .filter(t => t.length > 0);
    const grepActive = !!(grepTerms && grepTerms.length > 0);

    const startTime = Date.now();

    try {
      // 1. Expand glob patterns to actual files.
      // grepFilter must WIDEN before it narrows: expandPatterns caps at maxFiles
      // before returning, so filtering its output would filter an
      // already-truncated set. When grepFilter is set, scan a wider candidate
      // pool first, content-filter, and only then slice to maxFiles.
      const { files, contentCache, scannedCount, matchedCount } =
        await this.expandAndFilterPatterns(normalizedPatterns, maxFiles, grepTerms);

      if (files.length === 0) {
        return this.buildSuccessResponse({
          status: 'no_files',
          message: 'No files matched the provided patterns',
          patterns: normalizedPatterns,
          ...(grepActive ? { grepFilter: { terms: grepTerms, filesScanned: scannedCount, filesMatched: matchedCount } } : {})
        });
      }

      console.error(`[BatchAnalyze] 📂 Found ${files.length} files matching patterns`);
      if (grepActive) {
        console.error(`[BatchAnalyze] 🔎 grepFilter scanned ${scannedCount} candidates, matched ${matchedCount}`);
      }
      console.error(`[BatchAnalyze] 🎯 Backend: ${backend}, Parallel: ${parallel}`);

      // singlePass makes exactly ONE backend call for all N files instead of
      // fanning out per-file — bypasses the per-file analyzeParallel/Sequential
      // path entirely.
      if (singlePass) {
        return await this.executeSinglePass(files, question, {
          backend,
          analysisType,
          grepTerms,
          contentCache,
          patterns: normalizedPatterns,
          startTime,
          grepActive,
          scannedCount,
          matchedCount
        });
      }

      // INPUT size limit check (local llama.cpp server configured limit)
      // Get dynamic context limit from loaded model
      const { charLimit: MAX_LOCAL_INPUT_CHARS, model: loadedModel } = await this.getContextLimit();
      console.error(`[${this.constructor.name}] 📊 Dynamic limit: ${MAX_LOCAL_INPUT_CHARS} chars (model: ${loadedModel})`);

      // Calculate total input size (question + aggregated file sizes).
      // totalFileChars is the real, measured size of the files actually read —
      // used later for an honest tokens_saved figure (see measureTokensSaved).
      let totalFileChars = 0;
      for (const filePath of files) {
        try {
          const stat = await fs.stat(filePath);
          totalFileChars += stat.size;
        } catch {
          // Skip on error
        }
      }
      const totalInputSize = question.length + totalFileChars;

      // Auto-fallback if total input exceeds local limit
      const routingResult = this.selectBackend(backend, { contentLength: totalInputSize });
      let effectiveBackend = routingResult.backend;
      if (routingResult.recommendation) {
        console.error(`[BatchAnalyze] 📊 ${routingResult.recommendation}`);
      }
      // Safety: if local but exceeds local limit, escalate
      if (totalInputSize > MAX_LOCAL_INPUT_CHARS && effectiveBackend === 'local') {
        console.error(`[BatchAnalyze] ⚠️ Payload (${totalInputSize} chars) exceeds ${effectiveBackend} limit (${MAX_LOCAL_INPUT_CHARS} chars)`);
        const roomier = await this.findBackendWithCapacity(totalInputSize, [effectiveBackend]);
        if (roomier) {
          console.error(`[BatchAnalyze] 🔄 Escalating to ${roomier.name} (${roomier.cap} char limit)`);
          effectiveBackend = roomier.name;
        } else {
          const largest = await this.largestBackendCapacity();
          throw new Error(
            `Payload is ${totalInputSize} chars; no configured backend can hold it in one context ` +
            `(largest limit found: ${largest} chars). This tool makes a single LLM call and cannot chunk. ` +
            `Next step: narrow the call — fewer files, or split the input.`
          );
        }
      }

      // 2. Analyze each file
      const rawResults = parallel
        ? await this.analyzeParallel(files, question, { backend: effectiveBackend, analysisType })
        : await this.analyzeSequential(files, question, { backend: effectiveBackend, analysisType });

      // Filter out null/invalid results
      const results = rawResults.filter(r => r && typeof r === 'object' && (r.filePath || r.error || r.summary));

      const processingTime = Date.now() - startTime;

      // 3. Aggregate results if requested
      if (aggregateResults) {
        const aggregated = this.aggregateFindings(results, question);

        // 4. Record execution
        this.recordExecution(
          {
            success: true,
            backend: effectiveBackend,
            processingTime,
            fileCount: files.length
          },
          {
            tool: 'batch_analyze',
            taskType: analysisType,
            patterns: normalizedPatterns.join(', ')
          }
        );

        const perFileResults = results.map(r => ({
          filePath: r.filePath,
          summary: r.summary,
          findingCount: r.findings?.length || 0,
          confidence: r.confidence
        }));

        // Propagate per-file truncation (set by AnalyzeFileHandler) into the
        // aggregated response — safe access since a filtered entry can still be
        // an error object with no was_truncated field.
        const truncatedFiles = results
          .filter(r => r && r.was_truncated === true)
          .map(r => r.filePath);
        const anyTruncated = truncatedFiles.length > 0;

        // Measured against the actual finished response (envelope + pretty-print
        // included), using the real characters read across all matched files —
        // not a fixed "average file = 2000 tokens" assumption.
        return this.buildSuccessResponseWithSavings({
          status: 'completed',
          filesAnalyzed: files.length,
          patterns: normalizedPatterns,
          question,
          aggregatedSummary: aggregated.summary,
          aggregatedFindings: aggregated.findings,
          aggregatedActions: aggregated.suggestedActions,
          overallConfidence: aggregated.confidence,
          perFileResults,
          was_truncated: anyTruncated,
          ...(anyTruncated ? {
            truncated_files: truncatedFiles,
            truncation_hint: 'One or more files hit the token limit. Re-run the listed files individually with analyze_file, or reduce maxFiles / narrow the glob.'
          } : {}),
          ...(grepActive ? { grepFilter: { terms: grepTerms, filesScanned: scannedCount, filesMatched: matchedCount } } : {}),
          processing_time: processingTime
        }, totalFileChars);
      }

      // Return individual results
      return this.buildSuccessResponse({
        status: 'completed',
        filesAnalyzed: files.length,
        patterns: normalizedPatterns,
        question,
        results,
        ...(grepActive ? { grepFilter: { terms: grepTerms, filesScanned: scannedCount, filesMatched: matchedCount } } : {}),
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

    for (const rawPattern of patterns) {
      // Skip non-string entries
      const pattern = typeof rawPattern === 'string' ? rawPattern : String(rawPattern);
      // Check if it's a direct file path
      if (!pattern.includes('*') && !pattern.includes('?')) {
        let resolved = null;

        // Try path.resolve(pattern) first (cwd-relative), then REPO_ROOT-relative
        for (const candidate of [path.resolve(pattern), path.resolve(REPO_ROOT, pattern)]) {
          try {
            const stat = await fs.stat(candidate);
            if (stat.isFile()) {
              resolved = candidate;
              break;
            } else if (stat.isDirectory()) {
              // If directory, get code files in it
              const dirFiles = await glob(path.join(candidate, '**/*.{js,ts,jsx,tsx,py,go,rs,ini,toml,yaml,yml,json,md}'), {
                ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**']
              });
              dirFiles.forEach(f => files.add(path.resolve(f)));
              resolved = 'directory';
              break;
            }
          } catch {
            // Try next candidate
          }
        }

        if (resolved && resolved !== 'directory') {
          files.add(resolved);
        } else if (!resolved) {
          console.error('[BatchAnalyze] \u26a0\ufe0f No matches for pattern: ' + pattern);
        }
        continue;
      }

      // Expand glob pattern — try cwd first, then REPO_ROOT
      let matches = await glob(pattern, {
        cwd: process.cwd(),
        absolute: true,
        nodir: true,
        ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**']
      });

      if (matches.length === 0) {
        matches = await glob(pattern, {
          cwd: REPO_ROOT,
          absolute: true,
          nodir: true,
          ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**']
        });
      }

      if (matches.length === 0) {
        console.error('[BatchAnalyze] \u26a0\ufe0f No matches for pattern: ' + pattern);
      }

      matches.forEach(f => files.add(f));

      if (files.size >= maxFiles) break;
    }

    // Convert to array and limit
    return Array.from(files).slice(0, maxFiles);
  }

  /**
   * Expand patterns, optionally content-filtering with grepFilter before the
   * maxFiles cap is applied. expandPatterns() caps BEFORE returning, so a
   * plain call would filter an already-truncated set — grepFilter widens the
   * scan first (bounded), filters, then slices to maxFiles.
   * @param {string[]} patterns
   * @param {number} maxFiles
   * @param {string[]|null} grepTerms - plain-substring terms, or null/empty to skip filtering
   * @returns {Promise<{files: string[], contentCache: Map<string,string>|null, scannedCount: number, matchedCount: number}>}
   */
  async expandAndFilterPatterns(patterns, maxFiles, grepTerms) {
    if (!grepTerms || grepTerms.length === 0) {
      const files = await this.expandPatterns(patterns, maxFiles);
      return { files, contentCache: null, scannedCount: files.length, matchedCount: files.length };
    }

    // Wider scan cap, hard-bounded so a broad glob can't read unbounded files.
    const scanCap = Math.min(Math.max(maxFiles * 10, 200), 500);
    const candidates = await this.expandPatterns(patterns, scanCap);

    const matched = [];
    const contentCache = new Map();
    for (const filePath of candidates) {
      let content;
      try {
        content = await fs.readFile(filePath, 'utf8');
      } catch {
        // Unreadable (binary, permissions, race) — skip rather than crash the scan
        continue;
      }
      if (this.contentMatchesGrepTerms(content, grepTerms)) {
        matched.push(filePath);
        contentCache.set(filePath, content);
      }
    }

    const files = matched.slice(0, maxFiles);
    return { files, contentCache, scannedCount: candidates.length, matchedCount: matched.length };
  }

  /**
   * Plain-substring, case-insensitive match against ANY term. Terms are never
   * treated as regex — a term like "a.b" or "x(y" must match those literal
   * characters and must never throw.
   */
  contentMatchesGrepTerms(content, terms) {
    const lower = content.toLowerCase();
    return terms.some(term => lower.includes(term.toLowerCase()));
  }

  /**
   * Extract matching lines with ±contextLines of surrounding context, for use
   * as singlePass evidence. Matches are literal substrings (see
   * contentMatchesGrepTerms) — never regex.
   */
  extractGrepEvidence(content, terms, contextLines = 2) {
    const lines = content.split('\n');
    const lowerTerms = terms.map(t => t.toLowerCase());
    const matchedLineNums = new Set();

    lines.forEach((line, i) => {
      const lowerLine = line.toLowerCase();
      if (lowerTerms.some(term => lowerLine.includes(term))) {
        for (let j = Math.max(0, i - contextLines); j <= Math.min(lines.length - 1, i + contextLines); j++) {
          matchedLineNums.add(j);
        }
      }
    });

    if (matchedLineNums.size === 0) return '';

    const sortedNums = Array.from(matchedLineNums).sort((a, b) => a - b);
    const out = [];
    let prev = null;
    for (const n of sortedNums) {
      if (prev !== null && n !== prev + 1) out.push('...');
      out.push(`${n + 1}: ${lines[n]}`);
      prev = n;
    }
    return out.join('\n');
  }

  /**
   * Run ONE aggregated LLM call across all N files instead of the per-file
   * fan-out. Evidence per file is either the matching grep lines (with
   * context) or the head of the file, capped to a per-file share of the
   * input budget so the whole prompt fits under the local context limit.
   */
  async executeSinglePass(files, question, ctx) {
    const { backend, analysisType, grepTerms, contentCache, patterns, startTime, grepActive, scannedCount, matchedCount } = ctx;

    const { charLimit, model: loadedModel } = await this.getContextLimit();
    console.error(`[BatchAnalyze] 📊 singlePass dynamic limit: ${charLimit} chars (model: ${loadedModel})`);

    // Reserve room for the question and prompt scaffolding rather than
    // spending the entire budget on evidence.
    const scaffoldReserve = Math.min(2000, Math.max(500, Math.floor(charLimit * 0.1)));
    const evidenceBudget = Math.max(0, charLimit - scaffoldReserve - question.length);
    const perFileBudget = files.length > 0 ? Math.floor(evidenceBudget / files.length) : 0;
    const MIN_USEFUL_CHARS = 100; // below this, a file's evidence isn't worth including

    const evidenceEntries = [];
    const droppedFiles = [];
    let anyTrimmed = false;

    for (const filePath of files) {
      if (perFileBudget < MIN_USEFUL_CHARS) {
        droppedFiles.push(filePath);
        continue;
      }

      let content = contentCache?.get(filePath);
      if (content === undefined) {
        try {
          content = await fs.readFile(filePath, 'utf8');
        } catch {
          droppedFiles.push(filePath);
          continue;
        }
      }

      const rawEvidence = grepTerms && grepTerms.length > 0
        ? this.extractGrepEvidence(content, grepTerms, 2)
        : content.slice(0, perFileBudget);

      if (!rawEvidence) {
        droppedFiles.push(filePath);
        continue;
      }

      let evidence = rawEvidence;
      if (evidence.length > perFileBudget) {
        evidence = evidence.slice(0, perFileBudget);
        anyTrimmed = true;
      }

      evidenceEntries.push({ filePath, evidence });
    }

    const evidenceTruncated = anyTrimmed || droppedFiles.length > 0;
    const totalEvidenceChars = evidenceEntries.reduce((sum, e) => sum + e.evidence.length, 0);

    const prompt = this.buildSinglePassPrompt(evidenceEntries, question, { analysisType, grepTerms });

    const routingResult = this.selectBackend(backend, { contentLength: prompt.length });
    const effectiveBackend = routingResult.backend;
    if (routingResult.recommendation) {
      console.error(`[BatchAnalyze] 📊 ${routingResult.recommendation}`);
    }

    const response = await this.makeRequest(prompt, effectiveBackend, {
      maxTokens: 2000,
      disableThinking: true
    });

    const processingTime = Date.now() - startTime;
    const parsed = this.parseSinglePassResponse(this.extractResponseText(response));

    // Output-side truncation — the single aggregated call itself got cut off.
    // Distinct axis from evidence_truncated (input side): same authoritative
    // finish_reason idiom used by AnalyzeFileHandler and the sibling aggregated
    // path in this file (:219).
    const finishReason = response.metadata?.finishReason || response.finish_reason;
    const wasTruncated = finishReason === 'length';

    this.recordExecution(
      {
        success: true,
        backend: effectiveBackend,
        processingTime,
        fileCount: files.length
      },
      {
        tool: 'batch_analyze',
        taskType: analysisType,
        patterns: patterns.join(', ')
      }
    );

    // One aggregated call cannot produce a real per-file summary/confidence —
    // report only what is genuinely known per file: the path and whether it
    // contributed evidence to the single call.
    const perFileResults = files.map(filePath => ({
      filePath,
      contributedEvidence: evidenceEntries.some(e => e.filePath === filePath)
    }));

    return this.buildSuccessResponseWithSavings({
      status: 'completed',
      singlePass: true,
      filesAnalyzed: files.length,
      patterns,
      question,
      aggregatedSummary: parsed.summary,
      aggregatedFindings: parsed.findings,
      aggregatedActions: parsed.suggestedActions,
      overallConfidence: parsed.confidence,
      perFileResults,
      evidence_truncated: evidenceTruncated,
      ...(evidenceTruncated ? {
        evidence_dropped_files: droppedFiles,
        evidence_truncation_hint: 'Evidence budget was exceeded; some files were trimmed or dropped from the single aggregated call. Narrow the glob, use grepFilter, or set singlePass:false for full per-file coverage.'
      } : {}),
      was_truncated: wasTruncated,
      ...(wasTruncated ? {
        truncation_hint: 'The aggregated answer itself hit the token limit. Re-run with a narrower glob or a grepFilter to shrink the evidence set, or set singlePass:false for full per-file coverage.'
      } : {}),
      ...(grepActive ? { grepFilter: { terms: grepTerms, filesScanned: scannedCount, filesMatched: matchedCount } } : {}),
      processing_time: processingTime
    }, totalEvidenceChars);
  }

  /**
   * Build the single aggregated prompt covering evidence from every file.
   */
  buildSinglePassPrompt(evidenceEntries, question, options) {
    const { analysisType, grepTerms } = options;

    let prompt = `You are a senior software engineer analyzing MULTIPLE files at once. Provide ONE aggregated analysis across all of them.

ANALYSIS TYPE: ${analysisType}
QUESTION: ${question}
${grepTerms && grepTerms.length > 0 ? `\nEvidence below is limited to lines matching: ${grepTerms.join(', ')} (with surrounding context).\n` : ''}
`;

    for (const { filePath, evidence } of evidenceEntries) {
      prompt += `\n--- FILE: ${filePath} ---\n${evidence}\n--- END FILE ---\n`;
    }

    prompt += `
Respond ONLY with this JSON (no explanation, no code blocks), aggregated across ALL files above:
{"summary":"1-2 sentences max","findings":["finding1 (mention which file when relevant)","finding2"],"confidence":0.8,"suggestedActions":["action1"]}

CRITICAL: Be BRIEF. Max 5-8 findings across all files. No verbose explanations.
`;

    return prompt;
  }

  /**
   * Parse the single-pass aggregated LLM response into structured format.
   */
  parseSinglePassResponse(responseText) {
    if (typeof responseText !== 'string') {
      responseText = responseText == null ? '' : String(responseText);
    }

    const parsed = parseLLMJSON(responseText, SINGLE_PASS_FIELD_SPECS);
    if (parsed) {
      return {
        summary: parsed.summary || 'Analysis complete',
        findings: Array.isArray(parsed.findings) ? parsed.findings.slice(0, 20) : [],
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.75,
        suggestedActions: Array.isArray(parsed.suggestedActions) ? parsed.suggestedActions.slice(0, 10) : []
      };
    }

    console.error('[BatchAnalyze] Could not parse singlePass JSON response, using prose fallback');
    const proseText = responseText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim() || responseText;
    return {
      summary: proseText.substring(0, 500),
      findings: [],
      confidence: 0.5,
      suggestedActions: []
    };
  }

  /**
   * Analyze files in parallel with dynamic token allocation
   */
  async analyzeParallel(files, question, options) {
    const { backend, analysisType } = options;
    const concurrency = 3; // Limit concurrent requests
    const results = [];

    for (let i = 0; i < files.length; i += concurrency) {
      const batch = files.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(async filePath => {
          try {
            // Stat only — the downstream analyze handler reads the content itself
            const { size: fileSize } = await fs.stat(filePath);

            // Calculate dynamic tokens for this file
            const maxResponseTokens = this.calculateDynamicTokens(
              backend === 'auto' ? 'local' : backend,
              fileSize,
              analysisType
            );

            return await this.analyzeHandler.execute({
              filePath,
              question,
              options: {
                backend,
                analysisType,
                maxResponseTokens // Pass dynamic token allocation
              }
            });
          } catch (error) {
            return {
              filePath,
              error: error.message,
              summary: `Error: ${error.message}`,
              findings: [],
              confidence: 0
            };
          }
        })
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Analyze files sequentially with dynamic token allocation
   */
  async analyzeSequential(files, question, options) {
    const { backend, analysisType } = options;
    const results = [];

    for (const filePath of files) {
      try {
        // Stat only — the downstream analyze handler reads the content itself
        const { size: fileSize } = await fs.stat(filePath);

        // Calculate dynamic tokens for this file
        const maxResponseTokens = this.calculateDynamicTokens(
          backend === 'auto' ? 'local' : backend,
          fileSize,
          analysisType
        );

        const result = await this.analyzeHandler.execute({
          filePath,
          question,
          options: {
            backend,
            analysisType,
            maxResponseTokens // Pass dynamic token allocation
          }
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
   * Calculate dynamic token allocation based on model speed and file size
   * @param {string} backendName - Backend identifier
   * @param {number} fileSize - File size in characters
   * @param {string} analysisType - Type of analysis (general|bug|security|performance|architecture)
   * @returns {number} Allocated tokens for response
   */
  calculateDynamicTokens(backendName, fileSize, analysisType) {
    // Base tokens by analysis type (minimum needed for quality)
    const baseTokens = {
      general: 300,
      bug: 500,
      security: 800,
      performance: 600,
      architecture: 800
    };

    // Get estimated speed for this backend
    const tokensPerSecond = this.estimateBackendSpeed(backendName);

    // Target response time: 30 seconds max for good UX
    const targetTimeMs = 30000;
    const maxAffordableTokens = Math.floor((targetTimeMs / 1000) * tokensPerSecond);

    // File size adjustment: +100 tokens per 5KB of code
    const fileSizeBonus = Math.min(200, Math.floor(fileSize / 5000) * 100);

    // Calculate requested tokens (base + file size bonus)
    const requestedTokens = (baseTokens[analysisType] || baseTokens.general) + fileSizeBonus;

    // Return the minimum of requested and affordable tokens
    // This ensures we don't exceed target time while providing enough tokens for quality
    return Math.min(requestedTokens, maxAffordableTokens);
  }
}

export default BatchAnalyzeHandler;
