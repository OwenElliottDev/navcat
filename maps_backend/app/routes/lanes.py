from fastapi import APIRouter, HTTPException
from psycopg.errors import UndefinedTable
from pydantic import Field

from ..db import Db
from ..models import ApiModel
from ..places import NOT_IMPORTED

router = APIRouter(prefix="/lanes", tags=["lanes"])

Point = tuple[float, float]


class Approach(ApiModel):
    """The road a route takes into a turn: its OSM way, and two points on it in the order
    the route travels them."""

    way_id: int
    start: Point
    end: Point


class LanesQuery(ApiModel):
    approaches: list[Approach] = Field(max_length=500)


# turn:lanes for the direction each approach travels the way. :forward and :backward are for
# two-way roads; plain turn:lanes is for one-way roads, in their one direction.
LANES_SQL = """
SELECT a.i,
       CASE WHEN ST_LineLocatePoint(t.geom, ST_SetSRID(ST_MakePoint(a.x1, a.y1), 4326))
              <= ST_LineLocatePoint(t.geom, ST_SetSRID(ST_MakePoint(a.x2, a.y2), 4326))
            THEN coalesce(t.forward, CASE WHEN t.oneway = 'yes' THEN t.lanes END)
            ELSE coalesce(t.backward, CASE WHEN t.oneway = '-1' THEN t.lanes END)
       END AS lanes
FROM unnest(%(ways)s::bigint[], %(x1)s::float8[], %(y1)s::float8[], %(x2)s::float8[],
            %(y2)s::float8[]) WITH ORDINALITY AS a(way_id, x1, y1, x2, y2, i)
JOIN turn_lanes t USING (way_id)
"""


@router.post("")
async def get_lanes(query: LanesQuery, db: Db) -> list[str | None]:
    """Which way each lane goes on the road into each turn, e.g. "left|through|through;right"
    (lanes left to right), or null where OSM doesn't say."""
    approaches = query.approaches
    try:
        cursor = await db.execute(
            LANES_SQL,
            {
                "ways": [a.way_id for a in approaches],
                "x1": [a.start[0] for a in approaches],
                "y1": [a.start[1] for a in approaches],
                "x2": [a.end[0] for a in approaches],
                "y2": [a.end[1] for a in approaches],
            },
        )
    except UndefinedTable:
        raise HTTPException(503, NOT_IMPORTED)

    lanes: list[str | None] = [None] * len(approaches)
    for row in await cursor.fetchall():
        lanes[row["i"] - 1] = row["lanes"]
    return lanes
