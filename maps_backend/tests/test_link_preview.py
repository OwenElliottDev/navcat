"""Describing shared links for their previews."""

import json
from pathlib import Path

import pytest

from app import link_preview, upstream
from app.link_preview import Description, LinkedView, decode, describe, meta_tags
from app.short_link import encode_osm_shortlink

HOUSE = {
    "housenumber": "260",
    "street": "Elizabeth Street",
    "locality": "Greek Precinct",
    "district": "Melbourne",
    "city": "Melbourne",
    "state": "Victoria",
    "country": "Australia",
}


def view(zoom: int, marked: bool = True) -> LinkedView:
    return LinkedView(144.9631, -37.8136, zoom, marked)


def test_decode():
    decoded = decode(encode_osm_shortlink(144.9631, -37.8136, 16), marked=True)
    assert decoded is not None
    assert (decoded.zoom, decoded.marked) == (16, True)
    assert decoded.long == pytest.approx(144.9631, abs=1e-4)
    assert decode("AA", marked=False) is None


# The app's own place names (describePlace), which a marked spot's preview matches
PLACE_NAMES = json.loads(
    (Path(__file__).parents[2] / "maps_web/src/utils/placeNames.json").read_text()
)


@pytest.mark.parametrize("case", PLACE_NAMES, ids=lambda case: case["name"])
def test_marked_spot_is_named_as_the_app_names_it(case):
    assert describe(view(16), case["properties"]) == Description(case["name"], case["address"])


@pytest.mark.parametrize(
    "zoom, title, detail",
    [
        (15, "Greek Precinct", "Victoria, Australia"),
        (12, "Melbourne", "Victoria, Australia"),
        (5, "Victoria", "Australia"),
    ],
)
def test_unmarked_view_is_named_by_its_area(zoom, title, detail):
    assert describe(view(zoom, marked=False), HOUSE) == Description(title, detail)


def test_nothing_found_falls_back_to_coordinates():
    assert describe(view(16), None) == Description("-37.81360, 144.96310", "Shared location")
    assert describe(view(10, marked=False), None).detail == "Shared map"


def test_meta_tags_are_escaped():
    tags = meta_tags(
        Description('Bob\'s "<Bar>"', "A & B"), "https://maps.example/go/x?m", "https://img"
    )
    assert '<meta property="og:title" content="Bob&#x27;s &quot;&lt;Bar&gt;&quot;" />' in tags
    assert '<meta property="og:description" content="A &amp; B" />' in tags
    assert "<Bar>" not in tags


@pytest.mark.parametrize("body", [b"<html>starting</html>", b"{}", b'{"features": [{}]}'])
def test_photon_answering_nonsense_counts_as_down(monkeypatch, body):
    monkeypatch.setattr(upstream, "get", lambda url, timeout: body)
    with pytest.raises(upstream.Unavailable):
        link_preview.reverse_geocode(view(16))
