"""The photo safety check."""

import dataclasses

import pytest

from app import photo_safety, photos
from app.photos import UnsafePhoto, process_photo
from tests.images import phone_photo


@pytest.mark.parametrize(
    ("probabilities", "unsafe"),
    [
        ((0.01, 0.02, 0.97), False),
        ((0.91, 0.02, 0.07), True),  # NSFL
        ((0.02, 0.91, 0.07), True),  # NSFW
        ((0.02, 0.9, 0.08), False),  # Not quite sure enough
        ((0.49, 0.49, 0.02), False),  # Unsure which, so let through
    ],
)
def test_only_confidently_unsafe_photos_are_rejected(probabilities, unsafe):
    assert photo_safety.is_unsafe(probabilities) is unsafe


def test_unsafe_photos_are_turned_away(monkeypatch):
    monkeypatch.setattr(photos.photo_safety, "classify", lambda _image: (0.0, 0.99, 0.01))
    with pytest.raises(UnsafePhoto):
        process_photo(phone_photo(), check_safety=True)
    # Unless the check is off
    process_photo(phone_photo(), check_safety=False)


def test_the_model_passes_an_ordinary_photo(monkeypatch, safety_model):
    monkeypatch.setattr(
        photo_safety,
        "settings",
        dataclasses.replace(photo_safety.settings, photo_safety_model=safety_model),
    )
    photo_safety._session.cache_clear()
    try:
        photo = process_photo(phone_photo(), check_safety=True)
        assert photo.width > 0
    finally:
        photo_safety._session.cache_clear()
