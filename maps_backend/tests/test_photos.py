"""Re-encoding uploaded photos."""

import io

import pytest
from PIL import Image

from app.photos import FULL_SIZE, THUMB_SIZE, process_photo
from tests.images import GPS_INFO, phone_photo


def test_photos_are_turned_upright_and_lose_their_metadata():
    photo = process_photo(phone_photo(2400, 1200))

    full = Image.open(io.BytesIO(photo.full))
    assert full.format == "JPEG"
    # Stored sideways with a rotate-90° flag, so it comes out portrait
    assert full.size == (photo.width, photo.height) == (FULL_SIZE // 2, FULL_SIZE)
    assert not full.getexif()
    assert GPS_INFO not in full.getexif()
    # The marked corner (top-left as stored) is now top-right
    assert full.getpixel((full.width - 10, 10))[2] > 200
    assert full.getpixel((10, 10))[0] > 200

    thumb = Image.open(io.BytesIO(photo.thumb))
    assert max(thumb.size) == THUMB_SIZE
    assert not thumb.getexif()


def test_small_photos_are_not_enlarged():
    photo = process_photo(phone_photo(300, 200, "PNG"))
    assert (photo.width, photo.height) == (200, 300)


@pytest.mark.parametrize("data", [b"", b"not an image", phone_photo()[:200]])
def test_only_real_images_are_accepted(data):
    with pytest.raises(ValueError):
        process_photo(data)
