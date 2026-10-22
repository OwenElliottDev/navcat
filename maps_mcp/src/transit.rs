// Public transport journeys from OpenTripPlanner's GTFS GraphQL API, planned as the app does
// (maps_web/src/api/transit.ts) without the geometry and street steps

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use chrono_tz::Tz;

use crate::geo::Point;
use crate::otp;
use crate::routing::{km, minutes};
use crate::stack::Stack;
use crate::time;
use crate::upstream::Error;

const PLAN_QUERY: &str = "
  query Plan(
    $from: PlanCoordinateInput!
    $to: PlanCoordinateInput!
    $dateTime: PlanDateTimeInput
    $modes: PlanModesInput
    $first: Int
  ) {
    planConnection(
      origin: { location: { coordinate: $from } }
      destination: { location: { coordinate: $to } }
      dateTime: $dateTime
      modes: $modes
      first: $first
    ) {
      routingErrors { code }
      edges {
        node {
          start
          end
          duration
          legs {
            mode
            transitLeg
            headsign
            distance
            duration
            start { scheduledTime estimated { time } }
            end { scheduledTime estimated { time } }
            from { name }
            to { name }
            route { shortName longName }
          }
        }
      }
    }
  }
";

/// A kind of public transport
#[derive(Clone, Copy, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TransitMode {
    Airplane,
    Bus,
    CableCar,
    Coach,
    Ferry,
    Funicular,
    Gondola,
    Monorail,
    Rail,
    Subway,
    Tram,
    Trolleybus,
}

