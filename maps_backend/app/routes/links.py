from fastapi import APIRouter, HTTPException
from pydantic import Field

from ..models import ApiModel
from ..short_link import decode_osm_shortlink, encode_osm_shortlink

router = APIRouter(prefix="/links", tags=["links"])


class OSMShortlinkEncode(ApiModel):
    # Latitude stops short of 90, which would overflow the 32 bits it's packed into
    # (longitude 180 wraps to -180, the same place)
    long: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, lt=90)
    # Shortlinks hold at most 10 characters of position (zoom 22), plus "-" padding
    zoom: int = Field(ge=0, le=22)


class OSMShortlinkDecode(ApiModel):
    # "@" is the legacy spelling of "~"
    shortlink: str = Field(max_length=12, pattern=r"^[A-Za-z0-9_~@]{1,10}-{0,2}$")


@router.post("/encode_osm_shortlink")
async def encode_shortlink(body: OSMShortlinkEncode) -> OSMShortlinkDecode:
    """The OSM shortlink code (as in https://osm.org/go/<code>) for a map view."""
    return OSMShortlinkDecode(shortlink=encode_osm_shortlink(body.long, body.lat, body.zoom))


@router.post("/decode_osm_shortlink")
async def decode_shortlink(body: OSMShortlinkDecode) -> OSMShortlinkEncode:
    """The map view an OSM shortlink code points at."""
    long, lat, zoom = decode_osm_shortlink(body.shortlink)
    if zoom < 0:
        raise HTTPException(400, "That shortlink is too short.")
    return OSMShortlinkEncode(long=long, lat=lat, zoom=zoom)
