// A place's details, and places by category nearby, from the backend's places and browse APIs

use std::time::Duration;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::geo::Point;
use crate::links::{add_links, spot_link};
use crate::places::Place;
use crate::stack::Stack;
use crate::upstream::Error;

const MAX_RADIUS_M: u32 = 5000;
const MAX_NEARBY: u32 = 50;

#[derive(Deserialize, JsonSchema)]
pub struct PlaceParams {
    /// A place's id from search_places or find_nearby, e.g. "N/1234567890"
    pub id: String,
}

/// The backend's path for a place id, after checking it's one
pub fn place_path(id: &str) -> Result<String, Error> {
    let (kind, number) = id.split_once('/').unwrap_or_default();
    let known = ["N", "W", "R", "U", "O"].contains(&kind);
    if !known || number.is_empty() || !number.bytes().all(|b| b.is_ascii_digit()) {
        let message = format!("{id:?} isn't a place id like \"N/1234567890\"");
        return Err(Error::invalid("bad_id", message));
    }
    Ok(format!("/api/places/{kind}/{number}"))
}

pub async fn get_place(stack: &Stack, id: &str) -> Result<Place, Error> {
    let request = stack.backend.get(&place_path(id)?);
    let details: Value = stack.backend.json(request).await?;
    let mut place = Place::from_poi(details).ok_or(Error::Unavailable(stack.backend.name))?;
    place.link = spot_link(stack, place.at()).await?;
    Ok(place)
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct Categories {
    /// Each with its id (for find_nearby), label, other words for it, and the OSM values of
    /// places in it
    pub categories: Vec<Map<String, Value>>,
}

pub async fn categories(stack: &Stack) -> Result<Categories, Error> {
    let request = stack.backend.get("/api/browse/categories");
    Ok(Categories {
        categories: stack.backend.json(request).await?,
    })
}

#[derive(Deserialize, JsonSchema)]
pub struct NearbyParams {
    /// A category id from list_categories, e.g. "cafe"
    pub category: String,
    pub near: Point,
    /// How far to look in metres (up to 5000, default 1000)
    pub radius_m: Option<u32>,
    /// How many places at most (up to 50, default 20)
    pub limit: Option<u32>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct Nearby {
    /// Nearest first, each with its distance in metres
    pub places: Vec<Place>,
    /// There were more than `limit`
    pub truncated: bool,
}

#[derive(Deserialize)]
struct BrowseResults {
    results: Vec<Value>,
    truncated: bool,
}

/// Places of a category, nearest first: the backend's browse in an area its parameters give
pub async fn browse(
    stack: &Stack,
    category: &str,
    area: &[(&str, String)],
    limit: u32,
    timeout: Option<Duration>,
) -> Result<(Vec<Place>, bool), Error> {
    let mut request = stack
        .backend
        .get("/api/browse")
        .query(&[("category", category), ("limit", &limit.to_string())])
        .query(area);
    if let Some(timeout) = timeout {
        request = request.timeout(timeout);
    }
    let found: BrowseResults = stack.backend.json(request).await?;
    let places = found
        .results
        .into_iter()
        .filter_map(Place::from_poi)
        .collect();
    Ok((places, found.truncated))
}

pub async fn nearby(stack: &Stack, params: NearbyParams) -> Result<Nearby, Error> {
    params.near.check()?;
    let radius = params.radius_m.unwrap_or(1000).clamp(1, MAX_RADIUS_M);
    let limit = params.limit.unwrap_or(20).clamp(1, MAX_NEARBY);
    let area = [
        ("near", params.near.lng_lat()),
        ("radius", radius.to_string()),
    ];
    let (mut places, truncated) = browse(stack, &params.category, &area, limit, None).await?;
    add_links(stack, &mut places).await?;
    Ok(Nearby { places, truncated })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checks_place_ids() {
        assert_eq!(
            place_path("N/1234567890").unwrap(),
            "/api/places/N/1234567890"
        );
        assert_eq!(place_path("O/42").unwrap(), "/api/places/O/42");
        for bad in ["N1234", "X/1", "N/", "N/12a", "N/../me", "/1"] {
            assert!(place_path(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn passes_browse_results_on() {
        let fixture = include_str!("../tests/fixtures/browse_cafe.json");
        let found: BrowseResults = serde_json::from_str(fixture).unwrap();
        assert!(!found.truncated);
        let places: Vec<Place> = found
            .results
            .into_iter()
            .filter_map(Place::from_poi)
            .collect();
        assert_eq!(places.len(), 3);
        assert_eq!(places[0].id.as_deref(), Some("N/1234567890"));
        assert_eq!(places[1].fields["distance"], 350.0);
    }
}
