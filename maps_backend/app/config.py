import os
from dataclasses import dataclass
from pathlib import Path


def _flag(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    database_url: str
    allow_signup: bool
    session_days: int
    cookie_secure: bool
    photos_dir: Path
    graphhopper_url: str


settings = Settings(
    database_url=os.environ.get("DATABASE_URL", "postgresql://maps@localhost/maps"),
    allow_signup=_flag("ALLOW_SIGNUP", True),
    session_days=int(os.environ.get("SESSION_DAYS", "30")),
    cookie_secure=_flag("COOKIE_SECURE", False),
    photos_dir=Path(os.environ.get("PHOTOS_DIR", "/data/photos")),
    graphhopper_url=os.environ.get("GRAPHHOPPER_URL", "http://maps-graphhopper:8989"),
)
