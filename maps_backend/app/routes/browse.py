import json

from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from psycopg.errors import UndefinedTable

from ..areas import circle_box, geometry_box, reachable
from ..categories import CATEGORIES, CATEGORIES_BY_ID
from ..db import Db
from ..errors import ApiError
from ..models import ApiModel
from ..places import NOT_IMPORTED, PLACES_SQL, Poi, details_from_row
from ..query import BOX, POINT, parse_box, parse_point
from ..upstream import Unavailable

router = APIRouter(prefix="/browse", tags=["browse"])

MAX_RESULTS = 200
# GraphHopper's work grows with the time: a long drive covers much of the road network
MAX_MINUTES = 60


class CategoryOut(ApiModel):
    id: str
    label: str
    words: list[str]
    osm_values: list[str]
    """What's stored for places in this category; the first is used for new places."""


class BrowseResults(ApiModel):
    results: list[Poi]
    truncated: bool
    """True when there were more than `limit` matches: zoom in to see them all."""


BROWSE_SQL = f"""
SELECT osm_type, osm_id, category, tags,
       ST_X(geom) AS lng, ST_Y(geom) AS lat,
       ST_Distance(geom::geography, center::geography) AS distance
FROM ({PLACES_SQL}) AS places,
     ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326) AS center,
     ST_SetSRID(ST_GeomFromGeoJSON(%(area)s::text), 4326) AS area
WHERE category = ANY(%(values)s)
  AND geom && ST_MakeEnvelope(%(west)s, %(south)s, %(east)s, %(north)s, 4326)
  AND (%(radius)s::float8 IS NULL
       OR ST_DWithin(geom::geography, center::geography, %(radius)s::float8))
  AND (area IS NULL OR ST_Intersects(area, geom))
ORDER BY geom <-> center
LIMIT %(limit)s
"""


@router.get("/categories")
async def list_categories() -> list[CategoryOut]:
    return [
        CategoryOut(id=c.id, label=c.label, words=list(c.words), osm_values=list(c.osm_values))
        for c in CATEGORIES
    ]


@router.get("")
async def browse(
    db: Db,
    category: str,
    bbox: str | None = Query(None, pattern=BOX, description="west,south,east,north"),
    near: str | None = Query(
        None,
        pattern=POINT,
        description="lng,lat to measure from; defaults to the middle, or reachable_from",
    ),
    radius: float | None = Query(None, gt=0, description="Metres around `near`, instead of bbox"),
    reachable_from: str | None = Query(
        None,
        pattern=POINT,
        description="lng,lat: places reachable from here by `mode` in `minutes`, instead of bbox",
    ),
    mode: str | None = Query(None, description="With reachable_from: a GraphHopper profile"),
    minutes: int = Query(10, ge=1, le=MAX_MINUTES, description="With reachable_from"),
    limit: int = Query(100, ge=1, le=MAX_RESULTS),
) -> BrowseResults:
    """Places in a category inside a box, a circle or the area reachable in a time, nearest
    first."""
    match = CATEGORIES_BY_ID.get(category)
    if match is None:
        raise HTTPException(404, f"Unknown category '{category}'.")
    if sum(given is not None for given in (bbox, radius, reachable_from)) != 1:
        raise HTTPException(422, "Give one of bbox, radius or reachable_from.")
    if radius is not None and near is None:
        raise HTTPException(422, "radius needs near.")
    if reachable_from is not None and mode is None:
        raise HTTPException(422, "reachable_from needs mode.")

    area = None
    if bbox is not None:
        west, south, east, north = parse_box(bbox)
        lng, lat = parse_point(near) if near else ((west + east) / 2, (south + north) / 2)
    elif radius is not None and near is not None:
        lng, lat = parse_point(near)
        west, south, east, north = circle_box(lng, lat, radius)
    else:
        assert reachable_from is not None and mode is not None
        start = parse_point(reachable_from)
        try:
            area = await run_in_threadpool(reachable, *start, mode, minutes)
        except Unavailable:
            raise ApiError(503, "Routing isn't available right now.", "routing_unavailable")
        west, south, east, north = geometry_box(area)
        lng, lat = parse_point(near) if near else start

    try:
        cursor = await db.execute(
            BROWSE_SQL,
            {
                "values": list(match.osm_values),
                "west": west,
                "south": south,
                "east": east,
                "north": north,
                "lng": lng,
                "lat": lat,
                "radius": radius,
                "area": json.dumps(area) if area else None,
                "limit": limit + 1,  # one extra shows whether there are more
            },
        )
    except UndefinedTable:
        raise HTTPException(503, NOT_IMPORTED)

    rows = await cursor.fetchall()
    return BrowseResults(
        results=[Poi(**details_from_row(row)) for row in rows[:limit]],
        truncated=len(rows) > limit,
    )
