// Places of a category reachable within a time, from the backend's browse (which asks
// GraphHopper for the area)

use std::time::Duration;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::browse::browse;
use crate::geo::Point;
use crate::links::add_links;
use crate::places::Place;
use crate::stack::Stack;
use crate::upstream::Error;

const MAX_MINUTES: u32 = 30;
const MAX_PLACES: u32 = 50;
/// The backend asks GraphHopper for the area first, which takes longer than other lookups
const TIMEOUT: Duration = Duration::from_secs(40);

#[derive(Deserialize, JsonSchema)]
pub struct ReachableParams {
    pub from: Point,
    /// A plan_route mode: "foot", "bike", "car"...
    pub mode: String,
    /// Travel time in minutes (1 to 30, default 10)
    pub minutes: Option<u32>,
    /// A category id from list_categories, e.g. "cafe"
    pub category: String,
    /// How many places at most (up to 50, default 20)
    pub limit: Option<u32>,
}

#[derive(Debug, Default, Serialize, JsonSchema)]
pub struct Reachable {
    /// Nearest first, each with its straight-line distance in metres
    pub places: Vec<Place>,
    /// There were more than `limit`
    pub truncated: bool,
}

pub async fn reachable(stack: &Stack, params: ReachableParams) -> Result<Reachable, Error> {
    params.from.check()?;
    if params.mode == "transit" {
        let message = "Public transport isn't supported; use travel_times for that";
        return Err(Error::invalid("bad_mode", message));
    }
    let minutes = params.minutes.unwrap_or(10).clamp(1, MAX_MINUTES);
    let limit = params.limit.unwrap_or(20).clamp(1, MAX_PLACES);
    let area = [
        ("reachable_from", params.from.lng_lat()),
        ("mode", params.mode.clone()),
        ("minutes", minutes.to_string()),
    ];
    let (mut places, truncated) =
        browse(stack, &params.category, &area, limit, Some(TIMEOUT)).await?;
    add_links(stack, &mut places).await?;
    Ok(Reachable { places, truncated })
}
