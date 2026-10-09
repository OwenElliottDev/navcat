"""Places as the app sees them: imported POIs (from OSM, plus Overture Maps places OSM doesn't
have) with people's corrections applied, and places people have added. Shared by browse and the
place routes."""

from typing import Literal

from .models import ApiModel

PlaceType = Literal["N", "W", "R", "U", "O"]
"""OSM node, way or relation, U for a place a user added, or O for one from Overture Maps."""

# Every place, as rows of (osm_type, osm_id, category, tags, geom). Corrections override the
# imported tags; a tag corrected to '' has been removed (dropped by clean_tags).
# Not a database view: the POI import replaces the pois table, which a view would block.
# The two halves can be filtered separately (on p.* / u.*) before they're combined.
POI_PLACES_SQL = """
  SELECT p.osm_type, p.osm_id, p.category, p.geom, p.tags || coalesce(e.tags, '{}') AS tags
  FROM pois p LEFT JOIN place_edits e USING (osm_type, osm_id)
"""
USER_PLACES_SQL = """
  SELECT 'U' AS osm_type, u.id AS osm_id, u.category, u.geom,
         u.tags || jsonb_build_object('name', u.name) AS tags
  FROM user_places u
"""
PLACES_SQL = f"{POI_PLACES_SQL} UNION ALL {USER_PLACES_SQL}"

PLACE_COLUMNS = "osm_type, osm_id, category, tags, ST_X(geom) AS lng, ST_Y(geom) AS lat"

NOT_IMPORTED = "Browse data hasn't been imported yet. Check the poi-import container."


class PoiDetails(ApiModel):
    """A place with all its tags (hours, phone, website...)."""

    osm_type: PlaceType
    osm_id: int
    name: str | None
    category: str
    lng: float
    lat: float
    tags: dict[str, str]


class Poi(PoiDetails):
    distance: float
    """Metres from where the search was centred."""


def clean_tags(tags: dict) -> dict[str, str]:
    """Drops tags that a correction removed (set to '')."""
    return {key: str(value) for key, value in tags.items() if value != ""}


def details_from_row(row: dict) -> dict:
    """A database row as PoiDetails fields."""
    tags = clean_tags(row["tags"])
    return {**row, "tags": tags, "name": tags.get("name")}
