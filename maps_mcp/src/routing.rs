// Street routing with GraphHopper, asked for as the app does (maps_web/src/api/routing.ts)

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::geo::Point;
use crate::stack::Stack;
use crate::upstream::Error;

pub const MAX_WAYPOINTS: usize = 10;

// CAR_AVOIDS in maps_web/src/config.ts
/// Kinds of road a drive can avoid
#[derive(Clone, Copy, Debug, PartialEq, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Avoid {
    Motorways,
    Tolls,
    Ferries,
    /// Roads at traffic lights and signalised crossings
    TrafficLights,
    /// Residential streets, service roads, tracks...
    SmallRoads,
}

impl Avoid {
    /// Its custom model condition, and how much less likely it makes those roads (not
    /// forbidden, so a route is still found when there's no other way)
    fn rule(self) -> (&'static str, f64) {
        match self {
            Avoid::Motorways => ("road_class == MOTORWAY", 0.1),
            Avoid::Tolls => ("toll == ALL", 0.1),
            Avoid::Ferries => ("road_environment == FERRY", 0.1),
            Avoid::TrafficLights => ("crossing == TRAFFIC_SIGNALS", 0.4),
            Avoid::SmallRoads => (
                "road_class == RESIDENTIAL || road_class == SERVICE || road_class == UNCLASSIFIED || road_class == LIVING_STREET || road_class == TRACK",
                0.4,
            ),
        }
    }
}

/// "Avoid steep hills" (STEEP_HILLS in maps_web/src/config.ts)
fn steep_hills() -> [Value; 3] {
    [
        json!({ "if": "max_slope >= 12 || max_slope <= -12", "multiply_by": "0.05" }),
        json!({ "else_if": "max_slope >= 8 || max_slope <= -8", "multiply_by": "0.2" }),
        json!({ "else_if": "max_slope >= 5 || max_slope <= -5", "multiply_by": "0.6" }),
    ]
}

#[derive(Default, Deserialize, JsonSchema)]
pub struct RouteOptions {
    /// For driving: kinds of road to steer away from
    #[serde(default)]
    pub avoid: Vec<Avoid>,
    /// For walking and cycling: steer away from steep hills, e.g. with a wheelchair or pram
    #[serde(default)]
    pub avoid_steep_hills: bool,
}

