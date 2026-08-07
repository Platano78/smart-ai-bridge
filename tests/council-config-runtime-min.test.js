/**
 * @fileoverview 1.3 — council config validation enforces the runtime >=2-backend
 * contract (council-handler.js requires >=2 available backends to convene).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { BackendRegistry } from '../src/backends/backend-registry.js';
import {
  CouncilConfigManager,
  setBackendRegistry,
  getEffectiveBackends,
  getActiveBackends
} from '../src/config/council-config-manager.js';

function freshManager(registryBackends) {
  const registry = new BackendRegistry({ autoInitialize: false });
  for (const b of registryBackends) registry.backends.set(b.name, b);
  setBackendRegistry(registry);
  return new CouncilConfigManager();
}

afterEach(() => setBackendRegistry(null));

describe('council-config-manager runtime minimum', () => {
  it('rejects a 1-backend topic config with a clear message', () => {
    const manager = freshManager([
      { name: 'local', type: 'local', enabled: true, priority: 1, description: '', config: {} },
      { name: 'gemini', type: 'gemini', enabled: true, priority: 2, description: '', config: {} }
    ]);

    const { valid, errors } = manager.validateConfig({
      version: 1,
      topics: { general: { strategy: 'parallel', backends: ['local'] } },
      defaults: ['local', 'gemini']
    });

    expect(valid).toBe(false);
    expect(errors.some(e => /general/.test(e) && /convene/i.test(e))).toBe(true);
  });

  it('rejects a 2-backend topic config whose second backend is disabled', () => {
    const manager = freshManager([
      { name: 'local', type: 'local', enabled: true, priority: 1, description: '', config: {} },
      { name: 'gemini', type: 'gemini', enabled: false, priority: 2, description: '', config: {} }
    ]);

    const { valid, errors } = manager.validateConfig({
      version: 1,
      topics: { general: { strategy: 'parallel', backends: ['local', 'gemini'] } },
      defaults: ['local', 'gemini']
    });

    expect(valid).toBe(false);
    expect(errors.some(e => /disabled/i.test(e))).toBe(true);
  });

  it('accepts a genuine 2-enabled-backend config', () => {
    const manager = freshManager([
      { name: 'local', type: 'local', enabled: true, priority: 1, description: '', config: {} },
      { name: 'gemini', type: 'gemini', enabled: true, priority: 2, description: '', config: {} }
    ]);

    const { valid, errors } = manager.validateConfig({
      version: 1,
      topics: { general: { strategy: 'parallel', backends: ['local', 'gemini'] } },
      defaults: ['local', 'gemini']
    });

    expect(valid).toBe(true);
    expect(errors).toEqual([]);
  });

  it('getActiveBackends excludes disabled backends while getEffectiveBackends still names them', () => {
    const registry = new BackendRegistry({ autoInitialize: false });
    registry.backends.set('local', { name: 'local', type: 'local', enabled: true, priority: 1, description: '', config: {} });
    registry.backends.set('gemini', { name: 'gemini', type: 'gemini', enabled: false, priority: 2, description: '', config: {} });
    setBackendRegistry(registry);

    expect(getEffectiveBackends()).toContain('gemini');
    expect(getActiveBackends()).not.toContain('gemini');
    expect(getActiveBackends()).toContain('local');
  });
});
