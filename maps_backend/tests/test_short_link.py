"""Cases from openstreetmap-website's test/lib/short_link_test.rb."""

import math
import random

import pytest

from app.short_link import decode_osm_shortlink, encode_osm_shortlink


def test_encode_decode_within_quantisation_error():
    rng = random.Random(0)
    for _ in range(1000):
        lat = 180.0 * rng.random() - 90.0
        lon = 360.0 * rng.random() - 180.0
        zoom = int(18 * rng.random())

        lon2, lat2, zoom2 = decode_osm_shortlink(encode_osm_shortlink(lon, lat, zoom))

        assert zoom2 == zoom, (lat, lon, zoom)
        # Error is roughly a pixel (zoom + 8); sqrt(5) as lat gets an extra bit from its smaller range
        distance = math.hypot(lat - lat2, lon - lon2)
        max_distance = 360.0 / (1 << (zoom + 8)) * 0.5 * math.sqrt(5)
        assert distance < max_distance, (lat, lon, zoom)


@pytest.mark.parametrize(
    "new_code, old_code",
    [
        ("~v2juONc--", "@v2juONc--"),
        ("as3I3GpG~-", "as3I3GpG@-"),
        ("D~hV--", "D@hV--"),
        ("CO0O~m8--", "CO0O@m8--"),
    ],
)
def test_deprecated_at_sign_decodes_the_same(new_code, old_code):
    assert decode_osm_shortlink(old_code) == decode_osm_shortlink(new_code)
