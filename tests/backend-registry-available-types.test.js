/**
 * @fileoverview `nvidia_qwen` is GONE, not deprecated-but-resolvable.
 *
 * The lane existed because NVIDIA hosted Qwen3 Coder 480B. NVIDIA retired that
 * model, and its catalog now lists ZERO qwen models of any kind (verified live
 * 2026-08-18: 102 models, 25 owners, no qwen). An alias redirecting to a
 * differently-named lane only preserved a name for something that no longer
 * exists, so the backend was removed outright rather than kept as a redirect.
 *
 * This is a REGRESSION GUARD: the name must not come back through any of the
 * four places it used to live. Note it deliberately does NOT forbid the string
 * "qwen" repo-wide — a user may load a Qwen model on their own LOCAL router, and
 * those code paths (capability inference, FIM tokens, thinking suppression) are
 * unrelated to the retired NVIDIA lane and must keep working.
 */
import { describe, it, expect } from 'vitest';
import { BackendRegistry, ADAPTER_CLASSES } from '../src/backends/backend-registry.js';
import { PROVIDER_ENDPOINTS, CATALOG_KIND_FOR_TYPE } from '../src/backends/provider-endpoints.js';

describe('the nvidia_qwen backend is fully removed', () => {
  it('is not a creatable type', () => {
    const registry = new BackendRegistry({ autoInitialize: false });
    expect(registry.getAvailableTypes()).not.toContain('nvidia_qwen');
  });

  it('has no adapter class', () => {
    expect(Object.keys(ADAPTER_CLASSES)).not.toContain('nvidia_qwen');
  });

  it('has no provider endpoint or catalog kind', () => {
    expect(Object.keys(PROVIDER_ENDPOINTS)).not.toContain('nvidia_qwen');
    expect(Object.keys(CATALOG_KIND_FOR_TYPE)).not.toContain('nvidia_qwen');
  });

  it('no longer resolves as an alias — it names nothing', () => {
    const registry = new BackendRegistry({ autoInitialize: false });
    const glmAdapter = { name: 'nvidia_glm' };
    registry.adapters.set('nvidia_glm', glmAdapter);

    expect(registry.getAdapter('nvidia_qwen')).toBeNull();
    expect(registry.getAdapter('qwen3')).toBeNull();
    // the lane it used to redirect to is unaffected
    expect(registry.getAdapter('nvidia_glm')).toBe(glmAdapter);
  });

  it('the still-viable NVIDIA lanes are untouched — the provider is fine, the model was not', () => {
    expect(Object.keys(PROVIDER_ENDPOINTS)).toContain('nvidia_deepseek');
    expect(Object.keys(PROVIDER_ENDPOINTS)).toContain('nvidia_glm');
    expect(Object.keys(ADAPTER_CLASSES)).toContain('nvidia_glm');
  });
});
