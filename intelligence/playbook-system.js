/**
 * Smart AI Bridge v1.6.0 - Playbook System
 *
 * Workflow templates for common development patterns:
 * 1. Predefined playbooks for common tasks
 * 2. User-defined custom playbooks
 * 3. Step-by-step execution with checkpoints
 * 4. Parameterized templates
 *
 * Playbooks define reusable multi-step workflows that can be
 * triggered by name and executed with context-specific parameters.
 */

import fs from 'fs';
import path from 'path';

/**
 * Playbook step types
 */
const STEP_TYPES = {
  ANALYZE: 'analyze',     // Analyze files/code
  GENERATE: 'generate',   // Generate code
  MODIFY: 'modify',       // Modify existing files
  VALIDATE: 'validate',   // Run validation/tests
  REVIEW: 'review',       // Code review
  DECISION: 'decision',   // Branching decision point
  CHECKPOINT: 'checkpoint' // Save state checkpoint
};

/**
 * Built-in playbook templates
 */
const BUILTIN_PLAYBOOKS = {
  'tdd-feature': {
    name: 'TDD Feature Implementation',
    description: 'Implement a feature using Test-Driven Development',
    parameters: [
      { name: 'feature', type: 'string', required: true, description: 'Feature description' },
      { name: 'targetFiles', type: 'array', required: false, description: 'Target file paths' }
    ],
    steps: [
      {
        id: 'analyze',
        type: STEP_TYPES.ANALYZE,
        description: 'Analyze existing codebase for context',
        config: { analysisType: 'architecture' }
      },
      {
        id: 'plan',
        type: STEP_TYPES.GENERATE,
        description: 'Plan test cases for the feature',
        config: { backend: 'qwen3', template: 'test_plan' }
      },
      {
        id: 'red',
        type: STEP_TYPES.GENERATE,
        description: 'Write failing tests (RED phase)',
        config: { backend: 'local', template: 'failing_test' }
      },
      {
        id: 'checkpoint_red',
        type: STEP_TYPES.CHECKPOINT,
        description: 'Save RED phase state'
      },
      {
        id: 'green',
        type: STEP_TYPES.GENERATE,
        description: 'Implement to pass tests (GREEN phase)',
        config: { backend: 'local', template: 'implementation' }
      },
      {
        id: 'validate',
        type: STEP_TYPES.VALIDATE,
        description: 'Run tests to verify implementation',
        config: { command: 'npm test' }
      },
      {
        id: 'refactor',
        type: STEP_TYPES.REVIEW,
        description: 'Review and refactor code',
        config: { backend: 'deepseek3.1', reviewType: 'refactoring' }
      }
    ]
  },

  'bug-fix': {
    name: 'Bug Fix Workflow',
    description: 'Systematic bug investigation and fix',
    parameters: [
      { name: 'bugDescription', type: 'string', required: true, description: 'Bug description' },
      { name: 'errorMessage', type: 'string', required: false, description: 'Error message if available' }
    ],
    steps: [
      {
        id: 'investigate',
        type: STEP_TYPES.ANALYZE,
        description: 'Analyze code to find bug root cause',
        config: { analysisType: 'bug' }
      },
      {
        id: 'reproduce',
        type: STEP_TYPES.GENERATE,
        description: 'Create reproduction test',
        config: { backend: 'local', template: 'reproduction_test' }
      },
      {
        id: 'fix',
        type: STEP_TYPES.MODIFY,
        description: 'Apply fix to the code',
        config: { backend: 'auto' }
      },
      {
        id: 'verify',
        type: STEP_TYPES.VALIDATE,
        description: 'Verify fix with tests',
        config: { command: 'npm test' }
      },
      {
        id: 'review',
        type: STEP_TYPES.REVIEW,
        description: 'Review fix for side effects',
        config: { backend: 'deepseek3.1', reviewType: 'security' }
      }
    ]
  },

  'code-review': {
    name: 'Comprehensive Code Review',
    description: 'Multi-aspect code review workflow',
    parameters: [
      { name: 'files', type: 'array', required: true, description: 'Files to review' },
      { name: 'depth', type: 'string', required: false, default: 'standard', description: 'Review depth: quick|standard|thorough' }
    ],
    steps: [
      {
        id: 'quality',
        type: STEP_TYPES.REVIEW,
        description: 'Review code quality and patterns',
        config: { backend: 'qwen3', reviewType: 'quality' }
      },
      {
        id: 'security',
        type: STEP_TYPES.REVIEW,
        description: 'Security vulnerability scan',
        config: { backend: 'deepseek3.1', reviewType: 'security' }
      },
      {
        id: 'performance',
        type: STEP_TYPES.REVIEW,
        description: 'Performance analysis',
        config: { backend: 'local', reviewType: 'performance' }
      },
      {
        id: 'summarize',
        type: STEP_TYPES.GENERATE,
        description: 'Generate review summary',
        config: { backend: 'gemini', template: 'review_summary' }
      }
    ]
  },

  'refactor': {
    name: 'Safe Refactoring',
    description: 'Refactor code with safety checks',
    parameters: [
      { name: 'target', type: 'string', required: true, description: 'Code to refactor' },
      { name: 'goal', type: 'string', required: true, description: 'Refactoring goal' }
    ],
    steps: [
      {
        id: 'snapshot',
        type: STEP_TYPES.CHECKPOINT,
        description: 'Create pre-refactor snapshot'
      },
      {
        id: 'analyze',
        type: STEP_TYPES.ANALYZE,
        description: 'Analyze dependencies and usage',
        config: { analysisType: 'architecture' }
      },
      {
        id: 'plan',
        type: STEP_TYPES.GENERATE,
        description: 'Create refactoring plan',
        config: { backend: 'qwen3', template: 'refactor_plan' }
      },
      {
        id: 'decision',
        type: STEP_TYPES.DECISION,
        description: 'Confirm refactoring plan',
        config: { requireApproval: true }
      },
      {
        id: 'execute',
        type: STEP_TYPES.MODIFY,
        description: 'Apply refactoring changes',
        config: { backend: 'auto', atomic: true }
      },
      {
        id: 'test',
        type: STEP_TYPES.VALIDATE,
        description: 'Run tests to verify behavior preserved',
        config: { command: 'npm test' }
      },
      {
        id: 'review',
        type: STEP_TYPES.REVIEW,
        description: 'Final review of changes',
        config: { backend: 'deepseek3.1', reviewType: 'quality' }
      }
    ]
  },

  'documentation': {
    name: 'Documentation Generation',
    description: 'Generate comprehensive documentation',
    parameters: [
      { name: 'scope', type: 'string', required: true, description: 'Documentation scope: file|module|project' },
      { name: 'format', type: 'string', required: false, default: 'markdown', description: 'Output format' }
    ],
    steps: [
      {
        id: 'analyze',
        type: STEP_TYPES.ANALYZE,
        description: 'Analyze code structure',
        config: { analysisType: 'architecture' }
      },
      {
        id: 'api',
        type: STEP_TYPES.GENERATE,
        description: 'Generate API documentation',
        config: { backend: 'qwen3', template: 'api_docs' }
      },
      {
        id: 'examples',
        type: STEP_TYPES.GENERATE,
        description: 'Generate usage examples',
        config: { backend: 'local', template: 'examples' }
      },
      {
        id: 'readme',
        type: STEP_TYPES.GENERATE,
        description: 'Generate README content',
        config: { backend: 'gemini', template: 'readme' }
      }
    ]
  }
};

