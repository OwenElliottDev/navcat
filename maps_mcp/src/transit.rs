// Public transport journeys from OpenTripPlanner's GTFS GraphQL API, planned as the app does
// (maps_web/src/api/transit.ts) without the geometry and street steps

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::geo::Point;
use crate::routing::{km, minutes};
use crate::stack::Stack;
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
    /// Leave at or after this time, with its UTC offset, e.g. "2026-10-23T08:30:00+13:00".
    /// Leaves now if neither this nor arrive_by is given.
    pub depart_at: Option<String>,
    /// Arrive by this time, with its UTC offset
    pub arrive_by: Option<String>,
    /// Only these kinds of transport; any by default
    pub modes: Option<Vec<TransitMode>>,
    /// How many journeys to give (1 to 5, default 3)
    pub max_options: Option<u8>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct Journeys {
    /// As OpenTripPlanner orders them
    pub journeys: Vec<Journey>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct Journey {
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
struct PlanResponse {
    data: Option<PlanData>,
    #[serde(default)]
    errors: Vec<GraphQlError>,
}

#[derive(Deserialize)]
struct GraphQlError {
    message: String,
}

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
    route: Option<OtpRoute>,
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OtpRoute {
    short_name: Option<String>,
    long_name: Option<String>,
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
        (Some(at), None) => variables["dateTime"] = json!({ "earliestDeparture": at }),
        (None, Some(by)) => variables["dateTime"] = json!({ "latestArrival": by }),
        (None, None) => {}
    }
    if let Some(modes) = &params.modes {
        if modes.is_empty() {
            let message = "Leave modes out for any kind of transport";
            return Err(Error::invalid("bad_modes", message));
        }
        let modes: Vec<Value> = modes.iter().map(|mode| json!({ "mode": mode })).collect();
        variables["modes"] = json!({ "transit": { "transit": modes } });
    }
    Ok(variables)
}

fn journeys(response: PlanResponse) -> Result<Journeys, Error> {
    let Some(data) = response.data else {
        let message = response.errors.into_iter().next();
        let message = message.map_or("planning failed".into(), |e| e.message);
        return Err(Error::Rejected("Public transport", message));
    };
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

    let journey = |Edge { node }: Edge| {
        let rides = node.legs.iter().filter(|leg| leg.transit_leg).count() as u32;
        let walks = node.legs.iter().filter(|leg| leg.mode == "WALK");
        let walked: f64 = walks.map(|leg| leg.distance).sum();
        Journey {
            depart: node.start,
            arrive: node.end,
            duration_min: minutes(node.duration),
            transfers: rides.saturating_sub(1),
            walk_km: km(walked),
            legs: node.legs.into_iter().map(leg).collect(),
        }
    };
    Ok(Journeys {
        journeys: edges.into_iter().map(journey).collect(),
    })
}

fn leg(leg: OtpLeg) -> TransitLeg {
    let named = |name: Option<String>| name.filter(|n| !n.is_empty());
    TransitLeg {
        route: leg
            .route
            .and_then(|r| named(r.short_name).or(named(r.long_name))),
        mode: leg.mode,
        headsign: leg.headsign,
        from: leg.from.name.unwrap_or_default(),
        to: leg.to.name.unwrap_or_default(),
        depart: leg.start.time(),
        arrive: leg.end.time(),
        duration_min: minutes(leg.duration),
        distance_km: km(leg.distance),
    }
}

pub async fn plan(stack: &Stack, params: TransitParams) -> Result<Journeys, Error> {
    params.from.check()?;
    params.to.check()?;
    let body = json!({ "query": PLAN_QUERY, "variables": variables(&params)? });
    let request = stack.otp.post("/otp/gtfs/v1").json(&body);
    journeys(stack.otp.json(request).await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    const FLINDERS_STREET: Point = Point {
        lat: -37.81827,
        lng: 144.96706,
    };

    fn fixture() -> PlanResponse {
        serde_json::from_str(include_str!("../tests/fixtures/otp_plan.json")).unwrap()
    }

    fn params() -> TransitParams {
        TransitParams {
            from: FLINDERS_STREET,
            to: FLINDERS_STREET,
            depart_at: None,
            arrive_by: None,
            modes: None,
            max_options: None,
        }
    }

    #[test]
    fn summarizes_journeys() {
        let journeys = journeys(fixture()).unwrap().journeys;
        assert_eq!(journeys.len(), 2);
        let tram = &journeys[0];
        assert_eq!(tram.depart, "2026-10-12T08:05:00+11:00");
        assert_eq!(tram.duration_min, 19);
        assert_eq!(tram.transfers, 0);
        assert_eq!(tram.walk_km, 0.4);
        let ride = &tram.legs[1];
        assert_eq!(ride.mode, "TRAM");
        assert_eq!(ride.route.as_deref(), Some("19"));
        assert_eq!(ride.headsign.as_deref(), Some("North Coburg"));
        assert_eq!(ride.depart, "2026-10-12T08:10:00+11:00");
        assert_eq!(ride.duration_min, 10);
        // No short name, so the long one
        assert_eq!(journeys[1].legs[1].route.as_deref(), Some("Craigieburn"));
    }

    #[test]
    fn explains_no_journey() {
        let response = json!({ "data": { "planConnection": {
            "routingErrors": [{ "code": "OUTSIDE_SERVICE_PERIOD" }],
            "edges": [],
        } } });
        let response: PlanResponse = serde_json::from_value(response).unwrap();
        let error = journeys(response).unwrap_err().to_string();
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
            arrive_by: Some("2026-10-12T08:00:00+11:00".into()),
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
    fn needs_one_time() {
        let both = TransitParams {
            depart_at: Some("2026-10-12T08:00:00+11:00".into()),
            arrive_by: Some("2026-10-12T09:00:00+11:00".into()),
            ..params()
        };
        assert!(variables(&both).is_err());
    }
}
