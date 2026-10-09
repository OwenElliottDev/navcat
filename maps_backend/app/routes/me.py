from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request, Response
from psycopg.types.json import Jsonb
from pydantic import Field

from ..auth import CurrentUser, OptionalUser, end_session
from ..db import Db
from ..models import ApiModel, PlaceSnapshot, User
from ..photos import delete_photo_files

router = APIRouter(prefix="/me", tags=["me"])

MAX_RECENTS = 50


class Me(ApiModel):
    user: User | None


@router.get("")
async def get_me(user: OptionalUser) -> Me:
    """Who's signed in. `user` is null when nobody is, so the app can check without an error."""
    return Me(user=user)


@router.delete("", status_code=204)
async def delete_me(user: CurrentUser, request: Request, response: Response, db: Db) -> None:
    """Deletes the account and everything saved with it, including photos.

    Places the user added stay, as other people may have reviewed them.
    """
    await end_session(db, request, response)
    cursor = await db.execute("SELECT id FROM photos WHERE user_id = %s", (user.id,))
    photo_ids = [row["id"] for row in await cursor.fetchall()]
    await db.execute("DELETE FROM users WHERE id = %s", (user.id,))
    delete_photo_files(photo_ids)


# ---------- saved places ----------


class SavedPlaceIn(PlaceSnapshot):
    kind: Literal["home", "work", "favourite"]
    label: str = Field(min_length=1, max_length=80)


class SavedPlace(SavedPlaceIn):
    id: int


class SavedPlaceUpdate(ApiModel):
    label: str = Field(min_length=1, max_length=80)


PLACE_COLUMNS = (
    "id, kind, label, name, address, osm_type, osm_id, ST_X(geom) AS lng, ST_Y(geom) AS lat"
)


@router.get("/places")
async def list_places(user: CurrentUser, db: Db) -> list[SavedPlace]:
    cursor = await db.execute(
        f"SELECT {PLACE_COLUMNS} FROM saved_places WHERE user_id = %s"
        " ORDER BY array_position(ARRAY['home', 'work', 'favourite'], kind), created_at",
        (user.id,),
    )
    return [SavedPlace(**row) for row in await cursor.fetchall()]


@router.post("/places", status_code=201)
async def save_place(place: SavedPlaceIn, user: CurrentUser, db: Db) -> SavedPlace:
    """Saves a place. Saving a new Home or Work replaces the old one."""
    cursor = await db.execute(
        "INSERT INTO saved_places (user_id, kind, label, name, address, osm_type, osm_id, geom)"
        " VALUES (%(user_id)s, %(kind)s, %(label)s, %(name)s, %(address)s, %(osm_type)s, %(osm_id)s,"
        "         ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326))"
        " ON CONFLICT (user_id, kind) WHERE kind IN ('home', 'work') DO UPDATE SET"
        "   label = EXCLUDED.label, name = EXCLUDED.name, address = EXCLUDED.address,"
        "   osm_type = EXCLUDED.osm_type, osm_id = EXCLUDED.osm_id, geom = EXCLUDED.geom, created_at = now()"
        f" RETURNING {PLACE_COLUMNS}",
        {**place.model_dump(), "user_id": user.id},
    )
    return SavedPlace(**await cursor.fetchone())


@router.patch("/places/{place_id}")
async def rename_place(
    place_id: int, update: SavedPlaceUpdate, user: CurrentUser, db: Db
) -> SavedPlace:
    cursor = await db.execute(
        f"UPDATE saved_places SET label = %s WHERE id = %s AND user_id = %s RETURNING {PLACE_COLUMNS}",
        (update.label, place_id, user.id),
    )
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(404, "Saved place not found.")
    return SavedPlace(**row)


@router.delete("/places/{place_id}", status_code=204)
async def delete_place(place_id: int, user: CurrentUser, db: Db) -> None:
    await db.execute("DELETE FROM saved_places WHERE id = %s AND user_id = %s", (place_id, user.id))


# ---------- recent searches ----------


class RecentIn(ApiModel):
    """A search the user made: a place they picked, or a category they browsed."""

    query: str = Field(min_length=1, max_length=200)
    category: str | None = Field(default=None, max_length=40)
    place: PlaceSnapshot | None = None

    @property
    def key(self) -> str:
        """Searches with the same key are the same search; repeating one moves it to the top."""
        if self.place and self.place.osm_type and self.place.osm_id:
            return f"osm:{self.place.osm_type}{self.place.osm_id}"
        if self.place:
            return f"at:{self.place.lng:.5f},{self.place.lat:.5f}"
        if self.category:
            return f"category:{self.category}"
        return f"query:{self.query.strip().lower()}"


class Recent(RecentIn):
    id: int
    searched_at: datetime


async def _recents(db: Db, user_id: int, limit: int) -> list[Recent]:
    cursor = await db.execute(
        "SELECT id, query, category, place, searched_at FROM recent_searches"
        " WHERE user_id = %s ORDER BY searched_at DESC LIMIT %s",
        (user_id, limit),
    )
    return [Recent(**row) for row in await cursor.fetchall()]


@router.get("/recents")
async def list_recents(
    user: CurrentUser, db: Db, limit: int = Query(20, ge=1, le=MAX_RECENTS)
) -> list[Recent]:
    return await _recents(db, user.id, limit)


@router.post("/recents")
async def add_recents(
    searches: list[RecentIn],
    user: CurrentUser,
    db: Db,
    limit: int = Query(20, ge=1, le=MAX_RECENTS),
) -> list[Recent]:
    """Records searches, oldest first (more than one when importing history from the browser).

    Returns the updated list so the app doesn't need a second request.
    """
    for search in searches[-MAX_RECENTS:]:
        place = Jsonb(search.place.model_dump(by_alias=True)) if search.place else None
        await db.execute(
            "INSERT INTO recent_searches (user_id, key, query, category, place)"
            " VALUES (%s, %s, %s, %s, %s)"
            " ON CONFLICT (user_id, key) DO UPDATE SET"
            "   query = EXCLUDED.query, category = EXCLUDED.category, place = EXCLUDED.place,"
            "   searched_at = clock_timestamp()",
            (user.id, search.key, search.query, search.category, place),
        )

    # Keep only the newest
    await db.execute(
        "DELETE FROM recent_searches WHERE user_id = %(user_id)s AND id NOT IN ("
        "  SELECT id FROM recent_searches WHERE user_id = %(user_id)s"
        "  ORDER BY searched_at DESC LIMIT %(keep)s)",
        {"user_id": user.id, "keep": MAX_RECENTS},
    )
    return await _recents(db, user.id, limit)


@router.delete("/recents", status_code=204)
async def clear_recents(user: CurrentUser, db: Db) -> None:
    await db.execute("DELETE FROM recent_searches WHERE user_id = %s", (user.id,))
