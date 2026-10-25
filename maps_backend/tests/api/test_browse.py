"""Browsing a circle, or the area reachable in a time (with a stand-in GraphHopper)."""

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import ClassVar
from urllib.parse import parse_qs, urlparse

import pytest

from tests.client import Client

from .conftest import CENTRE, _serve

NEAR = f"{CENTRE[0]},{CENTRE[1]}"

# A square around Cafe One and Cafe Two that stops short of Overture Coffee
REACHABLE = {
    "type": "Polygon",
    "coordinates": [
        [[144.999, -37.801], [145.0025, -37.801], [145.0025, -37.799], [144.999, -37.799]]
        + [[144.999, -37.801]]
    ],
}


@pytest.fixture(autouse=True)
def _places(places):
    pass


class _GraphHopper(BaseHTTPRequestHandler):
    asked: ClassVar[list[dict]] = []

    def log_message(self, format, *args):
        pass

    def do_GET(self):
        params = {k: v[0] for k, v in parse_qs(urlparse(self.path).query).items()}
        _GraphHopper.asked.append(params)
        if params.get("profile") == "boat":
            status, body = 400, {"message": "The requested profile 'boat' does not exist"}
        else:
            status, body = 200, {"polygons": [{"type": "Feature", "geometry": REACHABLE}]}
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())


@pytest.fixture(scope="module")
def routed(base_url, database_url, photos_dir):
    """Another backend on the same database, with a GraphHopper that answers isochrones."""
    graphhopper = ThreadingHTTPServer(("127.0.0.1", 0), _GraphHopper)
    threading.Thread(target=graphhopper.serve_forever, daemon=True).start()
    try:
        url = f"http://127.0.0.1:{graphhopper.server_address[1]}"
        with _serve(database_url, photos_dir, GRAPHHOPPER_URL=url) as backend:
            yield Client(backend)
    finally:
        graphhopper.shutdown()


def ids(response) -> list[str]:
    assert response.status == 200, response.body
    return [f"{r['osmType']}/{r['osmId']}" for r in response.json()["results"]]


# Their names, as in conftest's POIS (other tests rename some)
CAFE_ONE, CAFE_TWO, CAFE_FAR, OUTSIDE_CAFE, OVERTURE_COFFEE = "N/1", "N/2", "N/3", "N/6", "O/1"


def browse(c, **params):
    return c.get("/api/browse", params={"category": "cafe", **params})


# ---------- radius ----------


def test_browse_within_a_radius(client):
    response = browse(client(), near=NEAR, radius=250)
    found = ids(response)
    # Cafe Two is ~176 m east, Overture Coffee ~264 m
    assert CAFE_ONE in found
    assert CAFE_TWO in found
    assert {OVERTURE_COFFEE, CAFE_FAR}.isdisjoint(found)
    assert all(r["distance"] <= 250 for r in response.json()["results"])


def test_truncated_only_counts_places_in_the_circle(client):
    c = client()
    inside = len(ids(browse(c, near=NEAR, radius=250)))
    assert browse(c, near=NEAR, radius=250, limit=inside).json()["truncated"] is False
    assert browse(c, near=NEAR, radius=250, limit=inside - 1).json()["truncated"] is True


def test_a_radius_bigger_than_the_world(client):
    found = ids(browse(client(), near=NEAR, radius=50_000_000))
    assert OUTSIDE_CAFE in found


def test_browse_needs_one_area(client):
    c = client()
    assert browse(c).status == 422
    assert browse(c, near=NEAR, radius=100, bbox="144,-38,146,-37").status == 422
    assert browse(c, radius=100).status == 422  # around where?
    assert browse(c, near=NEAR, radius=0).status == 422
    assert browse(c, reachable_from=NEAR).status == 422  # by what?


# ---------- reachable_from ----------


def test_browse_where_you_can_get_to(routed):
    response = browse(routed, reachable_from=NEAR, mode="foot", minutes=5)
    found = ids(response)
    assert CAFE_ONE in found
    assert CAFE_TWO in found
    assert {OVERTURE_COFFEE, CAFE_FAR}.isdisjoint(found)  # outside the area
    assert response.json()["results"][0]["distance"] < 1  # measured from reachable_from
    asked = _GraphHopper.asked[-1]
    assert asked["point"] == f"{CENTRE[1]},{CENTRE[0]}"  # GraphHopper's lat,lng
    assert (asked["profile"], asked["time_limit"]) == ("foot", "300")


def test_reachable_passes_on_why_graphhopper_said_no(routed):
    response = browse(routed, reachable_from=NEAR, mode="boat")
    assert response.status == 400
    assert response.json()["detail"] == "The requested profile 'boat' does not exist"
    assert browse(routed, reachable_from=NEAR, mode="foot", minutes=61).status == 422


def test_reachable_when_graphhopper_is_down(client):
    assert browse(client(), reachable_from=NEAR, mode="foot").status == 503
    # Nothing else in browse needs it
    assert browse(client(), near=NEAR, radius=250).status == 200
