// Places from Photon (OSM) and the backend (places people added, Overture's, browse), passed on
// as the services give them, with an id for get_place and a link added

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::geo::Point;
use crate::links::add_links;
use crate::stack::Stack;
use crate::upstream::Error;

/// A place, with the fields search (Photon) or the backend gave for it
#[derive(Debug, Serialize, JsonSchema)]
pub struct Place {
    /// For get_place: `{type}/{id}`, with OSM's N/W/R, U for a place someone added here or O
    /// for one from Overture Maps
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub lat: f64,
    pub lng: f64,
    /// Opens Nav Cat at the place
    pub link: String,
    /// name, street, city, osm_key and osm_value (what it is)... from search; name, category,
    /// tags (address, opening_hours...) and distance (metres) from the backend
    #[serde(flatten)]
    pub fields: Map<String, Value>,
}

impl Place {
    pub fn at(&self) -> Point {
        Point {
            lat: self.lat,
            lng: self.lng,
        }
    }

    /// A Photon GeoJSON feature
    pub fn from_feature(feature: Value) -> Option<Place> {
        let Value::Array(coordinates) = &feature["geometry"]["coordinates"] else {
            return None;
        };
        let (lng, lat) = (
            coordinates.first()?.as_f64()?,
            coordinates.get(1)?.as_f64()?,
        );
        let Value::Object(mut fields) = feature["properties"].clone() else {
            return None;
        };
        let id = place_id(fields.remove("osm_type"), fields.remove("osm_id"));
        // The bounding box of an area, which agents have no use for
        fields.remove("extent");
        Some(Place {
            id,
            lat,
            lng,
            link: String::new(),
            fields,
        })
    }

    /// The backend's PoiDetails (or Poi, with distance)
    pub fn from_poi(poi: Value) -> Option<Place> {
        let Value::Object(mut fields) = poi else {
            return None;
        };
        let lng = fields.remove("lng")?.as_f64()?;
        let lat = fields.remove("lat")?.as_f64()?;
        let id = place_id(fields.remove("osmType"), fields.remove("osmId"));
        Some(Place {
            id,
            lat,
            lng,
            link: String::new(),
            fields,
        })
    }
}

fn place_id(kind: Option<Value>, id: Option<Value>) -> Option<String> {
    Some(format!("{}/{}", kind?.as_str()?, id?.as_i64()?))
}

#[derive(Deserialize, JsonSchema)]
pub struct SearchParams {
    /// A name, address or kind of place, e.g. "Sky Tower", "12 Queen Street" or "museum"
    pub query: String,
    /// Prefer results near here
    pub near: Option<Point>,
    /// How many results from OSM (1 to 10, default 6). Up to 5 places people added or from
    /// Overture Maps come first.
    pub limit: Option<u8>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct Places {
    pub places: Vec<Place>,
}

#[derive(Deserialize)]
struct FeatureCollection {
    #[serde(default)]
    features: Vec<Value>,
}

/// Search as the app's search box does it (maps_web/src/hooks/usePlaceSuggestions.ts)
pub async fn search(stack: &Stack, params: SearchParams) -> Result<Places, Error> {
    let query = params.query.trim();
    if query.is_empty() || query.chars().count() > 200 {
        return Err(Error::invalid(
            "bad_query",
            "Give a query of 1 to 200 characters",
        ));
    }
    if let Some(near) = params.near {
        near.check()?;
    }
    let limit = params.limit.unwrap_or(6).clamp(1, 10).to_string();

    let mut photon = stack
        .photon
        .get("/api")
        .query(&[("q", query), ("limit", &limit)]);
    if let Some(near) = params.near {
        let bias = [
            ("lat", format!("{:.4}", near.lat)),
            ("lon", format!("{:.4}", near.lng)),
        ];
        photon = photon.query(&bias);
    }
    let found = stack.photon.json::<FeatureCollection>(photon);

    // The backend's search is extra: the app searches without it if it fails
    let extra = async {
        if query.chars().count() < 2 {
            return Vec::new();
        }
        let mut request = stack
            .backend
            .get("/api/places/search")
            .query(&[("q", query)]);
        if let Some(near) = params.near {
            request = request.query(&[("near", near.lng_lat())]);
        }
        stack
            .backend
            .json::<Vec<Value>>(request)
            .await
            .unwrap_or_else(|err| {
                tracing::warn!("{err}");
                Vec::new()
            })
    };

    let (found, extra) = futures::join!(found, extra);
    let mut places: Vec<Place> = extra.into_iter().filter_map(Place::from_poi).collect();
    places.extend(found?.features.into_iter().filter_map(Place::from_feature));
    add_links(stack, &mut places).await?;
    Ok(Places { places })
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct Reverse {
    /// None when there's nothing there, e.g. out at sea
    pub place: Option<Place>,
}

pub async fn reverse(stack: &Stack, at: Point) -> Result<Reverse, Error> {
    at.check()?;
    let request = stack
        .photon
        .get("/reverse")
        .query(&[("lat", at.lat), ("lon", at.lng)]);
    let found: FeatureCollection = stack.photon.json(request).await?;
    let mut place = found.features.into_iter().find_map(Place::from_feature);
    if let Some(place) = &mut place {
        add_links(stack, std::slice::from_mut(place)).await?;
    }
    Ok(Reverse { place })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> Value {
        let path = format!("{}/tests/fixtures/{name}", env!("CARGO_MANIFEST_DIR"));
        serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
    }

    #[test]
    fn passes_search_results_on() {
        let found = fixture("photon_search.json");
        let Value::Array(features) = found["features"].clone() else {
            panic!()
        };
        let station = Place::from_feature(features[0].clone()).unwrap();
        assert_eq!(station.id.as_deref(), Some("W/23075050"));
        assert_eq!((station.lat, station.lng), (-37.81827, 144.96706));
        assert_eq!(station.fields["name"], "Flinders Street Station");
        assert_eq!(station.fields["osm_value"], "station");
        assert!(!station.fields.contains_key("osm_id"));

        let suburb = Place::from_feature(features[3].clone()).unwrap();
        assert!(!suburb.fields.contains_key("extent"));
    }

    #[test]
    fn passes_backend_places_on() {
        let Value::Array(pois) = fixture("places_search.json") else {
            panic!()
        };
        let cafe = Place::from_poi(pois[0].clone()).unwrap();
        assert_eq!(cafe.id.as_deref(), Some("N/1234567890"));
        assert_eq!(cafe.fields["category"], "cafe");
        assert_eq!(
            cafe.fields["tags"]["opening_hours"],
            "Mo-Fr 07:00-16:00; Sa-Su 08:00-15:00"
        );
        assert!(!cafe.fields.contains_key("lat"));
    }

    #[test]
    fn skips_what_it_cant_place() {
        assert!(Place::from_feature(serde_json::json!({ "properties": {} })).is_none());
        assert!(Place::from_poi(serde_json::json!({ "name": "x" })).is_none());
    }
}
