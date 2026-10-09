from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from psycopg.errors import UndefinedTable
from psycopg.types.json import Jsonb
from pydantic import Field, field_validator

from ..auth import CurrentUser, OptionalUser
from ..db import Db
from ..models import ApiModel
from ..photos import (
    MAX_UPLOAD_BYTES,
    delete_photo_files,
    photo_path,
    process_photo,
    save_photo_files,
)
from ..places import (
    NOT_IMPORTED,
    PLACE_COLUMNS,
    PLACES_SQL,
    POI_PLACES_SQL,
    USER_PLACES_SQL,
    PlaceType,
    PoiDetails,
    details_from_row,
)

router = APIRouter(tags=["places"])

# What people can fill in or correct. Kept to things worth showing on a place card.
EDITABLE_TAGS = {
    "phone",
    "website",
    "opening_hours",
    "addr:housenumber",
    "addr:street",
    "addr:suburb",
    "addr:postcode",
    "cuisine",
    "description",
}


def _check_tags(tags: dict[str, str]) -> dict[str, str]:
    unknown = set(tags) - EDITABLE_TAGS
    if unknown:
        raise ValueError(f"Can't edit {', '.join(sorted(unknown))}")
    for key, value in tags.items():
        if len(value) > 300:
            raise ValueError(f"{key} is too long")
    website = tags.get("website")
    if website and not website.startswith(("http://", "https://")):
        raise ValueError("Websites need to start with http:// or https://")
    return {key: value.strip() for key, value in tags.items()}


class PlaceChanges(ApiModel):
    """A correction. A tag set to "" removes it."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    category: str | None = Field(default=None, pattern=r"^[a-z_]{2,40}$")
    """Only for places people added; OSM places keep their category."""
    tags: dict[str, str] = Field(default_factory=dict)

    _check = field_validator("tags")(_check_tags)


class NewPlace(ApiModel):
    name: str = Field(min_length=1, max_length=200)
    category: str = Field(pattern=r"^[a-z_]{2,40}$")
    lng: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)
    tags: dict[str, str] = Field(default_factory=dict)

    _check = field_validator("tags")(_check_tags)


async def _load(db: Db, place_type: PlaceType, place_id: int) -> PoiDetails:
    try:
        cursor = await db.execute(
            f"SELECT {PLACE_COLUMNS} FROM ({PLACES_SQL}) AS places WHERE osm_type = %s AND osm_id = %s",
            (place_type, place_id),
        )
    except UndefinedTable:
        raise HTTPException(503, NOT_IMPORTED)
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(404, "That place isn't in the browse data.")
    return PoiDetails(**details_from_row(row))


# ---------- places ----------

# Names that start with what was typed come first, then the nearest. Overture places are
# found with the trigram index the POI import makes on their names, nearest 20 first.
SEARCH_SQL = f"""
WITH center AS (SELECT ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326) AS at)
SELECT {PLACE_COLUMNS}
FROM (
  ({USER_PLACES_SQL} WHERE u.name ILIKE %(contains)s
   ORDER BY u.geom <-> (SELECT at FROM center) LIMIT 20)
  UNION ALL
  ({POI_PLACES_SQL} WHERE p.osm_type = 'O' AND p.name ILIKE %(contains)s
   ORDER BY p.geom <-> (SELECT at FROM center) LIMIT 20)
) AS places
ORDER BY tags->>'name' ILIKE %(starts)s DESC, geom <-> (SELECT at FROM center)
LIMIT 5
"""


@router.get("/places/search")
async def search_added_places(
    db: Db,
    q: str = Query(min_length=2, max_length=100),
    near: str | None = Query(None, pattern=r"^-?\d+(\.\d+)?,-?\d+(\.\d+)?$", description="lng,lat"),
) -> list[PoiDetails]:
    """Places people added and places from Overture Maps, by name, nearest first.
    (Photon covers everything from OSM.)"""
    lng, lat = (float(n) for n in near.split(",")) if near else (0.0, 0.0)
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    try:
        cursor = await db.execute(
            SEARCH_SQL,
            {"contains": f"%{escaped}%", "starts": f"{escaped}%", "lng": lng, "lat": lat},
        )
    except UndefinedTable:
        raise HTTPException(503, NOT_IMPORTED)
    return [PoiDetails(**details_from_row(row)) for row in await cursor.fetchall()]


@router.post("/places", status_code=201)
async def add_place(place: NewPlace, user: CurrentUser, db: Db) -> PoiDetails:
    """Adds a place OSM doesn't have."""
    cursor = await db.execute(
        "INSERT INTO user_places (name, category, tags, geom, created_by, updated_by)"
        " VALUES (%s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s, %s) RETURNING id",
        (
            place.name,
            place.category,
            Jsonb(place.tags),
            place.lng,
            place.lat,
            user.id,
            user.id,
        ),
    )
    row = await cursor.fetchone()
    return await _load(db, "U", row["id"])


