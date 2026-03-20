#!/usr/bin/env node
/**
 * Smart AI Bridge - Performance Benchmarks
 * Run: node tests/benchmark.js
 */
import { AskHandler } from '../src/handlers/ask-handler.js';
import { ReviewHandler } from '../src/handlers/review-handler.js';
import { ExploreHandler } from '../src/handlers/explore-handler.js';
import { AnalyzeFileHandler } from '../src/handlers/analyze-file-handler.js';
import { GenerateFileHandler } from '../src/handlers/generate-file-handler.js';
import { ModifyFileHandler } from '../src/handlers/modify-file-handler.js';
import { CouncilHandler } from '../src/handlers/council-handler.js';
import { scoreComplexity } from '../src/intelligence/complexity-scorer.js';
import { PatternRAGStore } from '../src/intelligence/pattern-rag-store.js';

// Harness functions

/**
 * Synchronous benchmark runner
 * @param {string} name - Benchmark name
 * @param {number} iterations - Number of iterations
 * @param {(i: number) => void} fn - Function to benchmark
 * @returns {{ name: string, iterations: number, avg: number, min: number, max: number, opsPerSec: number }}
 */
function bench(name, iterations, fn) {
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = process.hrtime.bigint();
    fn(i);
    const t1 = process.hrtime.bigint();
    times.push(Number(t1 - t0) / 1_000_000);
  }
  times.sort((a, b) => a - b);
  const total = times.reduce((s, t) => s + t, 0);
  const avg = total / times.length;
  const opsPerSec = Math.round(1000 / avg);
  return { name, iterations, avg, min: times[0], max: times[times.length - 1], opsPerSec };
}

/**
 * Asynchronous benchmark runner
 * @param {string} name - Benchmark name
 * @param {number} iterations - Number of iterations
 * @param {(i: number) => Promise<void>} fn - Async function to benchmark
 * @returns {{ name: string, iterations: number, avg: number, min: number, max: number, opsPerSec: number }}
 */
async function benchAsync(name, iterations, fn) {
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = process.hrtime.bigint();
    await fn(i);
    const t1 = process.hrtime.bigint();
    times.push(Number(t1 - t0) / 1_000_000);
  }
  
  const elapsedMs = times.reduce((a, b) => a + b, 0);
  const avg = elapsedMs / iterations;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const opsPerSec = Math.round(1000 / avg);
  return { name, iterations, avg, min, max, opsPerSec };
}

// Test data

const HANDLER_CLASSES = [
  AskHandler,
  ReviewHandler,
  ExploreHandler,
  AnalyzeFileHandler,
  GenerateFileHandler,
  ModifyFileHandler,
  CouncilHandler,
];

const RESPONSE_SHAPES = [
  { label: 'plain string', data: 'Hello world' },
  { label: 'content object', data: { content: 'Response content' } },
  { label: 'reasoning content', data: { reasoning_content: 'Reasoning here' } },
  { label: 'array content', data: { content: [{ text: 'Part one' }, { text: 'Part two' }] } },
  { label: 'OpenAI choices', data: { choices: [{ message: { content: 'OpenAI response' } }] } },
  { label: 'Gemini candidates', data: { candidates: [{ content: { parts: [{ text: 'Gemini response' }] } }] } },
  { label: 'null response', data: null },
];

const COMPLEXITY_INPUTS = [
  { label: 'simple', input: { prompt: 'Hello', toolType: 'ask', fileSize: 100, fileCount: 1 } },
  { label: 'medium', input: { prompt: 'Analyze this complex function with 200 lines and 5 dependencies', toolType: 'analyze', fileSize: 2000, fileCount: 5 } },
  { label: 'complex', input: { prompt: 'Generate a full React application with routing, state management, and API integration across 15 files', toolType: 'generate', fileSize: 10000, fileCount: 15 } },
];

const SR_INPUT_SMALL = `<<<<<<< SEARCH
const x = 1;
=======
const x = 2;
>>>>>>> REPLACE
SUMMARY: Updated x`;

const SR_INPUT_LARGE = Array.from({ length: 20 }, (_, i) => 
  `<<<<<<< SEARCH
function old${i}() {
  return ${i};
}
=======
function new${i}() {
  return ${i + 1};
}
>>>>>>> REPLACE`
).join('\n') + '\nSUMMARY: Updated 20 functions';

const REPETITIVE_TEXT = Array.from({ length: 200 }, (_, i) => {
  // ~66% repetitive lines (133), rest unique (67)
  if (i < 133) {
    return 'The configuration value is set correctly.';
  } else {
    return `Unique line ${i} with some random content ${Math.random()}`;
  }
}).join('\n');

const NON_REPETITIVE_TEXT = Array.from({ length: 200 }, (_, i) => 
  `Line ${i}: Random text ${Math.random().toString(36).substring(7)} ${i * Math.PI}`
).join('\n');

