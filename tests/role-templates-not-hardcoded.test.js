/**
 * @fileoverview REGRESSION GUARD: role-templates.js must express what a role
 * NEEDS as a capability requirement, never as a hardcoded backend name.
 *
 *   `fallback_order` used to be a static array of backend names per role
 *   (e.g. ['local', 'nvidia_glm', 'gemini']) — an operator without those
 *   exact names configured got a roster of backends that don't exist.
 *   `routing_rules.{small_task,large_context}.prefer` used to name a
 *   specific backend for the SAME reason its own `reason` string admits
 *   ("Deep reasoning for architecture", "128K context for large codebases")
 *   — the name was a stale stand-in for a capability.
 *
 * Both are now getters resolved live against a BackendRegistry wired via
 * setBackendRegistry(), so the two live consumers (subagent-handler.js and
 * capability-matcher.js#findBestBackend) keep receiving the exact shape
 * they already expect (a string[] / a string), just computed rather than
 * baked in.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { roleTemplates, setBackendRegistry } from '../src/config/role-templates.js';
import { findBestBackend } from '../src/utils/capability-matcher.js';

function makeRegistry(backends) {
  return {
    getUsableBackends: () => Object.keys(backends),
    getBackend: (name) => backends[name] || null
  };
}

afterEach(() => setBackendRegistry(null));

describe('fallback_order resolves live, never a hardcoded name', () => {
  it('a role resolves to a capability-matching backend under a CUSTOM name', () => {
    setBackendRegistry(makeRegistry({
      acme_coder: { capabilities: ['code_specialized'] }
    }));

    expect(roleTemplates['code-reviewer'].fallback_order).toContain('acme_coder');
  });

  it('an operator with only one unrelated (non-matching) backend still gets a non-empty roster', () => {
    setBackendRegistry(makeRegistry({
      acme_general: { capabilities: ['general'] } // doesn't declare code_specialized
    }));

    // code-reviewer requires code_specialized; the operator's one backend
    // doesn't have it, but the roster must still include it rather than []
    const order = roleTemplates['code-reviewer'].fallback_order;
    expect(order.length).toBeGreaterThan(0);
    expect(order).toContain('acme_general');
  });

  it('degrades to an empty array (never throws) with nothing usable', () => {
    setBackendRegistry(makeRegistry({}));
    expect(() => roleTemplates['code-reviewer'].fallback_order).not.toThrow();
    expect(roleTemplates['code-reviewer'].fallback_order).toEqual([]);
  });

  it('degrades to an empty array (never throws) with no registry wired at all', () => {
    expect(roleTemplates['code-reviewer'].fallback_order).toEqual([]);
  });
});

describe('planner routing_rules.*.prefer resolves by capability, not by name', () => {
  it('small_task.prefer resolves to a custom-named deep-reasoning backend', () => {
    setBackendRegistry(makeRegistry({
      acme_thinker: { capabilities: ['deep_reasoning'] }
    }));
    expect(roleTemplates.planner.routing_rules.small_task.prefer).toBe('acme_thinker');
  });

  it('large_context.prefer resolves to a custom-named large-context backend', () => {
    setBackendRegistry(makeRegistry({
      acme_bigctx: { capabilities: ['large_context'] }
    }));
    expect(roleTemplates.planner.routing_rules.large_context.prefer).toBe('acme_bigctx');
  });

  it('resolves to null (not a name) when nothing usable has the capability', () => {
    setBackendRegistry(makeRegistry({ acme_general: { capabilities: ['general'] } }));
    expect(roleTemplates.planner.routing_rules.small_task.prefer).toBeNull();
  });
});

describe('both live consumers still receive the shape they expect', () => {
  it('findBestBackend (capability-matcher.js) works end-to-end against a resolved template', () => {
    setBackendRegistry(makeRegistry({
      acme_coder: { capabilities: ['code_specialized'] }
    }));
    const template = roleTemplates['code-reviewer'];

    const result = findBestBackend({
      requiredCapabilities: template.required_capabilities,
      availableBackends: ['acme_coder'],
      fallbackOrder: template.fallback_order,
      contextSize: 'small',
      routingRules: template.routing_rules || null,
      getLocalCapabilities: () => ['general']
    });

    expect(result.backend).toBe('acme_coder');
  });

  it('routing_rules.prefer flows through findBestBackend exactly as a plain string would', () => {
    setBackendRegistry(makeRegistry({
      acme_bigctx: { capabilities: ['large_context'] }
    }));
    const template = roleTemplates.planner;

    const result = findBestBackend({
      requiredCapabilities: template.required_capabilities,
      availableBackends: ['acme_bigctx'],
      fallbackOrder: template.fallback_order,
      contextSize: 'large',
      routingRules: template.routing_rules,
      getLocalCapabilities: () => ['general']
    });

    expect(result.backend).toBe('acme_bigctx');
    expect(result.reason).toBe('128K context for large codebases');
  });

  it('subagent-handler.js\'s `template.fallback_order || []` access pattern still works', () => {
    setBackendRegistry(makeRegistry({}));
    // No throw, plain array, .join() works — matches getAvailableBackendsForSubagent's usage.
    const order = roleTemplates['security-auditor'].fallback_order || [];
    expect(Array.isArray(order)).toBe(true);
    expect(() => order.join(', ')).not.toThrow();
  });
});
