"""Unit tests for logic that doesn't need a database. The HTTP API is checked end to end."""

from app.auth import LoginThrottle, hash_password, verify_password
from app.categories import CATEGORIES
from app.models import PlaceSnapshot
from app.road_data import bike_route, cycleway, max_speed
from app.routes.lanes import LanesQuery
from app.routes.me import RecentIn


def test_category_ids_are_unique():
    ids = [c.id for c in CATEGORIES]
    assert len(ids) == len(set(ids))


def test_passwords_verify_only_against_their_hash():
    password_hash = hash_password("correct horse")
    assert verify_password(password_hash, "correct horse")
    assert not verify_password(password_hash, "wrong")
    # No such user: still runs a hash check, still fails
    assert not verify_password(None, "correct horse")


def test_throttle_blocks_after_limit_and_resets():
    throttle = LoginThrottle(limit=2, window=60)
    throttle.record_failure("ip:1")
    assert not throttle.is_blocked("ip:1")
    throttle.record_failure("ip:1")
    assert throttle.is_blocked("ip:1", "user:someone")
    throttle.reset("ip:1")
    assert not throttle.is_blocked("ip:1")


def test_recent_keys_identify_the_same_search():
    cafe = PlaceSnapshot(name="Cafe", lng=145.0, lat=-37.8, osm_type="N", osm_id=42)
    pin = PlaceSnapshot(name="-37.8, 145.0", lng=145.0, lat=-37.8)

    assert (
        RecentIn(query="caf", place=cafe).key == RecentIn(query="cafe", place=cafe).key == "osm:N42"
    )
    assert RecentIn(query="pin", place=pin).key == "at:145.00000,-37.80000"
    assert RecentIn(query="Cafes", category="cafe").key == "category:cafe"
    assert RecentIn(query=" Pizza ").key == RecentIn(query="pizza").key


def test_json_uses_camel_case():
    place = PlaceSnapshot(name="x", lng=1, lat=2, osm_type="W", osm_id=7)
    assert place.model_dump(by_alias=True)["osmType"] == "W"
    assert PlaceSnapshot.model_validate({"name": "x", "lng": 1, "lat": 2, "osmId": 7}).osm_id == 7


def test_road_data_reads_graphhoppers_two_direction_values():
    assert max_speed({"max_speed": "40.0 | 40.0"}) == 40
    assert max_speed({"max_speed": "Infinity | 60.0"}) == 60
    assert max_speed({"max_speed": "Infinity | Infinity"}) is None
    # The better side wins; "separate" (mapped as its own path) and "no" don't count
    assert cycleway({"cycleway": "no | lane"}) == "lane"
    assert cycleway({"cycleway": "lane | track"}) == "track"
    assert cycleway({"cycleway": "no | separate"}) is None
    assert cycleway({"cycleway": "missing | missing", "road_class": "cycleway"}) == "track"
    assert bike_route({"bike_network": "local"}) == "local"
    assert bike_route({"bike_network": "missing"}) is None


def test_overture_places_are_a_place_type():
    place = PlaceSnapshot(name="Cafe", lng=145.0, lat=-37.8, osm_type="O", osm_id=7)
    assert RecentIn(query="cafe", place=place).key == "osm:O7"


def test_lanes_query_reads_camel_case_approaches():
    query = LanesQuery.model_validate(
        {"approaches": [{"wayId": 42, "start": [145.0, -37.8], "end": [145.001, -37.8]}]}
    )
    assert query.approaches[0].way_id == 42
    assert query.approaches[0].end == (145.001, -37.8)
