use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::upstream::Error;

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct Point {
    /// Latitude in degrees
    pub lat: f64,
    /// Longitude in degrees
    pub lng: f64,
}

impl Point {
    pub fn check(&self) -> Result<(), Error> {
        if (-90.0..=90.0).contains(&self.lat) && (-180.0..=180.0).contains(&self.lng) {
            Ok(())
        } else {
            let message = format!("{}, {} isn't a place on Earth", self.lat, self.lng);
            Err(Error::invalid("bad_point", message))
        }
    }

    /// As the backend takes points: "lng,lat"
    pub fn lng_lat(&self) -> String {
        format!("{:.5},{:.5}", self.lng, self.lat)
    }
}
