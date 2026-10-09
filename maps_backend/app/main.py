from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import JSONResponse

from .db import Db, pool
from .migrations import migrate
from .routes import auth, browse, lanes, me, places, road_data


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await pool.open(wait=True)
    await migrate(pool)
    yield
    await pool.close()


app = FastAPI(title="Nav Cat backend", lifespan=lifespan)


# Cross-site HTML forms can only send form or plain-text bodies, so accepting nothing but
# JSON and raw images for writes blocks CSRF (alongside SameSite cookies)
WRITE_CONTENT_TYPES = ("application/json", "image/jpeg", "image/png", "image/webp")


@app.middleware("http")
async def require_safe_writes(request: Request, call_next):
    is_write = request.method in {"POST", "PUT", "PATCH"}
    content_type = request.headers.get("content-type", "")
    if is_write and not content_type.startswith(WRITE_CONTENT_TYPES):
        return JSONResponse({"detail": "Send JSON (or an image)."}, status_code=415)
    return await call_next(request)


api = APIRouter(prefix="/api")


@api.get("/health")
async def health(db: Db) -> dict:
    cursor = await db.execute(
        "SELECT version() AS postgres, postgis_lib_version() AS postgis,"
        " (SELECT to_regclass('poi_import') IS NOT NULL) AS has_pois"
    )
    row = await cursor.fetchone()
    pois = None
    if row["has_pois"]:
        cursor = await db.execute("SELECT source, poi_count, imported_at FROM poi_import")
        pois = await cursor.fetchone()
    return {"postgres": row["postgres"], "postgis": row["postgis"], "pois": pois}


api.include_router(auth.router)
api.include_router(me.router)
api.include_router(browse.router)
api.include_router(places.router)
api.include_router(road_data.router)
api.include_router(lanes.router)
app.include_router(api)
