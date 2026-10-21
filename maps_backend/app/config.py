import math
import os
from dataclasses import dataclass
from pathlib import Path

from .models import Features


def _flag(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _limit(name: str, default: int) -> float:
    """At least 1, or -1 for no limit."""
    value = int(os.environ.get(name, default))
    return math.inf if value == -1 else max(1, value)


@dataclass(frozen=True)
class Settings:
    database_url: str
    allow_signup: bool
    features: Features
    check_photos: bool
    photo_safety_model: Path
    session_days: int
    cookie_secure: bool
    photos_dir: Path
    graphhopper_url: str
    photon_url: str
    tileserver_url: str
    link_preview_concurrency: float


settings = Settings(
    database_url=os.environ.get("DATABASE_URL", "postgresql://maps@localhost/maps"),
    allow_signup=_flag("ALLOW_SIGNUP", True),
    features=Features(
        allow_place_edits=_flag("ALLOW_PLACE_EDITS", True),
        allow_reviews=_flag("ALLOW_REVIEWS", True),
        allow_photos=_flag("ALLOW_PHOTOS", True),
    ),
    check_photos=_flag("SAFETY_CHECK_PHOTOS", True),
    photo_safety_model=Path(
        os.environ.get("PHOTO_SAFETY_MODEL", "/app/models/image-safety-classifier-xs.onnx")
    ),
    session_days=int(os.environ.get("SESSION_DAYS", "30")),
    cookie_secure=_flag("COOKIE_SECURE", False),
    photos_dir=Path(os.environ.get("PHOTOS_DIR", "/data/photos")),
    graphhopper_url=os.environ.get("GRAPHHOPPER_URL", "http://maps-graphhopper:8989"),
    photon_url=os.environ.get("PHOTON_URL", "http://maps-photon:2322"),
    tileserver_url=os.environ.get("TILESERVER_URL", "http://maps-tileserver:8080"),
    link_preview_concurrency=_limit("LINK_PREVIEW_CONCURRENCY", 4),
)
