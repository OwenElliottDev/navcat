// What this server can plan, from the backend's /api/capabilities (GraphHopper's travel modes
// and route options, OpenTripPlanner's timetables)

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::stack::Stack;
use crate::upstream::Error;

#[derive(Debug, Serialize, JsonSchema)]
pub struct Capabilities {
    /// None while routing isn't answering
    pub routing: Option<Routing>,
    /// None while public transport isn't answering
    pub transit: Option<Transit>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct Routing {
    /// The area routing covers, as [west, south, east, north]
    pub area: Option<Vec<f64>>,
    /// plan_route's modes
    pub modes: Vec<String>,
    /// What plan_route's `avoid` can steer away from here, and the modes each is for
    pub avoid: Vec<Avoidable>,
    /// The modes that can avoid steep hills here (none without slope data)
    pub avoid_steep_hills: Vec<String>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct Avoidable {
    pub id: String,
    pub modes: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct Transit {
    /// plan_transit's modes
    pub modes: Vec<String>,
    /// The first and last days the timetables have services, e.g. "2026-10-24". Journeys
    /// outside them can only walk.
    #[serde(alias = "timetablesFrom")]
    pub timetables_from: Option<String>,
    #[serde(alias = "timetablesUntil")]
    pub timetables_until: Option<String>,
}

/// The backend's answer, with the route options' GraphHopper rules
#[derive(Deserialize)]
pub struct Backend {
    pub routing: Option<BackendRouting>,
    pub transit: Option<Transit>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendRouting {
    area: Option<Vec<f64>>,
    pub profiles: Vec<String>,
    pub avoid: Vec<AvoidOption>,
    pub steep_hills: Option<Rules>,
}

#[derive(Deserialize)]
pub struct AvoidOption {
    pub id: String,
    /// The modes it's for
    pub profiles: Vec<String>,
    pub priority: Vec<Value>,
}

#[derive(Deserialize)]
pub struct Rules {
    /// The modes it's for
    pub profiles: Vec<String>,
    pub priority: Vec<Value>,
}

pub async fn fetch(stack: &Stack) -> Result<Backend, Error> {
    stack
        .backend
        .json(stack.backend.get("/api/capabilities"))
        .await
}

impl From<Backend> for Capabilities {
    fn from(found: Backend) -> Self {
        Capabilities {
            routing: found.routing.map(|routing| Routing {
                area: routing.area,
                modes: routing.profiles,
                avoid: routing
                    .avoid
                    .into_iter()
                    .map(|a| Avoidable {
                        id: a.id,
                        modes: a.profiles,
                    })
                    .collect(),
                avoid_steep_hills: routing.steep_hills.map_or_else(Vec::new, |s| s.profiles),
            }),
            transit: found.transit,
        }
    }
}

pub async fn capabilities(stack: &Stack) -> Result<Capabilities, Error> {
    Ok(fetch(stack).await?.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passes_the_backends_answer_on() {
        let fixture = include_str!("../tests/fixtures/capabilities.json");
        let found: Capabilities = serde_json::from_str::<Backend>(fixture).unwrap().into();
        let routing = found.routing.unwrap();
        assert_eq!(routing.area.unwrap(), [112.0, -44.0, 154.0, -10.0]);
        assert_eq!(
            routing.modes,
            ["foot", "bike", "bike_paths", "racingbike", "car"]
        );
        let ids: Vec<&str> = routing.avoid.iter().map(|a| a.id.as_str()).collect();
        assert_eq!(ids, ["motorways", "tolls", "traffic_lights"]);
        assert_eq!(routing.avoid[0].modes, ["car"]);
        assert_eq!(
            routing.avoid_steep_hills,
            ["foot", "bike", "bike_paths", "racingbike"]
        );
        let transit = found.transit.unwrap();
        assert_eq!(transit.modes, ["BUS", "TRAM"]);
        assert_eq!(transit.timetables_until.as_deref(), Some("2028-01-27"));
    }

    #[test]
    fn says_which_parts_are_down() {
        let down = r#"{ "routing": null, "transit": null }"#;
        let found: Capabilities = serde_json::from_str::<Backend>(down).unwrap().into();
        assert!(found.routing.is_none() && found.transit.is_none());
    }
}
