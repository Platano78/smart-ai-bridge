import { configManager, VALID_TOPICS, VALID_STRATEGIES, setBackendRegistry } from '../config/council-config-manager.js';

const rateLimitMap = new Map();

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetTime) {
    entry = { count: 0, resetTime: now + 60000 };
    rateLimitMap.set(ip, entry);
  }
  entry.count++;
  if (entry.count > 10) {
    return res.status(429).json({ success: false, error: 'Rate limit exceeded. Max 10 requests per minute.' });
  }
  next();
}

export function registerCouncilConfigAPI(app, backendRegistry) {
  setBackendRegistry(backendRegistry);

  // GET /api/council-config - Get current configuration and metadata
  app.get('/api/council-config', (req, res) => {
    try {
      const config = configManager.getConfig();
      const metadata = configManager.getMetadata();
      res.json({ success: true, config, metadata });
    } catch (error) {
      res.json({ success: false, error: error.message });
    }
  });

  // PUT /api/council-config - Replace entire configuration
  app.put('/api/council-config', rateLimit, (req, res) => {
    try {
      const result = configManager.updateConfig(req.body, req.ip || 'dashboard');
      res.json({ success: result.success, errors: result.errors || undefined });
    } catch (error) {
      res.json({ success: false, error: error.message });
    }
  });

  // PATCH /api/council-config/topic/:topic - Update a single topic
  app.patch('/api/council-config/topic/:topic', rateLimit, (req, res) => {
    try {
      const { topic } = req.params;
      const { backends, strategy } = req.body;
      if (!backends || !strategy) {
        return res.json({ success: false, error: 'backends and strategy required' });
      }
      const result = configManager.updateTopic(topic, backends, strategy, req.ip || 'dashboard');
      res.json({ success: result.success, errors: result.errors || undefined });
    } catch (error) {
      res.json({ success: false, error: error.message });
    }
  });

  // GET /api/council-config/backends - List available backends, topics, and strategies
  app.get('/api/council-config/backends', (req, res) => {
    try {
      const stats = backendRegistry.getStats();
      const availableBackends = stats.backends.map(b => ({
        name: b.name,
        type: b.type,
        enabled: b.enabled,
        description: b.description
      }));
      res.json({ success: true, backends: availableBackends, topics: VALID_TOPICS, strategies: VALID_STRATEGIES });
    } catch (error) {
      res.json({ success: false, error: error.message });
    }
  });

  // GET /api/council-config/history - Get configuration change history
  app.get('/api/council-config/history', (req, res) => {
    try {
      res.json({ success: true, history: configManager.getHistory() });
    } catch (error) {
      res.json({ success: false, error: error.message });
    }
  });

  // POST /api/council-config/rollback - Rollback to previous configuration
  app.post('/api/council-config/rollback', rateLimit, (req, res) => {
    try {
      const result = configManager.rollback();
      res.json(result);
    } catch (error) {
      res.json({ success: false, error: error.message });
    }
  });

  // POST /api/council-config/test - Validate a configuration without applying it
  app.post('/api/council-config/test', rateLimit, (req, res) => {
    try {
      const validation = configManager.validateConfig(req.body || configManager.getConfig());
      res.json({ success: true, validation });
    } catch (error) {
      res.json({ success: false, error: error.message });
    }
  });
}
