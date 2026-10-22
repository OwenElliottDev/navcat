// What this server can plan: GraphHopper's /info, and OTP's modes, timetable dates and time zone

use std::collections::BTreeSet;

use chrono::DateTime;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::routing::{Avoid, STEEP_HILLS_NEEDS};
use crate::stack::Stack;
use crate::upstream::Error;

#[derive(Debug, Serialize, JsonSchema)]
pub struct Capabilities {
    /// The area routing covers, as [west, south, east, north]
    pub area: Vec<f64>,
    /// plan_route's modes
    pub modes: Vec<String>,
    /// What a drive can avoid here
    pub avoid: Vec<Avoid>,
    /// Whether walks and rides can avoid steep hills here
    pub avoid_steep_hills: bool,
    /// None when there are no timetables (or public transport is down)
    pub transit: Option<Transit>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct Transit {
    /// plan_transit's modes
    pub modes: Vec<String>,
    /// The timetables' time zones, for the UTC offset to give plan_transit times
    pub time_zones: Vec<String>,
    /// The first and last times the timetables have services, in UTC. Journeys outside them
    /// can only walk.
    pub timetables_from: Option<String>,
    pub timetables_until: Option<String>,
}

#[derive(Deserialize)]
struct Info {
    #[serde(default)]
    bbox: Vec<f64>,
    profiles: Vec<Profile>,
    #[serde(default)]
    encoded_values: serde_json::Map<String, Value>,
}

#[derive(Deserialize)]
struct Profile {
    name: String,
}

const TRANSIT_QUERY: &str = "{
  routes { mode }
  agencies { timezone }
  serviceTimeRange { start end }
}";

#[derive(Deserialize)]
struct TransitResponse {
    data: Option<TransitData>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransitData {
    routes: Vec<Mode>,
    agencies: Vec<Agency>,
    service_time_range: Option<TimeRange>,
}

#[derive(Deserialize)]
struct Mode {
    mode: String,
}

#[derive(Deserialize)]
struct Agency {
    timezone: String,
}

#[derive(Deserialize)]
struct TimeRange {
    start: Option<i64>,
    end: Option<i64>,
}

fn routing(info: Info) -> (Vec<f64>, Vec<String>, Vec<Avoid>, bool) {
    let has = |value: &str| info.encoded_values.contains_key(value);
    let avoid = Avoid::ALL.into_iter().filter(|a| has(a.needs())).collect();
    let steep_hills = has(STEEP_HILLS_NEEDS);
    let modes = info.profiles.into_iter().map(|p| p.name).collect();
    (info.bbox, modes, avoid, steep_hills)
}

fn utc(seconds: Option<i64>) -> Option<String> {
    Some(DateTime::from_timestamp(seconds?, 0)?.to_rfc3339())
}

fn transit(response: TransitResponse) -> Option<Transit> {
    let data = response.data?;
    let modes: BTreeSet<String> = data.routes.into_iter().map(|r| r.mode).collect();
    let zones: BTreeSet<String> = data.agencies.into_iter().map(|a| a.timezone).collect();
    let range = data.service_time_range;
    Some(Transit {
        modes: modes.into_iter().collect(),
        time_zones: zones.into_iter().collect(),
        timetables_from: utc(range.as_ref().and_then(|r| r.start)),
        timetables_until: utc(range.as_ref().and_then(|r| r.end)),
    })
}

pub async fn capabilities(stack: &Stack) -> Result<Capabilities, Error> {
    let info = stack
        .graphhopper
        .json::<Info>(stack.graphhopper.get("/info"));
    let body = json!({ "query": TRANSIT_QUERY });
    let request = stack.otp.post("/otp/gtfs/v1").json(&body);
    let timetables = stack.otp.json::<TransitResponse>(request);
    let (info, timetables) = futures::join!(info, timetables);

    let (area, modes, avoid, avoid_steep_hills) = routing(info?);
    Ok(Capabilities {
        area,
        modes,
        avoid,
        avoid_steep_hills,
        transit: timetables.ok().and_then(transit),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_routing_info() {
        let fixture = include_str!("../tests/fixtures/graphhopper_info.json");
        let (area, modes, avoid, steep_hills) = routing(serde_json::from_str(fixture).unwrap());
        assert_eq!(area, [112.0, -44.0, 154.0, -10.0]);
        assert_eq!(modes, ["foot", "bike", "bike_paths", "racingbike", "car"]);
        assert_eq!(avoid, Avoid::ALL);
        assert!(steep_hills);

        let bare = json!({ "profiles": [{ "name": "car" }], "encoded_values": { "toll": [] } });
        let (_, _, avoid, steep_hills) = routing(serde_json::from_value(bare).unwrap());
        assert_eq!(avoid, [Avoid::Tolls]);
        assert!(!steep_hills);
    }

    #[test]
    fn reads_timetables() {
        let response = json!({ "data": {
            "routes": [{ "mode": "TRAM" }, { "mode": "BUS" }, { "mode": "TRAM" }],
            "agencies": [{ "timezone": "Australia/Melbourne" }, { "timezone": "Australia/Melbourne" }],
            "serviceTimeRange": { "start": 1777032000, "end": 1832583600 },
        } });
        let transit = transit(serde_json::from_value(response).unwrap()).unwrap();
        assert_eq!(transit.modes, ["BUS", "TRAM"]);
        assert_eq!(transit.time_zones, ["Australia/Melbourne"]);
        assert_eq!(
            transit.timetables_from.as_deref(),
            Some("2026-04-24T12:00:00+00:00")
        );

        let none = json!({ "data": null, "errors": [{ "message": "x" }] });
        assert!(super::transit(serde_json::from_value(none).unwrap()).is_none());
    }
}
