use std::env;
use std::net::IpAddr;

/// Settings from env vars (set in docker-compose.yml)
pub struct Config {
    /// Where the server listens inside the container
    pub listen: String,
    /// The host address the port is published on, to tell whether it's reachable off this machine
    pub bind: String,
    /// Needed in an `Authorization: Bearer` header when set
    pub token: Option<String>,
    /// `Host` headers accepted, against DNS rebinding
    pub allowed_hosts: Vec<String>,
    /// Browser origins accepted; none by default, so web pages can't call the server
    pub allowed_origins: Vec<String>,
    /// Requests per minute from one address
    pub rate_limit: u32,
    /// Nav Cat's address as people open it, for links to places
    pub public_url: String,
    pub photon_url: String,
    pub backend_url: String,
}

fn var(name: &str, default: &str) -> String {
    env::var(name)
        .ok()
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| default.into())
}

fn list(name: &str, default: &str) -> Vec<String> {
    var(name, default)
        .split(',')
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(String::from)
        .collect()
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        let rate_limit = var("MCP_RATE_LIMIT", "120");
        let config = Config {
            listen: var("MCP_LISTEN", "0.0.0.0:8000"),
            bind: var("MCP_BIND", "127.0.0.1"),
            token: env::var("MCP_TOKEN").ok().filter(|t| !t.is_empty()),
            allowed_hosts: list("MCP_ALLOWED_HOSTS", "localhost,127.0.0.1,::1"),
            allowed_origins: list("MCP_ALLOWED_ORIGINS", ""),
            rate_limit: rate_limit.parse().ok().filter(|n| *n > 0).ok_or(format!(
                "MCP_RATE_LIMIT must be a positive number, not {rate_limit:?}"
            ))?,
            public_url: var("MCP_PUBLIC_URL", "http://localhost:7000")
                .trim_end_matches('/')
                .into(),
            photon_url: var("PHOTON_URL", "http://maps-photon:2322"),
            backend_url: var("BACKEND_URL", "http://maps-backend:8000"),
        };
        if config.token.is_none() && !is_loopback(&config.bind) {
            return Err(format!(
                "MCP_BIND is {}, so other machines can reach the server: set MCP_TOKEN",
                config.bind
            ));
        }
        Ok(config)
    }
}

fn is_loopback(bind: &str) -> bool {
    bind == "localhost" || bind.parse::<IpAddr>().is_ok_and(|ip| ip.is_loopback())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn knows_loopback() {
        assert!(is_loopback("127.0.0.1"));
        assert!(is_loopback("::1"));
        assert!(is_loopback("localhost"));
        assert!(!is_loopback("0.0.0.0"));
        assert!(!is_loopback("192.168.1.20"));
    }
}
