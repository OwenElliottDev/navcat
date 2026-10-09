"""Slimmed-down road data from GraphHopper's vector tiles, for map overlays.

GraphHopper serves its routing graph as tiles carrying every road attribute it knows (about
45 per road, with values like "40.0 | 40.0" for the two directions). The overlays need three,
so each tile is cut down to the roads that have something to show, with plain values:

    maxspeed: 40          the posted speed limit in km/h
    cycleway: "lane"      the best bike infrastructure on the road: track, lane or shared
    bike_route: "local"   part of a signed cycle route (local, regional, national...)
"""

import io

import mapbox_vector_tile
import pycurl

from .config import settings

LAYER = "roads"
TILE_OPTIONS = {"y_coord_down": True}  # keep coordinates exactly as GraphHopper sent them

# Best first; GraphHopper's "separate" means the bike path is mapped as its own way
CYCLEWAYS = ["track", "lane", "shoulder", "shared_lane"]


class GraphHopperUnavailable(Exception):
    """GraphHopper isn't answering, e.g. still importing."""


def fetch_tile(z: int, x: int, y: int) -> bytes:
    """GraphHopper's tile for z/x/y (blocking: run it in a thread)."""
    buffer = io.BytesIO()
    curl = pycurl.Curl()
    try:
        curl.setopt(pycurl.URL, f"{settings.graphhopper_url}/mvt/{z}/{x}/{y}.mvt")
        curl.setopt(pycurl.WRITEDATA, buffer)
        curl.setopt(pycurl.TIMEOUT, 60)
        curl.perform()
        status = curl.getinfo(pycurl.RESPONSE_CODE)
    except pycurl.error as err:
        raise GraphHopperUnavailable(str(err)) from err
    finally:
        curl.close()
    if status != 200:
        raise GraphHopperUnavailable(f"GraphHopper answered {status}")
    return buffer.getvalue()


def _directions(value) -> list[str]:
    """ "no | lane" -> ["no", "lane"]; values without a direction come back as one item."""
    return [] if value is None else [part.strip() for part in str(value).split("|")]


def max_speed(properties: dict) -> int | None:
    speeds = [
        float(v) for v in _directions(properties.get("max_speed")) if v not in ("", "Infinity")
    ]
    return round(max(speeds)) if speeds else None


def cycleway(properties: dict) -> str | None:
    if properties.get("road_class") == "cycleway":
        return "track"  # a dedicated bike path is as good as a protected track
    found = [v for v in _directions(properties.get("cycleway")) if v in CYCLEWAYS]
    return min(found, key=CYCLEWAYS.index) if found else None


def bike_route(properties: dict) -> str | None:
    network = properties.get("bike_network")
    return network if network and network != "missing" else None


def slim_tile(data: bytes) -> bytes:
    """Keeps only roads with a speed limit, bike infrastructure or a cycle route."""
    layer = mapbox_vector_tile.decode(data, default_options=TILE_OPTIONS).get(LAYER)
    if not layer:
        return b""

    features = []
    for feature in layer["features"]:
        props = feature["properties"]
        slim = {
            "maxspeed": max_speed(props),
            "cycleway": cycleway(props),
            "bike_route": bike_route(props),
        }
        slim = {key: value for key, value in slim.items() if value is not None}
        if slim:
            features.append({"geometry": feature["geometry"], "properties": slim})

    if not features:
        return b""
    return mapbox_vector_tile.encode(
        [{"name": LAYER, "features": features}],
        default_options={**TILE_OPTIONS, "extents": layer["extent"]},
    )
