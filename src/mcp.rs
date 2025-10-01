use anyhow::Result;
use axum::extract::ws::{Message as WsMessage, WebSocket};
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

use crate::{
    config::Config,
    deepseek::{DeepSeekClient, Message as DeepSeekMessage},
};

pub struct McpHandler {
    config: Arc<Config>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct McpRequest {
    pub jsonrpc: String,
    pub id: Option<Value>,
    pub method: String,
    pub params: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct McpResponse {
    pub jsonrpc: String,
    pub id: Option<Value>,
    pub result: Option<Value>,
    pub error: Option<McpError>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct McpError {
    pub code: i32,
    pub message: String,
    pub data: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InitializeParams {
    pub protocol_version: String,
    pub capabilities: ClientCapabilities,
    pub client_info: ClientInfo,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ClientCapabilities {
    pub experimental: Option<Value>,
    pub sampling: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ClientInfo {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ServerCapabilities {
    pub experimental: Option<Value>,
    pub logging: Option<Value>,
    pub prompts: Option<ListCapability>,
    pub resources: Option<ListCapability>,
    pub tools: Option<ListCapability>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ListCapability {
    pub list_changed: Option<bool>,
}

impl McpHandler {
    pub fn new(config: Arc<Config>) -> Self {
        Self { config }
    }

    pub async fn handle_request(&self, request_value: Value) -> Result<Value> {
        let request: McpRequest = serde_json::from_value(request_value)?;
        
        debug!("Handling MCP request: {} (id: {:?})", request.method, request.id);

        let response = match request.method.as_str() {
            "initialize" => self.handle_initialize(request).await?,
            "initialized" => self.handle_initialized(request).await?,
            "tools/list" => self.handle_tools_list(request).await?,
            "tools/call" => self.handle_tools_call(request).await?,
            "resources/list" => self.handle_resources_list(request).await?,
            "resources/read" => self.handle_resources_read(request).await?,
            "prompts/list" => self.handle_prompts_list(request).await?,
            "prompts/get" => self.handle_prompts_get(request).await?,
            _ => self.handle_unknown_method(request).await?,
        };

        Ok(serde_json::to_value(response)?)
    }

    pub async fn handle_websocket(&self, mut socket: WebSocket) -> Result<()> {
        info!("WebSocket connection established");

        while let Some(msg) = socket.next().await {
            match msg? {
                WsMessage::Text(text) => {
                    match serde_json::from_str::<Value>(&text) {
                        Ok(request_value) => {
                            match self.handle_request(request_value).await {
                                Ok(response) => {
                                    let response_text = serde_json::to_string(&response)?;
                                    if let Err(e) = socket.send(WsMessage::Text(response_text)).await {
                                        error!("Failed to send WebSocket response: {}", e);
                                        break;
                                    }
                                }
                                Err(e) => {
                                    error!("Error handling WebSocket request: {}", e);
                                    let error_response = McpResponse {
                                        jsonrpc: "2.0".to_string(),
                                        id: None,
                                        result: None,
                                        error: Some(McpError {
                                            code: -32603,
                                            message: "Internal error".to_string(),
                                            data: Some(serde_json::json!({ "details": e.to_string() })),
                                        }),
                                    };
                                    let error_text = serde_json::to_string(&error_response)?;
                                    let _ = socket.send(WsMessage::Text(error_text)).await;
                                }
                            }
                        }
                        Err(e) => {
                            error!("Failed to parse WebSocket message: {}", e);
                        }
                    }
                }
                WsMessage::Close(_) => {
                    info!("WebSocket connection closed");
                    break;
                }
                _ => {}
            }
        }

        Ok(())
    }

    async fn handle_initialize(&self, request: McpRequest) -> Result<McpResponse> {
        let _params: InitializeParams = match request.params {
            Some(params) => serde_json::from_value(params)?,
            None => return Err(anyhow::anyhow!("Initialize request missing parameters")),
        };

        let server_capabilities = ServerCapabilities {
            experimental: None,
            logging: None,
            prompts: Some(ListCapability {
                list_changed: Some(true),
            }),
            resources: Some(ListCapability {
                list_changed: Some(true),
            }),
            tools: Some(ListCapability {
                list_changed: Some(true),
            }),
        };

        let result = serde_json::json!({
            "protocolVersion": self.config.mcp.protocol_version,
            "capabilities": server_capabilities,
            "serverInfo": {
                "name": "deepseek-mcp-bridge",
                "version": env!("CARGO_PKG_VERSION")
            }
        });

        Ok(McpResponse {
            jsonrpc: "2.0".to_string(),
            id: request.id,
            result: Some(result),
            error: None,
        })
    }

    async fn handle_initialized(&self, request: McpRequest) -> Result<McpResponse> {
        debug!("Client initialized");
        
        Ok(McpResponse {
            jsonrpc: "2.0".to_string(),
            id: request.id,
            result: Some(serde_json::json!({})),
            error: None,
        })
    }

    async fn handle_tools_list(&self, request: McpRequest) -> Result<McpResponse> {
        let tools = serde_json::json!({
            "tools": [
                {
                    "name": "search",
                    "description": "Search and analyze content using DeepSeek AI",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "Search query"
                            },
                            "context": {
                                "type": "string",
                                "description": "Additional context for the search"
                            }
                        },
                        "required": ["query"]
                    }
                },
                {
                    "name": "analyze",
                    "description": "Analyze text content using DeepSeek AI",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "content": {
                                "type": "string",
                                "description": "Content to analyze"
                            },
                            "analysis_type": {
                                "type": "string",
                                "description": "Type of analysis to perform",
                                "enum": ["summary", "sentiment", "keywords", "structure"]
                            }
                        },
                        "required": ["content"]
                    }
                }
            ]
        });

        Ok(McpResponse {
            jsonrpc: "2.0".to_string(),
            id: request.id,
            result: Some(tools),
            error: None,
        })
    }

    async fn handle_tools_call(&self, request: McpRequest) -> Result<McpResponse> {
        let params = request.params.ok_or_else(|| anyhow::anyhow!("Missing tool call parameters"))?;
        
        let tool_name = params.get("name")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing tool name"))?;

        let arguments = params.get("arguments")
            .ok_or_else(|| anyhow::anyhow!("Missing tool arguments"))?;

        match tool_name {
            "search" => self.handle_search_tool(request.id, arguments).await,
            "analyze" => self.handle_analyze_tool(request.id, arguments).await,
            _ => Ok(McpResponse {
                jsonrpc: "2.0".to_string(),
                id: request.id,
                result: None,
                error: Some(McpError {
                    code: -32601,
                    message: format!("Unknown tool: {}", tool_name),
                    data: None,
                }),
            })
        }
    }

    async fn handle_search_tool(&self, id: Option<Value>, arguments: &Value) -> Result<McpResponse> {
        // This would integrate with the actual search functionality
        // For now, return a placeholder response
        let result = serde_json::json!({
            "content": [{
                "type": "text",
                "text": "Search functionality placeholder - would integrate with DeepSeek AI"
            }]
        });

        Ok(McpResponse {
            jsonrpc: "2.0".to_string(),
            id,
            result: Some(result),
            error: None,
        })
    }

    async fn handle_analyze_tool(&self, id: Option<Value>, arguments: &Value) -> Result<McpResponse> {
        // This would integrate with the actual analysis functionality
        // For now, return a placeholder response
        let result = serde_json::json!({
            "content": [{
                "type": "text",
                "text": "Analysis functionality placeholder - would integrate with DeepSeek AI"
            }]
        });

        Ok(McpResponse {
            jsonrpc: "2.0".to_string(),
            id,
            result: Some(result),
            error: None,
        })
    }

    async fn handle_resources_list(&self, request: McpRequest) -> Result<McpResponse> {
        let resources = serde_json::json!({
            "resources": []
        });

        Ok(McpResponse {
            jsonrpc: "2.0".to_string(),
            id: request.id,
            result: Some(resources),
            error: None,
        })
    }

    async fn handle_resources_read(&self, request: McpRequest) -> Result<McpResponse> {
        Ok(McpResponse {
            jsonrpc: "2.0".to_string(),
            id: request.id,
            result: None,
            error: Some(McpError {
                code: -32601,
                message: "Resource reading not implemented".to_string(),
                data: None,
            }),
        })
    }

    async fn handle_prompts_list(&self, request: McpRequest) -> Result<McpResponse> {
        let prompts = serde_json::json!({
            "prompts": []
        });

        Ok(McpResponse {
            jsonrpc: "2.0".to_string(),
            id: request.id,
            result: Some(prompts),
            error: None,
        })
    }

    async fn handle_prompts_get(&self, request: McpRequest) -> Result<McpResponse> {
        Ok(McpResponse {
            jsonrpc: "2.0".to_string(),
            id: request.id,
            result: None,
            error: Some(McpError {
                code: -32601,
                message: "Prompt retrieval not implemented".to_string(),
                data: None,
            }),
        })
    }

    async fn handle_unknown_method(&self, request: McpRequest) -> Result<McpResponse> {
        warn!("Unknown MCP method: {}", request.method);
        
        Ok(McpResponse {
            jsonrpc: "2.0".to_string(),
            id: request.id,
            result: None,
            error: Some(McpError {
                code: -32601,
                message: format!("Method not found: {}", request.method),
                data: None,
            }),
        })
    }
}