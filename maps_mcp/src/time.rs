// Times local to where a trip or stop is. OTP plans every feed in one time zone (the graph's,
// see docker_maps/download/transit_prepare.py), so its times carry that zone's offset, which
// for a stack covering several zones isn't the one where the trip is.

use std::sync::LazyLock;

use chrono::{DateTime, FixedOffset, NaiveDateTime, TimeZone};
use chrono_tz::Tz;

use crate::geo::Point;
use crate::upstream::Error;

const LOCAL: &str = "%Y-%m-%dT%H:%M";

static FINDER: LazyLock<tzf_rs::DefaultFinder> = LazyLock::new(tzf_rs::DefaultFinder::new);

/// The time zone at a point (UTC out at sea)
pub fn zone(at: Point) -> Tz {
    FINDER
        .get_tz_name(at.lng, at.lat)
        .parse()
        .unwrap_or(Tz::UTC)
}

/// A time an agent gave: local where `at` is (e.g. "2026-10-24T08:30"), or with an offset
pub fn parse(text: &str, at: Point) -> Result<DateTime<FixedOffset>, Error> {
    let text = text.trim();
    if let Ok(time) = DateTime::parse_from_rfc3339(text) {
        return Ok(time);
    }
    let formats = [
        "%Y-%m-%dT%H:%M:%S",
        LOCAL,
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
    ];
    let Some(naive) = formats
        .iter()
        .find_map(|f| NaiveDateTime::parse_from_str(text, f).ok())
    else {
        let message = format!("{text:?} isn't a time like 2026-10-24T08:30");
        return Err(Error::invalid("bad_time", message));
    };
    // A time skipped when the clocks go forward is taken as the hour after
    let zone = zone(at);
    let later = naive + chrono::Duration::hours(1);
    let time = zone.from_local_datetime(&naive).earliest();
    let time = time.or_else(|| zone.from_local_datetime(&later).earliest());
    time.map(|t| t.fixed_offset())
        .ok_or_else(|| Error::invalid("bad_time", format!("{text} doesn't exist there")))
}

/// A time as the clock reads where `at` is, e.g. "2026-10-24T08:30"
pub fn local(time: DateTime<FixedOffset>, at: Point) -> String {
    time.with_timezone(&zone(at)).format(LOCAL).to_string()
}

/// One of OTP's times (ISO 8601 with an offset) as local time where `at` is
pub fn local_otp(text: &str, at: Point) -> String {
    match DateTime::parse_from_rfc3339(text) {
        Ok(time) => local(time, at),
        Err(_) => text.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MELBOURNE: Point = Point {
        lat: -37.8183,
        lng: 144.9671,
    };
    const AUCKLAND: Point = Point {
        lat: -36.8485,
        lng: 174.7633,
    };
    const PERTH: Point = Point {
        lat: -31.9523,
        lng: 115.8613,
    };

    #[test]
    fn finds_zones() {
        assert_eq!(zone(MELBOURNE), Tz::Australia__Melbourne);
        assert_eq!(zone(AUCKLAND), Tz::Pacific__Auckland);
        assert_eq!(zone(PERTH), Tz::Australia__Perth);
    }

    #[test]
    fn reads_local_times_where_the_trip_starts() {
        let time = parse("2026-10-24T08:30", MELBOURNE).unwrap();
        assert_eq!(time.to_rfc3339(), "2026-10-24T08:30:00+11:00");
        let time = parse("2026-10-24 08:30", PERTH).unwrap();
        assert_eq!(time.to_rfc3339(), "2026-10-24T08:30:00+08:00");
        let given = parse("2026-10-24T08:30:00+13:00", MELBOURNE).unwrap();
        assert_eq!(given.to_rfc3339(), "2026-10-24T08:30:00+13:00");
        assert!(parse("tomorrow morning", MELBOURNE).is_err());
    }

    #[test]
    fn skips_the_hour_clocks_go_forward() {
        // Melbourne's clocks went from 2:00 to 3:00 on 2026-10-04
        let time = parse("2026-10-04T02:30", MELBOURNE).unwrap();
        assert_eq!(time.to_rfc3339(), "2026-10-04T03:30:00+11:00");
    }

    #[test]
    fn gives_otps_times_as_local() {
        // A Melbourne tram, as OTP gives it in the graph's Auckland time
        let tram = "2026-10-22T17:07:00+13:00";
        assert_eq!(local_otp(tram, MELBOURNE), "2026-10-22T15:07");
        assert_eq!(local_otp(tram, AUCKLAND), "2026-10-22T17:07");
    }
}