#[derive(Deserialize, JsonSchema)]
pub struct RouteParams {
    /// Where to go, in order: the start, any stops, and the end (2 to 10)
    pub waypoints: Vec<Point>,
    /// How to travel: "car", "foot", "bike", or a kind of cycling ("bike_paths",
    /// "racingbike", "gravel", "mtb"). For public transport use plan_transit.
    pub mode: String,
    #[serde(flatten)]
    pub options: RouteOptions,
    /// Include turn-by-turn directions
    #[serde(default)]
    pub directions: bool,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct Route {
    pub distance_km: f64,
    pub duration_min: u32,
    /// Metres climbed and descended
    pub ascent_m: u32,
    pub descent_m: u32,
    /// Each stretch between consecutive waypoints
    pub legs: Vec<Leg>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub directions: Option<Vec<Direction>>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct Leg {
    pub distance_km: f64,
    pub duration_min: u32,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct Direction {
    pub text: String,
    /// How far it goes on for
    pub distance_m: u32,
}

#[derive(Deserialize)]
struct RouteResponse {
    paths: Vec<Path>,
}

#[derive(Deserialize)]
pub struct Path {
    distance: f64,
    /// Milliseconds
    time: f64,
    #[serde(default)]
    ascend: f64,
    #[serde(default)]
    descend: f64,
    #[serde(default)]
    instructions: Vec<Instruction>,
}

#[derive(Deserialize)]
struct Instruction {
    text: String,
    distance: f64,
    /// Milliseconds
    time: f64,
    sign: i32,
}

/// GraphHopper's sign for reaching a stop on the way
const VIA_REACHED: i32 = 5;

/// Kilometres to 0.1 km
pub fn km(metres: f64) -> f64 {
    (metres / 100.0).round() / 10.0
}

/// Whole minutes, at least 1 for any time at all
pub fn minutes(seconds: f64) -> u32 {
    if seconds <= 0.0 {
        0
    } else {
        ((seconds / 60.0).round() as u32).max(1)
    }
}

/// The options as a GraphHopper custom model, None for none
pub fn custom_model(options: &RouteOptions) -> Option<Value> {
    let mut priority: Vec<Value> = options
        .avoid
        .iter()
        .map(|avoid| {
            let (condition, factor) = avoid.rule();
            json!({ "if": condition, "multiply_by": factor.to_string() })
        })
        .collect();
    if options.avoid_steep_hills {
        priority.extend(steep_hills());
    }
    (!priority.is_empty()).then(|| json!({ "priority": priority }))
}

/// GraphHopper's /route request
pub fn request_body(waypoints: &[Point], mode: &str, options: &RouteOptions) -> Value {
    let points: Vec<[f64; 2]> = waypoints.iter().map(|p| [p.lng, p.lat]).collect();
    let mut body = json!({
        "profile": mode,
        "points": points,
        "instructions": true,
        "elevation": true,
        "locale": "en",
    });
    // A custom model can't use the fast (CH) car routing; GraphHopper falls back to LM
    if let Some(model) = custom_model(options) {
        body["custom_model"] = model;
        body["ch.disable"] = json!(true);
    }
    body
}

/// The route, split into legs at each stop
pub fn summarize(path: Path, directions: bool) -> Route {
    let mut legs = Vec::new();
    let (mut metres, mut ms) = (0.0, 0.0);
    for instruction in &path.instructions {
        metres += instruction.distance;
        ms += instruction.time;
        if instruction.sign == VIA_REACHED {
            legs.push(Leg {
                distance_km: km(metres),
                duration_min: minutes(ms / 1000.0),
            });
            (metres, ms) = (0.0, 0.0);
        }
    }
    legs.push(Leg {
        distance_km: km(metres),
        duration_min: minutes(ms / 1000.0),
    });

    let directions = directions.then(|| {
        let direction = |i: &Instruction| Direction {
            text: i.text.clone(),
            distance_m: i.distance.round() as u32,
        };
        path.instructions.iter().map(direction).collect()
    });
    Route {
        distance_km: km(path.distance),
        duration_min: minutes(path.time / 1000.0),
        ascent_m: path.ascend.round() as u32,
        descent_m: path.descend.round() as u32,
        legs,
        directions,
    }
}

/// GraphHopper's best route through the waypoints
pub async fn route(
    stack: &Stack,
    waypoints: &[Point],
    mode: &str,
    options: &RouteOptions,
) -> Result<Path, Error> {
    if !(2..=MAX_WAYPOINTS).contains(&waypoints.len()) {
        let message = format!("Give 2 to {MAX_WAYPOINTS} waypoints");
        return Err(Error::invalid("bad_waypoints", message));
    }
    waypoints.iter().try_for_each(Point::check)?;
    if mode == "transit" {
        return Err(Error::invalid(
            "bad_mode",
            "For public transport use plan_transit",
        ));
    }
    let body = request_body(waypoints, mode, options);
    let request = stack.graphhopper.post("/route").json(&body);
    let response: RouteResponse = stack.graphhopper.json(request).await?;
    response
        .paths
        .into_iter()
        .next()
        .ok_or_else(|| Error::invalid("no_route", "No route found"))
}

pub async fn plan_route(stack: &Stack, params: RouteParams) -> Result<Route, Error> {
    let path = route(stack, &params.waypoints, &params.mode, &params.options).await?;
    Ok(summarize(path, params.directions))
}

#[cfg(test)]
mod tests {
    use super::*;

    const POINTS: [Point; 2] = [
        Point {
            lat: -37.8,
            lng: 144.9,
        },
        Point {
            lat: -37.7,
            lng: 145.0,
        },
    ];

    #[test]
    fn asks_like_the_app() {
        let plain = request_body(&POINTS, "foot", &RouteOptions::default());
        assert_eq!(plain["profile"], "foot");
        assert_eq!(plain["points"], json!([[144.9, -37.8], [145.0, -37.7]]));
        assert!(plain.get("custom_model").is_none());
        assert!(plain.get("ch.disable").is_none());

        let tolls = RouteOptions {
            avoid: vec![Avoid::Tolls],
            avoid_steep_hills: false,
        };
        let body = request_body(&POINTS, "car", &tolls);
        let rule = json!({ "if": "toll == ALL", "multiply_by": "0.1" });
        assert_eq!(body["custom_model"], json!({ "priority": [rule] }));
        assert_eq!(body["ch.disable"], json!(true));

        let hills = RouteOptions {
            avoid: vec![],
            avoid_steep_hills: true,
        };
        let body = request_body(&POINTS, "bike", &hills);
        assert_eq!(
            body["custom_model"]["priority"].as_array().unwrap().len(),
            3
        );
    }

    #[test]
    fn summarizes_a_route() {
        let fixture = include_str!("../tests/fixtures/graphhopper_route.json");
        let response: RouteResponse = serde_json::from_str(fixture).unwrap();
        let route = summarize(response.paths.into_iter().next().unwrap(), true);
        assert_eq!(route.distance_km, 1.6);
        assert_eq!(route.duration_min, 19);
        assert_eq!((route.ascent_m, route.descent_m), (16, 2));
        assert_eq!(route.legs.len(), 1);
        let directions = route.directions.unwrap();
        assert_eq!(directions[1].text, "Turn right onto Elizabeth Street");
        assert_eq!(directions[1].distance_m, 1240);
    }

    #[test]
    fn splits_legs_at_stops() {
        let step = |distance: f64, sign: i32| Instruction {
            text: String::new(),
            distance,
            time: distance * 100.0,
            sign,
        };
        let path = Path {
            distance: 3000.0,
            time: 300_000.0,
            ascend: 0.0,
            descend: 0.0,
            instructions: vec![
                step(1000.0, 0),
                step(0.0, VIA_REACHED),
                step(2000.0, 2),
                step(0.0, 4),
            ],
        };
        let route = summarize(path, false);
        assert_eq!(route.legs.len(), 2);
        assert_eq!(route.legs[0].distance_km, 1.0);
        assert_eq!(route.legs[1].duration_min, 3);
        assert!(route.directions.is_none());
    }

    #[test]
    fn rounds() {
        assert_eq!(km(1649.0), 1.6);
        assert_eq!(minutes(20.0), 1);
        assert_eq!(minutes(0.0), 0);
        assert_eq!(minutes(150.0), 3);
    }
}