/**
 * Playbook execution state
 */
class PlaybookExecution {
  constructor(playbook, parameters, executionId) {
    this.executionId = executionId;
    this.playbook = playbook;
    this.parameters = parameters;
    this.currentStepIndex = 0;
    this.status = 'pending'; // pending, running, paused, completed, failed
    this.stepResults = {};
    this.checkpoints = {};
    this.startedAt = null;
    this.completedAt = null;
    this.error = null;
  }

  toJSON() {
    return {
      executionId: this.executionId,
      playbookName: this.playbook.name,
      parameters: this.parameters,
      currentStepIndex: this.currentStepIndex,
      status: this.status,
      stepResults: this.stepResults,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      error: this.error
    };
  }
}

/**
 * Playbook System
 * Manages playbook definitions and execution
 */
class PlaybookSystem {
  constructor(config = {}) {
    this.config = {
      dataDir: config.dataDir || './data/playbooks',
      enableBuiltins: config.enableBuiltins ?? true,
      maxExecutions: config.maxExecutions || 100,
      ...config
    };

    // Playbook registry
    this.playbooks = new Map();

    // Execution tracking
    this.executions = new Map();

    this._ensureDataDir();
    this._loadPlaybooks();

    // Register built-in playbooks
    if (this.config.enableBuiltins) {
      for (const [name, playbook] of Object.entries(BUILTIN_PLAYBOOKS)) {
        this.playbooks.set(name, { ...playbook, builtin: true });
      }
    }
  }

  /**
   * List available playbooks
   * @returns {Array} Playbook summaries
   */
  listPlaybooks() {
    const list = [];
    for (const [name, playbook] of this.playbooks) {
      list.push({
        name,
        title: playbook.name,
        description: playbook.description,
        stepCount: playbook.steps.length,
        parameters: playbook.parameters,
        builtin: playbook.builtin || false
      });
    }
    return list;
  }

