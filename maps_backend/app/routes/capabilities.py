import asyncio
from collections.abc import Callable

from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool

from ..capabilities import Capabilities, fetch_routing, fetch_transit
from ..upstream import Unavailable

router = APIRouter(tags=["capabilities"])


async def _unless_down[T](fetch: Callable[[], T]) -> T | None:
    try:
        return await run_in_threadpool(fetch)
    except Unavailable:
        return None


@router.get("/capabilities")
async def capabilities() -> Capabilities:
    """Travel modes and route options (GraphHopper), and public transport (OpenTripPlanner).
    Each part is null while its service isn't answering; the other still works without it."""
    routing, transit = await asyncio.gather(
        _unless_down(fetch_routing), _unless_down(fetch_transit)
    )
    return Capabilities(routing=routing, transit=transit)
