/**
 * @fileoverview LocalServiceDetector - Auto-discovery for local LLM endpoints
 * @module utils/local-service-detector
 *
 * Ported from v1 smart-ai-bridge-v1.1.0.js
 * Supports WSL, Docker Desktop, and native environments
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class LocalServiceDetector {
  constructor(options = {}) {
    this.cachedEndpoint = null;
    this.cacheTimestamp = null;
    this.cacheTTL = options.cacheTTL || 300000; // 5 minutes default
    this.ports = options.ports || [8081, 8001, 8000, 1234, 5000];
    this.timeout = options.timeout || 3000;

    // Negative-result cache: when a full scan finds nothing, remember it for this
    // long so a rediscovery storm (forceRediscovery on every failed request during
    // an outage) doesn't re-pay the full parallel scan each time.
    this.negativeCacheTTL = options.negativeCacheTTL || 30000; // 30 seconds
    this.negativeCacheTimestamp = null;

    // IP discovery strategies in priority order
    this.ipStrategies = [
      () => this.getLocalhostIPs(),
      () => this.getWSLHostIP(),
      () => this.getVEthIP(),
      () => this.getDefaultGatewayIP(),
      () => this.getDockerDesktopIPs(),
      () => this.getNetworkInterfaceIPs()
    ];
  }

  /**
   * Discover working local LLM endpoint
   * @param {boolean} forceRefresh - Bypass cache
   * @returns {Promise<string|null>} Working endpoint URL or null
   */
  async discover(forceRefresh = false) {
    // Return cached endpoint if valid
    if (!forceRefresh && this.cachedEndpoint && this.cacheTimestamp) {
      if (Date.now() - this.cacheTimestamp < this.cacheTTL) {
        console.error(`🎯 Using cached endpoint: ${this.cachedEndpoint}`);
        return this.cachedEndpoint;
      }
    }

    // A full scan that found nothing recently short-circuits here, so a
    // forceRediscovery storm during an outage doesn't re-pay the scan cost
    // on every failed request.
    if (!forceRefresh && this.negativeCacheTimestamp) {
      if (Date.now() - this.negativeCacheTimestamp < this.negativeCacheTTL) {
        console.error('🎯 Negative cache active — skipping rescan');
        return null;
      }
    }

    console.error('🔍 Starting local LLM endpoint discovery...');

    // Collect all (ip, port) candidate pairs in strategy-then-port priority
    // order first, then probe them all concurrently. Winner selection is by
    // priority order, not by which probe resolves first: the earliest pair
    // in this list that succeeded wins, even if a lower-priority probe came
    // back faster.
    const candidates = [];
    // Today every fallible strategy swallows its own errors and returns [],
    // so this catch is unreachable — but the negative cache below must only
    // remember a "nothing found" verdict from a COMPLETE candidate sweep. A
    // future strategy that throws would otherwise poison 30s of discovery
    // with a partial scan's verdict.
    let scanComplete = true;
    for (const strategy of this.ipStrategies) {
      try {
        const ips = await strategy();
        for (const ip of ips) {
          for (const port of this.ports) {
            candidates.push({ ip, port });
          }
        }
      } catch (error) {
        scanComplete = false;
        console.error(`❌ Strategy failed: ${error.message}`);
      }
    }

    const results = await Promise.all(
      candidates.map(({ ip, port }) => this.testEndpoint(ip, port))
    );

    const winnerIndex = results.findIndex(endpoint => endpoint !== null);

    if (winnerIndex !== -1) {
      const endpoint = results[winnerIndex];
      this.cachedEndpoint = endpoint;
      this.cacheTimestamp = Date.now();
      this.negativeCacheTimestamp = null;
      console.error(`✅ Discovered endpoint: ${endpoint}`);
      return endpoint;
    }

    if (scanComplete) {
      this.negativeCacheTimestamp = Date.now();
    }
    console.error('❌ No local LLM endpoint found');
    return null;
  }

  /**
   * Test if an endpoint is responding
   * @param {string} ip - IP address
   * @param {number} port - Port number
   * @returns {Promise<string|null>} Endpoint URL if working, null otherwise
   */
  async testEndpoint(ip, port) {
    const isLocalhost = ip === '127.0.0.1' || ip === 'localhost';
    const timeoutMs = isLocalhost ? 1500 : this.timeout;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      // Try /v1/models endpoint first (OpenAI-compatible)
      const response = await fetch(`http://${ip}:${port}/v1/models`, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'SAB-v2-Discovery/2.0.0'
        }
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        // Verify it's an LLM service
        if (data.models || data.data || data.object === 'list') {
          console.error(`✅ Found LLM at ${ip}:${port}`);
          return `http://${ip}:${port}/v1/chat/completions`;
        }
      }
    } catch (error) {
      // Silently fail - this is expected for non-existent endpoints
    }

    return null;
  }

  /**
   * Localhost IPs - highest priority for Docker Desktop
   */
  async getLocalhostIPs() {
    return ['127.0.0.1', 'localhost'];
  }

  /**
   * WSL host IP from default route
   */
  async getWSLHostIP() {
    try {
      const { stdout } = await execAsync("ip route show default | awk '/default/ { print $3 }'");
      const ip = stdout.trim();
      if (ip && this.isValidIP(ip)) {
        return [ip];
      }
    } catch (error) {
      // Not in WSL or command failed
    }
    return [];
  }

  /**
   * Virtual ethernet IPs
   */
  async getVEthIP() {
    try {
      const { stdout } = await execAsync("ip addr show | grep -E 'inet.*eth0' | awk '{ print $2 }' | cut -d/ -f1");
      return stdout.trim().split('\n').filter(ip => ip && this.isValidIP(ip));
    } catch (error) {
      // Command failed
    }
    return [];
  }

  /**
   * Default gateway IPs
   */
  async getDefaultGatewayIP() {
    try {
      const { stdout } = await execAsync("hostname -I");
      const ips = stdout.trim().split(' ').filter(ip => ip && this.isValidIP(ip));

      const hostIPs = [];
      for (const ip of ips) {
        const parts = ip.split('.');
        if (parts.length === 4) {
          parts[3] = '1';
          hostIPs.push(parts.join('.'));
        }
      }
      return hostIPs;
    } catch (error) {
      // Command failed
    }
    return [];
  }

  /**
   * Docker Desktop specific IPs
   */
  async getDockerDesktopIPs() {
    return [
      'host.docker.internal',
      '172.17.0.1',
      '172.18.0.1'
    ];
  }

  /**
   * Common network interface IPs
   */
  async getNetworkInterfaceIPs() {
    return [
      '172.19.224.1', '172.20.224.1', '172.21.224.1', '172.22.224.1', '172.23.224.1',
      '172.24.32.1', '172.24.0.1',
      '192.168.1.1', '192.168.0.1', '10.0.0.1'
    ];
  }

  /**
   * Validate IP address format
   */
  isValidIP(ip) {
    if (ip === 'localhost' || ip === 'host.docker.internal') return true;
    const parts = ip.split('.');
    return parts.length === 4 && parts.every(part => {
      const num = parseInt(part, 10);
      return !isNaN(num) && num >= 0 && num <= 255;
    });
  }

  /**
   * Clear cached endpoint
   */
  clearCache() {
    this.cachedEndpoint = null;
    this.cacheTimestamp = null;
    this.negativeCacheTimestamp = null;
    console.error('🔄 Endpoint cache cleared');
  }
}

export { LocalServiceDetector };
