import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { BackendRegistry } from '../../backends/backend-registry.js';

/**
 * Model aliases for the ask command
 * Maps shorthand names to actual backend names
 */
const MODEL_ALIASES = {
  'auto': { backend: null, description: 'Let Orchestrator decide' },
  'local': { backend: 'local', description: 'Local LLM (currently loaded model)' },
  'gemini': { backend: 'gemini', description: 'Google Gemini 2.5 Flash' },
  'deepseek': { backend: 'nvidia_deepseek', description: 'NVIDIA DeepSeek V3.2' },
  'qwen3': { backend: 'nvidia_qwen', description: 'NVIDIA Qwen3 480B' },
  'chatgpt': { backend: 'openai_chatgpt', description: 'OpenAI GPT-4.1' },
  'openai': { backend: 'openai_chatgpt', description: 'OpenAI GPT-4.1 (alias)' },
  'groq': { backend: 'groq_llama', description: 'Groq Llama 3.3 70B' },
  'llama': { backend: 'groq_llama', description: 'Groq Llama (alias)' }
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class DashboardServer {
  constructor(options = {}) {
    this.app = express();
    this.port = options.port || 3456;
    this.conversationThreading = options.conversationThreading || null;
    this.backendRegistry = options.backendRegistry || new BackendRegistry();
    this.isRunning = false;
  }

  async start() {
    // Serve static files
    this.app.use(express.static(path.join(__dirname, 'public')));
    this.app.use(express.json());

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
      res.json({
        success: true,
        backends: stats.backends,
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
        usage: 'Use these aliases with mcp__mecha-king-ghidorah-global__ask model="alias"'
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
      res.json({
        success: true,
        types: this.backendRegistry.getAvailableTypes(),
        descriptions: {
          'local': 'Local LLM (OpenAI-compatible endpoint)',
          'nvidia_deepseek': 'NVIDIA DeepSeek V3.2',
          'nvidia_qwen': 'NVIDIA Qwen3 Coder 480B',
          'nvidia_minimax': 'NVIDIA MiniMax M2',
          'gemini': 'Google Gemini 2.5 Flash',
          'openai': 'OpenAI GPT-4 / Any OpenAI-compatible API',
          'groq': 'Groq Llama 3.3 70B'
        }
      });
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

    // Create HTTP server
    this.server = http.createServer(this.app);

    // WebSocket for real-time updates
    this.wss = new WebSocketServer({ server: this.server });
    this.wss.on('connection', (ws) => {
      console.log('Dashboard client connected');
      ws.send(JSON.stringify({ type: 'connected', message: 'Welcome to Smart AI Bridge Dashboard' }));
    });

    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        this.isRunning = true;
        console.log(`🚀 Smart AI Bridge Dashboard running at http://localhost:${this.port}`);
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
