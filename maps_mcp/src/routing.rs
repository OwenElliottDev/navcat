// Street routing with GraphHopper, asked for as the app does (maps_web/src/api/routing.ts)

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::capabilities::{self, BackendRouting};
use crate::geo::Point;
use crate::stack::Stack;
use crate::upstream::Error;

pub const MAX_WAYPOINTS: usize = 10;

#[derive(Default, Deserialize, JsonSchema)]
pub struct RouteOptions {
    /// For driving: kinds of road to steer away from
    #[serde(default)]
    pub avoid: Vec<String>,
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

/// The options' GraphHopper rules, from the backend (none without options)
pub async fn rules(stack: &Stack, options: &RouteOptions) -> Result<Vec<Value>, Error> {
    if options.avoid.is_empty() && !options.avoid_steep_hills {
        return Ok(Vec::new());
    }
    let found = capabilities::fetch(stack).await?;
    let routing = found
        .routing
        .ok_or(Error::Unavailable(stack.graphhopper.name))?;
    pick_rules(routing, options)
}

fn pick_rules(routing: BackendRouting, options: &RouteOptions) -> Result<Vec<Value>, Error> {
    let mut rules = Vec::new();
    for name in &options.avoid {
        let Some(option) = routing.avoid.iter().find(|a| &a.id == name) else {
            let offered: Vec<&str> = routing.avoid.iter().map(|a| a.id.as_str()).collect();
            let message = format!(
                "Can't avoid {name:?} here; it can avoid: {}",
                offered.join(", ")
            );
            return Err(Error::invalid("bad_avoid", message));
        };
        rules.extend(option.priority.iter().cloned());
    }
    if options.avoid_steep_hills {
        let Some(steep) = routing.steep_hills else {
            let message = "Avoiding steep hills isn't available here (no slope data)";
            return Err(Error::invalid("bad_avoid", message));
        };
        rules.extend(steep.priority);
    }
    Ok(rules)
}

/// GraphHopper's /route request. Without `detail`, only the distance and time: no
/// directions (or legs), geometry or climbing.
pub fn request_body(waypoints: &[Point], mode: &str, rules: Vec<Value>, detail: bool) -> Value {
    let points: Vec<[f64; 2]> = waypoints.iter().map(|p| [p.lng, p.lat]).collect();
    let mut body = json!({
        "profile": mode,
        "points": points,
        "instructions": detail,
        "elevation": detail,
        "calc_points": detail,
        "locale": "en",
    });
    // A custom model can't use the fast (CH) car routing; GraphHopper falls back to LM
    if !rules.is_empty() {
        body["custom_model"] = json!({ "priority": rules });
        body["ch.disable"] = json!(true);
    }
    body
}

/// The route, split into legs at each stop
pub fn summarize(path: Path, directions: bool) -> Route {
    let leg = |metres: f64, ms: f64| Leg {
        distance_km: km(metres),
        duration_min: minutes(ms / 1000.0),
    };
    let mut legs = Vec::new();
    let (mut metres, mut ms) = (0.0, 0.0);
    for instruction in &path.instructions {
        metres += instruction.distance;
        ms += instruction.time;
        if instruction.sign == VIA_REACHED {
            legs.push(leg(metres, ms));
            (metres, ms) = (0.0, 0.0);
        }
    }
    legs.push(leg(metres, ms));

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
    detail: bool,
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
    let rules = rules(stack, options).await?;
    let body = request_body(waypoints, mode, rules, detail);
    let request = stack.graphhopper.post("/route").json(&body);
    let response: RouteResponse = stack.graphhopper.json(request).await?;
    response
        .paths
        .into_iter()
        .next()
        .ok_or_else(|| Error::invalid("no_route", "No route found"))
}

pub async fn plan_route(stack: &Stack, params: RouteParams) -> Result<Route, Error> {
    let path = route(
        stack,
        &params.waypoints,
        &params.mode,
        &params.options,
        true,
    )
    .await?;
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

    fn routing() -> BackendRouting {
        let fixture = include_str!("../tests/fixtures/capabilities.json");
        let found: capabilities::Backend = serde_json::from_str(fixture).unwrap();
        found.routing.unwrap()
    }

    #[test]
    fn asks_like_the_app() {
        let plain = request_body(&POINTS, "foot", vec![], true);
        assert_eq!(plain["profile"], "foot");
        assert_eq!(plain["points"], json!([[144.9, -37.8], [145.0, -37.7]]));
        assert!(plain.get("custom_model").is_none());
        assert!(plain.get("ch.disable").is_none());
        let light = request_body(&POINTS, "foot", vec![], false);
        assert_eq!(light["calc_points"], json!(false));
        assert_eq!(light["instructions"], json!(false));

        let rule = json!({ "if": "toll == ALL", "multiply_by": "0.1" });
        let body = request_body(&POINTS, "car", vec![rule.clone()], true);
        assert_eq!(body["custom_model"], json!({ "priority": [rule] }));
        assert_eq!(body["ch.disable"], json!(true));
    }

    #[test]
    fn uses_the_backends_rules() {
        let tolls = RouteOptions {
            avoid: vec!["tolls".into()],
            avoid_steep_hills: false,
        };
        let rule = json!({ "if": "toll == ALL", "multiply_by": "0.1" });
        assert_eq!(pick_rules(routing(), &tolls).unwrap(), [rule]);

        let hills = RouteOptions {
            avoid: vec![],
            avoid_steep_hills: true,
        };
        assert_eq!(pick_rules(routing(), &hills).unwrap().len(), 3);
    }

    #[test]
    fn says_what_it_can_avoid_instead() {
        let ferries = RouteOptions {
            avoid: vec!["ferries".into()],
            avoid_steep_hills: false,
        };
        let error = pick_rules(routing(), &ferries).unwrap_err().to_string();
        assert!(
            error.contains("motorways, tolls, traffic_lights"),
            "{error}"
        );
        assert!(error.contains("bad_avoid"), "{error}");

        let mut flat = routing();
        flat.steep_hills = None;
        let hills = RouteOptions {
            avoid: vec![],
            avoid_steep_hills: true,
        };
        assert!(pick_rules(flat, &hills).is_err());
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
