"""Boxes around the areas browse looks in."""

import pytest

from app.areas import circle_box, geometry_box


def test_a_circles_box_is_wider_in_longitude_away_from_the_equator():
    west, south, east, north = circle_box(145.0, -37.8, 1000)
    assert north - south == pytest.approx(0.0182, abs=0.0002)  # ~1.01 km each way
    assert east - west == pytest.approx((north - south) / 0.79, rel=0.01)  # cos(37.8°)


def test_a_circle_around_a_pole_or_across_the_antimeridian_takes_every_longitude():
    assert circle_box(0.0, -89.99, 5000)[::2] == (-180, 180)
    assert circle_box(179.99, 0.0, 5000)[::2] == (-180, 180)
    assert circle_box(0.0, 0.0, 50_000_000) == (-180, -90, 180, 90)


def test_a_polygons_box():
    square = {"type": "Polygon", "coordinates": [[[1, 2], [3, 2], [3, 5], [1, 5], [1, 2]]]}
    assert geometry_box(square) == (1, 2, 3, 5)
    islands = {
        "type": "MultiPolygon",
        "coordinates": [[[[1, 2], [2, 2], [1, 3]]], [[[9, 9], [10, 9], [9, 10]]]],
    }
    assert geometry_box(islands) == (1, 2, 10, 10)
