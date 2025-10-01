/**
 * ESPN API Integration Service for Fantasy Football Analyzer
 * 
 * Comprehensive ESPN API service providing real-time fantasy football data
 * with intelligent caching, rate limiting, and fallback logic.
 * 
 * Features:
 * - Complete ESPN endpoint integration
 * - Smart caching with TTL-based invalidation
 * - Rate limiting with exponential backoff
 * - Error handling and graceful degradation
 * - TypeScript interfaces for type safety
 * - Integration with existing Player/Team interfaces
 */

import { Player, Team, Position, InjuryStatus } from '../types/index';
import { browserMCPService } from './BrowserMCPService';

// ESPN API Configuration
const ESPN_CONFIG = {
  BASE_URL: '/api/espn', // Use Netlify proxy instead of direct ESPN calls
  RATE_LIMITS: {
    REQUEST_WINDOW: 60 * 1000, // 1 minute
    MAX_REQUESTS_PER_WINDOW: 100,
    BACKOFF_MULTIPLIER: 2,
    MAX_BACKOFF_TIME: 30 * 1000, // 30 seconds
  },
  CACHE_TTL: {
    PLAYERS: 10 * 60 * 1000, // 10 minutes
    TEAMS: 30 * 60 * 1000, // 30 minutes
    PROJECTIONS: 15 * 60 * 1000, // 15 minutes
    INJURIES: 5 * 60 * 1000, // 5 minutes
    RANKINGS: 15 * 60 * 1000, // 15 minutes
    HISTORICAL: 24 * 60 * 60 * 1000, // 24 hours
  },
  TIMEOUTS: {
    DEFAULT: 10000, // 10 seconds
    LONG_RUNNING: 30000, // 30 seconds
  }
};

/**
 * ESPN API Service Class - ANALYSIS REQUEST
 * 
 * This service is supposed to provide comprehensive fantasy football data from ESPN endpoints
 * but users report it shows "Active" APIs while serving 2024 mock data instead of real 2025 data.
 * 
 * KEY ISSUES TO ANALYZE:
 * 1. makeRequest() method uses '/api/espn' proxy - is this configured correctly in Netlify?
 * 2. getAllPlayers() switched to Sleeper API - is this working in production?
 * 3. performHealthCheck() may be failing silently, causing fallback mode
 * 4. Error handling in try/catch blocks may be swallowing real errors
 * 5. Initialization logic may be reporting success while using fallbacks
 */
class ESPNAPIService {
  private static instance: ESPNAPIService;
  private cache: Map<string, CacheEntry<any>> = new Map();
  private rateLimits: Map<string, RateLimitEntry> = new Map();
  private isInitialized = false;
  private retryQueue: Array<{ fn: Function; resolve: Function; reject: Function }> = [];
  private processingQueue = false;

  /**
   * CRITICAL METHOD: Initialize the ESPN API Service
   * This may be failing silently and causing fallback mode
   */
  async initialize(): Promise<boolean> {
    try {
      console.log('Initializing ESPN API Service...');
      
      // Test connectivity - THIS MAY BE THE ISSUE
      const healthCheck = await this.performHealthCheck();
      if (!healthCheck) {
        throw new Error('ESPN API health check failed');
      }

      this.isInitialized = true;
      console.log('ESPN API Service initialized successfully');
      return true;
    } catch (error) {
      console.error('ESPN API Service initialization failed:', error);
      this.isInitialized = false;
      return false; // BUT HOOK STILL LOADS FALLBACK DATA!
    }
  }

  /**
   * CRITICAL METHOD: Generic API request with Netlify proxy
   * Uses '/api/espn' which must be configured in netlify.toml
   */
  private async makeRequest<T>(
    endpoint: string,
    cacheKey: string,
    cacheTTL: number,
    timeout: number = ESPN_CONFIG.TIMEOUTS.DEFAULT
  ): Promise<T> {
    // Check cache first
    const cached = this.getFromCache<T>(cacheKey);
    if (cached) {
      return cached;
    }

    // Check rate limits
    await this.enforceRateLimit();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const url = `${ESPN_CONFIG.BASE_URL}${endpoint}`;
      console.log(`🔄 ESPN API Request: ${url}`);
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Fantasy-Football-Analyzer/1.0',
        },
      });

      clearTimeout(timeoutId);

      console.log(`📡 ESPN API Response: ${response.status} ${response.statusText} for ${url}`);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No response text');
        console.error(`❌ ESPN API Error Details:`, {
          url,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          errorText
        });
        throw new Error(`ESPN API request failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      
      // Cache the result
      this.setCache(cacheKey, data, cacheTTL);
      
      return data;
    } catch (error) {
      console.error(`ESPN API request failed for ${endpoint}:`, error);
      
      // Try fallback to Browser MCP if available
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('ESPN API timeout, attempting Browser MCP fallback');
        return this.fallbackToBrowserMCP<T>(endpoint, cacheKey);
      }
      
      throw error;
    }
  }

  /**
   * MAIN DATA METHOD: Get all NFL players - SWITCHED TO SLEEPER API
   * This bypasses ESPN entirely and uses Sleeper API directly
   * BUT may still fail due to CORS or network issues
   */
  async getAllPlayers(): Promise<Player[]> {
    try {
      // ESPN athlete endpoint is deprecated - use Sleeper API instead
      const response = await fetch('https://api.sleeper.app/v1/players/nfl', {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Fantasy-Football-Analyzer/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`Sleeper API request failed: ${response.status}`);
      }

      const sleeperPlayers = await response.json();
      return this.transformSleeperPlayersToAppFormat(sleeperPlayers);
    } catch (error) {
      console.error('Error fetching all players from Sleeper:', error);
      // FALLBACK: Return realistic fallback data for draft functionality
      return this.generateFallbackPlayers(); // THIS IS PROBABLY WHAT'S HAPPENING
    }
  }

  /**
   * CRITICAL METHOD: Health check using Netlify proxy
   * This determines if ESPN API is working or if fallbacks are used
   */
  private async performHealthCheck(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${ESPN_CONFIG.BASE_URL}/teams`, {
        signal: controller.signal,
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Fantasy-Football-Analyzer/1.0',
        },
      });

      clearTimeout(timeout);
      console.log('ESPN API health check:', response.status, response.ok);
      return response.ok;
    } catch (error) {
      console.warn('ESPN API health check failed, service will use fallbacks:', error);
      return false; // THIS CAUSES ALL DATA TO BE FALLBACKS!
    }
  }

  /**
   * FALLBACK METHODS: These generate the mock data users are seeing
   */
  private generateFallbackPlayers(): Player[] {
    const topPlayers = [
      { name: 'Josh Allen', position: 'QB' as Position, team: 'BUF', ppr: 24.2, standard: 22.1, tier: 1 },
      { name: 'Lamar Jackson', position: 'QB' as Position, team: 'BAL', ppr: 23.8, standard: 21.9, tier: 1 },
      { name: 'Christian McCaffrey', position: 'RB' as Position, team: 'SF', ppr: 22.5, standard: 19.2, tier: 1 },
      // ... more fallback data
    ];

    return topPlayers.map((player, index) => ({
      id: index + 1,
      name: player.name,
      position: player.position,
      team: player.team,
      adp: index + 1,
      ppr: player.ppr,
      standard: player.standard,
      halfPpr: (player.ppr + player.standard) / 2,
      injury: 'Healthy' as InjuryStatus,
      news: 'Active player - realistic fallback data', // THIS IS WHAT USERS SEE
      tier: player.tier,
    }));
  }
}

export const espnAPIService = ESPNAPIService.getInstance();