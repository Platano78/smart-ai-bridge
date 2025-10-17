/**
 * LOCAL SERVICE DETECTOR MODULE
 * Standalone ES6 module for discovering and managing local AI services
 *
 * Features:
 * - Auto-discovery of local AI endpoints (vLLM, LM Studio, Ollama, etc.)
 * - WSL IP detection for cross-platform compatibility
 * - Smart caching with configurable TTL
 * - Parallel endpoint testing with progress tracking
 * - Service fingerprinting and identification
 * - Security-hardened command execution
 * - Comprehensive error handling and logging
 *
 * Environment Variables:
 * - LOCAL_AI_ENDPOINT: Override endpoint URL
 * - LOCAL_AI_DISCOVERY_ENABLED: Enable/disable auto-discovery (default: true)
 * - LOCAL_AI_DISCOVERY_CACHE_TTL: Cache duration in milliseconds (default: 300000 / 5 minutes)
 *
 * @module local-service-detector
 * @version 1.0.0
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * LocalServiceDetector - Discovers and manages local AI service endpoints
 *
 * This class provides intelligent discovery of local AI services with:
 * - Multi-strategy endpoint discovery (environment, cache, discovery)
 * - WSL IP detection using PowerShell, resolv.conf, and ip route
 * - Service fingerprinting for vLLM, LM Studio, Ollama, and generic OpenAI-compatible APIs
 * - Caching mechanism with TTL to reduce discovery overhead
 * - Parallel testing with timeout handling for fast discovery
 * - Validation and health checking of endpoints
 *
 * @class LocalServiceDetector
 */
class LocalServiceDetector {
  /**
   * Create a LocalServiceDetector instance
   *
   * @param {Object} options - Configuration options
   * @param {number} [options.cacheDuration] - Cache TTL in milliseconds (overrides env var)
   * @param {boolean} [options.discoveryEnabled] - Enable auto-discovery (overrides env var)
   * @param {number[]} [options.commonPorts] - Ports to scan (default: [8001, 8000, 1234, 5000, 5001, 8080, 11434])
   */
  constructor(options = {}) {
    this.cachedEndpoint = null;
    this.cacheTimestamp = null;
    this.cacheDuration = options.cacheDuration || parseInt(process.env.LOCAL_AI_DISCOVERY_CACHE_TTL) || 300000; // 5 minutes default
    this.discoveryEnabled = options.discoveryEnabled !== undefined
      ? options.discoveryEnabled
      : process.env.LOCAL_AI_DISCOVERY_ENABLED !== 'false';

    // Common ports for local AI services
    this.commonPorts = options.commonPorts || [
      8001,  // vLLM default
      8000,  // Common alternative
      1234,  // LM Studio default
      5000,  // Common dev server
      5001,  // Common alternative
      8080,  // Generic HTTP
      11434  // Ollama default
    ];

    // Service fingerprints for identification
    this.serviceFingerprints = {
      vllm: ['vllm', 'llm-engine'],
      lmstudio: ['lmstudio', 'gguf'],
      ollama: ['ollama'],
      textgen: ['text-generation-webui', 'ooba'],
      generic: ['openai', 'api']
    };

    console.error('🔍 LocalServiceDetector initialized');
    console.error(`   Discovery: ${this.discoveryEnabled ? 'ENABLED' : 'DISABLED'}`);
    console.error(`   Cache TTL: ${this.cacheDuration / 1000}s`);
    console.error(`   Ports: ${this.commonPorts.join(', ')}`);
  }

