#!/usr/bin/env node

/**
 * Migration Script: Seed CompoundLearningEngine from AdaptiveRouter Data
 * 
 * This script imports historical data from the dormant AdaptiveRouter system
 * into the active CompoundLearningEngine for instant knowledge growth.
 * 
 * Data sources:
 * - AdaptiveRouter patterns: data/test_adaptive_routing/patterns.json
 * - AdaptiveRouter decisions: data/test_adaptive_routing/decisions/*.json
 * 
 * Target:
 * - CompoundLearning state: data/learning/learning-state.json
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Paths
const ADAPTIVE_PATTERNS_PATH = path.join(PROJECT_ROOT, 'data/test_adaptive_routing/patterns.json');
const ADAPTIVE_DECISIONS_DIR = path.join(PROJECT_ROOT, 'data/test_adaptive_routing/decisions');
const COMPOUND_STATE_PATH = path.join(PROJECT_ROOT, 'data/learning/learning-state.json');

/**
 * Map AdaptiveRouter content patterns to CompoundLearning task types
 */
const CONTENT_TO_TASK_TYPE = {
  'coding': 'code_generation',
  'analysis': 'analysis',
  'game_dev': 'code_generation',
  'test': 'testing',
  'test_pattern': 'testing',
  'new_pattern': 'general',
  'pattern1': 'general',
  'pattern2': 'general'
};

/**
 * Map AdaptiveRouter backends to CompoundLearning tool names
 */
const BACKEND_TO_TOOL = {
  'local': 'local_qwen_coder',
  'nvidia_deepseek': 'nvidia_deepseek_v3',
  'nvidia_qwen': 'nvidia_qwen480b',
  'gemini': 'gemini_flash'
};

async function loadAdaptivePatterns() {
  try {
    const data = await fs.readFile(ADAPTIVE_PATTERNS_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.log('No AdaptiveRouter patterns found, starting fresh');
    return null;
  }
}

async function loadAdaptiveDecisions() {
  try {
    const files = await fs.readdir(ADAPTIVE_DECISIONS_DIR);
    const decisions = [];
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const data = await fs.readFile(path.join(ADAPTIVE_DECISIONS_DIR, file), 'utf-8');
      decisions.push(JSON.parse(data));
    }
    
    console.log(`Loaded ${decisions.length} AdaptiveRouter decisions`);
    return decisions;
  } catch (err) {
    console.log('No AdaptiveRouter decisions found');
    return [];
  }
}

