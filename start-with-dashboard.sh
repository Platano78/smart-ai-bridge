#!/bin/bash
# Start MKG Dashboard Server
# Serves the WebUI on port 3456

cd "$(dirname "$0")"

echo "🦖 Starting MKG Dashboard..."
node -e "
import('./src/dashboard/index.js').then(async ({ DashboardServer }) => {
  import('./src/threading/index.js').then(async ({ default: ConversationThreading }) => {
    const threading = new ConversationThreading('./data/conversations');
    await threading.init();
    
    const dashboard = new DashboardServer({
      port: 3456,
      conversationThreading: threading
    });
    await dashboard.start();
    console.log('Dashboard ready!');
  });
});
"
