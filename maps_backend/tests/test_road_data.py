"""Slimming GraphHopper's road tiles down to what the map overlays show."""

import mapbox_vector_tile

from app.road_data import LAYER, slim_tile

OPTIONS = {"y_coord_down": True}


def graphhopper_tile(*roads: dict) -> bytes:
    """A tile like GraphHopper's: one line per road with its attributes."""
    features = [
        {"geometry": f"LINESTRING({i} 0, {i} 100)", "properties": props}
        for i, props in enumerate(roads)
    ]
    return mapbox_vector_tile.encode(
        [{"name": LAYER, "features": features}], default_options={**OPTIONS, "extents": 4096}
    )


NOTHING_TO_SHOW = {
    "max_speed": "Infinity | Infinity",
    "cycleway": "no | no",
    "bike_network": "missing",
    "road_class": "residential",
}


def test_keeps_only_roads_with_something_to_show():
    raw = graphhopper_tile(
        {**NOTHING_TO_SHOW, "max_speed": "60.0 | 60.0", "surface": "asphalt"},
        NOTHING_TO_SHOW,
        {**NOTHING_TO_SHOW, "road_class": "cycleway", "bike_network": "regional"},
    )
    layer = mapbox_vector_tile.decode(slim_tile(raw), default_options=OPTIONS)[LAYER]

    assert layer["extent"] == 4096
    roads = layer["features"]
    assert [road["properties"] for road in roads] == [
        {"maxspeed": 60},
        {"cycleway": "track", "bike_route": "regional"},
    ]
    # Geometry comes through untouched (lines 0 and 2 of the original)
    assert roads[0]["geometry"]["coordinates"] == [[0, 0], [0, 100]]
    assert roads[1]["geometry"]["coordinates"] == [[2, 0], [2, 100]]


def test_tiles_with_nothing_to_show_are_empty():
    assert slim_tile(graphhopper_tile(NOTHING_TO_SHOW)) == b""
    assert slim_tile(b"") == b""
    other_layer = mapbox_vector_tile.encode([{"name": "other", "features": []}])
    assert slim_tile(other_layer) == b""