@router.get("/places/{place_type}/{place_id}")
async def get_place(place_type: PlaceType, place_id: int, db: Db) -> PoiDetails:
    """One place with all its tags, e.g. to fill in hours and phone for a search result."""
    return await _load(db, place_type, place_id)


@router.patch("/places/{place_type}/{place_id}")
async def edit_place(
    place_type: PlaceType,
    place_id: int,
    changes: PlaceChanges,
    user: CurrentUser,
    db: Db,
) -> PoiDetails:
    """Corrects a place. Any signed-in user can; the latest correction wins."""
    tags = dict(changes.tags)

    if place_type == "U":
        cursor = await db.execute(
            "UPDATE user_places SET name = coalesce(%s, name), category = coalesce(%s, category),"
            " tags = tags || %s, updated_by = %s, updated_at = now() WHERE id = %s RETURNING id",
            (changes.name, changes.category, Jsonb(tags), user.id, place_id),
        )
        if await cursor.fetchone() is None:
            raise HTTPException(404, "That place doesn't exist.")
    else:
        if changes.category is not None:
            raise HTTPException(422, "Only places people added can change category.")
        await _load(db, place_type, place_id)  # 404 if it isn't a place we know
        if changes.name is not None:
            tags["name"] = changes.name
        await db.execute(
            "INSERT INTO place_edits (osm_type, osm_id, tags, updated_by) VALUES (%s, %s, %s, %s)"
            " ON CONFLICT (osm_type, osm_id) DO UPDATE SET"
            "   tags = place_edits.tags || EXCLUDED.tags, updated_by = EXCLUDED.updated_by, updated_at = now()",
            (place_type, place_id, Jsonb(tags), user.id),
        )
    return await _load(db, place_type, place_id)


@router.delete("/places/U/{place_id}", status_code=204)
async def delete_added_place(place_id: int, user: CurrentUser, db: Db) -> None:
    """Removes a place you added, with its reviews and photos."""
    cursor = await db.execute(
        "DELETE FROM user_places WHERE id = %s AND created_by = %s RETURNING id",
        (place_id, user.id),
    )
    if await cursor.fetchone() is None:
        raise HTTPException(404, "You can only remove places you added.")
    await db.execute("DELETE FROM reviews WHERE place_type = 'U' AND place_id = %s", (place_id,))
    cursor = await db.execute(
        "DELETE FROM photos WHERE place_type = 'U' AND place_id = %s RETURNING id",
        (place_id,),
    )
    delete_photo_files([row["id"] for row in await cursor.fetchall()])


# ---------- reviews and photos ----------


class Review(ApiModel):
    id: int
    username: str
    rating: int
    body: str
    created_at: datetime
    updated_at: datetime
    mine: bool


class Photo(ApiModel):
    id: int
    username: str
    url: str
    thumb_url: str
    width: int
    height: int
    created_at: datetime
    mine: bool


class Community(ApiModel):
    """What this instance's users have said about a place."""

    rating: float | None
    review_count: int
    reviews: list[Review]
    photos: list[Photo]


class ReviewIn(ApiModel):
    rating: int = Field(ge=1, le=5)
    body: str = Field(default="", max_length=2000)


def _photo(row: dict, user_id: int | None) -> Photo:
    return Photo(
        **row,
        url=f"/api/photos/{row['id']}",
        thumb_url=f"/api/photos/{row['id']}?size=thumb",
        mine=row["user_id"] == user_id,
    )


