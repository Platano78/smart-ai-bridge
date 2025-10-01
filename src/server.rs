use anyhow::Result;
use axum::{
    extract::{State, WebSocketUpgrade},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use std::sync::Arc;
use tokio::net::TcpListener;
use tower::ServiceBuilder;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing::{info, error};

use crate::{
    config::Config,
    health::HealthChecker,
    mcp::McpHandler,
    deepseek::DeepSeekClient,
    metrics::MetricsCollector,
};

pub struct Server {
    config: Arc<Config>,
    router: Router<AppState>,
    port: u16,
}

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub deepseek_client: Arc<DeepSeekClient>,
    pub mcp_handler: Arc<McpHandler>,
    pub health_checker: Arc<HealthChecker>,
    pub metrics: Arc<MetricsCollector>,
}

impl Server {
    pub async fn new(config: Config, port: u16) -> Result<Self> {
        let config = Arc::new(config);
        
        // Initialize services
        let deepseek_client = Arc::new(DeepSeekClient::new(config.clone())?);
        let mcp_handler = Arc::new(McpHandler::new(config.clone()));
        let health_checker = Arc::new(HealthChecker::new(config.clone()));
        let metrics = Arc::new(MetricsCollector::new(config.clone()));

        let state = AppState {
            config: config.clone(),
            deepseek_client,
            mcp_handler,
            health_checker,
            metrics,
        };

        let router = Self::create_router(state);

        Ok(Server {
            config,
            router,
            port,
        })
    }

    fn create_router(state: AppState) -> Router<AppState> {
        let mut router = Router::new()
            .route("/health", get(health_handler))
            .route("/ready", get(ready_handler))
            .route("/mcp", post(mcp_handler))
            .route("/ws", get(websocket_handler));

        // Add metrics endpoint if enabled
        if state.config.metrics.enabled {
            router = router.route("/metrics", get(metrics_handler));
        }

        router = router.with_state(state);

        // Add middleware
        router = router.layer(
            ServiceBuilder::new()
                .layer(TraceLayer::new_for_http())
                .layer(CorsLayer::permissive()),
        );

        router
    }

    pub async fn run(self) -> Result<()> {
        let addr = format!("{}:{}", self.config.server.host, self.port);
        let listener = TcpListener::bind(&addr).await?;
        
        info!("Server listening on {}", addr);
        info!("Health endpoint: http://{}/health", addr);
        info!("MCP endpoint: http://{}/mcp", addr);
        
        if self.config.metrics.enabled {
            info!("Metrics endpoint: http://{}/metrics", addr);
        }

        axum::serve(listener, self.router)
            .await
            .map_err(|e| anyhow::anyhow!("Server error: {}", e))
    }
}

// Handler functions
async fn health_handler(State(state): State<AppState>) -> impl IntoResponse {
    match state.health_checker.check().await {
        Ok(status) => (StatusCode::OK, Json(status)).into_response(),
        Err(e) => {
            error!("Health check failed: {}", e);
            (StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({
                "status": "unhealthy",
                "error": e.to_string()
            }))).into_response()
        }
    }
}

async fn ready_handler(State(state): State<AppState>) -> impl IntoResponse {
    match state.health_checker.ready_check().await {
        Ok(_) => StatusCode::OK,
        Err(_) => StatusCode::SERVICE_UNAVAILABLE,
    }
}

async fn mcp_handler(
    State(state): State<AppState>,
    Json(request): Json<serde_json::Value>,
) -> impl IntoResponse {
    state.metrics.increment_request_count("mcp").await;
    
    match state.mcp_handler.handle_request(request).await {
        Ok(response) => {
            state.metrics.increment_success_count("mcp").await;
            (StatusCode::OK, Json(response)).into_response()
        }
        Err(e) => {
            error!("MCP handler error: {}", e);
            state.metrics.increment_error_count("mcp").await;
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({
                "error": e.to_string()
            }))).into_response()
        }
    }
}

async fn websocket_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> Response {
    ws.on_upgrade(move |socket| async move {
        if let Err(e) = state.mcp_handler.handle_websocket(socket).await {
            error!("WebSocket error: {}", e);
        }
    })
}

async fn metrics_handler(State(state): State<AppState>) -> impl IntoResponse {
    match state.metrics.export().await {
        Ok(metrics) => (StatusCode::OK, metrics).into_response(),
        Err(e) => {
            error!("Metrics export error: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}