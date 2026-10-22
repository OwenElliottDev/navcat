// Places of a category reachable within a time: GraphHopper's isochrone, then the backend's
// browse within its bounding box, keeping the places inside it

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::browse::browse;
use crate::geo::Point;
use crate::links::add_links;
use crate::places::Place;
use crate::stack::Stack;
use crate::upstream::Error;

const MAX_MINUTES: u32 = 30;
const MAX_PLACES: usize = 50;
/// The most the browse API gives at once
const BROWSE_LIMIT: u32 = 200;

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
    pub limit: Option<usize>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct Reachable {
    /// Nearest first, each with its straight-line distance in metres
    pub places: Vec<Place>,
    /// There were more than `limit`
    pub truncated: bool,
}

#[derive(Deserialize)]
struct IsochroneResponse {
    polygons: Vec<Feature>,
}

#[derive(Deserialize)]
struct Feature {
    geometry: Geometry,
}

/// Rings of [lng, lat], the first of each polygon its outside and the rest holes
#[derive(Deserialize)]
#[serde(tag = "type", content = "coordinates")]
enum Geometry {
    Polygon(Vec<Vec<[f64; 2]>>),
    MultiPolygon(Vec<Vec<Vec<[f64; 2]>>>),
}

impl Geometry {
    fn polygons(&self) -> Vec<&[Vec<[f64; 2]>]> {
        match self {
            Geometry::Polygon(rings) => vec![rings],
            Geometry::MultiPolygon(polygons) => polygons.iter().map(Vec::as_slice).collect(),
        }
    }

    pub fn contains(&self, at: Point) -> bool {
        let inside = |ring: &Vec<[f64; 2]>| in_ring(ring, at);
        self.polygons()
            .into_iter()
            .any(|rings| match rings.split_first() {
                Some((outside, holes)) => inside(outside) && !holes.iter().any(inside),
                None => false,
            })
    }

    /// west,south,east,north, as the browse API takes it
    fn bbox(&self) -> Option<String> {
        let points = self.polygons().into_iter().flatten().flatten();
        let (mut west, mut south, mut east, mut north) = (180.0, 90.0, -180.0, -90.0);
        let mut any = false;
        for &[lng, lat] in points {
            (west, east) = (f64::min(west, lng), f64::max(east, lng));
            (south, north) = (f64::min(south, lat), f64::max(north, lat));
            any = true;
        }
        any.then(|| format!("{west:.5},{south:.5},{east:.5},{north:.5}"))
    }
}

/// Whether a point is inside a ring, by how many of its edges a line east from it crosses
fn in_ring(ring: &[[f64; 2]], at: Point) -> bool {
    let mut inside = false;
    for (a, b) in ring.iter().zip(ring.iter().cycle().skip(1)) {
        let [(x1, y1), (x2, y2)] = [(a[0], a[1]), (b[0], b[1])];
        if (y1 > at.lat) != (y2 > at.lat) && at.lng < x1 + (at.lat - y1) * (x2 - x1) / (y2 - y1) {
            inside = !inside;
        }
    }
    inside
}

pub async fn reachable(stack: &Stack, params: ReachableParams) -> Result<Reachable, Error> {
    params.from.check()?;
    if params.mode == "transit" {
        let message = "Public transport isn't supported; use travel_times for that";
        return Err(Error::invalid("bad_mode", message));
    }
    let minutes = params.minutes.unwrap_or(10).clamp(1, MAX_MINUTES);
    let limit = params.limit.unwrap_or(20).clamp(1, MAX_PLACES);

    let query = [
        ("point", format!("{},{}", params.from.lat, params.from.lng)),
        ("profile", params.mode.clone()),
        ("time_limit", (minutes * 60).to_string()),
        ("buckets", "1".into()),
    ];
    let request = stack.graphhopper.get("/isochrone").query(&query);
    let found: IsochroneResponse = stack.graphhopper.json(request).await?;
    let Some(area) = found.polygons.into_iter().next().map(|f| f.geometry) else {
        return Ok(Reachable {
            places: Vec::new(),
            truncated: false,
        });
    };
    let Some(bbox) = area.bbox() else {
        return Ok(Reachable {
            places: Vec::new(),
            truncated: false,
        });
    };

    let (mut places, more) =
        browse(stack, &params.category, &bbox, params.from, BROWSE_LIMIT).await?;
    places.retain(|place| area.contains(place.at()));
    let truncated = more || places.len() > limit;
    places.truncate(limit);
    add_links(stack, &mut places).await?;
    Ok(Reachable { places, truncated })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn square(west: f64, south: f64, east: f64, north: f64) -> Vec<[f64; 2]> {
        let corners = [[west, south], [east, south], [east, north], [west, north]];
        let mut ring = corners.to_vec();
        ring.push(corners[0]);
        ring
    }

    fn at(lng: f64, lat: f64) -> Point {
        Point { lat, lng }
    }

    #[test]
    fn knows_whats_inside() {
        let donut = Geometry::Polygon(vec![
            square(0.0, 0.0, 10.0, 10.0),
            square(4.0, 4.0, 6.0, 6.0),
        ]);
        assert!(donut.contains(at(1.0, 1.0)));
        assert!(!donut.contains(at(5.0, 5.0)));
        assert!(!donut.contains(at(11.0, 5.0)));
        assert_eq!(donut.bbox().unwrap(), "0.00000,0.00000,10.00000,10.00000");

        let islands = Geometry::MultiPolygon(vec![
            vec![square(0.0, 0.0, 1.0, 1.0)],
            vec![square(5.0, 5.0, 6.0, 6.0)],
        ]);
        assert!(islands.contains(at(5.5, 5.5)));
        assert!(!islands.contains(at(3.0, 3.0)));
    }

    #[test]
    fn reads_isochrones() {
        let response = serde_json::json!({ "polygons": [{
            "type": "Feature",
            "geometry": { "type": "Polygon", "coordinates": [square(144.9, -37.9, 145.0, -37.8)] },
            "properties": { "bucket": 0 },
        }] });
        let found: IsochroneResponse = serde_json::from_value(response).unwrap();
        assert!(found.polygons[0].geometry.contains(at(144.95, -37.85)));
    }
}
