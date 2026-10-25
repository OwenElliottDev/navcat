// OpenTripPlanner's GTFS GraphQL API, shared by the public transport tools

use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};

use crate::stack::Stack;
use crate::upstream::Error;

#[derive(Deserialize)]
struct Response<T> {
    data: Option<T>,
    #[serde(default)]
    errors: Vec<GraphQlError>,
}

#[derive(Deserialize)]
struct GraphQlError {
    message: String,
}

/// A query's data, or the first error OTP gave instead
pub async fn query<T: DeserializeOwned>(
    stack: &Stack,
    query: &str,
    variables: Value,
) -> Result<T, Error> {
    let body = json!({ "query": query, "variables": variables });
    let request = stack.otp.post("/otp/gtfs/v1").json(&body);
    let response: Response<T> = stack.otp.json(request).await?;
    response.data.ok_or_else(|| {
        let message = response.errors.into_iter().next();
        Error::Rejected(
            stack.otp.name,
            message.map_or("no answer".into(), |e| e.message),
        )
    })
}

/// A route as OTP gives it
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Route {
    short_name: Option<String>,
    long_name: Option<String>,
    pub mode: Option<String>,
}

impl Route {
    /// Its number, or its name when it has none
    pub fn label(&self) -> Option<String> {
        let named = |name: &Option<String>| name.clone().filter(|n| !n.is_empty());
        named(&self.short_name).or_else(|| named(&self.long_name))
    }
}
