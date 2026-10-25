use std::time::Duration;

use crate::config::Config;
use crate::upstream::Upstream;

/// The services the tools reach
pub struct Stack {
    pub graphhopper: Upstream,
    pub otp: Upstream,
    pub photon: Upstream,
    pub backend: Upstream,
    pub public_url: String,
}

impl Stack {
    pub fn new(config: &Config) -> Self {
        // Slots per service: routing and transit planning are heavy, lookups light
        let secs = Duration::from_secs;
        Stack {
            graphhopper: Upstream::new("Routing", &config.graphhopper_url, 4, secs(30)),
            otp: Upstream::new("Public transport", &config.otp_url, 2, secs(30)),
            photon: Upstream::new("Search", &config.photon_url, 8, secs(10)),
            backend: Upstream::new("Places", &config.backend_url, 8, secs(10)),
            public_url: config.public_url.clone(),
        }
    }
}
