"""Describing shared links for their previews."""

import io
import json
import math
import threading
from pathlib import Path

import anyio
import pytest
from PIL import Image

from app import link_preview, upstream
from app.link_preview import (
    Description,
    LinkedView,
    decode,
    describe,
    meta_tags,
    render_image,
    search_radius,
)
from app.routes import links
from app.short_link import encode_osm_shortlink
from tests.images import phone_photo

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


def test_coordinates_drop_the_sign_from_zero_as_the_app_does():
    near_zero = LinkedView(151.2, -0.000001, 16, True)
    assert describe(near_zero, None).title == "0.00000, 151.20000"


def test_marked_spots_search_as_near_as_the_app():
    assert search_radius(view(5)) is None


def test_unmarked_views_search_out_to_the_preview_edge():
    outback = LinkedView(134, -29, 5, False)
    assert search_radius(outback) == 642
    assert search_radius(LinkedView(134, -29, 6, False)) == 321
    # Never under Photon's own default
    assert search_radius(view(17, marked=False)) == 1


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


@pytest.mark.parametrize("marked", [False, True])
@pytest.mark.parametrize(
    "body",
    [b"<html>starting</html>", phone_photo(fmt="JPEG")[:2000], phone_photo(fmt="PNG")],
    ids=["html", "cut-off-jpeg", "png"],
)
def test_tileserver_answering_nonsense_counts_as_down(monkeypatch, body, marked):
    monkeypatch.setattr(upstream, "get", lambda url, timeout: body)
    with pytest.raises(upstream.Unavailable):
        render_image(view(16, marked))


def test_unmarked_image_is_tileservers(monkeypatch):
    jpeg = phone_photo(1200, 630)
    monkeypatch.setattr(upstream, "get", lambda url, timeout: jpeg)
    assert render_image(view(16, marked=False)) == jpeg
    assert Image.open(io.BytesIO(render_image(view(16)))).format == "JPEG"


def test_unlimited_previews_are_never_turned_away():
    pool = links._Pool(math.inf)
    release = threading.Event()

    async def main():
        async with anyio.create_task_group() as tasks:
            try:
                for _ in range(20):
                    tasks.start_soon(pool.run, lambda _: release.wait(5), view(16))
                await anyio.wait_all_tasks_blocked()
                assert pool.pending == 20
                assert pool.limiter.borrowed_tokens == 20  # all running, none queued
            finally:
                release.set()

    anyio.run(main)


def test_previews_past_the_queue_are_turned_away():
    pool = links._Pool(1)
    release = threading.Event()

    def busy(_: LinkedView) -> None:
        release.wait(5)

    async def main():
        async with anyio.create_task_group() as tasks:
            try:
                for _ in range(5):  # one running, four waiting
                    tasks.start_soon(pool.run, busy, view(16))
                await anyio.wait_all_tasks_blocked()
                with pytest.raises(upstream.Unavailable):
                    await pool.run(busy, view(16))
            finally:
                release.set()

    anyio.run(main)
