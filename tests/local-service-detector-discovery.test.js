/**
 * @fileoverview Fix A — LocalServiceDetector.discover() must probe all candidate
 * (ip, port) pairs concurrently, select the highest-PRIORITY responder (not the
 * fastest), and short-circuit repeat scans for 30s after a full scan finds nothing.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { LocalServiceDetector } from '../src/utils/local-service-detector.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LocalServiceDetector.discover() — priority-ordered concurrent probing', () => {
  it('selects the higher-priority endpoint even when a lower-priority probe resolves faster', async () => {
    const detector = new LocalServiceDetector({ ports: [8081, 8001] });

    // Force the strategies down to two deterministic IP lists so we know the
    // full priority order: localhost:8081, localhost:8001, then the WSL host
    // IP's ports. Stub testEndpoint directly (already covered by its own
    // contract) so this test is purely about discover()'s selection logic.
    detector.ipStrategies = [
      () => Promise.resolve(['127.0.0.1']),
      () => Promise.resolve(['10.0.0.5'])
    ];

    const testEndpointSpy = vi.spyOn(detector, 'testEndpoint').mockImplementation((ip, port) => {
      // The LOW-priority pair (10.0.0.5:8081) resolves almost immediately...
      if (ip === '10.0.0.5' && port === 8081) {
        return new Promise(resolve => setTimeout(() => resolve(`http://${ip}:${port}/v1/chat/completions`), 1));
      }
      // ...while the HIGH-priority pair (127.0.0.1:8081, first in strategy-then-port
      // order) resolves slower but must still win.
      if (ip === '127.0.0.1' && port === 8081) {
        return new Promise(resolve => setTimeout(() => resolve(`http://${ip}:${port}/v1/chat/completions`), 20));
      }
      return Promise.resolve(null);
    });

    const endpoint = await detector.discover();

    expect(endpoint).toBe('http://127.0.0.1:8081/v1/chat/completions');
    expect(testEndpointSpy).toHaveBeenCalled();
  });

  it('completes quickly when nothing is listening (all probes run concurrently, not serially)', async () => {
    const detector = new LocalServiceDetector({ ports: [8081, 8001, 8000, 1234, 5000] });

    detector.ipStrategies = [
      () => Promise.resolve(['127.0.0.1']),
      () => Promise.resolve(['10.0.0.5']),
      () => Promise.resolve(['172.19.224.1', '198.51.100.1'])
    ];

    // Every probe takes 30ms. Serial execution over ~4 IPs x 5 ports = 20 probes
    // would take ~600ms; concurrent execution should take close to 30ms.
    vi.spyOn(detector, 'testEndpoint').mockImplementation(() => {
      return new Promise(resolve => setTimeout(() => resolve(null), 30));
    });

    const start = Date.now();
    const endpoint = await detector.discover();
    const elapsed = Date.now() - start;

    expect(endpoint).toBeNull();
    expect(elapsed).toBeLessThan(200);
  });

  it('short-circuits a second discover() call within the negative-cache window after a full scan finds nothing', async () => {
    const detector = new LocalServiceDetector({ ports: [8081], negativeCacheTTL: 30000 });

    detector.ipStrategies = [() => Promise.resolve(['127.0.0.1'])];

    const testEndpointSpy = vi.spyOn(detector, 'testEndpoint').mockResolvedValue(null);

    const first = await detector.discover();
    expect(first).toBeNull();
    expect(testEndpointSpy).toHaveBeenCalledTimes(1);

    const second = await detector.discover();
    expect(second).toBeNull();
    // No additional probes — the negative cache short-circuited the rescan.
    expect(testEndpointSpy).toHaveBeenCalledTimes(1);
  });

  it('rescans after the negative-cache window expires', async () => {
    const detector = new LocalServiceDetector({ ports: [8081], negativeCacheTTL: 30000 });
    detector.ipStrategies = [() => Promise.resolve(['127.0.0.1'])];

    const testEndpointSpy = vi.spyOn(detector, 'testEndpoint').mockResolvedValue(null);

    await detector.discover();
    expect(testEndpointSpy).toHaveBeenCalledTimes(1);

    // Simulate the 30s window having elapsed.
    detector.negativeCacheTimestamp = Date.now() - 30001;

    await detector.discover();
    expect(testEndpointSpy).toHaveBeenCalledTimes(2);
  });

  it('a successful discovery resets the negative cache so a later outage rescans normally', async () => {
    const detector = new LocalServiceDetector({ ports: [8081], negativeCacheTTL: 30000 });
    detector.ipStrategies = [() => Promise.resolve(['127.0.0.1'])];

    const testEndpointSpy = vi.spyOn(detector, 'testEndpoint');

    testEndpointSpy.mockResolvedValueOnce('http://127.0.0.1:8081/v1/chat/completions');
    const found = await detector.discover(true);
    expect(found).toBe('http://127.0.0.1:8081/v1/chat/completions');
    expect(detector.negativeCacheTimestamp).toBeNull();

    testEndpointSpy.mockResolvedValueOnce(null);
    await detector.discover(true);
    expect(testEndpointSpy).toHaveBeenCalledTimes(2);
  });
});