  /**
   * Get playbook definition
   * @param {string} name - Playbook name
   * @returns {Object|null} Playbook definition
   */
  getPlaybook(name) {
    return this.playbooks.get(name) || null;
  }

  /**
   * Register a custom playbook
   * @param {string} name - Unique playbook name
   * @param {Object} definition - Playbook definition
   * @returns {boolean} Success
   */
  registerPlaybook(name, definition) {
    if (!name || !definition.steps || !Array.isArray(definition.steps)) {
      throw new Error('Invalid playbook definition');
    }

    // Validate steps
    for (const step of definition.steps) {
      if (!step.id || !step.type) {
        throw new Error(`Invalid step: missing id or type`);
      }
      if (!Object.values(STEP_TYPES).includes(step.type)) {
        throw new Error(`Unknown step type: ${step.type}`);
      }
    }

    this.playbooks.set(name, {
      ...definition,
      builtin: false,
      registeredAt: Date.now()
    });

    this._savePlaybooks();
    return true;
  }

  /**
   * Delete a custom playbook
   * @param {string} name - Playbook name
   * @returns {boolean} Success
   */
  deletePlaybook(name) {
    const playbook = this.playbooks.get(name);
    if (!playbook) return false;
    if (playbook.builtin) {
      throw new Error('Cannot delete built-in playbook');
    }

    this.playbooks.delete(name);
    this._savePlaybooks();
    return true;
  }

  /**
   * Start playbook execution
   * @param {string} playbookName - Playbook to execute
   * @param {Object} parameters - Execution parameters
   * @returns {Object} Execution info
   */
  startExecution(playbookName, parameters = {}) {
    const playbook = this.playbooks.get(playbookName);
    if (!playbook) {
      throw new Error(`Playbook not found: ${playbookName}`);
    }

    // Validate required parameters
    for (const param of playbook.parameters || []) {
      if (param.required && parameters[param.name] === undefined) {
        throw new Error(`Missing required parameter: ${param.name}`);
      }
    }

    // Apply defaults
    const resolvedParams = { ...parameters };
    for (const param of playbook.parameters || []) {
      if (resolvedParams[param.name] === undefined && param.default !== undefined) {
        resolvedParams[param.name] = param.default;
      }
    }

    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const execution = new PlaybookExecution(playbook, resolvedParams, executionId);
    execution.startedAt = Date.now();
    execution.status = 'running';

    this.executions.set(executionId, execution);

    // Enforce max executions
    if (this.executions.size > this.config.maxExecutions) {
      this._cleanOldExecutions();
    }

    return {
      executionId,
      playbookName,
      parameters: resolvedParams,
      totalSteps: playbook.steps.length,
      status: 'running'
    };
  }

  /**
   * Get current step for an execution
   * @param {string} executionId - Execution ID
   * @returns {Object|null} Current step info
   */
  getCurrentStep(executionId) {
    const execution = this.executions.get(executionId);
    if (!execution) return null;

    const step = execution.playbook.steps[execution.currentStepIndex];
    if (!step) return null;

    return {
      executionId,
      stepIndex: execution.currentStepIndex,
      totalSteps: execution.playbook.steps.length,
      step: {
        id: step.id,
        type: step.type,
        description: step.description,
        config: step.config
      },
      parameters: execution.parameters,
      previousResults: execution.stepResults
    };
  }

  /**
   * Complete a step and advance to next
   * @param {string} executionId - Execution ID
   * @param {Object} result - Step result
   * @returns {Object} Next step or completion status
   */
  completeStep(executionId, result) {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    if (execution.status !== 'running') {
      throw new Error(`Execution is not running: ${execution.status}`);
    }

    const currentStep = execution.playbook.steps[execution.currentStepIndex];

    // Store result
    execution.stepResults[currentStep.id] = {
      ...result,
      completedAt: Date.now()
    };

    // Handle checkpoint
    if (currentStep.type === STEP_TYPES.CHECKPOINT) {
      execution.checkpoints[currentStep.id] = {
        stepIndex: execution.currentStepIndex,
        results: { ...execution.stepResults },
        savedAt: Date.now()
      };
    }

    // Advance to next step
    execution.currentStepIndex++;

    // Check if complete
    if (execution.currentStepIndex >= execution.playbook.steps.length) {
      execution.status = 'completed';
      execution.completedAt = Date.now();

      return {
        executionId,
        status: 'completed',
        totalSteps: execution.playbook.steps.length,
        results: execution.stepResults
      };
    }

    return this.getCurrentStep(executionId);
  }

