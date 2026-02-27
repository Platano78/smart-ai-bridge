# Smart AI Bridge Dashboard

The dashboard provides a web UI for managing backends and configuring the council system. It is intended for **local development use only** -- there is no authentication or authorization.

## Starting the Dashboard

```javascript
import { DashboardServer } from './src/dashboard/dashboard-server.js';

const dashboard = new DashboardServer({
  port: 3456,
  backendRegistry: backendRegistry  // your BackendRegistry instance
});

await dashboard.start();
// Dashboard available at http://localhost:3456
```

## Pages

| Path | Description |
|------|-------------|
| `/` | Backend management dashboard -- enable/disable backends, set priorities, run health checks |
| `/council` | Council configuration -- strategies, topic-to-backend mapping |

## Backend Management API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | System status |
| GET | `/api/backends` | List all backends |
| GET | `/api/backends/:name` | Single backend details (API keys masked) |
| POST | `/api/backends/enable` | Toggle backend enabled state (persists to disk) |
| POST | `/api/backends/priority` | Set backend priority (persists to disk) |
| GET | `/api/backends/health` | Health check all backends |
| GET | `/api/backends/types` | Available adapter types |
| POST | `/api/backends/add` | Register new backend |
| PUT | `/api/backends/:name` | Update backend config |
| DELETE | `/api/backends/:name` | Remove backend |

## Council Config API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/council-config` | Current config + metadata |
| PUT | `/api/council-config` | Update full config |
| PATCH | `/api/council-config/topic/:topic` | Update single topic |
| GET | `/api/council-config/backends` | Available backends, topics, and strategies |
| GET | `/api/council-config/history` | Change history |
| POST | `/api/council-config/rollback` | Rollback to previous config |
| POST | `/api/council-config/test` | Validate config (dry run) |

## Security Notes

- Designed for **local development use only**
- No authentication or authorization
- Runs on localhost by default
- API keys are masked in GET responses
- Do not expose the dashboard port to the public internet
