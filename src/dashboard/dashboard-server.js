import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { BackendRegistry } from '../backends/backend-registry.js';
import { registerCouncilConfigAPI } from './council-config-api.js';
import { setBackendRegistry } from '../config/council-config-manager.js';
import { setSecret, deleteSecret } from '../backends/secret-store.js';

/**
 * Model aliases for the ask command
 * Maps shorthand names to actual backend names
 */
const MODEL_ALIASES = {
  'auto': { backend: null, description: 'Auto-route to best backend' },
  'local': { backend: 'local', description: 'Local LLM' },
  'gemini': { backend: 'gemini', description: 'Cloud API (Gemini)' },
  'deepseek': { backend: 'nvidia_deepseek', description: 'Cloud API (DeepSeek)' },
  'chatgpt': { backend: 'openai_chatgpt', description: 'Cloud API (OpenAI)' },
  'openai': { backend: 'openai_chatgpt', description: 'Cloud API (OpenAI alias)' },
  'groq': { backend: 'groq_llama', description: 'Cloud API (Groq)' },
  'llama': { backend: 'groq_llama', description: 'Cloud API (Groq alias)' }
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class DashboardServer {
  constructor(options = {}) {
    this.app = express();
    this.port = options.port || 3456;
    // S2: bind to loopback only by default — an admin API with add/delete/key
    // endpoints and no auth has no business being LAN-reachable. Explicit
    // opt-out via SAB_DASHBOARD_HOST, loudly flagged when non-loopback.
    this.host = options.host || process.env.SAB_DASHBOARD_HOST || '127.0.0.1';
    if (!['127.0.0.1', 'localhost', '::1'].includes(this.host)) {
      console.error('╔══════════════════════════════════════════════════════════════════╗');
      console.error('║ [SAB Dashboard] WARNING: binding to a non-loopback host!          ║');
      console.error(`║   host = "${this.host}"`);
      console.error('║ This exposes an UNAUTHENTICATED admin API — including endpoints   ║');
      console.error('║ that add/remove backends and set/read API-key status — to         ║');
      console.error('║ anything that can reach this address (e.g. your whole LAN).       ║');
      console.error('║ Set SAB_DASHBOARD_HOST=127.0.0.1 to bind loopback-only.            ║');
      console.error('╚══════════════════════════════════════════════════════════════════╝');
    }
    this.conversationThreading = options.conversationThreading || null;
    this.backendRegistry = options.backendRegistry || new BackendRegistry();
    this.isRunning = false;
  }

  async start() {
    // Wire council config with backend registry
    setBackendRegistry(this.backendRegistry);

    // Serve static files
    this.app.use(express.static(path.join(__dirname, 'public')));
    this.app.use(express.json());

    // Register council config API routes
    registerCouncilConfigAPI(this.app, this.backendRegistry);

    // API Routes
    this.app.get('/api/status', (req, res) => {
      const stats = this.backendRegistry.getStats();
      res.json({
        success: true,
        backends: stats.totalBackends,
        healthyBackends: stats.healthyBackends,
        threads: this.conversationThreading ? 3 : 0,
        tokens: 0,
        uptime: process.uptime()
      });
    });

    // Backend Management APIs
    this.app.get('/api/backends', (req, res) => {
      const stats = this.backendRegistry.getStats();
      const fallbackChain = this.backendRegistry.getFallbackChain();
      // F4: decorate here, not in getStats() — that shape is shared with the
      // MCP tool surface (get_analytics, etc.) and must not change.
      const backends = stats.backends.map((b) => {
        const keyStatus = this.backendRegistry.getKeyStatus(b.name);
        return {
          ...b,
          keyConfigured: keyStatus?.configured ?? false,
          keySource: keyStatus?.source ?? 'none',
          keyEnvVar: keyStatus?.envVar ?? null,
          // Not part of the F4 contract but needed for the UI's "no key"/
          // "source: ••••last4" indicator, and safe to include — last4 is
          // never key material.
          last4: keyStatus?.last4 ?? null
        };
      });
      res.json({
        success: true,
        backends,
        fallbackChain: fallbackChain,
        totalBackends: stats.totalBackends,
        healthyBackends: stats.healthyBackends
      });
    });

    this.app.post('/api/backends/enable', (req, res) => {
      const { name, enabled } = req.body;
      if (!name) {
        return res.json({ success: false, error: 'Backend name required' });
      }
      this.backendRegistry.setEnabled(name, enabled !== false);
      this.backendRegistry.saveConfig();
      this.broadcast({ type: 'backend_changed', backend: name, enabled });
      res.json({
        success: true,
        message: `Backend ${name} ${enabled ? 'enabled' : 'disabled'}`,
        fallbackChain: this.backendRegistry.getFallbackChain()
      });
    });

    this.app.post('/api/backends/priority', (req, res) => {
      const { name, priority } = req.body;
      if (!name || priority === undefined) {
        return res.json({ success: false, error: 'Backend name and priority required' });
      }
      this.backendRegistry.setPriority(name, parseInt(priority));
      this.backendRegistry.saveConfig();
      this.broadcast({ type: 'priority_changed', backend: name, priority });
      res.json({
        success: true,
        message: `Backend ${name} priority set to ${priority}`,
        fallbackChain: this.backendRegistry.getFallbackChain()
      });
    });

    this.app.get('/api/backends/health', async (req, res) => {
      try {
        const healthResults = await this.backendRegistry.checkHealth();
        res.json({ success: true, health: healthResults });
      } catch (error) {
        res.json({ success: false, error: error.message });
      }
    });

    // Model aliases API - shows shorthand names for 'ask' command
    this.app.get('/api/aliases', (req, res) => {
      res.json({
        success: true,
        aliases: MODEL_ALIASES,
        usage: 'Use these aliases with mcp__smart-ai-bridge__ask model="alias"'
      });
    });

    // === Backend CRUD APIs ===

    // Add new backend
    this.app.post('/api/backends/add', (req, res) => {
      const { name, type, url, apiKey, model, maxTokens, timeout, priority, description } = req.body;
      
      if (!name || !type) {
        return res.json({ success: false, error: 'Name and type are required' });
      }
      
      const result = this.backendRegistry.addBackend({
        name, type, url, apiKey, model,
        maxTokens: maxTokens ? parseInt(maxTokens) : undefined,
        timeout: timeout ? parseInt(timeout) : undefined,
        priority: priority ? parseInt(priority) : undefined,
        description
      });
      
      if (result.success) {
        this.broadcast({ type: 'backend_added', backend: name });
      }
      
      res.json({
        ...result,
        fallbackChain: this.backendRegistry.getFallbackChain()
      });
    });

    // Remove backend
    this.app.delete('/api/backends/:name', (req, res) => {
      const { name } = req.params;
      const result = this.backendRegistry.removeBackend(name);
      
      if (result.success) {
        this.broadcast({ type: 'backend_removed', backend: name });
      }
      
      res.json({
        ...result,
        fallbackChain: this.backendRegistry.getFallbackChain()
      });
    });

    // Update backend
    this.app.put('/api/backends/:name', (req, res) => {
      const { name } = req.params;
      const updates = req.body;
      const result = this.backendRegistry.updateBackend(name, updates);
      
      if (result.success) {
        this.broadcast({ type: 'backend_updated', backend: name });
      }
      
      res.json({
        ...result,
        fallbackChain: this.backendRegistry.getFallbackChain()
      });
    });

    // Get available backend types
    this.app.get('/api/backends/types', (req, res) => {
      // Build descriptions dynamically from registry
      const stats = this.backendRegistry.getStats();
      const descriptions = {};
      for (const b of stats.backends) {
        descriptions[b.type] = b.description || b.type;
      }
      res.json({
        success: true,
        types: this.backendRegistry.getAvailableTypes(),
        descriptions
      });
    });

    // === Backend API-key management (F3) ===
    // Registered BEFORE the plain GET /api/backends/:name route below — this
    // file already has a running note about Express matching path segments
    // in registration order, and these three routes share the :name prefix
    // with it, so they must come first.

    // Never returns the key itself — only source + last4 for display.
    // All three routes canonicalize `req.params.name` through getBackend()
    // ONCE at the top, then use `backend.name` (canonical) for every
    // subsequent call — setSecret/deleteSecret/rebuildAdapter/getAdapter/
    // getKeyStatus must all agree, or a friendly alias (e.g. `glm`)
    // stores/reads a key that the real adapter never sees.
    this.app.get('/api/backends/:name/key', (req, res) => {
      const backend = this.backendRegistry.getBackend(req.params.name);
      if (!backend) {
        return res.json({ success: false, error: `Backend '${req.params.name}' not found` });
      }
      const status = this.backendRegistry.getKeyStatus(backend.name);
      res.json({ success: true, ...status });
    });

    this.app.put('/api/backends/:name/key', async (req, res) => {
      const backend = this.backendRegistry.getBackend(req.params.name);
      if (!backend) {
        return res.json({ success: false, error: `Backend '${req.params.name}' not found` });
      }
      const name = backend.name; // canonical from here on

      const { apiKey } = req.body || {};
      if (typeof apiKey !== 'string' || apiKey.length === 0 || /\s/.test(apiKey)) {
        return res.json({ success: false, error: 'apiKey must be a non-empty string with no whitespace or newlines' });
      }

      try {
        await setSecret(name, apiKey);
      } catch (error) {
        return res.json({ success: false, error: `Failed to store key: ${error.message}` });
      }

      this.backendRegistry.rebuildAdapter(name);

      let health = null;
      const adapter = this.backendRegistry.getAdapter(name);
      if (adapter && typeof adapter.checkHealth === 'function') {
        try {
          health = await adapter.checkHealth();
        } catch (error) {
          health = { healthy: false, error: error.message };
        }
      }

      this.broadcast({ type: 'backend_key_changed', backend: name });
      res.json({ success: true, ...this.backendRegistry.getKeyStatus(name), health });
    });

    this.app.delete('/api/backends/:name/key', async (req, res) => {
      const backend = this.backendRegistry.getBackend(req.params.name);
      if (!backend) {
        return res.json({ success: false, error: `Backend '${req.params.name}' not found` });
      }
      const name = backend.name; // canonical from here on

      try {
        await deleteSecret(name);
      } catch (error) {
        return res.json({ success: false, error: `Failed to delete key: ${error.message}` });
      }

      this.backendRegistry.rebuildAdapter(name);

      this.broadcast({ type: 'backend_key_changed', backend: name });
      res.json({ success: true, ...this.backendRegistry.getKeyStatus(name) });
    });

    // Get single backend details (registered AFTER /health and /types to avoid Express param capture)
    this.app.get('/api/backends/:name', (req, res) => {
      const { name } = req.params;
      const backend = this.backendRegistry.getBackend(name);
      if (!backend) {
        return res.json({ success: false, error: `Backend '${name}' not found` });
      }
      // Mask sensitive fields
      const masked = { ...backend };
      if (masked.apiKey) masked.apiKey = '***masked***';
      if (masked.config?.apiKey) {
        masked.config = { ...masked.config, apiKey: '***masked***' };
      }
      res.json({ success: true, backend: masked });
    });

    // === Alias CRUD APIs ===
    
    // Add custom alias
    this.app.post('/api/aliases/add', (req, res) => {
      const { alias, backend, description } = req.body;
      
      if (!alias || !backend) {
        return res.json({ success: false, error: 'Alias and backend are required' });
      }
      
      // Check if backend exists
      if (!this.backendRegistry.getBackend(backend)) {
        return res.json({ success: false, error: `Backend '${backend}' not found` });
      }
      
      // Add to MODEL_ALIASES (runtime only, need to persist if desired)
      MODEL_ALIASES[alias] = {
        backend,
        description: description || `Custom alias for ${backend}`
      };
      
      this.broadcast({ type: 'alias_added', alias });
      
      res.json({
        success: true,
        message: `Alias '${alias}' -> '${backend}' added successfully`,
        aliases: MODEL_ALIASES
      });
    });

    // Remove alias
    this.app.delete('/api/aliases/:name', (req, res) => {
      const { name } = req.params;
      
      if (!MODEL_ALIASES[name]) {
        return res.json({ success: false, error: `Alias '${name}' not found` });
      }
      
      delete MODEL_ALIASES[name];
      this.broadcast({ type: 'alias_removed', alias: name });
      
      res.json({
        success: true,
        message: `Alias '${name}' removed successfully`,
        aliases: MODEL_ALIASES
      });
    });

    this.app.post('/api/conversation', async (req, res) => {
      const { action, topic, thread_id, continuation_id, query } = req.body;
      
      if (!this.conversationThreading) {
        return res.json({ 
          success: false, 
          error: 'Conversation threading not initialized' 
        });
      }

      try {
        let result;
        switch (action) {
          case 'start':
            result = await this.conversationThreading.createNewThread(topic, 'default', 'dashboard');
            break;
          case 'analytics':
            result = await this.conversationThreading.getConversationAnalytics();
            break;
          case 'search':
            result = await this.conversationThreading.searchConversations(query || '');
            break;
          default:
            throw new Error(`Unknown action: ${action}`);
        }
        res.json({ success: true, data: result });
      } catch (error) {
        res.json({ success: false, error: error.message });
      }
    });

    // Council configurator page
    this.app.get('/council', (req, res) => {
      res.sendFile(path.join(__dirname, 'council-configurator.html'));
    });

    // Create HTTP server
    this.server = http.createServer(this.app);

    // WebSocket for real-time updates
    this.wss = new WebSocketServer({ server: this.server });
    this.wss.on('connection', (ws) => {
      console.error('Dashboard client connected');
      ws.send(JSON.stringify({ type: 'connected', message: 'Welcome to Smart AI Bridge Dashboard' }));
    });

    return new Promise((resolve) => {
      this.server.listen(this.port, this.host, () => {
        this.isRunning = true;
        console.error(`🚀 Smart AI Bridge Dashboard running at http://${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  broadcast(data) {
    if (this.wss) {
      this.wss.clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(JSON.stringify(data));
        }
      });
    }
  }

  async stop() {
    if (this.server) {
      this.server.close();
      this.isRunning = false;
    }
  }
}

export default DashboardServer;
