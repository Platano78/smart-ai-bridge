/**
 * @fileoverview REGRESSION GUARD: SubagentHandler must not hardcode a
 * backend roster, key its health-check strategy on a backend NAME, or use a
 * per-name file-size-limit table.
 *
 *   1. getAvailableBackendsForSubagent() used to iterate a fixed array of
 *      five names — a backend the operator configured under any other name
 *      was never considered, even if usable.
 *   2. isBackendAvailable() used to pick checkLocalHealth/checkNvidiaHealth
 *      by testing `backend === 'local'` / `backend.startsWith('nvidia_')` —
 *      an operator-renamed instance of either type would fall through to
 *      "assume available" instead of getting the real check.
 *   3. getFileSizeLimits() used to look up a per-backend-name table (with
 *      'nvidia_glm' as the default for anything unrecognised) instead of
 *      the backend's real input capacity.
 */
import { describe, it, expect, vi } from 'vitest';
import { SubagentHandler } from '../src/handlers/subagent-handler.js';

describe('getAvailableBackendsForSubagent derives from the registry, not a fixed roster', () => {
  it('a backend configured but absent from the old hardcoded roster IS considered', async () => {
    const handler = new SubagentHandler({
      backendRegistry: {
        getUsableBackends: () => ['acme_custom_cloud'],
        getBackend: (name) => (name === 'acme_custom_cloud' ? { type: 'groq', config: {} } : null)
      }
      // No router wired -> isBackendAvailable falls through to the
      // type-based strategy; 'groq' is not 'local' or nvidia_*, so it is
      // assumed available (its adapter has its own timeout handling).
    });

    const available = await handler.getAvailableBackendsForSubagent();
    expect(available).toContain('acme_custom_cloud');
  });

  it('degrades to the ultimate fallback, never throws, when the registry has nothing usable', async () => {
    const handler = new SubagentHandler({
      backendRegistry: { getUsableBackends: () => [], getBackend: () => null }
    });

    await expect(handler.getAvailableBackendsForSubagent()).resolves.not.toThrow();
    const available = await handler.getAvailableBackendsForSubagent();
    expect(available).toEqual(['local']);
  });

  it('an operator-declared excludeFromSubagent IS honoured now that config actually reaches isSuitableForSubagent', async () => {
    const handler = new SubagentHandler({
      backendRegistry: {
        getUsableBackends: () => ['reserved_router_lane'],
        getBackend: (name) => (name === 'reserved_router_lane'
          ? { type: 'local', config: { excludeFromSubagent: true } }
          : null)
      }
    });
    // Stub the local health check so exclusion, not health, is what's being tested.
    handler.checkLocalHealth = async () => true;

    const available = await handler.getAvailableBackendsForSubagent();
    expect(available).not.toContain('reserved_router_lane');
  });
});

describe('isBackendAvailable keys its strategy on registered TYPE, not name', () => {
  it('a custom-named local-type backend gets the local health check', async () => {
    const handler = new SubagentHandler({
      backendRegistry: {
        getBackend: (name) => (name === 'my-renamed-local-lane' ? { type: 'local' } : null)
      }
    });
    const localSpy = vi.spyOn(handler, 'checkLocalHealth').mockResolvedValue(true);
    const nvidiaSpy = vi.spyOn(handler, 'checkNvidiaHealth').mockResolvedValue(true);

    const result = await handler.isBackendAvailable('my-renamed-local-lane');

    expect(result).toBe(true);
    expect(localSpy).toHaveBeenCalled();
    expect(nvidiaSpy).not.toHaveBeenCalled();
  });

  it('a custom-named nvidia_glm-type backend gets the nvidia health check', async () => {
    const handler = new SubagentHandler({
      backendRegistry: {
        getBackend: (name) => (name === 'my-renamed-glm-lane' ? { type: 'nvidia_glm' } : null)
      }
    });
    const localSpy = vi.spyOn(handler, 'checkLocalHealth').mockResolvedValue(true);
    const nvidiaSpy = vi.spyOn(handler, 'checkNvidiaHealth').mockResolvedValue(true);

    const result = await handler.isBackendAvailable('my-renamed-glm-lane');

    expect(result).toBe(true);
    expect(nvidiaSpy).toHaveBeenCalledWith('my-renamed-glm-lane', expect.any(Number));
    expect(localSpy).not.toHaveBeenCalled();
  });

  it('an unknown type is assumed available rather than guessing a strategy', async () => {
    const handler = new SubagentHandler({
      backendRegistry: { getBackend: () => ({ type: 'gemini' }) }
    });
    const localSpy = vi.spyOn(handler, 'checkLocalHealth').mockResolvedValue(true);
    const nvidiaSpy = vi.spyOn(handler, 'checkNvidiaHealth').mockResolvedValue(true);

    const result = await handler.isBackendAvailable('gemini');

    expect(result).toBe(true);
    expect(localSpy).not.toHaveBeenCalled();
    expect(nvidiaSpy).not.toHaveBeenCalled();
  });
});

describe('getFileSizeLimits derives from real capacity, not a per-name table', () => {
  it('an unknown backend name still gets a sane, positive size limit', async () => {
    const handler = new SubagentHandler({});
    const limits = await handler.getFileSizeLimits('some-backend-nobody-configured');

    expect(limits.maxTotalSize).toBeGreaterThan(0);
    expect(limits.maxSizePerFile).toBeGreaterThan(0);
    expect(limits.maxSizePerFile).toBeLessThanOrEqual(limits.maxTotalSize);
  });

  it('scales with the backend\'s actual resolved capacity rather than a fixed name lookup', async () => {
    const handler = new SubagentHandler({});
    handler.capacityFor = async (name) => (name === 'roomy' ? 1000000 : 10000);

    const roomy = await handler.getFileSizeLimits('roomy');
    const tight = await handler.getFileSizeLimits('tight');

    expect(roomy.maxTotalSize).toBeGreaterThan(tight.maxTotalSize);
  });
});