@router.get("/places/{place_type}/{place_id}/community")
async def get_community(
    place_type: PlaceType, place_id: int, user: OptionalUser, db: Db
) -> Community:
    me = user.id if user else None
    cursor = await db.execute(
        "SELECT r.id, r.user_id, u.username, r.rating, r.body, r.created_at, r.updated_at"
        " FROM reviews r JOIN users u ON u.id = r.user_id"
        " WHERE r.place_type = %s AND r.place_id = %s ORDER BY r.updated_at DESC",
        (place_type, place_id),
    )
    reviews = [Review(**row, mine=row["user_id"] == me) for row in await cursor.fetchall()]

    cursor = await db.execute(
        "SELECT p.id, p.user_id, u.username, p.width, p.height, p.created_at"
        " FROM photos p JOIN users u ON u.id = p.user_id"
        " WHERE p.place_type = %s AND p.place_id = %s ORDER BY p.created_at DESC",
        (place_type, place_id),
    )
    photos = [_photo(row, me) for row in await cursor.fetchall()]

    rating = round(sum(r.rating for r in reviews) / len(reviews), 1) if reviews else None
    return Community(rating=rating, review_count=len(reviews), reviews=reviews, photos=photos)


@router.put("/places/{place_type}/{place_id}/review")
async def write_review(
    place_type: PlaceType, place_id: int, review: ReviewIn, user: CurrentUser, db: Db
) -> Review:
    """Writes your review of a place, replacing your earlier one."""
    cursor = await db.execute(
        "INSERT INTO reviews (place_type, place_id, user_id, rating, body) VALUES (%s, %s, %s, %s, %s)"
        " ON CONFLICT (place_type, place_id, user_id) DO UPDATE SET"
        "   rating = EXCLUDED.rating, body = EXCLUDED.body, updated_at = now()"
        " RETURNING id, rating, body, created_at, updated_at",
        (place_type, place_id, user.id, review.rating, review.body.strip()),
    )
    row = await cursor.fetchone()
    return Review(**row, username=user.username, mine=True)


@router.delete("/places/{place_type}/{place_id}/review", status_code=204)
async def delete_review(place_type: PlaceType, place_id: int, user: CurrentUser, db: Db) -> None:
    await db.execute(
        "DELETE FROM reviews WHERE place_type = %s AND place_id = %s AND user_id = %s",
        (place_type, place_id, user.id),
    )


@router.post("/places/{place_type}/{place_id}/photos", status_code=201)
async def add_photo(
    place_type: PlaceType, place_id: int, request: Request, user: CurrentUser, db: Db
) -> Photo:
    """Adds a photo, sent as the raw image body (JPEG, PNG or WebP)."""
    if int(request.headers.get("content-length") or 0) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Photos can be up to 20 MB.")
    data = await request.body()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Photos can be up to 20 MB.")

    try:
        processed = await run_in_threadpool(process_photo, data)
    except ValueError:
        raise HTTPException(422, "That doesn't look like a photo.")

    cursor = await db.execute(
        "INSERT INTO photos (place_type, place_id, user_id, width, height) VALUES (%s, %s, %s, %s, %s)"
        " RETURNING id, user_id, width, height, created_at",
        (place_type, place_id, user.id, processed.width, processed.height),
    )
    row = await cursor.fetchone()
    # Written inside the request's transaction: if saving fails, the row is rolled back too
    await run_in_threadpool(save_photo_files, row["id"], processed)
    return _photo({**row, "username": user.username}, user.id)


@router.get("/photos/{photo_id}")
async def get_photo(photo_id: int, size: Literal["full", "thumb"] = "full") -> FileResponse:
    path = photo_path(photo_id, thumb=size == "thumb")
    if not path.is_file():
        raise HTTPException(404, "No such photo.")
    # Ids are never reused, so a photo at a URL never changes
    return FileResponse(
        path,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@router.delete("/photos/{photo_id}", status_code=204)
async def delete_photo(photo_id: int, user: CurrentUser, db: Db) -> None:
    cursor = await db.execute(
        "DELETE FROM photos WHERE id = %s AND user_id = %s RETURNING id",
        (photo_id, user.id),
    )
    if await cursor.fetchone() is None:
        raise HTTPException(404, "You can only remove your own photos.")
    delete_photo_files([photo_id])
