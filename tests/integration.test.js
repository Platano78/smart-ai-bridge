import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';

import { CORE_TOOL_DEFINITIONS } from '../src/tools/tool-definitions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));

const EXPECTED_TOOL_NAMES = new Set([
  'analyze_file',
  'ask',
  'backup_restore',
  'batch_analyze',
  'batch_modify',
  'check_backend_health',
  'council',
  'dual_iterate',
  'explore',
  'generate_file',
  'get_analytics',
  'manage_conversation',
  'modify_file',
  'parallel_agents',
  'refactor',
  'review',
  'spawn_subagent',
  'write_files_atomic',
]);

describe('integration smoke tests', () => {
  it('CORE_TOOL_DEFINITIONS is an array of length 18', () => {
    expect(Array.isArray(CORE_TOOL_DEFINITIONS)).toBe(true);
    expect(CORE_TOOL_DEFINITIONS.length).toBe(18);
  });

  it('tool names exactly match the expected set', () => {
    const actualNames = new Set(CORE_TOOL_DEFINITIONS.map(t => t.name));
    expect(actualNames).toEqual(EXPECTED_TOOL_NAMES);
  });

  it('package.json version matches semver pattern', () => {
    const version = pkg.version;
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('every tool schema compiles under Ajv without throwing', () => {
    CORE_TOOL_DEFINITIONS.forEach(def => {
      expect(() => new Ajv({ strict: false }).compile(def.schema)).not.toThrow();
    });
  });

  it('every tool has a non-empty handler and description', () => {
    CORE_TOOL_DEFINITIONS.forEach(def => {
      expect(typeof def.handler).toBe('string');
      expect(def.handler.length).toBeGreaterThan(0);
      expect(typeof def.description).toBe('string');
      expect(def.description.length).toBeGreaterThan(0);
    });
  });
});

describe('documentation consistency (drift guards)', () => {
  const readme = readFileSync(join(__dirname, '../README.md'), 'utf8');
  const changelog = readFileSync(join(__dirname, '../CHANGELOG.md'), 'utf8');

  it('README title version matches package.json', () => {
    const m = readme.match(/^# Smart AI Bridge v(\d+\.\d+\.\d+)/m);
    expect(m, 'README must start with "# Smart AI Bridge vX.Y.Z"').not.toBeNull();
    expect(m[1]).toBe(pkg.version);
  });

  it('CHANGELOG has an entry for the current version', () => {
    expect(changelog).toContain(`## [${pkg.version}]`);
  });

  it('README "Tools (N)" heading matches the actual tool count', () => {
    const m = readme.match(/##\s*Tools\s*\((\d+)\)/);
    expect(m, 'README must have a "## Tools (N)" heading').not.toBeNull();
    expect(Number(m[1])).toBe(CORE_TOOL_DEFINITIONS.length);
  });
});
