// What every request passes before reaching MCP: the token, if one is set, and a rate limit
// per address. (Host and Origin checks are rmcp's, set up in main.rs.)

use std::net::{IpAddr, SocketAddr};
use std::num::NonZeroU32;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;

use axum::extract::{ConnectInfo, Request, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use governor::{DefaultKeyedRateLimiter, Quota, RateLimiter};

pub struct Guard {
    token: Option<String>,
    limiter: DefaultKeyedRateLimiter<IpAddr>,
    trusted_proxies: Vec<Network>,
}

impl Guard {
    pub fn new(token: Option<String>, per_minute: u32, trusted_proxies: Vec<Network>) -> Arc<Self> {
        let per_minute = NonZeroU32::new(per_minute).expect("rate limit is positive");
        let limiter = RateLimiter::keyed(Quota::per_minute(per_minute));
        let guard = Arc::new(Guard {
            token,
            limiter,
            trusted_proxies,
        });

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

/// An address or CIDR range, e.g. `172.16.0.0/12`, `10.0.0.5` or `fd00::/8`
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Network {
    addr: IpAddr,
    prefix: u8,
}

impl Network {
    fn contains(&self, ip: IpAddr) -> bool {
        match (self.addr, ip.to_canonical()) {
            (IpAddr::V4(net), IpAddr::V4(ip)) => {
                let mask = u32::MAX
                    .checked_shl(32 - u32::from(self.prefix))
                    .unwrap_or(0);
                u32::from(net) & mask == u32::from(ip) & mask
            }
            (IpAddr::V6(net), IpAddr::V6(ip)) => {
                let mask = u128::MAX
                    .checked_shl(128 - u32::from(self.prefix))
                    .unwrap_or(0);
                u128::from(net) & mask == u128::from(ip) & mask
            }
            _ => false,
        }
    }
}

impl FromStr for Network {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, String> {
        let (addr, prefix) = match s.split_once('/') {
            Some((addr, prefix)) => (addr, Some(prefix)),
            None => (s, None),
        };
        let addr = addr
            .parse::<IpAddr>()
            .map_err(|_| format!("{s:?} isn't an address or CIDR range"))?
            .to_canonical();
        let max = if addr.is_ipv4() { 32 } else { 128 };
        let prefix = match prefix {
            Some(p) => p.parse().ok().filter(|p| *p <= max),
            None => Some(max),
        }
        .ok_or(format!("{s:?} has a bad prefix length"))?;
        Ok(Network { addr, prefix })
    }
}

/// The address to rate limit: the peer's, unless it's a trusted proxy, in which case the
/// rightmost `X-Forwarded-For` entry that isn't one too. Entries left of that are whatever
/// the client sent, so they're never believed.
fn client_ip(peer: IpAddr, forwarded_for: &[&str], trusted: &[Network]) -> IpAddr {
    let is_trusted = |ip: IpAddr| trusted.iter().any(|net| net.contains(ip));
    let mut client = peer.to_canonical();
    let entries = forwarded_for.iter().rev().flat_map(|v| v.rsplit(','));
    for entry in entries {
        if !is_trusted(client) {
            break;
        }
        // A garbled entry can't have come from a trusted proxy; stop at the last good hop
        match parse_entry(entry.trim()) {
            Some(ip) => client = ip,
            None => break,
        }
    }
    client
}

/// An `X-Forwarded-For` entry: an address, sometimes with a port
fn parse_entry(entry: &str) -> Option<IpAddr> {
    entry
        .parse::<IpAddr>()
        .or_else(|_| entry.parse::<SocketAddr>().map(|a| a.ip()))
        .ok()
        .map(|ip| ip.to_canonical())
}

fn forwarded_for(headers: &HeaderMap) -> Vec<&str> {
    headers
        .get_all("x-forwarded-for")
        .iter()
        .map(|v| v.to_str().unwrap_or_default())
        .collect()
}

pub async fn check(
    State(guard): State<Arc<Guard>>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    request: Request,
    next: Next,
) -> Response {
    let client = client_ip(
        peer.ip(),
        &forwarded_for(request.headers()),
        &guard.trusted_proxies,
    );
    if guard.limiter.check_key(&client).is_err() {
        let retry = [(header::RETRY_AFTER, "10")];
        return (StatusCode::TOO_MANY_REQUESTS, retry, "Too many requests").into_response();
    }
    if !guard.authorized(&request) {
        let challenge = [(header::WWW_AUTHENTICATE, "Bearer")];
        return (StatusCode::UNAUTHORIZED, challenge, "Unauthorized").into_response();
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

    fn ip(s: &str) -> IpAddr {
        s.parse().unwrap()
    }

    fn nets(list: &[&str]) -> Vec<Network> {
        list.iter().map(|s| s.parse().unwrap()).collect()
    }

    #[test]
    fn parses_networks() {
        assert!("10.0.0.0/8".parse::<Network>().is_ok());
        assert!("10.0.0.5".parse::<Network>().is_ok());
        assert!("fd00::/8".parse::<Network>().is_ok());
        assert!("0.0.0.0/0".parse::<Network>().is_ok());
        assert!("10.0.0.0/33".parse::<Network>().is_err());
        assert!("10.0.0.0/".parse::<Network>().is_err());
        assert!("caddy".parse::<Network>().is_err());
    }

    #[test]
    fn matches_networks() {
        let net: Network = "172.16.0.0/12".parse().unwrap();
        assert!(net.contains(ip("172.16.0.1")));
        assert!(net.contains(ip("172.31.255.255")));
        assert!(!net.contains(ip("172.32.0.1")));
        assert!(!net.contains(ip("::1")));
        // How a dual-stack socket reports an IPv4 peer
        assert!(net.contains(ip("::ffff:172.17.0.1")));

        let one: Network = "10.0.0.5".parse().unwrap();
        assert!(one.contains(ip("10.0.0.5")));
        assert!(!one.contains(ip("10.0.0.6")));

        let any: Network = "0.0.0.0/0".parse().unwrap();
        assert!(any.contains(ip("203.0.113.9")));

        let v6: Network = "fd00::/8".parse().unwrap();
        assert!(v6.contains(ip("fd12::1")));
        assert!(!v6.contains(ip("fe80::1")));
    }

    #[test]
    fn uses_peer_without_trusted_proxies() {
        let xff = ["203.0.113.9"];
        assert_eq!(client_ip(ip("172.17.0.1"), &xff, &[]), ip("172.17.0.1"));
    }

    #[test]
    fn ignores_header_from_untrusted_peer() {
        let trusted = nets(&["172.16.0.0/12"]);
        let xff = ["203.0.113.9"];
        assert_eq!(
            client_ip(ip("198.51.100.4"), &xff, &trusted),
            ip("198.51.100.4")
        );
    }

    #[test]
    fn uses_header_from_trusted_proxy() {
        let trusted = nets(&["172.16.0.0/12"]);
        assert_eq!(
            client_ip(ip("172.17.0.1"), &["203.0.113.9"], &trusted),
            ip("203.0.113.9")
        );
        // The peer is all there is to go on when the proxy didn't add the header
        assert_eq!(client_ip(ip("172.17.0.1"), &[], &trusted), ip("172.17.0.1"));
    }

    #[test]
    fn ignores_addresses_the_client_sent() {
        let trusted = nets(&["172.16.0.0/12"]);
        // The client made up 1.2.3.4; the proxy appended its real address
        let xff = ["1.2.3.4, 203.0.113.9"];
        assert_eq!(
            client_ip(ip("172.17.0.1"), &xff, &trusted),
            ip("203.0.113.9")
        );
    }

    #[test]
    fn walks_chained_proxies() {
        let trusted = nets(&["172.16.0.0/12", "10.0.0.0/8"]);
        let xff = ["1.2.3.4, 203.0.113.9, 10.0.0.2"];
        assert_eq!(
            client_ip(ip("172.17.0.1"), &xff, &trusted),
            ip("203.0.113.9")
        );
        // Over separate header lines, in order
        let lines = ["1.2.3.4, 203.0.113.9", "10.0.0.2"];
        assert_eq!(
            client_ip(ip("172.17.0.1"), &lines, &trusted),
            ip("203.0.113.9")
        );
        // All trusted: the furthest one is the client
        let xff = ["10.0.0.3, 10.0.0.2"];
        assert_eq!(client_ip(ip("172.17.0.1"), &xff, &trusted), ip("10.0.0.3"));
    }

    #[test]
    fn stops_at_garbled_entries() {
        let trusted = nets(&["172.16.0.0/12"]);
        assert_eq!(
            client_ip(ip("172.17.0.1"), &["unknown"], &trusted),
            ip("172.17.0.1")
        );
        assert_eq!(
            client_ip(ip("172.17.0.1"), &[""], &trusted),
            ip("172.17.0.1")
        );
        let xff = ["203.0.113.9, nonsense"];
        assert_eq!(
            client_ip(ip("172.17.0.1"), &xff, &trusted),
            ip("172.17.0.1")
        );
    }

    #[test]
    fn reads_entries_with_ports() {
        let trusted = nets(&["172.16.0.0/12"]);
        assert_eq!(
            client_ip(ip("172.17.0.1"), &["203.0.113.9:4711"], &trusted),
            ip("203.0.113.9")
        );
        assert_eq!(
            client_ip(ip("172.17.0.1"), &["[2001:db8::1]:4711"], &trusted),
            ip("2001:db8::1")
        );
        assert_eq!(
            client_ip(ip("172.17.0.1"), &["2001:db8::1"], &trusted),
            ip("2001:db8::1")
        );
    }
}
