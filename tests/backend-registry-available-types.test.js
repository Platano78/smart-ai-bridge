/**
 * @fileoverview 2.1 — getAvailableTypes() excludes the retired nvidia_qwen alias
 * from the creatable-type list, while it stays resolvable via FRIENDLY_NAME_MAP.
 */
import { describe, it, expect } from 'vitest';
import { BackendRegistry, ADAPTER_CLASSES } from '../src/backends/backend-registry.js';

describe('BackendRegistry.getAvailableTypes / getAdapter — deprecated alias handling', () => {
  it('getAvailableTypes() excludes nvidia_qwen', () => {
    const registry = new BackendRegistry({ autoInitialize: false });
    expect(registry.getAvailableTypes()).not.toContain('nvidia_qwen');
    // Sanity: it still exists in ADAPTER_CLASSES (resolvable), just filtered from the list.
    expect(Object.keys(ADAPTER_CLASSES)).toContain('nvidia_qwen');
  });

  it('getAdapter(\'nvidia_qwen\') still resolves via FRIENDLY_NAME_MAP to the GLM lane', () => {
    const registry = new BackendRegistry({ autoInitialize: false });
    const glmAdapter = { name: 'nvidia_glm' };
    registry.adapters.set('nvidia_glm', glmAdapter);

    expect(registry.getAdapter('nvidia_qwen')).toBe(glmAdapter);
  });
});
