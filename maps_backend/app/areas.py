"""Areas to browse in besides a box: a circle, or where you can get to in a time (GraphHopper's
isochrone)."""

import json
from math import asin, cos, degrees, radians, sin
from urllib.parse import urlencode

from . import upstream
from .capabilities import fetch_routing
from .config import settings
from .errors import ApiError

type Box = tuple[float, float, float, float]
"""west, south, east, north"""

EARTH_RADIUS = 6_371_008.8  # metres, on average
TIMEOUT = 30


def circle_box(lng: float, lat: float, radius: float) -> Box:
    """A box around a circle, for the index to narrow places down before measuring each."""
    # Distances are measured on the spheroid, up to 0.5% off the sphere this works on
    d = radius * 1.01 / EARTH_RADIUS
    south, north = max(lat - degrees(d), -90), min(lat + degrees(d), 90)
    if south == -90 or north == 90 or sin(d) >= cos(radians(lat)):
        return -180, south, 180, north  # around a pole: every longitude
    dlng = degrees(asin(sin(d) / cos(radians(lat))))
    west, east = lng - dlng, lng + dlng
    if west < -180 or east > 180:
        return -180, south, 180, north  # across the antimeridian
    return west, south, east, north


def _points(coordinates):
    if isinstance(coordinates[0], (int, float)):
        yield coordinates
    else:
        for part in coordinates:
            yield from _points(part)


def geometry_box(geometry: dict) -> Box:
    lngs, lats = zip(*((p[0], p[1]) for p in _points(geometry["coordinates"])))
    return min(lngs), min(lats), max(lngs), max(lats)


def reachable(lng: float, lat: float, mode: str, minutes: int) -> dict:
    """The area reachable from a point within the time, as a GeoJSON (Multi)Polygon (blocking:
    run it in a thread)."""
    params = {"point": f"{lat},{lng}", "profile": mode, "time_limit": minutes * 60, "buckets": 1}
    try:
        body = upstream.get(f"{settings.graphhopper_url}/isochrone?{urlencode(params)}", TIMEOUT)
    except upstream.Rejected as err:
        # GraphHopper's two answers for what the caller asked; anything else is a bug here
        if mode not in fetch_routing().profiles:
            raise ApiError(
                422,
                f"There's no travel mode {mode!r}; /api/capabilities lists them.",
                "unknown_mode",
            ) from err
        if err.reason.startswith("Point not found"):
            raise ApiError(
                422,
                "There's no road for that travel mode near the point.",
                "point_not_found",
            ) from err
        raise
    try:
        return json.loads(body)["polygons"][0]["geometry"]
    except (ValueError, KeyError, IndexError, TypeError) as err:
        raise upstream.Unavailable(f"GraphHopper's isochrone didn't make sense: {err}") from err
