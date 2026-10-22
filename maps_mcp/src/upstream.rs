use std::fmt;
use std::time::Duration;

use reqwest::{Client, RequestBuilder};
use serde::de::DeserializeOwned;
use tokio::sync::Semaphore;

/// How long a request waits for one of a service's slots before giving up as busy
const QUEUE_TIMEOUT: Duration = Duration::from_secs(10);

/// One of the stack's services, with a cap on how many requests it gets from here at once so
/// agents can't swamp it (GraphHopper and OTP especially)
pub struct Upstream {
    pub name: &'static str,
    base: String,
    client: Client,
    slots: Semaphore,
    timeout: Duration,
}

#[derive(Debug)]
pub enum Error {
    /// The service didn't answer, e.g. still starting or mid-update
    Unavailable(&'static str),
    /// Too many requests to the service are already running
    Busy(&'static str),
    /// The service turned the request down; its message says why
    Rejected(&'static str, String),
    /// The request was wrong; `code` lets agents tell cases apart
    Invalid { code: &'static str, message: String },
}

impl Error {
    pub fn invalid(code: &'static str, message: impl Into<String>) -> Self {
        Error::Invalid {
            code,
            message: message.into(),
        }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Unavailable(name) => {
                write!(f, "{name} isn't available right now (code: unavailable)")
            }
            Error::Busy(name) => write!(f, "{name} is busy, try again shortly (code: busy)"),
            Error::Rejected(name, message) => write!(f, "{name}: {message} (code: rejected)"),
            Error::Invalid { code, message } => write!(f, "{message} (code: {code})"),
        }
    }
}

/// Tools give errors back as text, marked as an error for the model to act on
impl From<Error> for String {
    fn from(error: Error) -> String {
        error.to_string()
    }
}

impl Upstream {
    pub fn new(name: &'static str, base: &str, slots: usize, timeout: Duration) -> Self {
        Upstream {
            name,
            base: base.trim_end_matches('/').into(),
            // Only ever the stack's own services, never a proxy
            client: Client::builder().no_proxy().build().expect("HTTP client"),
            slots: Semaphore::new(slots),
            timeout,
        }
    }

    pub fn get(&self, path: &str) -> RequestBuilder {
        self.client
            .get(format!("{}{path}", self.base))
            .timeout(self.timeout)
    }

    pub fn post(&self, path: &str) -> RequestBuilder {
        self.client
            .post(format!("{}{path}", self.base))
            .timeout(self.timeout)
    }

    /// Sends a request once a slot is free and reads its JSON answer. A 4xx answer's message
    /// (GraphHopper's `message`, FastAPI's `detail`) is passed on, as it says what was wrong.
    pub async fn json<T: DeserializeOwned>(&self, request: RequestBuilder) -> Result<T, Error> {
        let _slot = tokio::time::timeout(QUEUE_TIMEOUT, self.slots.acquire())
            .await
            .map_err(|_| Error::Busy(self.name))?
            .expect("semaphore is never closed");

        let response = request.send().await.map_err(|err| {
            tracing::warn!("{}: {err}", self.name);
            Error::Unavailable(self.name)
        })?;
        let status = response.status();
        if status.is_client_error() {
            let body = response
                .json::<serde_json::Value>()
                .await
                .unwrap_or_default();
            let message = ["message", "detail"]
                .iter()
                .find_map(|key| body.get(key)?.as_str().map(String::from))
                .unwrap_or_else(|| format!("answered {status}"));
            return Err(Error::Rejected(self.name, message));
        }
        if !status.is_success() {
            tracing::warn!("{} answered {status}", self.name);
            return Err(Error::Unavailable(self.name));
        }
        response.json().await.map_err(|err| {
            tracing::warn!("{}: unexpected answer: {err}", self.name);
            Error::Unavailable(self.name)
        })
    }
}
