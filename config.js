#!/usr/bin/env node

/**
 * Environment-Aware Configuration for Smart AI Bridge
 * Based on industry patterns from Laravel, Next.js, and Typesafe Config
 */

import fs from 'fs/promises';
import path from 'path';

class BridgeConfig {
  constructor() {
    this.environment = process.env.NODE_ENV || 'development';
    this.config = {};
    this.loaded = false;
  }

  async initialize() {
    if (this.loaded) return this.config;
    
    try {
      // Load base configuration
      const baseConfig = await this.loadConfigFile('.env');
      
      // Load environment-specific overrides
      const envConfig = await this.loadConfigFile(`.env.${this.environment}`);
      
      // Merge configurations (env-specific overrides base)
      this.config = {
        ...baseConfig,
        ...envConfig,
        environment: this.environment
      };
      
      this.loaded = true;
      console.error(`✅ Configuration loaded for environment: ${this.environment}`);
      return this.config;
    } catch (error) {
      console.error(`❌ Configuration loading failed:`, error);
      // Fallback to safe defaults
      return this.getDefaultConfig();
    }
  }

  async loadConfigFile(filename) {
    try {
      const configPath = path.resolve(filename);
      const content = await fs.readFile(configPath, 'utf8');
      
      const config = {};
      const lines = content.split('\n');
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length > 0) {
            config[key.trim()] = valueParts.join('=').trim();
          }
        }
      }
      
      return config;
    } catch (error) {
      console.error(`⚠️ Config file ${filename} not found, using defaults`);
      return {};
    }
  }

  getDefaultConfig() {
    // Safe production defaults
    return {
      environment: this.environment,
      
      // Service Configuration
      DEEPSEEK_TIMEOUT: '30000',
      DEEPSEEK_RETRY_ATTEMPTS: '3',
      DEEPSEEK_MAX_FILE_SIZE: '10485760', // 10MB
      DEEPSEEK_CHUNK_SIZE: '8000',
      
      // Circuit Breaker Configuration (based on research)
      CIRCUIT_BREAKER_FAILURE_THRESHOLD: '5',
      CIRCUIT_BREAKER_TIMEOUT: '60000', // 1 minute
      CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS: '3',
      
      // IP Discovery Strategy
      DEEPSEEK_IP_STRATEGIES: 'wsl_host,veth,gateway,common',
      DEEPSEEK_IP_CACHE_TTL: '300000', // 5 minutes
      
      // Fallback Configuration
      ENABLE_OFFLINE_MODE: this.environment === 'development' ? 'true' : 'false',
      FALLBACK_RESPONSE_ENABLED: 'true',
      CACHE_RESPONSES: this.environment === 'production' ? 'true' : 'false'
    };
  }

  get(key) {
    return this.config[key];
  }

  getNumber(key, defaultValue = 0) {
    const value = this.get(key);
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  getBoolean(key, defaultValue = false) {
    const value = this.get(key);
    return value === 'true' || value === '1';
  }

  isDevelopment() {
    return this.environment === 'development';
  }

  isProduction() {
    return this.environment === 'production';
  }
}

// Export singleton instance
export const config = new BridgeConfig();
