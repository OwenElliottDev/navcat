"""Turning uploads into clean JPEGs on disk."""

import io
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageOps

from .config import settings

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
FULL_SIZE = 1600
THUMB_SIZE = 480


@dataclass(frozen=True)
class ProcessedPhoto:
    full: bytes
    thumb: bytes
    width: int
    height: int


def _jpeg(image: Image.Image, size: int, quality: int) -> bytes:
    copy = image.copy()
    copy.thumbnail((size, size))
    out = io.BytesIO()
    copy.save(out, "JPEG", quality=quality, optimize=True)
    return out.getvalue()


def process_photo(data: bytes) -> ProcessedPhoto:
    """Decodes an upload and re-encodes it as a full-size and a thumbnail JPEG.

    Re-encoding means only real images get stored, and drops all metadata, including the
    GPS position phones embed in photos. Raises ValueError if it isn't an image.
    """
    try:
        with Image.open(io.BytesIO(data)) as original:
            # Apply the phone's rotation flag before dropping the metadata that holds it
            image = ImageOps.exif_transpose(original).convert("RGB")
    except Exception as err:  # Pillow raises several kinds for bad or huge files
        raise ValueError("Not a readable image") from err

    full = _jpeg(image, FULL_SIZE, quality=85)
    width, height = Image.open(io.BytesIO(full)).size
    return ProcessedPhoto(
        full=full,
        thumb=_jpeg(image, THUMB_SIZE, quality=80),
        width=width,
        height=height,
    )


def photo_path(photo_id: int, thumb: bool = False) -> Path:
    return settings.photos_dir / (f"{photo_id}-thumb.jpg" if thumb else f"{photo_id}.jpg")


def save_photo_files(photo_id: int, photo: ProcessedPhoto) -> None:
    settings.photos_dir.mkdir(parents=True, exist_ok=True)
    photo_path(photo_id).write_bytes(photo.full)
    photo_path(photo_id, thumb=True).write_bytes(photo.thumb)


def delete_photo_files(photo_ids: list[int]) -> None:
    for photo_id in photo_ids:
        photo_path(photo_id).unlink(missing_ok=True)
        photo_path(photo_id, thumb=True).unlink(missing_ok=True)
