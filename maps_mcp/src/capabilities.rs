// What this server can plan: GraphHopper's /info, and OTP's modes and timetable dates

use std::collections::BTreeSet;

use chrono::DateTime;
use chrono_tz::Tz;
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
    /// The first and last days the timetables have services, e.g. "2026-10-24". Journeys
    /// outside them can only walk.
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

/// A day in the graph's time zone, which OTP's service days are in
fn day(seconds: Option<i64>, zone: Tz) -> Option<String> {
    let time = DateTime::from_timestamp(seconds?, 0)?.with_timezone(&zone);
    Some(time.format("%Y-%m-%d").to_string())
}

fn transit(response: TransitResponse) -> Option<Transit> {
    let data = response.data?;
    let modes: BTreeSet<String> = data.routes.into_iter().map(|r| r.mode).collect();
    // Every feed is in the graph's zone (docker_maps/download/transit_prepare.py)
    let zone = data.agencies.first().and_then(|a| a.timezone.parse().ok());
    let zone = zone.unwrap_or(Tz::UTC);
    let range = data.service_time_range;
    Some(Transit {
        modes: modes.into_iter().collect(),
        timetables_from: day(range.as_ref().and_then(|r| r.start), zone),
        // The range ends at midnight after the last day
        timetables_until: day(range.as_ref().and_then(|r| r.end).map(|end| end - 1), zone),
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
            "agencies": [{ "timezone": "Pacific/Auckland" }, { "timezone": "Pacific/Auckland" }],
            "serviceTimeRange": { "start": 1777032000, "end": 1832583600 },
        } });
        let transit = transit(serde_json::from_value(response).unwrap()).unwrap();
        assert_eq!(transit.modes, ["BUS", "TRAM"]);
        assert_eq!(transit.timetables_from.as_deref(), Some("2026-04-25"));
        assert_eq!(transit.timetables_until.as_deref(), Some("2028-01-27"));

        let none = json!({ "data": null, "errors": [{ "message": "x" }] });
        assert!(super::transit(serde_json::from_value(none).unwrap()).is_none());
    }
}
