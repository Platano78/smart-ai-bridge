/**
 * @file Intelligence Module Exports
 * @description Central export for all SAB dual-iterate intelligence modules.
 */

// Phase 1-2 (Previously Complete)
export { DualWorkflowManager, WorkflowMode, ModelTier } from './dual-workflow-manager.js';
export { DualIterateExecutor, ReviewStatus } from './dual-iterate-executor.js';

// Phase 3: Self-Reflection Improvements
export { SelfReflectionConfig, ModelTier as SelfReflectionModelTier } from './self-reflection-config.js';
export { EnhancedSelfReview } from './enhanced-self-review.js';

// Phase 4: Learning Engine Integration
export { PatternRAGStore, generateEmbedding, cosineSimilarity } from './pattern-rag-store.js';
export { LearningEngine } from './learning-engine.js';

// Phase 5: Diff-Based Context Optimization
export { DiffContextOptimizer } from './diff-context-optimizer.js';

// Legacy exports (for compatibility)
export { default as CompoundLearning } from './compound-learning.js';
export { PlaybookSystem } from './playbook-system.js';