#[derive(Deserialize, JsonSchema)]
pub struct TransitParams {
    pub from: Point,
    pub to: Point,
    /// Leave at or after this local time where the journey starts, e.g. "2026-10-24T08:30".
    /// Leaves now if neither this nor arrive_by is given.
    pub depart_at: Option<String>,
    /// Arrive by this local time instead
    pub arrive_by: Option<String>,
    /// Only these kinds of transport; any by default
    pub modes: Option<Vec<TransitMode>>,
    /// How many journeys to give (1 to 5, default 3)
    pub max_options: Option<u8>,
    /// Leave out walking the whole way, which OTP otherwise offers first when it's quicker
    #[serde(skip)]
    #[schemars(skip)]
    pub transit_only: bool,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct Journeys {
    /// As OpenTripPlanner orders them
    pub journeys: Vec<Journey>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct Journey {
    /// Local times where the journey starts, as are all its times
    pub depart: String,
    pub arrive: String,
    pub duration_min: u32,
    pub transfers: u32,
    pub walk_km: f64,
    pub legs: Vec<TransitLeg>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct TransitLeg {
    /// WALK, BUS, RAIL, TRAM, FERRY...
    pub mode: String,
    /// The route's number or name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route: Option<String>,
    /// Where the service is heading
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headsign: Option<String>,
    pub from: String,
    pub to: String,
    pub depart: String,
    pub arrive: String,
    pub duration_min: u32,
    pub distance_km: f64,
}

// ---------- OTP's answer ----------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlanData {
    plan_connection: PlanConnection,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlanConnection {
    routing_errors: Vec<RoutingError>,
    edges: Vec<Edge>,
}

#[derive(Deserialize)]
struct RoutingError {
    code: String,
}

#[derive(Deserialize)]
struct Edge {
    node: Itinerary,
}

#[derive(Deserialize)]
struct Itinerary {
    start: String,
    end: String,
    duration: f64,
    legs: Vec<OtpLeg>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OtpLeg {
    mode: String,
    transit_leg: bool,
    headsign: Option<String>,
    distance: f64,
    duration: f64,
    start: OtpTime,
    end: OtpTime,
    from: Named,
    to: Named,
    route: Option<otp::Route>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OtpTime {
    scheduled_time: String,
    estimated: Option<Estimated>,
}

#[derive(Deserialize)]
struct Estimated {
    time: String,
}

impl OtpTime {
    /// Live time when there is one, otherwise the timetable
    fn time(self) -> String {
        self.estimated.map_or(self.scheduled_time, |e| e.time)
    }
}

#[derive(Deserialize)]
struct Named {
    name: Option<String>,
}

fn variables(params: &TransitParams) -> Result<Value, Error> {
    let mut variables = json!({
        "from": { "latitude": params.from.lat, "longitude": params.from.lng },
        "to": { "latitude": params.to.lat, "longitude": params.to.lng },
        "first": params.max_options.unwrap_or(3).clamp(1, 5),
    });
    match (&params.depart_at, &params.arrive_by) {
        (Some(_), Some(_)) => {
            let message = "Give depart_at or arrive_by, not both";
            return Err(Error::invalid("bad_time", message));
        }
        (Some(at), None) => {
            let at = time::parse(at, params.from)?.to_rfc3339();
            variables["dateTime"] = json!({ "earliestDeparture": at });
        }
        (None, Some(by)) => {
            let by = time::parse(by, params.from)?.to_rfc3339();
            variables["dateTime"] = json!({ "latestArrival": by });
        }
        (None, None) => {}
    }
    if params.transit_only {
        variables["modes"] = json!({ "transitOnly": true });
    }
    if let Some(modes) = &params.modes {
        if modes.is_empty() {
            let message = "Leave modes out for any kind of transport";
            return Err(Error::invalid("bad_modes", message));
        }
        let modes: Vec<Value> = modes.iter().map(|mode| json!({ "mode": mode })).collect();
        variables["modes"]["transit"] = json!({ "transit": modes });
    }
    Ok(variables)
}

fn journeys(data: PlanData, origin: Point) -> Result<Journeys, Error> {
    let PlanConnection {
        routing_errors,
        edges,
    } = data.plan_connection;
    if edges.is_empty() {
        let code = routing_errors
            .first()
            .map_or("NO_TRANSIT_CONNECTION", |e| &e.code);
        let message = format!("No public transport journey found ({code})");
        return Err(Error::invalid("no_journey", message));
    }

    let zone = time::zone(origin);
    let journey = |Edge { node }: Edge| {
        let rides = node.legs.iter().filter(|leg| leg.transit_leg).count() as u32;
        let walks = node.legs.iter().filter(|leg| leg.mode == "WALK");
        let walked: f64 = walks.map(|leg| leg.distance).sum();
        Journey {
            depart: time::local_otp(&node.start, zone),
            arrive: time::local_otp(&node.end, zone),
            duration_min: minutes(node.duration),
            transfers: rides.saturating_sub(1),
            walk_km: km(walked),
            legs: node.legs.into_iter().map(|l| leg(l, zone)).collect(),
        }
    };
    Ok(Journeys {
        journeys: edges.into_iter().map(journey).collect(),
    })
}

fn leg(leg: OtpLeg, zone: Tz) -> TransitLeg {
    TransitLeg {
        route: leg.route.and_then(|r| r.label()),
        mode: leg.mode,
        headsign: leg.headsign,
        from: leg.from.name.unwrap_or_default(),
        to: leg.to.name.unwrap_or_default(),
        depart: time::local_otp(&leg.start.time(), zone),
        arrive: time::local_otp(&leg.end.time(), zone),
        duration_min: minutes(leg.duration),
        distance_km: km(leg.distance),
    }
}

pub async fn plan(stack: &Stack, params: TransitParams) -> Result<Journeys, Error> {
    params.from.check()?;
    params.to.check()?;
    let data = otp::query(stack, PLAN_QUERY, variables(&params)?).await?;
    journeys(data, params.from)
}

#[cfg(test)]
mod tests {
    use super::*;

    const FLINDERS_STREET: Point = Point {
        lat: -37.81827,
        lng: 144.96706,
    };

    fn fixture() -> PlanData {
        let response: Value =
            serde_json::from_str(include_str!("../tests/fixtures/otp_plan.json")).unwrap();
        serde_json::from_value(response["data"].clone()).unwrap()
    }

    fn params() -> TransitParams {
        TransitParams {
            from: FLINDERS_STREET,
            to: FLINDERS_STREET,
            depart_at: None,
            arrive_by: None,
            modes: None,
            max_options: None,
            transit_only: false,
        }
    }

    #[test]
    fn summarizes_journeys() {
        let journeys = journeys(fixture(), FLINDERS_STREET).unwrap().journeys;
        assert_eq!(journeys.len(), 2);
        let tram = &journeys[0];
        assert_eq!(tram.depart, "2026-10-12T08:05");
        assert_eq!(tram.duration_min, 19);
        assert_eq!(tram.transfers, 0);
        assert_eq!(tram.walk_km, 0.4);
        let ride = &tram.legs[1];
        assert_eq!(ride.mode, "TRAM");
        assert_eq!(ride.route.as_deref(), Some("19"));
        assert_eq!(ride.headsign.as_deref(), Some("North Coburg"));
        assert_eq!(ride.depart, "2026-10-12T08:10");
        assert_eq!(ride.duration_min, 10);
        // No short name, so the long one
        assert_eq!(journeys[1].legs[1].route.as_deref(), Some("Craigieburn"));
    }

    #[test]
    fn gives_local_times_where_the_journey_starts() {
        let perth = Point {
            lat: -31.9523,
            lng: 115.8613,
        };
        let journeys = journeys(fixture(), perth).unwrap().journeys;
        assert_eq!(journeys[0].depart, "2026-10-12T05:05");
        assert_eq!(journeys[0].legs[1].arrive, "2026-10-12T05:20");
    }

    #[test]
    fn explains_no_journey() {
        let response = json!({ "planConnection": {
            "routingErrors": [{ "code": "OUTSIDE_SERVICE_PERIOD" }],
            "edges": [],
        } });
        let response: PlanData = serde_json::from_value(response).unwrap();
        let error = journeys(response, FLINDERS_STREET).unwrap_err().to_string();
        assert!(error.contains("OUTSIDE_SERVICE_PERIOD"), "{error}");
    }

    #[test]
    fn asks_like_the_app() {
        let vars = variables(&params()).unwrap();
        assert_eq!(
            vars["from"],
            json!({ "latitude": -37.81827, "longitude": 144.96706 })
        );
        assert_eq!(vars["first"], 3);
        assert!(vars.get("dateTime").is_none());

        let by = TransitParams {
            arrive_by: Some("2026-10-12T08:00".into()),
            modes: Some(vec![TransitMode::Tram, TransitMode::CableCar]),
            ..params()
        };
        let vars = variables(&by).unwrap();
        let latest = json!({ "latestArrival": "2026-10-12T08:00:00+11:00" });
        assert_eq!(vars["dateTime"], latest);
        let modes = json!([{ "mode": "TRAM" }, { "mode": "CABLE_CAR" }]);
        assert_eq!(vars["modes"], json!({ "transit": { "transit": modes } }));
    }

    #[test]
    fn can_leave_out_walking_the_whole_way() {
        let only = TransitParams {
            transit_only: true,
            modes: Some(vec![TransitMode::Tram]),
            ..params()
        };
        let modes = &variables(&only).unwrap()["modes"];
        assert_eq!(modes["transitOnly"], json!(true));
        assert_eq!(modes["transit"], json!({ "transit": [{ "mode": "TRAM" }] }));
    }

    #[test]
    fn needs_one_time() {
        let both = TransitParams {
            depart_at: Some("2026-10-12T08:00:00+11:00".into()),
            arrive_by: Some("2026-10-12T09:00:00+11:00".into()),
            ..params()
        };
        assert!(variables(&both).is_err());
    }
}
