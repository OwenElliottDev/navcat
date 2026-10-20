from dataclasses import asdict
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Request, Response
from fastapi.concurrency import run_in_threadpool
from pydantic import Field

from .. import link_preview
from ..link_preview import LinkedView
from ..models import ApiModel
from ..short_link import decode_osm_shortlink, encode_osm_shortlink
from ..upstream import Unavailable

router = APIRouter(prefix="/links", tags=["links"])

# "@" is the legacy spelling of "~"
SHORTLINK = r"^[A-Za-z0-9_~@]{1,10}-{0,2}$"
TOO_SHORT = "That shortlink is too short."


class OSMShortlinkEncode(ApiModel):
    # Latitude stops short of 90, which would overflow the 32 bits it's packed into
    # (longitude 180 wraps to -180, the same place)
    long: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, lt=90)
    # Shortlinks hold at most 10 characters of position (zoom 22), plus "-" padding
    zoom: int = Field(ge=0, le=22)


class OSMShortlinkDecode(ApiModel):
    shortlink: str = Field(max_length=12, pattern=SHORTLINK)


@router.post("/encode_osm_shortlink")
async def encode_shortlink(body: OSMShortlinkEncode) -> OSMShortlinkDecode:
    """The OSM shortlink code (as in https://osm.org/go/<code>) for a map view."""
    return OSMShortlinkDecode(shortlink=encode_osm_shortlink(body.long, body.lat, body.zoom))


@router.post("/decode_osm_shortlink")
async def decode_shortlink(body: OSMShortlinkDecode) -> OSMShortlinkEncode:
    """The map view an OSM shortlink code points at."""
    long, lat, zoom = decode_osm_shortlink(body.shortlink)
    if zoom < 0:
        raise HTTPException(400, TOO_SHORT)
    return OSMShortlinkEncode(long=long, lat=lat, zoom=zoom)


# Where a /go/<code> link points and what's there, for link previews and other apps. ?m marks
# the spot, as in OSM's links.


def _view(request: Request, code: Annotated[str, Path(pattern=SHORTLINK)]) -> LinkedView:
    view = link_preview.decode(code, marked="m" in request.query_params)
    if view is None:
        raise HTTPException(404, TOO_SHORT)
    return view


LinkView = Annotated[LinkedView, Depends(_view)]


class ResolvedLink(OSMShortlinkEncode):
    marked: bool
    title: str
    """What's at the spot (or, unmarked, the area the view shows)."""
    detail: str


async def _describe(view: LinkedView) -> tuple[link_preview.Description, bool]:
    """The view's description, and whether Photon answered (if not, it's by coordinates)."""
    try:
        place = await run_in_threadpool(link_preview.reverse_geocode, view)
    except Unavailable:
        return link_preview.describe(view, None), False
    return link_preview.describe(view, place), True


@router.get("/resolve/{code}")
async def resolve(view: LinkView) -> ResolvedLink:
    """Where a /go/<code> link points, and what's there."""
    description, _ = await _describe(view)
    return ResolvedLink(**asdict(view), **asdict(description))


@router.get("/meta/{code}")
async def meta(request: Request, code: str, view: LinkView) -> Response:
    """OpenGraph tags for the page at /go/<code>, which nginx includes in it for link previews.

    Links point back at the address the page was asked for (Host and X-Forwarded-Proto)."""
    description, answered = await _describe(view)
    scheme = request.headers.get("x-forwarded-proto") or request.url.scheme
    origin = f"{scheme}://{request.headers.get('host', request.url.netloc)}"
    mark = "?m" if view.marked else ""
    html = link_preview.meta_tags(
        description,
        url=f"{origin}/go/{code}{mark}",
        image_url=f"{origin}/api/links/preview/{code}.jpg{mark}",
    )
    # Not kept if Photon was down (e.g. updating), so the link is named once it's back
    headers = {} if answered else {"Cache-Control": "no-store"}
    return Response(html, media_type="text/html", headers=headers)


@router.get("/preview/{code}.jpg")
async def preview(view: LinkView) -> Response:
    """A picture of the map at /go/<code>, pinned for ?m, for link previews."""
    try:
        image = await run_in_threadpool(link_preview.render_image, view)
    except Unavailable:
        raise HTTPException(503, "TileServer isn't available.")
    return Response(
        image, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=604800"}
    )
