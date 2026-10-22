// What every request passes before reaching MCP: the token, if one is set, and a rate limit
// per address. (Host and Origin checks are rmcp's, set up in main.rs.)

use std::net::{IpAddr, SocketAddr};
use std::num::NonZeroU32;
use std::sync::Arc;
use std::time::Duration;

use axum::extract::{ConnectInfo, Request, State};
use axum::http::{StatusCode, header};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use governor::{DefaultKeyedRateLimiter, Quota, RateLimiter};

pub struct Guard {
    token: Option<String>,
    limiter: DefaultKeyedRateLimiter<IpAddr>,
}

impl Guard {
    pub fn new(token: Option<String>, per_minute: u32) -> Arc<Self> {
        let per_minute = NonZeroU32::new(per_minute).expect("rate limit is positive");
        let limiter = RateLimiter::keyed(Quota::per_minute(per_minute));
        let guard = Arc::new(Guard { token, limiter });

        // Forget addresses that have gone quiet, so the limiter stays small
        let weak = Arc::downgrade(&guard);
        tokio::spawn(async move {
            let mut every = tokio::time::interval(Duration::from_secs(60));
            loop {
                every.tick().await;
                let Some(guard) = weak.upgrade() else { break };
                guard.limiter.retain_recent();
            }
        });
        guard
    }

    fn authorized(&self, request: &Request) -> bool {
        let Some(token) = &self.token else {
            return true;
        };
        let given = request
            .headers()
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .unwrap_or_default();
        constant_time_eq(given.as_bytes(), token.as_bytes())
    }
}

/// Compares without stopping at the first difference, so timing doesn't give the token away
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0, |diff, (x, y)| diff | (x ^ y)) == 0
}

pub async fn check(
    State(guard): State<Arc<Guard>>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    request: Request,
    next: Next,
) -> Response {
    if !guard.authorized(&request) {
        let challenge = [(header::WWW_AUTHENTICATE, "Bearer")];
        return (StatusCode::UNAUTHORIZED, challenge, "Unauthorized").into_response();
    }
    if guard.limiter.check_key(&peer.ip()).is_err() {
        let retry = [(header::RETRY_AFTER, "10")];
        return (StatusCode::TOO_MANY_REQUESTS, retry, "Too many requests").into_response();
    }
    next.run(request).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_tokens() {
        assert!(constant_time_eq(b"secret", b"secret"));
        assert!(!constant_time_eq(b"secret", b"secreT"));
        assert!(!constant_time_eq(b"secret", b"secret!"));
        assert!(!constant_time_eq(b"", b"secret"));
    }
}
