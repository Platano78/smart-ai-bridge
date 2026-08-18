/**
 * @fileoverview An operator-declared local endpoint URL is authoritative:
 * initializeEndpoint() must use it as-is — no port scan behind the
 * operator's back, no clobbering with the discovery fallback — and it must
 * survive forceRediscovery(), which nulls config.url before re-initializing.
 * A server on a port outside the autodiscovery scan list is exactly the
 * case a declaration exists for (declared > discovered > honest default).
 */
import { describe, it, expect } from 'vitest';
import { LocalAdapter } from '../src/backends/local-adapter.js';

const DECLARED = 'http://test-declared:9999/v1/chat/completions';

function declaredAdapter() {
  const adapter = new LocalAdapter({ url: DECLARED, skipAutodiscovery: true });
  // Neither discovery nor the network may be touched when a URL is declared.
  adapter.detector.discover = async () => {
    throw new Error('discover() must not be called for a declared URL');
  };
  adapter.fetchModelInfo = async () => {};
  return adapter;
}

describe('local adapter: declared endpoint URL', () => {
  it('uses the declared URL without scanning and without fallback clobber', async () => {
    const adapter = declaredAdapter();
    await adapter.initializeEndpoint();
    expect(adapter.config.url).toBe(DECLARED);
    expect(adapter.initialized).toBe(true);
  });

  it('restores the declared URL across forceRediscovery()', async () => {
    const adapter = declaredAdapter();
    await adapter.initializeEndpoint();
    await adapter.forceRediscovery();
    expect(adapter.config.url).toBe(DECLARED);
  });

  it('still runs autodiscovery when no URL is declared', async () => {
    const adapter = new LocalAdapter({ skipAutodiscovery: true });
    let scanned = false;
    adapter.detector.discover = async () => { scanned = true; return null; };
    await adapter.initializeEndpoint();
    expect(scanned).toBe(true);
  });
});
