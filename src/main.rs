use anyhow::Result;
use clap::Parser;
use std::path::PathBuf;
use tracing::{info, error};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod config;
mod server;
mod deepseek;
mod mcp;
mod health;
mod metrics;

use config::Config;
use server::Server;

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Configuration file path
    #[arg(short, long, value_name = "FILE")]
    config: Option<PathBuf>,

    /// Port to listen on
    #[arg(short, long, default_value_t = 8080)]
    port: u16,

    /// Environment (development, production)
    #[arg(short, long, default_value = "development")]
    env: String,

    /// Enable debug logging
    #[arg(short, long)]
    debug: bool,

    /// Health check only
    #[arg(long)]
    health_check: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    
    // Initialize logging
    let log_level = if args.debug || args.env == "development" {
        "debug"
    } else {
        "info"
    };
    
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| format!("deepseek_mcp_bridge={}", log_level).into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("Starting DeepSeek MCP Bridge v{}", env!("CARGO_PKG_VERSION"));
    info!("Environment: {}", args.env);
    info!("Port: {}", args.port);

    // Load configuration
    let config = Config::load(args.config, &args.env)?;
    
    // Health check mode
    if args.health_check {
        return health_check(&config).await;
    }

    // Start server
    let server = Server::new(config, args.port).await?;
    
    // Graceful shutdown handling
    let shutdown = tokio::signal::ctrl_c();
    
    tokio::select! {
        result = server.run() => {
            match result {
                Ok(_) => info!("Server stopped gracefully"),
                Err(e) => error!("Server error: {}", e),
            }
        }
        _ = shutdown => {
            info!("Shutdown signal received, stopping server...");
        }
    }

    Ok(())
}

async fn health_check(config: &Config) -> Result<()> {
    info!("Performing health check...");
    
    // Basic configuration validation
    if config.deepseek_api_key.is_empty() {
        error!("DeepSeek API key not configured");
        return Err(anyhow::anyhow!("Missing DeepSeek API key"));
    }
    
    // TODO: Add more health checks
    // - DeepSeek API connectivity
    // - MCP protocol validation
    // - Resource availability
    
    info!("Health check passed");
    Ok(())
}