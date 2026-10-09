"""Smoke tests for a running stack, through the web container's nginx like the browser.

Checks every service answers with real data and that nginx routes each path to the right one:

    MAPS_URL=http://localhost:7000 uv run pytest tests/smoke

Skipped unless MAPS_URL is set. The places used default to Melbourne; for another region set
SMOKE_FROM and SMOKE_TO (lng,lat a short walk apart, near public transport if it's set up) and
SMOKE_QUERY (a name search should find).
"""

import json
import math
import os
from urllib.parse import urlparse

import pytest

from tests.client import Client

MAPS_URL = os.environ.get("MAPS_URL", "").rstrip("/")
pytestmark = pytest.mark.skipif(not MAPS_URL, reason="set MAPS_URL to smoke test a running stack")


def _point(name: str, default: str) -> tuple[float, float]:
    lng, lat = (float(n) for n in os.environ.get(name, default).split(","))
    return lng, lat


FROM = _point("SMOKE_FROM", "144.9671,-37.8183")  # Flinders Street Station
TO = _point("SMOKE_TO", "144.9631,-37.8102")  # Melbourne Central
QUERY = os.environ.get("SMOKE_QUERY", "Flinders Street")


client = Client(MAPS_URL)


def fetch(path: str, body: dict | None = None, params: dict | None = None):
    """(status, content type, body bytes) for a GET, or a JSON POST when `body` is given."""
    if body is None:
        response = client.get(path, params=params)
    else:
        response = client.post(path, body, params=params)
    return response.status, response.header("content-type") or "", response.body


def fetch_json(path: str, body: dict | None = None, params: dict | None = None):
    status, _, data = fetch(path, body, params)
    assert status == 200, f"{path} answered {status}: {data[:300]!r}"
    return json.loads(data)


def tile_at(lng: float, lat: float, z: int) -> tuple[int, int]:
    n = 2**z
    x = int((lng + 180) / 360 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return x, y


def test_web_app_is_served():
    status, content_type, body = fetch("/")
    assert status == 200 and "text/html" in content_type
    assert b'id="root"' in body


def test_backend_has_its_database_and_browse_data():
    health = fetch_json("/api/health")
    assert health["postgis"], "PostGIS missing"
    assert health["pois"] and health["pois"]["poi_count"] > 0, "POIs not imported"


def test_map_style_only_points_back_at_this_server():
    """The style's tile, glyph and sprite URLs must come back through the proxy: anything
    else is either broken (an internal host name) or an internet call."""
    style = fetch_json("/styles/basic-preview/style.json")
    host = urlparse(MAPS_URL).netloc
    urls = [style.get("glyphs", ""), str(style.get("sprite", ""))]
    for source in style["sources"].values():
        urls.append(source.get("url", ""))
        urls.extend(source.get("tiles", []))
    for url in filter(None, urls):
        parsed = urlparse(url)
        if parsed.scheme in ("http", "https"):
            assert parsed.netloc == host, f"style points at {url}"

    # The tiles themselves, via the TileJSON the style names
    tilejson_url = next(s["url"] for s in style["sources"].values() if s.get("url"))
    tilejson = fetch_json(urlparse(tilejson_url).path)
    x, y = tile_at(*FROM, 14)
    tile_path = urlparse(tilejson["tiles"][0]).path.format(z=14, x=x, y=y)
    status, _, data = fetch(tile_path)
    assert status == 200 and data, f"no map tile at {tile_path}"


def test_search_finds_places():
    found = fetch_json(
        "/api/search", params={"q": QUERY, "limit": 3, "lat": FROM[1], "lon": FROM[0]}
    )
    assert found["features"], f"no search results for {QUERY!r}"


def test_reverse_geocoding_names_a_point():
    found = fetch_json("/api/reverse", params={"lat": FROM[1], "lon": FROM[0]})
    assert found["features"]


def test_routing_offers_the_apps_travel_modes():
    info = fetch_json("/api/info")
    profiles = {p["name"] for p in info["profiles"]}
    assert {"foot", "bike", "car"} <= profiles


@pytest.mark.parametrize("profile", ["foot", "bike", "car"])
def test_routing_finds_a_route(profile):
    route = fetch_json(
        "/api/route",
        body={
            "profile": profile,
            "points": [list(FROM), list(TO)],
            "points_encoded": False,
            "instructions": True,
            "details": ["osm_way_id"],
        },
    )
    path = route["paths"][0]
    assert path["distance"] > 0 and path["instructions"]


def test_lane_lookup_answers():
    assert fetch_json("/api/lanes", body={"approaches": []}) == []


def test_road_data_overlay_tiles():
    x, y = tile_at(*FROM, 15)
    status, content_type, _ = fetch(f"/api/road-data/15/{x}/{y}.mvt")
    assert status == 200 and "vector-tile" in content_type


def test_browse_finds_places_nearby():
    categories = fetch_json("/api/browse/categories")
    assert any(c["id"] == "cafe" for c in categories)
    lng, lat = FROM
    bbox = f"{lng - 0.02},{lat - 0.02},{lng + 0.02},{lat + 0.02}"
    found = fetch_json("/api/browse", params={"category": "cafe", "bbox": bbox})
    assert found["results"], "no cafes near SMOKE_FROM"


def test_public_transport_has_timetables_and_plans():
    status, _, body = fetch("/api/transit", body={"query": "{ routes { mode } }"})
    if status in (502, 503, 504):
        pytest.skip("OpenTripPlanner isn't running (public transport may not be set up)")
    routes = json.loads(body)["data"]["routes"]
    assert routes, "no public transport routes loaded"

    plan = fetch_json(
        "/api/transit",
        body={
            "query": "query($from: PlanCoordinateInput!, $to: PlanCoordinateInput!) {"
            " planConnection(origin: {location: {coordinate: $from}},"
            " destination: {location: {coordinate: $to}}, first: 1) { edges { node { duration } } } }",
            "variables": {
                "from": {"longitude": FROM[0], "latitude": FROM[1]},
                "to": {"longitude": TO[0], "latitude": TO[1]},
            },
        },
    )
    assert plan["data"]["planConnection"]["edges"], "no journey between SMOKE_FROM and SMOKE_TO"


def test_terrain_tiles_when_built():
    status, _, body = fetch("/terrain/info.json")
    if status == 404:
        pytest.skip("terrain not built")
    assert status == 200 and json.loads(body)
