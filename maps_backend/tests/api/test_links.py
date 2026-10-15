"""OSM shortlinks."""

import pytest


def test_shortlinks_round_trip(client):
    view = {"long": 144.9631, "lat": -37.8136, "zoom": 15}
    response = client().post("/api/links/encode_osm_shortlink", view)
    assert response.status == 200, response.body
    shortlink = response.json()["shortlink"]

    response = client().post("/api/links/decode_osm_shortlink", {"shortlink": shortlink})
    assert response.status == 200, response.body
    decoded = response.json()
    assert decoded["zoom"] == 15
    assert decoded["long"] == pytest.approx(view["long"], abs=1e-4)
    assert decoded["lat"] == pytest.approx(view["lat"], abs=1e-4)


def test_legacy_at_sign_decodes(client):
    old = client().post("/api/links/decode_osm_shortlink", {"shortlink": "@v2juONc--"})
    new = client().post("/api/links/decode_osm_shortlink", {"shortlink": "~v2juONc--"})
    assert old.status == 200, old.body
    assert old.json() == new.json()


@pytest.mark.parametrize(
    "view",
    [
        {"long": 181, "lat": 0, "zoom": 10},
        {"long": 0, "lat": 90, "zoom": 10},
        {"long": 0, "lat": 0, "zoom": 23},
        {"long": 0, "lat": 0, "zoom": -1},
    ],
)
def test_encode_rejects_bad_views(client, view):
    assert client().post("/api/links/encode_osm_shortlink", view).status == 422


@pytest.mark.parametrize("shortlink", ["", "abc-def", "a/b", "AAAAAAAAAAA", "AAA---"])
def test_decode_rejects_bad_shortlinks(client, shortlink):
    response = client().post("/api/links/decode_osm_shortlink", {"shortlink": shortlink})
    assert response.status == 422


def test_decode_rejects_too_short_shortlinks(client):
    assert client().post("/api/links/decode_osm_shortlink", {"shortlink": "AA"}).status == 400