async function loadCompoundState() {
  try {
    const data = await fs.readFile(COMPOUND_STATE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.log('No existing CompoundLearning state, creating new');
    return {
      toolMetrics: {},
      taskPatterns: {},
      sourceMetrics: {},
      perceptionHits: { triggered: 0, skipped: 0, beneficial: 0 },
      routingHistory: [],
      savedAt: Date.now()
    };
  }
}

function convertPatternToCompound(adaptivePatterns, compoundState) {
  if (!adaptivePatterns) return compoundState;

  console.log('\nConverting AdaptiveRouter patterns...');

  // Process content patterns
  for (const [patternName, patternData] of Object.entries(adaptivePatterns.by_content || {})) {
    const taskType = CONTENT_TO_TASK_TYPE[patternName] || 'general';
    const confidence = patternData.confidence || 0.7;
    const backend = patternData.backend || 'local';
    const tool = BACKEND_TO_TOOL[backend] || 'local_qwen_coder';

    // Create pattern key (low complexity for content patterns)
    const patternKey = `low:${taskType}:single`;

    if (!compoundState.taskPatterns[patternKey]) {
      compoundState.taskPatterns[patternKey] = {
        toolPerformance: {},
        totalSamples: 0
      };
    }

    // Seed with assumed success based on confidence
    const samples = patternData.samples || 5;
    const successSum = samples * confidence;

    if (!compoundState.taskPatterns[patternKey].toolPerformance[tool]) {
      compoundState.taskPatterns[patternKey].toolPerformance[tool] = {
        calls: 0,
        successSum: 0
      };
    }

    compoundState.taskPatterns[patternKey].toolPerformance[tool].calls += samples;
    compoundState.taskPatterns[patternKey].toolPerformance[tool].successSum += successSum;
    compoundState.taskPatterns[patternKey].totalSamples += samples;

    console.log(`  + Pattern "${patternName}" -> ${patternKey} (${samples} samples, ${(confidence * 100).toFixed(0)}% confidence)`);
  }

  // Process task type patterns
  for (const [taskType, patternData] of Object.entries(adaptivePatterns.by_task_type || {})) {
    const confidence = patternData.confidence || 0.7;
    const patternKey = `medium:${taskType}:single`;

    if (!compoundState.taskPatterns[patternKey]) {
      compoundState.taskPatterns[patternKey] = {
        toolPerformance: { 'local_qwen_coder': { calls: 5, successSum: 5 * confidence } },
        totalSamples: 5
      };
      console.log(`  + Task type "${taskType}" -> ${patternKey}`);
    }
  }

  return compoundState;
}

function convertDecisionsToCompound(decisions, compoundState) {
  if (!decisions || decisions.length === 0) return compoundState;

  console.log('\nConverting AdaptiveRouter decisions...');

  let imported = 0;

  for (const decision of decisions) {
    const characteristics = decision.characteristics || {};
    const routing = decision.routing || {};
    const outcome = decision.outcome || {};

    // Determine complexity level
    const complexity = characteristics.complexity || 0.5;
    const complexityLevel = complexity > 0.7 ? 'high' : complexity > 0.4 ? 'medium' : 'low';

    // Determine task type
    const taskType = characteristics.task_type || 'general';

    // Determine file pattern
    const promptLength = characteristics.prompt_length || 0;
    const filePattern = promptLength > 5000 ? 'multi' : 'single';

    // Create pattern key
    const patternKey = `${complexityLevel}:${taskType}:${filePattern}`;

    // Get tool and success
    const backend = routing.backend || 'local';
    const tool = BACKEND_TO_TOOL[backend] || 'local_qwen_coder';
    const success = outcome.success ? (outcome.quality || 0.8) : 0.3;

    // Update pattern
    if (!compoundState.taskPatterns[patternKey]) {
      compoundState.taskPatterns[patternKey] = {
        toolPerformance: {},
        totalSamples: 0
      };
    }

    if (!compoundState.taskPatterns[patternKey].toolPerformance[tool]) {
      compoundState.taskPatterns[patternKey].toolPerformance[tool] = {
        calls: 0,
        successSum: 0
      };
    }

    compoundState.taskPatterns[patternKey].toolPerformance[tool].calls += 1;
    compoundState.taskPatterns[patternKey].toolPerformance[tool].successSum += success;
    compoundState.taskPatterns[patternKey].totalSamples += 1;

    // Add to routing history (keep last 200)
    compoundState.routingHistory.push({
      timestamp: new Date(decision.timestamp).getTime(),
      task: `[Migrated from AdaptiveRouter] ${taskType}`,
      tool,
      source: 'adaptive_router_migration',
      success,
      context: {
        complexity: complexityLevel,
        taskType,
        fileCount: 1
      }
    });

    imported++;
  }

  // Trim routing history to last 200
  if (compoundState.routingHistory.length > 200) {
    compoundState.routingHistory = compoundState.routingHistory.slice(-200);
  }

  // Update source metrics for migration
  if (!compoundState.sourceMetrics) {
    compoundState.sourceMetrics = {};
  }
  compoundState.sourceMetrics['adaptive_router_migration'] = {
    calls: imported,
    successSum: imported * 0.75,  // Assume 75% average success
    confidence: 0.75
  };

  console.log(`  Imported ${imported} decisions`);

  return compoundState;
}

async function saveCompoundState(state) {
  state.savedAt = Date.now();
  state.migratedAt = Date.now();
  state.migrationVersion = '1.0';

  await fs.mkdir(path.dirname(COMPOUND_STATE_PATH), { recursive: true });
  await fs.writeFile(COMPOUND_STATE_PATH, JSON.stringify(state, null, 2));
  console.log(`\nSaved updated CompoundLearning state to ${COMPOUND_STATE_PATH}`);
}

async function main() {
  console.log('='.repeat(60));
  console.log('AdaptiveRouter -> CompoundLearning Migration');
  console.log('='.repeat(60));

  // Load data
  const adaptivePatterns = await loadAdaptivePatterns();
  const adaptiveDecisions = await loadAdaptiveDecisions();
  let compoundState = await loadCompoundState();

  // Check if already migrated
  if (compoundState.migrationVersion) {
    console.log(`\nAlready migrated (version ${compoundState.migrationVersion})`);
    console.log('Use --force to re-run migration');
    if (!process.argv.includes('--force')) {
      return;
    }
    console.log('Forcing re-migration...');
  }

  // Convert patterns
  compoundState = convertPatternToCompound(adaptivePatterns, compoundState);

  // Convert decisions
  compoundState = convertDecisionsToCompound(adaptiveDecisions, compoundState);

  // Save
  await saveCompoundState(compoundState);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Migration Summary');
  console.log('='.repeat(60));
  console.log(`Task Patterns: ${Object.keys(compoundState.taskPatterns).length}`);
  console.log(`Routing History: ${compoundState.routingHistory.length} entries`);
  console.log(`Source Metrics: ${Object.keys(compoundState.sourceMetrics || {}).length}`);
  console.log('\nMigration complete!');
}

main().catch(console.error);