// Main benchmark runner
async function main() {
  const ctx = { router: null };
  const helper = new AskHandler(ctx);
  const modifyHelper = new ModifyFileHandler(ctx);
  
  const results = [];
  
  // 1. Handler instantiation
  for (const Cls of HANDLER_CLASSES) {
    const result = bench(`new ${Cls.name}`, 1000, () => new Cls(ctx));
    results.push(result);
  }
  
  // 2. extractResponseText
  for (const shape of RESPONSE_SHAPES) {
    const result = bench(`extractResponseText (${shape.label})`, 5000, () => helper.extractResponseText(shape.data));
    results.push(result);
  }
  
  // 3. scoreComplexity
  for (const item of COMPLEXITY_INPUTS) {
    const label = item.label.length > 27 ? item.label.substring(0, 27) + '...' : item.label;
    const result = bench(`scoreComplexity (${label})`, 5000, () => scoreComplexity(item.input));
    results.push(result);
  }
  
  // 4. PatternRAGStore
  const store = new PatternRAGStore({ storagePath: '/tmp/sab-bench-patterns.json', maxPatterns: 100 });
  store.initialized = true; // Skip file I/O
  // Stub save() to avoid disk I/O during benchmarks
  store.save = async () => {};
  
  // benchAsync 'addPattern (10 unique)'
  const addPatternResult = await benchAsync('addPattern (10 unique)', 200, async (i) => {
    for (let j = 0; j < 10; j++) {
      await store.addPattern({
        task: `implement sorting algorithm variant ${i}-${j} with quicksort merge`,
        code: `function sort${i}_${j}(arr) { return arr.sort(); }`,
        metadata: { taskType: 'algorithm', complexity: 'medium' },
      });
    }
  });
  results.push(addPatternResult);
  
  // Reset store and seed 50 patterns
  store.patterns = [];
  for (let i = 0; i < 50; i++) {
    await store.addPattern({
      task: `build feature ${i} with react component state management hooks`,
      code: `function Feature${i}() { return '<div>${i}</div>'; }`,
      metadata: { taskType: i % 2 === 0 ? 'frontend' : 'backend' },
    });
  }
  
  // benchAsync 'findSimilar (50 patterns)'
  const findSimilarResult = await benchAsync('findSimilar (50 patterns)', 1000, async () => {
    await store.findSimilar('create react component with state hooks', 3);
  });
  results.push(findSimilarResult);
  
  // bench 'getStats (50 patterns)'
  const getStatsResult = bench('getStats (50 patterns)', 5000, () => {
    store.getStats();
  });
  results.push(getStatsResult);
  
  // 5. parseSearchReplaceBlocks
  const parseSmallResult = bench('parseSearchReplaceBlocks (small)', 5000, () => {
    modifyHelper.parseSearchReplaceBlocks(SR_INPUT_SMALL);
  });
  results.push(parseSmallResult);
  
  const parseLargeResult = bench('parseSearchReplaceBlocks (large)', 2000, () => {
    modifyHelper.parseSearchReplaceBlocks(SR_INPUT_LARGE);
  });
  results.push(parseLargeResult);
  
  // 6. collapseRepetitiveOutput
  const collapseRepetitiveResult = bench('collapseRepetitiveOutput (repetitive)', 2000, () => {
    helper.collapseRepetitiveOutput(REPETITIVE_TEXT);
  });
  results.push(collapseRepetitiveResult);
  
  const collapseUniqueResult = bench('collapseRepetitiveOutput (unique)', 2000, () => {
    helper.collapseRepetitiveOutput(NON_REPETITIVE_TEXT);
  });
  results.push(collapseUniqueResult);
  
  const collapseShortResult = bench('collapseRepetitiveOutput (short/no-op)', 5000, () => {
    helper.collapseRepetitiveOutput('Short text');
  });
  results.push(collapseShortResult);
  
  // Summary table
  const separator = '='.repeat(90);
  console.log(separator);
  console.log('Smart AI Bridge - Performance Benchmarks');
  console.log(separator);
  console.log(
    'Benchmark'.padEnd(38),
    'ops/sec'.padStart(10),
    'avg ms'.padStart(10),
    'min ms'.padStart(10),
    'max ms'.padStart(10),
    'iters'.padStart(8)
  );
  console.log('-'.repeat(90));
  
  for (const result of results) {
    const name = result.name.length > 37 
      ? result.name.substring(0, 34) + '...' 
      : result.name.padEnd(38);
    
    console.log(
      name,
      String(result.opsPerSec).padStart(10),
      result.avg.toFixed(4).padStart(10),
      result.min.toFixed(4).padStart(10),
      result.max.toFixed(4).padStart(10),
      result.iterations.toString().padStart(8)
    );
  }
  
  console.log(separator);
  console.log(`Total benchmarks: ${results.length}`);
  console.log(separator);
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});