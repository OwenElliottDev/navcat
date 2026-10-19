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


# Link previews. These tests' backend has no Photon or TileServer, so spots are described by
# their coordinates and there's no image.
CODE = "uG4HYp~Z"  # Melbourne, zoom 16


def test_resolve_marked_link(client):
    response = client().get(f"/api/links/resolve/{CODE}?m")
    assert response.status == 200, response.body
    resolved = response.json()
    assert (resolved["zoom"], resolved["marked"]) == (16, True)
    assert resolved["long"] == pytest.approx(144.96, abs=0.01)
    assert resolved["lat"] == pytest.approx(-37.81, abs=0.01)
    assert resolved["detail"] == "Shared location"


def test_resolve_rejects_bad_links(client):
    assert client().get("/api/links/resolve/abc-def").status == 422
    assert client().get("/api/links/resolve/AA").status == 404


def test_meta_tags_point_back_at_the_page(client):
    response = client().get(
        f"/api/links/meta/{CODE}?m",
        headers={"Host": "maps.example", "X-Forwarded-Proto": "https"},
    )
    assert response.status == 200, response.body
    assert response.header("content-type").startswith("text/html")
    tags = response.body.decode()
    assert f'<meta property="og:url" content="https://maps.example/go/{CODE}?m" />' in tags
    image = f"https://maps.example/api/links/preview/{CODE}.jpg?m"
    assert f'<meta property="og:image" content="{image}" />' in tags
    assert '<meta property="og:description" content="Shared location" />' in tags
    # Photon is down, so this fallback mustn't be cached in place of the spot's name
    assert response.header("cache-control") == "no-store"


def test_unmarked_meta_tags(client):
    tags = client().get(f"/api/links/meta/{CODE}").body.decode()
    assert '<meta property="og:description" content="Shared map" />' in tags
    assert "?m" not in tags


def test_preview_image_needs_tileserver(client):
    assert client().get(f"/api/links/preview/{CODE}.jpg?m").status == 503