  /**
   * Pause execution
   * @param {string} executionId - Execution ID
   * @returns {boolean} Success
   */
  pauseExecution(executionId) {
    const execution = this.executions.get(executionId);
    if (!execution || execution.status !== 'running') return false;

    execution.status = 'paused';
    return true;
  }

  /**
   * Resume paused execution
   * @param {string} executionId - Execution ID
   * @returns {Object|null} Current step
   */
  resumeExecution(executionId) {
    const execution = this.executions.get(executionId);
    if (!execution || execution.status !== 'paused') return null;

    execution.status = 'running';
    return this.getCurrentStep(executionId);
  }

  /**
   * Rollback to checkpoint
   * @param {string} executionId - Execution ID
   * @param {string} checkpointId - Checkpoint step ID
   * @returns {Object|null} Step after rollback
   */
  rollbackToCheckpoint(executionId, checkpointId) {
    const execution = this.executions.get(executionId);
    if (!execution) return null;

    const checkpoint = execution.checkpoints[checkpointId];
    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    execution.currentStepIndex = checkpoint.stepIndex + 1;
    execution.stepResults = { ...checkpoint.results };
    execution.status = 'running';

    return this.getCurrentStep(executionId);
  }

  /**
   * Fail execution with error
   * @param {string} executionId - Execution ID
   * @param {string} error - Error message
   */
  failExecution(executionId, error) {
    const execution = this.executions.get(executionId);
    if (!execution) return;

    execution.status = 'failed';
    execution.error = error;
    execution.completedAt = Date.now();
  }

  /**
   * Get execution status
   * @param {string} executionId - Execution ID
   * @returns {Object|null} Execution status
   */
  getExecutionStatus(executionId) {
    const execution = this.executions.get(executionId);
    if (!execution) return null;

    return execution.toJSON();
  }

  /**
   * Get all active executions
   * @returns {Array} Active execution summaries
   */
  getActiveExecutions() {
    const active = [];
    for (const [id, execution] of this.executions) {
      if (execution.status === 'running' || execution.status === 'paused') {
        active.push({
          executionId: id,
          playbookName: execution.playbook.name,
          status: execution.status,
          currentStep: execution.currentStepIndex,
          totalSteps: execution.playbook.steps.length,
          startedAt: execution.startedAt
        });
      }
    }
    return active;
  }

  // ============ Private Methods ============

  /**
   * Ensure data directory exists
   * @private
   */
  _ensureDataDir() {
    if (!fs.existsSync(this.config.dataDir)) {
      fs.mkdirSync(this.config.dataDir, { recursive: true });
    }
  }

  /**
   * Save custom playbooks to disk
   * @private
   */
  _savePlaybooks() {
    try {
      const custom = {};
      for (const [name, playbook] of this.playbooks) {
        if (!playbook.builtin) {
          custom[name] = playbook;
        }
      }

      const filePath = path.join(this.config.dataDir, 'custom-playbooks.json');
      fs.writeFileSync(filePath, JSON.stringify(custom, null, 2));
    } catch (error) {
      console.error('[Playbook] Failed to save:', error.message);
    }
  }

  /**
   * Load custom playbooks from disk
   * @private
   */
  _loadPlaybooks() {
    try {
      const filePath = path.join(this.config.dataDir, 'custom-playbooks.json');
      if (fs.existsSync(filePath)) {
        const custom = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        for (const [name, playbook] of Object.entries(custom)) {
          this.playbooks.set(name, playbook);
        }
        console.error(`[Playbook] Loaded ${Object.keys(custom).length} custom playbooks`);
      }
    } catch (error) {
      console.error('[Playbook] Failed to load:', error.message);
    }
  }

  /**
   * Clean old completed/failed executions
   * @private
   */
  _cleanOldExecutions() {
    const executions = Array.from(this.executions.entries());

    // Sort by completion time (oldest first)
    executions.sort((a, b) => {
      const timeA = a[1].completedAt || a[1].startedAt;
      const timeB = b[1].completedAt || b[1].startedAt;
      return timeA - timeB;
    });

    // Remove oldest 20%
    const removeCount = Math.ceil(this.config.maxExecutions * 0.2);
    for (let i = 0; i < removeCount; i++) {
      const [id, execution] = executions[i];
      if (execution.status === 'completed' || execution.status === 'failed') {
        this.executions.delete(id);
      }
    }
  }
}

export { PlaybookSystem, PlaybookExecution, STEP_TYPES, BUILTIN_PLAYBOOKS };
export default PlaybookSystem;
