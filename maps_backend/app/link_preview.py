"""What a shared link shows, for the previews chat apps make of it (OpenGraph tags and an image).

A link's spot is named by reverse geocoding it with this stack's Photon, and its image is
rendered by this stack's TileServer, with a pin drawn on for a marked spot.
"""

import functools
import html
import io
import json
import math
from dataclasses import dataclass
from urllib.parse import urlencode

from PIL import Image, ImageDraw

from . import upstream
from .config import settings
from .short_link import decode_osm_shortlink

# The style the app's maps are made from (MAP_STYLE_URL in maps_web/src/config.ts), as it is
# before the app recolours it
STYLE = "basic-preview"
# OpenGraph's recommended 1200x630, rendered at 2x so labels stay readable
WIDTH, HEIGHT, SCALE = 600, 315, 2
# Deeper than this the map has nothing more to show
MAX_IMAGE_ZOOM = 17
PIN_COLOR = "#1A5FC8"  # COLORS.route in maps_web/src/config.ts
PIN_SIZE = (68, 100)
SUPERSAMPLE = 4


# An address's parts, smallest first, for naming the area a view shows
AREAS = ("locality", "district", "city", "county", "state", "country")


@dataclass
class LinkedView:
    long: float
    lat: float
    zoom: int
    marked: bool


@dataclass
class Description:
    title: str
    detail: str


def decode(code: str, marked: bool) -> LinkedView | None:
    """The view a shortlink code points at; None for one too short to place."""
    long, lat, zoom = decode_osm_shortlink(code)
    if zoom < 0:
        return None
    return LinkedView(long, lat, zoom, marked)


def reverse_geocode(view: LinkedView) -> dict | None:
    """Photon's nearest feature's properties (blocking: run it in a thread)."""
    params = {"lat": view.lat, "lon": view.long, "limit": 1}
    # Short: the app's page waits on this when a link opens
    body = upstream.get(f"{settings.photon_url}/reverse?{urlencode(params)}", timeout=2)
    try:
        features = json.loads(body)["features"]
        return features[0]["properties"] if features else None
    except (ValueError, KeyError, IndexError, TypeError) as err:
        raise upstream.Unavailable(f"Photon's answer didn't make sense: {err}") from err


def _join(*parts: str | None) -> str:
    seen: list[str] = []
    for part in parts:
        if part and part not in seen:
            seen.append(part)
    return ", ".join(seen)


def describe(view: LinkedView, place: dict | None) -> Description:
    """A title and a line of detail for a view, from what Photon found there."""
    coordinates = f"{view.lat:.5f}, {view.long:.5f}"
    if place is None:
        return Description(coordinates, "Shared location" if view.marked else "Shared map")

    if not view.marked:
        # Named by the area the view shows (smaller the closer in), from the nearest address
        first = 0 if view.zoom >= 14 else 1 if view.zoom >= 11 else 2 if view.zoom >= 8 else 4
        name = next((place[key] for key in AREAS[first:] if place.get(key)), coordinates)
        return Description(
            name, _join(*(place.get(key) for key in AREAS[4:] if place.get(key) != name))
        )

    # As the app names a place (describePlace in maps_web/src/utils/places.ts)
    street = " ".join(p for p in (place.get("housenumber"), place.get("street")) if p)
    name = place.get("name") or street or place.get("city") or place.get("state")
    address = _join(
        street if place.get("name") else None,
        place.get("district") or place.get("locality"),
        place.get("city"),
        place.get("state"),
        place.get("postcode"),
    )
    return Description(name or "Unnamed place", address)


def meta_tags(description: Description, url: str, image_url: str) -> str:
    """OpenGraph (and Twitter) tags for the page at url, ready to go in its <head>."""
    tags = {
        "og:type": "website",
        "og:site_name": "Nav Cat",
        "og:title": description.title,
        "og:description": description.detail,
        "og:url": url,
        "og:image": image_url,
        "og:image:width": str(WIDTH * SCALE),
        "og:image:height": str(HEIGHT * SCALE),
        "og:image:alt": f"Map of {description.title}",
        "twitter:card": "summary_large_image",
    }
    lines = [f'<meta name="description" content="{html.escape(description.detail)}" />']
    for key, value in tags.items():
        attribute = "name" if key.startswith("twitter:") else "property"
        lines.append(f'<meta {attribute}="{key}" content="{html.escape(value)}" />')
    return "\n".join(lines) + "\n"


def render_image(view: LinkedView) -> bytes:
    """A JPEG of the view from TileServer, pinned if marked (blocking: run it in a thread)."""
    zoom = min(view.zoom, MAX_IMAGE_ZOOM)
    jpeg = upstream.get(
        f"{settings.tileserver_url}/styles/{STYLE}/static/"
        f"{view.long:.6f},{view.lat:.6f},{zoom}/{WIDTH}x{HEIGHT}@{SCALE}x.jpg",
        timeout=20,
    )
    if not view.marked:
        return jpeg
    image = Image.open(io.BytesIO(jpeg)).convert("RGB")
    pin = _pin()
    image.paste(pin, (image.width // 2 - pin.width // 2, image.height // 2 - pin.height), pin)
    out = io.BytesIO()
    image.save(out, "JPEG", quality=85)
    return out.getvalue()


@functools.cache
def _pin() -> Image.Image:
    """A map pin whose point is at the bottom middle, drawn large and shrunk for smooth edges."""
    w, h = PIN_SIZE[0] * SUPERSAMPLE, PIN_SIZE[1] * SUPERSAMPLE
    pin = Image.new("RGBA", (w, h))
    draw = ImageDraw.Draw(pin)
    r = w // 2
    outline = 3 * SUPERSAMPLE
    # White first, then the colour inset by the outline, for a white border: a circle and the
    # triangle from its tangents to the point
    for inset, fill in ((0, "white"), (outline, PIN_COLOR)):
        radius = r - inset
        tip = h - inset * 1.5
        cos = radius / (tip - r)
        sin = math.sqrt(1 - cos**2)
        draw.ellipse((r - radius, r - radius, r + radius, r + radius), fill=fill)
        draw.polygon(
            [(r - radius * sin, r + radius * cos), (r + radius * sin, r + radius * cos), (r, tip)],
            fill=fill,
        )
    dot = r * 0.38
    draw.ellipse((r - dot, r - dot, r + dot, r + dot), fill="white")
    return pin.resize(PIN_SIZE, Image.Resampling.LANCZOS)
