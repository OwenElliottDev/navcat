// Links that open Nav Cat at a spot, as the app shares them (maps_web/src/utils/links.ts):
// /go/<OSM shortlink code>?m, with the code from the backend

use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

use futures::{StreamExt, TryStreamExt, stream};
use serde::Deserialize;
use serde_json::json;

use crate::geo::Point;
use crate::stack::Stack;
use crate::upstream::Error;

/// How far in a spot's link zooms (SPOT_ZOOM in links.ts)
const SPOT_ZOOM: u32 = 16;
/// Codes asked for at once, leaving the backend's other slots for other requests
const AT_ONCE: usize = 4;
/// Codes kept: a code only depends on its point, and agents ask about the same places again
const CACHED: usize = 10_000;

static CODES: LazyLock<Mutex<HashMap<(u64, u64), String>>> = LazyLock::new(Default::default);

#[derive(Deserialize)]
struct Shortlink {
    shortlink: String,
}

/// Something with a link to where it is
pub trait Linked {
    fn at(&self) -> Point;
    fn set_link(&mut self, link: String);
}

pub async fn spot_link(stack: &Stack, at: Point) -> Result<String, Error> {
    let key = (at.lat.to_bits(), at.lng.to_bits());
    let cached = CODES.lock().unwrap().get(&key).cloned();
    let code = match cached {
        Some(code) => code,
        None => {
            let body = json!({ "long": at.lng, "lat": at.lat, "zoom": SPOT_ZOOM });
            let request = stack
                .backend
                .post("/api/links/encode_osm_shortlink")
                .json(&body);
            let Shortlink { shortlink } = stack.backend.json(request).await?;
            let mut codes = CODES.lock().unwrap();
            if codes.len() >= CACHED {
                codes.clear();
            }
            codes.insert(key, shortlink.clone());
            shortlink
        }
    };
    Ok(format!("{}/go/{code}?m", stack.public_url))
}

/// Links for several points, in order
pub async fn links(
    stack: &Stack,
    points: impl IntoIterator<Item = Point>,
) -> Result<Vec<String>, Error> {
    let links: Vec<_> = points.into_iter().map(|at| spot_link(stack, at)).collect();
    stream::iter(links).buffered(AT_ONCE).try_collect().await
}

/// Fills in each one's link
pub async fn add_links<T: Linked>(stack: &Stack, items: &mut [T]) -> Result<(), Error> {
    let links = links(stack, items.iter().map(Linked::at)).await?;
    for (item, link) in items.iter_mut().zip(links) {
        item.set_link(link);
    }
    Ok(())
}
