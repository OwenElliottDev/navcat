// Times local to where a trip or stop is. OTP plans every feed in one time zone (the graph's,
// see docker_maps/download/transit_prepare.py), so its times carry that zone's offset, which
// for a stack covering several zones isn't the one where the trip is.

use std::sync::LazyLock;

use jiff::fmt::temporal::Pieces;
use jiff::tz::TimeZone;
use jiff::{Timestamp, ZonedDateTime};

use crate::geo::Point;
use crate::upstream::Error;

const LOCAL: &str = "%Y-%m-%dT%H:%M";

static FINDER: LazyLock<tzf_rs::DefaultFinder> = LazyLock::new(tzf_rs::DefaultFinder::new);

pub fn load() {
    LazyLock::force(&FINDER);
}

/// The time zone at a point (UTC out at sea)
pub fn zone(at: Point) -> TimeZone {
    TimeZone::get(FINDER.get_tz_name(at.lng, at.lat)).unwrap_or(TimeZone::UTC)
}

/// A time an agent gave (ISO 8601): local where `at` is (e.g. "2026-10-24T08:30"), or with an
/// offset or zone
pub fn parse(text: &str, at: Point) -> Result<ZonedDateTime, Error> {
    let text = text.trim();
    let bad = || {
        Error::invalid(
            "bad_time",
            format!("{text:?} isn't a time like 2026-10-24T08:30"),
        )
    };
    let pieces = Pieces::parse(text).map_err(|_| bad())?;
    let time = pieces.date().to_datetime(pieces.time().ok_or_else(bad)?);
    let zone = match pieces.to_numeric_offset() {
        Some(offset) => TimeZone::fixed(offset),
        None => pieces
            .to_time_zone()
            .map_err(|_| bad())?
            .unwrap_or_else(|| zone(at)),
    };
    // A time skipped when the clocks go forward is moved forward past the gap
    zone.to_zoned_datetime(time).map_err(|_| bad())
}

/// A time with its offset, as OTP takes it, e.g. "2026-10-24T08:30:00+11:00"
pub fn rfc3339(time: &ZonedDateTime) -> String {
    time.timestamp()
        .display_with_offset(time.offset())
        .to_string()
}

/// A time as the clock reads in a zone, e.g. "2026-10-24T08:30"
pub fn local(time: Timestamp, zone: &TimeZone) -> String {
    zone.to_datetime(time).strftime(LOCAL).to_string()
}

/// The time now in a zone, so agents can say how long until something without their own clock
pub fn now(zone: &TimeZone) -> String {
    local(Timestamp::now(), zone)
}

/// Seconds since 1970 as local time in a zone
pub fn local_epoch(seconds: i64, zone: &TimeZone) -> Option<String> {
    Some(local(Timestamp::from_second(seconds).ok()?, zone))
}

/// One of OTP's times (ISO 8601 with an offset) as local time in a zone
pub fn local_otp(text: &str, zone: &TimeZone) -> String {
    match text.parse() {
        Ok(time) => local(time, zone),
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
        assert_eq!(zone(MELBOURNE).iana_name(), Some("Australia/Melbourne"));
        assert_eq!(zone(AUCKLAND).iana_name(), Some("Pacific/Auckland"));
        assert_eq!(zone(PERTH).iana_name(), Some("Australia/Perth"));
    }

    #[test]
    fn reads_local_times_where_the_trip_starts() {
        let time = parse("2026-10-24T08:30", MELBOURNE).unwrap();
        assert_eq!(rfc3339(&time), "2026-10-24T08:30:00+11:00");
        let time = parse("2026-10-24 08:30", PERTH).unwrap();
        assert_eq!(rfc3339(&time), "2026-10-24T08:30:00+08:00");
        let given = parse("2026-10-24T08:30:00+13:00", MELBOURNE).unwrap();
        assert_eq!(rfc3339(&given), "2026-10-24T08:30:00+13:00");
        let named = parse("2026-10-24T08:30[Australia/Melbourne]", PERTH).unwrap();
        assert_eq!(rfc3339(&named), "2026-10-24T08:30:00+11:00");
        assert!(parse("2026-10-24T08:30[Nowhere/Atall]", PERTH).is_err());
        assert!(parse("tomorrow morning", MELBOURNE).is_err());
    }

    #[test]
    fn skips_the_hour_clocks_go_forward() {
        // Melbourne's clocks went from 2:00 to 3:00 on 2026-10-04
        let time = parse("2026-10-04T02:30", MELBOURNE).unwrap();
        assert_eq!(rfc3339(&time), "2026-10-04T03:30:00+11:00");
    }

    #[test]
    fn says_what_time_it_is_there() {
        let (melbourne, auckland) = (now(&zone(MELBOURNE)), now(&zone(AUCKLAND)));
        assert_eq!(melbourne.len(), "2026-10-24T08:30".len());
        assert_ne!(melbourne, auckland);
    }

    #[test]
    fn gives_otps_times_as_local() {
        // A Melbourne tram, as OTP gives it in the graph's Auckland time
        let tram = "2026-10-22T17:07:00+13:00";
        assert_eq!(local_otp(tram, &zone(MELBOURNE)), "2026-10-22T15:07");
        assert_eq!(local_otp(tram, &zone(AUCKLAND)), "2026-10-22T17:07");
        let midnight = local_epoch(1792580400, &zone(MELBOURNE));
        assert_eq!(midnight.as_deref(), Some("2026-10-21T22:00"));
    }
}
