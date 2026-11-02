"""What this stack can plan: GraphHopper's travel modes and the route options its road data
supports, and the public transport in OpenTripPlanner's timetables.

Route options are GraphHopper custom model rules, sent with a route request as
{"custom_model": {"priority": [...rules]}, "ch.disable": true}. They make roads less likely
rather than forbidding them, so a route is still found when there's no other way.
"""

import json
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

from . import upstream
from .config import settings
from .models import ApiModel

TIMEOUT = 5
# Short enough to see a new graph or timetables soon after an update
CACHE_SECONDS = 60

type Rule = dict[str, str]


@dataclass(frozen=True)
class Avoid:
    needs: str
    """The encoded value its rule uses; hidden when the routing graph doesn't have it."""
    condition: str
    factor: float


# The GraphHopper profiles (docker_maps/graphhopper/config.yml) each kind of option is for
DRIVING = ("car",)
WALKING_AND_CYCLING = ("foot", "bike", "bike_paths", "racingbike", "gravel", "mtb")

# What a drive can avoid
AVOIDS = {
    "motorways": Avoid("road_class", "road_class == MOTORWAY", 0.1),
    "tolls": Avoid("toll", "toll == ALL", 0.1),
    "ferries": Avoid("road_environment", "road_environment == FERRY", 0.1),
    # Roads touching a highway=traffic_signals node or a signalised crossing (GraphHopper here
    # is patched for the former: docker_maps/graphhopper/traffic-signals.patch)
    "traffic_lights": Avoid("crossing", "crossing == TRAFFIC_SIGNALS", 0.4),
    "small_roads": Avoid(
        "road_class",
        "road_class == RESIDENTIAL || road_class == SERVICE || road_class == UNCLASSIFIED"
        " || road_class == LIVING_STREET || road_class == TRACK",
        0.4,
    ),
}

# "Avoid steep hills" for walks and rides, e.g. with a wheelchair or pram. max_slope is a road's
# steepest stretch in %, signed by the direction of travel, so steep descents count too. 5%
# (1:20) is about the most an accessible path should have and 8% (1:12) the steepest ramp allowed.
STEEP_HILLS_NEEDS = "max_slope"
STEEP_HILLS: list[Rule] = [
    {"if": "max_slope >= 12 || max_slope <= -12", "multiply_by": "0.05"},
    {"else_if": "max_slope >= 8 || max_slope <= -8", "multiply_by": "0.2"},
    {"else_if": "max_slope >= 5 || max_slope <= -5", "multiply_by": "0.6"},
]

TRANSIT_QUERY = """{
  routes { mode }
  agencies { timezone }
  serviceTimeRange { start end }
}"""


class AvoidOption(ApiModel):
    id: str
    profiles: list[str]
    """The travel modes it's for"""
    priority: list[Rule]


class SteepHills(ApiModel):
    profiles: list[str]
    """The travel modes it's for"""
    priority: list[Rule]


class Routing(ApiModel):
    area: list[float] | None
    """[west, south, east, north]"""
    profiles: list[str]
    """GraphHopper's travel modes; public transport is planned by OpenTripPlanner."""
    avoid: list[AvoidOption]
    """What a drive can avoid here"""
    steep_hills: SteepHills | None
    """For walks and rides, when the routing graph knows how steep roads are and has one of them"""


class Transit(ApiModel):
    modes: list[str]
    timetables_from: str | None
    """The first and last days the timetables have services, e.g. "2026-10-24"."""
    timetables_until: str | None


class Capabilities(ApiModel):
    routing: Routing | None
    """None while GraphHopper isn't answering"""
    transit: Transit | None
    """None while OpenTripPlanner isn't answering"""


def routing_from_info(info: dict) -> Routing:
    has = set(info.get("encoded_values") or {})
    profiles = [profile["name"] for profile in info["profiles"]]
    driving = [p for p in profiles if p in DRIVING]
    walking_and_cycling = [p for p in profiles if p in WALKING_AND_CYCLING]
    return Routing(
        area=info.get("bbox"),
        profiles=profiles,
        avoid=[
            AvoidOption(
                id=name,
                profiles=driving,
                priority=[{"if": avoid.condition, "multiply_by": str(avoid.factor)}],
            )
            for name, avoid in AVOIDS.items()
            if avoid.needs in has and driving
        ],
        steep_hills=SteepHills(profiles=walking_and_cycling, priority=STEEP_HILLS)
        if STEEP_HILLS_NEEDS in has and walking_and_cycling
        else None,
    )


def _day(seconds: int | None, zone: ZoneInfo) -> str | None:
    if seconds is None:
        return None
    return datetime.fromtimestamp(seconds, zone).date().isoformat()


def transit_from_data(data: dict) -> Transit:
    # Every feed is in the graph's one zone (docker_maps/download/transit_prepare.py)
    try:
        zone = ZoneInfo(data["agencies"][0]["timezone"])
    except (IndexError, KeyError):  # incl. ZoneInfoNotFoundError
        zone = ZoneInfo("UTC")
    span = data.get("serviceTimeRange") or {}
    end = span.get("end")
    return Transit(
        modes=sorted({route["mode"] for route in data["routes"]}),
        timetables_from=_day(span.get("start"), zone),
        # The range ends at midnight after the last day
        timetables_until=_day(end - 1 if end is not None else None, zone),
    )


def _cached[T](fetch: Callable[[], T]) -> Callable[[], T]:
    """Keeps a successful answer for CACHE_SECONDS. Failures aren't kept, so a service that was
    down is asked again next time."""
    kept: tuple[float, T] | None = None

    def cached() -> T:
        nonlocal kept
        now = time.monotonic()
        if kept is None or now - kept[0] > CACHE_SECONDS:
            kept = (now, fetch())
        return kept[1]

    return cached


@_cached
def fetch_routing() -> Routing:
    """Blocking: run it in a thread."""
    body = upstream.get(f"{settings.graphhopper_url}/info", timeout=TIMEOUT)
    try:
        return routing_from_info(json.loads(body))
    except (ValueError, KeyError, TypeError) as err:
        raise upstream.Unavailable(f"GraphHopper's /info didn't make sense: {err}") from err


@_cached
def fetch_transit() -> Transit:
    """Blocking: run it in a thread."""
    url = f"{settings.otp_url}/otp/gtfs/v1"
    body = upstream.post_json(url, {"query": TRANSIT_QUERY}, timeout=TIMEOUT)
    try:
        return transit_from_data(json.loads(body)["data"])
    except (ValueError, KeyError, TypeError) as err:
        raise upstream.Unavailable(f"OpenTripPlanner's answer didn't make sense: {err}") from err
