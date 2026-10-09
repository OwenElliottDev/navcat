"""Turn lanes and road data."""

import pytest

from .conftest import WAY_EAST, WAY_WEST

# Two points on the test ways, travelling west to east (the way they're drawn) or back
EASTWARD = ([145.002, -37.8], [145.003, -37.8])
WESTWARD = (EASTWARD[1], EASTWARD[0])


@pytest.fixture(autouse=True)
def _places(places):
    pass


def approach(way_id, direction):
    start, end = direction
    return {"wayId": way_id, "start": start, "end": end}


def test_lanes_follow_the_direction_of_travel(client):
    approaches = [
        approach(10, EASTWARD),  # two-way: forward lanes
        approach(10, WESTWARD),  # two-way: backward lanes
        approach(11, EASTWARD),  # one-way, travelling its way
        approach(11, WESTWARD),  # one-way, against it
        approach(12, WESTWARD),  # one-way the other way ("-1")
        approach(12, EASTWARD),
        approach(13, EASTWARD),  # plain turn:lanes on a two-way road: no direction known
        approach(99, EASTWARD),  # no lanes mapped
    ]
    response = client().post("/api/lanes", {"approaches": approaches})
    assert response.status == 200, response.body
    assert response.json() == [
        "left|through",
        "through|right",
        "left|left;through",
        None,
        "through|right",
        None,
        None,
        None,
    ]


def test_lanes_need_a_reasonable_request(client):
    c = client()
    assert c.post("/api/lanes", {"approaches": []}).json() == []
    too_many = [approach(10, EASTWARD)] * 501
    assert c.post("/api/lanes", {"approaches": too_many}).status == 422
    assert WAY_WEST[0] < WAY_EAST[0]  # the directions above assume this


def test_road_data_when_graphhopper_is_down(client):
    c = client()
    assert c.get("/api/road-data/15/29400/20100.mvt").status == 503
    assert c.get("/api/road-data/15/40000/0.mvt").status == 404  # past the edge of the world
    assert c.get("/api/road-data/14/0/0.mvt").status == 422  # too far out
