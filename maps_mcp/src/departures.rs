// The next departures from public transport stops, found by name or near a point, from
// OpenTripPlanner's GTFS GraphQL API. Each platform or direction is a stop of its own.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};

use chrono_tz::Tz;

use crate::geo::Point;
use crate::links::links;
use crate::otp;
use crate::stack::Stack;
use crate::time;
use crate::upstream::Error;

const MAX_STOPS: usize = 6;
const MAX_DEPARTURES: u8 = 5;
const MAX_RADIUS_M: u32 = 1000;

#[derive(Deserialize, JsonSchema)]
pub struct DeparturesParams {
    /// Part of the stop's name as the timetables have it, e.g. "Albert St/Nicholson St" or
    /// "Flinders Street Station"
    pub stop: Option<String>,
    /// Stops near here, e.g. a stop's point from search_places. With `stop`, only stops
    /// with that in their name.
    pub near: Option<Point>,
    /// How far from `near` to look, in metres (up to 1000, default 300)
    pub radius_m: Option<u32>,
    /// Only stops served by these kinds of transport
    pub modes: Option<Vec<String>>,
    /// Departures at or after this local time, e.g. "2026-10-24T08:30"; now by default
    pub after: Option<String>,
    /// Departures per stop (1 to 5, default 3)
    pub count: Option<u8>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct Departures {
    /// Nearest first when `near` is given. Each platform or direction is a separate stop.
    pub stops: Vec<Stop>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct Stop {
    pub name: String,
    /// The number on the stop's sign
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    /// What serves it: TRAM, BUS, RAIL...
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
    pub lat: f64,
    pub lng: f64,
    /// Metres from `near`
    #[serde(skip_serializing_if = "Option::is_none")]
    pub distance_m: Option<u32>,
    /// Opens Nav Cat at the stop
    pub link: String,
    /// The time now at the stop, to tell how long until each departure
    pub now: String,
    pub departures: Vec<Departure>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct Departure {
    /// Local time at the stop
    pub time: String,
    /// The route's number or name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
    /// Where it's heading
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headsign: Option<String>,
    /// From live tracking rather than the timetable
    pub live: bool,
}

// ---------- OTP's answers ----------

const BY_NAME: &str = "query($name: String!) {
  stops(name: $name) { gtfsId name code lat lon vehicleMode }
}";

const NEAR: &str = "query($lat: Float!, $lon: Float!, $radius: Int!, $modes: [Mode]) {
  nearest(lat: $lat, lon: $lon, maxDistance: $radius, filterByPlaceTypes: [STOP],
          filterByModes: $modes, first: 30) {
    edges { node { distance place { ... on Stop { gtfsId name code lat lon vehicleMode } } } }
  }
}";

#[derive(Deserialize)]
struct ByName {
    stops: Vec<OtpStop>,
}

#[derive(Deserialize)]
struct Near {
    nearest: Connection,
}

#[derive(Deserialize)]
struct Connection {
    edges: Vec<Edge>,
}

#[derive(Deserialize)]
struct Edge {
    node: Node,
}

#[derive(Deserialize)]
struct Node {
    distance: f64,
    /// Null for places that aren't stops
    place: Option<OtpStop>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OtpStop {
    gtfs_id: String,
    name: String,
    code: Option<String>,
    lat: f64,
    lon: f64,
    vehicle_mode: Option<String>,
}

impl OtpStop {
    fn at(&self) -> Point {
        Point {
            lat: self.lat,
            lng: self.lon,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StopTimes {
    stoptimes_without_patterns: Vec<StopTime>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StopTime {
    /// Midnight at the start of the service day, in seconds since 1970
    service_day: i64,
    /// Seconds after the service day's midnight
    realtime_departure: i64,
    realtime: Option<bool>,
    headsign: Option<String>,
    trip: Option<Trip>,
}

#[derive(Deserialize)]
struct Trip {
    route: otp::Route,
}

/// Stops by name, near a point, or both, with their distance from it
async fn find_stops(
    stack: &Stack,
    params: &DeparturesParams,
) -> Result<Vec<(OtpStop, Option<f64>)>, Error> {
    let name = params
        .stop
        .as_deref()
        .map(str::trim)
        .filter(|n| !n.is_empty());
    let modes = &params.modes;
    let served = |stop: &OtpStop| match (modes, &stop.vehicle_mode) {
        (Some(modes), Some(mode)) => modes.contains(mode),
        _ => true,
    };

    let mut found: Vec<(OtpStop, Option<f64>)> = match (name, params.near) {
        (None, None) => {
            let message = "Give a stop name, a point it's near, or both";
            return Err(Error::invalid("no_stop", message));
        }
        (Some(name), None) => {
            let found: ByName = otp::query(stack, BY_NAME, json!({ "name": name })).await?;
            found
                .stops
                .into_iter()
                .filter(served)
                .map(|s| (s, None))
                .collect()
        }
        (name, Some(near)) => {
            near.check()?;
            let radius = params.radius_m.unwrap_or(300).clamp(1, MAX_RADIUS_M);
            let variables = json!({
                "lat": near.lat, "lon": near.lng, "radius": radius, "modes": modes,
            });
            let found: Near = otp::query(stack, NEAR, variables).await?;
            let named = |stop: &OtpStop| {
                name.is_none_or(|n| stop.name.to_lowercase().contains(&n.to_lowercase()))
            };
            let edges = found.nearest.edges.into_iter();
            let stops = edges.filter_map(|e| Some((e.node.place?, Some(e.node.distance))));
            stops.filter(|(stop, _)| named(stop)).collect()
        }
    };
    found.truncate(MAX_STOPS);
    Ok(found)
}

/// One request for every stop's departures, each from its own start time
fn departures_query(starts: &[Option<i64>], count: u8) -> String {
    let mut variables = Vec::new();
    let mut fields = Vec::new();
    for (i, start) in starts.iter().enumerate() {
        variables.push(format!("$s{i}: String!"));
        let start = start.map_or(String::new(), |t| format!("startTime: {t}, "));
        fields.push(format!(
            "s{i}: stop(id: $s{i}) {{ stoptimesWithoutPatterns({start}numberOfDepartures: \
            {count}, omitNonPickups: true) {{ serviceDay realtimeDeparture realtime headsign \
            trip {{ route {{ shortName longName mode }} }} }} }}"
        ));
    }
    format!("query({}) {{ {} }}", variables.join(", "), fields.join(" "))
}

fn departure(time: StopTime, zone: Tz) -> Departure {
    let route = time.trip.map(|t| t.route);
    let seconds = time.service_day + time.realtime_departure;
    Departure {
        time: time::local_epoch(seconds, zone).unwrap_or_default(),
        route: route.as_ref().and_then(otp::Route::label),
        mode: route.and_then(|r| r.mode),
        headsign: time.headsign,
        live: time.realtime.unwrap_or(false),
    }
}

pub async fn departures(stack: &Stack, params: DeparturesParams) -> Result<Departures, Error> {
    let count = params.count.unwrap_or(3).clamp(1, MAX_DEPARTURES);
    let found = find_stops(stack, &params).await?;
    if found.is_empty() {
        return Err(Error::invalid("no_stop", "No public transport stop found"));
    }
    let starts = found
        .iter()
        .map(|(stop, _)| match &params.after {
            Some(after) => time::parse(after, stop.at()).map(|t| Some(t.timestamp())),
            None => Ok(None),
        })
        .collect::<Result<Vec<_>, _>>()?;
    let variables: Map<String, Value> = found
        .iter()
        .enumerate()
        .map(|(i, (stop, _))| (format!("s{i}"), json!(stop.gtfs_id)))
        .collect();
    let query = departures_query(&starts, count);
    let times = otp::query::<Map<String, Value>>(stack, &query, Value::Object(variables));
    let links = links(stack, found.iter().map(|(stop, _)| stop.at()));
    let (mut times, links) = futures::try_join!(times, links)?;

    let stops = found
        .into_iter()
        .zip(links)
        .enumerate()
        .map(|(i, ((stop, distance), link))| {
            let zone = time::zone(stop.at());
            let times = times.remove(&format!("s{i}")).unwrap_or_default();
            let times: Option<StopTimes> = serde_json::from_value(times).ok();
            let times = times.map_or_else(Vec::new, |t| t.stoptimes_without_patterns);
            Stop {
                name: stop.name,
                code: stop.code,
                mode: stop.vehicle_mode,
                lat: stop.lat,
                lng: stop.lon,
                distance_m: distance.map(|d| d.round() as u32),
                link,
                now: time::now(zone),
                departures: times.into_iter().map(|t| departure(t, zone)).collect(),
            }
        })
        .collect();
    Ok(Departures { stops })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn asks_for_each_stops_departures() {
        let query = departures_query(&[Some(1792641600), None], 3);
        assert!(query.starts_with("query($s0: String!, $s1: String!) {"));
        assert!(query.contains("s0: stop(id: $s0) { stoptimesWithoutPatterns(startTime: 1792641600, numberOfDepartures: 3,"));
        assert!(
            query.contains("s1: stop(id: $s1) { stoptimesWithoutPatterns(numberOfDepartures: 3,")
        );
    }

    #[test]
    fn gives_departures_in_local_time() {
        // A Melbourne tram, timetabled by OTP in its graph's Auckland time
        let time: StopTime = serde_json::from_value(json!({
            "serviceDay": 1792580400,
            "realtimeDeparture": 61200,
            "realtime": false,
            "headsign": "Waterfront City Docklands",
            "trip": { "route": { "shortName": "86", "longName": "Bundoora RMIT - Waterfront City Docklands", "mode": "TRAM" } },
        }))
        .unwrap();
        let at = Point {
            lat: -37.8096665,
            lng: 144.9729262,
        };
        let departure = departure(time, time::zone(at));
        assert_eq!(departure.time, "2026-10-22T15:00");
        assert_eq!(departure.route.as_deref(), Some("86"));
        assert!(!departure.live);
    }

    #[tokio::test]
    async fn needs_a_stop_or_a_point() {
        let stack = Stack::new(&crate::config::Config::from_env().unwrap());
        let params = DeparturesParams {
            stop: Some("  ".into()),
            near: None,
            radius_m: None,
            modes: None,
            after: None,
            count: None,
        };
        let error = departures(&stack, params).await.unwrap_err().to_string();
        assert!(error.contains("no_stop"), "{error}");
    }
}
