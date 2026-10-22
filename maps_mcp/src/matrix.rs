// Travel times between several places, from a route (or journey) for each pair: GraphHopper
// here has no matrix API

use futures::StreamExt;
use futures::stream;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::geo::Point;
use crate::routing::{self, RouteOptions};
use crate::stack::Stack;
use crate::transit::{self, TransitMode, TransitParams};
use crate::upstream::Error;

const MAX_ROUTES: usize = 25;
const MAX_JOURNEYS: usize = 9;

#[derive(Deserialize, JsonSchema)]
pub struct TravelTimesParams {
    pub origins: Vec<Point>,
    pub destinations: Vec<Point>,
    /// A plan_route mode ("car", "foot", "bike"...) or "transit" for public transport.
    /// Up to 25 origin-destination pairs, or 9 by public transport.
    pub mode: String,
    #[serde(flatten)]
    pub options: RouteOptions,
    /// By public transport: leave at or after this local time, e.g. "2026-10-24T08:30". Now if
    /// not given.
    pub depart_at: Option<String>,
    /// By public transport: only these kinds of transport
    pub transit_modes: Option<Vec<TransitMode>>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct TravelTimes {
    /// Every origin to every destination
    pub pairs: Vec<Pair>,
}

#[derive(Debug, Default, Serialize, JsonSchema)]
pub struct Pair {
    /// Indexes into origins and destinations
    pub from: usize,
    pub to: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_min: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub distance_km: Option<f64>,
    /// By public transport: when the first journey arrives, in local time
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arrive: Option<String>,
    /// Why there's no time for this pair
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub async fn travel_times(stack: &Stack, params: TravelTimesParams) -> Result<TravelTimes, Error> {
    let by_transit = params.mode == "transit";
    let (most, slots) = if by_transit {
        (MAX_JOURNEYS, stack.otp.capacity)
    } else {
        (MAX_ROUTES, stack.graphhopper.capacity)
    };
    let count = params.origins.len() * params.destinations.len();
    if count == 0 || count > most {
        let message = format!("Give 1 to {most} origin-destination pairs, not {count}");
        return Err(Error::invalid("too_many_pairs", message));
    }
    if !by_transit && (params.depart_at.is_some() || params.transit_modes.is_some()) {
        let message = "depart_at and transit_modes are for mode \"transit\"";
        return Err(Error::invalid("bad_option", message));
    }
    let mut points = params.origins.iter().chain(&params.destinations);
    points.try_for_each(Point::check)?;

    let pairs: Vec<_> = (0..params.origins.len())
        .flat_map(|from| (0..params.destinations.len()).map(move |to| (from, to)))
        .map(|(from, to)| time_pair(stack, &params, by_transit, from, to))
        .collect();
    // Half a service's slots at most, so one call doesn't hold up everyone else's
    let at_once = (slots / 2).max(1);
    let pairs = stream::iter(pairs).buffered(at_once).collect().await;
    Ok(TravelTimes { pairs })
}

async fn time_pair(
    stack: &Stack,
    params: &TravelTimesParams,
    by_transit: bool,
    from: usize,
    to: usize,
) -> Pair {
    let (origin, destination) = (params.origins[from], params.destinations[to]);
    let pair = Pair {
        from,
        to,
        ..Pair::default()
    };
    let timed = if by_transit {
        let request = TransitParams {
            from: origin,
            to: destination,
            depart_at: params.depart_at.clone(),
            arrive_by: None,
            modes: params.transit_modes.clone(),
            max_options: Some(1),
            transit_only: true,
        };
        // OTP gives at least one journey or an error
        transit::plan(stack, request).await.map(|found| {
            let first = found.journeys.into_iter().next();
            Pair {
                duration_min: first.as_ref().map(|j| j.duration_min),
                arrive: first.map(|j| j.arrive),
                ..pair
            }
        })
    } else {
        let waypoints = [origin, destination];
        let path = routing::route(stack, &waypoints, &params.mode, &params.options, false);
        path.await.map(|path| {
            let route = routing::summarize(path, false);
            Pair {
                duration_min: Some(route.duration_min),
                distance_km: Some(route.distance_km),
                ..pair
            }
        })
    };
    timed.unwrap_or_else(|error| Pair {
        error: Some(error.to_string()),
        from,
        to,
        ..Pair::default()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Config;

    fn params(origins: usize, destinations: usize, mode: &str) -> TravelTimesParams {
        let point = Point {
            lat: -37.8,
            lng: 144.9,
        };
        TravelTimesParams {
            origins: vec![point; origins],
            destinations: vec![point; destinations],
            mode: mode.into(),
            options: RouteOptions::default(),
            depart_at: None,
            transit_modes: None,
        }
    }

    // Turned down before asking any service
    #[tokio::test]
    async fn caps_pairs() {
        let stack = Stack::new(&Config::from_env().unwrap());
        let error = |p| async { travel_times(&stack, p).await.unwrap_err().to_string() };
        assert!(error(params(5, 6, "car")).await.contains("too_many_pairs"));
        assert!(
            error(params(2, 5, "transit"))
                .await
                .contains("too_many_pairs")
        );
        assert!(error(params(0, 3, "car")).await.contains("too_many_pairs"));

        let mut at = params(1, 2, "car");
        at.depart_at = Some("2026-10-23T08:30:00+13:00".into());
        assert!(error(at).await.contains("bad_option"));
    }
}
