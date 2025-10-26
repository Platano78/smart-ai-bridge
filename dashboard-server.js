// dashboard-server.js
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { BackendManager } from './backend-manager.js';
import { logger } from './mcp-logger.js';

// Get __dirname equivalent in ES6 modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class DashboardServer {
  constructor(options = {}) {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });

    // Initialize backend manager
    this.backendManager = new BackendManager(options.backendConfigPath || './dashboard-config/backends.json');

    // Store for external integrations
    this.usageAnalytics = options.usageAnalytics || null;
    this.conversationThreading = options.conversationThreading || null;
    this.adaptiveRouter = options.adaptiveRouter || null;

    this.clients = new Set();
    this.isInitialized = false;

    this.setupMiddleware();
    this.setupWebSocket();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.backendManager.initialize();
      this.setupBackendEventListeners();
      this.isInitialized = true;
      logger.info('Dashboard server initialized successfully');
    } catch (error) {
      console.error('Failed to initialize dashboard server:', error);
      throw error;
    }
  }

  setupMiddleware() {
    // Parse JSON bodies
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Serve static files from public/dashboard
    this.app.use('/dashboard', express.static(path.join(__dirname, 'public', 'dashboard')));

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // Redirect root to dashboard
    this.app.get('/', (req, res) => {
      res.redirect('/dashboard');
    });
  }

  setupWebSocket() {
    this.wss.on('connection', async (ws, req) => {
      logger.info(`WebSocket client connected from ${req.socket.remoteAddress}`);
      this.clients.add(ws);

      try {
        // Send initial status to new client
        const backends = await this.backendManager.getAllBackends();
        this.sendToClient(ws, 'initial_data', {
          backends,
          analytics: this.usageAnalytics ? await this.usageAnalytics.getRecentStats() : null,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error sending initial data to client:', error);
      }

      ws.on('close', () => {
        this.clients.delete(ws);
        logger.info('WebSocket client disconnected');
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });
    });
  }

  setupRoutes() {
    // Backend Management API Routes
    this.setupBackendRoutes();

    // Analytics Routes (if available)
    if (this.usageAnalytics) {
      this.setupAnalyticsRoutes();
    }

    // Conversation Threading Routes (if available)
    if (this.conversationThreading) {
      this.setupConversationRoutes();
    }

    // Catch-all route to serve dashboard index.html for SPA
    this.app.get(/^\/dashboard(?:\/(.*))?$/, (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'dashboard', 'index.html'));
    });
  }

  setupBackendRoutes() {
    // List all backends
    this.app.get('/api/backends/list', async (req, res) => {
      try {
        const backends = await this.backendManager.getAllBackends();
        res.json({ success: true, backends });
      } catch (error) {
        console.error('Error listing backends:', error);
        this.handleError(res, error, 'Failed to list backends');
      }
    });

    // Get specific backend status
    this.app.get('/api/backends/:backendId/status', async (req, res) => {
      try {
        const { backendId } = req.params;
        const status = await this.backendManager.getBackendStatus(backendId);
        res.json({ success: true, status });
      } catch (error) {
        console.error(`Error getting backend ${req.params.id} status:`, error);
        this.handleError(res, error, 'Failed to get backend status');
      }
    });

    // Add new backend
    this.app.post('/api/backends/add', async (req, res) => {
      try {
        const backendConfig = req.body;
        const backendId = await this.backendManager.addBackend(backendConfig);

        // Broadcast to all clients
        this.broadcast('backend:added', { id: backendId, config: backendConfig });

        res.status(201).json({ success: true, id: backendId });
      } catch (error) {
        console.error('Error adding backend:', error);
        this.handleError(res, error, 'Failed to add backend');
      }
    });

    // Update backend configuration
    this.app.put('/api/backends/:backendId/update', async (req, res) => {
      try {
        const { backendId: id } = req.params;
        const updateData = req.body;
        const result = await this.backendManager.updateBackend(id, updateData);

        // Broadcast update
        this.broadcast('backend:updated', { id, updates: result });

        res.json({ success: true, backend: result });
      } catch (error) {
        console.error(`Error updating backend ${req.params.id}:`, error);
        this.handleError(res, error, 'Failed to update backend');
      }
    });

    // Delete backend
    this.app.delete('/api/backends/:backendId', async (req, res) => {
      try {
        const { backendId: id } = req.params;
        const result = await this.backendManager.removeBackend(id);

        // Broadcast deletion
        this.broadcast('backend:removed', { id });

        res.json({ success: true, message: 'Backend removed successfully' });
      } catch (error) {
        console.error(`Error removing backend ${req.params.id}:`, error);
        this.handleError(res, error, 'Failed to remove backend');
      }
    });

    // Start backend server
    this.app.post('/api/backends/:backendId/start', async (req, res) => {
      try {
        const { backendId: id } = req.params;

        // Broadcast starting event
        this.broadcast('backend:server_starting', { id, timestamp: new Date().toISOString() });

        await this.backendManager.startBackend(id);

        // Broadcast ready event
        this.broadcast('backend:server_ready', {
          id,
          timestamp: new Date().toISOString()
        });

        res.json({ success: true, message: `Backend ${id} started successfully` });
      } catch (error) {
        console.error(`Error starting backend ${req.params.id}:`, error);
        this.broadcast('backend:server_error', {
          id: req.params.id,
          error: error.message
        });
        this.handleError(res, error, 'Failed to start backend');
      }
    });

    // Stop backend server
    this.app.post('/api/backends/:backendId/stop', async (req, res) => {
      try {
        const { backendId: id } = req.params;

        // Broadcast stopping event
        this.broadcast('backend:server_stopping', { id, timestamp: new Date().toISOString() });

        await this.backendManager.stopBackend(id);

        // Broadcast stopped event
        this.broadcast('backend:server_stopped', { id, timestamp: new Date().toISOString() });

        res.json({ success: true, message: `Backend ${id} stopped successfully` });
      } catch (error) {
        console.error(`Error stopping backend ${req.params.id}:`, error);
        this.handleError(res, error, 'Failed to stop backend');
      }
    });

    // Test backend connection
    this.app.post('/api/backends/:backendId/test', async (req, res) => {
      try {
        const { backendId: id } = req.params;
        const isHealthy = await this.backendManager.testBackendConnection(id);

        res.json({
          success: true,
          healthy: isHealthy,
          message: isHealthy ? 'Backend is responding' : 'Backend is not responding'
        });
      } catch (error) {
        console.error(`Error testing backend ${req.params.id}:`, error);
        this.handleError(res, error, 'Failed to test backend connection');
      }
    });

    // Detect Docker containers
    this.app.get('/api/backends/docker/detect', async (req, res) => {
      try {
        const containers = await this.backendManager.discoverVLLMContainers();
        logger.info(`Discovered ${containers.length} VLLM containers via API`);
        res.json({ success: true, containers });
      } catch (error) {
        console.error('Error detecting Docker containers:', error);
        this.handleError(res, error, 'Failed to detect Docker containers');
      }
    });

    // Update backend priorities
    this.app.put('/api/backends/priorities', async (req, res) => {
      try {
        const { priorities } = req.body;

        // Update priorities for each backend
        for (const { id, priority } of priorities) {
          await this.backendManager.updateBackend(id, { priority });
        }

        // Broadcast priority changes
        this.broadcast('backend:priorities_updated', priorities);

        res.json({ success: true, message: 'Priorities updated successfully' });
      } catch (error) {
        console.error('Error updating backend priorities:', error);
        this.handleError(res, error, 'Failed to update backend priorities');
      }
    });
  }

  setupAnalyticsRoutes() {
    this.app.get('/api/analytics/stats', async (req, res) => {
      try {
        const stats = await this.usageAnalytics.getRecentStats();
        res.json({ success: true, stats });
      } catch (error) {
        this.handleError(res, error, 'Failed to get analytics stats');
      }
    });
  }

  setupConversationRoutes() {
    this.app.get('/api/conversations/all', async (req, res) => {
      try {
        const conversations = await this.conversationThreading.getConversations();
        res.json({ success: true, conversations });
      } catch (error) {
        this.handleError(res, error, 'Failed to get conversations');
      }
    });

    this.app.get('/api/conversations/:conversationId', async (req, res) => {
      try {
        const { conversationId: id } = req.params;
        const conversation = await this.conversationThreading.getConversation(id);
        res.json({ success: true, conversation });
      } catch (error) {
        this.handleError(res, error, 'Failed to get conversation');
      }
    });
  }

  setupErrorHandling() {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Route not found' });
    });

    // Global error handler
    this.app.use((error, req, res, next) => {
      console.error('Unhandled error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
      });
    });
  }

  // WebSocket utility methods
  sendToClient(client, event, data) {
    if (client.readyState === 1) { // WebSocket.OPEN
      try {
        client.send(JSON.stringify({ event, data, timestamp: new Date().toISOString() }));
      } catch (error) {
        console.error('Error sending to client:', error);
      }
    }
  }

  broadcast(event, data) {
    const message = JSON.stringify({
      event,
      data,
      timestamp: new Date().toISOString()
    });

    this.clients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        try {
          client.send(message);
        } catch (error) {
          console.error('Error broadcasting to client:', error);
        }
      }
    });
  }

  handleError(res, error, defaultMessage) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: defaultMessage,
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }

  setupBackendEventListeners() {
    // Listen for backend events and broadcast to clients
    this.backendManager.on('backendStarted', (id) => {
      this.broadcast('backend:started', { id, timestamp: new Date().toISOString() });
    });

    this.backendManager.on('backendStopped', (id) => {
      this.broadcast('backend:stopped', { id, timestamp: new Date().toISOString() });
    });

    this.backendManager.on('backendAdded', (id) => {
      this.broadcast('backend:added', { id, timestamp: new Date().toISOString() });
    });

    this.backendManager.on('backendRemoved', (id) => {
      this.broadcast('backend:removed', { id, timestamp: new Date().toISOString() });
    });

    this.backendManager.on('backendUpdated', (id) => {
      this.broadcast('backend:updated', { id, timestamp: new Date().toISOString() });
    });

    this.backendManager.on('healthCheck', (data) => {
      this.broadcast('backend:health_check', data);
    });

    this.backendManager.on('backendStatusChanged', (data) => {
      this.broadcast('backend:status_change', data);
    });

    this.backendManager.on('error', (error) => {
      console.error('Backend manager error:', error);
      this.broadcast('backend:error', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
    });
  }

  // Start the server
  async start(port = 3456) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      // Add error handler for the server before listening
      const errorHandler = (error) => {
        console.error('Failed to start dashboard server:', error);
        this.server.removeListener('error', errorHandler);
        reject(error);
      };

      this.server.once('error', errorHandler);

      this.server.listen(port, (error) => {
        this.server.removeListener('error', errorHandler);
        if (error) {
          console.error('Failed to start dashboard server:', error);
          reject(error);
        } else {
          logger.info(`✅ Dashboard server running on http://localhost:${port}`);
          logger.info(`✅ WebSocket server ready`);
          logger.info(`✅ Dashboard UI available at http://localhost:${port}/dashboard`);
          resolve();
        }
      });
    });
  }

  // Graceful shutdown
  async stop() {
    logger.info('Shutting down dashboard server...');

    // Stop backend health monitoring
    this.backendManager.stopHealthMonitoring();

    // Close WebSocket connections
    this.clients.forEach(client => {
      client.close(1001, 'Server shutting down');
    });

    // Close HTTP server
    return new Promise((resolve) => {
      this.server.close(() => {
        logger.info('Dashboard server closed');
        resolve();
      });
    });
  }
}

// If run directly, start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  const PORT = process.env.DASHBOARD_PORT || 3456;

  const server = new DashboardServer();

  server.start(PORT).catch((error) => {
    console.error('Failed to start dashboard server:', error);
    process.exit(1);
  });

  // Handle graceful shutdown
  let isShuttingDown = false;

  const shutdown = async (signal) => {
    if (isShuttingDown) {
      logger.warn(`${signal} received again - forcing immediate exit`);
      process.exit(1);
    }

    isShuttingDown = true;
    logger.info(`${signal} received, shutting down gracefully`);

    try {
      await server.stop();
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
