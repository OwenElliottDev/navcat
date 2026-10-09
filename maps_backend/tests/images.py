"""Test images, made with Pillow."""

import io

from PIL import Image

ORIENTATION = 0x0112
GPS_INFO = 0x8825


def phone_photo(width: int = 2400, height: int = 1200, fmt: str = "JPEG") -> bytes:
    """A photo as a phone saves it: stored sideways with a flag saying to rotate it 90°
    clockwise, and the GPS position where it was taken."""
    image = Image.new("RGB", (width, height), "red")
    # A mark in the top-left corner shows which way up it ends up
    image.paste("blue", (0, 0, width // 4, height // 4))
    exif = image.getexif()
    exif[ORIENTATION] = 6
    exif[GPS_INFO] = {1: "S", 2: (37.0, 48.0, 0.0), 3: "E", 4: (145.0, 0.0, 0.0)}
    out = io.BytesIO()
    image.save(out, fmt, exif=exif)
    return out.getvalue()