  /**
   * Get working local endpoint with priority system:
   * 1. Environment variable override (LOCAL_AI_ENDPOINT)
   * 2. Valid cached endpoint
   * 3. Fresh discovery
   * 4. Expired cache fallback
   *
   * @param {boolean} [forceRefresh=false] - Force cache invalidation and re-discovery
   * @returns {Promise<Object|null>} Endpoint object or null if none found
   * @returns {string} return.url - The full endpoint URL with /v1 path
   * @returns {string} return.baseUrl - Base URL without path
   * @returns {string} return.service - Service type (vllm, lmstudio, ollama, etc.)
   * @returns {string[]} return.models - Available models
   * @returns {string|null} return.detectedModel - First detected model
   * @returns {number} return.tested - Timestamp when endpoint was tested
   */
  async getLocalEndpoint(forceRefresh = false) {
    // Priority 1: Environment override
    const envEndpoint = process.env.LOCAL_AI_ENDPOINT;
    if (envEndpoint) {
      console.error(`🔧 Using LOCAL_AI_ENDPOINT override: ${envEndpoint}`);
      const validated = await this.validateEndpoint(envEndpoint);
      if (validated) {
        return validated;
      }
      console.error(`⚠️  Override endpoint ${envEndpoint} failed validation, falling back to discovery`);
    }

    // Priority 2: Cached result (if valid and not expired)
    if (!forceRefresh && this.isCacheValid()) {
      const validated = await this.validateEndpoint(this.cachedEndpoint.url);
      if (validated) {
        console.error(`💾 Using cached endpoint: ${this.cachedEndpoint.url} (${this.cachedEndpoint.service})`);
        return this.cachedEndpoint;
      }
      console.error(`⚠️  Cached endpoint no longer valid, triggering discovery`);
    }

    // Priority 3: Fresh discovery
    if (this.discoveryEnabled) {
      const discovered = await this.discoverEndpoint();
      if (discovered) {
        this.cachedEndpoint = discovered;
        this.cacheTimestamp = Date.now();
        console.error(`🎯 Discovered endpoint: ${discovered.url} (${discovered.service})`);
        return discovered;
      }
    }

    // Priority 4: Expired cache fallback
    if (this.cachedEndpoint) {
      console.error(`⏰ Using expired cache as fallback: ${this.cachedEndpoint.url}`);
      return this.cachedEndpoint;
    }

    console.error(`❌ No local endpoint available`);
    return null;
  }

  /**
   * Check if cache is still valid
   *
   * @returns {boolean} True if cache is valid and not expired
   */
  isCacheValid() {
    if (!this.cachedEndpoint || !this.cacheTimestamp) {
      return false;
    }
    const age = Date.now() - this.cacheTimestamp;
    return age < this.cacheDuration;
  }

