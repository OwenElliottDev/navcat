// Tool schemas that list this stack's own values (travel modes, avoid options, transit modes)
// from the backend's /api/capabilities, so agents pick from them rather than guess

use rmcp::model::{JsonObject, Tool};
use serde_json::{Value, json};

use crate::capabilities::{AvoidOption, Backend, Rules};

/// What each avoid option steers away from, for agents; options without one show only the id
const AVOID_DESCRIPTIONS: [(&str, &str); 5] = [
    ("motorways", "motorways"),
    ("tolls", "toll roads"),
    ("ferries", "ferries"),
    (
        "traffic_lights",
        "roads at traffic lights and signalised crossings",
    ),
    (
        "small_roads",
        "residential streets, service roads, tracks...",
    ),
];

/// What GraphHopper can do here, as the tools' fields take it
struct Routing<'a> {
    profiles: &'a [String],
    /// The profiles, and "transit" when public transport is answering (travel_times' modes)
    with_transit: Vec<String>,
    avoid: &'a [AvoidOption],
    steep_hills: Option<&'a Rules>,
}

/// Fills in the values each tool's fields can take. A part of the stack that isn't answering
/// leaves its fields as they are.
pub fn fit(tools: &mut [Tool], found: &Backend) {
    let routing = found.routing.as_ref().map(|routing| Routing {
        profiles: &routing.profiles,
        with_transit: routing
            .profiles
            .iter()
            .cloned()
            .chain(found.transit.is_some().then(|| "transit".into()))
            .collect(),
        avoid: &routing.avoid,
        steep_hills: routing.steep_hills.as_ref(),
    });
    let transit_modes = found.transit.as_ref().map(|t| &t.modes);
    for tool in tools {
        let schema = std::sync::Arc::make_mut(&mut tool.input_schema);
        if let Some(routing) = &routing {
            match tool.name.as_ref() {
                "plan_route" => {
                    values(schema, "mode", routing.profiles);
                    route_options(schema, routing);
                }
                "travel_times" => {
                    values(schema, "mode", &routing.with_transit);
                    route_options(schema, routing);
                }
                "reachable" => values(schema, "mode", routing.profiles),
                _ => {}
            }
        }
        if let Some(modes) = transit_modes {
            match tool.name.as_ref() {
                "plan_transit" | "stop_departures" => values(schema, "modes", modes),
                "travel_times" => values(schema, "transit_modes", modes),
                _ => {}
            }
        }
    }
}

fn property<'a>(schema: &'a mut JsonObject, field: &str) -> Option<&'a mut Value> {
    schema.get_mut("properties")?.get_mut(field)
}

/// A field's allowed values, or its items' for a list
fn values(schema: &mut JsonObject, field: &str, values: &[String]) {
    let Some(property) = property(schema, field) else {
        return;
    };
    match property.get_mut("items") {
        Some(items) => items["enum"] = json!(values),
        None => property["enum"] = json!(values),
    }
}

fn describe(schema: &mut JsonObject, field: &str, description: String) {
    if let Some(property) = property(schema, field) {
        property["description"] = json!(description);
    }
}

/// The avoid options this stack has and the modes they're for, and steep hills only where they
/// can be avoided
fn route_options(schema: &mut JsonObject, routing: &Routing) {
    let Some(properties) = schema.get_mut("properties").and_then(Value::as_object_mut) else {
        return;
    };
    match routing.steep_hills {
        Some(steep) => {
            let modes = steep.profiles.join(", ");
            let text = format!("For {modes}: steer away from steep hills, e.g. with a pram");
            describe(schema, "avoid_steep_hills", text);
        }
        None => {
            properties.remove("avoid_steep_hills");
        }
    }
    if routing.avoid.is_empty() {
        if let Some(properties) = schema.get_mut("properties").and_then(Value::as_object_mut) {
            properties.remove("avoid");
        }
        return;
    }
    let described: Vec<String> = routing
        .avoid
        .iter()
        .map(|option| {
            let what = AVOID_DESCRIPTIONS.iter().find(|(id, _)| *id == option.id);
            let what = what.map_or(String::new(), |(_, what)| format!(", {what}"));
            format!("{} ({}{what})", option.id, option.profiles.join(", "))
        })
        .collect();
    let text = format!(
        "Kinds of road to steer away from, each for the modes given: {}",
        described.join("; ")
    );
    describe(schema, "avoid", text);
    let ids: Vec<String> = routing.avoid.iter().map(|a| a.id.clone()).collect();
    values(schema, "avoid", &ids);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::server::NavCat;

    fn backend(json: &str) -> Backend {
        serde_json::from_str(json).unwrap()
    }

    fn fitted(found: &Backend) -> Vec<Tool> {
        let mut tools = NavCat::tools();
        fit(&mut tools, found);
        tools
    }

    fn field(tools: &[Tool], tool: &str, field: &str) -> Value {
        let tool = tools.iter().find(|t| t.name == tool).unwrap();
        tool.input_schema["properties"][field].clone()
    }

    #[test]
    fn lists_this_stacks_values() {
        let tools = fitted(&backend(include_str!(
            "../tests/fixtures/capabilities.json"
        )));
        let modes = json!(["foot", "bike", "bike_paths", "racingbike", "car"]);
        assert_eq!(field(&tools, "plan_route", "mode")["enum"], modes);
        assert_eq!(field(&tools, "reachable", "mode")["enum"], modes);
        let avoid = field(&tools, "plan_route", "avoid");
        assert_eq!(
            avoid["items"]["enum"],
            json!(["motorways", "tolls", "traffic_lights"])
        );
        let description = avoid["description"].as_str().unwrap();
        assert!(
            description.contains("traffic_lights (car, roads at traffic lights"),
            "{description}"
        );
        let steep = field(&tools, "plan_route", "avoid_steep_hills");
        assert!(
            steep["description"]
                .as_str()
                .unwrap()
                .starts_with("For foot, bike")
        );
        assert!(!field(&tools, "plan_route", "avoid_steep_hills").is_null());

        let matrix_modes = field(&tools, "travel_times", "mode")["enum"].clone();
        assert_eq!(matrix_modes.as_array().unwrap().last().unwrap(), "transit");
        let transit = json!(["BUS", "TRAM"]);
        assert_eq!(
            field(&tools, "plan_transit", "modes")["items"]["enum"],
            transit
        );
        assert_eq!(
            field(&tools, "stop_departures", "modes")["items"]["enum"],
            transit
        );
        assert_eq!(
            field(&tools, "travel_times", "transit_modes")["items"]["enum"],
            transit
        );
    }

    #[test]
    fn leaves_out_options_this_stack_cant_use() {
        let tools = fitted(&backend(
            r#"{ "routing": { "area": null, "profiles": ["foot"], "avoid": [],
                 "steepHills": null }, "transit": null }"#,
        ));
        assert!(field(&tools, "plan_route", "avoid").is_null());
        assert!(field(&tools, "plan_route", "avoid_steep_hills").is_null());
        assert_eq!(
            field(&tools, "travel_times", "mode")["enum"],
            json!(["foot"])
        );
    }

    #[test]
    fn leaves_a_part_thats_down_as_it_is() {
        let tools = fitted(&backend(r#"{ "routing": null, "transit": null }"#));
        assert!(field(&tools, "plan_route", "mode").get("enum").is_none());
        assert!(!field(&tools, "plan_route", "avoid").is_null());
        let modes = field(&tools, "plan_transit", "modes");
        assert!(modes["items"].get("enum").is_none());
    }
}
