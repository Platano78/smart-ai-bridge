#!/usr/bin/env node
/**
 * Standalone dashboard launcher for Smart AI Bridge
 * Run with: node start-dashboard.js
 */

import { DashboardServer } from './src/dashboard/dashboard-server.js';

const dashboard = new DashboardServer({
  port: 3456
});

dashboard.start().then(() => {
  console.log('🚀 Smart AI Bridge Dashboard running at http://localhost:3456/');
}).catch(err => {
  console.error('Failed to start dashboard:', err);
  process.exit(1);
});