  /**
   * Discover available local endpoint by testing candidates in parallel
   *
   * This method:
   * - Generates candidate endpoints from common hosts and ports
   * - Tests all candidates in parallel with 1s timeout each
   * - Tracks progress with milestone logging
   * - Returns first successful endpoint found
   *
   * @returns {Promise<Object|null>} First discovered endpoint or null
   */
  async discoverEndpoint() {
    const startTime = Date.now();
    console.error(`🔍 Starting endpoint discovery...`);

    const candidates = await this.generateCandidateEndpoints();
    const totalCandidates = candidates.length;
    console.error(`   Testing ${totalCandidates} candidate endpoints`);

    // Progress tracking with milestones
    const progressTracker = {
      completed: 0,
      shown: new Set(),
      milestones: [20, 40, 60, 80, 100]
    };

    // Test all candidates in parallel with 1s timeout each
    const testPromises = candidates.map(async (endpoint) => {
      try {
        const result = await this.testEndpoint(endpoint);
        progressTracker.completed++;

        // Show progress at milestones or when found
        const progress = Math.floor((progressTracker.completed / totalCandidates) * 100);
        const milestone = progressTracker.milestones.find(m => progress >= m && !progressTracker.shown.has(m));

        if (milestone || result) {
          if (milestone) progressTracker.shown.add(milestone);
          const emoji = result ? '✅ FOUND!' : '⏳';
          console.error(`   ${emoji} Progress: ${progressTracker.completed}/${totalCandidates} (${progress}%)`);
        }

        return result;
      } catch (error) {
        progressTracker.completed++;
        return null;
      }
    });

    const results = await Promise.allSettled(testPromises);

    // Find first successful result
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        const discoveryTime = Date.now() - startTime;
        console.error(`✅ Discovery complete in ${discoveryTime}ms`);
        return result.value;
      }
    }

    const discoveryTime = Date.now() - startTime;
    console.error(`❌ No endpoints found after ${discoveryTime}ms (tested ${totalCandidates} candidates)`);
    return null;
  }

  /**
   * Generate candidate endpoints from common hosts and ports
   *
   * This method:
   * - Includes standard localhost/127.0.0.1 addresses
   * - Detects WSL IPs for cross-platform compatibility
   * - Prioritizes hosts from existing environment variables
   * - Combines all hosts with all common ports
   *
   * @returns {Promise<string[]>} Array of candidate endpoint URLs
   */
  async generateCandidateEndpoints() {
    const hosts = ['localhost', '127.0.0.1'];

    // Add WSL IPs if available
    try {
      const wslIPs = await this.getWSLIPs();
      hosts.push(...wslIPs);
    } catch (error) {
      // WSL IP detection optional, log but continue
      console.error(`   ℹ️  WSL IP detection skipped: ${error.message}`);
    }

    // Also check DEEPSEEK_ENDPOINT/VLLM_ENDPOINT if set
    const existingEndpoint = process.env.DEEPSEEK_ENDPOINT || process.env.VLLM_ENDPOINT;
    if (existingEndpoint) {
      try {
        const url = new URL(existingEndpoint);
        const host = url.hostname;
        if (!hosts.includes(host)) {
          hosts.unshift(host); // Prioritize existing config
          console.error(`   ℹ️  Added host from existing endpoint: ${host}`);
        }
      } catch (e) {
        // Invalid URL, skip
        console.error(`   ⚠️  Invalid existing endpoint URL: ${existingEndpoint}`);
      }
    }

    const endpoints = [];
    for (const host of hosts) {
      for (const port of this.commonPorts) {
        endpoints.push(`http://${host}:${port}`);
      }
    }

    return endpoints;
  }

  /**
   * Get WSL IP addresses using multiple strategies
   *
   * Strategies (in order of reliability):
   * 1. PowerShell - Get Windows host IP for WSL adapter (most reliable for WSL2)
   * 2. /etc/resolv.conf - nameserver entry (fallback)
   * 3. ip route - default gateway (Linux standard)
   *
   * Security: All commands are hardcoded with no user input to prevent injection
   *
   * @returns {Promise<string[]>} Array of detected WSL IP addresses (deduplicated)
   */
  async getWSLIPs() {
    const ips = [];

    try {
      // Strategy 1: PowerShell - Get Windows host IP for WSL adapter (most reliable)
      // Security: Hardcoded command with no user input
      const { stdout: psOutput } = await execAsync(
        'powershell.exe -Command "(Get-NetIPAddress | Where-Object {$_.InterfaceAlias -like \'*WSL*\' -and $_.AddressFamily -eq \'IPv4\'}).IPAddress" 2>/dev/null || echo ""',
        { timeout: 2000 } // 2s timeout for safety
      );
      const wslHostIP = psOutput.trim().replace(/\r\n/g, '');
      if (wslHostIP && /^\d+\.\d+\.\d+\.\d+$/.test(wslHostIP)) {
        ips.push(wslHostIP);
      }
    } catch (e) {
      // PowerShell not available or failed, continue with other strategies
    }

    try {
      // Strategy 2: Check /etc/resolv.conf for nameserver
      // Security: Hardcoded command with no user input
      const { stdout: resolvConf } = await execAsync(
        'cat /etc/resolv.conf 2>/dev/null || echo ""',
        { timeout: 1000 }
      );
      const nameserverMatch = resolvConf.match(/nameserver\s+(\d+\.\d+\.\d+\.\d+)/);
      if (nameserverMatch) {
        ips.push(nameserverMatch[1]);
      }
    } catch (e) {
      // File read failed, continue
    }

    try {
      // Strategy 3: ip route to find default gateway
      // Security: Hardcoded command with no user input
      const { stdout: ipRoute } = await execAsync(
        'ip route show 2>/dev/null | grep default || echo ""',
        { timeout: 1000 }
      );
      const gatewayMatch = ipRoute.match(/default via (\d+\.\d+\.\d+\.\d+)/);
      if (gatewayMatch) {
        ips.push(gatewayMatch[1]);
      }
    } catch (e) {
      // ip route failed, continue
    }

    return [...new Set(ips)]; // Remove duplicates
  }

  /**
   * Test a single endpoint for OpenAI API compatibility
   *
   * Tests multiple common endpoints:
   * - /v1/models - Standard OpenAI models endpoint
   * - /health - Generic health check
   * - /api/tags - Ollama-specific endpoint
   * - /v1/completions - OpenAI completions endpoint
   *
   * @param {string} baseUrl - Base URL to test (e.g., "http://localhost:8001")
   * @param {number} [timeout=1000] - Timeout in milliseconds
   * @returns {Promise<Object|null>} Endpoint details if valid, null otherwise
   */
  async testEndpoint(baseUrl, timeout = 1000) {
    try {
      // Try multiple common endpoints
      const endpoints = [
        { path: '/v1/models', needsAuth: false },
        { path: '/health', needsAuth: false },
        { path: '/api/tags', needsAuth: false }, // Ollama
        { path: '/v1/completions', needsAuth: false }
      ];

      for (const { path, needsAuth } of endpoints) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);

          const headers = { 'Accept': 'application/json' };
          if (needsAuth) {
            headers['Authorization'] = 'Bearer test';
          }

          const response = await fetch(`${baseUrl}${path}`, {
            method: 'GET',
            headers,
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          // Accept 200 OK or 401/403 (means endpoint exists but needs auth)
          if (response.ok || response.status === 401 || response.status === 403) {
            return await this.identifyService(baseUrl, response, path);
          }
        } catch (e) {
          // Try next endpoint
          continue;
        }
      }
    } catch (error) {
      // Endpoint not reachable
    }
    return null;
  }

  /**
   * Identify the service type from response
   *
   * Service detection logic:
   * - vLLM: "vllm" in server header or /v1/models response structure
   * - LM Studio: "gguf" in model names
   * - Ollama: /api/tags endpoint with models array
   * - Generic: OpenAI-compatible with /health endpoint
   *
   * @param {string} baseUrl - Base URL being tested
   * @param {Response} response - Fetch API response object
   * @param {string} path - Path that was tested
   * @returns {Promise<Object>} Endpoint details with service identification
   */
  async identifyService(baseUrl, response, path) {
    let service = 'generic';
    let models = [];
    let detectedModel = null;

    try {
      if (response.ok) {
        const data = await response.json();

        // Check for vLLM patterns
        if (path === '/v1/models' && data.data) {
          models = data.data.map(m => m.id || m.name || 'unknown');

          // Service identification by response structure
          if (data.object === 'list') {
            // Check headers for service type
            const serverHeader = response.headers.get('server') || '';
            if (serverHeader.toLowerCase().includes('vllm')) {
              service = 'vllm';
            } else if (models.some(m => m.toLowerCase().includes('gguf'))) {
              service = 'lmstudio';
            } else {
              service = 'openai-compatible';
            }
          }

          detectedModel = models[0] || null;
        }

        // Check for Ollama
        if (path === '/api/tags' && data.models) {
          service = 'ollama';
          models = data.models.map(m => m.name);
          detectedModel = models[0] || null;
        }

        // Check for health endpoint
        if (path === '/health' && data.status) {
          service = 'generic-health';
        }
      }
    } catch (e) {
      // JSON parsing failed, still use endpoint but mark as generic
      console.error(`   ℹ️  Service identification failed for ${baseUrl}: ${e.message}`);
    }

    return {
      url: `${baseUrl}/v1`, // Standardize to /v1 endpoint
      baseUrl,
      service,
      models,
      detectedModel,
      tested: Date.now()
    };
  }

  /**
   * Validate that an endpoint is still working
   *
   * Performs a quick health check by requesting the models endpoint
   *
   * @param {string} url - Full URL to validate (should include /v1 path)
   * @param {number} [timeout=1000] - Timeout in milliseconds
   * @returns {Promise<Object|null>} Validation result or null if invalid
   */
  async validateEndpoint(url, timeout = 1000) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(`${url}/models`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok || response.status === 401 || response.status === 403) {
        return { url, validated: true };
      }
    } catch (error) {
      // Not valid
      console.error(`   ⚠️  Validation failed for ${url}: ${error.message}`);
    }
    return null;
  }

  /**
   * Force cache invalidation and re-discovery
   *
   * Call this method when you know the cached endpoint is stale
   * or when you want to force a fresh discovery cycle
   */
  invalidateCache() {
    console.error('🔄 Cache invalidated, forcing re-discovery');
    this.cachedEndpoint = null;
    this.cacheTimestamp = null;
  }

  /**
   * Get current cache status
   *
   * @returns {Object} Cache status information
   */
  getCacheStatus() {
    return {
      cached: this.cachedEndpoint !== null,
      endpoint: this.cachedEndpoint?.url || null,
      service: this.cachedEndpoint?.service || null,
      age: this.cacheTimestamp ? Date.now() - this.cacheTimestamp : null,
      valid: this.isCacheValid(),
      ttl: this.cacheDuration
    };
  }

  /**
   * Get detector configuration
   *
   * @returns {Object} Current configuration
   */
  getConfig() {
    return {
      discoveryEnabled: this.discoveryEnabled,
      cacheDuration: this.cacheDuration,
      commonPorts: this.commonPorts,
      serviceFingerprints: this.serviceFingerprints
    };
  }
}

// Export the class as default and named export
export default LocalServiceDetector;
export { LocalServiceDetector };
