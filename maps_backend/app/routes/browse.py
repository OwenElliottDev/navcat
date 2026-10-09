from fastapi import APIRouter, HTTPException, Query
from psycopg.errors import UndefinedTable

from ..categories import CATEGORIES, CATEGORIES_BY_ID
from ..db import Db
from ..models import ApiModel
from ..places import NOT_IMPORTED, PLACES_SQL, Poi, details_from_row

router = APIRouter(prefix="/browse", tags=["browse"])

MAX_RESULTS = 200
NUMBER = r"-?\d+(\.\d+)?"


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
FROM ({PLACES_SQL}) AS places, ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326) AS center
WHERE category = ANY(%(values)s)
  AND geom && ST_MakeEnvelope(%(west)s, %(south)s, %(east)s, %(north)s, 4326)
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
    bbox: str = Query(pattern=rf"^{NUMBER}(,{NUMBER}){{3}}$", description="west,south,east,north"),
    near: str | None = Query(
        None,
        pattern=rf"^{NUMBER},{NUMBER}$",
        description="lng,lat; defaults to the middle",
    ),
    limit: int = Query(100, ge=1, le=MAX_RESULTS),
) -> BrowseResults:
    """Places in a category inside the box, nearest first."""
    match = CATEGORIES_BY_ID.get(category)
    if match is None:
        raise HTTPException(404, f"Unknown category '{category}'.")

    west, south, east, north = (float(n) for n in bbox.split(","))
    lng, lat = (
        (float(n) for n in near.split(",")) if near else ((west + east) / 2, (south + north) / 2)
    )

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
                "limit": limit + 1,  # one extra tells us whether there are more
            },
        )
    except UndefinedTable:
        raise HTTPException(503, NOT_IMPORTED)

    rows = await cursor.fetchall()
    return BrowseResults(
        results=[Poi(**details_from_row(row)) for row in rows[:limit]],
        truncated=len(rows) > limit,
    )
