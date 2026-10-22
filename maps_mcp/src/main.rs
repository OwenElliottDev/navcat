mod config;
mod geo;
mod guard;
mod links;
mod places;
mod server;
mod stack;
mod upstream;

use std::net::SocketAddr;
use std::process::ExitCode;
use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::routing::get;
use rmcp::transport::streamable_http_server::session::local::LocalSessionManager;
use rmcp::transport::streamable_http_server::{StreamableHttpServerConfig, StreamableHttpService};
use tokio_util::sync::CancellationToken;

use crate::config::Config;
use crate::guard::Guard;
use crate::server::NavCat;
use crate::stack::Stack;

/// MCP requests are small JSON; anything bigger is turned away
const MAX_BODY_BYTES: usize = 64 * 1024;

#[tokio::main]
async fn main() -> ExitCode {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let config = match Config::from_env() {
        Ok(config) => config,
        Err(message) => {
            tracing::error!("{message}");
            return ExitCode::FAILURE;
        }
    };
    if std::env::args().nth(1).as_deref() == Some("health") {
        return health(&config).await;
    }

    let stack = Arc::new(Stack::new(&config));
    let shutdown = CancellationToken::new();
    // Stateless: the server holds nothing per client, so there's nothing for clients to pile up
    let mcp_config = StreamableHttpServerConfig::default()
        .with_legacy_session_mode(false)
        .with_json_response(true)
        .with_allowed_hosts(config.allowed_hosts.clone())
        .with_allowed_origins(config.allowed_origins.clone())
        .enforce_origin_validation()
        .with_max_request_body_bytes(MAX_BODY_BYTES)
        .with_cancellation_token(shutdown.child_token());
    let mcp = StreamableHttpService::new(
        move || Ok(NavCat::new(stack.clone())),
        Arc::new(LocalSessionManager::default()),
        mcp_config,
    );

    let guard = Guard::new(config.token.clone(), config.rate_limit);
    let app = Router::new()
        .nest_service("/mcp", mcp)
        .layer(axum::middleware::from_fn_with_state(guard, guard::check))
        .route("/health", get(|| async { "ok" }));

    let listener = match tokio::net::TcpListener::bind(&config.listen).await {
        Ok(listener) => listener,
        Err(err) => {
            tracing::error!("Can't listen on {}: {err}", config.listen);
            return ExitCode::FAILURE;
        }
    };
    let auth = if config.token.is_some() {
        "token required"
    } else {
        "no token"
    };
    tracing::info!("Nav Cat MCP listening on {} ({auth})", config.listen);
    let served = axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(async move {
        stopped().await;
        shutdown.cancel();
    })
    .await;
    match served {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            tracing::error!("{err}");
            ExitCode::FAILURE
        }
    }
}

/// Ctrl-C, or Docker's SIGTERM
async fn stopped() {
    let mut terminate = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        .expect("SIGTERM handler");
    tokio::select! {
        _ = tokio::signal::ctrl_c() => {}
        _ = terminate.recv() => {}
    }
}

/// `navcat-mcp health`, the container's healthcheck (its image has no curl)
async fn health(config: &Config) -> ExitCode {
    let port = config.listen.rsplit(':').next().unwrap_or("8000");
    let answered = reqwest::Client::builder()
        .no_proxy()
        .build()
        .expect("HTTP client")
        .get(format!("http://127.0.0.1:{port}/health"))
        .timeout(Duration::from_secs(3))
        .send()
        .await
        .is_ok_and(|r| r.status().is_success());
    if answered {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}
