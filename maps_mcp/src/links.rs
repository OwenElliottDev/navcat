// Links that open Nav Cat at a spot, as the app shares them (maps_web/src/utils/links.ts):
// /go/<OSM shortlink code>?m, with the code from the backend

use futures::future::try_join_all;
use serde::Deserialize;
use serde_json::json;

use crate::geo::Point;
use crate::places::Place;
use crate::stack::Stack;
use crate::upstream::Error;

/// How far in a spot's link zooms (SPOT_ZOOM in links.ts)
const SPOT_ZOOM: u32 = 16;

#[derive(Deserialize)]
struct Shortlink {
    shortlink: String,
}

pub async fn spot_link(stack: &Stack, at: Point) -> Result<String, Error> {
    let body = json!({ "long": at.lng, "lat": at.lat, "zoom": SPOT_ZOOM });
    let request = stack
        .backend
        .post("/api/links/encode_osm_shortlink")
        .json(&body);
    let Shortlink { shortlink } = stack.backend.json(request).await?;
    Ok(format!("{}/go/{shortlink}?m", stack.public_url))
}

/// Fills in each place's link
pub async fn add_links(stack: &Stack, places: &mut [Place]) -> Result<(), Error> {
    let links = try_join_all(places.iter().map(|p| spot_link(stack, p.at()))).await?;
    for (place, link) in places.iter_mut().zip(links) {
        place.link = link;
    }
    Ok(())
}
