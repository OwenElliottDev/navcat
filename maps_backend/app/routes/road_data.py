from fastapi import APIRouter, HTTPException, Path, Response
from fastapi.concurrency import run_in_threadpool

from ..road_data import GraphHopperUnavailable, fetch_tile, slim_tile

router = APIRouter(tags=["road data"])

# GraphHopper's tiles get very large further out (2 MB at z14 in a city), so only from here in
MIN_ZOOM = 15


@router.get("/road-data/{z}/{x}/{y}.mvt")
async def road_data(
    z: int = Path(ge=MIN_ZOOM, le=20), x: int = Path(ge=0), y: int = Path(ge=0)
) -> Response:
    """Speed limits, bike lanes and cycle routes from GraphHopper, as a vector tile."""
    if x >= 2**z or y >= 2**z:
        raise HTTPException(404, "No such tile.")
    try:
        raw = await run_in_threadpool(fetch_tile, z, x, y)
    except GraphHopperUnavailable:
        raise HTTPException(
            503, "Routing data isn't available yet. Check the graphhopper container."
        )
    tile = await run_in_threadpool(slim_tile, raw)
    return Response(tile, media_type="application/vnd.mapbox-vector-tile")
